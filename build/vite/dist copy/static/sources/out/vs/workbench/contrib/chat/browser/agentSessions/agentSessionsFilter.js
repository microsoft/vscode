/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { localize } from '../../../../../nls.js';
import { registerAction2, Action2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from './agentSessions.js';
export var AgentSessionsGrouping;
(function (AgentSessionsGrouping) {
    AgentSessionsGrouping["Capped"] = "capped";
    AgentSessionsGrouping["Date"] = "date";
    AgentSessionsGrouping["Repository"] = "repository";
})(AgentSessionsGrouping || (AgentSessionsGrouping = {}));
export var AgentSessionsSorting;
(function (AgentSessionsSorting) {
    AgentSessionsSorting["Created"] = "created";
    AgentSessionsSorting["Updated"] = "updated";
})(AgentSessionsSorting || (AgentSessionsSorting = {}));
const DEFAULT_EXCLUDES = Object.freeze({
    providers: [],
    states: [],
    archived: true /* archived are never excluded but toggle between expanded and collapsed */,
    read: false,
    repositoryGroupCapped: true /* when true, repo groups are capped at a limit with a "show more" item */,
});
let AgentSessionsFilter = class AgentSessionsFilter extends Disposable {
    constructor(options, chatSessionsService, storageService) {
        super();
        this.options = options;
        this.chatSessionsService = chatSessionsService;
        this.storageService = storageService;
        this.STORAGE_KEY = `agentSessions.filterExcludes.agentsessionsviewerfiltersubmenu`;
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.limitResults = () => this.options.limitResults?.();
        this.groupResults = () => this.options.groupResults?.();
        this.sortResults = () => this.options.sortResults?.();
        this.excludes = DEFAULT_EXCLUDES;
        this.isStoringExcludes = false;
        this.actionDisposables = this._register(new DisposableStore());
        this.updateExcludes(false);
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.chatSessionsService.onDidChangeItemsProviders(() => this.updateFilterActions()));
        this._register(this.chatSessionsService.onDidChangeAvailability(() => this.updateFilterActions()));
        this._register(this.storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, this.STORAGE_KEY, this._store)(() => this.updateExcludes(true)));
    }
    updateExcludes(fromEvent) {
        if (!this.isStoringExcludes) {
            const excludedTypesRaw = this.storageService.get(this.STORAGE_KEY, 0 /* StorageScope.PROFILE */);
            if (excludedTypesRaw) {
                try {
                    this.excludes = JSON.parse(excludedTypesRaw);
                }
                catch {
                    this.excludes = { ...DEFAULT_EXCLUDES };
                }
            }
            else {
                this.excludes = { ...DEFAULT_EXCLUDES };
            }
        }
        this.updateFilterActions();
        if (fromEvent) {
            this._onDidChange.fire();
        }
    }
    storeExcludes(excludes) {
        this.excludes = excludes;
        // Set guard before storage operation to prevent our own listener from
        // re-triggering updateExcludes which would re-register actions mid-click
        this.isStoringExcludes = true;
        try {
            if (equals(this.excludes, DEFAULT_EXCLUDES)) {
                this.storageService.remove(this.STORAGE_KEY, 0 /* StorageScope.PROFILE */);
            }
            else {
                this.storageService.store(this.STORAGE_KEY, JSON.stringify(this.excludes), 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
            }
        }
        finally {
            this.isStoringExcludes = false;
        }
    }
    updateFilterActions() {
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
    registerProviderActions(disposables, menuId) {
        const labelOverrides = this.options.providerLabelOverrides;
        const resolveLabel = (id) => {
            if (labelOverrides?.has(id)) {
                return labelOverrides.get(id);
            }
            const knownProvider = getAgentSessionProvider(id);
            return knownProvider ? getAgentSessionProviderName(knownProvider) : id;
        };
        let providers;
        if (this.options.allowedProviders) {
            // Opt-in: only show explicitly allowed providers
            providers = this.options.allowedProviders.map(id => ({ id, label: resolveLabel(id) }));
        }
        else {
            // Default: Local + all registered contributions
            providers = [{ id: AgentSessionProviders.Local, label: resolveLabel(AgentSessionProviders.Local) }];
            for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
                if (providers.find(p => p.id === contribution.type)) {
                    continue; // already added
                }
                providers.push({
                    id: contribution.type,
                    label: resolveLabel(contribution.type)
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
                run() {
                    const providerExcludes = new Set(that.excludes.providers);
                    if (!providerExcludes.delete(provider.id)) {
                        providerExcludes.add(provider.id);
                    }
                    that.storeExcludes({ ...that.excludes, providers: Array.from(providerExcludes) });
                }
            }));
        }
    }
    registerStateActions(disposables, menuId) {
        const states = [
            { id: 1 /* AgentSessionStatus.Completed */, label: localize('agentSessionStatus.completed', "Completed") },
            { id: 2 /* AgentSessionStatus.InProgress */, label: localize('agentSessionStatus.inProgress', "In Progress") },
            { id: 3 /* AgentSessionStatus.NeedsInput */, label: localize('agentSessionStatus.needsInput', "Input Needed") },
            { id: 0 /* AgentSessionStatus.Failed */, label: localize('agentSessionStatus.failed', "Failed") },
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
                run() {
                    const stateExcludes = new Set(that.excludes.states);
                    if (!stateExcludes.delete(state.id)) {
                        stateExcludes.add(state.id);
                    }
                    that.storeExcludes({ ...that.excludes, states: Array.from(stateExcludes) });
                }
            }));
        }
    }
    registerArchivedActions(disposables, menuId) {
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
            run() {
                that.storeExcludes({ ...that.excludes, archived: !that.excludes.archived });
            }
        }));
    }
    registerReadActions(disposables, menuId) {
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
            run() {
                that.storeExcludes({ ...that.excludes, read: !that.excludes.read });
            }
        }));
    }
    /**
     * Programmatically toggle the repository group capping state.
     */
    setRepositoryGroupCapped(capped) {
        if (this.excludes.repositoryGroupCapped !== capped) {
            this.storeExcludes({ ...this.excludes, repositoryGroupCapped: capped });
        }
    }
    registerResetAction(disposables, menuId) {
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
            run() {
                that.reset();
            }
        }));
    }
    isDefault() {
        return equals(this.excludes, DEFAULT_EXCLUDES);
    }
    getExcludes() {
        return this.excludes;
    }
    exclude(session) {
        const overrideExclude = this.options?.overrideExclude?.(session);
        if (typeof overrideExclude === 'boolean') {
            return overrideExclude;
        }
        if (this.options.allowedProviders && !this.options.allowedProviders.includes(session.providerType)) {
            return true;
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
    notifyResults(count) {
        this.options.notifyResults?.(count);
    }
    reset() {
        this.storeExcludes({ ...DEFAULT_EXCLUDES });
    }
};
AgentSessionsFilter = __decorate([
    __param(1, IChatSessionsService),
    __param(2, IStorageService)
], AgentSessionsFilter);
export { AgentSessionsFilter };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRTZXNzaW9uc0ZpbHRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNGaWx0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzlELE9BQU8sRUFBRSxVQUFVLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDdEYsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE9BQU8sRUFBVSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsZUFBZSxFQUErQixNQUFNLG1EQUFtRCxDQUFDO0FBQ2pILE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSx1QkFBdUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBSWpILE1BQU0sQ0FBTixJQUFZLHFCQUlYO0FBSkQsV0FBWSxxQkFBcUI7SUFDaEMsMENBQWlCLENBQUE7SUFDakIsc0NBQWEsQ0FBQTtJQUNiLGtEQUF5QixDQUFBO0FBQzFCLENBQUMsRUFKVyxxQkFBcUIsS0FBckIscUJBQXFCLFFBSWhDO0FBRUQsTUFBTSxDQUFOLElBQVksb0JBR1g7QUFIRCxXQUFZLG9CQUFvQjtJQUMvQiwyQ0FBbUIsQ0FBQTtJQUNuQiwyQ0FBbUIsQ0FBQTtBQUNwQixDQUFDLEVBSFcs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