/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
import { importAMDNodeModule } from 'vs/amdX';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IRequestHandler, IWorkerServer } from 'vs/base/common/worker/simpleWorker';
import { LanguageDetectionWorkerHost, ILanguageDetectionWorker } from 'vs/workbench/services/languageDetection/browser/languageDetectionWorker.protocol';
import { WorkerTextModelSyncServer } from 'vs/editor/common/services/textModelSync/textModelSync.impl';

type RegexpModel = { detect: (inp: string, langBiases: Record<string, number>, supportedLangs?: string[]) => string | undefined };

/**
 * Defines the worker entry point. Must be exported and named `create`.
 * @skipMangle
 */
export function create(workerServer: IWorkerServer): IRequestHandler {
	return new LanguageDetectionSimpleWorker(workerServer);
}

/**
 * @internal
 */
export class LanguageDetectionSimpleWorker implements ILanguageDetectionWorker {
	_requestHandlerBrand: any;

	private static readonly expectedRelativeConfidence = 0.2;
	private static readonly positiveConfidenceCorrectionBucket1 = 0.05;
	private static readonly positiveConfidenceCorrectionBucket2 = 0.025;
	private static readonly negativeConfidenceCorrection = 0.5;

	private readonly _workerTextModelSyncServer = new WorkerTextModelSyncServer();

	private readonly _host: LanguageDetectionWorkerHost;
	private _regexpModel: RegexpModel | undefined;
	private _regexpLoadFailed: boolean = false;

	private _modelOperations: ModelOperations | undefined;
	private _loadFailed: boolean = false;

	private modelIdToCoreId = new Map<string, string | undefined>();

	constructor(workerServer: IWorkerServer) {
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

	private async getModelOperations(): Promise<ModelOperations> {
		if (this._modelOperations) {
			return this._modelOperations;
		}

		const uri: string = await this._host.$getIndexJsUri();
		const { ModelOperations } = await importAMDNodeModule(uri, '') as typeof import('@vscode/vscode-languagedetection');
		this._modelOperations = new ModelOperations({
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

		return this._modelOperations;
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
				modelResult.confidence += LanguageDetectionSimpleWorker.positiveConfidenceCorrectionBucket1;
				break;
			// case 'yaml': // YAML has been know to cause incorrect language detection because the language is pretty simple. We don't want to increase the confidence for this.
			case 'cpp':
			case 'sh':
			case 'java':
			case 'cs':
			case 'c':
				modelResult.confidence += LanguageDetectionSimpleWorker.positiveConfidenceCorrectionBucket2;
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
				modelResult.confidence -= LanguageDetectionSimpleWorker.negativeConfidenceCorrection;
				break;

			default:
				break;

		}
		return modelResult;
	}

	private async * detectLanguagesImpl(content: string): AsyncGenerator<ModelResult, void, unknown> {
		if (this._loadFailed) {
			return;
		}

		let modelOperations: ModelOperations | undefined;
		try {
			modelOperations = await this.getModelOperations();
		} catch (e) {
			console.log(e);
			this._loadFailed = true;
			return;
		}

		let modelResults: ModelResult[] | undefined;

		try {
			modelResults = await modelOperations.runModel(content);
		} catch (e) {
			console.warn(e);
		}

		if (!modelResults
			|| modelResults.length === 0
			|| modelResults[0].confidence < LanguageDetectionSimpleWorker.expectedRelativeConfidence) {
			return;
		}

		const firstModelResult = this.adjustLanguageConfidence(modelResults[0]);
		if (firstModelResult.confidence < LanguageDetectionSimpleWorker.expectedRelativeConfidence) {
			return;
		}

		const possibleLanguages: ModelResult[] = [firstModelResult];

		for (let current of modelResults) {
			if (current === firstModelResult) {
				continue;
			}

			current = this.adjustLanguageConfidence(current);
			const currentHighest = possibleLanguages[possibleLanguages.length - 1];

			if (currentHighest.confidence - current.confidence >= LanguageDetectionSimpleWorker.expectedRelativeConfidence) {
				while (possibleLanguages.length) {
					yield possibleLanguages.shift()!;
				}
				if (current.confidence > LanguageDetectionSimpleWorker.expectedRelativeConfidence) {
					possibleLanguages.push(current);
					continue;
				}
				return;
			} else {
				if (current.confidence > LanguageDetectionSimpleWorker.expectedRelativeConfidence) {
					possibleLanguages.push(current);
					continue;
				}
				return;
			}
		}
	}
}
