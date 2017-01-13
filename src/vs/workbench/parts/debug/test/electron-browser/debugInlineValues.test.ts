/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
// import { Model as EditorModel } from 'vs/editor/common/model/model';
// import { IModel } from 'vs/editor/common/editorCommon';
import { StandardTokenType } from 'vs/editor/common/modes';
// import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { IExpression } from 'vs/workbench/parts/debug/common/debug';
import * as inlineValues from 'vs/workbench/parts/debug/electron-browser/debugInlineValues';

// Test data
// const testLine = 'function doit(everything, is, awesome, awesome, when, youre, part, of, a, team){}';
const testNameValueMap = new Map<string, string>();

setup(() => {
	testNameValueMap.set('everything', '{emmet: true, batman: true, legoUniverse: true}');
	testNameValueMap.set('is', '15');
	testNameValueMap.set('awesome', '"aweeeeeeeeeeeeeeeeeeeeeeeeeeeeeeesome…"');
	testNameValueMap.set('when', 'true');
	testNameValueMap.set('youre', '"Yes I mean you"');
	testNameValueMap.set('part', '"𝄞 ♪ ♫"');
});

suite('Debug - Inline Value Decorators', () => {
	test('getNameValueMapFromScopeChildren trims long values', () => {
		const expressions = [
			createExpression('hello', 'world'),
			createExpression('blah', createLongString())
		];

		const nameValueMap = inlineValues.toNameValueMap(expressions);
		const expectedNameValueMap = new Map<string, string>();
		expectedNameValueMap.set('hello', 'world');
		expectedNameValueMap.set('blah', '"blah blah blah blah blah blah blah blah blah blah…"');

		// Ensure blah is capped and ellipses added
		assert.deepEqual(nameValueMap, expectedNameValueMap);
	});

	test('getNameValueMapFromScopeChildren caps scopes to a MAX_NUM_INLINE_VALUES limit', () => {
		const scopeChildren: IExpression[][] = new Array(5);
		const expectedNameValueMap: Map<string, string> = new Map<string, string>();

		// 10 Stack Frames with a 100 scope expressions each
		// JS Global Scope has 700+ expressions so this is close to a real world scenario
		for (let i = 0; i < scopeChildren.length; i++) {
			const expressions = new Array(50);

			for (let j = 0; j < expressions.length; ++j) {
				const name = `name${i}.${j}`;
				const val = `val${i}.${j}`;
				expressions[j] = createExpression(name, val);

				if ((i * expressions.length + j) < inlineValues.MAX_NUM_INLINE_VALUES) {
					expectedNameValueMap.set(name, val);
				}
			}

			scopeChildren[i] = expressions;
		}

		const expressions = [].concat.apply([], scopeChildren);
		const nameValueMap = inlineValues.toNameValueMap(expressions);

		assert.deepEqual(nameValueMap, expectedNameValueMap);
	});

	// test('getDecorators returns correct decorator afterText', () => {
	// 	const lineContent = 'console.log(everything, part, part);'; // part shouldn't be duplicated
	// 	const lineNumber = 1;
	// 	const wordToLinesMap = getWordToLineMap(lineNumber, lineContent);
	// 	const decorators = inlineValues.getDecorations(testNameValueMap, wordToLinesMap);
	// 	const expectedDecoratorText = ' everything = {emmet: true, batman: true, legoUniverse: true}, part = "𝄞 ♪ ♫" ';
	// 	assert.equal(decorators[0].renderOptions.dark.after.contentText, expectedDecoratorText);
	// });

	// test('getEditorWordRangeMap ignores comments and long lines', () => {
	// 	const expectedWords = 'function, doit, everything, is, awesome, when, youre, part, of, a, team'.split(', ');
	// 	const editorModel = EditorModel.createFromString(`/** Copyright comment */\n  \n${testLine}\n// Test comment\n${createLongString()}\n`);
	// 	mockEditorModelLineTokens(editorModel);

	// 	const wordRangeMap = inlineValues.getWordToLineNumbersMap(editorModel);
	// 	const words = Object.keys(wordRangeMap);
	// 	assert.deepEqual(words, expectedWords);
	// });
});

// Test helpers

function createExpression(name: string, value: string): IExpression {
	return {
		name,
		value,
		getId: () => name,
		hasChildren: false,
		getChildren: null
	};
}

function createLongString(): string {
	let longStr = '';
	for (let i = 0; i < 100; ++i) {
		longStr += 'blah blah blah ';
	}
	return `"${longStr}"`;
}

// Simple word range creator that maches wordRegex throughout string
// function getWordToLineMap(lineNumber: number, lineContent: string): Map<string, number[]> {
// 	const result = new Map<string, number[]>();
// 	const wordRegexp = inlineValues.WORD_REGEXP;
// 	wordRegexp.lastIndex = 0; // Reset matching

// 	while (true) {
// 		const wordMatch = wordRegexp.exec(lineContent);
// 		if (!wordMatch) {
// 			break;
// 		}
// 		const word = wordMatch[0];

// 		if (!result.has(word)) {
// 			result.set(word, []);
// 		}

// 		result.get(word).push(lineNumber);
// 	}

// 	return result;
// }

interface MockToken {
	tokenType: StandardTokenType;
	startOffset: number;
	endOffset: number;
}

// // Simple tokenizer that separates comments from words
// function mockLineTokens(lineContent: string): LineTokens {
// 	const tokens: MockToken[] = [];

// 	if (lineContent.match(/^\s*\/(\/|\*)/)) {
// 		tokens.push({
// 			tokenType: StandardTokenType.Comment,
// 			startOffset: 0,
// 			endOffset: lineContent.length
// 		});
// 	}
// 	// Tokenizer should ignore pure whitespace token
// 	else if (lineContent.match(/^\s+$/)) {
// 		tokens.push({
// 			tokenType: StandardTokenType.Other,
// 			startOffset: 0,
// 			endOffset: lineContent.length
// 		});
// 	}
// 	else {
// 		const wordRegexp = inlineValues.WORD_REGEXP;
// 		wordRegexp.lastIndex = 0;

// 		while (true) {
// 			const wordMatch = wordRegexp.exec(lineContent);
// 			if (!wordMatch) {
// 				break;
// 			}

// 			tokens.push({
// 				tokenType: StandardTokenType.String,
// 				startOffset: wordMatch.index,
// 				endOffset: wordMatch.index + wordMatch[0].length
// 			});
// 		}
// 	}

// 	return <LineTokens>{
// 		getLineContent: (): string => lineContent,
// 		getTokenCount: (): number => tokens.length,
// 		getTokenStartOffset: (tokenIndex: number): number => tokens[tokenIndex].startOffset,
// 		getTokenEndOffset: (tokenIndex: number): number => tokens[tokenIndex].endOffset,
// 		getStandardTokenType: (tokenIndex: number): StandardTokenType => tokens[tokenIndex].tokenType
// 	};
// };

// function mockEditorModelLineTokens(editorModel: IModel): void {
// 	const linesContent = editorModel.getLinesContent();
// 	editorModel.getLineTokens = (lineNumber: number): LineTokens => mockLineTokens(linesContent[lineNumber - 1]);
// }
