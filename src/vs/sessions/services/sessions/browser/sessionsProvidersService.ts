/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILifecycleService } from '../../../../workbench/services/lifecycle/common/lifecycle.js';
import { ISessionsProvider } from '../common/sessionsProvider.js';

export const ISessionsProvidersService = createDecorator<ISessionsProvidersService>('sessionsProvidersService');

export interface ISessionsProvidersChangeEvent {
	readonly added: readonly ISessionsProvider[];
	readonly removed: readonly ISessionsProvider[];
}

export interface ISessionsProvidersService {
	readonly _serviceBrand: undefined;

	/** Changes to available providers and their internal session backends, until shutdown is committed. */
	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent>;
	registerProvider(provider: ISessionsProvider): IDisposable;
	/** Adds an internal backend for an owner's existing sessions, without advertising another creation target. */
	registerSessionBackend(ownerProviderId: string, backend: ISessionsProvider): IDisposable;
	/**
	 * Returns logical providers in stable {@link ISessionsProvider.order}.
	 * Existing-session consumers can include internal backends; creation catalogues must not.
	 */
	getProviders(options?: { readonly includeSessionBackends?: boolean }): ISessionsProvider[];
	/** Resolves both logical provider IDs and existing sessions' backend routing IDs. */
	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined;
}

export class SessionsProvidersService extends Disposable implements ISessionsProvidersService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, ISessionsProvider>();
	private readonly _sessionBackends = new Map<string, { readonly ownerProviderId: string; readonly backend: ISessionsProvider }>();

	private readonly _onDidChangeProviders = this._register(new Emitter<ISessionsProvidersChangeEvent>());
	readonly onDidChangeProviders: Event<ISessionsProvidersChangeEvent> = this._onDidChangeProviders.event;

	constructor(
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
	}

	private _fireDidChangeProviders(event: ISessionsProvidersChangeEvent): void {
		// Provider teardown must not rebuild consumers while the window is shutting down.
		if (!this.lifecycleService.willShutdown) {
			this._onDidChangeProviders.fire(event);
		}
	}

	registerProvider(provider: ISessionsProvider): IDisposable {
		if (this._providers.has(provider.id) || this._sessionBackends.has(provider.id)) {
			throw new Error(`Sessions provider '${provider.id}' is already registered.`);
		}

		this._providers.set(provider.id, provider);
		this._fireDidChangeProviders({ added: [provider, ...this._getOwnedBackends(provider.id)], removed: [] });

		return toDisposable(() => {
			if (this._providers.get(provider.id) === provider) {
				this._providers.delete(provider.id);
				this._fireDidChangeProviders({ added: [], removed: [provider, ...this._getOwnedBackends(provider.id)] });
			}
		});
	}

	registerSessionBackend(ownerProviderId: string, backend: ISessionsProvider): IDisposable {
		if (ownerProviderId === backend.id || this._sessionBackends.has(ownerProviderId)) {
			throw new Error(`Session backend '${backend.id}' must belong to a logical sessions provider.`);
		}
		if (this._providers.has(backend.id) || this._sessionBackends.has(backend.id)
			|| this._getOwnedBackends(backend.id).length > 0) {
			throw new Error(`Sessions provider '${backend.id}' is already registered.`);
		}

		const entry = { ownerProviderId, backend };
		this._sessionBackends.set(backend.id, entry);
		if (this._providers.has(ownerProviderId)) {
			this._fireDidChangeProviders({ added: [backend], removed: [] });
		}

		return toDisposable(() => {
			if (this._sessionBackends.get(backend.id) === entry) {
				this._sessionBackends.delete(backend.id);
				if (this._providers.has(ownerProviderId)) {
					this._fireDidChangeProviders({ added: [], removed: [backend] });
				}
			}
		});
	}

	private _getOwnedBackends(ownerProviderId: string): ISessionsProvider[] {
		return Array.from(this._sessionBackends.values())
			.filter(entry => entry.ownerProviderId === ownerProviderId)
			.map(entry => entry.backend);
	}

	getProviders(options?: { readonly includeSessionBackends?: boolean }): ISessionsProvider[] {
		const providers = Array.from(this._providers.values());
		if (options?.includeSessionBackends) {
			for (const { ownerProviderId, backend } of this._sessionBackends.values()) {
				if (this._providers.has(ownerProviderId)) {
					providers.push(backend);
				}
			}
		}
		return providers.sort((a, b) => a.order - b.order);
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		const entry = this._sessionBackends.get(providerId);
		return (this._providers.get(providerId)
			?? (entry && this._providers.has(entry.ownerProviderId) ? entry.backend : undefined)) as T | undefined;
	}
}

registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
