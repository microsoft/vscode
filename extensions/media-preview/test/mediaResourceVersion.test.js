/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('assert');
const { getMediaResourceVersion } = require('../out/mediaResourceVersion');

suite('mediaResourceVersion', () => {
	test('uses a stable version while the resource stat is unchanged', () => {
		const stat = { mtime: 123, size: 456 };

		assert.strictEqual(getMediaResourceVersion(stat), getMediaResourceVersion(stat));
	});

	test('changes the version when the resource stat changes', () => {
		assert.notStrictEqual(
			getMediaResourceVersion({ mtime: 123, size: 456 }),
			getMediaResourceVersion({ mtime: 124, size: 456 }),
		);
		assert.notStrictEqual(
			getMediaResourceVersion({ mtime: 123, size: 456 }),
			getMediaResourceVersion({ mtime: 123, size: 457 }),
		);
	});

	test('uses a new fallback version when the resource stat is unavailable', () => {
		assert.notStrictEqual(getMediaResourceVersion(undefined), getMediaResourceVersion(undefined));
	});
});
