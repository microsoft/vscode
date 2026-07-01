/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { formatGitError, parseChangedPaths, parseDefaultBranchRef, parseGitDiffRawNumstat, parseGitHubRepoFromRemote, parseGitStatusV2, parseHasGitHubRemote, parseUntrackedPaths, summarizeStderrForError } from '../../node/agentHostGitService.js';
import { buildGitBlobUri } from '../../node/gitDiffContent.js';
import { URI } from '../../../../base/common/uri.js';
import { EMPTY_TREE_OBJECT, getBranchCompletions } from '../../common/agentHostGitService.js';

suite('AgentHostGitService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('sorts common branch names to the top before applying limit', () => {
		assert.deepStrictEqual(
			getBranchCompletions(['feature/recent', 'release', 'master', 'main', 'feature/older'], { limit: 3 }),
			['main', 'master', 'feature/recent'],
		);
	});

	test('preserves git order for non-common branches', () => {
		assert.deepStrictEqual(
			getBranchCompletions(['feature/recent', 'release', 'feature/older']),
			['feature/recent', 'release', 'feature/older'],
		);
	});

	test('filters before sorting common branch names', () => {
		assert.deepStrictEqual(
			getBranchCompletions(['feature/recent', 'master', 'main', 'maintenance'], { query: 'ma' }),
			['main', 'master', 'maintenance'],
		);
	});

	suite('parseGitStatusV2', () => {
		test('parses a clean checkout with upstream', () => {
			const out = [
				'# branch.oid 0123456789abcdef0123456789abcdef01234567',
				'# branch.head main',
				'# branch.upstream origin/main',
				'# branch.ab +0 -0',
			].join('\n');
			assert.deepStrictEqual(parseGitStatusV2(out), {
				branchName: 'main',
				upstreamBranchName: 'origin/main',
				outgoingChanges: 0,
				incomingChanges: 0,
				uncommittedChanges: 0,
			});
		});

		test('parses a dirty branch ahead and behind upstream', () => {
			const out = [
				'# branch.oid 0123456789abcdef0123456789abcdef01234567',
				'# branch.head feature',
				'# branch.upstream origin/feature',
				'# branch.ab +3 -2',
				'1 .M N... 100644 100644 100644 abc abc src/a.ts',
				'2 R. N... 100644 100644 100644 abc abc R100 src/b.ts\tsrc/old-b.ts',
				'? src/untracked.ts',
			].join('\n');
			assert.deepStrictEqual(parseGitStatusV2(out), {
				branchName: 'feature',
				upstreamBranchName: 'origin/feature',
				outgoingChanges: 3,
				incomingChanges: 2,
				uncommittedChanges: 3,
			});
		});

		test('treats (detached) HEAD as no branch and omits upstream/ab when absent', () => {
			const out = [
				'# branch.oid 0123456789abcdef0123456789abcdef01234567',
				'# branch.head (detached)',
			].join('\n');
			assert.deepStrictEqual(parseGitStatusV2(out), {
				branchName: undefined,
				upstreamBranchName: undefined,
				outgoingChanges: undefined,
				incomingChanges: undefined,
				uncommittedChanges: 0,
			});
		});

		test('returns empty object for undefined input', () => {
			assert.deepStrictEqual(parseGitStatusV2(undefined), {});
		});
	});

	suite('parseHasGitHubRemote', () => {
		test('detects ssh github remote', () => {
			assert.strictEqual(parseHasGitHubRemote('origin\tgit@github.com:owner/repo.git (fetch)\n'), true);
		});
		test('detects https github remote', () => {
			assert.strictEqual(parseHasGitHubRemote('origin\thttps://github.com/owner/repo.git (fetch)\n'), true);
		});
		test('returns false for non-github remotes', () => {
			assert.strictEqual(parseHasGitHubRemote('origin\thttps://gitlab.com/owner/repo.git (fetch)\n'), false);
		});
		test('returns false when there are no remotes', () => {
			assert.strictEqual(parseHasGitHubRemote(''), false);
		});
		test('returns undefined when probe failed (output absent)', () => {
			assert.strictEqual(parseHasGitHubRemote(undefined), undefined);
		});
	});

	suite('parseDefaultBranchRef', () => {
		test('strips refs/remotes/origin/ prefix', () => {
			assert.strictEqual(parseDefaultBranchRef('refs/remotes/origin/main\n'), 'main');
		});
		test('returns the ref as-is when prefix is not present', () => {
			assert.strictEqual(parseDefaultBranchRef('main'), 'main');
		});
		test('returns undefined for empty/missing output', () => {
			assert.strictEqual(parseDefaultBranchRef(undefined), undefined);
			assert.strictEqual(parseDefaultBranchRef('   '), undefined);
		});
	});

	suite('parseGitHubRepoFromRemote', () => {
		test('parses ssh (scp-like) origin remote', () => {
			const out = 'origin\tgit@github.com:microsoft/vscode.git (fetch)\norigin\tgit@github.com:microsoft/vscode.git (push)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('parses https origin remote without .git suffix', () => {
			const out = 'origin\thttps://github.com/microsoft/vscode (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('parses ssh:// scheme remote', () => {
			const out = 'origin\tssh://git@github.com/microsoft/vscode.git (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('prefers origin over other remotes', () => {
			const out =
				'fork\tgit@github.com:me/vscode.git (fetch)\n' +
				'origin\tgit@github.com:microsoft/vscode.git (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('falls back to first github remote when origin is not github', () => {
			const out =
				'origin\tgit@gitlab.com:foo/bar.git (fetch)\n' +
				'upstream\thttps://github.com/microsoft/vscode.git (fetch)\n';
			assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: 'microsoft', repo: 'vscode' });
		});
		test('returns undefined when no remotes are present', () => {
			assert.strictEqual(parseGitHubRepoFromRemote(''), undefined);
			assert.strictEqual(parseGitHubRepoFromRemote(undefined), undefined);
		});
		test('returns undefined when no GitHub remote is present', () => {
			const out = 'origin\thttps://gitlab.com/foo/bar.git (fetch)\n';
			assert.strictEqual(parseGitHubRepoFromRemote(out), undefined);
		});
	});

	suite('parseUntrackedPaths', () => {
		test('returns empty for empty/undefined output', () => {
			assert.deepStrictEqual(parseUntrackedPaths(undefined), []);
			assert.deepStrictEqual(parseUntrackedPaths(''), []);
		});

		test('extracts untracked entries and skips others', () => {
			// `git status --porcelain=v1 -z` emits NUL-separated entries; the
			// rename entry includes a second NUL-separated "from" path that
			// must be skipped.
			const out = '?? new.txt\x00 M edited.txt\x00R  to.txt\x00from.txt\x00?? other.txt\x00';
			assert.deepStrictEqual(parseUntrackedPaths(out), ['new.txt', 'other.txt']);
		});
	});

	suite('parseChangedPaths', () => {
		test('returns every changed path including delete and index rename/copy sources', () => {
			const out = [
				' M modified.txt',
				'A  added.txt',
				' D deleted.txt',
				'?? untracked.txt',
				'R  renamed-new.txt',
				'renamed-old.txt',
				' C copied-new.txt',
				'copied-old.txt',
				' M modified.txt',
				'',
			].join('\x00');

			assert.deepStrictEqual(parseChangedPaths(out), [
				'modified.txt',
				'added.txt',
				'deleted.txt',
				'untracked.txt',
				'renamed-new.txt',
				'renamed-old.txt',
				'copied-new.txt',
				'copied-old.txt',
			]);
		});

		test('returns worktree rename/copy source paths too', () => {
			const out = [
				' R worktree-renamed-new.txt',
				'worktree-renamed-old.txt',
				' C worktree-copied-new.txt',
				'worktree-copied-old.txt',
				'',
			].join('\x00');

			assert.deepStrictEqual(parseChangedPaths(out), [
				'worktree-renamed-new.txt',
				'worktree-renamed-old.txt',
				'worktree-copied-new.txt',
				'worktree-copied-old.txt',
			]);
		});
	});

	suite('parseGitDiffRawNumstat', () => {
		const root = URI.file('/repo');
		const sessionUri = 'copilot:/abc';
		const sha = 'cafe1234cafe1234cafe1234cafe1234cafe1234';

		test('parses an add, modify, delete and rename in a single stream', () => {
			// Format: alternating `--raw` and `--numstat` segments separated by
			// NUL bytes. Renames have an extra path segment in both halves.
			const segments: string[] = [
				':100644 100644 0000000 1111111 M', 'modified.ts',
				':000000 100644 0000000 2222222 A', 'added.ts',
				':100644 000000 3333333 0000000 D', 'deleted.ts',
				':100644 100644 4444444 5555555 R100', 'old/path.ts', 'new/path.ts',
				'5\t2\tmodified.ts',
				'10\t0\tadded.ts',
				'0\t7\tdeleted.ts',
				'3\t3\t', 'old/path.ts', 'new/path.ts',
				'',
			];
			const out = segments.join('\x00');
			const diffs = parseGitDiffRawNumstat(out, root, sessionUri, sha);
			assert.deepStrictEqual(diffs, [
				{
					before: { uri: 'file:///repo/modified.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'modified.ts', '/repo/modified.ts') } },
					after: { uri: 'file:///repo/modified.ts', content: { uri: 'file:///repo/modified.ts' } },
					diff: { added: 5, removed: 2 },
				},
				{
					after: { uri: 'file:///repo/added.ts', content: { uri: 'file:///repo/added.ts' } },
					diff: { added: 10, removed: 0 },
				},
				{
					before: { uri: 'file:///repo/deleted.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'deleted.ts', '/repo/deleted.ts') } },
					diff: { added: 0, removed: 7 },
				},
				{
					before: { uri: 'file:///repo/old/path.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'old/path.ts', '/repo/old/path.ts') } },
					after: { uri: 'file:///repo/new/path.ts', content: { uri: 'file:///repo/new/path.ts' } },
					diff: { added: 3, removed: 3 },
				},
			]);
		});

		test('treats `-` numstat values (binary) as zero', () => {
			const out = [':100644 100644 0 0 M', 'image.png', '-\t-\timage.png', ''].join('\x00');
			const diffs = parseGitDiffRawNumstat(out, root, sessionUri, sha);
			assert.strictEqual(diffs.length, 1);
			assert.deepStrictEqual(diffs[0].diff, { added: 0, removed: 0 });
		});

		test('returns empty for empty input', () => {
			assert.deepStrictEqual(parseGitDiffRawNumstat('', root, sessionUri, sha), []);
		});

		test('anchors after side to afterRef when provided (ref->ref diffs)', () => {
			// In a checkpoint / ref->ref diff, both the before and the after
			// content must be anchored to commits — never to the working
			// tree. With `afterRef` set, both `after.uri` and
			// `after.content.uri` are `git-blob:` URIs so the diff reflects
			// the state at that commit even if the working tree diverges
			// (e.g. file renamed, deleted, or modified on disk since).
			const toSha = 'beef5678beef5678beef5678beef5678beef5678';
			const segments: string[] = [
				':100644 100644 0000000 1111111 M', 'modified.ts',
				':000000 100644 0000000 2222222 A', 'added.ts',
				':100644 000000 3333333 0000000 D', 'deleted.ts',
				':100644 100644 4444444 5555555 R100', 'old/path.ts', 'new/path.ts',
				'5\t2\tmodified.ts',
				'10\t0\tadded.ts',
				'0\t7\tdeleted.ts',
				'3\t3\t', 'old/path.ts', 'new/path.ts',
				'',
			];
			const diffs = parseGitDiffRawNumstat(segments.join('\x00'), root, sessionUri, sha, toSha);
			assert.deepStrictEqual(diffs, [
				{
					before: { uri: 'file:///repo/modified.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'modified.ts', '/repo/modified.ts') } },
					after: { uri: 'file:///repo/modified.ts', content: { uri: buildGitBlobUri(sessionUri, toSha, 'modified.ts', '/repo/modified.ts') } },
					diff: { added: 5, removed: 2 },
				},
				{
					after: { uri: 'file:///repo/added.ts', content: { uri: buildGitBlobUri(sessionUri, toSha, 'added.ts', '/repo/added.ts') } },
					diff: { added: 10, removed: 0 },
				},
				{
					before: { uri: 'file:///repo/deleted.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'deleted.ts', '/repo/deleted.ts') } },
					diff: { added: 0, removed: 7 },
				},
				{
					before: { uri: 'file:///repo/old/path.ts', content: { uri: buildGitBlobUri(sessionUri, sha, 'old/path.ts', '/repo/old/path.ts') } },
					after: { uri: 'file:///repo/new/path.ts', content: { uri: buildGitBlobUri(sessionUri, toSha, 'new/path.ts', '/repo/new/path.ts') } },
					diff: { added: 3, removed: 3 },
				},
			]);
		});
	});

	test('exports the well-known empty-tree object SHA', () => {
		assert.strictEqual(EMPTY_TREE_OBJECT, '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
	});

	suite('formatGitError', () => {
		test('reports timeout when our timer fired and summarises progress-meter stderr', () => {
			const err = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' as const });
			const progress = 'Updating files:   0% (7/14834)\rUpdating files:   0% (149/14834)\r';
			assert.strictEqual(
				formatGitError(['worktree', 'add', '-b', 'x', '/tmp/y', 'origin/main'], 30_000, true, err, progress),
				'git worktree timed out after 30000ms: Updating files:   0% (149/14834)',
			);
		});

		test('reports kill signal when killed but not by our timer', () => {
			const err = Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' as const });
			assert.strictEqual(
				formatGitError(['worktree', 'add'], 30_000, false, err, ''),
				'git worktree killed by SIGTERM',
			);
		});

		test('reports numeric exit code when git failed normally', () => {
			const err = Object.assign(new Error('Command failed'), { code: 128 });
			assert.strictEqual(
				formatGitError(['worktree', 'add', '/tmp/y', 'missing-branch'], 30_000, false, err, 'fatal: invalid reference: missing-branch\n'),
				'git worktree exited with code 128: fatal: invalid reference: missing-branch',
			);
		});

		test('keeps missing git-lfs error over the later generic fatal line', () => {
			const err = Object.assign(new Error('Command failed'), { code: 128 });
			const stderr = [
				'Preparing worktree (new branch \'agents/example\')',
				'git-lfs filter-process: git-lfs: command not found',
				'fatal: the remote end hung up unexpectedly',
			].join('\n');
			assert.strictEqual(
				formatGitError(['worktree', 'add', '--no-track', '-b', 'agents/example', '/tmp/worktree', 'origin/main'], 60_000, false, err, stderr),
				'git worktree exited with code 128: git-lfs filter-process: git-lfs: command not found',
			);
		});

		test('falls back to error message when there is no signal or exit code', () => {
			const err = new Error('spawn git ENOENT');
			assert.strictEqual(
				formatGitError(['status'], 5_000, false, err, ''),
				'spawn git ENOENT',
			);
		});
	});

	suite('summarizeStderrForError', () => {
		test('returns empty string for empty input', () => {
			assert.strictEqual(summarizeStderrForError(''), '');
		});

		test('returns empty string for whitespace-only input', () => {
			assert.strictEqual(summarizeStderrForError('  \r\n\r\n  '), '');
		});

		test('keeps the last non-empty line of a multi-line progress meter', () => {
			const progress = 'Updating files:   0% (7/14834)\rUpdating files:   0% (149/14834)\r';
			assert.strictEqual(summarizeStderrForError(progress), 'Updating files:   0% (149/14834)');
		});

		test('passes through a normal single-line message', () => {
			assert.strictEqual(summarizeStderrForError('fatal: invalid reference: x\n'), 'fatal: invalid reference: x');
		});

		test('truncates very long lines with an ellipsis', () => {
			const long = `fatal: ${'a'.repeat(500)}`;
			const result = summarizeStderrForError(long);
			assert.strictEqual(result.length, 200);
			assert.ok(result.endsWith('…'), 'expected trailing ellipsis');
		});
	});
});
