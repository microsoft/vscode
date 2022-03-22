/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { Emitter, Event } from 'vs/base/common/event';
import { ISCMViewService, ISCMRepository, ISCMService, ISCMViewVisibleRepositoryChangeEvent, ISCMMenus, ISCMProvider } from 'vs/workbench/contrib/scm/common/scm';
import { Iterable } from 'vs/base/common/iterator';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SCMMenus } from 'vs/workbench/contrib/scm/browser/menus';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { debounce } from 'vs/base/common/decorators';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { compareFileNames } from 'vs/base/common/comparers';
import { basename } from 'vs/base/common/resources';
import { binarySearch } from 'vs/base/common/arrays';

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

	private _repositories: ISCMRepository[] = [];

	get repositories(): ISCMRepository[] {
		return this._repositories;
	}

	private _onDidChangeRepositories = new Emitter<ISCMViewVisibleRepositoryChangeEvent>();
	readonly onDidChangeRepositories = this._onDidChangeRepositories.event;

	private _visibleRepositoriesSet = new Set<ISCMRepository>();
	private _visibleRepositories: ISCMRepository[] = [];

	get visibleRepositories(): ISCMRepository[] {
		return this._visibleRepositories;
	}

	set visibleRepositories(visibleRepositories: ISCMRepository[]) {
		const set = new Set(visibleRepositories);
		const added = new Set<ISCMRepository>();
		const removed = new Set<ISCMRepository>();

		for (const repository of visibleRepositories) {
			if (!this._visibleRepositoriesSet.has(repository)) {
				added.add(repository);
			}
		}

		for (const repository of this._visibleRepositories) {
			if (!set.has(repository)) {
				removed.add(repository);
			}
		}

		if (added.size === 0 && removed.size === 0) {
			return;
		}

		this._visibleRepositories = visibleRepositories.sort(this._compareRepositories);
		this._visibleRepositoriesSet = set;
		this._onDidSetVisibleRepositories.fire({ added, removed });

		if (this._focusedRepository && removed.has(this._focusedRepository)) {
			this.focus(this._visibleRepositories[0]);
		}
	}

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

	private _compareRepositories: (op1: ISCMRepository, op2: ISCMRepository) => number;

	constructor(
		@ISCMService private readonly scmService: ISCMService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService
	) {
		this.menus = instantiationService.createInstance(SCMMenus);

		this._compareRepositories = (op1: ISCMRepository, op2: ISCMRepository): number => {
			const name1 = getRepositoryName(workspaceContextService, op1);
			const name2 = getRepositoryName(workspaceContextService, op2);

			return compareFileNames(name1, name2);
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

		this.insertRepository(this._repositories, repository);
		let removed: Iterable<ISCMRepository> = Iterable.empty();

		if (this.previousState) {
			const index = this.previousState.all.indexOf(getProviderStorageKey(repository.provider));

			if (index === -1) { // saw a repo we did not expect
				const added: ISCMRepository[] = [];
				for (const repo of this.scmService.repositories) { // all should be visible
					if (!this._visibleRepositoriesSet.has(repo)) {
						added.push(repository);
					}
				}

				this._visibleRepositoriesSet = new Set(this.scmService.repositories);
				this._visibleRepositories = [...this.scmService.repositories.sort(this._compareRepositories)];
				this._onDidChangeRepositories.fire({ added, removed: Iterable.empty() });
				this.finishLoading();
				return;
			}

			if (this.previousState.visible.indexOf(index) > -1) {
				// First visible repository
				if (!this.didSelectRepository) {
					removed = this._visibleRepositories;

					this._visibleRepositories = [];
					this._visibleRepositoriesSet = new Set();
					this.didSelectRepository = true;
				}
			} else {
				// Explicit selection started
				if (this.didSelectRepository) {
					return;
				}
			}
		}

		this._visibleRepositoriesSet.add(repository);
		this.insertRepository(this._visibleRepositories, repository);
		this._onDidChangeRepositories.fire({ added: [repository], removed });

		if (!this._focusedRepository) {
			this.focus(repository);
		}
	}

	private onDidRemoveRepository(repository: ISCMRepository): void {
		if (!this.didFinishLoading) {
			this.eventuallyFinishLoading();
		}

		let added: Iterable<ISCMRepository> = Iterable.empty();

		const repositoriesIndex = this._repositories.indexOf(repository);
		const visibleRepositoriesIndex = this._visibleRepositories.indexOf(repository);

		if (repositoriesIndex > -1) {
			this._repositories.splice(repositoriesIndex, 1);
		}

		if (visibleRepositoriesIndex > -1) {
			this._visibleRepositories.splice(visibleRepositoriesIndex, 1);
			this._visibleRepositoriesSet.delete(repository);

			if (this._repositories.length > 0 && this._visibleRepositories.length === 0) {
				const first = this._repositories[0];

				this._visibleRepositories.push(first);
				this._visibleRepositoriesSet.add(first);
				added = [first];
			}
		}

		if (repositoriesIndex > -1 || visibleRepositoriesIndex > -1) {
			this._onDidChangeRepositories.fire({ added, removed: [repository] });
		}

		if (this._focusedRepository === repository) {
			this.focus(this._visibleRepositories[0]);
		}
	}

	isVisible(repository: ISCMRepository): boolean {
		return this._visibleRepositoriesSet.has(repository);
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

	focus(repository: ISCMRepository | undefined): void {
		if (repository && !this.visibleRepositories.includes(repository)) {
			return;
		}

		this._focusedRepository = repository;
		this._onDidFocusRepository.fire(repository);
	}

	private insertRepository(repositories: ISCMRepository[], repository: ISCMRepository): void {
		const index = binarySearch(repositories, repository, this._compareRepositories);
		if (index < 0) {
			repositories.splice(~index, 0, repository);
		}
	}

	private onWillSaveState(): void {
		if (!this.didFinishLoading) { // don't remember state, if the workbench didn't really finish loading
			return;
		}

		const all = this.repositories.map(r => getProviderStorageKey(r.provider));
		const visible = this.visibleRepositories.map(r => all.indexOf(getProviderStorageKey(r.provider)));
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
