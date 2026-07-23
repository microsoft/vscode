/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AutomationService } from '../../browser/automationService.js';
import { AutomationTarget, AutomationWorkspaceIsolation, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AutomationRunner } from '../../browser/automationRunner.js';

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

const FOLDER_A = URI.parse('file:///workspace/a');
const FOLDER_B = URI.parse('file:///workspace/b');

function workspaceTarget(folderUri = FOLDER_A, options?: { readonly providerId?: string; readonly sessionTypeId?: string; readonly isolation?: AutomationWorkspaceIsolation }): AutomationTarget {
	return {
		kind: 'workspace',
		folderUri,
		providerId: options?.providerId,
		sessionTypeId: options?.sessionTypeId,
		isolation: options?.isolation ?? { kind: 'default' },
	};
}

interface IRecordedCall {
	readonly isQuickChat: boolean;
	readonly folderUri?: URI;
	readonly options: ISendRequestOptions;
	readonly createOptions?: ICreateNewSessionOptions;
	readonly token: CancellationToken;
}

class FakeSessionsManagementService extends mock<ISessionsManagementService>() {

	readonly calls: IRecordedCall[] = [];
	workspaceTargetAvailable = true;
	quickChatTargetAvailable = true;

	/** Configure how the next createAndSendNewChatRequest behaves. */
	nextSession: ISession | undefined;
	nextError: Error | undefined;
	/** Optional hook fired after the call is recorded, before returning/throwing. */
	onSendHook: (() => Promise<void> | void) | undefined;

	override isNewSessionTargetAvailable(): boolean {
		return this.workspaceTargetAvailable;
	}

	override isQuickChatTargetAvailable(): boolean {
		return this.quickChatTargetAvailable;
	}

	override async createAndSendNewChatRequest(
		folderUri: URI,
		options: ISendRequestOptions,
		createOptions?: ICreateNewSessionOptions,
		token: CancellationToken = CancellationToken.None,
	): Promise<ISession | undefined> {
		this.calls.push({ isQuickChat: false, folderUri, options, createOptions, token });
		if (this.onSendHook) {
			await this.onSendHook();
		}
		if (this.nextError) {
			throw this.nextError;
		}
		return this.nextSession;
	}

	override async createAndSendQuickChatRequest(
		options: ISendRequestOptions,
		createOptions?: ICreateNewSessionOptions,
		token: CancellationToken = CancellationToken.None,
	): Promise<ISession | undefined> {
		this.calls.push({ isQuickChat: true, options, createOptions, token });
		if (this.onSendHook) {
			await this.onSendHook();
		}
		if (this.nextError) {
			throw this.nextError;
		}
		return this.nextSession;
	}
}

class RecordingNotificationService extends TestNotificationService {
	readonly infos: string[] = [];

	override info(message: string) {
		this.infos.push(message);
		return super.info(message);
	}
}

function fakeSession(id: string, status = observableValue(`status-${id}`, SessionStatus.Completed)): ISession {
	return upcastPartial<ISession>({
		sessionId: id,
		resource: URI.from({ scheme: 'vscode-chat-session', authority: 'test', path: `/${id}` }),
		status,
	});
}

