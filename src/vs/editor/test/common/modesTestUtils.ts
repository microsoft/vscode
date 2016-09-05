/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Arrays} from 'vs/editor/common/core/arrays';
import * as modes from 'vs/editor/common/modes';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {Token} from 'vs/editor/common/core/token';

export interface TokenText {
	text: string;
	type: string;
}

export function createLineContextFromTokenText(tokens: TokenText[]): modes.ILineContext {
	let line = '';
	let processedTokens: Token[] = [];

	let indexSoFar = 0;
	for (let i = 0; i < tokens.length; ++i){
		processedTokens.push(new Token(indexSoFar, tokens[i].type));
		line += tokens[i].text;
		indexSoFar += tokens[i].text.length;
	}

	return new TestLineContext(line, processedTokens, null);
}

export function createMockLineContext(line:string, tokens:modes.ILineTokens): modes.ILineContext {
	return new TestLineContext(line, tokens.tokens, tokens.modeTransitions);
}

class TestLineContext implements modes.ILineContext {

	public modeTransitions: ModeTransition[];
	private _line:string;
	private _tokens: Token[];

	constructor(line:string, tokens: Token[], modeTransitions:ModeTransition[]) {
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

	public getTokenType(tokenIndex:number): string {
		return this._tokens[tokenIndex].type;
	}

	public findIndexOfOffset(offset:number): number {
		return Arrays.findIndexInSegmentsArray(this._tokens, offset);
	}
}