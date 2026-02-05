import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebDAVClient } from 'webdav';
import { PathUtils } from '../utils/PathUtils';
import { Logger } from '../utils/Logger';

export class FileOperations {
    constructor(private logger: Logger) {}

    /**
     * Ensure remote directory exists, create if necessary
     * @param basePath - The base WebDAV path (from config) that already exists
     */
    public async ensureRemoteDirectory(client: WebDAVClient, remotePath: string, basePath: string): Promise<void> {
        const parents = PathUtils.getAllParents(remotePath);
        
        // Normalize base path for comparison
        const normalizedBasePath = PathUtils.normalizePath(basePath.replace(/\/$/, ''));
        
        for (const parent of parents) {
            const normalizedParent = PathUtils.normalizePath(parent);
            
            // Skip if this parent is part of or equal to the base path
            if (normalizedParent === normalizedBasePath || 
                normalizedParent.length < normalizedBasePath.length) {
                this.logger.info(`✓ Skipping base path directory: ${parent}`);
                continue;
            }
            
            try {
                await client.stat(parent);
                this.logger.info(`✓ Directory exists: ${parent}`);
            } catch (error) {
                // Directory doesn't exist, create it
                try {
                    this.logger.info(`Creating remote directory: ${parent}`);
                    await client.createDirectory(parent);
                    this.logger.success(`✓ Created remote directory: ${parent}`);
                } catch (createError: any) {
                    // Ignore if already exists (race condition)
                    if (createError.status !== 405) {
                        this.logger.error(`✗ Failed to create directory ${parent}: Status ${createError.status} - ${createError.message || createError}`);
                        throw new Error(`Failed to create directory ${parent}: Invalid response: ${createError.status} ${createError.statusText || createError.message || 'Unknown error'}`);
                    }
                }
            }
        }
    }

    /**
     * Upload a single file to WebDAV
     * @param basePath - The base WebDAV path from config that already exists
     */
    public async uploadFile(
        client: WebDAVClient,
        localPath: string,
        remotePath: string,
        basePath: string
    ): Promise<void> {
        try {
            // Ensure parent directory exists
            const remoteDir = PathUtils.getParentPath(remotePath);
            if (remoteDir !== '/') {
                await this.ensureRemoteDirectory(client, remotePath, basePath);
            }

            // Read local file
            const content = await fs.promises.readFile(localPath);

            // Upload to WebDAV
            await client.putFileContents(remotePath, content, { overwrite: true });
        } catch (error: any) {
            const errorMsg = `Upload failed for ${localPath} → ${remotePath}: ${error.message || error}`;
            if (error.status) {
                throw new Error(`${errorMsg} (HTTP ${error.status})`);
            }
            throw new Error(errorMsg);
        }
    }

    /**
     * Delete a file from WebDAV
     */
    public async deleteFile(client: WebDAVClient, remotePath: string): Promise<void> {
        await client.deleteFile(remotePath);
    }

    /**
     * Walk directory recursively and return all file paths
     */
    public async walkDirectory(
        dirPath: string,
        excludePatterns: string[],
        syncHidden: boolean = false
    ): Promise<string[]> {
        const files: string[] = [];

        const walk = async (currentPath: string): Promise<void> => {
            const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                const relativePath = PathUtils.getRelativePath(dirPath, fullPath);

                // Skip hidden files if not enabled
                if (!syncHidden && entry.name.startsWith('.')) {
                    continue;
                }

                // Skip excluded paths
                if (PathUtils.isExcluded(relativePath, excludePatterns)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    files.push(fullPath);
                }
            }
        };

        await walk(dirPath);
        return files;
    }

    /**
     * Check if file exists locally
     */
    public async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get file size in bytes
     */
    public async getFileSize(filePath: string): Promise<number> {
        const stats = await fs.promises.stat(filePath);
        return stats.size;
    }

    /**
     * Format bytes to human readable string
     */
    public formatBytes(bytes: number): string {
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}
