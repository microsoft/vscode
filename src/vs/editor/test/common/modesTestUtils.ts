/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { TokensBinaryEncoding, TokensInflatorMap } from 'vs/editor/common/model/tokensBinaryEncoding';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/modes/supports';

export function createFakeLineTokens(line: string, modeId: string, tokens: Token[], modeTransitions: ModeTransition[]): LineTokens {
	let map = new TokensInflatorMap(modeId);
	let deflatedTokens = TokensBinaryEncoding.deflateArr(map, tokens);
	return new LineTokens(map, deflatedTokens, modeTransitions, line);
}

export interface TokenText {
	text: string;
	type: string;
}

export function createFakeScopedLineTokens(modeId: string, tokens: TokenText[]): ScopedLineTokens {
	return createScopedLineTokens(createLineContextFromTokenText(modeId, tokens), 0);
}

function createLineContextFromTokenText(modeId: string, tokens: TokenText[]): LineTokens {
	let line = '';
	let processedTokens: Token[] = [];

	let indexSoFar = 0;
	for (let i = 0; i < tokens.length; ++i) {
		processedTokens.push(new Token(indexSoFar, tokens[i].type));
		line += tokens[i].text;
		indexSoFar += tokens[i].text.length;
	}

	return createFakeLineTokens(line, modeId, processedTokens, [new ModeTransition(0, modeId)]);
}
