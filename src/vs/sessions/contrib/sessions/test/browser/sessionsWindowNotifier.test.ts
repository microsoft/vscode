/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FocusMode } from '../../../../../platform/native/common/native.js';
import { ChatConfiguration, ChatNotificationMode } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { IHostService, IToastOptions, IToastResult } from '../../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonService } from '../../../../services/sessions/common/sessionComparison.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionsWindowNotifier } from '../../browser/sessionsWindowNotifier.js';

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions = new Emitter<ISessionsChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;

	constructor(private readonly _sessions: ISession[]) {
		super();
	}

	override getSessions(): ISession[] {
		return this._sessions;
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

class TestSessionsService extends mock<ISessionsService>() {

	readonly opened: URI[] = [];
	override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', undefined);
	override readonly visibleSessions = observableValue<readonly IActiveSession[]>('visibleSessions', []);

	override async openSession(sessionResource: URI): Promise<void> {
		this.opened.push(sessionResource);
	}
}

class TestHostService extends mock<IHostService>() {

	override readonly onDidChangeFocus = Event.None;
	override readonly onDidChangeActiveWindow = Event.None;
	override readonly onDidChangeFullScreen = Event.None;
	readonly toasts: IToastOptions[] = [];
	readonly focusModes: (FocusMode | undefined)[] = [];
	override hasFocus = false;
	toastResult: IToastResult = { supported: true, clicked: false };

	override async focus(_targetWindow: Window, options?: { mode?: FocusMode }): Promise<void> {
		this.focusModes.push(options?.mode);
	}

	override async hadLastFocus(): Promise<boolean> {
		return true;
	}

	override async showToast(options: IToastOptions, _token: CancellationToken): Promise<IToastResult> {
		this.toasts.push(options);
		return this.toastResult;
	}
}

class TestChatService extends mock<IChatService>() {
	model: IChatModel | undefined;

	override getSession(_resource: URI): IChatModel | undefined {
		return this.model;
	}
}

class TestChatWidgetService extends mock<IChatWidgetService>() {
	override getWidgetBySessionResource(_resource: URI) {
		return undefined;
	}
}

function createSession(id: string, initialStatus: SessionStatus, workspaceLabel = 'vscode'): { session: ISession; status: ReturnType<typeof observableValue<SessionStatus>> } {
	const status = observableValue<SessionStatus>(`status-${id}`, initialStatus);
	const session = new class extends mock<ISession>() {
		override readonly sessionId = id;
		override readonly resource = URI.parse(`test:///${id}`);
		override readonly title = observableValue(`title-${id}`, `Fix ${id}`);
		override readonly status = status;
		override readonly workspace = observableValue<ISessionWorkspace | undefined>(`workspace-${id}`, new class extends mock<ISessionWorkspace>() {
			override readonly label = workspaceLabel;
		});
	};
	return { session, status };
}

function comparisonService(...sessions: ISession[]): ISessionComparisonService {
	const comparison = upcastPartial<ISessionComparison>({ id: 'comparison' });
	const resources = new Set(sessions.map(session => session.resource.toString()));
	return new class extends mock<ISessionComparisonService>() {
		override getComparisonForSession(resource: URI): ISessionComparison | undefined {
			return resources.has(resource.toString()) ? comparison : undefined;
		}
	};
}

suite('SessionsWindowNotifier', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestSessionsWindowNotifier extends SessionsWindowNotifier {
		protected override _getCompletedNotificationDelay(): number {
			return 0;
		}

		protected override _getBackgroundNotificationDelay(): number {
			return 0;
		}
	}

	function createNotifier(
		session: ISession,
		configuration: Record<string, ChatNotificationMode>,
	): { notifier: SessionsWindowNotifier; sessions: TestSessionsService; host: TestHostService } {
		const management = new TestSessionsManagementService([session]);
		const sessions = new TestSessionsService();
		const host = new TestHostService();
		const chat = new TestChatService();
		const widgets = new TestChatWidgetService();
		const notifier = store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			host,
			new TestConfigurationService(configuration),
			chat,
			widgets,
			comparisonService(),
		));
		store.add(management);
		return { notifier, sessions, host };
	}

	/**
	 * Drains the chained zero-delay timers a notification passes through: the
	 * completed-status debounce and the background-window delay.
	 */
	async function flushNotifications(): Promise<void> {
		await timeout(0);
		await timeout(0);
		await timeout(0);
	}

	test('uses confirmation setting for needs-input transitions', async () => {
		const { session, status } = createSession('needs-input', SessionStatus.InProgress);
		const { host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
		});

		status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();

		assert.deepStrictEqual({
			toasts: host.toasts,
			focusModes: host.focusModes,
		}, {
			toasts: [{
				title: 'Session: Fix needs-input',
				body: 'Input needed in vscode.',
				actions: ['Open Session'],
				dedupeKey: 'chat-session:test:/needs-input:needsInput',
			}],
			focusModes: [FocusMode.Notify],
		});
	});

	test('uses response setting for completed and failed transitions', async () => {
		const { session, status } = createSession('finished', SessionStatus.InProgress);
		const { host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.Always,
		});
		host.hasFocus = true;

		status.set(SessionStatus.Completed, undefined);
		await flushNotifications();
		status.set(SessionStatus.InProgress, undefined);
		status.set(SessionStatus.Error, undefined);
		await flushNotifications();

		assert.deepStrictEqual(host.toasts.map(toast => toast.body), [
			'Completed in vscode.',
			'Failed in vscode.',
		]);
	});

	test('does not notify for initial or duplicate state and respects focus', async () => {
		const { session, status } = createSession('quiet', SessionStatus.NeedsInput);
		const { host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
		});
		host.hasFocus = true;

		status.set(SessionStatus.InProgress, undefined);
		status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();

		assert.deepStrictEqual(host.toasts, []);
	});

	test('opens the exact session when the toast is activated', async () => {
		const { session, status } = createSession('open-me', SessionStatus.InProgress);
		const { sessions, host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.WindowNotFocused,
		});
		host.toastResult = { supported: true, clicked: true };

		status.set(SessionStatus.Completed, undefined);
		await flushNotifications();

		assert.deepStrictEqual({
			opened: sessions.opened.map(resource => resource.toString()),
			focusModes: host.focusModes,
		}, {
			opened: ['test:/open-me'],
			focusModes: [FocusMode.Notify, FocusMode.Force],
		});
	});

	test('debounces completion notifications until the session stays completed', async () => {
		const { session, status } = createSession('debounced', SessionStatus.InProgress);
		const { host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.Always,
		});

		status.set(SessionStatus.Completed, undefined);
		status.set(SessionStatus.InProgress, undefined);
		await flushNotifications();
		status.set(SessionStatus.Completed, undefined);
		await flushNotifications();

		assert.deepStrictEqual(host.toasts.map(toast => toast.body), [
			'Completed in vscode.',
		]);
	});

	test('notifies for a question waiting in an inactive visible pane while the window is focused', async () => {
		const active = createSession('active', SessionStatus.InProgress);
		const waiting = createSession('waiting', SessionStatus.InProgress);
		const management = new TestSessionsManagementService([waiting.session]);
		const sessions = new TestSessionsService();
		sessions.activeSession.set(active.session as IActiveSession, undefined);
		sessions.visibleSessions.set([active.session as IActiveSession, waiting.session as IActiveSession], undefined);
		const host = new TestHostService();
		host.hasFocus = true;
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() {
			override readonly requestNeedsInput = observableValue('requestNeedsInput', { title: 'Fix waiting' });
		};
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			host,
			new TestConfigurationService({
				[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
			}),
			chat,
			new TestChatWidgetService(),
			comparisonService(active.session, waiting.session),
		));
		store.add(management);

		waiting.status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();

		assert.deepStrictEqual({
			toasts: host.toasts.map(toast => toast.dedupeKey),
			focusModes: host.focusModes,
		}, {
			toasts: ['chat-session:test:/waiting:needsInput'],
			focusModes: [],
		});
	});

	test('does not notify an inactive ordinary pane while the window is focused', async () => {
		const active = createSession('ordinary-active', SessionStatus.InProgress);
		const waiting = createSession('ordinary-waiting', SessionStatus.InProgress);
		const management = new TestSessionsManagementService([waiting.session]);
		const sessions = new TestSessionsService();
		sessions.activeSession.set(active.session as IActiveSession, undefined);
		sessions.visibleSessions.set([active.session as IActiveSession, waiting.session as IActiveSession], undefined);
		const host = new TestHostService();
		host.hasFocus = true;
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() {
			override readonly requestNeedsInput = observableValue('requestNeedsInput', { title: 'Fix waiting' });
		};
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			host,
			new TestConfigurationService({
				[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
			}),
			chat,
			new TestChatWidgetService(),
			comparisonService(),
		));
		store.add(management);

		waiting.status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();

		assert.deepStrictEqual(host.toasts, []);
	});

	test('falls back to session status when a live model misses its needs-input state', async () => {
		const { session, status } = createSession('missing-model-state', SessionStatus.InProgress);
		const management = new TestSessionsManagementService([session]);
		const sessions = new TestSessionsService();
		const host = new TestHostService();
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() {
			override readonly requestNeedsInput = observableValue('requestNeedsInput', undefined);
		};
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			host,
			new TestConfigurationService({
				[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
			}),
			chat,
			new TestChatWidgetService(),
			comparisonService(),
		));
		store.add(management);

		status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();

		assert.deepStrictEqual(host.toasts.map(toast => toast.dedupeKey), [
			'chat-session:test:/missing-model-state:needsInput',
		]);
	});

	test('stays silent when a live chat model exists for the session', async () => {
		const { session, status } = createSession('live-model', SessionStatus.InProgress);
		const management = new TestSessionsManagementService([session]);
		const sessions = new TestSessionsService();
		const host = new TestHostService();
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() { };
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			host,
			new TestConfigurationService({
				[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.Always,
			}),
			chat,
			new TestChatWidgetService(),
			comparisonService(),
		));
		store.add(management);

		status.set(SessionStatus.Completed, undefined);
		await flushNotifications();

		assert.deepStrictEqual(host.toasts, []);
	});
});
