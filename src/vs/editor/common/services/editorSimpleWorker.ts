/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRequestHandler } from 'vs/base/common/worker/simpleWorker';
import { Range } from 'vs/editor/common/core/range';
import { DiffComputer } from 'vs/editor/common/diff/diffComputer';
import { stringDiff } from 'vs/base/common/diff/diff';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { Position } from 'vs/editor/common/core/position';
import { MirrorModel2 } from 'vs/editor/common/model/mirrorModel2';
import { IInplaceReplaceSupportResult, ILink, ISuggestResult, ISuggestion } from 'vs/editor/common/modes';
import { computeLinks } from 'vs/editor/common/modes/linkComputer';
import { BasicInplaceReplace } from 'vs/editor/common/modes/supports/inplaceReplaceSupport';
import { IRawModelData } from 'vs/editor/common/services/editorSimpleWorkerCommon';
import { getWordAtText, ensureValidWordDefinition } from 'vs/editor/common/model/wordHelper';
import { createMonacoBaseAPI } from 'vs/editor/common/standalone/standaloneBase';

export interface IMirrorModel {
	readonly uri: URI;
	readonly version: number;
	getValue(): string;
}

export interface IWorkerContext {
	/**
	 * Get all available mirror models in this worker.
	 */
	getMirrorModels(): IMirrorModel[];
}

/**
 * @internal
 */
export interface ICommonModel {
	uri: URI;
	version: number;
	eol: string;
	getValue(): string;

	getLinesContent(): string[];
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
	getWordUntilPosition(position: editorCommon.IPosition, wordDefinition: RegExp): editorCommon.IWordAtPosition;
	getAllUniqueWords(wordDefinition: RegExp, skipWordOnce?: string): string[];
	getValueInRange(range: editorCommon.IRange): string;
	getWordAtPosition(position: editorCommon.IPosition, wordDefinition: RegExp): Range;
	offsetAt(position: editorCommon.IPosition): number;
	positionAt(offset: number): editorCommon.IPosition;
}

/**
 * @internal
 */
class MirrorModel extends MirrorModel2 implements ICommonModel {

	public get uri(): URI {
		return this._uri;
	}

