/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {Arrays} from 'vs/editor/common/core/arrays';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';

export class Token implements modes.IToken {
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

export function handleEvent<T>(context:modes.ILineContext, offset:number, runner:(mode:modes.IMode, newContext:modes.ILineContext, offset:number)=>T):T {
	var modeTransitions = context.modeTransitions;
	if (modeTransitions.length === 1) {
		return runner(modeTransitions[0].mode, context, offset);
	}

	var modeIndex = Arrays.findIndexInSegmentsArray(modeTransitions, offset);
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
	return runner(nestedMode, newCtx, offset - firstTokenCharacterOffset);
}

/**
 * Returns {{true}} if the line token at the specified
 * offset matches one of the provided types. Matching
 * happens on a substring start from the end, unless
 * anywhereInToken is set to true in which case matches
 * happen on a substring at any position.
 */
export function isLineToken(context:modes.ILineContext, offset:number, types:string[], anywhereInToken:boolean = false):boolean {

	if (!Array.isArray(types) || types.length === 0) {
		return false;
	}

	if (context.getLineContent().length <= offset) {
		return false;
	}

	var tokenIdx = context.findIndexOfOffset(offset);
	var type = context.getTokenType(tokenIdx);

	for (var i = 0, len = types.length; i < len; i++) {
		if (anywhereInToken) {
			if (type.indexOf(types[i]) >= 0) {
				return true;
			}
		}
		else {
			if (strings.endsWith(type, types[i])) {
				return true;
			}
		}
	}

	return false;
}

export class FilteredLineContext implements modes.ILineContext {

	public modeTransitions: modes.IModeTransition[];

	private _actual:modes.ILineContext;
	private _firstTokenInModeIndex:number;
	private _nextTokenAfterMode:number;
	private _firstTokenCharacterOffset:number;
	private _nextCharacterAfterModeIndex:number;

	constructor(actual:modes.ILineContext, mode:modes.IMode,
			firstTokenInModeIndex:number, nextTokenAfterMode:number,
			firstTokenCharacterOffset:number, nextCharacterAfterModeIndex:number) {

		this.modeTransitions = [{
			startIndex: 0,
			mode: mode
		}];
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

export function ignoreBracketsInToken(tokenType:string): boolean {
	return /\b(comment|string|regex)\b/.test(tokenType);
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

	public static getSnippets(model: IModel, position: IPosition): modes.ISuggestResult {
		let word = model.getWordAtPosition(position);
		let currentPrefix = word ? word.word.substring(0, position.column - word.startColumn) : '';
		let result : modes.ISuggestResult = {
			currentWord: currentPrefix,
			suggestions: []
		};

		// to avoid that snippets are too prominent in the intellisense proposals:
		// - force that the current prefix matches with the snippet prefix
		// if there's no prfix, only show snippets at the beginning of the line, or after a whitespace
		let filter = null;
		if (currentPrefix.length === 0) {
			if (position.column > 1) {
				let previousCharacter = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column - 1, endLineNumber: position.lineNumber, endColumn: position.column });
				if (previousCharacter.trim().length !== 0) {
					return result;
				}
			}
		} else {
			let lowerCasePrefix = currentPrefix.toLowerCase();
			filter = (p: modes.ISuggestion) => {
				return strings.startsWith(p.label.toLowerCase(), lowerCasePrefix);
			};
		}

		let modeId = model.getMode().getId();
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
		result.suggestions = filter ? snippets.filter(filter) : snippets;

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
