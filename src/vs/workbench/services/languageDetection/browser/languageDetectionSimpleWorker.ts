/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelOperations, ModelResult } from '@vscode/vscode-languagedetection';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { IRange, Range } from 'vs/editor/common/core/range';
import { IWordAtPosition } from 'vs/editor/common/model';
import { IMirrorTextModel, IModelChangedEvent, MirrorTextModel as BaseMirrorModel } from 'vs/editor/common/model/mirrorTextModel';
import { ensureValidWordDefinition, getWordAtText } from 'vs/editor/common/model/wordHelper';
import { ILinkComputerTarget } from 'vs/editor/common/modes/linkComputer';
import { LanguageDetectionWorkerHost } from 'vs/workbench/services/languageDetection/browser/languageDetectionWorkerServiceImpl';

export interface IMirrorModel extends IMirrorTextModel {
	readonly uri: URI;
	readonly version: number;
	getValue(): string;
}

export interface IWorkerContext<H = undefined> {
	/**
	 * A proxy to the main thread host object.
	 */
	host: H;
	/**
	 * Get all available mirror models in this worker.
	 */
	getMirrorModels(): IMirrorModel[];
}

/**
 * @internal
 */
export interface IRawModelData {
	url: string;
	versionId: number;
	lines: string[];
	EOL: string;
}

/**
 * @internal
 */
export interface ICommonModel extends ILinkComputerTarget, IMirrorModel {
	uri: URI;
	version: number;
	eol: string;
	getValue(): string;

	getLinesContent(): string[];
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getLineWords(lineNumber: number, wordDefinition: RegExp): IWordAtPosition[];
	words(wordDefinition: RegExp): Iterable<string>;
	getWordUntilPosition(position: IPosition, wordDefinition: RegExp): IWordAtPosition;
	getValueInRange(range: IRange): string;
	getWordAtPosition(position: IPosition, wordDefinition: RegExp): Range | null;
	offsetAt(position: IPosition): number;
	positionAt(offset: number): IPosition;
}

/**
 * Range of a word inside a model.
 * @internal
 */
interface IWordRange {
	/**
	 * The index where the word starts.
	 */
	readonly start: number;
	/**
	 * The index where the word ends.
	 */
	readonly end: number;
}

/**
 * @internal
 */
class MirrorModel extends BaseMirrorModel implements ICommonModel {

	public get uri(): URI {
		return this._uri;
	}

	public get eol(): string {
		return this._eol;
	}

	public getValue(): string {
		return this.getText();
	}

