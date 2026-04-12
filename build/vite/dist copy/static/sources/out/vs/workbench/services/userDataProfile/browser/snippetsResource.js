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
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ResourceSet } from '../../../../base/common/map.js';
import { localize } from '../../../../nls.js';
import { FileOperationError, IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { API_OPEN_EDITOR_COMMAND_ID } from '../../../browser/parts/editor/editorCommands.js';
import { TreeItemCollapsibleState } from '../../../common/views.js';
import { IUserDataProfileService } from '../common/userDataProfile.js';
let SnippetsResourceInitializer = class SnippetsResourceInitializer {
    constructor(userDataProfileService, fileService, uriIdentityService) {
        this.userDataProfileService = userDataProfileService;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
    }
    async initialize(content) {
        const snippetsContent = JSON.parse(content);
        for (const key in snippetsContent.snippets) {
            const resource = this.uriIdentityService.extUri.joinPath(this.userDataProfileService.currentProfile.snippetsHome, key);
            await this.fileService.writeFile(resource, VSBuffer.fromString(snippetsContent.snippets[key]));
        }
    }
};
SnippetsResourceInitializer = __decorate([
    __param(0, IUserDataProfileService),
    __param(1, IFileService),
    __param(2, IUriIdentityService)
], SnippetsResourceInitializer);
export { SnippetsResourceInitializer };
let SnippetsResource = class SnippetsResource {
    constructor(fileService, uriIdentityService) {
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
    }
    async getContent(profile, excluded) {
        const snippets = await this.getSnippets(profile, excluded);
        return JSON.stringify({ snippets });
    }
    async apply(content, profile) {
        const snippetsContent = JSON.parse(content);
        for (const key in snippetsContent.snippets) {
            const resource = this.uriIdentityService.extUri.joinPath(profile.snippetsHome, key);
            await this.fileService.writeFile(resource, VSBuffer.fromString(snippetsContent.snippets[key]));
        }
    }
    async getSnippets(profile, excluded) {
        const snippets = {};
        const snippetsResources = await this.getSnippetsResources(profile, excluded);
        for (const resource of snippetsResources) {
            const key = this.uriIdentityService.extUri.relativePath(profile.snippetsHome, resource);
            const content = await this.fileService.readFile(resource);
            snippets[key] = content.value.toString();
        }
        return snippets;
    }
    async getSnippetsResources(profile, excluded) {
        const snippets = [];
        let stat;
        try {
            stat = await this.fileService.resolve(profile.snippetsHome);
        }
        catch (e) {
            // No snippets
            if (e instanceof FileOperationError && e.fileOperationResult === 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                return snippets;
            }
            else {
                throw e;
            }
        }
        for (const { resource } of stat.children || []) {
            if (excluded?.has(resource)) {
                continue;
            }
            const extension = this.uriIdentityService.extUri.extname(resource);
            if (extension === '.json' || extension === '.code-snippets') {
                snippets.push(resource);
            }
        }
        return snippets;
    }
};
SnippetsResource = __decorate([
    __param(0, IFileService),
    __param(1, IUriIdentityService)
], SnippetsResource);
export { SnippetsResource };
let SnippetsResourceTreeItem = class SnippetsResourceTreeItem {
    constructor(profile, instantiationService, uriIdentityService) {
        this.profile = profile;
        this.instantiationService = instantiationService;
        this.uriIdentityService = uriIdentityService;
        this.type = "snippets" /* ProfileResourceType.Snippets */;
        this.label = { label: localize('snippets', "Snippets") };
        this.collapsibleState = TreeItemCollapsibleState.Collapsed;
        this.excludedSnippets = new ResourceSet();
        this.handle = this.profile.snippetsHome.toString();
    }
    async getChildren() {
        const snippetsResources = await this.instantiationService.createInstance(SnippetsResource).getSnippetsResources(this.profile);
        const that = this;
        return snippetsResources.map(resource => ({
            handle: resource.toString(),
            parent: that,
            resourceUri: resource,
            collapsibleState: TreeItemCollapsibleState.None,
            accessibilityInformation: {
                label: this.uriIdentityService.extUri.basename(resource),
            },
            checkbox: that.checkbox ? {
                get isChecked() { return !that.excludedSnippets.has(resource); },
                set isChecked(value) {
                    if (value) {
                        that.excludedSnippets.delete(resource);
                    }
                    else {
                        that.excludedSnippets.add(resource);
                    }
                },
                accessibilityInformation: {
                    label: localize('exclude', "Select Snippet {0}", this.uriIdentityService.extUri.basename(resource)),
                }
            } : undefined,
            command: {
                id: API_OPEN_EDITOR_COMMAND_ID,
                title: '',
                arguments: [resource, undefined, undefined]
            }
        }));
    }
    async hasContent() {
        const snippetsResources = await this.instantiationService.createInstance(SnippetsResource).getSnippetsResources(this.profile);
        return snippetsResources.length > 0;
    }
    async getContent() {
        return this.instantiationService.createInstance(SnippetsResource).getContent(this.profile, this.excludedSnippets);
    }
    isFromDefaultProfile() {
        return !this.profile.isDefault && !!this.profile.useDefaultFlags?.snippets;
    }
};
SnippetsResourceTreeItem = __decorate([
    __param(1, IInstantiationService),
    __param(2, IUriIdentityService)
], SnippetsResourceTreeItem);
export { SnippetsResourceTreeItem };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic25pcHBldHNSZXNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci9zbmlwcGV0c1Jlc291cmNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUU3RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxrQkFBa0IsRUFBdUIsWUFBWSxFQUFhLE1BQU0sNENBQTRDLENBQUM7QUFDOUgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFFN0YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0YsT0FBTyxFQUEwQix3QkFBd0IsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQzVGLE9BQU8sRUFBMEcsdUJBQXVCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQU14SyxJQUFNLDJCQUEyQixHQUFqQyxNQUFNLDJCQUEyQjtJQUV2QyxZQUMyQyxzQkFBK0MsRUFDMUQsV0FBeUIsRUFDbEIsa0JBQXVDO1FBRm5DLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBeUI7UUFDMUQsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFDbEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtJQUU5RSxDQUFDO0lBRUQsS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUFlO1FBQy9CLE1BQU0sZUFBZSxHQUFxQixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxD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