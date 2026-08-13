/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseGitHubPullRequestReferences } from '../../common/githubPullRequestReferences.js';

suite('GitHub pull request references', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts URLs and repository-scoped shorthand without duplicates', () => {
		assert.deepStrictEqual(parseGitHubPullRequestReferences(
			'Compare pull request #43 with https://github.com/microsoft/vscode/pull/42, then check PR #42.',
			{ owner: 'microsoft', repo: 'vscode' }
		), [
			{ owner: 'microsoft', repo: 'vscode', number: 43 },
			{ owner: 'microsoft', repo: 'vscode', number: 42 },
		]);
	});

	test('ignores shorthand without repository context', () => {
		assert.deepStrictEqual(parseGitHubPullRequestReferences('Check PR #42, issue #7, and #9.'), []);
	});

	test('uses the configured GitHub Enterprise host', () => {
		assert.deepStrictEqual(parseGitHubPullRequestReferences(
			'Compare https://github.com/o/r/pull/1 with https://ghe.example.com/o/r/pull/2 and PR #3.',
			{ owner: 'o', repo: 'r' },
			'ghe.example.com'
		), [
			{ owner: 'o', repo: 'r', number: 2 },
			{ owner: 'o', repo: 'r', number: 3 },
		]);
	});
});
