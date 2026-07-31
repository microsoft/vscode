/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon, themeColorFromId } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
export const enum SessionListModelChangeKind {
	Pinned = 'pinned',
	Sort = 'sort',
}

/**
 * The two sort modes the sessions list supports. Mirrors the values of the
 * (contrib-layer) `SessionsSorting` enum, kept as a plain string union here so
 * this service stays in the services layer and never imports from contrib.
 */
export type SessionSortMode = 'created' | 'updated';

export interface ISessionListModelChangeEvent {
	readonly changes: ReadonlyArray<{ readonly sessionId: string; readonly kind: SessionListModelChangeKind }>;
}

/**
 * Service that manages UI-only state for sessions: pinned and manual sort order.
 *
 * This state is purely local (persisted in storage) and not synced to providers.
 * Extracted from SessionsList so it can be consumed by any component (title bar,
 * views, actions) without going through the view.
 *
 * Note: read/unread state is **not** managed here — it is owned by the sessions
 * provider and surfaced via {@link ISession.isRead}. Marking happens through
 * {@link ISessionsManagementService}.
 */
export interface ISessionsListModelService {
	readonly _serviceBrand: undefined;

	/** Fires when a session's pinned or sort state changes. */
	readonly onDidChange: Event<ISessionListModelChangeEvent>;

	// -- Pinning --

	pinSession(session: ISession): void;
	unpinSession(session: ISession): void;
	unpinSessions(sessions: ISession[]): void;
	isSessionPinned(session: ISession): boolean;

	// -- Legacy read-state migration --

	/** One-time, per-session migration of the legacy read set into provider-owned read state. */
	migrateLegacyReadState(session: ISession): void;

	// -- Manual sort order --

	/**
	 * The effective numeric sort key for a session in the given sort mode. This
	 * is the manually assigned override when one exists, otherwise the natural
	 * timestamp (`createdAt` for `'created'`, `updatedAt` for `'updated'`).
	 * Sessions are displayed in descending order of this value.
	 */
	getSortKey(session: ISession, mode: SessionSortMode): number;

	/** The natural (non-overridden) sort key for a session in the given mode. */
	getNaturalSortKey(session: ISession, mode: SessionSortMode): number;

	/** Whether the session has a manual sort override in the given mode. */
	hasSortOverride(sessionId: string, mode: SessionSortMode): boolean;

	/**
	 * Apply a batch of manual sort changes for a single mode. Overrides in
	 * `set` are stored, ids in `clear` are removed (falling back to the natural
	 * key). Fires a single {@link onDidChange} for all affected sessions.
	 */
	applySortChanges(mode: SessionSortMode, set: ReadonlyMap<string, number>, clear: Iterable<string>): void;

	// -- Status icon --

	/**
	 * The status-based icon shown next to a session's title across the sessions
	 * UI (sessions list, sessions picker, session header). Centralized here so
	 * all surfaces stay in sync.
	 *
	 * Note: when motion is allowed, surfaces that host a {@link SessionStatusIcon}
	 * (sessions list, session header) render a pixel spinner for the
	 * `InProgress`/`NeedsInput` states instead of consulting this method; the
	 * icons returned here are the reduced-motion fallbacks (and the glyphs used by
	 * surfaces that don't host the widget, such as the sessions picker).
	 */
	getStatusIcon(status: SessionStatus, isRead: boolean, isArchived: boolean, completedStateIcon?: ThemeIcon): ThemeIcon;
}

export const ISessionsListModelService = createDecorator<ISessionsListModelService>('sessionsListModelService');

export class SessionsListModelService extends Disposable implements ISessionsListModelService {

	declare readonly _serviceBrand: undefined;

	private static readonly PINNED_SESSIONS_KEY = 'sessionsListControl.pinnedSessions';
	private static readonly SORT_OVERRIDES_KEY = 'sessionsListControl.sortOverrides';
	private static readonly LEGACY_READ_SESSIONS_KEY = 'sessionsListControl.readSessions';
	private static readonly READ_MIGRATION_DONE_KEY = 'sessionsListControl.readMigrationDone';
	private static readonly UNREAD_DEFAULT_CUTOFF = new Date('2026-05-12T00:00:00.000Z');

	private readonly _onDidChange = this._register(new Emitter<ISessionListModelChangeEvent>());
	readonly onDidChange: Event<ISessionListModelChangeEvent> = this._onDidChange.event;

	private readonly _pinnedSessionIds: Set<string>;
	private readonly _sortOverrides: Record<SessionSortMode, Map<string, number>>;
	private readonly _legacyReadSessionIds: Set<string> | undefined;
	private readonly _migratedReadSessionIds: Set<string>;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._pinnedSessionIds = this.loadSet(SessionsListModelService.PINNED_SESSIONS_KEY);
		this._sortOverrides = this.loadSortOverrides();
		const legacyRead = this.loadSet(SessionsListModelService.LEGACY_READ_SESSIONS_KEY);
		this._legacyReadSessionIds = legacyRead.size > 0 ? legacyRead : undefined;
		this._migratedReadSessionIds = this.loadSet(SessionsListModelService.READ_MIGRATION_DONE_KEY);

