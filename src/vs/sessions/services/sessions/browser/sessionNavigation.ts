/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableValue, transaction } from '../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanGoBackContext, CanGoForwardContext } from '../../../common/contextkeys.js';
import { ICustomViewService } from '../../customView/browser/customViewService.js';
import { ISession, SessionStatus } from '../common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService, IActiveSession } from '../common/sessionsManagement.js';
import { getRecencyEntryKey, SessionRecencyEntry, SessionsRecencyHistory } from './sessionsRecencyHistory.js';

export type SessionNavigationIntent = 'explicit' | 'history' | 'automatic';

/**
 * The subset of opening behaviour {@link SessionsNavigation} drives. Implemented
 * by the view service, passed in to avoid the navigation (a `services` module)
 * depending on the core view service.
 */
export interface ISessionOpener {
	openSession(sessionResource: URI, options?: { preserveFocus?: boolean; source?: 'navigation' }): Promise<void>;
	openChat(session: ISession, chatResource: URI): Promise<void>;
	openNewSession(): Promise<void>;
}

/**
 * Walks the shared MRU history without promoting entries during Back/Forward.
 * Explicit destination changes promote their entry without truncating the history.
 */
export class SessionsNavigation extends Disposable {

	/** Identity of the entry the cursor currently points at. */
	private readonly _currentKey = observableValue<string | undefined>(this, undefined);

	private _pendingOpen: { readonly intent: SessionNavigationIntent; readonly token: CancellationToken } | undefined;

	private readonly _canGoBackCtx: IContextKey<boolean>;
	private readonly _canGoForwardCtx: IContextKey<boolean>;

	private readonly _canGoBack: IObservable<boolean> = derived(this, reader => {
		const idx = this._indexOfCurrent(reader);
		return idx >= 0 && idx < this._recency.entries.length - 1;
	});

	private readonly _canGoForward: IObservable<boolean> = derived(this, reader => this._indexOfCurrent(reader) > 0);

	constructor(
		private readonly _opener: ISessionOpener,
		private readonly _activeSession: IObservable<IActiveSession | undefined>,
		private readonly _customViewService: ICustomViewService,
		private readonly _sessionsManagementService: ISessionsManagementService,
		private readonly _recency: SessionsRecencyHistory,
		contextKeyService: IContextKeyService,
		private readonly _logService: ILogService,
	) {
		super();

		this._canGoBackCtx = CanGoBackContext.bindTo(contextKeyService);
		this._canGoForwardCtx = CanGoForwardContext.bindTo(contextKeyService);

		this._register(autorun(reader => {
			const customViewOpen = this._customViewService.activeCustomViewOpen.read(reader);
			if (customViewOpen) {
				if (customViewOpen.source !== 'history') {
					this.recordOpened({ kind: 'customView', id: customViewOpen.descriptor.id });
				}
				return;
			}

			// Keep tracking the destination while an asynchronous open is in progress.
			const entry = this._getActiveEntry(reader);
			const key = getRecencyEntryKey(entry);
			if (key === this._currentKey.read(undefined) || (this._pendingOpen && !this._pendingOpen.token.isCancellationRequested)) {
				return;
			}

			this.recordOpened(entry);
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
				this._currentKey.set(front ? getRecencyEntryKey(front) : undefined, undefined);
			}
		}));

		// Sync context keys with observables
		this._register(autorun(reader => {
			this._canGoBackCtx.set(this._canGoBack.read(reader));
			this._canGoForwardCtx.set(this._canGoForward.read(reader));
		}));
	}

	/** Records an explicit opening even when the displayed destination has not changed. */
	recordOpened(entry: SessionRecencyEntry): void {
		this._pendingOpen = undefined;
		transaction(tx => {
			this._recency.markOpened(entry, tx);
			this._currentKey.set(getRecencyEntryKey(entry), tx);
		});
	}

	/** Defers recording intermediate session/chat selections until the destination is ready. */
	beginSessionOpen(intent: SessionNavigationIntent, token: CancellationToken): { complete(): void; cancel(): void } {
		// Reactive fallbacks retain the initiating operation's history semantics.
		const navigationIntent = intent === 'automatic' ? this._pendingOpen?.intent ?? intent : intent;
		const opening = { intent: navigationIntent, token };
		this._pendingOpen = opening;
		return {
			complete: () => {
				if (this._pendingOpen !== opening) {
					return;
				}
				this._pendingOpen = undefined;
				if (!token.isCancellationRequested && navigationIntent !== 'history' && !this._customViewService.activeCustomView.get()) {
					this.recordOpened(this._getActiveEntry());
				}
			},
			cancel: () => {
				if (this._pendingOpen === opening) {
					this._pendingOpen = undefined;
				}
			},
		};
	}

	onDidRemoveSessions(e: ISessionsChangeEvent): void {
		if (e.removed.length === 0) {
			return;
		}
		const removedUris = new Set(e.removed.map(s => getComparisonKey(s.resource)));
		this._recency.remove(entry => entry.kind === 'session' && removedUris.has(getComparisonKey(entry.sessionResource)));
	}

	async goBack(): Promise<void> {
		await this._navigate(1);
	}

	async goForward(): Promise<void> {
		await this._navigate(-1);
	}

	private _getActiveEntry(reader?: IReader): SessionRecencyEntry {
		const customView = this._customViewService.activeCustomView.read(reader);
		if (customView) {
			return { kind: 'customView', id: customView.id };
		}

		const session = this._activeSession.read(reader);
		if (!session || session.status.read(reader) === SessionStatus.Untitled) {
			return { kind: 'newSession' };
		}

		const chat = session.activeChat.read(reader);
		return {
			kind: 'session',
			sessionResource: session.resource,
			chatResource: chat && chat.status.read(reader) !== SessionStatus.Untitled ? chat.resource : undefined,
		};
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
		return this._recency.entries.findIndex(e => getRecencyEntryKey(e) === key);
	}

	private async _navigate(direction: 1 | -1): Promise<void> {
		while (true) {
			const idx = this._indexOfCurrent();
			const entry = idx >= 0 ? this._recency.entries[idx + direction] : undefined;
			if (!entry) {
				return;
			}

			const key = getRecencyEntryKey(entry);
			this._logService.trace(`[SessionNavigation] navigating to ${key}`);
			if (entry.kind === 'customView') {
				const previousKey = this._currentKey.get();
				this._currentKey.set(key, undefined);
				this._customViewService.showCustomView(entry.id, { source: 'history' });
				if (this._customViewService.activeCustomView.get()?.id !== entry.id) {
					this._currentKey.set(previousKey, undefined);
					this._recency.remove(e => getRecencyEntryKey(e) === key);
					continue;
				}
			} else if (entry.kind === 'newSession') {
				this._currentKey.set(key, undefined);
				await this._opener.openNewSession();
			} else {
				const session = this._sessionsManagementService.getSession(entry.sessionResource);
				if (!session) {
					this._recency.remove(e => e.kind === 'session' && isEqual(e.sessionResource, entry.sessionResource));
					continue;
				}
				const navigation = this.beginSessionOpen('history', CancellationToken.None);
				this._currentKey.set(key, undefined);
				try {
					if (entry.chatResource && session.chats.get().some(chat => isEqual(chat.resource, entry.chatResource))) {
						await this._opener.openChat(session, entry.chatResource);
					} else {
						await this._opener.openSession(entry.sessionResource, { source: 'navigation' });
					}
				} finally {
					navigation.cancel();
				}
			}
			return;
		}
	}
}
