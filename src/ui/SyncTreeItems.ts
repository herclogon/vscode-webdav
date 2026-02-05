import * as vscode from 'vscode';
import { SyncConfiguration } from '../sync/SyncConfiguration';

export class SyncTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

export class SyncCategoryItem extends SyncTreeItem {
    constructor(
        label: string,
        public readonly syncs: SyncConfiguration[]
    ) {
        super(`${label} (${syncs.length})`, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'syncCategory';
        this.iconPath = new vscode.ThemeIcon('folder');
    }
}

export class SyncConfigItem extends SyncTreeItem {
    constructor(public readonly config: SyncConfiguration) {
        super(config.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'syncConfig';
        this.description = config.getStatusText();
        this.tooltip = new vscode.MarkdownString(
            `**${config.name}**\n\n` +
            `Local: \`${config.localPath}\`\n\n` +
            `Remote: \`${config.webdavUrl}${config.remotePath}\`\n\n` +
            `Status: ${config.getStatusText()}`
        );

        // Set icon based on status
        if (!config.enabled) {
            this.iconPath = new vscode.ThemeIcon('debug-pause');
        } else if (config.status === 'syncing') {
            this.iconPath = new vscode.ThemeIcon('sync~spin');
        } else if (config.status === 'error') {
            this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('errorForeground'));
        } else {
            this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
        }
    }
}

export class SyncDetailItem extends SyncTreeItem {
    constructor(
        label: string,
        public readonly value: string,
        public readonly config?: SyncConfiguration,
        public readonly type?: 'local' | 'remote'
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = type ? `syncDetail-${type}` : 'syncDetail';
        this.description = value;
        this.iconPath = new vscode.ThemeIcon('info');
        
        // Make local and remote paths editable
        if (type === 'local' || type === 'remote') {
            this.contextValue = `syncDetail-${type}-editable`;
        }
    }
}
