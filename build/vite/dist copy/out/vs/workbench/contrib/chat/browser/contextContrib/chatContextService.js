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
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { score } from '../../../../../editor/common/languageSelector.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatContextPickService } from '../attachments/chatContextPickService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/resources.js';
export const IChatContextService = createDecorator('chatContextService');
let ChatContextService = class ChatContextService extends Disposable {
    constructor(_contextPickService, _extensionService) {
        super();
        this._contextPickService = _contextPickService;
        this._extensionService = _extensionService;
        this._providers = new Map();
        this._workspaceContext = new Map();
        this._registeredPickers = this._register(new DisposableMap());
        this._lastResourceContext = new Map();
    }
    setExecuteCommandCallback(callback) {
        this._executeCommandCallback = callback;
    }
    async executeChatContextItemCommand(handle) {
        if (!this._executeCommandCallback) {
            return;
        }
        await this._executeCommandCallback(handle);
    }
    setChatContextProvider(id, picker) {
        const providerEntry = this._providers.get(id) ?? {};
        providerEntry.picker = picker;
        this._providers.set(id, providerEntry);
        this._registerWithPickService(id);
    }
    _registerWithPickService(id) {
        const providerEntry = this._providers.get(id);
        if (!providerEntry || !providerEntry.picker || !providerEntry.explicitProvider) {
            return;
        }
        const title = `${providerEntry.picker.title.replace(/\.+$/, '')}...`;
        this._registeredPickers.set(id, this._contextPickService.registerChatContextItem(this._asPicker(title, providerEntry.picker.icon, id)));
    }
    registerChatWorkspaceContextProvider(id, provider) {
        const providerEntry = this._providers.get(id) ?? {};
        providerEntry.workspaceProvider = provider;
        this._providers.set(id, providerEntry);
    }
    registerChatExplicitContextProvider(id, provider) {
        const providerEntry = this._providers.get(id) ?? {};
        providerEntry.explicitProvider = provider;
        this._providers.set(id, providerEntry);
        this._registerWithPickService(id);
    }
    registerChatResourceContextProvider(id, selector, provider) {
        const providerEntry = this._providers.get(id) ?? {};
        providerEntry.resourceProvider = { selector, provider };
        this._providers.set(id, providerEntry);
    }
    unregisterChatContextProvider(id) {
        this._providers.delete(id);
        this._registeredPickers.deleteAndDispose(id);
    }
    updateWorkspaceContextItems(id, items) {
        this._workspaceContext.set(id, items);
    }
    getWorkspaceContextItems() {
        const items = [];
        for (const workspaceContexts of this._workspaceContext.values()) {
            for (const item of workspaceContexts) {
                if (!item.value) {
                    continue;
                }
                // Derive label from resourceUri if label is not set
                const derivedLabel = item.label ?? (item.resourceUri ? basename(item.resourceUri) : 'Unknown');
                items.push({
                    value: item.value,
                    name: derivedLabel,
                    modelDescription: item.modelDescription,
                    id: derivedLabel,
                    kind: 'workspace'
                });
            }
        }
        return items;
    }
    async contextForResource(uri, language) {
        return this._contextForResource(uri, false, language);
    }
    async _contextForResource(uri, withValue, language) {
        const scoredProviders = [];
        for (const providerEntry of this._providers.values()) {
            if (!providerEntry.resourceProvider) {
                continue;
            }
            const matchScore = score(providerEntry.resourceProvider.selector, uri, language ?? '', true, undefined, undefined);
            scoredProviders.push({ score: matchScore, provider: providerEntry.resourceProvider.provider });
        }
        scoredProviders.sort((a, b) => b.score - a.score);
        if (scoredProviders.length === 0 || scoredProviders[0].score <= 0) {
            return;
        }
        const provider = scoredProviders[0].provider;
        const context = (await provider.provideChatContext(uri, withValue, CancellationToken.None));
        if (!context) {
            return;
        }
        // Derive label from resourceUri if label is not set
        const effectiveResourceUri = context.resourceUri ?? uri;
        const derivedLabel = context.label ?? basename(effectiveResourceUri);
        const contextValue = {
            value: undefined,
            name: derivedLabel,
            icon: context.icon,
            uri: uri,
            resourceUri: context.resourceUri,
            modelDescription: context.modelDescription,
            tooltip: context.tooltip,
            commandId: context.command?.id,
            handle: context.handle
        };
        this._lastResourceContext.clear();
        this._lastResourceContext.set(contextValue, { originalItem: context, provider });
        return contextValue;
    }
    async resolveChatContext(context, language) {
        if (context.value !== undefined) {
            return context;
        }
        const item = this._lastResourceContext.get(context);
        if (!item) {
            const resolved = await this._contextForResource(context.uri, true, language);
            context.value = resolved?.value;
            context.modelDescription = resolved?.modelDescription;
            context.tooltip = resolved?.tooltip;
            return context;
        }
        else {
            const resolved = await item.provider.resolveChatContext(item.originalItem, CancellationToken.None);
            if (resolved) {
                context.value = resolved.value;
                context.modelDescription = resolved.modelDescription;
                context.tooltip = resolved.tooltip;
                return context;
            }
        }
        return context;
    }
    _asPicker(title, icon, id) {
        const asPicker = () => {
            let providerEntry = this._providers.get(id);
            if (!providerEntry) {
                throw new Error('No chat context provider registered');
            }
            const picks = async () => {
                if (providerEntry && !providerEntry.explicitProvider) {
                    // Activate the extension providing the chat context provider
                    await this._extensionService.activateByEvent(`onChatContextProvider:${id}`);
                    providerEntry = this._providers.get(id);
                    if (!providerEntry?.explicitProvider) {
                        return [];
                    }
                }
                const results = await providerEntry?.explicitProvider.provideChatContext(CancellationToken.None);
                return results || [];
            };
            return {
                picks: picks().then(items => {
                    return items.map(item => {
                        // Derive label from resourceUri if label is not set
                        const derivedLabel = item.label ?? (item.resourceUri ? basename(item.resourceUri) : 'Unknown');
                        return {
                            label: derivedLabel,
                            iconClass: item.icon ? ThemeIcon.asClassName(item.icon) : undefined,
                            asAttachment: async () => {
                                let contextValue = item;
                                if ((contextValue.value === undefined) && providerEntry?.explicitProvider) {
                                    contextValue = await providerEntry.explicitProvider.resolveChatContext(item, CancellationToken.None);
                                }
                                // Derive label from resourceUri if label is not set
                                const resolvedLabel = contextValue.label ?? (contextValue.resourceUri ? basename(contextValue.resourceUri) : 'Unknown');
                                return {
                                    kind: 'generic',
                                    id: resolvedLabel,
                                    name: resolvedLabel,
                                    icon: contextValue.icon,
                                    value: contextValue.value,
                                };
                            }
                        };
                    });
                }),
                placeholder: title
            };
        };
        const picker = {
            asPicker,
            type: 'pickerPick',
            label: title,
            icon
        };
        return picker;
    }
};
ChatContextService = __decorate([
    __param(0, IChatContextPickService),
    __param(1, IExtensionService)
], ChatContextService);
export { ChatContextService };
registerSingleton(IChatContextService, ChatContextService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdENvbnRleHRTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NvbnRleHRDb250cmliL2NoYXRDb250ZXh0U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEUsT0FBTyxFQUFvQixLQUFLLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUMzRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDaEcsT0FBTyxFQUE4Qyx1QkFBdUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRS9ILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRS9FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3pGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNsSCxPQUFPLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBZSxNQUFNLHlDQUF5QyxDQUFDO0FBRWpHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVuRSxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQXNCLG9CQUFvQixDQUFDLENBQUM7QUFjdkYsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFVO0lBU2pELFlBQzBCLG1CQUE2RCxFQUNuRSxpQkFBcUQ7UUFFeEUsS0FBSyxFQUFFLENBQUM7UUFIa0Msd0JBQW1CLEdBQW5CLG1CQUFtQixDQUF5QjtRQUNsRCxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW1CO1FBUnhELGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBcUMsQ0FBQztR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