/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { promises } from 'fs';
import { rimraf } from 'vs/base/node/pfs';
import { realcaseSync, realpath, realpathSync } from 'vs/base/node/extpath';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';

flakySuite('Extpath', () => {
	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'extpath');

		return promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return rimraf(testDir);
	});

	test('realcase', async () => {

		// assume case insensitive file system
		if (process.platform === 'win32' || process.platform === 'darwin') {
			const upper = testDir.toUpperCase();
			const real = realcaseSync(upper);

			if (real) { // can be null in case of permission errors
				assert.notStrictEqual(real, upper);
				assert.strictEqual(real.toUpperCase(), upper);
				assert.strictEqual(real, testDir);
			}
		}

		// linux, unix, etc. -> assume case sensitive file system
		else {
			const real = realcaseSync(testDir);
			assert.strictEqual(real, testDir);
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
});
