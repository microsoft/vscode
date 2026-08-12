/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SessionEvent } from '@github/copilot-sdk';
import { readFileSync } from 'fs';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agent.js';
import { mapSessionEvents } from '../../node/copilot/mapSessionEvents.js';

interface BenchmarkResult {
	readonly readMs: number;
	readonly parseMs: number;
	readonly mapMs: number;
	readonly serializeMs: number;
	readonly totalMs: number;
	readonly inputBytes: number;
	readonly eventCount: number;
	readonly outputBytes: number;
	readonly turnCount: number;
	readonly subagentCount: number;
	readonly subagentTurnCount: number;
}

const eventLogPath = process.env['VSCODE_AGENT_HOST_EVENTS_JSONL'];
const rounds = readPositiveInteger(process.env['VSCODE_AGENT_HOST_EVENT_RESTORATION_ROUNDS']) ?? 5;

function readPositiveInteger(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseEvents(contents: string): SessionEvent[] {
	const events: SessionEvent[] = [];
	for (const line of contents.split(/\r?\n/)) {
		if (line.length > 0) {
			events.push(JSON.parse(line) as SessionEvent);
		}
	}
	return events;
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

async function runBenchmarkRound(path: string): Promise<BenchmarkResult> {
	const total = StopWatch.create();

	const read = StopWatch.create();
	const contents = readFileSync(path, 'utf8');
	const readMs = read.elapsed();

	const parse = StopWatch.create();
	const events = parseEvents(contents);
	const parseMs = parse.elapsed();

	const map = StopWatch.create();
	const restored = await mapSessionEvents(AgentSession.uri('copilot', 'event-restoration-benchmark'), undefined, events);
	const mapMs = map.elapsed();

	const serialize = StopWatch.create();
	const serialized = JSON.stringify({
		turns: restored.turns,
		subagentTurns: [...restored.subagentTurnsByToolCallId],
	});
	const serializeMs = serialize.elapsed();

	let subagentTurnCount = 0;
	for (const turns of restored.subagentTurnsByToolCallId.values()) {
		subagentTurnCount += turns.length;
	}

	return {
		readMs,
		parseMs,
		mapMs,
		serializeMs,
		totalMs: total.elapsed(),
		inputBytes: Buffer.byteLength(contents),
		eventCount: events.length,
		outputBytes: Buffer.byteLength(serialized),
		turnCount: restored.turns.length,
		subagentCount: restored.subagentTurnsByToolCallId.size,
		subagentTurnCount,
	};
}

if (eventLogPath) {
	suite('Agent Host event restoration - perf', function () {
		ensureNoDisposablesAreLeakedInTestSuite();

		test('restores events.jsonl', async function () {
			this.timeout(120_000);

			await runBenchmarkRound(eventLogPath);

			const results: BenchmarkResult[] = [];
			for (let i = 0; i < rounds; i++) {
				results.push(await runBenchmarkRound(eventLogPath));
			}

			const output = results.map(result => ({
				inputBytes: result.inputBytes,
				eventCount: result.eventCount,
				outputBytes: result.outputBytes,
				turnCount: result.turnCount,
				subagentCount: result.subagentCount,
				subagentTurnCount: result.subagentTurnCount,
			}));
			assert.deepStrictEqual(output, output.map(() => output[0]));

			console.log('[agent host event restoration perf] input', output[0]);
			console.log('[agent host event restoration perf] median', {
				rounds,
				readMs: median(results.map(result => result.readMs)),
				parseMs: median(results.map(result => result.parseMs)),
				mapMs: median(results.map(result => result.mapMs)),
				serializeMs: median(results.map(result => result.serializeMs)),
				totalMs: median(results.map(result => result.totalMs)),
			});
		});
	});
}
