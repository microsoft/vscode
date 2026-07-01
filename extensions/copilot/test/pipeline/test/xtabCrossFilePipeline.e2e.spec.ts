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
import { allXtabCrossFileRecords, xtabCrossFileFixtures } from './fixtures/xtabCrossFileFixtureData';

/**
 * End-to-end tests for the `xtab-cross-file` branch of the nes-datagen pipeline.
 *
 * Mirrors `pipeline.e2e.spec.ts` (the single-file Xtab branch) but feeds a
 * recording whose post-request edits span two files, then asserts the
 * multi-file `CustomDiffPatch` label, the `--patch-order` block ordering, and
 * the cross-file metadata — plus that plain `xtab` collapses to the anchor file.
 *
 * The model is mocked / oracle-based (the label is computed from the recording),
 * so no API key or network is required.
 */

// Reuse the Xtab e2e config (promptingStrategy=patchBased02 → CustomDiffPatch).
const configPath = path.join(__dirname, 'fixtures', 'config.json');

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
		targetFiles?: { filePath: string; docContent: string; oracleEdits: [number, number, string][] }[];
		targetFilePaths?: string[];
		isCrossFile?: boolean;
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
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-datagen-xtab-crossfile-e2e-'));
	inputPath = path.join(tmpDir, 'input.json');
	await fs.writeFile(inputPath, JSON.stringify(allXtabCrossFileRecords, null, 2));
});

afterAll(async () => {
	if (tmpDir) {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

async function run(
	sampleTask: NesDatagenSampleTask,
	overrides?: Partial<NonNullable<RunPipelineOptions['nesDatagen']>>,
): Promise<OutputSample[]> {
	const outputPath = path.join(tmpDir, `output-${sampleTask}-${overrides?.patchOrder ?? 'default'}.jsonl`);
	const opts: RunPipelineOptions = {
		nesDatagen: {
			input: inputPath,
			output: outputPath,
			rowOffset: 0,
			workerMode: false,
			sampleTask,
			sameFileJumpMinAbove: 5,
			sameFileJumpMinBelow: 5,
			...overrides,
		},
		configFile: configPath,
		verbose: false,
		parallelism: 1,
	};
	await runInputPipeline(opts, () => { });
	const outputContents = await fs.readFile(outputPath, 'utf-8');
	return parseJsonl<OutputSample>(outputContents);
}

const anchor = xtabCrossFileFixtures.crossFile.anchorPath; // 'src/anchorA.ts'
const other = xtabCrossFileFixtures.crossFile.otherPath;   // 'src/otherA.ts'
const solo = xtabCrossFileFixtures.sameFile.anchorPath;    // 'src/soloB.ts'

describe('nes-datagen xtab-cross-file pipeline e2e', () => {

	describe('sampleTask = xtab-cross-file (first-touch)', () => {
		let samples: OutputSample[];
		beforeAll(async () => { samples = await run(NesDatagenSampleTask.XtabCrossFile); });

		test('emits one sample per record', () => {
			expect(samples.length).toBe(2);
		});

		test('the cross-file record is labelled across both files in first-touch order', () => {
			const s = samples.find(x => x.metadata.filePath.includes('anchorA'))!;
			expect(s).toBeDefined();
			expect(s.metadata.task).toBe(NesDatagenSampleTask.XtabCrossFile);
			expect(s.metadata.strategy).toBe('customDiffPatch');
			expect(s.metadata.isCrossFile).toBe(true);
			expect(s.metadata.targetFiles?.length).toBe(2);
			// First-touch: the cross-file (`otherA`) was edited before the anchor.
			expect(s.metadata.targetFilePaths).toEqual([other, anchor]);

			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant).toContain(anchor);
			expect(assistant).toContain(other);
			// Label block order matches first-touch: otherA precedes anchorA.
			expect(assistant.indexOf(other)).toBeLessThan(assistant.indexOf(anchor));
		});

		test('the anchor-only record stays single-file (isCrossFile false)', () => {
			const s = samples.find(x => x.metadata.filePath.includes('soloB'))!;
			expect(s).toBeDefined();
			expect(s.metadata.task).toBe(NesDatagenSampleTask.XtabCrossFile);
			expect(s.metadata.isCrossFile).toBe(false);
			expect(s.metadata.targetFiles?.length).toBe(1);
			expect(s.metadata.targetFilePaths).toEqual([solo]);

			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant).toContain(solo);
		});
	});

	describe('sampleTask = xtab-cross-file (anchor-first)', () => {
		let samples: OutputSample[];
		beforeAll(async () => { samples = await run(NesDatagenSampleTask.XtabCrossFile, { patchOrder: 'anchor-first' }); });

		test('the anchor block precedes the cross-file block in the label', () => {
			const s = samples.find(x => x.metadata.filePath.includes('anchorA'))!;
			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant.indexOf(anchor)).toBeLessThan(assistant.indexOf(other));
		});

		test('metadata target order matches the label (anchor first)', () => {
			const s = samples.find(x => x.metadata.filePath.includes('anchorA'))!;
			expect(s.metadata.targetFilePaths).toEqual([anchor, other]);
		});
	});

	describe('sampleTask = xtab (single-file, unchanged)', () => {
		let samples: OutputSample[];
		beforeAll(async () => { samples = await run(NesDatagenSampleTask.Xtab); });

		test('the cross-file record collapses to the anchor file only', () => {
			const s = samples.find(x => x.metadata.filePath.includes('anchorA'))!;
			expect(s.metadata.task).toBe(NesDatagenSampleTask.Xtab);
			expect(s.metadata.targetFiles).toBeUndefined();
			expect(s.metadata.isCrossFile).toBeUndefined();

			const assistant = s.messages.find(m => m.role === 'assistant')!.content;
			expect(assistant).toContain(anchor);
			expect(assistant).not.toContain(other);
		});
	});
});
