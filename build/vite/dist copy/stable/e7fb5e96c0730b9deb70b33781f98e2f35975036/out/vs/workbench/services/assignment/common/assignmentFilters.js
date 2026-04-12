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
var CopilotAssignmentFilterProvider_1;
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getInternalOrg } from '../../../../platform/assignment/common/assignment.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
export var ExtensionsFilter;
(function (ExtensionsFilter) {
    /**
     * Version of the github.copilot extension.
     */
    ExtensionsFilter["CopilotExtensionVersion"] = "X-Copilot-RelatedPluginVersion-githubcopilot";
    /**
     * Version of the github.copilot-chat extension.
     */
    ExtensionsFilter["CopilotChatExtensionVersion"] = "X-Copilot-RelatedPluginVersion-githubcopilotchat";
    /**
     * Version of the completions version.
     */
    ExtensionsFilter["CompletionsVersionInCopilotChat"] = "X-VSCode-CompletionsInChatExtensionVersion";
    /**
     * SKU of the copilot entitlement.
     */
    ExtensionsFilter["CopilotSku"] = "X-GitHub-Copilot-SKU";
    /**
     * The internal org of the user.
     */
    ExtensionsFilter["MicrosoftInternalOrg"] = "X-Microsoft-Internal-Org";
    /**
     * The tracking ID of the user from Copilot entitlement API.
     */
    ExtensionsFilter["CopilotTrackingId"] = "X-Copilot-Tracking-Id";
    /**
     * Whether the `sn` flag is set to `'1'` in the copilot token.
     */
    ExtensionsFilter["CopilotIsSn"] = "X-GitHub-Copilot-IsSn";
    /**
     * Whether the `fcv1` flag is set to `'1'` in the copilot token.
     */
    ExtensionsFilter["CopilotIsFcv1"] = "X-GitHub-Copilot-IsFcv1";
})(ExtensionsFilter || (ExtensionsFilter = {}));
var StorageVersionKeys;
(function (StorageVersionKeys) {
    StorageVersionKeys["CopilotExtensionVersion"] = "extensionsAssignmentFilterProvider.copilotExtensionVersion";
    StorageVersionKeys["CopilotChatExtensionVersion"] = "extensionsAssignmentFilterProvider.copilotChatExtensionVersion";
    StorageVersionKeys["CompletionsVersion"] = "extensionsAssignmentFilterProvider.copilotCompletionsVersion";
    StorageVersionKeys["CopilotSku"] = "extensionsAssignmentFilterProvider.copilotSku";
    StorageVersionKeys["CopilotInternalOrg"] = "extensionsAssignmentFilterProvider.copilotInternalOrg";
    StorageVersionKeys["CopilotTrackingId"] = "extensionsAssignmentFilterProvider.copilotTrackingId";
    StorageVersionKeys["CopilotIsSn"] = "extensionsAssignmentFilterProvider.copilotIsSn";
    StorageVersionKeys["CopilotIsFcv1"] = "extensionsAssignmentFilterProvider.copilotIsFcv1";
})(StorageVersionKeys || (StorageVersionKeys = {}));
let CopilotAssignmentFilterProvider = CopilotAssignmentFilterProvider_1 = class CopilotAssignmentFilterProvider extends Disposable {
    constructor(_extensionService, _logService, _storageService, _chatEntitlementService, _defaultAccountService) {
        super();
        this._extensionService = _extensionService;
        this._logService = _logService;
        this._storageService = _storageService;
        this._chatEntitlementService = _chatEntitlementService;
        this._defaultAccountService = _defaultAccountService;
        this._onDidChangeFilters = this._register(new Emitter());
        this.onDidChangeFilters = this._onDidChangeFilters.event;
        this.copilotExtensionVersion = this._storageService.get(StorageVersionKeys.CopilotExtensionVersion, 0 /* StorageScope.PROFILE */);
        this.copilotChatExtensionVersion = this._storageService.get(StorageVersionKeys.CopilotChatExtensionVersion, 0 /* StorageScope.PROFILE */);
        this.copilotCompletionsVersion = this._storageService.get(StorageVersionKeys.CompletionsVersion, 0 /* StorageScope.PROFILE */);
        this.copilotSku = this._storageService.get(StorageVersionKeys.CopilotSku, 0 /* StorageScope.PROFILE */);
        this.copilotInternalOrg = this._storageService.get(StorageVersionKeys.CopilotInternalOrg, 0 /* StorageScope.PROFILE */);
        this.copilotTrackingId = this._storageService.get(StorageVersionKeys.CopilotTrackingId, 0 /* StorageScope.PROFILE */);
        this.copilotIsSn = this._storageService.get(StorageVersionKeys.CopilotIsSn, 0 /* StorageScope.PROFILE */);
        this.copilotIsFcv1 = this._storageService.get(StorageVersionKeys.CopilotIsFcv1, 0 /* StorageScope.PROFILE */);
        this._register(this._extensionService.onDidChangeExtensionsStatus(extensionIdentifiers => {
            if (extensionIdentifiers.some(identifier => ExtensionIdentifier.equals(identifier, 'github.copilot') || ExtensionIdentifier.equals(identifier, 'github.copilot-chat'))) {
                this.updateExtensionVersions();
            }
        }));
        this._register(this._chatEntitlementService.onDidChangeEntitlement(() => {
            this.updateCopilotEntitlementInfo();
        }));
        this._register(this._defaultAccountService.onDidChangeCopilotTokenInfo(() => {
            this.updateCopilotTokenInfo();
        }));
        this.updateExtensionVersions();
        this.updateCopilotEntitlementInfo();
        this.updateCopilotTokenInfo();
    }
    async updateExtensionVersions() {
        let copilotExtensionVersion;
        let copilotChatExtensionVersion;
        let copilotCompletionsVersion;
        try {
            const [copilotExtension, copilotChatExtension] = await Promise.all([
                this._extensionService.getExtension('github.copilot'),
                this._extensionService.getExtension('github.copilot-chat'),
            ]);
            copilotExtensionVersion = copilotExtension?.version;
            copilotChatExtensionVersion = copilotChatExtension?.version;
            copilotCompletionsVersion = copilotChatExtension?.completionsCoreVersion;
        }
        catch (error) {
            this._logService.error('Failed to update extension version assignments', error);
        }
        if (this.copilotCompletionsVersion === copilotCompletionsVersion &&
            this.copilotExtensionVersion === copilotExtensionVersion &&
            this.copilotChatExtensionVersion === copilotChatExtensionVersion) {
            return;
        }
        this.copilotExtensionVersion = copilotExtensionVersion;
        this.copilotChatExtensionVersion = copilotChatExtensionVersion;
        this.copilotCompletionsVersion = copilotCompletionsVersion;
        this._storageService.store(StorageVersionKeys.CopilotExtensionVersion, this.copilotExtensionVersion, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._storageService.store(StorageVersionKeys.CopilotChatExtensionVersion, this.copilotChatExtensionVersion, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._storageService.store(StorageVersionKeys.CompletionsVersion, this.copilotCompletionsVersion, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // Notify that the filters have changed.
        this._onDidChangeFilters.fire();
    }
    updateCopilotEntitlementInfo() {
        const newSku = this._chatEntitlementService.sku;
        const newTrackingId = this._chatEntitlementService.copilotTrackingId;
        const newInternalOrg = getInternalOrg(this._chatEntitlementService.organisations);
        if (this.copilotSku === newSku && this.copilotInternalOrg === newInternalOrg && this.copilotTrackingId === newTrackingId) {
            return;
        }
        this.copilotSku = newSku;
        this.copilotInternalOrg = newInternalOrg;
        this.copilotTrackingId = newTrackingId;
        this._storageService.store(StorageVersionKeys.CopilotSku, this.copilotSku, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._storageService.store(StorageVersionKeys.CopilotInternalOrg, this.copilotInternalOrg, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._storageService.store(StorageVersionKeys.CopilotTrackingId, this.copilotTrackingId, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // Notify that the filters have changed.
        this._onDidChangeFilters.fire();
    }
    updateCopilotTokenInfo() {
        const tokenInfo = this._defaultAccountService.copilotTokenInfo;
        const newIsSn = tokenInfo?.sn === '1' ? '1' : '0';
        const newIsFcv1 = tokenInfo?.fcv1 === '1' ? '1' : '0';
        if (this.copilotIsSn === newIsSn && this.copilotIsFcv1 === newIsFcv1) {
            return;
        }
        this.copilotIsSn = newIsSn;
        this.copilotIsFcv1 = newIsFcv1;
        this._storageService.store(StorageVersionKeys.CopilotIsSn, this.copilotIsSn, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        this._storageService.store(StorageVersionKeys.CopilotIsFcv1, this.copilotIsFcv1, 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        // Notify that the filters have changed.
        this._onDidChangeFilters.fire();
    }
    /**
     * Returns a version string that can be parsed by the TAS client.
     * The tas client cannot handle suffixes lke "-insider"
     * Ref: https://github.com/microsoft/tas-client/blob/30340d5e1da37c2789049fcf45928b954680606f/vscode-tas-client/src/vscode-tas-client/VSCodeFilterProvider.ts#L35
     *
     * @param version Version string to be trimmed.
    */
    static trimVersionSuffix(version) {
        const regex = /\-[a-zA-Z0-9]+$/;
        const result = version.split(regex);
        return result[0];
    }
    getFilterValue(filter) {
        switch (filter) {
            case ExtensionsFilter.CopilotExtensionVersion:
                return this.copilotExtensionVersion ? CopilotAssignmentFilterProvider_1.trimVersionSuffix(this.copilotExtensionVersion) : null;
            case ExtensionsFilter.CompletionsVersionInCopilotChat:
                return this.copilotCompletionsVersion ? CopilotAssignmentFilterProvider_1.trimVersionSuffix(this.copilotCompletionsVersion) : null;
            case ExtensionsFilter.CopilotChatExtensionVersion:
                return this.copilotChatExtensionVersion ? CopilotAssignmentFilterProvider_1.trimVersionSuffix(this.copilotChatExtensionVersion) : null;
            case ExtensionsFilter.CopilotSku:
                return this.copilotSku ?? null;
            case ExtensionsFilter.MicrosoftInternalOrg:
                return this.copilotInternalOrg ?? null;
            case ExtensionsFilter.CopilotTrackingId:
                return this.copilotTrackingId ?? null;
            case ExtensionsFilter.CopilotIsSn:
                return this.copilotIsSn ?? null;
            case ExtensionsFilter.CopilotIsFcv1:
                return this.copilotIsFcv1 ?? null;
            default:
                return null;
        }
    }
    getFilters() {
        const filters = new Map();
        const filterValues = Object.values(ExtensionsFilter);
        for (const value of filterValues) {
            filters.set(value, this.getFilterValue(value));
        }
        return filters;
    }
};
CopilotAssignmentFilterProvider = CopilotAssignmentFilterProvider_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, ILogService),
    __param(2, IStorageService),
    __param(3, IChatEntitlementService),
    __param(4, IDefaultAccountService)
], CopilotAssignmentFilterProvider);
export { CopilotAssignmentFilterProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzaWdubWVudEZpbHRlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudEZpbHRlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzNGLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRSxPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLGdEQUFnRCxDQUFDO0FBQzlHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBRTFFLE1BQU0sQ0FBTixJQUFZLGdCQXlDWDtBQXpDRCxXQUFZLGdCQUFnQjtJQUUzQjs7T0FFRztJQUNILDRGQUF3RSxDQUFBO0lBRXhFOztPQUVHO0lBQ0gsb0dBQWdGLENBQUE7SUFFaEY7O09BRUc7SUFDSCxrR0FBOEUsQ0FBQTtJQUU5RTs7T0FFRztJQUNILHVEQUFtQyxDQUFBO0lBRW5DOztPQUVHO0lBQ0gscUVBQWlELENBQUE7SUFFakQ7O09BRUc7SUFDSCwrREFBMkMsQ0FBQTtJQUUzQzs7T0FFRztJQUNILHlEQUFxQyxDQUFBO0lBRXJDOztPQUVHO0lBQ0gsNkRBQXlDLENBQUE7QUFDMUMs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