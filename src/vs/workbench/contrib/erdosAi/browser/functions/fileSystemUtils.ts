/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import * as path from '../../../../../base/common/path.js';
import { CommonUtils } from '../utils/commonUtils.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';

/**
 * File system utilities for Erdos AI function handlers
 * Provides real implementations using Erdos's file system APIs
 */
export class FileSystemUtils {
    constructor(
        private readonly fileService: IFileService,
        private readonly workspaceContextService: IWorkspaceContextService,
        private readonly environmentService?: IEnvironmentService
    ) {}

    /**
     * Get current working directory
     */
    async getCurrentWorkingDirectory(): Promise<string> {
        const workspace = this.workspaceContextService.getWorkspace();
        if (workspace.folders.length > 0) {
            return workspace.folders[0].uri.fsPath;
        }
        
        // Fallback to user roaming data home if no workspace
        if (this.environmentService) {
            return this.environmentService.userRoamingDataHome.fsPath;
        }
        
        // Last resort fallback
        return process.cwd();
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = this.pathToUri(filePath);
            return await this.fileService.exists(uri);
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if path is a directory
     */
    async isDirectory(filePath: string): Promise<boolean> {
        try {
            const uri = this.pathToUri(filePath);
            const stat = await this.fileService.stat(uri);
            return stat.isDirectory;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get file size in bytes
     */
    async getFileSize(filePath: string): Promise<number> {
        try {
            const uri = this.pathToUri(filePath);
            const stat = await this.fileService.stat(uri);
            return stat.size || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get file stats (size, isDirectory)
     */
    async getFileStats(filePath: string): Promise<{
        size?: number;
        isDirectory: boolean;
    }> {
        try {
            const uri = this.pathToUri(filePath);
            const stat = await this.fileService.stat(uri);
            return {
                size: stat.size || 0,
                isDirectory: stat.isDirectory
            };
        } catch (error) {
            return {
                size: 0,
                isDirectory: false
            };
        }
    }

    /**
     * List files in directory
     */
    async listFiles(directoryPath: string, options: {
        fullNames?: boolean;
        allFiles?: boolean;
        includeDirs?: boolean;
        recursive?: boolean;
    } = {}): Promise<string[]> {
        try {
            const uri = this.pathToUri(directoryPath);
            const entries = await this.fileService.resolve(uri);
            
            if (!entries.isDirectory || !entries.children) {
                return [];
            }

            let results: string[] = [];

            for (const child of entries.children) {
                const childName = CommonUtils.getBasename(child.resource.fsPath);
                
                // Handle hidden files (allFiles option)
                if (!options.allFiles && childName.startsWith('.')) {
                    continue;
                }

                // Handle files vs directories
                if (child.isDirectory) {
                    // Only include directories if includeDirs is true
                    if (options.includeDirs) {
                        const fileName = options.fullNames ? child.resource.fsPath : childName;
                        results.push(fileName);
                    }
                } else {
                    // Always include files (unless filtered by other criteria)
                    const fileName = options.fullNames ? child.resource.fsPath : childName;
                    results.push(fileName);
                }

                // Handle recursive listing
                if (options.recursive && child.isDirectory) {
                    const childResults = await this.listFiles(child.resource.fsPath, options);
                    results = results.concat(childResults);
                }
            }

            return results.sort();
        } catch (error) {
            return [];
        }
    }

    /**
     * List all files recursively
     */
    async listAllFiles(directoryPath: string): Promise<string[]> {
        return this.listFiles(directoryPath, {
            fullNames: true,
            allFiles: false,
            includeDirs: false,
            recursive: true
        });
    }

    /**
     * Check if directory exists
     */
    async directoryExists(directoryPath: string): Promise<boolean> {
        try {
            const uri = this.pathToUri(directoryPath);
            const stat = await this.fileService.stat(uri);
            return stat.isDirectory;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get file information for multiple files
     */
    async getFileInfo(directoryPath: string, files: string[]): Promise<Array<{
        name: string;
        size?: number;
        isdir?: boolean;
        is_dir?: boolean;
    }>> {
        const results = [];
        
        for (const file of files) {
            const filePath = this.joinPath(directoryPath, file);
            const stats = await this.getFileStats(filePath);
            
            results.push({
                name: file,
                size: stats.size,
                isdir: stats.isDirectory,
                is_dir: stats.isDirectory
            });
        }
        
        return results;
    }

    /**
     * Join file paths (cross-platform)
     */
    joinPath(dir: string, file: string): string {
        return path.join(dir, file);
    }

    /**
     * Normalize path (cross-platform)
     */
    normalizePath(filePath: string): string {
        // Convert to absolute path if relative
        if (!path.isAbsolute(filePath)) {
            // For relative paths, we need the current working directory
            // This is a synchronous operation, so we'll do basic normalization
            return path.normalize(filePath);
        }
        
        return path.normalize(filePath);
    }

    /**
     * Get basename of path - delegates to CommonUtils for consistency
     */
    getBasename(filePath: string): string {
        return CommonUtils.getBasename(filePath);
    }

    /**
     * Get directory name of path
     */
    getDirname(filePath: string): string {
        return path.dirname(filePath);
    }

    /**
     * Get file extension
     */
    getFileExtension(filePath: string): string {
        const ext = path.extname(filePath);
        return ext.startsWith('.') ? ext.substring(1) : ext;
    }

    /**
     * Convert relative paths to absolute based on working directory
     */
    async resolveAbsolutePath(filePath: string): Promise<string> {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const cwd = await this.getCurrentWorkingDirectory();
        return path.join(cwd, filePath);
    }

    /**
     * Convert file path to URI
     */
    private pathToUri(filePath: string): URI {
        return URI.file(filePath);
    }

    /**
     * Check if path is Windows absolute path
     */
    isWindowsAbsolutePath(filePath: string): boolean {
        return isWindows && /^[A-Za-z]:/.test(filePath);
    }

    /**
     * Expand tilde paths
     */
    async expandTildePath(filePath: string): Promise<string> {
        if (!filePath.startsWith('~')) {
            return filePath;
        }

        // Get user home directory
        let homeDir: string;
        if (this.environmentService) {
            homeDir = this.environmentService.userRoamingDataHome.fsPath;
        } else {
            // Fallback to environment variable
            homeDir = process.env.HOME || process.env.USERPROFILE || '';
        }

        // Handle empty home directory
        if (!homeDir) {
            throw new Error('Unable to determine user home directory');
        }

        if (filePath === '~') {
            return homeDir;
        }

        if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
            return path.join(homeDir, filePath.substring(2));
        }

        // Handle ~username patterns (basic support)
        const slashIndex = Math.min(
            filePath.indexOf('/') === -1 ? filePath.length : filePath.indexOf('/'),
            filePath.indexOf('\\') === -1 ? filePath.length : filePath.indexOf('\\')
        );
        
        if (slashIndex > 1) {
            // For security and simplicity, only support current user
            // In a full implementation, this would look up other users' home directories
            if (slashIndex === filePath.length) {
                return homeDir; // Just ~username, return current user's home
            } else {
                return path.join(homeDir, filePath.substring(slashIndex + 1));
            }
        }

        return filePath;
    }

    /**
     * Convert absolute paths to relative paths based on base directory
     */
    convertToRelativePaths(paths: string[], baseDir: string): string[] {
        const normalizedBase = this.normalizePath(baseDir);
        
        return paths.map(filePath => {
            const normalizedPath = this.normalizePath(filePath);
            
            if (normalizedPath.startsWith(normalizedBase)) {
                let relativePath = normalizedPath.substring(normalizedBase.length);
                if (relativePath.startsWith(path.sep)) {
                    relativePath = relativePath.substring(1);
                }
                return relativePath;
            }
            
            return filePath;
        });
    }

    /**
     * Format file size for display
     */
    formatFileSize(sizeInBytes: number): string {
        if (sizeInBytes < 1024) {
            return `${sizeInBytes}B`;
        } else if (sizeInBytes < 1024 * 1024) {
            return `${Math.round(sizeInBytes / 1024 * 10) / 10}KB`;
        } else if (sizeInBytes < 1024 * 1024 * 1024) {
            return `${Math.round(sizeInBytes / (1024 * 1024) * 10) / 10}MB`;
        } else {
            return `${Math.round(sizeInBytes / (1024 * 1024 * 1024) * 10) / 10}GB`;
        }
    }

    /**
     * Check for path traversal attacks
     */
    async validatePathSecurity(filePath: string, allowedBaseDir?: string): Promise<{
        isValid: boolean;
        errorMessage?: string;
    }> {
        try {
            const resolvedPath = await this.resolveAbsolutePath(filePath);
            const normalizedPath = this.normalizePath(resolvedPath);
            
            // Check for path traversal
            if (normalizedPath.includes('..')) {
                return {
                    isValid: false,
                    errorMessage: 'Path traversal detected'
                };
            }

            // Check against allowed base directory if provided
            if (allowedBaseDir) {
                const normalizedBase = this.normalizePath(await this.resolveAbsolutePath(allowedBaseDir));
                if (!normalizedPath.startsWith(normalizedBase)) {
                    return {
                        isValid: false,
                        errorMessage: 'Path is outside allowed directory'
                    };
                }
            }

            return { isValid: true };
        } catch (error) {
            return {
                isValid: false,
                errorMessage: `Path validation error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Read file content as string
     */
    async readFileContent(filePath: string): Promise<string | null> {
        try {
            const uri = URI.file(filePath);
            if (!(await this.fileService.exists(uri))) {
                return null;
            }

            const fileContent = await this.fileService.readFile(uri);
            return fileContent.value.toString();
        } catch (error) {
            return null;
        }
    }

    /**
     * Read binary file content from disk
     */
    async readBinaryFile(filePath: string): Promise<ArrayBuffer | null> {
        try {
            const uri = URI.file(filePath);
            if (!(await this.fileService.exists(uri))) {
                return null;
            }

            const fileContent = await this.fileService.readFile(uri);
            
            if (fileContent && fileContent.value) {
                // Convert Uint8Array to ArrayBuffer
                const uint8Array = new Uint8Array(fileContent.value.buffer);
                return uint8Array.buffer.slice(uint8Array.byteOffset, uint8Array.byteOffset + uint8Array.byteLength);
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Create directory recursively
     */
    async createDirectory(dirPath: string): Promise<boolean> {
        try {
            const uri = URI.file(dirPath);
            await this.fileService.createFolder(uri);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Write content to file
     */
    async writeFileContent(filePath: string, content: string): Promise<boolean> {
        try {
            const uri = URI.file(filePath);
            
            // Ensure parent directory exists
            const parentDir = URI.file(this.getDirname(filePath));
            if (!(await this.fileService.exists(parentDir))) {
                await this.fileService.createFolder(parentDir);
            }

            // Convert string content to VSBuffer
            const buffer = VSBuffer.fromString(content);
            await this.fileService.writeFile(uri, buffer);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Check if a filename is a Windows reserved name
     */
    isWindowsReservedName(name: string): boolean {
        if (!isWindows) {
            return false;
        }

        const reserved = [
            'con', 'prn', 'aux', 'nul', 'com1', 'com2',
            'com3', 'com4', 'com5', 'com6', 'com7',
            'com8', 'com9', 'lpt1', 'lpt2', 'lpt3',
            'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8',
            'lpt9'
        ];
        
        const lowerName = name.toLowerCase();
        return reserved.includes(lowerName);
    }

    /**
     * Validate filename for Windows compatibility
     */
    validateFilename(filename: string): { isValid: boolean; error?: string } {
        if (!filename || filename.trim() === '') {
            return { isValid: false, error: 'Filename cannot be empty' };
        }

        // Check for Windows reserved names
        if (this.isWindowsReservedName(filename)) {
            return { isValid: false, error: `'${filename}' is a reserved name on Windows` };
        }

        // Check for invalid characters on Windows
        if (isWindows) {
            const invalidChars = /[<>:"\/\\|?*]/;
            if (invalidChars.test(filename)) {
                return { isValid: false, error: 'Filename contains invalid characters for Windows: < > : " / \\ | ? *' };
            }

            // Check for control characters (0-31)
            for (let i = 0; i < filename.length; i++) {
                const charCode = filename.charCodeAt(i);
                if (charCode >= 0 && charCode <= 31) {
                    return { isValid: false, error: 'Filename contains invalid control characters' };
                }
            }

            // Check for trailing spaces or periods (Windows doesn't allow these)
            if (filename.endsWith(' ') || filename.endsWith('.')) {
                return { isValid: false, error: 'Filename cannot end with spaces or periods on Windows' };
            }
        }

        return { isValid: true };
    }

    /**
     * Sanitize filename for cross-platform compatibility
     */
    sanitizeFilename(filename: string): string {
        if (!filename) {
            return 'untitled';
        }

        let sanitized = filename;

        // Replace invalid characters with underscores
        if (isWindows) {
            sanitized = sanitized.replace(/[<>:"\/\\|?*]/g, '_');
        } else {
            sanitized = sanitized.replace(/[\/]/g, '_');
        }

        // Remove control characters
        sanitized = sanitized.replace(/[\x00-\x1f]/g, '');

        // Handle Windows reserved names
        if (this.isWindowsReservedName(sanitized)) {
            sanitized = `${sanitized}_file`;
        }

        // Remove trailing spaces and periods on Windows
        if (isWindows) {
            sanitized = sanitized.replace(/[\s.]+$/, '');
        }

        // Ensure we have a non-empty result
        if (!sanitized.trim()) {
            sanitized = 'untitled';
        }

        return sanitized;
    }



    /**
     * Enhanced path validation with Windows-specific checks
     */
    async validatePathSecurityEnhanced(filePath: string): Promise<{
        isValid: boolean;
        errorMessage?: string;
    }> {
        // Existing path traversal checks
        const existingResult = await this.validatePathSecurity(filePath);
        if (!existingResult.isValid) {
            return existingResult;
        }

        // Windows reserved name check
        const basename = CommonUtils.getBasename(filePath);
        if (this.isWindowsReservedName(basename)) {
            return {
                isValid: false,
                errorMessage: `Path contains Windows reserved name: ${basename}`
            };
        }

        // Windows path length check (260 character limit for legacy APIs)
        if (process.platform === 'win32' && filePath.length > 260) {
            return {
                isValid: false,
                errorMessage: 'Path exceeds Windows maximum length (260 characters)'
            };
        }

        // Windows invalid character check
        if (process.platform === 'win32') {
            const invalidChars = /[<>:"|?*\x00-\x1f]/;
            if (invalidChars.test(filePath)) {
                return {
                    isValid: false,
                    errorMessage: 'Path contains invalid Windows characters'
                };
            }
        }

        return { isValid: true };
    }
}

