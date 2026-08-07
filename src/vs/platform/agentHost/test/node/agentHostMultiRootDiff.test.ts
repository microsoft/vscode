/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { isLinux } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { ISessionFileDiff } from '../../common/state/sessionState.js';
import { computeDiffsAcrossWorkingDirectories, MAX_MULTI_ROOT_DIFF_TARGETS, type IMultiRootDiffContext } from '../../node/agentHostMultiRootDiff.js';

/** Log service that records error/warn messages so tests can assert on them. */
class CapturingLogService extends NullLogService {
	readonly errors: string[] = [];
	readonly warnings: string[] = [];
	override error(message: string | Error): void { this.errors.push(String(message)); }
	override warn(message: string): void { this.warnings.push(message); }
}

/** Builds a minimal file diff keyed by the after-URI. */
function fileDiff(uri: string, added = 1, removed = 0): ISessionFileDiff {
	return { after: { uri, content: { uri: `content:${uri}` } }, diff: { added, removed } };
}

suite('computeDiffsAcrossWorkingDirectories', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = 'copilotcli:/session-1';

	test('dedups working directories that resolve to the same repository root', async () => {
		const repoRoot = URI.file('/repo');
		const gitCalls: string[] = [];
		const log = new CapturingLogService();
		const ctx: IMultiRootDiffContext = {
			session,
			logService: log,
			// Two folders in one repo → same root.
			getRepositoryRoot: async () => repoRoot,
			computeGitDiff: async root => { gitCalls.push(root.toString()); return [fileDiff('file:///repo/a.ts')]; },
			computeFallbackDiff: async () => [],
		};

		const result = await computeDiffsAcrossWorkingDirectories([URI.file('/repo/pkg/app'), URI.file('/repo/pkg/lib')], ctx);

		assert.deepStrictEqual({ gitCalls, files: result.map(r => r.after?.uri), warnings: log.warnings, errors: log.errors }, {
			gitCalls: [repoRoot.toString()], // diffed once
			files: ['file:///repo/a.ts'],
			warnings: [],
			errors: [],
		});
	});

	test('partitions git vs non-git folders; DB fallback only covers non-git roots', async () => {
		const gitRoot = URI.file('/git-repo');
		const nonGitDir = URI.file('/plain-folder');
		let fallbackRoots: readonly URI[] = [];
		const ctx: IMultiRootDiffContext = {
			session,
			logService: new CapturingLogService(),
			getRepositoryRoot: async dir => dir.path === gitRoot.path ? gitRoot : undefined,
			computeGitDiff: async () => [fileDiff('file:///git-repo/g.ts')],
			computeFallbackDiff: async roots => { fallbackRoots = roots; return [fileDiff('file:///plain-folder/p.txt')]; },
		};

		const result = await computeDiffsAcrossWorkingDirectories([gitRoot, nonGitDir], ctx);

		assert.deepStrictEqual({
			fallbackRoots: fallbackRoots.map(r => r.toString()),
			files: result.map(r => r.after?.uri).sort(),
		}, {
			fallbackRoots: [nonGitDir.toString()], // git repo NOT in fallback → no double count
			files: ['file:///git-repo/g.ts', 'file:///plain-folder/p.txt'],
		});
	});

	test('caps targets at the maximum and warns once', async () => {
		const gitCalls: string[] = [];
		const log = new CapturingLogService();
		const dirs = Array.from({ length: MAX_MULTI_ROOT_DIFF_TARGETS + 1 }, (_, i) => URI.file(`/repo-${i}`));
		const ctx: IMultiRootDiffContext = {
			session,
			logService: log,
			getRepositoryRoot: async dir => dir, // each dir is its own repo root
			computeGitDiff: async root => { gitCalls.push(root.toString()); return []; },
			computeFallbackDiff: async () => [],
		};

		await computeDiffsAcrossWorkingDirectories(dirs, ctx);

		assert.deepStrictEqual({ gitCallCount: gitCalls.length, warningCount: log.warnings.length }, {
			gitCallCount: MAX_MULTI_ROOT_DIFF_TARGETS, // one target skipped
			warningCount: 1,
		});
	});

	test('runs per-repo git diffs in parallel', async () => {
		const deferreds = [new DeferredPromise<readonly ISessionFileDiff[]>(), new DeferredPromise<readonly ISessionFileDiff[]>(), new DeferredPromise<readonly ISessionFileDiff[]>()];
		let entered = 0;
		const ctx: IMultiRootDiffContext = {
			session,
			logService: new CapturingLogService(),
			getRepositoryRoot: async dir => dir,
			computeGitDiff: async root => {
				const idx = Number(root.path.split('-')[1]);
				entered++;
				return deferreds[idx].p;
			},
			computeFallbackDiff: async () => [],
		};

		const resultPromise = computeDiffsAcrossWorkingDirectories([URI.file('/r-0'), URI.file('/r-1'), URI.file('/r-2')], ctx);
		// Flush the repo-root resolution phase and the git-diff dispatch (a macrotask
		// drains all pending microtasks). All three git computations should then be
		// in flight before any of them resolves.
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.strictEqual(entered, 3);
		deferreds.forEach((d, i) => d.complete([fileDiff(`file:///r-${i}/x.ts`)]));
		const result = await resultPromise;
		assert.strictEqual(result.length, 3);
	});

	test('falls back per-folder and logs an error when a git diff fails or is unavailable', async () => {
		const okRoot = URI.file('/ok');
		const failRoot = URI.file('/fail-undefined');
		const throwRoot = URI.file('/fail-throw');
		let fallbackRoots: readonly URI[] = [];
		const log = new CapturingLogService();
		const ctx: IMultiRootDiffContext = {
			session,
			logService: log,
			getRepositoryRoot: async dir => dir,
			computeGitDiff: async root => {
				if (root.path === okRoot.path) { return [fileDiff('file:///ok/o.ts')]; }
				if (root.path === throwRoot.path) { throw new Error('git exploded'); }
				return undefined; // failRoot: git unavailable
			},
			computeFallbackDiff: async roots => { fallbackRoots = roots; return [fileDiff('file:///fallback/f.ts')]; },
		};

		const result = await computeDiffsAcrossWorkingDirectories([okRoot, failRoot, throwRoot], ctx);

		assert.deepStrictEqual({
			fallbackRoots: fallbackRoots.map(r => r.toString()).sort(),
			files: result.map(r => r.after?.uri).sort(),
			errorCount: log.errors.length, // one per failed repo
		}, {
			fallbackRoots: [failRoot.toString(), throwRoot.toString()].sort(),
			files: ['file:///fallback/f.ts', 'file:///ok/o.ts'],
			errorCount: 2,
		});
	});

	test('dedups the final union by file id, keeping the last occurrence', async () => {
		const ctx: IMultiRootDiffContext = {
			session,
			logService: new CapturingLogService(),
			getRepositoryRoot: async dir => dir,
			computeGitDiff: async () => [fileDiff('file:///dup.ts', 1, 0), fileDiff('file:///dup.ts', 9, 9)],
			computeFallbackDiff: async () => [],
		};

		const result = await computeDiffsAcrossWorkingDirectories([URI.file('/r')], ctx);

		assert.deepStrictEqual(result.map(r => ({ uri: r.after?.uri, added: r.diff?.added })), [
			{ uri: 'file:///dup.ts', added: 9 }, // last wins, single entry
		]);
	});

	test('dedups file resources according to platform path casing', async () => {
		const ctx: IMultiRootDiffContext = {
			session,
			logService: new CapturingLogService(),
			getRepositoryRoot: async dir => dir,
			computeGitDiff: async () => [
				fileDiff(URI.file('/repo/File.ts').toString(), 1),
				fileDiff(URI.file('/repo/file.ts').toString(), 2),
			],
			computeFallbackDiff: async () => [],
		};

		const result = await computeDiffsAcrossWorkingDirectories([URI.file('/repo')], ctx);

		assert.deepStrictEqual(result.map(diff => diff.diff?.added), isLinux ? [1, 2] : [2]);
	});

	test('does not case-fold non-file resource identities', async () => {
		const ctx: IMultiRootDiffContext = {
			session,
			logService: new CapturingLogService(),
			getRepositoryRoot: async dir => dir,
			computeGitDiff: async () => [
				fileDiff('custom:/Repo/File.ts', 1),
				fileDiff('custom:/repo/file.ts', 2),
			],
			computeFallbackDiff: async () => [],
		};

		const result = await computeDiffsAcrossWorkingDirectories([URI.file('/repo')], ctx);

		assert.deepStrictEqual(result.map(diff => diff.diff?.added), [1, 2]);
	});

	test('never rejects when the fallback fails — returns git results and logs an error', async () => {
		const log = new CapturingLogService();
		const ctx: IMultiRootDiffContext = {
			session,
			logService: log,
			getRepositoryRoot: async () => undefined, // all non-git → fallback path
			computeGitDiff: async () => [],
			computeFallbackDiff: async () => { throw new Error('db exploded'); },
		};

		const result = await computeDiffsAcrossWorkingDirectories([URI.file('/a'), URI.file('/b')], ctx);

		assert.deepStrictEqual({ files: result, errorCount: log.errors.length }, { files: [], errorCount: 1 });
	});
});
