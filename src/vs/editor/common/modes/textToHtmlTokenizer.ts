/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { IState, ITokenizationSupport, TokenizationRegistry, LanguageId } from 'vs/editor/common/modes';
import { NULL_STATE, nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';

export function tokenizeToString(text: string, languageId: string): string {
	return _tokenizeToString(text, _getSafeTokenizationSupport(languageId));
}

function _getSafeTokenizationSupport(languageId: string): ITokenizationSupport {
	let tokenizationSupport = TokenizationRegistry.get(languageId);
	if (tokenizationSupport) {
		return tokenizationSupport;
	}
	return {
		getInitialState: () => NULL_STATE,
		tokenize: undefined,
		tokenize2: (buffer: string, state: IState, deltaOffset: number) => nullTokenize2(LanguageId.Null, buffer, state, deltaOffset)
	};
}

function _tokenizeToString(text: string, tokenizationSupport: ITokenizationSupport): string {
	let result = `<div class="monaco-tokenized-source">`;
	let lines = text.split(/\r\n|\r|\n/);
	let currentState = tokenizationSupport.getInitialState();
	for (let i = 0, len = lines.length; i < len; i++) {
		let line = lines[i];

		if (i > 0) {
			result += `<br/>`;
		}

		let tokenizationResult = tokenizationSupport.tokenize2(line, currentState, 0);
		let lineTokens = new LineTokens(null, tokenizationResult.tokens, line);
		let viewLineTokens = lineTokens.inflate();

		let startOffset = 0;
		for (let j = 0, lenJ = viewLineTokens.length; j < lenJ; j++) {
			const viewLineToken = viewLineTokens[j];
			result += `<span class="${viewLineToken.type}">${strings.escape(line.substring(startOffset, viewLineToken.endIndex))}</span>`;
			startOffset = viewLineToken.endIndex;
		}

		currentState = tokenizationResult.endState;
	}

	result += `</div>`;
	return result;
}
