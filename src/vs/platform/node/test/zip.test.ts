/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import { extract } from 'vs/platform/node/zip';
import { generateUuid } from 'vs/base/common/uuid';
import { rimraf, exists } from 'vs/base/node/pfs';
import { NullLogService } from 'vs/platform/log/common/log';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { createCancelablePromise } from 'vs/base/common/async';

const fixtures = getPathFromAmdModule(require, './fixtures');

suite('Zip', () => {

	test('extract should handle directories', () => {
		const fixture = path.join(fixtures, 'extract.zip');
		const target = path.join(os.tmpdir(), generateUuid());

		return createCancelablePromise(token => extract(fixture, target, {}, new NullLogService(), token)
			.then(() => exists(path.join(target, 'extension')))
			.then(exists => assert(exists))
			.then(() => rimraf(target)));
	});
});
