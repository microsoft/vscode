/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { TestStorageService } from '../../../workbench/test/common/workbenchTestServices.js';
import { EmbeddedEditorMemory, getEmbeddedEditorOpenable, IEmbeddedEditorContent, shouldSwitchEditorFolders } from '../../electron-browser/embeddedEditor.js';

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
			repository: { folderUri: URI.file('/repo') },
		});

		const restarted = new EmbeddedEditorMemory(storage);
		const content = restarted.content;
		restarted.forget();

		assert.deepStrictEqual({
			folders: content?.folders.map(folder => ({ folderUri: folder.folderUri.toString(), label: folder.label })),
			repositories: content?.repositories,
			repository: content?.repository?.folderUri.toString(),
			afterForget: new EmbeddedEditorMemory(storage).content,
		}, {
			folders: [
				{ folderUri: 'file:///worktrees/a', label: undefined },
				{ folderUri: 'vscode-remote://ssh-remote%2Bhost/work', label: 'work [SSH: host]' },
			],
			repositories: ['file:///repo', 'vscode-remote://ssh-remote%2Bhost/work'],
			repository: 'file:///repo',
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
			// A window that shows the local repository moves its folder to the worktree itself
			otherWorktreeOfShownRepository: shouldSwitchEditorFolders(
				{ ...shown, repository: { folderUri: URI.file('/repo') } },
				{ ...content('/worktrees/b', 'file:///repo'), repository: { folderUri: URI.file('/repo') } }),
		}, {
			otherWorktree: true,
			sameWorktree: false,
			otherRepository: false,
			nothingShown: false,
			repositoryUnknown: false,
			otherWorktreeOfShownRepository: false,
		});
	});
});

suite('EmbeddedEditor openable', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('opens a single local folder as its repository at the folder, so that it switches between worktrees in place', () => {
		const describe = (value: IEmbeddedEditorContent) => {
			const { toOpen, folderLocation } = getEmbeddedEditorOpenable(value);
			return { toOpen: toOpen.map(folder => folder.folderUri.toString()), folderLocation: typeof folderLocation === 'object' ? folderLocation.uri : folderLocation };
		};
		const repository = { folderUri: URI.file('/repo') };
		assert.deepStrictEqual({
			worktree: describe({ ...content('/worktrees/a', 'file:///repo'), repository }),
			primary: describe({ ...content('/repo', 'file:///repo'), repository }),
			noRepository: describe(content('/worktrees/a', 'file:///repo')),
		}, {
			worktree: { toOpen: ['file:///repo'], folderLocation: 'file:///worktrees/a' },
			primary: { toOpen: ['file:///repo'], folderLocation: 'primary' },
			noRepository: { toOpen: ['file:///worktrees/a'], folderLocation: undefined },
		});
	});
});

function content(folder: string, repository: string): IEmbeddedEditorContent {
	return { folders: [{ folderUri: URI.file(folder) }], repositories: [repository] };
}
