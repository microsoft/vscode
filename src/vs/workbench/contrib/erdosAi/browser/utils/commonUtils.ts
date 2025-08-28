/*
 * Copyright (C) 2024 Lotas Inc. All rights reserved.
 * Licensed under the MIT License. See LICENSE file in the project root for details.
 */

import { URI } from '../../../../../base/common/uri.js';

/**
 * Common utility functions used across the Erdos AI codebase
 * Eliminates duplication of basic utility methods
 */
export class CommonUtils {
    
    /**
     * Get the basename (filename) from a file path
     * Handles both Unix and Windows path separators
     * Case-sensitive comparison respecting platform differences
     */
    static getBasename(filePath: string): string {
        if (!filePath) return '';
        return filePath.split(/[/\\]/).pop() || filePath;
    }

    /**
     * Compare two basenames for equality
     * Case-sensitive for filename, case-insensitive for extensions
     */
    static compareBasenames(basename1: string, basename2: string): boolean {
        if (!basename1 || !basename2) return false;
        
        // Split into name and extension parts
        const parts1 = this.splitNameAndExtension(basename1);
        const parts2 = this.splitNameAndExtension(basename2);
        
        // Compare name part case-sensitively, extension case-insensitively
        return parts1.name === parts2.name && 
               parts1.extension.toLowerCase() === parts2.extension.toLowerCase();
    }

    /**
     * Split filename into name and extension parts
     */
    static splitNameAndExtension(filename: string): { name: string; extension: string } {
        if (!filename) return { name: '', extension: '' };
        
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) {
            // No extension or hidden file
            return { name: filename, extension: '' };
        }
        
