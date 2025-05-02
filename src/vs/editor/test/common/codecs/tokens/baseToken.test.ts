/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../common/core/range.js';
import { randomInt } from '../../../../../base/common/numbers.js';
import { BaseToken } from '../../../../common/codecs/baseToken.js';
import { assertDefined } from '../../../../../base/common/types.js';
import { randomBoolean } from '../../../../../base/test/common/testUtils.js';
import { NewLine } from '../../../../common/codecs/linesCodec/tokens/newLine.js';
import { CarriageReturn } from '../../../../common/codecs/linesCodec/tokens/carriageReturn.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TSimpleToken, WELL_KNOWN_TOKENS } from '../../../../common/codecs/simpleCodec/simpleDecoder.js';
import { ISimpleTokenClass, SimpleToken } from '../../../../common/codecs/simpleCodec/tokens/simpleToken.js';
import { At, Colon, DollarSign, ExclamationMark, Hash, LeftAngleBracket, LeftBracket, LeftCurlyBrace, RightAngleBracket, RightBracket, RightCurlyBrace, Slash, Space, Word } from '../../../../common/codecs/simpleCodec/tokens/index.js';

/**
 * Generates a random {@link Range} object.
 *
 * @throws if {@link maxNumber} argument is less than `2`,
 *         is equal to `NaN` or is `infinite`.
 */
const randomRange = (
	maxNumber: number = 1_000,
): Range => {
	assert(
		maxNumber > 1,
		`Max number must be greater than 1, got '${maxNumber}'.`,
	);

	const startLineNumber = randomInt(maxNumber, 1);
	const endLineNumber = (randomBoolean() === true)
		? startLineNumber
		: randomInt(2 * maxNumber, startLineNumber);

	const startColumnNumber = randomInt(maxNumber, 1);
	const endColumnNumber = (randomBoolean() === true)
		? startColumnNumber + 1
		: randomInt(2 * maxNumber, startColumnNumber + 1);

	return new Range(
		startLineNumber,
		startColumnNumber,
		endLineNumber,
		endColumnNumber,
	);
};

/**
 * Generates a random {@link Range} object that is different
 * from the provided one.
 */
const randomRangeNotEqualTo = (
	differentFrom: Range,
	maxTries: number = 10,
): Range => {
	let retriesLeft = maxTries;

	while (retriesLeft-- > 0) {
		const range = randomRange();
		if (range.equalsRange(differentFrom) === false) {
			return range;
		}
	}

	throw new Error(
		`Failed to generate a random range different from '${differentFrom}' in ${maxTries} tries.`,
	);
};

/**
 * List of simple tokens to randomly select from
 * in the {@link randomSimpleToken} utility.
 */
const TOKENS: readonly ISimpleTokenClass<TSimpleToken>[] = Object.freeze([
	...WELL_KNOWN_TOKENS,
	CarriageReturn,
	NewLine,
]);

/**
 * Generates a random {@link SimpleToken} instance.
 */
const randomSimpleToken = (): TSimpleToken => {
	const index = randomInt(TOKENS.length - 1);

	const Constructor = TOKENS[index];
	assertDefined(
		Constructor,
		`Cannot find a constructor object for a well-known token at index '${index}'.`,
	);

	return new Constructor(randomRange());
};

