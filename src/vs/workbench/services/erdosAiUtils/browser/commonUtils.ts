/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICommonUtils } from '../common/commonUtils.js';

export class CommonUtils extends Disposable implements ICommonUtils {
    readonly _serviceBrand: undefined;

    constructor() {
        super();
    }
    
    getBasename(filePath: string): string {
        if (!filePath) return '';
        return filePath.split(/[/\\]/).pop() || filePath;
    }

    compareBasenames(basename1: string, basename2: string): boolean {
        if (!basename1 || !basename2) return false;
        
        const parts1 = this.splitNameAndExtension(basename1);
        const parts2 = this.splitNameAndExtension(basename2);
        
        return parts1.name === parts2.name && 
               parts1.extension.toLowerCase() === parts2.extension.toLowerCase();
    }

    splitNameAndExtension(filename: string): { name: string; extension: string } {
        if (!filename) return { name: '', extension: '' };
        
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1 || lastDot === 0) {
            return { name: filename, extension: '' };
        }
        
        return {
            name: filename.substring(0, lastDot),
            extension: filename.substring(lastDot + 1)
        };
    }

    comparePathsWithCaseInsensitiveExtensions(path1: string, path2: string): boolean {
        if (!path1 || !path2) return false;
        
        if (path1 === path2) return true;
        
        const basename1 = this.getBasename(path1);
        const basename2 = this.getBasename(path2);
        const dir1 = path1.substring(0, path1.length - basename1.length);
        const dir2 = path2.substring(0, path2.length - basename2.length);
        
        if (dir1 !== dir2) return false;
        
        return this.compareBasenames(basename1, basename2);
    }

    async resolveFile(
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
        
        const expandedPath = this.expandPath(trimmedPath);
        trimmedPath = expandedPath;

        if (this.isAbsolutePath(trimmedPath)) {
            const uri = URI.file(trimmedPath);
            const exists = await context.fileExists(trimmedPath);
            
            if (!exists) {
                return { found: false };
            }

            const openDocs = await context.getAllOpenDocuments();
            
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, trimmedPath)) {
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

        if (trimmedPath.startsWith('__UNSAVED_')) {
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, trimmedPath) && !doc.isSaved) {
                    const uri = URI.parse(`untitled:${trimmedPath}`);
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

        if (this.isRelativePath(trimmedPath)) {
            const cwd = await context.getCurrentWorkingDirectory();
            const fullPath = context.joinPath(cwd, trimmedPath);
            const exists = await context.fileExists(fullPath);
            if (!exists) {
                return { found: false };
            }

            const uri = URI.file(fullPath);

            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                if (this.comparePathsWithCaseInsensitiveExtensions(doc.path, fullPath)) {
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

            const content = await context.getFileContent(uri);
            return {
                found: true,
                uri,
                content: content,
                isFromEditor: false,
                relativePath: trimmedPath
            };
        }

        const targetBasename = this.getBasename(trimmedPath);
        if (targetBasename === trimmedPath) {
            const openDocs = await context.getAllOpenDocuments();
            for (const doc of openDocs) {
                const docBasename = this.getBasename(doc.path);
                if (this.compareBasenames(docBasename, targetBasename)) {
                    const uri = doc.path.startsWith('untitled:') || doc.path.startsWith('__UNSAVED_') 
                        ? URI.parse(doc.path)
                        : URI.file(doc.path);
                    
                    if (uri.path.endsWith('.ipynb')) {
                        return {
                            found: true,
                            uri,
                            content: doc.content,
                            isFromEditor: true,
                            relativePath: this.getRelativePath(doc.path, await context.getCurrentWorkingDirectory())
                        };
                    } else {
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

        return { found: false };
    }

    isAbsolutePath(path: string): boolean {
        if (path.startsWith('/')) return true;
        if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
        if (path.startsWith('\\\\')) return true;
        return false;
    }

    isRelativePath(path: string): boolean {
        if (this.isAbsolutePath(path)) return false;
        return path.includes('/') || path.includes('\\');
    }

    getRelativePath(absolutePath: string, baseDir: string): string {
        if (!this.isAbsolutePath(absolutePath)) return absolutePath;
        
        const normalizedAbs = absolutePath.replace(/\\/g, '/');
        const normalizedBase = baseDir.replace(/\\/g, '/');
        
        if (normalizedAbs.startsWith(normalizedBase)) {
            let relative = normalizedAbs.substring(normalizedBase.length);
            if (relative.startsWith('/')) relative = relative.substring(1);
            return relative || '.';
        }
        
        return absolutePath;
    }

    getDirname(filePath: string): string {
        if (!filePath) return '';
        const parts = filePath.split(/[/\\]/);
        parts.pop();
        return parts.join('/') || '/';
    }

    getFileExtension(filePath: string): string {
        if (!filePath) return '';
        const basename = this.getBasename(filePath);
        const lastDot = basename.lastIndexOf('.');
        return lastDot !== -1 ? basename.substring(lastDot + 1) : '';
    }

    detectLanguage(filePath: string): string {
        const extension = this.getFileExtension(filePath).toLowerCase();
        
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

    getCommentSyntax(filePath: string): string {
        const language = this.detectLanguage(filePath);
        
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



    expandPath(path: string, workspaceRoot?: string): string {
        if (!path) return '';
        
        if (path.startsWith('~')) {
            if (workspaceRoot) {
                return path.replace('~', workspaceRoot);
            }
            return path;
        }
        
        return path;
    }

    async resolveFilePathToUri(filePath: string, context: {
        getAllOpenDocuments(): Promise<Array<{path: string, content: string, isSaved: boolean}>>;
        getCurrentWorkingDirectory(): Promise<string>;
        fileExists(path: string): Promise<boolean>;
        joinPath(base: string, ...parts: string[]): string;
    }): Promise<{found: boolean, uri?: URI, isFromEditor?: boolean, relativePath?: string}> {
        if (!filePath?.trim()) {
            return { found: false };
        }

        const trimmedPath = filePath.trim();

        if (this.isAbsolutePath(trimmedPath)) {
            const exists = await context.fileExists(trimmedPath);
            if (!exists) {
                return { found: false };
            }

            const uri = URI.file(trimmedPath);

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

            return {
                found: true,
                uri,
                isFromEditor: false,
                relativePath: this.getRelativePath(trimmedPath, await context.getCurrentWorkingDirectory())
            };
        }

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

        if (this.isRelativePath(trimmedPath)) {
            const cwd = await context.getCurrentWorkingDirectory();
            const fullPath = context.joinPath(cwd, trimmedPath);
            const exists = await context.fileExists(fullPath);
            if (!exists) {
                return { found: false };
            }

            const uri = URI.file(fullPath);

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

            return {
                found: true,
                uri,
                isFromEditor: false,
                relativePath: trimmedPath
            };
        }

        const targetBasename = this.getBasename(trimmedPath);
        if (targetBasename === trimmedPath) {
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

        return { found: false };
    }

    resolvePath(path: string, workspaceRoot?: string): string {
        if (!path) return '';
        
        const expandedPath = this.expandPath(path, workspaceRoot);
        
        if (expandedPath.startsWith('/') || /^[a-zA-Z]:/.test(expandedPath)) {
            return expandedPath;
        }
        
        if (workspaceRoot && !expandedPath.startsWith('/') && !expandedPath.match(/^[a-zA-Z]:/)) {
            return `${workspaceRoot}/${expandedPath}`.replace(/\/+/g, '/');
        }
        
        return expandedPath;
    }

    formatFileSize(sizeInBytes: number): string {
        if (sizeInBytes === 0) return '0 bytes';
        
        const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(sizeInBytes) / Math.log(1024));
        const formattedSize = (sizeInBytes / Math.pow(1024, i)).toFixed(1);
        
        return `${formattedSize} ${sizes[i]}`;
    }

    joinPath(...components: string[]): string {
        if (components.length === 0) return '';
        
        return components
            .filter(component => component && component.length > 0)
            .join('/')
            .replace(/\/+/g, '/');
    }

    normalizePath(path: string): string {
        if (!path) return '';
        
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
        
        const result = normalized.join('/');
        return path.startsWith('/') ? '/' + result : result;
    }

    isKeyword(word: string, language: string): boolean {
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

    getUniqueDisplayName(filePath: string, allPaths: string[]): string {
        const fileName = this.getBasename(filePath);
        
        const conflictingPaths = allPaths.filter(p => p !== filePath && this.getBasename(p) === fileName);
        
        if (conflictingPaths.length === 0) {
            return fileName;
        }

        const parentDir = this.getBasename(this.getDirname(filePath));
        const displayName = `${parentDir}/${fileName}`;
        
        const stillConflicting = allPaths.filter(p => 
            p !== filePath && 
            this.getBasename(p) === fileName && 
            this.getBasename(this.getDirname(p)) === parentDir
        );

        if (stillConflicting.length === 0) {
            return displayName;
        }

        return filePath;
    }
}
