/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { memoize } from 'vs/base/common/decorators';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { ISCMService, ISCMProvider, ISCMInput } from './scm';

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

export class SCMService implements ISCMService {

	_serviceBrand;

	private activeProviderDisposable: IDisposable = EmptyDisposable;
	private statusBarDisposable: IDisposable = EmptyDisposable;
	private activeProviderContextKey: IContextKey<string | undefined>;

	private _activeProvider: ISCMProvider | undefined;

	get activeProvider(): ISCMProvider | undefined {
		return this._activeProvider;
	}

	set activeProvider(provider: ISCMProvider | undefined) {
		this.activeProviderDisposable.dispose();

		if (!provider) {
			throw new Error('invalid provider');
		}

		if (provider && this._providers.indexOf(provider) === -1) {
			throw new Error('Provider not registered');
		}

		this._activeProvider = provider;

		this.activeProviderDisposable = provider.onDidChange(() => this.onDidProviderChange(provider));
		this.onDidProviderChange(provider);

		this.activeProviderContextKey.set(provider ? provider.contextKey : void 0);
		this._onDidChangeProvider.fire(provider);
	}

	private _providers: ISCMProvider[] = [];
	get providers(): ISCMProvider[] { return [...this._providers]; }

	private _onDidChangeProvider = new Emitter<ISCMProvider>();
	get onDidChangeProvider(): Event<ISCMProvider> { return this._onDidChangeProvider.event; }

	@memoize
	get input(): ISCMInput { return new SCMInput(); }

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		this.activeProviderContextKey = contextKeyService.createKey<string | undefined>('scmProvider', void 0);
	}

	registerSCMProvider(provider: ISCMProvider): IDisposable {
		this._providers = [provider, ...this._providers];

		if (this._providers.length === 1) {
			this.activeProvider = provider;
		}

		return toDisposable(() => {
			const index = this._providers.indexOf(provider);

			if (index < 0) {
				return;
			}

			this._providers.splice(index, 1);

			if (this.activeProvider === provider) {
				this.activeProvider = this._providers[0];
			}
		});
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