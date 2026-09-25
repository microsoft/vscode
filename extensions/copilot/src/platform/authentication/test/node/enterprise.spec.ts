/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, test } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { URI } from '../../../../util/vs/base/common/uri';
import { AuthProviderId } from '../../../configuration/common/configurationService';
import { authenticationSessionIdentityEquals, resolveGitHubSessionUri } from '../../common/enterprise';

describe('GitHub session provenance', () => {
	const session = (server?: string): AuthenticationSession => ({
		id: 'session',
		accessToken: 'token',
		account: { id: 'account', label: 'not-a-host' },
		scopes: [],
		authorizationServer: server ? URI.parse(server) : undefined,
	});

	test.each([AuthProviderId.GitHub, AuthProviderId.GitHubEnterprise])('requires provenance from %s sessions', providerId => {
		expect(() => resolveGitHubSessionUri(session(), providerId)).toThrow('session is incompatible');
	});

	test('accepts the public GitHub issuer for the public provider', () => {
		expect(resolveGitHubSessionUri(session('https://github.com/login/oauth'), AuthProviderId.GitHub).toString()).toBe('https://github.com/');
	});

	test.each([
		{ server: 'https://selected.ghe.com/login/oauth', expected: 'https://selected.ghe.com/' },
		{ server: 'HTTP://GHES.example:8080/login/oauth', expected: 'http://ghes.example:8080/' },
		{ server: 'HTTPS://GHES.example:443/login/oauth', expected: 'https://ghes.example:443/' },
		{ server: 'HTTP://GHES.example:80/login/oauth', expected: 'http://ghes.example:80/' },
		{ server: 'https://enterprise.example/Deployment/login/oauth', expected: 'https://enterprise.example/Deployment' },
		{ server: 'https://enterprise.example/Deployment%20One/login/oauth', expected: 'https://enterprise.example/Deployment%20One' },
	])('resolves the deployment solely from the issuer $server', ({ server, expected }) => {
		expect(resolveGitHubSessionUri(session(server), AuthProviderId.GitHubEnterprise).toString()).toBe(expected);
	});

	test.each([
		'https://enterprise.example/api/v3',
		'ftp://enterprise.example/login/oauth',
		'https://user@enterprise.example/login/oauth',
		'https://enterprise.example/login/oauth?other=host',
		'https://enterprise.example/login/oauth#other',
	])('rejects unsupported session provenance: %s', server => {
		expect(() => resolveGitHubSessionUri(session(server), AuthProviderId.GitHubEnterprise)).toThrow();
	});

	test.each([
		{ providerId: AuthProviderId.GitHub, server: 'https://enterprise.example/login/oauth' },
		{ providerId: AuthProviderId.GitHubEnterprise, server: 'https://github.com/login/oauth' },
		{ providerId: AuthProviderId.GitHubEnterprise, server: 'https://www.github.com/login/oauth' },
		{ providerId: AuthProviderId.GitHubEnterprise, server: 'https://api.github.com/login/oauth' },
	])('rejects an issuer that does not belong to $providerId: $server', ({ providerId, server }) => {
		expect(() => resolveGitHubSessionUri(session(server), providerId)).toThrow('selected provider');
	});

	test('account identity uses the issuer rather than labels or host-encoded account IDs', () => {
		const first = session('https://first.ghe.com/login/oauth');
		const second = session('https://second.ghe.com/login/oauth');
		const renamed = { ...first, account: { ...first.account, label: 'renamed' } };
		const renewed = { ...first, accessToken: 'renewed-token' };
		expect({
			sameIdDifferentIssuer: authenticationSessionIdentityEquals(first, second),
			renamed: authenticationSessionIdentityEquals(first, renamed),
			renewedIdentity: authenticationSessionIdentityEquals(first, renewed),
		}).toEqual({ sameIdDifferentIssuer: false, renamed: true, renewedIdentity: true });
	});
});
