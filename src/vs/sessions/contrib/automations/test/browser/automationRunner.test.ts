/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { derived, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAutomationDescriptor as IAutomation, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationRunStartResult, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { AutomationRunner } from '../../browser/automationRunner.js';

suite('AutomationRunner', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('tracks a host run from dispatch through completion', async () => {
		const automation = createAutomation();
		const service = new TestAutomationService(automation);
		const runner = new AutomationRunner(service, new NullLogService(), NullTelemetryService, new TestNotificationService());
		const operation = runner.runOnce(automation);
		await waitForState(service.runs, runs => runs.length === 1);
		const pending = service.runs.get()[0];
		service.setRun({ ...pending, status: 'running', sessionResource: URI.parse('copilotcli:/session') });

		assert.deepStrictEqual(await operation.whenDispatched, {
			kind: 'started',
			run: service.runs.get()[0],
			sessionResource: URI.parse('copilotcli:/session'),
		});
		service.setRun({ ...service.runs.get()[0], status: 'completed', completedAt: new Date().toISOString() });
		await operation.whenCompleted;
	});

	test('reports the active host run without starting another', async () => {
		const automation = createAutomation();
		const activeRun = createRun('running');
		const service = new TestAutomationService(automation, activeRun);
		service.nextStartResult = { claimed: false, run: activeRun };
		const runner = new AutomationRunner(service, new NullLogService(), NullTelemetryService, new TestNotificationService());

		assert.deepStrictEqual(await runner.runOnce(automation).whenDispatched, {
			kind: 'alreadyRunning',
			activeRun,
		});
	});

	test('keeps a pending migration read-only', async () => {
		const automation = createAutomation(true);
		const service = new TestAutomationService(automation);
		const runner = new AutomationRunner(service, new NullLogService(), NullTelemetryService, new TestNotificationService());

		assert.deepStrictEqual(await runner.runOnce(automation).whenDispatched, {
			kind: 'notStarted',
			reason: 'targetUnavailable',
		});
		assert.strictEqual(service.startCalls, 0);
	});

	test('requests host cancellation when the caller cancels', async () => {
		const automation = createAutomation();
		const service = new TestAutomationService(automation);
		const runner = new AutomationRunner(service, new NullLogService(), NullTelemetryService, new TestNotificationService());
		const tokenSource = disposables.add(new CancellationTokenSource());
		const operation = runner.runOnce(automation, tokenSource.token);
		await waitForState(service.runs, runs => runs.length === 1);
		tokenSource.cancel();
		await operation.whenCompleted;

		assert.deepStrictEqual({
			cancelled: service.cancelledRuns,
			dispatch: await operation.whenDispatched,
		}, {
			cancelled: ['run-1'],
			dispatch: { kind: 'notStarted', reason: 'cancelled', run: createRun('pending') },
		});
	});
});

class TestAutomationService extends mock<IAutomationService>() {
	override readonly automations;
	override readonly runs = observableValue<readonly IAutomationRun[]>(this, []);
	nextStartResult: IAutomationRunStartResult | undefined;
	startCalls = 0;
	readonly cancelledRuns: string[] = [];

	constructor(private readonly automation: IAutomation, initialRun?: IAutomationRun) {
		super();
		this.automations = observableValue<readonly IAutomation[]>(this, [automation]);
		if (initialRun) {
			this.runs.set([initialRun], undefined);
		}
	}

	override getAutomation(id: string): IAutomation | undefined {
		return id === this.automation.id ? this.automation : undefined;
	}

	override runsFor(automationId: string) {
		return derived(this, reader => this.runs.read(reader).filter(run => run.automationId === automationId));
	}

	override async startRun(): Promise<IAutomationRunStartResult> {
		this.startCalls++;
		if (this.nextStartResult) {
			return this.nextStartResult;
		}
		const run = createRun('pending');
		this.runs.set([run], undefined);
		return { claimed: true, run };
	}

	override async cancelRun(runId: string): Promise<void> {
		this.cancelledRuns.push(runId);
		const current = this.runs.get().find(run => run.id === runId);
		if (current) {
			this.runs.set([{ ...current, status: 'cancelled', completedAt: new Date().toISOString() }], undefined);
		}
	}

	setRun(run: IAutomationRun): void {
		this.runs.set([run], undefined);
	}
}

function createAutomation(migrationPending = false): IAutomation {
	return {
		id: 'local\0ahp-automation:/test',
		name: 'Test',
		prompt: 'Run tests',
		schedule: { interval: 'manual', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
		target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		enabled: true,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		host: {
			authority: 'local',
			resource: 'ahp-automation:/test',
			revision: migrationPending ? 0 : 1,
			connected: !migrationPending,
			hasUnsupportedTriggers: false,
			migrationPending,
		},
	};
}

function createRun(status: IAutomationRun['status']): IAutomationRun {
	return {
		id: 'run-1',
		automationId: 'local\0ahp-automation:/test',
		status,
		trigger: 'manual',
		startedAt: '2026-01-01T00:00:00.000Z',
	};
}
