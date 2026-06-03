/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { AutomationService } from '../../../../../workbench/contrib/chat/browser/automations/automationService.js';
import { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ISession, IChat } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionsAutomationRunner } from '../../browser/sessionsAutomationRunner.js';

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

const FOLDER_A = URI.parse('file:///workspace/a');
const FOLDER_B = URI.parse('file:///workspace/b');

interface IRecordedCall {
	readonly folderUri: URI;
	readonly options: ISendRequestOptions;
	readonly createOptions?: ICreateNewSessionOptions;
}

class FakeSessionsManagementService extends mock<ISessionsManagementService>() {

	readonly calls: IRecordedCall[] = [];

	private readonly _onDidSendRequest = new Emitter<ISendRequestSentEvent>();
	override readonly onDidSendRequest = this._onDidSendRequest.event;

	/** Configure how the next createAndSendNewChatRequest behaves. */
	nextSession: ISession | undefined;
	nextError: Error | undefined;
	emitNewSession = true;

	override async createAndSendNewChatRequest(
		folderUri: URI,
		options: ISendRequestOptions,
		createOptions?: ICreateNewSessionOptions,
	): Promise<void> {
		this.calls.push({ folderUri, options, createOptions });
		if (this.nextError) {
			throw this.nextError;
		}
		if (this.emitNewSession && this.nextSession) {
			this._onDidSendRequest.fire({
				session: this.nextSession,
				chat: upcastPartial<IChat>({}),
				isNewSession: true,
				isNewChat: true,
				options,
			});
		}
	}

	dispose(): void {
		this._onDidSendRequest.dispose();
	}
}

function fakeSession(sessionId: string): ISession {
	return upcastPartial<ISession>({ sessionId });
}

suite('SessionsAutomationRunner', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log));
		const sessionsMgmt = new FakeSessionsManagementService();
		teardown.add({ dispose: () => sessionsMgmt.dispose() });
		const runner = new SessionsAutomationRunner(service, sessionsMgmt, log);
		return { service, sessionsMgmt, runner };
	}

	test('creates a session for the automation prompt and marks the run completed', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({ name: 'A', prompt: 'do the thing', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 99);

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.strictEqual(sessionsMgmt.calls[0].folderUri.toString(), FOLDER_A.toString());
		assert.strictEqual(sessionsMgmt.calls[0].options.query, 'do the thing');
		assert.strictEqual(sessionsMgmt.calls[0].options.background, true);

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'completed');
		assert.strictEqual(runs[0].sessionId, 's1');
		assert.strictEqual(runs[0].trigger, 'schedule');
		assert.strictEqual(runs[0].leaderWindowId, 99);
	});

	test('always uses the automation folder regardless of the current workspace', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: hourly(),
			folderUri: FOLDER_B,
		});
		await runner.runOnce(a, 'schedule', 1);

		assert.strictEqual(sessionsMgmt.calls[0].folderUri.toString(), FOLDER_B.toString());
	});

	test('marks the run failed when createAndSendNewChatRequest throws', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextError = new Error('provider offline');

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 1);

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'failed');
		assert.strictEqual(runs[0].errorMessage, 'provider offline');
	});

	test('skips when another active run exists for the same automation', async () => {
		const { service, sessionsMgmt, runner } = setup();

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await service.recordRunStart(a.id, 'manual', 1);
		await runner.runOnce(a, 'schedule', 2);

		// Only the pre-existing pending row should be in the ledger.
		assert.strictEqual(sessionsMgmt.calls.length, 0);
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'pending');
	});

	test('marks the run failed when the cancellation token is already cancelled', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const cts = new CancellationTokenSource();
		cts.cancel();

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 1, cts.token);

		assert.strictEqual(sessionsMgmt.calls.length, 0);
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'failed');
		assert.strictEqual(runs[0].errorMessage, 'Cancelled');
		cts.dispose();
	});

	test('completes the run even when no session was captured from onDidSendRequest', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.emitNewSession = false;

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 1, CancellationToken.None);

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'completed');
		assert.strictEqual(runs[0].sessionId, undefined);
	});
});
