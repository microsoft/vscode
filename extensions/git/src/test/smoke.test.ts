/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import { workspace, commands, window, Uri, WorkspaceEdit, Range, TextDocument, extensions, TabInputTextDiff } from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitExtension, API, Repository, Status } from '../api/git';
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

	function commitFile(relativePath: string) {
		fs.writeFileSync(file(relativePath), relativePath, 'utf8');
		cp.execSync('git add ' + relativePath, { cwd });
		cp.execSync('git commit -m ' + JSON.stringify(relativePath), { cwd });
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

	test('rename/delete conflict', async function () {
		await commands.executeCommand('workbench.view.scm');

		const appjs = file('app.js');
		const renamejs = file('rename.js');

		try {
			await repository.createBranch('test', true);

			fs.unlinkSync(appjs);
			await repository.commit('commit on test', { all: true });

			await repository.checkout('main');

			fs.renameSync(appjs, renamejs);
			await repository.commit('commit on main', { all: true });

			try {
				await repository.merge('test');
			} catch (e) { }

			assert.strictEqual(repository.state.mergeChanges.length, 1);
			assert.strictEqual(repository.state.mergeChanges[0].status, Status.DELETED_BY_THEM);

			assert.strictEqual(repository.state.workingTreeChanges.length, 0);
			assert.strictEqual(repository.state.indexChanges.length, 0);
		} finally {
			try { cp.execSync('git merge --abort', { cwd, stdio: 'pipe' }); } catch { }
		}
	});

	test('sync respects triangular workflow (pull from upstream, push to origin)', async function () {
		const testId = Date.now();
		const upstreamBare = path.join(os.tmpdir(), `vscode-git-sync-upstream-${testId}`);
		const originBare = path.join(os.tmpdir(), `vscode-git-sync-origin-${testId}`);
		cp.execSync(`git -c advice.defaultBranchName=false init "${upstreamBare}"`);
		cp.execSync(`git -c advice.defaultBranchName=false init "${originBare}"`);

		try {
			cp.execSync(`git remote add origin "${originBare}"`, { cwd });
			cp.execSync(`git remote add upstream "${upstreamBare}"`, { cwd });

			cp.execSync(`git push upstream main:main`, { cwd });
			cp.execSync('git checkout upstream/main -b feature', { cwd });
			cp.execSync('git config branch.feature.pushRemote origin', { cwd });
			cp.execSync('git push origin feature', { cwd });

			cp.execSync('git checkout main', { cwd });
			commitFile('main-first.txt');
			commitFile('main-second.txt');
			cp.execSync('git push upstream main', { cwd });

			cp.execSync('git checkout feature', { cwd });
			cp.execSync('git push', { cwd });
			commitFile('feature-first.txt');

			await workspace.getConfiguration('git', Uri.file(cwd)).update('confirmSync', false, true);
			await repository.status();

			assert.strictEqual(repository.state.HEAD?.name, 'feature');
			assert.strictEqual(repository.state.HEAD?.ahead, 1, 'sync should show 1 commits to push to origin');
			assert.strictEqual(repository.state.HEAD?.behind, 2, 'sync should show 2 commit to pull from upstream');

			await commands.executeCommand('git.sync');
			await repository.status();
			assert.strictEqual(repository.state.HEAD?.ahead, 0);
			assert.strictEqual(repository.state.HEAD?.behind, 0);

			const originFeatureCommit = cp.execSync('git rev-parse origin/feature', { cwd, encoding: 'utf8' }).trim();
			assert.strictEqual(repository.state.HEAD?.commit, originFeatureCommit, 'HEAD should be synced with origin/feature');
			cp.execSync('git merge-base --is-ancestor upstream/main HEAD', { cwd });
		} finally {
			try { cp.execSync('git checkout main', { cwd }); } catch { }
			try { cp.execSync('git branch -D feature', { cwd }); } catch { }
			try { cp.execSync('git remote remove upstream', { cwd }); } catch { }
			try { cp.execSync('git remote remove origin', { cwd }); } catch { }
			try { cp.execSync('git config --unset branch.feature.pushRemote', { cwd }); } catch { }
			try { fs.rmSync(upstreamBare, { recursive: true, force: true }); } catch { }
			try { fs.rmSync(originBare, { recursive: true, force: true }); } catch { }
		}
	});
});
