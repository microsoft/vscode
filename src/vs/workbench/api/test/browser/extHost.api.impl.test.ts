/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { originalFSPath } from '../../../../base/common/resources.js';
import { isWindows } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ExtHost API', function () {
	test('issue #51387: originalFSPath', function () {
		if (isWindows) {
			assert.strictEqual(originalFSPath(URI.file('C:\\test')).charAt(0), 'C');
			assert.strictEqual(originalFSPath(URI.file('c:\\test')).charAt(0), 'c');

			assert.strictEqual(originalFSPath(URI.revive(JSON.parse(JSON.stringify(URI.file('C:\\test'))))).charAt(0), 'C');
			assert.strictEqual(originalFSPath(URI.revive(JSON.parse(JSON.stringify(URI.file('c:\\test'))))).charAt(0), 'c');
		}
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
