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

	test('non-Linux platforms return undefined', () => {
		if (!Platform.isLinux) {
			assert.strictEqual(detectLibc(), undefined);
		}
	});

	test('Linux returns one of the two known values', () => {
		if (Platform.isLinux) {
			const family = detectLibc();
			assert.ok(family === 'glibc' || family === 'musl', `unexpected libc family: ${family}`);
		}
	});

	test('caches the result across calls', () => {
		const first = detectLibc();
		const second = detectLibc();
		assert.strictEqual(first, second);
	});
});
