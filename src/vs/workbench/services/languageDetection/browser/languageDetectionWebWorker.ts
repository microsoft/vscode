/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
import { importAMDNodeModule } from '../../../../amdX.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { IWebWorkerServerRequestHandler, IWebWorkerServer } from '../../../../base/common/worker/webWorker.js';
import { LanguageDetectionWorkerHost, ILanguageDetectionWorker } from './languageDetectionWorker.protocol.js';
import { WorkerTextModelSyncServer } from '../../../../editor/common/services/textModelSync/textModelSync.impl.js';

type RegexpModel = { detect: (inp: string, langBiases: Record<string, number>, supportedLangs?: string[]) => string | undefined };

export function create(workerServer: IWebWorkerServer): IWebWorkerServerRequestHandler {
	return new LanguageDetectionWorker(workerServer);
}

/**
 * @internal
 */
export class LanguageDetectionWorker implements ILanguageDetectionWorker {
	_requestHandlerBrand: void = undefined;

	private static readonly expectedRelativeConfidence = 0.2;
	private static readonly positiveConfidenceCorrectionBucket1 = 0.05;
	private static readonly positiveConfidenceCorrectionBucket2 = 0.025;
	private static readonly negativeConfidenceCorrection = 0.5;

	private readonly _workerTextModelSyncServer = new WorkerTextModelSyncServer();

	private readonly _host: LanguageDetectionWorkerHost;
	private _regexpModel: RegexpModel | undefined;
	private _regexpLoadFailed: boolean = false;

	private _modelOperations: Promise<ModelOperations> | undefined;
	private _loadFailed: boolean = false;
	private _modelHasRun: boolean = false;
	private readonly _loggedFailures = new Set<string>();

	/** Pre-loaded chunks of the model bundle, keyed by the id webpack asks for. */
	private readonly _modelChunks = new Map<string, unknown>();

	private modelIdToCoreId = new Map<string, string | undefined>();

	constructor(workerServer: IWebWorkerServer) {
		this._host = LanguageDetectionWorkerHost.getChannel(workerServer);
		this._workerTextModelSyncServer.bindToServer(workerServer);
	}

	public async $detectLanguage(uri: string, langBiases: Record<string, number> | undefined, preferHistory: boolean, supportedLangs?: string[]): Promise<string | undefined> {
		const languages: string[] = [];
		const confidences: number[] = [];
		const stopWatch = new StopWatch();
		const documentTextSample = this.getTextForDetection(uri);
		if (!documentTextSample) { return; }

		const neuralResolver = async () => {
			for await (const language of this.detectLanguagesImpl(documentTextSample)) {
				if (!this.modelIdToCoreId.has(language.languageId)) {
					this.modelIdToCoreId.set(language.languageId, await this._host.$getLanguageId(language.languageId));
				}
				const coreId = this.modelIdToCoreId.get(language.languageId);
				if (coreId && (!supportedLangs?.length || supportedLangs.includes(coreId))) {
					languages.push(coreId);
					confidences.push(language.confidence);
				}
			}
			stopWatch.stop();

			if (languages.length) {
				this._host.$sendTelemetryEvent(languages, confidences, stopWatch.elapsed());
				return languages[0];
			}
			return undefined;
		};

		const historicalResolver = async () => this.runRegexpModel(documentTextSample, langBiases ?? {}, supportedLangs);

		if (preferHistory) {
			const history = await historicalResolver();
			if (history) { return history; }
			const neural = await neuralResolver();
			if (neural) { return neural; }
		} else {
			const neural = await neuralResolver();
			if (neural) { return neural; }
			const history = await historicalResolver();
			if (history) { return history; }
		}

		return undefined;
	}

	private getTextForDetection(uri: string): string | undefined {
		const editorModel = this._workerTextModelSyncServer.getModel(uri);
		if (!editorModel) { return; }

		const end = editorModel.positionAt(10000);
		const content = editorModel.getValueInRange({
			startColumn: 1,
			startLineNumber: 1,
			endColumn: end.column,
			endLineNumber: end.lineNumber
		});
		return content;
	}

