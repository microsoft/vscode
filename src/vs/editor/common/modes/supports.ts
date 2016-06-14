/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import * as objects from 'vs/base/common/objects';
import {TPromise} from 'vs/base/common/winjs.base';
import {IReadOnlyModel, IPosition} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';

export class Token implements modes.IToken {
	_tokenBrand: void;

	public startIndex:number;
	public type:string;

	constructor(startIndex:number, type:string) {
		this.startIndex = startIndex;
		this.type = type;
	}

	public toString(): string {
		return '(' + this.startIndex + ', ' + this.type + ')';
	}
}

export class LineTokens implements modes.ILineTokens {
	_lineTokensBrand: void;

	tokens: Token[];
	modeTransitions: ModeTransition[];
	actualStopOffset: number;
	endState: modes.IState;
	retokenize: TPromise<void>;

	constructor(tokens:Token[], modeTransitions: ModeTransition[], actualStopOffset:number, endState:modes.IState) {
		this.tokens = tokens;
		this.modeTransitions = modeTransitions;
		this.actualStopOffset = actualStopOffset;
		this.endState = endState;
		this.retokenize = null;
	}
}

export function handleEvent<T>(context:modes.ILineContext, offset:number, runner:(modeId:string, newContext:modes.ILineContext, offset:number)=>T):T {
	var modeTransitions = context.modeTransitions;
	if (modeTransitions.length === 1) {
		return runner(modeTransitions[0].modeId, context, offset);
	}

	var modeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, offset);
	var nestedMode = modeTransitions[modeIndex].mode;
	var modeStartIndex = modeTransitions[modeIndex].startIndex;

	var firstTokenInModeIndex = context.findIndexOfOffset(modeStartIndex);
	var nextCharacterAfterModeIndex = -1;
	var nextTokenAfterMode = -1;
	if (modeIndex + 1 < modeTransitions.length) {
		nextTokenAfterMode = context.findIndexOfOffset(modeTransitions[modeIndex + 1].startIndex);
		nextCharacterAfterModeIndex = context.getTokenStartIndex(nextTokenAfterMode);
	} else {
		nextTokenAfterMode = context.getTokenCount();
		nextCharacterAfterModeIndex = context.getLineContent().length;
	}

	var firstTokenCharacterOffset = context.getTokenStartIndex(firstTokenInModeIndex);
	var newCtx = new FilteredLineContext(context, nestedMode, firstTokenInModeIndex, nextTokenAfterMode, firstTokenCharacterOffset, nextCharacterAfterModeIndex);
	return runner(nestedMode.getId(), newCtx, offset - firstTokenCharacterOffset);
}

export class FilteredLineContext implements modes.ILineContext {

	public modeTransitions: ModeTransition[];

	private _actual:modes.ILineContext;
	private _firstTokenInModeIndex:number;
	private _nextTokenAfterMode:number;
	private _firstTokenCharacterOffset:number;
	private _nextCharacterAfterModeIndex:number;

	constructor(actual:modes.ILineContext, mode:modes.IMode,
			firstTokenInModeIndex:number, nextTokenAfterMode:number,
			firstTokenCharacterOffset:number, nextCharacterAfterModeIndex:number) {

		this.modeTransitions = [new ModeTransition(0, mode)];
		this._actual = actual;
		this._firstTokenInModeIndex = firstTokenInModeIndex;
		this._nextTokenAfterMode = nextTokenAfterMode;
		this._firstTokenCharacterOffset = firstTokenCharacterOffset;
		this._nextCharacterAfterModeIndex = nextCharacterAfterModeIndex;
	}

	public getLineContent(): string {
		var actualLineContent = this._actual.getLineContent();
		return actualLineContent.substring(this._firstTokenCharacterOffset, this._nextCharacterAfterModeIndex);
	}

	public getTokenCount(): number {
		return this._nextTokenAfterMode - this._firstTokenInModeIndex;
	}

	public findIndexOfOffset(offset:number): number {
		return this._actual.findIndexOfOffset(offset + this._firstTokenCharacterOffset) - this._firstTokenInModeIndex;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return this._actual.getTokenStartIndex(tokenIndex + this._firstTokenInModeIndex) - this._firstTokenCharacterOffset;
	}

