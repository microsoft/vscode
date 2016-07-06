/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import * as path from 'path';
import * as os from 'os';
import URI from 'vs/base/common/uri';
import { extract } from 'vs/base/node/zip';
import { generateUuid } from 'vs/base/common/uuid';
import { rimraf, exists } from 'vs/base/node/pfs';

const fixtures = URI.parse(require.toUrl('./fixtures')).fsPath;

suite('Zip', () => {

	test('extract should handle directories', () => {
		const fixture = path.join(fixtures, 'extract.zip');
		const target = path.join(os.tmpdir(), generateUuid());

		return extract(fixture, target)
			.then(() => exists(path.join(target, 'extension', '1', '2', 'README.md')))
			.then(exists => assert(exists))
			.then(() => rimraf(target));
	});
});