/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getSessionWorktreeFolder, getWorktreeFilterOptions } from '../../common/sessionWorktreeFolders.js';

suite('getWorktreeFilterOptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('labels folders of the same name by as many parent folders as tell them apart, else by their whole parent paths', () => {
		const labels = (folders: readonly URI[]) => getWorktreeFilterOptions(folders.map(folder => getSessionWorktreeFolder(folder))).map(option => option.label);

		assert.deepStrictEqual({
			sameParentName: labels([URI.file('/work/one/repo'), URI.file('/work/one/repo.worktrees/fix'), URI.file('/work/two/repo'), URI.file('/work/two/repo.worktrees/fix')]),
			otherAuthority: labels([URI.file('/work/repo.worktrees/fix'), URI.from({ scheme: 'file', authority: 'server', path: '/work/repo.worktrees/fix' }), URI.file('/work/repo'), URI.from({ scheme: 'file', authority: 'server', path: '/work/repo' })]),
		}, {
			sameParentName: ['repo (one)', 'fix (one/repo.worktrees)', 'repo (two)', 'fix (two/repo.worktrees)'],
			otherAuthority: ['repo (/work)', 'fix (/work/repo.worktrees)', 'repo (server/work)', 'fix (server/work/repo.worktrees)'],
		});
	});
});
