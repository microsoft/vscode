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
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ISCMViewService, ISCMService } from '../common/scm.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SCMMenus } from './menus.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { debounce } from '../../../../base/common/decorators.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';
import { basename } from '../../../../base/common/resources.js';
import { binarySearch } from '../../../../base/common/arrays.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { autorun, derived, derivedObservableWithCache, derivedOpts, latestChangedValue, observableFromEventOpts, observableValue, runOnChange } from '../../../../base/common/observable.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { getSCMRepositoryIcon } from './util.js';
function getProviderStorageKey(provider) {
    return `${provider.providerId}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}
function getRepositoryName(workspaceContextService, repository) {
    if (!repository.provider.rootUri) {
        return repository.provider.label;
    }
    const folder = workspaceContextService.getWorkspaceFolder(repository.provider.rootUri);
    return folder?.uri.toString() === repository.provider.rootUri.toString() ? folder.name : basename(repository.provider.rootUri);
}
export const RepositoryContextKeys = {
    RepositorySortKey: new RawContextKey('scmRepositorySortKey', "discoveryTime" /* ISCMRepositorySortKey.DiscoveryTime */),
    RepositorySelectionMode: new RawContextKey('scmRepositorySelectionMode', "single" /* ISCMRepositorySelectionMode.Single */),
};
let RepositoryPicker = class RepositoryPicker {
    constructor(_placeHolder, _autoQuickItemDescription, _quickInputService, _scmViewService) {
        this._placeHolder = _placeHolder;
        this._autoQuickItemDescription = _autoQuickItemDescription;
        this._quickInputService = _quickInputService;
        this._scmViewService = _scmViewService;
        this._autoQuickPickItem = {
            label: localize('auto', "Auto"),
            description: this._autoQuickItemDescription,
            repository: 'auto'
        };
    }
    async pickRepository() {
        const picks = [
            this._autoQuickPickItem,
            { type: 'separator' }
        ];
        const activeRepository = this._scmViewService.activeRepository.get();
        const repository = activeRepository?.repository;
        const pinned = activeRepository?.pinned === true;
        picks.push(...this._scmViewService.repositories.map(r => {
            const icon = getSCMRepositoryIcon(activeRepository, r);
            return {
                label: r.provider.name,
                description: r.provider.rootUri?.fsPath,
                iconClass: ThemeIcon.asClassName(icon),
                repository: r
            };
        }));
        const activeItem = pinned
            ? picks.find(p => p.type !== 'separator' && p.repository === repository)
            : this._autoQuickPickItem;
        return this._quickInputService.pick(picks, { placeHolder: this._placeHolder, activeItem });
    }
};
RepositoryPicker = __decorate([
    __param(2, IQuickInputService),
    __param(3, ISCMViewService)
], RepositoryPicker);
export { RepositoryPicker };
let SCMViewService = class SCMViewService {
    get repositories() {
        return this._repositories
            .filter(r => r.repository.provider.isHidden !== true)
            .map(r => r.repository);
    }
    get visibleRepositories() {
        // In order to match the legacy behaviour, when the repositories are sorted by discovery time,
        // the visible repositories are sorted by the selection index instead of the discovery time.
        if (this._repositoriesSortKey === "discoveryTime" /* ISCMRepositorySortKey.DiscoveryTime */) {
            return this._repositories
                .filter(r => r.repository.provider.isHidden !== true && r.selectionIndex !== -1)
                .sort((r1, r2) => r1.selectionIndex - r2.selectionIndex)
                .map(r => r.repository);
        }
        return this._repositories
            .filter(r => r.repository.provider.isHidden !== true && r.selectionIndex !== -1)
            .map(r => r.repository);
    }
    set visibleRepositories(visibleRepositories) {
        const set = new Set(visibleRepositories);
        const added = new Set();
        const removed = new Set();
        for (const repositoryView of this._repositories) {
            // Selected -> !Selected
            if (!set.has(repositoryView.repository) && repositoryView.selectionIndex !== -1) {
                repositoryView.selectionIndex = -1;
                removed.add(repositoryView.repository);
            }
            // Selected | !Selected -> Selected
            if (set.has(repositoryView.repository)) {
                if (repositoryView.selectionIndex === -1) {
                    added.add(repositoryView.repository);
                }
                repositoryView.selectionIndex = visibleRepositories.indexOf(repositoryView.repository);
            }
        }
        if (added.size === 0 && removed.size === 0) {
            return;
        }
        this._onDidSetVisibleRepositories.fire({ added, removed });
        // Update focus if the focused repository is not visible anymore
        if (this._repositories.find(r => r.focused && r.selectionIndex === -1)) {
            this.focus(this._repositories.find(r => r.selectionIndex !== -1)?.repository);
        }
    }
    get focusedRepository() {
        return this._repositories.find(r => r.focused)?.repository;
    }
    constructor(scmService, contextKeyService, editorService, extensionService, instantiationService, configurationService, storageService, workspaceContextService) {
        this.scmService = scmService;
        this.editorService = editorService;
        this.configurationService = configurationService;
        this.storageService = storageService;
        this.workspaceContextService = workspaceContextService;
        this.didSelectRepository = false;
        this.disposables = new DisposableStore();
        this._repositories = [];
        this.didFinishLoadingRepositories = observableValue(this, false);
        this._onDidChangeRepositories = new Emitter();
        this.onDidChangeRepositories = this._onDidChangeRepositories.event;
        this._onDidSetVisibleRepositories = new Emitter();
        this.onDidChangeVisibleRepositories = Event.any(this._onDidSetVisibleRepositories.event, Event.debounce(this._onDidChangeRepositories.event, (last, e) => {
            if (!last) {
                return e;
            }
            const added = new Set(last.added);
            const removed = new Set(last.removed);
            for (const repository of e.added) {
                if (!removed.delete(repository)) {
                    added.add(repository);
                }
            }
            for (const repository of e.removed) {
                if (!added.delete(repository)) {
                    removed.add(repository);
                }
            }
            return { added, removed };
        }, 0, undefined, undefined, undefined, this.disposables));
        this._onDidFocusRepository = new Emitter();
        this.onDidFocusRepository = this._onDidFocusRepository.event;
        this.menus = instantiationService.createInstance(SCMMenus);
        const explorerEnabledConfig = observableConfigValue('scm.repositories.explorer', false, this.configurationService);
        this.graphShowIncomingChangesConfig = observableConfigValue('scm.graph.showIncomingChanges', true, this.configurationService);
        this.graphShowOutgoingChangesConfig = observableConfigValue('scm.graph.showOutgoingChanges', true, this.configurationService);
        this.selectionModeConfig = observableConfigValue('scm.repositories.selectionMode', "multiple" /* ISCMRepositorySelectionMode.Multiple */, this.configurationService);
        this.explorerEnabledConfig = derived(reader => {
            return explorerEnabledConfig.read(reader) === true && this.selectionModeConfig.read(reader) === "single" /* ISCMRepositorySelectionMode.Single */;
        });
        try {
            this.previousState = JSON.parse(storageService.get('scm:view:visibleRepositories', 1 /* StorageScope.WORKSPACE */, ''));
            // If previously there were multiple visible repositories but the
            // view mode is `single`, only restore the first visible repository.
            if (this.previousState && this.previousState.visible.length > 1 && this.selectionModeConfig.get() === "single" /* ISCMRepositorySelectionMode.Single */) {
                this.previousState = {
                    ...this.previousState,
                    visible: [this.previousState.visible[0]]
                };
            }
        }
        catch {
            // noop
        }
        this._focusedRepositoryObs = observableFromEventOpts({
            owner: this,
            equalsFn: () => false
        }, this.onDidFocusRepository, () => this.focusedRepository);
        this._activeEditorObs = observableFromEventOpts({
            owner: this,
            equalsFn: () => false
        }, this.editorService.onDidActiveEditorChange, () => this.editorService.activeEditor);
        this._activeEditorRepositoryObs = derivedObservableWithCache(this, (reader, lastValue) => {
            const activeEditor = this._activeEditorObs.read(reader);
            const activeResource = EditorResourceAccessor.getOriginalUri(activeEditor);
            if (!activeResource) {
                return lastValue;
            }
            const repository = this.scmService.getRepository(activeResource);
            if (!repository) {
                return lastValue;
            }
            return Object.create(repository);
        });
        this._activeRepositoryPinnedObs = observableValue(this, undefined);
        this._activeRepositoryObs = latestChangedValue(this, [this._activeEditorRepositoryObs, this._focusedRepositoryObs]);
        this.activeRepository = derivedOpts({
            owner: this,
            equalsFn: (r1, r2) => r1?.repository.id === r2?.repository.id && r1?.pinned === r2?.pinned
        }, reader => {
            const activeRepository = this._activeRepositoryObs.read(reader);
            const activeRepositoryPinned = this._activeRepositoryPinnedObs.read(reader);
            const repository = activeRepositoryPinned ?? activeRepository;
            const pinned = !!activeRepositoryPinned;
            return repository ? { repository, pinned } : undefined;
        });
        this.disposables.add(runOnChange(this.selectionModeConfig, selectionMode => {
            if (selectionMode === "single" /* ISCMRepositorySelectionMode.Single */ && this.visibleRepositories.length > 1) {
                const repository = this.visibleRepositories[0];
                this.visibleRepositories = [repository];
            }
            else if (selectionMode === "multiple" /* ISCMRepositorySelectionMode.Multiple */ && this.repositories.length > 1) {
                this.visibleRepositories = this.repositories;
            }
        }));
        this._repositoriesSortKey = this.previousState?.sortKey ?? this.getViewSortOrder();
        this._sortKeyContextKey = RepositoryContextKeys.RepositorySortKey.bindTo(contextKeyService);
        this._sortKeyContextKey.set(this._repositoriesSortKey);
        this._selectionModelContextKey = RepositoryContextKeys.RepositorySelectionMode.bindTo(contextKeyService);
        this.disposables.add(autorun(reader => {
            const selectionMode = this.selectionModeConfig.read(reader);
            this._selectionModelContextKey.set(selectionMode);
        }));
        scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
        scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
        for (const repository of scmService.repositories) {
            this.onDidAddRepository(repository);
        }
        storageService.onWillSaveState(this.onWillSaveState, this, this.disposables);
        // Maintain repository selection when the extension host restarts.
        // Extension host is restarted after installing an extension update
        // or during a profile switch.
        extensionService.onWillStop(() => {
            this.onWillSaveState();
            this.didFinishLoadingRepositories.set(false, undefined);
        }, this, this.disposables);
    }
    onDidAddRepository(repository) {
        if (!this.didFinishLoadingRepositories.get()) {
            this.eventuallyFinishLoading();
        }
        const repositoryView = {
            repository, discoveryTime: Date.now(), focused: false, selectionIndex: -1
        };
        let removed = Iterable.empty();
        if (this.previousState && !this.didFinishLoadingRepositories.get()) {
            const index = this.previousState.all.indexOf(getProviderStorageKey(repository.provider));
            if (index === -1) {
                // This repository is not part of the previous state which means that it
                // was either manually closed in the previous session, or the repository
                // was added after the previous session. In this case, we should select
                // all of the repositories.
                const added = [];
                this.insertRepositoryView(this._repositories, repositoryView);
                if (this.selectionModeConfig.get() === "multiple" /* ISCMRepositorySelectionMode.Multiple */ || !this._repositories.find(r => r.selectionIndex !== -1)) {
                    // Multiple selection mode or single selection mode (select first repository)
                    this._repositories.forEach((repositoryView, index) => {
                        if (repositoryView.selectionIndex === -1) {
                            added.push(repositoryView.repository);
                        }
                        repositoryView.selectionIndex = index;
                    });
                    this._onDidChangeRepositories.fire({ added, removed: Iterable.empty() });
                }
                this.didSelectRepository = false;
                return;
            }
            if (this.previousState.visible.indexOf(index) === -1) {
                // Explicit selection started
                if (this.didSelectRepository) {
                    this.insertRepositoryView(this._repositories, repositoryView);
                    this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
                    return;
                }
            }
            else {
                // First visible repository
                if (!this.didSelectRepository) {
                    removed = [...this.visibleRepositories];
                    this._repositories.forEach(r => {
                        r.focused = false;
                        r.selectionIndex = -1;
                    });
                    this.didSelectRepository = true;
                }
            }
        }
        if (this.selectionModeConfig.get() === "multiple" /* ISCMRepositorySelectionMode.Multiple */ || !this._repositories.find(r => r.selectionIndex !== -1)) {
            // Multiple selection mode or single selection mode (select first repository)
            const maxSelectionIndex = this.getMaxSelectionIndex();
            this.insertRepositoryView(this._repositories, { ...repositoryView, selectionIndex: maxSelectionIndex + 1 });
            this._onDidChangeRepositories.fire({ added: [repositoryView.repository], removed });
        }
        else {
            // Single selection mode (add subsequent repository)
            this.insertRepositoryView(this._repositories, repositoryView);
            this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed });
        }
        // Focus repository if nothing is focused
        if (!this._repositories.find(r => r.focused)) {
            this.focus(repository);
        }
    }
    onDidRemoveRepository(repository) {
        if (!this.didFinishLoadingRepositories.get()) {
            this.eventuallyFinishLoading();
        }
        const repositoriesIndex = this._repositories.findIndex(r => r.repository === repository);
        if (repositoriesIndex === -1) {
            return;
        }
        let added = Iterable.empty();
        const removed = this._repositories.splice(repositoriesIndex, 1);
        if (this._repositories.length > 0 && this.visibleRepositories.length === 0) {
            this._repositories[0].selectionIndex = 0;
            added = [this._repositories[0].repository];
        }
        this._onDidChangeRepositories.fire({ added, removed: removed.map(r => r.repository) });
        // Check if the focused repository was removed
        if (removed.length === 1 && removed[0].focused && this.visibleRepositories.length > 0) {
            this.focus(this.visibleRepositories[0]);
        }
        // Check if the last repository was removed
        if (removed.length === 1 && this._repositories.length === 0) {
            this._onDidFocusRepository.fire(undefined);
        }
        // Check if the pinned repository was removed
        if (removed.length === 1 && removed[0].repository === this._activeRepositoryPinnedObs.get()) {
            this._activeRepositoryPinnedObs.set(undefined, undefined);
        }
    }
    isVisible(repository) {
        return this._repositories.find(r => r.repository === repository)?.selectionIndex !== -1;
    }
    toggleVisibility(repository, visible) {
        if (typeof visible === 'undefined') {
            visible = !this.isVisible(repository);
        }
        else if (this.isVisible(repository) === visible) {
            return;
        }
        if (visible) {
            if (this.selectionModeConfig.get() === "single" /* ISCMRepositorySelectionMode.Single */) {
                this.visibleRepositories = [repository];
            }
            else if (this.selectionModeConfig.get() === "multiple" /* ISCMRepositorySelectionMode.Multiple */) {
                this.visibleRepositories = [...this.visibleRepositories, repository];
            }
        }
        else {
            const index = this.visibleRepositories.indexOf(repository);
            if (index > -1) {
                this.visibleRepositories = [
                    ...this.visibleRepositories.slice(0, index),
                    ...this.visibleRepositories.slice(index + 1)
                ];
            }
        }
    }
    toggleSortKey(sortKey) {
        this._repositoriesSortKey = sortKey;
        this._sortKeyContextKey.set(this._repositoriesSortKey);
        this._repositories.sort(this.compareRepositories.bind(this));
        this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
    }
    toggleSelectionMode(selectionMode) {
        this.configurationService.updateValue('scm.repositories.selectionMode', selectionMode);
    }
    focus(repository) {
        if (repository && !this.isVisible(repository)) {
            return;
        }
        this._repositories.forEach(r => r.focused = r.repository === repository);
        if (this._repositories.find(r => r.focused)) {
            this._onDidFocusRepository.fire(repository);
        }
    }
    pinActiveRepository(repository) {
        this._activeRepositoryPinnedObs.set(repository, undefined);
    }
    compareRepositories(op1, op2) {
        // Sort by discovery time
        if (this._repositoriesSortKey === "discoveryTime" /* ISCMRepositorySortKey.DiscoveryTime */) {
            return op1.discoveryTime - op2.discoveryTime;
        }
        // Sort by path
        if (this._repositoriesSortKey === 'path' && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
            return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
        }
        // Sort by name, path
        const name1 = getRepositoryName(this.workspaceContextService, op1.repository);
        const name2 = getRepositoryName(this.workspaceContextService, op2.repository);
        const nameComparison = compareFileNames(name1, name2);
        if (nameComparison === 0 && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
            return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
        }
        return nameComparison;
    }
    getMaxSelectionIndex() {
        return this._repositories.length === 0 ? -1 :
            Math.max(...this._repositories.map(r => r.selectionIndex));
    }
    getViewSortOrder() {
        const sortOder = this.configurationService.getValue('scm.repositories.sortOrder');
        switch (sortOder) {
            case 'discovery time':
                return "discoveryTime" /* ISCMRepositorySortKey.DiscoveryTime */;
            case 'name':
                return "name" /* ISCMRepositorySortKey.Name */;
            case 'path':
                return "path" /* ISCMRepositorySortKey.Path */;
            default:
                return "discoveryTime" /* ISCMRepositorySortKey.DiscoveryTime */;
        }
    }
    insertRepositoryView(repositories, repositoryView) {
        const index = binarySearch(repositories, repositoryView, this.compareRepositories.bind(this));
        repositories.splice(index < 0 ? ~index : index, 0, repositoryView);
    }
    onWillSaveState() {
        if (!this.didFinishLoadingRepositories.get()) {
            // Don't remember state, if the workbench didn't really finish loading
            return;
        }
        const all = this.repositories.map(r => getProviderStorageKey(r.provider));
        const visible = this.visibleRepositories.map(r => all.indexOf(getProviderStorageKey(r.provider)));
        this.previousState = { all, visible, sortKey: this._repositoriesSortKey };
        this.storageService.store('scm:view:visibleRepositories', JSON.stringify(this.previousState), 1 /* StorageScope.WORKSPACE */, 1 /* StorageTarget.MACHINE */);
    }
    eventuallyFinishLoading() {
        this.finishLoading();
    }
    finishLoading() {
        if (this.didFinishLoadingRepositories.get()) {
            return;
        }
        this.didFinishLoadingRepositories.set(true, undefined);
    }
    dispose() {
        this.disposables.dispose();
        this._onDidFocusRepository.dispose();
        this._onDidChangeRepositories.dispose();
        this._onDidSetVisibleRepositories.dispose();
    }
};
__decorate([
    debounce(5000)
], SCMViewService.prototype, "eventuallyFinishLoading", null);
SCMViewService = __decorate([
    __param(0, ISCMService),
    __param(1, IContextKeyService),
    __param(2, IEditorService),
    __param(3, IExtensionService),
    __param(4, IInstantiationService),
    __param(5, IConfigurationService),
    __param(6, IStorageService),
    __param(7, IWorkspaceContextService)
], SCMViewService);
export { SCMViewService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NtVmlld1NlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zY20vYnJvd3Nlci9zY21WaWV3U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsZUFBZSxFQUFrQixXQUFXLEVBQXFILE1BQU0sa0JBQWtCLENBQUM7QUFDbk0sT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDdEMsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDakUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDakUsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDbkcsT0FBTyxFQUFlLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1EQUFtRCxD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