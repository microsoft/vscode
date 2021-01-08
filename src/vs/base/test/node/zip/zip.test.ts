/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'vs/base/common/path';
import * as os from 'os';
import { extract } from 'vs/base/node/zip';
import { generateUuid } from 'vs/base/common/uuid';
import { rimraf, exists } from 'vs/base/node/pfs';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { createCancelablePromise } from 'vs/base/common/async';

const fixtures = getPathFromAmdModule(require, './fixtures');

suite('Zip', () => {

	test('extract should handle directories', async () => {
		const fixture = path.join(fixtures, 'extract.zip');
		const target = path.join(os.tmpdir(), generateUuid());

		await createCancelablePromise(token => extract(fixture, target, {}, token));
		const doesExist = await exists(path.join(target, 'extension'));
		assert(doesExist);

		return rimraf(target);
	});
});
