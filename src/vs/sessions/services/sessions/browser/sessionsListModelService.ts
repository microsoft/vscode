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
import { asCssVariable } from '../../../../platform/theme/common/colorUtils.js';

// Sentinel cache keys used when a session's status is rendered as an animated
// pixel spinner (vs. a codicon). Distinct per variant so transitions between
// variants rebuild the DOM, while same-variant re-renders only update color and
// avoid restarting the CSS animation. Consumers compare these against their
// cached selector.
export const PIXEL_SPINNER_GRID_KEY = '__pixel_spinner_grid__';
export const PIXEL_SPINNER_RING_KEY = '__pixel_spinner_ring__';

/**
 * Describes how a session's status should be visualized: either an animated pixel
 * spinner (for in-progress / needs-input when motion is allowed) or a static codicon.
 * Both variants carry a `cacheKey` (so consumers can skip rebuilding the DOM when the
 * glyph/variant is unchanged) and a ready-to-apply CSS `color` string.
 */
export type SessionStatusIndicator =
	| { readonly kind: 'spinner'; readonly variant: 'grid' | 'ring'; readonly cacheKey: string; readonly color: string }
	| { readonly kind: 'icon'; readonly icon: ThemeIcon; readonly cacheKey: string; readonly color: string };

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

	// -- Status icon --

	/**
	 * The status-based icon shown next to a session's title across the sessions
	 * UI (sessions list, sessions picker, session header). Centralized here so
	 * all surfaces stay in sync.
	 *
	 * Note: when motion is allowed, the sessions list renders a pixel spinner for
	 * the `InProgress`/`NeedsInput` states instead of consulting this method; the
	 * icons returned here are the reduced-motion fallbacks.
	 */
	getStatusIcon(status: SessionStatus, isRead: boolean, isArchived: boolean, pullRequestIcon?: ThemeIcon): ThemeIcon;

	/**
	 * Resolves the visual indicator for a session status, shared by the sessions list
	 * row renderer and the session header so both surfaces stay in sync. Returns the
	 * animated pixel spinner for `InProgress`/`NeedsInput` when motion is allowed, and
	 * the {@link getStatusIcon} codicon otherwise.
	 */
	getStatusIndicator(status: SessionStatus, isRead: boolean, isArchived: boolean, motionReduced: boolean, pullRequestIcon?: ThemeIcon): SessionStatusIndicator;
}

export const ISessionsListModelService = createDecorator<ISessionsListModelService>('sessionsListModelService');

export class SessionsListModelService extends Disposable implements ISessionsListModelService {

	declare readonly _serviceBrand: undefined;

	private static readonly PINNED_SESSIONS_KEY = 'sessionsListControl.pinnedSessions';
	private static readonly READ_SESSIONS_KEY = 'sessionsListControl.readSessions';

	/**
	 * Sessions created on or after this date start as unread by default.
	 * Sessions created before this date are treated as read even if absent from
	 * the read set, preserving the behaviour that existed before the unread
	 * indicator was introduced.
	 */
	private static readonly UNREAD_DEFAULT_CUTOFF = new Date('2026-05-12T00:00:00.000Z');

	private readonly _onDidChange = this._register(new Emitter<ISessionListModelChangeEvent>());
	readonly onDidChange: Event<ISessionListModelChangeEvent> = this._onDidChange.event;

	private readonly _pinnedSessionIds: Set<string>;
	private readonly _readSessionIds: Set<string>;
	private readonly _lastKnownStatus = new Map<string, SessionStatus>();

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

			// When a session completes a turn in the background (transitions
			// from InProgress to a terminal status) mark it as unread so the
			// sessions list shows the indicator.
			const activeSessionId = this.sessionsManagementService.activeSession.get()?.sessionId;
			for (const session of e.changed) {
				const previous = this._lastKnownStatus.get(session.sessionId);
				const current = session.status.get();
				this._lastKnownStatus.set(session.sessionId, current);

				if (
					previous === SessionStatus.InProgress &&
					current !== SessionStatus.InProgress &&
					current !== SessionStatus.Untitled &&
					session.sessionId !== activeSessionId
				) {
					this.markUnread(session);
				}
			}

			for (const session of e.added) {
				this._lastKnownStatus.set(session.sessionId, session.status.get());
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
		if (this._readSessionIds.has(session.sessionId)) {
			return true;
		}
		// Sessions last updated before the cutoff date pre-date the unread
		// indicator feature and are treated as read to avoid a flood of unread
		// badges on upgrade. Once a session receives new activity (its updatedAt
		// advances past the cutoff) it becomes unread again so the indicator
		// works correctly.
		return session.updatedAt.get() < SessionsListModelService.UNREAD_DEFAULT_CUTOFF;
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

	// -- Status icon --

	getStatusIcon(status: SessionStatus, isRead: boolean, isArchived: boolean, pullRequestIcon?: ThemeIcon): ThemeIcon {
		switch (status) {
			case SessionStatus.InProgress:
				return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
			case SessionStatus.NeedsInput:
				return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
			case SessionStatus.Error:
				return { ...Codicon.error, color: themeColorFromId('errorForeground') };
			default:
				if (pullRequestIcon) {
					return pullRequestIcon;
				}
				if (!isRead && !isArchived) {
					return { ...Codicon.circleFilled, color: themeColorFromId('textLink.foreground') };
				}
				return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
		}
	}

	getStatusIndicator(status: SessionStatus, isRead: boolean, isArchived: boolean, motionReduced: boolean, pullRequestIcon?: ThemeIcon): SessionStatusIndicator {
		if ((status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) && !motionReduced) {
			const isNeedsInput = status === SessionStatus.NeedsInput;
			return {
				kind: 'spinner',
				variant: isNeedsInput ? 'ring' : 'grid',
				cacheKey: isNeedsInput ? PIXEL_SPINNER_RING_KEY : PIXEL_SPINNER_GRID_KEY,
				color: isNeedsInput ? asCssVariable('list.warningForeground') : asCssVariable('textLink.foreground'),
			};
		}

		const icon = this.getStatusIcon(status, isRead, isArchived, pullRequestIcon);
		return {
			kind: 'icon',
			icon,
			cacheKey: ThemeIcon.asCSSSelector(icon),
			color: icon.color ? asCssVariable(icon.color.id) : '',
		};
	}

	// -- Cleanup --

	private deleteSession(session: ISession): void {
		this._lastKnownStatus.delete(session.sessionId);
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