	public getLinesContent(): string[] {
		return this._lines.slice(0);
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public getLineContent(lineNumber: number): string {
		return this._lines[lineNumber - 1];
	}

	public getWordAtPosition(position: IPosition, wordDefinition: RegExp): Range | null {

		let wordAtText = getWordAtText(
			position.column,
			ensureValidWordDefinition(wordDefinition),
			this._lines[position.lineNumber - 1],
			0
		);

		if (wordAtText) {
			return new Range(position.lineNumber, wordAtText.startColumn, position.lineNumber, wordAtText.endColumn);
		}

		return null;
	}

	public getWordUntilPosition(position: IPosition, wordDefinition: RegExp): IWordAtPosition {
		const wordAtPosition = this.getWordAtPosition(position, wordDefinition);
		if (!wordAtPosition) {
			return {
				word: '',
				startColumn: position.column,
				endColumn: position.column
			};
		}
		return {
			word: this._lines[position.lineNumber - 1].substring(wordAtPosition.startColumn - 1, position.column - 1),
			startColumn: wordAtPosition.startColumn,
			endColumn: position.column
		};
	}


	public words(wordDefinition: RegExp): Iterable<string> {

		const lines = this._lines;
		const wordenize = this._wordenize.bind(this);

		let lineNumber = 0;
		let lineText = '';
		let wordRangesIdx = 0;
		let wordRanges: IWordRange[] = [];

		return {
			*[Symbol.iterator]() {
				while (true) {
					if (wordRangesIdx < wordRanges.length) {
						const value = lineText.substring(wordRanges[wordRangesIdx].start, wordRanges[wordRangesIdx].end);
						wordRangesIdx += 1;
						yield value;
					} else {
						if (lineNumber < lines.length) {
							lineText = lines[lineNumber];
							wordRanges = wordenize(lineText, wordDefinition);
							wordRangesIdx = 0;
							lineNumber += 1;
						} else {
							break;
						}
					}
				}
			}
		};
	}

	public getLineWords(lineNumber: number, wordDefinition: RegExp): IWordAtPosition[] {
		let content = this._lines[lineNumber - 1];
		let ranges = this._wordenize(content, wordDefinition);
		let words: IWordAtPosition[] = [];
		for (const range of ranges) {
			words.push({
				word: content.substring(range.start, range.end),
				startColumn: range.start + 1,
				endColumn: range.end + 1
			});
		}
		return words;
	}

	private _wordenize(content: string, wordDefinition: RegExp): IWordRange[] {
		const result: IWordRange[] = [];
		let match: RegExpExecArray | null;

		wordDefinition.lastIndex = 0; // reset lastIndex just to be sure

		while (match = wordDefinition.exec(content)) {
			if (match[0].length === 0) {
				// it did match the empty string
				break;
			}
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
	}

	public getValueInRange(range: IRange): string {
		range = this._validateRange(range);

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		let lineEnding = this._eol;
		let startLineIndex = range.startLineNumber - 1;
		let endLineIndex = range.endLineNumber - 1;
		let resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (let i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public offsetAt(position: IPosition): number {
		position = this._validatePosition(position);
		this._ensureLineStarts();
		return this._lineStarts!.getPrefixSum(position.lineNumber - 2) + (position.column - 1);
	}

	public positionAt(offset: number): IPosition {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out = this._lineStarts!.getIndexOf(offset);
		let lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return {
			lineNumber: 1 + out.index,
			column: 1 + Math.min(out.remainder, lineLength)
		};
	}

	private _validateRange(range: IRange): IRange {

		const start = this._validatePosition({ lineNumber: range.startLineNumber, column: range.startColumn });
		const end = this._validatePosition({ lineNumber: range.endLineNumber, column: range.endColumn });

		if (start.lineNumber !== range.startLineNumber
			|| start.column !== range.startColumn
			|| end.lineNumber !== range.endLineNumber
			|| end.column !== range.endColumn) {

			return {
				startLineNumber: start.lineNumber,
				startColumn: start.column,
				endLineNumber: end.lineNumber,
				endColumn: end.column
			};
		}

		return range;
	}

	private _validatePosition(position: IPosition): IPosition {
		if (!Position.isIPosition(position)) {
			throw new Error('bad position');
		}
		let { lineNumber, column } = position;
		let hasChanged = false;

		if (lineNumber < 1) {
			lineNumber = 1;
			column = 1;
			hasChanged = true;

		} else if (lineNumber > this._lines.length) {
			lineNumber = this._lines.length;
			column = this._lines[lineNumber - 1].length + 1;
			hasChanged = true;

		} else {
			let maxCharacter = this._lines[lineNumber - 1].length + 1;
			if (column < 1) {
				column = 1;
				hasChanged = true;
			}
			else if (column > maxCharacter) {
				column = maxCharacter;
				hasChanged = true;
			}
		}

		if (!hasChanged) {
			return position;
		} else {
			return { lineNumber, column };
		}
	}
}

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
		for await (const language of this.detectLanguagesImpl(uri)) {
			return language;
		}
		return undefined;
	}

	public async detectLanguages(uri: string): Promise<string[]> {
		const languages: string[] = [];

		for await (const language of this.detectLanguagesImpl(uri)) {
			languages.push(language);
		}

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

	private async * detectLanguagesImpl(uri: string) {
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
					yield possibleLanguages.shift()!.languageId;
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
