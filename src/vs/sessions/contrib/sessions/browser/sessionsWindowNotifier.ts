/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorunDelta } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatNotificationKind, getChatNotificationDedupeKey } from '../../../../workbench/contrib/chat/common/chatNotification.js';
import { ChatConfiguration, ChatNotificationMode } from '../../../../workbench/contrib/chat/common/constants.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionsWindowNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWindowNotifier';

	private readonly _statusListeners = this._register(new DisposableMap<string>());
	private readonly _activeNotifications = this._register(new DisposableResourceMap());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IHostService private readonly _hostService: IHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
	) {
		super();

		for (const session of this._sessionsManagementService.getSessions()) {
			this._trackSession(session);
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this._statusListeners.deleteAndDispose(session.sessionId);
				this._clearNotification(session);
			}
			for (const session of event.added) {
				this._trackSession(session);
			}
		}));
	}

	/**
	 * Delay before a completed session is announced, to swallow the brief idle
	 * gap between a turn ending and the next queued turn starting. A method
	 * rather than a field so tests can override it before `_trackSession` runs
	 * during construction.
	 */
	protected _getCompletedNotificationDelay(): number {
		return 1_500;
	}

	/**
	 * Delay before any toast from this window, which by definition is not showing
	 * the session, so that a window showing it notifies first.
	 */
	protected _getBackgroundNotificationDelay(): number {
		return 250;
	}

	private _trackSession(session: ISession): void {
		const store = new DisposableStore();
		const completedNotificationScheduler = store.add(new RunOnceScheduler(() => void this._notify(session, SessionStatus.Completed), this._getCompletedNotificationDelay()));
		store.add(autorunDelta(session.status, ({ lastValue, newValue }) => {
			if (lastValue === undefined || lastValue === newValue) {
				return;
			}

			this._clearNotification(session);
			if (newValue === SessionStatus.Completed) {
				completedNotificationScheduler.schedule();
			} else {
				completedNotificationScheduler.cancel();
			}
			if (newValue === SessionStatus.NeedsInput || newValue === SessionStatus.Error) {
				void this._notify(session, newValue);
			}
		}));
		this._statusListeners.set(session.sessionId, store);
	}

	private async _notify(session: ISession, status: SessionStatus): Promise<void> {
		if (session.status.get() !== status) {
			return;
		}
		// A live chat model in this window is already covered by ChatWindowNotifier,
		// which knows about queued requests. This notifier only covers sessions that
		// have no model here, where the status summary is all we have to go on.
		if (this._chatService.getSession(session.resource) || this._chatWidgetService.getWidgetBySessionResource(session.resource)) {
			return;
		}
		const setting = status === SessionStatus.NeedsInput
			? ChatConfiguration.NotifyWindowOnConfirmation
			: ChatConfiguration.NotifyWindowOnResponseReceived;
		const mode = this._configurationService.getValue<ChatNotificationMode>(setting);
		if (mode === ChatNotificationMode.Off || (mode !== ChatNotificationMode.Always && this._hostService.hasFocus)) {
			return;
		}

		const cts = new CancellationTokenSource();
		this._activeNotifications.set(session.resource, toDisposable(() => cts.dispose(true)));

		try {
			// This notifier only ever runs for a session this window does not display,
			// so it always yields to a window that does. Without the delay it would win
			// native deduplication and the toast would open the wrong window.
			await timeout(this._getBackgroundNotificationDelay());
			if (cts.token.isCancellationRequested || session.status.get() !== status
				|| this._chatService.getSession(session.resource) || this._chatWidgetService.getWidgetBySessionResource(session.resource)) {
				return;
			}
			if (!this._hostService.hasFocus) {
				await this._hostService.focus(mainWindow, { mode: FocusMode.Notify });
			}
			if (cts.token.isCancellationRequested) {
				return;
			}

			const result = await this._hostService.showToast({
				title: this._sanitizeOSToastText(localize('sessions.notification.title', "Session: {0}", session.title.get())),
				body: this._sanitizeOSToastText(this._getNotificationBody(session, status)),
				actions: [localize('sessions.notification.openSession', "Open Session")],
				dedupeKey: getChatNotificationDedupeKey(session.resource, status === SessionStatus.NeedsInput ? ChatNotificationKind.NeedsInput : ChatNotificationKind.Idle),
			}, cts.token);

			if (result.clicked || typeof result.actionIndex === 'number') {
				await this._hostService.focus(mainWindow, { mode: FocusMode.Force });
				await this._sessionsService.openSession(session.resource, { source: 'notification' });
			}
		} finally {
			if (!cts.token.isCancellationRequested) {
				this._clearNotification(session);
			}
		}
	}

	private _getNotificationBody(session: ISession, status: SessionStatus): string {
		const workspaceLabel = session.workspace.get()?.label;
		switch (status) {
			case SessionStatus.NeedsInput:
				return workspaceLabel
					? localize('sessions.notification.needsInputWithWorkspace', "Input needed in {0}.", workspaceLabel)
					: localize('sessions.notification.needsInput', "Input needed.");
			case SessionStatus.Completed:
				return workspaceLabel
					? localize('sessions.notification.completedWithWorkspace', "Completed in {0}.", workspaceLabel)
					: localize('sessions.notification.completed', "Session completed.");
			case SessionStatus.Error:
				return workspaceLabel
					? localize('sessions.notification.failedWithWorkspace', "Failed in {0}.", workspaceLabel)
					: localize('sessions.notification.failed', "Session failed.");
			default:
				return '';
		}
	}

	private _sanitizeOSToastText(text: string): string {
		return text.replace(/`/g, '\'');
	}

	private _clearNotification(session: ISession): void {
		this._activeNotifications.deleteAndDispose(session.resource);
	}
}
