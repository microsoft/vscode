/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import { join } from '../../../../base/common/path.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { WorkflowRun } from '../../../workflow/common/workflow.js';
import type { IAgentHostWorkflowStartContext } from '../../common/agentHostWorkflow.js';
import { MessageAttachmentKind, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostDatabase } from '../../node/agentHostDatabase.js';
import { WorkflowStore, type IWorkflowInitialSession } from '../../node/workflow/workflowStore.js';
import { workflowStoreRun } from './testWorkflowService.js';

suite('WorkflowStore', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('persists an indexed run and checked start observations across connection restart', async () => {
		const directory = join(process.cwd(), '.build', `workflow-store-${generateUuid()}`);
		await fs.mkdir(directory, { recursive: true });
		const database = disposables.add(new AgentHostDatabase(join(directory, 'host.db')));
		const initial = workflowStoreRun();
		const checkpoint = initial.snapshot.checkpoints[0];
		const checkId = 'test/release@1';
		const run: WorkflowRun = {
			...initial,
			snapshot: { ...initial.snapshot, checkpoints: [{ ...checkpoint, type: { ...checkpoint.type, startCondition: { check: checkId } } }] },
		};
		const context: IAgentHostWorkflowStartContext = {
			model: { id: 'chosen-model', config: { reasoning: 'high', limit: 64, fast: true, optional: null } },
			agent: { uri: 'file:///agents/reviewer.agent.md' },
			attachments: [{ type: MessageAttachmentKind.Simple, label: 'Requirements', modelRepresentation: 'Keep this context' }],
		};
		const initialSession: IWorkflowInitialSession = {
			summary: {
				resource: run.session, provider: 'copilot', title: 'Waiting workflow', status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(), modifiedAt: new Date(1).toISOString(),
				workingDirectories: ['file:///work/repository'],
			},
			config: { autoApprove: 'default' }, model: context.model, agent: context.agent,
		};
		try {
			await database.registerSession(run.session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
			await database.workflows.createRun(run, context, initialSession);
			const withActivity: WorkflowRun = {
				...run, revision: 1, activityAt: 1234, updatedAt: 1234,
				startConditionReceipts: [{
					id: 'test/start-receipt', checkpointId: checkpoint.id, assignmentId: 'test/assignment', checkId,
					output: { releaseId: 'release-1', releaseCommit: 'commit-1', tagSha: 'tag-1' },
					evidence: [{ kind: 'link', uri: 'https://github.com/example/repository/releases/tag/v1.0.0', label: 'Stable release' }],
					provenance: 'checked', observedAt: 1234,
				}],
			};
			await database.workflows.updateRun(withActivity, run.revision);
			await database.close();
			const restored = disposables.add(new AgentHostDatabase(join(directory, 'host.db')));
			try {
				assert.deepStrictEqual({
					run: await restored.workflows.getSessionRun(run.session),
					notDue: await restored.workflows.listDueRuns(99, 1),
					due: await restored.workflows.listDueRuns(100, 1),
					initialSession: await restored.workflows.getInitialSession(run.session),
					initialSessions: await restored.workflows.listInitialSessions(),
					initial: await restored.workflows.claimStartContext(run.id, 'first-turn'),
					repeated: await restored.workflows.claimStartContext(run.id, 'first-turn'),
					later: await restored.workflows.claimStartContext(run.id, 'later-turn'),
					afterClaim: await restored.workflows.getInitialSession(run.session),
				}, { run: withActivity, notDue: [], due: [withActivity], initialSession, initialSessions: [initialSession], initial: context, repeated: context, later: undefined, afterClaim: undefined });
			} finally {
				await restored.close();
			}
		} finally {
			await database.close();
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	test('releases a known unstarted context claim without reviving deleted runs', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const run = workflowStoreRun();
		const context = { model: { id: 'chosen-model' } };
		await database.registerSession(run.session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		await database.workflows.createRun(run, context);
		await database.workflows.claimStartContext(run.id, 'rejected-turn');
		await database.workflows.releaseStartContext(run.id, 'rejected-turn');
		const retried = await database.workflows.claimStartContext(run.id, 'retry-turn');
		await database.workflows.updateRun({ ...run, revision: 1 }, 0);
		const retained = await database.workflows.claimStartContext(run.id, 'retry-turn');
		await database.tombstoneAndUnregisterSession(run.session);
		await database.workflows.releaseStartContext(run.id, 'retry-turn');
		assert.deepStrictEqual({ retried, retained, deleted: await database.workflows.claimStartContext(run.id, 'new-turn') }, { retried: context, retained: context, deleted: undefined });
	});

	test('initial-session refreshes cannot revive a consumed or deleted bootstrap', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const run = workflowStoreRun();
		const initial: IWorkflowInitialSession = {
			summary: {
				resource: run.session, provider: 'copilot', title: 'Waiting', status: SessionStatus.Idle,
				createdAt: new Date(1).toISOString(), modifiedAt: new Date(1).toISOString(),
			},
		};
		await database.registerSession(run.session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		await database.workflows.createRun(run, {}, initial);
		const updated = await database.workflows.updateInitialSession({ ...initial, config: { autoApprove: 'default' } });
		await database.workflows.discardInitialSession(run.session);
		const afterConsume = await database.workflows.updateInitialSession(initial);
		await database.tombstoneAndUnregisterSession(run.session);
		const afterDelete = await database.workflows.updateInitialSession(initial);
		assert.deepStrictEqual({ updated, afterConsume, afterDelete, initialSessions: await database.workflows.listInitialSessions() }, { updated: true, afterConsume: false, afterDelete: false, initialSessions: [] });
	});

	test('commits receipts and next intent in one revision and rejects stale writers', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const initial = workflowStoreRun();
		const run: WorkflowRun = { ...initial, stopAfter: 'implement', snapshot: { ...initial.snapshot, checkpoints: [...initial.snapshot.checkpoints, { ...initial.snapshot.checkpoints[0], id: 'implement' }] } };
		await database.registerSession(run.session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		await database.workflows.createRun(run);
		const committed: WorkflowRun = {
			...run, revision: 1, checkpointIndex: 1, firstTurns: { plan: 'turn-1' },
			pendingAssignment: { id: 'next', checkpointId: 'implement', turnId: 'turn-2', attempt: 1, reason: 'previous_completed', inputs: {}, createdAt: 2, delivery: 'pending' },
			receipts: [{ id: 'test/receipt', checkpointId: 'plan', assignmentId: 'test/assignment', turnId: 'turn-1', proof: {}, output: {}, evidence: [], provenance: 'reported', acceptedAt: 2 }],
		};
		const writes = await Promise.all([
			database.workflows.updateRun(committed, 0),
			database.workflows.updateRun({ ...run, revision: 1, status: 'paused', nextWakeAt: undefined }, 0),
		]);
		assert.deepStrictEqual({ writes, run: await database.workflows.getRun(run.id) }, { writes: [true, false], run: JSON.parse(JSON.stringify(committed)) });
	});

	test('tombstoning atomically deletes the run and prevents late resurrection', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const run = workflowStoreRun();
		await database.registerSession(run.session, { provider: 'copilot', startTime: 1, source: 'explicit' }, { checkTombstone: true });
		await database.workflows.createRun(run);
		await database.tombstoneAndUnregisterSession(run.session);
		const updated = await database.workflows.updateRun({ ...run, revision: 1 }, 0);
		await assert.rejects(database.workflows.createRun(run), /missing or deleted/);
		assert.deepStrictEqual({ updated, runs: await database.workflows.listRuns(), tombstoned: await database.isSessionTombstoned(run.session) }, { updated: false, runs: [], tombstoned: true });
	});

	test('does not create runs for an unregistered session', async () => {
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		await assert.rejects(database.workflows.createRun(workflowStoreRun()), /missing or deleted/);
	});

	test('rejects corrupted documents and mismatched indexed projections', async () => {
		const run = workflowStoreRun();
		const row = { run_id: run.id, session_uri: run.session, chat_uri: run.chat, revision: run.revision, next_wake_at: run.nextWakeAt, data: JSON.stringify(run) };
		for (const corrupt of [
			{ ...row, data: 'null' },
			{ ...row, data: '{' },
			{ ...row, run_id: 'different-run' },
			{ ...row, session_uri: 'copilot:/different-session' },
			{ ...row, chat_uri: `${run.chat}-different` },
			{ ...row, revision: 999 },
			{ ...row, next_wake_at: 999 },
			{ ...row, data: JSON.stringify({ ...run, activityAt: -1 }) },
		]) {
			const store = new WorkflowStore({
				get: async () => corrupt,
				all: async () => [corrupt],
				run: async () => { throw new Error('Unexpected write'); },
			});
			await assert.rejects(store.getRun(run.id));
		}
	});
});
