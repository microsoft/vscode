/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISessionData, ISessionWorkspace } from '../common/sessionData.js';
import { ISessionChangeEvent, ISessionsProvider, ISessionType } from './sessionsProvider.js';
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
	getSessionTypes(sessionId: string): ISessionType[];

	// -- Aggregated Sessions --

	/** Get all chats from all providers. */
	getSessions(): ISessionData[];
	/** Get a chat by its globally unique ID. */
	getSession(chatId: string): ISessionData | undefined;
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
	readonly onDidReplaceSession: Event<{ readonly from: ISessionData; readonly to: ISessionData }>;

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
	/** Returns the current untitled session for the given provider, if any. */
	getUntitledSession(providerId: string): ISessionData | undefined; // TODO: Shoulds ideally be removed when new chat and picker is cleaned up
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

	private readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISessionData; readonly to: ISessionData }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISessionData; readonly to: ISessionData }> = this._onDidReplaceSession.event;

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

	// -- Session Types --

	getSessionTypesForProvider(providerId: string): ISessionType[] {
		const entry = this._providers.get(providerId);
		if (!entry) {
			return [];
		}
		return [...entry.provider.sessionTypes];
	}

	getSessionTypes(chatId: string): ISessionType[] {
		const { provider } = this._resolveProvider(chatId);
		if (!provider) {
			return [];
		}
		return provider.getSessionTypes(chatId);
	}

	// -- Aggregated Sessions --

	getSessions(): ISessionData[] {
		const sessions: ISessionData[] = [];
		for (const { provider } of this._providers.values()) {
			sessions.push(...provider.getSessions());
		}
		return sessions;
	}

	getSession(chatId: string): ISessionData | undefined {
		const { provider } = this._resolveProvider(chatId);
		if (!provider) {
			return undefined;
		}
		return provider.getSessions().find(s => s.id === chatId);
	}

	// -- Session Actions --

	async archiveSession(chatId: string): Promise<void> {
		const { provider } = this._resolveProvider(chatId);
		if (provider) {
			await provider.archiveSession(chatId);
		}
	}

	async unarchiveSession(chatId: string): Promise<void> {
		const { provider } = this._resolveProvider(chatId);
		if (provider) {
			await provider.unarchiveSession(chatId);
		}
	}

	async deleteSession(chatId: string): Promise<void> {
		const { provider } = this._resolveProvider(chatId);
		if (provider) {
			await provider.deleteSession(chatId);
		}
	}

	async renameSession(chatId: string, title: string): Promise<void> {
		const { provider } = this._resolveProvider(chatId);
		if (provider) {
			await provider.renameSession(chatId, title);
		}
	}

	setRead(chatId: string, read: boolean): void {
		const { provider } = this._resolveProvider(chatId);
		if (provider) {
			provider.setRead(chatId, read);
		}
	}

	resolveWorkspace(providerId: string, repositoryUri: URI): ISessionWorkspace | undefined {
		const entry = this._providers.get(providerId);
		return entry?.provider.resolveWorkspace(repositoryUri);
	}

	getUntitledSession(providerId: string): ISessionData | undefined {
		const entry = this._providers.get(providerId);
		return entry?.provider.getUntitledSession();
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