	private async getRegexpModel(): Promise<RegexpModel | undefined> {
		if (this._regexpLoadFailed) {
			return;
		}
		if (this._regexpModel) {
			return this._regexpModel;
		}
		const uri: string = await this._host.$getRegexpModelUri();
		try {
			this._regexpModel = await importAMDNodeModule(uri, '') as RegexpModel;
			return this._regexpModel;
		} catch (e) {
			this._regexpLoadFailed = true;
			// console.warn('error loading language detection model', e);
			return;
		}
	}

	private async runRegexpModel(content: string, langBiases: Record<string, number>, supportedLangs?: string[]): Promise<string | undefined> {
		const regexpModel = await this.getRegexpModel();
		if (!regexpModel) { return; }

		if (supportedLangs?.length) {
			// When using supportedLangs, normally computed biases are too extreme. Just use a "bitmask" of sorts.
			for (const lang of Object.keys(langBiases)) {
				if (supportedLangs.includes(lang)) {
					langBiases[lang] = 1;
				} else {
					langBiases[lang] = 0;
				}
			}
		}

		const detected = regexpModel.detect(content, langBiases, supportedLangs);
		return detected;
	}

	/**
	 * The model bundle loads its TensorFlow backend as webpack chunks via `require`, which a module worker
	 * lacks and Trusted Types forbids evaluating, so import the chunks as ES modules up front instead.
	 */
	private async preloadModelChunks(bundleUri: string): Promise<void> {
		const globalScope = globalThis as unknown as {
			module?: unknown;
			exports?: unknown;
			require?: (id: string) => unknown;
		};

		if (this._modelChunks.size === 0) {
			// Chunk ids change between package versions, so read them from the bundle.
			const source = await (await fetch(bundleUri)).text();
			const chunkIds = new Set(Array.from(source.matchAll(/\.e\((?<chunkId>\d+)\)/g), match => match.groups!.chunkId));

			for (const chunkId of chunkIds) {
				const id = `./${chunkId}.js`;
				const holder: { exports: unknown } = { exports: Object.create(null) };
				// The chunks are CommonJS and assign to a bare `exports`.
				globalScope.module = holder;
				globalScope.exports = holder.exports;
				try {
					await import(/* webpackIgnore: true */ /* @vite-ignore */ new URL(id, bundleUri).toString());
					this._modelChunks.set(id, holder.exports);
				} catch {
					// Not every match is a real chunk; skip whatever does not load.
				} finally {
					delete globalScope.module;
					delete globalScope.exports;
				}
			}
		}

		globalScope.require ??= (id: string): unknown => {
			const chunk = this._modelChunks.get(id);
			if (!chunk) {
				throw new Error(`The language detection model requested a chunk that was not pre-loaded: ${id}`);
			}
			return chunk;
		};
	}

	/** Caches the promise so concurrent requests share one load, since preloading briefly mutates globals. */
	private getModelOperations(): Promise<ModelOperations> {
		this._modelOperations ??= this.createModelOperations();
		return this._modelOperations;
	}

	private async createModelOperations(): Promise<ModelOperations> {
		const uri: string = await this._host.$getIndexJsUri();
		const { ModelOperations } = await importAMDNodeModule(uri, '') as typeof import('@vscode/vscode-languagedetection');
		// Must follow the bundle import: its UMD header would otherwise see the temporary `module`/`exports`.
		await this.preloadModelChunks(uri);
		return new ModelOperations({
			modelJsonLoaderFunc: async () => {
				const response = await fetch(await this._host.$getModelJsonUri());
				try {
					const modelJSON = await response.json();
					return modelJSON;
				} catch (e) {
					const message = `Failed to parse model JSON.`;
					throw new Error(message);
				}
			},
			weightsLoaderFunc: async () => {
				const response = await fetch(await this._host.$getWeightsUri());
				const buffer = await response.arrayBuffer();
				return buffer;
			}
		});
	}

