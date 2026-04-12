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
exports.FileWatcherManager = void 0;
const vscode = __importStar(require("vscode"));
const vscode_uri_1 = require("vscode-uri");
const schemes_1 = require("../configuration/schemes");
const dispose_1 = require("../utils/dispose");
const resourceMap_1 = require("../utils/resourceMap");
class FileWatcherManager {
    logger;
    _fileWatchers = new Map();
    _dirWatchers = new resourceMap_1.ResourceMap(uri => uri.toString(), { onCaseInsensitiveFileSystem: false });
    constructor(logger) {
        this.logger = logger;
    }
    dispose() {
        for (const entry of this._fileWatchers.values()) {
            entry.watcher.dispose();
        }
        this._fileWatchers.clear();
        for (const entry of this._dirWatchers.values()) {
            entry.watcher.dispose();
        }
        this._dirWatchers.clear();
    }
    create(id, uri, watchParentDirs, isRecursive, listeners) {
        this.logger.trace(`Creating file watcher for ${uri.toString()}`);
        // Non-writable file systems do not support file watching
        if (!vscode.workspace.fs.isWritableFileSystem(uri.scheme)) {
            return;
        }
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, isRecursive ? '**' : '*'), !listeners.create, !listeners.change, !listeners.delete);
        const parentDirWatchers = [];
        this._fileWatchers.set(id, { uri, watcher, dirWatchers: parentDirWatchers });
        if (listeners.create) {
            watcher.onDidCreate(listeners.create);
        }
        if (listeners.change) {
            watcher.onDidChange(listeners.change);
        }
        if (listeners.delete) {
            watcher.onDidDelete(listeners.delete);
        }
        if (watchParentDirs && uri.scheme !== schemes_1.Schemes.untitled) {
            // We need to watch the parent directories too for when these are deleted / created
            for (let dirUri = vscode_uri_1.Utils.dirname(uri); dirUri.path.length > 1; dirUri = vscode_uri_1.Utils.dirname(dirUri)) {
                const disposables = [];
                let parentDirWatcher = this._dirWatchers.get(dirUri);
                if (!parentDirWatcher) {
                    this.logger.trace(`Creating parent dir watcher for ${dirUri.toString()}`);
                    const glob = new vscode.RelativePattern(vscode_uri_1.Utils.dirname(dirUri), vscode_uri_1.Utils.basename(dirUri));
                    const parentWatcher = vscode.workspace.createFileSystemWatcher(glob, !listeners.create, true, !listeners.delete);
                    parentDirWatcher = { uri: dirUri, refCount: 0, watcher: parentWatcher };
                    this._dirWatchers.set(dirUri, parentDirWatcher);
                }
                parentDirWatcher.refCount++;
                if (listeners.create) {
                    disposables.push(parentDirWatcher.watcher.onDidCreate(async () => {
                        // Just because the parent dir was created doesn't mean our file was created
                        try {
                            const stat = await vscode.workspace.fs.stat(uri);
                            if (stat.type === vscode.FileType.File) {
                                listeners.create(uri);
                            }
                        }
                        catch {
                            // Noop
                        }
                    }));
                }
                if (listeners.delete) {
                    // When the parent dir is deleted, consider our file deleted too
                    // TODO: this fires if the file previously did not exist and then the parent is deleted
                    disposables.push(parentDirWatcher.watcher.onDidDelete(listeners.delete));
                }
                parentDirWatchers.push({ uri: dirUri, disposables });
            }
        }
    }
    delete(id) {
        const entry = this._fileWatchers.get(id);
        if (entry) {
            this.logger.trace(`Deleting file watcher for ${entry.uri}`);
            for (const dirWatcher of entry.dirWatchers) {
                (0, dispose_1.disposeAll)(dirWatcher.disposables);
                const dirWatcherEntry = this._dirWatchers.get(dirWatcher.uri);
                if (dirWatcherEntry) {
                    if (--dirWatcherEntry.refCount <= 0) {
                        this.logger.trace(`Deleting parent dir ${dirWatcherEntry.uri}`);
                        dirWatcherEntry.watcher.dispose();
                        this._dirWatchers.delete(dirWatcher.uri);
                    }
                }
            }
            entry.watcher.dispose();
        }
        this._fileWatchers.delete(id);
    }
}
exports.FileWatcherManager = FileWatcherManager;
//# sourceMappingURL=fileWatchingManager.js.map