suite('AutomationRunner', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		const sessionsMgmt = new FakeSessionsManagementService();
		const notifications = new RecordingNotificationService();
		const runner = new AutomationRunner(service, sessionsMgmt, log, NullTelemetryService, notifications);
		return { service, sessionsMgmt, runner, notifications };
	}

	test('creates a session for the automation prompt and marks the run completed', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({ name: 'A', prompt: 'do the thing', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'schedule', 99).whenCompleted;

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.strictEqual(sessionsMgmt.calls[0].folderUri?.toString(), FOLDER_A.toString());
		assert.strictEqual(sessionsMgmt.calls[0].options.query, 'do the thing');
		assert.strictEqual(sessionsMgmt.calls[0].options.background, true);

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'completed');
		assert.strictEqual(runs[0].sessionResource, 'vscode-chat-session://test/s1');
		assert.strictEqual(runs[0].trigger, 'schedule');
		assert.strictEqual(runs[0].leaderWindowId, 99);
	});

	test('keeps the run active through NeedsInput and records the session before completion', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const status = observableValue('status-s1', SessionStatus.InProgress);
		sessionsMgmt.nextSession = fakeSession('s1', status);

		const a = await service.createAutomation({ name: 'A', prompt: 'do the thing', schedule: hourly(), target: workspaceTarget() });
		let settled = false;
		const operation = runner.runOnce(a, 'schedule', 99);
		let dispatched = false;
		const dispatchPromise = operation.whenDispatched.finally(() => dispatched = true);
		const runPromise = operation.whenCompleted.finally(() => settled = true);

		await dispatchPromise;
		assert.deepStrictEqual(service.runs.get().map(run => ({
			status: run.status,
			sessionResource: run.sessionResource,
			completedAt: run.completedAt,
		})), [{
			status: 'running',
			sessionResource: 'vscode-chat-session://test/s1',
			completedAt: undefined,
		}]);
		assert.strictEqual(dispatched, true);

		status.set(SessionStatus.NeedsInput, undefined);
		await Promise.resolve();
		assert.deepStrictEqual({
			settled,
			status: service.runs.get()[0].status,
			completedAt: service.runs.get()[0].completedAt,
		}, {
			settled: false,
			status: 'running',
			completedAt: undefined,
		});

		status.set(SessionStatus.Completed, undefined);
		await runPromise;
		assert.strictEqual(service.runs.get()[0].status, 'completed');
	});

	test('marks the run failed when the session reports an error', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const status = observableValue('status-s1', SessionStatus.InProgress);
		sessionsMgmt.nextSession = fakeSession('s1', status);

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		const runPromise = runner.runOnce(a, 'schedule', 1).whenCompleted;
		await waitForState(service.runs, runs => runs[0]?.sessionResource !== undefined);

		status.set(SessionStatus.Error, undefined);
		await runPromise;

		const run = service.runs.get()[0];
		assert.deepStrictEqual({
			status: run.status,
			sessionResource: run.sessionResource,
			errorMessage: run.errorMessage,
			hasCompletedAt: run.completedAt !== undefined,
		}, {
			status: 'failed',
			sessionResource: 'vscode-chat-session://test/s1',
			errorMessage: 'Agent session failed.',
			hasCompletedAt: true,
		});
	});

	test('always uses the automation folder regardless of the current workspace', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: hourly(),
			target: workspaceTarget(FOLDER_B),
		});
		await runner.runOnce(a, 'schedule', 1).whenCompleted;

		assert.strictEqual(sessionsMgmt.calls[0].folderUri?.toString(), FOLDER_B.toString());
	});

	test('creates a workspace-less quick chat without folder or repository configuration', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('quick');

		const automation = await service.createAutomation({
			name: 'Quick',
			prompt: 'p',
			schedule: hourly(),
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});
		await runner.runOnce(automation, 'schedule', 1).whenCompleted;

		assert.deepStrictEqual(sessionsMgmt.calls.map(call => ({
			isQuickChat: call.isQuickChat,
			folderUri: call.folderUri,
			createOptions: call.createOptions,
		})), [{
			isQuickChat: true,
			folderUri: undefined,
			createOptions: {
				providerId: 'local-agent-host',
				sessionTypeId: 'copilotcli',
				modelId: undefined,
				modeId: undefined,
				permissionLevel: undefined,
				isolationMode: undefined,
				branch: undefined,
			},
		}]);
	});

	test('truncates the session title to 100 characters', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const longName = 'A'.repeat(150);
		const a = await service.createAutomation({ name: longName, prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'manual', 1).whenCompleted;

		assert.strictEqual(sessionsMgmt.calls[0].options.title, 'A'.repeat(100));
	});

	test('marks the run failed when createAndSendNewChatRequest throws', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextError = new Error('provider offline');

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'schedule', 1).whenCompleted;

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'failed');
		assert.strictEqual(runs[0].errorMessage, 'provider offline');
	});

	test('defers a scheduled run without advancing its schedule when the target is unavailable', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.workspaceTargetAvailable = false;
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		await runner.runOnce(automation, 'schedule', 1).whenCompleted;

		const updated = service.getAutomation(automation.id);
		assert.deepStrictEqual({
			calls: sessionsMgmt.calls.length,
			runs: service.runs.get(),
			lastRunAt: updated?.lastRunAt,
			nextRunAt: updated?.nextRunAt,
		}, {
			calls: 0,
			runs: [],
			lastRunAt: undefined,
			nextRunAt: automation.nextRunAt,
		});
	});

	test('reports an unavailable target for a manual run without recording a failure', async () => {
		const { service, sessionsMgmt, runner, notifications } = setup();
		sessionsMgmt.quickChatTargetAvailable = false;
		const automation = await service.createAutomation({
			name: 'Unavailable',
			prompt: 'p',
			schedule: hourly(),
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});

		await runner.runOnce(automation, 'manual', 1).whenCompleted;

		assert.deepStrictEqual({
			calls: sessionsMgmt.calls.length,
			runs: service.runs.get(),
			notifications: notifications.infos,
		}, {
			calls: 0,
			runs: [],
			notifications: ['Automation \'Unavailable\' cannot start until its agent becomes available.'],
		});
	});

	test('skips when another active run exists for the same automation', async () => {
		const { service, sessionsMgmt, runner } = setup();

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await service.recordRunStart(a.id, 'manual', 1);
		await runner.runOnce(a, 'schedule', 2).whenCompleted;
		assert.strictEqual(sessionsMgmt.calls.length, 0);
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'pending');
	});

	test('marks the run failed when the cancellation token is already cancelled', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const cts = new CancellationTokenSource();
		cts.cancel();

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'schedule', 1, cts.token).whenCompleted;

		assert.strictEqual(sessionsMgmt.calls.length, 0);
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'failed');
		assert.strictEqual(runs[0].errorMessage, 'Cancelled');
		cts.dispose();
	});

	test('marks the run cancelled when the token is cancelled mid-flight', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const cts = new CancellationTokenSource();
		sessionsMgmt.nextSession = fakeSession('s-mid');
		sessionsMgmt.onSendHook = () => {
			cts.cancel();
		};

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'schedule', 1, cts.token).whenCompleted;

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.strictEqual(sessionsMgmt.calls[0].token, cts.token);
		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'failed');
		assert.strictEqual(runs[0].errorMessage, 'Cancelled');
		assert.strictEqual(runs[0].sessionResource, 'vscode-chat-session://test/s-mid');
		cts.dispose();
	});

	test('cancels while waiting for the session to finish', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const cts = new CancellationTokenSource();
		const status = observableValue('status-s-waiting', SessionStatus.InProgress);
		sessionsMgmt.nextSession = fakeSession('s-waiting', status);

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		const runPromise = runner.runOnce(a, 'schedule', 1, cts.token).whenCompleted;
		await waitForState(service.runs, runs => runs[0]?.sessionResource !== undefined);

		cts.cancel();
		await runPromise;

		const run = service.runs.get()[0];
		assert.deepStrictEqual({
			status: run.status,
			sessionResource: run.sessionResource,
			errorMessage: run.errorMessage,
		}, {
			status: 'failed',
			sessionResource: 'vscode-chat-session://test/s-waiting',
			errorMessage: 'Cancelled',
		});
		cts.dispose();
	});

	test('does not overwrite a terminal failure when cancelled', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const cts = new CancellationTokenSource();
		const status = observableValue('status-s-timeout', SessionStatus.InProgress);
		sessionsMgmt.nextSession = fakeSession('s-timeout', status);

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		const runPromise = runner.runOnce(a, 'schedule', 1, cts.token).whenCompleted;
		const run = await waitForState(service.runs.map(runs => runs[0]), run => run?.sessionResource !== undefined);
		await service.updateRun(run.id, {
			status: 'failed',
			completedAt: new Date().toISOString(),
			errorMessage: 'Timed out',
		});

		cts.cancel();
		await runPromise;

		assert.deepStrictEqual({
			status: service.runs.get()[0].status,
			errorMessage: service.runs.get()[0].errorMessage,
		}, {
			status: 'failed',
			errorMessage: 'Timed out',
		});
		cts.dispose();
	});

	test('completes the run even when the service returns undefined', async () => {
		const { service, runner } = setup();

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'schedule', 1, CancellationToken.None).whenCompleted;

		const runs = service.runs.get();
		assert.strictEqual(runs.length, 1);
		assert.strictEqual(runs[0].status, 'completed');
		assert.strictEqual(runs[0].sessionResource, undefined);
	});

	test('passes the captured providerId and sessionTypeId through to createAndSendNewChatRequest', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({
			name: 'A',
			prompt: 'p',
			schedule: hourly(),
			target: workspaceTarget(FOLDER_A, { providerId: 'local-agent-host', sessionTypeId: 'agent-host-copilotcli' }),
		});
		await runner.runOnce(a, 'schedule', 1).whenCompleted;

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
			target: workspaceTarget(),
			mode: 'agent',
			permissionLevel: 'autopilot',
		});
		await runner.runOnce(a, 'schedule', 1).whenCompleted;

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

	test('passes a branch only for Worktree isolation', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const worktree = await service.createAutomation({
			name: 'Worktree',
			prompt: 'p',
			schedule: hourly(),
			target: workspaceTarget(FOLDER_A, { isolation: { kind: 'worktree', branch: 'feature/worktree' } }),
		});
		const folder = await service.createAutomation({
			name: 'Folder',
			prompt: 'p',
			schedule: hourly(),
			target: workspaceTarget(FOLDER_B, { isolation: { kind: 'folder' } }),
		});

		await runner.runOnce(worktree, 'schedule', 1).whenCompleted;
		await runner.runOnce(folder, 'schedule', 1).whenCompleted;

		assert.deepStrictEqual(sessionsMgmt.calls.map(call => call.createOptions), [
			{
				providerId: undefined,
				sessionTypeId: undefined,
				modelId: undefined,
				modeId: undefined,
				permissionLevel: undefined,
				isolationMode: 'worktree',
				branch: 'feature/worktree',
			},
			{
				providerId: undefined,
				sessionTypeId: undefined,
				modelId: undefined,
				modeId: undefined,
				permissionLevel: undefined,
				isolationMode: 'workspace',
				branch: undefined,
			},
		]);
	});

	test('omits createOptions entirely when no provider/sessionType is captured', async () => {
		const { service, sessionsMgmt, runner } = setup();
		sessionsMgmt.nextSession = fakeSession('s1');

		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await runner.runOnce(a, 'schedule', 1).whenCompleted;

		assert.strictEqual(sessionsMgmt.calls.length, 1);
		assert.strictEqual(sessionsMgmt.calls[0].createOptions, undefined);
	});

	test('does not throw if the automation is deleted mid-run', async () => {
		const { service, sessionsMgmt, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await service.deleteAutomation(a.id);
		// The runner detects the deletion via getAutomation before attempting
		// recordRunStart, bails early, and produces no run rows.
		await runner.runOnce(a, 'manual', 1).whenCompleted;
		assert.strictEqual(sessionsMgmt.calls.length, 0);
		assert.deepStrictEqual(service.runs.get(), []);
	});
});
