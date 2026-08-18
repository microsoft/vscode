/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { homedir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { resolveMcpServerWorkingDirectory } from '../../../node/shared/mcpServerWorkingDirectory.js';

suite('resolveMcpServerWorkingDirectory', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves defaults, relative paths, absolute paths, and home paths', () => {
		const defaultCwd = URI.file('/workspace');
		const absoluteCwd = '/explicit';
		assert.deepStrictEqual({
			defaulted: resolveMcpServerWorkingDirectory(undefined, defaultCwd),
			relative: resolveMcpServerWorkingDirectory('./relative', defaultCwd),
			absolute: resolveMcpServerWorkingDirectory(absoluteCwd, defaultCwd),
			home: resolveMcpServerWorkingDirectory('~/mcp', defaultCwd),
		}, {
			defaulted: defaultCwd.fsPath,
			relative: URI.file('/workspace/relative').fsPath,
			absolute: absoluteCwd,
			home: join(homedir(), 'mcp'),
		});
	});
});