	public getTokenEndIndex(tokenIndex:number): number {
		return this._actual.getTokenEndIndex(tokenIndex + this._firstTokenInModeIndex) - this._firstTokenCharacterOffset;
	}

	public getTokenType(tokenIndex:number): string {
		return this._actual.getTokenType(tokenIndex + this._firstTokenInModeIndex);
	}

	public getTokenText(tokenIndex:number): string {
		return this._actual.getTokenText(tokenIndex + this._firstTokenInModeIndex);
	}
}

const IGNORE_IN_TOKENS = /\b(comment|string|regex)\b/;
export function ignoreBracketsInToken(tokenType:string): boolean {
	return IGNORE_IN_TOKENS.test(tokenType);
}

// TODO@Martin: find a better home for this code:
// TODO@Martin: modify suggestSupport to return a boolean if snippets should be presented or not
//       and turn this into a real registry
export class SnippetsRegistry {

	private static _defaultSnippets: { [modeId: string]: modes.ISuggestion[] } = Object.create(null);
	private static _snippets: { [modeId: string]: { [path: string]: modes.ISuggestion[] } } = Object.create(null);

	public static registerDefaultSnippets(modeId: string, snippets: modes.ISuggestion[]): void {
		this._defaultSnippets[modeId] = (this._defaultSnippets[modeId] || []).concat(snippets);
	}

	public static registerSnippets(modeId: string, path: string, snippets: modes.ISuggestion[]): void {
		let snippetsByMode = this._snippets[modeId];
		if (!snippetsByMode) {
			this._snippets[modeId] = snippetsByMode = {};
		}
		snippetsByMode[path] = snippets;
	}

	// the previous
	private static getNonWhitespacePrefix(model: IReadOnlyModel, position: IPosition) {
		let line = model.getLineContent(position.lineNumber);
		let match = line.match(/[^\s]+$/);
		if (match) {
			return match[0];
		}
		return '';
	}

	public static getSnippets(model: IReadOnlyModel, position: IPosition): modes.ISuggestResult {
		let word = model.getWordAtPosition(position);
		let currentWord = word ? word.word.substring(0, position.column - word.startColumn).toLowerCase() : '';
		let currentFullWord = SnippetsRegistry.getNonWhitespacePrefix(model, position).toLowerCase();
		let result : modes.ISuggestResult = {
			currentWord: currentWord,
			incomplete: currentWord.length === 0,
			suggestions: []
		};

		let modeId = model.getModeId();
		let snippets : modes.ISuggestion[]= [];
		let snipppetsByMode = this._snippets[modeId];
		if (snipppetsByMode) {
			for (let s in snipppetsByMode) {
				snippets = snippets.concat(snipppetsByMode[s]);
			}
		}
		let defaultSnippets = this._defaultSnippets[modeId];
		if (defaultSnippets) {
			snippets = snippets.concat(defaultSnippets);
		}
		// to avoid that snippets are too prominent in the intellisense proposals:
		// enforce that current word is matched or the position is after a whitespace
		snippets.forEach(p => {
			if (currentWord.length === 0 && currentFullWord.length === 0) {
				// if there's no prefix, only show snippets at the beginning of the line, or after a whitespace
			} else {
				let label = p.label.toLowerCase();
				// force that the current word or full word matches with the snippet prefix
				if (currentWord.length > 0 && strings.startsWith(label, currentWord)) {
					// ok
				} else if (currentFullWord.length > currentWord.length && strings.startsWith(label, currentFullWord)) {
					p = objects.clone(p);
					p.overwriteBefore = currentFullWord.length;
				} else {
					return;
				}
			}
			result.suggestions.push(p);
		});

		// if (result.suggestions.length > 0) {
		// 	if (word) {
		// 		// Push also the current word as first suggestion, to avoid unexpected snippet acceptance on Enter.
		// 		result.suggestions = result.suggestions.slice(0);
		// 		result.suggestions.unshift({
		// 			codeSnippet: word.word,
		// 			label: word.word,
		// 			type: 'text'
		// 		});
		// 	}
		// 	result.incomplete = true;
		// }

		return result;

	}


}