suite('BaseToken', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('• render()', () => {
		/**
		 * Note! Range of tokens is ignored by the render method, hence
		 *       we generate random ranges for each token in this test.
		 */
		test('• a list of tokens', () => {
			const tests: readonly [string, BaseToken[]][] = [
				['/textoftheword$#', [
					new Slash(randomRange()),
					new Word(randomRange(), 'textoftheword'),
					new DollarSign(randomRange()),
					new Hash(randomRange()),
				]],
				['<:👋helou👋:>', [
					new LeftAngleBracket(randomRange()),
					new Colon(randomRange()),
					new Word(randomRange(), '👋helou👋'),
					new Colon(randomRange()),
					new RightAngleBracket(randomRange()),
				]],
				[' {$#[ !@! ]#$} ', [
					new Space(randomRange()),
					new LeftCurlyBrace(randomRange()),
					new DollarSign(randomRange()),
					new Hash(randomRange()),
					new LeftBracket(randomRange()),
					new Space(randomRange()),
					new ExclamationMark(randomRange()),
					new At(randomRange()),
					new ExclamationMark(randomRange()),
					new Space(randomRange()),
					new RightBracket(randomRange()),
					new Hash(randomRange()),
					new DollarSign(randomRange()),
					new RightCurlyBrace(randomRange()),
					new Space(randomRange()),
				]],
			];

			for (const test of tests) {
				const [expectedText, tokens] = test;

				assert.strictEqual(
					expectedText,
					BaseToken.render(tokens),
				);
			}
		});

		test('• an empty list of tokens', () => {
			assert.strictEqual(
				'',
				BaseToken.render([]),
				`Must correctly render and empty list of tokens.`,
			);
		});
	});

	suite('• fullRange()', () => {
		suite('• throws', () => {
			test('• if empty list provided', () => {
				assert.throws(() => {
					BaseToken.fullRange([]);
				});
			});

			test('• if start line number of the first token is greater than one of the last token', () => {
				assert.throws(() => {
					const lastToken = randomSimpleToken();

					// generate a first token with starting line number that is
					// greater than the start line number of the last token
					const startLineNumber = lastToken.range.startLineNumber + randomInt(10, 1);
					const firstToken = new Colon(
						new Range(
							startLineNumber,
							lastToken.range.startColumn,
							startLineNumber,
							lastToken.range.startColumn + 1,
						),
					);

					BaseToken.fullRange([
						firstToken,
						// tokens in the middle are ignored, so we
						// generate random ones to fill the gap
						randomSimpleToken(),
						randomSimpleToken(),
						randomSimpleToken(),
						randomSimpleToken(),
						randomSimpleToken(),
						// -
						lastToken,
					]);
				});
			});

			test('• if start line numbers are equal and end of the first token is greater than the start of the last token', () => {
				assert.throws(() => {
					const firstToken = randomSimpleToken();

					const lastToken = new Hash(
						new Range(
							firstToken.range.startLineNumber,
							firstToken.range.endColumn - 1,
							firstToken.range.startLineNumber + randomInt(10),
							firstToken.range.endColumn,
						),
					);

					BaseToken.fullRange([
						firstToken,
						// tokens in the middle are ignored, so we
						// generate random ones to fill the gap
						randomSimpleToken(),
						randomSimpleToken(),
						randomSimpleToken(),
						randomSimpleToken(),
						randomSimpleToken(),
						// -
						lastToken,
					]);
				});
			});
		});
	});

	suite('• withRange()', () => {
		test('• updates token range', () => {
			class TestToken extends BaseToken {
				public override get text(): string {
					throw new Error('Method not implemented.');
				}
				public override toString(): string {
					throw new Error('Method not implemented.');
				}
			}

			const rangeBefore = randomRange();
			const token = new TestToken(rangeBefore);

			assert(
				token.range.equalsRange(rangeBefore),
				'Token range must be unchanged before updating.',
			);

			const rangeAfter = randomRangeNotEqualTo(rangeBefore);
			token.withRange(rangeAfter);

			assert(
				token.range.equalsRange(rangeAfter),
				`Token range must be to the new '${rangeAfter}' one.`,
			);
		});
	});

	suite('• equals()', () => {
		test('• true', () => {
			class TestToken extends BaseToken {
				constructor(
					range: Range,
					private readonly value: string,
				) {
					super(range);
				}
				public override get text(): string {
					return this.value;
				}

				public override toString(): string {
					throw new Error('Method not implemented.');
				}
			}
			const text = 'contents';

			const startLineNumber = randomInt(100, 1);
			const startColumnNumber = randomInt(100, 1);
			const range = new Range(
				startLineNumber,
				startColumnNumber,
				startLineNumber,
				startColumnNumber + text.length,
			);

			const token1 = new TestToken(range, text);
			const token2 = new TestToken(range, text);

			assert(
				token1.equals(token2),
				`Token of type '${token1.constructor.name}' must be equal to token of type '${token2.constructor.name}'.`,
			);

			assert(
				token2.equals(token1),
				`Token of type '${token2.constructor.name}' must be equal to token of type '${token1.constructor.name}'.`,
			);
		});

		suite('• false', () => {
			suite('• different constructor', () => {
				test('• same base class', () => {
					class TestToken1 extends BaseToken {
						public override get text(): string {
							throw new Error('Method not implemented.');
						}

						public override toString(): string {
							throw new Error('Method not implemented.');
						}
					}

					class TestToken2 extends BaseToken {
						public override get text(): string {
							throw new Error('Method not implemented.');
						}

						public override toString(): string {
							throw new Error('Method not implemented.');
						}
					}

					const range = randomRange();
					const token1 = new TestToken1(range);
					const token2 = new TestToken2(range);

					assert.strictEqual(
						token1.equals(token2),
						false,
						`Token of type '${token1.constructor.name}' must not be equal to token of type '${token2.constructor.name}'.`,
					);

					assert.strictEqual(
						token2.equals(token1),
						false,
						`Token of type '${token2.constructor.name}' must not be equal to token of type '${token1.constructor.name}'.`,
					);
				});

				test('• child', () => {
					class TestToken1 extends BaseToken {
						public override get text(): string {
							throw new Error('Method not implemented.');
						}

						public override toString(): string {
							throw new Error('Method not implemented.');
						}
					}

					class TestToken2 extends TestToken1 { }

					const range = randomRange();
					const token1 = new TestToken1(range);
					const token2 = new TestToken2(range);

					assert.strictEqual(
						token1.equals(token2),
						false,
						`Token of type '${token1.constructor.name}' must not be equal to token of type '${token2.constructor.name}'.`,
					);

					assert.strictEqual(
						token2.equals(token1),
						false,
						`Token of type '${token2.constructor.name}' must not be equal to token of type '${token1.constructor.name}'.`,
					);
				});

				test('• different direct ancestor', () => {
					class TestToken1 extends BaseToken {
						public override get text(): string {
							throw new Error('Method not implemented.');
						}

						public override toString(): string {
							throw new Error('Method not implemented.');
						}
					}

					class TestToken3 extends BaseToken {
						public override get text(): string {
							throw new Error('Method not implemented.');
						}

						public override toString(): string {
							throw new Error('Method not implemented.');
						}
					}

					class TestToken2 extends TestToken3 { }

					const range = randomRange();
					const token1 = new TestToken1(range);
					const token2 = new TestToken2(range);

					assert.strictEqual(
						token1.equals(token2),
						false,
						`Token of type '${token1.constructor.name}' must not be equal to token of type '${token2.constructor.name}'.`,
					);

					assert.strictEqual(
						token2.equals(token1),
						false,
						`Token of type '${token2.constructor.name}' must not be equal to token of type '${token1.constructor.name}'.`,
					);
				});
			});

			test('• different text', () => {
				class TestToken extends BaseToken {
					constructor(
						private readonly value: string,
					) {
						super(new Range(1, 1, 1, 1 + value.length));
					}

					public override get text(): string {
						return this.value;
					}

					public override toString(): string {
						throw new Error('Method not implemented.');
					}
				}

				const token1 = new TestToken('text1');
				const token2 = new TestToken('text2');

				assert.strictEqual(
					token1.equals(token2),
					false,
					`Token of type '${token1.constructor.name}' must not be equal to token of type '${token2.constructor.name}'.`,
				);

				assert.strictEqual(
					token2.equals(token1),
					false,
					`Token of type '${token2.constructor.name}' must not be equal to token of type '${token1.constructor.name}'.`,
				);
			});

			test('• different range', () => {
				class TestToken extends BaseToken {
					public override get text(): string {
						return 'some text value';
					}

					public override toString(): string {
						throw new Error('Method not implemented.');
					}
				}

				const range1 = randomRange();
				const token1 = new TestToken(range1);

				const range2 = randomRangeNotEqualTo(range1);
				const token2 = new TestToken(range2);

				assert.strictEqual(
					token1.equals(token2),
					false,
					`Token of type '${token1.constructor.name}' must not be equal to token of type '${token2.constructor.name}'.`,
				);

				assert.strictEqual(
					token2.equals(token1),
					false,
					`Token of type '${token2.constructor.name}' must not be equal to token of type '${token1.constructor.name}'.`,
				);
			});
		});
	});

	suite('• collapseRangeToStart()', () => {
		test('• collapses token range to the start position', () => {
			class TestToken extends BaseToken {
				public override get text(): string {
					throw new Error('Method not implemented.');
				}
				public override toString(): string {
					throw new Error('Method not implemented.');
				}
			}

			const startLineNumber = randomInt(10, 1);
			const startColumnNumber = randomInt(10, 1);
			const range = new Range(
				startLineNumber,
				startColumnNumber,
				startLineNumber + randomInt(10, 1),
				startColumnNumber + randomInt(10, 1),
			);

			const token = new TestToken(range);

			assert(
				token.range.isEmpty() === false,
				'Token range must not be empty before collapsing.',
			);

			token.collapseRangeToStart();

			assert(
				token.range.isEmpty(),
				'Token range must be empty after collapsing.',
			);

			assert.strictEqual(
				token.range.startLineNumber,
				startLineNumber,
				'Token range start line number must not change.',
			);

			assert.strictEqual(
				token.range.startColumn,
				startColumnNumber,
				'Token range start column number must not change.',
			);

			assert.strictEqual(
				token.range.endLineNumber,
				startLineNumber,
				'Token range end line number must be equal to line start number.',
			);

			assert.strictEqual(
				token.range.endColumn,
				startColumnNumber,
				'Token range end column number must be equal to column start number.',
			);
		});
	});
});
