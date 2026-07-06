/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Integration tests for {@link AgentHostReviewService} that spawn real `git`
 * against temporary on-disk repositories, exercising the reviewed-ref based
 * review model end to end. Run via `scripts/test-integration.sh`.
 */

import assert from 'assert';
import * as cp from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { Schemas } from '../../../../base/common/network.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileService } from '../../../files/common/fileService.js';
import { DiskFileSystemProvider } from '../../../files/node/diskFileSystemProvider.js';
import { AgentHostGitService } from '../../node/agentHostGitService.js';
import { AgentHostReviewService } from '../../node/agentHostReviewService.js';
import { buildReviewedRefName } from '../../common/agentHostReviewService.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';

function rmDirWithRetry(path: string | undefined): void {
	if (!path) {
		return;
	}
	try { rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* best-effort */ }
}

suite.skip('AgentHostReviewService (real git)', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const hasGit = (() => {
		try { cp.execFileSync('git', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
	})();

	const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
	const sessionUri = URI.parse('copilot:/review-test-session');

	let tmpRoot: string | undefined;
	let svc: AgentHostReviewService | undefined;
	let db: TestSessionDatabase | undefined;

	function createService(store: Pick<DisposableStore, 'add'>): AgentHostReviewService {
		const logService = new NullLogService();
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.file, store.add(new DiskFileSystemProvider(logService))));
		const env: Partial<INativeEnvironmentService> = { tmpDir: URI.file(tmpdir()) };
		const gitService = new AgentHostGitService(fileService, env as INativeEnvironmentService, logService);
		db = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(db);
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		return store.add(new AgentHostReviewService(stateManager, gitService, sessionDataService, logService,));
	}

	setup(() => {
		tmpRoot = undefined;
		svc = createService(disposables);
	});

	teardown(() => {
		rmDirWithRetry(tmpRoot);
	});

	async function initRepo(files: Record<string, string>): Promise<string> {
		const fs = await import('fs/promises');
		// Canonicalize the temp root so it matches the path `git rev-parse
		// --show-toplevel` reports (macOS symlinks /var -> /private/var); the
		// review service computes repo-relative paths against that root.
		tmpRoot = await fs.realpath(mkdtempSync(join(tmpdir(), 'agent-host-review-')));
		const run = (...args: string[]) => cp.execFileSync('git', args, { cwd: tmpRoot!, env, stdio: 'pipe' });
		run('init', '-q', '-b', 'main');
		for (const [name, content] of Object.entries(files)) {
			await fs.writeFile(join(tmpRoot!, name), content);
		}
		run('add', '.');
		run('commit', '-q', '-m', 'init');
		return tmpRoot!;
	}

	const wd = () => URI.file(tmpRoot!);
	const reviewedPaths = async () => [...await svc!.getReviewedPaths(sessionUri.toString(), wd(), undefined)].sort();
	const chainLength = () => {
		const ref = buildReviewedRefName('review-test-session');
		// Count only the review commits layered on top of the baseline (HEAD),
		// excluding the baseline's own history.
		try { return Number(cp.execFileSync('git', ['rev-list', '--count', `HEAD..${ref}`], { cwd: tmpRoot!, env, encoding: 'utf8' }).trim()); } catch { return 0; }
	};

	(hasGit ? test : test.skip)('marks and unmarks a modified file (against HEAD baseline)', async () => {
		const fs = await import('fs/promises');
		await initRepo({ 'a.txt': 'a-v1\n', 'b.txt': 'b-v1\n' });
		await fs.writeFile(join(tmpRoot!, 'a.txt'), 'a-v2\n');

		const beforeMark = await reviewedPaths();
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const afterMark = await reviewedPaths();
		await svc!.markFileUnreviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const afterUnmark = await reviewedPaths();

		assert.deepStrictEqual(
			{ beforeMark, afterMark, afterUnmark },
			{ beforeMark: [], afterMark: ['a.txt'], afterUnmark: [] });
	});

	(hasGit ? test : test.skip)('auto-unreviews a file that is edited again after being reviewed', async () => {
		const fs = await import('fs/promises');
		await initRepo({ 'a.txt': 'a-v1\n' });
		await fs.writeFile(join(tmpRoot!, 'a.txt'), 'a-v2\n');
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const reviewed = await reviewedPaths();

		// Agent edits the file again -> its working content no longer matches
		// the reviewed tree, so it flips back to unreviewed.
		await fs.writeFile(join(tmpRoot!, 'a.txt'), 'a-v3\n');
		const afterReedit = await reviewedPaths();

		assert.deepStrictEqual({ reviewed, afterReedit }, { reviewed: ['a.txt'], afterReedit: [] });
	});

	(hasGit ? test : test.skip)('reviews an added (untracked) file and a deleted file', async () => {
		const fs = await import('fs/promises');
		await initRepo({ 'a.txt': 'a-v1\n', 'gone.txt': 'bye\n' });
		await fs.writeFile(join(tmpRoot!, 'fresh.txt'), 'fresh\n');
		await fs.unlink(join(tmpRoot!, 'gone.txt'));

		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'fresh.txt')));
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'gone.txt')));

		assert.deepStrictEqual(await reviewedPaths(), ['fresh.txt', 'gone.txt']);
	});

	(hasGit ? test : test.skip)('advances the ref chain once per action and skips no-op marks', async () => {
		const fs = await import('fs/promises');
		await initRepo({ 'a.txt': 'a-v1\n' });
		await fs.writeFile(join(tmpRoot!, 'a.txt'), 'a-v2\n');

		const initial = chainLength();
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const afterMark = chainLength();
		// Marking the same content again is a no-op and must not grow the chain.
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const afterDup = chainLength();
		await svc!.markFileUnreviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const afterUnmark = chainLength();

		assert.deepStrictEqual(
			{ initial, afterMark, afterDup, afterUnmark },
			{ initial: 0, afterMark: 1, afterDup: 1, afterUnmark: 2 });
	});

	(hasGit ? test : test.skip)('deletes the reviewed ref on session data disposal', async () => {
		const fs = await import('fs/promises');
		await initRepo({ 'a.txt': 'a-v1\n' });
		await fs.writeFile(join(tmpRoot!, 'a.txt'), 'a-v2\n');
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));
		const beforeDispose = chainLength();

		await svc!.disposeSessionData(sessionUri.toString());
		const afterDispose = chainLength();

		assert.deepStrictEqual({ beforeDispose, afterDispose }, { beforeDispose: 1, afterDispose: 0 });
	});

	(hasGit ? test : test.skip)('copies the reviewed ref to a forked session', async () => {
		const fs = await import('fs/promises');
		await initRepo({ 'a.txt': 'a-v1\n' });
		await fs.writeFile(join(tmpRoot!, 'a.txt'), 'a-v2\n');
		await svc!.markFileReviewed(sessionUri.toString(), wd(), undefined, URI.file(join(tmpRoot!, 'a.txt')));

		const forkUri = URI.parse('copilot:/forked-session');
		await svc!.copyReviewedRef(sessionUri.toString(), forkUri.toString(), wd());

		const forkReviewed = [...await svc!.getReviewedPaths(forkUri.toString(), wd(), undefined)].sort();
		const sourceReviewed = await reviewedPaths();
		assert.deepStrictEqual({ forkReviewed, sourceReviewed }, { forkReviewed: ['a.txt'], sourceReviewed: ['a.txt'] });
	});

	(hasGit ? test : test.skip)('is a no-op when the working directory is not a git repository', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-host-review-nongit-'));
		tmpRoot = dir;
		await svc!.markFileReviewed(sessionUri.toString(), URI.file(dir), undefined, URI.file(join(dir, 'a.txt')));
		assert.deepStrictEqual([...await svc!.getReviewedPaths(sessionUri.toString(), URI.file(dir), undefined)], []);
	});
});
