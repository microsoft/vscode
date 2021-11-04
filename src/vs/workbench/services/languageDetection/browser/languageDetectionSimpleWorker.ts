/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
import { StopWatch } from 'vs/base/common/stopwatch';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { EditorSimpleWorker } from 'vs/editor/common/services/editorSimpleWorker';
import { EditorWorkerHost } from 'vs/editor/common/services/editorWorkerServiceImpl';

/**
 * Called on the worker side
 * @internal
 */
export function create(host: EditorWorkerHost): IRequestHandler {
	return new LanguageDetectionSimpleWorker(host, null);
}

/**
 * @internal
 */
export class LanguageDetectionSimpleWorker extends EditorSimpleWorker {
	private static readonly expectedRelativeConfidence = 0.2;
	private static readonly positiveConfidenceCorrectionBucket1 = 0.05;
	private static readonly positiveConfidenceCorrectionBucket2 = 0.025;
	private static readonly negativeConfidenceCorrection = 0.5;

	private _modelOperations: ModelOperations | undefined;
	private _loadFailed: boolean = false;

	public async detectLanguage(uri: string): Promise<string | undefined> {
		const languages: string[] = [];
		const confidences: number[] = [];
		const stopWatch = new StopWatch(true);
		for await (const language of this.detectLanguagesImpl(uri)) {
			languages.push(language.languageId);
			confidences.push(language.confidence);
		}
		stopWatch.stop();

		if (languages.length) {
			this._host.fhr('sendTelemetryEvent', [languages, confidences, stopWatch.elapsed()]);
			return languages[0];
		}
		return undefined;
	}

	private async getModelOperations(): Promise<ModelOperations> {
		if (this._modelOperations) {
			return this._modelOperations;
		}

		const uri: string = await this._host.fhr('getIndexJsUri', []);
		const { ModelOperations } = await import(uri) as typeof import('@vscode/vscode-languagedetection');
		this._modelOperations = new ModelOperations({
			modelJsonLoaderFunc: async () => {
				const response = await fetch(await this._host.fhr('getModelJsonUri', []));
				try {
					const modelJSON = await response.json();
					return modelJSON;
				} catch (e) {
					const message = `Failed to parse model JSON.`;
					throw new Error(message);
				}
			},
			weightsLoaderFunc: async () => {
				const response = await fetch(await this._host.fhr('getWeightsUri', []));
				const buffer = await response.arrayBuffer();
				return buffer;
			}
		});

		return this._modelOperations!;
	}

	// This adjusts the language confidence scores to be more accurate based on:
	// * VS Code's language usage
	// * Languages with 'problematic' syntaxes that have caused incorrect language detection
	private adjustLanguageConfidence(modelResult: ModelResult): ModelResult {
		switch (modelResult.languageId) {
			// For the following languages, we increase the confidence because
			// these are commonly used languages in VS Code and supported
			// by the model.
			case 'javascript':
			case 'html':
			case 'json':
			case 'typescript':
			case 'css':
			case 'python':
			case 'xml':
			case 'php':
				modelResult.confidence += LanguageDetectionSimpleWorker.positiveConfidenceCorrectionBucket1;
				break;
			// case 'yaml': // YAML has been know to cause incorrect language detection because the language is pretty simple. We don't want to increase the confidence for this.
			case 'cpp':
			case 'shellscript':
			case 'java':
			case 'csharp':
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

	private async * detectLanguagesImpl(uri: string): AsyncGenerator<ModelResult, void, unknown> {
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

		const model = this._getModel(uri);
		if (!model) {
			return;
		}

		let modelResults: ModelResult[] | undefined;
		// Grab the first 10000 characters
		const end = model.positionAt(10000);
		const content = model.getValueInRange({
			startColumn: 1,
			startLineNumber: 1,
			endColumn: end.column,
			endLineNumber: end.lineNumber
		});
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
