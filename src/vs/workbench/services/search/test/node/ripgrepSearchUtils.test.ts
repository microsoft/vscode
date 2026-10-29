/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getExcludeExceptions } from '../../../../../base/common/glob.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { getExcludeExceptionRuns, MAX_RIPGREP_SYMLINK_LOOPS, RipgrepSymlinkLoopDetector } from '../../node/ripgrepSearchUtils.js';

suite('RipgrepSymlinkLoopDetector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reports once more loops than allowed were found, including loops split across chunks', () => {
		const detector = new RipgrepSymlinkLoopDetector();
		const loop = 'rg: File system loop found: a/link points to an ancestor a\n';

		assert.deepStrictEqual([
			detector.handleStderr(loop.repeat(MAX_RIPGREP_SYMLINK_LOOPS - 1) + 'rg: ./unreadable: Permission denied (os error 13)\n'),
			detector.handleStderr(loop + loop.slice(0, 20)),
			detector.handleStderr(loop.slice(20)),
		], [false, false, true]);
	});
});

suite('getExcludeExceptionRuns', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const vcsFolders = ['.git', '.svn', '.hg', '.jj'];

	test('groups exceptions by literal prefix and merges nested roots', () => {
		const exceptions = getExcludeExceptions({
			'node_modules': true,
			'!node_modules/@types/node': true,
			'!node_modules/@types': true,
			'!src/*.js': true,
			'!gulpfile.js': true,
		});

		assert.deepStrictEqual(getExcludeExceptionRuns(exceptions, '/workspace'), [
			{ root: 'src', globs: ['src/*.js', 'src/*.js/**'], skippedFolders: vcsFolders },
			{ root: 'gulpfile.js', globs: ['gulpfile.js', 'gulpfile.js/**'], skippedFolders: vcsFolders },
			{ root: 'node_modules/@types', globs: ['node_modules/@types', 'node_modules/@types/**', 'node_modules/@types/node', 'node_modules/@types/node/**'], skippedFolders: vcsFolders },
		]);
	});

	test('an exception that can match at any depth searches the whole folder', () => {
		const exceptions = getExcludeExceptions({ '!node_modules/@types': true, '!**/Scripts': true });

		assert.deepStrictEqual(getExcludeExceptionRuns(exceptions, '/workspace'), [
			{ root: '', globs: ['**/Scripts', '**/Scripts/**', 'node_modules/@types', 'node_modules/@types/**'], skippedFolders: vcsFolders },
		]);
	});

	(isWindows ? test.skip : test)('absolute exceptions are made relative to the folder or ignored', () => {
		const exceptions = getExcludeExceptions({ '!/workspace/node_modules/@types': true, '!/elsewhere/a': true });
		const workspaceWideExceptions = getExcludeExceptions({ '!/workspace/**/small.js': true });

		assert.deepStrictEqual({
			anchored: getExcludeExceptionRuns(exceptions, '/workspace'),
			workspaceWide: getExcludeExceptionRuns(workspaceWideExceptions, '/workspace'),
		}, {
			anchored: [{ root: 'node_modules/@types', globs: ['node_modules/@types', 'node_modules/@types/**'], skippedFolders: vcsFolders }],
			workspaceWide: [{ root: '', globs: ['**/small.js', '**/small.js/**'], skippedFolders: vcsFolders }],
		});
	});

	test('version control folders are only searched when an exception names them', () => {
		assert.deepStrictEqual(getExcludeExceptionRuns(getExcludeExceptions({ '!**/Scripts': true, '!.git/hooks': true }), '/workspace')[0].skippedFolders, ['.svn', '.hg', '.jj']);
	});
});
