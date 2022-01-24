/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { join } from 'vs/base/common/path';
import { checksum } from 'vs/base/node/crypto';
import { Promises } from 'vs/base/node/pfs';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';

flakySuite('Crypto', () => {

	let testDir: string;

	setup(function () {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'crypto');

		return Promises.mkdir(testDir, { recursive: true });
	});

	teardown(function () {
		return Promises.rm(testDir);
	});

	test('checksum', async () => {
		const testFile = join(testDir, 'checksum.txt');
		await Promises.writeFile(testFile, 'Hello World');

		await checksum(testFile, '0a4d55a8d778e5022fab701977c5d840bbc486d0');
	});
});
