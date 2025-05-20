/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Range } from '../../../../common/core/range.js';
import { Word } from '../../../../common/codecs/simpleCodec/tokens/index.js';
import { FrontMatterValueToken } from '../../../../common/codecs/frontMatterCodec/tokens/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FrontMatterSequence } from '../../../../common/codecs/frontMatterCodec/tokens/frontMatterSequence.js';

suite('FrontMatterSequence', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('• extends \'FrontMatterValueToken\'', () => {
		const sequence = new FrontMatterSequence([
			new Word(
				new Range(1, 1, 1, 5),
				'test',
			),
		]);

		assert(
			sequence instanceof FrontMatterValueToken,
			'Must extend FrontMatterValueToken class.',
		);
	});

	test('• throws if no tokens provided', () => {
		assert.throws(() => {
			new FrontMatterSequence([]);
		});
	});
});
