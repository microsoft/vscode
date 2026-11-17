/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri, WorkspaceFolder } from 'vscode';
import { WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isWindows } from '../util';

function folder(fsPath: string, index = 0): WorkspaceFolder {
	return { uri: Uri.file(fsPath), name: fsPath, index };
}

/**
 * Returns the repositories that are closed when `removed` is removed while `remaining` stay, where
 * `repositories` maps a removed folder to the root of its repository and no editor is visible.
 */
function closeRemoved(removed: WorkspaceFolder[], remaining: WorkspaceFolder[], repositories: string[]): string[] {
	const tracker = new WorkspaceFolderRepositories<string>(root => root);
	return tracker.onDidChangeWorkspaceFolders({ added: [], removed }, remaining, uri => repositories[removed.findIndex(f => f.uri.toString() === uri.toString())], () => false);
}

// The paths are compared with the file system semantics of the platform the tests run on
(isWindows ? suite : suite.skip)('workspaceFolderRepositories (Windows paths)', () => {

	test('opens an added folder unless it is the root of an open repository, ignoring drive letter and path casing and separators', () => {
		const folders = [folder('C:\\Repo\\Primary'), folder('C:\\Repo\\Primary\\.worktrees\\w1', 1), folder('\\\\server\\share\\repo', 2), folder('D:\\Repo\\Primary', 3)];

		const toOpen = new WorkspaceFolderRepositories<string>(root => root).getAddedFoldersToOpen(folders, ['c:/repo/PRIMARY/', '\\\\SERVER\\Share\\Repo\\']);

		assert.deepStrictEqual(toOpen.map(f => f.index), [1, 3]);
	});

	test('keeps the repository of a removed folder that is inside a remaining folder, ignoring drive letter casing, or at a UNC share root', () => {
		const removed = [folder('C:\\Other', 2), folder('\\\\server\\share\\other', 3), folder('\\\\server\\share2\\other', 4)];
		const remaining = [folder('c:\\work\\'), folder('\\\\server\\share\\', 1), folder('\\\\server\\share2', 5)];

		assert.deepStrictEqual(closeRemoved(removed, remaining, ['C:\\Work\\Repo', '\\\\SERVER\\share\\repo', '\\\\server\\SHARE2\\repo']), []);
	});

	test('closes the repository of a removed folder that is outside the remaining folders', () => {
		const removed = [folder('D:\\Repo', 1), folder('\\\\server\\other\\repo', 2)];

		assert.deepStrictEqual(closeRemoved(removed, [folder('C:\\Work')], ['D:\\Repo', '\\\\server\\other\\repo']), ['D:\\Repo', '\\\\server\\other\\repo']);
	});
});
