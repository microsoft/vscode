/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkflowCheckContext, WorkflowCheckResult, WorkflowInvocation, WorkflowObject, WorkflowRun, WorkflowSchemaFormat } from '../../common/workflow.js';
import { parseWorkflowTimestamp, registerWorkflowCalendarCheck } from '../../common/workflowCalendar.js';
import { WorkflowCheckRegistry } from '../../common/workflowCheckRegistry.js';
import { WorkflowRunner } from '../../common/workflowRunner.js';
import { resolveWorkflowDefinition } from '../../common/workflowValidation.js';
import { makeType, TestWorkflowAdapter, TestWorkflowStore } from './workflowTestUtils.js';

const checkId = 'vscode.calendar/weekday-on-or-after@1';
const mergeTime = '2026-09-17T12:00:00Z';
const timeZone = 'Europe/Zurich';
const proof = { summary: 'Done' };

function calendarSnapshot(offsetDays = 0) {
	const merged = makeType('merged', {
		completion: { kind: 'checked', check: { check: 'test.merge' } },
		outputSchema: {
			type: 'object', properties: { mergedAt: { type: 'string', minLength: 20, maxLength: 35 } },
			required: ['mergedAt'], additionalProperties: false,
		},
	});
	const calendar = makeType('calendar', {
		inputSchema: {
			type: 'object',
			properties: {
				mergedAt: { type: 'string', minLength: 20, maxLength: 35 },
				timeZone: { type: 'string', format: WorkflowSchemaFormat.IanaTimeZone, minLength: 1, maxLength: 256 },
			},
			required: ['mergedAt', 'timeZone'], additionalProperties: false,
		},
		startCondition: {
			check: checkId,
			inputs: { anchor: { input: 'mergedAt' }, timeZone: { input: 'timeZone' } },
			options: { weekday: 5, hour: 9, minute: 0, offsetDays },
		},
	});
	return resolveWorkflowDefinition({
		id: 'calendar-workflow', version: 1, label: 'Calendar workflow',
		inputSchema: {
			type: 'object', properties: { timeZone: { type: 'string', format: WorkflowSchemaFormat.IanaTimeZone, minLength: 1, maxLength: 256 } },
			required: ['timeZone'], additionalProperties: false,
		},
		checkpoints: [
			{ id: 'merged', type: 'merged@1' },
			{
				id: 'calendar', type: 'calendar@1', inputs: {
					mergedAt: { checkpoint: 'merged', outputPointer: '/mergedAt' }, timeZone: { input: 'timeZone' },
				},
			},
		],
	}, [merged, calendar]);
}

function calendarContext(anchor = mergeTime, zone = timeZone, offsetDays = 0): WorkflowCheckContext {
	const snapshot = calendarSnapshot(offsetDays);
	const checkpoint = snapshot.checkpoints[1];
	const run: WorkflowRun = {
		id: 'run', version: 1, revision: 0, session: 'session', chat: 'chat', task: 'Calendar task',
		inputs: { timeZone: zone }, snapshot, stopAfter: 'calendar', status: 'running', checkpointIndex: 1,
		receipts: [{
			id: 'receipt', checkpointId: 'merged', assignmentId: 'merge-assignment', turnId: 'merge-turn',
			proof, output: { mergedAt: anchor }, evidence: [], provenance: 'checked', checkId: 'test.merge',
			acceptedAt: Date.parse('2026-10-01T12:00:00Z'),
		}],
		firstTurns: { merged: 'merge-turn' }, createdAt: 0, updatedAt: 0, activityAt: 0,
	};
	return { run, checkpoint, inputs: { anchor, timeZone: zone }, options: checkpoint.type.startCondition!.options! };
}

function schedule(result: WorkflowCheckResult): WorkflowObject {
	assert.ok(result.kind === 'waiting' || result.kind === 'satisfied', JSON.stringify(result));
	return result.kind === 'waiting' ? result.state! : result.output;
}

function dueDate(result: WorkflowCheckResult): string {
	const { dueAt } = schedule(result);
	assert.ok(typeof dueAt === 'number');
	return new Date(dueAt).toISOString();
}

