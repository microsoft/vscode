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
import { Disposable } from '../../../base/common/lifecycle.js';
import { extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostContext, MainContext } from '../common/extHost.protocol.js';
import { IChatContextService } from '../../contrib/chat/browser/contextContrib/chatContextService.js';
import { URI } from '../../../base/common/uri.js';
function reviveContextItem(item) {
    return {
        ...item,
        resourceUri: item.resourceUri ? URI.revive(item.resourceUri) : undefined
    };
}
function reviveContextItems(items) {
    return items.map(reviveContextItem);
}
let MainThreadChatContext = class MainThreadChatContext extends Disposable {
    constructor(extHostContext, _chatContextService) {
        super();
        this._chatContextService = _chatContextService;
        this._providers = new Map();
        this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatContext);
        this._chatContextService.setExecuteCommandCallback((itemHandle) => this._proxy.$executeChatContextItemCommand(itemHandle));
    }
    $registerChatWorkspaceContextProvider(handle, id) {
        this._providers.set(handle, { id });
        this._chatContextService.registerChatWorkspaceContextProvider(id, {
            provideWorkspaceChatContext: async (token) => {
                const items = await this._proxy.$provideWorkspaceChatContext(handle, token);
                return reviveContextItems(items);
            }
        });
    }
    $registerChatExplicitContextProvider(handle, id) {
        this._providers.set(handle, { id });
        this._chatContextService.registerChatExplicitContextProvider(id, {
            provideChatContext: async (token) => {
                const items = await this._proxy.$provideExplicitChatContext(handle, token);
                return reviveContextItems(items);
            },
            resolveChatContext: async (context, token) => {
                const result = await this._proxy.$resolveExplicitChatContext(handle, context, token);
                return reviveContextItem(result);
            }
        });
    }
    $registerChatResourceContextProvider(handle, id, selector) {
        this._providers.set(handle, { id, selector });
        this._chatContextService.registerChatResourceContextProvider(id, selector, {
            provideChatContext: async (resource, withValue, token) => {
                const result = await this._proxy.$provideResourceChatContext(handle, { resource, withValue }, token);
                return result ? reviveContextItem(result) : undefined;
            },
            resolveChatContext: async (context, token) => {
                const result = await this._proxy.$resolveResourceChatContext(handle, context, token);
                return reviveContextItem(result);
            }
        });
    }
    $unregisterChatContextProvider(handle) {
        const provider = this._providers.get(handle);
        if (!provider) {
            return;
        }
        this._chatContextService.unregisterChatContextProvider(provider.id);
        this._providers.delete(handle);
    }
    $updateWorkspaceContextItems(handle, items) {
        const provider = this._providers.get(handle);
        if (!provider) {
            return;
        }
        this._chatContextService.updateWorkspaceContextItems(provider.id, reviveContextItems(items));
    }
    $executeChatContextItemCommand(itemHandle) {
        return this._proxy.$executeChatContextItemCommand(itemHandle);
    }
};
MainThreadChatContext = __decorate([
    extHostNamedCustomer(MainContext.MainThreadChatContext),
    __param(1, IChatContextService)
], MainThreadChatContext);
export { MainThreadChatContext };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpblRocmVhZENoYXRDb250ZXh0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS9icm93c2VyL21haW5UaHJlYWRDaGF0Q29udGV4dC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFL0QsT0FBTyxFQUFFLG9CQUFvQixFQUFtQixNQUFNLHNEQUFzRCxDQUFDO0FBQzdHLE9BQU8sRUFBMkIsY0FBYyxFQUEyQyxXQUFXLEVBQThCLE1BQU0sK0JBQStCLENBQUM7QUFDMUssT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDdEcsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBR2xELFNBQVMsaUJBQWlCLENBQUMsSUFBeUI7SUFDbkQsT0FBTztRQUNOLEdBQUcsSUFBSTtRQUNQLFdBQVcsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUztLQUN4RSxDQUFDO0FBQ0gsQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsS0FBNEI7SUFDdkQsT0FBTyxLQUFLLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFDckMsQ0FBQztBQUdNLElBQU0scUJBQXFCLEdBQTNCLE1BQU0scUJBQXNCLFNBQVEsVUFBVTtJQUlwRCxZQUNDLGNBQStCLEVBQ1YsbUJBQXlEO1FBRTlFLEtBQUssRUFBRSxDQUFDO1FBRjhCLHdCQUFtQixHQUFuQixtQkFBbUIsQ0FBcUI7UUFKOUQsZUFBVSxHQUFHLElBQUksR0FBRyxFQUEyRCxDQUFDO1FBT2hHLElBQUksQ0FBQyxNQUFNLEdB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