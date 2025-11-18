/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostChatContextShape, MainContext, MainThreadChatContextShape } from './extHost.protocol.js';
import { DocumentSelector } from './extHostTypeConverters.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IChatContextItem } from '../../contrib/chat/common/chatContext.js';

export class ExtHostChatContext implements ExtHostChatContextShape {
	declare _serviceBrand: undefined;

	private _proxy: MainThreadChatContextShape;
	private _handlePool: number = 0;
	private _providers: Map<number, vscode.ChatContextProvider> = new Map();
	private _itemPool: number = 0;
	private _items: Map<number, Map<number, vscode.ChatContextItem>> = new Map(); // handle -> itemHandle -> item

	constructor(@IExtHostRpcService extHostRpc: IExtHostRpcService,
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatContext);
	}

	async $provideChatContext(handle: number, token: CancellationToken): Promise<IChatContextItem[]> {
		this._items.delete(handle); // clear previous items
		const provider = this._getProvider(handle);
		if (!provider.provideChatContextExplicit) {
			throw new Error('provideChatContext not implemented');
		}
		const result = (await provider.provideChatContextExplicit!(token)) ?? [];
		const items: IChatContextItem[] = [];
		for (const item of result) {
			const itemHandle = this._addTrackedItem(handle, item);
			items.push({
				handle: itemHandle,
				icon: item.icon,
				label: item.label,
				modelDescription: item.modelDescription,
				value: item.value
			});
		}
		return items;
	}

	private _addTrackedItem(handle: number, item: vscode.ChatContextItem): number {
		const itemHandle = this._itemPool++;
		if (!this._items.has(handle)) {
			this._items.set(handle, new Map());
		}
		this._items.get(handle)!.set(itemHandle, item);
		return itemHandle;
	}

	async $provideChatContextForResource(handle: number, options: { resource: UriComponents; withValue: boolean }, token: CancellationToken): Promise<IChatContextItem | undefined> {
		const provider = this._getProvider(handle);

		if (!provider.provideChatContextForResource) {
			throw new Error('provideChatContextForResource not implemented');
		}

		const result = await provider.provideChatContextForResource({ resource: URI.revive(options.resource) }, token);
		if (!result) {
			return undefined;
		}
		const itemHandle = this._addTrackedItem(handle, result);

		const item: IChatContextItem | undefined = {
			handle: itemHandle,
			icon: result.icon,
			label: result.label,
			modelDescription: result.modelDescription,
			value: options.withValue ? result.value : undefined
		};
		if (options.withValue && !item.value && provider.resolveChatContext) {
			const resolved = await provider.resolveChatContext(result, token);
			item.value = resolved?.value;
		}

		return item;
	}

	async $resolveChatContext(handle: number, context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem> {
		const provider = this._getProvider(handle);

		if (!provider.resolveChatContext) {
			throw new Error('resolveChatContext not implemented');
		}
		const extItem = this._items.get(handle)?.get(context.handle);
		if (!extItem) {
			throw new Error('Chat context item not found');
		}
		const extResult = await provider.resolveChatContext(extItem, token);
		const result = extResult ?? context;
		return {
			handle: context.handle,
			icon: result.icon,
			label: result.label,
			modelDescription: result.modelDescription,
			value: result.value
		};
	}

	registerChatContextProvider(selector: vscode.DocumentSelector, id: string, provider: vscode.ChatContextProvider): vscode.Disposable {
		const handle = this._handlePool++;
		this._providers.set(handle, provider);
		this._proxy.$registerChatContextProvider(handle, `${id}`, DocumentSelector.from(selector), {}, { supportsResource: !!provider.provideChatContextForResource, supportsResolve: !!provider.resolveChatContext });

		return {
			dispose: () => {
				this._providers.delete(handle);
				this._proxy.$unregisterChatContextProvider(handle);
			}
		};
	}

	private _getProvider(handle: number): vscode.ChatContextProvider {
		if (!this._providers.has(handle)) {
			throw new Error('Chat context provider not found');
		}
		return this._providers.get(handle)!;
	}
}
