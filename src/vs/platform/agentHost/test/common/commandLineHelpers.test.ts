/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { extractCdPrefix, stripRedundantCdPrefix } from '../../common/commandLineHelpers.js';

suite('extractCdPrefix', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const cases: Array<{
		name: string;
		commandLine: string;
		isPowerShell: boolean;
		expected: { directory: string; command: string } | undefined;
	}> = [
			// bash matches
			{ name: 'bash: simple cd', commandLine: 'cd /tmp && ls', isPowerShell: false, expected: { directory: '/tmp', command: 'ls' } },
			{ name: 'bash: quoted dir', commandLine: 'cd "/path with spaces" && ls -la', isPowerShell: false, expected: { directory: '/path with spaces', command: 'ls -la' } },
			{ name: 'bash: extra spaces after &&', commandLine: 'cd /tmp &&  echo hi', isPowerShell: false, expected: { directory: '/tmp', command: 'echo hi' } },

			// bash non-matches
			{ name: 'bash: no cd prefix', commandLine: 'ls -la', isPowerShell: false, expected: undefined },
			{ name: 'bash: cd with semicolon (not allowed in bash variant)', commandLine: 'cd /tmp; ls', isPowerShell: false, expected: undefined },
			{ name: 'bash: cd alone', commandLine: 'cd /tmp', isPowerShell: false, expected: undefined },
			{ name: 'bash: Set-Location not bash', commandLine: 'Set-Location /tmp && ls', isPowerShell: false, expected: undefined },

			// powershell matches
			{ name: 'pwsh: cd && ', commandLine: 'cd C:\\foo && dir', isPowerShell: true, expected: { directory: 'C:\\foo', command: 'dir' } },
			{ name: 'pwsh: cd ;', commandLine: 'cd C:\\foo; dir', isPowerShell: true, expected: { directory: 'C:\\foo', command: 'dir' } },
			{ name: 'pwsh: cd /d', commandLine: 'cd /d C:\\foo && dir', isPowerShell: true, expected: { directory: 'C:\\foo', command: 'dir' } },
			{ name: 'pwsh: Set-Location', commandLine: 'Set-Location C:\\foo; dir', isPowerShell: true, expected: { directory: 'C:\\foo', command: 'dir' } },
			{ name: 'pwsh: Set-Location -Path', commandLine: 'Set-Location -Path C:\\foo && dir', isPowerShell: true, expected: { directory: 'C:\\foo', command: 'dir' } },
			{ name: 'pwsh: quoted dir', commandLine: 'cd "C:\\path with spaces"; dir', isPowerShell: true, expected: { directory: 'C:\\path with spaces', command: 'dir' } },
			{ name: 'pwsh: case insensitive', commandLine: 'CD C:\\foo && dir', isPowerShell: true, expected: { directory: 'C:\\foo', command: 'dir' } },

			// powershell non-matches
			{ name: 'pwsh: no cd prefix', commandLine: 'dir', isPowerShell: true, expected: undefined },
			{ name: 'pwsh: cd alone', commandLine: 'cd C:\\foo', isPowerShell: true, expected: undefined },
		];

	for (const tc of cases) {
		test(tc.name, () => {
			const result = extractCdPrefix(tc.commandLine, tc.isPowerShell);
			assert.deepStrictEqual(result, tc.expected);
		});
	}
});

suite('stripRedundantCdPrefix', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const wd = URI.file('/repo/project');

	test('rewrites bash command when cd matches working directory', () => {
		const params: Record<string, unknown> = { command: 'cd /repo/project && npm test' };
		const changed = stripRedundantCdPrefix('bash', params, wd);
		assert.strictEqual(changed, true);
		assert.strictEqual(params.command, 'npm test');
	});

	test('rewrites bash command tolerating trailing slash', () => {
		const params: Record<string, unknown> = { command: 'cd /repo/project/ && ls' };
		const changed = stripRedundantCdPrefix('bash', params, wd);
		assert.strictEqual(changed, true);
		assert.strictEqual(params.command, 'ls');
	});

	test('does not rewrite when cd target differs', () => {
		const params: Record<string, unknown> = { command: 'cd /tmp && ls' };
		const changed = stripRedundantCdPrefix('bash', params, wd);
		assert.strictEqual(changed, false);
		assert.strictEqual(params.command, 'cd /tmp && ls');
	});

	test('does not rewrite for non-shell tools', () => {
		const params: Record<string, unknown> = { command: 'cd /repo/project && ls' };
		const changed = stripRedundantCdPrefix('read_file', params, wd);
		assert.strictEqual(changed, false);
		assert.strictEqual(params.command, 'cd /repo/project && ls');
	});

	test('handles missing working directory', () => {
		const params: Record<string, unknown> = { command: 'cd /repo/project && ls' };
		const changed = stripRedundantCdPrefix('bash', params, undefined);
		assert.strictEqual(changed, false);
	});

	test('handles missing parameters', () => {
		const changed = stripRedundantCdPrefix('bash', undefined, wd);
		assert.strictEqual(changed, false);
	});

	test('handles non-string command', () => {
		const params: Record<string, unknown> = { command: 42 };
		const changed = stripRedundantCdPrefix('bash', params, wd);
		assert.strictEqual(changed, false);
	});

	test('rewrites powershell with semicolon separator', () => {
		const params: Record<string, unknown> = { command: 'cd /repo/project; dir' };
		const changed = stripRedundantCdPrefix('powershell', params, wd);
		assert.strictEqual(changed, true);
		assert.strictEqual(params.command, 'dir');
	});

	test('matches mixed path separators (forward-slash extracted vs native fsPath wd)', () => {
		// On Windows, the model may emit `cd C:/repo/project && …` while
		// URI.file('C:\\repo\\project').fsPath uses backslashes. The helper
		// must normalize separators so the prefix is still recognized.
		// On POSIX, `C:\…` is not a meaningful path, so the cross-separator
		// test only makes sense on Windows.
		if (!isWindows) {
			return;
		}
		const winWd = URI.file('C:\\repo\\project');
		const params: Record<string, unknown> = { command: 'cd C:/repo/project && npm test' };
		const changed = stripRedundantCdPrefix('bash', params, winWd);
		assert.strictEqual(changed, true);
		assert.strictEqual(params.command, 'npm test');
	});

	test('matches backslash extracted dir against backslash native wd on Windows', () => {
		// Inverse direction: the model emits backslashes and the native wd is
		// also backslashes. This is the most common Windows case and must
		// match without relying on POSIX-shape paths.
		if (!isWindows) {
			return;
		}
		const winWd = URI.file('C:\\repo\\project');
		const params: Record<string, unknown> = { command: 'cd C:\\repo\\project && ls' };
		const changed = stripRedundantCdPrefix('bash', params, winWd);
		assert.strictEqual(changed, true);
		assert.strictEqual(params.command, 'ls');
	});
});
