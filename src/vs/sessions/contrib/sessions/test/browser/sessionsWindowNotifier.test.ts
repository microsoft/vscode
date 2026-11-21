/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FocusMode } from '../../../../../platform/native/common/native.js';
import { ChatConfiguration, ChatNotificationMode } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatWindowNotifier } from '../../../../../workbench/contrib/chat/browser/chatWindowNotifier.js';
import { setChatNotificationResource } from '../../../../../workbench/contrib/chat/common/chatNotification.js';
import { IHostService, IToastOptions, IToastResult } from '../../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionComparison, ISessionComparisonParticipant, ISessionComparisonService } from '../../../../../workbench/contrib/sessions/common/sessionComparison.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { SessionsWindowNotifier } from '../../browser/sessionsWindowNotifier.js';
import { focusedSessionHostServiceOf, ITestSessionWithChat, testGridPanes } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

class TestSessionsManagementService extends mock<ISessionsManagementService>() {

	private readonly _onDidChangeSessions = new Emitter<ISessionsChangeEvent>();
	override readonly onDidChangeSessions = this._onDidChangeSessions.event;

	constructor(private readonly _sessions: ISession[]) {
		super();
	}

	override getSessions(): ISession[] {
		return this._sessions;
	}

	override getSession(resource: URI): ISession | undefined {
		return this._sessions.find(session => session.resource.toString() === resource.toString());
	}

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

class TestSessionsService extends mock<ISessionsService>() {

	readonly opened: URI[] = [];
	readonly activeSession = observableValue<ITestSessionWithChat | undefined>('activeSession', undefined);
	readonly gridShown = observableValue<readonly ITestSessionWithChat[]>('visibleSessions', []);
	override readonly slotPanes = testGridPanes(this.gridShown);
	override readonly panes = testGridPanes(this.gridShown);

	override async openSession(sessionResource: URI): Promise<void> {
		this.opened.push(sessionResource);
	}

