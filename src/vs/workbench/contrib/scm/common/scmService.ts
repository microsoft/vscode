/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository, IInputValidator } from './scm';
import { ILogService } from 'vs/platform/log/common/log';
import { equals } from 'vs/base/common/arrays';

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
	readonly onDidChange: Event<string> = this._onDidChange.event;

	private _placeholder = '';

	get placeholder(): string {
		return this._placeholder;
	}

	set placeholder(placeholder: string) {
		this._placeholder = placeholder;
		this._onDidChangePlaceholder.fire(placeholder);
	}

	private _onDidChangePlaceholder = new Emitter<string>();
	readonly onDidChangePlaceholder: Event<string> = this._onDidChangePlaceholder.event;

	private _visible = true;

	get visible(): boolean {
		return this._visible;
	}

	set visible(visible: boolean) {
		this._visible = visible;
		this._onDidChangeVisibility.fire(visible);
	}

	private _onDidChangeVisibility = new Emitter<boolean>();
	readonly onDidChangeVisibility: Event<boolean> = this._onDidChangeVisibility.event;

	private _validateInput: IInputValidator = () => Promise.resolve(undefined);

	get validateInput(): IInputValidator {
		return this._validateInput;
	}

	set validateInput(validateInput: IInputValidator) {
		this._validateInput = validateInput;
		this._onDidChangeValidateInput.fire();
	}

	private _onDidChangeValidateInput = new Emitter<void>();
	readonly onDidChangeValidateInput: Event<void> = this._onDidChangeValidateInput.event;
}

class SCMRepository implements ISCMRepository {

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	private _selected = false;
	get selected(): boolean {
		return this._selected;
	}

	private _onDidChangeSelection = new Emitter<boolean>();
	readonly onDidChangeSelection: Event<boolean> = this._onDidChangeSelection.event;

	readonly input: ISCMInput = new SCMInput();

	constructor(
		public readonly provider: ISCMProvider,
		private disposable: IDisposable
	) { }

	focus(): void {
		this._onDidFocus.fire();
	}

	setSelected(selected: boolean): void {
		this._selected = selected;
		this._onDidChangeSelection.fire(selected);
	}

	dispose(): void {
		this.disposable.dispose();
		this.provider.dispose();
	}
}

export class SCMService implements ISCMService {

	_serviceBrand: any;

	private _providerIds = new Set<string>();
	private _repositories: ISCMRepository[] = [];
	get repositories(): ISCMRepository[] { return [...this._repositories]; }

	private _selectedRepositories: ISCMRepository[] = [];
	get selectedRepositories(): ISCMRepository[] { return [...this._selectedRepositories]; }

	private _onDidChangeSelectedRepositories = new Emitter<ISCMRepository[]>();
	readonly onDidChangeSelectedRepositories: Event<ISCMRepository[]> = this._onDidChangeSelectedRepositories.event;

	private _onDidAddProvider = new Emitter<ISCMRepository>();
	readonly onDidAddRepository: Event<ISCMRepository> = this._onDidAddProvider.event;

	private _onDidRemoveProvider = new Emitter<ISCMRepository>();
	readonly onDidRemoveRepository: Event<ISCMRepository> = this._onDidRemoveProvider.event;

	constructor(@ILogService private readonly logService: ILogService) { }

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
			this.onDidChangeSelection();
		});

		const repository = new SCMRepository(provider, disposable);
		const selectedDisposable = repository.onDidChangeSelection(this.onDidChangeSelection, this);

		this._repositories.push(repository);
		this._onDidAddProvider.fire(repository);

		// automatically select the first repository
		if (this._repositories.length === 1) {
			repository.setSelected(true);
		}

		return repository;
	}

	private onDidChangeSelection(): void {
		const selectedRepositories = this._repositories.filter(r => r.selected);

		if (equals(this._selectedRepositories, selectedRepositories)) {
			return;
		}

		this._selectedRepositories = this._repositories.filter(r => r.selected);
		this._onDidChangeSelectedRepositories.fire(this.selectedRepositories);
	}
}
