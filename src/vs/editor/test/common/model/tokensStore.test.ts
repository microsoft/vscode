/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MultilineTokens2, SparseEncodedTokens } from 'vs/editor/common/model/tokensStore';
import { Range } from 'vs/editor/common/core/range';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { MetadataConsts, TokenMetadata } from 'vs/editor/common/modes';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';

suite('TokensStore', () => {

	const SEMANTIC_COLOR = 5;

	function parseTokensState(state: string[]): { text: string; tokens: MultilineTokens2; } {
		let text: string[] = [];
		let tokens: number[] = [];
		let baseLine = 1;
		for (let i = 0; i < state.length; i++) {
			const line = state[i];

			let startOffset = 0;
			let lineText = '';
			while (true) {
				const firstPipeOffset = line.indexOf('|', startOffset);
				if (firstPipeOffset === -1) {
					break;
				}
				const secondPipeOffset = line.indexOf('|', firstPipeOffset + 1);
				if (secondPipeOffset === -1) {
					break;
				}
				if (firstPipeOffset + 1 === secondPipeOffset) {
					// skip ||
					lineText += line.substring(startOffset, secondPipeOffset + 1);
					startOffset = secondPipeOffset + 1;
					continue;
				}

				lineText += line.substring(startOffset, firstPipeOffset);
				const tokenStartCharacter = lineText.length;
				const tokenLength = secondPipeOffset - firstPipeOffset - 1;
				const metadata = (
					SEMANTIC_COLOR << MetadataConsts.FOREGROUND_OFFSET
					| MetadataConsts.SEMANTIC_USE_FOREGROUND
				);

				if (tokens.length === 0) {
					baseLine = i + 1;
				}
				tokens.push(i + 1 - baseLine, tokenStartCharacter, tokenStartCharacter + tokenLength, metadata);

				lineText += line.substr(firstPipeOffset + 1, tokenLength);
				startOffset = secondPipeOffset + 1;
			}

			lineText += line.substring(startOffset);

			text.push(lineText);
		}

		return {
			text: text.join('\n'),
			tokens: new MultilineTokens2(baseLine, new SparseEncodedTokens(new Uint32Array(tokens)))
		};
	}

	function extractState(model: TextModel): string[] {
		let result: string[] = [];
		for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
			const lineTokens = model.getLineTokens(lineNumber);
			const lineContent = model.getLineContent(lineNumber);

			let lineText = '';
			for (let i = 0; i < lineTokens.getCount(); i++) {
				const tokenStartCharacter = lineTokens.getStartOffset(i);
				const tokenEndCharacter = lineTokens.getEndOffset(i);
				const metadata = lineTokens.getMetadata(i);
				const color = TokenMetadata.getForeground(metadata);
				const tokenText = lineContent.substring(tokenStartCharacter, tokenEndCharacter);
				if (color === SEMANTIC_COLOR) {
					lineText += `|${tokenText}|`;
				} else {
					lineText += tokenText;
				}
			}

			result.push(lineText);
		}
		return result;
	}

	// function extractState

	function testTokensAdjustment(rawInitialState: string[], edits: IIdentifiedSingleEditOperation[], rawFinalState: string[]) {
		const initialState = parseTokensState(rawInitialState);
		const model = createTextModel(initialState.text);
		model.setSemanticTokens([initialState.tokens]);

		model.applyEdits(edits);

		const actualState = extractState(model);
		assert.deepEqual(actualState, rawFinalState);

		model.dispose();
	}

	test('issue #86303 - color shifting between different tokens', () => {
		testTokensAdjustment(
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(2, 9, 2, 10), text: '' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const fo = |URI|.parse('hey');`
			]
		);
	});

	test('deleting a newline', () => {
		testTokensAdjustment(
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(1, 42, 2, 1), text: '' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			]
		);
	});

	test('inserting a newline', () => {
		testTokensAdjustment(
			[
				`import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(1, 42, 1, 42), text: '\n' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const foo = |URI|.parse('hey');`
			]
		);
	});

	test('deleting a newline 2', () => {
		testTokensAdjustment(
			[
				`import { `,
				`    |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(1, 10, 2, 5), text: '' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			]
		);
	});

	test('issue #91936: Semantic token color highlighting fails on line with selected text', () => {
		const model = createTextModel('                    else if ($s = 08) then \'\\b\'');
		model.setSemanticTokens([
			new MultilineTokens2(1, new SparseEncodedTokens(new Uint32Array([
				0, 20, 24, 245768,
				0, 25, 27, 245768,
				0, 28, 29, 16392,
				0, 29, 31, 262152,
				0, 32, 33, 16392,
				0, 34, 36, 98312,
				0, 36, 37, 16392,
				0, 38, 42, 245768,
				0, 43, 47, 180232,
			])))
		]);
		const lineTokens = model.getLineTokens(1);
		let decodedTokens: number[] = [];
		for (let i = 0, len = lineTokens.getCount(); i < len; i++) {
			decodedTokens.push(lineTokens.getEndOffset(i), lineTokens.getMetadata(i));
		}

		assert.deepEqual(decodedTokens, [
			20, 16793600,
			24, 17022976,
			25, 16793600,
			27, 17022976,
			28, 16793600,
			29, 16793600,
			31, 17039360,
			32, 16793600,
			33, 16793600,
			34, 16793600,
			36, 16875520,
			37, 16793600,
			38, 16793600,
			42, 17022976,
			43, 16793600,
			47, 16957440
		]);

		model.dispose();
	});

});
