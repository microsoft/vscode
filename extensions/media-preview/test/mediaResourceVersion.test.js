/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('assert');
const { getMediaResourceVersion } = require('../out/mediaResourceVersion');

suite('mediaResourceVersion', () => {
	test('uses a stable version while the resource stat is unchanged', () => {
		const resource = { toString: () => 'file:///image.png' };
		const stat = { mtime: 123, size: 456 };

		assert.strictEqual(getMediaResourceVersion(resource, stat), getMediaResourceVersion(resource, stat));
	});

	test('changes the version when the resource stat changes', () => {
		const resource = { toString: () => 'file:///image.png' };

		assert.notStrictEqual(
			getMediaResourceVersion(resource, { mtime: 123, size: 456 }),
			getMediaResourceVersion(resource, { mtime: 124, size: 456 }),
		);
		assert.notStrictEqual(
			getMediaResourceVersion(resource, { mtime: 123, size: 456 }),
			getMediaResourceVersion(resource, { mtime: 123, size: 457 }),
		);
	});

	test('falls back to the resource identity when the resource stat is unavailable', () => {
		const resource = { toString: () => 'file:///image.png' };

		assert.strictEqual(getMediaResourceVersion(resource, undefined), 'file:///image.png');
	});
});
