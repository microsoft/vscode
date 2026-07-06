/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { AgentOrchestrator, IAgentRunContext } from '../../browser/agentOrchestrator.js';
import { IAgentStore } from '../../browser/agentStore.js';
import { IClock } from '../../browser/clock.js';
import { AgentTriggerKind, IAgentDef } from '../../common/livingDocsModel.js';

// A controllable clock: the test sets the wall time and drives the scheduler tick directly.
class FakeClock implements IClock {
	constructor(private _now: number) { }
	now(): number { return this._now; }
	set(now: number): void { this._now = now; }
	advance(ms: number): void { this._now += ms; }
	scheduleInterval(): IDisposable { return toDisposable(() => { }); }
}

// Monday 2026-06-22, 09:00:00 UTC - matches the "Mon 09:00" weekly-refresh cron.
const MONDAY_0900 = Date.UTC(2026, 5, 22, 9, 0, 0);

// Two documents that share metrics.csv; one also draws on market-research.md as context.
const WEEKLY = URI.file('/ws/Weekly Summary.md');
const BOARD = URI.file('/ws/Board Note.md');

const WEEKLY_MD = [
	'---', 'title: Weekly', 'sources:', '  - metrics.csv', 'context:', '  - market-research.md', '---', '',
	'## Highlights', '', 'MRR is [$48.6k](bind:metrics.mrr).',
].join('\n') + '\n';

const BOARD_MD = [
	'---', 'title: Board', 'sources:', '  - metrics.csv', '---', '',
	'## Numbers', '', 'MRR is [$48.6k](bind:metrics.mrr).',
].join('\n') + '\n';

