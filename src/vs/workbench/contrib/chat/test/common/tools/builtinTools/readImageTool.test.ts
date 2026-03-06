/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { getSupportedImageMimeType } from '../../../../common/tools/builtinTools/readImageTool.js';

suite('getSupportedImageMimeType', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('should return correct MIME types for supported extensions', () => {
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.png')), 'image/png');
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.jpg')), 'image/jpeg');
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.jpeg')), 'image/jpeg');
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.gif')), 'image/gif');
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.webp')), 'image/webp');
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.bmp')), 'image/bmp');
	});

	test('should be case-insensitive', () => {
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.PNG')), 'image/png');
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.JPG')), 'image/jpeg');
	});

	test('should return undefined for unsupported extensions', () => {
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.pdf')), undefined);
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.txt')), undefined);
		assert.strictEqual(getSupportedImageMimeType(URI.parse('file:///test.svg')), undefined);
	});
});
