import * as vscode from 'vscode';
import { WebDAVClient } from 'webdav';
import { SyncConfigurationData } from '../sync/SyncConfiguration';
import { AutoSyncManager } from '../sync/AutoSyncManager';
import { WebDAVBrowser } from './WebDAVBrowser';
import { Logger } from '../utils/Logger';

export class SetupWizard {
    constructor(
        private syncManager: AutoSyncManager,
        private webdavBrowser: WebDAVBrowser,
        private logger: Logger,
        private getWebDAVClient: (baseUri: string) => Promise<WebDAVClient>,
        private configureAuth: (baseUri: string) => Promise<void>
    ) {}

    /**
     * Run the complete setup wizard
     */
    public async run(): Promise<void> {
        try {
            // Step 1: Select local folder
            const localPath = await this.selectLocalFolder();
            if (!localPath) {
                return;
            }

            // Step 2: WebDAV server URL
            const webdavUrl = await this.inputWebDAVUrl();
            if (!webdavUrl) {
                return;
            }

            // Step 3: Configure authentication
            const baseUri = this.getBaseUri(webdavUrl);
            await this.configureAuth(baseUri);
            
            // Get credentials for this config
            const username = await vscode.window.showInputBox({
                prompt: 'Username (for this sync config)',
                placeHolder: 'Enter username'
            });
            const password = await vscode.window.showInputBox({
                prompt: 'Password (for this sync config)',
                password: true,
                placeHolder: 'Enter password'
            });

            // Get WebDAV client
            let client: WebDAVClient;
            try {
                client = await this.getWebDAVClient(baseUri);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to connect to WebDAV server: ${error}`);
                return;
            }

            // Step 4: Browse and select remote folder
            const remotePath = await this.selectRemoteFolder(client);
            if (!remotePath) {
                return;
            }

            // Step 5: Configure sync options
            const options = await this.configureSyncOptions(localPath, webdavUrl);
            if (!options) {
                return;
            }

            // Create sync configuration
            const config: SyncConfigurationData = {
                id: this.generateId(),
                name: options.name,
                localPath: localPath,
                webdavUrl: webdavUrl,
                remotePath: remotePath,
                enabled: true,
                syncOnSave: options.syncOnSave,
                syncOnDelete: options.syncOnDelete,
                syncHidden: options.syncHidden,
                debounceMs: options.debounceMs,
                excludePatterns: options.excludePatterns,
                username: username,
                password: password
            };

            await this.syncManager.addConfiguration(config);

            // Ask if user wants to sync now
            if (options.syncNow) {
                const choice = await vscode.window.showInformationMessage(
                    'Sync configuration created. Sync all files now?',
                    'Sync Now',
                    'Later'
                );

                if (choice === 'Sync Now') {
                    await this.syncManager.syncNow(config.id, true);
                }
            } else {
                vscode.window.showInformationMessage(`Sync configuration "${options.name}" created successfully!`);
            }

        } catch (error) {
            this.logger.error(`Setup wizard failed: ${error}`);
            vscode.window.showErrorMessage(`Failed to create sync: ${error}`);
        }
    }

    private async selectLocalFolder(): Promise<string | undefined> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select local folder to sync',
            openLabel: 'Select Folder'
        });

        return result?.[0]?.fsPath;
    }

    private async inputWebDAVUrl(): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt: 'Enter WebDAV server URL',
            placeHolder: 'https://webdav.example.com',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'URL cannot be empty';
                }
                try {
                    const url = new URL(value);
                    if (!['http:', 'https:'].includes(url.protocol)) {
                        return 'URL must use http or https protocol';
                    }
                } catch {
                    return 'Invalid URL format';
                }
                return undefined;
            }
        });
    }

    private async selectRemoteFolder(client: WebDAVClient): Promise<string | undefined> {
        const choice = await vscode.window.showQuickPick(
            ['Browse folders', 'Enter path manually'],
            { placeHolder: 'How would you like to select the remote folder?' }
        );

        if (!choice) {
            return undefined;
        }

        if (choice === 'Browse folders') {
            return this.webdavBrowser.browseFolder(client, '/');
        } else {
            return this.webdavBrowser.inputPath('/');
        }
    }

    private async configureSyncOptions(localPath: string, webdavUrl: string): Promise<{
        name: string;
        syncOnSave: boolean;
        syncOnDelete: boolean;
        syncHidden: boolean;
        debounceMs: number;
        excludePatterns: string[];
        syncNow: boolean;
    } | undefined> {
        // Get sync name
        const defaultName = this.getDefaultSyncName(localPath, webdavUrl);
        const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for this sync',
            value: defaultName,
            placeHolder: 'My Sync',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Name cannot be empty';
                }
                return undefined;
            }
        });

        if (!name) {
            return undefined;
        }

        // Sync on save
        const syncOnSave = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Auto-sync files when saved?'
        }) === 'Yes';

        // Sync on delete
        const syncOnDelete = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Delete remote files when local files are deleted?'
        }) === 'Yes';

        // Sync hidden files
        const syncHidden = await vscode.window.showQuickPick(['No', 'Yes'], {
            placeHolder: 'Sync hidden files (files starting with .)?'
        }) === 'Yes';

        // Default exclude patterns
        const excludePatterns = [
            '**/.git/**',
            '**/node_modules/**',
            '**/.vscode/**',
            '**/*.log'
        ];

        // Sync now
        const syncNow = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Sync all files immediately?'
        }) === 'Yes';

        return {
            name,
            syncOnSave,
            syncOnDelete,
            syncHidden,
            debounceMs: 500,
            excludePatterns,
            syncNow
        };
    }

    private getDefaultSyncName(localPath: string, webdavUrl: string): string {
        const folderName = localPath.split('/').pop() || localPath.split('\\').pop() || 'folder';
        try {
            const url = new URL(webdavUrl);
            return `${folderName} → ${url.hostname}`;
        } catch {
            return folderName;
        }
    }

    private getBaseUri(webdavUrl: string): string {
        try {
            const url = new URL(webdavUrl);
            return `${url.protocol}//${url.host}`;
        } catch {
            return webdavUrl;
        }
    }

    private generateId(): string {
        return `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Edit an existing sync configuration
     */
    public async edit(configId: string): Promise<void> {
        const config = this.syncManager.getConfiguration(configId);
        if (!config) {
            vscode.window.showErrorMessage('Sync configuration not found');
            return;
        }

        try {
            // Ask what to edit
            const editChoice = await vscode.window.showQuickPick([
                { label: 'Edit Settings', description: 'Name and sync options', value: 'basic' },
                { label: 'Change Local Path', description: 'Select different local folder', value: 'local' },
                { label: 'Change Remote Path', description: 'Browse and select different remote folder', value: 'remote' },
                { label: 'Change WebDAV Server', description: 'Different server URL (requires re-authentication)', value: 'server' },
                { label: 'Update Credentials', description: 'Update authentication for current server', value: 'auth' }
            ], {
                placeHolder: `Edit configuration: ${config.name}`
            });

            if (!editChoice) {
                return;
            }

            if (editChoice.value === 'basic') {
                await this.editBasicSettings(config);
            } else if (editChoice.value === 'local') {
                await this.editLocalPath(config);
            } else if (editChoice.value === 'remote') {
                await this.editRemotePath(config);
            } else if (editChoice.value === 'server') {
                await this.editWebDAVServer(config);
            } else if (editChoice.value === 'auth') {
                await this.editAuthentication(config);
            }

        } catch (error) {
            this.logger.error(`Edit configuration failed: ${error}`);
            vscode.window.showErrorMessage(`Failed to edit configuration: ${error}`);
        }
    }

    private async editBasicSettings(config: any): Promise<void> {
        // Edit name
        const name = await vscode.window.showInputBox({
            prompt: 'Enter a name for this sync',
            value: config.name,
            placeHolder: 'My Sync',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Name cannot be empty';
                }
                return undefined;
            }
        });

        if (!name) {
            return;
        }

        // Sync on save
        const syncOnSave = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Auto-sync files when saved?'
        }) === 'Yes';

        // Sync on delete
        const syncOnDelete = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Delete remote files when local files are deleted?'
        }) === 'Yes';

        // Sync hidden files
        const syncHidden = await vscode.window.showQuickPick(['No', 'Yes'], {
            placeHolder: 'Sync hidden files (files starting with .)?'
        }) === 'Yes';

        // Debounce delay
        const debounceInput = await vscode.window.showInputBox({
            prompt: 'Debounce delay in milliseconds',
            value: config.debounceMs.toString(),
            placeHolder: '500',
            validateInput: (value) => {
                const num = parseInt(value);
                if (isNaN(num) || num < 0) {
                    return 'Must be a positive number';
                }
                return undefined;
            }
        });

        const debounceMs = debounceInput ? parseInt(debounceInput) : config.debounceMs;

        // Update configuration
        await this.syncManager.updateConfiguration(config.id, {
            name,
            syncOnSave,
            syncOnDelete,
            syncHidden,
            debounceMs
        });

        vscode.window.showInformationMessage(`Updated configuration: ${name}`);
    }

    private async editLocalPath(config: any): Promise<void> {
        const localPath = await this.selectLocalFolder();
        if (!localPath) {
            return;
        }

        await this.syncManager.updateConfiguration(config.id, { localPath });

        const syncNow = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Sync all files from new local path now?'
        }) === 'Yes';

        if (syncNow) {
            await this.syncManager.syncNow(config.id, true);
        }

        vscode.window.showInformationMessage(`Updated local path for: ${config.name}`);
    }

    private async editRemotePath(config: any): Promise<void> {
        const baseUrl = config.webdavUrl.replace(/^webdav/i, "http");
        
        // Get WebDAV client
        let client: WebDAVClient;
        try {
            client = await this.getWebDAVClient(baseUrl);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect to WebDAV server: ${error}`);
            return;
        }

