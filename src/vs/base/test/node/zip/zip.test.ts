/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import assert from 'assert';
import { tmpdir } from 'os';
import { createCancelablePromise } from '../../../common/async.js';
import { FileAccess } from '../../../common/network.js';
import * as path from '../../../common/path.js';
import { Promises } from '../../../node/pfs.js';
import { extract } from '../../../node/zip.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../common/utils.js';
import { getRandomTestPath } from '../testUtils.js';

suite('Zip', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extract should handle directories', async () => {
		const testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');
		await fs.promises.mkdir(testDir, { recursive: true });

		const fixtures = FileAccess.asFileUri('vs/base/test/node/zip/fixtures').fsPath;
		const fixture = path.join(fixtures, 'extract.zip');

		await createCancelablePromise(token => extract(fixture, testDir, {}, token));
		const doesExist = await Promises.exists(path.join(testDir, 'extension'));
		assert(doesExist);

		await Promises.rm(testDir);
	});
});
