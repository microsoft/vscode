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
import { IChatContextItem } from '../../contrib/chat/common/contextContrib/chatContext.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IExtHostCommands } from './extHostCommands.js';

export class ExtHostChatContext extends Disposable implements ExtHostChatContextShape {
	declare _serviceBrand: undefined;

	private _proxy: MainThreadChatContextShape;
	private _handlePool: number = 0;
	private _providers: Map<number, { provider: vscode.ChatContextProvider; disposables: DisposableStore }> = new Map();
	private _itemPool: number = 0;
	/** Global map of itemHandle -> original item for command execution with reference equality */
	private _globalItems: Map<number, vscode.ChatContextItem> = new Map();
	/** Track which items belong to which provider for cleanup */
	private _providerItems: Map<number, Set<number>> = new Map(); // providerHandle -> Set<itemHandle>

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostCommands private readonly _commands: IExtHostCommands,
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatContext);
	}

	async $provideChatContext(handle: number, token: CancellationToken): Promise<IChatContextItem[]> {
		this._clearProviderItems(handle); // clear previous items for this provider
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
				value: item.value,
				command: item.command ? { id: item.command.command } : undefined
			});
		}
		return items;
	}

	private _clearProviderItems(handle: number): void {
		const itemHandles = this._providerItems.get(handle);
		if (itemHandles) {
			for (const itemHandle of itemHandles) {
				this._globalItems.delete(itemHandle);
			}
			itemHandles.clear();
		}
	}

	private _addTrackedItem(providerHandle: number, item: vscode.ChatContextItem): number {
		const itemHandle = this._itemPool++;
		this._globalItems.set(itemHandle, item);
		if (!this._providerItems.has(providerHandle)) {
			this._providerItems.set(providerHandle, new Set());
		}
		this._providerItems.get(providerHandle)!.add(itemHandle);
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
			value: options.withValue ? result.value : undefined,
			command: result.command ? { id: result.command.command } : undefined
		};
		if (options.withValue && !item.value && provider.resolveChatContext) {
			const resolved = await provider.resolveChatContext(result, token);
			item.value = resolved?.value;
		}

		return item;
	}

	private async _doResolve(provider: vscode.ChatContextProvider, context: IChatContextItem, extItem: vscode.ChatContextItem, token: CancellationToken): Promise<IChatContextItem> {
		const extResult = await provider.resolveChatContext(extItem, token);
		if (extResult) {
			return {
				handle: context.handle,
				icon: extResult.icon,
				label: extResult.label,
				modelDescription: extResult.modelDescription,
				value: extResult.value,
				command: extResult.command ? { id: extResult.command.command } : undefined
			};
		}
		return context;
	}

	async $resolveChatContext(handle: number, context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem> {
		const provider = this._getProvider(handle);

		if (!provider.resolveChatContext) {
			throw new Error('resolveChatContext not implemented');
		}
		const extItem = this._globalItems.get(context.handle);
		if (!extItem) {
			throw new Error('Chat context item not found');
		}
		return this._doResolve(provider, context, extItem, token);
	}

	async $executeChatContextItemCommand(itemHandle: number): Promise<void> {
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

	registerChatContextProvider(selector: vscode.DocumentSelector | undefined, id: string, provider: vscode.ChatContextProvider): vscode.Disposable {
		const handle = this._handlePool++;
		const disposables = new DisposableStore();
		this._listenForWorkspaceContextChanges(handle, provider, disposables);
		this._providers.set(handle, { provider, disposables });
		this._proxy.$registerChatContextProvider(handle, `${id}`, selector ? DocumentSelector.from(selector) : undefined, {}, { supportsResource: !!provider.provideChatContextForResource, supportsResolve: !!provider.resolveChatContext });

		return {
			dispose: () => {
				this._providers.delete(handle);
				this._clearProviderItems(handle); // Clean up tracked items
				this._providerItems.delete(handle);
				this._proxy.$unregisterChatContextProvider(handle);
				disposables.dispose();
			}
		};
	}

	private _listenForWorkspaceContextChanges(handle: number, provider: vscode.ChatContextProvider, disposables: DisposableStore): void {
		if (!provider.onDidChangeWorkspaceChatContext || !provider.provideWorkspaceChatContext) {
			return;
		}
		const provideWorkspaceContext = async () => {
			const workspaceContexts = await provider.provideWorkspaceChatContext!(CancellationToken.None);
			const resolvedContexts: IChatContextItem[] = [];
			for (const item of workspaceContexts ?? []) {
				const itemHandle = this._addTrackedItem(handle, item);
				const contextItem: IChatContextItem = {
					icon: item.icon,
					label: item.label,
					modelDescription: item.modelDescription,
					value: item.value,
					handle: itemHandle,
					command: item.command ? { id: item.command.command } : undefined
				};
				const resolved = await this._doResolve(provider, contextItem, item, CancellationToken.None);
				resolvedContexts.push(resolved);
			}
			return this._proxy.$updateWorkspaceContextItems(handle, resolvedContexts);
		};

		disposables.add(provider.onDidChangeWorkspaceChatContext(async () => provideWorkspaceContext()));
		// kick off initial workspace context fetch
		provideWorkspaceContext();
	}

	private _getProvider(handle: number): vscode.ChatContextProvider {
		if (!this._providers.has(handle)) {
			throw new Error('Chat context provider not found');
		}
		return this._providers.get(handle)!.provider;
	}

	public override dispose(): void {
		super.dispose();
		for (const { disposables } of this._providers.values()) {
			disposables.dispose();
		}
	}
}
