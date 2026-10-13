/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseLsofCwd } from '../../node/terminalProcess.js';

suite('TerminalProcess', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parseLsofCwd parses cwd from lsof field output', () => {
		const stdout = 'p1234\nfcwd\nn/Users/test/project\n';

		assert.strictEqual(parseLsofCwd(stdout), '/Users/test/project');
	});

	test('parseLsofCwd does not mistake a path containing cwd for the cwd field', () => {
		const stdout = 'p1234\nfcwd\nn/Users/test/project-cwd-name\n';

		assert.strictEqual(parseLsofCwd(stdout), '/Users/test/project-cwd-name');
	});

	test('parseLsofCwd returns undefined when no name field exists', () => {
		const stdout = 'p1234\nfcwd\n';

		assert.strictEqual(parseLsofCwd(stdout), undefined);
	});
});
