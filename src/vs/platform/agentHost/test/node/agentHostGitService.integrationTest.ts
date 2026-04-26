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
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';

suite('AgentHostGitService - getSessionGitState (real git)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// Skip the on-disk git tests when `git` is not on PATH (e.g. minimal CI).
	const hasGit = (() => {
		try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
	})();

	let tmpRoot: string | undefined;
	let svc: AgentHostGitService | undefined;

	setup(() => {
		tmpRoot = undefined;
		svc = new AgentHostGitService();
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
