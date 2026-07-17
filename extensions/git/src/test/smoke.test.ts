/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import { workspace, commands, window, Uri, WorkspaceEdit, Range, Selection, TextDocument, TextEditor, extensions, TabInputTextDiff } from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { GitExtension, API, Repository } from '../api/git';
import { Status } from '../api/git.constants';
import { fromGitUri, isGitUri } from '../uri';
import { eventToPromise } from '../util';

suite('git smoke test', function () {
	const cwd = workspace.workspaceFolders![0].uri.fsPath;

	function file(relativePath: string) {
		return path.join(cwd, relativePath);
	}

	function uri(relativePath: string) {
		return Uri.file(file(relativePath));
	}

	async function open(relativePath: string) {
		const doc = await workspace.openTextDocument(uri(relativePath));
		await window.showTextDocument(doc);
		return doc;
	}

	async function type(doc: TextDocument, text: string) {
		const edit = new WorkspaceEdit();
		const end = doc.lineAt(doc.lineCount - 1).range.end;
		edit.replace(doc.uri, new Range(end, end), text);
		await workspace.applyEdit(edit);
	}

	let git: API;
	let repository: Repository;

	suiteSetup(async function () {
		fs.writeFileSync(file('app.js'), 'hello', 'utf8');
		fs.writeFileSync(file('index.pug'), 'hello', 'utf8');
		cp.execSync('git init -b main', { cwd });
		cp.execSync('git config user.name testuser', { cwd });
		cp.execSync('git config user.email monacotools@example.com', { cwd });
		cp.execSync('git config commit.gpgsign false', { cwd });
		cp.execSync('git add .', { cwd });
		cp.execSync('git commit -m "initial commit"', { cwd });

		// make sure git is activated
		const ext = extensions.getExtension<GitExtension>('vscode.git');
		await ext?.activate();
		git = ext!.exports.getAPI(1);

		if (git.repositories.length === 0) {
			const onDidOpenRepository = eventToPromise(git.onDidOpenRepository);
			await commands.executeCommand('git.openRepository', cwd);
			await onDidOpenRepository;
		}

		assert.strictEqual(git.repositories.length, 1);
		assert.strictEqual(git.repositories[0].rootUri.fsPath, cwd);

		repository = git.repositories[0];
	});

	test('reflects working tree changes', async function () {
		await commands.executeCommand('workbench.view.scm');

		const appjs = await open('app.js');
		await type(appjs, ' world');
		await appjs.save();
		await repository.status();

		assert.strictEqual(repository.state.workingTreeChanges.length, 1);
		assert.strictEqual(repository.state.workingTreeChanges[0].uri.path, appjs.uri.path);
		assert.strictEqual(repository.state.workingTreeChanges[0].status, Status.MODIFIED);

		fs.writeFileSync(file('newfile.txt'), '');
		const newfile = await open('newfile.txt');
		await type(newfile, 'hey there');
		await newfile.save();
		await repository.status();

		assert.strictEqual(repository.state.workingTreeChanges.length, 2);
		assert.strictEqual(repository.state.workingTreeChanges[0].uri.path, appjs.uri.path);
		assert.strictEqual(repository.state.workingTreeChanges[0].status, Status.MODIFIED);
		assert.strictEqual(repository.state.workingTreeChanges[1].uri.path, newfile.uri.path);
		assert.strictEqual(repository.state.workingTreeChanges[1].status, Status.UNTRACKED);
	});

	test('opens diff editor', async function () {
		const appjs = uri('app.js');
		await commands.executeCommand('git.openChange', appjs);

		assert(window.activeTextEditor);
		assert.strictEqual(window.activeTextEditor!.document.uri.path, appjs.path);

		assert(window.tabGroups.activeTabGroup.activeTab);
		assert(window.tabGroups.activeTabGroup.activeTab!.input instanceof TabInputTextDiff);
	});

	test('stages correctly', async function () {
		const appjs = uri('app.js');
		const newfile = uri('newfile.txt');

		await repository.add([appjs.fsPath]);

		assert.strictEqual(repository.state.indexChanges.length, 1);
		assert.strictEqual(repository.state.indexChanges[0].uri.path, appjs.path);
		assert.strictEqual(repository.state.indexChanges[0].status, Status.INDEX_MODIFIED);

		assert.strictEqual(repository.state.workingTreeChanges.length, 1);
		assert.strictEqual(repository.state.workingTreeChanges[0].uri.path, newfile.path);
		assert.strictEqual(repository.state.workingTreeChanges[0].status, Status.UNTRACKED);

		await repository.revert([appjs.fsPath]);

		assert.strictEqual(repository.state.indexChanges.length, 0);

		assert.strictEqual(repository.state.workingTreeChanges.length, 2);
		assert.strictEqual(repository.state.workingTreeChanges[0].uri.path, appjs.path);
		assert.strictEqual(repository.state.workingTreeChanges[0].status, Status.MODIFIED);
		assert.strictEqual(repository.state.workingTreeChanges[1].uri.path, newfile.path);
		assert.strictEqual(repository.state.workingTreeChanges[1].status, Status.UNTRACKED);
	});

	test('stages, commits changes and verifies outgoing change', async function () {
		const appjs = uri('app.js');
		const newfile = uri('newfile.txt');

		await repository.add([appjs.fsPath]);
		await repository.commit('second commit');

		assert.strictEqual(repository.state.workingTreeChanges.length, 1);
		assert.strictEqual(repository.state.workingTreeChanges[0].uri.path, newfile.path);
		assert.strictEqual(repository.state.workingTreeChanges[0].status, Status.UNTRACKED);

		assert.strictEqual(repository.state.indexChanges.length, 0);

		await repository.commit('third commit', { all: true });

		assert.strictEqual(repository.state.workingTreeChanges.length, 0);
		assert.strictEqual(repository.state.indexChanges.length, 0);
	});

	test('does not stage a revert of the previous commit (#64027)', async function () {
		const name = 'stage-range.txt';
		fs.writeFileSync(file(name), '1\n2\n3\n4\n5\n6\n', 'utf8');
		cp.execSync(`git add ${name}`, { cwd });
		cp.execSync('git commit -m "add stage-range.txt"', { cwd });

		const doc = await open(name);
		const editor = window.activeTextEditor!;

		// Change two separate regions: line 1 and line 6.
		const edit = new WorkspaceEdit();
		edit.replace(doc.uri, new Range(0, 0, 0, 1), '1x');
		edit.replace(doc.uri, new Range(5, 0, 5, 1), '6x');
		await workspace.applyEdit(edit);
		await doc.save();

		// Stage the first region and commit it.
		await waitForWorkingTreeDiff(editor, 2);
		editor.selection = new Selection(0, 0, 0, 0);
		await commands.executeCommand('git.stageSelectedRanges');
		await repository.commit('stage first region');

		// Immediately stage the second region. The index base must be re-read after the
		// commit, otherwise the just-committed first region is staged as a revert.
		await waitForWorkingTreeDiff(editor, 1);
		editor.selection = new Selection(5, 0, 5, 0);
		await commands.executeCommand('git.stageSelectedRanges');

		assert.strictEqual(cp.execSync(`git show :${name}`, { cwd }).toString(), '1x\n2\n3\n4\n5\n6x\n');

		await repository.commit('stage second region');
	});

	test('rename/delete conflict', async function () {
		await commands.executeCommand('workbench.view.scm');

		const appjs = file('app.js');
		const renamejs = file('rename.js');

		await repository.createBranch('test', true);

		// Delete file (test branch)
		fs.unlinkSync(appjs);
		await repository.commit('commit on test', { all: true });

		await repository.checkout('main');

		// Rename file (main branch)
		fs.renameSync(appjs, renamejs);
		await repository.commit('commit on main', { all: true });

		try {
			await repository.merge('test');
		} catch (e) { }

		assert.strictEqual(repository.state.mergeChanges.length, 1);
		assert.strictEqual(repository.state.mergeChanges[0].status, Status.DELETED_BY_THEM);

		assert.strictEqual(repository.state.workingTreeChanges.length, 0);
		assert.strictEqual(repository.state.indexChanges.length, 0);
	});

	function waitForWorkingTreeDiff(editor: TextEditor, changes: number): Promise<void> {
		// Gate on the same working-tree diff (ref '~'/'') that git.stageSelectedRanges consumes.
		const ready = () => !!editor.diffInformation?.some(d => d.original && isGitUri(d.original) && ['~', ''].includes(fromGitUri(d.original).ref) && !d.isStale && d.changes.length === changes);
		if (ready()) {
			return Promise.resolve();
		}
		return new Promise<void>(resolve => {
			const disposable = window.onDidChangeTextEditorDiffInformation(e => {
				if (e.textEditor === editor && ready()) {
					disposable.dispose();
					resolve();
				}
			});
		});
	}
});
