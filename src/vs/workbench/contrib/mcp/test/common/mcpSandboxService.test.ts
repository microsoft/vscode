/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mcpDefaultCwdToFsPath } from '../../common/mcpSandboxService.js';

suite('MCP Sandbox Service', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('converts default cwd URIs for the target operating system', () => {
		assert.deepStrictEqual({
			linuxRemote: mcpDefaultCwdToFsPath(URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace'), OperatingSystem.Linux),
			windowsRemote: mcpDefaultCwdToFsPath(URI.parse('vscode-remote://ssh-remote+windows/c:/Users/test/workspace'), OperatingSystem.Windows),
			windowsUnc: mcpDefaultCwdToFsPath(URI.parse('file://server/share/workspace'), OperatingSystem.Windows),
		}, {
			linuxRemote: '/home/test/workspace',
			windowsRemote: 'c:\\Users\\test\\workspace',
			windowsUnc: '\\\\server\\share\\workspace',
		});
	});
});
