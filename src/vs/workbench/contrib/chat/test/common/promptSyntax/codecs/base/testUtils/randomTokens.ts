/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { Text } from '../../../../../../common/promptSyntax/codecs/base/textToken.js';
import { randomInt } from '../../../../../../../../../base/common/numbers.js';
import { assertNever } from '../../../../../../../../../base/common/assert.js';
import { NewLine } from '../../../../../../common/promptSyntax/codecs/base/linesCodec/tokens/newLine.js';
import { Space, Word } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';

/**
 * Token type for the {@link cloneTokens} and {@link randomTokens} functions.
 */
type TToken = NewLine | Space | Word | Text<TToken[]>;

/**
 * Test utility to clone a list of provided tokens.
 */
export function cloneTokens(tokens: TToken[]): TToken[] {
	const clonedTokens: TToken[] = [];

	for (const token of tokens) {
		if (token instanceof NewLine) {
			clonedTokens.push(new NewLine(token.range));
			continue;
		}

		if (token instanceof Space) {
			clonedTokens.push(new Space(token.range));
			continue;
		}

		if (token instanceof Word) {
			clonedTokens.push(new Word(token.range, token.text));

			continue;
		}

		if (token instanceof Text) {
			clonedTokens.push(new Text(cloneTokens(token.children)));
			continue;
		}

		assertNever(
			token,
			`Unexpected token type '${token}'.`,
		);
	}

	for (let i = 0; i < tokens.length; i++) {
		assert(
			tokens[i].equals(clonedTokens[i]),
			`Original and cloned tokens #${i} must be equal.`,
		);

		assert(
			tokens[i] !== clonedTokens[i],
			`Original and cloned tokens #${i} must not be strict equal.`,
		);
	}

	return clonedTokens;
}

/**
 * Test utility to generate a number of random tokens.
 */
export function randomTokens(tokenCount: number = randomInt(20, 10), startLine: number = randomInt(100, 1), startColumn: number = randomInt(100, 1)): TToken[] {
	const tokens = [];

	let tokensLeft = tokenCount;
	while (tokensLeft > 0) {
		const caseNumber = randomInt(7, 1);
		switch (caseNumber) {
			case 1:
			case 2: {
				tokens.push(
					new NewLine(new Range(
						startLine,
						startColumn,
						startLine,
						startColumn + 1,
					)),
				);
				startLine++;
				startColumn = 1;
				break;
			}
			case 3:
			case 4: {
				tokens.push(
					new Space(new Range(
						startLine,
						startColumn,
						startLine,
						startColumn + 1,
					)),
				);
				startColumn++;
				break;
			}

			case 5:
			case 6: {
				const text = `word${randomInt(Number.MAX_SAFE_INTEGER, 1)}`;
				const endColumn = startColumn + text.length;

				tokens.push(
					new Word(
						new Range(
							startLine, startColumn,
							startLine, endColumn,
						),
						text,
					),
				);

				startColumn = endColumn;
				break;
			}

			case 7: {
				const token = new Text(
					randomTokens(randomInt(3, 1), startLine, startColumn),
				);

				tokens.push(token);

				startLine = token.range.endLineNumber;
				startColumn = token.range.endColumn;
				break;
			}

			default: {
				throw new Error(`Unexpected random token generation case number: '${caseNumber}'`);
			}
		}

		tokensLeft--;
	}

	return tokens;
}