function invocation(run: WorkflowRun): WorkflowInvocation {
	assert.ok(run.assignment);
	return { runId: run.id, assignmentId: run.assignment.id, turnId: run.assignment.turnId };
}

suite('Workflow calendar', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function fixture(initialTime = mergeTime) {
		const clock = { now: Date.parse(initialTime), id: 0 };
		const registry = disposables.add(new WorkflowCheckRegistry());
		disposables.add(registerWorkflowCalendarCheck(registry, () => clock.now));
		const evaluate = (context: WorkflowCheckContext) => registry.get(checkId)!.evaluate(context, CancellationToken.None);
		return { clock, registry, evaluate };
	}

	async function waitingWorkflow() {
		const { clock, registry } = fixture();
		const store = new TestWorkflowStore();
		const adapter = new TestWorkflowAdapter();
		disposables.add(registry.register({ id: 'test.merge', evaluate: async () => ({ kind: 'satisfied', output: { mergedAt: mergeTime } }) }));
		const createRunner = () => disposables.add(new WorkflowRunner(store, adapter, registry, { now: () => clock.now, generateId: () => `id-${++clock.id}` }));
		const runner = createRunner();
		const first = await runner.start({
			session: 'session', chat: 'chat', task: 'Calendar task', snapshot: calendarSnapshot(),
			stopAfter: 'calendar', inputs: { timeZone },
		});
		await runner.prove(invocation(first), proof);
		await runner.onTurnEnd(invocation(first), 'completed');
		const run = (await store.getRun(first.id))!;
		return { clock, store, adapter, runner, run, createRunner };
	}

	test('uses the first Friday on or after the merge date, including Friday at and after 09:00', async () => {
		const { clock, evaluate } = fixture();
		const cases = [
			['2026-09-17T12:00:00Z', '2026-09-18T07:00:00.000Z', 'waiting'],
			['2026-09-18T05:00:00Z', '2026-09-18T07:00:00.000Z', 'waiting'],
			['2026-09-18T07:00:00Z', '2026-09-18T07:00:00.000Z', 'satisfied'],
			['2026-09-18T15:00:00Z', '2026-09-18T07:00:00.000Z', 'satisfied'],
			['2026-09-19T12:00:00Z', '2026-09-25T07:00:00.000Z', 'waiting'],
		];
		const actual = [];
		for (const [anchor] of cases) {
			clock.now = Date.parse(anchor);
			const result = await evaluate(calendarContext(anchor));
			actual.push([anchor, dueDate(result), result.kind]);
		}
		assert.deepStrictEqual(actual, cases);
	});

	test('keeps Monday relative to the intended Friday, not late evaluation or receipt acceptance', async () => {
		const { evaluate } = fixture('2026-10-02T12:00:00Z');
		const results = await Promise.all([0, 3].map(offset => evaluate(calendarContext(mergeTime, timeZone, offset))));
		assert.deepStrictEqual(results.map(result => [result.kind, dueDate(result)]), [
			['satisfied', '2026-09-18T07:00:00.000Z'],
			['satisfied', '2026-09-21T07:00:00.000Z'],
		]);
	});

	test('uses IANA local dates and spring, autumn, and fractional DST offsets between Friday and Monday', async () => {
		const { evaluate } = fixture('2027-01-01T00:00:00Z');
		const cases = [
			['America/New_York', '2026-03-06T15:00:00Z', '2026-03-06T14:00:00.000Z', '2026-03-09T13:00:00.000Z'],
			['America/New_York', '2026-10-30T13:00:00Z', '2026-10-30T13:00:00.000Z', '2026-11-02T14:00:00.000Z'],
			['Europe/Zurich', '2026-03-27T07:00:00Z', '2026-03-27T08:00:00.000Z', '2026-03-30T07:00:00.000Z'],
			['Asia/Kathmandu', '2026-09-18T23:00:00Z', '2026-09-25T03:15:00.000Z', '2026-09-28T03:15:00.000Z'],
			['America/Los_Angeles', '2026-09-19T00:00:00Z', '2026-09-18T16:00:00.000Z', '2026-09-21T16:00:00.000Z'],
			['Australia/Lord_Howe', '2026-10-01T22:00:00Z', '2026-10-01T22:30:00.000Z', '2026-10-04T22:00:00.000Z'],
		];
		const actual = [];
		for (const [zone, anchor] of cases) {
			const results = await Promise.all([0, 3].map(offset => evaluate(calendarContext(anchor, zone, offset))));
			actual.push([zone, anchor, ...results.map(dueDate)]);
		}
		assert.deepStrictEqual(actual, cases);
	});

	test('rejects reported, literal, run-input and mismatched anchors even when the date looks authoritative', async () => {
		const { evaluate } = fixture();
		const context = calendarContext();
		const receipt = context.run.receipts[0];
		const contexts: WorkflowCheckContext[] = [
			{ ...context, run: { ...context.run, receipts: [{ ...receipt, provenance: 'reported', checkId: undefined }] } },
			{ ...context, run: { ...context.run, receipts: [{ ...receipt, checkId: 'some.other.check' }] } },
			{ ...context, inputs: { ...context.inputs, anchor: '2026-09-18T12:00:00Z' } },
			{ ...context, checkpoint: { ...context.checkpoint, inputs: { ...context.checkpoint.inputs, mergedAt: { value: mergeTime } } } },
			{ ...context, checkpoint: { ...context.checkpoint, inputs: { ...context.checkpoint.inputs, mergedAt: { input: 'mergedAt' } } } },
		];
		assert.deepStrictEqual(await Promise.all(contexts.map(async value => (await evaluate(value)).kind)), ['blocked', 'blocked', 'blocked', 'blocked', 'blocked']);
	});

	test('requires valid explicit timestamps, IANA zones and bounded calendar options without host defaults', async () => {
		const { evaluate } = fixture();
		const context = calendarContext();
		const invalidOptions: readonly WorkflowObject[] = [
			{ weekday: 7, hour: 9 }, { weekday: 5, hour: 24 }, { weekday: 5, hour: 9, minute: 60 },
			{ weekday: 5, hour: 9, offsetDays: 7 }, { weekday: 5, hour: 9, unrelated: true },
		];
		const invalid: WorkflowCheckContext[] = [
			...['2026-09-18', '2026-09-18T09:00:00', '2026-02-30T09:00:00Z'].map(anchor => calendarContext(anchor)),
			...['', 'Invalid/Zone', '+02:00', 'a'.repeat(257)].map(zone => calendarContext(mergeTime, zone)),
			{ ...context, inputs: { anchor: mergeTime } },
			...invalidOptions.map(options => ({ ...context, options })),
		];
		assert.deepStrictEqual(await Promise.all(invalid.map(async value => (await evaluate(value)).kind)), invalid.map(() => 'blocked'));
		assert.strictEqual(parseWorkflowTimestamp('2026-09-18T09:00:00+02:00'), Date.parse('2026-09-18T07:00:00Z'));
	});

	test('blocks nonexistent local times and uses the earlier instant for repeated local times', async () => {
		const { evaluate } = fixture('2027-01-01T00:00:00Z');
		const spring = calendarContext('2026-03-06T15:00:00Z', 'America/New_York');
		const autumn = calendarContext('2026-10-30T13:00:00Z', 'America/New_York');
		const missing = await evaluate({ ...spring, options: { weekday: 0, hour: 2, minute: 30 } });
		const repeated = await evaluate({ ...autumn, options: { weekday: 0, hour: 1, minute: 30 } });
		assert.deepStrictEqual([missing.kind, repeated.kind, dueDate(repeated)], ['blocked', 'satisfied', '2026-11-01T05:30:00.000Z']);
	});

	test('persists the scheduled instant and frozen zone across a fresh checker and delayed observation', async () => {
		const { evaluate } = fixture();
		const context = calendarContext();
		const waiting = await evaluate(context);
		const restored: WorkflowCheckContext = JSON.parse(JSON.stringify({ ...context, previousState: schedule(waiting) }));
		const restarted = fixture('2026-10-02T12:00:00Z');
		const overdue = await restarted.evaluate(restored);
		const expected = { anchor: '2026-09-17T12:00:00.000Z', timeZone, weekday: 5, hour: 9, minute: 0, offsetDays: 0, dueAt: Date.parse('2026-09-18T07:00:00Z') };
		assert.deepStrictEqual([waiting.kind, overdue.kind, schedule(waiting), schedule(overdue)], ['waiting', 'satisfied', expected, expected]);
	});

	test('does not reuse another timezone or anchor schedule from stale wait state', async () => {
		const { evaluate } = fixture();
		const previous = schedule(await evaluate(calendarContext()));
		const changed = await evaluate({ ...calendarContext('2026-09-19T12:00:00Z', 'America/New_York'), previousState: previous });
		assert.deepStrictEqual([dueDate(changed), schedule(changed).timeZone], ['2026-09-25T13:00:00.000Z', 'America/New_York']);
	});

	test('waits without tool turns and resumes overdue from durable runner state after host downtime', async () => {
		const { clock, store, adapter, runner, run, createRunner } = await waitingWorkflow();
		const waitingDispatches = adapter.dispatches.map(call => call.assignment.checkpointId);
		runner.dispose();
		clock.now = Date.parse('2026-09-28T12:00:00Z');
		await createRunner().recover();
		const resumed = (await store.getRun(run.id))!;
		assert.deepStrictEqual({
			initial: run.status, waitKind: run.wait?.kind, dueAt: run.wait?.state?.dueAt, waitingDispatches,
			resumed: resumed.status, frozenZone: resumed.inputs.timeZone,
			observedDueAt: resumed.startConditionReceipts?.[0].output.dueAt,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, {
			initial: 'waiting', waitKind: 'startCondition', dueAt: Date.parse('2026-09-18T07:00:00Z'), waitingDispatches: ['merged'],
			resumed: 'running', frozenZone: timeZone, observedDueAt: Date.parse('2026-09-18T07:00:00Z'), dispatches: ['merged', 'calendar'],
		});
	});

	test('continues to honor pause, cancel, stop boundaries and revoked source authorization when overdue', async () => {
		const actual = [];
		for (const control of ['pause', 'cancel', 'stop', 'source'] as const) {
			const { clock, store, adapter, runner, run } = await waitingWorkflow();
			if (control === 'source') {
				adapter.readiness = { kind: 'blocked', reason: 'Workflow source was revoked.' };
			} else {
				await runner.control(control === 'stop'
					? { kind: 'setStopAfter', runId: run.id, revision: run.revision, checkpointId: 'merged' }
					: { kind: control, runId: run.id, revision: run.revision });
			}
			clock.now = Date.parse('2026-09-28T12:00:00Z');
			await runner.wakeDue();
			actual.push([(await store.getRun(run.id))!.status, adapter.dispatches.map(call => call.assignment.checkpointId)]);
		}
		assert.deepStrictEqual(actual, [['paused', ['merged']], ['cancelled', ['merged']], ['stopped', ['merged']], ['blocked', ['merged']]]);
	});

	test('resuming after a paused due day retains the original scheduled instant', async () => {
		const { clock, store, adapter, runner, run } = await waitingWorkflow();
		const paused = await runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
		clock.now = Date.parse('2026-09-28T12:00:00Z');
		await runner.control({ kind: 'resume', runId: run.id, revision: paused.revision });
		const resumed = (await store.getRun(run.id))!;
		assert.deepStrictEqual({
			status: resumed.status, dueAt: resumed.startConditionReceipts?.[0].output.dueAt,
			timeZone: resumed.inputs.timeZone, dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, {
			status: 'running', dueAt: Date.parse('2026-09-18T07:00:00Z'), timeZone, dispatches: ['merged', 'calendar'],
		});
	});

	test('honors cancellation before calendar evaluation', async () => {
		const { registry } = fixture();
		const cancellation = disposables.add(new CancellationTokenSource());
		cancellation.cancel();
		await assert.rejects(registry.get(checkId)!.evaluate(calendarContext(), cancellation.token), { name: 'Canceled' });
	});
});