	public get version(): number {
		return this._versionId;
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

	public getWordAtPosition(position: editorCommon.IPosition, wordDefinition: RegExp): Range {

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

	public getWordUntilPosition(position: editorCommon.IPosition, wordDefinition: RegExp): editorCommon.IWordAtPosition {
		var wordAtPosition = this.getWordAtPosition(position, wordDefinition);
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

	private _getAllWords(wordDefinition: RegExp): string[] {
		var result: string[] = [];
		this._lines.forEach((line) => {
			this._wordenize(line, wordDefinition).forEach((info) => {
				result.push(line.substring(info.start, info.end));
			});
		});
		return result;
	}

	public getAllUniqueWords(wordDefinition: RegExp, skipWordOnce?: string): string[] {
		var foundSkipWord = false;
		var uniqueWords = Object.create(null);
		return this._getAllWords(wordDefinition).filter((word) => {
			if (skipWordOnce && !foundSkipWord && skipWordOnce === word) {
				foundSkipWord = true;
				return false;
			} else if (uniqueWords[word]) {
				return false;
			} else {
				uniqueWords[word] = true;
				return true;
			}
		});
	}

	// TODO@Joh, TODO@Alex - remove these and make sure the super-things work
	private _wordenize(content: string, wordDefinition: RegExp): editorCommon.IWordRange[] {
		const result: editorCommon.IWordRange[] = [];
		let match: RegExpExecArray;

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

	public getValueInRange(range: editorCommon.IRange): string {
		range = this._validateRange(range);

		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		var lineEnding = this._eol,
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines: string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}

	public offsetAt(position: editorCommon.IPosition): number {
		position = this._validatePosition(position);
		this._ensureLineStarts();
		return this._lineStarts.getAccumulatedValue(position.lineNumber - 2) + (position.column - 1);
	}

	public positionAt(offset: number): editorCommon.IPosition {
		offset = Math.floor(offset);
		offset = Math.max(0, offset);

		this._ensureLineStarts();
		let out = this._lineStarts.getIndexOf(offset);
		let lineLength = this._lines[out.index].length;

		// Ensure we return a valid position
		return {
			lineNumber: 1 + out.index,
			column: 1 + Math.min(out.remainder, lineLength)
		};
	}

	private _validateRange(range: editorCommon.IRange): editorCommon.IRange {

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

	private _validatePosition(position: editorCommon.IPosition): editorCommon.IPosition {
		if (!Position.isIPosition(position)) {
			throw new Error('bad position');
		}
		let {lineNumber, column} = position;
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
export abstract class BaseEditorSimpleWorker {
	private _foreignModule: any;

	constructor() {
		this._foreignModule = null;
	}

	protected abstract _getModel(uri: string): ICommonModel;
	protected abstract _getModels(): ICommonModel[];

	// ---- BEGIN diff --------------------------------------------------------------------------

	public computeDiff(originalUrl: string, modifiedUrl: string, ignoreTrimWhitespace: boolean): TPromise<editorCommon.ILineChange[]> {
		let original = this._getModel(originalUrl);
		let modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		let originalLines = original.getLinesContent();
		let modifiedLines = modified.getLinesContent();
		let diffComputer = new DiffComputer(originalLines, modifiedLines, {
			shouldPostProcessCharChanges: true,
			shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
			shouldConsiderTrimWhitespaceInEmptyCase: true
		});
		return TPromise.as(diffComputer.computeDiff());
	}

	public computeDirtyDiff(originalUrl: string, modifiedUrl: string, ignoreTrimWhitespace: boolean): TPromise<editorCommon.IChange[]> {
		let original = this._getModel(originalUrl);
		let modified = this._getModel(modifiedUrl);
		if (!original || !modified) {
			return null;
		}

		let originalLines = original.getLinesContent();
		let modifiedLines = modified.getLinesContent();
		let diffComputer = new DiffComputer(originalLines, modifiedLines, {
			shouldPostProcessCharChanges: false,
			shouldIgnoreTrimWhitespace: ignoreTrimWhitespace,
			shouldConsiderTrimWhitespaceInEmptyCase: false
		});
		return TPromise.as(diffComputer.computeDiff());
	}

	// ---- END diff --------------------------------------------------------------------------


	// ---- BEGIN minimal edits ---------------------------------------------------------------

	private static _diffLimit = 10000;

	public computeMoreMinimalEdits(modelUrl: string, edits: editorCommon.ISingleEditOperation[], ranges: editorCommon.IRange[]): TPromise<editorCommon.ISingleEditOperation[]> {
		const model = this._getModel(modelUrl);
		if (!model) {
			return TPromise.as(edits);
		}

		const result: editorCommon.ISingleEditOperation[] = [];

		for (let {range, text} of edits) {

			const original = model.getValueInRange(range);
			text = text.replace(/\r\n|\n|\r/g, model.eol);

			if (original === text) {
				// noop
				continue;
			}

			// make sure diff won't take too long
			if (Math.max(text.length, original.length) > BaseEditorSimpleWorker._diffLimit) {
				result.push({ range, text });
				continue;
			}

			// compute diff between original and edit.text
			const changes = stringDiff(original, text);
			const editOffset = model.offsetAt(Range.lift(range).getStartPosition());

			for (const change of changes) {
				const start = model.positionAt(editOffset + change.originalStart);
				const end = model.positionAt(editOffset + change.originalStart + change.originalLength);
				const newEdit: editorCommon.ISingleEditOperation = {
					text: text.substr(change.modifiedStart, change.modifiedLength),
					range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column }
				};

				if (model.getValueInRange(newEdit.range) !== newEdit.text) {
					result.push(newEdit);
				}
			}
		}

		return TPromise.as(result);
	}

	// ---- END minimal edits ---------------------------------------------------------------

	public computeLinks(modelUrl: string): TPromise<ILink[]> {
		let model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}

		return TPromise.as(computeLinks(model));
	}

	// ---- BEGIN suggest --------------------------------------------------------------------------

	public textualSuggest(modelUrl: string, position: editorCommon.IPosition, wordDef: string, wordDefFlags: string): TPromise<ISuggestResult> {
		const model = this._getModel(modelUrl);
		if (model) {
			const suggestions: ISuggestion[] = [];
			const wordDefRegExp = new RegExp(wordDef, wordDefFlags);
			const currentWord = model.getWordUntilPosition(position, wordDefRegExp).word;

			for (const word of model.getAllUniqueWords(wordDefRegExp)) {
				if (word !== currentWord && isNaN(Number(word))) {
					suggestions.push({
						type: 'text',
						label: word,
						insertText: word,
						noAutoAccept: true,
						overwriteBefore: currentWord.length
					});
				}
			}
			return TPromise.as({ suggestions });
		}
		return undefined;
	}


	// ---- END suggest --------------------------------------------------------------------------

	public navigateValueSet(modelUrl: string, range: editorCommon.IRange, up: boolean, wordDef: string, wordDefFlags: string): TPromise<IInplaceReplaceSupportResult> {
		let model = this._getModel(modelUrl);
		if (!model) {
			return null;
		}

		let wordDefRegExp = new RegExp(wordDef, wordDefFlags);

		if (range.startColumn === range.endColumn) {
			range = {
				startLineNumber: range.startLineNumber,
				startColumn: range.startColumn,
				endLineNumber: range.endLineNumber,
				endColumn: range.endColumn + 1
			};
		}

		let selectionText = model.getValueInRange(range);

		let wordRange = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn }, wordDefRegExp);
		let word: string = null;
		if (wordRange !== null) {
			word = model.getValueInRange(wordRange);
		}

		let result = BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
		return TPromise.as(result);
	}

	// ---- BEGIN foreign module support --------------------------------------------------------------------------

	public loadForeignModule(moduleId: string, createData: any): TPromise<string[]> {
		return new TPromise<any>((c, e) => {
			// Use the global require to be sure to get the global config
			(<any>self).require([moduleId], (foreignModule) => {
				let ctx: IWorkerContext = {
					getMirrorModels: (): IMirrorModel[] => {
						return this._getModels();
					}
				};
				this._foreignModule = foreignModule.create(ctx, createData);

				let methods: string[] = [];
				for (let prop in this._foreignModule) {
					if (typeof this._foreignModule[prop] === 'function') {
						methods.push(prop);
					}
				}

				c(methods);

			}, e);
		});
	}

	// foreign method request
	public fmr(method: string, args: any[]): TPromise<any> {
		if (!this._foreignModule || typeof this._foreignModule[method] !== 'function') {
			return TPromise.wrapError(new Error('Missing requestHandler or method: ' + method));
		}

		try {
			return TPromise.as(this._foreignModule[method].apply(this._foreignModule, args));
		} catch (e) {
			return TPromise.wrapError(e);
		}
	}

	// ---- END foreign module support --------------------------------------------------------------------------
}

/**
 * @internal
 */
export class EditorSimpleWorkerImpl extends BaseEditorSimpleWorker implements IRequestHandler, IDisposable {
	_requestHandlerTrait: any;

	private _models: { [uri: string]: MirrorModel; };

	constructor() {
		super();
		this._models = Object.create(null);
	}

	public dispose(): void {
		this._models = Object.create(null);
	}

	protected _getModel(uri: string): ICommonModel {
		return this._models[uri];
	}

	protected _getModels(): ICommonModel[] {
		let all: MirrorModel[] = [];
		Object.keys(this._models).forEach((key) => all.push(this._models[key]));
		return all;
	}

	public acceptNewModel(data: IRawModelData): void {
		this._models[data.url] = new MirrorModel(URI.parse(data.url), data.value.lines, data.value.EOL, data.versionId);
	}

	public acceptModelChanged(strURL: string, events: editorCommon.IModelContentChangedEvent2[]): void {
		if (!this._models[strURL]) {
			return;
		}
		let model = this._models[strURL];
		model.onEvents(events);
	}

	public acceptRemovedModel(strURL: string): void {
		if (!this._models[strURL]) {
			return;
		}
		delete this._models[strURL];
	}
}

/**
 * Called on the worker side
 * @internal
 */
export function create(): IRequestHandler {
	return new EditorSimpleWorkerImpl();
}

var global: any = self;
let isWebWorker = (typeof global.importScripts === 'function');
if (isWebWorker) {
	global.monaco = createMonacoBaseAPI();
}
