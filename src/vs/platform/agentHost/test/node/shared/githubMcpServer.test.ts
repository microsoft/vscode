/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerType } from '../../../../mcp/common/mcpPlatformTypes.js';
import { createGitHubMcpServerConfiguration, getGitHubMcpTools, GITHUB_MCP_DEPRECATED_WORKFLOW_TOOLS, GITHUB_MCP_TOOLS_WITH_GH_EQUIVALENTS, GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS } from '../../../node/shared/githubMcpServer.js';

suite('githubMcpServer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps globally required tools and excludes gh-replaceable tools when gh is available', () => {
		const withGh = getGitHubMcpTools(true);
		const withoutGh = getGitHubMcpTools(false);
		const config = createGitHubMcpServerConfiguration(undefined, 'token', true);

		assert.deepStrictEqual({
			withGh,
			withoutGh,
			toolsHeader: config.type === McpServerType.REMOTE ? config.headers?.['X-MCP-Tools'] : undefined,
		}, {
			withGh: GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS,
			withoutGh: [
				...GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS,
				...GITHUB_MCP_TOOLS_WITH_GH_EQUIVALENTS,
				...GITHUB_MCP_DEPRECATED_WORKFLOW_TOOLS,
			],
			toolsHeader: GITHUB_MCP_TOOLS_WITHOUT_GH_EQUIVALENTS.join(','),
		});
	});
});
