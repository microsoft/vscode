/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { WorkflowCheckResult, WorkflowEvidence, WorkflowInvocation, WorkflowObject, WorkflowRun, WorkflowSnapshot } from '../../common/workflow.js';
import { WorkflowCheckRegistry } from '../../common/workflowCheckRegistry.js';
import { getWorkflowProgress } from '../../common/workflowProgress.js';
import { WorkflowConflictError, WorkflowDispatchBusyError, WorkflowRunner, WorkflowRunnerOptions } from '../../common/workflowRunner.js';
import { WorkflowValidationError } from '../../common/workflowValidation.js';
import { makeSnapshot, makeType, proofSchema, TestWorkflowAdapter, TestWorkflowStore } from './workflowTestUtils.js';

suite('Workflow runner', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const proof: WorkflowObject = { summary: 'Done' };

	function fixture(options: WorkflowRunnerOptions = {}) {
		const store = new TestWorkflowStore();
		const adapter = new TestWorkflowAdapter();
		const checks = disposables.add(new WorkflowCheckRegistry());
		const clock = { now: 1000, id: 0 };
		const createRunner = () => disposables.add(new WorkflowRunner(store, adapter, checks, {
			now: () => clock.now, generateId: () => `id-${++clock.id}`, ...options,
		}));
		const runner = createRunner();
		return { store, adapter, checks, clock, runner, createRunner };
	}

	function invocation(run: WorkflowRun): WorkflowInvocation {
		assert.ok(run.assignment);
		return { runId: run.id, assignmentId: run.assignment.id, turnId: run.assignment.turnId };
	}

	async function current(store: TestWorkflowStore, run: WorkflowRun): Promise<WorkflowRun> {
		return (await store.getRun(run.id))!;
	}

	const startOptions = { session: 'session', chat: 'chat', task: 'Implement the task', snapshot: makeSnapshot(), stopAfter: 'second' };

	function snapshotWithMissingInputs(checkpointId = 'second'): WorkflowSnapshot {
		const repository = { type: 'string', format: 'uri', minLength: 1 } as const;
		return {
			...makeSnapshot(),
			inputSchema: {
				type: 'object', properties: { repository, later: { type: 'string', minLength: 1 } },
				required: ['repository', 'later'], additionalProperties: false,
			},
			checkpoints: makeSnapshot().checkpoints.map(checkpoint => checkpoint.id === checkpointId ? {
				...checkpoint,
				inputs: { repository: { input: 'repository' } },
				type: { ...checkpoint.type, inputSchema: { type: 'object', properties: { repository }, required: ['repository'], additionalProperties: false } },
			} : checkpoint),
		};
	}

	test('later missing inputs atomically preserve accepted proof and wait without polling', async () => {
		const { runner, store, adapter } = fixture();
		const first = await runner.start({ ...startOptions, snapshot: snapshotWithMissingInputs() });
		const result = await runner.prove(invocation(first), proof);
		const blocked = await current(store, first);
		assert.deepStrictEqual({
			result: result.kind, status: blocked.status, receipts: blocked.receipts.map(receipt => receipt.checkpointId),
			request: blocked.inputRequest, pending: blocked.pendingAssignment, wake: blocked.nextWakeAt,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, {
			result: 'accepted', status: 'blocked', receipts: ['first'],
			request: { checkpointId: 'second', keys: ['repository'] }, pending: undefined, wake: undefined,
			dispatches: ['first'],
		});
	});

	test('progress keeps the last dispatched checkpoint while the next awaits inputs or dispatch', async () => {
		const { runner, store, adapter, clock } = fixture();
		const first = await runner.start({ ...startOptions, snapshot: snapshotWithMissingInputs() });
		const sent = getWorkflowProgress(first);
		await runner.prove(invocation(first), proof);
		await runner.onTurnEnd(invocation(first), 'completed');
		const blocked = await current(store, first);
		const waitingForInputs = getWorkflowProgress(blocked);
		adapter.readiness = { kind: 'busy' };
		const supplied = await runner.control({ kind: 'provideInputs', runId: blocked.id, revision: blocked.revision, inputs: { repository: 'https://github.com/example/project' } });
		const waitingForDispatch = getWorkflowProgress(supplied);
		adapter.readiness = { kind: 'ready' };
		clock.now = supplied.nextWakeAt!;
		await runner.wakeDue();
		const next = getWorkflowProgress(await current(store, first));
		assert.deepStrictEqual([sent, waitingForInputs, waitingForDispatch, next].map(progress => ({
			checkpoint: progress.checkpointId, caption: progress.lastDispatchedCheckpointLabel,
		})), [
			{ checkpoint: 'first', caption: 'first' },
			{ checkpoint: 'second', caption: 'first' },
			{ checkpoint: 'second', caption: 'first' },
			{ checkpoint: 'second', caption: 'second' },
		]);
	});

	test('missing first inputs survive restart and only explicit values admit a turn', async () => {
		const { runner, store, adapter, createRunner } = fixture();
		const blocked = await runner.start({ ...startOptions, snapshot: snapshotWithMissingInputs('first'), stopAfter: 'first' });
		runner.dispose();
		const restarted = createRunner();
		await restarted.recover();
		await restarted.wakeDue();
		assert.deepStrictEqual({ request: blocked.inputRequest, firstTurns: blocked.firstTurns, dispatches: adapter.dispatches.length, due: store.dueIndex.size }, {
			request: { checkpointId: 'first', keys: ['repository'] }, firstTurns: {}, dispatches: 0, due: 0,
		});
		const supplied = await restarted.control({ kind: 'provideInputs', runId: blocked.id, revision: blocked.revision, inputs: { repository: 'https://github.com/example/project' } });
		assert.deepStrictEqual({
			status: supplied.status, request: supplied.inputRequest, stop: supplied.stopAfter, inputs: supplied.assignment?.inputs,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, { status: 'running', request: undefined, stop: 'first', inputs: { repository: 'https://github.com/example/project' }, dispatches: ['first'] });
	});

	test('supplying later inputs waits for the previous turn to end', async () => {
		const { runner, store, adapter } = fixture();
		const first = await runner.start({ ...startOptions, snapshot: snapshotWithMissingInputs() });
		await runner.prove(invocation(first), proof);
		const blocked = await current(store, first);
		await runner.control({ kind: 'provideInputs', runId: first.id, revision: blocked.revision, inputs: { repository: 'https://github.com/example/project' } });
		assert.deepStrictEqual(adapter.dispatches.map(call => call.assignment.checkpointId), ['first']);
		await runner.onTurnEnd(invocation(first), 'completed');
		assert.deepStrictEqual(adapter.dispatches.map(call => ({ checkpoint: call.assignment.checkpointId, inputs: call.assignment.inputs })), [
			{ checkpoint: 'first', inputs: {} }, { checkpoint: 'second', inputs: { repository: 'https://github.com/example/project' } },
		]);
	});

	test('inputs beyond the stopping point are requested only after extending it', async () => {
		const { runner, store, adapter } = fixture();
		const first = await runner.start({ ...startOptions, stopAfter: 'first', snapshot: snapshotWithMissingInputs() });
		await runner.prove(invocation(first), proof);
		await runner.onTurnEnd(invocation(first), 'completed');
		const stopped = await current(store, first);
		const blocked = await runner.control({ kind: 'setStopAfter', runId: first.id, revision: stopped.revision, checkpointId: 'second' });
		const movedBack = await runner.control({ kind: 'setStopAfter', runId: first.id, revision: blocked.revision, checkpointId: 'first' });
		await assert.rejects(runner.control({ kind: 'provideInputs', runId: first.id, revision: movedBack.revision, inputs: { repository: 'https://github.com/example/project' } }), /not waiting/);
		assert.deepStrictEqual({
			stopped: { status: stopped.status, request: stopped.inputRequest },
			blocked: { status: blocked.status, request: blocked.inputRequest },
			movedBack: { status: movedBack.status, request: movedBack.inputRequest },
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, {
			stopped: { status: 'stopped', request: undefined },
			blocked: { status: 'blocked', request: { checkpointId: 'second', keys: ['repository'] } },
			movedBack: { status: 'stopped', request: undefined },
			dispatches: ['first'],
		});
	});

	test('input submission rejects invalid, missing, unrequested, stale and revoked values', async () => {
		const { runner, adapter } = fixture();
		const blocked = await runner.start({ ...startOptions, snapshot: snapshotWithMissingInputs('first') });
		const invalidInputs: WorkflowObject[] = [{}, { repository: 42 }, { repository: 'not a URI' }, { repository: 'https://github.com/example/project', later: 'Not requested' }];
		for (const inputs of invalidInputs) {
			await assert.rejects(runner.control({ kind: 'provideInputs', runId: blocked.id, revision: blocked.revision, inputs }));
		}
		const paused = await runner.control({ kind: 'pause', runId: blocked.id, revision: blocked.revision });
		await assert.rejects(runner.control({ kind: 'provideInputs', runId: blocked.id, revision: blocked.revision, inputs: {} }), WorkflowConflictError);
		await assert.rejects(runner.control({ kind: 'provideInputs', runId: paused.id, revision: paused.revision, inputs: {} }), /not waiting/);
		const resumed = await runner.control({ kind: 'resume', runId: paused.id, revision: paused.revision });
		const cancelled = await runner.control({ kind: 'cancel', runId: resumed.id, revision: resumed.revision });
		await assert.rejects(runner.control({ kind: 'provideInputs', runId: cancelled.id, revision: cancelled.revision, inputs: {} }), /not waiting/);
		assert.deepStrictEqual({ resumed: resumed.inputRequest, cancelled: cancelled.inputRequest, dispatches: adapter.dispatches.length }, {
			resumed: { checkpointId: 'first', keys: ['repository'] }, cancelled: undefined, dispatches: 0,
		});
	});

	test('resuming with an unfinished previous turn does not lose a pending input request', async () => {
		const { runner, store, adapter } = fixture();
		const first = await runner.start({ ...startOptions, snapshot: snapshotWithMissingInputs() });
		await runner.prove(invocation(first), proof);
		const blocked = await current(store, first);
		const paused = await runner.control({ kind: 'pause', runId: blocked.id, revision: blocked.revision });
		const resumed = await runner.control({ kind: 'resume', runId: paused.id, revision: paused.revision });
		await runner.onTurnEnd(invocation(first), 'completed');
		assert.deepStrictEqual({
			status: resumed.status, request: (await current(store, first)).inputRequest, dispatches: adapter.dispatches.length,
		}, { status: 'blocked', request: { checkpointId: 'second', keys: ['repository'] }, dispatches: 1 });
	});

	test('start checks wait for required inputs rather than evaluating an incomplete binding', async () => {
		const { runner, checks } = fixture();
		const checked: WorkflowObject[] = [];
		disposables.add(checks.register({ id: 'test.start', evaluate: async context => { checked.push(context.inputs); return { kind: 'satisfied', output: {} }; } }));
		const snapshot = snapshotWithMissingInputs('first');
		const blocked = await runner.start({
			...startOptions, snapshot: {
				...snapshot,
				checkpoints: snapshot.checkpoints.map(checkpoint => checkpoint.id === 'first' ? {
					...checkpoint, type: { ...checkpoint.type, startCondition: { check: 'test.start', inputs: { repository: { input: 'repository' } } } },
				} : checkpoint),
			}
		});
		assert.deepStrictEqual(checked, []);
		await runner.control({ kind: 'provideInputs', runId: blocked.id, revision: blocked.revision, inputs: { repository: 'https://github.com/example/project' } });
		assert.deepStrictEqual(checked, [{ repository: 'https://github.com/example/project' }]);
	});

	test('dispatches only checkpoint instructions, proof requirements and protocol when inputs are empty', async () => {
		const { runner, adapter } = fixture();
		await runner.start(startOptions);
		const message = adapter.dispatches[0].message;
		assert.deepStrictEqual({
			sections: message.match(/^\[[^\]]+\]$/gm),
			instructions: message.includes(startOptions.snapshot.checkpoints[0].instructions),
			originalTask: message.includes(startOptions.task),
			emptyInputs: message.includes('[Inputs]'),
		}, {
			sections: ['[Checkpoint instructions]', '[Proof schema]', '[Fixed workflow protocol]'],
			instructions: true, originalTask: false, emptyInputs: false,
		});
	});

	test('inclusive stopping boundary and atomic receipt plus intent; next turn waits for turn end', async () => {
		const { runner, store, adapter } = fixture();
		const first = await runner.start(startOptions);
		const result = await runner.prove(invocation(first), proof);
		const accepted = await current(store, first);
		assert.deepStrictEqual({
			result: result.kind,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
			receipts: accepted.receipts.map(receipt => receipt.checkpointId),
			pending: accepted.pendingAssignment?.checkpointId,
			atomic: store.updates.filter(run => run.receipts.length === 1).every(run => run.pendingAssignment?.checkpointId === 'second'),
		}, { result: 'accepted', dispatches: ['first'], receipts: ['first'], pending: 'second', atomic: true });
		await runner.onTurnEnd(invocation(first), 'completed');
		const second = await current(store, first);
		await runner.prove(invocation(second), proof);
		await runner.onTurnEnd(invocation(second), 'completed');
		const stopped = await current(store, first);
		assert.deepStrictEqual({
			status: stopped.status, receipts: stopped.receipts.map(receipt => receipt.checkpointId),
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId), pending: stopped.pendingAssignment, wake: stopped.nextWakeAt,
		}, { status: 'stopped', receipts: ['first', 'second'], dispatches: ['first', 'second'], pending: undefined, wake: undefined });
	});

	test('extending the stopping point preserves current proof and admits only explicitly allowed work', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start({ ...startOptions, stopAfter: 'first' });
		await runner.control({ kind: 'setStopAfter', runId: run.id, revision: run.revision, checkpointId: 'third' });
		await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		assert.deepStrictEqual({
			receipts: (await current(store, run)).receipts.length,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, { receipts: 1, dispatches: ['first', 'second'] });
	});

	test('stale turn and late assignment proof cannot advance a newer checkpoint', async () => {
		const { runner, store } = fixture();
		const first = await runner.start(startOptions);
		const wrongTurn = await runner.prove({ ...invocation(first), turnId: 'foreign-turn' }, proof);
		await runner.prove(invocation(first), proof);
		await runner.onTurnEnd(invocation(first), 'completed');
		const second = await current(store, first);
		const wrongAssignment = await runner.prove({ ...invocation(second), assignmentId: first.assignment!.id }, proof);
		const lateDifferent = await runner.prove(invocation(first), { summary: 'Changed' });
		assert.deepStrictEqual([wrongTurn.kind, wrongAssignment.kind, lateDifferent.kind, (await current(store, first)).receipts.length], ['stale_assignment', 'stale_assignment', 'rejected', 1]);
	});

	test('identical proof remains idempotent after advancement and restart', async () => {
		const { runner, store, createRunner } = fixture();
		const run = await runner.start(startOptions);
		const accepted = await runner.prove(invocation(run), proof);
		const duplicate = await runner.prove(invocation(run), { summary: 'Done' });
		await runner.onTurnEnd(invocation(run), 'completed');
		runner.dispose();
		const restarted = createRunner();
		const restored = await restarted.prove(invocation(run), proof);
		assert.deepStrictEqual({ accepted, duplicate, restored, count: (await current(store, run)).receipts.length }, {
			accepted, duplicate: accepted, restored: accepted, count: 1,
		});
	});

	test('reported outputs are proof, while checked outputs are canonical and labeled checked', async () => {
		const { runner, store, checks } = fixture();
		let calls = 0;
		disposables.add(checks.register({
			id: 'test.check', evaluate: async () => {
				calls++;
				return { kind: 'satisfied', output: { summary: 'Canonical' }, evidence: [{ kind: 'issue', uri: 'https://example.org/issues/1', label: 'Issue' }] };
			}
		}));
		const snapshot = makeSnapshot([makeType('first'), makeType('second', { completion: { kind: 'checked', check: { check: 'test.check' } }, outputSchema: proofSchema })]);
		const first = await runner.start({ ...startOptions, snapshot });
		await runner.prove(invocation(first), proof);
		await runner.onTurnEnd(invocation(first), 'completed');
		const second = await current(store, first);
		await runner.prove(invocation(second), proof);
		assert.deepStrictEqual({
			calls,
			receipts: (await current(store, first)).receipts.map(receipt => ({ proof: receipt.proof, output: receipt.output, provenance: receipt.provenance, checkId: receipt.checkId })),
		}, {
			calls: 1, receipts: [
				{ proof, output: proof, provenance: 'reported', checkId: undefined },
				{ proof, output: { summary: 'Canonical' }, provenance: 'checked', checkId: 'test.check' },
			]
		});
	});

	test('pause revokes a proof awaiting verification without waiting for the verifier', async () => {
		const { runner, store, checks, adapter } = fixture();
		const entered = new DeferredPromise<void>();
		const result = new DeferredPromise<WorkflowCheckResult>();
		disposables.add(checks.register({
			id: 'test.check', evaluate: async () => {
				entered.complete();
				return result.p;
			}
		}));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const verification = runner.prove(invocation(run), proof);
		await entered.p;
		const verifying = await current(store, run);
		const paused = await runner.control({ kind: 'pause', runId: run.id, revision: verifying.revision });
		result.complete({ kind: 'satisfied', output: proof });
		assert.deepStrictEqual({
			status: paused.status, result: (await verification).kind,
			receipts: (await current(store, run)).receipts.length, cancellations: adapter.cancellations.length, dispatches: adapter.dispatches.length,
		}, { status: 'paused', result: 'stale_assignment', receipts: 0, cancellations: 1, dispatches: 1 });
	});

	test('stop extension during asynchronous verification does not stale valid proof', async () => {
		const { runner, store, checks } = fixture();
		const entered = new DeferredPromise<void>();
		const result = new DeferredPromise<WorkflowCheckResult>();
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => { entered.complete(); return result.p; } }));
		const run = await runner.start({ ...startOptions, stopAfter: 'first', snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const verification = runner.prove(invocation(run), proof);
		await entered.p;
		await runner.control({ kind: 'setStopAfter', runId: run.id, revision: (await current(store, run)).revision, checkpointId: 'second' });
		result.complete({ kind: 'satisfied', output: proof });
		assert.deepStrictEqual({ result: (await verification).kind, pending: (await current(store, run)).pendingAssignment?.checkpointId }, { result: 'accepted', pending: 'second' });
	});

	test('simultaneous identical checked proofs run one verifier and commit one receipt', async () => {
		const { runner, store, checks } = fixture();
		const entered = new DeferredPromise<void>();
		const result = new DeferredPromise<WorkflowCheckResult>();
		let calls = 0;
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => { calls++; entered.complete(); return result.p; } }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const first = runner.prove(invocation(run), proof);
		await entered.p;
		const second = runner.prove(invocation(run), proof);
		result.complete({ kind: 'satisfied', output: proof });
		const responses = await Promise.all([first, second]);
		assert.deepStrictEqual({ responses: responses.map(result => result.kind), calls, receipts: (await current(store, run)).receipts.length }, { responses: ['accepted', 'accepted'], calls: 1, receipts: 1 });
	});

	test('false start conditions wait durably without an agent turn and recover when due', async () => {
		const { runner, store, adapter, checks, clock, createRunner } = fixture();
		let ready = false;
		const states: (WorkflowObject | undefined)[] = [];
		disposables.add(checks.register({
			id: 'test.release', evaluate: async context => {
				states.push(context.previousState);
				return ready ? { kind: 'satisfied', output: {} } : { kind: 'waiting', reason: 'Not released', retryAfterMs: 5000, state: { release: 'pending' } };
			}
		}));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]) });
		assert.deepStrictEqual({ status: run.status, dispatches: adapter.dispatches.length, firstTurns: run.firstTurns, nextWakeAt: run.nextWakeAt }, { status: 'waiting', dispatches: 0, firstTurns: {}, nextWakeAt: 6000 });
		runner.dispose();
		const restarted = createRunner();
		await restarted.recover();
		clock.now = 6000;
		ready = true;
		await Promise.all([restarted.wakeDue(), restarted.wakeDue(), restarted.recover()]);
		assert.deepStrictEqual({
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId), states,
			activityAt: (await current(store, run)).activityAt,
		}, { dispatches: ['first'], states: [undefined, { release: 'pending' }], activityAt: 1000 });
	});

	test('an already satisfied start condition admits one first turn, not a completion receipt', async () => {
		const { runner, adapter, checks } = fixture();
		disposables.add(checks.register({ id: 'test.release', evaluate: async () => ({ kind: 'satisfied', output: {} }) }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]) });
		assert.deepStrictEqual({ status: run.status, firstTurns: Object.keys(run.firstTurns), receipts: run.receipts.length, dispatches: adapter.dispatches.length }, { status: 'running', firstTurns: ['first'], receipts: 0, dispatches: 1 });
	});

	test('checked start-condition evidence survives separately from reported completion and restart', async () => {
		const { runner, checks, clock, createRunner } = fixture();
		const output: WorkflowObject = {
			repository: 'https://github.com/example/repository',
			integratedCommit: 'a'.repeat(40),
			release: 'https://github.com/example/repository/releases/tag/v1',
			releaseId: 17,
			releaseTag: 'v1',
			releaseCommit: 'b'.repeat(40),
			tagSha: 'c'.repeat(40),
			publishedAt: '2026-09-15T20:00:00Z',
		};
		const evidence: WorkflowEvidence[] = [{ kind: 'link', uri: 'https://github.com/example/repository/releases/tag/v1', label: 'Published release' }];
		disposables.add(checks.register({ id: 'test.release', evaluate: async () => ({ kind: 'satisfied', output, evidence }) }));
		const run = await runner.start({
			...startOptions, stopAfter: 'first',
			snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		clock.now = 2000;
		await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		runner.dispose();
		const restored = (await createRunner().getSessionRun(run.session))!;
		const observation = restored.startConditionReceipts![0];
		assert.deepStrictEqual({
			observations: restored.startConditionReceipts?.length,
			observation: {
				checkpointId: observation.checkpointId, assignmentId: observation.assignmentId, checkId: observation.checkId,
				output: observation.output, evidence: observation.evidence, provenance: observation.provenance, observedAt: observation.observedAt,
			},
			completion: { provenance: restored.receipts[0].provenance, output: restored.receipts[0].output, checkId: restored.receipts[0].checkId },
			completed: getWorkflowProgress(restored).completed,
			activityAt: restored.activityAt,
		}, {
			observations: 1,
			observation: { checkpointId: 'first', assignmentId: run.assignment!.id, checkId: 'test.release', output, evidence, provenance: 'checked', observedAt: 1000 },
			completion: { provenance: 'reported', output: proof, checkId: undefined },
			completed: 1, activityAt: 1000,
		});
	});

	test('start-condition observations stay bounded and cannot authorize delayed dispatch after restart', async () => {
		const { runner, checks, adapter, store, clock, createRunner } = fixture();
		let result: WorkflowCheckResult = { kind: 'satisfied', output: { release: 'old' } };
		const states: (WorkflowObject | undefined)[] = [];
		disposables.add(checks.register({
			id: 'test.release', evaluate: async context => {
				states.push(context.previousState);
				return result;
			}
		}));
		adapter.readiness = { kind: 'busy' };
		const run = await runner.start({
			...startOptions,
			snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		for (let retry = 0; retry < 3; retry++) {
			clock.now = (await current(store, run)).nextWakeAt!;
			await runner.wakeDue();
		}
		const queued = await current(store, run);
		runner.dispose();
		const restarted = createRunner();
		const state: WorkflowObject = { repository: 'https://github.com/example/repository', commit: 'a'.repeat(40), nextPage: 2 };
		result = { kind: 'waiting', reason: 'Release facts changed', retryAfterMs: 5000, state };
		adapter.readiness = { kind: 'ready' };
		clock.now = queued.nextWakeAt!;
		await restarted.recover();
		const waiting = await current(store, run);
		const dispatchesWhileWaiting = adapter.dispatches.length;
		result = { kind: 'satisfied', output: { release: 'new' } };
		clock.now = waiting.nextWakeAt!;
		await restarted.wakeDue();
		const admitted = await current(store, run);
		assert.deepStrictEqual({
			queuedObservations: queued.startConditionReceipts?.length,
			waitingStatus: waiting.status,
			historicalEvidence: waiting.startConditionReceipts,
			dispatchesWhileWaiting,
			completedWhileWaiting: waiting.receipts.length,
			firstTurnsWhileWaiting: waiting.firstTurns,
			latestObservation: admitted.startConditionReceipts?.map(receipt => receipt.output),
			previousState: states.at(-1),
			evaluations: states.length,
			dispatches: adapter.dispatches.length,
			activityAt: admitted.activityAt,
		}, {
			queuedObservations: 1, waitingStatus: 'waiting', historicalEvidence: queued.startConditionReceipts,
			dispatchesWhileWaiting: 0, completedWhileWaiting: 0, firstTurnsWhileWaiting: {},
			latestObservation: [{ release: 'new' }], previousState: state, evaluations: 6, dispatches: 1, activityAt: 1000,
		});
	});

	test('expired start-condition evidence is rechecked after delayed readiness and cannot admit changed facts', async () => {
		const { runner, checks, adapter, store, clock } = fixture({ startConditionMaxAgeMs: 1000 });
		const entered = new DeferredPromise<void>();
		const readiness = new DeferredPromise<{ kind: 'ready' }>();
		let satisfied = true;
		let evaluations = 0;
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => {
				evaluations++;
				return satisfied ? { kind: 'satisfied', output: { release: 'old' } } : { kind: 'waiting', reason: 'Release unavailable', retryAfterMs: 5000 };
			}
		}));
		adapter.onCanDispatch = async () => { entered.complete(); return readiness.p; };
		const starting = runner.start({
			...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		await entered.p;
		const observed = [...store.runs.values()][0];
		clock.now += 1000;
		satisfied = false;
		readiness.complete({ kind: 'ready' });
		const waiting = await starting;
		assert.deepStrictEqual({
			status: waiting.status, evaluations, pendingId: waiting.pendingAssignment?.id,
			observations: waiting.startConditionReceipts, receipts: waiting.receipts,
			firstTurns: waiting.firstTurns, dispatches: adapter.dispatches.length, activityAt: waiting.activityAt,
		}, {
			status: 'waiting', evaluations: 2, pendingId: observed.pendingAssignment!.id,
			observations: observed.startConditionReceipts, receipts: [],
			firstTurns: {}, dispatches: 0, activityAt: 1000,
		});
	});

	test('delayed readiness refreshes checked start-condition output before dispatch without accumulating observations', async () => {
		const { runner, checks, adapter, clock } = fixture({ startConditionMaxAgeMs: 1000 });
		let evaluations = 0;
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => ({
				kind: 'satisfied', output: { releaseId: ++evaluations },
				evidence: [{ kind: 'link', uri: `https://example.org/releases/${evaluations}`, label: 'Release' }],
			})
		}));
		adapter.onCanDispatch = async () => { clock.now += 2000; return { kind: 'ready' }; };
		const run = await runner.start({
			...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		assert.deepStrictEqual({
			evaluations,
			observations: run.startConditionReceipts?.map(receipt => ({
				assignmentId: receipt.assignmentId, output: receipt.output, evidence: receipt.evidence, observedAt: receipt.observedAt,
			})),
			dispatchedObservations: adapter.dispatches[0].run.startConditionReceipts,
			receipts: run.receipts, firstTurns: run.firstTurns, activityAt: run.activityAt,
		}, {
			evaluations: 2,
			observations: [{
				assignmentId: run.assignment!.id, output: { releaseId: 2 },
				evidence: [{ kind: 'link', uri: 'https://example.org/releases/2', label: 'Release' }], observedAt: 3000,
			}],
			dispatchedObservations: run.startConditionReceipts,
			receipts: [], firstTurns: { first: run.assignment!.turnId }, activityAt: 1000,
		});
	});

	test('readiness within the start-condition age bound does not duplicate checks', async () => {
		const { runner, checks, adapter, clock } = fixture({ startConditionMaxAgeMs: 1000 });
		let evaluations = 0;
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => {
				evaluations++;
				return { kind: 'satisfied', output: {} };
			}
		}));
		adapter.onCanDispatch = async () => { clock.now += 999; return { kind: 'ready' }; };
		const run = await runner.start({
			...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		assert.deepStrictEqual({
			evaluations, dispatches: adapter.dispatches.length, observedAt: run.startConditionReceipts?.[0].observedAt, activityAt: run.activityAt,
		}, { evaluations: 1, dispatches: 1, observedAt: 1000, activityAt: 1000 });
	});

	test('pausing during delayed readiness prevents an expired start-condition recheck or dispatch', async () => {
		const { runner, checks, adapter, store, clock } = fixture({ startConditionMaxAgeMs: 1000 });
		const entered = new DeferredPromise<void>();
		const readiness = new DeferredPromise<{ kind: 'ready' }>();
		let evaluations = 0;
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => {
				evaluations++;
				return { kind: 'satisfied', output: {} };
			}
		}));
		adapter.onCanDispatch = async () => { entered.complete(); return readiness.p; };
		const starting = runner.start({
			...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		await entered.p;
		const observed = [...store.runs.values()][0];
		clock.now += 1000;
		await runner.control({ kind: 'pause', runId: observed.id, revision: observed.revision });
		readiness.complete({ kind: 'ready' });
		const paused = await starting;
		assert.deepStrictEqual({
			status: paused.status, evaluations, dispatches: adapter.dispatches.length, firstTurns: paused.firstTurns,
		}, { status: 'paused', evaluations: 1, dispatches: 0, firstTurns: {} });
	});

	test('start-condition evidence that ages while persisting cannot authorize a dispatch claim', async () => {
		const { runner, checks, adapter, store, clock } = fixture({ startConditionMaxAgeMs: 1000 });
		let evaluations = 0;
		const observations = new Set<string>();
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => ({
				kind: 'satisfied', output: { releaseId: ++evaluations },
			})
		}));
		store.afterUpdate = run => {
			const observation = run.startConditionReceipts?.[0];
			if (observation && !observations.has(observation.id)) {
				observations.add(observation.id);
				if (observations.size === 2) {
					clock.now += 1000;
				}
			}
		};
		adapter.onCanDispatch = async () => { clock.now += 1000; return { kind: 'ready' }; };
		const queued = await runner.start({
			...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		const queuedDispatches = adapter.dispatches.length;
		adapter.onCanDispatch = undefined;
		clock.now = queued.nextWakeAt!;
		await runner.wakeDue();
		const admitted = await current(store, queued);
		assert.deepStrictEqual({
			queuedDelivery: queued.pendingAssignment?.delivery, queuedAssignment: queued.assignment,
			queuedDispatches, queuedFirstTurns: queued.firstTurns,
			evaluations, assignmentId: admitted.assignment?.id, dispatches: adapter.dispatches.length, activityAt: admitted.activityAt,
		}, {
			queuedDelivery: 'pending', queuedAssignment: undefined, queuedDispatches: 0, queuedFirstTurns: {},
			evaluations: 3, assignmentId: queued.pendingAssignment!.id, dispatches: 1, activityAt: 1000,
		});
	});

	test('readiness cannot overwrite a newer owner start-condition wait with historical evidence', async () => {
		const { runner, checks, adapter, store, createRunner } = fixture();
		const entered = new DeferredPromise<void>();
		const readiness = new DeferredPromise<{ kind: 'ready' }>();
		let evaluations = 0;
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => {
				evaluations++;
				return evaluations === 1 ? { kind: 'satisfied', output: {} } : { kind: 'waiting', reason: 'Release unavailable', retryAfterMs: 5000 };
			}
		}));
		adapter.onCanDispatch = async () => { entered.complete(); return readiness.p; };
		const starting = runner.start({
			...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		});
		await entered.p;
		await createRunner().wakeDue();
		const waiting = [...store.runs.values()][0];
		readiness.complete({ kind: 'ready' });
		assert.deepStrictEqual({
			run: await starting, evaluations, dispatches: adapter.dispatches.length,
		}, { run: waiting, evaluations: 2, dispatches: 0 });
	});

	test('a recovered not-started dispatch rechecks its start condition instead of trusting its receipt', async () => {
		const { runner, checks, adapter, store, clock, createRunner } = fixture();
		let ready = true;
		let evaluations = 0;
		disposables.add(checks.register({
			id: 'test.release', evaluate: async () => {
				evaluations++;
				return ready ? { kind: 'satisfied', output: { release: 'old' } } : { kind: 'waiting', reason: 'Release unavailable', retryAfterMs: 5000 };
			}
		}));
		adapter.onDispatch = async () => { store.failWrites = true; };
		await assert.rejects(runner.start({
			...startOptions,
			snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]),
		}), /Write transaction failed/);
		const run = [...store.runs.values()][0];
		runner.dispose();
		store.failWrites = false;
		adapter.onDispatch = undefined;
		adapter.reconcileResult = 'notStarted';
		ready = false;
		clock.now = run.nextWakeAt!;
		await createRunner().recover();
		const waiting = await current(store, run);
		assert.deepStrictEqual({
			status: waiting.status, evaluations, observations: waiting.startConditionReceipts?.length,
			completions: waiting.receipts.length, firstTurns: waiting.firstTurns, dispatchAttempts: adapter.dispatches.length,
		}, { status: 'waiting', evaluations: 2, observations: 1, completions: 0, firstTurns: {}, dispatchAttempts: 1 });
	});

	test('completion waits retain original proof and identity across restart with no held turn', async () => {
		const { runner, store, checks, clock, adapter, createRunner } = fixture();
		let ready = false;
		const proofs: (WorkflowObject | undefined)[] = [];
		disposables.add(checks.register({
			id: 'test.check', evaluate: async context => {
				proofs.push(context.proof);
				return ready ? { kind: 'satisfied', output: proof } : { kind: 'waiting', reason: 'CI pending', retryAfterMs: 5000 };
			}
		}));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const waiting = await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		const parked = await current(store, run);
		runner.dispose();
		const restarted = createRunner();
		clock.now = 6000;
		ready = true;
		await restarted.recover();
		assert.deepStrictEqual({
			result: waiting.kind, parked: parked.assignment?.delivery,
			proofs, receiptTurn: (await current(store, run)).receipts[0].turnId,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, { result: 'waiting', parked: 'ended', proofs: [proof, proof], receiptTurn: run.assignment!.turnId, dispatches: ['first', 'second'] });
	});

	test('rejected proof is cached, repair is bounded and first-turn links survive retries', async () => {
		const { runner, store, checks, adapter } = fixture({ maxRepairAttempts: 1 });
		let calls = 0;
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => { calls++; return { kind: 'rejected', reason: 'Repair current head' }; } }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const rejection = await runner.prove(invocation(run), proof);
		const duplicate = await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		const repair = await current(store, run);
		const exhausted = await runner.prove(invocation(repair), proof);
		assert.deepStrictEqual({
			results: [rejection.kind, duplicate.kind, exhausted.kind], calls,
			reason: repair.assignment?.reason, firstTurn: repair.firstTurns.first,
			dispatches: adapter.dispatches.length, finalStatus: (await current(store, run)).status,
		}, { results: ['rejected', 'rejected', 'blocked'], calls: 2, reason: 'repair', firstTurn: run.assignment!.turnId, dispatches: 2, finalStatus: 'blocked' });
	});

	test('missing proof gets one reminder, never an unbounded automatic loop', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start(startOptions);
		await runner.onTurnEnd(invocation(run), 'completed');
		const reminder = await current(store, run);
		await runner.onTurnEnd(invocation(reminder), 'completed');
		const blocked = await current(store, run);
		assert.deepStrictEqual({
			reason: reminder.assignment?.reason, firstTurn: blocked.firstTurns.first,
			status: blocked.status, dispatches: adapter.dispatches.length, receipts: blocked.receipts.length,
		}, { reason: 'missing_proof', firstTurn: run.assignment!.turnId, status: 'blocked', dispatches: 2, receipts: 0 });
	});

	test('pause and cancel revoke pending next-turn intent without undoing accepted receipts', async () => {
		for (const kind of ['pause', 'cancel'] as const) {
			const { runner, store, adapter } = fixture();
			const run = await runner.start(startOptions);
			await runner.prove(invocation(run), proof);
			const accepted = await current(store, run);
			await runner.control({ kind, runId: run.id, revision: accepted.revision });
			await runner.onTurnEnd(invocation(run), 'completed');
			const stopped = await current(store, run);
			assert.deepStrictEqual({ status: stopped.status, receipts: stopped.receipts.length, pending: stopped.pendingAssignment, dispatches: adapter.dispatches.length }, {
				status: kind === 'pause' ? 'paused' : 'cancelled', receipts: 1, pending: undefined, dispatches: 1,
			});
		}
	});

	test('resuming a paused start-condition wait keeps it durable and does not strand its intent', async () => {
		const { runner, store, adapter, checks, clock } = fixture();
		let ready = false;
		disposables.add(checks.register({ id: 'test.release', evaluate: async () => ready ? { kind: 'satisfied', output: {} } : { kind: 'waiting', reason: 'Not released', retryAfterMs: 5000 } }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]) });
		const paused = await runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
		const resumed = await runner.control({ kind: 'resume', runId: run.id, revision: paused.revision });
		ready = true;
		clock.now = resumed.nextWakeAt!;
		await runner.wakeDue();
		assert.deepStrictEqual({
			resumed: resumed.status, pending: resumed.pendingAssignment?.checkpointId,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId), firstTurns: Object.keys((await current(store, run)).firstTurns),
		}, { resumed: 'waiting', pending: 'first', dispatches: ['first'], firstTurns: ['first'] });
	});

	test('explicit resume rechecks a saved proof without reinstating the revoked tool identity', async () => {
		const { runner, store, adapter, checks, clock } = fixture();
		let ready = false;
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => ready ? { kind: 'satisfied', output: proof } : { kind: 'waiting', reason: 'CI pending', retryAfterMs: 5000 } }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		const paused = await runner.control({ kind: 'pause', runId: run.id, revision: (await current(store, run)).revision });
		const resumed = await runner.control({ kind: 'resume', runId: run.id, revision: paused.revision });
		const revoked = await runner.prove(invocation(run), proof);
		ready = true;
		clock.now = resumed.nextWakeAt!;
		await runner.wakeDue();
		assert.deepStrictEqual({
			revoked: revoked.kind, resumed: resumed.status,
			receiptTurn: (await current(store, run)).receipts[0].turnId,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, { revoked: 'stale_assignment', resumed: 'waiting', receiptTurn: run.assignment!.turnId, dispatches: ['first', 'second'] });
	});

	test('resume after cancellation of an owned turn uses a new identity and retains its first link', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start(startOptions);
		await runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
		await runner.onTurnEnd(invocation(run), 'cancelled');
		const resumed = await runner.control({ kind: 'resume', runId: run.id, revision: (await current(store, run)).revision });
		assert.deepStrictEqual({
			oldProof: (await runner.prove(invocation(run), proof)).kind,
			newIdentity: resumed.assignment!.id !== run.assignment!.id,
			firstTurn: resumed.firstTurns.first, reason: resumed.assignment!.reason, dispatches: adapter.dispatches.length,
		}, { oldProof: 'stale_assignment', newIdentity: true, firstTurn: run.assignment!.turnId, reason: 'resume', dispatches: 2 });
	});

	test('late cancellation from a paused attempt does not cancel an explicit resume', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start(startOptions);
		const paused = await runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
		await runner.control({ kind: 'resume', runId: run.id, revision: paused.revision });
		await runner.onTurnEnd(invocation(run), 'cancelled');
		const resumed = await current(store, run);
		assert.deepStrictEqual({ status: resumed.status, reason: resumed.assignment?.reason, fresh: resumed.assignment!.id !== run.assignment!.id, dispatches: adapter.dispatches.length }, {
			status: 'running', reason: 'resume', fresh: true, dispatches: 2,
		});
	});

	test('synchronous dispatch lifecycle callbacks do not deadlock or share a checkpoint turn', async () => {
		const { runner, adapter } = fixture();
		adapter.onDispatch = async run => {
			await runner.prove(invocation(run), proof);
			await runner.onTurnEnd(invocation(run), 'completed');
		};
		const stopped = await runner.start(startOptions);
		assert.deepStrictEqual({
			status: stopped.status, checkpoints: adapter.dispatches.map(call => call.assignment.checkpointId),
			distinctTurns: new Set(adapter.dispatches.map(call => call.assignment.turnId)).size,
		}, { status: 'stopped', checkpoints: ['first', 'second'], distinctTurns: 2 });
	});

	test('shortening the stop revokes an excluded checkpoint; re-extending requires a fresh assignment', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start(startOptions);
		await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		const second = await current(store, run);
		await runner.control({ kind: 'setStopAfter', runId: run.id, revision: second.revision, checkpointId: 'first' });
		await runner.onTurnEnd(invocation(second), 'cancelled');
		const stopped = await current(store, run);
		const extended = await runner.control({ kind: 'setStopAfter', runId: run.id, revision: stopped.revision, checkpointId: 'second' });
		assert.deepStrictEqual({
			stopped: stopped.status, oldProof: (await runner.prove(invocation(second), proof)).kind,
			fresh: extended.assignment!.id !== second.assignment!.id,
			dispatches: adapter.dispatches.map(call => call.assignment.checkpointId),
		}, { stopped: 'stopped', oldProof: 'stale_assignment', fresh: true, dispatches: ['first', 'second', 'second'] });
	});

	test('pause wins while provider readiness is awaited and creates no first-turn link', async () => {
		const { runner, adapter, store } = fixture();
		const entered = new DeferredPromise<void>();
		const ready = new DeferredPromise<void>();
		adapter.onCanDispatch = async () => { entered.complete(); await ready.p; return { kind: 'ready' }; };
		const starting = runner.start(startOptions);
		await entered.p;
		const run = [...store.runs.values()][0];
		await runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
		ready.complete();
		const paused = await starting;
		assert.deepStrictEqual({ status: paused.status, dispatches: adapter.dispatches.length, firstTurns: paused.firstTurns }, { status: 'paused', dispatches: 0, firstTurns: {} });
	});

	test('pause during dispatch is reconciled with cancellation after admission', async () => {
		const { runner, adapter, store } = fixture();
		const entered = new DeferredPromise<void>();
		const dispatched = new DeferredPromise<void>();
		adapter.onDispatch = async () => { entered.complete(); await dispatched.p; };
		const starting = runner.start(startOptions);
		await entered.p;
		const run = [...store.runs.values()][0];
		await runner.control({ kind: 'pause', runId: run.id, revision: run.revision });
		dispatched.complete();
		const paused = await starting;
		assert.deepStrictEqual({
			status: paused.status, revoked: paused.assignment?.revoked, pending: paused.pendingAssignment,
			dispatches: adapter.dispatches.length, cancellations: adapter.cancellations.length,
		}, { status: 'paused', revoked: true, pending: undefined, dispatches: 1, cancellations: 2 });
	});

	test('busy user work defers a durable intent, and concurrent owners dispatch it only once', async () => {
		const { runner, adapter, clock, createRunner } = fixture();
		adapter.readiness = { kind: 'busy' };
		const run = await runner.start(startOptions);
		assert.deepStrictEqual({ pending: run.pendingAssignment?.checkpointId, firstTurns: run.firstTurns, dispatches: adapter.dispatches.length }, { pending: 'first', firstTurns: {}, dispatches: 0 });
		adapter.readiness = { kind: 'ready' };
		clock.now = run.nextWakeAt!;
		await Promise.all([runner.wakeDue(), createRunner().wakeDue()]);
		assert.strictEqual(adapter.dispatches.length, 1);
	});

	test('a positively pre-admission busy race retries the same intent without a phantom turn', async () => {
		const { runner, adapter, store, clock } = fixture();
		adapter.onDispatch = async () => { throw new WorkflowDispatchBusyError(); };
		const deferred = await runner.start(startOptions);
		adapter.onDispatch = undefined;
		clock.now = deferred.nextWakeAt!;
		await runner.wakeDue();
		const admitted = await current(store, deferred);
		assert.deepStrictEqual({
			deferredStatus: deferred.status, deferredAssignment: deferred.assignment, firstTurnsBeforeAdmission: deferred.firstTurns,
			attemptIds: adapter.dispatches.map(call => call.assignment.id),
			admittedId: admitted.assignment?.id, firstTurn: admitted.firstTurns.first, activityAt: admitted.activityAt,
		}, {
			deferredStatus: 'running', deferredAssignment: undefined, firstTurnsBeforeAdmission: {},
			attemptIds: [deferred.pendingAssignment!.id, deferred.pendingAssignment!.id],
			admittedId: deferred.pendingAssignment!.id, firstTurn: deferred.pendingAssignment!.turnId, activityAt: 1000,
		});
	});

	test('an unclassified dispatch busy error remains uncertain and is never automatically replayed', async () => {
		const { runner, adapter, store, clock } = fixture();
		adapter.onDispatch = async () => { throw new Error('Session busy'); };
		const run = await runner.start(startOptions);
		clock.now += 60000;
		await runner.wakeDue();
		assert.deepStrictEqual({
			status: (await current(store, run)).status, pending: run.pendingAssignment, wake: run.nextWakeAt, attempts: adapter.dispatches.length,
		}, { status: 'blocked', pending: undefined, wake: undefined, attempts: 1 });
	});

	test('a claimed busy race cannot undo proof accepted during actual admission', async () => {
		const { runner, adapter } = fixture();
		adapter.onDispatch = async run => {
			await runner.prove(invocation(run), proof);
			throw new WorkflowDispatchBusyError();
		};
		const run = await runner.start(startOptions);
		assert.deepStrictEqual({
			status: run.status, receipts: run.receipts.length, pending: run.pendingAssignment, attempts: adapter.dispatches.length,
		}, { status: 'blocked', receipts: 1, pending: undefined, attempts: 1 });
	});

	test('pause revokes the intent before a pre-admission busy error returns', async () => {
		const { runner, adapter, store } = fixture();
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		adapter.onDispatch = async () => {
			entered.complete();
			await release.p;
			throw new WorkflowDispatchBusyError();
		};
		const starting = runner.start(startOptions);
		await entered.p;
		const dispatching = [...store.runs.values()][0];
		await runner.control({ kind: 'pause', runId: dispatching.id, revision: dispatching.revision });
		release.complete();
		const paused = await starting;
		assert.deepStrictEqual({ status: paused.status, pending: paused.pendingAssignment, firstTurns: paused.firstTurns }, { status: 'paused', pending: undefined, firstTurns: {} });
	});

	test('invalid inputs, proof and corrupt snapshots never authorize a turn', async () => {
		const { runner, adapter, store } = fixture();
		const snapshot = { ...startOptions.snapshot, inputSchema: proofSchema };
		await assert.rejects(runner.start({ ...startOptions, snapshot, inputs: { summary: 42 } }), WorkflowValidationError);
		await assert.rejects(runner.start({ ...startOptions, stopAfter: 'missing' }), WorkflowValidationError);
		assert.deepStrictEqual({ dispatches: adapter.dispatches.length, stored: store.runs.size }, { dispatches: 0, stored: 0 });
		const run = await runner.start(startOptions);
		assert.strictEqual((await runner.prove(invocation(run), {})).kind, 'rejected');
		store.seed({ ...run, checkpointIndex: 2, nextWakeAt: 0 });
		await assert.rejects(runner.recover(), AggregateError);
		assert.strictEqual(adapter.dispatches.length, 1);
	});

	test('failed receipt transaction cannot report success or leak half a next intent', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start(startOptions);
		store.failWrites = true;
		await assert.rejects(runner.prove(invocation(run), proof), /Write transaction failed/);
		store.failWrites = false;
		const unchanged = await current(store, run);
		assert.deepStrictEqual({ receipts: unchanged.receipts.length, pending: unchanged.pendingAssignment, dispatches: adapter.dispatches.length }, { receipts: 0, pending: undefined, dispatches: 1 });
		assert.strictEqual((await runner.prove(invocation(run), proof)).kind, 'accepted');
	});

	test('a committed receipt remains authoritative when its tool acknowledgement is lost', async () => {
		const { runner, store, createRunner } = fixture();
		const run = await runner.start(startOptions);
		store.afterUpdate = updated => {
			if (updated.receipts.length) {
				store.failReads = true;
			}
		};
		await assert.rejects(runner.prove(invocation(run), proof), /Store is unavailable/);
		store.afterUpdate = undefined;
		store.failReads = false;
		runner.dispose();
		const duplicate = await createRunner().prove(invocation(run), proof);
		const persisted = await current(store, run);
		assert.deepStrictEqual({ result: duplicate.kind, receipts: persisted.receipts.length, pending: persisted.pendingAssignment?.checkpointId }, {
			result: 'accepted', receipts: 1, pending: 'second',
		});
	});

	test('a lost in-flight verification is retried read-only from its durable claim after restart', async () => {
		const { runner, store, adapter, checks, clock, createRunner } = fixture();
		const entered = new DeferredPromise<void>();
		const finish = new DeferredPromise<WorkflowCheckResult>();
		let calls = 0;
		disposables.add(checks.register({
			id: 'test.check', evaluate: async () => {
				if (++calls === 1) {
					entered.complete();
					return finish.p;
				}
				return { kind: 'satisfied', output: proof };
			}
		}));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const checking = runner.prove(invocation(run), proof);
		await entered.p;
		const claim = await current(store, run);
		runner.dispose();
		await assert.rejects(checking, /disposed/);
		finish.complete({ kind: 'satisfied', output: proof });
		adapter.reconcileResult = 'ended';
		clock.now = claim.nextWakeAt!;
		await createRunner().recover();
		assert.deepStrictEqual({ calls, receipts: (await current(store, run)).receipts.length, dispatches: adapter.dispatches.map(call => call.assignment.checkpointId) }, {
			calls: 2, receipts: 1, dispatches: ['first', 'second'],
		});
	});

	test('session deletion during a check cannot resurrect or accept the run', async () => {
		const { runner, store, checks, adapter } = fixture();
		const entered = new DeferredPromise<void>();
		const result = new DeferredPromise<WorkflowCheckResult>();
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => { entered.complete(); return result.p; } }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const checking = runner.prove(invocation(run), proof);
		await entered.p;
		await store.deleteSession(run.session);
		result.complete({ kind: 'satisfied', output: proof });
		assert.deepStrictEqual({ result: (await checking).kind, runs: store.runs.size, dispatches: adapter.dispatches.length }, { result: 'stale_assignment', runs: 0, dispatches: 1 });
	});

	test('persistent CAS failures are bounded and stale user controls never overwrite state', async () => {
		const { runner, store } = fixture();
		const run = await runner.start(startOptions);
		const attempts = store.writeAttempts;
		store.conflicts = 10;
		await assert.rejects(runner.prove(invocation(run), proof), WorkflowConflictError);
		assert.deepStrictEqual({ attempts: store.writeAttempts - attempts, receipts: (await current(store, run)).receipts.length }, { attempts: 3, receipts: 0 });
		store.conflicts = 0;
		await runner.control({ kind: 'setStopAfter', runId: run.id, revision: run.revision, checkpointId: 'third' });
		await assert.rejects(runner.control({ kind: 'pause', runId: run.id, revision: run.revision }), WorkflowConflictError);
	});

	test('failed create and unavailable storage are explicit, never a successful empty state', async () => {
		const { runner, store, adapter } = fixture();
		store.failCreate = true;
		await assert.rejects(runner.start(startOptions), /Create transaction failed/);
		store.failReads = true;
		await assert.rejects(runner.getSessionRun('session'), /Store is unavailable/);
		await assert.rejects(runner.recover(), /Store is unavailable/);
		assert.strictEqual(adapter.dispatches.length, 0);
	});

	test('restart reconciles a dispatch-before-ack gap instead of duplicating the turn', async () => {
		const { runner, store, adapter, createRunner } = fixture();
		adapter.onDispatch = async () => { store.failWrites = true; };
		await assert.rejects(runner.start(startOptions), /Write transaction failed/);
		const gap = [...store.runs.values()][0];
		store.failWrites = false;
		adapter.onDispatch = undefined;
		runner.dispose();
		const restarted = createRunner();
		await restarted.recover();
		const restored = await current(store, gap);
		assert.deepStrictEqual({ delivery: gap.assignment?.delivery, restored: restored.assignment?.delivery, dispatches: adapter.dispatches.length, reconciliations: adapter.reconciliations }, {
			delivery: 'dispatching', restored: 'running', dispatches: 1, reconciliations: 1,
		});
	});

	test('unknown externally mutating reported outcomes block rather than replay', async () => {
		const { runner, store, adapter, clock, createRunner } = fixture();
		const run = await runner.start(startOptions);
		runner.dispose();
		clock.now = run.nextWakeAt!;
		adapter.reconcileResult = 'unknown';
		const restarted = createRunner();
		await restarted.recover();
		assert.deepStrictEqual({ status: (await current(store, run)).status, dispatches: adapter.dispatches.length, receipts: (await current(store, run)).receipts.length }, { status: 'blocked', dispatches: 1, receipts: 0 });
	});

	test('confirmed not-started dispatch can retry the same durable identity', async () => {
		const { runner, store, adapter, createRunner } = fixture();
		adapter.onDispatch = async () => { store.failWrites = true; };
		await assert.rejects(runner.start(startOptions));
		const run = [...store.runs.values()][0];
		store.failWrites = false;
		adapter.onDispatch = undefined;
		adapter.reconcileResult = 'notStarted';
		runner.dispose();
		await createRunner().recover();
		assert.deepStrictEqual(adapter.dispatches.map(call => call.assignment.id), [run.assignment!.id, run.assignment!.id]);
	});

	test('normal reads and progress projection never resume stopped work', async () => {
		const { runner, store, adapter } = fixture();
		const run = await runner.start({ ...startOptions, stopAfter: 'first' });
		await runner.prove(invocation(run), proof);
		const stopped = await current(store, run);
		for (let read = 0; read < 5; read++) {
			getWorkflowProgress((await runner.getSessionRun(run.session))!);
		}
		assert.deepStrictEqual({
			dispatches: adapter.dispatches.length, progress: getWorkflowProgress(stopped).checkpointId, attention: getWorkflowProgress(stopped).needsAttention,
		}, { dispatches: 1, progress: 'first', attention: true });
	});

	test('checkpoint context stays with the issuing turn after proof advances the run', async () => {
		const { runner, store, adapter } = fixture();
		const first = await runner.start(startOptions);
		const writes = store.writeAttempts;
		const initial = await runner.getCheckpoint(invocation(first));
		const stale = await runner.getCheckpoint({ ...invocation(first), turnId: 'other-turn' });
		const missing = await runner.getCheckpoint({ ...invocation(first), runId: 'missing-run' });
		const readWrites = store.writeAttempts - writes;
		await runner.prove(invocation(first), proof);
		const afterProof = await runner.getCheckpoint(invocation(first));
		await runner.onTurnEnd(invocation(first), 'completed');
		const second = await current(store, first);
		const old = await runner.getCheckpoint(invocation(first));
		const next = await runner.getCheckpoint(invocation(second));
		assert.deepStrictEqual({
			initial: initial?.id, stale, missing, afterProof: afterProof?.id, old, next: next?.id, readWrites,
			reconciliations: adapter.reconciliations, frozen: Object.isFrozen(initial),
		}, { initial: 'first', stale: undefined, missing: undefined, afterProof: 'first', old: undefined, next: 'second', readWrites: 0, reconciliations: 0, frozen: true });
	});

	test('checkpoint context ends with its turn even at stopped and completed boundaries', async () => {
		for (const snapshot of [startOptions.snapshot, makeSnapshot([makeType('first')])]) {
			const { runner, adapter } = fixture();
			const run = await runner.start({ ...startOptions, snapshot, stopAfter: 'first' });
			await runner.prove(invocation(run), proof);
			const finishing = await runner.getCheckpoint(invocation(run));
			await runner.onTurnEnd(invocation(run), 'completed');
			const ended = await runner.getCheckpoint(invocation(run));
			assert.deepStrictEqual({ finishing: finishing?.id, ended, dispatches: adapter.dispatches.length }, { finishing: 'first', ended: undefined, dispatches: 1 });
		}
	});

	test('checkpoint context is not exposed for revoked or blocked assignments', async () => {
		for (const action of ['pause', 'cancel', 'block'] as const) {
			const { runner } = fixture();
			const run = await runner.start(startOptions);
			if (action === 'block') {
				await runner.reportBlocked(invocation(run), 'No access');
			} else {
				await runner.control({ kind: action, runId: run.id, revision: run.revision });
			}
			assert.strictEqual(await runner.getCheckpoint(invocation(run)), undefined);
		}
	});

	test('records user activity durably without waking stopped work or changing provider timestamps', async () => {
		const { runner, store, adapter, clock, createRunner } = fixture();
		const run = await runner.start({ ...startOptions, stopAfter: 'first' });
		clock.now = 2000;
		await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		const automatic = await current(store, run);
		clock.now = 4000;
		const recorded = await runner.recordUserActivity(run.id, 3000);
		runner.dispose();
		const restored = (await createRunner().getSessionRun(run.session))!;
		assert.deepStrictEqual({
			automaticActivity: automatic.activityAt,
			recordedActivity: recorded.activityAt,
			persistedActivity: restored.activityAt,
			progressActivity: getWorkflowProgress(restored).activityAt,
			updatedAt: restored.updatedAt,
			status: restored.status,
			dispatches: adapter.dispatches.length,
			reconciliations: adapter.reconciliations,
		}, {
			automaticActivity: 1000, recordedActivity: 3000, persistedActivity: 3000, progressActivity: 3000,
			updatedAt: 4000, status: 'stopped', dispatches: 1, reconciliations: 0,
		});
	});

	test('activity timestamps are monotonic, validated and no-op for duplicate client events', async () => {
		const { runner, store, clock } = fixture();
		const run = await runner.start(startOptions);
		let events = 0;
		disposables.add(runner.onDidChangeRun(() => events++));
		clock.now = 2000;
		const recorded = await runner.recordUserActivity(run.id);
		const writes = store.writeAttempts;
		await runner.recordUserActivity(run.id, 1000);
		await runner.recordUserActivity(run.id, 2000);
		for (const at of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
			await assert.rejects(runner.recordUserActivity(run.id, at), WorkflowValidationError);
		}
		const persisted = await current(store, run);
		assert.deepStrictEqual({
			activity: persisted.activityAt, revision: persisted.revision, writes: store.writeAttempts - writes, events,
		}, { activity: 2000, revision: recorded.revision, writes: 0, events: 1 });
	});

	test('control transitions stay quiet unless the host explicitly records user activity', async () => {
		const { runner, store, clock } = fixture();
		const run = await runner.start(startOptions);
		clock.now = 2000;
		const extended = await runner.control({ kind: 'setStopAfter', runId: run.id, revision: run.revision, checkpointId: 'third' });
		clock.now = 3000;
		const paused = await runner.control({ kind: 'pause', runId: run.id, revision: extended.revision });
		await runner.onTurnEnd(invocation(run), 'cancelled');
		clock.now = 4000;
		const resumed = await runner.control({ kind: 'resume', runId: run.id, revision: (await current(store, run)).revision });
		clock.now = 5000;
		const cancelled = await runner.control({ kind: 'cancel', runId: run.id, revision: resumed.revision });
		assert.deepStrictEqual([extended.activityAt, paused.activityAt, resumed.activityAt, cancelled.activityAt, cancelled.updatedAt], [1000, 1000, 1000, 1000, 5000]);
	});

	test('user activity during verification is retained without invalidating the current proof', async () => {
		const { runner, store, checks, clock } = fixture();
		const entered = new DeferredPromise<void>();
		const result = new DeferredPromise<WorkflowCheckResult>();
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => { entered.complete(); return result.p; } }));
		const run = await runner.start({
			...startOptions,
			snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]),
		});
		const checking = runner.prove(invocation(run), proof);
		await entered.p;
		await runner.recordUserActivity(run.id, 2000);
		clock.now = 3000;
		result.complete({ kind: 'satisfied', output: proof });
		const accepted = await checking;
		const persisted = await current(store, run);
		assert.deepStrictEqual({
			result: accepted.kind, activityAt: persisted.activityAt, updatedAt: persisted.updatedAt,
		}, { result: 'accepted', activityAt: 2000, updatedAt: 3000 });
	});

	test('progress retains the last explicit grouping move through later checkpoint completions', async () => {
		const { runner, store } = fixture();
		const snapshot = {
			...startOptions.snapshot,
			checkpoints: startOptions.snapshot.checkpoints.map((checkpoint, index) => index === 0 ? { ...checkpoint, afterCompletion: { group: 'Feature work' } } : checkpoint),
		};
		const run = await runner.start({ ...startOptions, snapshot });
		await runner.prove(invocation(run), proof);
		await runner.onTurnEnd(invocation(run), 'completed');
		const second = await current(store, run);
		await runner.prove(invocation(second), proof);
		const progress = getWorkflowProgress(await current(store, run));
		assert.deepStrictEqual({ checkpoint: progress.checkpointId, completed: progress.completed, group: progress.group, firstTurn: progress.firstTurnId, activityAt: progress.activityAt }, {
			checkpoint: 'second', completed: 2, group: 'Feature work', firstTurn: second.assignment!.turnId, activityAt: 1000,
		});
	});

	test('missing checks, rejected start conditions and malformed canonical outputs block explicitly', async () => {
		for (const kind of ['missing', 'rejectedStart', 'invalidOutput'] as const) {
			const { runner, adapter, checks } = fixture();
			if (kind !== 'missing') {
				disposables.add(checks.register({
					id: 'test.check', evaluate: async () => kind === 'rejectedStart'
						? { kind: 'rejected', reason: 'Fix prerequisites' }
						: { kind: 'satisfied', output: {} }
				}));
			}
			const type = kind === 'invalidOutput'
				? makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } }, outputSchema: proofSchema })
				: makeType('first', { startCondition: { check: 'test.check' } });
			const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([type, makeType('second')]) });
			if (kind === 'invalidOutput') {
				assert.strictEqual((await runner.prove(invocation(run), proof)).kind, 'blocked');
			} else {
				assert.deepStrictEqual({ status: run.status, dispatches: adapter.dispatches.length }, { status: 'blocked', dispatches: 0 });
			}
		}
	});

	test('reported URI evidence is surfaced without changing its reported provenance', async () => {
		const { runner, store } = fixture();
		const snapshot = makeSnapshot([makeType('first', {
			proofSchema: { type: 'object', required: ['uri'], properties: { uri: { type: 'string', format: 'uri' } }, additionalProperties: false },
		}), makeType('second')]);
		const run = await runner.start({ ...startOptions, snapshot });
		await runner.prove(invocation(run), { uri: 'https://example.org/experiment/1' });
		const receipt = (await current(store, run)).receipts[0];
		assert.deepStrictEqual({ evidence: receipt.evidence, provenance: receipt.provenance, output: receipt.output }, {
			evidence: [{ kind: 'link', uri: 'https://example.org/experiment/1', label: 'first' }], provenance: 'reported', output: { uri: 'https://example.org/experiment/1' },
		});
	});

	test('missing check results are blockers and repeated blocked proofs are idempotent', async () => {
		const { runner, checks, store } = fixture();
		let calls = 0;
		disposables.add(checks.register({
			id: 'test.check', evaluate: async () => {
				calls++;
				const malformed: WorkflowCheckResult = JSON.parse('null');
				return malformed;
			}
		}));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const result = await runner.prove(invocation(run), proof);
		const duplicate = await runner.prove(invocation(run), proof);
		assert.deepStrictEqual({ results: [result.kind, duplicate.kind], calls, status: (await current(store, run)).status }, { results: ['blocked', 'blocked'], calls: 1, status: 'blocked' });
	});

	test('caller mutation cannot change a checked proof after it was submitted', async () => {
		const { runner, checks, store } = fixture();
		const entered = new DeferredPromise<void>();
		const result = new DeferredPromise<WorkflowCheckResult>();
		const submitted = { summary: 'Original' };
		disposables.add(checks.register({ id: 'test.check', evaluate: async () => { entered.complete(); return result.p; } }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { completion: { kind: 'checked', check: { check: 'test.check' } } }), makeType('second')]) });
		const checking = runner.prove(invocation(run), submitted);
		await entered.p;
		submitted.summary = 'Changed';
		result.complete({ kind: 'satisfied', output: proof });
		await checking;
		assert.deepStrictEqual((await current(store, run)).receipts[0].proof, { summary: 'Original' });
	});

	test('indexed due-work polling is coalesced and does not hydrate 1000 dormant runs', async () => {
		const { runner, store, checks, clock, adapter } = fixture();
		disposables.add(checks.register({ id: 'test.release', evaluate: async () => ({ kind: 'waiting', reason: 'Not released', retryAfterMs: 5000 }) }));
		const run = await runner.start({ ...startOptions, snapshot: makeSnapshot([makeType('first', { startCondition: { check: 'test.release' } }), makeType('second')]) });
		for (let index = 0; index < 1000; index++) {
			store.seed({ ...run, id: `dormant-${index}`, session: `session-${index}`, nextWakeAt: 1000000, wait: { ...run.wait!, nextCheckAt: 1000000 } });
		}
		store.readIds.length = 0;
		store.dueQueries = 0;
		clock.now = 6000;
		await Promise.all(Array.from({ length: 20 }, () => runner.wakeDue()));
		assert.deepStrictEqual({
			queries: store.dueQueries, readIds: [...new Set(store.readIds)], dispatches: adapter.dispatches.length,
			activityAt: (await current(store, run)).activityAt,
		}, { queries: 1, readIds: [run.id], dispatches: 0, activityAt: 1000 });
	});

	test('reporting a blocker is durable and rejects late caller identity', async () => {
		const { runner, store } = fixture();
		const run = await runner.start(startOptions);
		const stale = await runner.reportBlocked({ ...invocation(run), turnId: 'wrong' }, 'No access');
		const blocked = await runner.reportBlocked(invocation(run), 'No access');
		await runner.onTurnEnd(invocation(run), 'completed');
		assert.deepStrictEqual({ results: [stale.kind, blocked.kind], status: (await current(store, run)).status }, { results: ['stale_assignment', 'blocked'], status: 'blocked' });
	});
});
