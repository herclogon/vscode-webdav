import * as vscode from 'vscode';
import { WebDAVClient, FileStat } from 'webdav';
import { Logger } from '../utils/Logger';

export class WebDAVBrowser {
    constructor(private logger: Logger) {}

    /**
     * Browse WebDAV folder and let user select a path
     */
    public async browseFolder(client: WebDAVClient, initialPath: string = '/'): Promise<string | undefined> {
        return this.showFolderPicker(client, initialPath);
    }

    private async showFolderPicker(client: WebDAVClient, currentPath: string): Promise<string | undefined> {
        try {
            // Get directory contents
            const contents = await client.getDirectoryContents(currentPath, { deep: false }) as FileStat[];
            const folders = contents.filter(item => item.type === 'directory');

            // Create quick pick
            const quickPick = vscode.window.createQuickPick();
            quickPick.title = 'Browse WebDAV Folder';
            quickPick.placeholder = `Current path: ${currentPath}`;

            const items: vscode.QuickPickItem[] = [];

            // Add navigation options
            if (currentPath !== '/') {
                items.push({
                    label: '$(arrow-up) Go to parent folder',
                    description: '',
                    detail: 'parent'
                });
            }

            items.push({
                label: '$(check) Select this folder',
                description: currentPath,
                detail: 'select'
            });

            items.push({
                label: '$(new-folder) Create new folder...',
                description: '',
                detail: 'create'
            });

            // Add separator
            if (folders.length > 0) {
                items.push({
                    label: '',
                    kind: vscode.QuickPickItemKind.Separator
                });

                // Add folders
                for (const folder of folders) {
                    items.push({
                        label: `$(folder) ${folder.basename}`,
                        description: '',
                        detail: folder.filename
                    });
                }
            }

            quickPick.items = items;
            quickPick.show();

            return new Promise((resolve) => {
                quickPick.onDidAccept(async () => {
                    const selected = quickPick.selectedItems[0];
                    if (!selected) {
                        resolve(undefined);
                        return;
                    }

                    quickPick.hide();

                    if (selected.detail === 'select') {
                        resolve(currentPath);
                    } else if (selected.detail === 'parent') {
                        const parts = currentPath.split('/').filter(p => p);
                        const parentPath = parts.length > 0 
                            ? '/' + parts.slice(0, -1).join('/')
                            : '/';
                        resolve(await this.showFolderPicker(client, parentPath));
                    } else if (selected.detail === 'create') {
                        const newFolder = await this.createNewFolder(client, currentPath);
                        if (newFolder) {
                            resolve(await this.showFolderPicker(client, currentPath));
                        } else {
                            resolve(undefined);
                        }
                    } else {
                        // Navigate into folder
                        resolve(await this.showFolderPicker(client, selected.detail!));
                    }
                });

                quickPick.onDidHide(() => {
                    quickPick.dispose();
                    resolve(undefined);
                });
            });
        } catch (error) {
            this.logger.error(`Failed to browse WebDAV folder ${currentPath}: ${error}`);
            vscode.window.showErrorMessage(`Failed to browse folder: ${error}`);
            return undefined;
        }
    }

    private async createNewFolder(client: WebDAVClient, parentPath: string): Promise<boolean> {
        const folderName = await vscode.window.showInputBox({
            prompt: 'Enter new folder name',
            placeHolder: 'folder-name',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Folder name cannot be empty';
                }
                if (value.includes('/') || value.includes('\\')) {
                    return 'Folder name cannot contain slashes';
                }
                return undefined;
            }
        });

        if (!folderName) {
            return false;
        }

        try {
            const newPath = `${parentPath}/${folderName}`.replace('//', '/');
            await client.createDirectory(newPath);
            this.logger.info(`Created folder: ${newPath}`);
            vscode.window.showInformationMessage(`Created folder: ${folderName}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to create folder: ${error}`);
            vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            return false;
        }
    }

    /**
     * Manual path input as fallback
     */
    public async inputPath(defaultPath: string = '/'): Promise<string | undefined> {
        return vscode.window.showInputBox({
            prompt: 'Enter WebDAV path',
            value: defaultPath,
            placeHolder: '/path/to/folder',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Path cannot be empty';
                }
                if (!value.startsWith('/')) {
                    return 'Path must start with /';
                }
                return undefined;
            }
        });
    }
}
