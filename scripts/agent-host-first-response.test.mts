/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { suite, test, type TestContext } from 'node:test';
import { compare, extract, statistics } from './agent-host-first-response.mts';

const controls = {
	commit: 'reviewed-commit', buildMode: 'development', sdkVersion: '1.0.14', cliVersion: '1.0.84-9',
	workspaceHash: 'workspace-digest', promptHash: 'prompt-digest', model: 'fixed-model',
	reasoning: 'medium', contextSize: '272000', inventoryHash: 'inventory-except-treatment-digest',
};

function fixture(context: TestContext) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-host-first-response-'));
	context.after(() => fs.rmSync(directory, { recursive: true }));
	fs.mkdirSync(path.join(directory, 'vscode-logs', 'Window'), { recursive: true });
	fs.mkdirSync(path.join(directory, 'ahp'));
	const manifest = {
		schemaVersion: 1,
		controls,
		runs: [{
			runId: 'run-1', block: 'block-1', arm: 'control', surface: 'editor', cohort: 'coldProcess',
			bundle: directory, turnId: 'turn-1', chatChannel: 'root-chat',
			rendererResource: 'agent-host-copilotcli:/fixture', utcOffset: '-07:00',
		}],
	};
	return { directory, manifest };
}

function action(type: string, timestamp: string, extra: Record<string, unknown> = {}) {
	return {
		method: 'action',
		params: { channel: 'root-chat', action: { type, turnId: 'turn-1', ...extra } },
		_ahpLog: { dir: 's2c', ts: timestamp },
	};
}

function result(arm: string, firstTextMs: number | null, block = 'block-1') {
	return {
		runId: `${block}-${arm}`, block, arm, surface: 'editor', cohort: 'coldProcess', turnId: `${block}-${arm}-turn`,
		clock: 'rendererMonotonic', outcome: 'success', firstTextMs, totalMs: 10000,
	};
}

suite('Agent Host first-response comparison', () => {
	test('reports untrimmed statistics without optimistic small-sample tails', () => {
		assert.deepStrictEqual(statistics([0, 2, 4, 1000]), {
			n: 4, median: 3, q1: 1.5, q3: 253, min: 0, max: 1000, p95: null,
		});
	});

	test('only reports p95 with at least one hundred observations', () => {
		assert.deepStrictEqual([
			statistics(Array.from({ length: 99 }, (_, i) => i)).p95,
			statistics(Array.from({ length: 100 }, (_, i) => i)).p95,
		], [null, 94.05]);
	});

	test('preserves negative matched differences and counts failures without text', () => {
		const output = compare([{
			schemaVersion: 1, controls,
			runs: [
				result('control', 8000), result('hook', 7000), result('title', 5000), result('combined', 4000),
				result('control', 10000, 'block-2'),
				{ ...result('hook', null, 'block-2'), outcome: 'error' },
			],
		}]);
		const group = output.groups[0];
		assert.deepStrictEqual({
			hookRuns: group.summaries[1].runs,
			noText: group.summaries[1].noText,
			outcomes: group.summaries[1].outcomes,
			hookDelta: group.deltas[0].treatmentMinusControlMs.median,
			hookUnmatched: group.deltas[0].unmatchedOrNoText,
			titleDelta: group.deltas[1].treatmentMinusControlMs.median,
			combinedDelta: group.deltas[2].treatmentMinusControlMs.median,
		}, {
			hookRuns: 2, noText: 1, outcomes: { success: 1, cancelled: 0, error: 1, notDispatched: 0, incomplete: 0 },
			hookDelta: -1000, hookUnmatched: 1, titleDelta: -3000, combinedDelta: -4000,
		});
	});

	test('keeps surfaces and session cohorts in separate groups', () => {
		const output = compare([{
			schemaVersion: 1, controls,
			runs: [
				result('control', 8000),
				{ ...result('title', 1000), surface: 'agents' },
				{ ...result('hook', 1000), cohort: 'existingSessionTurn' },
			],
		}]);
		assert.deepStrictEqual(output.groups.map(group => [group.surface, group.cohort, group.deltas.every(delta => delta.treatmentMinusControlMs.n === 0)]), [
			['editor', 'coldProcess', true],
			['editor', 'existingSessionTurn', true],
			['agents', 'coldProcess', true],
		]);
	});

	test('rejects build and dependency changes rather than attributing them to treatment', () => {
		for (const key of Object.keys(controls)) {
			assert.throws(() => compare([
				{ schemaVersion: 1, controls, runs: [result('control', 8000)] },
				{ schemaVersion: 1, controls: { ...controls, [key]: 'different' }, runs: [result('hook', 7000)] },
			]), /Cannot compare different/);
		}
	});

	test('rejects historical durations, invalid numbers, duplicate slots, and impossible ordering', () => {
		for (const runs of [
			[{ ...result('control', 1), clock: 'historicalWallClock' }],
			[{ ...result('control', 1), firstTextMs: -1 }],
			[{ ...result('control', 1), totalMs: Infinity }],
			[{ ...result('control', 1), firstTextMs: '100' }],
			[result('control', 1), { ...result('control', 1), runId: 'different-id' }],
			[result('control', 1), { ...result('title', 1), turnId: 'block-1-control-turn' }],
			[result('control', 20000)],
		]) {
			assert.throws(() => compare([{ schemaVersion: 1, controls, runs }]));
		}
	});

	test('retains text received before failure without reporting the run as successful', () => {
		const output = compare([{ schemaVersion: 1, controls, runs: [{ ...result('control', 20), outcome: 'error' }] }]);
		assert.deepStrictEqual(output.groups[0].summaries[0], {
			arm: 'control', runs: 1, noText: 0,
			outcomes: { success: 0, cancelled: 0, error: 1, notDispatched: 0, incomplete: 0 },
			firstTextMs: statistics([20]), totalMs: statistics([10000]),
		});
	});
});

