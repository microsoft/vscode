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
import { IAgentSessionsFilter, IAgentSessionsFilterExcludes } from './agentSessionsViewer.js';

export enum AgentSessionsGrouping {
	Capped = 'capped',
	Date = 'date'
}

export interface IAgentSessionsFilterOptions extends Partial<IAgentSessionsFilter> {

	readonly filterMenuId?: MenuId;

	readonly limitResults?: () => number | undefined;
	notifyResults?(count: number): void;

	readonly groupResults?: () => AgentSessionsGrouping | undefined;

	overrideExclude?(session: IAgentSession): boolean | undefined;
}

const DEFAULT_EXCLUDES: IAgentSessionsFilterExcludes = Object.freeze({
	providers: [] as const,
	states: [] as const,
	archived: true as const /* archived are never excluded but toggle between expanded and collapsed */,
	read: false as const,
});

export class AgentSessionsFilter extends Disposable implements Required<IAgentSessionsFilter> {

	private readonly STORAGE_KEY = `agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu`;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	readonly limitResults = () => this.options.limitResults?.();
	readonly groupResults = () => this.options.groupResults?.();

	private excludes = DEFAULT_EXCLUDES;
	private isStoringExcludes = false;

	private readonly actionDisposables = this._register(new DisposableStore());

	constructor(
		private readonly options: IAgentSessionsFilterOptions,
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

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
	}

	private updateExcludes(fromEvent: boolean): void {
		if (!this.isStoringExcludes) {
			const excludedTypesRaw = this.storageService.get(this.STORAGE_KEY, StorageScope.PROFILE);
			if (excludedTypesRaw) {
				try {
					this.excludes = JSON.parse(excludedTypesRaw) as IAgentSessionsFilterExcludes;
				} catch {
					this.excludes = { ...DEFAULT_EXCLUDES };
				}
			} else {
				this.excludes = { ...DEFAULT_EXCLUDES };
			}
		}

		this.updateFilterActions();

		if (fromEvent) {
			this._onDidChange.fire();
		}
	}

	private storeExcludes(excludes: IAgentSessionsFilterExcludes): void {
		this.excludes = excludes;

		// Set guard before storage operation to prevent our own listener from
		// re-triggering updateExcludes which would re-register actions mid-click
		this.isStoringExcludes = true;
		try {
			if (equals(this.excludes, DEFAULT_EXCLUDES)) {
				this.storageService.remove(this.STORAGE_KEY, StorageScope.PROFILE);
			} else {
				this.storageService.store(this.STORAGE_KEY, JSON.stringify(this.excludes), StorageScope.PROFILE, StorageTarget.USER);
			}
		} finally {
			this.isStoringExcludes = false;
		}
	}

	private updateFilterActions(): void {
		this.actionDisposables.clear();

		const menuId = this.options.filterMenuId;
		if (!menuId) {
			return;
		}

		this.registerProviderActions(this.actionDisposables, menuId);
		this.registerStateActions(this.actionDisposables, menuId);
		this.registerArchivedActions(this.actionDisposables, menuId);
		this.registerReadActions(this.actionDisposables, menuId);
		this.registerResetAction(this.actionDisposables, menuId);
	}

	private registerProviderActions(disposables: DisposableStore, menuId: MenuId): void {
		const providers: { id: string; label: string }[] = Object.values(AgentSessionProviders).map(provider => ({
			id: provider,
			label: getAgentSessionProviderName(provider)
		}));

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
						id: `agentSessions.filter.toggleExclude:${provider.id}.${menuId.id.toLowerCase()}`,
						title: provider.label,
						menu: {
							id: menuId,
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

	private registerStateActions(disposables: DisposableStore, menuId: MenuId): void {
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
						id: `agentSessions.filter.toggleExcludeState:${state.id}.${menuId.id.toLowerCase()}`,
						title: state.label,
						menu: {
							id: menuId,
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

	private registerArchivedActions(disposables: DisposableStore, menuId: MenuId): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.toggleExcludeArchived.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.archived', 'Archived'),
					menu: {
						id: menuId,
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

	private registerReadActions(disposables: DisposableStore, menuId: MenuId): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.toggleExcludeRead.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.read', 'Read'),
					menu: {
						id: menuId,
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

	private registerResetAction(disposables: DisposableStore, menuId: MenuId): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.resetExcludes.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.reset', "Reset"),
					menu: {
						id: menuId,
						group: '4_reset',
						order: 0,
					},
				});
			}
			run(): void {
				that.storeExcludes({ ...DEFAULT_EXCLUDES });
			}
		}));
	}

	isDefault(): boolean {
		return equals(this.excludes, DEFAULT_EXCLUDES);
	}

	getExcludes(): IAgentSessionsFilterExcludes {
		return this.excludes;
	}

	exclude(session: IAgentSession): boolean {
		const overrideExclude = this.options?.overrideExclude?.(session);
		if (typeof overrideExclude === 'boolean') {
			return overrideExclude;
		}

		if (this.excludes.read && session.isRead()) {
			return true;
		}

		if (this.excludes.providers.includes(session.providerType)) {
			return true;
		}

		if (this.excludes.states.includes(session.status)) {
			return true;
		}

		if (this.excludes.archived && this.groupResults?.() === AgentSessionsGrouping.Capped && session.isArchived()) {
			return true; // exclude archived sessions when grouped by capped where we have no "Archived" group
		}

		return false;
	}

	notifyResults(count: number): void {
		this.options.notifyResults?.(count);
	}
}
