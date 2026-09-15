/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { FactoryRunDetail, FactoryRunResult, FactoryRunSummary } from '@github/copilot-sdk';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SessionFactoryRunPhaseStatus, SessionFactoryRunStatus } from '../../common/sessionFactoryRuns.js';
import { FACTORY_RESULT_TEXT_LIMIT, readCopilotFactoryRuns, serializeFactoryResult, toSessionFactoryRun, type ICopilotFactoryRunReader } from '../../node/copilot/copilotFactoryRuns.js';

function detail(overrides: Partial<FactoryRunDetail> = {}): FactoryRunDetail {
	return {
		runId: 'run-1',
		factoryName: 'review-changed',
		description: 'Review changed files',
		status: 'running',
		revision: 7,
		createdAt: 1000,
		startedAt: 1200,
		updatedAt: 5000,
		completedAt: null,
		currentPhase: { id: 'review', ordinal: 0 },
		declaredPhaseCount: 2,
		liveAgentCount: 1,
		totalSpawnedAgentCount: 3,
		consumed: { activeMs: 4200, subagents: 3, nanoAiu: 2_500_000_000 },
		declaredLimits: { maxTotalSubagents: 5 },
		approved: { maxTotalSubagents: 8, timeoutSeconds: 120, maxAiCredits: 10 },
		observedAt: 5100,
		activeSegmentStartedAt: 4900,
		terminal: null,
		phases: [
			{ id: 'review', ordinal: 0, title: 'Review', status: 'active', lastEnteredRunAttempt: 1, entryCount: 1, startedAt: 1200, accumulatedActiveMs: 3000, currentActiveMs: 1200, totalAgentCount: 3, liveAgentCount: 1 },
			{ id: 'verify', ordinal: null, title: 'Verify', detail: 'Check findings', status: 'pending', lastEnteredRunAttempt: 0, entryCount: 0, accumulatedActiveMs: 0, currentActiveMs: 0, totalAgentCount: 0, liveAgentCount: 0 },
		],
		agents: [
			{ agentId: 'a1', toolCallId: 't1', runId: 'run-1', phaseId: 'review', label: 'reviewer', displayName: 'Review a.ts', agentType: 'task', status: 'running', requestedModel: 'auto', resolvedModel: 'claude', startedAt: 1300, activeMs: 900, activity: 'Reading a.ts' },
			{ agentId: 'a2', toolCallId: 't2', runId: 'run-1', phaseId: null, label: 'planner', agentType: 'task', status: 'completed', startedAt: 1250, completedAt: 1900, activeMs: 650 },
		],
		progress: {
			records: [
				{ seq: 1, attempt: 1, phaseId: 'review', recordedAt: 1200, kind: 'phase', text: 'Review' },
				{ seq: 2, attempt: 1, phaseId: null, recordedAt: 1250, kind: 'log', text: 'Planning' },
			],
			oldestSeq: 1,
			newestSeq: 2,
			hasMoreOlder: false,
			hasMoreNewer: false,
			revision: 7,
		},
		...overrides,
	};
}

