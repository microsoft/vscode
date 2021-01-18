/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'vs/base/common/path';
import { tmpdir } from 'os';
import { extract } from 'vs/base/node/zip';
import { rimraf, exists, mkdirp } from 'vs/base/node/pfs';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { createCancelablePromise } from 'vs/base/common/async';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';

suite('Zip', () => {

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');

		return mkdirp(testDir);
	});

	teardown(() => {
		return rimraf(testDir);
	});

	test('extract should handle directories', async () => {
		const fixtures = getPathFromAmdModule(require, './fixtures');
		const fixture = path.join(fixtures, 'extract.zip');

		await createCancelablePromise(token => extract(fixture, testDir, {}, token));
		const doesExist = await exists(path.join(testDir, 'extension'));
		assert(doesExist);
	});
});
