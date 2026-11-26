/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { URI } from '../../../../../base/common/uri.js';
import { registerAction2, Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { getSessionWorktreeFolder, getWorktreeFilterKey, getWorktreeFilterOptions, ISessionWorktreeFolder, IWorktreeFilterOption } from '../../common/sessionWorktreeFolders.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ILocalChatAvailabilityService } from '../../common/localChatAvailability.js';
import { runOnChange } from '../../../../../base/common/observable.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from './agentSessions.js';
import { AgentSessionStatus, IAgentSession } from './agentSessionsModel.js';
import { IAgentSessionsService } from './agentSessionsService.js';
import { IAgentSessionsFilter, IAgentSessionsFilterExcludes } from './agentSessionsViewer.js';

export enum AgentSessionsGrouping {
	Capped = 'capped',
	Date = 'date',
	Repository = 'repository'
}

export enum AgentSessionsSorting {
	Created = 'created',
	Updated = 'updated'
}

export interface IAgentSessionsFilterOptions extends Partial<IAgentSessionsFilter> {

	readonly filterMenuId?: MenuId;

	/**
	 * When set, only these providers appear in the filter menu (opt-in).
	 * When unset, all registered contributions plus `Local` are shown.
	 */
	readonly allowedProviders?: AgentSessionProviders[];

	/**
	 * Optional label overrides for providers shown in the filter menu.
	 * For example, the sessions window maps `Background` → "Local".
	 */
	readonly providerLabelOverrides?: ReadonlyMap<string, string>;

	notifyResults?(count: number): void;

	readonly groupResults?: () => AgentSessionsGrouping | undefined;
	readonly sortResults?: () => AgentSessionsSorting | undefined;

	/** As the user picks a worktree folder, by its key, in the Worktrees submenu: not All Worktrees, nor a choice that applies again. */
	readonly onDidPickWorktree?: (worktree: string) => void;
}

const DEFAULT_EXCLUDES: IAgentSessionsFilterExcludes = Object.freeze({
	providers: [] as const,
	states: [] as const,
	archived: true as const /* archived are never excluded but toggle between expanded and collapsed */,
	read: false as const,
	automation: true as const,
	repositoryGroupCapped: true as const /* when true, repo groups are capped at a limit with a "show more" item */,
});

/** `excludes` showing the sessions of the worktree folder `worktree` alone, or of all folders where `undefined`. */
function withWorktree(excludes: IAgentSessionsFilterExcludes, worktree: string | undefined): IAgentSessionsFilterExcludes {
	const { worktree: _previous, ...rest } = excludes;
	return worktree === undefined ? rest : { ...rest, worktree };
}

/**
 * Where `session` works, for the Worktrees filter: its worktree, else its working directory, of the repository it knows,
 * else of the repository that folder is a worktree of. Sessions without a folder, such as local chats, have none.
 */
export function getAgentSessionWorktreeFolder(session: IAgentSession): ISessionWorktreeFolder | undefined {
	const path = (value: unknown) => typeof value === 'string' && value ? URI.file(value) : undefined;
	const metadata = session.metadata;
	return getSessionWorktreeFolder(path(metadata?.worktreePath) ?? path(metadata?.workingDirectoryPath), path(metadata?.repositoryPath));
}

export class AgentSessionsFilter extends Disposable implements Required<IAgentSessionsFilter> {

	private readonly STORAGE_KEY = `agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu`;
	private readonly SORTING_STORAGE_KEY = `agentSessions.sorting`;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	readonly groupResults = () => this.options.groupResults?.();
	readonly sortResults = (): AgentSessionsSorting | undefined => this.options.sortResults?.() ?? this.currentSorting;

	private excludes = DEFAULT_EXCLUDES;
	private isStoringExcludes = false;
	private currentSorting: AgentSessionsSorting = AgentSessionsSorting.Created;

	private readonly actionDisposables = this._register(new DisposableStore());
	private worktreeOptions: readonly IWorktreeFilterOption[] = [];

	constructor(
		private readonly options: IAgentSessionsFilterOptions,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IStorageService private readonly storageService: IStorageService,
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILocalChatAvailabilityService private readonly localChatAvailabilityService: ILocalChatAvailabilityService,
	) {
		super();

		this.restoreSorting();
		this.worktreeOptions = this.getWorktreeOptions();
		this.updateExcludes(false);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.updateFilterActions()));
		this._register(this.chatSessionsService.onDidChangeAvailability(() => this.updateFilterActions()));

		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
		this._register(runOnChange(this.localChatAvailabilityService.hidden, () => this._onDidChange.fire()));

		// The Worktrees submenu, and which folder's sessions show, follow the worktrees that sessions work in
		this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
			const worktreeOptions = this.getWorktreeOptions();
			if (!equals(worktreeOptions, this.worktreeOptions)) {
				const selected = this.getSelectedWorktree();
				this.worktreeOptions = worktreeOptions;
				this.updateFilterActions();
				// The selected folder comes to apply, as its sessions arrive, or no longer does, as they go
				if (this.getSelectedWorktree() !== selected) {
					this._onDidChange.fire();
				}
			}
		}));
	}

	/**
	 * The options of the Worktrees submenu: the folders that sessions not archived work in. A folder whose sessions are all
	 * archived is not offered, and while it is selected all folders show, until one of its sessions is unarchived.
	 */
	private getWorktreeOptions(): IWorktreeFilterOption[] {
		return getWorktreeFilterOptions(this.agentSessionsService.model.sessions.filter(session => !session.isArchived()).map(getAgentSessionWorktreeFolder), this.uriIdentityService.extUri);
	}

	private updateExcludes(fromEvent: boolean): void {
		if (!this.isStoringExcludes) {
			const excludedTypesRaw = this.storageService.get(this.STORAGE_KEY, StorageScope.PROFILE);
			if (excludedTypesRaw) {
				try {
					// Earlier builds stored the hidden worktree folders (`worktrees`): those show all folders again
					const { worktrees: _hiddenWorktrees, worktree, ...stored } = JSON.parse(excludedTypesRaw) as Partial<IAgentSessionsFilterExcludes> & { readonly worktrees?: unknown };
					this.excludes = withWorktree({ ...DEFAULT_EXCLUDES, ...stored }, typeof worktree === 'string' ? worktree : undefined);
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

	private restoreSorting(): void {
		const storedSorting = this.storageService.get(this.SORTING_STORAGE_KEY, StorageScope.PROFILE);
		if (storedSorting && Object.values(AgentSessionsSorting).includes(storedSorting as AgentSessionsSorting)) {
			this.currentSorting = storedSorting as AgentSessionsSorting;
		}
	}

	setSorting(sorting: AgentSessionsSorting): void {
		if (this.currentSorting === sorting) {
			return;
		}

		this.currentSorting = sorting;
		this.storageService.store(this.SORTING_STORAGE_KEY, sorting, StorageScope.PROFILE, StorageTarget.USER);
		this.updateFilterActions();
		this._onDidChange.fire();
	}

	private updateFilterActions(): void {
		this.actionDisposables.clear();

		const menuId = this.options.filterMenuId;
		if (!menuId) {
			return;
		}

		this.registerSortActions(this.actionDisposables, menuId);
		this.registerProviderActions(this.actionDisposables, menuId);
		this.registerWorktreeActions(this.actionDisposables, menuId);
		this.registerStateActions(this.actionDisposables, menuId);
		this.registerArchivedActions(this.actionDisposables, menuId);
		this.registerReadActions(this.actionDisposables, menuId);
		this.registerAutomationActions(this.actionDisposables, menuId);
		this.registerResetAction(this.actionDisposables, menuId);
	}

	private registerSortActions(disposables: DisposableStore, menuId: MenuId): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.sortByCreated.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.sortByCreated', 'Sort by Created'),
					menu: {
						id: menuId,
						group: '0_sort',
						order: 0,
					},
					toggled: that.currentSorting === AgentSessionsSorting.Created ? ContextKeyExpr.true() : ContextKeyExpr.false(),
				});
			}
			run(): void {
				that.setSorting(AgentSessionsSorting.Created);
			}
		}));

		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.sortByUpdated.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.sortByUpdated', 'Sort by Updated'),
					menu: {
						id: menuId,
						group: '0_sort',
						order: 1,
					},
					toggled: that.currentSorting === AgentSessionsSorting.Updated ? ContextKeyExpr.true() : ContextKeyExpr.false(),
				});
			}
			run(): void {
				that.setSorting(AgentSessionsSorting.Updated);
			}
		}));
	}

	private registerProviderActions(disposables: DisposableStore, menuId: MenuId): void {
		const labelOverrides = this.options.providerLabelOverrides;
		const resolveLabel = (id: string) => {
			if (labelOverrides?.has(id)) {
				return labelOverrides.get(id)!;
			}
			const knownProvider = getAgentSessionProvider(id);
			return knownProvider ? getAgentSessionProviderName(knownProvider) : id;
		};

		let providers: { id: string; label: string }[];
		if (this.options.allowedProviders) {
			// Opt-in: only show explicitly allowed providers
			providers = this.options.allowedProviders.map(id => ({ id, label: resolveLabel(id) }));
		} else {
			// Default: Local + all registered contributions
			providers = [{ id: AgentSessionProviders.Local, label: resolveLabel(AgentSessionProviders.Local) }];
			for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
				const id = contribution.sessionListGroup ?? contribution.type;
				if (providers.find(p => p.id === id)) {
					continue; // already added
				}
				providers.push({
					id,
					label: resolveLabel(id)
				});
			}
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

	/**
	 * The worktree folder whose sessions alone show: the selected one while sessions work in it, else none, so that the
	 * list never stays empty for a folder the Worktrees submenu no longer offers.
	 */
	private getSelectedWorktree(): string | undefined {
		const selected = this.excludes.worktree;
		return selected !== undefined && this.worktreeOptions.some(option => option.key === selected) ? selected : undefined;
	}

	/**
	 * A Worktrees submenu to show the sessions of all folders (the default) or of one: of the worktrees that sessions work
	 * in, or of their repository's own folder.
	 */
	private registerWorktreeActions(disposables: DisposableStore, menuId: MenuId): void {
		if (this.worktreeOptions.length === 0) {
			return;
		}
		const worktreesMenuId = MenuId.for(`${menuId.id}.worktrees`);
		disposables.add(MenuRegistry.appendMenuItem(menuId, {
			submenu: worktreesMenuId,
			title: localize('agentSessions.filter.worktrees', "Worktrees"),
			group: '1_providers',
			order: 1000,
		}));
		const that = this;
		const selected = this.getSelectedWorktree();
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.allWorktrees.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.allWorktrees', "All Worktrees"),
					menu: { id: worktreesMenuId, group: '0_all', order: 0 },
					toggled: selected === undefined ? ContextKeyExpr.true() : ContextKeyExpr.false(),
				});
			}
			run(): void {
				that.storeExcludes(withWorktree(that.excludes, undefined));
			}
		}));
		for (const [index, option] of this.worktreeOptions.entries()) {
			disposables.add(registerAction2(class extends Action2 {
				constructor() {
					super({
						id: `agentSessions.filter.selectWorktree:${encodeURIComponent(option.key)}.${menuId.id.toLowerCase()}`,
						title: option.label,
						menu: {
							id: worktreesMenuId,
							group: option.isRepository ? '1_repository' : '2_worktrees',
							order: index,
						},
						toggled: selected === option.key ? ContextKeyExpr.true() : ContextKeyExpr.false(),
					});
				}
				run(): void {
					that.storeExcludes(withWorktree(that.excludes, option.key));
					that.options.onDidPickWorktree?.(option.key);
				}
			}));
		}
	}

	private registerStateActions(disposables: DisposableStore, menuId: MenuId): void {
		const states: { id: AgentSessionStatus; label: string }[] = [
			{ id: AgentSessionStatus.Completed, label: localize('agentSessionStatus.completed', "Completed") },
			{ id: AgentSessionStatus.InProgress, label: localize('agentSessionStatus.inProgress', "In Progress") },
			{ id: AgentSessionStatus.NeedsInput, label: localize('agentSessionStatus.needsInput', "Attention Needed") },
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

	private registerAutomationActions(disposables: DisposableStore, menuId: MenuId): void {
		const that = this;
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: `agentSessions.filter.toggleExcludeAutomation.${menuId.id.toLowerCase()}`,
					title: localize('agentSessions.filter.automation', "Automations"),
					menu: {
						id: menuId,
						group: '3_props',
						order: 1,
					},
					toggled: that.excludes.automation ? ContextKeyExpr.false() : ContextKeyExpr.true(),
				});
			}
			run(): void {
				that.storeExcludes({ ...that.excludes, automation: !that.excludes.automation });
			}
		}));
	}

	/**
	 * Programmatically toggle the repository group capping state.
	 */
	setRepositoryGroupCapped(capped: boolean): void {
		if (this.excludes.repositoryGroupCapped !== capped) {
			this.storeExcludes({ ...this.excludes, repositoryGroupCapped: capped });
		}
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
				that.reset();
			}
		}));
	}

	isDefault(): boolean {
		return equals(withWorktree(this.excludes, this.getSelectedWorktree()), DEFAULT_EXCLUDES) && this.currentSorting === AgentSessionsSorting.Created;
	}

	getExcludes(): IAgentSessionsFilterExcludes {
		return this.excludes;
	}

	exclude(session: IAgentSession): boolean {
		// Local chats are not shown while a feature hides them, such as one that opens the chats in the chat part
		if (session.providerType === AgentSessionProviders.Local && this.localChatAvailabilityService.hidden.get()) {
			return true;
		}

		const providerFilter = this.chatSessionsService.getChatSessionContribution(session.providerType)?.sessionListGroup ?? session.providerType;
		if (this.options.allowedProviders && !this.options.allowedProviders.includes(providerFilter as AgentSessionProviders)) {
			return true;
		}

		if (this.excludes.automation && session.metadata?.isAutomation === true) {
			return true;
		}

		if (this.excludes.read && session.isRead()) {
			return true;
		}

		if (this.excludes.providers.includes(providerFilter)) {
			return true;
		}

		if (this.excludes.states.includes(session.status)) {
			return true;
		}

		const selectedWorktree = this.getSelectedWorktree();
		if (selectedWorktree !== undefined) {
			const worktree = getAgentSessionWorktreeFolder(session);
			if (worktree && getWorktreeFilterKey(worktree.folder, this.uriIdentityService.extUri) !== selectedWorktree) {
				return true;
			}
		}

		if (this.excludes.archived && this.groupResults?.() === AgentSessionsGrouping.Capped && session.isArchived()) {
			return true; // exclude archived sessions when grouped by capped where we have no "Archived" group
		}

		return false;
	}

	notifyResults(count: number): void {
		this.options.notifyResults?.(count);
	}

	reset(): void {
		this.storeExcludes({ ...DEFAULT_EXCLUDES });
		if (this.currentSorting !== AgentSessionsSorting.Created) {
			this.setSorting(AgentSessionsSorting.Created);
		}
	}
}
