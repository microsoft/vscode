/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/contrib/terminal/common/terminalEnvironment';
import { URI as Uri } from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';

suite('Workbench - TerminalEnvironment', () => {
	test('addTerminalEnvironmentKeys', () => {
		const env: { [key: string]: any } = { FOO: 'bar' };
		const locale = 'en-au';
		terminalEnvironment.addTerminalEnvironmentKeys(env, '1.2.3', locale, true);
		assert.equal(env['TERM_PROGRAM'], 'vscode');
		assert.equal(env['TERM_PROGRAM_VERSION'], '1.2.3');
		assert.equal(env['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const env2: { [key: string]: any } = { FOO: 'bar' };
		terminalEnvironment.addTerminalEnvironmentKeys(env2, '1.2.3', undefined, true);
		assert.equal(env2['LANG'], 'en_US.UTF-8', 'LANG is equal to en_US.UTF-8 as fallback.'); // More info on issue #14586

		const env3 = { LANG: 'replace' };
		terminalEnvironment.addTerminalEnvironmentKeys(env3, '1.2.3', undefined, true);
		assert.equal(env3['LANG'], 'en_US.UTF-8', 'LANG is set to the fallback LANG');

		const env4 = { LANG: 'en_US.UTF-8' };
		terminalEnvironment.addTerminalEnvironmentKeys(env3, '1.2.3', undefined, true);
		assert.equal(env4['LANG'], 'en_US.UTF-8', 'LANG is equal to the parent environment\'s LANG');
	});

	suite('mergeEnvironments', () => {
		test('should add keys', () => {
			const parent = {
				a: 'b'
			};
			const other = {
				c: 'd'
			};
			terminalEnvironment.mergeEnvironments(parent, other);
			assert.deepEqual(parent, {
				a: 'b',
				c: 'd'
			});
		});

		test('should add keys ignoring case on Windows', () => {
			if (!platform.isWindows) {
				return;
			}
			const parent = {
				a: 'b'
			};
			const other = {
				A: 'c'
			};
			terminalEnvironment.mergeEnvironments(parent, other);
			assert.deepEqual(parent, {
				a: 'c'
			});
		});

		test('null values should delete keys from the parent env', () => {
			const parent = {
				a: 'b',
				c: 'd'
			};
			const other: IStringDictionary<string | null> = {
				a: null
			};
			terminalEnvironment.mergeEnvironments(parent, other);
			assert.deepEqual(parent, {
				c: 'd'
			});
		});

		test('null values should delete keys from the parent env ignoring case on Windows', () => {
			if (!platform.isWindows) {
				return;
			}
			const parent = {
				a: 'b',
				c: 'd'
			};
			const other: IStringDictionary<string | null> = {
				A: null
			};
			terminalEnvironment.mergeEnvironments(parent, other);
			assert.deepEqual(parent, {
				c: 'd'
			});
		});
	});

	suite('getCwd', () => {
		// This helper checks the paths in a cross-platform friendly manner
		function assertPathsMatch(a: string, b: string): void {
			assert.equal(Uri.file(a).fsPath, Uri.file(b).fsPath);
		}

		test('should default to userHome for an empty workspace', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, undefined, undefined), '/userHome/');
		});

		test('should use to the workspace if it exists', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, Uri.file('/foo'), undefined), '/foo');
		});

		test('should use an absolute custom cwd as is', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, undefined, '/foo'), '/foo');
		});

		test('should normalize a relative custom cwd against the workspace path', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, Uri.file('/bar'), 'foo'), '/bar/foo');
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, Uri.file('/bar'), './foo'), '/bar/foo');
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, Uri.file('/bar'), '../foo'), '/foo');
		});

		test('should fall back for relative a custom cwd that doesn\'t have a workspace', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, undefined, 'foo'), '/userHome/');
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, undefined, './foo'), '/userHome/');
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, '/userHome/', undefined, undefined, undefined, '../foo'), '/userHome/');
		});

		test('should ignore custom cwd when told to ignore', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [], ignoreConfigurationCwd: true }, '/userHome/', undefined, undefined, Uri.file('/bar'), '/foo'), '/bar');
		});
	});

	suite('getDefaultShell', () => {
		test('should change Sysnative to System32 in non-WoW64 systems', () => {
			const shell = terminalEnvironment.getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': { user: 'C:\\Windows\\Sysnative\\cmd.exe', value: undefined, default: undefined }
				} as any)[key];
			}, false, 'DEFAULT', false, 'C:\\Windows', undefined, undefined, {} as any, false, platform.Platform.Windows);
			assert.equal(shell, 'C:\\Windows\\System32\\cmd.exe');
		});

		test('should not change Sysnative to System32 in WoW64 systems', () => {
			const shell = terminalEnvironment.getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': { user: 'C:\\Windows\\Sysnative\\cmd.exe', value: undefined, default: undefined }
				} as any)[key];
			}, false, 'DEFAULT', true, 'C:\\Windows', undefined, undefined, {} as any, false, platform.Platform.Windows);
			assert.equal(shell, 'C:\\Windows\\Sysnative\\cmd.exe');
		});

		test('should use automationShell when specified', () => {
			const shell1 = terminalEnvironment.getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': { user: 'shell', value: undefined, default: undefined },
					'terminal.integrated.automationShell.windows': { user: undefined, value: undefined, default: undefined }
				} as any)[key];
			}, false, 'DEFAULT', false, 'C:\\Windows', undefined, undefined, {} as any, false, platform.Platform.Windows);
			assert.equal(shell1, 'shell', 'automationShell was false');
			const shell2 = terminalEnvironment.getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': { user: 'shell', value: undefined, default: undefined },
					'terminal.integrated.automationShell.windows': { user: undefined, value: undefined, default: undefined }
				} as any)[key];
			}, false, 'DEFAULT', false, 'C:\\Windows', undefined, undefined, {} as any, true, platform.Platform.Windows);
			assert.equal(shell2, 'shell', 'automationShell was true');
			const shell3 = terminalEnvironment.getDefaultShell(key => {
				return ({
					'terminal.integrated.shell.windows': { user: 'shell', value: undefined, default: undefined },
					'terminal.integrated.automationShell.windows': { user: 'automationShell', value: undefined, default: undefined }
				} as any)[key];
			}, false, 'DEFAULT', false, 'C:\\Windows', undefined, undefined, {} as any, true, platform.Platform.Windows);
			assert.equal(shell3, 'automationShell', 'automationShell was true and specified in settings');
		});
	});
});
