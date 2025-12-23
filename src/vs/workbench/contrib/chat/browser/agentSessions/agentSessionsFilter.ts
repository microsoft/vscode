/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { registerAction2, Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProviderName } from './agentSessions.js';
import { AgentSessionStatus, IAgentSession } from './agentSessionsModel.js';
import { IAgentSessionsFilter } from './agentSessionsViewer.js';

export interface IAgentSessionsFilterOptions extends Partial<IAgentSessionsFilter> {

	readonly filterMenuId: MenuId;

	readonly limitResults?: () => number | undefined;
	notifyResults?(count: number): void;

	readonly groupResults?: () => boolean | undefined;

	overrideExclude?(session: IAgentSession): boolean | undefined;
}

interface IAgentSessionsViewExcludes {
	readonly providers: readonly string[];
	readonly states: readonly AgentSessionStatus[];

	readonly archived: boolean;
	readonly read: boolean;
}

const DEFAULT_EXCLUDES: IAgentSessionsViewExcludes = Object.freeze({
	providers: [] as const,
	states: [] as const,
	archived: true as const,
	read: false as const,
});

export class AgentSessionsFilter extends Disposable implements Required<IAgentSessionsFilter> {

	private readonly STORAGE_KEY: string;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	readonly limitResults = () => this.options.limitResults?.();
	readonly groupResults = () => this.options.groupResults?.();

	private excludes = DEFAULT_EXCLUDES;

	private readonly actionDisposables = this._register(new DisposableStore());

	constructor(
		private readonly options: IAgentSessionsFilterOptions,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		this.STORAGE_KEY = `agentSessions.filterExcludes.${this.options.filterMenuId.id.toLowerCase()}`;

		this.updateExcludes(false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.updateFilterActions()));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.updateFilterActions()));

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
	}

	private updateExcludes(fromEvent: boolean): void {
		const excludedTypesRaw = this.storageService.get(this.STORAGE_KEY, StorageScope.PROFILE);
		if (excludedTypesRaw) {
			try {
				this.excludes = JSON.parse(excludedTypesRaw) as IAgentSessionsViewExcludes;
			} catch {
				this.resetExcludes();
			}
		} else {
			this.resetExcludes();
		}

		this.updateFilterActions();

		if (fromEvent) {
			this._onDidChange.fire();
		}
	}

	private resetExcludes(): void {
		this.excludes = {
			providers: [...DEFAULT_EXCLUDES.providers],
			states: [...DEFAULT_EXCLUDES.states],
			archived: DEFAULT_EXCLUDES.archived,
			read: DEFAULT_EXCLUDES.read,
		};
	}

	private storeExcludes(excludes: IAgentSessionsViewExcludes): void {
		this.excludes = excludes;

		this.storageService.store(this.STORAGE_KEY, JSON.stringify(this.excludes), StorageScope.PROFILE, StorageTarget.USER);
	}

	private updateFilterActions(): void {
		this.actionDisposables.clear();

		this.registerProviderActions(this.actionDisposables);
		this.registerStateActions(this.actionDisposables);
		this.registerArchivedActions(this.actionDisposables);
		this.registerReadActions(this.actionDisposables);
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
						id: `agentSessions.filter.toggleExclude:${provider.id}.${that.options.filterMenuId.id.toLowerCase()}`,
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
					if (!providerExcludes.delete(provider.id)) {
						providerExcludes.add(provider.id);
					}

					that.storeExcludes({ ...that.excludes, providers: Array.from(providerExcludes) });
				}
			}));
		}
	}

	private registerStateActions(disposables: DisposableStore): void {
		const states: { id: AgentSessionStatus; label: string }[] = [
			{ id: AgentSessionStatus.Completed, label: localize('agentSessionStatus.completed', "Completed") },
			{ id: AgentSessionStatus.InProgress, label: localize('agentSessionStatus.inProgress', "In Progress") },
			{ id: AgentSessionStatus.NeedsInput, label: localize('agentSessionStatus.needsInput', "Input Needed") },
			{ id: AgentSessionStatus.Failed, label: localize('agentSessionStatus.failed', "Failed") },
		];

		const that = this;
		let counter = 0;
		for (const state of states) {
			disposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `agentSessions.filter.toggleExcludeState:${state.id}.${that.options.filterMenuId.id.toLowerCase()}`,
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
					if (!stateExcludes.delete(state.id)) {
						stateExcludes.add(state.id);
					}

					that.storeExcludes({ ...that.excludes, states: Array.from(stateExcludes) });
				}
			}));
		}
	}

	private registerArchivedActions(disposables: DisposableStore): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.toggleExcludeArchived.${that.options.filterMenuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.archived', 'Archived'),
					menu: {
						id: that.options.filterMenuId,
						group: '3_props',
						order: 1000,
					},
					toggled: that.excludes.archived ? ContextKeyExpr.false() : ContextKeyExpr.true(),
				});
			}
			run(): void {
				that.storeExcludes({ ...that.excludes, archived: !that.excludes.archived });
			}
		}));
	}

	private registerReadActions(disposables: DisposableStore): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.toggleExcludeRead.${that.options.filterMenuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.read', 'Read'),
					menu: {
						id: that.options.filterMenuId,
						group: '3_props',
						order: 0,
					},
					toggled: that.excludes.read ? ContextKeyExpr.false() : ContextKeyExpr.true(),
				});
			}
			run(): void {
				that.storeExcludes({ ...that.excludes, read: !that.excludes.read });
			}
		}));
	}

	private registerResetAction(disposables: DisposableStore): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.resetExcludes.${that.options.filterMenuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.reset', "Reset"),
					menu: {
						id: that.options.filterMenuId,
						group: '4_reset',
						order: 0,
					},
				});
			}
			run(): void {
				that.resetExcludes();

				that.storageService.store(that.STORAGE_KEY, JSON.stringify(that.excludes), StorageScope.PROFILE, StorageTarget.USER);
			}
		}));
	}

	isDefault(): boolean {
		return equals(this.excludes, DEFAULT_EXCLUDES);
	}

	exclude(session: IAgentSession): boolean {
		const overrideExclude = this.options?.overrideExclude?.(session);
		if (typeof overrideExclude === 'boolean') {
			return overrideExclude;
		}

		if (this.excludes.archived && session.isArchived()) {
			return true;
		}

		if (this.excludes.read && (session.isArchived() || session.isRead())) {
			return true;
		}

		if (this.excludes.providers.includes(session.providerType)) {
			return true;
		}

		if (this.excludes.states.includes(session.status)) {
			return true;
		}

		return false;
	}

	notifyResults(count: number): void {
		this.options.notifyResults?.(count);
	}
}
