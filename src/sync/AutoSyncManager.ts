import * as vscode from 'vscode';
import * as path from 'path';
import { SyncConfiguration, SyncConfigurationData } from './SyncConfiguration';
import { FileOperations } from './FileOperations';
import { Logger } from '../utils/Logger';
import { PathUtils } from '../utils/PathUtils';
import { WebDAVClient, createClient, AuthType } from 'webdav';

interface PendingChange {
    uri: vscode.Uri;
    type: 'create' | 'change' | 'delete';
    timestamp: number;
}

export class AutoSyncManager {
    private configurations: Map<string, SyncConfiguration> = new Map();
    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private pendingChanges: Map<string, Map<string, PendingChange>> = new Map(); // syncId -> filePath -> change
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private clients: Map<string, Promise<WebDAVClient>> = new Map();
    
    private _onDidChangeConfiguration = new vscode.EventEmitter<void>();
    public readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private fileOps: FileOperations,
        private getWebDAVClient: (baseUri: string) => Promise<WebDAVClient>
    ) {
        this.loadConfigurations();
    }

    /**
     * Load sync configurations from workspace settings
     */
    private async loadConfigurations(): Promise<void> {
        const config = vscode.workspace.getConfiguration('webdav.autoSync');
        const configs = config.get<SyncConfigurationData[]>('configurations', []);

        for (const data of configs) {
            const syncConfig = new SyncConfiguration(data);
            this.configurations.set(syncConfig.id, syncConfig);
            
            if (syncConfig.enabled) {
                await this.startSync(syncConfig.id);
            }
        }

        this.logger.info(`Loaded ${configs.length} sync configurations`);
    }

    /**
     * Save configurations to workspace settings
     */
    private async saveConfigurations(): Promise<void> {
        const configs = Array.from(this.configurations.values()).map(c => c.toJSON());
        const config = vscode.workspace.getConfiguration('webdav.autoSync');
        await config.update('configurations', configs, vscode.ConfigurationTarget.Workspace);
        this._onDidChangeConfiguration.fire();
    }

    /**
     * Add a new sync configuration
     */
    public async addConfiguration(data: SyncConfigurationData): Promise<void> {
        const syncConfig = new SyncConfiguration(data);
        this.configurations.set(syncConfig.id, syncConfig);
        await this.saveConfigurations();

        if (syncConfig.enabled) {
            await this.startSync(syncConfig.id);
        }

        this.logger.info(`Added sync configuration: ${syncConfig.name}`, syncConfig.name);
    }

    /**
     * Remove a sync configuration
     */
    public async removeConfiguration(id: string): Promise<void> {
        const config = this.configurations.get(id);
        if (!config) {
            return;
        }

        await this.stopSync(id);
        this.configurations.delete(id);
        await this.saveConfigurations();

        this.logger.info(`Removed sync configuration: ${config.name}`, config.name);
    }

    /**
     * Update an existing configuration
     */
    public async updateConfiguration(id: string, data: Partial<SyncConfigurationData>): Promise<void> {
        const config = this.configurations.get(id);
        if (!config) {
            return;
        }

        const wasEnabled = config.enabled;
        Object.assign(config, data);

        await this.saveConfigurations();

        // Restart if enabled status changed
        if (wasEnabled && !config.enabled) {
            await this.stopSync(id);
        } else if (!wasEnabled && config.enabled) {
            await this.startSync(id);
        }
    }

    /**
     * Create WebDAV client with credentials from config
     */
    private async createClientForConfig(config: SyncConfiguration): Promise<WebDAVClient> {
        const webdavUrl = config.getWebDAVBaseUrl();
        
        // If config has embedded credentials, use them directly
        if (config.username && config.password) {
            this.logger.info(`Creating client for: ${webdavUrl}`, config.name);
            this.logger.info(`Using credentials: ${config.username} / ${config.password.substring(0, 8)}...`, config.name);
            const client = createClient(webdavUrl, {
                authType: AuthType.Password,
                username: config.username,
                password: config.password,
                headers: {
                    'Accept': '*/*',
                    'User-Agent': 'VSCode-WebDAV/1.0'
                },
                maxBodyLength: 500 * 1024 * 1024, // 500MB
                maxContentLength: 500 * 1024 * 1024 // 500MB
            });
            
            // Test the connection
            try {
                await client.getDirectoryContents('/');
                this.logger.info(`✓ Authentication successful`, config.name);
            } catch (error: any) {
                this.logger.error(`✗ Authentication failed: ${error.message} (Status: ${error.status})`, config.name);
            }
            
            return client;
        }
        
        // Fall back to global auth
        this.logger.info(`Using global auth for: ${webdavUrl}`, config.name);
        return await this.getWebDAVClient(webdavUrl);
    }

    /**
     * Start watching and syncing for a configuration
     */
    private async startSync(id: string): Promise<void> {
        const config = this.configurations.get(id);
        if (!config || this.watchers.has(id)) {
            return;
        }

        const pattern = new vscode.RelativePattern(config.localPath, '**/*');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate(uri => this.queueChange(id, uri, 'create'));
        watcher.onDidChange(uri => this.queueChange(id, uri, 'change'));
        watcher.onDidDelete(uri => this.queueChange(id, uri, 'delete'));

        this.watchers.set(id, watcher);
        this.pendingChanges.set(id, new Map());

        this.logger.info(`Started watching: ${config.localPath}`, config.name);
    }

    /**
     * Stop watching a configuration
     */
    private async stopSync(id: string): Promise<void> {
        const watcher = this.watchers.get(id);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(id);
        }

        const timer = this.debounceTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(id);
        }

        this.pendingChanges.delete(id);

        const config = this.configurations.get(id);
        if (config) {
            this.logger.info(`Stopped watching: ${config.localPath}`, config.name);
        }
    }

    /**
     * Queue a file change for syncing
     */
    private queueChange(id: string, uri: vscode.Uri, type: 'create' | 'change' | 'delete'): void {
        const config = this.configurations.get(id);
        if (!config || !config.enabled) {
            return;
        }

        const filePath = uri.fsPath;
        const relativePath = PathUtils.getRelativePath(config.localPath, filePath);

        // Check if file should be excluded
        if (PathUtils.isExcluded(relativePath, config.excludePatterns)) {
            return;
        }

        // Skip hidden files if not enabled
        if (!config.syncHidden && path.basename(filePath).startsWith('.')) {
            return;
        }

        // Skip delete events if not enabled
        if (type === 'delete' && !config.syncOnDelete) {
            return;
        }

        const changes = this.pendingChanges.get(id)!;
        changes.set(filePath, { uri, type, timestamp: Date.now() });

        config.filesInQueue = changes.size;
        this._onDidChangeConfiguration.fire();

        // Debounce processing
        const existingTimer = this.debounceTimers.get(id);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            this.processPendingChanges(id);
        }, config.debounceMs);

        this.debounceTimers.set(id, timer);
    }

    /**
     * Process all pending changes for a configuration
     */
    private async processPendingChanges(id: string): Promise<void> {
        const config = this.configurations.get(id);
        const changes = this.pendingChanges.get(id);
        
        if (!config || !changes || changes.size === 0) {
            return;
        }

        config.status = 'syncing';
        this._onDidChangeConfiguration.fire();

        const changesToProcess = Array.from(changes.entries());
        changes.clear();
        config.filesInQueue = 0;

        this.logger.info(`Processing ${changesToProcess.length} changes`, config.name);

        let successCount = 0;
        let errorCount = 0;

        for (const [filePath, change] of changesToProcess) {
            try {
                await this.syncFile(config, filePath, change.type);
                successCount++;
            } catch (error: any) {
                errorCount++;
                const errorMsg = error.message || String(error);
                this.logger.error(`Failed to sync ${filePath}: ${errorMsg}`, config.name);
                config.lastError = errorMsg;
            }
        }

        config.status = errorCount > 0 ? 'error' : 'idle';
        config.lastSyncTime = new Date();
        
        if (errorCount === 0) {
            config.lastError = undefined;
        }

        this._onDidChangeConfiguration.fire();

        this.logger.info(`Sync completed: ${successCount} succeeded, ${errorCount} failed`, config.name);
    }

    /**
     * Sync a single file
     */
    private async syncFile(config: SyncConfiguration, localPath: string, type: 'create' | 'change' | 'delete'): Promise<void> {
        const client = await this.createClientForConfig(config);
        const remotePath = PathUtils.toRemotePath(localPath, config.localPath, config.remotePath);

        this.logger.info(`Syncing: ${localPath} → ${remotePath}`, config.name);

        if (type === 'delete') {
            try {
                await this.fileOps.deleteFile(client, remotePath);
                this.logger.success(`Deleted: ${remotePath}`, config.name);
            } catch (error) {
                // Ignore 404 errors (file already deleted)
                if ((error as any).status !== 404) {
                    this.logger.error(`Failed to delete ${remotePath}: ${error}`, config.name);
                    throw error;
                }
            }
        } else {
            // Upload file
            try {
                await this.fileOps.uploadFile(client, localPath, remotePath);
                const size = await this.fileOps.getFileSize(localPath);
                this.logger.success(`Uploaded: ${remotePath} (${this.fileOps.formatBytes(size)})`, config.name);
            } catch (error) {
                this.logger.error(`Failed to upload ${localPath} → ${remotePath}: ${error}`, config.name);
                throw error;
            }
        }
    }

    /**
     * Force sync now for a specific configuration
     */
    public async syncNow(id: string, showProgress: boolean = true): Promise<void> {
        const config = this.configurations.get(id);
        if (!config) {
            throw new Error(`Sync configuration not found: ${id}`);
        }

        if (!config.enabled) {
            throw new Error(`Sync is disabled: ${config.name}`);
        }

        const execute = async (progress?: vscode.Progress<{ increment?: number; message?: string }>) => {
            config.status = 'syncing';
            this._onDidChangeConfiguration.fire();

            try {
                const client = await this.createClientForConfig(config);
                const files = await this.fileOps.walkDirectory(
                    config.localPath,
                    config.excludePatterns,
                    config.syncHidden
                );

                this.logger.info(`Starting full sync of ${files.length} files`, config.name);

                let completed = 0;
                for (const file of files) {
                    const remotePath = PathUtils.toRemotePath(file, config.localPath, config.remotePath);
                    
                    try {
                        await this.fileOps.uploadFile(client, file, remotePath);
                        completed++;
                        
                        if (progress) {
                            progress.report({
                                increment: (100 / files.length),
                                message: `${completed}/${files.length}: ${path.basename(file)}`
                            });
                        }
                        
                        // Log every 100 files
                        if (completed % 100 === 0) {
                            this.logger.info(`Progress: ${completed}/${files.length} files uploaded`, config.name);
                        }
                    } catch (error: any) {
                        const errorMsg = error.message || String(error);
                        this.logger.error(`Failed to upload ${file} → ${remotePath}: ${errorMsg}`, config.name);
                        throw new Error(`Failed at file ${completed + 1}/${files.length}: ${file}\n${errorMsg}`);
                    }
                }

                config.status = 'idle';
                config.lastSyncTime = new Date();
                config.lastError = undefined;
                this._onDidChangeConfiguration.fire();

                this.logger.success(`Full sync completed: ${files.length} files uploaded`, config.name);
                vscode.window.showInformationMessage(`Synced ${files.length} files to ${config.name}`);
            } catch (error) {
                config.status = 'error';
                config.lastError = String(error);
                this._onDidChangeConfiguration.fire();
                
                this.logger.error(`Full sync failed: ${error}`, config.name);
                throw error;
            }
        };

        if (showProgress) {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Syncing to ${config.name}`,
                cancellable: false
            }, execute);
        } else {
            await execute();
        }
    }

    /**
     * Get all configurations
     */
    public getConfigurations(): SyncConfiguration[] {
        return Array.from(this.configurations.values());
    }

    /**
     * Get active configurations
     */
    public getActiveConfigurations(): SyncConfiguration[] {
        return this.getConfigurations().filter(c => c.enabled);
    }

    /**
     * Get paused configurations
     */
    public getPausedConfigurations(): SyncConfiguration[] {
        return this.getConfigurations().filter(c => !c.enabled);
    }

    /**
     * Get configuration by ID
     */
    public getConfiguration(id: string): SyncConfiguration | undefined {
        return this.configurations.get(id);
    }

    /**
     * Dispose all resources
     */
    public dispose(): void {
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.watchers.clear();
        this.debounceTimers.clear();
        this.pendingChanges.clear();
        this.configurations.clear();
    }
}
