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
import { EXTENSION_IDENTIFIER_PATTERN } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { distinct, equals } from '../../../../base/common/arrays.js';
import { ExtensionRecommendations } from './extensionRecommendations.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { Emitter } from '../../../../base/common/event.js';
import { IWorkspaceExtensionsConfigService } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
const WORKSPACE_EXTENSIONS_FOLDER = '.vscode/extensions';
let WorkspaceRecommendations = class WorkspaceRecommendations extends ExtensionRecommendations {
    get recommendations() { return this._recommendations; }
    get ignoredRecommendations() { return this._ignoredRecommendations; }
    constructor(workspaceExtensionsConfigService, contextService, uriIdentityService, fileService, workbenchExtensionManagementService, notificationService) {
        super();
        this.workspaceExtensionsConfigService = workspaceExtensionsConfigService;
        this.contextService = contextService;
        this.uriIdentityService = uriIdentityService;
        this.fileService = fileService;
        this.workbenchExtensionManagementService = workbenchExtensionManagementService;
        this.notificationService = notificationService;
        this._recommendations = [];
        this._onDidChangeRecommendations = this._register(new Emitter());
        this.onDidChangeRecommendations = this._onDidChangeRecommendations.event;
        this._ignoredRecommendations = [];
        this.workspaceExtensions = [];
        this.onDidChangeWorkspaceExtensionsScheduler = this._register(new RunOnceScheduler(() => this.onDidChangeWorkspaceExtensionsFolders(), 1000));
    }
    async doActivate() {
        this.workspaceExtensions = await this.fetchWorkspaceExtensions();
        await this.fetch();
        this._register(this.workspaceExtensionsConfigService.onDidChangeExtensionsConfigs(() => this.onDidChangeExtensionsConfigs()));
        for (const folder of this.contextService.getWorkspace().folders) {
            this._register(this.fileService.watch(this.uriIdentityService.extUri.joinPath(folder.uri, WORKSPACE_EXTENSIONS_FOLDER)));
        }
        this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.onDidChangeWorkspaceExtensionsScheduler.schedule()));
        this._register(this.fileService.onDidFilesChange(e => {
            if (this.contextService.getWorkspace().folders.some(folder => e.affects(this.uriIdentityService.extUri.joinPath(folder.uri, WORKSPACE_EXTENSIONS_FOLDER), 1 /* FileChangeType.ADDED */, 2 /* FileChangeType.DELETED */))) {
                this.onDidChangeWorkspaceExtensionsScheduler.schedule();
            }
        }));
    }
    async onDidChangeWorkspaceExtensionsFolders() {
        const existing = this.workspaceExtensions;
        this.workspaceExtensions = await this.fetchWorkspaceExtensions();
        if (!equals(existing, this.workspaceExtensions, (a, b) => this.uriIdentityService.extUri.isEqual(a, b))) {
            this.onDidChangeExtensionsConfigs();
        }
    }
    async fetchWorkspaceExtensions() {
        const workspaceExtensions = [];
        for (const workspaceFolder of this.contextService.getWorkspace().folders) {
            const extensionsLocaiton = this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_EXTENSIONS_FOLDER);
            try {
                const stat = await this.fileService.resolve(extensionsLocaiton);
                for (const extension of stat.children ?? []) {
                    if (!extension.isDirectory) {
                        continue;
                    }
                    workspaceExtensions.push(extension.resource);
                }
            }
            catch (error) {
                // ignore
            }
        }
        if (workspaceExtensions.length) {
            const resourceExtensions = await this.workbenchExtensionManagementService.getExtensions(workspaceExtensions);
            return resourceExtensions.map(extension => extension.location);
        }
        return [];
    }
    /**
     * Parse all extensions.json files, fetch workspace recommendations, filter out invalid and unwanted ones
     */
    async fetch() {
        const extensionsConfigs = await this.workspaceExtensionsConfigService.getExtensionsConfigs();
        const { invalidRecommendations, message } = await this.validateExtensions(extensionsConfigs);
        if (invalidRecommendations.length) {
            this.notificationService.warn(`The ${invalidRecommendations.length} extension(s) below, in workspace recommendations have issues:\n${message}`);
        }
        this._recommendations = [];
        this._ignoredRecommendations = [];
        for (const extensionsConfig of extensionsConfigs) {
            if (extensionsConfig.unwantedRecommendations) {
                for (const unwantedRecommendation of extensionsConfig.unwantedRecommendations) {
                    if (invalidRecommendations.indexOf(unwantedRecommendation) === -1) {
                        this._ignoredRecommendations.push(unwantedRecommendation);
                    }
                }
            }
            if (extensionsConfig.recommendations) {
                for (const extensionId of extensionsConfig.recommendations) {
                    if (invalidRecommendations.indexOf(extensionId) === -1) {
                        this._recommendations.push({
                            extension: extensionId,
                            reason: {
                                reasonId: 0 /* ExtensionRecommendationReason.Workspace */,
                                reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
                            }
                        });
                    }
                }
            }
        }
        for (const extension of this.workspaceExtensions) {
            this._recommendations.push({
                extension,
                reason: {
                    reasonId: 0 /* ExtensionRecommendationReason.Workspace */,
                    reasonText: localize('workspaceRecommendation', "This extension is recommended by users of the current workspace.")
                }
            });
        }
    }
    async validateExtensions(contents) {
        const validExtensions = [];
        const invalidExtensions = [];
        let message = '';
        const allRecommendations = distinct(contents.flatMap(({ recommendations }) => recommendations || []));
        const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
        for (const extensionId of allRecommendations) {
            if (regEx.test(extensionId)) {
                validExtensions.push(extensionId);
            }
            else {
                invalidExtensions.push(extensionId);
                message += `${extensionId} (bad format) Expected: <provider>.<name>\n`;
            }
        }
        return { validRecommendations: validExtensions, invalidRecommendations: invalidExtensions, message };
    }
    async onDidChangeExtensionsConfigs() {
        await this.fetch();
        this._onDidChangeRecommendations.fire();
    }
};
WorkspaceRecommendations = __decorate([
    __param(0, IWorkspaceExtensionsConfigService),
    __param(1, IWorkspaceContextService),
    __param(2, IUriIdentityService),
    __param(3, IFileService),
    __param(4, IWorkbenchExtensionManagementService),
    __param(5, INotificationService)
], WorkspaceRecommendations);
export { WorkspaceRecommendations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlUmVjb21tZW5kYXRpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZXh0ZW5zaW9ucy9icm93c2VyL3dvcmtzcGFjZVJlY29tbWVuZGF0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUN0SCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx3QkFBd0IsRUFBMkIsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBNEIsaUNBQWlDLEVBQUUsTUFBTSxnRkFBZ0YsQ0FBQztBQUM3SixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM3RixPQUFPLEVBQWtCLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRTFGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxvQ0FBb0MsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRTNILE1BQU0sMkJBQTJCLEdBQUcsb0JBQW9CLENBQUM7QUFFbEQsSUFBTSx3QkFBd0IsR0FBOUIsTUFBTSx3QkFBeUIsU0FBUSx3QkFBd0I7SUFHckUsSUFBSSxlQUFlLEtBQTZDLE9BQU8sSUFBSSxDQUFDLGdC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