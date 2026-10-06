/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanGoBackContext, CanGoForwardContext } from '../../../common/contextkeys.js';
import { ICustomViewService } from '../../customView/browser/customViewService.js';
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService, IActiveSession } from '../common/sessionsManagement.js';
import { IRecencyEntry, SessionsRecencyHistory } from './sessionsRecencyHistory.js';

function entryKey(sessionResource: URI, chatResource: URI | undefined): string {
	return `${sessionResource.toString()}::${chatResource?.toString() ?? ''}`;
}

/**
 * The subset of opening behaviour {@link SessionsNavigation} drives. Implemented
 * by the view service, passed in to avoid the navigation (a `services` module)
 * depending on the core view service.
 */
export interface ISessionOpener {
	openSession(sessionResource: URI, options?: { preserveFocus?: boolean; source?: 'navigation' }): Promise<void>;
	openChat(session: ISession, chatResource: URI): Promise<void>;
}

/**
 * A custom view (e.g. Automations) visited between two history entries. It is
 * not part of the recency history; navigation only keeps the most recent one,
 * anchored to its neighbouring entries.
 */
interface ICustomViewStop {
	readonly viewId: string;
	/** Entry that was current when the custom view was shown. */
	readonly beforeKey: string | undefined;
	/** Entry opened when leaving the custom view, once recorded. */
	readonly afterKey: string | undefined;
	/** Where navigation currently is relative to the custom view. */
	readonly position: 'before' | 'on' | 'after';
}

/**
 * Provides Back/Forward navigation over the shared session recency history
 * ({@link SessionsRecencyHistory}). Created and owned by
 * the `SessionsService` (view).
 *
 * The recency history is the single source of truth for ordering. Navigation
 * keeps only a cursor (the currently-navigated entry) and walks the history:
 * - Going Back/Forward moves the cursor over the existing order; it never
 *   re-promotes entries (that would break Forward).
 * - Only explicit opens (recorded by the feeder autorun via
 *   {@link SessionsRecencyHistory.markOpened}) re-promote an entry to the front
 *   and reset the cursor to it.
 *
 * Because the history is MRU-ordered and not truncated, going somewhere new
 * after a Back does not discard the previously-newer entries; they remain
 * reachable as older entries (Alt+Tab-style rather than browser-style).
 *
 * Custom views (e.g. Automations) are tracked as a single {@link ICustomViewStop}
 * next to the cursor, so leaving a custom view by opening a session and then
 * going Back returns to the custom view. Any other explicit navigation drops it.
 */
export class SessionsNavigation extends Disposable {

	/** Identity of the entry the cursor currently points at. */
	private readonly _currentKey = observableValue<string | undefined>(this, undefined);

	/** Guard: true while we are performing a back/forward navigation. */
	private _navigating = false;

	/**
	 * True when the user has explicitly navigated to the new-session view after
	 * having been on a real session. Enables going back to the last real session
	 * without storing a new-session view entry in the history.
	 */
	private readonly _beyondHistory = observableValue<boolean>(this, false);

	private readonly _customViewStop = observableValue<ICustomViewStop | undefined>(this, undefined);

	/**
	 * True between an explicit navigation that leaves the custom view and the
	 * first entry it records, which becomes the stop's {@link ICustomViewStop.afterKey}.
	 */
	private _awaitingCustomViewExit = false;

	private readonly _canGoBackCtx: IContextKey<boolean>;
	private readonly _canGoForwardCtx: IContextKey<boolean>;

	private readonly _canGoBack: IObservable<boolean> = derived(this, reader => {
		const stop = this._customViewStop.read(reader);
		const currentKey = this._currentKey.read(reader);
		if (stop?.position === 'on') {
			const target = stop.beforeKey ?? currentKey;
			this._recency.version.read(reader);
			return target !== undefined && this._indexOf(target) >= 0;
		}
		if (stop?.position === 'after' && stop.afterKey !== undefined && stop.afterKey === currentKey) {
			return true;
		}
		const idx = this._indexOfCurrent(reader);
		const entries = this._recency.entries;
		const beyond = this._beyondHistory.read(reader);
		return (idx >= 0 && idx < entries.length - 1) || (beyond && entries.length > 0);
	});

	private readonly _canGoForward: IObservable<boolean> = derived(this, reader => {
		const stop = this._customViewStop.read(reader);
		const currentKey = this._currentKey.read(reader);
		if (stop?.position === 'on') {
			this._recency.version.read(reader);
			return stop.afterKey !== undefined && this._indexOf(stop.afterKey) >= 0;
		}
		if (stop?.position === 'before' && stop.beforeKey !== undefined && stop.beforeKey === currentKey) {
			return true;
		}
		if (this._beyondHistory.read(reader)) {
			return false;
		}
		return this._indexOfCurrent(reader) > 0;
	});

