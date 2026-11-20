/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestStorageService } from '../../../workbench/test/common/workbenchTestServices.js';
import { EmbeddedEditorMemory, IEmbeddedEditorContent, shouldSwitchEditorFolders } from '../../electron-browser/embeddedEditor.js';

suite('EmbeddedEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('remembers what the editor window shows for the next run until it is left', () => {
		const storage = disposables.add(new TestStorageService());
		new EmbeddedEditorMemory(storage).remember({
			folders: [
				{ folderUri: URI.file('/worktrees/a') },
				{ folderUri: URI.parse('vscode-remote://ssh-remote+host/work'), label: 'work [SSH: host]' },
			],
			repositories: ['file:///repo', 'vscode-remote://ssh-remote%2Bhost/work'],
		});

		const restarted = new EmbeddedEditorMemory(storage);
		const content = restarted.content;
		restarted.forget();

		assert.deepStrictEqual({
			folders: content?.folders.map(folder => ({ folderUri: folder.folderUri.toString(), label: folder.label })),
			repositories: content?.repositories,
			afterForget: new EmbeddedEditorMemory(storage).content,
		}, {
			folders: [
				{ folderUri: 'file:///worktrees/a', label: undefined },
				{ folderUri: 'vscode-remote://ssh-remote%2Bhost/work', label: 'work [SSH: host]' },
			],
			repositories: ['file:///repo', 'vscode-remote://ssh-remote%2Bhost/work'],
			afterForget: undefined,
		});
	});

	test('switches to the worktree of a chat only when it is another worktree of the same repository', () => {
		const shown = content('/worktrees/a', 'file:///repo');
		assert.deepStrictEqual({
			otherWorktree: shouldSwitchEditorFolders(shown, content('/worktrees/b', 'file:///repo')),
			sameWorktree: shouldSwitchEditorFolders(shown, content('/worktrees/a', 'file:///repo')),
			otherRepository: shouldSwitchEditorFolders(shown, content('/other', 'file:///other')),
			nothingShown: shouldSwitchEditorFolders(undefined, content('/worktrees/b', 'file:///repo')),
			repositoryUnknown: shouldSwitchEditorFolders({ folders: shown.folders, repositories: [] }, content('/worktrees/b', 'file:///repo')),
		}, {
			otherWorktree: true,
			sameWorktree: false,
			otherRepository: false,
			nothingShown: false,
			repositoryUnknown: false,
		});
	});
});

function content(folder: string, repository: string): IEmbeddedEditorContent {
	return { folders: [{ folderUri: URI.file(folder) }], repositories: [repository] };
}
