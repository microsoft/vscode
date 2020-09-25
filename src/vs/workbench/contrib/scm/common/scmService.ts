/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository, IInputValidator } from './scm';
import { ILogService } from 'vs/platform/log/common/log';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
<<<<<<< HEAD
=======
import { isEmptyObject } from 'vs/base/common/types';
>>>>>>> d2a5768231... minor changes

class SCMInput implements ISCMInput {

	private _value = '';

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		if (value === this._value) {
			return;
		}

		this._value = value;
		this.saveLatest();
		this._onDidChange.fire(value);
	}

	private readonly _onDidChange = new Emitter<string>();
	readonly onDidChange: Event<string> = this._onDidChange.event;

	private _placeholder = '';

	get placeholder(): string {
		return this._placeholder;
	}

	set placeholder(placeholder: string) {
		this._placeholder = placeholder;
		this._onDidChangePlaceholder.fire(placeholder);
	}

	private readonly _onDidChangePlaceholder = new Emitter<string>();
	readonly onDidChangePlaceholder: Event<string> = this._onDidChangePlaceholder.event;

	private _visible = true;

	get visible(): boolean {
		return this._visible;
	}

	set visible(visible: boolean) {
		this._visible = visible;
		this._onDidChangeVisibility.fire(visible);
	}

	private readonly _onDidChangeVisibility = new Emitter<boolean>();
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility
		.event;

	private _validateInput: IInputValidator = () => Promise.resolve(undefined);

	get validateInput(): IInputValidator {
		return this._validateInput;
	}

	set validateInput(validateInput: IInputValidator) {
		this._validateInput = validateInput;
		this._onDidChangeValidateInput.fire();
	}
	private index: any;
	private readonly _onDidChangeValidateInput = new Emitter<void>();
	readonly onDidChangeValidateInput: Event<void> = this._onDidChangeValidateInput.event;
	constructor(
		readonly repository: ISCMRepository,
		@IStorageService private storageService: IStorageService,
		readonly history: string[]
	) {
		this.index = 0;
		this.history = [];
		let root = this.repository.provider.rootUri;
		if (root) {
			const key = `scm/input:${this.repository.provider.label}:${root.path}:latest`;
			let result = this.storageService.get(key, StorageScope.WORKSPACE);
			if (result) {
				this._value = result;
			} else {
				this._value = "";
			}
			const historyKey = `scm/input:${this.repository.provider.label}:${root.path}`;
			let historyResult = this.storageService.get(historyKey, StorageScope.WORKSPACE);
			if (historyResult) {
				this.history = JSON.parse(historyResult);
			}
		}
	}
	private readonly _onDidClearHistory = new Emitter<void>();
	readonly onDidClearHistory: Event<void> = this._onDidClearHistory.event;

	saveLatest(): void {
		let root = this.repository.provider.rootUri;
		if (root) {
			const key = `scm/input:${this.repository.provider.label}:${root.path}:latest`;
			this.storageService.store(key, this.value, StorageScope.WORKSPACE);
		}
	}

	clearHistory(): void {
		let root = this.repository.provider.rootUri;
		if (root) {
			const key = `scm/input:${this.repository.provider.label}:${root.path}`;
			this.storageService.remove(key, StorageScope.WORKSPACE);
			this._onDidClearHistory.fire();
		}
	}

	load(): string {
		let root = this.repository.provider.rootUri;
		let result: string | undefined;
		if (root) {
			const key = `scm/input:${this.repository.provider.label}:${root.path}`;
			const raw = this.storageService.get(key, StorageScope.WORKSPACE);

			if (raw) {
				try {
					result = JSON.parse(raw);
					if (result) {
						this.index++;
						console.log(result);
						console.log(this.index);
						if (this.index >= result.length - 1) {
							console.log(this.index % (result.length - 1));
							return result[this.index % (result.length - 1)];
						} else {
							return result[result.length - this.index];
						}
					}
				} catch (e) {
					// Invalid data
				}
			}
		}
		return "";
	}

	save(): void {
		let root = this.repository.provider.rootUri;
		if (root) {
			this.history.push(this.value);
			const key = `scm/input:${this.repository.provider.label}:${root.path}`;
			this.storageService.store(key, JSON.stringify(this.history), StorageScope.WORKSPACE);
		}
	}
}

class SCMRepository implements ISCMRepository {

	private _selected = false;
	get selected(): boolean {
		return this._selected;
	}

	private readonly _onDidChangeSelection = new Emitter<boolean>();
	readonly onDidChangeSelection: Event<boolean> = this._onDidChangeSelection.event;

	readonly input: ISCMInput = new SCMInput(this, this.storageService, []);

	constructor(
		public readonly provider: ISCMProvider,
		private disposable: IDisposable,
		@IStorageService private storageService: IStorageService
	) { }

	setSelected(selected: boolean): void {
		if (this._selected === selected) {
			return;
		}

		this._selected = selected;
		this._onDidChangeSelection.fire(selected);
	}

	dispose(): void {
		this.disposable.dispose();
		this.provider.dispose();
	}
}

export class SCMService implements ISCMService {

	declare readonly _serviceBrand: undefined;

	private _providerIds = new Set<string>();
	private _repositories: ISCMRepository[] = [];
	get repositories(): ISCMRepository[] { return [...this._repositories]; }

	private providerCount: IContextKey<number>;
	private _selectedRepository: ISCMRepository | undefined;

	private readonly _onDidSelectRepository = new Emitter<ISCMRepository | undefined>();
	readonly onDidSelectRepository: Event<ISCMRepository | undefined> = this._onDidSelectRepository.event;

	private readonly _onDidAddProvider = new Emitter<ISCMRepository>();
	readonly onDidAddRepository: Event<ISCMRepository> = this._onDidAddProvider.event;

	private readonly _onDidRemoveProvider = new Emitter<ISCMRepository>();
	readonly onDidRemoveRepository: Event<ISCMRepository> = this._onDidRemoveProvider.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService private storageService: IStorageService
	) {
		this.providerCount = contextKeyService.createKey('scm.providerCount', 0);
	}

	registerSCMProvider(provider: ISCMProvider): ISCMRepository {
		this.logService.trace('SCMService#registerSCMProvider');

		if (this._providerIds.has(provider.id)) {
			throw new Error(`SCM Provider ${provider.id} already exists.`);
		}

		this._providerIds.add(provider.id);

		const disposable = toDisposable(() => {
			const index = this._repositories.indexOf(repository);

			if (index < 0) {
				return;
			}

			selectedDisposable.dispose();
			this._providerIds.delete(provider.id);
			this._repositories.splice(index, 1);
			this._onDidRemoveProvider.fire(repository);

			if (this._selectedRepository === repository) {
				this.select(this._repositories[0]);
			}

			this.providerCount.set(this._repositories.length);
		});

		const repository = new SCMRepository(provider, disposable, this.storageService);
		const selectedDisposable = Event.map(Event.filter(repository.onDidChangeSelection, selected => selected), _ => repository)(this.select, this);

		this._repositories.push(repository);
		this._onDidAddProvider.fire(repository);

		if (!this._selectedRepository) {
			repository.setSelected(true);
		}

		this.providerCount.set(this._repositories.length);
		return repository;
	}

	private select(repository: ISCMRepository | undefined): void {
		if (this._selectedRepository) {
			this._selectedRepository.setSelected(false);
		}

		this._selectedRepository = repository;
		this._onDidSelectRepository.fire(this._selectedRepository);
	}
}
