/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { registerAction2, Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProviderName } from './agentSessions.js';

export interface IAgentSessionsViewFilterOptions {
	readonly filterMenuId: MenuId;
}

export class AgentSessionsViewFilter extends Disposable {

	private static readonly STORAGE_KEY = 'agentSessions.filter.excludes';
	private static readonly CONTEXT_KEY = 'agentSessionsFilterExcludes';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _excludes = new Set<string>();
	get excludes(): Set<string> { return this._excludes; }

	private excludesContext: IContextKey<string>;

	private actionDisposables = this._register(new DisposableStore());

	constructor(
		private readonly options: IAgentSessionsViewFilterOptions,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this.excludesContext = new RawContextKey<string>(AgentSessionsViewFilter.CONTEXT_KEY, '[]', true).bindTo(this.contextKeyService);

		this.updateExcludes(false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.updateFilterActions()));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.updateFilterActions()));

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, AgentSessionsViewFilter.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
	}

	private updateExcludes(fromEvent: boolean): void {
		const excludedTypesString = this.storageService.get(AgentSessionsViewFilter.STORAGE_KEY, StorageScope.PROFILE, '[]');
		this.excludesContext.set(excludedTypesString);
		this._excludes = new Set(JSON.parse(excludedTypesString));

		if (fromEvent) {
			this._onDidChange.fire();
		}
	}

	private updateFilterActions(): void {
		this.actionDisposables.clear();

		const providers: { id: string; label: string }[] = [
			{ id: AgentSessionProviders.Local, label: getAgentSessionProviderName(AgentSessionProviders.Local) },
			{ id: AgentSessionProviders.Background, label: getAgentSessionProviderName(AgentSessionProviders.Background) },
			{ id: AgentSessionProviders.Cloud, label: getAgentSessionProviderName(AgentSessionProviders.Cloud) },
		];

		for (const provider of this.chatSessionsService.getAllChatSessionContributions()) {
			if (providers.find(p => p.id === provider.type)) {
				continue; // already added
			}

			providers.push({ id: provider.type, label: provider.name });
		}

		const that = this;
		let counter = 0;
		for (const provider of providers) {
			this.actionDisposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `agentSessions.filter.toggleExclude:${provider.id}`,
						title: provider.label,
						menu: {
							id: that.options.filterMenuId,
							group: 'navigation',
							order: counter++,
						},
						toggled: ContextKeyExpr.regex(AgentSessionsViewFilter.CONTEXT_KEY, new RegExp(`\\b${escapeRegExpCharacters(provider.id)}\\b`)).negate()
					});
				}
				run(accessor: ServicesAccessor): void {
					const excludes = new Set(that._excludes);
					if (excludes.has(provider.id)) {
						excludes.delete(provider.id);
					} else {
						excludes.add(provider.id);
					}

					const storageService = accessor.get(IStorageService);
					storageService.store(AgentSessionsViewFilter.STORAGE_KEY, JSON.stringify([...excludes.keys()]), StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
		}
	}
}
