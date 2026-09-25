/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentMergeGitHubToolRestriction, isAgentMergeRestrictedMcpServer, isCopilotMcpToolName, isGitHubMcpToolName } from '../../node/shared/agentMergeToolRestrictions.js';

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

	test('restricts only MCP servers that expose GitHub', () => {
		const servers: Record<string, Parameters<typeof isAgentMergeRestrictedMcpServer>[1]> = {
			'corp-GitHub': { url: 'https://mcp.example.com/mcp' },
			'copilot-api': { url: 'https://api.githubcopilot.com/mcp/x/repos' },
			'enterprise': { url: 'https://copilot-api.acme.ghe.com/mcp' },
			'docker': { command: 'docker', args: ['run', '-i', '--rm', 'ghcr.io/github/github-mcp-server:latest'] },
			'binary': { command: '/usr/local/bin/github-mcp-server', args: ['stdio'] },
			'reference': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
			'component-explorer': { command: 'npm', args: ['exec', '--no', '--', 'component-explorer', 'mcp'] },
			'pages': { url: 'https://octocat.github.io/mcp' },
			'malformed': { command: 'node', args: 5 as unknown as readonly string[] },
			'unknown': undefined,
		};
		assert.deepStrictEqual(Object.fromEntries(Object.entries(servers).map(([name, server]) => [name, isAgentMergeRestrictedMcpServer(name, server)])), {
			'corp-GitHub': true,
			'copilot-api': true,
			'enterprise': true,
			'docker': true,
			'binary': true,
			'reference': true,
			'component-explorer': false,
			'pages': false,
			'malformed': false,
			'unknown': false,
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
