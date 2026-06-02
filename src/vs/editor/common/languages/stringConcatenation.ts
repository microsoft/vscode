/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { ITextModel } from '../model.js';
import { StringConcatenationOnEnterAction } from './languageConfiguration.js';
import { StandardTokenType } from '../encodedTokenAttributes.js';

const DOUBLE_QUOTE = String.fromCharCode(34); // "
const SINGLE_QUOTE = String.fromCharCode(39); // '



export function getStringConcatenation(
	model: ITextModel,
	range: Range,
	enabled: boolean,
	excludedPatterns: string[],
): StringConcatenationOnEnterAction | null {

	if (!enabled) {
		return null;
	}

	/* we must not apply the string concatenation feature on the excluded patterns */
	const lineText = model.getLineContent(range.startLineNumber);

	let isExcluded = false;

	for (let i = 0; i < excludedPatterns.length; i++) {
		const pattern = new RegExp(excludedPatterns[i]);

		const matches = pattern.test(lineText);

		if (matches) {
			isExcluded = true;
			break;
		}
	}

	if (isExcluded) {
		return null;
	}


	const beforeEnterText = lineText.substring(0, range.startColumn - 1);
	const afterEnterText = lineText.substring(range.endColumn - 1);
	const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);

	model.tokenization.forceTokenization(range.startLineNumber);
	const lineTokens = model.tokenization.getLineTokens(range.startLineNumber);
	const tokenIndex = lineTokens.findTokenIndexAtOffset(range.startColumn - 1);

	if (lineTokens.getStandardTokenType(tokenIndex) !== StandardTokenType.String) {
		return null;
	}

	const operator = getStringConcatenationOperator(languageId);
	if (operator === null) {
		return null;
	}

	const quote = detectOpeningQuote(lineText, range.startColumn - 1);

	const beforeText = beforeEnterText + quote;
	const afterText = operator + quote + afterEnterText;

	return {
		beforeText: beforeText,
		afterText: afterText
	};
}

function detectOpeningQuote(lineText: string, cursorOffset: number): string {
	for (let i = cursorOffset - 1; i >= 0; i--) {
		const ch = lineText[i];

		if (ch === DOUBLE_QUOTE || ch === SINGLE_QUOTE) {
			const isEscaped = i > 0 && lineText[i - 1].charCodeAt(0) === 92;

			if (!isEscaped) {
				return ch;
			}
		}
	}

	return DOUBLE_QUOTE;
}

function getStringConcatenationOperator(languageId: string): string | null {
	switch (languageId) {
		// '+ ' operator
		case 'c':
		case 'cpp':
		case 'csharp':
		case 'dart':
		case 'go':
		case 'groovy':
		case 'java':
		case 'javascript':
		case 'javascriptreact':
		case 'julia':
		case 'kotlin':
		case 'r':
		case 'scala':
		case 'swift':
		case 'typescript':
		case 'typescriptreact':
			return '+ ';

		// '. ' operator
		case 'perl':
		case 'perl6':
		case 'php':
			return '. ';

		// ' ..' operator
		case 'lua':
			return '.. ';

		// ' <>' operator
		case 'elixir':
			return '<> ';

		// ' ++' operator
		case 'erlang':
		case 'haskell':
			return '++ ';

		// ' ~' operator
		case 'd':
			return '~ ';

		// '& ' operator
		case 'vb':              // Visual Basic .NET
			return '& ';

		// '|| ' operator
		// SQL dialects that support standard || concat
		case 'sql':
			return '|| ';

		// implicit / adjacency (empty operator, just newline)
		// These languages concat string literals by placing them next to
		// each other — no operator needed between literals
		case 'python':
		case 'coffeescript':
			return '';


		case 'rust':

		case 'ruby':
		// Ruby has + and <<, but splitting a literal mid-line is not idiomatic;
		// the backslash continuation is fragile. Return null to skip.
		case 'shellscript':
		case 'powershell':
		case 'fsharp':
		case 'ocaml':
		case 'markdown':
		case 'html':
		case 'css':
		case 'scss':
		case 'less':
		case 'json':
		case 'jsonc':
		case 'xml':
		case 'yaml':

		default:
			return null;
	}
}
