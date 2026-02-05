import * as path from 'path';
import * as vscode from 'vscode';
import { minimatch } from 'minimatch';

export class PathUtils {
    /**
     * Get relative path from base to target
     */
    public static getRelativePath(basePath: string, targetPath: string): string {
        return path.relative(basePath, targetPath);
    }

    /**
     * Normalize path separators to forward slashes
     */
    public static normalizePath(filePath: string): string {
        return filePath.replace(/\\/g, '/');
    }

    /**
     * Combine paths ensuring proper separators
     */
    public static joinPaths(...paths: string[]): string {
        return this.normalizePath(path.join(...paths));
    }

    /**
     * Check if a path matches any exclude pattern
     */
    public static isExcluded(filePath: string, excludePatterns: string[]): boolean {
        const normalizedPath = this.normalizePath(filePath);
        return excludePatterns.some(pattern => minimatch(normalizedPath, pattern));
    }

    /**
     * Check if path is within base path
     */
    public static isWithinPath(basePath: string, targetPath: string): boolean {
        const relative = path.relative(basePath, targetPath);
        return !relative.startsWith('..') && !path.isAbsolute(relative);
    }

    /**
     * Convert local path to WebDAV remote path
     */
    public static toRemotePath(localPath: string, localBase: string, remoteBase: string): string {
        const relativePath = this.getRelativePath(localBase, localPath);
        const remotePath = this.joinPaths(remoteBase, relativePath);
        // Ensure it starts with /
        return remotePath.startsWith('/') ? remotePath : '/' + remotePath;
    }

    /**
     * Get parent directory path
     */
    public static getParentPath(filePath: string): string {
        return this.normalizePath(path.dirname(filePath));
    }

    /**
     * Get all parent directories from path
     */
    public static getAllParents(filePath: string): string[] {
        const parents: string[] = [];
        let current = this.getParentPath(filePath);
        while (current !== '/' && current !== '.') {
            parents.push(current);
            current = this.getParentPath(current);
        }
        return parents.reverse(); // Return from root to immediate parent
    }
}
