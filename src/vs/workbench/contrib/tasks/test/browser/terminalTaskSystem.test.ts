/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Platform } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';
import { CommandString, IShellConfiguration, ShellQuoting } from '../../common/tasks.js';

suite('TerminalTaskSystem shell command line', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function build(shell: string, args: CommandString[], platform = Platform.Linux, command: CommandString = 'echo', originalCommand: CommandString = command, options?: IShellConfiguration): string {
		const taskSystem = Object.create(TerminalTaskSystem.prototype) as { _buildShellCommandLine: TerminalTaskSystem['_buildShellCommandLine'] };
		return taskSystem._buildShellCommandLine(platform, shell, options, command, originalCommand, args);
	}

	for (const shell of ['bash', 'zsh', 'sh']) {
		test(`${shell} quotes shell-significant characters without spaces`, () => {
			const args = [...'; & | > < $ \\ ( ) { } # * ? ~ ! ` [ ] " \''.split(' '), '\t', '\r', '\n'];
			assert.deepStrictEqual(
				args.map(arg => build(shell, [arg])),
				args.map(arg => `echo '${arg === '\'' ? '\'\\\'\'' : arg}'`)
			);
		});
	}

	for (const shell of ['powershell.exe', 'pwsh.exe', 'pwsh']) {
		test(`${shell} quotes shell-significant characters and doubles embedded apostrophes`, () => {
			const args = [...'; & | > < $ ` ( ) { } [ ] , # @ % " \''.split(' '), '\t', '\r', '\n'];
			assert.deepStrictEqual(
				args.map(arg => build(shell, [arg])),
				args.map(arg => `echo '${arg === '\'' ? '\'\'' : arg}'`)
			);
		});
	}

	test('cmd quotes shell-significant characters without spaces', () => {
		const args = [...'& | > < ( ) ^ % !'.split(' '), '\t', '\r', '\n'];
		assert.deepStrictEqual(
			args.map(arg => build('cmd.exe', [arg], Platform.Windows)),
			args.map(arg => `echo "${arg}"`)
		);
	});

	test('safe arguments remain unquoted for the selected shell', () => {
		assert.deepStrictEqual([
			build('bash', ['file.txt', '--flag=value', '/tmp/file']),
			build('pwsh', ['C:\\file.txt', '*', '?', '~', '!']),
			build('cmd.exe', ['C:\\file.txt', '$value', '*', '?', '~', ';', '#'], Platform.Windows)
		], [
			'echo file.txt --flag=value /tmp/file',
			'echo C:\\file.txt * ? ~ !',
			'echo C:\\file.txt $value * ? ~ ; #'
		]);
	});

	test('empty arguments and arguments with spaces are preserved', () => {
		assert.deepStrictEqual([
			build('bash', ['', 'two words']),
			build('pwsh', ['', 'two words']),
			build('cmd.exe', ['', 'two words'], Platform.Windows)
		], [
			'echo \'\' \'two words\'',
			'echo \'\' \'two words\'',
			'echo "" "two words"'
		]);
	});

	test('prequoted arguments and explicit quoting are preserved', () => {
		assert.deepStrictEqual([
			build('bash', ['\'two words;\'', '"$HOME"', { value: '$HOME', quoting: ShellQuoting.Weak }, { value: 'two words', quoting: ShellQuoting.Escape }]),
			build('pwsh', [{ value: '$HOME', quoting: ShellQuoting.Weak }, { value: 'two words', quoting: ShellQuoting.Escape }]),
			build('bash', [{ value: 'it\'s;literal', quoting: ShellQuoting.Strong }]),
			build('pwsh', [{ value: 'it\'s;literal', quoting: ShellQuoting.Strong }])
		], [
			'echo \'two words;\' "$HOME" "$HOME" two\\ words',
			'echo "$HOME" two` words',
			'echo \'it\'\\\'\'s;literal\'',
			'echo \'it\'\'s;literal\''
		]);
	});

	test('partial quoting and escaped characters are preserved', () => {
		assert.deepStrictEqual([
			build('bash', ['--message="hello world"', 'cost\\$HOME', 'a\\;b', '--message="a\\"b"']),
			build('pwsh', ['--message="hello world"', 'cost`$HOME', 'a`;b', '--message="a`"b"']),
			build('cmd.exe', ['a"&whoami&"b', 'a^&b'], Platform.Windows)
		], [
			'echo --message="hello world" cost\\$HOME a\\;b --message="a\\"b"',
			'echo --message="hello world" cost`$HOME a`;b --message="a`"b"',
			'echo a"&whoami&"b a^&b'
		]);
	});

	test('cmd escapes embedded quotes when automatic quoting is needed', () => {
		assert.deepStrictEqual([
			build('cmd.exe', ['a"b&c'], Platform.Windows),
			build('cmd.exe', ['C:\\repo!\\', 'next'], Platform.Windows),
			build('cmd.exe', ['a\\"b&c'], Platform.Windows)
		], [
			'echo "a""b&c"',
			'echo "C:\\repo!\\\\" next',
			'echo "a\\\\""b&c"'
		]);
	});

	test('PowerShell stop-parsing tokens are quoted as arguments', () => {
		assert.strictEqual(build('pwsh', ['--%', 'a;b']), 'echo \'--%\' \'a;b\'');
	});

	test('command-only shell expressions remain unchanged', () => {
		const command = 'echo hello; echo world';
		assert.deepStrictEqual(
			['bash', 'pwsh', 'cmd.exe'].map(shell => build(shell, [], Platform.Windows, command)),
			[command, command, command]
		);
	});

	test('resolved command-only executable paths are still quoted', () => {
		assert.deepStrictEqual([
			build('bash', [], Platform.Linux, '/tmp/tool name', '${file}'),
			build('bash', [], Platform.Linux, '/tmp/tool;name', '${file}'),
			build('pwsh', [], Platform.Windows, 'C:\\tool name.exe', '${file}'),
			build('cmd.exe', [], Platform.Windows, 'C:\\tool name.exe', '${file}')
		], [
			'\'/tmp/tool name\'',
			'\'/tmp/tool;name\'',
			'& \'C:\\tool name.exe\'',
			'"C:\\tool name.exe"'
		]);
	});

	test('quoted commands retain shell-specific invocation rules', () => {
		assert.deepStrictEqual([
			build('pwsh.exe', ['a&b'], Platform.Windows, 'C:\\Program Files\\tool.exe'),
			build('cmd.exe', ['a&b'], Platform.Windows, 'C:\\Program Files\\tool.exe')
		], [
			'& \'C:\\Program Files\\tool.exe\' \'a&b\'',
			'""C:\\Program Files\\tool.exe" "a&b""'
		]);
	});

	test('unknown shells use platform defaults and custom quoting is honored', () => {
		assert.deepStrictEqual([
			build('unknown', ['a;b']),
			build('unknown.exe', ['it\'s'], Platform.Windows),
			build('bash', ['a;b'], Platform.Linux, 'echo', 'echo', { quoting: { strong: '"' } })
		], [
			'echo \'a;b\'',
			'echo \'it\'\'s\'',
			'echo "a;b"'
		]);
	});
});