        const remotePath = await this.selectRemoteFolder(client);
        if (!remotePath) {
            return;
        }

        await this.syncManager.updateConfiguration(config.id, { remotePath });

        const syncNow = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Sync all files to new remote path now?'
        }) === 'Yes';

        if (syncNow) {
            await this.syncManager.syncNow(config.id, true);
        }

        vscode.window.showInformationMessage(`Updated remote path for: ${config.name}`);
    }

    private async editWebDAVServer(config: any): Promise<void> {
        const warning = await vscode.window.showWarningMessage(
            'Changing the WebDAV server will require re-authentication. Continue?',
            { modal: true },
            'Continue',
            'Cancel'
        );

        if (warning !== 'Continue') {
            return;
        }

        const webdavUrl = await this.inputWebDAVUrl();
        if (!webdavUrl) {
            return;
        }

        // Configure authentication for new server
        const baseUri = this.getBaseUri(webdavUrl);
        await this.configureAuth(baseUri);

        // Get WebDAV client
        let client: WebDAVClient;
        try {
            client = await this.getWebDAVClient(baseUri);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to connect to WebDAV server: ${error}`);
            return;
        }

        // Browse and select remote folder on new server
        const remotePath = await this.selectRemoteFolder(client);
        if (!remotePath) {
            return;
        }

        await this.syncManager.updateConfiguration(config.id, {
            webdavUrl,
            remotePath
        });

        const syncNow = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Sync all files to new server now?'
        }) === 'Yes';

        if (syncNow) {
            await this.syncManager.syncNow(config.id, true);
        }

        vscode.window.showInformationMessage(`Updated WebDAV server for: ${config.name}`);
    }

    private async editAuthentication(config: any): Promise<void> {
        const baseUri = this.getBaseUri(config.webdavUrl);
        
        await this.configureAuth(baseUri);
        
        vscode.window.showInformationMessage('Authentication updated. Sync will use new credentials.');
    }
}
