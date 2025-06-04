/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { gitGenerators } from '../../../completions/upstream/git';

suite('Git Branch Priority Tests', () => {
	test('postProcessBranches should boost main and master branches', () => {
		const mockBranchOutput = `  feature-branch
  main
  master
  development
  another-feature`;

		const result = gitGenerators.remoteLocalBranches.postProcess!(mockBranchOutput, []);

		// Find main and master branches
		const mainBranch = result.find((suggestion: any) => suggestion.name === 'main');
		const masterBranch = result.find((suggestion: any) => suggestion.name === 'master');
		const otherBranches = result.filter((suggestion: any) => 
			suggestion.name !== 'main' && suggestion.name !== 'master'
		);

		// Verify main and master have higher priority (76)
		assert.strictEqual(mainBranch?.priority, 76, 'main branch should have priority 76');
		assert.strictEqual(masterBranch?.priority, 76, 'master branch should have priority 76');

		// Verify other branches have default priority (75)
		otherBranches.forEach((branch: any) => {
			assert.strictEqual(branch.priority, 75, `${branch.name} should have priority 75`);
		});
	});

	test('postProcessBranches should handle remote branches with main/master', () => {
		const mockRemoteBranchOutput = `  remotes/origin/feature-branch
  remotes/origin/main
  remotes/origin/master
  remotes/origin/development`;

		const result = gitGenerators.remoteLocalBranches.postProcess!(mockRemoteBranchOutput, []);

		// Find main and master branches (names should be stripped of remotes/ prefix)
		const mainBranch = result.find((suggestion: any) => suggestion.name === 'main');
		const masterBranch = result.find((suggestion: any) => suggestion.name === 'master');

		// Verify main and master have higher priority (76)
		assert.strictEqual(mainBranch?.priority, 76, 'remote main branch should have priority 76');
		assert.strictEqual(masterBranch?.priority, 76, 'remote master branch should have priority 76');
		
		// Verify they have remote branch description
		assert.strictEqual(mainBranch?.description, 'Remote branch', 'main should be marked as remote branch');
		assert.strictEqual(masterBranch?.description, 'Remote branch', 'master should be marked as remote branch');
	});

	test('postProcessBranches should still prioritize current branch above main/master', () => {
		const mockBranchOutputWithCurrent = `* current-branch
  main
  master
  feature-branch`;

		const result = gitGenerators.remoteLocalBranches.postProcess!(mockBranchOutputWithCurrent, []);

		// Find current, main and master branches
		const currentBranch = result.find((suggestion: any) => suggestion.name === 'current-branch');
		const mainBranch = result.find((suggestion: any) => suggestion.name === 'main');
		const masterBranch = result.find((suggestion: any) => suggestion.name === 'master');

		// Verify current branch has highest priority (100)
		assert.strictEqual(currentBranch?.priority, 100, 'current branch should have priority 100');
		
		// Verify main and master have medium priority (76)
		assert.strictEqual(mainBranch?.priority, 76, 'main branch should have priority 76');
		assert.strictEqual(masterBranch?.priority, 76, 'master branch should have priority 76');
	});
});