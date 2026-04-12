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
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfileStorageService } from '../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { TreeItemCollapsibleState } from '../../../common/views.js';
let GlobalStateResourceInitializer = class GlobalStateResourceInitializer {
    constructor(storageService) {
        this.storageService = storageService;
    }
    async initialize(content) {
        const globalState = JSON.parse(content);
        const storageKeys = Object.keys(globalState.storage);
        if (storageKeys.length) {
            const storageEntries = [];
            for (const key of storageKeys) {
                storageEntries.push({ key, value: globalState.storage[key], scope: 0 /* StorageScope.PROFILE */, target: 0 /* StorageTarget.USER */ });
            }
            this.storageService.storeAll(storageEntries, true);
        }
    }
};
GlobalStateResourceInitializer = __decorate([
    __param(0, IStorageService)
], GlobalStateResourceInitializer);
export { GlobalStateResourceInitializer };
let GlobalStateResource = class GlobalStateResource {
    constructor(storageService, userDataProfileStorageService, logService) {
        this.storageService = storageService;
        this.userDataProfileStorageService = userDataProfileStorageService;
        this.logService = logService;
    }
    async getContent(profile) {
        const globalState = await this.getGlobalState(profile);
        return JSON.stringify(globalState);
    }
    async apply(content, profile) {
        const globalState = JSON.parse(content);
        await this.writeGlobalState(globalState, profile);
    }
    async getGlobalState(profile) {
        const storage = {};
        const storageData = await this.userDataProfileStorageService.readStorageData(profile);
        for (const [key, value] of storageData) {
            if (value.value !== undefined && value.target === 0 /* StorageTarget.USER */) {
                storage[key] = value.value;
            }
        }
        return { storage };
    }
    async writeGlobalState(globalState, profile) {
        const storageKeys = Object.keys(globalState.storage);
        if (storageKeys.length) {
            const updatedStorage = new Map();
            const nonProfileKeys = [
                // Do not include application scope user target keys because they also include default profile user target keys
                ...this.storageService.keys(-1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */),
                ...this.storageService.keys(1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */),
                ...this.storageService.keys(1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */),
            ];
            for (const key of storageKeys) {
                if (nonProfileKeys.includes(key)) {
                    this.logService.info(`Importing Profile (${profile.name}): Ignoring global state key '${key}' because it is not a profile key.`);
                }
                else {
                    updatedStorage.set(key, globalState.storage[key]);
                }
            }
            await this.userDataProfileStorageService.updateStorageData(profile, updatedStorage, 0 /* StorageTarget.USER */);
        }
    }
};
GlobalStateResource = __decorate([
    __param(0, IStorageService),
    __param(1, IUserDataProfileStorageService),
    __param(2, ILogService)
], GlobalStateResource);
export { GlobalStateResource };
export class GlobalStateResourceTreeItem {
    constructor(resource, uriIdentityService) {
        this.resource = resource;
        this.uriIdentityService = uriIdentityService;
        this.type = "globalState" /* ProfileResourceType.GlobalState */;
        this.handle = "globalState" /* ProfileResourceType.GlobalState */;
        this.label = { label: localize('globalState', "UI State") };
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
    }
    async getChildren() {
        return [{
                handle: this.resource.toString(),
                resourceUri: this.resource,
                collapsibleState: TreeItemCollapsibleState.None,
                accessibilityInformation: {
                    label: this.uriIdentityService.extUri.basename(this.resource)
                },
                parent: this,
                command: {
                    id: API_OPEN_EDITOR_COMMAND_ID,
                    title: '',
                    arguments: [this.resource, undefined, undefined]
                }
            }];
    }
}
let GlobalStateResourceExportTreeItem = class GlobalStateResourceExportTreeItem extends GlobalStateResourceTreeItem {
    constructor(profile, resource, uriIdentityService, instantiationService) {
        super(resource, uriIdentityService);
        this.profile = profile;
        this.instantiationService = instantiationService;
    }
    async hasContent() {
        const globalState = await this.instantiationService.createInstance(GlobalStateResource).getGlobalState(this.profile);
        return Object.keys(globalState.storage).length > 0;
    }
    async getContent() {
        return this.instantiationService.createInstance(GlobalStateResource).getContent(this.profile);
    }
    isFromDefaultProfile() {
        return !this.profile.isDefault && !!this.profile.useDefaultFlags?.globalState;
    }
};
GlobalStateResourceExportTreeItem = __decorate([
    __param(2, IUriIdentityService),
    __param(3, IInstantiationService)
], GlobalStateResourceExportTreeItem);
export { GlobalStateResourceExportTreeItem };
let GlobalStateResourceImportTreeItem = class GlobalStateResourceImportTreeItem extends GlobalStateResourceTreeItem {
    constructor(content, resource, uriIdentityService) {
        super(resource, uriIdentityService);
        this.content = content;
    }
    async getContent() {
        return this.content;
    }
    isFromDefaultProfile() {
        return false;
    }
};
GlobalStateResourceImportTreeItem = __decorate([
    __param(2, IUriIdentityService)
], GlobalStateResourceImportTreeItem);
export { GlobalStateResourceImportTreeItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2xvYmFsU3RhdGVSZXNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9nbG9iYWxTdGF0ZVJlc291cmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBSWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFpQixlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFDN0gsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFN0YsT0FBTyxFQUFFLDhCQUE4QixFQUFFLE1BQU0sOEVBQThFLENBQUM7QUFDOUgsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0YsT0FBTyxFQUEwQix3QkFBd0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBT3JGLElBQU0sOEJBQThCLEdBQXBDLE1BQU0sOEJBQThCO0lBRTFDLFlBQThDLGNBQStCO1FBQS9CLG1CQUFjLEdBQWQsY0FBYyxDQUFpQjtJQUM3RSxDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFlO1FBQy9CLE1BQU0sV0FBVyxHQUFpQixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RELE1BQU0sV0FBVyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JELElBQUksV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3hCLE1BQU0sY0FBYyxHQUF5QixFQUFFLENBQUM7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