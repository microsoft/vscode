/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanGoBackContext, CanGoForwardContext } from '../../../common/contextkeys.js';
import { SessionStatus } from '../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';

const MAX_HISTORY_SIZE = 50;

/**
 * A navigation history entry. Stores the session resource URI.
 */
interface INavigationEntry {
	readonly sessionResource: URI;
}

/**
 * Tracks session navigation history and provides back/forward navigation.
 * Created and owned by {@link SessionsManagementService}.
 */
export class SessionsNavigation extends Disposable {

	private readonly _history: INavigationEntry[] = [];
	private readonly _currentIndex = observableValue<number>(this, -1);

	/** Guard: true while we are performing a back/forward navigation. */
	private _navigating = false;

	/**
	 * True when the user has explicitly navigated to the new-session view after
	 * having been on a real session. Enables going back to the last real session
	 * without storing a new-session view entry in the history stack.
	 */
	private readonly _beyondHistory = observableValue<boolean>(this, false);

	private readonly _canGoBackCtx: IContextKey<boolean>;
	private readonly _canGoForwardCtx: IContextKey<boolean>;

	private readonly _canGoBack: IObservable<boolean> = derived(this, reader => {
		const idx = this._currentIndex.read(reader);
		const beyond = this._beyondHistory.read(reader);
		return idx > 0 || (beyond && idx >= 0);
	});

	private readonly _canGoForward: IObservable<boolean> = derived(this, reader => {
		if (this._beyondHistory.read(reader)) {
			return false;
		}
		return this._currentIndex.read(reader) < this._history.length - 1;
	});

	constructor(
		private readonly _sessionsManagementService: ISessionsManagementService,
		contextKeyService: IContextKeyService,
		private readonly _logService: ILogService,
	) {
		super();

		this._canGoBackCtx = CanGoBackContext.bindTo(contextKeyService);
		this._canGoForwardCtx = CanGoForwardContext.bindTo(contextKeyService);

		// Track active session changes to record history entries.
		// Skip undefined (new-session view) and Untitled sessions — only record
		// sessions that have been saved/submitted.
		// NOTE: activeSession.read(reader) must always be called first to keep the
		// subscription alive even during navigation, otherwise the autorun loses its
		// dependency and stops firing after goBack/goForward completes.
		this._register(autorun(reader => {
			const activeSession = this._sessionsManagementService.activeSession.read(reader);
			if (this._navigating) {
				return;
			}
			if (!activeSession || activeSession.status.read(reader) === SessionStatus.Untitled) {
				// User navigated to new-session view: if we have history, remember we're
				// beyond the stack so Back can return to the last real session.
				if (this._history.length > 0) {
					this._beyondHistory.set(true, undefined);
				}
				return;
			}

			this._beyondHistory.set(false, undefined);
			this._pushEntry({ sessionResource: activeSession.resource });
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
		this._removeEntriesMatching(uri => removedUris.has(uri.toString()));
	}

	async goBack(): Promise<void> {
		if (this._beyondHistory.get()) {
			// User is on new-session view — go back to the last real session
			this._beyondHistory.set(false, undefined);
			await this._navigateTo(this._currentIndex.get());
			return;
		}
		const idx = this._currentIndex.get();
		if (idx <= 0) {
			return;
		}
		await this._navigateTo(idx - 1);
	}

	async goForward(): Promise<void> {
		const idx = this._currentIndex.get();
		if (idx >= this._history.length - 1) {
			return;
		}
		await this._navigateTo(idx + 1);
	}

	private _pushEntry(entry: INavigationEntry): void {
		const currentIdx = this._currentIndex.get();

		// Check if the new entry is the same as the current one
		if (currentIdx >= 0 && currentIdx < this._history.length) {
			const current = this._history[currentIdx];
			if (this._isSameEntry(current, entry)) {
				return;
			}
		}

		// Truncate forward history
		if (currentIdx < this._history.length - 1) {
			this._history.splice(currentIdx + 1);
		}

		// Remove any existing entry for the same session to avoid duplicates
		const existingIdx = this._history.findIndex(e => this._isSameEntry(e, entry));
		if (existingIdx >= 0) {
			this._history.splice(existingIdx, 1);
		}

		// Enforce max size by removing oldest entries
		if (this._history.length >= MAX_HISTORY_SIZE) {
			this._history.splice(0, this._history.length - MAX_HISTORY_SIZE + 1);
		}

		this._history.push(entry);
		this._currentIndex.set(this._history.length - 1, undefined);

		this._logService.trace(`[SessionNavigation] pushed entry idx=${this._history.length - 1} uri=${entry.sessionResource.toString()} historySize=${this._history.length}`);
	}

	private async _navigateTo(targetIdx: number): Promise<void> {
		const entry = this._history[targetIdx];
		if (!entry) {
			return;
		}

		this._logService.trace(`[SessionNavigation] navigating to idx=${targetIdx} uri=${entry.sessionResource.toString()}`);

		this._navigating = true;
		try {
			this._currentIndex.set(targetIdx, undefined);

			const session = this._sessionsManagementService.getSession(entry.sessionResource);
			if (session) {
				await this._sessionsManagementService.openSession(entry.sessionResource);
			} else {
				// Session no longer exists, remove it and try again
				this._history.splice(targetIdx, 1);
				if (targetIdx <= this._currentIndex.get()) {
					this._currentIndex.set(Math.max(0, this._currentIndex.get() - 1), undefined);
				}
			}
		} finally {
			this._navigating = false;
		}
	}

	private _isSameEntry(a: INavigationEntry, b: INavigationEntry): boolean {
		return a.sessionResource.toString() === b.sessionResource.toString();
	}

	private _removeEntriesMatching(predicate: (uri: URI) => boolean): void {
		const currentIdx = this._currentIndex.get();
		let newCurrentIdx = currentIdx;
		let i = 0;

		while (i < this._history.length) {
			const entry = this._history[i];
			if (predicate(entry.sessionResource)) {
				this._history.splice(i, 1);
				if (i < newCurrentIdx) {
					newCurrentIdx--;
				} else if (i === newCurrentIdx) {
					newCurrentIdx = Math.min(newCurrentIdx, this._history.length - 1);
				}
			} else {
				i++;
			}
		}

		if (newCurrentIdx !== currentIdx) {
			this._currentIndex.set(Math.max(0, newCurrentIdx), undefined);
		}
	}
}
