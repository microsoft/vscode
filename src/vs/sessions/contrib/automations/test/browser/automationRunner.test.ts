/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AutomationService } from '../../browser/automationService.js';
import { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AutomationRunner } from '../../browser/automationRunner.js';

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

	/** Configure how the next createAndSendNewChatRequest behaves. */
	nextSession: ISession | undefined;
	nextError: Error | undefined;
	/** Optional hook fired after the call is recorded, before returning/throwing. */
	onSendHook: (() => Promise<void> | void) | undefined;

	override async createAndSendNewChatRequest(
		folderUri: URI,
		options: ISendRequestOptions,
		createOptions?: ICreateNewSessionOptions,
	): Promise<ISession | undefined> {
		this.calls.push({ folderUri, options, createOptions });
		if (this.onSendHook) {
			await this.onSendHook();
		}
		if (this.nextError) {
			throw this.nextError;
		}
		return this.nextSession;
	}
}

function fakeSession(sessionId: string): ISession {
	return upcastPartial<ISession>({ sessionId });
}

suite('AutomationRunner', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		const sessionsMgmt = new FakeSessionsManagementService();
		const runner = new AutomationRunner(service, sessionsMgmt, log, NullTelemetryService, new TestNotificationService());
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

	test('truncates the session title to 100 characters', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const longName = 'A'.repeat(150);
		const a = await service.createAutomation({ name: longName, prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'manual', 1);

		assert.strictEqual(sessionsMgmt.calls[0].options.title, 'A'.repeat(100));
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

	test('marks the run cancelled when the token is cancelled mid-flight', async () => {
		// Regression: previously the runner only checked the token before
		// `createAndSendNewChatRequest`, so a cancellation that landed during
		// the in-flight send would still stamp the run as `completed`.
		const { service, sessionsMgmt, runner } = setup();
		const cts = new CancellationTokenSource();
		sessionsMgmt.nextSession = fakeSession('s-mid');
		sessionsMgmt.onSendHook = () => {
			cts.cancel();
		};

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 1, cts.token);

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'failed');
		assert.strictEqual(runs[0].errorMessage, 'Cancelled');
		// Even though the service returned a session, the cancellation
		// outcome wins and the session id is not stamped onto the run.
		assert.strictEqual(runs[0].sessionId, undefined);
		cts.dispose();
	});

	test('completes the run even when the service returns undefined', async () => {
		const { service, runner } = setup();

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 1, CancellationToken.None);

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'completed');
		assert.strictEqual(runs[0].sessionId, undefined);
	});

	test('passes the captured providerId and sessionTypeId through to createAndSendNewChatRequest', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: hourly(),
			folderUri: FOLDER_A,
			providerId: 'local-agent-host',
			sessionTypeId: 'agent-host-copilotcli',
		});
		await runner.runOnce(a, 'schedule', 1);

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.deepStrictEqual(sessionsMgmt.calls[0].createOptions, {
			providerId: 'local-agent-host',
			sessionTypeId: 'agent-host-copilotcli',
			modelId: undefined,
			modeId: undefined,
			permissionLevel: undefined,
			isolationMode: undefined,
			branch: undefined,
		});
	});

	test('passes captured mode and permission level through to createAndSendNewChatRequest', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: hourly(),
			folderUri: FOLDER_A,
			mode: 'agent',
			permissionLevel: 'autopilot',
		});
		await runner.runOnce(a, 'schedule', 1);

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.deepStrictEqual(sessionsMgmt.calls[0].createOptions, {
			providerId: undefined,
			sessionTypeId: undefined,
			modelId: undefined,
			modeId: 'agent',
			permissionLevel: 'autopilot',
			isolationMode: undefined,
			branch: undefined,
		});
	});

	test('omits createOptions entirely when no provider/sessionType is captured', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await runner.runOnce(a, 'schedule', 1);

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.strictEqual(sessionsMgmt.calls[0].createOptions, undefined);
	});

	test('does not throw if the automation is deleted mid-run', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER_A });
		await service.deleteAutomation(a.id);
		// The runner detects the deletion via getAutomation before attempting
		// recordRunStart, bails early, and produces no run rows.
		await runner.runOnce(a, 'manual', 1);
		assert.strictEqual(sessionsMgmt.calls.length, 0);
		assert.deepStrictEqual(service.runs.get(), []);
	});
});
