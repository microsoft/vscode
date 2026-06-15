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
import { OffsetRange } from '../../src/util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../src/util/vs/editor/common/core/text/abstractText';
import { applyConfigFile, loadConfigFile } from '../base/simulationContext';
import { NesDatagen, NesDatagenSampleTask, SimulationOptions } from '../base/simulationOptions';
import { detectCrossFileJump, detectSameFileJump } from './cursorJump/detectJump';
import { generateCursorPromptFromRecording, installCursorJumpCapturingFetcher } from './cursorJump/cursorJumpPromptStep';
import { generateCrossFileResponse, generateSameFileResponse } from './cursorJump/cursorJumpResponseStep';
import { assembleSample, ISample, SampleClassification, resolveOutputPath, writeSamples } from './output';
import { loadAndParseInput } from './parseInput';
import { generatePromptFromRecording, IGeneratedPrompt } from './promptStep';
import { IProcessedRow, parseSuggestedEdit, processAllRows } from './replayRecording';
import { generateAllResponses, generateResponse, IResponseGenerationInput, applyEditsToContent } from './responseStep';
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

/**
 * Apply the user-supplied config file and force-disable all interactive
 * debounces / cache delays that don't make sense in batch mode. Both
 * pipelines (xtab and cursor-jump) need this exact setup before invoking
 * the production NES code path.
 */
async function applyBatchModeConfig(configService: IConfigurationService, configs: ReturnType<typeof loadConfigFile>): Promise<void> {
	await applyConfigFile(configService, configs);
	await configService.setConfig(ConfigKey.TeamInternal.InlineEditsDebounce, 0);
	await configService.setConfig(ConfigKey.TeamInternal.InlineEditsCacheDelay, 0);
	await configService.setConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceEndOfLine, 0);
	await configService.setConfig(ConfigKey.TeamInternal.InlineEditsExtraDebounceInlineSuggestion, 0);
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

/**
 * Single-process pipeline entry point. Dispatches to the xtab or cursor-jump
 * pipeline based on the configured sample task.
 *
 * For multi-process parallelism (large inputs, multi-core boxes), the caller
 * should invoke `runInputPipelineParallel` instead — it forks N children,
 * each running this function on a chunk, and works for cursor-jump tasks too
 * (`--sample-task` is propagated to every worker).
 *
 * Memory: this function calls `loadAndParseInput`, which reads the entire
 * input chunk into memory. That is intentional within a worker (chunks are
 * sized by `runInputPipelineParallel`), but means single-process runs on
 * unsharded multi-GB inputs can OOM — use `--parallelism > 1` to shard.
 */
export async function runInputPipeline(opts: RunPipelineOptions, log = console.log.bind(console)): Promise<void> {
	const nesDatagenOpts = opts.nesDatagen!;
	if (nesDatagenOpts.sampleTask !== NesDatagenSampleTask.Xtab) {
		return runCursorPipeline(opts, log);
	}
	return runXtabPipeline(opts, log);
}

