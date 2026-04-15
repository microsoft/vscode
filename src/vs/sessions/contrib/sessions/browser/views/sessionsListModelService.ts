/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

export const enum SessionListModelChangeKind {
	Pinned = 'pinned',
	Read = 'read',
}

export interface ISessionListModelChangeEvent {
	readonly changes: ReadonlyArray<{ readonly sessionId: string; readonly kind: SessionListModelChangeKind }>;
}

/**
 * Service that manages UI-only state for sessions: pinned and read.
 *
 * This state is purely local (persisted in storage) and not synced to providers.
 * Extracted from SessionsList so it can be consumed by any component (title bar,
 * views, actions) without going through the view.
 */
export interface ISessionsListModelService {
	readonly _serviceBrand: undefined;

	/** Fires when a session's pinned or read state changes. */
	readonly onDidChange: Event<ISessionListModelChangeEvent>;

	// -- Pinning --

	pinSession(session: ISession): void;
	unpinSession(session: ISession): void;
	isSessionPinned(session: ISession): boolean;

	// -- Read/Unread --

	markRead(session: ISession): void;
	markUnread(session: ISession): void;
	isSessionRead(session: ISession): boolean;
	markAllRead(sessions: ISession[]): void;
}

export const ISessionsListModelService = createDecorator<ISessionsListModelService>('sessionsListModelService');

export class SessionsListModelService extends Disposable implements ISessionsListModelService {

	declare readonly _serviceBrand: undefined;

	private static readonly PINNED_SESSIONS_KEY = 'sessionsListControl.pinnedSessions';
	private static readonly READ_SESSIONS_KEY = 'sessionsListControl.readSessions';

	private readonly _onDidChange = this._register(new Emitter<ISessionListModelChangeEvent>());
	readonly onDidChange: Event<ISessionListModelChangeEvent> = this._onDidChange.event;

	private readonly _pinnedSessionIds: Set<string>;
	private readonly _readSessionIds: Set<string>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._pinnedSessionIds = this.loadSet(SessionsListModelService.PINNED_SESSIONS_KEY);
		this._readSessionIds = this.loadSet(SessionsListModelService.READ_SESSIONS_KEY);

		this._register(this.sessionsManagementService.onDidChangeSessions(e => {
			for (const session of e.removed) {
				this.deleteSession(session);
			}
		}));
	}

	// -- Pinning --

	pinSession(session: ISession): void {
		if (this._pinnedSessionIds.has(session.sessionId)) {
			return;
		}
		this._pinnedSessionIds.add(session.sessionId);
		this.saveSet(SessionsListModelService.PINNED_SESSIONS_KEY, this._pinnedSessionIds);
		this._onDidChange.fire({ changes: [{ sessionId: session.sessionId, kind: SessionListModelChangeKind.Pinned }] });
	}

	unpinSession(session: ISession): void {
		if (!this._pinnedSessionIds.has(session.sessionId)) {
			return;
		}
		this._pinnedSessionIds.delete(session.sessionId);
		this.saveSet(SessionsListModelService.PINNED_SESSIONS_KEY, this._pinnedSessionIds);
		this._onDidChange.fire({ changes: [{ sessionId: session.sessionId, kind: SessionListModelChangeKind.Pinned }] });
	}

	isSessionPinned(session: ISession): boolean {
		return this._pinnedSessionIds.has(session.sessionId);
	}

	// -- Read/Unread --

	markRead(session: ISession): void {
		if (this._readSessionIds.has(session.sessionId)) {
			return;
		}
		this._readSessionIds.add(session.sessionId);
		this.saveSet(SessionsListModelService.READ_SESSIONS_KEY, this._readSessionIds);
		this._onDidChange.fire({ changes: [{ sessionId: session.sessionId, kind: SessionListModelChangeKind.Read }] });
	}

	markUnread(session: ISession): void {
		if (!this._readSessionIds.has(session.sessionId)) {
			return;
		}
		this._readSessionIds.delete(session.sessionId);
		this.saveSet(SessionsListModelService.READ_SESSIONS_KEY, this._readSessionIds);
		this._onDidChange.fire({ changes: [{ sessionId: session.sessionId, kind: SessionListModelChangeKind.Read }] });
	}

	isSessionRead(session: ISession): boolean {
		return this._readSessionIds.has(session.sessionId);
	}

	markAllRead(sessions: ISession[]): void {
		const changed: { sessionId: string; kind: SessionListModelChangeKind }[] = [];
		for (const session of sessions) {
			if (!this._readSessionIds.has(session.sessionId)) {
				this._readSessionIds.add(session.sessionId);
				changed.push({ sessionId: session.sessionId, kind: SessionListModelChangeKind.Read });
			}
		}
		if (changed.length > 0) {
			this.saveSet(SessionsListModelService.READ_SESSIONS_KEY, this._readSessionIds);
			this._onDidChange.fire({ changes: changed });
		}
	}

	// -- Cleanup --

	private deleteSession(session: ISession): void {
		const changes: { sessionId: string; kind: SessionListModelChangeKind }[] = [];
		if (this._pinnedSessionIds.delete(session.sessionId)) {
			this.saveSet(SessionsListModelService.PINNED_SESSIONS_KEY, this._pinnedSessionIds);
			changes.push({ sessionId: session.sessionId, kind: SessionListModelChangeKind.Pinned });
		}
		if (this._readSessionIds.delete(session.sessionId)) {
			this.saveSet(SessionsListModelService.READ_SESSIONS_KEY, this._readSessionIds);
			changes.push({ sessionId: session.sessionId, kind: SessionListModelChangeKind.Read });
		}
		if (changes.length > 0) {
			this._onDidChange.fire({ changes });
		}
	}

	// -- Storage helpers --

	private loadSet(key: string): Set<string> {
		const raw = this.storageService.get(key, StorageScope.PROFILE);
		if (raw) {
			try {
				const arr = JSON.parse(raw);
				if (Array.isArray(arr)) {
					return new Set(arr);
				}
			} catch {
				// ignore corrupt data
			}
		}
		return new Set();
	}

	private saveSet(key: string, set: Set<string>): void {
		if (set.size === 0) {
			this.storageService.remove(key, StorageScope.PROFILE);
		} else {
			this.storageService.store(key, JSON.stringify([...set]), StorageScope.PROFILE, StorageTarget.USER);
		}
	}
}

registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
