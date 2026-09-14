/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ISessionFactoryRun, isSessionFactoryRunTerminal, readSessionFactoryRuns, readSessionFactoryRunsNewestFirst, SESSION_META_FACTORY_RUNS_KEY, SessionFactoryRunPhaseStatus, SessionFactoryRunStatus, withSessionFactoryRuns } from '../../common/sessionFactoryRuns.js';
import { SESSION_META_ARTIFACTS_KEY } from '../../common/sessionArtifacts.js';

function run(overrides: Partial<ISessionFactoryRun> = {}): ISessionFactoryRun {
	return {
		runId: 'run-1',
		factoryName: 'review-changed',
		description: 'Review changed files',
		status: SessionFactoryRunStatus.Running,
		revision: 3,
		createdAt: 1000,
		startedAt: 1500,
		updatedAt: 2000,
		currentPhaseId: 'review',
		liveAgentCount: 2,
		totalSpawnedAgentCount: 4,
		usage: { activeMs: 5000, subagents: 4, aiCredits: 1.25 },
		limits: { maxTotalSubagents: 10, timeoutSeconds: 600 },
		phases: [
			{ id: 'review', ordinal: 0, title: 'Review', status: SessionFactoryRunPhaseStatus.Active, startedAt: 1500, activeMs: 5000, totalAgentCount: 4, liveAgentCount: 2 },
			{ id: 'verify', ordinal: 1, title: 'Verify', detail: 'Confirm findings', status: SessionFactoryRunPhaseStatus.Pending, activeMs: 0, totalAgentCount: 0, liveAgentCount: 0 },
		],
		agents: [
			{ agentId: 'a1', phaseId: 'review', label: 'Review a.ts', agentType: 'task', status: 'running', model: 'claude', startedAt: 1600, activeMs: 400, activity: 'Reading a.ts' },
		],
		progress: [
			{ seq: 1, phaseId: 'review', recordedAt: 1500, kind: 'phase', text: 'Review' },
			{ seq: 2, phaseId: 'review', recordedAt: 1700, kind: 'log', text: 'Started 4 reviewers' },
		],
		...overrides,
	};
}

suite('sessionFactoryRuns', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips runs through the session meta slot without touching other slots', () => {
		const first = run();
		const second = run({ runId: 'run-2', status: SessionFactoryRunStatus.Completed, completedAt: 3000, outcome: { resultText: '{"ok":true}', limitReached: undefined } });
		const meta = withSessionFactoryRuns({ [SESSION_META_ARTIFACTS_KEY]: [{ id: 'x' }] }, [first, second]);

		assert.deepStrictEqual({
			runs: readSessionFactoryRuns(meta),
			newestFirst: readSessionFactoryRunsNewestFirst(meta).map(entry => entry.runId),
			otherSlotKept: meta?.[SESSION_META_ARTIFACTS_KEY],
		}, {
			runs: [first, { ...second, outcome: { resultText: '{"ok":true}' } }],
			newestFirst: ['run-2', 'run-1'],
			otherSlotKept: [{ id: 'x' }],
		});
	});

	test('drops the slot when the run list is empty and the bag when nothing remains', () => {
		assert.deepStrictEqual({
			emptied: withSessionFactoryRuns({ [SESSION_META_FACTORY_RUNS_KEY]: [run()], other: 1 }, []),
			cleared: withSessionFactoryRuns({ [SESSION_META_FACTORY_RUNS_KEY]: [run()] }, []),
		}, {
			emptied: { other: 1 },
			cleared: undefined,
		});
	});

	test('rejects malformed entries and fills defaults for optional fields', () => {
		const meta = {
			[SESSION_META_FACTORY_RUNS_KEY]: [
				'not-an-object',
				{ runId: 'missing-name', status: 'running' },
				{ runId: 'bad-status', factoryName: 'f', status: 'exploded' },
				{
					runId: 'minimal',
					factoryName: 'f',
					status: 'pending',
					phases: [{ id: 'p', title: 'P', status: 'bogus' }, { id: 'q', title: 'Q', status: 'pending' }],
					agents: [{ agentId: 'a' }, { agentId: 'b', label: 'B' }],
					progress: [{ seq: 'nope', text: 'x' }, { seq: 1, text: 'ok', kind: 'weird' }],
					outcome: { resultText: 42 },
				},
			],
		};

		assert.deepStrictEqual(readSessionFactoryRuns(meta), [{
			runId: 'minimal',
			factoryName: 'f',
			description: '',
			status: SessionFactoryRunStatus.Pending,
			revision: 0,
			createdAt: 0,
			updatedAt: 0,
			liveAgentCount: 0,
			totalSpawnedAgentCount: 0,
			usage: { activeMs: 0, subagents: 0, aiCredits: 0 },
			limits: {},
			phases: [{ id: 'q', title: 'Q', status: SessionFactoryRunPhaseStatus.Pending, activeMs: 0, totalAgentCount: 0, liveAgentCount: 0 }],
			agents: [{ agentId: 'b', label: 'B', agentType: '', status: '', activeMs: 0 }],
			progress: [{ seq: 1, recordedAt: 0, kind: 'log', text: 'ok' }],
		}]);
	});

	test('treats every settled status as terminal', () => {
		assert.deepStrictEqual(
			[SessionFactoryRunStatus.Pending, SessionFactoryRunStatus.Running, SessionFactoryRunStatus.Completed, SessionFactoryRunStatus.Halted, SessionFactoryRunStatus.Cancelled, SessionFactoryRunStatus.Error].map(isSessionFactoryRunTerminal),
			[false, false, true, true, true, true],
		);
	});
});
