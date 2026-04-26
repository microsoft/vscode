/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getBranchCompletions, parseDefaultBranchRef, parseGitStatusV2, parseHasGitHubRemote } from '../../node/agentHostGitService.js';

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
});

