/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository, IInputValidator, ISCMInputChangeEvent, SCMInputChangeReason, InputValidationType, IInputValidation } from './scm';
import { ILogService } from 'vs/platform/log/common/log';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { HistoryNavigator2 } from 'vs/base/common/history';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { Iterable } from 'vs/base/common/iterator';

class SCMInput implements ISCMInput {

	private _value = '';

	get value(): string {
		return this._value;
	}

	private readonly _onDidChange = new Emitter<ISCMInputChangeEvent>();
	readonly onDidChange: Event<ISCMInputChangeEvent> = this._onDidChange.event;

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

	private _enabled = true;

	get enabled(): boolean {
		return this._enabled;
	}

	set enabled(enabled: boolean) {
		this._enabled = enabled;
		this._onDidChangeEnablement.fire(enabled);
	}

	private readonly _onDidChangeEnablement = new Emitter<boolean>();
	readonly onDidChangeEnablement: Event<boolean> = this._onDidChangeEnablement.event;

	private _visible = true;

	get visible(): boolean {
		return this._visible;
	}

	set visible(visible: boolean) {
		this._visible = visible;
		this._onDidChangeVisibility.fire(visible);
	}

	private readonly _onDidChangeVisibility = new Emitter<boolean>();
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	setFocus(): void {
		this._onDidChangeFocus.fire();
	}

	private readonly _onDidChangeFocus = new Emitter<void>();
	readonly onDidChangeFocus: Event<void> = this._onDidChangeFocus.event;

	showValidationMessage(message: string | IMarkdownString, type: InputValidationType): void {
		this._onDidChangeValidationMessage.fire({ message: message, type: type });
	}

	private readonly _onDidChangeValidationMessage = new Emitter<IInputValidation>();
	readonly onDidChangeValidationMessage: Event<IInputValidation> = this._onDidChangeValidationMessage.event;

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

	private historyNavigator: HistoryNavigator2<string>;
	private didChangeHistory: boolean;

	private static didGarbageCollect = false;
	private static migrateAndGarbageCollectStorage(storageService: IStorageService): void {
		if (SCMInput.didGarbageCollect) {
			return;
		}

		// Migrate from old format // TODO@joao: remove this migration code a few releases
		const userKeys = Iterable.filter(storageService.keys(StorageScope.APPLICATION, StorageTarget.USER), key => key.startsWith('scm/input:'));

		for (const key of userKeys) {
			try {
				const rawHistory = storageService.get(key, StorageScope.APPLICATION, '');
				const history = JSON.parse(rawHistory);

				if (Array.isArray(history)) {
					if (history.length === 0 || (history.length === 1 && history[0] === '')) {
						// remove empty histories
						storageService.remove(key, StorageScope.APPLICATION);
					} else {
						// migrate existing histories to have a timestamp
						storageService.store(key, JSON.stringify({ timestamp: new Date().getTime(), history }), StorageScope.APPLICATION, StorageTarget.MACHINE);
					}
				} else {
					// move to MACHINE target
					storageService.store(key, rawHistory, StorageScope.APPLICATION, StorageTarget.MACHINE);
				}
			} catch {
				// remove unparseable entries
				storageService.remove(key, StorageScope.APPLICATION);
			}
		}

		// Garbage collect
		const machineKeys = Iterable.filter(storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE), key => key.startsWith('scm/input:'));

		for (const key of machineKeys) {
			try {
				const history = JSON.parse(storageService.get(key, StorageScope.APPLICATION, ''));

				if (Array.isArray(history?.history) && Number.isInteger(history?.timestamp) && new Date().getTime() - history?.timestamp > 2592000000) {
					// garbage collect after 30 days
					storageService.remove(key, StorageScope.APPLICATION);
				}
			} catch {
				// remove unparseable entries
				storageService.remove(key, StorageScope.APPLICATION);
			}
		}

		SCMInput.didGarbageCollect = true;
	}

	constructor(
		readonly repository: ISCMRepository,
		@IStorageService private storageService: IStorageService
	) {
		SCMInput.migrateAndGarbageCollectStorage(storageService);

		const key = this.repository.provider.rootUri ? `scm/input:${this.repository.provider.label}:${this.repository.provider.rootUri?.path}` : undefined;
		let history: string[] | undefined;

		if (key) {
			try {
				history = JSON.parse(this.storageService.get(key, StorageScope.APPLICATION, '')).history;
				history = history?.map(s => s ?? '');
			} catch {
				// noop
			}
		}

		if (!Array.isArray(history) || history.length === 0) {
			history = [this._value];
		} else {
			this._value = history[history.length - 1];
		}

		this.historyNavigator = new HistoryNavigator2(history, 50);
		this.didChangeHistory = false;

		if (key) {
			this.storageService.onWillSaveState(_ => {
				if (this.historyNavigator.isAtEnd()) {
					this.saveValue();
				}

				if (!this.didChangeHistory) {
					return;
				}

				const history = [...this.historyNavigator].map(s => s ?? '');

				if (history.length === 0 || (history.length === 1 && history[0] === '')) {
					storageService.remove(key, StorageScope.APPLICATION);
				} else {
					storageService.store(key, JSON.stringify({ timestamp: new Date().getTime(), history }), StorageScope.APPLICATION, StorageTarget.MACHINE);
				}
				this.didChangeHistory = false;
			});
		}
	}

	setValue(value: string, transient: boolean, reason?: SCMInputChangeReason) {
		if (value === this._value) {
			return;
		}

		if (!transient) {
			this.saveValue();
			this.historyNavigator.add(value);
			this.didChangeHistory = true;
		}

		this._value = value;
		this._onDidChange.fire({ value, reason });
	}

	showNextHistoryValue(): void {
		if (this.historyNavigator.isAtEnd()) {
			return;
		} else if (!this.historyNavigator.has(this.value)) {
			this.saveValue();
			this.historyNavigator.resetCursor();
		}

		const value = this.historyNavigator.next();
		this.setValue(value, true, SCMInputChangeReason.HistoryNext);
	}

	showPreviousHistoryValue(): void {
		if (this.historyNavigator.isAtEnd()) {
			this.saveValue();
		} else if (!this.historyNavigator.has(this._value)) {
			this.saveValue();
			this.historyNavigator.resetCursor();
		}

		const value = this.historyNavigator.previous();
		this.setValue(value, true, SCMInputChangeReason.HistoryPrevious);
	}

	private saveValue(): void {
		const oldValue = this.historyNavigator.replaceLast(this._value);
		this.didChangeHistory = this.didChangeHistory || (oldValue !== this._value);
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
		public readonly id: string,
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

	private _repositories = new Map<string, ISCMRepository>();
	get repositories(): Iterable<ISCMRepository> { return this._repositories.values(); }
	get repositoryCount(): number { return this._repositories.size; }

	private providerCount: IContextKey<number>;

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

		if (this._repositories.has(provider.id)) {
			throw new Error(`SCM Provider ${provider.id} already exists.`);
		}

		const disposable = toDisposable(() => {
			this._repositories.delete(provider.id);
			this._onDidRemoveProvider.fire(repository);
			this.providerCount.set(this._repositories.size);
		});

		const repository = new SCMRepository(provider.id, provider, disposable, this.storageService);
		this._repositories.set(provider.id, repository);
		this._onDidAddProvider.fire(repository);

		this.providerCount.set(this._repositories.size);
		return repository;
	}

	getRepository(id: string): ISCMRepository | undefined {
		return this._repositories.get(id);
	}
}
