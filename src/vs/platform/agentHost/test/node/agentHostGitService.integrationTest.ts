/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for {@link AgentHostGitService} that spawn real `git` against
 * temporary on-disk repositories. Kept out of the unit-test suite because they
 * require `git` on PATH and do real filesystem and process work — same split as
 * the git extension (pure parser tests in `git.test.ts`, on-disk tests in
 * `smoke.test.ts`).
 *
 * Run via `scripts/test-integration.sh`.
 */

import assert from 'assert';
import * as cp from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { NullLogService } from '../../../log/common/log.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { Schemas } from '../../../../base/common/network.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';

function createGitService(disposables: Pick<DisposableStore, 'add'>): AgentHostGitService {
	const logService = new NullLogService();
	const fileService = disposables.add(new FileService(logService));
	disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
	const env: Partial<INativeEnvironmentService> = { tmpDir: URI.file(tmpdir()) };
	return new AgentHostGitService(fileService, env as INativeEnvironmentService);
}

suite('AgentHostGitService - getSessionGitState (real git)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	// Skip the on-disk git tests when `git` is not on PATH (e.g. minimal CI).
	const hasGit = (() => {
		try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
	})();

	let tmpRoot: string | undefined;
	let svc: AgentHostGitService | undefined;

	setup(() => {
		tmpRoot = undefined;
		svc = createGitService(disposables);
	});

	teardown(() => {
		if (tmpRoot) {
			rmSync(tmpRoot, { recursive: true, force: true });
		}
	});

	function initRepo(opts?: { remote?: string; baseBranch?: string }): string {
		tmpRoot = mkdtempSync(join(tmpdir(), 'agent-host-git-'));
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		const run = (...args: string[]) => cp.execFileSync('git', args, { cwd: tmpRoot!, env, stdio: 'pipe' });
		run('init', '-q', '-b', opts?.baseBranch ?? 'main');
		run('commit', '-q', '--allow-empty', '-m', 'initial');
		if (opts?.remote) {
			run('remote', 'add', 'origin', opts.remote);
		}
		return tmpRoot!;
	}

	(hasGit ? test : test.skip)('returns undefined for a non-git directory', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-host-nongit-'));
		tmpRoot = dir;
		const result = await svc!.getSessionGitState(URI.file(dir));
		assert.strictEqual(result, undefined);
	});

	(hasGit ? test : test.skip)('reports branch, github remote and clean state for a fresh repo', async () => {
		const dir = initRepo({ remote: 'https://github.com/owner/repo.git' });
		const result = await svc!.getSessionGitState(URI.file(dir));
		assert.ok(result, 'expected git state');
		assert.strictEqual(result.branchName, 'main');
		assert.strictEqual(result.hasGitHubRemote, true);
		assert.strictEqual(result.uncommittedChanges, 0);
		// No upstream configured for the fresh local branch.
		assert.strictEqual(result.upstreamBranchName, undefined);
		assert.strictEqual(result.outgoingChanges, undefined);
		assert.strictEqual(result.incomingChanges, undefined);
	});

	(hasGit ? test : test.skip)('counts uncommitted changes', async () => {
		const dir = initRepo({ remote: 'git@gitlab.com:owner/repo.git' });
		const fs = await import('fs/promises');
		await fs.writeFile(join(dir, 'a.txt'), 'hello');
		await fs.writeFile(join(dir, 'b.txt'), 'world');
		const result = await svc!.getSessionGitState(URI.file(dir));
		assert.ok(result);
		assert.strictEqual(result.uncommittedChanges, 2);
		assert.strictEqual(result.hasGitHubRemote, false);
	});

	(hasGit ? test : test.skip)('reports outgoingChanges relative to base branch when local branch has no upstream', async () => {
		// Create a bare "remote" repo and set up the working repo so that
		// `refs/remotes/origin/HEAD` exists (required for baseBranchName parsing).
		const remoteDir = mkdtempSync(join(tmpdir(), 'agent-host-remote-'));
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		try {
			cp.execFileSync('git', ['init', '-q', '--bare', '-b', 'main'], { cwd: remoteDir, env, stdio: 'pipe' });
			tmpRoot = mkdtempSync(join(tmpdir(), 'agent-host-git-'));
			const run = (...args: string[]) => cp.execFileSync('git', args, { cwd: tmpRoot!, env, stdio: 'pipe' });
			run('init', '-q', '-b', 'main');
			run('commit', '-q', '--allow-empty', '-m', 'initial');
			run('remote', 'add', 'origin', `https://github.com/owner/repo.git`);
			// Use a separate "upload" remote pointing at the bare repo to populate
			// the origin/main remote-tracking ref without changing the GitHub URL
			// we're testing for hasGitHubRemote detection.
			run('remote', 'add', 'tmp', remoteDir);
			run('push', '-q', 'tmp', 'main:main');
			// Create the origin/main ref locally without any network round-trip.
			run('update-ref', 'refs/remotes/origin/main', 'refs/heads/main');
			run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');

			// Branch off and add two commits without setting an upstream.
			run('checkout', '-q', '-b', 'feature', '--no-track');
			run('commit', '-q', '--allow-empty', '-m', 'one');
			run('commit', '-q', '--allow-empty', '-m', 'two');

			const result = await svc!.getSessionGitState(URI.file(tmpRoot!));
			assert.ok(result, 'expected git state');
			assert.strictEqual(result.branchName, 'feature');
			assert.strictEqual(result.baseBranchName, 'main');
			assert.strictEqual(result.upstreamBranchName, undefined);
			assert.strictEqual(result.outgoingChanges, 2);
			assert.strictEqual(result.uncommittedChanges, 0);
		} finally {
			rmSync(remoteDir, { recursive: true, force: true });
		}
	});
});

