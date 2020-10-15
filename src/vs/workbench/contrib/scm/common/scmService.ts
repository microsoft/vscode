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
import { HistoryNavigator } from 'vs/base/common/history';

class SCMValue {

	value: string;
	isCommitMessage: boolean;

	constructor(value: string, isCommitMessage: boolean) {
		this.value = value;
		this.isCommitMessage = isCommitMessage;
	}
}

class SCMInput implements ISCMInput {

	private _value = '';

	get value(): string {
		return this._value;
	}

	public setValue(value: string, fromKeyboard: boolean) {
		if (value === this._value) {
			return;
		}
		if (!fromKeyboard) {
			this.addToHistory(true);
		}
		this._value = value;
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
	private readonly _onDidChangeValidateInput = new Emitter<void>();
	readonly onDidChangeValidateInput: Event<void> = this._onDidChangeValidateInput.event;
	private historyNavigator: HistoryNavigator<SCMValue>;
	constructor(
		readonly repository: ISCMRepository,
		@IStorageService private storageService: IStorageService
	) {
		const key = `scm/input:${this.repository.provider.label}:${this.repository.provider.rootUri?.path}`;
		let savedHistory = this.storageService.get(key, StorageScope.WORKSPACE, '[]');
		if (savedHistory) {
			this.historyNavigator = new HistoryNavigator(JSON.parse(savedHistory), 50);
			this.setValue(this.current(), true);
		} else {
			this.historyNavigator = new HistoryNavigator<SCMValue>([], 50);
		}
		this.storageService.onWillSaveState(() => {
			if (!this.has(this.value)) {
				this.addToHistory(false);
			}
		});
	}

	showNextValue(): void {

		let next = this.historyNavigator.next();

		if (next) {
			this.setValue(next.value, true);
		}
	}

	showPreviousValue(): void {
		if (!this.has(this.value)) {
			this.addToHistory(false);
		}

		let previous = this.historyNavigator.previous();

		if (previous) {
			this.setValue(previous.value, true);
		}
	}

	private has(value: string): boolean {
		let values = this.historyNavigator.getHistory();
		let filtered = values.filter(item => item.value === value);
		return filtered.length > 0;
	}

	private current() {
		let current = this.historyNavigator.getHistory().filter(item => !item.isCommitMessage);
		if (current.length > 0) {
			return current[0].value;
		} else {
			return '';
		}
	}

	private addToHistory(isCommit: boolean): void {
		if (this.value && this.value !== this.current()) {
			let item = this.historyNavigator._elements.filter(item => !item.isCommitMessage);
			if (item.length > 0) {
				this.historyNavigator.remove(item[0]);
			}
			if (!this.has(this.value)) {
				this.historyNavigator.add(new SCMValue(this.value, isCommit));
			}
			this.save();
	}
}

	private save(): void {
		if (this.repository.provider.rootUri) {
			const key = `scm/input:${this.repository.provider.label}:${this.repository.provider.rootUri.path}`;
			this.storageService.store(key, JSON.stringify(this.historyNavigator.getHistory()), StorageScope.WORKSPACE);
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
	readonly input: ISCMInput = new SCMInput(this, this.storageService);

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
