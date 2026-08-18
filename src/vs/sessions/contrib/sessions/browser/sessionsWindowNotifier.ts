/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableResourceMap, toDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatConfiguration, ChatNotificationMode } from '../../../../workbench/contrib/chat/common/constants.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionsWindowNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWindowNotifier';

	private readonly _statuses = new Map<string, SessionStatus>();
	private readonly _activeNotifications = this._register(new DisposableResourceMap());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IHostService private readonly _hostService: IHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		for (const session of this._sessionsManagementService.getSessions()) {
			this._statuses.set(session.sessionId, session.status.get());
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this._statuses.delete(session.sessionId);
				this._clearNotification(session);
			}
			for (const session of event.added) {
				this._statuses.set(session.sessionId, session.status.get());
			}
			for (const session of event.changed) {
				this._handleStatusChange(session);
			}
		}));
	}

	private _handleStatusChange(session: ISession): void {
		const previousStatus = this._statuses.get(session.sessionId);
		const status = session.status.get();
		this._statuses.set(session.sessionId, status);

		if (previousStatus === undefined || previousStatus === status) {
			return;
		}

		this._clearNotification(session);
		if (status === SessionStatus.NeedsInput || status === SessionStatus.Completed || status === SessionStatus.Error) {
			void this._notify(session, status);
		}
	}

	private async _notify(session: ISession, status: SessionStatus): Promise<void> {
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
			}, cts.token);

			if (result.clicked || typeof result.actionIndex === 'number') {
				await this._hostService.focus(mainWindow, { mode: FocusMode.Force });
				await this._sessionsService.openSession(session.resource);
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
