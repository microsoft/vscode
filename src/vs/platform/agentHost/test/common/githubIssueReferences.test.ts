/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parseGitHubIssueReferences } from '../../common/githubIssueReferences.js';

suite('parseGitHubIssueReferences', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('detects issue URLs and owner/repo shorthand, ignores everything else', () => {
		const text = [
			'Fix https://github.com/microsoft/vscode/issues/123 first.',
			'Related: microsoft/vscode#456 and octo-org/my.repo#7.',
			'Also see https://www.github.com/microsoft/vscode/issues/123#issuecomment-99 (dupe).',
			'Not an issue: #789, https://github.com/microsoft/vscode/pull/321, https://gitlab.com/o/r/issues/5.',
		].join('\n');

		assert.deepStrictEqual(parseGitHubIssueReferences(text), [
			{ owner: 'microsoft', repo: 'vscode', number: 123 },
			{ owner: 'microsoft', repo: 'vscode', number: 456 },
			{ owner: 'octo-org', repo: 'my.repo', number: 7 },
		]);
	});

	test('returns nothing for text without references', () => {
		assert.deepStrictEqual(parseGitHubIssueReferences('Please refactor the parser and add tests.'), []);
	});
});
