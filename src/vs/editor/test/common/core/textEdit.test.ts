/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { OffsetRange } from '../../../common/core/offsetRange.js';
import { StringText } from '../../../common/core/textEdit.js';
import { Random } from './random.js';

suite('TextEdit', () => {
	suite('inverse', () => {
		ensureNoDisposablesAreLeakedInTestSuite();

		function runTest(seed: number): void {
			const rand = Random.create(seed);
			const source = new StringText(rand.nextMultiLineString(10, new OffsetRange(0, 10)));

			const edit = rand.nextTextEdit(source, rand.nextIntRange(1, 5));
			const invEdit = edit.inverse(source);

			const s1 = edit.apply(source);
			const s2 = invEdit.applyToString(s1);

			assert.deepStrictEqual(s2, source.value);
		}

		test.skip('brute-force', () => {
			for (let i = 0; i < 100_000; i++) {
				runTest(i);
			}
		});

		for (let seed = 0; seed < 20; seed++) {
			test(`test ${seed}`, () => runTest(seed));
		}
	});
});