	constructor(
		private readonly _opener: ISessionOpener,
		private readonly _activeSession: IObservable<IActiveSession | undefined>,
		private readonly _sessionsManagementService: ISessionsManagementService,
		private readonly _recency: SessionsRecencyHistory,
		private readonly _customViewService: ICustomViewService,
		contextKeyService: IContextKeyService,
		private readonly _logService: ILogService,
	) {
		super();

		this._canGoBackCtx = CanGoBackContext.bindTo(contextKeyService);
		this._canGoForwardCtx = CanGoForwardContext.bindTo(contextKeyService);

		// Track active session/chat changes to record recency entries.
		// Skip undefined (new-session view) and Untitled sessions — only record
		// sessions that have been saved/submitted. Also tracks active chat changes
		// within a session so that switching chats is navigable.
		// NOTE: all observables must always be read before the _navigating guard to
		// keep subscriptions alive during navigation.
		this._register(autorun(reader => {
			const activeSession = this._activeSession.read(reader);
			const activeChat = activeSession?.activeChat.read(reader);
			const sessionStatus = activeSession?.status.read(reader);
			const chatStatus = activeChat?.status.read(reader);
			if (this._navigating) {
				return;
			}
			if (!activeSession || sessionStatus === SessionStatus.Untitled) {
				// User navigated to new-session view: if we have history, remember we're
				// beyond the stack so Back can return to the last real session.
				if (this._recency.entries.length > 0) {
					this._beyondHistory.set(true, undefined);
				}
				if (this._customViewStop.read(undefined)?.position !== 'on') {
					this._clearCustomViewStop();
				}
				return;
			}

			// Skip untitled chats (new-chat-in-session that hasn't been submitted)
			const chatResource = activeChat && chatStatus !== SessionStatus.Untitled
				? activeChat.resource
				: undefined;
			const key = entryKey(activeSession.resource, chatResource);

			this._beyondHistory.set(false, undefined);
			this._recency.markOpened(activeSession.resource, chatResource);
			this._currentKey.set(key, undefined);

			if (this._awaitingCustomViewExit) {
				this._awaitingCustomViewExit = false;
				const stop = this._customViewStop.read(undefined);
				if (stop?.position === 'after') {
					this._customViewStop.set({ ...stop, afterKey: key }, undefined);
				}
			}
		}));

		// Track custom views shown or hidden outside of Back/Forward.
		this._register(autorun(reader => {
			const customView = this._customViewService.activeCustomView.read(reader);
			if (this._navigating) {
				return;
			}
			const stop = this._customViewStop.read(undefined);
			if (customView) {
				if (stop?.position !== 'on' || stop.viewId !== customView.id) {
					this._awaitingCustomViewExit = false;
					this._customViewStop.set({ viewId: customView.id, beforeKey: this._currentKey.read(undefined), afterKey: undefined, position: 'on' }, undefined);
				}
			} else if (stop?.position === 'on') {
				// Hidden without opening a session (e.g. the view was disabled).
				this._clearCustomViewStop();
			}
		}));

		// Reconcile the cursor when entries are removed externally (e.g. a
		// session deletion). If the current entry is gone, fall back to the most
		// recent remaining entry.
		this._register(autorun(reader => {
			this._recency.version.read(reader);
			// Untracked: we react to entry changes (version) only, not to our own
			// cursor writes below, which would otherwise re-trigger this autorun.
			const key = this._currentKey.read(undefined);
			if (key !== undefined && this._indexOf(key) < 0) {
				const front = this._recency.entries[0];
				this._currentKey.set(front ? entryKey(front.sessionResource, front.chatResource) : undefined, undefined);
			}
		}));

		// Sync context keys with observables
		this._register(autorun(reader => {
			this._canGoBackCtx.set(this._canGoBack.read(reader));
			this._canGoForwardCtx.set(this._canGoForward.read(reader));
		}));
	}

	onDidRemoveSessions(e: ISessionsChangeEvent): void {
		if (e.removed.length === 0) {
			return;
		}
		const removedUris = new Set(e.removed.map(s => s.resource.toString()));
		this._recency.remove(entry => removedUris.has(entry.sessionResource.toString()));
	}

	/**
	 * Called by the view service before an explicit (non Back/Forward)
	 * navigation. Leaving a shown custom view this way keeps it reachable via
	 * Back from the entry that gets opened; any other explicit navigation drops it.
	 */
	onWillNavigateExplicitly(): void {
		if (this._navigating) {
			return;
		}
		const stop = this._customViewStop.get();
		if (stop?.position === 'on' && this._customViewService.activeCustomView.get()?.id === stop.viewId) {
			this._awaitingCustomViewExit = true;
			this._customViewStop.set({ ...stop, afterKey: undefined, position: 'after' }, undefined);
		} else {
			this._clearCustomViewStop();
		}
	}

