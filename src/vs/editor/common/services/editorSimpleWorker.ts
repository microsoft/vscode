/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IRequestHandler} from 'vs/base/common/worker/simpleWorker';
import {Range} from 'vs/editor/common/core/range';
import {DiffComputer} from 'vs/editor/common/diff/diffComputer';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {IInplaceReplaceSupportResult, ILink, ISuggestResult, ISuggestion} from 'vs/editor/common/modes';
import {computeLinks} from 'vs/editor/common/modes/linkComputer';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import {BasicInplaceReplace} from 'vs/editor/common/modes/supports/inplaceReplaceSupport';
import {EditorSimpleWorker, IRawModelData} from 'vs/editor/common/services/editorSimpleWorkerCommon';

class MirrorModel extends MirrorModel2 {

	public getLinesContent(): string[] {
		return this._lines.slice(0);
	}

	public getLineCount(): number {
		return this._lines.length;
	}

	public getLineContent(lineNumber:number): string {
		return this._lines[lineNumber - 1];
	}

	public getWordAtPosition(position:editorCommon.IPosition, wordDefinition:RegExp): Range {

		let wordAtText = WordHelper._getWordAtText(
			position.column,
			WordHelper.ensureValidWordDefinition(wordDefinition),
			this._lines[position.lineNumber - 1],
			0
		);

		if (wordAtText) {
			return new Range(position.lineNumber, wordAtText.startColumn, position.lineNumber, wordAtText.endColumn);
		}

		return null;
	}

	public getWordUntilPosition(position: editorCommon.IPosition, wordDefinition:RegExp): editorCommon.IWordAtPosition {
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

	private _getAllWords(wordDefinition:RegExp): string[] {
		var result:string[] = [];
		this._lines.forEach((line) => {
			this._wordenize(line, wordDefinition).forEach((info) => {
				result.push(line.substring(info.start, info.end));
			});
		});
		return result;
	}

	public getAllUniqueWords(wordDefinition:RegExp, skipWordOnce?:string) : string[] {
		var foundSkipWord = false;
		var uniqueWords = {};
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

//	// TODO@Joh, TODO@Alex - remove these and make sure the super-things work
	private _wordenize(content:string, wordDefinition:RegExp): editorCommon.IWordRange[] {
		var result:editorCommon.IWordRange[] = [];
		var match:RegExpExecArray;
		while (match = wordDefinition.exec(content)) {
			if (match[0].length === 0) {
				// it did match the empty string
				break;
			}
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
	}

	public getValueInRange(range:editorCommon.IRange): string {
		if (range.startLineNumber === range.endLineNumber) {
			return this._lines[range.startLineNumber - 1].substring(range.startColumn - 1, range.endColumn - 1);
		}

		var lineEnding = this._eol,
			startLineIndex = range.startLineNumber - 1,
			endLineIndex = range.endLineNumber - 1,
			resultLines:string[] = [];

		resultLines.push(this._lines[startLineIndex].substring(range.startColumn - 1));
		for (var i = startLineIndex + 1; i < endLineIndex; i++) {
			resultLines.push(this._lines[i]);
		}
		resultLines.push(this._lines[endLineIndex].substring(0, range.endColumn - 1));

		return resultLines.join(lineEnding);
	}
}

export class EditorSimpleWorkerImpl extends EditorSimpleWorker implements IRequestHandler {
	_requestHandlerTrait: any;

	private _models:{[uri:string]:MirrorModel;};

	constructor() {
		super();
		this._models = Object.create(null);
	}

	public acceptNewModel(data:IRawModelData): void {
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

	// ---- BEGIN diff --------------------------------------------------------------------------

	public computeDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean): TPromise<editorCommon.ILineChange[]> {
		let original = this._models[originalUrl];
		let modified = this._models[modifiedUrl];
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

	public computeDirtyDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<editorCommon.IChange[]> {
		let original = this._models[originalUrl];
		let modified = this._models[modifiedUrl];
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

	public computeLinks(modelUrl:string):TPromise<ILink[]> {
		let model = this._models[modelUrl];
		if (!model) {
			return null;
		}

		return TPromise.as(computeLinks(model));
	}

	// ---- BEGIN suggest --------------------------------------------------------------------------

	public textualSuggest(modelUrl:string, position: editorCommon.IPosition, wordDef:string, wordDefFlags:string): TPromise<ISuggestResult[]> {
		let model = this._models[modelUrl];
		if (!model) {
			return null;
		}

		return TPromise.as(this._suggestFiltered(model, position, new RegExp(wordDef, wordDefFlags)));
	}

	private _suggestFiltered(model:MirrorModel, position: editorCommon.IPosition, wordDefRegExp: RegExp): ISuggestResult[] {
		let value = this._suggestUnfiltered(model, position, wordDefRegExp);
		let accept = DefaultFilter;

		// filter suggestions
		return [{
			currentWord: value.currentWord,
			suggestions: value.suggestions.filter((element) => !!accept(value.currentWord, element)),
			incomplete: value.incomplete
		}];
	}

	private _suggestUnfiltered(model:MirrorModel, position:editorCommon.IPosition, wordDefRegExp: RegExp): ISuggestResult {
		let currentWord = model.getWordUntilPosition(position, wordDefRegExp).word;
		let allWords = model.getAllUniqueWords(wordDefRegExp, currentWord);

		let suggestions = allWords.filter((word) => {
			return !(/^-?\d*\.?\d/.test(word)); // filter out numbers
		}).map((word) => {
			return <ISuggestion> {
				type: 'text',
				label: word,
				codeSnippet: word,
				noAutoAccept: true
			};
		});

		return {
			currentWord: currentWord,
			suggestions: suggestions
		};
	}

	// ---- END suggest --------------------------------------------------------------------------

	public navigateValueSet(modelUrl:string, range:editorCommon.IRange, up:boolean, wordDef:string, wordDefFlags:string): TPromise<IInplaceReplaceSupportResult> {
		let model = this._models[modelUrl];
		if (!model) {
			return null;
		}

		let wordDefRegExp = new RegExp(wordDef, wordDefFlags);

		if (range.startColumn === range.endColumn) {
			range.endColumn += 1;
		}

		let selectionText = model.getValueInRange(range);

		let	wordRange = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn }, wordDefRegExp);
		let word: string = null;
		if (wordRange !== null) {
			word = model.getValueInRange(wordRange);
		}

		let result = BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
		return TPromise.as(result);
	}
}

/**
 * Called on the worker side
 */
export function create(): IRequestHandler {
	return new EditorSimpleWorkerImpl();
}
