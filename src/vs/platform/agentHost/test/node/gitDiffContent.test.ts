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
		const path = 'src/foo/bar.ts';
		const built = buildGitBlobUri(sessionUri, sha, path);
		const parsed = parseGitBlobUri(built);
		assert.deepStrictEqual(parsed, { sessionUri, sha, repoRelativePath: path });
		assert.strictEqual(URI.parse(built).path, '/src/foo/bar.ts');
	});

	test('round-trips paths with spaces, unicode and slashes', () => {
		const sessionUri = 'copilot:/sess/with space?q=1';
		const sha = '1234567890abcdef1234567890abcdef12345678';
		const path = 'a folder/файл.txt';
		const built = buildGitBlobUri(sessionUri, sha, path);
		const parsed = parseGitBlobUri(built);
		assert.deepStrictEqual(parsed, { sessionUri, sha, repoRelativePath: path });
		assert.strictEqual(URI.parse(built).path, '/a folder/файл.txt');
	});

	test('parses legacy authority and path encoded URIs', () => {
		const sessionUri = 'copilot:/abc';
		const sha = 'cafe1234cafe1234cafe1234cafe1234cafe1234';
		const path = 'src/foo.ts';
		const legacy = 'git-blob://636f70696c6f743a2f616263/cafe1234cafe1234cafe1234cafe1234cafe1234/7372632f666f6f2e7473/foo.ts';
		assert.deepStrictEqual(parseGitBlobUri(legacy), { sessionUri, sha, repoRelativePath: path });
	});

	test('uses the URI path as the query-form repo path', () => {
		const uri = URI.from({
			scheme: 'git-blob',
			path: '/src/app.ts',
			query: JSON.stringify({ sessionUri: 'copilot:/abc', sha: 'cafe1234' }),
		});
		assert.deepStrictEqual(parseGitBlobUri(uri.toString()), { sessionUri: 'copilot:/abc', sha: 'cafe1234', repoRelativePath: 'src/app.ts' });
	});

	test('returns undefined for non git-blob URIs', () => {
		assert.strictEqual(parseGitBlobUri('file:///foo/bar.ts'), undefined);
		assert.strictEqual(parseGitBlobUri('session-db://abc/def/before/x'), undefined);
		assert.strictEqual(parseGitBlobUri('not a uri at all'), undefined);
	});
});
