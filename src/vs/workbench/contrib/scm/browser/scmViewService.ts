/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ISCMViewService, ISCMRepository, ISCMService, ISCMViewVisibleRepositoryChangeEvent, ISCMMenus, ISCMProvider, ISCMRepositorySortKey } from '../common/scm.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { SCMMenus } from './menus.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { debounce } from '../../../../base/common/decorators.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { compareFileNames, comparePaths } from '../../../../base/common/comparers.js';
import { basename } from '../../../../base/common/resources.js';
import { binarySearch } from '../../../../base/common/arrays.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { derivedObservableWithCache, derivedOpts, IObservable, ISettableObservable, latestChangedValue, observableFromEventOpts, observableValue } from '../../../../base/common/observable.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { EditorResourceAccessor } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../platform/quickinput/common/quickInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';

function getProviderStorageKey(provider: ISCMProvider): string {
	return `${provider.contextValue}:${provider.label}${provider.rootUri ? `:${provider.rootUri.toString()}` : ''}`;
}

function getRepositoryName(workspaceContextService: IWorkspaceContextService, repository: ISCMRepository): string {
	if (!repository.provider.rootUri) {
		return repository.provider.label;
	}

	const folder = workspaceContextService.getWorkspaceFolder(repository.provider.rootUri);
	return folder?.uri.toString() === repository.provider.rootUri.toString() ? folder.name : basename(repository.provider.rootUri);
}

export const RepositoryContextKeys = {
	RepositorySortKey: new RawContextKey<ISCMRepositorySortKey>('scmRepositorySortKey', ISCMRepositorySortKey.DiscoveryTime),
};

export type RepositoryQuickPickItem = IQuickPickItem & { repository: 'auto' | ISCMRepository };

export class RepositoryPicker {
	private readonly _autoQuickPickItem: RepositoryQuickPickItem;

	constructor(
		private readonly _placeHolder: string,
		private readonly _autoQuickItemDescription: string,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ISCMViewService private readonly _scmViewService: ISCMViewService
	) {
		this._autoQuickPickItem = {
			label: localize('auto', "Auto"),
			description: this._autoQuickItemDescription,
			repository: 'auto'
		} satisfies RepositoryQuickPickItem;
	}

	async pickRepository(): Promise<RepositoryQuickPickItem | undefined> {
		const picks: (RepositoryQuickPickItem | IQuickPickSeparator)[] = [
			this._autoQuickPickItem,
			{ type: 'separator' }
		];

		picks.push(...this._scmViewService.repositories.map(r => ({
			label: r.provider.name,
			description: r.provider.rootUri?.fsPath,
			iconClass: ThemeIcon.asClassName(Codicon.repo),
			repository: r
		})));

		return this._quickInputService.pick(picks, { placeHolder: this._placeHolder });
	}
}

interface ISCMRepositoryView {
	readonly repository: ISCMRepository;
	readonly discoveryTime: number;
	focused: boolean;
	selectionIndex: number;
}

export interface ISCMViewServiceState {
	readonly all: string[];
	readonly sortKey: ISCMRepositorySortKey;
	readonly visible: number[];
}

export class SCMViewService implements ISCMViewService {

	declare readonly _serviceBrand: undefined;

	readonly menus: ISCMMenus;

	private didFinishLoading: boolean = false;
	private didSelectRepository: boolean = false;
	private previousState: ISCMViewServiceState | undefined;
	private readonly disposables = new DisposableStore();

	private _repositories: ISCMRepositoryView[] = [];

	get repositories(): ISCMRepository[] {
		return this._repositories.map(r => r.repository);
	}

	get visibleRepositories(): ISCMRepository[] {
		// In order to match the legacy behaviour, when the repositories are sorted by discovery time,
		// the visible repositories are sorted by the selection index instead of the discovery time.
		if (this._repositoriesSortKey === ISCMRepositorySortKey.DiscoveryTime) {
			return this._repositories.filter(r => r.selectionIndex !== -1)
				.sort((r1, r2) => r1.selectionIndex - r2.selectionIndex)
				.map(r => r.repository);
		}

		return this._repositories
			.filter(r => r.selectionIndex !== -1)
			.map(r => r.repository);
	}

