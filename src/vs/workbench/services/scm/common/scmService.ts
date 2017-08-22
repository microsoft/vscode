/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository, DefaultSCMProviderIdStorageKey } from './scm';

class SCMInput implements ISCMInput {

	private _value = '';

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		this._value = value;
		this._onDidChange.fire(value);
	}

	private _onDidChange = new Emitter<string>();
	get onDidChange(): Event<string> { return this._onDidChange.event; }
}

class SCMRepository implements ISCMRepository {

	readonly input: ISCMInput = new SCMInput();

	constructor(
		public readonly provider: ISCMProvider,
		private disposable: IDisposable
	) { }

	dispose(): void {
		this.disposable.dispose();
		this.provider.dispose();
	}
}

export class SCMService implements ISCMService {

	_serviceBrand;

	private activeProviderDisposable: IDisposable = EmptyDisposable;
	private statusBarDisposable: IDisposable = EmptyDisposable;

	private _activeRepository: ISCMRepository | undefined;

	get activeRepository(): ISCMRepository | undefined {
		return this._activeRepository;
	}

	set activeRepository(repository: ISCMRepository | undefined) {
		this.setActiveSCMProvider(repository);
		this.storageService.store(DefaultSCMProviderIdStorageKey, repository.provider.contextValue, StorageScope.WORKSPACE);
	}

	private _providerIds = new Set<string>();
	private _repositories: ISCMRepository[] = [];
	get repositories(): ISCMRepository[] { return [...this._repositories]; }

	private _onDidAddProvider = new Emitter<ISCMRepository>();
	get onDidAddRepository(): Event<ISCMRepository> { return this._onDidAddProvider.event; }

	private _onDidRemoveProvider = new Emitter<ISCMRepository>();
	get onDidRemoveRepository(): Event<ISCMRepository> { return this._onDidRemoveProvider.event; }

	private _onDidChangeProvider = new Emitter<ISCMRepository>();
	get onDidChangeRepository(): Event<ISCMRepository> { return this._onDidChangeProvider.event; }


	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private storageService: IStorageService,
		@IStatusbarService private statusbarService: IStatusbarService
	) { }

	private setActiveSCMProvider(repository: ISCMRepository): void {
		this.activeProviderDisposable.dispose();

		if (!repository) {
			throw new Error('invalid provider');
		}

		if (repository && this._repositories.indexOf(repository) === -1) {
			throw new Error('Provider not registered');
		}

		this._activeRepository = repository;
		const provider = repository.provider;

		this.activeProviderDisposable = provider.onDidChange(() => this.onDidProviderChange(provider));
		this.onDidProviderChange(provider);

		this._onDidChangeProvider.fire(repository);
	}

	registerSCMProvider(provider: ISCMProvider): ISCMRepository {
		if (this._providerIds.has(provider.id)) {
			throw new Error(`SCM Provider ${provider.id} already exists.`);
		}

		this._providerIds.add(provider.id);

		const disposable = toDisposable(() => {
			const index = this._repositories.indexOf(repository);

			if (index < 0) {
				return;
			}

			this._providerIds.delete(provider.id);
			this._repositories.splice(index, 1);

			if (this.activeRepository === repository) {
				this.activeRepository = this._repositories[0];
			}

			this._onDidRemoveProvider.fire(repository);
		});

		const repository = new SCMRepository(provider, disposable);
		this._repositories.push(repository);

		const defaultProviderId = this.storageService.get(DefaultSCMProviderIdStorageKey, StorageScope.WORKSPACE);

		if (this._repositories.length === 1 || defaultProviderId === provider.contextValue) {
			this.setActiveSCMProvider(repository);
		}

		this._onDidAddProvider.fire(repository);

		return repository;
	}

	private onDidProviderChange(provider: ISCMProvider): void {
		this.statusBarDisposable.dispose();

		const commands = provider.statusBarCommands || [];
		const disposables = commands.map(c => this.statusbarService.addEntry({
			text: c.title,
			tooltip: c.tooltip,
			command: c.id
		}, MainThreadStatusBarAlignment.LEFT, 10000));

		this.statusBarDisposable = combinedDisposable(disposables);
	}
}