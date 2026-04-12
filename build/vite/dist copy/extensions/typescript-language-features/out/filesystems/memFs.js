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
exports.MemFs = void 0;
const path_1 = require("path");
const vscode = __importStar(require("vscode"));
class MemFs {
    id;
    logger;
    root = new FsDirectoryEntry(new Map(), 0, 0);
    constructor(id, logger) {
        this.id = id;
        this.logger = logger;
    }
    stat(uri) {
        this.logger.trace(`MemFs.stat ${this.id}. uri: ${uri}`);
        const entry = this.getEntry(uri);
        if (!entry) {
            throw vscode.FileSystemError.FileNotFound();
        }
        return entry;
    }
    readDirectory(uri) {
        this.logger.trace(`MemFs.readDirectory ${this.id}. uri: ${uri}`);
        const entry = this.getEntry(uri);
        if (!entry) {
            throw vscode.FileSystemError.FileNotFound();
        }
        if (!(entry instanceof FsDirectoryEntry)) {
            throw vscode.FileSystemError.FileNotADirectory();
        }
        return Array.from(entry.contents.entries(), ([name, entry]) => [name, entry.type]);
    }
    readFile(uri) {
        this.logger.trace(`MemFs.readFile ${this.id}. uri: ${uri}`);
        const entry = this.getEntry(uri);
        if (!entry) {
            throw vscode.FileSystemError.FileNotFound();
        }
        if (!(entry instanceof FsFileEntry)) {
            throw vscode.FileSystemError.FileIsADirectory(uri);
        }
        return entry.data;
    }
    writeFile(uri, content, { create, overwrite }) {
        this.logger.trace(`MemFs.writeFile ${this.id}. uri: ${uri}`);
        const dir = this.getParent(uri);
        const fileName = (0, path_1.basename)(uri.path);
        const dirContents = dir.contents;
        const time = Date.now() / 1000;
        const entry = dirContents.get((0, path_1.basename)(uri.path));
        if (!entry) {
            if (create) {
                dirContents.set(fileName, new FsFileEntry(content, time, time));
                this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
            }
            else {
                throw vscode.FileSystemError.FileNotFound();
            }
        }
        else {
            if (entry instanceof FsDirectoryEntry) {
                throw vscode.FileSystemError.FileIsADirectory(uri);
            }
            if (overwrite) {
                entry.mtime = time;
                entry.data = content;
                this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
            }
            else {
                throw vscode.FileSystemError.NoPermissions('overwrite option was not passed in');
            }
        }
    }
    rename(_oldUri, _newUri, _options) {
        throw new Error('not implemented');
    }
    delete(uri) {
        try {
            const dir = this.getParent(uri);
            dir.contents.delete((0, path_1.basename)(uri.path));
            this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
        }
        catch (e) { }
    }
    createDirectory(uri) {
        this.logger.trace(`MemFs.createDirectory ${this.id}. uri: ${uri}`);
        const dir = this.getParent(uri);
        const now = Date.now() / 1000;
        dir.contents.set((0, path_1.basename)(uri.path), new FsDirectoryEntry(new Map(), now, now));
    }
    getEntry(uri) {
        // TODO: have this throw FileNotFound itself?
        // TODO: support configuring case sensitivity
        let node = this.root;
        for (const component of uri.path.split('/')) {
            if (!component) {
                // Skip empty components (root, stuff between double slashes,
                // trailing slashes)
                continue;
            }
            if (!(node instanceof FsDirectoryEntry)) {
                // We're looking at a File or such, so bail.
                return;
            }
            const next = node.contents.get(component);
            if (!next) {
                // not found!
                return;
            }
            node = next;
        }
        return node;
    }
    getParent(uri) {
        const dir = this.getEntry(uri.with({ path: (0, path_1.dirname)(uri.path) }));
        if (!dir) {
            throw vscode.FileSystemError.FileNotFound();
        }
        if (!(dir instanceof FsDirectoryEntry)) {
            throw vscode.FileSystemError.FileNotADirectory();
        }
        return dir;
    }
    // --- manage file events
    _emitter = new vscode.EventEmitter();
    onDidChangeFile = this._emitter.event;
    watchers = new Map;
    watch(resource) {
        if (!this.watchers.has(resource.path)) {
            this.watchers.set(resource.path, new Set());
        }
        const sy = Symbol(resource.path);
        return new vscode.Disposable(() => {
            const watcher = this.watchers.get(resource.path);
            if (watcher) {
                watcher.delete(sy);
                if (!watcher.size) {
                    this.watchers.delete(resource.path);
                }
            }
        });
    }
}
exports.MemFs = MemFs;
class FsFileEntry {
    data;
    ctime;
    mtime;
    type = vscode.FileType.File;
    get size() {
        return this.data.length;
    }
    constructor(data, ctime, mtime) {
        this.data = data;
        this.ctime = ctime;
        this.mtime = mtime;
    }
}
class FsDirectoryEntry {
    contents;
    ctime;
    mtime;
    type = vscode.FileType.Directory;
    get size() {
        return [...this.contents.values()].reduce((acc, entry) => acc + entry.size, 0);
    }
    constructor(contents, ctime, mtime) {
        this.contents = contents;
        this.ctime = ctime;
        this.mtime = mtime;
    }
}
//# sourceMappingURL=memFs.js.map