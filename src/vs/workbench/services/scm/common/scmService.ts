/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { memoize } from 'vs/base/common/decorators';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
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

	private providerChangeDisposable: IDisposable = EmptyDisposable;
	private activeProviderContextKey: IContextKey<string | undefined>;
	private activeProviderStateContextKey: IContextKey<string | undefined>;

	private _activeProvider: ISCMProvider | undefined;

	get activeProvider(): ISCMProvider | undefined {
		return this._activeProvider;
	}

	set activeProvider(provider: ISCMProvider | undefined) {
		if (!provider) {
			throw new Error('invalid provider');
		}

		if (provider && this._providers.indexOf(provider) === -1) {
			throw new Error('Provider not registered');
		}

		this._activeProvider = provider;
		this.activeProviderContextKey.set(provider ? provider.id : void 0);

		this.providerChangeDisposable.dispose();
		this.providerChangeDisposable = provider.onDidChange(this.onDidChangeProviderState, this);
		this.onDidChangeProviderState();

		this._onDidChangeProvider.fire(provider);
	}

	private _providers: ISCMProvider[] = [];
	get providers(): ISCMProvider[] { return [...this._providers]; }

	private _onDidChangeProvider = new Emitter<ISCMProvider>();
	get onDidChangeProvider(): Event<ISCMProvider> { return this._onDidChangeProvider.event; }

	@memoize
	get input(): ISCMInput { return new SCMInput(); }

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.activeProviderContextKey = contextKeyService.createKey<string | undefined>('scmProvider', void 0);
		this.activeProviderStateContextKey = contextKeyService.createKey<string | undefined>('scmProviderState', void 0);
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

	private onDidChangeProviderState(): void {
		this.activeProviderStateContextKey.set(this.activeProvider.state);
	}
}