		this._register(this.sessionsManagementService.onDidChangeSessions(e => {
			for (const session of e.removed) {
				this.deleteSession(session);
			}
		}));
	}

	// -- Legacy read-state migration --

	// TODO@sandy081 Remove after 2026-10-14. Additive only: never marks unread
	// (the provider already defaults to unread); the one-shot guard stops a later
	// legitimate unread from being re-flipped to read on refresh.
	migrateLegacyReadState(session: ISession): void {
		const sessionId = session.sessionId;
		if (this._migratedReadSessionIds.has(sessionId)) {
			return;
		}
		const wasRead = (this._legacyReadSessionIds?.has(sessionId) ?? false)
			|| session.updatedAt.get() < SessionsListModelService.UNREAD_DEFAULT_CUTOFF;
		if (!wasRead) {
			return;
		}
		this.sessionsManagementService.markRead(session);
		this._migratedReadSessionIds.add(sessionId);
		this.saveSet(SessionsListModelService.READ_MIGRATION_DONE_KEY, this._migratedReadSessionIds);
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

	unpinSessions(sessions: ISession[]): void {
		const changed: { sessionId: string; kind: SessionListModelChangeKind }[] = [];
		for (const session of sessions) {
			if (this._pinnedSessionIds.delete(session.sessionId)) {
				changed.push({ sessionId: session.sessionId, kind: SessionListModelChangeKind.Pinned });
			}
		}
		if (changed.length > 0) {
			this.saveSet(SessionsListModelService.PINNED_SESSIONS_KEY, this._pinnedSessionIds);
			this._onDidChange.fire({ changes: changed });
		}
	}

	isSessionPinned(session: ISession): boolean {
		return this._pinnedSessionIds.has(session.sessionId);
	}

	// -- Manual sort order --

	getNaturalSortKey(session: ISession, mode: SessionSortMode): number {
		return mode === 'updated' ? session.updatedAt.get().getTime() : session.createdAt.getTime();
	}

	getSortKey(session: ISession, mode: SessionSortMode): number {
		const override = this._sortOverrides[mode].get(session.sessionId);
		return override ?? this.getNaturalSortKey(session, mode);
	}

	hasSortOverride(sessionId: string, mode: SessionSortMode): boolean {
		return this._sortOverrides[mode].has(sessionId);
	}

	applySortChanges(mode: SessionSortMode, set: ReadonlyMap<string, number>, clear: Iterable<string>): void {
		const map = this._sortOverrides[mode];
		const changes: { sessionId: string; kind: SessionListModelChangeKind }[] = [];
		for (const sessionId of clear) {
			if (map.delete(sessionId)) {
				changes.push({ sessionId, kind: SessionListModelChangeKind.Sort });
			}
		}
		for (const [sessionId, value] of set) {
			if (map.get(sessionId) !== value) {
				map.set(sessionId, value);
				changes.push({ sessionId, kind: SessionListModelChangeKind.Sort });
			}
		}
		if (changes.length > 0) {
			this.saveSortOverrides();
			this._onDidChange.fire({ changes });
		}
	}

	// -- Status icon --

	getStatusIcon(status: SessionStatus, isRead: boolean, isArchived: boolean, completedStateIcon?: ThemeIcon): ThemeIcon {
		switch (status) {
			case SessionStatus.InProgress:
				return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
			case SessionStatus.NeedsInput:
				return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
			case SessionStatus.Error:
				return { ...Codicon.error, color: themeColorFromId('errorForeground') };
			default:
				if (isArchived) {
					return { ...Codicon.passFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
				}
				if (completedStateIcon) {
					return completedStateIcon;
				}
				if (!isRead) {
					return { ...Codicon.circleFilled, color: themeColorFromId('textLink.foreground') };
				}
				return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
		}
	}

	// -- Cleanup --

	private deleteSession(session: ISession): void {
		const changes: { sessionId: string; kind: SessionListModelChangeKind }[] = [];
		if (this._pinnedSessionIds.delete(session.sessionId)) {
			this.saveSet(SessionsListModelService.PINNED_SESSIONS_KEY, this._pinnedSessionIds);
			changes.push({ sessionId: session.sessionId, kind: SessionListModelChangeKind.Pinned });
		}
		let sortChanged = false;
		if (this._sortOverrides.created.delete(session.sessionId)) {
			sortChanged = true;
		}
		if (this._sortOverrides.updated.delete(session.sessionId)) {
			sortChanged = true;
		}
		if (sortChanged) {
			this.saveSortOverrides();
			changes.push({ sessionId: session.sessionId, kind: SessionListModelChangeKind.Sort });
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

	private loadSortOverrides(): Record<SessionSortMode, Map<string, number>> {
		const result: Record<SessionSortMode, Map<string, number>> = { created: new Map(), updated: new Map() };
		const raw = this.storageService.get(SessionsListModelService.SORT_OVERRIDES_KEY, StorageScope.PROFILE);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as Partial<Record<SessionSortMode, Record<string, number>>>;
				for (const mode of ['created', 'updated'] as const) {
					const entries = parsed[mode];
					if (entries) {
						for (const [sessionId, value] of Object.entries(entries)) {
							if (typeof value === 'number') {
								result[mode].set(sessionId, value);
							}
						}
					}
				}
			} catch {
				// ignore corrupt data
			}
		}
		return result;
	}

	private saveSortOverrides(): void {
		if (this._sortOverrides.created.size === 0 && this._sortOverrides.updated.size === 0) {
			this.storageService.remove(SessionsListModelService.SORT_OVERRIDES_KEY, StorageScope.PROFILE);
			return;
		}
		const serialized = {
			created: Object.fromEntries(this._sortOverrides.created),
			updated: Object.fromEntries(this._sortOverrides.updated),
		};
		this.storageService.store(SessionsListModelService.SORT_OVERRIDES_KEY, JSON.stringify(serialized), StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
