/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { Uri, WorkspaceFolder } from 'vscode';
import { WorkspaceFolderRepositories } from '../workspaceFolderRepositories';
import { isDescendant } from '../util';

const primary = Uri.file('/repo/primary').fsPath;
const wt1 = Uri.file('/repo/wt1').fsPath;
const wt2 = Uri.file('/repo/wt2').fsPath;
const nested = path.join(primary, '.worktrees', 'w1');
const other = Uri.file('/other').fsPath;

function folder(fsPath: string, index = 0): WorkspaceFolder {
	return { uri: Uri.file(fsPath), name: path.basename(fsPath), index };
}

/**
 * The open repositories of a workspace, where each repository is its root, opened and closed as the git model does.
 */
class TestWorkspace {

	private readonly tracker = new WorkspaceFolderRepositories<string>(root => root);
	private readonly repositoriesOnDisk = [primary, wt1, wt2, nested, other];
	readonly repositories = new Set<string>();
	private visibleEditors: string[] = [];

	constructor(private folders: WorkspaceFolder[]) {
		folders.forEach(f => this.repositories.add(this.getRepositoryRoot(f.uri.fsPath)));
	}

	updateFolders(folders: WorkspaceFolder[]): void {
		const removed = this.folders.filter(f => !folders.includes(f));
		const added = folders.filter(f => !this.folders.includes(f));
		this.folders = folders;
		for (const repository of this.tracker.onDidChangeWorkspaceFolders({ added, removed }, folders, uri => this.getOpenRepository(uri.fsPath), r => this.hasVisibleEditor(r))) {
			this.repositories.delete(repository);
		}
		for (const folder of this.tracker.getAddedFoldersToOpen(added, [...this.repositories])) {
			this.repositories.add(this.getRepositoryRoot(folder.uri.fsPath));
		}
	}

	setVisibleEditors(files: string[]): void {
		this.visibleEditors = files;
		for (const repository of this.tracker.onDidChangeVisibleEditors(this.folders, r => this.hasVisibleEditor(r))) {
			this.repositories.delete(repository);
		}
	}

	/** A switch as the workbench applies it: the folder is replaced, then the editors of the new location are restored. */
	switchTo(location: WorkspaceFolder): { beforeEditorsSwap: string[]; after: string[] } {
		this.updateFolders([location]);
		const beforeEditorsSwap = [...this.repositories];
		this.setVisibleEditors([path.join(location.uri.fsPath, 'a.txt')]);
		return { beforeEditorsSwap, after: [...this.repositories] };
	}

	private getRepositoryRoot(fsPath: string): string {
		return this.getDeepest(this.repositoriesOnDisk, fsPath)!;
	}

	private getOpenRepository(fsPath: string): string | undefined {
		return this.getDeepest([...this.repositories], fsPath);
	}

	private getDeepest(repositories: string[], fsPath: string): string | undefined {
		return repositories.filter(r => isDescendant(r, fsPath)).sort((a, b) => b.length - a.length)[0];
	}

	private hasVisibleEditor(repository: string): boolean {
		return this.visibleEditors.some(e => this.getOpenRepository(e) === repository);
	}
}

suite('WorkspaceFolderRepositories', () => {

	test('closes the repository of a removed folder once its last visible editor is gone', () => {
		const otherFolder = folder(other, 1);
		const ws = new TestWorkspace([folder(primary), otherFolder]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		ws.updateFolders([otherFolder]);
		const whileVisible = [...ws.repositories];
		ws.setVisibleEditors([]);

		assert.deepStrictEqual({ whileVisible, after: [...ws.repositories] }, { whileVisible: [primary, other], after: [other] });
	});

	test('closes the repository of a removed folder without visible editors right away', () => {
		const otherFolder = folder(other, 1);
		const ws = new TestWorkspace([folder(primary), otherFolder]);

		ws.updateFolders([otherFolder]);

		assert.deepStrictEqual([...ws.repositories], [other]);
	});

	test('keeps a retained repository whose folder is added back', () => {
		const otherFolder = folder(other, 0);
		const ws = new TestWorkspace([folder(primary), otherFolder]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);
		ws.updateFolders([otherFolder]);

		ws.updateFolders([otherFolder, folder(primary, 1)]);
		ws.setVisibleEditors([]);

		assert.deepStrictEqual([...ws.repositories], [primary, other]);
	});

	test('retains the repository of a removed folder that is replaced by an unrelated folder', () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		ws.updateFolders([folder(other)]);

		assert.deepStrictEqual([...ws.repositories], [primary, other]);
	});

	test('a folder replaced by its worktrees in turn with editors open leaves one repository', () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		const steps = [ws.switchTo(folder(wt1)), ws.switchTo(folder(wt2)), ws.switchTo(folder(wt1))];

		assert.deepStrictEqual(steps, [
			{ beforeEditorsSwap: [primary, wt1], after: [wt1] },
			{ beforeEditorsSwap: [wt1, wt2], after: [wt2] },
			{ beforeEditorsSwap: [wt2, wt1], after: [wt1] },
		]);
	});

	test('a folder replaced by a repository nested in it with editors open ends with the nested repository', () => {
		const ws = new TestWorkspace([folder(primary)]);
		ws.setVisibleEditors([path.join(primary, 'a.txt')]);

		ws.updateFolders([folder(nested)]);
		const whileVisible = [...ws.repositories];
		ws.setVisibleEditors([path.join(nested, 'a.txt')]);

		assert.deepStrictEqual({ whileVisible, after: [...ws.repositories] }, { whileVisible: [primary, nested], after: [nested] });
	});
});

suite('WorkspaceFolderRepositories.getAddedFoldersToOpen', () => {

	test('opens the added folders that are not the root of an open repository', () => {
		const folders = [folder(primary), folder(nested, 1), folder(path.join(primary, 'src'), 2)];

		assert.deepStrictEqual(new WorkspaceFolderRepositories<string>(root => root).getAddedFoldersToOpen(folders, [primary]).map(f => f.uri.fsPath), [nested, path.join(primary, 'src')]);
	});
});
