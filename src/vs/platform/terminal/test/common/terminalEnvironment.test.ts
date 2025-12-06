/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { collapseTildePath, sanitizeCwd, escapeNonWindowsPath } from '../../common/terminalEnvironment.js';
import { PosixShellType, WindowsShellType, GeneralShellType } from '../../common/terminal.js';

suite('terminalEnvironment', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('collapseTildePath', () => {
		test('should return empty string for a falsy path', () => {
			strictEqual(collapseTildePath('', '/foo', '/'), '');
			strictEqual(collapseTildePath(undefined, '/foo', '/'), '');
		});
		test('should return path for a falsy user home', () => {
			strictEqual(collapseTildePath('/foo', '', '/'), '/foo');
			strictEqual(collapseTildePath('/foo', undefined, '/'), '/foo');
		});
		test('should not collapse when user home isn\'t present', () => {
			strictEqual(collapseTildePath('/foo', '/bar', '/'), '/foo');
			strictEqual(collapseTildePath('C:\\foo', 'C:\\bar', '\\'), 'C:\\foo');
		});
		test('should collapse with Windows separators', () => {
			strictEqual(collapseTildePath('C:\\foo\\bar', 'C:\\foo', '\\'), '~\\bar');
			strictEqual(collapseTildePath('C:\\foo\\bar', 'C:\\foo\\', '\\'), '~\\bar');
			strictEqual(collapseTildePath('C:\\foo\\bar\\baz', 'C:\\foo\\', '\\'), '~\\bar\\baz');
			strictEqual(collapseTildePath('C:\\foo\\bar\\baz', 'C:\\foo', '\\'), '~\\bar\\baz');
		});
		test('should collapse mixed case with Windows separators', () => {
			strictEqual(collapseTildePath('c:\\foo\\bar', 'C:\\foo', '\\'), '~\\bar');
			strictEqual(collapseTildePath('C:\\foo\\bar\\baz', 'c:\\foo', '\\'), '~\\bar\\baz');
		});
		test('should collapse with Posix separators', () => {
			strictEqual(collapseTildePath('/foo/bar', '/foo', '/'), '~/bar');
			strictEqual(collapseTildePath('/foo/bar', '/foo/', '/'), '~/bar');
			strictEqual(collapseTildePath('/foo/bar/baz', '/foo', '/'), '~/bar/baz');
			strictEqual(collapseTildePath('/foo/bar/baz', '/foo/', '/'), '~/bar/baz');
		});
	});
	suite('sanitizeCwd', () => {
		if (OS === OperatingSystem.Windows) {
			test('should make the Windows drive letter uppercase', () => {
				strictEqual(sanitizeCwd('c:\\foo\\bar'), 'C:\\foo\\bar');
			});
		}
		test('should remove any wrapping quotes', () => {
			strictEqual(sanitizeCwd('\'/foo/bar\''), '/foo/bar');
			strictEqual(sanitizeCwd('"/foo/bar"'), '/foo/bar');
		});
	});

	suite('escapeNonWindowsPath', () => {
		test('should escape for bash/sh/zsh shells', () => {
			strictEqual(escapeNonWindowsPath('/foo/bar', PosixShellType.Bash), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz', PosixShellType.Bash), '\'/foo/bar\\\'baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar"baz', PosixShellType.Bash), '\'/foo/bar"baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz"qux', PosixShellType.Bash), '$\'/foo/bar\\\'baz"qux\'');
			strictEqual(escapeNonWindowsPath('/foo/bar', PosixShellType.Sh), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz', PosixShellType.Sh), '\'/foo/bar\\\'baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar', PosixShellType.Zsh), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz', PosixShellType.Zsh), '\'/foo/bar\\\'baz\'');
		});

		test('should escape for git bash', () => {
			strictEqual(escapeNonWindowsPath('/foo/bar', WindowsShellType.GitBash), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz', WindowsShellType.GitBash), '\'/foo/bar\\\'baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar"baz', WindowsShellType.GitBash), '\'/foo/bar"baz\'');
		});

		test('should escape for fish shell', () => {
			strictEqual(escapeNonWindowsPath('/foo/bar', PosixShellType.Fish), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz', PosixShellType.Fish), '\'/foo/bar\\\'baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar"baz', PosixShellType.Fish), '\'/foo/bar"baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz"qux', PosixShellType.Fish), '"/foo/bar\'baz\\"qux"');
		});

		test('should escape for PowerShell', () => {
			strictEqual(escapeNonWindowsPath('/foo/bar', GeneralShellType.PowerShell), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz', GeneralShellType.PowerShell), '\'/foo/bar\'\'baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar"baz', GeneralShellType.PowerShell), '\'/foo/bar"baz\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz"qux', GeneralShellType.PowerShell), '"/foo/bar\'baz`"qux"');
		});

		test('should default to POSIX escaping for unknown shells', () => {
			strictEqual(escapeNonWindowsPath('/foo/bar'), '\'/foo/bar\'');
			strictEqual(escapeNonWindowsPath('/foo/bar\'baz'), '\'/foo/bar\\\'baz\'');
		});

		test('should remove dangerous characters', () => {
			strictEqual(escapeNonWindowsPath('/foo/bar$(echo evil)', PosixShellType.Bash), '\'/foo/bar(echo evil)\'');
			strictEqual(escapeNonWindowsPath('/foo/bar`whoami`', PosixShellType.Bash), '\'/foo/barwhoami\'');
		});
	});
});
