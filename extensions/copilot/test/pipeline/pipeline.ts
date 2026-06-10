/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fork } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createExtensionUnitTestingServices } from '../../src/extension/test/node/services';
import { ConfigKey, IConfigurationService } from '../../src/platform/configuration/common/configurationService';
import { ResponseFormat } from '../../src/platform/inlineEdits/common/dataTypes/xtabPromptOptions';
import { Limiter } from '../../src/util/vs/base/common/async';
import { applyConfigFile, loadConfigFile } from '../base/simulationContext';
import { NesDatagen, SimulationOptions } from '../base/simulationOptions';
import { assembleSample, ISample, resolveOutputPath, writeSamples } from './output';
import { loadAndParseInput } from './parseInput';
import { generatePromptFromRecording, IGeneratedPrompt } from './promptStep';
import { parseSuggestedEdit, processAllRows } from './replayRecording';
import { generateAllResponses, generateResponse, IResponseGenerationInput } from './responseStep';
import { streamJsonRecords } from './streamJsonRecords';
import { openWriteStream } from './writeStream';

function logErrors(errors: readonly { error: string }[], verbose: boolean, log: (...ps: any[]) => void): void {
	if (errors.length > 0 && verbose) {
		for (const err of errors) {
			console.log(`    ${err.error}`);
		}
	}
}

function formatElapsed(startTime: number): string {
	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	return `${elapsed}s`;
}

export type RunPipelineOptions = {
	readonly nesDatagen: NesDatagen | undefined;
	/**
	 * path to config file
	 */
	readonly configFile: string | undefined;
	readonly verbose: number | boolean | undefined;
	readonly parallelism: number;
};

