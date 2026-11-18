/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri, WorkspaceFolder } from 'vscode';
import { IWorkspaceFolderRepositoriesHost, WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant, isWindows, pathEquals } from '../util';

function folder(fsPath: string, locations?: string[]): WorkspaceFolder {
	return { uri: Uri.file(fsPath), name: fsPath, index: 0, locations: locations?.map(l => ({ uri: Uri.file(l), name: l })) };
}

(isWindows ? suite : suite.skip)('WorkspaceFolderRepositories (Windows paths)', () => {

	const locations = ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1', '\\\\Server\\Share\\WT2'];

	test('a switch is recognised ignoring drive letter and path casing, separators and UNC share casing', () => {
		const model = new WorkspaceFolderRepositories<string>({} as IWorkspaceFolderRepositoriesHost<string>);
		const from = folder('c:\\repo\\primary', locations);

		assert.deepStrictEqual([
			model.getFolderLocationSwitches([folder('c:\\REPO\\primary\\.WORKTREES\\w1')], [from]).length,
			model.getFolderLocationSwitches([folder('\\\\server\\share\\wt2\\')], [from]).length,
			model.getFolderLocationSwitches([folder('C:\\Repo\\Other')], [from]).length,
		], [1, 1, 0]);
	});

	test('switching back shows the warm repository of the location whatever its path casing', async () => {
		const open = new Map<string, boolean>([['C:\\Repo\\Primary', false]]);
		let folders = [folder('c:\\repo\\primary', locations)];
		const model: WorkspaceFolderRepositories<string> = new WorkspaceFolderRepositories<string>({
			getWorkspaceFolders: () => folders,
			getOpenRepositories: () => [...open.keys()],
			getRoot: r => r,
			getOpenRepository: fsPath => [...open.keys()].filter(r => isDescendant(r, fsPath)).sort((a, b) => b.length - a.length)[0],
			openRepository: async fsPath => { if (![...open.keys()].some(r => pathEquals(r, fsPath))) { open.set('C:\\Repo\\Primary\\.worktrees\\w1', true); } },
			isWarm: r => open.get(r)!,
			setWarm: (r, warm) => open.set(r, warm),
			whenFirstStatus: async () => { },
			close: r => { open.delete(r); model.delete(r); },
			showOpening: () => { }
		});

		const toNested = folder('c:\\repo\\PRIMARY\\.worktrees\\W1');
		const switched = folders;
		folders = [toNested];
		await model.switchFolderLocations(model.getFolderLocationSwitches(folders, switched));
		(toNested as { locations?: WorkspaceFolder['locations'] }).locations = locations.map(l => ({ uri: Uri.file(l), name: l }));
		const back = folder('C:\\REPO\\PRIMARY');
		folders = [back];
		await model.switchFolderLocations(model.getFolderLocationSwitches(folders, [toNested]));

		assert.deepStrictEqual([...open], [['C:\\Repo\\Primary', false], ['C:\\Repo\\Primary\\.worktrees\\w1', true]]);
	});
});
