/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { OffsetRange } from 'vs/editor/common/core/offsetRange';
import { PositionOffsetTransformer } from 'vs/editor/common/core/positionToOffset';

suite('PositionOffsetTransformer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const str = '123456\nabcdef\nghijkl\nmnopqr';

	const t = new PositionOffsetTransformer(str);
	test('getPosition', () => {
		assert.deepStrictEqual(
			new OffsetRange(0, str.length + 2).map(i => t.getPosition(i).toString()),
			[
				"(1,1)",
				"(1,2)",
				"(1,3)",
				"(1,4)",
				"(1,5)",
				"(1,6)",
				"(1,7)",
				"(2,1)",
				"(2,2)",
				"(2,3)",
				"(2,4)",
				"(2,5)",
				"(2,6)",
				"(2,7)",
				"(3,1)",
				"(3,2)",
				"(3,3)",
				"(3,4)",
				"(3,5)",
				"(3,6)",
				"(3,7)",
				"(4,1)",
				"(4,2)",
				"(4,3)",
				"(4,4)",
				"(4,5)",
				"(4,6)",
				"(4,7)",
				"(4,8)"
			]
		);
	});

	test('getOffset', () => {
		for (let i = 0; i < str.length + 2; i++) {
			assert.strictEqual(t.getOffset(t.getPosition(i)), i);
		}
	});
});