	async goBack(): Promise<void> {
		this._awaitingCustomViewExit = false;
		const stop = this._customViewStop.get();
		if (stop?.position === 'on') {
			const targetKey = stop.beforeKey ?? this._currentKey.get();
			const targetIdx = targetKey !== undefined ? this._indexOf(targetKey) : -1;
			if (targetIdx < 0) {
				return;
			}
			this._beyondHistory.set(false, undefined);
			this._customViewStop.set({ ...stop, beforeKey: targetKey, position: 'before' }, undefined);
			await this._navigateTo(targetIdx);
			return;
		}
		if (stop?.position === 'after' && stop.afterKey !== undefined && stop.afterKey === this._currentKey.get()) {
			if (this._showCustomView(stop.viewId)) {
				this._customViewStop.set({ ...stop, position: 'on' }, undefined);
				return;
			}
			this._clearCustomViewStop();
		}
		if (this._beyondHistory.get()) {
			// User is on new-session view — go back to the last real session
			this._beyondHistory.set(false, undefined);
			const idx = this._indexOfCurrent();
			await this._navigateTo(idx < 0 ? 0 : idx);
			return;
		}
		const idx = this._indexOfCurrent();
		if (idx < 0 || idx >= this._recency.entries.length - 1) {
			return;
		}
		await this._navigateTo(idx + 1);
	}

	async goForward(): Promise<void> {
		this._awaitingCustomViewExit = false;
		const stop = this._customViewStop.get();
		if (stop?.position === 'on') {
			const targetIdx = stop.afterKey !== undefined ? this._indexOf(stop.afterKey) : -1;
			if (targetIdx < 0) {
				return;
			}
			this._customViewStop.set({ ...stop, position: 'after' }, undefined);
			await this._navigateTo(targetIdx);
			return;
		}
		if (stop?.position === 'before' && stop.beforeKey !== undefined && stop.beforeKey === this._currentKey.get()) {
			if (this._showCustomView(stop.viewId)) {
				this._customViewStop.set({ ...stop, position: 'on' }, undefined);
				return;
			}
			this._clearCustomViewStop();
		}
		const idx = this._indexOfCurrent();
		if (idx <= 0) {
			return;
		}
		await this._navigateTo(idx - 1);
	}

	/** Shows the custom view as part of Back/Forward and reports whether it is now shown. */
	private _showCustomView(viewId: string): boolean {
		this._logService.trace(`[SessionNavigation] navigating to custom view ${viewId}`);
		this._navigating = true;
		try {
			this._customViewService.showCustomView(viewId);
		} finally {
			this._navigating = false;
		}
		return this._customViewService.activeCustomView.get()?.id === viewId;
	}

	private _clearCustomViewStop(): void {
		this._awaitingCustomViewExit = false;
		this._customViewStop.set(undefined, undefined);
	}

	/** Index of the current cursor entry in the recency history, or -1. */
	private _indexOfCurrent(reader?: IReader): number {
		const key = reader ? this._currentKey.read(reader) : this._currentKey.get();
		if (reader) {
			this._recency.version.read(reader);
		}
		if (key === undefined) {
			return -1;
		}
		return this._indexOf(key);
	}

	private _indexOf(key: string): number {
		return this._recency.entries.findIndex(e => entryKey(e.sessionResource, e.chatResource) === key);
	}

	private async _navigateTo(targetIdx: number): Promise<void> {
		const entry: IRecencyEntry | undefined = this._recency.entries[targetIdx];
		if (!entry) {
			return;
		}

		this._logService.trace(`[SessionNavigation] navigating to idx=${targetIdx} session=${entry.sessionResource.toString()} chat=${entry.chatResource?.toString()}`);

		this._navigating = true;
		try {
			this._currentKey.set(entryKey(entry.sessionResource, entry.chatResource), undefined);

			const session = this._sessionsManagementService.getSession(entry.sessionResource);
			if (session) {
				if (entry.chatResource) {
					const chatExists = session.chats.get().some(c => c.resource.toString() === entry.chatResource!.toString());
					if (chatExists) {
						await this._opener.openChat(session, entry.chatResource);
					} else {
						await this._opener.openSession(entry.sessionResource, { source: 'navigation' });
					}
				} else {
					await this._opener.openSession(entry.sessionResource, { source: 'navigation' });
				}
			} else {
				// Session no longer exists, remove its entries from history
				const sessionUri = entry.sessionResource.toString();
				this._recency.remove(e => e.sessionResource.toString() === sessionUri);
			}
		} finally {
			this._navigating = false;
		}
	}
}