suite('Agent Host first-response extraction', () => {
	test('requires explicit identity and timezone and never silently downgrades a monotonic extraction', context => {
		const { directory, manifest } = fixture(context);
		assert.throws(() => extract(manifest, directory), /Expected one monotonic/);
		for (const key of ['chatChannel', 'rendererResource', 'utcOffset']) {
			assert.throws(() => extract({
				...manifest, runs: [{ ...manifest.runs[0], [key]: undefined }],
			}, directory, true), /requires chatChannel/);
		}
	});

	suite('Agent Host monotonic first-response extraction', () => {
		test('uses the exact request ID and the monotonic record, not surrounding wall-clock timestamps', context => {
			const { directory, manifest } = fixture(context);
			const timing = {
				schemaVersion: 1, requestId: 'turn-1', provider: 'copilotcli', sessionTurnKind: 'first',
				invocationKind: 'newTurn', outcome: 'success', hasResponseText: true, firstResponseTextMs: 17, totalElapsedMs: 23,
			};
			fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'), [
				`2026-09-17 12:00:00.000 [info] [AgentHostFirstResponse] ${JSON.stringify({ ...timing, requestId: 'other-turn', firstResponseTextMs: 1 })}`,
				`2026-09-17 11:00:00.000 [info] [AgentHostFirstResponse] ${JSON.stringify(timing)}`,
				`2026-09-17 11:00:01.000 [info] [AgentHostFirstResponse] ${JSON.stringify({ ...timing, invocationKind: 'existingTurn', firstResponseTextMs: undefined, hasResponseText: false })}`,
				`2026-09-17 11:00:02.000 [info] [AgentHostFirstResponse] ${JSON.stringify({ ...timing, invocationKind: 'subagent', firstResponseTextMs: 1 })}`,
			].join('\n'));
			fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.1.log'),
				`2026-09-17 11:00:00.000 [info] [AgentHostFirstResponse] ${JSON.stringify(timing)}`);
			fs.writeFileSync(path.join(directory, 'agenthost.log'), [
				`[AgentHostTurnTiming] ${JSON.stringify({ schemaVersion: 1, turnId: 'other-turn', hostRootTurnOrdinal: 1, hostProcessAgeMs: 100 })}`,
				`[AgentHostTurnTiming] ${JSON.stringify({ schemaVersion: 1, turnId: 'turn-1', hostRootTurnOrdinal: 2, hostProcessAgeMs: 1000 })}`,
			].join('\n'));
			assert.deepStrictEqual(extract(manifest, directory).runs, [{
				runId: 'run-1', block: 'block-1', arm: 'control', surface: 'editor', cohort: 'coldProcess', turnId: 'turn-1',
				clock: 'rendererMonotonic', outcome: 'success', firstTextMs: 17, totalMs: 23, host: { rootTurnOrdinal: 2, processAgeMs: 1000 },
				usage: { status: 'missing', unattributedRecords: 0, legacyRecords: 0, calls: [] },
			}]);
		});

		test('keeps omitted first-text duration absent for every supported terminal outcome', context => {
			const { directory, manifest } = fixture(context);
			const extracted = [];
			for (const outcome of ['success', 'cancelled', 'error', 'notDispatched']) {
				fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'),
					`[AgentHostFirstResponse] ${JSON.stringify({ schemaVersion: 1, requestId: 'turn-1', sessionTurnKind: 'unknown', invocationKind: 'unknown', outcome, hasResponseText: false, totalElapsedMs: 5 })}`);
				extracted.push(extract(manifest, directory).runs[0].firstTextMs);
			}
			assert.deepStrictEqual(extracted, [null, null, null, null]);
		});

		test('exports only exactly attributed usage and deduplicates updates by SDK session and API call', context => {
			const { directory, manifest } = fixture(context);
			const timing = { schemaVersion: 1, requestId: 'turn-1', sessionTurnKind: 'first', invocationKind: 'newTurn', outcome: 'success', hasResponseText: true, firstResponseTextMs: 17, totalElapsedMs: 23 };
			fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'), `[AgentHostFirstResponse] ${JSON.stringify(timing)}`);
			const call = { schemaVersion: 2, correlation: 'exact', turnId: 'turn-1', sdkSessionId: 'sdk-1', eventId: 'event-1', apiCallId: 'call-1', inputTokens: 100, durationMs: 20 };
			fs.writeFileSync(path.join(directory, 'usage.jsonl'), [
				call,
				{ ...call, eventId: 'event-2', durationMs: undefined, cacheReadTokens: 50, cacheWriteTokens: 2, totalNanoAiu: 34, prompt: 'private content' },
				{ ...call, apiCallId: 'call-2', correlation: 'unresolved', turnId: undefined, agentId: 'main-agent' },
				{ ...call, apiCallId: 'call-3', turnId: 'other-turn' },
				{ turnId: 'turn-1', inputTokens: 9999 },
			].map(record => JSON.stringify(record)).join('\n'));
			assert.deepStrictEqual(extract(manifest, directory).runs[0].usage, {
				status: 'captured', unattributedRecords: 1, legacyRecords: 1,
				calls: [{ sdkSessionId: 'sdk-1', eventId: 'event-2', apiCallId: 'call-1', inputTokens: 100, durationMs: 20, cacheReadTokens: 50, cacheWriteTokens: 2, totalNanoAiu: 34 }],
			});
		});

		test('keeps SDK sessions separate and falls back to event identity without an API call ID', context => {
			const { directory, manifest } = fixture(context);
			fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'),
				`[AgentHostFirstResponse] ${JSON.stringify({ schemaVersion: 1, requestId: 'turn-1', sessionTurnKind: 'first', invocationKind: 'newTurn', outcome: 'success', hasResponseText: false, totalElapsedMs: 23 })}`);
			const call = { schemaVersion: 2, correlation: 'exact', turnId: 'turn-1', sdkSessionId: 'sdk-1', eventId: 'event-1' };
			fs.writeFileSync(path.join(directory, 'usage.jsonl'), [
				call, { ...call, outputTokens: 12 }, { ...call, sdkSessionId: 'sdk-2' }, { ...call, eventId: 'event-2' },
			].map(record => JSON.stringify(record)).join('\n'));
			assert.deepStrictEqual(extract(manifest, directory).runs[0].usage?.calls, [
				{ sdkSessionId: 'sdk-1', eventId: 'event-1', outputTokens: 12 },
				{ sdkSessionId: 'sdk-2', eventId: 'event-1' },
				{ sdkSessionId: 'sdk-1', eventId: 'event-2' },
			]);
		});

		test('rejects unsupported usage versions and invalid numeric measurements', context => {
			const { directory, manifest } = fixture(context);
			fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'),
				`[AgentHostFirstResponse] ${JSON.stringify({ schemaVersion: 1, requestId: 'turn-1', sessionTurnKind: 'first', invocationKind: 'newTurn', outcome: 'success', hasResponseText: false, totalElapsedMs: 23 })}`);
			const call = { schemaVersion: 2, correlation: 'exact', turnId: 'turn-1', sdkSessionId: 'sdk-1', eventId: 'event-1' };
			for (const record of [{ ...call, schemaVersion: 3 }, { ...call, inputTokens: -1 }, { ...call, durationMs: null }]) {
				fs.writeFileSync(path.join(directory, 'usage.jsonl'), JSON.stringify(record));
				assert.throws(() => extract(manifest, directory));
			}
		});

		test('rejects inconsistent records and contradictory duplicates', context => {
			const { directory, manifest } = fixture(context);
			const timing = { schemaVersion: 1, requestId: 'turn-1', sessionTurnKind: 'first', invocationKind: 'newTurn', outcome: 'success', hasResponseText: true, firstResponseTextMs: 17, totalElapsedMs: 23 };
			const file = path.join(directory, 'vscode-logs', 'Window', 'renderer.log');
			for (const record of [
				{ ...timing, hasResponseText: false },
				{ ...timing, totalElapsedMs: 5 },
				{ ...timing, totalElapsedMs: null },
				{ ...timing, schemaVersion: 2 },
				{ ...timing, firstResponseTextMs: undefined },
				{ ...timing, sessionTurnKind: 'later' },
			]) {
				fs.writeFileSync(file, `[AgentHostFirstResponse] ${JSON.stringify(record)}`);
				assert.throws(() => extract(manifest, directory));
			}
			fs.writeFileSync(file, [timing, { ...timing, firstResponseTextMs: 18 }].map(record => `[AgentHostFirstResponse] ${JSON.stringify(record)}`).join('\n'));
			assert.throws(() => extract(manifest, directory), /found 2/);
		});
	});

	test('ignores reasoning, tools, whitespace, other turns, other channels and snapshots', context => {
		const { directory, manifest } = fixture(context);
		fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'),
			'2026-09-17 17:58:11.962 [info] [AgentHost] _invokeAgent called for resource: agent-host-copilotcli:/fixture\n');
		const rows = [
			action('chat/toolCallStart', '2026-09-18T00:58:12.000Z', { toolName: 'rename_chat' }),
			action('chat/responsePart', '2026-09-18T00:58:12.001Z', { part: { kind: 'reasoning', id: 'reason', content: 'hidden' } }),
			action('chat/delta', '2026-09-18T00:58:12.002Z', { partId: 'reason', content: 'not answer' }),
			action('chat/responsePart', '2026-09-18T00:58:12.003Z', { turnId: 'other', part: { kind: 'markdown', content: 'other turn' } }),
			{ ...action('chat/responsePart', '2026-09-18T00:58:12.004Z'), params: { channel: 'child-chat', action: { type: 'chat/responsePart', turnId: 'turn-1', part: { kind: 'markdown', content: 'child' } } } },
			{ method: 'subscribe', result: { content: 'restored snapshot' } },
			action('chat/responsePart', '2026-09-18T00:58:12.005Z', { part: { kind: 'markdown', id: 'answer', content: '  ' } }),
			action('chat/delta', '2026-09-18T00:58:25.742Z', { partId: 'answer', content: 'Hi' }),
			action('chat/turnComplete', '2026-09-18T00:58:26.962Z'),
		];
		fs.writeFileSync(path.join(directory, 'ahp', 'fixture.jsonl'), rows.map(row => JSON.stringify(row)).join('\n'));
		const extracted = extract(manifest, directory, true);
		assert.deepStrictEqual(extracted.runs, [{
			runId: 'run-1', block: 'block-1', arm: 'control', surface: 'editor', cohort: 'coldProcess', turnId: 'turn-1',
			clock: 'historicalWallClock', outcome: 'success', firstTextMs: 13780, totalMs: 15000,
		}]);
		assert.ok(!JSON.stringify(extracted).includes('hidden'));
		assert.ok(!JSON.stringify(extracted).includes(directory));
	});

	test('records cancellation without text and ignores late text after terminal state', context => {
		const { directory, manifest } = fixture(context);
		fs.writeFileSync(path.join(directory, 'vscode-logs', 'Window', 'renderer.log'),
			'2026-09-17 17:58:11.962 [info] [AgentHost] _invokeAgent called for resource: agent-host-copilotcli:/fixture\n');
		fs.writeFileSync(path.join(directory, 'ahp', 'fixture.jsonl'), [
			action('chat/turnCancelled', '2026-09-18T00:58:12.962Z'),
			action('chat/responsePart', '2026-09-18T00:58:13.962Z', { part: { kind: 'markdown', content: 'late' } }),
		].map(row => JSON.stringify(row)).join('\n'));
		assert.deepStrictEqual(extract(manifest, directory, true).runs.map(run => [run.outcome, run.firstTextMs, run.totalMs]), [
			['cancelled', null, 1000],
		]);
	});

	test('fails explicitly for duplicate invocation or malformed JSON', context => {
		const { directory, manifest } = fixture(context);
		const line = '2026-09-17 17:58:11.962 [info] [AgentHost] _invokeAgent called for resource: agent-host-copilotcli:/fixture\n';
		const renderer = path.join(directory, 'vscode-logs', 'Window', 'renderer.log');
		fs.writeFileSync(renderer, line + line);
		assert.throws(() => extract(manifest, directory, true), /exactly one historical invocation/);
		fs.writeFileSync(renderer, line);
		fs.writeFileSync(path.join(directory, 'ahp', 'fixture.jsonl'), '{"private":broken');
		assert.throws(() => extract(manifest, directory, true), /Invalid JSON in fixture.jsonl:1/);
	});
});
