/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import { flakySuite, getRandomTestPath } from 'vs/base/test/node/testUtils';
import { FileStorage } from 'vs/platform/state/node/stateService';
import { mkdirp, rimraf, writeFileSync } from 'vs/base/node/pfs';

flakySuite('StateService', () => {

	test('Basics', async function () {
		const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'stateservice');
		await mkdirp(parentDir);

		const storageFile = path.join(parentDir, 'storage.json');
		writeFileSync(storageFile, '');

		let service = new FileStorage(storageFile, () => null);

		service.setItem('some.key', 'some.value');
		assert.equal(service.getItem('some.key'), 'some.value');

		service.removeItem('some.key');
		assert.equal(service.getItem('some.key', 'some.default'), 'some.default');

		assert.ok(!service.getItem('some.unknonw.key'));

		service.setItem('some.other.key', 'some.other.value');

		service = new FileStorage(storageFile, () => null);

		assert.equal(service.getItem('some.other.key'), 'some.other.value');

		service.setItem('some.other.key', 'some.other.value');
		assert.equal(service.getItem('some.other.key'), 'some.other.value');

		service.setItem('some.undefined.key', undefined);
		assert.equal(service.getItem('some.undefined.key', 'some.default'), 'some.default');

		service.setItem('some.null.key', null);
		assert.equal(service.getItem('some.null.key', 'some.default'), 'some.default');

		await rimraf(parentDir);
	});
});