        return {
            name: filename.substring(0, lastDot),
            extension: filename.substring(lastDot + 1)
        };
    }

    /**
     * Compare two full paths with case-insensitive extension matching
     */
    static comparePathsWithCaseInsensitiveExtensions(path1: string, path2: string): boolean {
        if (!path1 || !path2) return false;
        
        // If paths are identical, return true immediately
        if (path1 === path2) return true;
        
        // Split paths into directory and filename parts
        const basename1 = this.getBasename(path1);
        const basename2 = this.getBasename(path2);
        const dir1 = path1.substring(0, path1.length - basename1.length);
        const dir2 = path2.substring(0, path2.length - basename2.length);
        
        // Compare directory parts exactly (case-sensitive)
        if (dir1 !== dir2) return false;
        
        // Compare basenames with case-insensitive extensions
        return this.compareBasenames(basename1, basename2);
    }

    /**
     * Unified file resolution system
     * Implements the exact rules specified for all file operations
     */
    static async resolveFile(
        filePath: string,
        context: {
            getAllOpenDocuments: () => Promise<Array<{ path: string; content: string; isDirty: boolean; isActive: boolean; isSaved: boolean }>>;
            getCurrentWorkingDirectory: () => Promise<string>;
            fileExists: (path: string) => Promise<boolean>;
            joinPath: (base: string, ...parts: string[]) => string;
            getFileContent: (uri: URI) => Promise<string>;
            getModelService?: any;
        }
    ): Promise<{
        found: boolean;
        uri?: URI;
        content?: string;
        isFromEditor?: boolean;
        relativePath?: string;
    }> {
        if (!filePath || filePath.trim().length === 0) {
            return { found: false };
        }

        let trimmedPath = filePath.trim();
        
        // Handle ~/ expansion first - this is critical for proper path resolution
        const expandedPath = this.expandPath(trimmedPath);
        trimmedPath = expandedPath;

        // Rule 1: If a full path is given, look for that full path exactly
        if (this.isAbsolutePath(trimmedPath)) {
            const uri = URI.file(trimmedPath);
            const exists = await context.fileExists(trimmedPath);
            
            if (!exists) {
                return { found: false };
            }

            // Check if open in editor first (Rule 4)
            const openDocs = await context.getAllOpenDocuments();
            
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, trimmedPath)) {
                    // For .ipynb files, use getFileContent to trigger Jupytext conversion
                    if (uri.path.endsWith('.ipynb')) {
                        const content = await context.getFileContent(uri);
                        return {
                            found: true,
                            uri,
                            content: content,
                            isFromEditor: true,
                            relativePath: this.getRelativePath(trimmedPath, await context.getCurrentWorkingDirectory())
                        };
                    } else {
                        // For non-.ipynb files, use direct content from editor
                        return {
                            found: true,
                            uri,
                            content: doc.content,
                            isFromEditor: true,
                            relativePath: this.getRelativePath(trimmedPath, await context.getCurrentWorkingDirectory())
                        };
                    }
                }
            }

            // File exists on disk but not open
            try {
                const content = await context.getFileContent(uri);
                return {
                    found: true,
                    uri,
                    content: content,
                    isFromEditor: false,
                    relativePath: this.getRelativePath(trimmedPath, await context.getCurrentWorkingDirectory())
                };
            } catch (error) {
                return { found: false };
            }
        }

        // Rule 2: If a name with UNSAVED is given, use open unsaved documents
        if (trimmedPath.startsWith('__UNSAVED_')) {
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, trimmedPath) && !doc.isSaved) {
                    const uri = URI.parse(`untitled:${trimmedPath}`);
                    // For .ipynb files, use getFileContent to trigger Jupytext conversion
                    if (trimmedPath.endsWith('.ipynb')) {
                        const content = await context.getFileContent(uri);
                        return {
                            found: true,
                            uri,
                            content: content,
                            isFromEditor: true,
                            relativePath: trimmedPath
                        };
                    } else {
                        // For non-.ipynb files, use direct content from editor
                        return {
                            found: true,
                            uri,
                            content: doc.content,
                            isFromEditor: true,
                            relativePath: trimmedPath
                        };
                    }
                }
            }
            return { found: false };
        }

        // Rule 3: If a relative path is given, check from current working directory
        if (this.isRelativePath(trimmedPath)) {
            const cwd = await context.getCurrentWorkingDirectory();
            const fullPath = context.joinPath(cwd, trimmedPath);
            const exists = await context.fileExists(fullPath);
            if (!exists) {
                return { found: false };
            }

            const uri = URI.file(fullPath);

            // Check if open in editor first (Rule 4)
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, fullPath)) {
                    // For .ipynb files, use getFileContent to trigger Jupytext conversion
                    if (uri.path.endsWith('.ipynb')) {
                        const content = await context.getFileContent(uri);
                        return {
                            found: true,
                            uri,
                            content: content,
                            isFromEditor: true,
                            relativePath: trimmedPath
                        };
                    } else {
                        // For non-.ipynb files, use direct content from editor
                        return {
                            found: true,
                            uri,
                            content: doc.content,
                            isFromEditor: true,
                            relativePath: trimmedPath
                        };
                    }
                }
            }

            // File exists on disk but not open
            const content = await context.getFileContent(uri);
            return {
                found: true,
                uri,
                content: content,
                isFromEditor: false,
                relativePath: trimmedPath
            };
        }

        // Rule 4: If only a basename is given, check open documents and immediate working directory
        const targetBasename = this.getBasename(trimmedPath);
        if (targetBasename === trimmedPath) {
            // First check open documents
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                const docBasename = this.getBasename(doc.path);
                if (this.compareBasenames(docBasename, targetBasename)) {
                    const uri = doc.path.startsWith('untitled:') || doc.path.startsWith('__UNSAVED_') 
                        ? URI.parse(doc.path)
                        : URI.file(doc.path);
                    
                    // For .ipynb files, use direct editor content to preserve unsaved changes with outputs
                    if (uri.path.endsWith('.ipynb')) {
                        // Use editor content directly to get unsaved changes including outputs
                        return {
                            found: true,
                            uri,
                            content: doc.content, // Use editor content, not saved file
                            isFromEditor: true,
                            relativePath: this.getRelativePath(doc.path, await context.getCurrentWorkingDirectory())
                        };
                    } else {
                        // For non-.ipynb files, use direct content from editor
                        return {
                            found: true,
                            uri,
                            content: doc.content,
                            isFromEditor: true,
                            relativePath: this.getRelativePath(doc.path, await context.getCurrentWorkingDirectory())
                        };
                    }
                }
            }

            // Then check immediate working directory (non-recursive)
            const cwd = await context.getCurrentWorkingDirectory();
            const fullPath = context.joinPath(cwd, targetBasename);
            const exists = await context.fileExists(fullPath);
            if (exists) {
                const uri = URI.file(fullPath);
                const content = await context.getFileContent(uri);
                return {
                    found: true,
                    uri,
                    content: content,
                    isFromEditor: false,
                    relativePath: targetBasename
                };
            }

            return { found: false };
        }

        // Invalid path format
        return { found: false };
    }

    /**
     * Check if a path is absolute
     */
    static isAbsolutePath(path: string): boolean {
        // Unix absolute path
        if (path.startsWith('/')) return true;
        // Windows absolute path (C:\ or \\server\share)
        if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
        if (path.startsWith('\\\\')) return true;
        return false;
    }

    /**
     * Check if a path is relative (contains path separators but not absolute)
     */
    static isRelativePath(path: string): boolean {
        if (this.isAbsolutePath(path)) return false;
        return path.includes('/') || path.includes('\\');
    }

    /**
     * Get relative path from absolute path relative to base directory
     */
    static getRelativePath(absolutePath: string, baseDir: string): string {
        if (!this.isAbsolutePath(absolutePath)) return absolutePath;
        
        // Normalize separators
        const normalizedAbs = absolutePath.replace(/\\/g, '/');
        const normalizedBase = baseDir.replace(/\\/g, '/');
        
        if (normalizedAbs.startsWith(normalizedBase)) {
            let relative = normalizedAbs.substring(normalizedBase.length);
            if (relative.startsWith('/')) relative = relative.substring(1);
            return relative || '.';
        }
        
        return absolutePath;
    }

    /**
     * Get the directory name from a file path
     * Handles both Unix and Windows path separators
     */
    static getDirname(filePath: string): string {
        if (!filePath) return '';
        const parts = filePath.split(/[/\\]/);
        parts.pop(); // Remove filename
        return parts.join('/') || '/';
    }

    /**
     * Get file extension from a file path
     * Returns extension without dot (e.g., 'ts', 'js')
     */
    static getFileExtension(filePath: string): string {
        if (!filePath) return '';
        const basename = CommonUtils.getBasename(filePath);
        const lastDot = basename.lastIndexOf('.');
        return lastDot !== -1 ? basename.substring(lastDot + 1) : '';
    }

    /**
     * Detect programming language from file extension
     * Returns a standardized language identifier
     */
    static detectLanguage(filePath: string): string {
        const extension = CommonUtils.getFileExtension(filePath).toLowerCase();
        
        const languageMap: Record<string, string> = {
            'ts': 'typescript',
            'tsx': 'typescript',
            'js': 'javascript', 
            'jsx': 'javascript',
            'py': 'python',
            'r': 'r',
            'rmd': 'r',
            'qmd': 'r',
            'java': 'java',
            'cpp': 'cpp',
            'cc': 'cpp',
            'cxx': 'cpp',
            'c': 'c',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'php': 'php',
            'rb': 'ruby',
            'sql': 'sql',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'sass',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown',
            'markdown': 'markdown',
            'sh': 'bash',
            'bash': 'bash',
            'zsh': 'bash',
            'ps1': 'powershell',
            'bat': 'batch',
            'cmd': 'batch'  
        };

        return languageMap[extension] || 'plaintext';
    }

    /**
     * Get comment syntax for a programming language
     * Returns the line comment prefix for the language
     */
    static getCommentSyntax(filePath: string): string {
        const language = CommonUtils.detectLanguage(filePath);
        
        const commentMap: Record<string, string> = {
            'r': '# ',
            'python': '# ',
            'bash': '# ',
            'yaml': '# ',
            'ruby': '# ',
            'javascript': '// ',
            'typescript': '// ',
            'java': '// ',
            'cpp': '// ',
            'c': '// ',
            'csharp': '// ',
            'go': '// ',
            'rust': '// ',
            'php': '// ',
            'sql': '-- ',
            'html': '<!-- ',
            'xml': '<!-- ',
            'css': '/* ',
            'scss': '// ',
            'sass': '// ',
            'batch': 'REM ',
            'powershell': '# ',
            'markdown': '<!-- '
        };

        return commentMap[language] || '# ';
    }

    /**
     * Check if a value appears to be a constant (literal value)
     * Used for symbol classification in various parsers
     */
    static isConstantValue(value: string): boolean {
        if (!value) return false;
        
        const trimmed = value.trim();
        
        // Numbers (integer or float)
        if (/^\d+(\.\d+)?$/.test(trimmed)) return true;
        
        // Strings (quoted)
        if (/^["'].*["']$/.test(trimmed)) return true;
        
        // Booleans
        if (/^(true|false|TRUE|FALSE|True|False)$/.test(trimmed)) return true;
        
        // Null/undefined values
        if (/^(null|NULL|undefined|None|nil|NA)$/.test(trimmed)) return true;
        
        // Arrays/objects (basic detection)
        if (/^[\[\{].*[\]\}]$/.test(trimmed)) return true;
        
        return false;
    }

    /**
     * Expand path with tilde (~) replacement
     * In browser environment, returns path as-is since we can't access home directory
     */
    static expandPath(path: string, workspaceRoot?: string): string {
        if (!path) return '';
        
        if (path.startsWith('~')) {
            // In browser environment, we can't access actual home directory
            // Use workspace root as fallback if provided
            if (workspaceRoot) {
                return path.replace('~', workspaceRoot);
            }
            // Return as-is if no workspace root available
            return path;
        }
        
        return path;
    }

    /**
     * Resolve file path to URI without fetching content
     * Uses the same resolution logic as resolveFile but only returns URI information
     */
    static async resolveFilePathToUri(filePath: string, context: {
        getAllOpenDocuments(): Promise<Array<{path: string, content: string, isSaved: boolean}>>;
        getCurrentWorkingDirectory(): Promise<string>;
        fileExists(path: string): Promise<boolean>;
        joinPath(base: string, ...parts: string[]): string;
    }): Promise<{found: boolean, uri?: URI, isFromEditor?: boolean, relativePath?: string}> {
        if (!filePath?.trim()) {
            return { found: false };
        }

        const trimmedPath = filePath.trim();

        // Rule 1: If an absolute path is given, use directly
        if (this.isAbsolutePath(trimmedPath)) {
            const exists = await context.fileExists(trimmedPath);
            if (!exists) {
                return { found: false };
            }

            const uri = URI.file(trimmedPath);

            // Check if open in editor first
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, trimmedPath)) {
                    return {
                        found: true,
                        uri,
                        isFromEditor: true,
                        relativePath: this.getRelativePath(trimmedPath, await context.getCurrentWorkingDirectory())
                    };
                }
            }

            // File exists on disk but not open
            return {
                found: true,
                uri,
                isFromEditor: false,
                relativePath: this.getRelativePath(trimmedPath, await context.getCurrentWorkingDirectory())
            };
        }

        // Rule 2: If a name with UNSAVED is given, use open unsaved documents
        if (trimmedPath.startsWith('__UNSAVED_')) {
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, trimmedPath) && !doc.isSaved) {
                    const uri = URI.parse(`untitled:${trimmedPath}`);
                    return {
                        found: true,
                        uri,
                        isFromEditor: true,
                        relativePath: trimmedPath
                    };
                }
            }
            return { found: false };
        }

        // Rule 3: If a relative path is given, check from current working directory
        if (this.isRelativePath(trimmedPath)) {
            const cwd = await context.getCurrentWorkingDirectory();
            const fullPath = context.joinPath(cwd, trimmedPath);
            const exists = await context.fileExists(fullPath);
            if (!exists) {
                return { found: false };
            }

            const uri = URI.file(fullPath);

            // Check if open in editor first
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, fullPath)) {
                    return {
                        found: true,
                        uri,
                        isFromEditor: true,
                        relativePath: trimmedPath
                    };
                }
            }

            // File exists on disk but not open
            return {
                found: true,
                uri,
                isFromEditor: false,
                relativePath: trimmedPath
            };
        }

        // Rule 4: If only a basename is given, check open documents and immediate working directory
        const targetBasename = this.getBasename(trimmedPath);
        if (targetBasename === trimmedPath) {
            // First check open documents
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                const docBasename = this.getBasename(doc.path);
                if (this.compareBasenames(docBasename, targetBasename)) {
                    const uri = doc.path.startsWith('untitled:') || doc.path.startsWith('__UNSAVED_') 
                        ? URI.parse(doc.path)
                        : URI.file(doc.path);
                    
                    return {
                        found: true,
                        uri,
                        isFromEditor: true,
                        relativePath: this.getRelativePath(doc.path, await context.getCurrentWorkingDirectory())
                    };
                }
            }

            // Then check immediate working directory (non-recursive)
            const cwd = await context.getCurrentWorkingDirectory();
            const fullPath = context.joinPath(cwd, targetBasename);
            const exists = await context.fileExists(fullPath);
            if (exists) {
                const uri = URI.file(fullPath);
                return {
                    found: true,
                    uri,
                    isFromEditor: false,
                    relativePath: targetBasename
                };
            }

            return { found: false };
        }

        // Invalid path format
        return { found: false };
    }

    /**
     * Resolve relative paths to absolute using workspace root
     */
    static resolvePath(path: string, workspaceRoot?: string): string {
        if (!path) return '';
        
        // Handle tilde expansion first
        const expandedPath = CommonUtils.expandPath(path, workspaceRoot);
        
        // If already absolute, return as-is
        if (expandedPath.startsWith('/') || /^[a-zA-Z]:/.test(expandedPath)) {
            return expandedPath;
        }
        
        // Make relative paths absolute using workspace root
        if (workspaceRoot && !expandedPath.startsWith('/') && !expandedPath.match(/^[a-zA-Z]:/)) {
            return `${workspaceRoot}/${expandedPath}`.replace(/\/+/g, '/');
        }
        
        return expandedPath;
    }

    /**
     * Format file size in human readable format
     * Returns formatted string with appropriate units
     */
    static formatFileSize(sizeInBytes: number): string {
        if (sizeInBytes === 0) return '0 bytes';
        
        const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(sizeInBytes) / Math.log(1024));
        const formattedSize = (sizeInBytes / Math.pow(1024, i)).toFixed(1);
        
        return `${formattedSize} ${sizes[i]}`;
    }

    /**
     * Join path components with proper separator handling
     */
    static joinPath(...components: string[]): string {
        if (components.length === 0) return '';
        
        return components
            .filter(component => component && component.length > 0)
            .join('/')
            .replace(/\/+/g, '/'); // Remove duplicate slashes
    }

    /**
     * Normalize path by removing redundant separators and resolving . and ..
     */
    static normalizePath(path: string): string {
        if (!path) return '';
        
        // Split by slash and filter out empty parts and dots
        const parts = path.split('/').filter(part => part !== '' && part !== '.');
        const normalized: string[] = [];
        
        for (const part of parts) {
            if (part === '..') {
                if (normalized.length > 0) {
                    normalized.pop();
                }
            } else {
                normalized.push(part);
            }
        }
        
        // Preserve leading slash for absolute paths
        const result = normalized.join('/');
        return path.startsWith('/') ? '/' + result : result;
    }

    /**
     * Check if a string is a programming language keyword
     */
    static isKeyword(word: string, language: string): boolean {
        const keywords: Record<string, string[]> = {
            javascript: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'class', 'interface', 'type', 'import', 'export', 'async', 'await'],
            typescript: ['function', 'var', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'class', 'interface', 'type', 'import', 'export', 'async', 'await'],
            python: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'return', 'yield', 'lambda', 'with', 'as', 'try', 'except'],
            r: ['function', 'if', 'else', 'for', 'while', 'repeat', 'next', 'break', 'library', 'require', 'TRUE', 'FALSE', 'NULL', 'NA'],
            java: ['public', 'private', 'protected', 'class', 'interface', 'if', 'else', 'for', 'while', 'return', 'static', 'final', 'void'],
            cpp: ['class', 'struct', 'if', 'else', 'for', 'while', 'return', 'const', 'static', 'public', 'private', 'protected', 'void'],
            csharp: ['public', 'private', 'protected', 'class', 'interface', 'if', 'else', 'for', 'while', 'return', 'static', 'readonly', 'void'],
            bash: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'until', 'do', 'done', 'case', 'esac', 'function'],
            sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'INDEX']
        };
        
        const langKeywords = keywords[language.toLowerCase()] || [];
        return langKeywords.includes(word);
    }

    /**
     * Generate a unique display name for a file path when there are conflicts
     */
    static getUniqueDisplayName(filePath: string, allPaths: string[]): string {
        const fileName = CommonUtils.getBasename(filePath);
        
        // Check if filename is unique
        const conflictingPaths = allPaths.filter(p => p !== filePath && CommonUtils.getBasename(p) === fileName);
        
        if (conflictingPaths.length === 0) {
            return fileName;
        }

        // If there are conflicts, include parent directory
        const parentDir = CommonUtils.getBasename(CommonUtils.getDirname(filePath));
        const displayName = `${parentDir}/${fileName}`;
        
        // Check if this is now unique
        const stillConflicting = allPaths.filter(p => 
            p !== filePath && 
            CommonUtils.getBasename(p) === fileName && 
            CommonUtils.getBasename(CommonUtils.getDirname(p)) === parentDir
        );

        if (stillConflicting.length === 0) {
            return displayName;
        }

        // If still conflicting, use full relative path
        return filePath;
    }
}