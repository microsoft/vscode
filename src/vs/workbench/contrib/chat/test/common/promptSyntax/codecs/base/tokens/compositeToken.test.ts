/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { randomRange } from '../testUtils/randomRange.js';
import { randomInt } from '../../../../../../../../../base/common/numbers.js';
import { BaseToken } from '../../../../../../common/promptSyntax/codecs/base/baseToken.js';
import { cloneTokens, randomTokens } from '../testUtils/randomTokens.js';
import { CompositeToken } from '../../../../../../common/promptSyntax/codecs/base/compositeToken.js';
import { randomBoolean } from '../../../../../../../../../base/test/common/testUtils.js';
import { Word } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';

suite('CompositeToken', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * A test token that extends the abstract {@link CompositeToken}
	 * class which cannot be instantiated directly.
	 */
	class TestCompositeToken extends CompositeToken<BaseToken[]> {

		public override toString(): string {
			const tokenStrings = this.children.map((token) => {
				return token.toString();
			});

			return `CompositeToken:\n${tokenStrings.join('\n')})`;
		}
	}

	suite('constructor', () => {
		suite('infers range from the list of tokens', () => {
			test('one token', () => {
				const range = randomRange();
				const token = new TestCompositeToken([
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

			test('multiple tokens', () => {
				const tokens = randomTokens();
				const token = new TestCompositeToken(tokens);

				const expectedRange = Range.fromPositions(
					tokens[0].range.getStartPosition(),
					tokens[tokens.length - 1].range.getEndPosition(),
				);

				assert(
					token.range.equalsRange(expectedRange),
					`Composite token range must be '${expectedRange}', got '${token.range}'.`,
				);
			});

			test('throws if no tokens provided', () => {
				assert.throws(() => {
					new TestCompositeToken([]);
				});
			});
		});

		test('throws if no tokens provided', () => {
			assert.throws(() => {
				new TestCompositeToken([]);
			});
		});
	});

	test('text', () => {
		const tokens = randomTokens();
		const token = new TestCompositeToken(tokens);

		assert.strictEqual(
			token.text,
			BaseToken.render(tokens),
			'Must have correct text value.',
		);
	});

	test('tokens', () => {
		const tokens = randomTokens();
		const token = new TestCompositeToken(tokens);

		for (let i = 0; i < tokens.length; i++) {
			assert(
				token.children[i].equals(tokens[i]),
				`Token #${i} must be '${tokens[i]}', got '${token.children[i]}'.`,
			);
		}
	});

	suite('equals', () => {
		suite('true', () => {
			test('same child tokens', () => {
				const tokens = randomTokens();
				const token1 = new TestCompositeToken(tokens);
				const token2 = new TestCompositeToken(tokens);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});

			test('copied child tokens', () => {
				const tokens = randomTokens();
				const token1 = new TestCompositeToken([...tokens]);
				const token2 = new TestCompositeToken([...tokens]);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});

			test('cloned child tokens', () => {
				const tokens = randomTokens();

				const tokens1 = cloneTokens(tokens);
				const tokens2 = cloneTokens(tokens);

				const token1 = new TestCompositeToken(tokens1);
				const token2 = new TestCompositeToken(tokens2);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});

			test('composite tokens', () => {
				const tokens = randomTokens();

				// ensure there is at least one composite token
				const lastToken = tokens[tokens.length - 1];
				const compositeToken = new TestCompositeToken(randomTokens(
					randomInt(5, 2),
					lastToken.range.endLineNumber,
					lastToken.range.endColumn,
				));
				tokens.push(compositeToken);

				const token1 = new TestCompositeToken([...tokens]);
				const token2 = new TestCompositeToken([...tokens]);

				assert(
					token1.equals(token2),
					'Tokens must be equal.',
				);
			});
		});

		suite('false', () => {
			test('unknown children number', () => {
				const token1 = new TestCompositeToken(randomTokens());
				const token2 = new TestCompositeToken(randomTokens());

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});

			test('different number of children', () => {
				const tokens1 = randomTokens();
				const tokens2 = randomTokens();

				if (tokens1.length === tokens2.length) {
					(randomBoolean())
						? tokens1.pop()
						: tokens2.pop();
				}

				const token1 = new TestCompositeToken(tokens1);
				const token2 = new TestCompositeToken(tokens2);

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});

			test('same number of children', () => {
				const tokensCount = randomInt(20, 10);

				const tokens1 = randomTokens(tokensCount);
				const tokens2 = randomTokens(tokensCount);

				assert.strictEqual(
					tokens1.length,
					tokens2.length,
					'Tokens must have the same number of children for this test to be valid.',
				);

				const token1 = new TestCompositeToken(tokens1);
				const token2 = new TestCompositeToken(tokens2);

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});

			test('unequal composite tokens', () => {
				const tokens = randomTokens();

				// ensure there is at least one composite token
				const lastToken = tokens[tokens.length - 1];
				const compositeToken1 = new TestCompositeToken(randomTokens(
					randomInt(3, 1),
					lastToken.range.endLineNumber,
					lastToken.range.endColumn,
				));
				const compositeToken2 = new TestCompositeToken(randomTokens(
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

				const token1 = new TestCompositeToken(tokens1);
				const token2 = new TestCompositeToken(tokens2);

				assert(
					token1.equals(token2) === false,
					'Tokens must not be equal.',
				);
			});
		});
	});
});
