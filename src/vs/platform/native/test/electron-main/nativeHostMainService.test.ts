/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toNativeDisplayLayout } from '../../common/nativeDisplay.js';

suite('NativeHostMainService', () => {

	test('maps display layout information', () => {
		const layout = toNativeDisplayLayout({
			id: 7,
			bounds: { x: 10, y: 20, width: 1920, height: 1080 },
			workArea: { x: 10, y: 40, width: 1920, height: 1040 },
			scaleFactor: 2
		});

		assert.deepStrictEqual(layout, {
			id: 7,
			bounds: { x: 10, y: 20, width: 1920, height: 1080 },
			workArea: { x: 10, y: 40, width: 1920, height: 1040 },
			scaleFactor: 2
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
