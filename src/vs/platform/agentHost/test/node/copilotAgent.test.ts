/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getCopilotWorktreeBranchName, getCopilotWorktreeName, getCopilotWorktreesRoot } from '../../node/copilot/copilotAgent.js';

suite('CopilotAgent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the Copilot CLI sibling worktrees root convention', () => {
		assert.strictEqual(
			getCopilotWorktreesRoot(URI.file('/Users/me/src/vscode')).fsPath,
			URI.file('/Users/me/src/vscode.worktrees').fsPath,
		);
	});

	test('uses Agents-window Copilot CLI branch prefix', () => {
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', 'add-agent-host-config'), 'agents/add-agent-host-config-12345678');
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', undefined), 'agents/12345678-aaaa-bbbb-cccc-123456789abc');
	});

	test('uses Git extension branch-derived worktree folder names', () => {
		assert.strictEqual(getCopilotWorktreeName('agents/add-agent-host-config-12345678'), 'agents-add-agent-host-config-12345678');
	});

	test('keeps hinted branch names short', () => {
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', 'a'.repeat(48)).length, 'agents/'.length + 48 + '-12345678'.length);
	});
});
