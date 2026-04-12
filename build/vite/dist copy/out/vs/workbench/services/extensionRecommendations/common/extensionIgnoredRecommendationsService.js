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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionIgnoredRecommendationsService } from './extensionRecommendations.js';
import { IWorkspaceExtensionsConfigService } from './workspaceExtensionsConfig.js';
const ignoredRecommendationsStorageKey = 'extensionsAssistant/ignored_recommendations';
let ExtensionIgnoredRecommendationsService = class ExtensionIgnoredRecommendationsService extends Disposable {
    get globalIgnoredRecommendations() { return [...this._globalIgnoredRecommendations]; }
    get ignoredRecommendations() { return distinct([...this.globalIgnoredRecommendations, ...this.ignoredWorkspaceRecommendations]); }
    constructor(workspaceExtensionsConfigService, storageService) {
        super();
        this.workspaceExtensionsConfigService = workspaceExtensionsConfigService;
        this.storageService = storageService;
        this._onDidChangeIgnoredRecommendations = this._register(new Emitter());
        this.onDidChangeIgnoredRecommendations = this._onDidChangeIgnoredRecommendations.event;
        // Global Ignored Recommendations
        this._globalIgnoredRecommendations = [];
        this._onDidChangeGlobalIgnoredRecommendation = this._register(new Emitter());
        this.onDidChangeGlobalIgnoredRecommendation = this._onDidChangeGlobalIgnoredRecommendation.event;
        // Ignored Workspace Recommendations
        this.ignoredWorkspaceRecommendations = [];
        this._globalIgnoredRecommendations = this.getCachedIgnoredRecommendations();
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, ignoredRecommendationsStorageKey, this._store)(() => this.onDidStorageChange()));
        this.initIgnoredWorkspaceRecommendations();
    }
    async initIgnoredWorkspaceRecommendations() {
        this.ignoredWorkspaceRecommendations = await this.workspaceExtensionsConfigService.getUnwantedRecommendations();
        this._onDidChangeIgnoredRecommendations.fire();
        this._register(this.workspaceExtensionsConfigService.onDidChangeExtensionsConfigs(async () => {
            this.ignoredWorkspaceRecommendations = await this.workspaceExtensionsConfigService.getUnwantedRecommendations();
            this._onDidChangeIgnoredRecommendations.fire();
        }));
    }
    toggleGlobalIgnoredRecommendation(extensionId, shouldIgnore) {
        extensionId = extensionId.toLowerCase();
        const ignored = this._globalIgnoredRecommendations.indexOf(extensionId) !== -1;
        if (ignored === shouldIgnore) {
            return;
        }
        this._globalIgnoredRecommendations = shouldIgnore ? [...this._globalIgnoredRecommendations, extensionId] : this._globalIgnoredRecommendations.filter(id => id !== extensionId);
        this.storeCachedIgnoredRecommendations(this._globalIgnoredRecommendations);
        this._onDidChangeGlobalIgnoredRecommendation.fire({ extensionId, isRecommended: !shouldIgnore });
        this._onDidChangeIgnoredRecommendations.fire();
    }
    getCachedIgnoredRecommendations() {
        const ignoredRecommendations = JSON.parse(this.ignoredRecommendationsValue);
        return ignoredRecommendations.map(e => e.toLowerCase());
    }
    onDidStorageChange() {
        if (this.ignoredRecommendationsValue !== this.getStoredIgnoredRecommendationsValue() /* This checks if current window changed the value or not */) {
            this._ignoredRecommendationsValue = undefined;
            this._globalIgnoredRecommendations = this.getCachedIgnoredRecommendations();
            this._onDidChangeIgnoredRecommendations.fire();
        }
    }
    storeCachedIgnoredRecommendations(ignoredRecommendations) {
        this.ignoredRecommendationsValue = JSON.stringify(ignoredRecommendations);
    }
    get ignoredRecommendationsValue() {
        if (!this._ignoredRecommendationsValue) {
            this._ignoredRecommendationsValue = this.getStoredIgnoredRecommendationsValue();
        }
        return this._ignoredRecommendationsValue;
    }
    set ignoredRecommendationsValue(ignoredRecommendationsValue) {
        if (this.ignoredRecommendationsValue !== ignoredRecommendationsValue) {
            this._ignoredRecommendationsValue = ignoredRecommendationsValue;
            this.setStoredIgnoredRecommendationsValue(ignoredRecommendationsValue);
        }
    }
    getStoredIgnoredRecommendationsValue() {
        return this.storageService.get(ignoredRecommendationsStorageKey, 0 /* StorageScope.PROFILE */, '[]');
    }
    setStoredIgnoredRecommendationsValue(value) {
        this.storageService.store(ignoredRecommendationsStorageKey, value, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
    }
};
ExtensionIgnoredRecommendationsService = __decorate([
    __param(0, IWorkspaceExtensionsConfigService),
    __param(1, IStorageService)
], ExtensionIgnoredRecommendationsService);
export { ExtensionIgnoredRecommendationsService };
registerSingleton(IExtensionIgnoredRecommendationsService, ExtensionIgnoredRecommendationsService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsdUNBQXVDLEVBQTJDLE1BQU0sK0JBQStCLENBQUM7QUFDakksT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFbkYsTUFBTSxnQ0FBZ0MsR0FBRyw2Q0FBNkMsQ0FBQztBQUVoRixJQUFNLHNDQUFzQyxHQUE1QyxNQUFNLHNDQUF1QyxTQUFRLFVBQVU7SUFTckUsSUFBSSw0QkFBNEIsS0FBZSxPQUFPLENBQUMsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFPaEcsSUFBSSxzQkFBc0IsS0FBZSxPQUFPLFFBQVEsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLDRCQUE0QixFQUFFLEdBQUcsSUFBSSxDQUFDLCtCQUErQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFNUksWUFDb0MsZ0NBQW9GLEVBQ3RHLGNBQWdEO1FBRWpFLEtBQUss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