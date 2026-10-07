/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunDelta } from '../../../../base/common/observable.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/** Swallows the brief idle gap between a turn ending and a queued turn starting. */
const COMPLETED_DELAY_MS = 1_500;

/**
 * Tells the user their phone needs them while the app is in the background.
 *
 * A phone user starts a long-running session and switches apps; the desktop
 * notifier cannot reach them because its OS toasts come from Electron. This
 * contribution uses the Web Notifications API when the page is hidden: a
 * session that finishes, fails, or asks a question posts a system notification
 * (and a short vibration where supported), and tapping it brings the app back
 * and opens that session. Nothing is shown while the page is visible — the
 * transcript and the session list already show the change.
 *
 * Permission is requested lazily, the first time a notification would be
 * useful, so the prompt appears in context rather than at startup.
 */
class MobileBackgroundNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.mobileBackgroundNotifier';

	private readonly _statusListeners = this._register(new DisposableMap<string>());
	private readonly _shown = new Map<string, Notification>();

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
	) {
		super();

		if (typeof Notification === 'undefined') {
			return;
		}

		for (const session of this._sessionsManagementService.getSessions()) {
			this._track(session);
		}
		this._register(this._sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this._statusListeners.deleteAndDispose(session.sessionId);
				this._close(session);
			}
			for (const session of event.added) {
				this._track(session);
			}
		}));
		this._register(toDisposable(() => {
			for (const notification of this._shown.values()) {
				notification.close();
			}
			this._shown.clear();
		}));
	}

	private _track(session: ISession): void {
		const store = new DisposableStore();
		const completed = store.add(new RunOnceScheduler(() => void this._notify(session, SessionStatus.Completed), COMPLETED_DELAY_MS));
		store.add(autorunDelta(session.status, ({ lastValue, newValue }) => {
			if (lastValue === undefined || lastValue === newValue) {
				return;
			}
			this._close(session);
			if (newValue === SessionStatus.Completed) {
				completed.schedule();
			} else {
				completed.cancel();
			}
			if (newValue === SessionStatus.NeedsInput || newValue === SessionStatus.Error) {
				void this._notify(session, newValue);
			}
		}));
		this._statusListeners.set(session.sessionId, store);
	}

	private async _notify(session: ISession, status: SessionStatus): Promise<void> {
		if (session.status.get() !== status || !mainWindow.document.hidden) {
			return;
		}
		if (!(await this._ensurePermission())) {
			return;
		}

		const title = session.title.get();
		const body = status === SessionStatus.NeedsInput
			? localize('mobileNotify.needsInput', "Needs your input")
			: status === SessionStatus.Error
				? localize('mobileNotify.failed', "Stopped with an error")
				: localize('mobileNotify.completed', "Finished");

		const notification = new Notification(title, {
			body,
			tag: session.resource.toString(),
			icon: 'favicon.ico',
		});
		notification.onclick = () => {
			mainWindow.focus();
			void this._sessionsService.openSession(session.resource, { source: 'notification' });
			notification.close();
		};
		this._shown.set(session.sessionId, notification);

		// Optional on the web platform: absent on desktop browsers and iOS Safari.
		navigator.vibrate?.(status === SessionStatus.NeedsInput ? [60, 40, 60] : 40);
	}

	private async _ensurePermission(): Promise<boolean> {
		if (Notification.permission === 'granted') {
			return true;
		}
		if (Notification.permission === 'denied') {
			return false;
		}
		try {
			return (await Notification.requestPermission()) === 'granted';
		} catch {
			return false;
		}
	}

	private _close(session: ISession): void {
		this._shown.get(session.sessionId)?.close();
		this._shown.delete(session.sessionId);
	}
}

registerWorkbenchContribution2(MobileBackgroundNotifier.ID, MobileBackgroundNotifier, WorkbenchPhase.Eventually);
