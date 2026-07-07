/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from '../../common/agentService.js';
import { deriveGitHubEndpoints, gitHubCopilotResource, gitHubRepoResource } from '../../common/githubEndpoints.js';

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
			dotCom: deriveGitHubEndpoints('https://github.com'),
			apiDotCom: deriveGitHubEndpoints('https://api.github.com'),
		}, {
			unset: DOT_COM,
			empty: DOT_COM,
			garbage: DOT_COM,
			dotCom: DOT_COM,
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
		// The GraphQL endpoint is `/api/graphql`, NOT `apiBaseUri + /graphql`
		// (which would give the wrong `/api/v3/graphql`).
		assert.deepStrictEqual(deriveGitHubEndpoints('https://ghe.acme.com'), {
			apiBaseUri: 'https://ghe.acme.com/api/v3',
			graphQlUri: 'https://ghe.acme.com/api/graphql',
			oauthServer: 'https://ghe.acme.com/login/oauth',
			enterpriseHost: 'ghe.acme.com',
		});
	});

	test('deriveGitHubEndpoints: preserves scheme and ignores path', () => {
		assert.deepStrictEqual(deriveGitHubEndpoints('http://ghe.local/some/path'), {
			apiBaseUri: 'http://ghe.local/api/v3',
			graphQlUri: 'http://ghe.local/api/graphql',
			oauthServer: 'http://ghe.local/login/oauth',
			enterpriseHost: 'ghe.local',
		});
	});

	test('resource builders derive resource + authorization_servers from endpoints', () => {
		const endpoints = deriveGitHubEndpoints('https://ghe.acme.com');
		assert.deepStrictEqual({
			copilot: gitHubCopilotResource(endpoints),
			repo: gitHubRepoResource(endpoints),
		}, {
			copilot: {
				resource: 'https://ghe.acme.com/api/v3',
				resource_name: 'GitHub Copilot',
				authorization_servers: ['https://ghe.acme.com/login/oauth'],
				scopes_supported: ['read:user', 'user:email'],
				required: true,
			},
			repo: {
				resource: 'https://ghe.acme.com/api/v3/repos',
				resource_name: 'GitHub Repository',
				authorization_servers: ['https://ghe.acme.com/login/oauth'],
				scopes_supported: ['repo'],
				required: false,
			},
		});
	});

	test('github.com resources are byte-for-byte the canonical protected-resource constants', () => {
		// Backward-compat invariant: with no enterprise URI, token-store keys and
		// advertised metadata must be unchanged for the common non-enterprise case.
		const endpoints = deriveGitHubEndpoints(undefined);
		assert.deepStrictEqual({
			copilot: gitHubCopilotResource(endpoints),
			repo: gitHubRepoResource(endpoints),
		}, {
			copilot: GITHUB_COPILOT_PROTECTED_RESOURCE,
			repo: GITHUB_REPO_PROTECTED_RESOURCE,
		});
	});
});
