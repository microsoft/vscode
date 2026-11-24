/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import assert from 'assert';
import { workspace, commands, window, Uri, WorkspaceEdit, Range, TextDocument, extensions, TabInputTextDiff, TabInputCustom, TabInputNotebook, TabInputNotebookDiff } from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GitExtension, API, Repository } from '../api/git';
import { Status } from '../api/git.constants';
import { eventToPromise } from '../util';
import { Git, findGit } from '../git';
import type { GitExtensionImpl } from '../api/extension';
import type { Model } from '../model';

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

	function getModel(): Model {
		return (extensions.getExtension<GitExtension>('vscode.git')!.exports as GitExtensionImpl).model!;
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

	test('stages the resource of the active custom editor', async function () {
		const imageFileName = 'image.png';
		const image = uri(imageFileName);

		// 1x1 transparent PNG
		fs.writeFileSync(image.fsPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));

		try {
			await repository.status();
			assert(repository.state.workingTreeChanges.some(change => change.uri.path === image.path && change.status === Status.UNTRACKED));

			await commands.executeCommand('vscode.open', image);
			assert(window.tabGroups.activeTabGroup.activeTab?.input instanceof TabInputCustom);

			// git.stage without an argument resolves the resource from the active custom editor
			await commands.executeCommand('git.stage');
			assert(repository.state.indexChanges.some(change => change.uri.path === image.path && change.status === Status.INDEX_ADDED));
		} finally {
			// Remove the image so the following tests start from a clean tree
			await commands.executeCommand('workbench.action.closeActiveEditor');
			cp.execSync(`git rm --cached --ignore-unmatch -q ${imageFileName}`, { cwd });
			fs.unlinkSync(image.fsPath);
			await repository.status();
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

	test('a closed repository runs the operations of an extension that still holds it', async function () {
		const model = getModel();
		const repositoryPath = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-smoke-')));
		cp.execSync('git init -b main', { cwd: repositoryPath });
		cp.execSync('git -c user.name=testuser -c user.email=monacotools@example.com commit --allow-empty -m "initial commit"', { cwd: repositoryPath });

		try {
			const apiRepository = (await git.openRepository(Uri.file(repositoryPath)))!;
			apiRepository.inputBox.value = 'draft';

			const onDidCloseRepository = eventToPromise(git.onDidCloseRepository);
			model.close(model.getRepository(repositoryPath)!);
			const closedRepository = await onDidCloseRepository;

			await apiRepository.status();
			const commit = await apiRepository.getCommit('HEAD');
			assert.deepStrictEqual(
				{ repositories: git.repositories.map(r => r.rootUri.fsPath), closedInputBox: closedRepository.inputBox.value, message: commit.message },
				{ repositories: [cwd], closedInputBox: 'draft', message: 'initial commit' });
		} finally {
			// On Windows, the closed repository's watchers can hold the folder for a moment
			await fs.promises.rm(repositoryPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		}
	});

	test('closing a parent repository closes its worktree', async function () {
		const model = getModel();

		// The worktree finds its parent by the path of the common .git folder, which git reports in full. Unlike
		// fs.realpathSync, the native real path also expands Windows short names such as RUNNER~1.
		const base = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-smoke-')));
		const parentPath = path.join(base, 'parent');
		const worktreePath = path.join(base, 'worktree');
		fs.mkdirSync(parentPath);
		cp.execSync('git init -b main', { cwd: parentPath });
		cp.execSync('git -c user.name=testuser -c user.email=monacotools@example.com commit --allow-empty -m "initial commit"', { cwd: parentPath });
		cp.execSync(`git worktree add -b worktree "${worktreePath}"`, { cwd: parentPath });

		try {
			const parentRepository = (await git.openRepository(Uri.file(parentPath)))!;
			const worktreeRepository = (await git.openRepository(Uri.file(worktreePath)))!;
			const worktreeFoundParent = model.getRepository(worktreeRepository.rootUri)!.parentRoot !== undefined;

			// The worktree closes while its parent is still open. Compare URIs rather than paths, because on
			// Windows Uri.fsPath lowercases the drive letter.
			const parentOpenWhenWorktreeCloses: boolean[] = [];
			const listener = git.onDidCloseRepository(r => {
				if (r.rootUri.toString() === worktreeRepository.rootUri.toString()) {
					parentOpenWhenWorktreeCloses.push(git.getRepository(parentRepository.rootUri) !== null);
				}
			});
			model.close(model.getRepository(parentRepository.rootUri)!);
			listener.dispose();

			// An extension that still holds the worktree can run operations on it
			const commit = await worktreeRepository.getCommit('HEAD');
			assert.deepStrictEqual(
				{ worktreeFoundParent, repositories: git.repositories.map(r => r.rootUri.fsPath), parentOpenWhenWorktreeCloses, message: commit.message },
				{ worktreeFoundParent: true, repositories: [cwd], parentOpenWhenWorktreeCloses: [true], message: 'initial commit' });
		} finally {
			// On Windows, the closed repositories' watchers can hold the folder for a moment
			await fs.promises.rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		}
	});

	test('the source control shows the status, commit messages and visibility of its repository', async function () {
		const model = getModel();
		const repositoryPath = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'git-smoke-')));
		const runGit = (command: string) => cp.execSync(`git ${command}`, { cwd: repositoryPath, stdio: 'pipe' });
		runGit('init -b main');
		runGit('config user.name testuser');
		runGit('config user.email monacotools@example.com');
		runGit('config commit.gpgsign false');
		fs.writeFileSync(path.join(repositoryPath, 'modified.txt'), 'one\n');
		fs.writeFileSync(path.join(repositoryPath, 'staged.txt'), 'one\n');
		fs.writeFileSync(path.join(repositoryPath, 'conflict.txt'), 'base\n');
		runGit('add .');
		runGit('commit -m "initial commit"');
		fs.writeFileSync(path.join(repositoryPath, 'modified.txt'), 'two\n');
		fs.writeFileSync(path.join(repositoryPath, 'staged.txt'), 'two\n');
		runGit('add staged.txt');
		fs.writeFileSync(path.join(repositoryPath, 'untracked.txt'), 'new\n');

		try {
			const apiRepository = (await git.openRepository(Uri.file(repositoryPath)))!;
			const sourceControl = model.getRepository(repositoryPath)!.sourceControl;
			const resources = (group: { resourceStates: { resourceUri: Uri; type: number }[] }) => group.resourceStates.map(r => `${path.basename(r.resourceUri.fsPath)}:${r.type}`).sort();

			// Core puts the commit template into an empty input box on its own, so the input box is read only after
			// the extension wrote it
			const read = (withInputBox: boolean) => ({
				merge: resources(sourceControl.mergeGroup),
				index: resources(sourceControl.indexGroup),
				workingTree: resources(sourceControl.workingTreeGroup),
				untracked: resources(sourceControl.untrackedGroup),
				count: sourceControl.sourceControl.count,
				commitTemplate: sourceControl.sourceControl.commitTemplate,
				...withInputBox ? { inputBox: sourceControl.sourceControl.inputBox.value } : {},
				isHidden: sourceControl.sourceControl.isHidden,
				// Commit hashes depend on the time of the commits
				statusBarCommands: sourceControl.sourceControl.statusBarCommands?.map(c => c.title.replace(/\b[0-9a-f]{8}\b/, '<commit>')),
				actionButton: sourceControl.sourceControl.actionButton?.command.title
			});

			// The main thread sends each input box value back, and a value that arrives late overwrites a newer one. A
			// round trip to the main thread makes sure that it sent back the last value before the next step changes
			// the input box.
			const waitForInputBox = async () => { await commands.getCommands(); };

			const actual: Record<string, ReturnType<typeof read> & { inputBoxEnabled?: boolean[] }> = {};
			await apiRepository.status();
			actual.opened = read(false);

			apiRepository.inputBox.value = 'draft';
			await waitForInputBox();
			const inputBoxEnabled: boolean[] = [];
			const operationsListener = model.getRepository(repositoryPath)!.onDidChangeOperations(() => {
				if (inputBoxEnabled.at(-1) !== sourceControl.sourceControl.inputBox.enabled) {
					inputBoxEnabled.push(sourceControl.sourceControl.inputBox.enabled);
				}
			});
			await apiRepository.commit('second commit');
			operationsListener.dispose();
			actual.committed = { ...read(true), inputBoxEnabled };
			await waitForInputBox();

			runGit('add .');
			runGit('commit -m "work in progress"');
			runGit('checkout -b topic');
			fs.writeFileSync(path.join(repositoryPath, 'conflict.txt'), 'topic\n');
			runGit('commit -am "topic change"');
			runGit('checkout main');
			fs.writeFileSync(path.join(repositoryPath, 'conflict.txt'), 'main\n');
			runGit('commit -am "main change"');
			runGit('checkout topic');
			assert.throws(() => runGit('rebase main'));
			await apiRepository.status();
			actual.rebasing = read(true);
			await waitForInputBox();

			runGit('rebase --abort');
			await apiRepository.status();
			actual.rebaseAborted = read(true);

			fs.writeFileSync(path.join(repositoryPath, '.git', 'template.txt'), 'subject from template\n');
			runGit('config commit.template .git/template.txt');
			await apiRepository.status();
			actual.template = read(false);

			model.getRepository(repositoryPath)!.setWarm(true);
			actual.warm = read(false);
			model.getRepository(repositoryPath)!.setWarm(false);
			actual.shown = read(false);

			const empty = { merge: [], index: [], workingTree: [], untracked: [], count: 0, commitTemplate: '', isHidden: false };
			const onTopic = { ...empty, statusBarCommands: ['$(git-branch) topic', '$(cloud-upload)'], actionButton: '$(cloud-upload) Publish Branch' };
			assert.deepStrictEqual(actual, {
				opened: {
					...empty,
					index: [`staged.txt:${Status.INDEX_MODIFIED}`],
					workingTree: [`modified.txt:${Status.MODIFIED}`, `untracked.txt:${Status.UNTRACKED}`],
					count: 3,
					statusBarCommands: ['$(git-branch-staged-changes) main*+', '$(cloud-upload)'],
					actionButton: '$(check) Commit'
				},
				committed: {
					...empty,
					workingTree: [`modified.txt:${Status.MODIFIED}`, `untracked.txt:${Status.UNTRACKED}`],
					count: 2,
					inputBox: '',
					statusBarCommands: ['$(git-branch-changes) main*', '$(cloud-upload)'],
					actionButton: '$(check) Commit',
					inputBoxEnabled: [false, true]
				},
				rebasing: {
					...empty,
					merge: [`conflict.txt:${Status.BOTH_MODIFIED}`],
					count: 1,
					commitTemplate: 'topic change',
					inputBox: 'topic change',
					statusBarCommands: ['$(git-commit) <commit>! (Rebasing)', '$(cloud-upload)'],
					actionButton: '$(check) Continue'
				},
				rebaseAborted: { ...onTopic, inputBox: '' },
				template: { ...onTopic, commitTemplate: 'subject from template' },
				warm: { ...onTopic, commitTemplate: 'subject from template', isHidden: true },
				shown: { ...onTopic, commitTemplate: 'subject from template' }
			});
		} finally {
			const repository = model.getRepository(repositoryPath);
			if (repository) {
				model.close(repository);
			}
			// On Windows, the closed repository's watchers can hold the folder for a moment
			await fs.promises.rm(repositoryPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
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
