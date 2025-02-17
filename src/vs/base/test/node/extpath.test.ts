/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import assert from 'assert';
import { tmpdir } from 'os';
import { realcase, realpath, realpathSync } from '../../node/extpath.js';
import { Promises } from '../../node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { flakySuite, getRandomTestPath } from './testUtils.js';

flakySuite('Extpath', () => {
	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'extpath');

		return fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return Promises.rm(testDir);
	});

	test('realcase', async () => {

		// assume case insensitive file system
		if (process.platform === 'win32' || process.platform === 'darwin') {
			const upper = testDir.toUpperCase();
			const real = await realcase(upper);

			if (real) { // can be null in case of permission errors
				assert.notStrictEqual(real, upper);
				assert.strictEqual(real.toUpperCase(), upper);
				assert.strictEqual(real, testDir);
			}
		}

		// linux, unix, etc. -> assume case sensitive file system
		else {
			let real = await realcase(testDir);
			assert.strictEqual(real, testDir);

			real = await realcase(testDir.toUpperCase());
			assert.strictEqual(real, testDir.toUpperCase());
		}
	});

	test('realpath', async () => {
		const realpathVal = await realpath(testDir);
		assert.ok(realpathVal);
	});

	test('realpathSync', () => {
		const realpath = realpathSync(testDir);
		assert.ok(realpath);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