	override async openChat(_session: ISession, chatResource: URI): Promise<void> {
		this.opened.push(chatResource);
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
	override readonly chatModels = observableValue<readonly IChatModel[]>('chatModels', []);

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
		override readonly chats = constObservable<readonly IChat[]>([]);
		override readonly workspace = observableValue<ISessionWorkspace | undefined>(`workspace-${id}`, new class extends mock<ISessionWorkspace>() {
			override readonly label = workspaceLabel;
		});
	};
	return { session, status };
}

function comparisonService(...sessions: ISession[]): ISessionComparisonService {
	const comparison = upcastPartial<ISessionComparison>({ id: 'comparison', participants: sessions.map(session => upcastPartial<ISessionComparisonParticipant>({ sessionResource: session.resource })) });
	const resources = new Set(sessions.map(session => session.resource.toString()));
	return new class extends mock<ISessionComparisonService>() {
		override readonly comparisons = constObservable<readonly ISessionComparison[]>([comparison]);
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
		comparisons = comparisonService(),
	): { notifier: SessionsWindowNotifier; sessions: TestSessionsService; host: TestHostService } {
		const management = new TestSessionsManagementService([session]);
		const sessions = new TestSessionsService();
		const host = new TestHostService();
		const chat = new TestChatService();
		const widgets = new TestChatWidgetService();
		const notifier = store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			focusedSessionHostServiceOf(sessions.activeSession),
			host,
			new TestConfigurationService(configuration),
			chat,
			widgets,
			comparisons,
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
				body: 'Attention needed in vscode.',
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
		sessions.activeSession.set(active.session as ITestSessionWithChat, undefined);
		sessions.gridShown.set([active.session as ITestSessionWithChat, waiting.session as ITestSessionWithChat], undefined);
		const host = new TestHostService();
		host.hasFocus = true;
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() {
			override readonly requestNeedsInput = observableValue('requestNeedsInput', { title: 'Fix waiting' });
		};
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			focusedSessionHostServiceOf(sessions.activeSession),
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

	test('notifies and opens each inactive nested attempt without relying on parent status changes', async () => {
		const base = createSession('parent', SessionStatus.InProgress);
		const chats = ['active', 'waiting-one', 'waiting-two'].map(id => ({
			resource: URI.parse(`test:/parent#${id}`),
			status: observableValue(id, SessionStatus.InProgress),
			title: constObservable(id),
			workspace: base.session.workspace,
		}));
		const parent = upcastPartial<ISession>({ resource: base.session.resource, sessionId: 'parent', status: base.status, chats: constObservable(chats.map(chat => upcastPartial<IChat>(chat))) });
		const management = store.add(new TestSessionsManagementService([parent]));
		const sessions = new TestSessionsService();
		const panes = chats.map(chat => upcastPartial<ITestSessionWithChat>({ resource: parent.resource, sessionId: parent.sessionId, activeChat: constObservable(upcastPartial<IChat>(chat)) }));
		sessions.activeSession.set(panes[0], undefined);
		sessions.gridShown.set(panes, undefined);
		const comparison = upcastPartial<ISessionComparison>({
			id: 'comparison', sessionResource: parent.resource,
			participants: chats.map(chat => upcastPartial<ISessionComparison['participants'][number]>({ sessionResource: parent.resource, chatResource: chat.resource })),
		});
		const host = new TestHostService();
		host.hasFocus = true;
		host.toastResult = { supported: true, clicked: true };
		const chatService = new TestChatService();
		chatService.model = upcastPartial<IChatModel>({ requestNeedsInput: constObservable({ title: 'Question' }) });
		store.add(new TestSessionsWindowNotifier(
			management, sessions, focusedSessionHostServiceOf(sessions.activeSession), host,
			new TestConfigurationService({ [ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused }),
			chatService, new TestChatWidgetService(),
			new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = constObservable([comparison]);
				override getComparisonForSession(): ISessionComparison { return comparison; }
			}(),
		));
		for (const chat of chats.slice(1)) {
			chat.status.set(SessionStatus.NeedsInput, undefined);
			await flushNotifications();
		}
		chats[0].status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();
		assert.deepStrictEqual({
			toasts: host.toasts.map(toast => toast.dedupeKey),
			opened: sessions.opened.map(resource => resource.toString()),
			parentStatus: base.status.get(),
		}, {
			toasts: ['chat-session:test:/parent#waiting-one:needsInput', 'chat-session:test:/parent#waiting-two:needsInput'],
			opened: ['test:/parent#waiting-one', 'test:/parent#waiting-two'],
			parentStatus: SessionStatus.InProgress,
		});
	});

	for (const existingPeer of [true, false]) {
		test(`notifies ordinary peers ${existingPeer ? 'already present when a comparison arrives' : 'added after comparison tracking starts'}`, async () => {
			const base = createSession('parent', SessionStatus.InProgress);
			const attempt = upcastPartial<IChat>({
				resource: URI.parse('test:/parent#attempt'), status: constObservable(SessionStatus.InProgress),
			});
			const peerStatus = observableValue('peerStatus', SessionStatus.InProgress);
			const peer = upcastPartial<IChat>({
				resource: URI.parse('test:/parent#peer'), status: peerStatus,
				title: constObservable('Ordinary peer'), workspace: base.session.workspace,
			});
			const chats = observableValue<readonly IChat[]>('chats', existingPeer ? [attempt, peer] : [attempt]);
			const parent = upcastPartial<ISession>({ ...base.session, chats });
			const comparison = upcastPartial<ISessionComparison>({
				id: 'comparison',
				participants: [upcastPartial<ISessionComparison['participants'][number]>({ id: 'attempt', sessionResource: parent.resource, chatResource: attempt.resource })],
			});
			const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', existingPeer ? [] : [comparison]);
			const { host, sessions } = createNotifier(parent, {
				[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
				[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.WindowNotFocused,
			}, new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = comparisons;
				override getComparisonForSession(): ISessionComparison | undefined { return comparisons.get()[0]; }
			}());
			host.toastResult = { supported: true, clicked: true };
			transaction(tx => {
				comparisons.set([comparison], tx);
				chats.set([attempt, peer], tx);
			});
			for (const status of [SessionStatus.NeedsInput, SessionStatus.Error, SessionStatus.Completed]) {
				transaction(tx => {
					peerStatus.set(status, tx);
					base.status.set(status, tx);
				});
				await flushNotifications();
			}
			const notified = host.toasts.map(toast => ({ body: toast.body, dedupeKey: toast.dedupeKey }));
			host.hasFocus = true;
			const panes = [attempt, peer].map(chat => upcastPartial<ITestSessionWithChat>({
				sessionId: parent.sessionId, resource: parent.resource, activeChat: constObservable(chat),
			}));
			sessions.gridShown.set(panes, undefined);
			sessions.activeSession.set(panes[0], undefined);
			peerStatus.set(SessionStatus.NeedsInput, undefined);
			await flushNotifications();
			const afterFocus = host.toasts.length;
			host.hasFocus = false;
			chats.set([attempt], undefined);
			peerStatus.set(SessionStatus.Error, undefined);
			await flushNotifications();
			assert.deepStrictEqual({
				notified,
				opened: sessions.opened.map(resource => resource.toString()),
				afterFocus,
				afterRemoval: host.toasts.length,
			}, {
				notified: [
					{ body: 'Attention needed in vscode.', dedupeKey: 'chat-session:test:/parent#peer:needsInput' },
					{ body: 'Failed in vscode.', dedupeKey: 'chat-session:test:/parent#peer:idle' },
					{ body: 'Completed in vscode.', dedupeKey: 'chat-session:test:/parent#peer:idle' },
				],
				opened: Array(3).fill('test:/parent#peer'),
				afterFocus: 3,
				afterRemoval: 3,
			});
		});
	}

	test('preserves aggregate notifications until comparison chats are available and suppresses queued duplicates', async () => {
		const base = createSession('unhydrated', SessionStatus.InProgress);
		const chats = observableValue<readonly IChat[]>('chats', []);
		const session = upcastPartial<ISession>({ ...base.session, chats });
		const chatResource = session.resource.with({ fragment: 'attempt' });
		const comparison = upcastPartial<ISessionComparison>({
			id: 'comparison',
			participants: [upcastPartial<ISessionComparison['participants'][number]>({ id: 'attempt', sessionResource: session.resource, chatResource })],
		});
		const { host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
			[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.WindowNotFocused,
		}, new class extends mock<ISessionComparisonService>() {
			override readonly comparisons = constObservable([comparison]);
			override getComparisonForSession(): ISessionComparison { return comparison; }
		}());
		base.status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();
		base.status.set(SessionStatus.Completed, undefined);
		chats.set([upcastPartial<IChat>({ resource: chatResource, status: constObservable(SessionStatus.Completed) })], undefined);
		await flushNotifications();
		assert.deepStrictEqual(host.toasts.map(toast => toast.dedupeKey), ['chat-session:test:/unhydrated:needsInput']);
	});

	test('does not notify an inactive ordinary pane while the window is focused', async () => {
		const active = createSession('ordinary-active', SessionStatus.InProgress);
		const waiting = createSession('ordinary-waiting', SessionStatus.InProgress);
		const management = new TestSessionsManagementService([waiting.session]);
		const sessions = new TestSessionsService();
		sessions.activeSession.set(active.session as ITestSessionWithChat, undefined);
		sessions.gridShown.set([active.session as ITestSessionWithChat, waiting.session as ITestSessionWithChat], undefined);
		const host = new TestHostService();
		host.hasFocus = true;
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() {
			override readonly requestNeedsInput = observableValue('requestNeedsInput', { title: 'Fix waiting' });
		};
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			focusedSessionHostServiceOf(sessions.activeSession),
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

	test('does not notify an inactive pane of an archived comparison while the window is focused', async () => {
		const active = createSession('archived-active', SessionStatus.InProgress);
		const waiting = createSession('archived-waiting', SessionStatus.InProgress);
		const management = new TestSessionsManagementService([waiting.session]);
		const sessions = new TestSessionsService();
		sessions.activeSession.set(active.session as ITestSessionWithChat, undefined);
		sessions.gridShown.set([active.session as ITestSessionWithChat, waiting.session as ITestSessionWithChat], undefined);
		const host = new TestHostService();
		host.hasFocus = true;
		const chat = new TestChatService();
		chat.model = new class extends mock<IChatModel>() {
			override readonly requestNeedsInput = observableValue('requestNeedsInput', { title: 'Fix waiting' });
		};
		store.add(new TestSessionsWindowNotifier(
			management,
			sessions,
			focusedSessionHostServiceOf(sessions.activeSession),
			host,
			new TestConfigurationService({
				[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
			}),
			chat,
			new TestChatWidgetService(),
			new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = constObservable<readonly ISessionComparison[]>([]);
				override getComparisonForSession(): ISessionComparison | undefined {
					return upcastPartial<ISessionComparison>({ id: 'comparison', archivedAt: 1, participants: [] });
				}
			},
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
			focusedSessionHostServiceOf(sessions.activeSession),
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

	test('tracks ordinary chats alongside participants and restores aggregate fallback for archived comparisons', async () => {
		const base = createSession('parent', SessionStatus.InProgress);
		const makeChat = (id: string) => ({
			resource: base.session.resource.with({ fragment: id }), status: observableValue(id, SessionStatus.InProgress),
			title: constObservable(id), workspace: base.session.workspace,
		});
		const participant = makeChat('attempt');
		const ordinary = makeChat('ordinary');
		const added = makeChat('added');
		const chats = observableValue<readonly IChat[]>('chats', [upcastPartial<IChat>(participant), upcastPartial<IChat>(ordinary)]);
		const parent = upcastPartial<ISession>({ ...base.session, resource: base.session.resource, sessionId: 'parent', status: base.status, title: base.session.title, workspace: base.session.workspace, chats });
		const comparison = upcastPartial<ISessionComparison>({
			id: 'comparison', participants: [upcastPartial<ISessionComparisonParticipant>({ sessionResource: parent.resource, chatResource: participant.resource })],
		});
		const comparisons = observableValue<readonly ISessionComparison[]>('comparisons', [comparison]);
		const host = new TestHostService();
		const sessions = new TestSessionsService();
		host.toastResult = { supported: true, clicked: true };
		store.add(new TestSessionsWindowNotifier(
			store.add(new TestSessionsManagementService([parent])), sessions, focusedSessionHostServiceOf(sessions.activeSession), host,
			new TestConfigurationService({
				[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.Always,
				[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.Always,
			}), new TestChatService(), new TestChatWidgetService(),
			new class extends mock<ISessionComparisonService>() { override readonly comparisons = comparisons; }(),
		));
		chats.set([...chats.get(), upcastPartial<IChat>(added)], undefined);
		for (const chat of [ordinary, added]) {
			for (const status of [SessionStatus.NeedsInput, SessionStatus.Error, SessionStatus.Completed]) {
				chat.status.set(status, undefined);
				await flushNotifications();
			}
		}
		comparisons.set([{ ...comparison, archivedAt: 1 }], undefined);
		base.status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();
		assert.deepStrictEqual(sessions.opened.map(resource => resource.toString()), [
			...Array(3).fill(ordinary.resource.toString()), ...Array(3).fill(added.resource.toString()), parent.resource.toString(),
		]);
	});

	test('notifies exact participants sharing a comparison even when an owner prefers another comparison', async () => {
		const active = createSession('active', SessionStatus.InProgress);
		const waiting = createSession('destination', SessionStatus.InProgress);
		const activeChat = upcastPartial<IChat>({ resource: active.session.resource });
		const waitingChat = upcastPartial<IChat>({ resource: waiting.session.resource.with({ fragment: 'moved' }), status: waiting.status, title: waiting.session.title, workspace: waiting.session.workspace });
		const parent = upcastPartial<ISession>({ resource: waiting.session.resource, sessionId: 'destination', chats: constObservable([waitingChat]), status: constObservable(SessionStatus.InProgress) });
		const a = upcastPartial<ISessionComparison>({
			id: 'a', participants: [
				upcastPartial<ISessionComparisonParticipant>({ sessionResource: active.session.resource, chatResource: activeChat.resource }),
				upcastPartial<ISessionComparisonParticipant>({ sessionResource: parent.resource, chatResource: waitingChat.resource }),
			],
		});
		const b = upcastPartial<ISessionComparison>({ id: 'b', sessionResource: parent.resource, participants: [] });
		const sessions = new TestSessionsService();
		const activePane = upcastPartial<ITestSessionWithChat>({ resource: active.session.resource, sessionId: 'active', activeChat: constObservable(activeChat) });
		sessions.activeSession.set(activePane, undefined);
		sessions.gridShown.set([activePane, upcastPartial<ITestSessionWithChat>({ resource: parent.resource, sessionId: parent.sessionId, activeChat: constObservable(waitingChat) })], undefined);
		const host = new TestHostService();
		host.hasFocus = true;
		store.add(new TestSessionsWindowNotifier(
			store.add(new TestSessionsManagementService([parent])), sessions, focusedSessionHostServiceOf(sessions.activeSession), host,
			new TestConfigurationService({ [ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused }),
			new TestChatService(), new TestChatWidgetService(),
			new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = constObservable([a, b]);
				override getComparisonForSession(resource: URI) { return resource.toString() === parent.resource.toString() ? b : a; }
			}(),
		));
		waiting.status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();
		assert.deepStrictEqual(host.toasts.map(toast => toast.dedupeKey), ['chat-session:test:/destination#moved:needsInput']);
	});

	test('a moved live model and its catalog chat produce one toast opening the destination', async () => {
		const base = createSession('parent', SessionStatus.InProgress);
		const chat = upcastPartial<IChat>({ resource: base.session.resource.with({ fragment: 'attempt' }), status: base.status, title: base.session.title, workspace: base.session.workspace });
		const parent = upcastPartial<ISession>({ resource: base.session.resource, sessionId: 'parent', chats: constObservable([chat]), status: constObservable(SessionStatus.InProgress) });
		const needsInput = observableValue<{ title: string } | undefined>('needsInput', undefined);
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = URI.parse('test:/original-attempt');
			override readonly requestNeedsInput = needsInput;
			override readonly requestInProgress = constObservable(true);
			override readonly lastRequestObs = constObservable(undefined);
			override readonly lastRequest = undefined;
			override readonly onDidChangePendingRequests = Event.None;
			override getPendingRequests() { return []; }
		}();
		setChatNotificationResource(model, chat.resource);
		const chatService = new class extends TestChatService {
			override getSession(resource: URI) { return resource.toString() === model.sessionResource.toString() ? model : undefined; }
		}();
		chatService.chatModels.set([model], undefined);
		const opened: string[] = [];
		const widgets = new class extends TestChatWidgetService {
			override async openSession(resource: URI) { opened.push(resource.toString()); return undefined; }
		}();
		const host = new TestHostService();
		host.toastResult = { supported: true, clicked: true };
		const configuration = new TestConfigurationService({ [ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.Always });
		const noSessions = new TestSessionsService();
		store.add(new TestSessionsWindowNotifier(
			store.add(new TestSessionsManagementService([parent])), noSessions, focusedSessionHostServiceOf(noSessions.activeSession), host, configuration, chatService, widgets,
			new class extends mock<ISessionComparisonService>() {
				override readonly comparisons = constObservable([upcastPartial<ISessionComparison>({
					id: 'comparison', participants: [upcastPartial<ISessionComparisonParticipant>({ sessionResource: parent.resource, chatResource: chat.resource })],
				})]);
			}(),
		));
		store.add(new class extends ChatWindowNotifier {
			protected override _getBackgroundNotificationDelay(): number { return 0; }
		}(chatService, widgets, host, configuration));
		needsInput.set({ title: 'Question' }, undefined);
		base.status.set(SessionStatus.NeedsInput, undefined);
		await flushNotifications();
		assert.deepStrictEqual({ toasts: host.toasts.map(toast => toast.dedupeKey), opened }, {
			toasts: ['chat-session:test:/parent#attempt:needsInput'], opened: [chat.resource.toString()],
		});
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
			focusedSessionHostServiceOf(sessions.activeSession),
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
