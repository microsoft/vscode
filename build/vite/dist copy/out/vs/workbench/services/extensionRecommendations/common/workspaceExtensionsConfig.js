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
import { distinct } from '../../../../base/common/arrays.js';
import { Emitter } from '../../../../base/common/event.js';
import { parse } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { FileKind, IFileService } from '../../../../platform/files/common/files.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { isWorkspace, IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { localize } from '../../../../nls.js';
import { IJSONEditingService } from '../../configuration/common/jsonEditing.js';
import { ResourceMap } from '../../../../base/common/map.js';
export const EXTENSIONS_CONFIG = '.vscode/extensions.json';
export const IWorkspaceExtensionsConfigService = createDecorator('IWorkspaceExtensionsConfigService');
let WorkspaceExtensionsConfigService = class WorkspaceExtensionsConfigService extends Disposable {
    constructor(workspaceContextService, fileService, quickInputService, modelService, languageService, jsonEditingService) {
        super();
        this.workspaceContextService = workspaceContextService;
        this.fileService = fileService;
        this.quickInputService = quickInputService;
        this.modelService = modelService;
        this.languageService = languageService;
        this.jsonEditingService = jsonEditingService;
        this._onDidChangeExtensionsConfigs = this._register(new Emitter());
        this.onDidChangeExtensionsConfigs = this._onDidChangeExtensionsConfigs.event;
        this._register(workspaceContextService.onDidChangeWorkspaceFolders(e => this._onDidChangeExtensionsConfigs.fire()));
        this._register(fileService.onDidFilesChange(e => {
            const workspace = workspaceContextService.getWorkspace();
            if ((workspace.configuration && e.affects(workspace.configuration))
                || workspace.folders.some(folder => e.affects(folder.toResource(EXTENSIONS_CONFIG)))) {
                this._onDidChangeExtensionsConfigs.fire();
            }
        }));
    }
    async getExtensionsConfigs() {
        const workspace = this.workspaceContextService.getWorkspace();
        const result = [];
        const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : undefined;
        if (workspaceExtensionsConfigContent) {
            result.push(workspaceExtensionsConfigContent);
        }
        result.push(...await Promise.all(workspace.folders.map(workspaceFolder => this.resolveWorkspaceFolderExtensionConfig(workspaceFolder))));
        return result;
    }
    async getRecommendations() {
        const configs = await this.getExtensionsConfigs();
        return distinct(configs.flatMap(c => c.recommendations ? c.recommendations.map(c => c.toLowerCase()) : []));
    }
    async getUnwantedRecommendations() {
        const configs = await this.getExtensionsConfigs();
        return distinct(configs.flatMap(c => c.unwantedRecommendations ? c.unwantedRecommendations.map(c => c.toLowerCase()) : []));
    }
    async toggleRecommendation(extensionId) {
        extensionId = extensionId.toLowerCase();
        const workspace = this.workspaceContextService.getWorkspace();
        const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : undefined;
        const workspaceFolderExtensionsConfigContents = new ResourceMap();
        await Promise.all(workspace.folders.map(async (workspaceFolder) => {
            const extensionsConfigContent = await this.resolveWorkspaceFolderExtensionConfig(workspaceFolder);
            workspaceFolderExtensionsConfigContents.set(workspaceFolder.uri, extensionsConfigContent);
        }));
        const isWorkspaceRecommended = workspaceExtensionsConfigContent && workspaceExtensionsConfigContent.recommendations?.some(r => r.toLowerCase() === extensionId);
        const recommendedWorksapceFolders = workspace.folders.filter(workspaceFolder => workspaceFolderExtensionsConfigContents.get(workspaceFolder.uri)?.recommendations?.some(r => r.toLowerCase() === extensionId));
        const isRecommended = isWorkspaceRecommended || recommendedWorksapceFolders.length > 0;
        const workspaceOrFolders = isRecommended
            ? await this.pickWorkspaceOrFolders(recommendedWorksapceFolders, isWorkspaceRecommended ? workspace : undefined, localize('select for remove', "Remove extension recommendation from"))
            : await this.pickWorkspaceOrFolders(workspace.folders, workspace.configuration ? workspace : undefined, localize('select for add', "Add extension recommendation to"));
        for (const workspaceOrWorkspaceFolder of workspaceOrFolders) {
            if (isWorkspace(workspaceOrWorkspaceFolder)) {
                await this.addOrRemoveWorkspaceRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceExtensionsConfigContent, !isRecommended);
            }
            else {
                await this.addOrRemoveWorkspaceFolderRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceFolderExtensionsConfigContents.get(workspaceOrWorkspaceFolder.uri), !isRecommended);
            }
        }
    }
    async toggleUnwantedRecommendation(extensionId) {
        const workspace = this.workspaceContextService.getWorkspace();
        const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : undefined;
        const workspaceFolderExtensionsConfigContents = new ResourceMap();
        await Promise.all(workspace.folders.map(async (workspaceFolder) => {
            const extensionsConfigContent = await this.resolveWorkspaceFolderExtensionConfig(workspaceFolder);
            workspaceFolderExtensionsConfigContents.set(workspaceFolder.uri, extensionsConfigContent);
        }));
        const isWorkspaceUnwanted = workspaceExtensionsConfigContent && workspaceExtensionsConfigContent.unwantedRecommendations?.some(r => r === extensionId);
        const unWantedWorksapceFolders = workspace.folders.filter(workspaceFolder => workspaceFolderExtensionsConfigContents.get(workspaceFolder.uri)?.unwantedRecommendations?.some(r => r === extensionId));
        const isUnwanted = isWorkspaceUnwanted || unWantedWorksapceFolders.length > 0;
        const workspaceOrFolders = isUnwanted
            ? await this.pickWorkspaceOrFolders(unWantedWorksapceFolders, isWorkspaceUnwanted ? workspace : undefined, localize('select for remove', "Remove extension recommendation from"))
            : await this.pickWorkspaceOrFolders(workspace.folders, workspace.configuration ? workspace : undefined, localize('select for add', "Add extension recommendation to"));
        for (const workspaceOrWorkspaceFolder of workspaceOrFolders) {
            if (isWorkspace(workspaceOrWorkspaceFolder)) {
                await this.addOrRemoveWorkspaceUnwantedRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceExtensionsConfigContent, !isUnwanted);
            }
            else {
                await this.addOrRemoveWorkspaceFolderUnwantedRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceFolderExtensionsConfigContents.get(workspaceOrWorkspaceFolder.uri), !isUnwanted);
            }
        }
    }
    async addOrRemoveWorkspaceFolderRecommendation(extensionId, workspaceFolder, extensionsConfigContent, add) {
        const values = [];
        if (add) {
            if (Array.isArray(extensionsConfigContent.recommendations)) {
                values.push({ path: ['recommendations', -1], value: extensionId });
            }
            else {
                values.push({ path: ['recommendations'], value: [extensionId] });
            }
            const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(['unwantedRecommendations'], extensionsConfigContent.unwantedRecommendations, extensionId);
            if (unwantedRecommendationEdit) {
                values.push(unwantedRecommendationEdit);
            }
        }
        else if (extensionsConfigContent.recommendations) {
            const recommendationEdit = this.getEditToRemoveValueFromArray(['recommendations'], extensionsConfigContent.recommendations, extensionId);
            if (recommendationEdit) {
                values.push(recommendationEdit);
            }
        }
        if (values.length) {
            return this.jsonEditingService.write(workspaceFolder.toResource(EXTENSIONS_CONFIG), values, true);
        }
    }
    async addOrRemoveWorkspaceRecommendation(extensionId, workspace, extensionsConfigContent, add) {
        const values = [];
        if (extensionsConfigContent) {
            if (add) {
                const path = ['extensions', 'recommendations'];
                if (Array.isArray(extensionsConfigContent.recommendations)) {
                    values.push({ path: [...path, -1], value: extensionId });
                }
                else {
                    values.push({ path, value: [extensionId] });
                }
                const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(['extensions', 'unwantedRecommendations'], extensionsConfigContent.unwantedRecommendations, extensionId);
                if (unwantedRecommendationEdit) {
                    values.push(unwantedRecommendationEdit);
                }
            }
            else if (extensionsConfigContent.recommendations) {
                const recommendationEdit = this.getEditToRemoveValueFromArray(['extensions', 'recommendations'], extensionsConfigContent.recommendations, extensionId);
                if (recommendationEdit) {
                    values.push(recommendationEdit);
                }
            }
        }
        else if (add) {
            values.push({ path: ['extensions'], value: { recommendations: [extensionId] } });
        }
        if (values.length) {
            return this.jsonEditingService.write(workspace.configuration, values, true);
        }
    }
    async addOrRemoveWorkspaceFolderUnwantedRecommendation(extensionId, workspaceFolder, extensionsConfigContent, add) {
        const values = [];
        if (add) {
            const path = ['unwantedRecommendations'];
            if (Array.isArray(extensionsConfigContent.unwantedRecommendations)) {
                values.push({ path: [...path, -1], value: extensionId });
            }
            else {
                values.push({ path, value: [extensionId] });
            }
            const recommendationEdit = this.getEditToRemoveValueFromArray(['recommendations'], extensionsConfigContent.recommendations, extensionId);
            if (recommendationEdit) {
                values.push(recommendationEdit);
            }
        }
        else if (extensionsConfigContent.unwantedRecommendations) {
            const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(['unwantedRecommendations'], extensionsConfigContent.unwantedRecommendations, extensionId);
            if (unwantedRecommendationEdit) {
                values.push(unwantedRecommendationEdit);
            }
        }
        if (values.length) {
            return this.jsonEditingService.write(workspaceFolder.toResource(EXTENSIONS_CONFIG), values, true);
        }
    }
    async addOrRemoveWorkspaceUnwantedRecommendation(extensionId, workspace, extensionsConfigContent, add) {
        const values = [];
        if (extensionsConfigContent) {
            if (add) {
                const path = ['extensions', 'unwantedRecommendations'];
                if (Array.isArray(extensionsConfigContent.recommendations)) {
                    values.push({ path: [...path, -1], value: extensionId });
                }
                else {
                    values.push({ path, value: [extensionId] });
                }
                const recommendationEdit = this.getEditToRemoveValueFromArray(['extensions', 'recommendations'], extensionsConfigContent.recommendations, extensionId);
                if (recommendationEdit) {
                    values.push(recommendationEdit);
                }
            }
            else if (extensionsConfigContent.unwantedRecommendations) {
                const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(['extensions', 'unwantedRecommendations'], extensionsConfigContent.unwantedRecommendations, extensionId);
                if (unwantedRecommendationEdit) {
                    values.push(unwantedRecommendationEdit);
                }
            }
        }
        else if (add) {
            values.push({ path: ['extensions'], value: { unwantedRecommendations: [extensionId] } });
        }
        if (values.length) {
            return this.jsonEditingService.write(workspace.configuration, values, true);
        }
    }
    async pickWorkspaceOrFolders(workspaceFolders, workspace, placeHolder) {
        const workspaceOrFolders = workspace ? [...workspaceFolders, workspace] : [...workspaceFolders];
        if (workspaceOrFolders.length === 1) {
            return workspaceOrFolders;
        }
        const folderPicks = workspaceFolders.map(workspaceFolder => {
            return {
                label: workspaceFolder.name,
                description: localize('workspace folder', "Workspace Folder"),
                workspaceOrFolder: workspaceFolder,
                iconClasses: getIconClasses(this.modelService, this.languageService, workspaceFolder.uri, FileKind.ROOT_FOLDER)
            };
        });
        if (workspace) {
            folderPicks.push({ type: 'separator' });
            folderPicks.push({
                label: localize('workspace', "Workspace"),
                workspaceOrFolder: workspace,
            });
        }
        const result = await this.quickInputService.pick(folderPicks, { placeHolder, canPickMany: true }) || [];
        return result.map(r => r.workspaceOrFolder);
    }
    async resolveWorkspaceExtensionConfig(workspaceConfigurationResource) {
        try {
            const content = await this.fileService.readFile(workspaceConfigurationResource);
            const extensionsConfigContent = parse(content.value.toString())['extensions'];
            return extensionsConfigContent ? this.parseExtensionConfig(extensionsConfigContent) : undefined;
        }
        catch (e) { /* Ignore */ }
        return undefined;
    }
    async resolveWorkspaceFolderExtensionConfig(workspaceFolder) {
        try {
            const content = await this.fileService.readFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
            const extensionsConfigContent = parse(content.value.toString());
            return this.parseExtensionConfig(extensionsConfigContent);
        }
        catch (e) { /* ignore */ }
        return {};
    }
    parseExtensionConfig(extensionsConfigContent) {
        return {
            recommendations: distinct((extensionsConfigContent.recommendations || []).map(e => e.toLowerCase())),
            unwantedRecommendations: distinct((extensionsConfigContent.unwantedRecommendations || []).map(e => e.toLowerCase()))
        };
    }
    getEditToRemoveValueFromArray(path, array, value) {
        const index = array?.indexOf(value);
        if (index !== undefined && index !== -1) {
            return { path: [...path, index], value: undefined };
        }
        return undefined;
    }
};
WorkspaceExtensionsConfigService = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IFileService),
    __param(2, IQuickInputService),
    __param(3, IModelService),
    __param(4, ILanguageService),
    __param(5, IJSONEditingService)
], WorkspaceExtensionsConfigService);
export { WorkspaceExtensionsConfigService };
registerSingleton(IWorkspaceExtensionsConfigService, WorkspaceExtensionsConfigService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL3dvcmtzcGFjZUV4dGVuc2lvbnNDb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQVksS0FBSyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ3BGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBYyx3QkFBd0IsRUFBb0IsTUFBTSxvREFBb0QsQ0FBQztBQUN6SSxPQUFPLEVBQUUsa0JBQWtCLEVBQXVDLE1BQU0sc0RBQXNELENBQUM7QUFDL0gsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsbUJBQW1CLEVBQWMsTUFBTSwyQ0FBMkMsQ0FBQztBQUM1RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFN0QsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcseUJBQXlCLENBQUM7QUFPM0QsTUFBTSxDQUFDLE1BQU0saUNBQWlDLEdBQUcsZUFBZSxDQUFvQyxtQ0FBbUMsQ0FBQyxDQUFDO0FBY2xJLElBQU0sZ0NBQWdDLEdBQXRDLE1BQU0sZ0NBQWlDLFNBQVEsVUFBVTtJQU8vRCxZQUMyQix1QkFBa0UsRUFDOUUsV0FBMEMsRUFDcEMsaUJBQXNELEVBQzNELFlBQTRDLEVBQ3pDLGVBQWtELEVBQy9DLGtCQUF3RDtRQUU3RSxLQUFLLEVBQUUsQ0FBQztRQVBtQyw0QkFBdUIsR0FBdkIsdUJBQXVCLENBQTBCO1FBQzdELGdCQUFXLEdBQVgsV0FBVyxDQUFjO1FBQ25CLHNCQUFpQixHQUFqQixpQkFBaUIsQ0FBb0I7UUFDMUMsaUJBQVksR0FBWixZQUFZLENBQWU7UUFDeEIsb0JBQWUsR0FBZixlQUFlLENBQWtCO1FBQzlCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFUN0Qsa0NBQTZCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBUSxDQUFDLENBQUM7UUFDNUUsaUNBQTRCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQztRQVdoRixJQUFJLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLDZCQUE2QixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztRQUNwSCxJQUFJLENBQUMsU0FBUyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUMvQyxNQUFNLFNBQVMsR0FBRyx1QkFBdUIsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUN6RCxJQUFJLENBQUMsU0FBUyxDQUFDLGFBQWEsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQzttQkFDL0QsU0FBUyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEVBQ25GLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLDZCQUE2QixDQUFDLElBQUksRUFBRSxDQUFDO1lBQzNDLENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELEtBQUssQ0FBQyxvQkFBb0I7UUFDekIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzlELE1BQU0sTUFBTSxHQUErQixFQUFFLENBQUM7UUFDOUMsTUFBTSxnQ0FBZ0MsR0FBRyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNuSixJQUFJLGdDQUFnQyxFQUFFLENBQUM7WUFDdEMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO1FBQy9DLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pJLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0I7UUFDdkIsTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztRQUNsRCxPQUFPLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3RyxDQUFDO0lBRUQsS0FBSyxDQUFDLDBCQUEwQjtRQUMvQixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1FBQ2xELE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM3SCxDQUFDO0lBRUQsS0FBSyxDQUFDLG9CQUFvQixDQUFDLFdBQW1CO1FBQzdDLFdBQVcsR0FBRyxXQUFXLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDeEMsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFlBQVksRUFBRSxDQUFDO1FBQzlELE1BQU0sZ0NBQWdDLEdBQUcsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsK0JBQStCLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDbkosTUFBTSx1Q0FBdUMsR0FBRyxJQUFJLFdBQVcsRUFBNEIsQ0FBQztRQUM1RixNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFDLGVBQWUsRUFBQyxFQUFFO1lBQy9ELE1BQU0sdUJBQXVCLEdBQUcsTUFBTSxJQUFJLENBQUMscUNBQXFDLENBQUMsZUFBZSxDQUFDLENBQUM7WUFDbEcsdUNBQXVDLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUUsdUJBQXVCLENBQUMsQ0FBQztRQUMzRixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRUosTUFBTSxzQkFBc0IsR0FBRyxnQ0FBZ0MsSUFBSSxnQ0FBZ0MsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxLQUFLLFdBQVcsQ0FBQyxDQUFDO1FBQ2hLLE1BQU0sMkJBQTJCLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyx1Q0FBdUMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQyxFQUFFLGVBQWUsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztRQUMvTSxNQUFNLGFBQWEsR0FBRyxzQkFBc0IsSUFBSSwyQkFBMkIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBRXZGLE1BQU0sa0JBQWtCLEdBQUcsYUFBYTtZQUN2QyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsMkJBQTJCLEVBQUUsc0JBQXNCLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO1lBQ3ZMLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7UUFFeEssS0FBSyxNQUFNLDBCQUEwQixJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDN0QsSUFBSSxXQUFXLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDO2dCQUM3QyxNQUFNLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQyxXQUFXLEVBQUUsMEJBQTBCLEVBQUUsZ0NBQWdDLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUMxSSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxJQUFJLENBQUMsd0NBQXdDLENBQUMsV0FBVyxFQUFFLDBCQUEwQixFQUFFLHVDQUF1QyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUUsRUFBRSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQzVMLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVELEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxXQUFtQjtRQUNyRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDOUQsTUFBTSxnQ0FBZ0MsR0FBRyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNuSixNQUFNLHVDQUF1QyxHQUFHLElBQUksV0FBVyxFQUE0QixDQUFDO1FBQzVGLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsZUFBZSxFQUFDLEVBQUU7WUFDL0QsTUFBTSx1QkFBdUIsR0FBRyxNQUFNLElBQUksQ0FBQyxxQ0FBcUMsQ0FBQyxlQUFlLENBQUMsQ0FBQztZQUNsRyx1Q0FBdUMsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSx1QkFBdUIsQ0FBQyxDQUFDO1FBQzNGLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFSixNQUFNLG1CQUFtQixHQUFHLGdDQUFnQyxJQUFJLGdDQUFnQyxDQUFDLHVCQUF1QixFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxXQUFXLENBQUMsQ0FBQztRQUN2SixNQUFNLHdCQUF3QixHQUFHLFNBQVMsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsdUNBQXVDLENBQUMsR0FBRyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssV0FBVyxDQUFDLENBQUMsQ0FBQztRQUN0TSxNQUFNLFVBQVUsR0FBRyxtQkFBbUIsSUFBSSx3QkFBd0IsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBRTlFLE1BQU0sa0JBQWtCLEdBQUcsVUFBVTtZQUNwQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsd0JBQXdCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxzQ0FBc0MsQ0FBQyxDQUFDO1lBQ2pMLENBQUMsQ0FBQyxNQUFNLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7UUFFeEssS0FBSyxNQUFNLDBCQUEwQixJQUFJLGtCQUFrQixFQUFFLENBQUM7WUFDN0QsSUFBSSxXQUFXLENBQUMsMEJBQTBCLENBQUMsRUFBRSxDQUFDO2dCQUM3QyxNQUFNLElBQUksQ0FBQywwQ0FBMEMsQ0FBQyxXQUFXLEVBQUUsMEJBQTBCLEVBQUUsZ0NBQWdDLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUMvSSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxJQUFJLENBQUMsZ0RBQWdELENBQUMsV0FBVyxFQUFFLDBCQUEwQixFQUFFLHVDQUF1QyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ2pNLENBQUM7UUFDRixDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyx3Q0FBd0MsQ0FBQyxXQUFtQixFQUFFLGVBQWlDLEVBQUUsdUJBQWlELEVBQUUsR0FBWTtRQUM3SyxNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO1FBQ2hDLElBQUksR0FBRyxFQUFFLENBQUM7WUFDVCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztnQkFDNUQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDcEUsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNsRSxDQUFDO1lBQ0QsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQ2pLLElBQUksMEJBQTBCLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDO2FBQU0sSUFBSSx1QkFBdUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUNwRCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLEVBQUUsdUJBQXVCLENBQUMsZUFBZSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQ3pJLElBQUksa0JBQWtCLEVBQUUsQ0FBQztnQkFDeEIsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQ2pDLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkcsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsa0NBQWtDLENBQUMsV0FBbUIsRUFBRSxTQUFxQixFQUFFLHVCQUE2RCxFQUFFLEdBQVk7UUFDdkssTUFBTSxNQUFNLEdBQWlCLEVBQUUsQ0FBQztRQUNoQyxJQUFJLHVCQUF1QixFQUFFLENBQUM7WUFDN0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDVCxNQUFNLElBQUksR0FBYSxDQUFDLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO2dCQUN6RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztvQkFDNUQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzFELENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0MsQ0FBQztnQkFDRCxNQUFNLDBCQUEwQixHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLFlBQVksRUFBRSx5QkFBeUIsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxDQUFDO2dCQUMvSyxJQUFJLDBCQUEwQixFQUFFLENBQUM7b0JBQ2hDLE1BQU0sQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztnQkFDekMsQ0FBQztZQUNGLENBQUM7aUJBQU0sSUFBSSx1QkFBdUIsQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDcEQsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxZQUFZLEVBQUUsaUJBQWlCLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUM7Z0JBQ3ZKLElBQUksa0JBQWtCLEVBQUUsQ0FBQztvQkFDeEIsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO2dCQUNqQyxDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7YUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDO1lBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxlQUFlLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsRixDQUFDO1FBRUQsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxhQUFjLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzlFLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLGdEQUFnRCxDQUFDLFdBQW1CLEVBQUUsZUFBaUMsRUFBRSx1QkFBaUQsRUFBRSxHQUFZO1FBQ3JMLE1BQU0sTUFBTSxHQUFpQixFQUFFLENBQUM7UUFDaEMsSUFBSSxHQUFHLEVBQUUsQ0FBQztZQUNULE1BQU0sSUFBSSxHQUFhLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUNuRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsdUJBQXVCLENBQUMsRUFBRSxDQUFDO2dCQUNwRSxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUMxRCxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDN0MsQ0FBQztZQUNELE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxDQUFDLDZCQUE2QixDQUFDLENBQUMsaUJBQWlCLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyxlQUFlLEVBQUUsV0FBVyxDQUFDLENBQUM7WUFDekksSUFBSSxrQkFBa0IsRUFBRSxDQUFDO2dCQUN4QixNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7WUFDakMsQ0FBQztRQUNGLENBQUM7YUFBTSxJQUFJLHVCQUF1QixDQUFDLHVCQUF1QixFQUFFLENBQUM7WUFDNUQsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLHVCQUF1QixFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQ2pLLElBQUksMEJBQTBCLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDO1FBQ0QsSUFBSSxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkIsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDbkcsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsMENBQTBDLENBQUMsV0FBbUIsRUFBRSxTQUFxQixFQUFFLHVCQUE2RCxFQUFFLEdBQVk7UUFDL0ssTUFBTSxNQUFNLEdBQWlCLEVBQUUsQ0FBQztRQUNoQyxJQUFJLHVCQUF1QixFQUFFLENBQUM7WUFDN0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztnQkFDVCxNQUFNLElBQUksR0FBYSxDQUFDLFlBQVksRUFBRSx5QkFBeUIsQ0FBQyxDQUFDO2dCQUNqRSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsdUJBQXVCLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQztvQkFDNUQsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxDQUFDLENBQUM7Z0JBQzFELENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQztnQkFDN0MsQ0FBQztnQkFDRCxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLFlBQVksRUFBRSxpQkFBaUIsQ0FBQyxFQUFFLHVCQUF1QixDQUFDLGVBQWUsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDdkosSUFBSSxrQkFBa0IsRUFBRSxDQUFDO29CQUN4QixNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7Z0JBQ2pDLENBQUM7WUFDRixDQUFDO2lCQUFNLElBQUksdUJBQXVCLENBQUMsdUJBQXVCLEVBQUUsQ0FBQztnQkFDNUQsTUFBTSwwQkFBMEIsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxZQUFZLEVBQUUseUJBQXlCLENBQUMsRUFBRSx1QkFBdUIsQ0FBQyx1QkFBdUIsRUFBRSxXQUFXLENBQUMsQ0FBQztnQkFDL0ssSUFBSSwwQkFBMEIsRUFBRSxDQUFDO29CQUNoQyxNQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7Z0JBQ3pDLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQzthQUFNLElBQUksR0FBRyxFQUFFLENBQUM7WUFDaEIsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFLEtBQUssRUFBRSxFQUFFLHVCQUF1QixFQUFFLENBQUMsV0FBVyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDMUYsQ0FBQztRQUVELElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25CLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsYUFBYyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxDQUFDO0lBQ0YsQ0FBQztJQUVPLEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxnQkFBb0MsRUFBRSxTQUFpQyxFQUFFLFdBQW1CO1FBQ2hJLE1BQU0sa0JBQWtCLEdBQUcsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2hHLElBQUksa0JBQWtCLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sa0JBQWtCLENBQUM7UUFDM0IsQ0FBQztRQUVELE1BQU0sV0FBVyxHQUFvRyxnQkFBZ0IsQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDM0osT0FBTztnQkFDTixLQUFLLEVBQUUsZUFBZSxDQUFDLElBQUk7Z0JBQzNCLFdBQVcsRUFBRSxRQUFRLENBQUMsa0JBQWtCLEVBQUUsa0JBQWtCLENBQUM7Z0JBQzdELGlCQUFpQixFQUFFLGVBQWU7Z0JBQ2xDLFdBQVcsRUFBRSxjQUFjLENBQUMsSUFBSSxDQUFDLFlBQVksRUFBRSxJQUFJLENBQUMsZUFBZSxFQUFFLGVBQWUsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQzthQUMvRyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLFNBQVMsRUFBRSxDQUFDO1lBQ2YsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsQ0FBQyxDQUFDO1lBQ3hDLFdBQVcsQ0FBQyxJQUFJLENBQUM7Z0JBQ2hCLEtBQUssRUFBRSxRQUFRLENBQUMsV0FBVyxFQUFFLFdBQVcsQ0FBQztnQkFDekMsaUJBQWlCLEVBQUUsU0FBUzthQUM1QixDQUFDLENBQUM7UUFDSixDQUFDO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEcsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVPLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyw4QkFBbUM7UUFDaEYsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDO1lBQ2hGLE1BQU0sdUJBQXVCLEdBQXlDLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDcEgsT0FBTyx1QkFBdUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUNqRyxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQzVCLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxLQUFLLENBQUMscUNBQXFDLENBQUMsZUFBaUM7UUFDcEYsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUMvRixNQUFNLHVCQUF1QixHQUE2QixLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzFGLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDM0QsQ0FBQztRQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUM1QixPQUFPLEVBQUUsQ0FBQztJQUNYLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyx1QkFBaUQ7UUFDN0UsT0FBTztZQUNOLGVBQWUsRUFBRSxRQUFRLENBQUMsQ0FBQyx1QkFBdUIsQ0FBQyxlQUFlLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7WUFDcEcsdUJBQXVCLEVBQUUsUUFBUSxDQUFDLENBQUMsdUJBQXVCLENBQUMsdUJBQXVCLElBQUksRUFBRSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7U0FDcEgsQ0FBQztJQUNILENBQUM7SUFFTyw2QkFBNkIsQ0FBQyxJQUFjLEVBQUUsS0FBMkIsRUFBRSxLQUFhO1FBQy9GLE1BQU0sS0FBSyxHQUFHLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDcEMsSUFBSSxLQUFLLEtBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sRUFBRSxJQUFJLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDckQsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FFRCxDQUFBO0FBM1FZLGdDQUFnQztJQVExQyxXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLGFBQWEsQ0FBQTtJQUNiLFdBQUEsZ0JBQWdCLENBQUE7SUFDaEIsV0FBQSxtQkFBbUIsQ0FBQTtHQWJULGdDQUFnQyxDQTJRNUM7O0FBRUQsaUJBQWlCLENBQUMsaUNBQWlDLEVBQUUsZ0NBQWdDLG9DQUE0QixDQUFDIn0=