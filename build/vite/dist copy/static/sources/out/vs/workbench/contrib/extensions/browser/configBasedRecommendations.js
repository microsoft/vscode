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
import { IExtensionTipsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionRecommendations } from './extensionRecommendations.js';
import { localize } from '../../../../nls.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Emitter } from '../../../../base/common/event.js';
let ConfigBasedRecommendations = class ConfigBasedRecommendations extends ExtensionRecommendations {
    get otherRecommendations() { return this._otherRecommendations; }
    get importantRecommendations() { return this._importantRecommendations; }
    get recommendations() { return [...this.importantRecommendations, ...this.otherRecommendations]; }
    constructor(extensionTipsService, workspaceContextService) {
        super();
        this.extensionTipsService = extensionTipsService;
        this.workspaceContextService = workspaceContextService;
        this.importantTips = [];
        this.otherTips = [];
        this._onDidChangeRecommendations = this._register(new Emitter());
        this.onDidChangeRecommendations = this._onDidChangeRecommendations.event;
        this._otherRecommendations = [];
        this._importantRecommendations = [];
    }
    async doActivate() {
        await this.fetch();
        this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
    }
    async fetch() {
        const workspace = this.workspaceContextService.getWorkspace();
        const importantTips = new Map();
        const otherTips = new Map();
        for (const folder of workspace.folders) {
            const configBasedTips = await this.extensionTipsService.getConfigBasedTips(folder.uri);
            for (const tip of configBasedTips) {
                if (tip.important) {
                    importantTips.set(tip.extensionId, tip);
                }
                else {
                    otherTips.set(tip.extensionId, tip);
                }
            }
        }
        this.importantTips = [...importantTips.values()];
        this.otherTips = [...otherTips.values()].filter(tip => !importantTips.has(tip.extensionId));
        this._otherRecommendations = this.otherTips.map(tip => this.toExtensionRecommendation(tip));
        this._importantRecommendations = this.importantTips.map(tip => this.toExtensionRecommendation(tip));
    }
    async onWorkspaceFoldersChanged(event) {
        if (event.added.length) {
            const oldImportantRecommended = this.importantTips;
            await this.fetch();
            // Suggest only if at least one of the newly added recommendations was not suggested before
            if (this.importantTips.some(current => oldImportantRecommended.every(old => current.extensionId !== old.extensionId))) {
                this._onDidChangeRecommendations.fire();
            }
        }
    }
    toExtensionRecommendation(tip) {
        return {
            extension: tip.extensionId,
            reason: {
                reasonId: 3 /* ExtensionRecommendationReason.WorkspaceConfig */,
                reasonText: localize('exeBasedRecommendation', "This extension is recommended because of the current workspace configuration")
            },
            whenNotInstalled: tip.whenNotInstalled
        };
    }
};
ConfigBasedRecommendations = __decorate([
    __param(0, IExtensionTipsService),
    __param(1, IWorkspaceContextService)
], ConfigBasedRecommendations);
export { ConfigBasedRecommendations };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2Jyb3dzZXIvY29uZmlnQmFzZWRSZWNvbW1lbmRhdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLHFCQUFxQixFQUE0QixNQUFNLHdFQUF3RSxDQUFDO0FBQ3pJLE9BQU8sRUFBRSx3QkFBd0IsRUFBMkIsTUFBTSwrQkFBK0IsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLHdCQUF3QixFQUFnQyxNQUFNLG9EQUFvRCxDQUFDO0FBQzVILE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUlwRCxJQUFNLDBCQUEwQixHQUFoQyxNQUFNLDBCQUEyQixTQUFRLHdCQUF3QjtJQVN2RSxJQUFJLG9CQUFvQixLQUF3RCxPQUFPLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLENBQUM7SUFHcEgsSUFBSSx3QkFBd0IsS0FBd0QsT0FBTyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQyxDQUFDO0lBRTVILElBQUksZUFBZSxLQUF3RCxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFckosWUFDd0Isb0JBQTRELEVBQ3pELHVCQUFrRTtRQUU1RixLQUFLLEVBQUUsQ0FBQztRQUhnQyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQXVCO1FBQ3hDLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFoQnJGLGtCQUFhLEdBQStCLEVBQUUsQ0FBQztRQUMvQyxjQUFTLEdBQStCLEVBQUUs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