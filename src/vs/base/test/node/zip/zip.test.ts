/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { createCancelablePromise } from 'vs/base/common/async';
import * as path from 'vs/base/common/path';
import { Promises } from 'vs/base/node/pfs';
import { extract } from 'vs/base/node/zip';
import { getPathFromAmdModule, getRandomTestPath } from 'vs/base/test/node/testUtils';

suite('Zip', () => {

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'zip');

		return Promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return Promises.rm(testDir);
	});

	test('extract should handle directories', async () => {
		const fixtures = getPathFromAmdModule(require, './fixtures');
		const fixture = path.join(fixtures, 'extract.zip');

		await createCancelablePromise(token => extract(fixture, testDir, {}, token));
		const doesExist = await Promises.exists(path.join(testDir, 'extension'));
		assert(doesExist);
	});
});
