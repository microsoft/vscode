/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../../../../../../editor/common/core/range.js';
import { Word } from '../../../../../../common/promptSyntax/codecs/base/simpleCodec/tokens/tokens.js';
import { randomBoolean } from '../../../../../../../../../base/test/common/testUtils.js';
import { FrontMatterBoolean } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';
import { FrontMatterSequence } from '../../../../../../common/promptSyntax/codecs/base/frontMatterCodec/tokens/frontMatterSequence.js';

suite('FrontMatterBoolean', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('equals()', () => {
		suite('base case', () => {
			test('true', () => {
				// both values should yield the same result
				const booleanText = (randomBoolean())
					? 'true'
					: 'TRUE';

				const boolean = new FrontMatterBoolean(
					new Word(
						new Range(1, 1, 1, 5),
						booleanText,
					),
				);

				const other = new FrontMatterBoolean(
					new Word(
						new Range(1, 1, 1, 5),
						booleanText,
					),
				);

				assert.strictEqual(
					boolean.value,
					true,
					'Must have correct boolean value.',
				);

				assert(
					boolean.equals(other),
					'Booleans must be equal.',
				);
			});

			test('false', () => {
				// both values should yield the same result
				const booleanText = (randomBoolean())
					? 'false'
					: 'FALSE';

				const boolean = new FrontMatterBoolean(
					new Word(
						new Range(5, 15, 5, 15 + 6),
						booleanText,
					),
				);

				const other = new FrontMatterBoolean(
					new Word(
						new Range(5, 15, 5, 15 + 6),
						booleanText,
					),
				);

				assert.strictEqual(
					boolean.value,
					false,
					'Must have correct boolean value.',
				);

				assert(
					boolean.equals(other),
					'Booleans must be equal.',
				);
			});
		});

		suite('non-boolean token', () => {
			suite('word token', () => {
				test('true', () => {
					// both values should yield the same result
					const booleanText = (randomBoolean())
						? 'true'
						: 'TRUE';

					const boolean = new FrontMatterBoolean(
						new Word(
							new Range(1, 1, 1, 5),
							booleanText,
						),
					);

					const other = new Word(
						new Range(1, 1, 1, 5),
						booleanText,
					);

					assert(
						boolean.equals(other) === false,
						'Booleans must not be equal.',
					);
				});

				test('false', () => {
					// both values should yield the same result
					const booleanText = (randomBoolean())
						? 'false'
						: 'FALSE';

					const boolean = new FrontMatterBoolean(
						new Word(
							new Range(1, 2, 1, 2 + 6),
							booleanText,
						),
					);

					const other = new Word(
						new Range(1, 2, 1, 2 + 6),
						booleanText,
					);

					assert(
						boolean.equals(other) === false,
						'Booleans must not be equal.',
					);
				});
			});

			suite('sequence token', () => {
				test('true', () => {
					// both values should yield the same result
					const booleanText = (randomBoolean())
						? 'true'
						: 'TRUE';

					const boolean = new FrontMatterBoolean(
						new Word(
							new Range(1, 1, 1, 5),
							booleanText,
						),
					);

					const other = new FrontMatterSequence([
						new Word(
							new Range(1, 1, 1, 5),
							booleanText,
						),
					]);

					assert(
						boolean.equals(other) === false,
						'Booleans must not be equal.',
					);
				});

				test('false', () => {
					// both values should yield the same result
					const booleanText = (randomBoolean())
						? 'false'
						: 'FALSE';

					const boolean = new FrontMatterBoolean(
						new Word(
							new Range(1, 2, 1, 2 + 6),
							booleanText,
						),
					);

					const other = new FrontMatterSequence([
						new Word(
							new Range(1, 2, 1, 2 + 6),
							booleanText,
						),
					]);

					assert(
						boolean.equals(other) === false,
						'Booleans must not be equal.',
					);
				});
			});
		});

		suite('different range', () => {
			test('true', () => {
				// both values should yield the same result
				const booleanText = (randomBoolean())
					? 'true'
					: 'TRUE';

				const boolean = new FrontMatterBoolean(
					new Word(
						new Range(1, 2, 1, 2 + 4),
						booleanText,
					),
				);

				const other = new FrontMatterBoolean(
					new Word(
						new Range(3, 2, 3, 2 + 4),
						booleanText,
					),
				);

				assert(
					boolean.equals(other) === false,
					'Booleans must not be equal.',
				);
			});

			test('false', () => {
				// both values should yield the same result
				const booleanText = (randomBoolean())
					? 'false'
					: 'FALSE';

				const boolean = new FrontMatterBoolean(
					new Word(
						new Range(5, 15, 5, 15 + 5),
						booleanText,
					),
				);

				const other = new FrontMatterBoolean(
					new Word(
						new Range(4, 15, 4, 15 + 5),
						booleanText,
					),
				);

				assert(
					boolean.equals(other) === false,
					'Booleans must not be equal.',
				);
			});
		});

		suite('different text', () => {
			test('true', () => {
				const boolean = new FrontMatterBoolean(
					new Word(
						new Range(1, 1, 1, 5),
						'true',
					),
				);

				const other = new FrontMatterBoolean(
					new Word(
						new Range(1, 1, 1, 5),
						'True',
					),
				);

				assert(
					boolean.equals(other) === false,
					'Booleans must not be equal.',
				);
			});

			test('false', () => {
				const boolean = new FrontMatterBoolean(
					new Word(
						new Range(5, 15, 5, 15 + 6),
						'FALSE',
					),
				);

				const other = new FrontMatterBoolean(
					new Word(
						new Range(5, 15, 5, 15 + 6),
						'false',
					),
				);

				assert(
					boolean.equals(other) === false,
					'Booleans must not be equal.',
				);
			});
		});

		test('throws if cannot be converted to a boolean', () => {
			assert.throws(() => {
				new FrontMatterBoolean(
					new Word(
						new Range(1, 1, 1, 5),
						'true1',
					),
				);
			});

			assert.throws(() => {
				new FrontMatterBoolean(
					new Word(
						new Range(2, 5, 2, 5 + 6),
						'fal se',
					),
				);
			});

			assert.throws(() => {
				new FrontMatterBoolean(
					new Word(
						new Range(20, 4, 20, 4 + 1),
						'1',
					),
				);
			});
		});
	});
});
