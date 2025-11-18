/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { registerAction2, Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatSessionStatus, IChatSessionsService } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProviderName } from './agentSessions.js';
import { IAgentSessionViewModel } from './agentSessionViewModel.js';

export interface IAgentSessionsViewFilterOptions {
	readonly filterMenuId: MenuId;
}

interface IAgentSessionsViewExcludes {
	readonly providers: readonly string[];
	readonly states: readonly ChatSessionStatus[];
	readonly archived: boolean;
}

const DEFAULT_EXCLUDES: IAgentSessionsViewExcludes = Object.freeze({
	providers: [] as const,
	states: [] as const,
	archived: true as const,
});

export class AgentSessionsViewFilter extends Disposable {

	private static readonly STORAGE_KEY = 'agentSessions.filterExcludes';

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private excludes = DEFAULT_EXCLUDES;

	private actionDisposables = this._register(new DisposableStore());

	constructor(
		private readonly options: IAgentSessionsViewFilterOptions,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.updateExcludes(false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.updateFilterActions()));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.updateFilterActions()));

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, AgentSessionsViewFilter.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
	}

	private updateExcludes(fromEvent: boolean): void {
		const excludedTypesRaw = this.storageService.get(AgentSessionsViewFilter.STORAGE_KEY, StorageScope.PROFILE);
		this.excludes = excludedTypesRaw ? JSON.parse(excludedTypesRaw) as IAgentSessionsViewExcludes : {
			providers: [...DEFAULT_EXCLUDES.providers],
			states: [...DEFAULT_EXCLUDES.states],
			archived: DEFAULT_EXCLUDES.archived,
		};

		if (fromEvent) {
			this.updateFilterActions();

			this._onDidChange.fire();
		}
	}

	private updateFilterActions(): void {
		this.actionDisposables.clear();

		this.registerProviderActions(this.actionDisposables);
		this.registerStateActions(this.actionDisposables);
		this.registerArchivedActions(this.actionDisposables);
		this.registerResetAction(this.actionDisposables);
	}

	private registerProviderActions(disposables: DisposableStore): void {
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
			disposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `agentSessions.filter.toggleExclude:${provider.id}`,
						title: provider.label,
						menu: {
							id: that.options.filterMenuId,
							group: '1_providers',
							order: counter++,
						},
						toggled: that.excludes.providers.includes(provider.id) ? ContextKeyExpr.false() : ContextKeyExpr.true(),
					});
				}
				run(): void {
					const providerExcludes = new Set(that.excludes.providers);
					if (providerExcludes.has(provider.id)) {
						providerExcludes.delete(provider.id);
					} else {
						providerExcludes.add(provider.id);
					}

					that.excludes = {
						...that.excludes,
						providers: Array.from(providerExcludes),
					};

					that.storageService.store(AgentSessionsViewFilter.STORAGE_KEY, JSON.stringify(that.excludes), StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
		}
	}

	private registerStateActions(disposables: DisposableStore): void {
		const states: { id: ChatSessionStatus; label: string }[] = [
			{ id: ChatSessionStatus.Completed, label: localize('chatSessionStatus.completed', "Completed") },
			{ id: ChatSessionStatus.InProgress, label: localize('chatSessionStatus.inProgress', "In Progress") },
			{ id: ChatSessionStatus.Failed, label: localize('chatSessionStatus.failed', "Failed") },
		];

		const that = this;
		let counter = 0;
		for (const state of states) {
			disposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `agentSessions.filter.toggleExcludeState:${state.id}`,
						title: state.label,
						menu: {
							id: that.options.filterMenuId,
							group: '2_states',
							order: counter++,
						},
						toggled: that.excludes.states.includes(state.id) ? ContextKeyExpr.false() : ContextKeyExpr.true(),
					});
				}
				run(): void {
					const stateExcludes = new Set(that.excludes.states);
					if (stateExcludes.has(state.id)) {
						stateExcludes.delete(state.id);
					} else {
						stateExcludes.add(state.id);
					}

					that.excludes = {
						...that.excludes,
						states: Array.from(stateExcludes),
					};

					that.storageService.store(AgentSessionsViewFilter.STORAGE_KEY, JSON.stringify(that.excludes), StorageScope.PROFILE, StorageTarget.USER);
				}
			}));
		}
	}

	private registerArchivedActions(disposables: DisposableStore): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'agentSessions.filter.toggleExcludeArchived',
					title: localize('agentSessions.filter.archived', 'Archived'),
					menu: {
						id: that.options.filterMenuId,
						group: '2_states',
						order: 1000,
					},
					toggled: that.excludes.archived ? ContextKeyExpr.false() : ContextKeyExpr.true(),
				});
			}
			run(): void {
				that.excludes = {
					...that.excludes,
					archived: !that.excludes.archived,
				};

				that.storageService.store(AgentSessionsViewFilter.STORAGE_KEY, JSON.stringify(that.excludes), StorageScope.PROFILE, StorageTarget.USER);
			}
		}));
	}

	private registerResetAction(disposables: DisposableStore): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'agentSessions.filter.resetExcludes',
					title: localize('agentSessions.filter.reset', 'Reset'),
					menu: {
						id: that.options.filterMenuId,
						group: '4_reset',
						order: 0,
					},
				});
			}
			run(): void {
				that.excludes = {
					providers: [...DEFAULT_EXCLUDES.providers],
					states: [...DEFAULT_EXCLUDES.states],
					archived: DEFAULT_EXCLUDES.archived,
				};

				that.storageService.store(AgentSessionsViewFilter.STORAGE_KEY, JSON.stringify(that.excludes), StorageScope.PROFILE, StorageTarget.USER);
			}
		}));
	}

	exclude(session: IAgentSessionViewModel): boolean {
		if (this.excludes.archived && session.archived) {
			return true;
		}

		if (this.excludes.providers.includes(session.provider.chatSessionType)) {
			return true;
		}

		if (this.excludes.states.includes(session.status)) {
			return true;
		}

		return false;
	}
}
