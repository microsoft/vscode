/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { originalFSPath } from 'vs/workbench/api/node/extHost.api.impl';

suite('ExtHost API', function () {
	test('issue #51387: originalFSPath', function () {
		assert.equal(originalFSPath(URI.file('C:\\test')).charAt(0), 'C');
		assert.equal(originalFSPath(URI.file('c:\\test')).charAt(0), 'c');

		assert.equal(originalFSPath(URI.revive(JSON.parse(JSON.stringify(URI.file('C:\\test'))))).charAt(0), 'C');
		assert.equal(originalFSPath(URI.revive(JSON.parse(JSON.stringify(URI.file('c:\\test'))))).charAt(0), 'c');
	});
});