export async function runInputPipeline(opts: RunPipelineOptions, log = console.log.bind(console)): Promise<void> {
	const nesDatagenOpts = opts.nesDatagen!;
	const inputPath = nesDatagenOpts.input;
	if (!opts.configFile) {
		throw new Error('nes-datagen requires --config-file');
	}
	const configs = loadConfigFile(opts.configFile);
	const verbose = !!opts.verbose;
	const concurrency = opts.parallelism;
	const rowOffset = nesDatagenOpts.rowOffset;

	log(`\n=== Pipeline ===`);
	log(`  Input: ${inputPath}`);
	log(`  Concurrency: ${concurrency}`);

	// Step 1: Parse input
	const { rows, errors } = await loadAndParseInput(inputPath, verbose);
	log(`  [1/5] Input parsed: ${rows.length} rows, ${errors.length} errors`);
	logErrors(errors, verbose, log);

	// Step 2: Replay recordings
	const { processed, errors: replayErrors } = processAllRows(rows);
	log(`  [2/5] Recordings replayed: ${processed.length} ok, ${replayErrors.length} errors`);
	logErrors(replayErrors.map(e => ({
		error: `[sample ${e.rowIndex + rowOffset}, ${rows[e.rowIndex]?.activeDocumentLanguageId ?? '?'}] ${e.error}`,
	})), verbose, log);

	// Step 3: Generate prompts
	const serviceCollection = createExtensionUnitTestingServices();
	const testAccessor = serviceCollection.createTestingAccessor();

	try {
		const configService = testAccessor.get(IConfigurationService);

		await applyConfigFile(configService, configs);

		// Disable interactive debounce for batch mode
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounce, 0);
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, 0);
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine, 0);
		await configService.setConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceInlineSuggestion, 0);

		const modelConfig = configService.getConfig(ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration);
		const responseFormat = ResponseFormat.fromPromptingStrategy(modelConfig?.promptingStrategy);

		log(`  Local model configuration: ${JSON.stringify(modelConfig)}`);

		const prompts: { originalRowIndex: number; prompt: IGeneratedPrompt }[] = [];
		const promptErrors: { originalRowIndex: number; error: string }[] = [];
		let promptsCompleted = 0;
		const promptStartTime = Date.now();

		const limiter = new Limiter<void>(concurrency);
		await Promise.all(processed.map(p =>
			limiter.queue(async () => {
				const globalIdx = p.originalRowIndex + rowOffset;
				const result = await generatePromptFromRecording(testAccessor, p.recordingInfo);
				if ('error' in result) {
					promptErrors.push({ originalRowIndex: p.originalRowIndex, error: `[sample ${globalIdx}, ${p.row.activeDocumentLanguageId}, ${p.activeFilePath}] ${result.error}` });
				} else {
					prompts.push({ originalRowIndex: p.originalRowIndex, prompt: result });
				}
				promptsCompleted++;
				if (verbose && (promptsCompleted % 50 === 0 || promptsCompleted === processed.length)) {
					console.log(`    Progress: ${promptsCompleted}/${processed.length} (${formatElapsed(promptStartTime)})`);
				}
			})
		));

		log(`  [3/5] Prompts generated: ${prompts.length} ok, ${promptErrors.length} errors (${formatElapsed(promptStartTime)})`);
		logErrors(promptErrors, verbose, log);

		// Step 4: Generate responses
		const processedByOriginalIndex = new Map(processed.map(p => [p.originalRowIndex, p]));
		const responseInputs: IResponseGenerationInput[] = [];

		for (const { originalRowIndex, prompt } of prompts) {
			const p = processedByOriginalIndex.get(originalRowIndex);
			if (!p) {
				continue;
			}
			responseInputs.push({
				index: originalRowIndex,
				oracleEdits: p.nextUserEdit?.edit,
				docContent: p.activeDocument.value.get().value,
				filePath: p.activeFilePath,
				userPrompt: prompt.user,
			});
		}

		const { responses, errors: responseErrors } = generateAllResponses(responseFormat, responseInputs, log);
		const droppedEditCount = responses.reduce((total, r) => total + (r.response.droppedEditCount ?? 0), 0);
		const droppedSuffix = droppedEditCount > 0 ? `, ${droppedEditCount} oracle edit(s) dropped outside edit window` : '';
		log(`  [4/5] Responses generated: ${responses.length} ok, ${responseErrors.length} errors${droppedSuffix}`);
		logErrors(responseErrors.map(e => {
			const p = processedByOriginalIndex.get(e.index);
			return { error: `[sample ${e.index + rowOffset}, ${p?.row.activeDocumentLanguageId ?? '?'}] ${e.error}` };
		}), verbose, log);

		// Step 5: Write output
		const responseByIndex = new Map(responses.map(r => [r.index, r.response]));
		const outputPath = resolveOutputPath(inputPath, nesDatagenOpts.output);
		const samples: ISample[] = [];

		for (const { originalRowIndex: index, prompt } of prompts) {
			const response = responseByIndex.get(index);
			if (!response) {
				continue;
			}
			const p = processedByOriginalIndex.get(index);
			if (!p) {
				continue;
			}
			const suggestedEdit = parseSuggestedEdit(p.row.postProcessingOutcome.suggestedEdit);
			const modelEdits = suggestedEdit ? [suggestedEdit] as const : undefined;
			const modelResult = generateResponse(responseFormat, modelEdits, p.activeDocument.value.get().value, p.activeFilePath, prompt.user);
			const formattedModelResponse = 'error' in modelResult ? '' : modelResult.assistant;
			samples.push(assembleSample(index + rowOffset, prompt, response, p, responseFormat, formattedModelResponse));
		}

		const writeResult = await writeSamples(outputPath, samples);
		log(`  [5/5] Output written: ${writeResult.written} samples → ${writeResult.outputPath}`);
		if (writeResult.skipped > 0) {
			log(`    Structural validation dropped ${writeResult.skipped} samples`);
			if (verbose) {
				const grouped = new Map<string, number>();
				for (const s of writeResult.skipReasons) {
					grouped.set(s.reason, (grouped.get(s.reason) ?? 0) + 1);
				}
				for (const [reason, count] of grouped) {
					log(`    ${reason} (×${count})`);
				}
			}
		}

		// Summary
		log(`\n  Pipeline: Input(${rows.length}) → Replay(${processed.length}) → Prompt(${prompts.length}) → Response(${responses.length}) → Output(${writeResult.written})`);
	} finally {
		for (const p of processed) {
			p.replayer.dispose();
		}
		testAccessor.dispose();
	}
}

/**
 * Splits the records of the JSON array at `inputPath` into contiguous per-worker
 * chunk files, each written incrementally as a JSON array. Streaming keeps memory
 * usage bounded to a single record regardless of total input size.
 */
async function writeChunkFiles(inputPath: string, chunkPaths: string[], chunkSize: number): Promise<void> {
	let currentChunk = -1;
	let writer: ReturnType<typeof openWriteStream> | undefined;
	let countInChunk = 0;
	let index = 0;

	try {
		for await (const record of streamJsonRecords(inputPath)) {
			const w = Math.min(Math.floor(index / chunkSize), chunkPaths.length - 1);
			if (w !== currentChunk) {
				if (writer) {
					await writer.write(']');
					await writer.close();
				}
				writer = openWriteStream(chunkPaths[w]);
				await writer.write('[');
				currentChunk = w;
				countInChunk = 0;
			}
			if (countInChunk > 0) {
				await writer!.write(',');
			}
			await writer!.write(JSON.stringify(record));
			countInChunk++;
			index++;
		}

		if (writer) {
			await writer.write(']');
			await writer.close();
			writer = undefined;
		}
	} finally {
		// Best-effort close on the error path so the file descriptor is released
		// before the caller proceeds to delete the tmp directory.
		if (writer) {
			try { await writer.close(); } catch { /* swallow secondary errors */ }
		}
	}
}

