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

            // Get WebDAV client to verify connection
            try {
                await this.getWebDAVClient(webdavUrl);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to connect to WebDAV server: ${error}`);
                return;
            }

            // Step 4: Configure sync options
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
                enabled: true,
                syncOnSave: options.syncOnSave,
                syncOnDelete: options.syncOnDelete,
                syncHidden: options.syncHidden,
                debounceMs: options.debounceMs,
                excludePatterns: options.excludePatterns
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
            await this.openSettingsJSON();
        } catch (error) {
            this.logger.error(`Edit configuration failed: ${error}`);
            vscode.window.showErrorMessage(`Failed to edit configuration: ${error}`);
        }
    }







    /**
     * Open the workspace settings JSON file
     */
    private async openSettingsJSON(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
        } catch (error) {
            this.logger.error(`Failed to open settings JSON: ${error}`);
            vscode.window.showErrorMessage('Failed to open settings file.');
        }
    }
}
