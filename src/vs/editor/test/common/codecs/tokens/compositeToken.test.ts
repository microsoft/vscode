/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../common/core/range.js';
import { randomRange } from '../testUtils/randomRange.js';
import { randomInt } from '../../../../../base/common/numbers.js';
import { BaseToken } from '../../../../common/codecs/baseToken.js';
import { CompositeToken } from '../../../../common/codecs/compositeToken.js';
import { randomBoolean } from '../../../../../base/test/common/testUtils.js';
import { NewLine } from '../../../../common/codecs/linesCodec/tokens/newLine.js';
import { Space, Word } from '../../../../common/codecs/simpleCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('CompositeToken', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('• constructor', () => {
		suite('• infers range from the list of tokens', () => {
			class TestToken extends CompositeToken<BaseToken[]> {
				constructor(
					tokens: BaseToken[],
				) {
					super(tokens);
				}

				public override toString(): string {
					throw new Error('Method not implemented.');
				}
			}
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
				const tokens = [];
				let startLine = randomInt(100, 1);
				let startColumn = randomInt(100, 1);
				let tokenCount = randomInt(20, 10);

				while (tokenCount > 0) {
					if (randomBoolean()) {
						tokens.push(
							new NewLine(new Range(
								startLine,
								startColumn,
								startLine,
								startColumn + 1,
							)),
						);
						startLine++;
					}

					if (randomBoolean()) {
						tokens.push(
							new Space(new Range(
								startLine,
								startColumn,
								startLine,
								startColumn + 1,
							)),
						);
						startColumn++;
					}

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
					tokenCount--;
				}

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
	});
});
