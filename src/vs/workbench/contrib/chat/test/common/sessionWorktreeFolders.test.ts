/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getSessionWorktreeFolder, getWorktreeFilterOptions, WorktreeLastSessions } from '../../common/sessionWorktreeFolders.js';
import { extUriBiasedIgnorePathCase } from '../../../../../base/common/resources.js';

suite('getWorktreeFilterOptions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('labels folders of the same name by as many parent folders as tell them apart, else by their whole parent paths', () => {
		const labels = (folders: readonly URI[]) => getWorktreeFilterOptions(folders.map(folder => getSessionWorktreeFolder(folder)), extUriBiasedIgnorePathCase).map(option => option.label);

		assert.deepStrictEqual({
			sameParentName: labels([URI.file('/work/one/repo'), URI.file('/work/one/repo.worktrees/fix'), URI.file('/work/two/repo'), URI.file('/work/two/repo.worktrees/fix')]),
			otherAuthority: labels([URI.file('/work/repo.worktrees/fix'), URI.from({ scheme: 'file', authority: 'server', path: '/work/repo.worktrees/fix' }), URI.file('/work/repo'), URI.from({ scheme: 'file', authority: 'server', path: '/work/repo' })]),
		}, {
			sameParentName: ['repo (one)', 'fix (one/repo.worktrees)', 'repo (two)', 'fix (two/repo.worktrees)'],
			otherAuthority: ['repo (/work)', 'fix (/work/repo.worktrees)', 'repo (server/work)', 'fix (server/work/repo.worktrees)'],
		});
	});
});

suite('WorktreeLastSessions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('remembers one session per folder and each session at the folder it was last shown in, the most recent folders only, and follows a session that replaces it or is forgotten', () => {
		const sessions = new WorktreeLastSessions(2);
		const changes = [
			sessions.remember('a', 's1'),
			sessions.remember('a', 's1'),
			sessions.remember('b', 's1'),
			sessions.remember('a', 's2'),
		];
		const moved = sessions.entries();
		sessions.remember('c', 's3');
		const limited = sessions.entries();
		const replaced = sessions.replace('s3', 's4');
		const forgotten = sessions.forget('s2');

		assert.deepStrictEqual({ changes, moved, limited, replaced, forgotten, entries: sessions.entries() }, {
			changes: [true, false, true, true],
			moved: [['b', 's1'], ['a', 's2']],
			limited: [['a', 's2'], ['c', 's3']],
			replaced: true,
			forgotten: true,
			entries: [['c', 's4']],
		});
	});
});
