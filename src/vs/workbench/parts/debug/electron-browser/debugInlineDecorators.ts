/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IStringDictionary } from 'vs/base/common/collections';
import { IDecorationOptions, IRange, IModel } from 'vs/editor/common/editorCommon';
import { StandardTokenType } from 'vs/editor/common/modes';
import { IExpression } from 'vs/workbench/parts/debug/common/debug';

export const MAX_INLINE_VALUE_LENGTH = 50; // Max string length of each inline 'x = y' string. If exceeded ... is added
export const MAX_INLINE_DECORATOR_LENGTH = 150; // Max string length of each inline decorator when debugging. If exceeded ... is added
export const MAX_NUM_INLINE_VALUES = 100; // JS Global scope can have 700+ entries. We want to limit ourselves for perf reasons
export const MAX_TOKENIZATION_LINE_LEN = 500; // If line is too long, then inline values for the line are skipped
export const ELLIPSES = '…';
// LanguageConfigurationRegistry.getWordDefinition() return regexes that allow spaces and punctuation characters for languages like python
// Using that approach is not viable so we are using a simple regex to look for word tokens.
export const WORD_REGEXP = /[\$\_A-Za-z][\$\_A-Za-z0-9]*/g;

export function getNameValueMapFromScopeChildren(expressions: IExpression[]): IStringDictionary<string> {
	const nameValueMap: IStringDictionary<string> = Object.create(null);
	let valueCount = 0;

	for (let expr of expressions) {
		// Put ellipses in value if its too long. Preserve last char e.g "longstr…" or {a:true, b:true, …}
		let value = expr.value;
		if (value && value.length > MAX_INLINE_VALUE_LENGTH) {
			value = value.substr(0, MAX_INLINE_VALUE_LENGTH - ELLIPSES.length) + ELLIPSES + value[value.length - 1];
		}

		nameValueMap[expr.name] = value;

		// Limit the size of map. Too large can have a perf impact
		if (++valueCount >= MAX_NUM_INLINE_VALUES) {
			break;
		}
	}

	return nameValueMap;
}

export function getDecorators(nameValueMap: IStringDictionary<string>, wordRangeMap: IStringDictionary<IRange[]>, linesContent: string[]): IDecorationOptions[] {
	const linesNames: IStringDictionary<IStringDictionary<boolean>> = Object.create(null);
	const names = Object.keys(nameValueMap);
	const decorators: IDecorationOptions[] = [];

	// Compute unique set of names on each line
	for (let name of names) {
		const ranges = wordRangeMap[name];
		if (ranges) {
			for (let range of ranges) {
				const lineNum = range.startLineNumber;
				if (!linesNames[lineNum]) {
					linesNames[lineNum] = Object.create(null);
				}
				linesNames[lineNum][name] = true;
			}
		}
	}

	// Compute decorators for each line
	const lineNums = Object.keys(linesNames);
	for (let lineNum of lineNums) {
		const uniqueNames = Object.keys(linesNames[lineNum]);
		const decorator = getDecoratorFromNames(parseInt(lineNum), uniqueNames, nameValueMap, linesContent);
		decorators.push(decorator);
	}

	return decorators;
}

export function getDecoratorFromNames(lineNumber: number, names: string[], nameValueMap: IStringDictionary<string>, linesContent: string[]): IDecorationOptions {
	const margin = '10px';
	const backgroundColor = 'rgba(255,200,0,0.2)';
	const lightForegroundColor = 'rgba(0,0,0,0.5)';
	const darkForegroundColor = 'rgba(255,255,255,0.5)';
	const lineLength = linesContent[lineNumber - 1].length;

	// Wrap with 1em unicode space for readability
	let contentText = '\u2003' + names.map(n => `${n} = ${nameValueMap[n]}`).join(', ') + '\u2003';

	// If decoratorText is too long, trim and add ellipses. This could happen for minified files with everything on a single line
	if (contentText.length > MAX_INLINE_DECORATOR_LENGTH) {
		contentText = contentText.substr(0, MAX_INLINE_DECORATOR_LENGTH - ELLIPSES.length) + ELLIPSES;
	}

	const decorator: IDecorationOptions = {
		range: {
			startLineNumber: lineNumber,
			endLineNumber: lineNumber,
			startColumn: lineLength,
			endColumn: lineLength + 1
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

	return decorator;
}

export function getEditorWordRangeMap(editorModel: IModel): IStringDictionary<IRange[]> {
	const wordRangeMap: IStringDictionary<IRange[]> = Object.create(null);
	const linesContent = editorModel.getLinesContent();

	// For every word in every line, map its ranges for fast lookup
	for (let i = 0, len = linesContent.length; i < len; ++i) {
		const lineContent = linesContent[i];

		// If line is too long then skip the line
		if (lineContent.length > MAX_TOKENIZATION_LINE_LEN) {
			continue;
		}

		const lineTokens = editorModel.getLineTokens(i + 1); // lineNumbers are 1 based

		for (let j = 0, len = lineTokens.getTokenCount(); j < len; ++j) {
			let startOffset = lineTokens.getTokenStartOffset(j);
			let endOffset = lineTokens.getTokenEndOffset(j);
			const tokenStr = lineContent.substring(startOffset, endOffset);

			// Token is a word and not a comment
			if (lineTokens.getStandardTokenType(j) !== StandardTokenType.Comment) {
				WORD_REGEXP.lastIndex = 0; // We assume tokens will usually map 1:1 to words if they match
				const wordMatch = WORD_REGEXP.exec(tokenStr);

				if (wordMatch) {
					const word = wordMatch[0];
					startOffset += wordMatch.index;
					endOffset = startOffset + word.length;

					const range: IRange = {
						startColumn: startOffset + 1, // Line and columns are 1 based
						endColumn: endOffset + 1,
						startLineNumber: i + 1,
						endLineNumber: i + 1
					};

					if (!wordRangeMap[word]) {
						wordRangeMap[word] = [];
					}

					wordRangeMap[word].push(range);
				}
			}
		}
	}

	return wordRangeMap;
}
