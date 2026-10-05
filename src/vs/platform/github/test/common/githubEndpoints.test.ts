/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { deriveGitHubEndpoints, gitHubMcpServerUrl } from '../../common/githubEndpoints.js';

suite('githubEndpoints', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const DOT_COM = {
		apiBaseUri: 'https://api.github.com',
		graphQlUri: 'https://api.github.com/graphql',
		oauthServer: 'https://github.com/login/oauth',
		enterpriseHost: undefined,
	};

	test('deriveGitHubEndpoints: github.com defaults for unset / empty / unparseable / github.com host', () => {
		assert.deepStrictEqual({
			unset: deriveGitHubEndpoints(undefined),
			empty: deriveGitHubEndpoints(''),
			garbage: deriveGitHubEndpoints('not a uri'),
			malformed: deriveGitHubEndpoints('https:////ghe.acme.com'),
			noAuthority: deriveGitHubEndpoints('file:///ghe.acme.com'),
			dotCom: deriveGitHubEndpoints('https://github.com'),
			wwwDotCom: deriveGitHubEndpoints('https://www.github.com'),
			apiDotCom: deriveGitHubEndpoints('https://api.github.com'),
		}, {
			unset: DOT_COM,
			empty: DOT_COM,
			garbage: DOT_COM,
			malformed: DOT_COM,
			noAuthority: DOT_COM,
			dotCom: DOT_COM,
			wwwDotCom: DOT_COM,
			apiDotCom: DOT_COM,
		});
	});

	test('deriveGitHubEndpoints: GitHub Enterprise Cloud (.ghe.com) uses the api. subdomain', () => {
		assert.deepStrictEqual(deriveGitHubEndpoints('https://acme.ghe.com'), {
			apiBaseUri: 'https://api.acme.ghe.com',
			graphQlUri: 'https://api.acme.ghe.com/graphql',
			oauthServer: 'https://acme.ghe.com/login/oauth',
			enterpriseHost: 'acme.ghe.com',
		});
	});

	test('deriveGitHubEndpoints: GitHub Enterprise Server uses /api/v3 and /api/graphql', () => {
		assert.deepStrictEqual(deriveGitHubEndpoints('https://ghe.acme.com'), {
			apiBaseUri: 'https://ghe.acme.com/api/v3',
			graphQlUri: 'https://ghe.acme.com/api/graphql',
			oauthServer: 'https://ghe.acme.com/login/oauth',
			enterpriseHost: 'ghe.acme.com',
		});
	});

	test('deriveGitHubEndpoints: preserves scheme and port and ignores path, query and fragment', () => {
		assert.deepStrictEqual(deriveGitHubEndpoints('http://ghe.local:8080/some/path?query=value#fragment'), {
			apiBaseUri: 'http://ghe.local:8080/api/v3',
			graphQlUri: 'http://ghe.local:8080/api/graphql',
			oauthServer: 'http://ghe.local:8080/login/oauth',
			enterpriseHost: 'ghe.local:8080',
		});
	});

	test('gitHubMcpServerUrl derives the MCP endpoint from the per-user Copilot API host', () => {
		assert.deepStrictEqual({
			default: gitHubMcpServerUrl(undefined),
			enterprise: gitHubMcpServerUrl('https://api.enterprise.githubcopilot.com/v1?tenant=acme#fragment'),
			ghe: gitHubMcpServerUrl('https://copilot-api.ghe.acme.com'),
			invalid: gitHubMcpServerUrl('not a uri'),
			empty: gitHubMcpServerUrl(''),
			malformed: gitHubMcpServerUrl('https:////api.githubcopilot.com'),
			noAuthority: gitHubMcpServerUrl('https:/api.githubcopilot.com'),
		}, {
			default: 'https://api.githubcopilot.com/mcp',
			enterprise: 'https://api.enterprise.githubcopilot.com/mcp',
			ghe: 'https://copilot-api.ghe.acme.com/mcp',
			invalid: undefined,
			empty: undefined,
			malformed: undefined,
			noAuthority: undefined,
		});
	});
});
