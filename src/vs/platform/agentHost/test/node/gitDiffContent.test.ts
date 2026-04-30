/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
	});

	test('round-trips paths with spaces, unicode and slashes', () => {
		const sessionUri = 'copilot:/sess/with space?q=1';
		const sha = '1234567890abcdef1234567890abcdef12345678';
		const path = 'a folder/файл.txt';
		const parsed = parseGitBlobUri(buildGitBlobUri(sessionUri, sha, path));
		assert.deepStrictEqual(parsed, { sessionUri, sha, repoRelativePath: path });
	});

	test('returns undefined for non git-blob URIs', () => {
		assert.strictEqual(parseGitBlobUri('file:///foo/bar.ts'), undefined);
		assert.strictEqual(parseGitBlobUri('session-db://abc/def/before/x'), undefined);
		assert.strictEqual(parseGitBlobUri('not a uri at all'), undefined);
	});
});
