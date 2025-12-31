/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ThemeIcon } from '../../../../../base/common/themables.js';
import { LanguageSelector, score } from '../../../../../editor/common/languageSelector.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatContextPicker, IChatContextPickerItem, IChatContextPickService } from '../attachments/chatContextPickService.js';
import { IChatContextItem, IChatContextProvider } from '../../common/contextContrib/chatContext.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { IChatRequestWorkspaceVariableEntry, IGenericChatRequestVariableEntry, StringChatContextValue } from '../../common/attachments/chatVariableEntries.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Disposable, DisposableMap, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';

export const IChatContextService = createDecorator<IChatContextService>('chatContextService');

export interface IChatContextService extends ChatContextService { }

interface IChatContextProviderEntry {
	picker?: { title: string; icon: ThemeIcon };
	chatContextProvider?: {
		selector: LanguageSelector | undefined;
		provider: IChatContextProvider;
	};
}

export class ChatContextService extends Disposable {
	_serviceBrand: undefined;

	private readonly _providers = new Map<string, IChatContextProviderEntry>();
	private readonly _workspaceContext = new Map<string, IChatContextItem[]>();
	private readonly _registeredPickers = this._register(new DisposableMap<string, IDisposable>());
	private _lastResourceContext: Map<StringChatContextValue, { originalItem: IChatContextItem; provider: IChatContextProvider }> = new Map();

	constructor(
		@IChatContextPickService private readonly _contextPickService: IChatContextPickService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		super();
	}

	setChatContextProvider(id: string, picker: { title: string; icon: ThemeIcon }): void {
		const providerEntry = this._providers.get(id) ?? { picker: undefined };
		providerEntry.picker = picker;
		this._providers.set(id, providerEntry);
		this._registerWithPickService(id);
	}

	private _registerWithPickService(id: string): void {
		const providerEntry = this._providers.get(id);
		if (!providerEntry || !providerEntry.picker || !providerEntry.chatContextProvider) {
			return;
		}
		const title = `${providerEntry.picker.title.replace(/\.+$/, '')}...`;
		this._registeredPickers.set(id, this._contextPickService.registerChatContextItem(this._asPicker(title, providerEntry.picker.icon, id)));
	}

	registerChatContextProvider(id: string, selector: LanguageSelector | undefined, provider: IChatContextProvider): void {
		const providerEntry = this._providers.get(id) ?? { picker: undefined };
		providerEntry.chatContextProvider = { selector, provider };
		this._providers.set(id, providerEntry);
		this._registerWithPickService(id);
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
				items.push({
					value: item.value,
					name: item.label,
					modelDescription: item.modelDescription,
					id: item.label,
					kind: 'workspace'
				});
			}
		}
		return items;
	}

	async contextForResource(uri: URI): Promise<StringChatContextValue | undefined> {
		return this._contextForResource(uri, false);
	}

	private async _contextForResource(uri: URI, withValue: boolean): Promise<StringChatContextValue | undefined> {
		const scoredProviders: Array<{ score: number; provider: IChatContextProvider }> = [];
		for (const providerEntry of this._providers.values()) {
			if (!providerEntry.chatContextProvider?.provider.provideChatContextForResource || (providerEntry.chatContextProvider.selector === undefined)) {
				continue;
			}
			const matchScore = score(providerEntry.chatContextProvider.selector, uri, '', true, undefined, undefined);
			scoredProviders.push({ score: matchScore, provider: providerEntry.chatContextProvider.provider });
		}
		scoredProviders.sort((a, b) => b.score - a.score);
		if (scoredProviders.length === 0 || scoredProviders[0].score <= 0) {
			return;
		}
		const context = (await scoredProviders[0].provider.provideChatContextForResource!(uri, withValue, CancellationToken.None));
		if (!context) {
			return;
		}
		const contextValue: StringChatContextValue = {
			value: undefined,
			name: context.label,
			icon: context.icon,
			uri: uri,
			modelDescription: context.modelDescription
		};
		this._lastResourceContext.clear();
		this._lastResourceContext.set(contextValue, { originalItem: context, provider: scoredProviders[0].provider });
		return contextValue;
	}

	async resolveChatContext(context: StringChatContextValue): Promise<StringChatContextValue> {
		if (context.value !== undefined) {
			return context;
		}

		const item = this._lastResourceContext.get(context);
		if (!item) {
			const resolved = await this._contextForResource(context.uri, true);
			context.value = resolved?.value;
			context.modelDescription = resolved?.modelDescription;
			return context;
		} else if (item.provider.resolveChatContext) {
			const resolved = await item.provider.resolveChatContext(item.originalItem, CancellationToken.None);
			if (resolved) {
				context.value = resolved.value;
				context.modelDescription = resolved.modelDescription;
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
				if (providerEntry && !providerEntry.chatContextProvider) {
					// Activate the extension providing the chat context provider
					await this._extensionService.activateByEvent(`onChatContextProvider:${id}`);
					providerEntry = this._providers.get(id);
					if (!providerEntry?.chatContextProvider) {
						return [];
					}
				}
				const results = await providerEntry?.chatContextProvider!.provider.provideChatContext({}, CancellationToken.None);
				return results || [];
			};

			return {
				picks: picks().then(items => {
					return items.map(item => ({
						label: item.label,
						iconClass: ThemeIcon.asClassName(item.icon),
						asAttachment: async (): Promise<IGenericChatRequestVariableEntry> => {
							let contextValue = item;
							if ((contextValue.value === undefined) && providerEntry?.chatContextProvider?.provider!.resolveChatContext) {
								contextValue = await providerEntry.chatContextProvider.provider.resolveChatContext(item, CancellationToken.None);
							}
							return {
								kind: 'generic',
								id: contextValue.label,
								name: contextValue.label,
								icon: contextValue.icon,
								value: contextValue.value
							};
						}
					}));
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
