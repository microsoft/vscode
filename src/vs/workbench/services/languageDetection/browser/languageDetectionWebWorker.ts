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

	private _modelOperations: ModelOperations | undefined;
	private _loadFailed: boolean = false;

	private modelIdToCoreId = new Map<string, string | undefined>();

	constructor(workerServer: IWebWorkerServer) {
		this._host = LanguageDetectionWorkerHost.getChannel(workerServer);
		this._workerTextModelSyncServer.bindToServer(workerServer);
	}

	public async $detectLanguage(uri: string, langBiases: Record<string, number> | undefined, preferHistory: boolean, supportedLangs?: string[]): Promise<string | undefined> {
		// 言語判定④：同期されたモデルから先頭最大10000文字を取得する。
		const languages: string[] = [];
		const confidences: number[] = [];
		const stopWatch = new StopWatch();
		const documentTextSample = this.getTextForDetection(uri);
		if (!documentTextSample) { return; }

		// 学習済みモデルの候補を VS Code の言語 ID に変換する（例：py → python）。
		// モデルの実行本体は、下の detectLanguagesImpl() → runModel()。
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
				// 採用した候補を呼び出し元へ返す。fileActions.ts はこの結果から拡張子を選ぶ。
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
		// 言語判定⑤：node_modules/@vscode/vscode-languagedetection/dist/lib/index.js を読み込む。
		// 下のローダーで model/model.json と model/group1-shard1of1.bin を取得する。
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
			// 言語判定⑥：ここでライブラリの学習済みモデルを実行し、言語候補と確信度を受け取る。
			// runModel() 自体の実装は node_modules/@vscode/vscode-languagedetection/dist/lib/index.js。
			modelResults = await modelOperations.runModel(content);
		} catch (e) {
			console.warn(e);
		}

		// 言語判定⑦：候補の確信度を検査し、続く処理で言語ごとの補正・候補間の差を確認する。
		// 条件を満たした候補だけ yield して neuralResolver に渡す。候補がなければ別の判定へ進む。
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
