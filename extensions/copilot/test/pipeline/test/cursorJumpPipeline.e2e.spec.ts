/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { NesDatagenSampleTask } from '../../base/simulationOptions';
import { runInputPipeline, RunPipelineOptions } from '../pipeline';
import { allCursorJumpRecords, cursorJumpFixtures } from './fixtures/cursorJumpFixtureData';

/**
 * End-to-end tests for the cursor-jump branch of the nes-datagen pipeline.
 *
 * Mirrors `pipeline.e2e.spec.ts` (which covers the Xtab branch): feeds two
 * fixture rows (a same-file jump and a cross-file jump) through the full
 * pipeline and asserts on the JSONL output for each `sampleTask` mode.
 */

const configPath = path.join(__dirname, 'fixtures', 'cursorJumpConfig.json');

interface OutputSample {
	messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
	metadata: {
		rowIndex: number;
		language: string;
		strategy: string;
		oracleEditCount: number;
		suggestionStatus: string;
		filePath: string;
		docContent: string;
		oracleEdits: [number, number, string][];
		originalPrompt: unknown[];
		modelResponse: string;
		// Discriminated-union fields spread onto metadata by `assembleSample`.
		task?: NesDatagenSampleTask;
		jump?: { fromLine: number; toLine: number; toFilePath?: string; distance: number };
	};
}

function parseJsonl<T>(contents: string): T[] {
	return contents
		.split('\n')
		.filter(line => line.length > 0)
		.map(line => JSON.parse(line) as T);
}

let tmpDir: string;
let inputPath: string;

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-datagen-cursor-e2e-'));
	inputPath = path.join(tmpDir, 'input.json');
	await fs.writeFile(inputPath, JSON.stringify(allCursorJumpRecords, null, 2));
});

afterAll(async () => {
	if (tmpDir) {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

async function runCursorPipeline(sampleTask: NesDatagenSampleTask, overrides?: Partial<RunPipelineOptions>): Promise<{
	samples: OutputSample[];
	logs: string[];
}> {
	const logs: string[] = [];
	const log = (...args: unknown[]) => {
		logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
	};

	const defaultOutputPath = path.join(tmpDir, `output-${sampleTask}.jsonl`);
	const opts: RunPipelineOptions = {
		nesDatagen: {
			input: inputPath,
			output: defaultOutputPath,
			rowOffset: 0,
			workerMode: false,
			sampleTask,
			sameFileJumpMinAbove: 5,
			sameFileJumpMinBelow: 5,
		},
		configFile: configPath,
		verbose: true,
		parallelism: 1,
		...overrides,
	};

	await runInputPipeline(opts, log);

	// Read from the *final* configured output path — `overrides.nesDatagen`
	// fully replaces the default block, so callers that override may have
	// pointed at a different file.
	const outputContents = await fs.readFile(opts.nesDatagen!.output!, 'utf-8');
	return { samples: parseJsonl<OutputSample>(outputContents), logs };
}

describe('nes-datagen cursor-jump pipeline e2e', () => {

	describe('sampleTask = cursor-same-file', () => {
		let result: Awaited<ReturnType<typeof runCursorPipeline>>;

		beforeAll(async () => {
			result = await runCursorPipeline(NesDatagenSampleTask.CursorSameFile);
		});

		test('emits exactly one sample — only the same-file row qualifies', () => {
			expect(result.samples.length).toBe(1);
		});

		test('sample is tagged as next-cursor-line-prediction with the same-file source', () => {
			const s = result.samples[0];
			expect(s.metadata.strategy).toBe('next-cursor-line-prediction');
			expect(s.metadata.filePath).toContain(cursorJumpFixtures.sameFile.relativePath);
			expect(s.metadata.task).toBe(NesDatagenSampleTask.CursorSameFile);
		});

		test('modelResponse mirrors the assistant message (round-4 fix)', () => {
			const s = result.samples[0];
			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant.length).toBeGreaterThan(0);
			expect(s.metadata.modelResponse).toBe(assistant);
		});

		test('assistant response targets the jumped-to line (line 25)', () => {
			const assistant = result.samples[0].messages.find(m => m.role === 'assistant')!.content;
			// Same-file response references the destination line number.
			expect(assistant).toMatch(/25/);
		});
	});

	describe('sampleTask = cursor-cross-file', () => {
		let result: Awaited<ReturnType<typeof runCursorPipeline>>;

		beforeAll(async () => {
			result = await runCursorPipeline(NesDatagenSampleTask.CursorCrossFile);
		});

		test('emits exactly one sample — only the cross-file row qualifies', () => {
			expect(result.samples.length).toBe(1);
		});

		test('sample is tagged as a cross-file cursor jump', () => {
			const s = result.samples[0];
			expect(s.metadata.strategy).toBe('next-cursor-line-prediction');
			expect(s.metadata.task).toBe(NesDatagenSampleTask.CursorCrossFile);
		});

		test('assistant response references the target file', () => {
			const assistant = result.samples[0].messages.find(m => m.role === 'assistant')!.content;
			expect(assistant).toContain(cursorJumpFixtures.crossFile.targetPath);
		});

		test('modelResponse mirrors the assistant message', () => {
			const s = result.samples[0];
			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(s.metadata.modelResponse).toBe(assistant);
		});
	});

	describe('sampleTask = cursor-both', () => {
		let result: Awaited<ReturnType<typeof runCursorPipeline>>;

		beforeAll(async () => {
			result = await runCursorPipeline(NesDatagenSampleTask.CursorBoth);
		});

		test('emits one sample per row — both kinds are accepted', () => {
			expect(result.samples.length).toBe(2);
		});

		test('produces both a same-file and a cross-file classification', () => {
			const tasks = result.samples.map(s => s.metadata.task).sort();
			expect(tasks).toEqual([
				NesDatagenSampleTask.CursorCrossFile,
				NesDatagenSampleTask.CursorSameFile,
			].sort());
		});

		test('every sample uses the next-cursor-line-prediction strategy', () => {
			for (const s of result.samples) {
				expect(s.metadata.strategy).toBe('next-cursor-line-prediction');
			}
		});

		test('every sample has all three message roles populated', () => {
			for (const s of result.samples) {
				const roles = s.messages.map(m => m.role);
				expect(roles).toContain('system');
				expect(roles).toContain('user');
				expect(roles).toContain('assistant');
				for (const m of s.messages) {
					expect(m.content.trim().length).toBeGreaterThan(0);
				}
			}
		});
	});

	describe('row offset', () => {
		test('applies rowOffset to sample rowIndex in metadata', async () => {
			const { samples } = await runCursorPipeline(NesDatagenSampleTask.CursorBoth, {
				nesDatagen: {
					input: inputPath,
					output: path.join(tmpDir, 'output-offset.jsonl'),
					rowOffset: 500,
					workerMode: false,
					sampleTask: NesDatagenSampleTask.CursorBoth,
					sameFileJumpMinAbove: 5,
					sameFileJumpMinBelow: 5,
				},
			});

			expect(samples.length).toBe(2);
			for (const s of samples) {
				expect(s.metadata.rowIndex).toBeGreaterThanOrEqual(500);
			}
		});
	});
});
