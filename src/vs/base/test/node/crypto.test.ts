/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../common/path.js';
import { checksum } from '../../node/crypto.js';
import { Promises } from '../../node/pfs.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { flakySuite, getRandomTestPath } from './testUtils.js';

flakySuite('Crypto', () => {

	let testDir: string;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(function () {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'crypto');

		return fs.promises.mkdir(testDir, { recursive: true });
	});

	teardown(function () {
		return Promises.rm(testDir);
	});

	test('checksum', async () => {
		const testFile = join(testDir, 'checksum.txt');
		await Promises.writeFile(testFile, 'Hello World');

		await checksum(testFile, 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e');
	});
});
