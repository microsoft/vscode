/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../common/core/range.js';
import { randomRange } from '../testUtils/randomRange.js';
import { Text } from '../../../../common/codecs/textToken.js';
import { randomInt } from '../../../../../base/common/numbers.js';
import { BaseToken } from '../../../../common/codecs/baseToken.js';
import { assertNever } from '../../../../../base/common/assert.js';
import { CompositeToken } from '../../../../common/codecs/compositeToken.js';
import { randomBoolean } from '../../../../../base/test/common/testUtils.js';
import { NewLine } from '../../../../common/codecs/linesCodec/tokens/newLine.js';
import { Space, Word } from '../../../../common/codecs/simpleCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('CompositeToken', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class TestToken extends CompositeToken<BaseToken[]> {
		constructor(
			tokens: BaseToken[],
		) {
			super(tokens);
		}

		public override toString(): string {
			const tokenStrings = this.tokens.map((token) => {
				return token.toString();
			});

			return `CompositeToken:\n${tokenStrings.join('\n')})`;
		}
	}

	suite('• constructor', () => {
		suite('• infers range from the list of tokens', () => {
			test('• one token', () => {
				const range = randomRange();
				const token = new TestToken([
					new Word(
						range,
						'word',
					),
				]);

				assert(
					token.range.equalsRange(range),
					'Expected the range to be equal to the token range.',
				);
			});

			test('• multiple tokens', () => {
				const tokens = randomTokens();
				const token = new TestToken(tokens);

				const expectedRange = Range.fromPositions(
					tokens[0].range.getStartPosition(),
					tokens[tokens.length - 1].range.getEndPosition(),
				);

				assert(
					token.range.equalsRange(expectedRange),
					`Composite token range must be '${expectedRange}', got '${token.range}'.`,
				);
			});

			test('• throws if no tokens provided', () => {
				assert.throws(() => {
					new TestToken([]);
				});
			});
		});

		test('• throws if no tokens provided', () => {
			assert.throws(() => {
				new TestToken([]);
			});
		});
	});

	test('• text', () => {
		const tokens = randomTokens();
		const token = new TestToken(tokens);

		assert.strictEqual(
			token.text,
			BaseToken.render(tokens),
			'Must have correct text value.',
		);
	});

	test('• tokens', () => {
		const tokens = randomTokens();
		const token = new TestToken(tokens);

		for (let i = 0; i < tokens.length; i++) {
			assert(
				token.tokens[i].equals(tokens[i]),
				`Token #${i} must be '${tokens[i]}', got '${token.tokens[i]}'.`,
			);
		}

		assert.strictEqual(
			token.tokens,
			tokens,
			'Must return reference to the same token array.',
		);
	});

	suite('• equals', () => {
		suite('• true', () => {
			test('• same child tokens', () => {
				const tokens = randomTokens();
				const token1 = new TestToken(tokens);
				const token2 = new TestToken(tokens);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});

			test('• copied child tokens', () => {
				const tokens = randomTokens();
				const token1 = new TestToken([...tokens]);
				const token2 = new TestToken([...tokens]);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});

			test('• cloned child tokens', () => {
				const tokens = randomTokens();

				const tokens1 = cloneTokens(tokens);
				const tokens2 = cloneTokens(tokens);

				const token1 = new TestToken(tokens1);
				const token2 = new TestToken(tokens2);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});

			test('• composite tokens', () => {
				const tokens = randomTokens();

				// ensure there is at least one composite token
				const lastToken = tokens[tokens.length - 1];
				const compositeToken = new TestToken(randomTokens(
					randomInt(5, 2),
					lastToken.range.endLineNumber,
					lastToken.range.endColumn,
				));
				tokens.push(compositeToken);

				const token1 = new TestToken([...tokens]);
				const token2 = new TestToken([...tokens]);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});
		});

		suite('• false', () => {
			test('• unknown children number', () => {
				const token1 = new TestToken(randomTokens());
				const token2 = new TestToken(randomTokens());

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});

			test('• different number of children', () => {
				const tokens1 = randomTokens();
				const tokens2 = randomTokens();

				if (tokens1.length === tokens2.length) {
					(randomBoolean())
						? tokens1.pop()
						: tokens2.pop();
				}

				const token1 = new TestToken(tokens1);
				const token2 = new TestToken(tokens2);

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});

			test('• same number of children', () => {
				const tokensCount = randomInt(20, 10);

				const tokens1 = randomTokens(tokensCount);
				const tokens2 = randomTokens(tokensCount);

				assert.strictEqual(
					tokens1.length,
					tokens2.length,
					'Tokens must have the same number of children for this test to be valid.',
				);

				const token1 = new TestToken(tokens1);
				const token2 = new TestToken(tokens2);

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});

			test('• unequal composite tokens', () => {
				const tokens = randomTokens();

				// ensure there is at least one composite token
				const lastToken = tokens[tokens.length - 1];
				const compositeToken1 = new TestToken(randomTokens(
					randomInt(3, 1),
					lastToken.range.endLineNumber,
					lastToken.range.endColumn,
				));
				const compositeToken2 = new TestToken(randomTokens(
					randomInt(6, 4),
					lastToken.range.endLineNumber,
					lastToken.range.endColumn,
				));

				assert(
					compositeToken1.equals(compositeToken2) === false,
					'Composite tokens must not be equal for this test to be valid.',
				);

				const tokens1 = [...tokens, compositeToken1];
				const tokens2 = [...tokens, compositeToken2];

				const token1 = new TestToken(tokens1);
				const token2 = new TestToken(tokens2);

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});
		});
	});
});

/**
 * Token type for the {@link cloneTokens} and {@link randomTokens} functions.
 */
type TToken = NewLine | Space | Word | Text<TToken[]>;

/**
 * Test utility to clone a list of provided tokens.
 */
const cloneTokens = (
	tokens: TToken[],
): TToken[] => {
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
			clonedTokens.push(new Text(cloneTokens(token.tokens)));
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
};

/**
 * Test utility to generate a number of random tokens.
 */
const randomTokens = (
	tokenCount: number = randomInt(20, 10),
	startLine: number = randomInt(100, 1),
	startColumn: number = randomInt(100, 1),
): TToken[] => {
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
};
