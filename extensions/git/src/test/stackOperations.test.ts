/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { commands, extensions, LogOutputChannel, Uri, window } from 'vscode';
import type { API, GitExtension, Repository } from '../api/git';
import { ForcePushMode, GitErrorCodes, RefType } from '../api/git.constants';
import { findGit, Git, GitError, Repository as GitRepository } from '../git';

suite('git stack operations', () => {
	let git: Git;
	let api: API;
	let logger: LogOutputChannel;
	const originalGitConfigCount = process.env.GIT_CONFIG_COUNT;

	suiteSetup(async () => {
		// The test host can inherit an incomplete Git config environment from its launcher.
		process.env.GIT_CONFIG_COUNT = '0';
		logger = window.createOutputChannel('git stack operations test', { log: true });
		const foundGit = await findGit(['git'], () => true, logger);
		git = new Git({ gitPath: foundGit.path, userAgent: 'git-stack-operations-test', version: foundGit.version });

		const extension = extensions.getExtension<GitExtension>('vscode.git');
		assert.ok(extension);
		await extension.activate();
		api = extension.exports.getAPI(1);
	});

	suiteTeardown(() => {
		if (originalGitConfigCount === undefined) {
			delete process.env.GIT_CONFIG_COUNT;
		} else {
			process.env.GIT_CONFIG_COUNT = originalGitConfigCount;
		}
		logger?.dispose();
	});

	function recordingRepository() {
		const repository = new GitRepository(git, '', undefined, { path: '', isBare: false }, logger);
		const calls: string[][] = [];
		repository.exec = async args => {
			calls.push(args);
			return { stdout: '', stderr: '', exitCode: 0 };
		};
		return { repository, calls };
	}

	test('rebase preserves one-argument behavior and passes onto/rebase-merges before upstream', async () => {
		const { repository, calls } = recordingRepository();
		await repository.rebase('main');
		await repository.rebase('old-base', { onto: 'new-base', rebaseMerges: true });
		await repository.rebaseAbort();

		assert.deepStrictEqual(calls, [
			['rebase', 'main'],
			['rebase', '--rebase-merges', '--onto', 'new-base', 'old-base'],
			['rebase', '--abort']
		]);
	});

	test('push uses an exact lease and leaves the existing push arguments unchanged', async () => {
		const { repository, calls } = recordingRepository();
		const next = 'a'.repeat(40);
		const previous = 'b'.repeat(40);
		await repository.pushRefWithLease('origin', 'stack/child', next, previous);
		await repository.push('origin', 'main', false, false, ForcePushMode.ForceWithLease);

		assert.deepStrictEqual(calls, [
			['check-ref-format', '--branch', 'stack/child'],
			['push', `--force-with-lease=refs/heads/stack/child:${previous}`, '--no-follow-tags', 'origin', `${next}:refs/heads/stack/child`],
			['push', '--force-with-lease', 'origin', 'main']
		]);
	});

	test('rejects invalid push inputs and reports a rejected explicit lease', async () => {
		const { repository, calls } = recordingRepository();
		const next = 'a'.repeat(40);
		const previous = 'b'.repeat(40);

		await assert.rejects(repository.pushRefWithLease('origin', '-bad', next, previous));
		await assert.rejects(repository.pushRefWithLease('origin', 'main', 'HEAD', previous));
		await assert.rejects(repository.pushRefWithLease('--upload-pack=bad', 'main', next, previous));
		assert.strictEqual(calls.length, 0);

		repository.exec = async args => {
			calls.push(args);
			if (args[0] === 'push') {
				throw new GitError({ stderr: 'error: failed to push some refs to origin\n ! [rejected] main -> main (stale info)', exitCode: 1 });
			}
			return { stdout: '', stderr: '', exitCode: 0 };
		};

		await assert.rejects(repository.pushRefWithLease('origin', 'main', next, previous),
			error => error instanceof GitError && error.gitErrorCode === GitErrorCodes.ForcePushWithLeaseRejected);
		assert.deepStrictEqual(calls.map(args => args[0]), ['check-ref-format', 'push']);
	});

	test('updates only local branch refs with a compare-and-swap and resets with --keep', async () => {
		const { repository, calls } = recordingRepository();
		const next = 'a'.repeat(40);
		const missing = '0'.repeat(40);
		await repository.updateRef('refs/heads/stack/child', next, missing);
		await repository.resetKeep('HEAD~');
		await assert.rejects(repository.updateRef('refs/tags/release', next, missing));
		await assert.rejects(repository.updateRef('refs/heads/--bad', next, missing));
		await assert.rejects(repository.updateRef('refs/heads/stack/child', missing, next));
		await assert.rejects(repository.resetKeep('--hard'));
		assert.deepStrictEqual(calls, [
			['check-ref-format', '--branch', 'stack/child'],
			['update-ref', '--no-deref', 'refs/heads/stack/child', next, missing],
			['reset', '--keep', 'HEAD~']
		]);
	});

	test('returns remote head names and hashes in the correct fields', async () => {
		const { repository, calls } = recordingRepository();
		const sha = 'a'.repeat(40);
		repository.exec = async args => {
			calls.push(args);
			return { stdout: `${sha}\trefs/heads/main\n`, stderr: '', exitCode: 0 };
		};

		assert.deepStrictEqual(await repository.getRemoteRefs('origin', { heads: true }), [
			{ name: 'main', commit: sha, type: RefType.Head }
		]);
		assert.deepStrictEqual(calls, [['ls-remote', '--heads', 'origin']]);
	});

	suite('public API', () => {
		let directory: string;
		let root: string;
		let repository: Repository;

		async function commit(content: string, message: string, fileName = 'tracked.txt'): Promise<string> {
			const filePath = path.join(root, fileName);
			await fs.promises.writeFile(filePath, content);
			await repository.add([filePath]);
			await repository.commit(message);
			return (await repository.getCommit('HEAD')).hash;
		}

		setup(async () => {
			directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vscode-git-stack-'));
			root = path.join(directory, 'repository');
			await fs.promises.mkdir(root);
			await git.init(root, { defaultBranch: 'main' });
			const opened = await api.openRepository(Uri.file(root));
			assert.ok(opened);
			repository = opened;
			await git.exec(root, ['config', 'user.name', 'Stack Tester']);
			await git.exec(root, ['config', 'user.email', 'stack@example.com']);
			await git.exec(root, ['config', 'commit.gpgsign', 'false']);
			await git.exec(root, ['config', 'core.autocrlf', 'false']);
			await commit('base\n', 'base');
		});

		teardown(async () => {
			if (repository) {
				await commands.executeCommand('git.close', repository.rootUri);
			}
			if (directory) {
				await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
			}
		});

		test('rebases onto a new base and aborts a conflicting rebase', async () => {
			const oldBase = (await repository.getCommit('HEAD')).hash;
			await repository.createBranch('feature', true);
			const original = await commit('feature\n', 'feature');
			await repository.checkout('main');
			const newBase = await commit('main\n', 'main');
			await repository.checkout('feature');

			await assert.rejects(repository.rebase(oldBase, { onto: newBase, rebaseMerges: true }));
			await repository.rebaseAbort();

			assert.deepStrictEqual({
				commit: (await repository.getCommit('HEAD')).hash,
				content: await fs.promises.readFile(path.join(root, 'tracked.txt'), 'utf8')
			}, { commit: original, content: 'feature\n' });
		});

		test('rebase accepts an old base and replays commits on a new base', async () => {
			const oldBase = (await repository.getCommit('HEAD')).hash;
			await repository.createBranch('feature', true);
			const previous = await commit('feature\n', 'feature', 'feature.txt');
			await repository.checkout('main');
			const newBase = await commit('main\n', 'main', 'main.txt');
			await repository.checkout('feature');

			await repository.rebase(oldBase, { onto: newBase, rebaseMerges: true });
			const rebased = await repository.getCommit('HEAD');
			assert.deepStrictEqual({ parent: rebased.parents[0], changed: rebased.hash !== previous }, { parent: newBase, changed: true });
		});

		test('rebase preserves the one-argument public API', async () => {
			await repository.createBranch('feature', true);
			const previous = await commit('feature\n', 'feature', 'feature.txt');
			await repository.checkout('main');
			const newBase = await commit('main\n', 'main', 'main.txt');
			await repository.checkout('feature');

			await repository.rebase('main');
			const rebased = await repository.getCommit('HEAD');
			assert.deepStrictEqual({ parent: rebased.parents[0], changed: rebased.hash !== previous }, { parent: newBase, changed: true });
		});

		test('rebases through a detached worktree opened with the public API', async () => {
			const oldBase = (await repository.getCommit('HEAD')).hash;
			await repository.createBranch('feature', true);
			const oldHead = await commit('feature\n', 'feature', 'feature.txt');
			await repository.checkout('main');
			const newBase = await commit('main\n', 'main', 'main.txt');
			const worktreePath = path.join(directory, 'detached-worktree');
			const createdPath = await repository.createWorktree({ path: worktreePath, commitish: oldHead });
			let temporaryRepository: Repository | null = null;

			try {
				assert.strictEqual(createdPath, worktreePath);
				temporaryRepository = await api.openRepository(Uri.file(worktreePath));
				assert.ok(temporaryRepository);
				await temporaryRepository.checkout(oldHead);
				await temporaryRepository.rebase(oldBase, { onto: newBase, rebaseMerges: true });

				const rebased = await temporaryRepository.getCommit('HEAD');
				assert.deepStrictEqual({
					kind: temporaryRepository.kind,
					detached: temporaryRepository.state.HEAD?.name === undefined,
					parent: rebased.parents[0],
					rewritten: rebased.hash !== oldHead,
					rootHead: (await repository.getCommit('HEAD')).hash,
					feature: (await repository.getBranch('feature')).commit
				}, {
					kind: 'worktree',
					detached: true,
					parent: newBase,
					rewritten: true,
					rootHead: newBase,
					feature: oldHead
				});
			} finally {
				await repository.deleteWorktree(worktreePath, { force: true });
			}

			assert.strictEqual(fs.existsSync(worktreePath), false);
		});

		test('updates a branch by CAS, reads remote tips and rejects a stale push lease', async () => {
			const base = (await repository.getCommit('HEAD')).hash;
			const next = await commit('next\n', 'next');
			const absent = '0'.repeat(base.length);
			await repository.updateRef('refs/heads/stack', base, absent);
			await repository.updateRef('refs/heads/stack', next, base);
			await assert.rejects(repository.updateRef('refs/heads/stack', base, base));
			await assert.rejects(repository.updateRef('refs/heads/not..valid', next, absent));
			assert.strictEqual((await repository.getBranch('stack')).commit, next);

			const remote = path.join(directory, 'remote.git');
			await git.exec(root, ['init', '--bare', remote]);
			await repository.addRemote('origin', remote);
			await repository.pushRefWithLease('origin', 'stack', base, absent);
			await repository.pushRefWithLease('origin', 'stack', next, base);
			await assert.rejects(repository.pushRefWithLease('origin', 'stack', base, base));
			await assert.rejects(repository.pushRefWithLease('origin', 'not..valid', base, absent));
			assert.deepStrictEqual((await repository.getRemoteRefs('origin', { heads: true })).map(ref => ({
				name: ref.name, commit: ref.commit, type: ref.type
			})), [{ name: 'stack', commit: next, type: RefType.Head }]);
		});

		test('branch CAS does not dereference symbolic refs', async () => {
			const base = (await repository.getCommit('HEAD')).hash;
			const next = await commit('next\n', 'next');
			await git.exec(root, ['update-ref', 'refs/tags/release', base]);
			await git.exec(root, ['symbolic-ref', 'refs/heads/alias', 'refs/tags/release']);

			await assert.rejects(repository.updateRef('refs/heads/alias', next, next));
			await repository.updateRef('refs/heads/alias', next, base);
			await assert.rejects(repository.updateRef('refs/heads/alias', base, base));

			assert.deepStrictEqual({
				branch: (await repository.getBranch('alias')).commit,
				tag: (await git.exec(root, ['rev-parse', 'refs/tags/release'])).stdout.trim()
			}, { branch: next, tag: base });
		});

		test('leased pushes never follow tags, including when the lease is rejected', async () => {
			const base = (await repository.getCommit('HEAD')).hash;
			const next = await commit('next\n', 'next');
			const remote = path.join(directory, 'remote.git');
			await git.exec(root, ['init', '--bare', remote]);
			await repository.addRemote('origin', remote);
			await repository.pushRefWithLease('origin', 'stack', base, '0'.repeat(base.length));
			await git.exec(root, ['config', 'push.followTags', 'true']);
			await git.exec(root, ['-c', 'tag.gpgsign=false', 'tag', '-a', 'release', '-m', 'release', next]);

			await assert.rejects(repository.pushRefWithLease('origin', 'stack', next, '0'.repeat(base.length)),
				{ gitErrorCode: GitErrorCodes.ForcePushWithLeaseRejected });
			const rejected = await repository.getRemoteRefs('origin');
			await repository.pushRefWithLease('origin', 'stack', next, base);
			const successful = await repository.getRemoteRefs('origin');

			assert.deepStrictEqual({ rejected, successful }, {
				rejected: [{ name: 'stack', commit: base, type: RefType.Head }],
				successful: [{ name: 'stack', commit: next, type: RefType.Head }]
			});
		});

		test('resetKeep refuses to overwrite changes and succeeds once the worktree is clean', async () => {
			const base = (await repository.getCommit('HEAD')).hash;
			const next = await commit('next\n', 'next');
			const tracked = path.join(root, 'tracked.txt');
			await fs.promises.writeFile(tracked, 'uncommitted\n');
			await assert.rejects(repository.resetKeep(base));
			assert.deepStrictEqual({
				head: (await repository.getCommit('HEAD')).hash,
				content: await fs.promises.readFile(tracked, 'utf8')
			}, { head: next, content: 'uncommitted\n' });

			await repository.restore([tracked]);
			await repository.resetKeep(base);
			assert.deepStrictEqual({
				head: (await repository.getCommit('HEAD')).hash,
				content: await fs.promises.readFile(tracked, 'utf8')
			}, { head: base, content: 'base\n' });
		});
	});
});
