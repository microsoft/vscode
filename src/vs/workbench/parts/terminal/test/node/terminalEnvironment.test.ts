/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as os from 'os';
import * as platform from 'vs/base/common/platform';
import * as terminalEnvironment from 'vs/workbench/parts/terminal/node/terminalEnvironment';
import { URI as Uri } from 'vs/base/common/uri';
import { IStringDictionary } from 'vs/base/common/collections';

suite('Workbench - TerminalEnvironment', () => {
	test('addTerminalEnvironmentKeys', () => {
		const env = { FOO: 'bar' };
		const locale = 'en-au';
		terminalEnvironment.addTerminalEnvironmentKeys(env, locale, true);
		assert.equal(env['TERM_PROGRAM'], 'vscode');
		assert.equal(env['TERM_PROGRAM_VERSION'].search(/^\d+\.\d+\.\d+$/), 0);
		assert.equal(env['LANG'], 'en_AU.UTF-8', 'LANG is equal to the requested locale with UTF-8');

		const env2 = { FOO: 'bar' };
		terminalEnvironment.addTerminalEnvironmentKeys(env2, undefined, true);
		assert.equal(env2['LANG'], 'en_US.UTF-8', 'LANG is equal to en_US.UTF-8 as fallback.'); // More info on issue #14586

		const env3 = { LANG: 'replace' };
		terminalEnvironment.addTerminalEnvironmentKeys(env3, undefined, true);
		assert.equal(env3['LANG'], 'en_US.UTF-8', 'LANG is set to the fallback LANG');

		const env4 = { LANG: 'en_US.UTF-8' };
		terminalEnvironment.addTerminalEnvironmentKeys(env3, undefined, true);
		assert.equal(env4['LANG'], 'en_US.UTF-8', 'LANG is equal to the parent environment\'s LANG');
	});

	test('sanitizeEnvironment', () => {
		let env = {
			FOO: 'bar',
			ELECTRON_ENABLE_STACK_DUMPING: 'x',
			ELECTRON_ENABLE_LOGGING: 'x',
			ELECTRON_NO_ASAR: 'x',
			ELECTRON_NO_ATTACH_CONSOLE: 'x',
			ELECTRON_RUN_AS_NODE: 'x',
			GOOGLE_API_KEY: 'x',
			VSCODE_CLI: 'x',
			VSCODE_DEV: 'x',
			VSCODE_IPC_HOOK: 'x',
			VSCODE_LOGS: 'x',
			VSCODE_NLS_CONFIG: 'x',
			VSCODE_PORTABLE: 'x',
			VSCODE_PID: 'x',
			VSCODE_NODE_CACHED_DATA_DIR: 'x'
		};
		terminalEnvironment.sanitizeEnvironment(env);
		assert.equal(env['FOO'], 'bar');
		assert.equal(Object.keys(env).length, 1);
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

		test('should default to os.homedir() for an empty workspace', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, undefined, undefined), os.homedir());
		});

		test('should use to the workspace if it exists', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, Uri.file('/foo'), undefined), '/foo');
		});

		test('should use an absolute custom cwd as is', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, undefined, '/foo'), '/foo');
		});

		test('should normalize a relative custom cwd against the workspace path', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, Uri.file('/bar'), 'foo'), '/bar/foo');
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, Uri.file('/bar'), './foo'), '/bar/foo');
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, Uri.file('/bar'), '../foo'), '/foo');
		});

		test('should fall back for relative a custom cwd that doesn\'t have a workspace', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, undefined, 'foo'), os.homedir());
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, undefined, './foo'), os.homedir());
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [] }, undefined, '../foo'), os.homedir());
		});

		test('should ignore custom cwd when told to ignore', () => {
			assertPathsMatch(terminalEnvironment.getCwd({ executable: undefined, args: [], ignoreConfigurationCwd: true }, Uri.file('/bar'), '/foo'), '/bar');
		});
	});

	test('preparePathForTerminal', () => {
		if (platform.isWindows) {
			assert.equal(terminalEnvironment.preparePathForTerminal('C:\\foo'), 'C:\\foo');
			assert.equal(terminalEnvironment.preparePathForTerminal('C:\\foo bar'), '"C:\\foo bar"');
			return;
		}
		assert.equal(terminalEnvironment.preparePathForTerminal('/a/\\foo bar"\'? ;\'??  :'), '/a/\\\\foo\\ bar\\"\\\'\\?\\ \\;\\\'\\?\\?\\ \\ \\:');
		assert.equal(terminalEnvironment.preparePathForTerminal('/\\\'"?:;!*(){}[]'), '/\\\\\\\'\\"\\?\\:\\;\\!\\*\\(\\)\\{\\}\\[\\]');
	});
});
