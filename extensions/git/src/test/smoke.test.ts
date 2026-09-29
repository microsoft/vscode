/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import { workspace, commands, window, Uri, WorkspaceEdit, Range, TextDocument, extensions, TabInputTextDiff, TabInputNotebook, TabInputNotebookDiff } from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { GitExtension, API, Repository } from '../api/git';
import { Status } from '../api/git.constants';
import { eventToPromise } from '../util';
import { Git, findGit } from '../git';

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

	test('reads non-UTF-8 encoded commit messages as UTF-8', async function () {
		const expectCommitMessage = 'テスト';
		const commitMessage = Buffer.from('a5c6a5b9a5c8', 'hex'); // Encoded in EUC-JP
		const commitMessageFile = file('commit-message.txt');
		const trackedFileName = 'tracked-file.txt';
		const trackedFile = file(trackedFileName);

		let previousCommitEncoding: string | undefined;
		try {
			previousCommitEncoding = cp.execSync('git config i18n.commitEncoding', { cwd, encoding: 'utf8' }).trim();
		} catch {
			previousCommitEncoding = undefined;
		}

		let previousLogOutputEncoding: string | undefined;
		try {
			previousLogOutputEncoding = cp.execSync('git config i18n.logOutputEncoding', { cwd, encoding: 'utf8' }).trim();
		} catch {
			previousLogOutputEncoding = undefined;
		}

		try {
			fs.writeFileSync(commitMessageFile, commitMessage);
			fs.writeFileSync(trackedFile, 'hello\n');
			cp.execSync(`git add ${trackedFileName}`, { cwd });
			cp.execSync('git config i18n.commitEncoding EUC-JP', { cwd });
			cp.execSync('git config i18n.logOutputEncoding EUC-JP', { cwd });
			cp.execSync(`git commit --file "${commitMessageFile}"`, { cwd });

			const [commitLog] = await repository.log({ maxEntries: 1 });

			assert.strictEqual(commitLog.message, expectCommitMessage);

			const commit = await repository.getCommit(commitLog.hash);
			assert.strictEqual(commit.message, expectCommitMessage);

			// Test internal Git/Repository methods that aren't exposed in the public API.
			const testId = 'git-utf8-encoding-test';
			const logger = window.createOutputChannel(testId, { log: true });
			try {
				const iGit = await findGit(['git'], () => true, logger);
				const internalGit = new Git({ gitPath: iGit.path, userAgent: testId, version: iGit.version });
				const dotGit = await internalGit.getRepositoryDotGit(cwd);
				const internalRepository = internalGit.open(cwd, undefined, dotGit, logger);

				const blame = await internalRepository.blame2(trackedFile);
				assert.strictEqual(blame?.length, 1);
				assert.strictEqual(blame[0].subject, expectCommitMessage);

				const fileLog = await internalRepository.logFile(Uri.file(trackedFile));
				assert.strictEqual(fileLog.length, 1);
				assert.strictEqual(fileLog[0].message, expectCommitMessage);

				const changes = await internalRepository.showChanges(commitLog.hash);
				assert(changes.includes(expectCommitMessage));

				const changesBetween = await internalRepository.showChangesBetween(`${commitLog.hash}^`, commitLog.hash);
				assert(changesBetween.includes(expectCommitMessage));
			} finally {
				logger.dispose();
			}
		} finally {
			// Clean up without masking the original failure
			if (fs.existsSync(commitMessageFile)) {
				fs.unlinkSync(commitMessageFile);
			}

			try {
				if (previousCommitEncoding) {
					cp.execSync(`git config i18n.commitEncoding ${previousCommitEncoding}`, { cwd });
				} else {
					cp.execSync('git config --unset i18n.commitEncoding', { cwd });
				}
			} catch {
				// Ignore cleanup errors if the config was never set or already unset.
			}

			try {
				if (previousLogOutputEncoding) {
					cp.execSync(`git config i18n.logOutputEncoding ${previousLogOutputEncoding}`, { cwd });
				} else {
					cp.execSync('git config --unset i18n.logOutputEncoding', { cwd });
				}
			} catch {
				// Ignore cleanup errors if the config was never set or already unset.
			}
		}
	});

	// diabled because of https://github.com/microsoft/vscode/issues/327142
	test.skip('opens notebook diff and file from active notebook editor', async function () {
		const committed = JSON.stringify({ cells: [{ cell_type: 'code', source: ['x = 1'], metadata: {}, outputs: [], execution_count: null }], metadata: {}, nbformat: 4, nbformat_minor: 5 });
		fs.writeFileSync(file('notebook.ipynb'), committed);
		await repository.add([file('notebook.ipynb')]);
		await repository.commit('add notebook');

		fs.writeFileSync(file('notebook.ipynb'), committed.replace('x = 1', 'x = 2'));
		await repository.status();

		try {
			const notebook = await workspace.openNotebookDocument(uri('notebook.ipynb'));
			await window.showNotebookDocument(notebook);

			// git.openChange without an argument resolves the resource from the active notebook editor
			await commands.executeCommand('git.openChange');
			assert(window.tabGroups.activeTabGroup.activeTab?.input instanceof TabInputNotebookDiff);

			// git.openFile toggles back to the notebook from the active notebook diff editor
			await commands.executeCommand('git.openFile');
			assert(window.tabGroups.activeTabGroup.activeTab?.input instanceof TabInputNotebook);
		} finally {
			// Restore the committed content so the following tests start from a clean tree
			fs.writeFileSync(file('notebook.ipynb'), committed);
			await repository.status();
		}
	});

	// diabled because of https://github.com/microsoft/vscode/issues/327142
	test.skip('rename/delete conflict', async function () {
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
});
