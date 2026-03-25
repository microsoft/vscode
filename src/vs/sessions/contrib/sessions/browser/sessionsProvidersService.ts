/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionData, ISessionWorkspace } from '../common/sessionData.js';
import { ISessionsChangeEvent, ISessionsProvider, ISessionType } from './sessionsProvider.js';
import { URI } from '../../../../base/common/uri.js';

export const ISessionsProvidersService = createDecorator<ISessionsProvidersService>('sessionsProvidersService');

/**
 * Central service that aggregates sessions across all registered providers.
 * Owns the provider registry, unified session list, active session tracking,
 * and routes session actions to the correct provider.
 */
export interface ISessionsProvidersService {
	readonly _serviceBrand: undefined;

	// -- Provider Registry --

	/** Register a sessions provider. Returns a disposable to unregister. */
	registerProvider(provider: ISessionsProvider): IDisposable;
	/** Get all registered providers. */
	getProviders(): ISessionsProvider[];
	/** Fires when providers are added or removed. */
	readonly onDidChangeProviders: Event<void>;

	// -- Session Types --

	/** Get available session types for a provider. */
	getSessionTypesForProvider(providerId: string): ISessionType[];
	/** Get available session types for a session from its provider. */
	getSessionTypes(session: ISessionData): ISessionType[];

	// -- Aggregated Sessions --

	/** Get all sessions from all providers. */
	getSessions(): ISessionData[];
	/** Get a session by its globally unique ID. */
	getSession(sessionId: string): ISessionData | undefined;
	/** Fires when sessions change across any provider. */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	// -- Session Actions (routed to the correct provider via sessionId) --

	/** Archive a session. */
	archiveSession(sessionId: string): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(sessionId: string): Promise<void>;
	/** Delete a session. */
	deleteSession(sessionId: string): Promise<void>;
	/** Rename a session. */
	renameSession(sessionId: string, title: string): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(sessionId: string, read: boolean): void;
	/** Resolve a repository URI to a session workspace using the given provider. */
	resolveWorkspace(providerId: string, repositoryUri: URI): ISessionWorkspace | undefined;
}

/**
 * Separator used to construct globally unique session IDs: `${providerId}:${localId}`.
 */
const SESSION_ID_SEPARATOR = ':';

export class SessionsProvidersService extends Disposable implements ISessionsProvidersService {
	declare readonly _serviceBrand: undefined;

	private readonly _providers = new Map<string, { provider: ISessionsProvider; disposables: DisposableStore }>();

	private readonly _onDidChangeProviders = this._register(new Emitter<void>());
	readonly onDidChangeProviders: Event<void> = this._onDidChangeProviders.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionsChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionsChangeEvent> = this._onDidChangeSessions.event;

	// -- Provider Registry --

	registerProvider(provider: ISessionsProvider): IDisposable {
		if (this._providers.has(provider.id)) {
			throw new Error(`Sessions provider '${provider.id}' is already registered.`);
		}

		const disposables = new DisposableStore();

		// Forward session change events from this provider
		disposables.add(provider.onDidChangeSessions(e => {
			this._onDidChangeSessions.fire(e);
		}));

		this._providers.set(provider.id, { provider, disposables });
		this._onDidChangeProviders.fire();

		return toDisposable(() => {
			const entry = this._providers.get(provider.id);
			if (entry) {
				entry.disposables.dispose();
				this._providers.delete(provider.id);
				this._onDidChangeProviders.fire();
			}
		});
	}

	getProviders(): ISessionsProvider[] {
		return Array.from(this._providers.values(), e => e.provider);
	}

	// -- Session Types --

	getSessionTypesForProvider(providerId: string): ISessionType[] {
		const entry = this._providers.get(providerId);
		if (!entry) {
			return [];
		}
		return [...entry.provider.sessionTypes];
	}

	getSessionTypes(session: ISessionData): ISessionType[] {
		const entry = this._providers.get(session.providerId);
		if (!entry) {
			return [];
		}
		return entry.provider.getSessionTypes(session);
	}

	// -- Aggregated Sessions --

	getSessions(): ISessionData[] {
		const sessions: ISessionData[] = [];
		for (const { provider } of this._providers.values()) {
			sessions.push(...provider.getSessions());
		}
		return sessions;
	}

	getSession(sessionId: string): ISessionData | undefined {
		const { provider } = this._resolveProvider(sessionId);
		if (!provider) {
			return undefined;
		}
		return provider.getSessions().find(s => s.sessionId === sessionId);
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.archiveSession(sessionId);
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.unarchiveSession(sessionId);
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.deleteSession(sessionId);
		}
	}

	async renameSession(sessionId: string, title: string): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.renameSession(sessionId, title);
		}
	}

	setRead(sessionId: string, read: boolean): void {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			provider.setRead(sessionId, read);
		}
	}

	resolveWorkspace(providerId: string, repositoryUri: URI): ISessionWorkspace | undefined {
		const entry = this._providers.get(providerId);
		return entry?.provider.resolveWorkspace(repositoryUri);
	}

	// -- Private Helpers --

	/**
	 * Extract provider ID from a globally unique session ID and look up the provider.
	 */
	private _resolveProvider(sessionId: string): { provider: ISessionsProvider | undefined; localId: string } {
		const separatorIndex = sessionId.indexOf(SESSION_ID_SEPARATOR);
		if (separatorIndex === -1) {
			return { provider: undefined, localId: sessionId };
		}
		const providerId = sessionId.substring(0, separatorIndex);
		const localId = sessionId.substring(separatorIndex + 1);
		const entry = this._providers.get(providerId);
		return { provider: entry?.provider, localId };
	}
}

registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
