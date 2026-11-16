/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, IReader, observableValue, transaction } from '../../../../base/common/observable.js';
import { getComparisonKey, isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanGoBackContext, CanGoForwardContext } from '../common/contextkeys.js';
import { IWindowCanvasService } from './windowCanvas.js';
import { ICustomViewOpenRequest, ICustomViewService } from './customView.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionGridPane } from '../../../services/sessions/browser/sessionGridPane.js';
import { getRecencyEntryKey, SessionRecencyEntry, SessionsRecencyHistory } from '../../../services/sessions/browser/sessionsRecencyHistory.js';

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
	openSavedDraft?(draftId: string, token: CancellationToken): Promise<boolean>;
}

/**
 * Walks the shared MRU history without promoting entries during Back/Forward.
 * Explicit destination changes promote their entry without truncating the history.
 */
export class SessionsNavigation extends Disposable {

	/** Identity of the entry the cursor currently points at. */
	private readonly _currentKey = observableValue<string | undefined>(this, undefined);
	private readonly _currentDraftId = observableValue<string | undefined>(this, undefined);
	private readonly _draftNavigation = this._register(new MutableDisposable<CancellationTokenSource>());

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
		private readonly _activePane: IObservable<Pick<ISessionGridPane, 'session' | 'chat'> | undefined>,
		private readonly _customViewService: ICustomViewService,
		private readonly _windowCanvasService: IWindowCanvasService,
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
					this.recordOpened(getCustomViewEntry(customViewOpen));
				}
				return;
			}

			const canvasOpen = this._windowCanvasService.activeCanvasOpen.read(reader);
			const canvasRequest = this._windowCanvasService.navigationRequest.read(reader);
			if (canvasRequest && canvasRequest !== canvasOpen) {
				return;
			}
			if (canvasOpen) {
				if (canvasOpen.source === 'explicit') {
					this.recordOpened({ kind: 'canvas', id: canvasOpen.id });
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
		this.cancelPendingDraftOpen();
		this._pendingOpen = undefined;
		transaction(tx => {
			this._recency.markOpened(entry, tx);
			this._currentKey.set(getRecencyEntryKey(entry), tx);
		});
	}

	setCurrentDraftId(draftId: string | undefined, preserveCurrentEntry = false): void {
		const previous = this._getNewSessionEntry();
		transaction(tx => {
			this._currentDraftId.set(draftId, tx);
			if (!preserveCurrentEntry && this._currentKey.get() === getRecencyEntryKey(previous)) {
				const entry = this._getNewSessionEntry();
				this._recency.replace(previous, entry, tx);
				this._currentKey.set(getRecencyEntryKey(entry), tx);
			}
		});
	}

	recordNewSessionOpened(): void {
		this.recordOpened(this._getNewSessionEntry());
	}

	/** Defers recording intermediate session/chat selections until the destination is ready. */
	beginSessionOpen(intent: SessionNavigationIntent, token: CancellationToken): { complete(): void; cancel(): void } {
		// Reactive fallbacks retain the initiating operation's history semantics.
		const navigationIntent = intent === 'automatic' ? this._pendingOpen?.intent ?? intent : intent;
		if (navigationIntent !== 'history') {
			this.cancelPendingDraftOpen();
		}
		const opening = { intent: navigationIntent, token };
		this._pendingOpen = opening;
		return {
			complete: () => {
				if (this._pendingOpen !== opening) {
					return;
				}
				this._pendingOpen = undefined;
				if (!token.isCancellationRequested && navigationIntent !== 'history' && !this._customViewService.activeCustomView.get() && !this._windowCanvasService.activeCanvasOpen.get()) {
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
		this.cancelPendingDraftOpen();
		await this._navigate(1);
	}

	async goForward(): Promise<void> {
		this.cancelPendingDraftOpen();
		await this._navigate(-1);
	}

	cancelPendingDraftOpen(): void {
		this._draftNavigation.value?.cancel();
		this._draftNavigation.clear();
	}

	private _getNewSessionEntry(): SessionRecencyEntry {
		const draftId = this._currentDraftId.get();
		return draftId === undefined ? { kind: 'newSession' } : { kind: 'newSession', draftId };
	}

	private _getActiveEntry(reader?: IReader): SessionRecencyEntry {
		const customViewOpen = this._customViewService.activeCustomViewOpen.read(reader);
		if (customViewOpen) {
			return getCustomViewEntry(customViewOpen);
		}

		const pane = this._activePane.read(reader);
		const session = pane?.session.read(reader);
		if (!pane || !session || session.status.read(reader) === SessionStatus.Untitled) {
			return this._getNewSessionEntry();
		}

		const chat = pane.chat.read(reader);
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
				this._customViewService.showCustomView(entry.id, { source: 'history', state: entry.state });
				const opened = this._customViewService.activeCustomViewOpen.get();
				// A view that cannot show the recorded state, such as a removed item, declines the opening.
				if (opened?.descriptor.id !== entry.id || opened.state !== entry.state) {
					this._currentKey.set(previousKey, undefined);
					this._recency.remove(e => getRecencyEntryKey(e) === key);
					continue;
				}
			} else if (entry.kind === 'canvas') {
				if (!this._windowCanvasService.canvases.get().some(canvas => canvas.id === entry.id)) {
					this._recency.remove(e => getRecencyEntryKey(e) === key);
					continue;
				}
				const previousKey = this._currentKey.get();
				const navigation = this.beginSessionOpen('history', CancellationToken.None);
				this._currentKey.set(key, undefined);
				let failed = false;
				try {
					await this._windowCanvasService.openCanvas(entry.id, { source: 'history' });
				} catch (error) {
					failed = true;
					this._logService.warn('[SessionNavigation] opening canvas failed', error);
				} finally {
					navigation.cancel();
				}
				if (this._windowCanvasService.activeCanvasOpen.get()?.id !== entry.id) {
					if (this._currentKey.get() !== key) {
						return;
					}
					this._currentKey.set(previousKey, undefined);
					if (!failed && this._windowCanvasService.canvases.get().some(canvas => canvas.id === entry.id)) {
						return;
					}
					this._recency.remove(e => getRecencyEntryKey(e) === key);
					continue;
				}
			} else if (entry.kind === 'newSession') {
				const previousKey = this._currentKey.get();
				const source = new CancellationTokenSource();
				this._draftNavigation.value = source;
				const navigation = this.beginSessionOpen('history', source.token);
				this._currentKey.set(key, undefined);
				let opened = false;
				let failed = false;
				try {
					if (entry.draftId !== undefined) {
						opened = await this._opener.openSavedDraft?.(entry.draftId, source.token) ?? false;
					} else {
						await this._opener.openNewSession();
						opened = true;
					}
				} catch (error) {
					failed = true;
					this._logService.warn('[SessionNavigation] opening draft failed', error);
				} finally {
					navigation.cancel();
					if (this._draftNavigation.value === source) {
						this._draftNavigation.clear();
					}
				}
				if (source.token.isCancellationRequested || this._currentKey.get() !== key) {
					return;
				}
				if (!opened) {
					this._currentKey.set(previousKey, undefined);
					if (failed) {
						return;
					}
					this._recency.remove(e => getRecencyEntryKey(e) === key);
					continue;
				}
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

	override dispose(): void {
		this.cancelPendingDraftOpen();
		super.dispose();
	}
}

function getCustomViewEntry(open: ICustomViewOpenRequest): SessionRecencyEntry {
	return { kind: 'customView', id: open.descriptor.id, ...(open.state !== undefined ? { state: open.state } : {}) };
}
