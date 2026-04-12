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
exports.AutoInstallerFs = void 0;
const ts_package_manager_1 = require("@vscode/ts-package-manager");
const path_1 = require("path");
const vscode = __importStar(require("vscode"));
const vscode_uri_1 = require("vscode-uri");
const dispose_1 = require("../utils/dispose");
const memFs_1 = require("./memFs");
const TEXT_DECODER = new TextDecoder('utf-8');
const TEXT_ENCODER = new TextEncoder();
class AutoInstallerFs extends dispose_1.Disposable {
    logger;
    memfs;
    packageManager;
    _projectCache = new Map();
    _emitter = this._register(new vscode.EventEmitter());
    onDidChangeFile = this._emitter.event;
    constructor(logger) {
        super();
        this.logger = logger;
        const memfs = new memFs_1.MemFs('auto-installer', logger);
        this.memfs = memfs;
        memfs.onDidChangeFile((e) => {
            this._emitter.fire(e.map(ev => ({
                type: ev.type,
                // TODO: we're gonna need a MappedUri dance...
                uri: ev.uri.with({ scheme: 'memfs' })
            })));
        });
        this.packageManager = new ts_package_manager_1.PackageManager({
            readDirectory(path, _extensions, _exclude, _include, _depth) {
                return memfs.readDirectory(vscode_uri_1.URI.file(path)).map(([name, _]) => name);
            },
            deleteFile(path) {
                memfs.delete(vscode_uri_1.URI.file(path));
            },
            createDirectory(path) {
                memfs.createDirectory(vscode_uri_1.URI.file(path));
            },
            writeFile(path, data, _writeByteOrderMark) {
                memfs.writeFile(vscode_uri_1.URI.file(path), TEXT_ENCODER.encode(data), { overwrite: true, create: true });
            },
            directoryExists(path) {
                try {
                    const stat = memfs.stat(vscode_uri_1.URI.file(path));
                    return stat.type === vscode.FileType.Directory;
                }
                catch (e) {
                    return false;
                }
            },
            readFile(path, _encoding) {
                try {
                    return TEXT_DECODER.decode(memfs.readFile(vscode_uri_1.URI.file(path)));
                }
                catch (e) {
                    return undefined;
                }
            }
        });
    }
    watch(resource) {
        this.logger.trace(`AutoInstallerFs.watch. Resource: ${resource.toString()}}`);
        return this.memfs.watch(resource);
    }
    async stat(uri) {
        this.logger.trace(`AutoInstallerFs.stat: ${uri}`);
        const mapped = new MappedUri(uri);
        // TODO: case sensitivity configuration
        // We pretend every single node_modules or @types directory ever actually
        // exists.
        if ((0, path_1.basename)(mapped.path) === 'node_modules' || (0, path_1.basename)(mapped.path) === '@types') {
            return {
                mtime: 0,
                ctime: 0,
                type: vscode.FileType.Directory,
                size: 0
            };
        }
        await this.ensurePackageContents(mapped);
        return this.memfs.stat(vscode_uri_1.URI.file(mapped.path));
    }
    async readDirectory(uri) {
        this.logger.trace(`AutoInstallerFs.readDirectory: ${uri}`);
        const mapped = new MappedUri(uri);
        await this.ensurePackageContents(mapped);
        return this.memfs.readDirectory(vscode_uri_1.URI.file(mapped.path));
    }
    async readFile(uri) {
        this.logger.trace(`AutoInstallerFs.readFile: ${uri}`);
        const mapped = new MappedUri(uri);
        await this.ensurePackageContents(mapped);
        return this.memfs.readFile(vscode_uri_1.URI.file(mapped.path));
    }
    writeFile(_uri, _content, _options) {
        throw new Error('not implemented');
    }
    rename(_oldUri, _newUri, _options) {
        throw new Error('not implemented');
    }
    delete(_uri) {
        throw new Error('not implemented');
    }
    createDirectory(_uri) {
        throw new Error('not implemented');
    }
    async ensurePackageContents(incomingUri) {
        // If we're not looking for something inside node_modules, bail early.
        if (!incomingUri.path.includes('node_modules')) {
            throw vscode.FileSystemError.FileNotFound();
        }
        // standard lib files aren't handled through here
        if (incomingUri.path.includes('node_modules/@typescript') || incomingUri.path.includes('node_modules/@types/typescript__')) {
            throw vscode.FileSystemError.FileNotFound();
        }
        const root = await this.getProjectRoot(incomingUri.original);
        if (!root) {
            return;
        }
        this.logger.trace(`AutoInstallerFs.ensurePackageContents. Path: ${incomingUri.path}, Root: ${root}`);
        const existingInstall = this._projectCache.get(root);
        if (existingInstall) {
            this.logger.trace(`AutoInstallerFs.ensurePackageContents. Found ongoing install for: ${root}/node_modules`);
            return existingInstall;
        }
        const installing = (async () => {
            let proj;
            try {
                proj = await this.packageManager.resolveProject(root, await this.getInstallOpts(incomingUri.original, root));
            }
            catch (e) {
                console.error(`failed to resolve project at ${incomingUri.path}: `, e);
                return;
            }
            try {
                await proj.restore();
            }
            catch (e) {
                console.error(`failed to restore package at ${incomingUri.path}: `, e);
            }
        })();
        this._projectCache.set(root, installing);
        await installing;
    }
    async getInstallOpts(originalUri, root) {
        const vsfs = vscode.workspace.fs;
        // We definitely need a package.json to be there.
        const pkgJson = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: (0, path_1.join)(root, 'package.json') })));
        let kdlLock;
        try {
            kdlLock = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: (0, path_1.join)(root, 'package-lock.kdl') })));
        }
        catch (e) { }
        let npmLock;
        try {
            npmLock = TEXT_DECODER.decode(await vsfs.readFile(originalUri.with({ path: (0, path_1.join)(root, 'package-lock.json') })));
        }
        catch (e) { }
        return {
            pkgJson,
            kdlLock,
            npmLock
        };
    }
    async getProjectRoot(incomingUri) {
        const vsfs = vscode.workspace.fs;
        const pkgPath = incomingUri.path.match(/^(.*?)\/node_modules/);
        const ret = pkgPath?.[1];
        if (!ret) {
            return;
        }
        try {
            await vsfs.stat(incomingUri.with({ path: (0, path_1.join)(ret, 'package.json') }));
            return ret;
        }
        catch (e) {
            return;
        }
    }
}
exports.AutoInstallerFs = AutoInstallerFs;
class MappedUri {
    raw;
    original;
    mapped;
    constructor(uri) {
        this.raw = uri;
        const parts = uri.path.match(/^\/([^\/]+)\/([^\/]*)(?:\/(.+))?$/);
        if (!parts) {
            throw new Error(`Invalid uri: ${uri.toString()}, ${uri.path}`);
        }
        const scheme = parts[1];
        const authority = parts[2] === 'ts-nul-authority' ? '' : parts[2];
        const path = parts[3];
        this.original = vscode_uri_1.URI.from({ scheme, authority, path: (path ? '/' + path : path) });
        this.mapped = this.original.with({ scheme: this.raw.scheme, authority: this.raw.authority });
    }
    get path() {
        return this.mapped.path;
    }
    get scheme() {
        return this.mapped.scheme;
    }
    get authority() {
        return this.mapped.authority;
    }
    get flatPath() {
        return (0, path_1.join)('/', this.scheme, this.authority, this.path);
    }
}
//# sourceMappingURL=autoInstallerFs.js.map