/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IChatContextItem } from '../../contrib/chat/common/contextContrib/chatContext.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ExtHostChatContextShape, ExtHostContext, IChatContextItemDto, IDocumentFilterDto, MainContext, MainThreadChatContextShape } from '../common/extHost.protocol.js';
import { IChatContextService } from '../../contrib/chat/browser/contextContrib/chatContextService.js';
import { URI } from '../../../base/common/uri.js';
import { Proxied } from '../../services/extensions/common/proxyIdentifier.js';

function reviveContextItem(item: IChatContextItemDto): IChatContextItem {
	return {
		...item,
		resourceUri: item.resourceUri ? URI.revive(item.resourceUri) : undefined
	};
}

function reviveContextItems(items: IChatContextItemDto[]): IChatContextItem[] {
	return items.map(reviveContextItem);
}

@extHostNamedCustomer(MainContext.MainThreadChatContext)
export class MainThreadChatContext extends Disposable implements MainThreadChatContextShape {
	private readonly _proxy: Proxied<ExtHostChatContextShape>;
	private readonly _providers = new Map<number, { id: string; selector?: IDocumentFilterDto[] }>();

	constructor(
		extHostContext: IExtHostContext,
		@IChatContextService private readonly _chatContextService: IChatContextService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatContext);
		this._chatContextService.setExecuteCommandCallback((itemHandle) => this._proxy.$executeChatContextItemCommand(itemHandle));
	}

	$registerChatWorkspaceContextProvider(handle: number, id: string): void {
		this._providers.set(handle, { id });
		this._chatContextService.registerChatWorkspaceContextProvider(id, {
			provideWorkspaceChatContext: async (token: CancellationToken) => {
				const items = await this._proxy.$provideWorkspaceChatContext(handle, token);
				return reviveContextItems(items);
			}
		});
	}

	$registerChatExplicitContextProvider(handle: number, id: string): void {
		this._providers.set(handle, { id });
		this._chatContextService.registerChatExplicitContextProvider(id, {
			provideChatContext: async (token: CancellationToken) => {
				const items = await this._proxy.$provideExplicitChatContext(handle, token);
				return reviveContextItems(items);
			},
			resolveChatContext: async (context: IChatContextItem, token: CancellationToken) => {
				const result = await this._proxy.$resolveExplicitChatContext(handle, context, token);
				return reviveContextItem(result);
			}
		});
	}

	$registerChatResourceContextProvider(handle: number, id: string, selector: IDocumentFilterDto[]): void {
		this._providers.set(handle, { id, selector });
		this._chatContextService.registerChatResourceContextProvider(id, selector, {
			provideChatContext: async (resource: URI, withValue: boolean, token: CancellationToken) => {
				const result = await this._proxy.$provideResourceChatContext(handle, { resource, withValue }, token);
				return result ? reviveContextItem(result) : undefined;
			},
			resolveChatContext: async (context: IChatContextItem, token: CancellationToken) => {
				const result = await this._proxy.$resolveResourceChatContext(handle, context, token);
				return reviveContextItem(result);
			}
		});
	}

	$unregisterChatContextProvider(handle: number): void {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}
		this._chatContextService.unregisterChatContextProvider(provider.id);
		this._providers.delete(handle);
	}

	$updateWorkspaceContextItems(handle: number, items: IChatContextItemDto[]): void {
		const provider = this._providers.get(handle);
		if (!provider) {
			return;
		}
		this._chatContextService.updateWorkspaceContextItems(provider.id, reviveContextItems(items));
	}

	$executeChatContextItemCommand(itemHandle: number): Promise<void> {
		return this._proxy.$executeChatContextItemCommand(itemHandle);
	}
}
