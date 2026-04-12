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
var MainThreadFileSystem_1;
import { Emitter, Event } from '../../../base/common/event.js';
import { toDisposable, DisposableStore, DisposableMap } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { IFileService, FileType, FileOperationError, FileSystemProviderErrorCode, FilePermission, toFileSystemProviderErrorCode } from '../../../platform/files/common/files.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { VSBuffer } from '../../../base/common/buffer.js';
let MainThreadFileSystem = MainThreadFileSystem_1 = class MainThreadFileSystem {
    constructor(extHostContext, _fileService) {
        this._fileService = _fileService;
        this._fileProvider = new DisposableMap();
        this._disposables = new DisposableStore();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystem);
        const infoProxy = extHostContext.getProxy(ExtHostContext.ExtHostFileSystemInfo);
        for (const entry of _fileService.listCapabilities()) {
            infoProxy.$acceptProviderInfos(URI.from({ scheme: entry.scheme, path: '/dummy' }), entry.capabilities);
        }
        this._disposables.add(_fileService.onDidChangeFileSystemProviderRegistrations(e => infoProxy.$acceptProviderInfos(URI.from({ scheme: e.scheme, path: '/dummy' }), e.provider?.capabilities ?? null)));
        this._disposables.add(_fileService.onDidChangeFileSystemProviderCapabilities(e => infoProxy.$acceptProviderInfos(URI.from({ scheme: e.scheme, path: '/dummy' }), e.provider.capabilities)));
    }
    dispose() {
        this._disposables.dispose();
        this._fileProvider.dispose();
    }
    async $registerFileSystemProvider(handle, scheme, capabilities, readonlyMessage) {
        this._fileProvider.set(handle, new RemoteFileSystemProvider(this._fileService, scheme, capabilities, readonlyMessage, handle, this._proxy));
    }
    $unregisterProvider(handle) {
        this._fileProvider.deleteAndDispose(handle);
    }
    $onFileSystemChange(handle, changes) {
        const fileProvider = this._fileProvider.get(handle);
        if (!fileProvider) {
            throw new Error('Unknown file provider');
        }
        fileProvider.$onFileSystemChange(changes);
    }
    // --- consumer fs, vscode.workspace.fs
    async $stat(uri) {
        try {
            const stat = await this._fileService.stat(URI.revive(uri));
            return {
                ctime: stat.ctime,
                mtime: stat.mtime,
                size: stat.size,
                permissions: stat.readonly ? FilePermission.Readonly : undefined,
                type: MainThreadFileSystem_1._asFileType(stat)
            };
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    async $readdir(uri) {
        try {
            const stat = await this._fileService.resolve(URI.revive(uri), { resolveMetadata: false });
            if (!stat.isDirectory) {
                const err = new Error(stat.name);
                err.name = FileSystemProviderErrorCode.FileNotADirectory;
                throw err;
            }
            return !stat.children ? [] : stat.children.map(child => [child.name, MainThreadFileSystem_1._asFileType(child)]);
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    static _asFileType(stat) {
        let res = 0;
        if (stat.isFile) {
            res += FileType.File;
        }
        else if (stat.isDirectory) {
            res += FileType.Directory;
        }
        if (stat.isSymbolicLink) {
            res += FileType.SymbolicLink;
        }
        return res;
    }
    async $readFile(uri) {
        try {
            const file = await this._fileService.readFile(URI.revive(uri));
            return file.value;
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    async $writeFile(uri, content) {
        try {
            await this._fileService.writeFile(URI.revive(uri), content);
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    async $rename(source, target, opts) {
        try {
            await this._fileService.move(URI.revive(source), URI.revive(target), opts.overwrite);
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    async $copy(source, target, opts) {
        try {
            await this._fileService.copy(URI.revive(source), URI.revive(target), opts.overwrite);
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    async $mkdir(uri) {
        try {
            await this._fileService.createFolder(URI.revive(uri));
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    async $delete(uri, opts) {
        try {
            return await this._fileService.del(URI.revive(uri), opts);
        }
        catch (err) {
            return MainThreadFileSystem_1._handleError(err);
        }
    }
    static _handleError(err) {
        if (err instanceof FileOperationError) {
            switch (err.fileOperationResult) {
                case 1 /* FileOperationResult.FILE_NOT_FOUND */:
                    err.name = FileSystemProviderErrorCode.FileNotFound;
                    break;
                case 0 /* FileOperationResult.FILE_IS_DIRECTORY */:
                    err.name = FileSystemProviderErrorCode.FileIsADirectory;
                    break;
                case 6 /* FileOperationResult.FILE_PERMISSION_DENIED */:
                    err.name = FileSystemProviderErrorCode.NoPermissions;
                    break;
                case 4 /* FileOperationResult.FILE_MOVE_CONFLICT */:
                    err.name = FileSystemProviderErrorCode.FileExists;
                    break;
            }
        }
        else if (err instanceof Error) {
            const code = toFileSystemProviderErrorCode(err);
            if (code !== FileSystemProviderErrorCode.Unknown) {
                err.name = code;
            }
        }
        throw err;
    }
    $ensureActivation(scheme) {
        return this._fileService.activateProvider(scheme);
    }
};
MainThreadFileSystem = MainThreadFileSystem_1 = __decorate([
    extHostNamedCustomer(MainContext.MainThreadFileSystem),
    __param(1, IFileService)
], MainThreadFileSystem);
export { MainThreadFileSystem };
class RemoteFileSystemProvider {
    constructor(fileService, scheme, capabilities, readOnlyMessage, _handle, _proxy) {
        this.readOnlyMessage = readOnlyMessage;
        this._handle = _handle;
        this._proxy = _proxy;
        this._onDidChange = new Emitter();
        this.onDidChangeFile = this._onDidChange.event;
        this.onDidChangeCapabilities = Event.None;
        this.capabilities = capabilities;
        this._registration = fileService.registerProvider(scheme, this);
    }
    dispose() {
        this._registration.dispose();
        this._onDidChange.dispose();
    }
    watch(resource, opts) {
        const session = Math.random();
        this._proxy.$watch(this._handle, session, resource, opts);
        return toDisposable(() => {
            this._proxy.$unwatch(this._handle, session);
        });
    }
    $onFileSystemChange(changes) {
        this._onDidChange.fire(changes.map(RemoteFileSystemProvider._createFileChange));
    }
    static _createFileChange(dto) {
        return { resource: URI.revive(dto.resource), type: dto.type };
    }
    // --- forwarding calls
    async stat(resource) {
        try {
            return await this._proxy.$stat(this._handle, resource);
        }
        catch (err) {
            throw err;
        }
    }
    async readFile(resource) {
        const buffer = await this._proxy.$readFile(this._handle, resource);
        return buffer.buffer;
    }
    writeFile(resource, content, opts) {
        return this._proxy.$writeFile(this._handle, resource, VSBuffer.wrap(content), opts);
    }
    delete(resource, opts) {
        return this._proxy.$delete(this._handle, resource, opts);
    }
    mkdir(resource) {
        return this._proxy.$mkdir(this._handle, resource);
    }
    readdir(resource) {
        return this._proxy.$readdir(this._handle, resource);
    }
    rename(resource, target, opts) {
        return this._proxy.$rename(this._handle, resource, target, opts);
    }
    copy(resource, target, opts) {
        return this._proxy.$copy(this._handle, resource, target, opts);
    }
    open(resource, opts) {
        return this._proxy.$open(this._handle, resource, opts);
    }
    close(fd) {
        return this._proxy.$close(this._handle, fd);
    }
    async read(fd, pos, data, offset, length) {
        const readData = await this._proxy.$read(this._handle, fd, pos, length);
        data.set(readData.buffer, offset);
        return readData.byteLength;
    }
    write(fd, pos, data, offset, length) {
        return this._proxy.$write(this._handle, fd, pos, VSBuffer.wrap(data).slice(offset, offset + length));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZEZpbGVTeXN0ZW0uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvYXBpL2Jyb3dzZXIvbWFpblRocmVhZEZpbGVTeXN0ZW0udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDL0QsT0FBTyxFQUFlLFlBQVksRUFBRSxlQUFlLEVBQUUsYUFBYSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDOUcsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSw2QkFBNkIsQ0FBQztBQUNqRSxPQUFPLEVBQWtFLFlBQVksRUFBd0IsUUFBUSxFQUErRCxrQkFBa0IsRUFBdUIsMkJBQTJCLEVBQXdKLGNBQWMsRUFBRSw2QkFBNkIsRUFBMkMsTUFBTSx5Q0FBeUMsQ0FBQztBQUN4aEIsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQTBDLFdBQVcsRUFBNkIsTUFBTSwrQkFBK0IsQ0FBQztBQUMvSSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFJbkQsSUFBTSxvQkFBb0IsNEJBQTFCLE1BQU0sb0JBQW9CO0lBTWhDLFlBQ0MsY0FBK0IsRUFDakIsWUFBMkM7UUFBMUIsaUJBQVksR0FBWixZQUFZLENBQWM7UUFMekMsa0JBQWEsR0FBRyxJQUFJLGFBQWEsRUFBb0MsQ0FBQztRQUN0RSxpQkFBWSxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7UUFNckQsSUFBSSxDQUFDLE1BQU0sR0FBRyxjQUFjLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1FBRXhFLE1BQU0sU0FBUyxHQUFHLGNBQWMsQ0FBQyxRQUFRLENB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