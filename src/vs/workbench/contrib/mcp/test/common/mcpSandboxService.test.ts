/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mcpDefaultCwdToFsPath, resolveMcpServerSandboxWorkingDirectory } from '../../common/mcpSandboxService.js';

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

	test('resolves relative cwd against the target-side default cwd', () => {
		const linuxDefaultCwd = URI.parse('vscode-remote://ssh-remote+linux/home/test/workspace');
		const windowsDefaultCwd = URI.parse('vscode-remote://ssh-remote+windows/c:/Users/test/workspace');
		const linuxUserHome = URI.parse('vscode-remote://ssh-remote+linux/home/test');

		assert.deepStrictEqual({
			linuxRelative: resolveMcpServerSandboxWorkingDirectory('./server', linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
			windowsRelative: resolveMcpServerSandboxWorkingDirectory('.\\server', windowsDefaultCwd, undefined, OperatingSystem.Windows),
			homeRelative: resolveMcpServerSandboxWorkingDirectory('./server', undefined, linuxUserHome, OperatingSystem.Linux),
			tildeRelative: resolveMcpServerSandboxWorkingDirectory('~/server', linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
			explicitAbsolute: resolveMcpServerSandboxWorkingDirectory('/explicit/server', linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
			implicit: resolveMcpServerSandboxWorkingDirectory(undefined, linuxDefaultCwd, linuxUserHome, OperatingSystem.Linux),
		}, {
			linuxRelative: '/home/test/workspace/server',
			windowsRelative: 'c:\\Users\\test\\workspace\\server',
			homeRelative: '/home/test/server',
			tildeRelative: '/home/test/server',
			explicitAbsolute: '/explicit/server',
			implicit: '/home/test/workspace',
		});
	});
});
