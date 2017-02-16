/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { IState, ITokenizationSupport, TokenizationRegistry, LanguageId } from 'vs/editor/common/modes';
import { NULL_STATE, nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { CharCode } from 'vs/base/common/charCode';
import { ViewLineToken } from 'vs/editor/common/core/viewLineToken';

export function tokenizeToString(text: string, languageId: string): string {
	return _tokenizeToString(text, _getSafeTokenizationSupport(languageId));
}

export function tokenizeLineToHTML(text: string, viewLineTokens: ViewLineToken[], rules: { [key: string]: string }, options: { startOffset: number, endOffset: number, tabSize: number }): string {
	let tabSize = options.tabSize;
	let result = `<div>`;
	let charIndex = options.startOffset;
	let tabsCharDelta = 0;

	for (let tokenIndex = 0, lenJ = viewLineTokens.length; tokenIndex < lenJ; tokenIndex++) {
		const token = viewLineTokens[tokenIndex];
		const tokenEndIndex = token.endIndex;

		if (token.endIndex < options.startOffset) {
			continue;
		}

		const tokenType = token.type;
		let partContentCnt = 0;
		let partContent = '';

		for (; charIndex < tokenEndIndex && charIndex < options.endOffset; charIndex++) {
			const charCode = text.charCodeAt(charIndex);

			switch (charCode) {
				case CharCode.Tab:
					let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
					tabsCharDelta += insertSpacesCount - 1;
					while (insertSpacesCount > 0) {
						partContent += '&nbsp;';
						partContentCnt++;
						insertSpacesCount--;
					}
					break;

				case CharCode.Space:
					partContent += '&nbsp;';
					partContentCnt++;
					break;

				case CharCode.LessThan:
					partContent += '&lt;';
					partContentCnt++;
					break;

				case CharCode.GreaterThan:
					partContent += '&gt;';
					partContentCnt++;
					break;

				case CharCode.Ampersand:
					partContent += '&amp;';
					partContentCnt++;
					break;

				case CharCode.Null:
					partContent += '&#00;';
					partContentCnt++;
					break;

				case CharCode.UTF8_BOM:
				case CharCode.LINE_SEPARATOR_2028:
					partContent += '\ufffd';
					partContentCnt++;
					break;

				case CharCode.CarriageReturn:
					// zero width space, because carriage return would introduce a line break
					partContent += '&#8203';
					partContentCnt++;
					break;

				default:
					partContent += String.fromCharCode(charCode);
					partContentCnt++;
			}
		}

		// TODO: adopt new view line tokens.
		let style = tokenType.split(' ').map(type => rules[type]).join('');
		result += `<span style="${style}">${partContent}</span>`;

		if (token.endIndex > options.endOffset) {
			break;
		}
	}

	result += `</div>`;
	return result;
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
