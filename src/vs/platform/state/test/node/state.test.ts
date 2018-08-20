/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as extfs from 'vs/base/node/extfs';
import { getRandomTestPath } from 'vs/workbench/test/workbenchTestServices';
import { FileStorage } from 'vs/platform/state/node/stateService';

suite('StateService', () => {
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'stateservice');
	const storageFile = path.join(parentDir, 'storage.json');

	teardown(done => {
		extfs.del(parentDir, os.tmpdir(), done);
	});

	test('Basics', () => {
		return extfs.mkdirp(parentDir).then(() => {
			extfs.writeFileAndFlushSync(storageFile, '');

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

			service.setItem('some.undefined.key', void 0);
			assert.equal(service.getItem('some.undefined.key', 'some.default'), 'some.default');

			service.setItem('some.null.key', null);
			assert.equal(service.getItem('some.null.key', 'some.default'), 'some.default');
		});
	});
});