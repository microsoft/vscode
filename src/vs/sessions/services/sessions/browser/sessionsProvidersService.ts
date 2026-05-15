/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionsProvider } from '../common/sessionsProvider.js';

export const ISessionsProvidersService = createDecorator<ISessionsProvidersService>('sessionsProvidersService');

export interface ISessionsProvidersChangeEvent {
	readonly added: readonly ISessionsProvider[];
	readonly removed: readonly ISessionsProvider[];
}

export interface ISessionsProvidersService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent>;
	registerProvider(provider: ISessionsProvider): IDisposable;
	getProviders(): ISessionsProvider[];
	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined;
}

class SessionsProvidersService extends Disposable implements ISessionsProvidersService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ISessionsProvider>();

	private readonly _onDidChangeProviders = this._register(new Emitter<ISessionsProvidersChangeEvent>());
	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent> = this._onDidChangeProviders.event;

	registerProvider(provider: ISessionsProvider): IDisposable {
		if (this._providers.has(provider.id)) {
			throw new Error(`Sessions provider '${provider.id}' is already registered.`);
		}

		this._providers.set(provider.id, provider);
		this._onDidChangeProviders.fire({ added: [provider], removed: [] });

		return toDisposable(() => {
			const entry = this._providers.get(provider.id);
			if (entry) {
				this._providers.delete(provider.id);
				this._onDidChangeProviders.fire({ added: [], removed: [provider] });
			}
		});
	}

	getProviders(): ISessionsProvider[] {
		return Array.from(this._providers.values());
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.get(providerId) as T | undefined;
	}
}

registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
