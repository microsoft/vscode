/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { Brackets } from 'vs/editor/common/modes/supports/electricCharacter';
import { createFakeLineTokens } from 'vs/editor/test/common/modesTestUtils';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { Token } from 'vs/editor/common/core/token';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/modes/supports';

interface TokenText {
	text: string;
	type: string;
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

function createScopedLineTokensFromTokenText(modeId: string, tokens: TokenText[]): ScopedLineTokens {
	return createScopedLineTokens(createLineContextFromTokenText(modeId, tokens), 0);
}

suite('Editor Modes - Auto Indentation', () => {
	test('Doc comments', () => {
		var brackets = new Brackets(null, [{ open: '/**', close: ' */' }]);

		assert.equal(brackets.onElectricCharacter(createScopedLineTokensFromTokenText('test', [
			{ text: '/**', type: 'doc' },
		]), 2).appendText, ' */');
		assert.equal(brackets.onElectricCharacter(createScopedLineTokensFromTokenText('test', [
			{ text: '/**', type: 'doc' },
			{ text: ' ', type: 'doc' },
			{ text: '*/', type: 'doc' },
		]), 2), null);
	});
});
