/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ISCMViewService, ISCMRepository, ISCMService, ISCMViewVisibleRepositoryChangeEvent, ISCMMenus, ISCMProvider, ISCMRepositoryView } from 'vs/workbench/contrib/scm/common/scm';
import { Iterable } from 'vs/base/common/iterator';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SCMMenus } from 'vs/workbench/contrib/scm/browser/menus';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { debounce } from 'vs/base/common/decorators';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { compareFileNames, comparePaths } from 'vs/base/common/comparers';
import { basename } from 'vs/base/common/resources';
import { binarySearch } from 'vs/base/common/arrays';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

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

export interface ISCMViewServiceState {
	readonly all: string[];
	readonly visible: number[];
}

export class SCMViewService implements ISCMViewService {

	declare readonly _serviceBrand: undefined;

	readonly menus: ISCMMenus;

	private didFinishLoading: boolean = false;
	private didSelectRepository: boolean = false;
	private previousState: ISCMViewServiceState | undefined;
	private disposables = new DisposableStore();

	private _repositories: ISCMRepositoryView[] = [];

	get repositories(): ISCMRepositoryView[] {
		return this._repositories;
	}

	get visibleRepositories(): ISCMRepositoryView[] {
		// In order to match the legacy behaviour, when the repositories are sorted by discovery time,
		// the visible repositories are sorted by the selection index instead of the discovery time.
		if (this._repositoriesSortKey === 'discovery time' && this._repositories.find(r => r.selectionIndex !== -1)) {
			return this._repositories.filter(r => r.visible)
				.sort((r1, r2) => r1.selectionIndex - r2.selectionIndex);
		}

		return this._repositories.filter(r => r.visible);
	}

