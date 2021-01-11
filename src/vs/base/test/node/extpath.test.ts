/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import * as pfs from 'vs/base/node/pfs';
import { realcaseSync, realpath, realpathSync } from 'vs/base/node/extpath';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';

suite('Extpath', () => {

	test('realcase', async () => {
		const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'extpath');
		const newDir = path.join(parentDir, 'newdir');

		await pfs.mkdirp(newDir, 493);

		// assume case insensitive file system
		if (process.platform === 'win32' || process.platform === 'darwin') {
			const upper = newDir.toUpperCase();
			const real = realcaseSync(upper);

			if (real) { // can be null in case of permission errors
				assert.notEqual(real, upper);
				assert.equal(real.toUpperCase(), upper);
				assert.equal(real, newDir);
			}
		}

		// linux, unix, etc. -> assume case sensitive file system
		else {
			const real = realcaseSync(newDir);
			assert.equal(real, newDir);
		}

		await pfs.rimraf(parentDir);
	});

	test('realpath', async () => {
		const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'extpath');
		const newDir = path.join(parentDir, 'newdir');

		await pfs.mkdirp(newDir, 493);

		const realpathVal = await realpath(newDir);
		assert.ok(realpathVal);

		await pfs.rimraf(parentDir);
	});

	test('realpathSync', async () => {
		const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'extpath');
		const newDir = path.join(parentDir, 'newdir');

		await pfs.mkdirp(newDir, 493);

		let realpath!: string;
		try {
			realpath = realpathSync(newDir);
		} catch (error) {
			assert.ok(!error);
		}
		assert.ok(realpath!);

		await pfs.rimraf(parentDir);
	});
});
