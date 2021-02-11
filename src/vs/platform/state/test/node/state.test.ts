/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { promises } from 'fs';
import { join } from 'vs/base/common/path';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { FileStorage } from 'vs/platform/state/node/stateService';
import { rimraf, writeFileSync } from 'vs/base/node/pfs';

flakySuite('StateService', () => {

	let testDir: string;

	setup(() => {
		testDir = getRandomTestPath(tmpdir(), 'vsctests', 'stateservice');

		return promises.mkdir(testDir, { recursive: true });
	});

	teardown(() => {
		return rimraf(testDir);
	});

	test('Basics', async function () {
		const storageFile = join(testDir, 'storage.json');
		writeFileSync(storageFile, '');

		let service = new FileStorage(storageFile, () => null);

		service.setItem('some.key', 'some.value');
		assert.strictEqual(service.getItem('some.key'), 'some.value');

		service.removeItem('some.key');
		assert.strictEqual(service.getItem('some.key', 'some.default'), 'some.default');

		assert.ok(!service.getItem('some.unknonw.key'));

		service.setItem('some.other.key', 'some.other.value');

		service = new FileStorage(storageFile, () => null);

		assert.strictEqual(service.getItem('some.other.key'), 'some.other.value');

		service.setItem('some.other.key', 'some.other.value');
		assert.strictEqual(service.getItem('some.other.key'), 'some.other.value');

		service.setItem('some.undefined.key', undefined);
		assert.strictEqual(service.getItem('some.undefined.key', 'some.default'), 'some.default');

		service.setItem('some.null.key', null);
		assert.strictEqual(service.getItem('some.null.key', 'some.default'), 'some.default');
	});
});
