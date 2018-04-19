/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository, IInputValidator } from './scm';
import { ILogService } from 'vs/platform/log/common/log';
import { TPromise } from 'vs/base/common/winjs.base';

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

	private _placeholder = '';

	get placeholder(): string {
		return this._placeholder;
	}

	set placeholder(placeholder: string) {
		this._placeholder = placeholder;
		this._onDidChangePlaceholder.fire(placeholder);
	}

	private _onDidChangePlaceholder = new Emitter<string>();
	get onDidChangePlaceholder(): Event<string> { return this._onDidChangePlaceholder.event; }

	private _validateInput: IInputValidator = () => TPromise.as(undefined);

	get validateInput(): IInputValidator {
		return this._validateInput;
	}

	set validateInput(validateInput: IInputValidator) {
		this._validateInput = validateInput;
		this._onDidChangeValidateInput.fire();
	}

	private _onDidChangeValidateInput = new Emitter<void>();
	get onDidChangeValidateInput(): Event<void> { return this._onDidChangeValidateInput.event; }
}

class SCMRepository implements ISCMRepository {

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	readonly input: ISCMInput = new SCMInput();

	constructor(
		public readonly provider: ISCMProvider,
		private disposable: IDisposable
	) { }

	focus(): void {
		this._onDidFocus.fire();
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

	private _onDidAddProvider = new Emitter<ISCMRepository>();
	get onDidAddRepository(): Event<ISCMRepository> { return this._onDidAddProvider.event; }

	private _onDidRemoveProvider = new Emitter<ISCMRepository>();
	get onDidRemoveRepository(): Event<ISCMRepository> { return this._onDidRemoveProvider.event; }

	constructor(@ILogService private logService: ILogService) { }

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

			this._providerIds.delete(provider.id);
			this._repositories.splice(index, 1);
			this._onDidRemoveProvider.fire(repository);
		});

		const repository = new SCMRepository(provider, disposable);
		this._repositories.push(repository);
		this._onDidAddProvider.fire(repository);

		return repository;
	}
}
