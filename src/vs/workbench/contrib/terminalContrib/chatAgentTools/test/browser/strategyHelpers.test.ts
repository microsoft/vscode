/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { stripCommandEchoAndPrompt } from '../../browser/executeStrategy/strategyHelpers.js';

suite('stripCommandEchoAndPrompt', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('strips single-line command echo and trailing prompt', () => {
		const output = [
			'user@host:~/src $ echo hello',
			'hello',
			'user@host:~/src $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo hello'),
			'hello'
		);
	});

	test('strips command echo with zsh-style prompt (] $ )', () => {
		const output = [
			's/testWorkspace (main**) ] $  true',
			'[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test',
			's/testWorkspace (main**) ] $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'true'),
			''
		);
	});

	test('preserves actual command output between echo and prompt', () => {
		const output = [
			's/testWorkspace (main**) ] $  echo MARKER_123',
			'MARKER_123',
			'[ alex@host:/some/path',
			's/testWorkspace (main**) ] $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo MARKER_123'),
			'MARKER_123'
		);
	});

	test('preserves multi-line command output', () => {
		const output = [
			'user@host:~ $ echo line1 && echo line2 && echo line3',
			'line1',
			'line2',
			'line3',
			'user@host:~ $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo line1 && echo line2 && echo line3'),
			'line1\nline2\nline3'
		);
	});

	test('handles empty output (no-output command)', () => {
		const output = [
			's/testWorkspace (main**) ] $  true',
			'[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test',
			's/testWorkspace (main**) ] $',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'true'),
			''
		);
	});

	test('strips sandbox-wrapped command echo (long wrapped lines)', () => {
		const sandboxCommand = 'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" TMPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sandbox-settings.json" -c \'curl -s https://example.com\'';
		const output = [
			's/testWorkspace (main**) ] $ ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" T',
			'MPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sand',
			'box-settings.json" -c \'curl -s https://example.com\'',
			'[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test',
			's/testWorkspace (main**) ] $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, sandboxCommand),
			''
		);
	});

	test('strips trailing prompt with various prompt styles', () => {
		// bash user@host:path $
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['user@host:~ $ echo hello', 'hello', 'user@host:~ $ '].join('\n'),
				'echo hello'
			),
			'hello',
			'Failed for bash $ prompt'
		);
		// root user@host:path #
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['root@server:/var/log# echo hello', 'hello', 'root@server:/var/log# '].join('\n'),
				'echo hello'
			),
			'hello',
			'Failed for root # prompt'
		);
		// bracketed prompt ending with ] $
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['s/workspace ] $ echo hello', 'hello', 's/workspace ] $ '].join('\n'),
				'echo hello'
			),
			'hello',
			'Failed for bracketed ] $ prompt'
		);
		// PowerShell PS C:\>
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['PS C:\\Users\\test> echo hello', 'hello', 'PS C:\\Users\\test>'].join('\n'),
				'echo hello'
			),
			'hello',
			'Failed for PowerShell prompt'
		);
	});

	test('does not strip output lines ending with prompt-like characters', () => {
		// Output ending with % (e.g. percentage)
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['user@host:~ $ echo "100%"', '100%', 'user@host:~ $ '].join('\n'),
				'echo "100%"'
			),
			'100%',
			'Should not strip line ending with %'
		);
		// Output ending with > (e.g. HTML or comparison)
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['user@host:~ $ echo "<div>"', '<div>', 'user@host:~ $ '].join('\n'),
				'echo "<div>"'
			),
			'<div>',
			'Should not strip line ending with >'
		);
		// Output ending with # (e.g. comment marker)
		assert.strictEqual(
			stripCommandEchoAndPrompt(
				['user@host:~ $ echo "item #"', 'item #', 'user@host:~ $ '].join('\n'),
				'echo "item #"'
			),
			'item #',
			'Should not strip line ending with #'
		);
	});

	test('handles command with leading space (history prevention)', () => {
		const output = [
			'user@host:~ $  echo hello',
			'hello',
			'user@host:~ $ ',
		].join('\n');

		// The command has a leading space (from CommandLinePreventHistoryRewriter)
		assert.strictEqual(
			stripCommandEchoAndPrompt(output, ' echo hello'),
			'hello'
		);
	});

	test('does not strip actual output lines that happen to contain prompt chars', () => {
		const output = [
			'user@host:~ $ echo "price is $5"',
			'price is $5',
			'user@host:~ $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo "price is $5"'),
			'price is $5'
		);
	});

	test('handles output with no trailing prompt (e.g. command still running)', () => {
		const output = [
			'user@host:~ $ echo hello',
			'hello',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo hello'),
			'hello'
		);
	});

	test('handles output with only the command echo and no prompt', () => {
		const output = 'user@host:~ $ true';

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'true'),
			''
		);
	});

	test('handles empty string input', () => {
		assert.strictEqual(
			stripCommandEchoAndPrompt('', 'echo hello'),
			''
		);
	});

	test('handles bash -c subshell command echo', () => {
		const output = [
			's/testWorkspace (main**) ] $  bash -c "exit 42"',
			'[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test',
			's/testWorkspace (main**) ] $ ',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'bash -c "exit 42"'),
			''
		);
	});

	test('strips wrapped prompt lines with user@hostname pattern', () => {
		const output = [
			'user@host:~ $ echo hi',
			'hi',
			'[ alex@Alexandrus-MacBook-Pro:/very/long/path/that/wraps/across/terminal/col',
			'umns/in/the/test/workspace ] $',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo hi'),
			'hi'
		);
	});

	test('handles PowerShell-style prompt (PS C:\\>)', () => {
		const output = [
			'PS C:\\Users\\test> echo hello',
			'hello',
			'PS C:\\Users\\test>',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo hello'),
			'hello'
		);
	});

	test('strips stale prompt fragments and ^C residue before command echo', () => {
		// Simulates CI environment where previous ^C produces stale prompt
		// fragments before the actual command echo line
		const output = [
			'ts/testWorkspace$ ^C',
			'cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
			'ts/testWorkspace$  echo MARKER_123',
			'MARKER_123',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo MARKER_123'),
			'MARKER_123'
		);
	});

	test('strips stale prompt fragments for no-output command', () => {
		const output = [
			'ts/testWorkspace$ ^C',
			'cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
			'ts/testWorkspace$  true',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'true'),
			''
		);
	});

	test('strips stale prompt fragments for multi-line output', () => {
		const output = [
			'ts/testWorkspace$ ^C',
			'cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes',
			'ts/testWorkspace$  echo M1 && echo M2 && echo M3',
			'M1',
			'M2',
			'M3',
		].join('\n');

		assert.strictEqual(
			stripCommandEchoAndPrompt(output, 'echo M1 && echo M2 && echo M3'),
			'M1\nM2\nM3'
		);
	});
});
