/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { mkdirp, rimraf } from 'vs/base/node/pfs';
import { realcaseSync, realpath, realpathSync } from 'vs/base/node/extpath';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';

flakySuite('Extpath', () => {
	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'extpath');

		return mkdirp(testDir, 493);
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
				assert.notEqual(real, upper);
				assert.equal(real.toUpperCase(), upper);
				assert.equal(real, testDir);
			}
		}

		// linux, unix, etc. -> assume case sensitive file system
		else {
			const real = realcaseSync(testDir);
			assert.equal(real, testDir);
		}
	});

	test('realpath', async () => {
		const realpathVal = await realpath(testDir);
		assert.ok(realpathVal);
	});

	test('realpathSync', async () => {
		try {
			const realpath = realpathSync(testDir);
			assert.ok(realpath);
		} catch (error) {
			assert.fail(error);
		}
	});
});