	set visibleRepositories(visibleRepositories: ISCMRepository[]) {
		const set = new Set(visibleRepositories);
		const added = new Set<ISCMRepository>();
		const removed = new Set<ISCMRepository>();

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

	private _onDidChangeRepositories = new Emitter<ISCMViewVisibleRepositoryChangeEvent>();
	readonly onDidChangeRepositories = this._onDidChangeRepositories.event;

	private _onDidSetVisibleRepositories = new Emitter<ISCMViewVisibleRepositoryChangeEvent>();
	readonly onDidChangeVisibleRepositories = Event.any(
		this._onDidSetVisibleRepositories.event,
		Event.debounce(
			this._onDidChangeRepositories.event,
			(last, e) => {
				if (!last) {
					return e;
				}

				const added = new Set(last.added);
				const removed = new Set(last.removed);

				for (const repository of e.added) {
					if (removed.has(repository)) {
						removed.delete(repository);
					} else {
						added.add(repository);
					}
				}
				for (const repository of e.removed) {
					if (added.has(repository)) {
						added.delete(repository);
					} else {
						removed.add(repository);
					}
				}

				return { added, removed };
			}, 0, undefined, undefined, undefined, this.disposables)
	);

	get focusedRepository(): ISCMRepository | undefined {
		return this._repositories.find(r => r.focused)?.repository;
	}

	private _onDidFocusRepository = new Emitter<ISCMRepository | undefined>();
	readonly onDidFocusRepository = this._onDidFocusRepository.event;

	readonly activeRepository: IObservable<ISCMRepository | undefined>;
	private readonly _activeEditorObs: IObservable<EditorInput | undefined>;
	private readonly _activeEditorRepositoryObs: IObservable<ISCMRepository | undefined>;

	/**
	 * The focused repository takes precedence over the active editor repository when the observable
	 * values are updated in the same transaction (or during the initial read of the observable value).
	*/
	private readonly _activeRepositoryObs: IObservable<ISCMRepository | undefined>;
	private readonly _activeRepositoryPinnedObs: ISettableObservable<ISCMRepository | undefined>;
	private readonly _focusedRepositoryObs: IObservable<ISCMRepository | undefined>;

	private _repositoriesSortKey: ISCMRepositorySortKey;
	private _sortKeyContextKey: IContextKey<ISCMRepositorySortKey>;

	constructor(
		@ISCMService private readonly scmService: ISCMService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@IExtensionService extensionService: IExtensionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService
	) {
		this.menus = instantiationService.createInstance(SCMMenus);

		this._focusedRepositoryObs = observableFromEventOpts<ISCMRepository | undefined>(
			{
				owner: this,
				equalsFn: () => false
			}, this.onDidFocusRepository,
			() => this.focusedRepository);

		this._activeEditorObs = observableFromEventOpts(
			{
				owner: this,
				equalsFn: () => false
			}, this.editorService.onDidActiveEditorChange,
			() => this.editorService.activeEditor);

		this._activeEditorRepositoryObs = derivedObservableWithCache<ISCMRepository | undefined>(this,
			(reader, lastValue) => {
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

		this._activeRepositoryPinnedObs = observableValue<ISCMRepository | undefined>(this, undefined);
		this._activeRepositoryObs = latestChangedValue(this, [this._activeEditorRepositoryObs, this._focusedRepositoryObs]);

		this.activeRepository = derivedOpts<ISCMRepository | undefined>({
			owner: this,
			equalsFn: (r1, r2) => r1?.id === r2?.id
		}, reader => {
			const activeRepository = this._activeRepositoryObs.read(reader);
			const activeRepositoryPinned = this._activeRepositoryPinnedObs.read(reader);

			return activeRepositoryPinned ?? activeRepository;
		});

		try {
			this.previousState = JSON.parse(storageService.get('scm:view:visibleRepositories', StorageScope.WORKSPACE, ''));
		} catch {
			// noop
		}

		this._repositoriesSortKey = this.previousState?.sortKey ?? this.getViewSortOrder();
		this._sortKeyContextKey = RepositoryContextKeys.RepositorySortKey.bindTo(contextKeyService);
		this._sortKeyContextKey.set(this._repositoriesSortKey);

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
			this.didFinishLoading = false;
		}, this, this.disposables);
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		if (!this.didFinishLoading) {
			this.eventuallyFinishLoading();
		}

		const repositoryView: ISCMRepositoryView = {
			repository, discoveryTime: Date.now(), focused: false, selectionIndex: -1
		};

		let removed: Iterable<ISCMRepository> = Iterable.empty();

		if (this.previousState && !this.didFinishLoading) {
			const index = this.previousState.all.indexOf(getProviderStorageKey(repository.provider));

			if (index === -1) {
				// This repository is not part of the previous state which means that it
				// was either manually closed in the previous session, or the repository
				// was added after the previous session.In this case, we should select all
				// of the repositories.
				const added: ISCMRepository[] = [];

				this.insertRepositoryView(this._repositories, repositoryView);
				this._repositories.forEach((repositoryView, index) => {
					if (repositoryView.selectionIndex === -1) {
						added.push(repositoryView.repository);
					}
					repositoryView.selectionIndex = index;
				});

				this._onDidChangeRepositories.fire({ added, removed: Iterable.empty() });
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
			} else {
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

		const maxSelectionIndex = this.getMaxSelectionIndex();
		this.insertRepositoryView(this._repositories, { ...repositoryView, selectionIndex: maxSelectionIndex + 1 });
		this._onDidChangeRepositories.fire({ added: [repositoryView.repository], removed });

		if (!this._repositories.find(r => r.focused)) {
			this.focus(repository);
		}
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		if (!this.didFinishLoading) {
			this.eventuallyFinishLoading();
		}

		const repositoriesIndex = this._repositories.findIndex(r => r.repository === repository);

		if (repositoriesIndex === -1) {
			return;
		}

		let added: Iterable<ISCMRepository> = Iterable.empty();
		const repositoryView = this._repositories.splice(repositoriesIndex, 1);

		if (this._repositories.length > 0 && this.visibleRepositories.length === 0) {
			this._repositories[0].selectionIndex = 0;
			added = [this._repositories[0].repository];
		}

		this._onDidChangeRepositories.fire({ added, removed: repositoryView.map(r => r.repository) });

		if (repositoryView.length === 1 && repositoryView[0].focused && this.visibleRepositories.length > 0) {
			this.focus(this.visibleRepositories[0]);
		}
	}

	isVisible(repository: ISCMRepository): boolean {
		return this._repositories.find(r => r.repository === repository)?.selectionIndex !== -1;
	}

	toggleVisibility(repository: ISCMRepository, visible?: boolean): void {
		if (typeof visible === 'undefined') {
			visible = !this.isVisible(repository);
		} else if (this.isVisible(repository) === visible) {
			return;
		}

		if (visible) {
			this.visibleRepositories = [...this.visibleRepositories, repository];
		} else {
			const index = this.visibleRepositories.indexOf(repository);

			if (index > -1) {
				this.visibleRepositories = [
					...this.visibleRepositories.slice(0, index),
					...this.visibleRepositories.slice(index + 1)
				];
			}
		}
	}

	toggleSortKey(sortKey: ISCMRepositorySortKey): void {
		this._repositoriesSortKey = sortKey;
		this._sortKeyContextKey.set(this._repositoriesSortKey);
		this._repositories.sort(this.compareRepositories.bind(this));

		this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
	}

	focus(repository: ISCMRepository | undefined): void {
		if (repository && !this.isVisible(repository)) {
			return;
		}

		this._repositories.forEach(r => r.focused = r.repository === repository);

		if (this._repositories.find(r => r.focused)) {
			this._onDidFocusRepository.fire(repository);
		}
	}

	pinActiveRepository(repository: ISCMRepository | undefined): void {
		this._activeRepositoryPinnedObs.set(repository, undefined);
	}

	private compareRepositories(op1: ISCMRepositoryView, op2: ISCMRepositoryView): number {
		// Sort by discovery time
		if (this._repositoriesSortKey === ISCMRepositorySortKey.DiscoveryTime) {
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

	private getMaxSelectionIndex(): number {
		return this._repositories.length === 0 ? -1 :
			Math.max(...this._repositories.map(r => r.selectionIndex));
	}

	private getViewSortOrder(): ISCMRepositorySortKey {
		const sortOder = this.configurationService.getValue<'discovery time' | 'name' | 'path'>('scm.repositories.sortOrder');
		switch (sortOder) {
			case 'discovery time':
				return ISCMRepositorySortKey.DiscoveryTime;
			case 'name':
				return ISCMRepositorySortKey.Name;
			case 'path':
				return ISCMRepositorySortKey.Path;
			default:
				return ISCMRepositorySortKey.DiscoveryTime;
		}
	}

	private insertRepositoryView(repositories: ISCMRepositoryView[], repositoryView: ISCMRepositoryView): void {
		const index = binarySearch(repositories, repositoryView, this.compareRepositories.bind(this));
		repositories.splice(index < 0 ? ~index : index, 0, repositoryView);
	}

	private onWillSaveState(): void {
		if (!this.didFinishLoading) { // don't remember state, if the workbench didn't really finish loading
			return;
		}

		const all = this.repositories.map(r => getProviderStorageKey(r.provider));
		const visible = this.visibleRepositories.map(r => all.indexOf(getProviderStorageKey(r.provider)));
		this.previousState = { all, sortKey: this._repositoriesSortKey, visible };

		this.storageService.store('scm:view:visibleRepositories', JSON.stringify(this.previousState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	@debounce(5000)
	private eventuallyFinishLoading(): void {
		this.finishLoading();
	}

	private finishLoading(): void {
		if (this.didFinishLoading) {
			return;
		}

		this.didFinishLoading = true;
	}

	dispose(): void {
		this.disposables.dispose();
		this._onDidChangeRepositories.dispose();
		this._onDidSetVisibleRepositories.dispose();
	}
}