suite('copilotFactoryRuns', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('projects an SDK run detail onto the session shape, preferring approved limits', () => {
		assert.deepStrictEqual(toSessionFactoryRun(detail()), {
			runId: 'run-1',
			factoryName: 'review-changed',
			description: 'Review changed files',
			status: SessionFactoryRunStatus.Running,
			revision: 7,
			createdAt: 1000,
			startedAt: 1200,
			updatedAt: 5000,
			currentPhaseId: 'review',
			liveAgentCount: 1,
			totalSpawnedAgentCount: 3,
			usage: { activeMs: 4200, subagents: 3, aiCredits: 2.5 },
			limits: { maxTotalSubagents: 8, timeoutSeconds: 120, maxAiCredits: 10 },
			phases: [
				{ id: 'review', ordinal: 0, title: 'Review', status: SessionFactoryRunPhaseStatus.Active, startedAt: 1200, activeMs: 4200, totalAgentCount: 3, liveAgentCount: 1 },
				{ id: 'verify', title: 'Verify', detail: 'Check findings', status: SessionFactoryRunPhaseStatus.Pending, activeMs: 0, totalAgentCount: 0, liveAgentCount: 0 },
			],
			agents: [
				{ agentId: 'a1', toolCallId: 't1', phaseId: 'review', label: 'Review a.ts', agentType: 'task', status: 'running', model: 'claude', startedAt: 1300, activeMs: 900, activity: 'Reading a.ts' },
				{ agentId: 'a2', toolCallId: 't2', label: 'planner', agentType: 'task', status: 'completed', startedAt: 1250, completedAt: 1900, activeMs: 650 },
			],
			progress: [
				{ seq: 1, phaseId: 'review', recordedAt: 1200, kind: 'phase', text: 'Review' },
				{ seq: 2, recordedAt: 1250, kind: 'log', text: 'Planning' },
			],
		});
	});

	test('folds the terminal outcome and completed result into one prompt-safe outcome', () => {
		const completed = toSessionFactoryRun(
			detail({ status: 'completed', completedAt: 6000, terminal: { reason: 'done' } }),
			{ runId: 'run-1', status: 'completed', result: { summary: 'ok', count: 2 } },
		);
		const limited = toSessionFactoryRun(detail({
			status: 'error',
			completedAt: 6000,
			terminal: { error: 'maxTotalSubagents reached', failure: { type: 'factory_limit_reached', kind: 'maxTotalSubagents', value: 8, runId: 'run-1' } },
		}));

		assert.deepStrictEqual({
			completed: completed.outcome,
			limited: limited.outcome,
			running: toSessionFactoryRun(detail()).outcome,
		}, {
			completed: { resultText: '{\n  "summary": "ok",\n  "count": 2\n}', reason: 'done' },
			limited: { error: 'maxTotalSubagents reached', limitReached: 'maxTotalSubagents' },
			running: undefined,
		});
	});

	test('bounds the serialized result', () => {
		const long = 'x'.repeat(FACTORY_RESULT_TEXT_LIMIT + 5);
		assert.deepStrictEqual({
			string: serializeFactoryResult('plain'),
			long: { ...serializeFactoryResult(long), resultText: serializeFactoryResult(long)?.resultText.length },
			absent: serializeFactoryResult(undefined),
		}, {
			string: { resultText: 'plain', resultTruncated: false },
			long: { resultText: FACTORY_RESULT_TEXT_LIMIT, resultTruncated: true },
			absent: undefined,
		});
	});

	test('reads every run, fetching the result only for completed runs and skipping unreadable ones', async () => {
		const calls: string[] = [];
		const summaries = [
			{ runId: 'done' },
			{ runId: 'live' },
			{ runId: 'broken' },
		] as unknown as FactoryRunSummary[];
		const reader: ICopilotFactoryRunReader = {
			listRuns: async () => summaries,
			getRunDetail: async runId => {
				calls.push(`detail:${runId}`);
				if (runId === 'broken') {
					throw new Error('gone');
				}
				return detail({ runId, status: runId === 'done' ? 'completed' : 'running', completedAt: runId === 'done' ? 6000 : null });
			},
			getRun: async (runId): Promise<FactoryRunResult> => {
				calls.push(`run:${runId}`);
				return { runId, status: 'completed', result: 'final' };
			},
		};
		const errors: string[] = [];

		const runs = await readCopilotFactoryRuns(reader, runId => errors.push(runId));

		assert.deepStrictEqual({
			runIds: runs.map(run => run.runId),
			doneResult: runs[0].outcome?.resultText,
			liveOutcome: runs[1].outcome,
			calls: calls.sort(),
			errors,
		}, {
			runIds: ['done', 'live'],
			doneResult: 'final',
			liveOutcome: undefined,
			calls: ['detail:broken', 'detail:done', 'detail:live', 'run:done'],
			errors: ['broken'],
		});
	});
});
