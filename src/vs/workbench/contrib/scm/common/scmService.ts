/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../base/common/event.js';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository, IInputValidator, ISCMInputChangeEvent, SCMInputChangeReason, InputValidationType, IInputValidation } from './scm.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { HistoryNavigator2 } from '../../../../base/common/history.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Schemas } from '../../../../base/common/network.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { runOnChange } from '../../../../base/common/observable.js';

class SCMInput extends Disposable implements ISCMInput {

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

	private readonly historyNavigator: HistoryNavigator2<string>;
	private didChangeHistory: boolean = false;

	constructor(
		readonly repository: ISCMRepository,
		private readonly history: SCMInputHistory
	) {
		super();

		if (this.repository.provider.rootUri) {
			this.historyNavigator = history.getHistory(this.repository.provider.label, this.repository.provider.rootUri);
			this._register(this.history.onWillSaveHistory(event => {
				if (this.historyNavigator.isAtEnd()) {
					this.saveValue();
				}

				if (this.didChangeHistory) {
					event.historyDidIndeedChange();
				}

				this.didChangeHistory = false;
			}));
		} else { // in memory only
			this.historyNavigator = new HistoryNavigator2([''], 100);
		}

		this._value = this.historyNavigator.current();
	}

	setValue(value: string, transient: boolean, reason?: SCMInputChangeReason) {
		if (value === this._value) {
			return;
		}

		if (!transient) {
			this.historyNavigator.replaceLast(this._value);
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

	readonly input: ISCMInput;

	constructor(
		public readonly id: string,
		public readonly provider: ISCMProvider,
		private readonly disposables: DisposableStore,
		inputHistory: SCMInputHistory
	) {
		this.input = new SCMInput(this, inputHistory);
	}

	setSelected(selected: boolean): void {
		if (this._selected === selected) {
			return;
		}

		this._selected = selected;
		this._onDidChangeSelection.fire(selected);
	}

	dispose(): void {
		this.disposables.dispose();
		this.provider.dispose();
	}
}

class WillSaveHistoryEvent {
	private _didChangeHistory = false;
	get didChangeHistory() { return this._didChangeHistory; }
	historyDidIndeedChange() { this._didChangeHistory = true; }
}

class SCMInputHistory {

	private readonly disposables = new DisposableStore();
	private readonly histories = new Map<string, ResourceMap<HistoryNavigator2<string>>>();

	private readonly _onWillSaveHistory = this.disposables.add(new Emitter<WillSaveHistoryEvent>());
	readonly onWillSaveHistory = this._onWillSaveHistory.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
	) {
		this.histories = new Map();

		const entries = this.storageService.getObject<[string, URI, string[]][]>('scm.history', StorageScope.WORKSPACE, []);

		for (const [providerLabel, rootUri, history] of entries) {
			let providerHistories = this.histories.get(providerLabel);

			if (!providerHistories) {
				providerHistories = new ResourceMap();
				this.histories.set(providerLabel, providerHistories);
			}

			providerHistories.set(rootUri, new HistoryNavigator2(history, 100));
		}

		if (this.migrateStorage()) {
			this.saveToStorage();
		}

		this.disposables.add(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, 'scm.history', this.disposables)(e => {
			if (e.external && e.key === 'scm.history') {
				const raw = this.storageService.getObject<[string, URI, string[]][]>('scm.history', StorageScope.WORKSPACE, []);

				for (const [providerLabel, uri, rawHistory] of raw) {
					const history = this.getHistory(providerLabel, uri);

					for (const value of Iterable.reverse(rawHistory)) {
						history.prepend(value);
					}
				}
			}
		}));

		this.disposables.add(this.storageService.onWillSaveState(_ => {
			const event = new WillSaveHistoryEvent();
			this._onWillSaveHistory.fire(event);

			if (event.didChangeHistory) {
				this.saveToStorage();
			}
		}));
	}

	private saveToStorage(): void {
		const raw: [string, URI, string[]][] = [];

		for (const [providerLabel, providerHistories] of this.histories) {
			for (const [rootUri, history] of providerHistories) {
				if (!(history.size === 1 && history.current() === '')) {
					raw.push([providerLabel, rootUri, [...history]]);
				}
			}
		}

		this.storageService.store('scm.history', raw, StorageScope.WORKSPACE, StorageTarget.USER);
	}

	getHistory(providerLabel: string, rootUri: URI): HistoryNavigator2<string> {
		let providerHistories = this.histories.get(providerLabel);

		if (!providerHistories) {
			providerHistories = new ResourceMap();
			this.histories.set(providerLabel, providerHistories);
		}

		let history = providerHistories.get(rootUri);

		if (!history) {
			history = new HistoryNavigator2([''], 100);
			providerHistories.set(rootUri, history);
		}

		return history;
	}

