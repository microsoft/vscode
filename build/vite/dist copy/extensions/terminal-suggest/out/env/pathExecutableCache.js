"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathExecutableCache = void 0;
const fs = __importStar(require("fs/promises"));
const vscode = __importStar(require("vscode"));
const executable_1 = require("../helpers/executable");
const os_1 = require("../helpers/os");
const uri_1 = require("../helpers/uri");
const isWindows = (0, os_1.osIsWindows)();
class PathExecutableCache {
    _disposables = [];
    _windowsExecutableExtensionsCache;
    _cachedExes = new Map();
    _inProgressRequest;
    constructor() {
        if (isWindows) {
            this._windowsExecutableExtensionsCache = new executable_1.WindowsExecutableExtensionsCache(this._getConfiguredWindowsExecutableExtensions());
            this._disposables.push(vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration("terminal.integrated.suggest.windowsExecutableExtensions" /* SettingsIds.CachedWindowsExecutableExtensions */)) {
                    this._windowsExecutableExtensionsCache?.update(this._getConfiguredWindowsExecutableExtensions());
                    this._cachedExes.clear();
                }
            }));
        }
    }
    dispose() {
        for (const d of this._disposables) {
            d.dispose();
        }
    }
    refresh(directory) {
        if (directory) {
            this._cachedExes.delete(directory);
        }
        else {
            this._cachedExes.clear();
        }
    }
    async getExecutablesInPath(env = process.env, shellType) {
        if (this._inProgressRequest &&
            this._inProgressRequest.env === env &&
            this._inProgressRequest.shellType === shellType) {
            return this._inProgressRequest.promise;
        }
        const promise = this._doGetExecutablesInPath(env, shellType);
        this._inProgressRequest = {
            env,
            shellType,
            promise,
        };
        await promise;
        this._inProgressRequest = undefined;
        return promise;
    }
    async _doGetExecutablesInPath(env, shellType) {
        // Create cache key
        let pathValue;
        if (shellType === "gitbash" /* TerminalShellType.GitBash */) {
            // TODO: figure out why shellIntegration.env.PATH
            // regressed from using \ to / (correct)
            pathValue = process.env.PATH;
        }
        else if (isWindows) {
            const caseSensitivePathKey = Object.keys(env).find(key => key.toLowerCase() === 'path');
            if (caseSensitivePathKey) {
                pathValue = env[caseSensitivePathKey];
            }
        }
        else {
            pathValue = env.PATH;
        }
        if (pathValue === undefined) {
            return;
        }
        // Extract executables from PATH
        const paths = pathValue.split(isWindows ? ';' : ':');
        const pathSeparator = isWindows ? '\\' : '/';
        const promisePaths = [];
        const promises = [];
        const labels = new Set();
        for (const pathDir of paths) {
            // Check if this directory is already cached
            const cachedExecutables = this._cachedExes.get(pathDir);
            if (cachedExecutables) {
                for (const executable of cachedExecutables) {
                    const labelText = typeof executable.label === 'string' ? executable.label : executable.label.label;
                    labels.add(labelText);
                }
            }
            else {
                // Not cached, need to scan this directory
                promisePaths.push(pathDir);
                promises.push(this._getExecutablesInSinglePath(pathDir, pathSeparator, labels));
            }
        }
        // Process uncached directories
        if (promises.length > 0) {
            const resultSets = await Promise.all(promises);
            for (const [i, resultSet] of resultSets.entries()) {
                const pathDir = promisePaths[i];
                if (!this._cachedExes.has(pathDir)) {
                    this._cachedExes.set(pathDir, resultSet || new Set());
                }
            }
        }
        // Merge all results from all directories
        const executables = new Set();
        const processedPaths = new Set();
        for (const pathDir of paths) {
            if (processedPaths.has(pathDir)) {
                continue;
            }
            processedPaths.add(pathDir);
            const dirExecutables = this._cachedExes.get(pathDir);
            if (dirExecutables) {
                for (const executable of dirExecutables) {
                    executables.add(executable);
                }
            }
        }
        return { completionResources: executables, labels };
    }
    async _getExecutablesInSinglePath(path, pathSeparator, labels) {
        try {
            const dirExists = await fs.stat(path).then(stat => stat.isDirectory()).catch(() => false);
            if (!dirExists) {
                return undefined;
            }
            const result = new Set();
            const fileResource = vscode.Uri.file(path);
            const files = await vscode.workspace.fs.readDirectory(fileResource);
            const windowsExecutableExtensions = this._windowsExecutableExtensionsCache?.getExtensions();
            await Promise.all(files.map(([file, fileType]) => (async () => {
                let kind;
                let formattedPath;
                const resource = vscode.Uri.joinPath(fileResource, file);
                // Skip unknown or directory file types early
                if (fileType === vscode.FileType.Unknown || fileType === vscode.FileType.Directory) {
                    return;
                }
                try {
                    const lstat = await fs.lstat(resource.fsPath);
                    if (lstat.isSymbolicLink()) {
                        try {
                            const symlinkRealPath = await fs.realpath(resource.fsPath);
                            const isExec = await (0, executable_1.isExecutable)(symlinkRealPath, windowsExecutableExtensions);
                            if (!isExec) {
                                return;
                            }
                            kind = vscode.TerminalCompletionItemKind.Method;
                            formattedPath = `${resource.fsPath} -> ${symlinkRealPath}`;
                        }
                        catch {
                            return;
                        }
                    }
                }
                catch {
                    // Ignore errors for unreadable files
                    return;
                }
                formattedPath = formattedPath ?? (0, uri_1.getFriendlyResourcePath)(resource, pathSeparator);
                // Check if already added or not executable
                if (labels.has(file)) {
                    return;
                }
                const isExec = kind === vscode.TerminalCompletionItemKind.Method || await (0, executable_1.isExecutable)(resource.fsPath, windowsExecutableExtensions);
                if (!isExec) {
                    return;
                }
                result.add({
                    label: file,
                    documentation: formattedPath,
                    kind: kind ?? vscode.TerminalCompletionItemKind.Method
                });
                labels.add(file);
            })()));
            return result;
        }
        catch (e) {
            // Ignore errors for directories that can't be read
            return undefined;
        }
    }
    _getConfiguredWindowsExecutableExtensions() {
        return vscode.workspace.getConfiguration("terminal.integrated.suggest" /* SettingsIds.SuggestPrefix */).get("windowsExecutableExtensions" /* SettingsIds.CachedWindowsExecutableExtensionsSuffixOnly */);
    }
}
exports.PathExecutableCache = PathExecutableCache;
//# sourceMappingURL=pathExecutableCache.js.map