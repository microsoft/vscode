/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as Platform from '../../common/platform.js';
import { detectLibc } from '../../node/libc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('libc', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns one of the two known values', () => {
		const family = detectLibc();
		assert.ok(family === 'glibc' || family === 'musl', `unexpected libc family: ${family}`);
	});

	test('non-Linux platforms are reported as glibc by convention', () => {
		if (!Platform.isLinux) {
			assert.strictEqual(detectLibc(), 'glibc');
		}
	});

	test('caches the result across calls', () => {
		const first = detectLibc();
		const second = detectLibc();
		assert.strictEqual(first, second);
	});
});
