/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/parts/terminal/node/terminalEnvironment';
import Uri from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';
import { IShellLaunchConfig, ITerminalConfigHelper } from 'vs/workbench/parts/terminal/common/terminal';

suite('Workbench - TerminalEnvironment', () => {
	test('createTerminalEnv', function () {
		const shell1 = {
			executable: '/bin/foosh',
			args: ['-bar', 'baz']
		};
		const parentEnv1: IStringDictionary<string> = {
			ok: true
		} as any;
		const env1 = terminalEnvironment.createTerminalEnv(parentEnv1, shell1, '/foo', 'en-au');
		assert.ok(env1['ok'], 'Parent environment is copied');
		assert.deepStrictEqual(parentEnv1, { ok: true }, 'Parent environment is unchanged');
		assert.equal(env1['PTYPID'], process.pid.toString(), 'PTYPID is equal to the current PID');
		assert.equal(env1['PTYSHELL'], '/bin/foosh', 'PTYSHELL is equal to the provided shell');
		assert.equal(env1['PTYSHELLARG0'], '-bar', 'PTYSHELLARG0 is equal to the first shell argument');
		assert.equal(env1['PTYSHELLARG1'], 'baz', 'PTYSHELLARG1 is equal to the first shell argument');
		assert.ok(!('PTYSHELLARG2' in env1), 'PTYSHELLARG2 is unset');
		assert.equal(env1['PTYCWD'], '/foo', 'PTYCWD is equal to requested cwd');
		assert.equal(env1['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const shell2: IShellLaunchConfig = {
			executable: '/bin/foosh',
			args: []
		};
		const parentEnv2: IStringDictionary<string> = {
			LANG: 'en_US.UTF-8'
		};
		const env2 = terminalEnvironment.createTerminalEnv(parentEnv2, shell2, '/foo', 'en-au');
		assert.ok(!('PTYSHELLARG0' in env2), 'PTYSHELLARG0 is unset');
		assert.equal(env2['PTYCWD'], '/foo', 'PTYCWD is equal to /foo');
		assert.equal(env2['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const env3 = terminalEnvironment.createTerminalEnv(parentEnv1, shell1, '/', null);
		assert.equal(env3['LANG'], 'en_US.UTF-8', 'LANG is equal to en_US.UTF-8 as fallback.'); // More info on issue #14586

		const env4 = terminalEnvironment.createTerminalEnv(parentEnv2, shell1, '/', null);
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
			const other: IStringDictionary<string> = {
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
			const other: IStringDictionary<string> = {
				A: null
			};
			terminalEnvironment.mergeEnvironments(parent, other);
			assert.deepEqual(parent, {
				c: 'd'
			});
		});
	});

	suite('getCwd', () => {
		let configHelper: ITerminalConfigHelper;

		setup(() => {
			configHelper = <ITerminalConfigHelper>{
				config: {
					cwd: null
				}
			};
		});

		// This helper checks the paths in a cross-platform friendly manner
		function assertPathsMatch(a: string, b: string): void {
			assert.equal(Uri.file(a).fsPath, Uri.file(b).fsPath);
		}

		test('should default to os.homedir() for an empty workspace', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, null, configHelper), os.homedir());
		});

		test('should use to the workspace if it exists', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, Uri.file('/foo'), configHelper), '/foo');
		});

		test('should use an absolute custom cwd as is', () => {
			configHelper.config.cwd = '/foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, null, configHelper), '/foo');
		});

		test('should normalize a relative custom cwd against the workspace path', () => {
			configHelper.config.cwd = 'foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, Uri.file('/bar'), configHelper), '/bar/foo');
			configHelper.config.cwd = './foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, Uri.file('/bar'), configHelper), '/bar/foo');
			configHelper.config.cwd = '../foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, Uri.file('/bar'), configHelper), '/foo');
		});

		test('should fall back for relative a custom cwd that doesn\'t have a workspace', () => {
			configHelper.config.cwd = 'foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, null, configHelper), os.homedir());
			configHelper.config.cwd = './foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, null, configHelper), os.homedir());
			configHelper.config.cwd = '../foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [] }, null, configHelper), os.homedir());
		});

		test('should ignore custom cwd when told to ignore', () => {
			configHelper.config.cwd = '/foo';
			assertPathsMatch(terminalEnvironment.getCwd({ executable: null, args: [], ignoreConfigurationCwd: true }, Uri.file('/bar'), configHelper), '/bar');
		});
	});

	test('preparePathForTerminal', function () {
		if (platform.isWindows) {
			assert.equal(terminalEnvironment.preparePathForTerminal('C:\\foo'), 'C:\\foo');
			assert.equal(terminalEnvironment.preparePathForTerminal('C:\\foo bar'), '"C:\\foo bar"');
			return;
		}
		assert.equal(terminalEnvironment.preparePathForTerminal('/a/\\foo bar"\'? ;\'??  :'), '/a/\\\\foo\\ bar\\"\\\'\\?\\ \\;\\\'\\?\\?\\ \\ \\:');
		assert.equal(terminalEnvironment.preparePathForTerminal('/\\\'"?:;!*(){}[]'), '/\\\\\\\'\\"\\?\\:\\;\\!\\*\\(\\)\\{\\}\\[\\]');
	});
});