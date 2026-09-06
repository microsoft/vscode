/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { GitHubPullRequestTitleAndDescriptionGenerator } from '../../../prompt/node/githubPullRequestTitleAndDescriptionGenerator';

suite('GitHub Pull Request title and description test suite', function () {
	test('Test parse assistant output, trailing after last +++', function () {
		const assistantOutput = `+++Title: Improve inline chat functionality
Description: This pull request improves the inline chat functionality by not expanding the wholeRange to the function if the current line is empty or whitespace only. This prevents unnecessary code suggestions and improves the user experience. No files or commits are listed in the description. This change addresses issue #123.+++.`;

		const parsed = GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(assistantOutput);
		assert.strictEqual(parsed?.title, 'Improve inline chat functionality');
		assert.strictEqual(parsed?.description, `This pull request improves the inline chat functionality by not expanding the wholeRange to the function if the current line is empty or whitespace only. This prevents unnecessary code suggestions and improves the user experience. No files or commits are listed in the description. This change addresses issue #123.`);
	});

	test('Test parse assistant output, ideal', function () {
		const assistantOutput = `+++Update bug report template with additional fields
+++This pull request updates the bug report template to include additional fields that will help us better understand and reproduce reported issues. The new fields include Repository Clone Configuration (single repository/fork of an upstream repository) and Github Product (Github.com/Github Enterprise version x.x.x). This will allow us to better diagnose and resolve issues.+++`;

		const parsed = GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(assistantOutput);
		assert.strictEqual(parsed?.title, 'Update bug report template with additional fields');
		assert.strictEqual(parsed?.description, `This pull request updates the bug report template to include additional fields that will help us better understand and reproduce reported issues. The new fields include Repository Clone Configuration (single repository/fork of an upstream repository) and Github Product (Github.com/Github Enterprise version x.x.x). This will allow us to better diagnose and resolve issues.`);
	});

	test('Test parse assistant output, newlines', function () {
		const assistantOutput = `+++
Title: Fix tab bar submenu capitalization
Description: This pull request fixes the capitalization of the "Tab Bar" submenu in the editor tabs bar context menu. It also adds an empty editor group menu item to the same context menu. These changes were made to improve consistency and clarity in the user interface. This pull request includes the following commits:
- Empty Group Maximized Action Item
+++`;

		const parsed = GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(assistantOutput);
		assert.strictEqual(parsed?.title, 'Fix tab bar submenu capitalization');
		assert.strictEqual(parsed?.description, `This pull request fixes the capitalization of the "Tab Bar" submenu in the editor tabs bar context menu. It also adds an empty editor group menu item to the same context menu. These changes were made to improve consistency and clarity in the user interface. This pull request includes the following commits:

- Empty Group Maximized Action Item`);
	});

	test('Test parse assistant output, without final +++', function () {
		const assistantOutput = `+++Update tab bar group and order in layoutActions.ts
+++This pull request updates the group and order of the tab bar in layoutActions.ts to better align with the overall layout of the workbench. Specifically, the group has been changed to '3_workbench_layout_move' and the order has been changed to 10. These changes will improve the user experience and make the layout more intuitive.`;

		const parsed = GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(assistantOutput);
		assert.strictEqual(parsed?.title, 'Update tab bar group and order in layoutActions.ts');
		assert.strictEqual(parsed?.description, `This pull request updates the group and order of the tab bar in layoutActions.ts to better align with the overall layout of the workbench. Specifically, the group has been changed to '3_workbench_layout_move' and the order has been changed to 10. These changes will improve the user experience and make the layout more intuitive.`);
	});

	test('Test parse assistant output, title in quotes', function () {
		const assistantOutput = `+++"Update bug report template with additional fields"
+++This pull request updates the bug report template to include additional fields that will help us better understand and reproduce reported issues. The new fields include Repository Clone Configuration (single repository/fork of an upstream repository) and Github Product (Github.com/Github Enterprise version x.x.x). This will allow us to better diagnose and resolve issues.+++`;

		const parsed = GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(assistantOutput);
		assert.strictEqual(parsed?.title, 'Update bug report template with additional fields');
		assert.strictEqual(parsed?.description, `This pull request updates the bug report template to include additional fields that will help us better understand and reproduce reported issues. The new fields include Repository Clone Configuration (single repository/fork of an upstream repository) and Github Product (Github.com/Github Enterprise version x.x.x). This will allow us to better diagnose and resolve issues.`);
	});

	test('Test parse assistant output, extra +s', function () {
		const assistantOutput = `+++++ Improve error attribution and stest name validation
		+++++This pull request includes two commits. The first commit improves error attribution by making it easier to attribute errors to specific scenarios. The second commit adds validation for stest names, stripping newlines and limiting the length to 100 characters. These changes enhance the reliability and readability of the codebase.`;

		const parsed = GitHubPullRequestTitleAndDescriptionGenerator.parseFetchResult(assistantOutput);
		assert.strictEqual(parsed?.title, 'Improve error attribution and stest name validation');
		assert.strictEqual(parsed?.description, `This pull request includes two commits. The first commit improves error attribution by making it easier to attribute errors to specific scenarios. The second commit adds validation for stest names, stripping newlines and limiting the length to 100 characters. These changes enhance the reliability and readability of the codebase.`);
	});
});
