/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { StringText } from 'vs/editor/common/core/textEdit';
import { Random } from 'vs/editor/test/common/core/random';

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
