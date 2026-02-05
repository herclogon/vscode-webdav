import * as vscode from 'vscode';
import { AutoSyncManager } from '../sync/AutoSyncManager';
import { SyncTreeItem, SyncCategoryItem, SyncConfigItem, SyncDetailItem } from './SyncTreeItems';

export class SyncTreeDataProvider implements vscode.TreeDataProvider<SyncTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SyncTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private syncManager: AutoSyncManager) {
        // Listen to sync manager changes
        syncManager.onDidChangeConfiguration(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SyncTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SyncTreeItem): SyncTreeItem[] {
        if (!element) {
            // Root level - show categories
            const activeSyncs = this.syncManager.getActiveConfigurations();
            const pausedSyncs = this.syncManager.getPausedConfigurations();

            const items: SyncTreeItem[] = [];
            
            if (activeSyncs.length > 0) {
                items.push(new SyncCategoryItem('Active Syncs', activeSyncs));
            }
            
            if (pausedSyncs.length > 0) {
                items.push(new SyncCategoryItem('Paused Syncs', pausedSyncs));
            }

            return items;
        } else if (element instanceof SyncCategoryItem) {
            // Show syncs under category
            return element.syncs.map(s => new SyncConfigItem(s));
        } else if (element instanceof SyncConfigItem) {
            // Show details under sync
            return [
                new SyncDetailItem('Local', element.config.localPath, element.config, 'local'),
                new SyncDetailItem('Remote', `${element.config.webdavUrl}${element.config.remotePath}`, element.config, 'remote'),
                new SyncDetailItem('Status', element.config.getStatusText())
            ];
        }
        
        return [];
    }
}
