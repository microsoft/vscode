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
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI } from '../../../base/common/uri.js';
import { MainContext } from './extHost.protocol.js';
import { DocumentSelector, MarkdownString } from './extHostTypeConverters.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IExtHostCommands } from './extHostCommands.js';
let ExtHostChatContext = class ExtHostChatContext extends Disposable {
    constructor(extHostRpc, _commands) {
        super();
        this._commands = _commands;
        this._handlePool = 0;
        this._providers = new Map();
        this._itemPool = 0;
        /** Global map of itemHandle -> original item for command execution with reference equality */
        this._globalItems = new Map();
        /** Track which items belong to which provider for cleanup */
        this._providerItems = new Map(); // providerHandle -> Set<itemHandle>
        this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatContext);
    }
    // Workspace context provider methods
    async $provideWorkspaceChatContext(handle, token) {
        this._clearProviderItems(handle);
        const entry = this._providers.get(handle);
        if (!entry || entry.type !== 'workspace') {
            throw new Error('Workspace context provider not found');
        }
        const provider = entry.provider;
        const result = (await provider.provideWorkspaceChatContext?.(token)) ?? (await provider.provideChatContext?.(token)) ?? [];
        return this._convertItems(handle, result);
    }
    // Explicit context provider methods
    async $provideExplicitChatContext(handle, token) {
        this._clearProviderItems(handle);
        const entry = this._providers.get(handle);
        if (!entry || entry.type !== 'explicit') {
            throw new Error('Explicit context provider not found');
        }
        const provider = entry.provider;
        const result = (await provider.provideExplicitChatContext?.(token)) ?? (await provider.provideChatContext?.(token)) ?? [];
        return this._convertItems(handle, result);
    }
    async $resolveExplicitChatContext(handle, context, token) {
        const entry = this._providers.get(handle);
        if (!entry || entry.type !== 'explicit') {
            throw new Error('Explicit context provider not found');
        }
        const provider = entry.provider;
        const extItem = this._globalItems.get(context.handle);
        if (!extItem) {
            throw new Error('Chat context item not found');
        }
        return this._doResolve((provider.resolveExplicitChatContext ?? provider.resolveChatContext)?.bind(provider), context, extItem, token);
    }
    // Resource context provider methods
    async $provideResourceChatContext(handle, options, token) {
        const entry = this._providers.get(handle);
        if (!entry || entry.type !== 'resource') {
            throw new Error('Resource context provider not found');
        }
        const provider = entry.provider;
        const result = (await provider.provideResourceChatContext?.({ resource: URI.revive(options.resource) }, token)) ?? (await provider.provideChatContext?.({ resource: URI.revive(options.resource) }, token));
        if (!result) {
            return undefined;
        }
        if (result.label === undefined && result.resourceUri === undefined) {
            throw new Error('ChatContextItem must have either a label or a resourceUri');
        }
        const itemHandle = this._addTrackedItem(handle, result);
        const item = {
            handle: itemHandle,
            icon: result.icon,
            label: result.label,
            resourceUri: result.resourceUri,
            modelDescription: result.modelDescription,
            tooltip: result.tooltip ? MarkdownString.from(result.tooltip) : undefined,
            value: options.withValue ? result.value : undefined,
            command: result.command ? { id: result.command.command } : undefined
        };
        if (options.withValue && !item.value) {
            const resolved = await (provider.resolveResourceChatContext ?? provider.resolveChatContext)?.bind(provider)(result, token);
            item.value = resolved?.value;
            item.tooltip = resolved?.tooltip ? MarkdownString.from(resolved.tooltip) : item.tooltip;
        }
        return item;
    }
    async $resolveResourceChatContext(handle, context, token) {
        const entry = this._providers.get(handle);
        if (!entry || entry.type !== 'resource') {
            throw new Error('Resource context provider not found');
        }
        const provider = entry.provider;
        const extItem = this._globalItems.get(context.handle);
        if (!extItem) {
            throw new Error('Chat context item not found');
        }
        return this._doResolve((provider.resolveResourceChatContext ?? provider.resolveChatContext)?.bind(provider), context, extItem, token);
    }
    // Command execution
    async $executeChatContextItemCommand(itemHandle) {
        const extItem = this._globalItems.get(itemHandle);
        if (!extItem) {
            throw new Error('Chat context item not found');
        }
        if (!extItem.command) {
            throw new Error('Chat context item has no command');
        }
        // Execute the command with the original extension item as an argument (reference equality)
        const args = extItem.command.arguments ? [extItem, ...extItem.command.arguments] : [extItem];
        await this._commands.executeCommand(extItem.command.command, ...args);
    }
    // Registration methods
    registerChatWorkspaceContextProvider(id, provider) {
        const handle = this._handlePool++;
        const disposables = new DisposableStore();
        this._providers.set(handle, { type: 'workspace', provider, disposables });
        this._listenForWorkspaceContextChanges(handle, provider, disposables);
        this._proxy.$registerChatWorkspaceContextProvider(handle, id);
        return {
            dispose: () => {
                this._providers.delete(handle);
                this._clearProviderItems(handle);
                this._providerItems.delete(handle);
                this._proxy.$unregisterChatContextProvider(handle);
                disposables.dispose();
            }
        };
    }
    registerChatExplicitContextProvider(id, provider) {
        const handle = this._handlePool++;
        const disposables = new DisposableStore();
        this._providers.set(handle, { type: 'explicit', provider, disposables });
        this._proxy.$registerChatExplicitContextProvider(handle, id);
        return {
            dispose: () => {
                this._providers.delete(handle);
                this._clearProviderItems(handle);
                this._providerItems.delete(handle);
                this._proxy.$unregisterChatContextProvider(handle);
                disposables.dispose();
            }
        };
    }
    registerChatResourceContextProvider(selector, id, provider) {
        const handle = this._handlePool++;
        const disposables = new DisposableStore();
        this._providers.set(handle, { type: 'resource', provider, disposables });
        this._proxy.$registerChatResourceContextProvider(handle, id, DocumentSelector.from(selector));
        return {
            dispose: () => {
                this._providers.delete(handle);
                this._clearProviderItems(handle);
                this._providerItems.delete(handle);
                this._proxy.$unregisterChatContextProvider(handle);
                disposables.dispose();
            }
        };
    }
    /**
     * @deprecated Use registerChatWorkspaceContextProvider, registerChatExplicitContextProvider, or registerChatResourceContextProvider instead.
     */
    registerChatContextProvider(selector, id, provider) {
        const disposables = [];
        // Register workspace context provider if the provider supports it
        if (provider.provideWorkspaceChatContext) {
            const workspaceProvider = {
                onDidChangeWorkspaceChatContext: provider.onDidChangeWorkspaceChatContext,
                provideWorkspaceChatContext: (token) => provider.provideWorkspaceChatContext(token)
            };
            disposables.push(this.registerChatWorkspaceContextProvider(id, workspaceProvider));
        }
        // Register explicit context provider if the provider supports it
        if (provider.provideChatContextExplicit) {
            const explicitProvider = {
                provideExplicitChatContext: (token) => provider.provideChatContextExplicit(token),
                resolveExplicitChatContext: provider.resolveChatContext
                    ? (context, token) => provider.resolveChatContext(context, token)
                    : (context) => context
            };
            disposables.push(this.registerChatExplicitContextProvider(id, explicitProvider));
        }
        // Register resource context provider if the provider supports it and has a selector
        if (provider.provideChatContextForResource && selector) {
            const resourceProvider = {
                provideResourceChatContext: (options, token) => provider.provideChatContextForResource(options, token),
                resolveResourceChatContext: provider.resolveChatContext
                    ? (context, token) => provider.resolveChatContext(context, token)
                    : (context) => context
            };
            disposables.push(this.registerChatResourceContextProvider(selector, id, resourceProvider));
        }
        return {
            dispose: () => {
                for (const disposable of disposables) {
                    disposable.dispose();
                }
            }
        };
    }
    // Helper methods
    _clearProviderItems(handle) {
        const itemHandles = this._providerItems.get(handle);
        if (itemHandles) {
            for (const itemHandle of itemHandles) {
                this._globalItems.delete(itemHandle);
            }
            itemHandles.clear();
        }
    }
    _addTrackedItem(providerHandle, item) {
        const itemHandle = this._itemPool++;
        this._globalItems.set(itemHandle, item);
        if (!this._providerItems.has(providerHandle)) {
            this._providerItems.set(providerHandle, new Set());
        }
        this._providerItems.get(providerHandle).add(itemHandle);
        return itemHandle;
    }
    _convertItems(handle, items) {
        const result = [];
        for (const item of items) {
            if (item.label === undefined && item.resourceUri === undefined) {
                throw new Error('ChatContextItem must have either a label or a resourceUri');
            }
            const itemHandle = this._addTrackedItem(handle, item);
            result.push({
                handle: itemHandle,
                icon: item.icon,
                label: item.label,
                resourceUri: item.resourceUri,
                modelDescription: item.modelDescription,
                tooltip: item.tooltip ? MarkdownString.from(item.tooltip) : undefined,
                value: item.value,
                command: item.command ? { id: item.command.command } : undefined
            });
        }
        return result;
    }
    async _doResolve(resolveFn, context, extItem, token) {
        const extResult = await resolveFn(extItem, token);
        if (extResult) {
            return {
                handle: context.handle,
                icon: extResult.icon,
                label: extResult.label,
                resourceUri: extResult.resourceUri,
                modelDescription: extResult.modelDescription,
                tooltip: extResult.tooltip ? MarkdownString.from(extResult.tooltip) : undefined,
                value: extResult.value,
                command: extResult.command ? { id: extResult.command.command } : undefined
            };
        }
        return context;
    }
    _listenForWorkspaceContextChanges(handle, provider, disposables) {
        if (!provider.onDidChangeWorkspaceChatContext) {
            return;
        }
        const provideWorkspaceContext = async () => {
            const workspaceContexts = (await provider.provideWorkspaceChatContext?.(CancellationToken.None) ?? await provider.provideChatContext?.(CancellationToken.None));
            const resolvedContexts = this._convertItems(handle, workspaceContexts ?? []);
            return this._proxy.$updateWorkspaceContextItems(handle, resolvedContexts);
        };
        disposables.add(provider.onDidChangeWorkspaceChatContext(async () => provideWorkspaceContext()));
        // kick off initial workspace context fetch
        provideWorkspaceContext();
    }
    dispose() {
        super.dispose();
        for (const { disposables } of this._providers.values()) {
            disposables.dispose();
        }
    }
};
ExtHostChatContext = __decorate([
    __param(0, IExtHostRpcService),
    __param(1, IExtHostCommands)
], ExtHostChatContext);
export { ExtHostChatContext };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdENoYXRDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdENoYXRDb250ZXh0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBR2hHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxHQUFHLEVBQWlCLE1BQU0sNkJBQTZCLENBQUM7QUFDakUsT0FBTyxFQUEyQixXQUFXLEVBQThCLE1BQU0sdUJBQXVCLENBQUM7QUFDekcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBQzlFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHdCQUF3QixDQUFDO0FBRTVELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFVakQsSUFBTSxrQkFBa0IsR0FBeEIsTUFBTSxrQkFBbUIsU0FBUSxVQUFVO0lBWWpELFlBQ3FCLFVBQThCLEVBQ2hDLFNBQTRDO1FBRTlELEtBQUssRUFBRSxDQUFDO1FBRjJCLGNBQVMsR0FBVCxTQUFTLENBQWtCO1FBVnZELGdCQUFXLEdBQVcsQ0FBQyxDQUFDO1FBQ3hCLGVBQVUsR0FBK0IsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNuRCxjQUFTLEdBQVcsQ0FBQyxDQUFDO1FBQzlCLDhGQUE4RjtRQUN0RixpQkFBWSxHQUF3QyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3RFLDZEQUE2RDtRQUNyRCxtQkFBYyxHQUE2QixJQUFJLEdBQUcsRUFBRSxDQUFDLENBQUMsb0NBQW9DO1FBT2pHLElBQUksQ0FBQyxNQUFNLEdBQUcsVUFBVSxDQUFD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