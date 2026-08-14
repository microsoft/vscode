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
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService, IActiveSession } from '../common/sessionsManagement.js';
import { ICustomViewService } from '../../customView/browser/customViewService.js';
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
	openSession(sessionResource: URI, options?: { preserveFocus?: boolean }): Promise<void>;
	openChat(session: ISession, chatResource: URI): Promise<void>;
}

type CustomViewNavigationLocation = 'previous' | 'customView' | 'next';

interface ICustomViewNavigation {
	readonly viewId: string;
	readonly previousKey: string | undefined;
	readonly nextKey: string;
	readonly customViewKey: string | undefined;
	readonly location: CustomViewNavigationLocation;
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

	private readonly _customViewNavigation = observableValue<ICustomViewNavigation | undefined>(this, undefined);
	private _pendingCustomViewOrigin: Pick<ICustomViewNavigation, 'viewId' | 'previousKey'> | undefined;

	private readonly _canGoBackCtx: IContextKey<boolean>;
	private readonly _canGoForwardCtx: IContextKey<boolean>;

	private readonly _canGoBack: IObservable<boolean> = derived(this, reader => {
		const idx = this._indexOfCurrent(reader);
		const customViewNavigation = this._customViewNavigation.read(reader);
		if (customViewNavigation?.location === 'next' && this._currentKey.read(reader) === customViewNavigation.nextKey) {
			return true;
		}
		if (customViewNavigation?.location === 'customView') {
			return customViewNavigation.previousKey !== undefined && this._indexOf(customViewNavigation.previousKey) >= 0;
		}
		const entries = this._recency.entries;
		const beyond = this._beyondHistory.read(reader);
		return (idx >= 0 && idx < entries.length - 1) || (beyond && entries.length > 0);
	});

	private readonly _canGoForward: IObservable<boolean> = derived(this, reader => {
		if (this._beyondHistory.read(reader)) {
			return false;
		}
		const customViewNavigation = this._customViewNavigation.read(reader);
		const currentKey = this._currentKey.read(reader);
		if (customViewNavigation?.location === 'previous' && currentKey === customViewNavigation.previousKey) {
			return true;
		}
		if (customViewNavigation?.location === 'customView') {
			return this._indexOf(customViewNavigation.nextKey) >= 0;
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
				return;
			}

			// Skip untitled chats (new-chat-in-session that hasn't been submitted)
			const chatResource = activeChat && chatStatus !== SessionStatus.Untitled
				? activeChat.resource
				: undefined;

			this._beyondHistory.set(false, undefined);
			this._recency.markOpened(activeSession.resource, chatResource);
			const key = entryKey(activeSession.resource, chatResource);
			this._currentKey.set(key, undefined);

			const customViewNavigation = this._customViewNavigation.read(undefined);
			if (!this._pendingCustomViewOrigin && customViewNavigation) {
				const expectedKey = customViewNavigation.location === 'previous'
					? customViewNavigation.previousKey
					: customViewNavigation.location === 'customView'
						? customViewNavigation.customViewKey
						: customViewNavigation.nextKey;
				if (key !== expectedKey) {
					this._customViewNavigation.set(undefined, undefined);
				}
			}
		}));

		this._register(autorun(reader => {
			const customViewNavigation = this._customViewNavigation.read(reader);
			const activeCustomView = this._customViewService.activeCustomView.read(reader);
			if (customViewNavigation?.location === 'customView' && activeCustomView?.id !== customViewNavigation.viewId) {
				this._customViewNavigation.set(undefined, undefined);
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

	onWillOpenSession(): void {
		if (this._navigating) {
			return;
		}

		const customView = this._customViewService.activeCustomView.get();
		this._customViewNavigation.set(undefined, undefined);
		this._pendingCustomViewOrigin = customView
			? { viewId: customView.id, previousKey: this._currentKey.get() }
			: undefined;
	}

	onDidOpenSession(succeeded = true): void {
		if (this._navigating || !this._pendingCustomViewOrigin) {
			return;
		}

		const pending = this._pendingCustomViewOrigin;
		this._pendingCustomViewOrigin = undefined;
		if (!succeeded) {
			return;
		}

		const activeSession = this._activeSession.get();
		if (!activeSession || activeSession.status.get() === SessionStatus.Untitled) {
			return;
		}

		const activeChat = activeSession.activeChat.get();
		const chatResource = activeChat.status.get() === SessionStatus.Untitled ? undefined : activeChat.resource;
		const nextKey = entryKey(activeSession.resource, chatResource);
		if (this._indexOf(nextKey) < 0) {
			return;
		}

		this._customViewNavigation.set({
			...pending,
			nextKey,
			customViewKey: undefined,
			location: 'next',
		}, undefined);
	}

	onDidRemoveSessions(e: ISessionsChangeEvent): void {
		if (e.removed.length === 0) {
			return;
		}
		const removedUris = new Set(e.removed.map(s => s.resource.toString()));
		this._recency.remove(entry => removedUris.has(entry.sessionResource.toString()));

		const customViewNavigation = this._customViewNavigation.get();
		if (customViewNavigation && (
			this._indexOf(customViewNavigation.nextKey) < 0 ||
			(customViewNavigation.previousKey !== undefined && this._indexOf(customViewNavigation.previousKey) < 0)
		)) {
			this._customViewNavigation.set(undefined, undefined);
		}
	}

	async goBack(): Promise<void> {
		const customViewNavigation = this._customViewNavigation.get();
		if (customViewNavigation?.location === 'next' && this._currentKey.get() === customViewNavigation.nextKey) {
			if (this._showCustomView(customViewNavigation, customViewNavigation.nextKey)) {
				return;
			}
		} else if (customViewNavigation?.location === 'customView') {
			if (customViewNavigation.previousKey === undefined) {
				return;
			}

			const previousIdx = this._indexOf(customViewNavigation.previousKey);
			if (previousIdx < 0) {
				this._customViewNavigation.set(undefined, undefined);
				return;
			}

			this._customViewNavigation.set({ ...customViewNavigation, customViewKey: undefined, location: 'previous' }, undefined);
			this._customViewService.hideCustomView();
			await this._navigateTo(previousIdx);
			return;
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
		const customViewNavigation = this._customViewNavigation.get();
		const currentKey = this._currentKey.get();
		if (customViewNavigation?.location === 'previous' && currentKey !== undefined && currentKey === customViewNavigation.previousKey) {
			if (this._showCustomView(customViewNavigation, currentKey)) {
				return;
			}
		} else if (customViewNavigation?.location === 'customView') {
			const nextIdx = this._indexOf(customViewNavigation.nextKey);
			if (nextIdx < 0) {
				this._customViewNavigation.set(undefined, undefined);
				return;
			}

			this._customViewNavigation.set({ ...customViewNavigation, customViewKey: undefined, location: 'next' }, undefined);
			this._customViewService.hideCustomView();
			await this._navigateTo(nextIdx);
			return;
		}

		const idx = this._indexOfCurrent();
		if (idx <= 0) {
			return;
		}
		await this._navigateTo(idx - 1);
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

	private _showCustomView(customViewNavigation: ICustomViewNavigation, customViewKey: string): boolean {
		this._customViewService.showCustomView(customViewNavigation.viewId);
		if (this._customViewService.activeCustomView.get()?.id !== customViewNavigation.viewId) {
			this._customViewNavigation.set(undefined, undefined);
			return false;
		}

		this._customViewNavigation.set({ ...customViewNavigation, customViewKey, location: 'customView' }, undefined);
		return true;
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
						await this._opener.openSession(entry.sessionResource);
					}
				} else {
					await this._opener.openSession(entry.sessionResource);
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
