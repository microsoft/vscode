/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import type { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import { createGitHubMcpServerConfiguration, getGitHubMcpTools, GITHUB_MCP_DEPRECATED_WORKFLOW_TOOLS, GITHUB_MCP_TOOLS_WITH_GH_EQUIVALENTS, GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS, resolveGitHubMcpServerConfiguration } from '../../../node/shared/githubMcpServer.js';

suite('githubMcpServer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps globally required tools and excludes gh-replaceable tools when gh is available', () => {
		const withGh = getGitHubMcpTools(true);
		const withoutGh = getGitHubMcpTools(false);
		const config = createGitHubMcpServerConfiguration('https://api.githubcopilot.com', true);

		assert.deepStrictEqual({
			withGh,
			withoutGh,
			toolsHeader: config.type === McpServerType.REMOTE ? config.headers?.['X-MCP-Tools'] : undefined,
			authorization: config.type === McpServerType.REMOTE ? config.headers?.Authorization : undefined,
		}, {
			withGh: GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS,
			withoutGh: [
				...GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS,
				...GITHUB_MCP_TOOLS_WITH_GH_EQUIVALENTS,
				...GITHUB_MCP_DEPRECATED_WORKFLOW_TOOLS,
			],
			toolsHeader: GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS.join(','),
			authorization: undefined,
		});
	});

	test('does not pair a token with the public endpoint when account endpoint discovery fails', async () => {
		const copilotApiService = {
			resolveApiEndpoint: async () => undefined,
		} as Partial<ICopilotApiService> as ICopilotApiService;

		assert.strictEqual(await resolveGitHubMcpServerConfiguration(copilotApiService, 'enterprise-token'), undefined);
	});
});
