/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentMergeGitHubToolRestriction, isCopilotMcpToolName, isGitHubMcpToolName } from '../../node/shared/agentMergeToolRestrictions.js';

suite('Agent Merge tool restrictions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recognizes GitHub MCP tool names across providers', () => {
		assert.deepStrictEqual({
			github: [
				'github-mcp-server-pull_request_read',
				'mcp__github-mcp-server__pull_request_review_write',
				'mcp_github_search_issues',
				'mcp__github__merge_pull_request',
				'corp-github-pull_request_review_write',
				'readAgentMergeCI',
				'filesystem_read_file',
			].map(isGitHubMcpToolName),
			aliasedCopilot: [
				isCopilotMcpToolName('corp-github-pull_request_read', new Set(['corp-github'])),
				isCopilotMcpToolName('readAgentMergeCI', new Set(['corp-github'])),
			],
		}, {
			github: [true, true, true, true, true, false, false],
			aliasedCopilot: [true, false],
		});
	});

	test('restricts GitHub CLI, GitHub MCP, and direct GitHub API calls', () => {
		const commands = [
			'gh pr review --approve',
			'/usr/bin/gh workflow rerun 123',
			'& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge',
			'github-mcp-server stdio',
			'x=gh; "$x" pr review --approve',
			'curl -X POST https://api.github.com/repos/microsoft/vscode/issues',
			'python - <<\'PY\'\nurl = \'https://api.github.com/repos/microsoft/vscode/issues\'\nPY',
			'git push origin HEAD',
			'npm test',
		];
		assert.deepStrictEqual(commands.map(command => !!getAgentMergeGitHubToolRestriction('shell', { command })), [
			true,
			true,
			true,
			true,
			true,
			true,
			true,
			false,
			false,
		]);
		assert.strictEqual(!!getAgentMergeGitHubToolRestriction('mcp__github-mcp-server__add_issue_comment', {}), true);
	});
});
