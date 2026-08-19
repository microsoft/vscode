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
import { mock } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FocusMode } from '../../../../../platform/native/common/native.js';
import { ChatConfiguration, ChatNotificationMode } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IHostService, IToastOptions, IToastResult } from '../../../../../workbench/services/host/browser/host.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
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

	override async showToast(options: IToastOptions, _token: CancellationToken): Promise<IToastResult> {
		this.toasts.push(options);
		return this.toastResult;
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

suite('SessionsWindowNotifier', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createNotifier(
		session: ISession,
		configuration: Record<string, ChatNotificationMode>,
	): { notifier: SessionsWindowNotifier; sessions: TestSessionsService; host: TestHostService } {
		const management = new TestSessionsManagementService([session]);
		const sessions = new TestSessionsService();
		const host = new TestHostService();
		const notifier = store.add(new SessionsWindowNotifier(
			management,
			sessions,
			host,
			new TestConfigurationService(configuration),
		));
		store.add(management);
		return { notifier, sessions, host };
	}

	test('uses confirmation setting for needs-input transitions', async () => {
		const { session, status } = createSession('needs-input', SessionStatus.InProgress);
		const { host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnConfirmation]: ChatNotificationMode.WindowNotFocused,
		});

		status.set(SessionStatus.NeedsInput, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			toasts: host.toasts,
			focusModes: host.focusModes,
		}, {
			toasts: [{
				title: 'Session: Fix needs-input',
				body: 'Input needed in vscode.',
				actions: ['Open Session'],
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
		await timeout(0);
		status.set(SessionStatus.InProgress, undefined);
		status.set(SessionStatus.Error, undefined);
		await timeout(0);

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
		await timeout(0);

		assert.deepStrictEqual(host.toasts, []);
	});

	test('opens the exact session when the toast is activated', async () => {
		const { session, status } = createSession('open-me', SessionStatus.InProgress);
		const { sessions, host } = createNotifier(session, {
			[ChatConfiguration.NotifyWindowOnResponseReceived]: ChatNotificationMode.WindowNotFocused,
		});
		host.toastResult = { supported: true, clicked: true };

		status.set(SessionStatus.Completed, undefined);
		await timeout(0);

		assert.deepStrictEqual({
			opened: sessions.opened.map(resource => resource.toString()),
			focusModes: host.focusModes,
		}, {
			opened: ['test:/open-me'],
			focusModes: [FocusMode.Notify, FocusMode.Force],
		});
	});
});
