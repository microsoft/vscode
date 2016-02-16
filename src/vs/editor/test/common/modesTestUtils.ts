/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Modes = require('vs/editor/common/modes');
import {Arrays} from 'vs/editor/common/core/arrays';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';

class SimpleTokenTypeClassificationMode implements Modes.IMode {

	private _id:string;

	public richEditSupport: Modes.IRichEditSupport;

	constructor(id:string, wordRegExp:RegExp) {
		this._id = id;
		this.richEditSupport = new RichEditSupport(this._id, {
			wordPattern: wordRegExp
		});
	}

	public getId(): string {
		return this._id;
	}

	public toSimplifiedMode(): Modes.IMode {
		return this;
	}
}

export function createMockMode(id:string, wordRegExp:RegExp = null):Modes.IMode {
	return new SimpleTokenTypeClassificationMode(id, wordRegExp);
}

export interface TokenText {
	text: string;
	type: string;
	bracket?: Modes.Bracket;
}

export function createLineContextFromTokenText(tokens: TokenText[]): Modes.ILineContext {
	var line = '';
	var processedTokens: Modes.IToken[] = [];

	var indexSoFar = 0;
	for (var i = 0; i < tokens.length; ++i){
		processedTokens.push({ startIndex: indexSoFar, type: tokens[i].type });
		line += tokens[i].text;
		indexSoFar += tokens[i].text.length;
	}

	return new TestLineContext(line, processedTokens, null);
}

export function createLineContext(line:string, tokens:Modes.ILineTokens): Modes.ILineContext {
	return new TestLineContext(line, tokens.tokens, tokens.modeTransitions);
}

class TestLineContext implements Modes.ILineContext {

	public modeTransitions: Modes.IModeTransition[];
	private _line:string;
	private _tokens: Modes.IToken[];

	constructor(line:string, tokens: Modes.IToken[], modeTransitions:Modes.IModeTransition[]) {
		this.modeTransitions = modeTransitions;
		this._line = line;
		this._tokens = tokens;
	}

	public getLineContent(): string {
		return this._line;
	}

	public getTokenCount(): number {
		return this._tokens.length;
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return this._tokens[tokenIndex].startIndex;
	}

	public getTokenEndIndex(tokenIndex:number): number {
		if (tokenIndex + 1 < this._tokens.length) {
			return this._tokens[tokenIndex + 1].startIndex;
		}
		return this._line.length;
	}

	public getTokenType(tokenIndex:number): string {
		return this._tokens[tokenIndex].type;
	}

	public findIndexOfOffset(offset:number): number {
		return Arrays.findIndexInSegmentsArray(this._tokens, offset);
	}

	public getTokenText(tokenIndex:number): string {
		var startIndex = this._tokens[tokenIndex].startIndex;
		var endIndex = tokenIndex + 1 < this._tokens.length ? this._tokens[tokenIndex + 1].startIndex : this._line.length;
		return this._line.substring(startIndex, endIndex);
	}
}