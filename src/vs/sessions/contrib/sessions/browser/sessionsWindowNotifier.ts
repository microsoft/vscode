/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, autorunDelta, observableSignalFromEvent } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatNotificationKind, getChatNotificationDedupeKey, getChatNotificationResource } from '../../../../workbench/contrib/chat/common/chatNotification.js';
import { ChatConfiguration, ChatNotificationMode } from '../../../../workbench/contrib/chat/common/constants.js';
import { IHostService } from '../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IFocusedSessionHostService } from '../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionComparisonService } from '../../../services/sessions/common/sessionComparison.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export class SessionsWindowNotifier extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsWindowNotifier';

	private readonly _statusListeners = this._register(new DisposableMap<string>());
	private readonly _chatStatusListeners = this._register(new DisposableMap<ISession, DisposableMap<IChat>>());
	private readonly _activeNotifications = this._register(new DisposableResourceMap());

	constructor(
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IFocusedSessionHostService private readonly _focusedSessionHostService: IFocusedSessionHostService,
		@IHostService private readonly _hostService: IHostService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatService private readonly _chatService: IChatService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ISessionComparisonService private readonly _sessionComparisonService: ISessionComparisonService,
	) {
		super();

		for (const session of this._sessionsManagementService.getSessions()) {
			this._trackSession(session);
		}

		this._register(this._sessionsManagementService.onDidChangeSessions(event => {
			for (const session of event.removed) {
				this._statusListeners.deleteAndDispose(session.sessionId);
				this._clearNotification(session.resource);
			}
			for (const session of event.added) {
				this._trackSession(session);
			}
		}));
		const sessionsChanged = observableSignalFromEvent(this, this._sessionsManagementService.onDidChangeSessions);
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			const tracked = new Set<ISession>();
			for (const comparison of this._sessionComparisonService.comparisons.read(reader)) {
				if (comparison.archivedAt !== undefined) {
					continue;
				}
				for (const participant of comparison.participants) {
					if (!participant.sessionResource || !participant.chatResource) {
						continue;
					}
					const session = this._sessionsManagementService.getSession(participant.sessionResource);
					if (!session || tracked.has(session)) {
						continue;
					}
					tracked.add(session);
					let listeners = this._chatStatusListeners.get(session);
					if (!listeners) {
						this._chatStatusListeners.set(session, listeners = new DisposableMap<IChat>());
					}
					// Replacing aggregate notifications must cover ordinary peers as well as comparison participants.
					const chats = new Set(session.chats.read(reader));
					for (const chat of chats) {
						if (!listeners.has(chat)) {
							listeners.set(chat, this._createStatusListener(session, chat));
						}
					}
					for (const chat of listeners.keys()) {
						if (!chats.has(chat)) {
							listeners.deleteAndDispose(chat);
						}
					}
				}
			}
			for (const session of this._chatStatusListeners.keys()) {
				if (!tracked.has(session)) {
					this._chatStatusListeners.deleteAndDispose(session);
				}
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
		this._statusListeners.set(session.sessionId, this._createStatusListener(session));
	}

	private _createStatusListener(session: ISession, chat?: IChat): DisposableStore {
		const store = new DisposableStore();
		const resource = chat?.resource ?? session.resource;
		store.add(toDisposable(() => this._clearNotification(resource)));
		const completedNotificationScheduler = store.add(new RunOnceScheduler(() => void this._notify(session, SessionStatus.Completed, chat), this._getCompletedNotificationDelay()));
		store.add(autorunDelta((chat ?? session).status, ({ lastValue, newValue }) => {
			if (lastValue === undefined || lastValue === newValue
				|| (!chat && this._hasChatStatusListeners(session))) {
				return;
			}

			this._clearNotification(resource);
			if (newValue === SessionStatus.Completed) {
				completedNotificationScheduler.schedule();
			} else {
				completedNotificationScheduler.cancel();
			}
			if (newValue === SessionStatus.NeedsInput || newValue === SessionStatus.Error) {
				void this._notify(session, newValue, chat);
			}
		}));
		return store;
	}

	private async _notify(session: ISession, status: SessionStatus, chat?: IChat): Promise<void> {
		if ((chat ?? session).status.get() !== status || (!chat && this._hasChatStatusListeners(session))) {
			return;
		}
		const resource = chat?.resource ?? session.resource;
		const setting = status === SessionStatus.NeedsInput
			? ChatConfiguration.NotifyWindowOnConfirmation
			: ChatConfiguration.NotifyWindowOnResponseReceived;
		const mode = this._configurationService.getValue<ChatNotificationMode>(setting);
		const notifyForInactivePane = this._shouldNotifyForInactivePane(session, status, mode, chat);
		if (this._isCoveredByChatNotifier(resource, status) && !notifyForInactivePane) {
			return;
		}
		if (mode === ChatNotificationMode.Off || (mode !== ChatNotificationMode.Always && this._hostService.hasFocus && !notifyForInactivePane)) {
			return;
		}

		const cts = new CancellationTokenSource();
		this._activeNotifications.set(resource, toDisposable(() => cts.dispose(true)));

		try {
			// This notifier only ever runs for a session this window does not display,
			// so it always yields to a window that does. Without the delay it would win
			// native deduplication and the toast would open the wrong window.
			await timeout(this._getBackgroundNotificationDelay());
			const notifyForInactivePane = this._shouldNotifyForInactivePane(session, status, mode, chat);
			if (cts.token.isCancellationRequested || (chat ?? session).status.get() !== status
				|| !chat && this._hasChatStatusListeners(session)
				|| this._isCoveredByChatNotifier(resource, status) && !notifyForInactivePane
				|| mode !== ChatNotificationMode.Always && this._hostService.hasFocus && !notifyForInactivePane) {
				return;
			}
			if (!this._hostService.hasFocus) {
				await this._hostService.focus(mainWindow, { mode: FocusMode.Notify });
			}
			if (cts.token.isCancellationRequested) {
				return;
			}

			const result = await this._hostService.showToast({
				title: this._sanitizeOSToastText(localize('sessions.notification.title', "Session: {0}", (chat ?? session).title.get())),
				body: this._sanitizeOSToastText(this._getNotificationBody(chat ?? session, status)),
				actions: [localize('sessions.notification.openSession', "Open Session")],
				dedupeKey: getChatNotificationDedupeKey(resource, status === SessionStatus.NeedsInput ? ChatNotificationKind.NeedsInput : ChatNotificationKind.Idle),
			}, cts.token);

			if (result.clicked || typeof result.actionIndex === 'number') {
				await this._hostService.focus(mainWindow, { mode: FocusMode.Force });
				if (chat) {
					await this._sessionsService.openChat(session, chat.resource, { source: 'notification' });
				} else {
					await this._sessionsService.openSession(session.resource, { source: 'notification' });
				}
			}
		} finally {
			if (!cts.token.isCancellationRequested) {
				this._clearNotification(resource);
			}
		}
	}

	private _hasChatStatusListeners(session: ISession): boolean {
		const listeners = this._chatStatusListeners.get(session);
		if (!listeners) {
			return false;
		}
		const chats = session.chats.get();
		return chats.length > 0 && chats.every(chat => listeners.has(chat));
	}

	private _isCoveredByChatNotifier(resource: URI, status: SessionStatus): boolean {
		const models = [
			this._chatService.getSession(resource),
			...[...this._chatService.chatModels.get()].filter(model => isEqual(getChatNotificationResource(model), resource)),
		];
		if (status === SessionStatus.NeedsInput) {
			return models.some(model => !!model?.requestNeedsInput.get());
		}
		return models.some(model => !!model) || !!this._chatWidgetService.getWidgetBySessionResource(resource);
	}

	private _shouldNotifyForInactivePane(session: ISession, status: SessionStatus, mode: ChatNotificationMode, chat?: IChat): boolean {
		if (status !== SessionStatus.NeedsInput || mode !== ChatNotificationMode.WindowNotFocused || !this._hostService.hasFocus) {
			return false;
		}
		const visibleSessions = this._sessionsService.visibleSessionPanes.get();
		const focusedHost = this._focusedSessionHostService.focusedHost.get();
		const activeSession = focusedHost.session.get();
		const activeChat = focusedHost.chat.get();
		return visibleSessions.length > 1
			&& visibleSessions.some(candidate => candidate?.sessionId === session.sessionId && (!chat || isEqual(candidate.activeChat.get().resource, chat.resource)))
			&& (chat ? !isEqual(activeChat?.resource, chat.resource) : activeSession?.sessionId !== session.sessionId)
			&& !!activeSession
			&& this._sessionComparisonService.comparisons.get().some(comparison => comparison.archivedAt === undefined
				&& comparison.participants.some(participant => isEqual(participant.sessionResource, session.resource)
					&& (!participant.chatResource || isEqual(participant.chatResource, chat?.resource ?? session.mainChat.get().resource)))
				&& comparison.participants.some(participant => isEqual(participant.sessionResource, activeSession.resource)
					&& (!participant.chatResource || isEqual(participant.chatResource, (activeChat ?? activeSession.mainChat.get()).resource))));
	}

	private _getNotificationBody(session: ISession | IChat, status: SessionStatus): string {
		const workspaceLabel = session.workspace.get()?.label;
		switch (status) {
			case SessionStatus.NeedsInput:
				return workspaceLabel
					? localize('sessions.notification.needsInputWithWorkspace', "Attention needed in {0}.", workspaceLabel)
					: localize('sessions.notification.needsInput', "Attention needed.");
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

	private _clearNotification(resource: URI): void {
		this._activeNotifications.deleteAndDispose(resource);
	}
}
