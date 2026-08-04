/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getImageDimensionsForMaxDimension } from '../../common/imageResizeService.js';

suite('ImageResizeService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('constrains the long edge', () => {
		assert.deepStrictEqual(getImageDimensionsForMaxDimension(3072, 768, 2000), { width: 2000, height: 500 });
	});

	test('constrains panoramic images', () => {
		assert.deepStrictEqual(getImageDimensionsForMaxDimension(6144, 768, 2000), { width: 2000, height: 250 });
	});

	test('does not resize images already within the limit', () => {
		assert.deepStrictEqual(getImageDimensionsForMaxDimension(1024, 768, 2000), { width: 1024, height: 768 });
	});
});
