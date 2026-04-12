/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ExtHostConsumerFileSystem_1;
import { MainContext } from './extHost.protocol.js';
import * as files from '../../../platform/files/common/files.js';
import { FileSystemError } from './extHostTypes.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostFileSystemInfo } from './extHostFileSystemInfo.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceQueue } from '../../../base/common/async.js';
import { extUri, extUriIgnorePathCase } from '../../../base/common/resources.js';
import { Schemas } from '../../../base/common/network.js';
let ExtHostConsumerFileSystem = ExtHostConsumerFileSystem_1 = class ExtHostConsumerFileSystem {
    constructor(extHostRpc, fileSystemInfo) {
        this._fileSystemProvider = new Map();
        this._writeQueue = new ResourceQueue();
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadFileSystem);
        const that = this;
        this.value = Object.freeze({
            async stat(uri) {
                try {
                    let stat;
                    const provider = that._fileSystemProvider.get(uri.scheme);
                    if (provider) {
                        // use shortcut
                        await that._proxy.$ensureActivation(uri.scheme);
                        stat = await provider.impl.stat(uri);
                    }
                    else {
                        stat = await that._proxy.$stat(uri);
                    }
                    return {
                        type: stat.type,
                        ctime: stat.ctime,
                        mtime: stat.mtime,
                        size: stat.size,
                        permissions: stat.permissions === files.FilePermission.Readonly ? 1 : undefined
                    };
                }
                catch (err) {
                    ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async readDirectory(uri) {
                try {
                    const provider = that._fileSystemProvider.get(uri.scheme);
                    if (provider) {
                        // use shortcut
                        await that._proxy.$ensureActivation(uri.scheme);
                        return (await provider.impl.readDirectory(uri)).slice(); // safe-copy
                    }
                    else {
                        return await that._proxy.$readdir(uri);
                    }
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async createDirectory(uri) {
                try {
                    const provider = that._fileSystemProvider.get(uri.scheme);
                    if (provider && !provider.isReadonly) {
                        // use shortcut
                        await that._proxy.$ensureActivation(uri.scheme);
                        return await that.mkdirp(provider.impl, provider.extUri, uri);
                    }
                    else {
                        return await that._proxy.$mkdir(uri);
                    }
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async readFile(uri) {
                try {
                    const provider = that._fileSystemProvider.get(uri.scheme);
                    if (provider) {
                        // use shortcut
                        await that._proxy.$ensureActivation(uri.scheme);
                        return (await provider.impl.readFile(uri)).slice(); // safe-copy
                    }
                    else {
                        const buff = await that._proxy.$readFile(uri);
                        return buff.buffer;
                    }
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async writeFile(uri, content) {
                try {
                    const provider = that._fileSystemProvider.get(uri.scheme);
                    if (provider && !provider.isReadonly) {
                        // use shortcut
                        await that._proxy.$ensureActivation(uri.scheme);
                        await that.mkdirp(provider.impl, provider.extUri, provider.extUri.dirname(uri));
                        return await that._writeQueue.queueFor(uri, () => Promise.resolve(provider.impl.writeFile(uri, content, { create: true, overwrite: true })));
                    }
                    else {
                        return await that._proxy.$writeFile(uri, VSBuffer.wrap(content));
                    }
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async delete(uri, options) {
                try {
                    const provider = that._fileSystemProvider.get(uri.scheme);
                    if (provider && !provider.isReadonly && !options?.useTrash /* no shortcut: use trash */) {
                        // use shortcut
                        await that._proxy.$ensureActivation(uri.scheme);
                        return await provider.impl.delete(uri, { recursive: false, ...options });
                    }
                    else {
                        return await that._proxy.$delete(uri, { recursive: false, useTrash: false, atomic: false, ...options });
                    }
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async rename(oldUri, newUri, options) {
                try {
                    // no shortcut: potentially involves different schemes, does mkdirp
                    return await that._proxy.$rename(oldUri, newUri, { ...{ overwrite: false }, ...options });
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            async copy(source, destination, options) {
                try {
                    // no shortcut: potentially involves different schemes, does mkdirp
                    return await that._proxy.$copy(source, destination, { ...{ overwrite: false }, ...options });
                }
                catch (err) {
                    return ExtHostConsumerFileSystem_1._handleError(err);
                }
            },
            isWritableFileSystem(scheme) {
                const capabilities = fileSystemInfo.getCapabilities(scheme);
                if (typeof capabilities === 'number') {
                    return !(capabilities & 2048 /* files.FileSystemProviderCapabilities.Readonly */);
                }
                return undefined;
            }
        });
    }
    async mkdirp(provider, providerExtUri, directory) {
        const directoriesToCreate = [];
        while (!providerExtUri.isEqual(directory, providerExtUri.dirname(directory))) {
            try {
                const stat = await provider.stat(directory);
                if ((stat.type & files.FileType.Directory) === 0) {
                    throw FileSystemError.FileExists(`Unable to create folder '${directory.scheme === Schemas.file ? directory.fsPath : directory.toString(true)}' that already exists but is not a directory`);
                }
                break; // we have hit a directory that exists -> good
            }
            catch (error) {
                if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileNotFound) {
                    throw error;
                }
                // further go up and remember to create this directory
                directoriesToCreate.push(providerExtUri.basename(directory));
                directory = providerExtUri.dirname(directory);
            }
        }
        for (let i = directoriesToCreate.length - 1; i >= 0; i--) {
            directory = providerExtUri.joinPath(directory, directoriesToCreate[i]);
            try {
                await provider.createDirectory(directory);
            }
            catch (error) {
                if (files.toFileSystemProviderErrorCode(error) !== files.FileSystemProviderErrorCode.FileExists) {
                    // For mkdirp() we tolerate that the mkdir() call fails
                    // in case the folder already exists. This follows node.js
                    // own implementation of fs.mkdir({ recursive: true }) and
                    // reduces the chances of race conditions leading to errors
                    // if multiple calls try to create the same folders
                    // As such, we only throw an error here if it is other than
                    // the fact that the file already exists.
                    // (see also https://github.com/microsoft/vscode/issues/89834)
                    throw error;
                }
            }
        }
    }
    static _handleError(err) {
        // desired error type
        if (err instanceof FileSystemError) {
            throw err;
        }
        // file system provider error
        if (err instanceof files.FileSystemProviderError) {
            switch (err.code) {
                case files.FileSystemProviderErrorCode.FileExists: throw FileSystemError.FileExists(err.message);
                case files.FileSystemProviderErrorCode.FileNotFound: throw FileSystemError.FileNotFound(err.message);
                case files.FileSystemProviderErrorCode.FileNotADirectory: throw FileSystemError.FileNotADirectory(err.message);
                case files.FileSystemProviderErrorCode.FileIsADirectory: throw FileSystemError.FileIsADirectory(err.message);
                case files.FileSystemProviderErrorCode.NoPermissions: throw FileSystemError.NoPermissions(err.message);
                case files.FileSystemProviderErrorCode.Unavailable: throw FileSystemError.Unavailable(err.message);
                default: throw new FileSystemError(err.message, err.name);
            }
        }
        // generic error
        if (!(err instanceof Error)) {
            throw new FileSystemError(String(err));
        }
        // no provider (unknown scheme) error
        if (err.name === 'ENOPRO' || err.message.includes('ENOPRO')) {
            throw FileSystemError.Unavailable(err.message);
        }
        // file system error
        switch (err.name) {
            case files.FileSystemProviderErrorCode.FileExists: throw FileSystemError.FileExists(err.message);
            case files.FileSystemProviderErrorCode.FileNotFound: throw FileSystemError.FileNotFound(err.message);
            case files.FileSystemProviderErrorCode.FileNotADirectory: throw FileSystemError.FileNotADirectory(err.message);
            case files.FileSystemProviderErrorCode.FileIsADirectory: throw FileSystemError.FileIsADirectory(err.message);
            case files.FileSystemProviderErrorCode.NoPermissions: throw FileSystemError.NoPermissions(err.message);
            case files.FileSystemProviderErrorCode.Unavailable: throw FileSystemError.Unavailable(err.message);
            default: throw new FileSystemError(err.message, err.name);
        }
    }
    // ---
    addFileSystemProvider(scheme, provider, options) {
        this._fileSystemProvider.set(scheme, { impl: provider, extUri: options?.isCaseSensitive ? extUri : extUriIgnorePathCase, isReadonly: !!options?.isReadonly });
        return toDisposable(() => this._fileSystemProvider.delete(scheme));
    }
    getFileSystemProviderExtUri(scheme) {
        return this._fileSystemProvider.get(scheme)?.extUri ?? extUri;
    }
};
ExtHostConsumerFileSystem = ExtHostConsumerFileSystem_1 = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostFileSystemInfo)
], ExtHostConsumerFileSystem);
export { ExtHostConsumerFileSystem };
export const IExtHostConsumerFileSystem = createDecorator('IExtHostConsumerFileSystem');
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdEZpbGVTeXN0ZW1Db25zdW1lci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RGaWxlU3lzdGVtQ29uc3VtZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxXQUFXLEVBQTZCLE1BQU0sdUJBQXVCLENBQUM7QUFFL0UsT0FBTyxLQUFLLEtBQUssTUFBTSx5Q0FBeUMsQ0FBQztBQUNqRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDcEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQzFELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMxRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUNwRSxPQUFPLEVBQWUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUUsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQzlELE9BQU8sRUFBVyxNQUFNLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMxRixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFHbkQsSUFBTSx5QkFBeUIsaUNBQS9CLE1BQU0seUJBQXlCO0lBV3JDLFlBQ3FCLFVBQThCLEVBQzFCLGNBQXNDO1FBTjlDLHdCQUFtQixHQUFHLElBQUksR0FBRyxFQUFxRixDQUFDO1FBRW5ILGdCQUFXLEdBQUcsSUFBSSxhQUFhLEVBQUUsQ0FBQztRQU1sRCxJQUFJLENBQUMsTUFBTSxHQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxD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