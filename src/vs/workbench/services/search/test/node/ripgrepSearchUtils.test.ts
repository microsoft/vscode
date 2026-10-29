/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getExcludeExceptions } from '../../../../../base/common/glob.js';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../../base/common/path.js';
import { isLinux, isWindows } from '../../../../../base/common/platform.js';
import { getRandomTestPath } from '../../../../../base/test/node/testUtils.js';
import { getExcludeExceptionRuns, MAX_RIPGREP_SYMLINK_LOOPS, resolveExcludeExceptionRunRoot, RipgrepSymlinkLoopDetector } from '../../node/ripgrepSearchUtils.js';

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
		const workspaceExceptions = getExcludeExceptions({ '!/workspace': true });

		assert.deepStrictEqual({
			anchored: getExcludeExceptionRuns(exceptions, '/workspace'),
			workspaceWide: getExcludeExceptionRuns(workspaceWideExceptions, '/workspace'),
			workspace: getExcludeExceptionRuns(workspaceExceptions, '/workspace'),
		}, {
			anchored: [{ root: 'node_modules/@types', globs: ['node_modules/@types', 'node_modules/@types/**'], skippedFolders: vcsFolders }],
			workspaceWide: [{ root: '', globs: ['**/small.js', '**/small.js/**'], skippedFolders: vcsFolders }],
			workspace: [{ root: '', globs: ['**', '**/**'], skippedFolders: vcsFolders }],
		});
	});

	test('version control folders are only searched when an exception names them', () => {
		assert.deepStrictEqual(getExcludeExceptionRuns(getExcludeExceptions({ '!**/Scripts': true, '!.git/hooks': true }), '/workspace')[0].skippedFolders, ['.svn', '.hg', '.jj']);
	});

	test('resolveExcludeExceptionRunRoot resolves the casing on disk when globs ignore case', async () => {
		const root = getRandomTestPath(tmpdir(), 'vsctests', 'exclude-exception-run-root');
		try {
			await fs.promises.mkdir(join(root, 'node_modules', '@types'), { recursive: true });

			assert.deepStrictEqual({
				ignoreCase: await resolveExcludeExceptionRunRoot(root, 'NODE_MODULES/@types', true, true),
				matchCase: await resolveExcludeExceptionRunRoot(root, 'NODE_MODULES/@types', true, false),
				missing: await resolveExcludeExceptionRunRoot(root, 'node_modules/missing', true, true),
			}, {
				ignoreCase: 'node_modules/@types',
				matchCase: isLinux ? undefined : 'node_modules/@types',
				missing: undefined,
			});
		} finally {
			await fs.promises.rm(root, { recursive: true, force: true });
		}
	});
});