	set visibleRepositories(visibleRepositories: ISCMRepositoryView[]) {
		const set = new Set(visibleRepositories);
		const added = new Set<ISCMRepositoryView>();
		const removed = new Set<ISCMRepositoryView>();

		for (const repositoryView of this._repositories) {
			if (set.has(repositoryView) && !repositoryView.visible) {
				repositoryView.visible = true;
				repositoryView.selectionIndex = visibleRepositories.indexOf(repositoryView);
				added.add(repositoryView);
			}
			if (!set.has(repositoryView) && repositoryView.visible) {
				repositoryView.visible = false;
				repositoryView.selectionIndex = -1;
				removed.add(repositoryView);
			}
		}

		if (added.size === 0 && removed.size === 0) {
			return;
		}

		this._onDidSetVisibleRepositories.fire({ added, removed });

		// Update focus if the focused repository is not visible anymore
		if (this._focusedRepository && this._repositories.find(r => r.repository === this._focusedRepository)?.visible === false) {
			this.focus(this._repositories.find(r => r.visible)?.repository);
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

				return {
					added: Iterable.concat(last.added, e.added),
					removed: Iterable.concat(last.removed, e.removed),
				};
			}, 0)
	);

	private _focusedRepository: ISCMRepository | undefined;

	get focusedRepository(): ISCMRepository | undefined {
		return this._focusedRepository;
	}

	private _onDidFocusRepository = new Emitter<ISCMRepository | undefined>();
	readonly onDidFocusRepository = this._onDidFocusRepository.event;

	private _repositoriesSortKey: 'discovery time' | 'name' | 'path';
	private _compareRepositories: (op1: ISCMRepositoryView, op2: ISCMRepositoryView) => number;

	constructor(
		@ISCMService scmService: ISCMService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		this.menus = instantiationService.createInstance(SCMMenus);
		this._repositoriesSortKey = configurationService.getValue('scm.repositories.sortOrder');

		this._compareRepositories = (op1: ISCMRepositoryView, op2: ISCMRepositoryView): number => {
			// Sort by discovery time
			if (this._repositoriesSortKey === 'discovery time') {
				return op1.discoveryTime - op2.discoveryTime;
			}

			// Sort by path
			if (this._repositoriesSortKey === 'path' && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
				return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
			}

			// Sort by name, path
			const name1 = getRepositoryName(workspaceContextService, op1.repository);
			const name2 = getRepositoryName(workspaceContextService, op2.repository);

			const nameComparison = compareFileNames(name1, name2);
			if (nameComparison === 0 && op1.repository.provider.rootUri && op2.repository.provider.rootUri) {
				return comparePaths(op1.repository.provider.rootUri.fsPath, op2.repository.provider.rootUri.fsPath);
			}

			return nameComparison;
		};

		scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
		scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);

		try {
			this.previousState = JSON.parse(storageService.get('scm:view:visibleRepositories', StorageScope.WORKSPACE, ''));
		} catch {
			// noop
		}

		for (const repository of scmService.repositories) {
			this.onDidAddRepository(repository);
		}

		storageService.onWillSaveState(this.onWillSaveState, this, this.disposables);
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		if (!this.didFinishLoading) {
			this.eventuallyFinishLoading();
		}

		const repositoryView: ISCMRepositoryView = {
			repository, discoveryTime: Date.now(), selectionIndex: -1, visible: true
		};

		let removed: Iterable<ISCMRepositoryView> = Iterable.empty();

		if (this.previousState) {
			const index = this.previousState.all.indexOf(getProviderStorageKey(repository.provider));

			if (index === -1) {
				// This repository is not part of the previous state which means that it
				// was either manually closed in the previous session, or the repository
				// was added after the previous session.In this case, we should select all
				// of the repositories.
				const added: ISCMRepositoryView[] = [];
				for (const repositoryView of this._repositories) {
					if (!repositoryView.visible) {
						repositoryView.visible = true;
						added.push(repositoryView);
					}
				}

				added.push(repositoryView);
				this.insertRepositoryView(this._repositories, repositoryView);
				this._onDidChangeRepositories.fire({ added, removed: Iterable.empty() });
				return;
			}

			if (this.previousState.visible.indexOf(index) === -1) {
				// Explicit selection started
				if (this.didSelectRepository) {
					this.insertRepositoryView(this._repositories, { ...repositoryView, visible: false });
					this._onDidChangeRepositories.fire({ added: Iterable.empty(), removed: Iterable.empty() });
					return;
				}
			} else {
				// First visible repository
				if (!this.didSelectRepository) {
					this._focusedRepository = undefined;
					removed = [...this.visibleRepositories];
					this._repositories.forEach(r => r.visible = false);

					this.didSelectRepository = true;
				}
			}
		}

		this.insertRepositoryView(this._repositories, repositoryView);
		this._onDidChangeRepositories.fire({ added: [repositoryView], removed });

		if (!this._focusedRepository) {
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

		let added: Iterable<ISCMRepositoryView> = Iterable.empty();
		const repositoryView = this._repositories.splice(repositoriesIndex, 1);

		if (this._repositories.length > 0 && this.visibleRepositories.length === 0) {
			this._repositories[0].visible = true;
			added = [this._repositories[0]];
		}

		this._onDidChangeRepositories.fire({ added, removed: repositoryView });

		if (this._focusedRepository === repository && this.visibleRepositories.length > 0) {
			this.focus(this.visibleRepositories[0].repository);
		}
	}

	isVisible(repository: ISCMRepository): boolean {
		return this._repositories.find(r => r.repository === repository)?.visible ?? false;
	}

	toggleVisibility(repository: ISCMRepository, visible?: boolean): void {
		if (typeof visible === 'undefined') {
			visible = !this.isVisible(repository);
		} else if (this.isVisible(repository) === visible) {
			return;
		}

		const repositoryView = this._repositories.find(r => r.repository === repository);
		if (!repositoryView) {
			return;
		}

		if (visible) {
			this.visibleRepositories = [...this.visibleRepositories, repositoryView];
		} else {
			const index = this.visibleRepositories.indexOf(repositoryView);

			if (index > -1) {
				this.visibleRepositories = [
					...this.visibleRepositories.slice(0, index),
					...this.visibleRepositories.slice(index + 1)
				];
			}
		}
	}

	focus(repository: ISCMRepository | undefined): void {
		if (repository && !this.isVisible(repository)) {
			return;
		}

		this._focusedRepository = repository;
		this._onDidFocusRepository.fire(repository);
	}

	private insertRepositoryView(repositories: ISCMRepositoryView[], repositoryView: ISCMRepositoryView): void {
		const index = binarySearch(repositories, repositoryView, this._compareRepositories);
		repositories.splice(index < 0 ? ~index : index, 0, repositoryView);
	}

	private onWillSaveState(): void {
		if (!this.didFinishLoading) { // don't remember state, if the workbench didn't really finish loading
			return;
		}

		const all = this.repositories.map(r => getProviderStorageKey(r.repository.provider));
		const visible = this.visibleRepositories.map(r => all.indexOf(getProviderStorageKey(r.repository.provider)));
		const raw = JSON.stringify({ all, visible });

		this.storageService.store('scm:view:visibleRepositories', raw, StorageScope.WORKSPACE, StorageTarget.MACHINE);
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
		this.previousState = undefined;
	}

	dispose(): void {
		this.disposables.dispose();
		this._onDidChangeRepositories.dispose();
		this._onDidSetVisibleRepositories.dispose();
	}
}