suite('AgentHostGitService - computeSessionFileDiffs (real git)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const hasGit = (() => {
		try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
	})();

	let tmpRoot: string | undefined;
	let svc: AgentHostGitService | undefined;

	setup(() => {
		tmpRoot = undefined;
		svc = createGitService(disposables);
	});

	teardown(() => {
		if (tmpRoot) {
			rmSync(tmpRoot, { recursive: true, force: true });
		}
	});

	function initRepo(): { dir: string; run: (...args: string[]) => Buffer } {
		tmpRoot = mkdtempSync(join(tmpdir(), 'agent-host-diff-'));
		const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
		const run = (...args: string[]) => cp.execFileSync('git', args, { cwd: tmpRoot!, env, stdio: 'pipe' });
		run('init', '-q', '-b', 'main');
		return { dir: tmpRoot!, run };
	}

	(hasGit ? test : test.skip)('returns undefined for a non-git directory', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-host-nongit-diff-'));
		tmpRoot = dir;
		const result = await svc!.computeSessionFileDiffs(URI.file(dir), { sessionUri: 'copilot:/s' });
		assert.strictEqual(result, undefined);
	});

	(hasGit ? test : test.skip)('reports modified, added (untracked) and deleted files against HEAD', async () => {
		const fs = await import('fs/promises');
		const { dir, run } = initRepo();
		await fs.writeFile(join(dir, 'kept.txt'), 'one\ntwo\nthree\n');
		await fs.writeFile(join(dir, 'gone.txt'), 'bye\n');
		run('add', '.');
		run('commit', '-q', '-m', 'init');

		// Modify, add (untracked), delete.
		await fs.writeFile(join(dir, 'kept.txt'), 'one\ntwo\nthree\nfour\n');
		await fs.writeFile(join(dir, 'fresh.txt'), 'hello\n');
		await fs.unlink(join(dir, 'gone.txt'));

		const result = await svc!.computeSessionFileDiffs(URI.file(dir), { sessionUri: 'copilot:/s' });
		assert.ok(result, 'expected diffs');
		const byPath = new Map(result.map(d => [d.after?.uri ?? d.before?.uri, d]));

		// Find by basename to be robust against path normalization differences (e.g. macOS /private prefix).
		const findByBasename = (name: string) => result.find(d => {
			const u = d.after?.uri ?? d.before?.uri;
			return typeof u === 'string' && u.endsWith('/' + name);
		});

		const kept = findByBasename('kept.txt');
		assert.ok(kept?.before && kept.after, `modified file should have before+after; result=${JSON.stringify(result.map(d => ({ a: d.after?.uri, b: d.before?.uri })))}`);
		assert.deepStrictEqual(kept!.diff, { added: 1, removed: 0 });
		assert.ok(kept!.before!.content.uri.startsWith('git-blob://'), 'before content should be a git-blob: URI');

		const fresh = findByBasename('fresh.txt');
		assert.ok(fresh?.after && !fresh.before, 'untracked file should have only after');

		const gone = findByBasename('gone.txt');
		assert.ok(gone?.before && !gone.after, 'deleted file should have only before');
		void byPath;
	});

	(hasGit ? test : test.skip)('anchors against the merge-base of the requested base branch', async () => {
		const fs = await import('fs/promises');
		const { dir, run } = initRepo();
		await fs.writeFile(join(dir, 'a.txt'), 'a\n');
		run('add', '.');
		run('commit', '-q', '-m', 'init');
		// Branch off, then advance main behind us so merge-base != HEAD.
		run('checkout', '-q', '-b', 'feature');
		await fs.writeFile(join(dir, 'b.txt'), 'b\n');
		run('add', '.');
		run('commit', '-q', '-m', 'add b on feature');

		const result = await svc!.computeSessionFileDiffs(URI.file(dir), { sessionUri: 'copilot:/s', baseBranch: 'main' });
		assert.ok(result, 'expected diffs');
		// `b.txt` was committed on `feature` after branching from `main`, so
		// it must show up in the merge-base diff even though there are no
		// uncommitted changes in the working tree.
		const paths = result.map(d => (d.after?.uri ?? d.before?.uri));
		assert.ok(paths.some(p => p?.endsWith('b.txt')), `expected b.txt in diff; got ${paths.join(', ')}`);
	});

	(hasGit ? test : test.skip)('returns no diffs for a clean repo', async () => {
		const fs = await import('fs/promises');
		const { dir, run } = initRepo();
		await fs.writeFile(join(dir, 'a.txt'), 'a\n');
		run('add', '.');
		run('commit', '-q', '-m', 'init');

		const result = await svc!.computeSessionFileDiffs(URI.file(dir), { sessionUri: 'copilot:/s' });
		assert.deepStrictEqual(result, []);
	});

	(hasGit ? test : test.skip)('handles an empty repo (no HEAD) by treating files as added', async () => {
		const fs = await import('fs/promises');
		const { dir } = initRepo();
		await fs.writeFile(join(dir, 'first.txt'), 'hello\n');

		const result = await svc!.computeSessionFileDiffs(URI.file(dir), { sessionUri: 'copilot:/s' });
		assert.ok(result, 'expected diffs');
		assert.strictEqual(result.length, 1);
		assert.ok(result[0].after && !result[0].before, 'untracked file in empty repo should be an addition');
	});

	(hasGit ? test : test.skip)('showBlob retrieves committed content', async () => {
		const fs = await import('fs/promises');
		const { dir, run } = initRepo();
		await fs.writeFile(join(dir, 'a.txt'), 'original\n');
		run('add', '.');
		run('commit', '-q', '-m', 'init');
		const sha = cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
		await fs.writeFile(join(dir, 'a.txt'), 'changed\n');

		const blob = await svc!.showBlob(URI.file(dir), sha, 'a.txt');
		assert.ok(blob);
		assert.strictEqual(blob.toString(), 'original\n');
	});
});
