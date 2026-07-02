/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NesDatagenInputFormat, NesDatagenSampleTask, PivotStrategy } from '../../base/simulationOptions';
import { runInputPipeline, RunPipelineOptions } from '../pipeline';
import { allContinuousRecords, continuousFixtures } from './fixtures/continuousFixtureData';

/**
 * End-to-end tests for the nes-datagen pipeline on the **continuous** input
 * format (`--input-format=continuous`).
 *
 * These exercise the full `runInputPipeline` — continuous parse → pivot
 * synthesis → split → replay → prompt/response generation → output — with real
 * fixture data, mirroring `pipeline.e2e.spec.ts` for the alternative-action
 * path. The fixtures are crafted so each valid slice has exactly one eligible
 * pivot, making the output deterministic regardless of the pivot RNG seed.
 */

const configPath = path.join(__dirname, 'fixtures', 'config.json');

let tmpDir: string;
let inputPath: string;
let outputPath: string;

function parseJsonl<T>(contents: string): T[] {
	return contents
		.split('\n')
		.filter(line => line.length > 0)
		.map(line => JSON.parse(line) as T);
}

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-datagen-continuous-e2e-'));
	inputPath = path.join(tmpDir, 'input.json');
	outputPath = path.join(tmpDir, 'output.jsonl');
	await fs.writeFile(inputPath, JSON.stringify(allContinuousRecords, null, 2));
});

