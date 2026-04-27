/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runInputPipeline, RunPipelineOptions } from '../pipeline';
import { allRecords, fixtures } from './fixtures/fixtureData';

function snapshotPath(name: string): string {
	return path.join(__dirname, 'expected', name);
}

/**
 * End-to-end tests for the nes-datagen pipeline.
 *
 * These tests exercise the full `runInputPipeline` with real fixture data,
 * verifying parsing → replay → prompt generation → response generation → output.
 *
 * Expected prompt/response contents are stored as separate snapshot files under
 * `test/pipeline/test/expected/` for easy reading and inspection.
 * Run `vitest --update` to regenerate them.
 */

const configPath = path.join(__dirname, 'fixtures', 'config.json');

let tmpDir: string;
let inputPath: string;
let outputPath: string;

beforeAll(async () => {
	tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nes-datagen-e2e-'));
	inputPath = path.join(tmpDir, 'input.json');
	outputPath = path.join(tmpDir, 'output.json');
	await fs.writeFile(inputPath, JSON.stringify(allRecords, null, 2));
});

afterAll(async () => {
	if (tmpDir) {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
	};
}

async function runPipeline(opts?: Partial<RunPipelineOptions>): Promise<{
	samples: OutputSample[];
	logs: string[];
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
		},
		configFile: configPath,
		verbose: true,
		parallelism: 1,
		...opts,
	};

	await runInputPipeline(pipelineOpts, log);

	const outputContents = await fs.readFile(outputPath, 'utf-8');
	const samples = JSON.parse(outputContents) as OutputSample[];

	return { samples, logs };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('nes-datagen pipeline e2e', () => {

	describe('full pipeline run', () => {
		let result: Awaited<ReturnType<typeof runPipeline>>;

		beforeAll(async () => {
			result = await runPipeline();
		});

		test('produces output samples for valid rows', () => {
			// 2 valid rows (ts + py), 1 invalid row (missing recording)
			expect(result.samples.length).toBe(2);
		});

		test('logs report correct counts in pipeline summary', () => {
			const summaryLog = result.logs.find(l => l.includes('Pipeline:'));
			expect(summaryLog).toBeDefined();
			// Input 2 valid rows parsed from 3 total (1 error), all 2 replayed etc.
			expect(summaryLog).toContain('Input(2)');
			expect(summaryLog).toContain('Replay(2)');
		});

		test('logs report parse error for invalid row', () => {
			const parseLog = result.logs.find(l => l.includes('[1/5]'));
			expect(parseLog).toBeDefined();
			// Should have 1 error from the invalid record missing recording
			expect(parseLog).toContain('1 errors');
		});

		test('output samples have correct metadata', () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript');
			const pySample = result.samples.find(s => s.metadata.language === 'python');

			expect(tsSample).toBeDefined();
			expect(pySample).toBeDefined();

			expect(tsSample!.metadata.suggestionStatus).toBe('accepted');
			expect(tsSample!.metadata.strategy).toBe('customDiffPatch');
			expect(tsSample!.metadata.filePath).toContain('src/loader.ts');

			expect(pySample!.metadata.suggestionStatus).toBe('notAccepted');
			expect(pySample!.metadata.strategy).toBe('customDiffPatch');
			expect(pySample!.metadata.filePath).toContain('src/utils.py');
		});

		test('output samples contain all three message roles', () => {
			for (const sample of result.samples) {
				const roles = sample.messages.map(m => m.role);
				expect(roles).toContain('system');
				expect(roles).toContain('user');
				expect(roles).toContain('assistant');
			}
		});

		test('system message is non-empty for all samples', () => {
			for (const sample of result.samples) {
				const system = sample.messages.find(m => m.role === 'system');
				expect(system).toBeDefined();
				expect(system!.content.trim().length).toBeGreaterThan(0);
			}
		});

		test('user prompt contains the document content', () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			const userMsg = tsSample.messages.find(m => m.role === 'user')!;
			// The prompt should reference the original document
			expect(userMsg.content).toContain('readFile');
			expect(userMsg.content).toContain('loadData');
		});

		test('assistant response contains a diff patch for TypeScript sample', () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			const assistantMsg = tsSample.messages.find(m => m.role === 'assistant')!;
			// PatchBased02 format: file:line, -old, +new
			expect(assistantMsg.content).toContain('src/loader.ts');
		});

		test('oracle edits are preserved in metadata', () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			expect(tsSample.metadata.oracleEdits.length).toBeGreaterThan(0);
			// The combined edit replaces `data` with `contents` in at least one location
			const hasContentsEdit = tsSample.metadata.oracleEdits.some(
				([, , text]) => text === 'contents'
			);
			expect(hasContentsEdit).toBe(true);
		});

		test('docContent in metadata matches the original fixture', () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			expect(tsSample.metadata.docContent).toBe(fixtures.ts.docContent);

			const pySample = result.samples.find(s => s.metadata.language === 'python')!;
			expect(pySample.metadata.docContent).toBe(fixtures.py.docContent);
		});
	});

	describe('expected prompt and response files', () => {
		let result: Awaited<ReturnType<typeof runPipeline>>;

		beforeAll(async () => {
			result = await runPipeline();
		});

		test('TypeScript sample prompt matches expected file', async () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			const userPrompt = tsSample.messages.find(m => m.role === 'user')!.content;
			await expect(userPrompt).toMatchFileSnapshot(snapshotPath('ts-user-prompt.txt'));
		});

		test('TypeScript sample system prompt matches expected file', async () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			const systemPrompt = tsSample.messages.find(m => m.role === 'system')!.content;
			await expect(systemPrompt).toMatchFileSnapshot(snapshotPath('ts-system-prompt.txt'));
		});

		test('TypeScript sample response matches expected file', async () => {
			const tsSample = result.samples.find(s => s.metadata.language === 'typescript')!;
			const response = tsSample.messages.find(m => m.role === 'assistant')!.content;
			await expect(response).toMatchFileSnapshot(snapshotPath('ts-assistant-response.txt'));
		});

		test('Python sample prompt matches expected file', async () => {
			const pySample = result.samples.find(s => s.metadata.language === 'python')!;
			const userPrompt = pySample.messages.find(m => m.role === 'user')!.content;
			await expect(userPrompt).toMatchFileSnapshot(snapshotPath('py-user-prompt.txt'));
		});

		test('Python sample system prompt matches expected file', async () => {
			const pySample = result.samples.find(s => s.metadata.language === 'python')!;
			const systemPrompt = pySample.messages.find(m => m.role === 'system')!.content;
			await expect(systemPrompt).toMatchFileSnapshot(snapshotPath('py-system-prompt.txt'));
		});

		test('Python sample response matches expected file', async () => {
			const pySample = result.samples.find(s => s.metadata.language === 'python')!;
			const response = pySample.messages.find(m => m.role === 'assistant')!.content;
			await expect(response).toMatchFileSnapshot(snapshotPath('py-assistant-response.txt'));
		});
	});

	describe('pipeline with only invalid input', () => {
		let invalidInputPath: string;
		let invalidOutputPath: string;

		beforeAll(async () => {
			invalidInputPath = path.join(tmpDir, 'invalid-input.json');
			invalidOutputPath = path.join(tmpDir, 'invalid-output.json');
			await fs.writeFile(invalidInputPath, JSON.stringify([fixtures.invalid.record]));
		});

		test('completes without crashing and produces empty output', async () => {
			const logs: string[] = [];
			await runInputPipeline(
				{
					nesDatagen: {
						input: invalidInputPath,
						output: invalidOutputPath,
						rowOffset: 0,
						workerMode: false,
					},
					configFile: configPath,
					verbose: false,
					parallelism: 1,
				},
				(...args: unknown[]) => { logs.push(args.join(' ')); },
			);

			const content = await fs.readFile(invalidOutputPath, 'utf-8');
			const samples = JSON.parse(content) as OutputSample[];
			expect(samples).toEqual([]);

			// Should report the parse error
			const parseLog = logs.find(l => l.includes('[1/5]'));
			expect(parseLog).toContain('1 errors');
		});
	});

	describe('pipeline without config file', () => {
		test('throws when configFile is not provided', async () => {
			await expect(
				runInputPipeline({
					nesDatagen: {
						input: inputPath,
						output: outputPath,
						rowOffset: 0,
						workerMode: false,
					},
					configFile: undefined,
					verbose: false,
					parallelism: 1,
				})
			).rejects.toThrow('nes-datagen requires --config-file');
		});
	});

	describe('row offset', () => {
		test('applies rowOffset to sample rowIndex in metadata', async () => {
			const offsetOutputPath = path.join(tmpDir, 'offset-output.json');
			await runInputPipeline(
				{
					nesDatagen: {
						input: inputPath,
						output: offsetOutputPath,
						rowOffset: 100,
						workerMode: false,
					},
					configFile: configPath,
					verbose: false,
					parallelism: 1,
				},
				() => { },
			);

			const content = await fs.readFile(offsetOutputPath, 'utf-8');
			const samples = JSON.parse(content) as OutputSample[];
			expect(samples.length).toBe(2);
			// Row indices should be shifted by the offset
			for (const sample of samples) {
				expect(sample.metadata.rowIndex).toBeGreaterThanOrEqual(100);
			}
		});
	});

	describe('structural validation', () => {
		test('samples with all message roles populated pass validation', async () => {
			const { samples } = await runPipeline();
			for (const sample of samples) {
				for (const msg of sample.messages) {
					expect(msg.content).toBeDefined();
					expect(msg.content.trim().length).toBeGreaterThan(0);
				}
			}
		});
	});
});
