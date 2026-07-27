/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { isEqual } from '../../../base/common/resources.js';
import { ExtHostChatContextShape, MainContext, MainThreadChatContextShape } from './extHost.protocol.js';
import { MarkdownString, TabSelector } from './extHostTypeConverters.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { IExtHostEditorTabs } from './extHostEditorTabs.js';
import { IChatContextItem } from '../../contrib/chat/common/contextContrib/chatContext.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { IExtHostCommands } from './extHostCommands.js';

type ProviderType = 'workspace' | 'explicit' | 'resource';

interface ProviderEntry {
	type: ProviderType;
	provider: vscode.ChatWorkspaceContextProvider | vscode.ChatAttachContextProvider | vscode.ChatTabContextProvider;
	disposables: DisposableStore;
}

export class ExtHostChatContext extends Disposable implements ExtHostChatContextShape {
	declare _serviceBrand: undefined;

	private _proxy: MainThreadChatContextShape;
	private _handlePool: number = 0;
	private _providers: Map<number, ProviderEntry> = new Map();
	private _itemPool: number = 0;
	/** Global map of itemHandle -> original item for command execution with reference equality */
	private _globalItems: Map<number, vscode.ChatContextItem> = new Map();
	/** Track which items belong to which provider for cleanup */
	private _providerItems: Map<number, Set<number>> = new Map(); // providerHandle -> Set<itemHandle>

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostCommands private readonly _commands: IExtHostCommands,
		@IExtHostEditorTabs private readonly _editorTabs: IExtHostEditorTabs,
	) {
		super();
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatContext);
	}

	// Workspace context provider methods

	async $provideWorkspaceChatContext(handle: number, token: CancellationToken): Promise<IChatContextItem[]> {
		this._clearProviderItems(handle);
		const entry = this._providers.get(handle);
		if (!entry || entry.type !== 'workspace') {
			throw new Error('Workspace context provider not found');
		}
		const provider = entry.provider as vscode.ChatWorkspaceContextProvider;
		const result = (await provider.provideWorkspaceChatContext?.(token)) ?? [];
		return this._convertItems(handle, result);
	}

	// Explicit context provider methods

	async $provideExplicitChatContext(handle: number, token: CancellationToken): Promise<IChatContextItem[]> {
		this._clearProviderItems(handle);
		const entry = this._providers.get(handle);
		if (!entry || entry.type !== 'explicit') {
			throw new Error('Explicit context provider not found');
		}
		const provider = entry.provider as vscode.ChatAttachContextProvider;
		const result = (await provider.provideAttachChatContext?.(token)) ?? [];
		return this._convertItems(handle, result);
	}

	async $resolveExplicitChatContext(handle: number, context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem> {
		const entry = this._providers.get(handle);
		if (!entry || entry.type !== 'explicit') {
			throw new Error('Explicit context provider not found');
		}
		const provider = entry.provider as vscode.ChatAttachContextProvider;
		const extItem = this._globalItems.get(context.handle);
		if (!extItem) {
			throw new Error('Chat context item not found');
		}
		return this._doResolve((provider.resolveAttachChatContext)?.bind(provider), context, extItem, token);
	}

	// Resource context provider methods

	async $provideResourceChatContext(handle: number, options: { resource: UriComponents; withValue: boolean; viewType?: string }, token: CancellationToken): Promise<IChatContextItem | undefined> {
		const entry = this._providers.get(handle);
		if (!entry || entry.type !== 'resource') {
			throw new Error('Resource context provider not found');
		}
		const provider = entry.provider as vscode.ChatTabContextProvider;

		const resource = URI.revive(options.resource);
		const tab = this._findTab(resource, options.viewType);
		if (!tab) {
			return undefined;
		}

		const result = (await provider.provideChatTabContext?.({ tab }, token));
		if (!result) {
			return undefined;
		}
		if (result.label === undefined && result.resourceUri === undefined) {
			throw new Error('ChatContextItem must have either a label or a resourceUri');
		}
		const itemHandle = this._addTrackedItem(handle, result);

		const item: IChatContextItem = {
			handle: itemHandle,
			iconPath: result.iconPath,
			label: result.label,
			resourceUri: result.resourceUri,
			modelDescription: result.modelDescription,
			tooltip: result.tooltip ? MarkdownString.from(result.tooltip) : undefined,
			value: options.withValue ? result.value : undefined,
			command: result.command ? { id: result.command.command } : undefined
		};
		if (options.withValue && !item.value) {
			const resolved = await provider.resolveChatTabContext?.bind(provider)(result, token);
			item.value = resolved?.value;
			item.tooltip = resolved?.tooltip ? MarkdownString.from(resolved.tooltip) : item.tooltip;
		}

		return item;
	}

	async $resolveResourceChatContext(handle: number, context: IChatContextItem, token: CancellationToken): Promise<IChatContextItem> {
		const entry = this._providers.get(handle);
		if (!entry || entry.type !== 'resource') {
			throw new Error('Resource context provider not found');
		}
		const provider = entry.provider as vscode.ChatTabContextProvider;
		const extItem = this._globalItems.get(context.handle);
		if (!extItem) {
			throw new Error('Chat context item not found');
		}
		return this._doResolve(provider.resolveChatTabContext?.bind(provider), context, extItem, token);
	}

	// Command execution

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

	// Registration methods

	registerChatWorkspaceContextProvider(id: string, provider: vscode.ChatWorkspaceContextProvider): vscode.Disposable {
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

	registerChatAttachContextProvider(id: string, provider: vscode.ChatAttachContextProvider): vscode.Disposable {
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

	registerChatTabContextProvider(selector: vscode.TabSelector, id: string, provider: vscode.ChatTabContextProvider): vscode.Disposable {
		const handle = this._handlePool++;
		const disposables = new DisposableStore();
		this._providers.set(handle, { type: 'resource', provider, disposables });
		this._proxy.$registerChatResourceContextProvider(handle, id, TabSelector.from(selector));

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
	 * Finds the open {@link vscode.Tab tab} for the given resource. When a `viewType` is provided,
	 * webview and custom editor tabs are matched by their view type; otherwise tabs are matched by
	 * their input resource. When multiple tabs match by view type, the active tab is preferred.
	 */
	private _findTab(resource: URI, viewType?: string): vscode.Tab | undefined {
		let viewTypeMatch: vscode.Tab | undefined;
		for (const group of this._editorTabs.tabGroups.all) {
			for (const tab of group.tabs) {
				const input = tab.input as { uri?: unknown; viewType?: unknown } | undefined;
				if (!input) {
					continue;
				}
				if (URI.isUri(input.uri) && isEqual(input.uri, resource)) {
					return tab;
				}
				if (viewType !== undefined && input.viewType === viewType && (!viewTypeMatch || tab.isActive)) {
					viewTypeMatch = tab;
				}
			}
		}
		return viewTypeMatch;
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

	private _convertItems(handle: number, items: vscode.ChatContextItem[]): IChatContextItem[] {
		const result: IChatContextItem[] = [];
		for (const item of items) {
			if (item.label === undefined && item.resourceUri === undefined) {
				throw new Error('ChatContextItem must have either a label or a resourceUri');
			}
			const itemHandle = this._addTrackedItem(handle, item);
			result.push({
				handle: itemHandle,
				iconPath: item.iconPath,
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

	private async _doResolve(
		resolveFn: (item: vscode.ChatContextItem, token: CancellationToken) => vscode.ProviderResult<vscode.ChatContextItem>,
		context: IChatContextItem,
		extItem: vscode.ChatContextItem,
		token: CancellationToken
	): Promise<IChatContextItem> {
		const extResult = await resolveFn(extItem, token);
		if (extResult) {
			return {
				handle: context.handle,
				iconPath: extResult.iconPath,
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

	private _listenForWorkspaceContextChanges(handle: number, provider: vscode.ChatWorkspaceContextProvider, disposables: DisposableStore): void {
		if (!provider.onDidChangeWorkspaceChatContext) {
			return;
		}
		const provideWorkspaceContext = async () => {
			const workspaceContexts = await provider.provideWorkspaceChatContext?.(CancellationToken.None);
			const resolvedContexts = this._convertItems(handle, workspaceContexts ?? []);
			return this._proxy.$updateWorkspaceContextItems(handle, resolvedContexts);
		};

		disposables.add(provider.onDidChangeWorkspaceChatContext(async () => provideWorkspaceContext()));
		// kick off initial workspace context fetch
		provideWorkspaceContext();
	}

	public override dispose(): void {
		super.dispose();
		for (const { disposables } of this._providers.values()) {
			disposables.dispose();
		}
	}
}
