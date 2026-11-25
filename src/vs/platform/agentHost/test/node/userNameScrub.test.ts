/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { scrubUserName } from './e2e/harness/userNameScrub.js';

/**
 * `runner` is used throughout because it is the GitHub Actions Linux account
 * name *and* an ordinary English word — the case a plain substring replace gets
 * wrong, and the one that matters most since it only misbehaves on some
 * platforms.
 */
suite('userNameScrub', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('scrubs the account name in path segments', () => {
		assert.deepStrictEqual([
			'/home/runner/work/file.txt',
			'C:\\Users\\runner\\AppData\\Local',
			'file:///home/runner/x',
			'/home/runner',
			'/home/runner\nnext line',
			'path: \'/home/runner\'',
			'path: `/home/runner`',
			'path: /home/runner,',
			// Embedded JSON escapes the separator.
			'{"path":"C:\\\\Users\\\\runner\\\\x"}',
			'{"path":"/home/runner"}',
		].map(text => scrubUserName(text, 'runner')), [
			'/home/${user}/work/file.txt',
			'C:\\Users\\${user}\\AppData\\Local',
			'file:///home/${user}/x',
			'/home/${user}',
			'/home/${user}\nnext line',
			'path: \'/home/${user}\'',
			'path: `/home/${user}`',
			'path: /home/${user},',
			'{"path":"C:\\\\Users\\\\${user}\\\\x"}',
			'{"path":"/home/${user}"}',
		]);
	});

	test('scrubs the owner and group columns of an ls -l listing', () => {
		// Exactly the shape recorded in the committed subagent capture.
		const listing = [
			'drwx------     4 runner  staff     128 Jan  1 12:00 .',
			'-rw-r--r--     1 runner  runner      5 Jan  1 12:00 file-a.txt',
			'-rw-r--r--@    1 other   staff       4 Jan  1 12:00 file-b.txt',
		].join('\n');
		assert.strictEqual(scrubUserName(listing, 'runner'), [
			'drwx------     4 ${user}  staff     128 Jan  1 12:00 .',
			'-rw-r--r--     1 ${user}  ${user}      5 Jan  1 12:00 file-a.txt',
			'-rw-r--r--@    1 other   staff       4 Jan  1 12:00 file-b.txt',
		].join('\n'));
	});

	test('scrubs flattened source paths in Claude project directories', () => {
		assert.deepStrictEqual([
			'${homedir}\\.claude\\projects\\c--Users-runner-AppData-Local-Temp-work\\memory\\MEMORY.md',
			'{"file_path":"${homedir}\\\\.claude\\\\projects\\\\c--Users-runner-AppData-Local-Temp-work\\\\memory\\\\MEMORY.md"}',
			'${homedir}/.claude/projects/-home-runner-work-repo/memory/MEMORY.md',
			'${homedir}/.claude/projects/-Users-runner-work-repo/memory/MEMORY.md',
			'${homedir}/.claude/projects/-Users-runner/memory/MEMORY.md',
		].map(text => scrubUserName(text, 'runner')), [
			'${homedir}\\.claude\\projects\\c--Users-${user}-AppData-Local-Temp-work\\memory\\MEMORY.md',
			'{"file_path":"${homedir}\\\\.claude\\\\projects\\\\c--Users-${user}-AppData-Local-Temp-work\\\\memory\\\\MEMORY.md"}',
			'${homedir}/.claude/projects/-home-${user}-work-repo/memory/MEMORY.md',
			'${homedir}/.claude/projects/-Users-${user}-work-repo/memory/MEMORY.md',
			'${homedir}/.claude/projects/-Users-${user}/memory/MEMORY.md',
		]);
	});

	test('leaves the account name alone when it is an ordinary word', () => {
		// The regression this exists to prevent: a plain substring replace turns
		// every one of these into `${user}`.
		const prose = [
			'the runner completed successfully',
			'Test runner exited with code 0',
			'runner.js',
			'forerunner',
			'runneradmin',
			'a runner-up value',
			'/tmp/runner.js',
			'C:\\Users\\runner-admin\\AppData',
			'Users-runner-example outside a Claude project path',
		];
		assert.deepStrictEqual(prose.map(text => scrubUserName(text, 'runner')), prose);
	});

	test('is a no-op without an account name', () => {
		assert.strictEqual(scrubUserName('/home/runner/x', ''), '/home/runner/x');
	});

	test('escapes regular expression characters in the account name', () => {
		assert.strictEqual(scrubUserName('/home/a.b/x', 'a.b'), '/home/${user}/x');
		// The `.` must not behave as a wildcard.
		assert.strictEqual(scrubUserName('/home/axb/x', 'a.b'), '/home/axb/x');
	});
});
