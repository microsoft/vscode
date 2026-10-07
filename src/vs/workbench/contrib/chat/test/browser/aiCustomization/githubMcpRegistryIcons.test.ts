/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getGitHubMcpRegistryIcon, getGitHubMcpRegistryIdentity } from '../../../browser/aiCustomization/githubMcpRegistryIcons.js';

suite('GitHub MCP Registry icons', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps trusted registry card URLs to the GitHub App owner avatars', () => {
		const cases = [
			['microsoft/playwright-mcp', 'https://avatars.githubusercontent.com/u/6154722?v=4'],
			['com.figma.mcp/mcp', 'https://avatars.githubusercontent.com/u/5155369?v=4'],
			['io.github.Wopee-io/wopee-mcp', 'https://avatars.githubusercontent.com/u/124098588?v=4'],
			['io.github.chriswu727/argus', 'https://avatars.githubusercontent.com/u/162077785?u=94c1370d6be1d16d9024310ea0e620ae2754bfaf&v=4'],
		] as const;
		assert.deepStrictEqual(cases.map(([identity]) => {
			const url = `https://api.mcp.github.com/oss/v0.1/servers/${encodeURIComponent(identity)}/versions/latest`;
			return {
				identity: getGitHubMcpRegistryIdentity(url),
				icon: getGitHubMcpRegistryIcon(url)?.toString(true),
			};
		}), cases.map(([identity, icon]) => ({ identity, icon })));
	});

	test('rejects untrusted and unknown registry identities', () => {
		assert.deepStrictEqual([
			getGitHubMcpRegistryIcon('https://example.com/v0.1/servers/microsoft%2Fplaywright-mcp/versions/latest'),
			getGitHubMcpRegistryIcon('https://api.mcp.github.com/v0.1/servers/unknown%2Fserver/versions/latest'),
			getGitHubMcpRegistryIcon('https://user@api.mcp.github.com/v0.1/servers/microsoft%2Fplaywright-mcp/versions/latest'),
			getGitHubMcpRegistryIcon(undefined),
		], [undefined, undefined, undefined, undefined]);
	});
});