/**
 * Run the pipeline in parallel by splitting input across N child processes.
 * Each child runs the single-process pipeline on its chunk independently.
 */
export async function runInputPipelineParallel(opts: SimulationOptions): Promise<void> {
	const nesDatagenOpts = opts.nesDatagen!;
	const inputPath = nesDatagenOpts.input;
	const verbose = !!opts.verbose;

	// Stream the input once to count records without loading the whole file into
	// memory. Node's readFile rejects files larger than 2 GiB and V8 strings have a
	// maximum length of ~512 MiB, so large inputs cannot be read as a single string.
	let totalRecords = 0;
	for await (const _record of streamJsonRecords(inputPath)) {
		totalRecords++;
	}

	const numWorkers = Math.max(1, Math.min(os.cpus().length, opts.parallelism, Math.ceil(totalRecords / 25)));

	console.log(`\n=== Pipeline (parallel: ${numWorkers} workers) ===`);
	console.log(`  Input: ${inputPath} (${totalRecords} rows)\n`);

	if (totalRecords === 0) {
		console.log(`  No records to process.`);
		return;
	}

	const chunkSize = Math.ceil(totalRecords / numWorkers);
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'nes-pipeline-'));

	try {
		const workers: { chunkPath: string; resultPath: string; start: number; count: number }[] = [];
		for (let w = 0; w < numWorkers; w++) {
			const start = w * chunkSize;
			if (start >= totalRecords) {
				break;
			}
			const end = Math.min(start + chunkSize, totalRecords);
			workers.push({
				chunkPath: path.join(tmpDir, `chunk_${w}.json`),
				resultPath: path.join(tmpDir, `result_${w}.jsonl`),
				start,
				count: end - start,
			});
		}

		// Distribute records into contiguous per-worker chunk files by streaming the
		// input a second time, writing each chunk incrementally as a JSON array.
		await writeChunkFiles(inputPath, workers.map(w => w.chunkPath), chunkSize);

		const workerPromises: Promise<void>[] = [];
		const resultPaths: string[] = [];

		for (let w = 0; w < workers.length; w++) {
			const { chunkPath, resultPath, start, count } = workers[w];
			resultPaths.push(resultPath);

			const args = [
				'nes-datagen',
				'--input', chunkPath,
				'--config-file', opts.configFile!,
				'--out', resultPath,
				'--row-offset', String(start),
				'--parallelism', String(opts.parallelism),
				'--worker',
			];
			if (verbose) {
				args.push('--verbose');
			}

			const workerIdx = w;
			workerPromises.push(new Promise<void>((resolve, reject) => {
				const child = fork(process.argv[1], args, { stdio: 'pipe' });

				// Always drain child output to prevent pipe buffer deadlocks
				child.stdout?.on('data', verbose ? (data: Buffer) => {
					const lines = data.toString().split('\n').filter(l => l.trim());
					for (const line of lines) {
						console.log(`  [W${workerIdx}] ${line}`);
					}
				} : () => { });
				child.stderr?.on('data', verbose ? (data: Buffer) => {
					const lines = data.toString().split('\n').filter(l => l.trim());
					for (const line of lines) {
						console.error(`  [W${workerIdx}] ${line}`);
					}
				} : () => { });

				child.on('exit', (code) => {
					if (code === 0) {
						console.log(`  Worker ${workerIdx + 1}/${numWorkers} completed (${count} rows)`);
						resolve();
					} else {
						reject(new Error(`Worker ${workerIdx} exited with code ${code}`));
					}
				});
				child.on('error', reject);
			}));
		}

		const startTime = Date.now();
		await Promise.all(workerPromises);
		const elapsed = formatElapsed(startTime);
		console.log(`\n  All ${numWorkers} workers completed in ${elapsed}`);

		// Merge results. Stream each worker's result file so a single large file
		// (e.g. > 2 GiB / > V8 max-string-length) can be consumed without doing
		// a whole-file readFile.
		//
		// A parse error mid-stream is fatal: by that point we have already
		// pushed an unknown number of valid records from the failing file into
		// `allSamples`, so swallowing the error would produce a silently
		// truncated training-data file. Re-throw so the run exits non-zero and
		// the user knows the output is incomplete.
		const allSamples: ISample[] = [];
		for (const resultPath of resultPaths) {
			for await (const sample of streamJsonRecords<ISample>(resultPath)) {
				allSamples.push(sample);
			}
		}

		const outputPath = resolveOutputPath(inputPath, nesDatagenOpts.output);
		const writeResult = await writeSamples(outputPath, allSamples);
		console.log(`  Output: ${writeResult.written} samples → ${writeResult.outputPath} (${elapsed})`);
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	}
}
