/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../base/common/themables.js';
import { LanguageSelector, score } from '../../../../../editor/common/languageSelector.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatContextPicker, IChatContextPickerItem, IChatContextPickService } from '../attachments/chatContextPickService.js';
import { IChatContextItem, IChatExplicitContextProvider, IChatResourceContextProvider, IChatWorkspaceContextProvider } from '../../common/contextContrib/chatContext.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IChatRequestWorkspaceVariableEntry, IGenericChatRequestVariableEntry, StringChatContextValue } from '../../common/attachments/chatVariableEntries.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { basename } from '../../../../../base/common/resources.js';

export const IChatContextService = createDecorator<IChatContextService>('chatContextService');

export interface IChatContextService extends ChatContextService { }

interface IChatContextProviderEntry {
	picker?: { title: string; icon: ThemeIcon };
	workspaceProvider?: IChatWorkspaceContextProvider;
	explicitProvider?: IChatExplicitContextProvider;
	resourceProvider?: {
		selector: LanguageSelector;
		provider: IChatResourceContextProvider;
	};
}

export class ChatContextService extends Disposable {
	_serviceBrand: undefined;

	private readonly _providers = new Map<string, IChatContextProviderEntry>();
	private readonly _workspaceContext = new Map<string, IChatContextItem[]>();
	private readonly _registeredPickers = this._register(new DisposableMap<string, IDisposable>());
	private _lastResourceContext: Map<StringChatContextValue, { originalItem: IChatContextItem; provider: IChatResourceContextProvider }> = new Map();
	private _executeCommandCallback: ((itemHandle: number) => Promise<void>) | undefined;

	constructor(
		@IChatContextPickService private readonly _contextPickService: IChatContextPickService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		super();
	}

	setExecuteCommandCallback(callback: (itemHandle: number) => Promise<void>): void {
		this._executeCommandCallback = callback;
	}

	async executeChatContextItemCommand(handle: number): Promise<void> {
		if (!this._executeCommandCallback) {
			return;
		}
		await this._executeCommandCallback(handle);
	}

	setChatContextProvider(id: string, picker: { title: string; icon: ThemeIcon }): void {
		const providerEntry = this._providers.get(id) ?? {};
		providerEntry.picker = picker;
		this._providers.set(id, providerEntry);
		this._registerWithPickService(id);
	}

	private _registerWithPickService(id: string): void {
		const providerEntry = this._providers.get(id);
		if (!providerEntry || !providerEntry.picker || !providerEntry.explicitProvider) {
			return;
		}
		const title = `${providerEntry.picker.title.replace(/\.+$/, '')}...`;
		this._registeredPickers.set(id, this._contextPickService.registerChatContextItem(this._asPicker(title, providerEntry.picker.icon, id)));
	}

	registerChatWorkspaceContextProvider(id: string, provider: IChatWorkspaceContextProvider): void {
		const providerEntry = this._providers.get(id) ?? {};
		providerEntry.workspaceProvider = provider;
		this._providers.set(id, providerEntry);
	}

	registerChatExplicitContextProvider(id: string, provider: IChatExplicitContextProvider): void {
		const providerEntry = this._providers.get(id) ?? {};
		providerEntry.explicitProvider = provider;
		this._providers.set(id, providerEntry);
		this._registerWithPickService(id);
	}

	registerChatResourceContextProvider(id: string, selector: LanguageSelector, provider: IChatResourceContextProvider): void {
		const providerEntry = this._providers.get(id) ?? {};
		providerEntry.resourceProvider = { selector, provider };
		this._providers.set(id, providerEntry);
	}

	unregisterChatContextProvider(id: string): void {
		this._providers.delete(id);
		this._registeredPickers.deleteAndDispose(id);
	}

	updateWorkspaceContextItems(id: string, items: IChatContextItem[]): void {
		this._workspaceContext.set(id, items);
	}

	getWorkspaceContextItems(): IChatRequestWorkspaceVariableEntry[] {
		const items: IChatRequestWorkspaceVariableEntry[] = [];
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

	async contextForResource(uri: URI, language?: string): Promise<StringChatContextValue | undefined> {
		return this._contextForResource(uri, false, language);
	}

	private async _contextForResource(uri: URI, withValue: boolean, language?: string): Promise<StringChatContextValue | undefined> {
		const scoredProviders: Array<{ score: number; provider: IChatResourceContextProvider }> = [];
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
		const contextValue: StringChatContextValue = {
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

	async resolveChatContext(context: StringChatContextValue, language?: string): Promise<StringChatContextValue> {
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
		} else {
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

	private _asPicker(title: string, icon: ThemeIcon, id: string): IChatContextPickerItem {
		const asPicker = (): IChatContextPicker => {
			let providerEntry = this._providers.get(id);
			if (!providerEntry) {
				throw new Error('No chat context provider registered');
			}

			const picks = async (): Promise<IChatContextItem[]> => {
				if (providerEntry && !providerEntry.explicitProvider) {
					// Activate the extension providing the chat context provider
					await this._extensionService.activateByEvent(`onChatContextProvider:${id}`);
					providerEntry = this._providers.get(id);
					if (!providerEntry?.explicitProvider) {
						return [];
					}
				}
				const results = await providerEntry?.explicitProvider!.provideChatContext(CancellationToken.None);
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
							asAttachment: async (): Promise<IGenericChatRequestVariableEntry> => {
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

		const picker: IChatContextPickerItem = {
			asPicker,
			type: 'pickerPick',
			label: title,
			icon
		};

		return picker;
	}
}

registerSingleton(IChatContextService, ChatContextService, InstantiationType.Delayed);
