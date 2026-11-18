/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { Uri, WorkspaceFolder } from 'vscode';
import { WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isWindows } from '../util';

/**
 * A workspace folder at `fsPath` whose known locations are `locations`, the primary first, or not known yet.
 */
function folder(fsPath: string, index = 0, locations?: string[]): WorkspaceFolder {
	return { uri: Uri.file(fsPath), name: fsPath, index, locations: locations?.map(l => ({ uri: Uri.file(l), name: l })) };
}

/**
 * Returns the repositories that are closed when `removed` is removed while `remaining` stay, where
 * `repositories` maps a removed folder to the root of its repository and no editor is visible.
 */
function closeRemoved(removed: WorkspaceFolder[], remaining: WorkspaceFolder[], repositories: string[]): string[] {
	const tracker = new WorkspaceFolderRepositories<string>(root => root);
	return tracker.onDidChangeWorkspaceFolders({ added: [], removed }, remaining, uri => repositories[removed.findIndex(f => f.uri.toString() === uri.toString())], () => false).close;
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

	test('leaves the repository of a removed folder right away only when the added folder is one of its known locations, ignoring drive letter and path casing and separators', () => {
		const leavesRightAway = (removed: WorkspaceFolder, added: WorkspaceFolder) => new WorkspaceFolderRepositories<string>(root => root).onDidChangeWorkspaceFolders({ added: [added], removed: [removed] }, [added], () => removed.uri.fsPath, () => true).leave.length === 1;

		assert.deepStrictEqual([
			leavesRightAway(folder('C:\\Repo\\WT1', 0, ['C:\\Repo\\Primary', 'C:\\Repo\\WT1', 'C:\\Repo\\WT2']), folder('c:/repo/WT2/')),
			leavesRightAway(folder('\\\\server\\share\\wt1', 0, ['\\\\server\\share\\primary', '\\\\server\\share\\wt1']), folder('\\\\SERVER\\Share\\Primary\\')),
			leavesRightAway(folder('C:\\Repo\\WT1', 0, ['C:\\Repo\\Primary', 'C:\\Repo\\WT1', 'C:\\Repo\\WT2']), folder('D:\\Repo\\WT2')),
			leavesRightAway(folder('C:\\Repo\\WT1'), folder('c:\\repo\\wt2')),
		], [true, true, false, false]);
	});

	test('once the locations are known, leaves the kept repositories at another known location, regardless of drive letter and path casing and separators', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);
		const roots = ['C:/repo/wt1', 'c:\\repo\\primary', '\\\\Server\\Share\\WT3\\', 'C:/REPO/WT2/', 'C:\\Repo\\WT4'];
		const removed = roots.map((root, i) => folder(root, i + 3));
		const containers = [folder('C:\\Repo', 1), folder('\\\\server\\share', 2)];

		const onRemove = tracker.onDidChangeWorkspaceFolders({ added: [], removed }, containers, uri => roots[removed.findIndex(f => f.uri.toString() === uri.toString())], () => false);
		const onLocations = tracker.onDidChangeWorkspaceFolderLocations([folder('C:\\Repo\\WT2', 0, ['C:\\Repo\\Primary', 'C:\\Repo\\WT1', 'C:\\Repo\\WT2', '\\\\server\\share\\wt3']), ...containers]);

		assert.deepStrictEqual({ onRemove, onLocations }, { onRemove: { close: [], leave: [] }, onLocations: { close: [], leave: ['C:/repo/wt1', 'c:\\repo\\primary', '\\\\Server\\Share\\WT3\\'] } });
	});

	test('leaves the repository of a nested worktree for its primary location, even with an editor of it visible', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);
		const nested = folder('C:\\Repo\\Primary\\.worktrees\\w1', 0, ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1']);
		const primary = folder('c:\\repo\\primary');

		const toLeave = tracker.onDidChangeWorkspaceFolders({ added: [primary], removed: [nested] }, [primary], () => 'C:\\Repo\\Primary\\.worktrees\\w1', () => true);

		assert.deepStrictEqual(toLeave, { close: [], leave: ['C:\\Repo\\Primary\\.worktrees\\w1'] });
	});

	test('leaves the repository of a nested worktree that is left before the locations are known, once they are', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);
		const primary = folder('c:\\repo\\primary');

		const onSwitch = tracker.onDidChangeWorkspaceFolders({ added: [primary], removed: [folder('C:\\Repo\\Primary\\.worktrees\\w1')] }, [primary], () => 'C:\\Repo\\Primary\\.worktrees\\w1', () => false);
		const onLocations = tracker.onDidChangeWorkspaceFolderLocations([folder('c:\\repo\\primary', 0, ['C:/Repo/Primary', 'c:\\repo\\primary\\.WORKTREES\\w1\\'])]);

		assert.deepStrictEqual({ onSwitch, onLocations }, { onSwitch: { close: [], leave: [] }, onLocations: { close: [], leave: ['C:\\Repo\\Primary\\.worktrees\\w1'] } });
	});

	test('takes a warm repository by its root, ignoring drive letter and path casing and separators', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);
		tracker.keepWarm('C:\\Repo\\WT1');
		tracker.keepWarm('\\\\server\\share\\wt3');

		assert.deepStrictEqual([tracker.takeWarm('c:/repo/wt1/'), tracker.takeWarm('\\\\SERVER\\Share\\WT3\\'), tracker.takeWarm('C:\\Repo\\WT1')], ['C:\\Repo\\WT1', '\\\\server\\share\\wt3', undefined]);
	});

	test('the current repository of a folder is the deepest one that contains it, ignoring drive letter and path casing', () => {
		const tracker = new WorkspaceFolderRepositories<string>(root => root);

		assert.deepStrictEqual(tracker.completeSwitch([folder('c:\\repo\\primary\\.WORKTREES\\w1')], ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1'], ['C:\\Repo\\Primary', 'C:\\Repo\\Primary\\.worktrees\\w1'], [], []), { show: ['C:\\Repo\\Primary\\.worktrees\\w1'], warm: ['C:\\Repo\\Primary'] });
	});
});