	// Migrates from Application scope storage to Workspace scope.
	// TODO@joaomoreno: Change from January 2024 onwards such that the only code is to remove all `scm/input:` storage keys
	private migrateStorage(): boolean {
		let didSomethingChange = false;
		const machineKeys = Iterable.filter(this.storageService.keys(StorageScope.APPLICATION, StorageTarget.MACHINE), key => key.startsWith('scm/input:'));

		for (const key of machineKeys) {
			try {
				const legacyHistory = JSON.parse(this.storageService.get(key, StorageScope.APPLICATION, ''));
				const match = /^scm\/input:([^:]+):(.+)$/.exec(key);

				if (!match || !Array.isArray(legacyHistory?.history) || !Number.isInteger(legacyHistory?.timestamp)) {
					this.storageService.remove(key, StorageScope.APPLICATION);
					continue;
				}

				const [, providerLabel, rootPath] = match;
				const rootUri = URI.file(rootPath);

				if (this.workspaceContextService.getWorkspaceFolder(rootUri)) {
					const history = this.getHistory(providerLabel, rootUri);

					for (const entry of Iterable.reverse(legacyHistory.history as string[])) {
						history.prepend(entry);
					}

					didSomethingChange = true;
					this.storageService.remove(key, StorageScope.APPLICATION);
				}
			} catch {
				this.storageService.remove(key, StorageScope.APPLICATION);
			}
		}

		return didSomethingChange;
	}

	dispose() {
		this.disposables.dispose();
	}
}


export class SCMService implements ISCMService {

	declare readonly _serviceBrand: undefined;

	_repositories = new Map<string, ISCMRepository>();  // used in tests
	get repositories(): Iterable<ISCMRepository> { return this._repositories.values(); }
	get repositoryCount(): number { return this._repositories.size; }

	private inputHistory: SCMInputHistory;
	private providerCount: IContextKey<number>;
	private historyProviderCount: IContextKey<number>;

	private readonly _onDidAddProvider = new Emitter<ISCMRepository>();
	readonly onDidAddRepository: Event<ISCMRepository> = this._onDidAddProvider.event;

	private readonly _onDidRemoveProvider = new Emitter<ISCMRepository>();
	readonly onDidRemoveRepository: Event<ISCMRepository> = this._onDidRemoveProvider.event;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		this.inputHistory = new SCMInputHistory(storageService, workspaceContextService);

		this.providerCount = contextKeyService.createKey('scm.providerCount', 0);
		this.historyProviderCount = contextKeyService.createKey('scm.historyProviderCount', 0);
	}

	registerSCMProvider(provider: ISCMProvider): ISCMRepository {
		this.logService.trace('SCMService#registerSCMProvider');

		if (this._repositories.has(provider.id)) {
			throw new Error(`SCM Provider ${provider.id} already exists.`);
		}

		const disposables = new DisposableStore();

		const historyProviderCount = () => {
			return Array.from(this._repositories.values())
				.filter(r => !!r.provider.historyProvider.get()).length;
		};

		disposables.add(toDisposable(() => {
			this._repositories.delete(provider.id);
			this._onDidRemoveProvider.fire(repository);

			this.providerCount.set(this._repositories.size);
			this.historyProviderCount.set(historyProviderCount());
		}));

		const repository = new SCMRepository(provider.id, provider, disposables, this.inputHistory);
		this._repositories.set(provider.id, repository);

		disposables.add(runOnChange(provider.historyProvider, () => {
			this.historyProviderCount.set(historyProviderCount());
		}));

		this.providerCount.set(this._repositories.size);
		this.historyProviderCount.set(historyProviderCount());

		this._onDidAddProvider.fire(repository);

		return repository;
	}

	getRepository(id: string): ISCMRepository | undefined;
	getRepository(resource: URI): ISCMRepository | undefined;
	getRepository(idOrResource: string | URI): ISCMRepository | undefined {
		if (typeof idOrResource === 'string') {
			return this._repositories.get(idOrResource);
		}

		if (idOrResource.scheme !== Schemas.file &&
			idOrResource.scheme !== Schemas.vscodeRemote) {
			return undefined;
		}

		let bestRepository: ISCMRepository | undefined = undefined;
		let bestMatchLength = Number.POSITIVE_INFINITY;

		for (const repository of this.repositories) {
			const root = repository.provider.rootUri;

			if (!root) {
				continue;
			}

			const path = this.uriIdentityService.extUri.relativePath(root, idOrResource);

			if (path && !/^\.\./.test(path) && path.length < bestMatchLength) {
				bestRepository = repository;
				bestMatchLength = path.length;
			}
		}

		return bestRepository;
	}
}
