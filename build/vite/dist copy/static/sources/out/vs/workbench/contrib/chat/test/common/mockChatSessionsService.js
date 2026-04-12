/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Target } from '../../common/promptSyntax/promptTypes.js';
export class MockChatSessionsService {
    constructor() {
        this._onDidChangeSessionOptions = new Emitter();
        this.onDidChangeSessionOptions = this._onDidChangeSessionOptions.event;
        this._onDidChangeItemsProviders = new Emitter();
        this.onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;
        this._onDidChangeSessionItems = new Emitter();
        this.onDidChangeSessionItems = this._onDidChangeSessionItems.event;
        this._onDidChangeAvailability = new Emitter();
        this.onDidChangeAvailability = this._onDidChangeAvailability.event;
        this._onDidChangeInProgress = new Emitter();
        this.onDidChangeInProgress = this._onDidChangeInProgress.event;
        this._onDidChangeContentProviderSchemes = new Emitter();
        this.onDidChangeContentProviderSchemes = this._onDidChangeContentProviderSchemes.event;
        this._onDidChangeOptionGroups = new Emitter();
        this.onDidChangeOptionGroups = this._onDidChangeOptionGroups.event;
        this._onDidCommitSession = new Emitter();
        this.onDidCommitSession = this._onDidCommitSession.event;
        this.sessionItemControllers = new Map();
        this.contentProviders = new Map();
        this.contributions = [];
        this.optionGroups = new Map();
        this.sessionOptions = new ResourceMap();
        this.inProgress = new Map();
        this._onDidChangeCustomizations = new Emitter();
        this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    }
    // For testing: allow triggering events
    fireDidChangeItemsProviders(event) {
        this._onDidChangeItemsProviders.fire(event);
    }
    fireDidChangeSessionItems(event) {
        this._onDidChangeSessionItems.fire(event);
    }
    fireDidChangeAvailability() {
        this._onDidChangeAvailability.fire();
    }
    fireDidChangeInProgress() {
        this._onDidChangeInProgress.fire();
    }
    registerChatSessionItemController(chatSessionType, controller) {
        this.sessionItemControllers.set(chatSessionType, { controller, initialRefresh: controller.refresh(CancellationToken.None) });
        return {
            dispose: () => {
                this.sessionItemControllers.delete(chatSessionType);
            }
        };
    }
    getRegisteredChatSessionItemProviders() {
        return Array.from(this.sessionItemControllers.keys());
    }
    getAllChatSessionContributions() {
        return this.contributions.map(contribution => this.resolveContribution(contribution));
    }
    getChatSessionContribution(chatSessionType) {
        const contribution = this.contributions.find(c => c.type === chatSessionType);
        if (!contribution) {
            return undefined;
        }
        return this.resolveContribution(contribution);
    }
    resolveContribution(contribution) {
        return {
            ...contribution,
            icon: contribution.icon && typeof contribution.icon === 'string' ? ThemeIcon.fromId(contribution.icon) : undefined,
        };
    }
    setContributions(contributions) {
        this.contributions = contributions;
    }
    async activateChatSessionItemProvider(chatSessionType) {
        // Noop, nothing to activate
    }
    async *getChatSessionItems(providerTypeFilter, token) {
        for (const [chatSessionType, controllerEntry] of this.sessionItemControllers.entries()) {
            if (!providerTypeFilter || providerTypeFilter.includes(chatSessionType)) {
                await controllerEntry.initialRefresh; // ensure initial refresh is done
                yield {
                    chatSessionType: chatSessionType,
                    items: controllerEntry.controller.items
                };
            }
        }
    }
    async refreshChatSessionItems(providerTypeFilter, token) {
        await Promise.all(Array.from(this.sessionItemControllers.entries())
            .filter(([chatSessionType]) => !providerTypeFilter || providerTypeFilter.includes(chatSessionType))
            .map(async ([_chatSessionType, controllerEntry]) => {
            await controllerEntry.controller.refresh(token);
        }));
    }
    getInProgress() {
        return Array.from(this.inProgress.entries()).map(([chatSessionType, count]) => ({ chatSessionType, count }));
    }
    registerChatSessionContentProvider(chatSessionType, provider) {
        this.contentProviders.set(chatSessionType, provider);
        this._onDidChangeContentProviderSchemes.fire({ added: [chatSessionType], removed: [] });
        return {
            dispose: () => {
                this.contentProviders.delete(chatSessionType);
            }
        };
    }
    async canResolveContentProvider(chatSessionType) {
        return this.contentProviders.has(chatSessionType);
    }
    async getOrCreateChatSession(sessionResource, token) {
        const provider = this.contentProviders.get(sessionResource.scheme);
        if (!provider) {
            throw new Error(`No content provider for ${sessionResource.scheme}`);
        }
        return provider.provideChatSessionContent(sessionResource, token);
    }
    async canResolveChatSession(sessionType) {
        return this.contentProviders.has(sessionType);
    }
    getOptionGroupsForSessionType(chatSessionType) {
        return this.optionGroups.get(chatSessionType);
    }
    setOptionGroupsForSessionType(chatSessionType, handle, optionGroups) {
        if (optionGroups) {
            this.optionGroups.set(chatSessionType, optionGroups);
        }
        else {
            this.optionGroups.delete(chatSessionType);
        }
    }
    async getNewChatSessionInputState(_chatSessionType) {
        return undefined;
    }
    getSessionOptions(sessionResource) {
        const options = this.sessionOptions.get(sessionResource);
        return options && options.size > 0 ? options : undefined;
    }
    getSessionOption(sessionResource, optionId) {
        const value = this.sessionOptions.get(sessionResource)?.get(optionId);
        return typeof value === 'string' ? value : value?.id;
    }
    setSessionOption(sessionResource, optionId, value) {
        return this.updateSessionOptions(sessionResource, new Map([[optionId, value]]));
    }
    updateSessionOptions(sessionResource, updates) {
        if (!this.sessionOptions.has(sessionResource)) {
            this.sessionOptions.set(sessionResource, new Map());
        }
        for (const [optionId, value] of updates) {
            this.sessionOptions.get(sessionResource).set(optionId, value);
        }
        this._onDidChangeSessionOptions.fire({ sessionResource, updates });
        return true;
    }
    getCapabilitiesForSessionType(chatSessionType) {
        return this.contributions.find(c => c.type === chatSessionType)?.capabilities;
    }
    getCustomAgentTargetForSessionType(chatSessionType) {
        return this.contributions.find(c => c.type === chatSessionType)?.customAgentTarget ?? Target.Undefined;
    }
    requiresCustomModelsForSessionType(chatSessionType) {
        return this.contributions.find(c => c.type === chatSessionType)?.requiresCustomModels ?? false;
    }
    supportsDelegationForSessionType(chatSessionType) {
        return this.contributions.find(c => c.type === chatSessionType)?.supportsDelegation !== false;
    }
    sessionSupportsFork(_sessionResource) {
        return false;
    }
    async forkChatSession(_sessionResource, _request, _token) {
        throw new Error('Not implemented');
    }
    getContentProviderSchemes() {
        return Array.from(this.contentProviders.keys());
    }
    async createNewChatSessionItem(_chatSessionType, _request, _token) {
        return undefined;
    }
    registerSessionResourceAlias(_untitledResource, _realResource) {
        // noop
    }
    fireSessionCommitted(_original, _committed) {
        // noop
    }
    registerChatSessionContribution(contribution) {
        this.contributions.push(contribution);
        return {
            dispose: () => {
                const idx = this.contributions.indexOf(contribution);
                if (idx >= 0) {
                    this.contributions.splice(idx, 1);
                }
            }
        };
    }
    registerCustomizationsProvider(_chatSessionType, _provider) {
        return { dispose: () => { } };
    }
    hasCustomizationsProvider(_chatSessionType) {
        return false;
    }
    async getCustomizations(_chatSessionType, _token) {
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L3Rlc3QvY29tbW9uL21vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUU5RCxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBSXBFLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVsRSxNQUFNLE9BQU8sdUJBQXVCO0lBQXBDO1FBR2tCLCtCQUEwQixHQUFHLElBQUksT0FBTyxFQUFrQyxDQUFDO1FBQ25GLDhCQUF5QixHQUFHLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUM7UUFFMUQsK0JBQTBCLEdBQUcsSUFBSSxPQUFPLEVBQXdDLENBQUM7UUFDekYsOEJBQXlCLEdBQUcsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQztRQUUxRCw2QkFBd0IsR0FBRyxJQUFJLE9BQU8sRUFBMEIsQ0FBQztRQUN6RSw0QkFBdUIsR0FBRyxJQUFJLENBQUMsd0JBQXdCLENBQUMsS0FBSyxDQUFDO1FBRXRELDZCQUF3QixHQUFHLElBQUksT0FBTyxFQUFRLENBQUM7UUFDdkQsNEJBQXVCLEdBQUcsSUFBSSxDQUFDLHdCQUF3QixDQUFDLEtBQUssQ0FBQztRQUV0RCwyQkFBc0IsR0FBRyxJQUFJLE9BQU8sRUFBUSxDQUFDO1FBQ3JELDBCQUFxQixHQUFHLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxL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