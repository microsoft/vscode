/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Event, Uri, WorkspaceConfiguration, WorkspaceFolder } from 'vscode';
import { IRepositoryModel, IWarmRepository, IWorkspace, WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant, isWindows, pathEquals } from '../util';

const noEvent: Event<never> = () => ({ dispose: () => { } });

function folder(fsPath: string, locations?: string[]): WorkspaceFolder {
	return { uri: Uri.file(fsPath), name: fsPath, index: 0, locations: locations?.map(l => ({ uri: Uri.file(l), name: l })) };
}

class Repository implements IWarmRepository {
	readonly whenFirstStatus = Promise.resolve();
	constructor(readonly root: string, public isWarm: boolean) { }
	setWarm(isWarm: boolean) { this.isWarm = isWarm; }
}

(isWindows ? suite : suite.skip)('WorkspaceFolderRepositories (Windows paths)', () => {

	const locations = ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1', '\\\\Server\\Share\\WT2'];

	function create(folders: () => WorkspaceFolder[], repositories: Repository[]): WorkspaceFolderRepositories<Repository> {
		const workspace: IWorkspace = {
			get workspaceFolders() { return folders(); },
			onDidChangeWorkspaceFolders: noEvent,
			onDidChangeWorkspaceFolderLocations: noEvent,
			getConfiguration: () => ({ get: () => false }) as unknown as WorkspaceConfiguration
		};
		const model: IRepositoryModel<Repository> = {
			get repositories() { return repositories; },
			getRepository: fsPath => repositories.filter(r => isDescendant(r.root, fsPath)).sort((a, b) => b.root.length - a.root.length)[0],
			openRepository: async fsPath => {
				if (!repositories.some(r => pathEquals(r.root, fsPath))) {
					repositories.push(new Repository('C:\\Repo\\Primary\\.worktrees\\w1', true));
				}
			},
			disposeRepository: r => repositories.splice(repositories.indexOf(r), 1)
		};
		return new WorkspaceFolderRepositories(model, workspace);
	}

	test('a switch is recognised ignoring drive letter and path casing, separators and UNC share casing', () => {
		const model = create(() => [], []);
		const from = folder('c:\\repo\\primary', locations);

		assert.deepStrictEqual([
			model.getFolderLocationSwitches({ added: [folder('c:\\REPO\\primary\\.WORKTREES\\w1')], removed: [from] })?.length,
			model.getFolderLocationSwitches({ added: [folder('\\\\server\\share\\wt2\\')], removed: [from] })?.length,
			model.getFolderLocationSwitches({ added: [folder('C:\\Repo\\Other')], removed: [from] })?.length,
		], [1, 1, undefined]);
		model.dispose();
	});

	test('switching back shows the warm repository of the location whatever its path casing', async () => {
		let folders = [folder('c:\\repo\\primary', locations)];
		const repositories = [new Repository('C:\\Repo\\Primary', false)];
		const model = create(() => folders, repositories);

		const toNested = folder('c:\\repo\\PRIMARY\\.worktrees\\W1');
		const switched = folders;
		folders = [toNested];
		await model.switchFolderLocations(model.getFolderLocationSwitches({ added: folders, removed: switched })!);
		const resolved = folder('c:\\repo\\PRIMARY\\.worktrees\\W1', locations);
		folders = [folder('C:\\REPO\\PRIMARY')];
		await model.switchFolderLocations(model.getFolderLocationSwitches({ added: folders, removed: [resolved] })!);

		model.dispose();
		assert.deepStrictEqual(repositories.map(r => [r.root, r.isWarm]), [['C:\\Repo\\Primary', false], ['C:\\Repo\\Primary\\.worktrees\\w1', true]]);
	});
});
