/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISession, ISessionWorkspace } from '../common/sessionData.js';
import { ISessionChangeEvent, ISessionsProvider, ISessionType, ISendRequestOptions } from './sessionsProvider.js';
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
	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined;
	/** Fires when providers are added or removed. */
	readonly onDidChangeProviders: Event<void>;

	// -- Session Types --

	/** Get available session types for a provider. */
	getSessionTypesForProvider(providerId: string): ISessionType[];
	/** Get available session types for a session from its provider. */
	getSessionTypes(sessionId: string): ISessionType[];

	// -- Aggregated Sessions --

	/** Get all sessions from all providers. */
	getSessions(): ISession[];
	/** Get a session by chat resource. */
	getSession(chatId: string): ISession | undefined;
	/** Fires when sessions change across any provider. */
	readonly onDidChangeSessions: Event<ISessionChangeEvent>;
	/**
	 * Fires when a temporary (untitled) session is atomically replaced by a
	 * committed session. Forwarded from providers that implement
	 * {@link ISessionsProvider.onDidReplaceSession}.
	 *
	 * @internal This is an implementation detail of the Copilot Chat sessions
	 * provider. Do not consume this event outside of {@link ISessionsManagementService}.
	 */
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }>;

	// -- Session Actions (routed to the correct provider via sessionId) --

	/** Archive a session. */
	archiveSession(sessionId: string): Promise<void>;
	/** Unarchive a session. */
	unarchiveSession(sessionId: string): Promise<void>;
	/** Delete a session. */
	deleteSession(sessionId: string): Promise<void>;
	/** Delete a single chat from a session. */
	deleteChat(sessionId: string, chatUri: URI): Promise<void>;
	/** Rename a chat within a session. */
	renameChat(sessionId: string, chatUri: URI, title: string): Promise<void>;
	/** Mark a session as read or unread. */
	setRead(sessionId: string, read: boolean): void;
	/** Resolve a repository URI to a session workspace using the given provider. */
	resolveWorkspace(providerId: string, repositoryUri: URI): ISessionWorkspace | undefined;
	/** Send a request, creating a new chat in the session. Routed to the correct provider. */
	sendAndCreateChat(sessionId: string, options: ISendRequestOptions): Promise<ISession>;
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

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

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

		// Forward replace session events if the provider supports them
		if (provider.onDidReplaceSession) {
			disposables.add(provider.onDidReplaceSession(e => {
				this._onDidReplaceSession.fire(e);
			}));
		}

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

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this._providers.get(providerId)?.provider as T | undefined;
	}

	// -- Session Types --

	getSessionTypesForProvider(providerId: string): ISessionType[] {
		const entry = this._providers.get(providerId);
		if (!entry) {
			return [];
		}
		return [...entry.provider.sessionTypes];
	}

	getSessionTypes(sessionId: string): ISessionType[] {
		const { provider } = this._resolveProvider(sessionId);
		if (!provider) {
			return [];
		}
		return provider.getSessionTypes(sessionId);
	}

	// -- Aggregated Sessions --

	getSessions(): ISession[] {
		const sessions: ISession[] = [];
		for (const { provider } of this._providers.values()) {
			sessions.push(...provider.getSessions());
		}
		return sessions;
	}

	getSession(sessionId: string): ISession | undefined {
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

	async renameChat(sessionId: string, chatUri: URI, title: string): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.renameChat(sessionId, chatUri, title);
		}
	}

	async deleteChat(sessionId: string, chatUri: URI): Promise<void> {
		const { provider } = this._resolveProvider(sessionId);
		if (provider) {
			await provider.deleteChat(sessionId, chatUri);
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

	async sendAndCreateChat(sessionId: string, options: ISendRequestOptions): Promise<ISession> {
		const { provider } = this._resolveProvider(sessionId);
		if (!provider) {
			throw new Error(`Sessions provider for session ID '${sessionId}' not found`);
		}
		return provider.sendAndCreateChat(sessionId, options);
	}

	// -- Private Helpers --

	/**
	 * Extract provider ID from a globally unique session ID and look up the provider.
	 */
	private _resolveProvider(chatId: string): { provider: ISessionsProvider | undefined; localId: string } {
		const separatorIndex = chatId.indexOf(SESSION_ID_SEPARATOR);
		if (separatorIndex === -1) {
			return { provider: undefined, localId: chatId };
		}
		const providerId = chatId.substring(0, separatorIndex);
		const localId = chatId.substring(separatorIndex + 1);
		const entry = this._providers.get(providerId);
		return { provider: entry?.provider, localId };
	}
}

registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
