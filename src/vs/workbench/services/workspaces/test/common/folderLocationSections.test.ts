/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { groupFolderLocations } from '../../common/folderLocationSections.js';

suite('FolderLocationSections', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('a Folder section and a Worktrees section, each with the current folder first and the others in their order, without empty sections', () => {
		const sections = (entries: Parameters<typeof groupFolderLocations<string>>[0]) => groupFolderLocations(entries).map(section => `${section.title}: ${section.items.join(', ')}`);

		assert.deepStrictEqual({
			atWorktree: sections([
				{ item: 'a', kind: 'worktree', current: false },
				{ item: 'vscode', kind: 'folder', current: false },
				{ item: 'b', kind: 'worktree', current: true },
				{ item: 'c', kind: 'worktree', current: false },
			]),
			atFolder: sections([
				{ item: 'a', kind: 'worktree', current: false },
				{ item: 'vscode', kind: 'folder', current: true },
			]),
			severalFolders: sections([
				{ item: 'vscode', kind: 'folder', current: false },
				{ item: 'tools', kind: 'folder', current: true },
			]),
			none: sections([]),
		}, {
			atWorktree: ['Folder: vscode', 'Worktrees: b, a, c'],
			atFolder: ['Folder: vscode', 'Worktrees: a'],
			severalFolders: ['Folders: tools, vscode'],
			none: [],
		});
	});
});