async function runXtabPipeline(opts: RunPipelineOptions, log: (...ps: any[]) => void): Promise<void> {
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

		await applyBatchModeConfig(configService, configs);

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
			samples.push(assembleSample(index + rowOffset, prompt, response, p, responseFormat, formattedModelResponse, { task: NesDatagenSampleTask.Xtab }));
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

async function runCursorPipeline(opts: RunPipelineOptions, log: (...ps: any[]) => void): Promise<void> {
	const nesDatagenOpts = opts.nesDatagen!;
	const inputPath = nesDatagenOpts.input;
	if (!opts.configFile) {
		throw new Error('nes-datagen requires --config-file');
	}
	const configs = loadConfigFile(opts.configFile);
	const verbose = !!opts.verbose;
	const concurrency = opts.parallelism;
	const rowOffset = nesDatagenOpts.rowOffset;
	const task = nesDatagenOpts.sampleTask;

	log(`\n=== Pipeline ===`);
	log(`  Input: ${inputPath}`);
	log(`  Sample task: ${task}`);
	log(`  Concurrency: ${concurrency}`);
	log(`  Same-file jump thresholds: above=${nesDatagenOpts.sameFileJumpMinAbove}, below=${nesDatagenOpts.sameFileJumpMinBelow}`);

	const { rows, errors } = await loadAndParseInput(inputPath, verbose);
	log(`  [1/5] Input parsed: ${rows.length} rows, ${errors.length} errors`);
	logErrors(errors, verbose, log);

	const { processed, errors: replayErrors } = processAllRows(rows);
	log(`  [2/5] Recordings replayed: ${processed.length} ok, ${replayErrors.length} errors`);
	logErrors(replayErrors.map(e => ({
		error: `[sample ${e.rowIndex + rowOffset}, ${rows[e.rowIndex]?.activeDocumentLanguageId ?? '?'}] ${e.error}`,
	})), verbose, log);

	// Detect jumps first — many rows will be skipped here, no point capturing
	// a prompt for them.
	type DetectedJump =
		| { readonly kind: 'sameFile'; readonly sameFile: ReturnType<typeof detectSameFileJump> }
		| { readonly kind: 'crossFile'; readonly crossFile: ReturnType<typeof detectCrossFileJump> };

	const jumps = new Map<number, DetectedJump>();
	const skipReasons = new Map<string, number>();
	for (const p of processed) {
		if (!p.cursorAtRequest) {
			skipReasons.set('noCursorAtRequest', (skipReasons.get('noCursorAtRequest') ?? 0) + 1);
			continue;
		}

		if (task === NesDatagenSampleTask.CursorSameFile || task === NesDatagenSampleTask.CursorBoth) {
			const sf = detectSameFileJump(p.recordingAfterRequest, {
				activeDocLogId: p.activeDocLogId,
				cursorAtRequest: p.cursorAtRequest,
				minLinesAbove: nesDatagenOpts.sameFileJumpMinAbove,
				minLinesBelow: nesDatagenOpts.sameFileJumpMinBelow,
				resolveActiveDocLineAt: buildLineResolver(p),
			});
			if (sf.isOk()) {
				jumps.set(p.originalRowIndex, { kind: 'sameFile', sameFile: sf });
				continue;
			}
			if (task === NesDatagenSampleTask.CursorSameFile) {
				skipReasons.set(sf.err, (skipReasons.get(sf.err) ?? 0) + 1);
				continue;
			}
			// cursor-both: fall through to cross-file detection
		}

		if (task === NesDatagenSampleTask.CursorCrossFile || task === NesDatagenSampleTask.CursorBoth) {
			const cf = detectCrossFileJump(p.recordingAfterRequest, {
				activeDocLogId: p.activeDocLogId,
				idToRelativePath: p.idToRelativePath,
				getDocContentAtRequest: (docId) => p.idToContentAtRequest.get(docId),
			});
			if (cf.isOk()) {
				jumps.set(p.originalRowIndex, { kind: 'crossFile', crossFile: cf });
				continue;
			}
			skipReasons.set(cf.err, (skipReasons.get(cf.err) ?? 0) + 1);
		}
	}

	log(`  [2.5/5] Jumps detected: ${jumps.size} qualifying rows, ${processed.length - jumps.size} skipped`);
	if (verbose) {
		for (const [reason, count] of skipReasons) {
			log(`    ${reason} (×${count})`);
		}
	}

	const serviceCollection = createExtensionUnitTestingServices();
	installCursorJumpCapturingFetcher(serviceCollection);
	const testAccessor = serviceCollection.createTestingAccessor();

	try {
		const configService = testAccessor.get(IConfigurationService);
		await applyBatchModeConfig(configService, configs);

		type PromptOut = { originalRowIndex: number; system: string; user: string; keptRange: OffsetRange };
		const prompts: PromptOut[] = [];
		const promptErrors: { originalRowIndex: number; error: string }[] = [];
		let completed = 0;
		const start = Date.now();

		const limiter = new Limiter<void>(concurrency);
		const qualifying = processed.filter(p => jumps.has(p.originalRowIndex));

		await Promise.all(qualifying.map(p =>
			limiter.queue(async () => {
				const globalIdx = p.originalRowIndex + rowOffset;
				try {
					const result = await generateCursorPromptFromRecording(testAccessor, p.recordingInfo);
					if ('error' in result) {
						promptErrors.push({ originalRowIndex: p.originalRowIndex, error: `[sample ${globalIdx}, ${p.row.activeDocumentLanguageId}, ${p.activeFilePath}] ${result.error}` });
					} else {
						prompts.push({ originalRowIndex: p.originalRowIndex, ...result });
					}
				} catch (err) {
					// Catch per-row so one unexpected throw doesn't abort the whole
					// batch via Promise.all's first-rejection semantics. The row
					// fails, every other row still gets a chance to produce a
					// sample.
					const msg = err instanceof Error ? err.stack ?? err.message : String(err);
					promptErrors.push({ originalRowIndex: p.originalRowIndex, error: `[sample ${globalIdx}, ${p.row.activeDocumentLanguageId}, ${p.activeFilePath}] unexpected: ${msg}` });
				}
				completed++;
				if (verbose && (completed % 50 === 0 || completed === qualifying.length)) {
					console.log(`    Progress: ${completed}/${qualifying.length} (${formatElapsed(start)})`);
				}
			})
		));

		log(`  [3/5] Cursor prompts captured: ${prompts.length} ok, ${promptErrors.length} errors (${formatElapsed(start)})`);
		logErrors(promptErrors, verbose, log);

		// Fail loud if we detected jumps but the cursor-prediction path was
		// never actually invoked for any of them. The no-capture path returns
		// `Cursor-jump prompt was not captured ...` per row, which lands in
		// `promptErrors`. If *every* qualifying row failed that exact way, the
		// configured `promptingStrategy` likely doesn't emit `NoSuggestions`
		// for an empty stream (only `UnifiedWithXml` / `CustomDiffPatch` do
		// reliably), so the cursor-jump fallback in `XtabProvider` is never
		// reached. Surfacing that as a crash is far better than emitting zero
		// samples that look like "input had no qualifying rows".
		if (jumps.size > 0 && prompts.length === 0) {
			const notCaptured = promptErrors.filter(e => e.error.includes('prompt was not captured')).length;
			if (notCaptured === jumps.size) {
				throw new Error(
					`Detected ${jumps.size} cursor jump(s) but the cursor-prediction path was never invoked for any of them. ` +
					`Check that the configured promptingStrategy yields NoSuggestions for an empty stream ` +
					`(UnifiedWithXml / CustomDiffPatch do; EditWindowOnly and friends may not).`
				);
			}
		}

		const processedByIndex = new Map(processed.map(p => [p.originalRowIndex, p]));
		const samples: ISample[] = [];
		const responseSkips = new Map<string, number>();

		for (const promptOut of prompts) {
			const p = processedByIndex.get(promptOut.originalRowIndex);
			const detected = jumps.get(promptOut.originalRowIndex);
			if (!p || !detected || !p.cursorAtRequest) {
				continue;
			}

			let classification: SampleClassification | undefined;
			let assistant: string;
			if (detected.kind === 'sameFile' && detected.sameFile.isOk()) {
				const r = generateSameFileResponse(detected.sameFile.val, promptOut.keptRange);
				if ('error' in r) {
					responseSkips.set(r.error, (responseSkips.get(r.error) ?? 0) + 1);
					continue;
				}
				assistant = r.assistant;
				classification = { task: NesDatagenSampleTask.CursorSameFile, jump: r.jump };
			} else if (detected.kind === 'crossFile' && detected.crossFile.isOk()) {
				const r = generateCrossFileResponse(detected.crossFile.val, p.cursorAtRequest.lineNumber);
				if ('error' in r) {
					responseSkips.set(r.error, (responseSkips.get(r.error) ?? 0) + 1);
					continue;
				}
				assistant = r.assistant;
				classification = { task: NesDatagenSampleTask.CursorCrossFile, jump: r.jump };
			} else {
				continue;
			}

			const prompt: IGeneratedPrompt = { system: promptOut.system, user: promptOut.user };
			const responseAdapter = { assistant };
			samples.push(assembleSample(
				promptOut.originalRowIndex + rowOffset,
				prompt,
				responseAdapter,
				p,
				'next-cursor-line-prediction',
				/* modelResponse: expected output mirrors assistant content */ assistant,
				classification,
			));
		}

		log(`  [4/5] Cursor responses formatted: ${samples.length} ok, ${prompts.length - samples.length} dropped`);
		if (verbose && responseSkips.size > 0) {
			for (const [reason, count] of responseSkips) {
				log(`    ${reason} (×${count})`);
			}
		}

		const outputPath = resolveOutputPath(inputPath, nesDatagenOpts.output);
		const writeResult = await writeSamples(outputPath, samples);
		log(`  [5/5] Output written: ${writeResult.written} samples → ${writeResult.outputPath}`);

		log(`\n  Pipeline: Input(${rows.length}) → Replay(${processed.length}) → Jumps(${jumps.size}) → Prompt(${prompts.length}) → Output(${writeResult.written})`);
	} finally {
		for (const p of processed) {
			p.replayer.dispose();
		}
		testAccessor.dispose();
	}
}

/**
 * Build a per-row line-offset resolver for the same-file detector. For a
 * candidate event at `entryIndex`, the resolver replays the `changed`
 * events strictly before it against a copy of the active doc content and
 * returns the 0-based line number for the requested offset against that
 * snapshot. The strict-less-than bound matters when `entryIndex` itself is
 * a `changed` event — its own edit offsets are pre-edit and must not be
 * applied first.
 */
function buildLineResolver(p: IProcessedRow): (entryIndex: number, offset: number) => number {
	return (entryIndex: number, offset: number): number => {
		let c = p.activeDocument.value.get().value;
		for (let i = 0; i < entryIndex; i++) {
			const e = p.recordingAfterRequest[i];
			if (e?.kind === 'changed' && e.id === p.activeDocLogId) {
				// Apply offset-descending so multi-replacement events don't
				// shift later original offsets within the same event.
				c = applyEditsToContent(c, e.edit);
			}
		}
		const transformer = new StringText(c).getTransformer();
		return transformer.getPosition(Math.min(offset, c.length)).lineNumber - 1;
	};
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
				'--sample-task', nesDatagenOpts.sampleTask,
				'--same-file-jump-min-above', String(nesDatagenOpts.sameFileJumpMinAbove),
				'--same-file-jump-min-below', String(nesDatagenOpts.sameFileJumpMinBelow),
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
