/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { URI } from 'vs/base/common/uri';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { IModelChangedEvent } from 'vs/editor/common/model/mirrorTextModel';
import { ICommonModel, IRawModelData, MirrorModel } from 'vs/editor/common/services/editorSimpleWorker';
import { LanguageDetectionWorkerHost } from 'vs/workbench/services/languageDetection/browser/languageDetectionWorkerServiceImpl';

/**
 * @internal
 */
export class LanguageDetectionSimpleWorker implements IRequestHandler, IDisposable {
	private static readonly expectedRelativeConfidence = 0.2;
	_requestHandlerBrand: any;

	private _models: { [uri: string]: MirrorModel; };
	private _modelOperations: ModelOperations | undefined;
	private _loadFailed: boolean = false;

	constructor(private _host: LanguageDetectionWorkerHost) {
		this._models = Object.create(null);
	}

	public dispose(): void {
		this._models = Object.create(null);
		this._modelOperations?.dispose();
	}

	protected _getModel(uri: string): ICommonModel {
		return this._models[uri];
	}

	public acceptNewModel(data: IRawModelData): void {
		this._models[data.url] = new MirrorModel(URI.parse(data.url), data.lines, data.EOL, data.versionId);
	}

	public acceptModelChanged(strURL: string, e: IModelChangedEvent): void {
		if (!this._models[strURL]) {
			return;
		}
		let model = this._models[strURL];
		model.onEvents(e);
	}

	public acceptRemovedModel(strURL: string): void {
		if (!this._models[strURL]) {
			return;
		}
		delete this._models[strURL];
	}

	public async detectLanguage(uri: string): Promise<string | undefined> {
		const stopWatch = new StopWatch(true);
		for await (const language of this.detectLanguagesImpl(uri)) {
			stopWatch.stop();
			this._host.sendTelemetryEvent([language.languageId], [language.confidence], stopWatch.elapsed());
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

		this._host.sendTelemetryEvent(languages, confidences, stopWatch.elapsed());
		return languages;
	}

	private async getModelOperations(): Promise<ModelOperations> {
		if (this._modelOperations) {
			return this._modelOperations;
		}

		const uri = await this._host.getIndexJsUri();
		const { ModelOperations } = await import(uri);
		this._modelOperations = new ModelOperations(
			async () => {
				const response = await fetch(await this._host.getModelJsonUri());
				try {
					const modelJSON = await response.json();
					return modelJSON;
				} catch (e) {
					const message = `Failed to parse model JSON.`;
					throw new Error(message);
				}
			},
			async () => {
				const response = await fetch(await this._host.getWeightsUri());
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

		const content = this._models[uri];
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

/**
 * Called on the worker side
 * @internal
 */
export function create(host: LanguageDetectionWorkerHost): IRequestHandler {
	return new LanguageDetectionSimpleWorker(host);
}
