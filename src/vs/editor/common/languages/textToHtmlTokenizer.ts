/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { IViewLineTokens, LineTokens } from '../tokens/lineTokens.js';
import { ILanguageIdCodec, IState, ITokenizationSupport, TokenizationRegistry } from '../languages.js';
import { LanguageId } from '../encodedTokenAttributes.js';
import { NullState, nullTokenizeEncoded } from './nullTokenize.js';
import { ILanguageService } from './language.js';

export type IReducedTokenizationSupport = Omit<ITokenizationSupport, 'tokenize'>;

const fallback: IReducedTokenizationSupport = {
	getInitialState: () => NullState,
	tokenizeEncoded: (buffer: string, hasEOL: boolean, state: IState) => nullTokenizeEncoded(LanguageId.Null, state)
};

export function tokenizeToStringSync(languageService: ILanguageService, text: string, languageId: string): string {
	return _tokenizeToString(text, languageService.languageIdCodec, TokenizationRegistry.get(languageId) || fallback);
}

export async function tokenizeToString(languageService: ILanguageService, text: string, languageId: string | null): Promise<string> {
	if (!languageId) {
		return _tokenizeToString(text, languageService.languageIdCodec, fallback);
	}
	const tokenizationSupport = await TokenizationRegistry.getOrCreate(languageId);
	return _tokenizeToString(text, languageService.languageIdCodec, tokenizationSupport || fallback);
}

export function tokenizeLineToHTML(text: string, viewLineTokens: IViewLineTokens, colorMap: string[], startOffset: number, endOffset: number, tabSize: number, useNbsp: boolean): string {
	let result = `<div>`;
	let charIndex = startOffset;
	let tabsCharDelta = 0;

	let prevIsSpace = true;

	for (let tokenIndex = 0, tokenCount = viewLineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
		const tokenEndIndex = viewLineTokens.getEndOffset(tokenIndex);

		if (tokenEndIndex <= startOffset) {
			continue;
		}

		let partContent = '';

		for (; charIndex < tokenEndIndex && charIndex < endOffset; charIndex++) {
			const charCode = text.charCodeAt(charIndex);

			switch (charCode) {
				case CharCode.Tab: {
					let insertSpacesCount = tabSize - (charIndex + tabsCharDelta) % tabSize;
					tabsCharDelta += insertSpacesCount - 1;
					while (insertSpacesCount > 0) {
						if (useNbsp && prevIsSpace) {
							partContent += '&#160;';
							prevIsSpace = false;
						} else {
							partContent += ' ';
							prevIsSpace = true;
						}
						insertSpacesCount--;
					}
					break;
				}
				case CharCode.LessThan:
					partContent += '&lt;';
					prevIsSpace = false;
					break;

				case CharCode.GreaterThan:
					partContent += '&gt;';
					prevIsSpace = false;
					break;

				case CharCode.Ampersand:
					partContent += '&amp;';
					prevIsSpace = false;
					break;

				case CharCode.Null:
					partContent += '&#00;';
					prevIsSpace = false;
					break;

				case CharCode.UTF8_BOM:
				case CharCode.LINE_SEPARATOR:
				case CharCode.PARAGRAPH_SEPARATOR:
				case CharCode.NEXT_LINE:
					partContent += '\ufffd';
					prevIsSpace = false;
					break;

				case CharCode.CarriageReturn:
					// zero width space, because carriage return would introduce a line break
					partContent += '&#8203';
					prevIsSpace = false;
					break;

				case CharCode.Space:
					if (useNbsp && prevIsSpace) {
						partContent += '&#160;';
						prevIsSpace = false;
					} else {
						partContent += ' ';
						prevIsSpace = true;
					}
					break;

				default:
					partContent += String.fromCharCode(charCode);
					prevIsSpace = false;
			}
		}

		result += `<span style="${viewLineTokens.getInlineStyle(tokenIndex, colorMap)}">${partContent}</span>`;

		if (tokenEndIndex > endOffset || charIndex >= endOffset) {
			break;
		}
	}

	result += `</div>`;
	return result;
}

export function _tokenizeToString(text: string, languageIdCodec: ILanguageIdCodec, tokenizationSupport: IReducedTokenizationSupport): string {
	let result = `<div class="monaco-tokenized-source">`;
	const lines = strings.splitLines(text);
	let currentState = tokenizationSupport.getInitialState();
	for (let i = 0, len = lines.length; i < len; i++) {
		const line = lines[i];

		if (i > 0) {
			result += `<br/>`;
		}

		const tokenizationResult = tokenizationSupport.tokenizeEncoded(line, true, currentState);
		LineTokens.convertToEndOffset(tokenizationResult.tokens, line.length);
		const lineTokens = new LineTokens(tokenizationResult.tokens, line, languageIdCodec);
		const viewLineTokens = lineTokens.inflate();

		let startOffset = 0;
		for (let j = 0, lenJ = viewLineTokens.getCount(); j < lenJ; j++) {
			const type = viewLineTokens.getClassName(j);
			const endIndex = viewLineTokens.getEndOffset(j);
			result += `<span class="${type}">${strings.escape(line.substring(startOffset, endIndex))}</span>`;
			startOffset = endIndex;
		}

		currentState = tokenizationResult.endState;
	}

	result += `</div>`;
	return result;
}