suite('AgentOrchestrator', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IRunRecord { agentId: string; trigger: AgentTriggerKind; docs: string[] }

	function createOrchestrator(opts: { agents?: IAgentDef[]; clock?: FakeClock } = {}): { orch: AgentOrchestrator; written: { agents?: readonly IAgentDef[] }; runs: IRunRecord[] } {
		const files = new Map<string, string>([
			[WEEKLY.toString(), WEEKLY_MD],
			[BOARD.toString(), BOARD_MD],
		]);
		const fileService = {
			readFile: async (resource: URI) => {
				const content = files.get(resource.toString());
				if (content === undefined) { throw new Error(`not found: ${resource}`); }
				return { value: VSBuffer.fromString(content) };
			},
		} as unknown as IFileService;

		const written: { agents?: readonly IAgentDef[] } = {};
		const agentStore: IAgentStore = {
			read: async () => opts.agents,
			write: async agents => { written.agents = agents; },
		};
		const orch = new AgentOrchestrator(fileService, new NullLogService(), agentStore, async () => [WEEKLY, BOARD], opts.clock);
		const runs: IRunRecord[] = [];
		orch.setRunner(async (agent, context: IAgentRunContext) => {
			runs.push({ agentId: agent.id, trigger: context.trigger, docs: context.docs.map(u => u.toString()) });
			return { applied: 0, queued: 0 };
		});
		store.add(orch);
		return { orch, written, runs };
	}

	test('a single write to a shared source dirties every dependent document (reverse-edge walk)', async () => {
		const { orch } = createOrchestrator();

		const dirtied = await orch.propagate('/ws/metrics.csv');

		assert.deepStrictEqual(dirtied.map(u => u.toString()).sort(), [BOARD.toString(), WEEKLY.toString()].sort(), 'both docs binding metrics.csv are dirtied from one event');
		assert.deepStrictEqual(orch.getDirty(WEEKLY)!.value, ['metrics.csv'], 'recorded as a value-edge dirty bit');
	});

	test('a context-source write dirties only its influence dependents', async () => {
		const { orch } = createOrchestrator();

		const dirtied = await orch.propagate('market-research.md');

		assert.deepStrictEqual(dirtied.map(u => u.toString()), [WEEKLY.toString()], 'only the doc that lists it as context');
		assert.deepStrictEqual(orch.getDirty(WEEKLY)!.influence, ['market-research.md'], 'recorded as an influence-edge dirty bit');
	});

	test('a write to an unrelated source dirties nothing', async () => {
		const { orch } = createOrchestrator();
		assert.deepStrictEqual(await orch.propagate('/ws/unrelated.csv'), []);
	});

	test('runAgent threads the per-run cancellation token so the runner skips the remaining documents (plan 27 iter 4)', async () => {
		const { orch } = createOrchestrator();
		await orch.ensureLoaded();
		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose()));
		let processed = 0;
		let skipped = 0;
		// The runner honours the token exactly as the service's _runAgent loop does: stop at the first
		// cancelled check and report the remaining documents as skipped rather than running them.
		orch.setRunner(async (_agent, context: IAgentRunContext) => {
			for (let i = 0; i < context.docs.length; i++) {
				if (context.token?.isCancellationRequested) { skipped = context.docs.length - i; break; }
				processed++;
			}
			return { applied: 0, queued: 0, skipped };
		});
		cts.cancel();

		await orch.runAgent('weekly-refresh', 'manual', [WEEKLY, BOARD], cts.token);

		assert.strictEqual(processed, 0, 'no document is processed once the run token is already cancelled');
		assert.strictEqual(skipped, 2, 'both documents are reported skipped');
	});

	test('runAgent defaults to a non-cancelled token so an uncancelled run processes every document', async () => {
		const { orch } = createOrchestrator();
		await orch.ensureLoaded();
		let processed = 0;
		orch.setRunner(async (_agent, context: IAgentRunContext) => {
			for (let i = 0; i < context.docs.length; i++) {
				if (context.token?.isCancellationRequested) { break; }
				processed++;
			}
			return { applied: 0, queued: 0 };
		});

		await orch.runAgent('weekly-refresh', 'manual', [WEEKLY, BOARD]);

		assert.strictEqual(processed, 2, 'every document runs when no cancellation is requested');
	});

	test('clearDirty removes a document from the queue', async () => {
		const { orch } = createOrchestrator();
		await orch.propagate('/ws/metrics.csv');
		orch.clearDirty(WEEKLY);
		assert.deepStrictEqual({ weekly: orch.isDirty(WEEKLY), board: orch.isDirty(BOARD) }, { weekly: false, board: true });
	});

	test('the registry seeds the default automation set when none is stored', async () => {
		const { orch, written } = createOrchestrator();
		await orch.ensureLoaded();
		assert.deepStrictEqual(
			orch.getAgents().map(a => ({ id: a.id, trigger: a.trigger.kind, policy: a.policy })),
			[
				{ id: 'weekly-refresh', trigger: 'cron', policy: 'auto-figures' },
				{ id: 'source-watcher', trigger: 'event', policy: 'auto-figures' },
				{ id: 'freshness-sweep', trigger: 'heartbeat', policy: 'draft-only' },
				{ id: 'before-export-gate', trigger: 'lifecycle', policy: 'ask-before-apply' },
				{ id: 'on-publish-snapshot', trigger: 'lifecycle', policy: 'auto-figures' },
			],
		);
		assert.ok(written.agents && written.agents.length === 5, 'seeded registry is persisted');
	});

	test('a stored registry is used as-is (no re-seed)', async () => {
		const custom: IAgentDef[] = [{ id: 'only', name: 'Only', trigger: { kind: 'manual' }, flow: { sources: [], docs: [] }, policy: 'draft-only', status: 'idle' }];
		const { orch } = createOrchestrator({ agents: custom });
		await orch.ensureLoaded();
		assert.deepStrictEqual(orch.getAgents().map(a => a.id), ['only']);
	});

	test('a cron agent fires at its scheduled time and not otherwise (fake clock)', async () => {
		const clock = new FakeClock(MONDAY_0900);
		const { orch, runs } = createOrchestrator({ clock });
		await orch.ensureLoaded();

		await orch.runDueAgents();
		const cronRuns = runs.filter(r => r.trigger === 'cron');
		assert.deepStrictEqual(cronRuns, [{ agentId: 'weekly-refresh', trigger: 'cron', docs: [WEEKLY.toString(), BOARD.toString()] }], 'weekly-refresh fired at Mon 09:00');

		// One hour later it is no longer due (and it already ran this period).
		runs.length = 0;
		clock.advance(3_600_000);
		await orch.runDueAgents();
		assert.deepStrictEqual(runs.filter(r => r.trigger === 'cron'), [], 'cron does not re-fire off-schedule');
	});

	test('the heartbeat drains only dirty docs and is a no-op on an empty queue', async () => {
		const clock = new FakeClock(MONDAY_0900 + 3_600_000); // 10:00 - cron not due, heartbeat is
		const { orch, runs } = createOrchestrator({ clock });
		await orch.ensureLoaded();

		await orch.runDueAgents();
		assert.strictEqual(runs.length, 0, 'empty dirty queue -> heartbeat is a no-op (no re-derive)');

		await orch.propagate('/ws/metrics.csv');
		await orch.runDueAgents();
		assert.deepStrictEqual(
			runs.map((r: IRunRecord) => ({ agentId: r.agentId, trigger: r.trigger, docs: r.docs.slice().sort() })),
			[{ agentId: 'freshness-sweep', trigger: 'heartbeat', docs: [BOARD.toString(), WEEKLY.toString()].sort() }],
			'heartbeat processes exactly the flagged docs',
		);
	});

	test('a source change fires the matching event agent with the dirtied docs', async () => {
		const { orch, runs } = createOrchestrator();
		await orch.ensureLoaded();

		await orch.onSourceChanged('/ws/metrics.csv');

		assert.deepStrictEqual(
			runs.map(r => ({ agentId: r.agentId, trigger: r.trigger, docs: r.docs.slice().sort() })),
			[{ agentId: 'source-watcher', trigger: 'event', docs: [BOARD.toString(), WEEKLY.toString()].sort() }],
		);
	});

	test('Run now executes an agent manually', async () => {
		const { orch, runs } = createOrchestrator();
		await orch.ensureLoaded();

		await orch.runAgent('weekly-refresh', 'manual', []);

		assert.deepStrictEqual(runs, [{ agentId: 'weekly-refresh', trigger: 'manual', docs: [] }]);
		assert.ok(orch.getAgent('weekly-refresh')!.lastRun, 'last-run recorded for the History trace');
	});
});
