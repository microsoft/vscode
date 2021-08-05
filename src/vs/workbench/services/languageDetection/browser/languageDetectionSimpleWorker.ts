/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
// import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
// import { URI } from 'vs/base/common/uri';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
// import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
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

	private _modelOperations: ModelOperations | undefined;
	private _loadFailed: boolean = false;

	public async detectLanguage(uri: string): Promise<string | undefined> {
		const stopWatch = new StopWatch(true);
		for await (const language of this.detectLanguagesImpl(uri)) {
			stopWatch.stop();
			this.host.fhr('sendTelemetryEvent', [[language.languageId], [language.confidence], stopWatch.elapsed()]);
			return language.languageId;
		}
		return undefined;
	}

	public async detectLanguages(uri: string): Promise<string[]> {
		const languages: string[] = [];
		const confidences: number[] = [];
		const stopWatch = new StopWatch(true);
		for await (const language of this.detectLanguagesImpl(uri)) {
			languages.push(language.languageId);
			confidences.push(language.confidence);
		}
		stopWatch.stop();

		this.host.fhr('sendTelemetryEvent', [languages, confidences, stopWatch.elapsed()]);
		return languages;
	}

	private async getModelOperations(): Promise<ModelOperations> {
		if (this._modelOperations) {
			return this._modelOperations;
		}

		const uri: string = await this.host.fhr('getIndexJsUri', []);
		// const uri = await this.host.getIndexJsUri();
		const { ModelOperations } = await import(uri);
		this._modelOperations = new ModelOperations(
			async () => {
				const response = await fetch(await this.host.fhr('getModelJsonUri', []));
				try {
					const modelJSON = await response.json();
					return modelJSON;
				} catch (e) {
					const message = `Failed to parse model JSON.`;
					throw new Error(message);
				}
			},
			async () => {
				const response = await fetch(await this.host.fhr('getWeightsUri', []));
				const buffer = await response.arrayBuffer();
				return buffer;
			}
		);

		return this._modelOperations!;
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

		const content = this._getModel(uri);
		if (!content) {
			return;
		}

		const modelResults = await modelOperations.runModel(content.getValue());
		if (!modelResults
			|| modelResults.length === 0
			|| modelResults[0].confidence < LanguageDetectionSimpleWorker.expectedRelativeConfidence) {
			return;
		}

		const possibleLanguages: ModelResult[] = [modelResults[0]];

		for (let current of modelResults) {

			if (current === modelResults[0]) {
				continue;
			}

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