afterAll(async () => {
	if (tmpDir) {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

interface OutputSample {
	messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
	metadata: {
		rowIndex: number;
		language: string;
		suggestionStatus: string;
		filePath: string;
		docContent: string;
		oracleEdits: [number, number, string][];
	};
}

async function runContinuousPipeline(opts?: Partial<RunPipelineOptions>): Promise<{
	samples: OutputSample[];
	logs: string[];
	output: string;
}> {
	const logs: string[] = [];
	const log = (...args: unknown[]) => {
		logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
	};

	const pipelineOpts: RunPipelineOptions = {
		nesDatagen: {
			input: inputPath,
			output: outputPath,
			rowOffset: 0,
			workerMode: false,
			sampleTask: NesDatagenSampleTask.Xtab,
			sameFileJumpMinAbove: 5,
			sameFileJumpMinBelow: 5,
			inputFormat: NesDatagenInputFormat.Continuous,
			pivotStrategy: PivotStrategy.Random,
			seed: 42,
		},
		configFile: configPath,
		verbose: true,
		parallelism: 1,
		...opts,
	};

	await runInputPipeline(pipelineOpts, log);

	const output = await fs.readFile(outputPath, 'utf-8');
	return { samples: parseJsonl<OutputSample>(output), logs, output };
}

describe('nes-datagen continuous pipeline e2e', () => {

	describe('full pipeline run', () => {
		let result: Awaited<ReturnType<typeof runContinuousPipeline>>;

		beforeAll(async () => {
			result = await runContinuousPipeline();
		});

		test('produces one oracle-only sample per valid slice', () => {
			// 2 valid slices (ts + py); the capped slice is dropped at parse.
			expect(result.samples.length).toBe(2);
		});

		test('reports the capped (entries-dropped) slice as a parse error', () => {
			const parseLog = result.logs.find(l => l.includes('[1/5]'));
			expect(parseLog).toBeDefined();
			expect(parseLog).toContain('1 errors');
		});

		test('logs the continuous input format with strategy and seed', () => {
			const formatLog = result.logs.find(l => l.includes('Input format: continuous'));
			expect(formatLog).toBeDefined();
			expect(formatLog).toContain('pivot-strategy: random');
			expect(formatLog).toContain('seed: 42');
		});

		test('every sample is tagged as a continuous (oracle-only) sample', () => {
			for (const sample of result.samples) {
				expect(sample.metadata.suggestionStatus).toBe('continuous');
			}
		});

		test('resolves language and file path from the replayed slice', () => {
			const ts = result.samples.find(s => s.metadata.language === 'typescript');
			const py = result.samples.find(s => s.metadata.language === 'python');

			expect(ts).toBeDefined();
			expect(py).toBeDefined();
			expect(ts!.metadata.filePath).toContain('src/math.ts');
			expect(py!.metadata.filePath).toContain('src/greet.py');
		});

		test('extracts the post-pivot oracle edit', () => {
			const ts = result.samples.find(s => s.metadata.language === 'typescript')!;
			const py = result.samples.find(s => s.metadata.language === 'python')!;

			expect(ts.metadata.oracleEdits.some(([, , text]) => text === 'sum')).toBe(true);
			expect(py.metadata.oracleEdits.some(([, , text]) => text === ' -> str')).toBe(true);
		});

		test('docContent is the slice content at the pivot (pre-oracle)', () => {
			const ts = result.samples.find(s => s.metadata.language === 'typescript')!;
			// Context reflects the pre-pivot edit but not the oracle: the
			// original `add` is present and has not yet been renamed to `sum`.
			expect(ts.metadata.docContent).toContain('export function add(');
			expect(ts.metadata.docContent).not.toContain('sum');
		});

		test('every sample carries non-empty system, user and assistant messages', () => {
			for (const sample of result.samples) {
				const roles = sample.messages.map(m => m.role);
				expect(roles).toEqual(['system', 'user', 'assistant']);
				for (const msg of sample.messages) {
					expect(msg.content.trim().length).toBeGreaterThan(0);
				}
			}
		});
	});

	test('is reproducible: two runs with the same seed produce identical output', async () => {
		const a = await runContinuousPipeline();
		const b = await runContinuousPipeline();
		expect(a.output).toBe(b.output);
	});

	test('a slice whose oracle edit is malformed is isolated, not fatal', async () => {
		// Overlapping replacements in the post-pivot `changed` make the split
		// throw; the batch must still produce the sibling sample rather than abort.
		const badEntries = [
			{ kind: 'meta', data: { repoRootUri: 'file:///workspace' } },
			{ kind: 'documentEncountered', id: 0, time: 3000, relativePath: 'src/bad.ts' },
			{ kind: 'setContent', id: 0, time: 3001, content: 'const value = 1;\n', v: 0 },
			// Pre-pivot edit → the only eligible pivot (a later `changed` follows).
			{ kind: 'changed', id: 0, time: 3002, edit: [[0, 0, '// x\n']], v: 1 },
			// Malformed oracle: the two replacements overlap.
			{ kind: 'changed', id: 0, time: 3004, edit: [[6, 11, 'a'], [8, 13, 'b']], v: 2 },
		];
		const badRecord = { recording: JSON.stringify({ entries: badEntries, entriesSize: 100 }) };

		const mixedInput = path.join(tmpDir, 'mixed-input.json');
		const mixedOutput = path.join(tmpDir, 'mixed-output.jsonl');
		await fs.writeFile(mixedInput, JSON.stringify([continuousFixtures.ts.record, badRecord]));

		const logs: string[] = [];
		await runInputPipeline(
			{
				nesDatagen: {
					input: mixedInput,
					output: mixedOutput,
					rowOffset: 0,
					workerMode: false,
					sampleTask: NesDatagenSampleTask.Xtab,
					sameFileJumpMinAbove: 5,
					sameFileJumpMinBelow: 5,
					inputFormat: NesDatagenInputFormat.Continuous,
					pivotStrategy: PivotStrategy.Random,
					seed: 42,
				},
				configFile: configPath,
				verbose: true,
				parallelism: 1,
			},
			(...args: unknown[]) => { logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); },
		);

		const samples = parseJsonl<OutputSample>(await fs.readFile(mixedOutput, 'utf-8'));
		expect(samples.length).toBe(1);
		expect(samples[0].metadata.filePath).toContain('src/math.ts');

		// The malformed slice is surfaced as a replay error, not swallowed.
		const replayLog = logs.find(l => l.includes('[2/5]'));
		expect(replayLog).toContain('1 errors');
	});
});
