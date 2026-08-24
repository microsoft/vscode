/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { gitGenerators } from '../../completions/git';

suite('Git Branch Completions', () => {
	test('postProcessBranches should parse git for-each-ref output with commit details', () => {
		const input = `main|John Doe|abc1234|Fix response codeblock in debug view|2 days ago
feature/test|Jane Smith|def5678|Add new feature|1 week ago`;

		const result = gitGenerators.localBranches.postProcess!(input, []);

		assert.ok(result);
		assert.strictEqual(result.length, 2);
		assert.ok(result[0]);
		assert.strictEqual(result[0].name, 'main');
		assert.strictEqual(result[0].description, '2 days ago • John Doe • abc1234 • Fix response codeblock in debug view');
		assert.strictEqual(result[0].icon, `vscode://icon?type=${vscode.TerminalCompletionItemKind.ScmBranch}`);

		assert.ok(result[1]);
		assert.strictEqual(result[1].name, 'feature/test');
		assert.strictEqual(result[1].description, '1 week ago • Jane Smith • def5678 • Add new feature');
		assert.strictEqual(result[1].icon, `vscode://icon?type=${vscode.TerminalCompletionItemKind.ScmBranch}`);
	});

	test('postProcessBranches should handle remote branches', () => {
		const input = `remotes/origin/main|John Doe|abc1234|Fix bug|2 days ago
remotes/origin/feature|Jane Smith|def5678|Add feature|1 week ago`;

		const result = gitGenerators.remoteLocalBranches.postProcess!(input, []);

		assert.ok(result);
		assert.strictEqual(result.length, 2);
		assert.ok(result[0]);
		assert.strictEqual(result[0].name, 'main');
		assert.strictEqual(result[0].description, '2 days ago • John Doe • abc1234 • Fix bug');

		assert.ok(result[1]);
		assert.strictEqual(result[1].name, 'feature');
		assert.strictEqual(result[1].description, '1 week ago • Jane Smith • def5678 • Add feature');
	});

	test('postProcessBranches should filter out HEAD branches', () => {
		const input = `main|John Doe|abc1234|Fix bug|2 days ago
HEAD -> main|John Doe|abc1234|Fix bug|2 days ago`;

		const result = gitGenerators.localBranches.postProcess!(input, []);

		assert.ok(result);
		assert.strictEqual(result.length, 1);
		assert.ok(result[0]);
		assert.strictEqual(result[0].name, 'main');
	});

	test('postProcessBranches should handle empty input', () => {
		const input = '';

		const result = gitGenerators.localBranches.postProcess!(input, []);

		assert.ok(result);
		assert.strictEqual(result.length, 0);
	});

	test('postProcessBranches should handle git error output', () => {
		const input = 'fatal: not a git repository';

		const result = gitGenerators.localBranches.postProcess!(input, []);

		assert.ok(result);
		assert.strictEqual(result.length, 0);
	});

	test('postProcessBranches should deduplicate branches', () => {
		const input = `main|John Doe|abc1234|Fix bug|2 days ago
main|John Doe|abc1234|Fix bug|2 days ago`;

		const result = gitGenerators.localBranches.postProcess!(input, []);

		assert.ok(result);
		assert.strictEqual(result.length, 1);
		assert.ok(result[0]);
		assert.strictEqual(result[0].name, 'main');
	});
});
