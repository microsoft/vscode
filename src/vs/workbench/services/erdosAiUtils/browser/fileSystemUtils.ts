/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2024 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import * as path from '../../../../base/common/path.js';
import { ICommonUtils } from '../common/commonUtils.js';
import { isWindows } from '../../../../base/common/platform.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { IFileSystemUtils } from '../common/fileSystemUtils.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

export class FileSystemUtils extends Disposable implements IFileSystemUtils {
    readonly _serviceBrand: undefined;
    
    constructor(
        @IFileService private readonly fileService: IFileService,
        @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
        @IEnvironmentService private readonly environmentService: IEnvironmentService,
        @ICommonUtils private readonly commonUtils: ICommonUtils
    ) {
        super();
    }

    async getCurrentWorkingDirectory(): Promise<string> {
        const workspace = this.workspaceContextService.getWorkspace();
        if (workspace.folders.length > 0) {
            return workspace.folders[0].uri.fsPath;
        }
        
        return this.environmentService.userRoamingDataHome.fsPath;
    }

    async fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = this.pathToUri(filePath);
            return await this.fileService.exists(uri);
        } catch (error) {
            return false;
        }
    }

    async isDirectory(filePath: string): Promise<boolean> {
        try {
            const uri = this.pathToUri(filePath);
            const stat = await this.fileService.stat(uri);
            return stat.isDirectory;
        } catch (error) {
            return false;
        }
    }

    async getFileSize(filePath: string): Promise<number> {
        try {
            const uri = this.pathToUri(filePath);
            const stat = await this.fileService.stat(uri);
            return stat.size || 0;
        } catch (error) {
            return 0;
        }
    }

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
                const childName = this.commonUtils.getBasename(child.resource.fsPath);
                
                if (!options.allFiles && childName.startsWith('.')) {
                    continue;
                }

                if (child.isDirectory) {
                    if (options.includeDirs) {
                        const fileName = options.fullNames ? child.resource.fsPath : childName;
                        results.push(fileName);
                    }
                } else {
                    const fileName = options.fullNames ? child.resource.fsPath : childName;
                    results.push(fileName);
                }

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

    async listAllFiles(directoryPath: string): Promise<string[]> {
        return this.listFiles(directoryPath, {
            fullNames: true,
            allFiles: false,
            includeDirs: false,
            recursive: true
        });
    }

    async directoryExists(directoryPath: string): Promise<boolean> {
        try {
            const uri = this.pathToUri(directoryPath);
            const stat = await this.fileService.stat(uri);
            return stat.isDirectory;
        } catch (error) {
            return false;
        }
    }

    async getFileInfo(directoryPath: string, files: string[]): Promise<Array<{
        name: string;
        size?: number;
        isdir?: boolean;
        is_dir?: boolean;
    }>> {
        const results = [];
        
        for (const file of files) {
            const filePath = this.commonUtils.joinPath(directoryPath, file);
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

    async resolveAbsolutePath(filePath: string): Promise<string> {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        
        const cwd = await this.getCurrentWorkingDirectory();
        return path.join(cwd, filePath);
    }

    private pathToUri(filePath: string): URI {
        return URI.file(filePath);
    }

    isWindowsAbsolutePath(filePath: string): boolean {
        return isWindows && /^[A-Za-z]:/.test(filePath);
    }

    async validatePathSecurity(filePath: string, allowedBaseDir?: string): Promise<{
        isValid: boolean;
        errorMessage?: string;
    }> {
        try {
            const resolvedPath = await this.resolveAbsolutePath(filePath);
            const normalizedPath = this.commonUtils.normalizePath(resolvedPath);
            
            if (normalizedPath.includes('..')) {
                return {
                    isValid: false,
                    errorMessage: 'Path traversal detected'
                };
            }

            if (allowedBaseDir) {
                const normalizedBase = this.commonUtils.normalizePath(await this.resolveAbsolutePath(allowedBaseDir));
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

    async createDirectory(dirPath: string): Promise<boolean> {
        try {
            const uri = URI.file(dirPath);
            await this.fileService.createFolder(uri);
            return true;
        } catch (error) {
            return false;
        }
    }

    async writeFileContent(filePath: string, content: string): Promise<boolean> {
        try {
            const uri = URI.file(filePath);
            
            const parentDir = URI.file(this.commonUtils.getDirname(filePath));
            if (!(await this.fileService.exists(parentDir))) {
                await this.fileService.createFolder(parentDir);
            }

            const buffer = VSBuffer.fromString(content);
            await this.fileService.writeFile(uri, buffer);
            return true;
        } catch (error) {
            return false;
        }
    }
}
