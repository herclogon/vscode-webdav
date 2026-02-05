import * as vscode from 'vscode';

export interface SyncConfigurationData {
    id: string;
    name: string;
    localPath: string;
    webdavUrl: string;
    enabled: boolean;
    syncOnSave: boolean;
    syncOnDelete: boolean;
    syncHidden: boolean;
    debounceMs: number;
    excludePatterns: string[];
    username?: string;
    password?: string;
}

export class SyncConfiguration {
    public id: string;
    public name: string;
    public localPath: string;
    public webdavUrl: string;
    public enabled: boolean;
    public syncOnSave: boolean;
    public syncOnDelete: boolean;
    public syncHidden: boolean;
    public debounceMs: number;
    public excludePatterns: string[];
    public username?: string;
    public password?: string;
    
    public status: 'idle' | 'syncing' | 'error' = 'idle';
    public lastSyncTime?: Date;
    public lastError?: string;
    public filesInQueue: number = 0;

    constructor(data: SyncConfigurationData) {
        this.id = data.id;
        this.name = data.name;
        this.localPath = data.localPath;
        this.webdavUrl = data.webdavUrl;
        this.enabled = data.enabled;
        this.syncOnSave = data.syncOnSave;
        this.syncOnDelete = data.syncOnDelete;
        this.syncHidden = data.syncHidden;
        this.debounceMs = data.debounceMs;
        this.excludePatterns = data.excludePatterns;
        this.username = data.username;
        this.password = data.password;
    }

    public toJSON(): SyncConfigurationData {
        return {
            id: this.id,
            name: this.name,
            localPath: this.localPath,
            webdavUrl: this.webdavUrl,
            enabled: this.enabled,
            syncOnSave: this.syncOnSave,
            syncOnDelete: this.syncOnDelete,
            syncHidden: this.syncHidden,
            debounceMs: this.debounceMs,
            excludePatterns: this.excludePatterns,
            username: this.username,
            password: this.password
        };
    }

    public getStatusText(): string {
        if (!this.enabled) {
            return 'Paused';
        }
        if (this.status === 'syncing') {
            return `Syncing... (${this.filesInQueue} files)`;
        }
        if (this.status === 'error') {
            return `Error: ${this.lastError}`;
        }
        if (this.lastSyncTime) {
            const seconds = Math.floor((Date.now() - this.lastSyncTime.getTime()) / 1000);
            if (seconds < 60) {
                return `Synced ${seconds}s ago`;
            }
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) {
                return `Synced ${minutes}m ago`;
            }
            const hours = Math.floor(minutes / 60);
            return `Synced ${hours}h ago`;
        }
        return 'Not synced yet';
    }

    public getBaseUri(): string {
        return vscode.Uri.parse(this.webdavUrl.replace(/^webdav/i, "http"))
            .with({ path: "", fragment: "", query: "" })
            .toString();
    }

    public getWebDAVBaseUrl(): string {
        // Return the full URL including path for WebDAV operations
        return this.webdavUrl.replace(/^webdav/i, "http");
    }
}
