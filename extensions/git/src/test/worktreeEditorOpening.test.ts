/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { TextEditor, Uri, WorkspaceFolder } from 'vscode';
import { Model } from '../model';
import { Repository } from '../repository';

interface IWorktreeEditorOpeningHarness {
	repositories: Repository[];
	logger: { trace(message: string): void; warn(message: string): void };
	_workspaceFoldersReady: Promise<void>;
	_initialStatuses: WeakMap<Repository, Promise<void>>;
	realPathCalls: number;
	opened: string[];
	getRepository(uri: Uri): Repository | undefined;
	getWorkspaceFileFolders(): WorkspaceFolder[];
	getWorkspaceFolderRealPath(folder: WorkspaceFolder): Promise<string | undefined>;
	getUnopenedWorktreeCheck(): Promise<(fsPath: string) => boolean>;
	openRepository(repoPath: string): Promise<void>;
	onDidChangeVisibleTextEditors(editors: readonly TextEditor[]): Promise<void>;
}

const onDidChangeVisibleTextEditors = Reflect.get(Model.prototype, 'onDidChangeVisibleTextEditors') as IWorktreeEditorOpeningHarness['onDidChangeVisibleTextEditors'];
const getUnopenedWorktreeCheck = Reflect.get(Model.prototype, 'getUnopenedWorktreeCheck') as IWorktreeEditorOpeningHarness['getUnopenedWorktreeCheck'];

suite('Model - editors in worktrees that are not workspace folders', () => {
	const projectRoot = path.join(path.sep, 'work', 'project');
	const worktreeRoot = path.join(path.sep, 'work', 'project.worktrees', 'feature');
	const otherRoot = path.join(path.sep, 'work', 'other');

	const editorFor = (fsPath: string) => ({ document: { uri: Uri.file(fsPath) } }) as TextEditor;

	function createHarness(): IWorktreeEditorOpeningHarness {
		const folder = { uri: Uri.file(projectRoot), name: 'project', index: 0 } satisfies WorkspaceFolder;
		const harness: IWorktreeEditorOpeningHarness = {
			repositories: [],
			logger: { trace: () => { }, warn: () => { } },
			_workspaceFoldersReady: Promise.resolve(),
			_initialStatuses: new WeakMap(),
			realPathCalls: 0,
			opened: [],
			getRepository: () => undefined,
			getWorkspaceFileFolders: () => [folder],
			getWorkspaceFolderRealPath: async () => {
				harness.realPathCalls++;
				return projectRoot;
			},
			getUnopenedWorktreeCheck: () => getUnopenedWorktreeCheck.call(harness),
			openRepository: async repoPath => { harness.opened.push(repoPath); },
			onDidChangeVisibleTextEditors: editors => onDidChangeVisibleTextEditors.call(harness, editors)
		};
		return harness;
	}

	function addRepository(harness: IWorktreeEditorOpeningHarness, initialStatus: Promise<void>): void {
		let statusDone = false;
		initialStatus = initialStatus.then(() => { statusDone = true; });
		const repository = { root: projectRoot, get worktrees() { return statusDone ? [{ path: worktreeRoot }] : []; } } as Repository;
		harness.repositories.push(repository);
		harness._initialStatuses.set(repository, initialStatus);
	}

	test('does not open a worktree outside the workspace while the workspace repository is still opening', async () => {
		const harness = createHarness();
		let openWorkspaceFolders!: () => void;
		let finishInitialStatus!: () => void;
		harness._workspaceFoldersReady = new Promise<void>(resolve => openWorkspaceFolders = resolve);

		const pending = harness.onDidChangeVisibleTextEditors([editorFor(path.join(worktreeRoot, 'a.ts'))]);
		addRepository(harness, new Promise<void>(resolve => finishInitialStatus = resolve));
		openWorkspaceFolders();
		finishInitialStatus();
		await pending;

		assert.deepStrictEqual(harness.opened, []);
	});

	test('opens repositories of files outside every known worktree', async () => {
		const harness = createHarness();
		addRepository(harness, Promise.resolve());

		await harness.onDidChangeVisibleTextEditors([editorFor(path.join(otherRoot, 'a.ts'))]);

		assert.deepStrictEqual(harness.opened, [otherRoot]);
	});

	test('checks a batch of editors with a single discovery', async () => {
		const harness = createHarness();
		addRepository(harness, Promise.resolve());

		await harness.onDidChangeVisibleTextEditors(['a.ts', 'b.ts', 'c.ts'].map(name => editorFor(path.join(worktreeRoot, name))));

		assert.deepStrictEqual({ opened: harness.opened, realPathCalls: harness.realPathCalls }, { opened: [], realPathCalls: 1 });
	});
});
