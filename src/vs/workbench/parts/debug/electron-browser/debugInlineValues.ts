/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDecorationOptions, IModel } from 'vs/editor/common/editorCommon';
import { StandardTokenType } from 'vs/editor/common/modes';
import { IExpression } from 'vs/workbench/parts/debug/common/debug';

export const MAX_INLINE_VALUE_LENGTH = 50; // Max string length of each inline 'x = y' string. If exceeded ... is added
export const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
export const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
export const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped
// LanguageConfigurationRegistry.getWordDefinition() return regexes that allow spaces and punctuation characters for languages like python
// Using that approach is not viable so we are using a simple regex to look for word tokens.
export const WORD_REGEXP = /[\$\_A-Za-z][\$\_A-Za-z0-9]*/g;

export function toNameValueMap(expressions: IExpression[]): Map<string, string> {
	const result = new Map<string, string>();
	let valueCount = 0;

	for (let expr of expressions) {
		// Put ellipses in value if its too long. Preserve last char e.g "longstr…" or {a:true, b:true, …}
		let value = expr.value;
		if (value && value.length > MAX_INLINE_VALUE_LENGTH) {
			value = value.substr(0, MAX_INLINE_VALUE_LENGTH) + '…' + value[value.length - 1];
		}

		result.set(expr.name, value);

		// Limit the size of map. Too large can have a perf impact
		if (++valueCount >= MAX_NUM_INLINE_VALUES) {
			break;
		}
	}

	return result;
}

export function getDecorations(nameValueMap: Map<string, string>, wordToLineNumbersMap: Map<string, number[]>): IDecorationOptions[] {
	const lineToNamesMap: Map<number, string[]> = new Map<number, string[]>();
	const decorations: IDecorationOptions[] = [];

	// Compute unique set of names on each line
	nameValueMap.forEach((value, name) => {
		if (wordToLineNumbersMap.has(name)) {
			for (let lineNumber of wordToLineNumbersMap.get(name)) {
				if (!lineToNamesMap.has(lineNumber)) {
					lineToNamesMap.set(lineNumber, []);
				}

				lineToNamesMap.get(lineNumber).push(name);
			}
		}
	});

	// Compute decorators for each line
	lineToNamesMap.forEach((names, line) => {
		// Wrap with 1em unicode space for readability
		const contentText = '\u2003' + names.map(name => `${name} = ${nameValueMap.get(name)}`).join(', ') + '\u2003';
		decorations.push(createDecoration(line, contentText));
	});

	return decorations;
}

function createDecoration(lineNumber: number, contentText: string): IDecorationOptions {
	const margin = '10px';
	const backgroundColor = 'rgba(255, 200, 0, 0.2)';
	const lightForegroundColor = 'rgba(0, 0, 0, 0.5)';
	const darkForegroundColor = 'rgba(255, 255, 255, 0.5)';

	// If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
	if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
		contentText = contentText.substr(0, MAX_INLINE_DECORATOR_LENGTH) + '...';
	}

	return {
		range: {
			startLineNumber: lineNumber,
			endLineNumber: lineNumber,
			startColumn: Number.MAX_VALUE,
			endColumn: Number.MAX_VALUE
		},
		renderOptions: {
			dark: {
				after: {
					contentText,
					backgroundColor,
					color: darkForegroundColor,
					margin
				}
			},
			light: {
				after: {
					contentText,
					backgroundColor,
					color: lightForegroundColor,
					margin
				}
			}
		}
	};
}

export function getWordToLineNumbersMap(model: IModel): Map<string, number[]> {
	const result = new Map<string, number[]>();

	// For every word in every line, map its ranges for fast lookup
	for (let lineNumber = 1, len = model.getLineCount(); lineNumber <= len; ++lineNumber) {
		const lineContent = model.getLineContent(lineNumber);

		// If line is too long then skip the line
		if (lineContent.length > MAX_TOKENIZATION_LINE_LEN) {
			continue;
		}

		const lineTokens = model.getLineTokens(lineNumber);
		for (let token = lineTokens.firstToken(); !!token; token = token.next()) {
			const tokenStr = lineContent.substring(token.startOffset, token.endOffset);

			// Token is a word and not a comment
			if (token.tokenType === StandardTokenType.Other) {
				WORD_REGEXP.lastIndex = 0; // We assume tokens will usually map 1:1 to words if they match
				const wordMatch = WORD_REGEXP.exec(tokenStr);

				if (wordMatch) {
					const word = wordMatch[0];
					if (!result.has(word)) {
						result.set(word, []);
					}

					result.get(word).push(lineNumber);
				}
			}
		}
	}

	return result;
}
