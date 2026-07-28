/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildGitBlobUri, parseGitBlobUri } from '../../node/gitDiffContent.js';

suite('gitDiffContent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips simple inputs', () => {
		const sessionUri = 'copilot:/abc-123';
		const sha = 'deadbeef0123456789abcdef0123456789abcdef';
		const repoRelativePath = 'src/foo/bar.ts';
		const absolutePath = '/Users/me/repo/src/foo/bar.ts';
		const built = buildGitBlobUri(sessionUri, sha, repoRelativePath, absolutePath);
		const parsed = parseGitBlobUri(built);
		assert.deepStrictEqual(parsed, { sessionUri, sha, repoRelativePath });
		assert.strictEqual(URI.parse(built).path, absolutePath);
	});

	test('round-trips paths with spaces, unicode and slashes', () => {
		const sessionUri = 'copilot:/sess/with space?q=1';
		const sha = '1234567890abcdef1234567890abcdef12345678';
		const repoRelativePath = 'a folder/файл.txt';
		const absolutePath = '/Users/me/a repo/a folder/файл.txt';
		const built = buildGitBlobUri(sessionUri, sha, repoRelativePath, absolutePath);
		const parsed = parseGitBlobUri(built);
		assert.deepStrictEqual(parsed, { sessionUri, sha, repoRelativePath });
		assert.strictEqual(URI.parse(built).path, absolutePath);
	});

	test('uses the absolute path for display and the query for repo path', () => {
		const built = buildGitBlobUri('copilot:/abc', 'cafe1234', 'src/app.ts', '/work/repo/src/app.ts');
		const parsed = URI.parse(built);
		assert.deepStrictEqual({
			path: parsed.path,
			parsed: parseGitBlobUri(built),
		}, {
			path: '/work/repo/src/app.ts',
			parsed: { sessionUri: 'copilot:/abc', sha: 'cafe1234', repoRelativePath: 'src/app.ts' },
		});
	});

	test('returns undefined when the query is missing or incomplete', () => {
		const noQuery = URI.from({ scheme: 'git-blob', path: '/src/app.ts' }).toString();
		const partialQuery = URI.from({
			scheme: 'git-blob',
			path: '/src/app.ts',
			query: JSON.stringify({ sessionUri: 'copilot:/abc', sha: 'cafe1234' }),
		}).toString();
		assert.strictEqual(parseGitBlobUri(noQuery), undefined);
		assert.strictEqual(parseGitBlobUri(partialQuery), undefined);
	});

	test('returns undefined for non git-blob URIs', () => {
		assert.strictEqual(parseGitBlobUri('file:///foo/bar.ts'), undefined);
		assert.strictEqual(parseGitBlobUri('session-db://abc/def/before/x'), undefined);
		assert.strictEqual(parseGitBlobUri('not a uri at all'), undefined);
	});
});
