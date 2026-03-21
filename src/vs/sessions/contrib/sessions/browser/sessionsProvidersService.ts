/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { IObservable, observableValue, transaction } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionData } from '../common/sessionData.js';
import { ISessionsChangeEvent, ISessionsProvider, ISessionType } from './sessionsProvider.js';
import { SessionWorkspace } from '../common/sessionWorkspace.js';
import { INewSession } from '../../chat/browser/newSession.js';

export const ISessionsProvidersService = createDecorator<ISessionsProvidersService>('sessionsProvidersService');

/**
 * Central service that aggregates sessions across all registered providers.
 * Owns the provider registry, unified session list, active session tracking,
 * and routes session actions to the correct provider.
 */
export interface ISessionsProvidersService {
	readonly _serviceBrand: undefined;

	// ── Provider Registry ──

	/** Register a sessions provider. Returns a disposable to unregister. */
	registerProvider(provider: ISessionsProvider): IDisposable;
	/** Get all registered providers. */
	getProviders(): ISessionsProvider[];
	/** Get providers that can handle the given workspace. */
	getProvidersForWorkspace(workspace: SessionWorkspace): ISessionsProvider[];
	/** Fires when providers are added or removed. */
	readonly onDidChangeProviders: Event<void>;

	// ── Aggregated Sessions ──

	/** Get all sessions from all providers. */
	getSessions(): ISessionData[];
	/** Get a session by its globally unique ID. */
	getSession(sessionId: string): ISessionData | undefined;
	/** Fires when sessions change across any provider. */
	readonly onDidChangeSessions: Event<ISessionsChangeEvent>;

	// ── Active Session ──

	/** The currently active session. */
	readonly activeSession: IObservable<ISessionData | undefined>;
	/** Open a session by its globally unique ID. */
	openSession(sessionId: string): Promise<void>;

	// ── Session Actions (routed to the correct provider via sessionId) ──

	/** Archive a session. */
	archiveSession(sessionId: string): Promise<void>;
	/** Delete a session. */
	deleteSession(sessionId: string): Promise<void>;
	/** Rename a session. */
	renameSession(sessionId: string, title: string): Promise<void>;

	// ── New Session ──

	/** Create a new session via the specified provider. */
	createNewSession(providerId: string, type: ISessionType, resource: URI, workspace?: SessionWorkspace): INewSession;
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

	private readonly _activeSession = observableValue<ISessionData | undefined>(this, undefined);
	readonly activeSession: IObservable<ISessionData | undefined> = this._activeSession;

	// ── Provider Registry ──

	registerProvider(provider: ISessionsProvider): IDisposable {
		if (this._providers.has(provider.id)) {
			throw new Error(`Sessions provider '${provider.id}' is already registered.`);
		}

		const disposables = new DisposableStore();

		// Forward session change events from this provider
		disposables.add(provider.onDidChangeSessions(e => {
			this._onDidChangeSessions.fire(e);
		}));

		// Register menu contributions
		disposables.add(provider.registerMenuContributions());

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

	getProvidersForWorkspace(workspace: SessionWorkspace): ISessionsProvider[] {
		return this.getProviders().filter(p => p.canHandle(workspace));
	}

	// ── Aggregated Sessions ──

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

	// ── Active Session ──

	openSession(sessionId: string): Promise<void> {
		const session = this.getSession(sessionId);
		if (session) {
			transaction(tx => {
				this._activeSession.set(session, tx);
			});
		}
		return Promise.resolve();
	}

	// ── Session Actions ──

	async archiveSession(sessionId: string): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.archiveSession(sessionId);
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

	// ── New Session ──

	createNewSession(providerId: string, type: ISessionType, resource: URI, workspace?: SessionWorkspace): INewSession {
		const entry = this._providers.get(providerId);
		if (!entry) {
			throw new Error(`Sessions provider '${providerId}' not found.`);
		}
		return entry.provider.createNewSession(type, resource, workspace);
	}

	// ── Private Helpers ──

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
