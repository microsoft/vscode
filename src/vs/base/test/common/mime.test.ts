/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getExtensionForMimeType, normalizeMimeType } from '../../common/mime.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Mime', () => {

	test('normalize', () => {
		assert.strictEqual(normalizeMimeType('invalid'), 'invalid');
		assert.strictEqual(normalizeMimeType('invalid', true), undefined);
		assert.strictEqual(normalizeMimeType('Text/plain'), 'text/plain');
		assert.strictEqual(normalizeMimeType('Text/pläin'), 'text/pläin');
		assert.strictEqual(normalizeMimeType('Text/plain;UPPER'), 'text/plain;UPPER');
		assert.strictEqual(normalizeMimeType('Text/plain;lower'), 'text/plain;lower');
	});

	test('getExtensionForMimeType', () => {
		// Note: for MIME types with multiple extensions (e.g., image/jpg -> .jpe, .jpeg, .jpg),
		// the function returns the first matching extension in iteration order
		assert.ok(['.jpe', '.jpeg', '.jpg'].includes(getExtensionForMimeType('image/jpg')!));
		// image/jpeg is an alias for image/jpg and should also return a valid extension
		assert.ok(['.jpe', '.jpeg', '.jpg'].includes(getExtensionForMimeType('image/jpeg')!));
		assert.strictEqual(getExtensionForMimeType('image/png'), '.png');
		assert.strictEqual(getExtensionForMimeType('image/gif'), '.gif');
		assert.strictEqual(getExtensionForMimeType('image/webp'), '.webp');
		assert.ok(['.mp2', '.mp2a', '.mp3', '.mpga', '.m2a', '.m3a'].includes(getExtensionForMimeType('audio/mpeg')!));
		assert.ok(['.mp4', '.mp4v', '.mpg4'].includes(getExtensionForMimeType('video/mp4')!));
		assert.strictEqual(getExtensionForMimeType('unknown/type'), undefined);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
