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

async function runCursorPipeline(sampleTask: NesDatagenSampleTask, nesDatagenOverrides?: Partial<NonNullable<RunPipelineOptions['nesDatagen']>>): Promise<{
	samples: OutputSample[];
	logs: string[];
}> {
	const logs: string[] = [];
	const log = (...args: unknown[]) => {
		logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
	};

	const outputPath = nesDatagenOverrides?.output ?? path.join(tmpDir, `output-${sampleTask}.jsonl`);
	const opts: RunPipelineOptions = {
		nesDatagen: {
			input: inputPath,
			output: outputPath,
			rowOffset: 0,
			workerMode: false,
			sampleTask,
			inputFormat: NesDatagenInputFormat.AlternativeAction,
			pivotStrategy: PivotStrategy.Random,
			seed: 0,
			sameFileJumpMinAbove: 5,
			sameFileJumpMinBelow: 5,
			...nesDatagenOverrides,
		},
		configFile: configPath,
		verbose: true,
		parallelism: 1,
	};

	await runInputPipeline(opts, log);

	const outputContents = await fs.readFile(outputPath, 'utf-8');
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

		test('sample carries the expected metadata, jump, and assistant content', () => {
			const s = result.samples[0];
			expect(s.metadata.strategy).toBe('next-cursor-line-prediction');
			expect(s.metadata.filePath).toContain(cursorJumpFixtures.sameFile.relativePath);
			expect(s.metadata.task).toBe(NesDatagenSampleTask.CursorSameFile);
			expect(s.metadata.jump).toEqual({
				fromLine: cursorJumpFixtures.sameFile.fromLine,
				toLine: cursorJumpFixtures.sameFile.toLine,
				distance: cursorJumpFixtures.sameFile.toLine - cursorJumpFixtures.sameFile.fromLine,
			});

			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant).toBe(String(cursorJumpFixtures.sameFile.toLine));
			// `modelResponse` mirrors the assistant content (the round-4 fix).
			expect(s.metadata.modelResponse).toBe(assistant);
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

		test('sample carries the expected metadata, jump, and `<file>:<line>` assistant content', () => {
			const s = result.samples[0];
			expect(s.metadata.strategy).toBe('next-cursor-line-prediction');
			expect(s.metadata.task).toBe(NesDatagenSampleTask.CursorCrossFile);
			expect(s.metadata.jump).toEqual({
				fromLine: cursorJumpFixtures.crossFile.fromLine,
				toLine: cursorJumpFixtures.crossFile.toLine,
				toFilePath: cursorJumpFixtures.crossFile.targetPath,
				distance: 0,
			});

			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant).toBe(`${cursorJumpFixtures.crossFile.targetPath}:${cursorJumpFixtures.crossFile.toLine}`);
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

		test('the same-file row produces the same-file classification, the cross-file row the cross-file one', () => {
			// Pin by filePath so a row/classification swap would be caught.
			const sameFile = result.samples.find(s => s.metadata.filePath.includes(cursorJumpFixtures.sameFile.relativePath));
			const crossFile = result.samples.find(s => s.metadata.filePath.includes(cursorJumpFixtures.crossFile.activePath));

			expect(sameFile?.metadata.task).toBe(NesDatagenSampleTask.CursorSameFile);
			expect(sameFile?.messages.find(m => m.role === 'assistant')?.content).toBe(String(cursorJumpFixtures.sameFile.toLine));

			expect(crossFile?.metadata.task).toBe(NesDatagenSampleTask.CursorCrossFile);
			expect(crossFile?.messages.find(m => m.role === 'assistant')?.content).toBe(`${cursorJumpFixtures.crossFile.targetPath}:${cursorJumpFixtures.crossFile.toLine}`);
		});

		test('every sample uses the next-cursor-line-prediction strategy and has all three roles populated', () => {
			for (const s of result.samples) {
				expect(s.metadata.strategy).toBe('next-cursor-line-prediction');
				const roles = s.messages.map(m => m.role);
				expect(roles).toEqual(expect.arrayContaining(['system', 'user', 'assistant']));
				for (const m of s.messages) {
					expect(m.content.trim().length).toBeGreaterThan(0);
				}
			}
		});

		test('does not emit a sample for the within-threshold row (negative case)', () => {
			// Scenario C in the fixture: cursor at line 10, edit at line 12.
			// Only 2 lines below — within the ±5 threshold — so neither the
			// same-file nor the cross-file generator should pick it up even
			// in `cursor-both` mode.
			const withinThreshold = result.samples.find(s => s.metadata.filePath.includes(cursorJumpFixtures.withinThreshold.relativePath));
			expect(withinThreshold).toBeUndefined();
		});
	});

	describe('row offset', () => {
		test('applies rowOffset to sample rowIndex in metadata', async () => {
			const { samples } = await runCursorPipeline(NesDatagenSampleTask.CursorBoth, {
				output: path.join(tmpDir, 'output-offset.jsonl'),
				rowOffset: 500,
			});

			expect(samples.length).toBe(2);
			for (const s of samples) {
				expect(s.metadata.rowIndex).toBeGreaterThanOrEqual(500);
			}
		});
	});
});