	// This adjusts the language confidence scores to be more accurate based on:
	// * VS Code's language usage
	// * Languages with 'problematic' syntaxes that have caused incorrect language detection
	private adjustLanguageConfidence(modelResult: ModelResult): ModelResult {
		switch (modelResult.languageId) {
			// For the following languages, we increase the confidence because
			// these are commonly used languages in VS Code and supported
			// by the model.
			case 'js':
			case 'html':
			case 'json':
			case 'ts':
			case 'css':
			case 'py':
			case 'xml':
			case 'php':
				modelResult.confidence += LanguageDetectionWorker.positiveConfidenceCorrectionBucket1;
				break;
			// case 'yaml': // YAML has been know to cause incorrect language detection because the language is pretty simple. We don't want to increase the confidence for this.
			case 'cpp':
			case 'sh':
			case 'java':
			case 'cs':
			case 'c':
				modelResult.confidence += LanguageDetectionWorker.positiveConfidenceCorrectionBucket2;
				break;

			// For the following languages, we need to be extra confident that the language is correct because
			// we've had issues like #131912 that caused incorrect guesses. To enforce this, we subtract the
			// negativeConfidenceCorrection from the confidence.

			// languages that are provided by default in VS Code
			case 'bat':
			case 'ini':
			case 'makefile':
			case 'sql':
			// languages that aren't provided by default in VS Code
			case 'csv':
			case 'toml':
				// Other considerations for negativeConfidenceCorrection that
				// aren't built in but suported by the model include:
				// * Assembly, TeX - These languages didn't have clear language modes in the community
				// * Markdown, Dockerfile - These languages are simple but they embed other languages
				modelResult.confidence -= LanguageDetectionWorker.negativeConfidenceCorrection;
				break;

			default:
				break;

		}
		return modelResult;
	}

	/** Reports a failure to the window log, once per distinct message. */
	private logFailure(level: 'warn' | 'error', what: string, error: unknown): void {
		const detail = error instanceof Error ? error.stack ?? error.message : String(error);
		const message = `Language detection ${what}: ${detail}`;
		if (!this._loggedFailures.has(message)) {
			this._loggedFailures.add(message);
			this._host.$logMessage(level, message);
		}
	}

	private async * detectLanguagesImpl(content: string): AsyncGenerator<ModelResult, void, unknown> {
		if (this._loadFailed) {
			return;
		}

		let modelOperations: ModelOperations | undefined;
		try {
			modelOperations = await this.getModelOperations();
		} catch (e) {
			// Latch, so a broken model is not reloaded on every throttled edit.
			this._loadFailed = true;
			this.logFailure('error', 'failed to load the language detection model', e);
			return;
		}

		let modelResults: ModelResult[] | undefined;

		try {
			modelResults = await modelOperations.runModel(content);
			this._modelHasRun = true;
		} catch (e) {
			// The model loads lazily on its first run, so a failure before any success is a load failure.
			if (!this._modelHasRun) {
				this._loadFailed = true;
				this.logFailure('error', 'failed to load the language detection model', e);
				return;
			}
			this.logFailure('error', 'the language detection model failed to run', e);
		}

		if (!modelResults
			|| modelResults.length === 0
			|| modelResults[0].confidence < LanguageDetectionWorker.expectedRelativeConfidence) {
			return;
		}

		const firstModelResult = this.adjustLanguageConfidence(modelResults[0]);
		if (firstModelResult.confidence < LanguageDetectionWorker.expectedRelativeConfidence) {
			return;
		}

		const possibleLanguages: ModelResult[] = [firstModelResult];

		for (let current of modelResults) {
			if (current === firstModelResult) {
				continue;
			}

			current = this.adjustLanguageConfidence(current);
			const currentHighest = possibleLanguages[possibleLanguages.length - 1];

			if (currentHighest.confidence - current.confidence >= LanguageDetectionWorker.expectedRelativeConfidence) {
				while (possibleLanguages.length) {
					yield possibleLanguages.shift()!;
				}
				if (current.confidence > LanguageDetectionWorker.expectedRelativeConfidence) {
					possibleLanguages.push(current);
					continue;
				}
				return;
			} else {
				if (current.confidence > LanguageDetectionWorker.expectedRelativeConfidence) {
					possibleLanguages.push(current);
					continue;
				}
				return;
			}
		}
	}
}
