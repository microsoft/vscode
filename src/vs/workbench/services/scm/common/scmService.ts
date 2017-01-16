/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ISCMService, ISCMProvider } from './scm';

export class SCMService implements ISCMService {

	_serviceBrand;

	private activeProviderContextKey: IContextKey<string | undefined>;
	private providers: ISCMProvider[] = [];
	private _activeProvider: ISCMProvider | undefined;

	private _onDidChangeProvider = new Emitter<ISCMProvider>();
	get onDidChangeProvider(): Event<ISCMProvider> { return this._onDidChangeProvider.event; }

	constructor(
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		this.activeProviderContextKey = contextKeyService.createKey<string | undefined>('scm.provider', void 0);
	}

	get activeProvider(): ISCMProvider | undefined {
		return this._activeProvider;
	}

	set activeProvider(provider: ISCMProvider) {
		if (provider && this.providers.indexOf(provider) === -1) {
			throw new Error('Provider not registered');
		}

		this._activeProvider = provider;
		this.activeProviderContextKey.set(provider ? provider.id : void 0);
		this._onDidChangeProvider.fire(provider);
	}

	registerSCMProvider(provider: ISCMProvider): IDisposable {
		this.providers = [provider, ...this.providers];

		if (this.providers.length === 1) {
			this.activeProvider = provider;
		}

		return toDisposable(() => {
			const index = this.providers.indexOf(provider);

			if (index < 0) {
				return;
			}

			this.providers.splice(index, 1);

			if (this.activeProvider === provider) {
				this.activeProvider = this.providers[0];
			}
		});
	}
}