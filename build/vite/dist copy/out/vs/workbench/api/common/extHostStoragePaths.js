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
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { IExtHostInitDataService } from './extHostInitDataService.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostConsumerFileSystem } from './extHostFileSystemConsumer.js';
import { URI } from '../../../base/common/uri.js';
export const IExtensionStoragePaths = createDecorator('IExtensionStoragePaths');
let ExtensionStoragePaths = class ExtensionStoragePaths {
    constructor(initData, _logService, _extHostFileSystem) {
        this._logService = _logService;
        this._extHostFileSystem = _extHostFileSystem;
        this._workspace = initData.workspace ?? undefined;
        this._environment = initData.environment;
        this.whenReady = this._getOrCreateWorkspaceStoragePath().then(value => this._value = value);
    }
    async _getWorkspaceStorageURI(storageName) {
        return URI.joinPath(this._environment.workspaceStorageHome, storageName);
    }
    async _getOrCreateWorkspaceStoragePath() {
        if (!this._workspace) {
            return Promise.resolve(undefined);
        }
        const storageName = this._workspace.id;
        const storageUri = await this._getWorkspaceStorageURI(storageName);
        try {
            await this._extHostFileSystem.value.stat(storageUri);
            this._logService.trace('[ExtHostStorage] storage dir already exists', storageUri);
            return storageUri;
        }
        catch {
            // doesn't exist, that's OK
        }
        try {
            this._logService.trace('[ExtHostStorage] creating dir and metadata-file', storageUri);
            await this._extHostFileSystem.value.createDirectory(storageUri);
            await this._extHostFileSystem.value.writeFile(URI.joinPath(storageUri, 'meta.json'), new TextEncoder().encode(JSON.stringify({
                id: this._workspace.id,
                configuration: URI.revive(this._workspace.configuration)?.toString(),
                name: this._workspace.name
            }, undefined, 2)));
            return storageUri;
        }
        catch (e) {
            this._logService.error('[ExtHostStorage]', e);
            return undefined;
        }
    }
    workspaceValue(extension) {
        if (this._value) {
            return URI.joinPath(this._value, extension.identifier.value);
        }
        return undefined;
    }
    globalValue(extension) {
        return URI.joinPath(this._environment.globalStorageHome, extension.identifier.value.toLowerCase());
    }
    onWillDeactivateAll() {
    }
};
ExtensionStoragePaths = __decorate([
    __param(0, IExtHostInitDataService),
    __param(1, ILogService),
    __param(2, IExtHostConsumerFileSystem)
], ExtensionStoragePaths);
export { ExtensionStoragePaths };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFN0b3JhZ2VQYXRocy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RTdG9yYWdlUGF0aHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3RFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVsRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUM1RSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFFbEQsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsZUFBZSxDQUF5Qix3QkFBd0IsQ0FBQyxDQUFDO0FBVWpHLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXFCO0lBVWpDLFlBQzBCLFFBQWlDLEVBQzFCLFdBQXdCLEVBQ1gsa0JBQThDO1FBRDNELGdCQUFXLEdBQVgsV0FBVyxDQUFhO1FBQ1gsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUE0QjtRQUUzRixJQUFJLENBQUMsVUFBVSxHQUFHLFFBQVEsQ0FBQyxTQUFTLElBQUksU0FBUyxDQUFDO1FBQ2xELElBQUksQ0FBQyxZQUFZLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQztRQUN6QyxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsRUFBRSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUM7SUFDN0YsQ0FBQztJQUVTLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxXQUFtQjtRQUMxRCxPQUFPLEdB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