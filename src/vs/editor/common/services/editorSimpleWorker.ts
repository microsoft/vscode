/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {TPromise} from 'vs/base/common/winjs.base';
import {IRequestHandler} from 'vs/base/common/worker/simpleWorker';
import {EditorSimpleWorker, IRawModelData} from 'vs/editor/common/services/editorSimpleWorkerCommon';
import {MirrorModel2} from 'vs/editor/common/model/mirrorModel2';
import URI from 'vs/base/common/uri';
import {DiffComputer} from 'vs/editor/common/diff/diffComputer';
import Modes = require('vs/editor/common/modes');
import {computeLinks} from 'vs/editor/common/modes/linkComputer';
import {DefaultFilter} from 'vs/editor/common/modes/modesFilters';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {Range} from 'vs/editor/common/core/range';

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

	private _getWordAtPosition(position:EditorCommon.IPosition, wordDefinition:RegExp): Range {

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

	public getWordUntilPosition(position: EditorCommon.IPosition, wordDefinition:RegExp): EditorCommon.IWordAtPosition {
		var wordAtPosition = this._getWordAtPosition(position, wordDefinition);
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
	private _wordenize(content:string, wordDefinition:RegExp): EditorCommon.IWordRange[] {
		var result:EditorCommon.IWordRange[] = [];
		var match:RegExpExecArray;
		while (match = wordDefinition.exec(content)) {
			result.push({ start: match.index, end: match.index + match[0].length });
		}
		return result;
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

	public acceptModelChanged(strURL: string, events: EditorCommon.IModelContentChangedEvent2[]): void {
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

	public computeDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean): TPromise<EditorCommon.ILineChange[]> {
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

	public computeDirtyDiff(originalUrl:string, modifiedUrl:string, ignoreTrimWhitespace:boolean):TPromise<EditorCommon.IChange[]> {
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

	public computeLinks(modelUrl:string):TPromise<Modes.ILink[]> {
		let model = this._models[modelUrl];
		if (!model) {
			return null;
		}

		return TPromise.as(computeLinks(model));
	}

	// ---- BEGIN suggest --------------------------------------------------------------------------

	public textualSuggest(modelUrl:string, position: EditorCommon.IPosition, wordDef:string, wordDefFlags:string): TPromise<Modes.ISuggestResult[]> {
		let model = this._models[modelUrl];
		if (!model) {
			return null;
		}

		return TPromise.as(this._suggestFiltered(model, position, new RegExp(wordDef, wordDefFlags)));
	}

	private _suggestFiltered(model:MirrorModel, position: EditorCommon.IPosition, wordDefRegExp: RegExp): Modes.ISuggestResult[] {
		let value = this._suggestUnfiltered(model, position, wordDefRegExp);
		let accept = DefaultFilter;

		// filter suggestions
		return [{
			currentWord: value.currentWord,
			suggestions: value.suggestions.filter((element) => !!accept(value.currentWord, element)),
			incomplete: value.incomplete
		}];
	}

	private _suggestUnfiltered(model:MirrorModel, position:EditorCommon.IPosition, wordDefRegExp: RegExp): Modes.ISuggestResult {
		let currentWord = model.getWordUntilPosition(position, wordDefRegExp).word;
		let allWords = model.getAllUniqueWords(wordDefRegExp, currentWord);

		let suggestions = allWords.filter((word) => {
			return !(/^-?\d*\.?\d/.test(word)); // filter out numbers
		}).map((word) => {
			return <Modes.ISuggestion> {
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
}

/**
 * Called on the worker side
 */
export function create(): IRequestHandler {
	return new EditorSimpleWorkerImpl();
}
