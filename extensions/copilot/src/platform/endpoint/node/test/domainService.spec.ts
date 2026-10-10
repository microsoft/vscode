/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CAPIClient, RequestType } from '@vscode/copilot-api';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { AuthenticationSession } from 'vscode';
import { mock } from '../../../../util/common/test/simpleMock';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { CopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { AuthProviderId, ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { NullEnvService } from '../../../env/common/nullEnvService';
import { FetchOptions, IFetcherService, Response } from '../../../networking/common/fetcherService';
import { createFakeResponse } from '../../../test/node/fetcher';
import { BaseCAPIClientService } from '../../common/capiClient';
import { DomainService } from '../domainServiceImpl';

class RecordingFetcherService extends mock<IFetcherService>() {
	readonly requests: { url: string; authorization: string | undefined }[] = [];
	override async fetch(url: string, options: FetchOptions): Promise<Response> {
		this.requests.push({ url, authorization: options.headers?.Authorization });
		return createFakeResponse(200, {});
	}
}

class TestCAPIClientService extends BaseCAPIClientService {
	domainUpdateCount = 0;

	constructor(fetcher: IFetcherService) {
		super(undefined, undefined, fetcher, new NullEnvService());
	}

	override updateDomains(...args: Parameters<BaseCAPIClientService['updateDomains']>) {
		this.domainUpdateCount++;
		return super.updateDomains(...args);
	}
}

describe('Selected GitHub Enterprise domains', () => {
	const disposables = new DisposableStore();
	let configuration: InMemoryConfigurationService;
	let tokenStore: CopilotTokenStore;
	let fetcher: RecordingFetcherService;
	let capi: TestCAPIClientService;
	const hosts = ['https://first.ghe.com', 'https://second.ghe.com'];
	const session = (base: string): AuthenticationSession => ({
		id: 'session',
		accessToken: `github-${base}`,
		account: { id: 'account', label: 'same-login' },
		scopes: [],
		authorizationServer: URI.parse(`${base}/login/oauth`),
	});

	beforeEach(async () => {
		configuration = disposables.add(new InMemoryConfigurationService(disposables.add(new DefaultsOnlyConfigurationService())));
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHubEnterprise);
		tokenStore = disposables.add(new CopilotTokenStore());
		fetcher = new RecordingFetcherService();
		capi = new TestCAPIClientService(fetcher);
		disposables.add(new DomainService(configuration, tokenStore, capi));
	});

	afterEach(() => disposables.clear());

	test('bootstraps on the selected issuer and preserves token-discovered endpoint overrides', async () => {
		const selected = session(hosts[1]);
		tokenStore.githubEnterpriseUri = URI.parse(hosts[1]);
		await capi.makeRequest({ headers: { Authorization: `token ${selected.accessToken}` } }, { type: RequestType.CopilotToken });
		tokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ endpoints: { api: 'https://selected-capi.example' } }));
		await capi.makeRequest({}, { type: RequestType.Models });
		await configuration.setConfig(ConfigKey.Shared.DebugOverrideCAPIUrl, 'https://explicit-capi.example/');
		await capi.makeRequest({}, { type: RequestType.Models });
		expect(fetcher.requests).toEqual([
			{ url: 'https://api.second.ghe.com/copilot_internal/v2/token', authorization: `token ${selected.accessToken}` },
			{ url: 'https://selected-capi.example/models', authorization: undefined },
			{ url: 'https://explicit-capi.example/models', authorization: undefined },
		]);
	});

	test('a disagreeing provider setting does not change selected domains', async () => {
		tokenStore.githubEnterpriseUri = URI.parse(hosts[1]);
		await configuration.setNonExtensionConfig('github-enterprise.uri', hosts[0]);
		expect(capi.dotcomAPIURL).toBe('https://api.second.ghe.com');
	});

	test.each([
		{ key: ConfigKey.Shared.AuthProvider, value: AuthProviderId.GitHub },
		{ key: ConfigKey.Shared.DebugOverrideCAPIUrl, value: 'https://override-capi.example' },
		{ key: ConfigKey.Shared.DebugOverrideProxyUrl, value: 'https://override-proxy.example' },
	])('only updates domains when $key.id actually changes', async ({ key, value }) => {
		const initialUpdates = capi.domainUpdateCount;
		await configuration.setConfig(key, configuration.getConfig(key));
		const unchanged = capi.domainUpdateCount - initialUpdates;
		await configuration.setConfig(key, value);
		const changed = capi.domainUpdateCount - initialUpdates;
		await configuration.setConfig(key, value);
		expect({ unchanged, changed, repeated: capi.domainUpdateCount - initialUpdates }).toEqual({
			unchanged: 0, changed: 1, repeated: 1,
		});
	});

	test('unrelated advanced configuration does not update domains', async () => {
		const initialUpdates = capi.domainUpdateCount;
		await configuration.setConfig(ConfigKey.Shared.DebugOverrideAuthType, 'token');
		expect(capi.domainUpdateCount).toBe(initialUpdates);
	});

	test('switches domains when the selected session issuer changes', () => {
		tokenStore.githubEnterpriseUri = URI.parse(hosts[1]);
		tokenStore.githubEnterpriseUri = URI.parse(hosts[0]);
		expect(capi.dotcomAPIURL).toBe('https://api.first.ghe.com');
	});

	test.each([
		'https://selected.ghe.com',
		'https://enterprise.example',
		'https://enterprise.example:8443',
		'https://enterprise.example:443',
		'https://enterprise.example/Deployment',
	])('retains the CAPI library mapping for the selected deployment %s', async deployment => {
		const baseline = new CAPIClient({
			machineId: '', deviceId: '', sessionId: '', vscodeVersion: '', buildType: 'dev', name: '', version: '',
		}, undefined);
		baseline.updateDomains(undefined, deployment);
		const selected = session(deployment);
		tokenStore.githubEnterpriseUri = URI.parse(deployment);
		await configuration.setNonExtensionConfig('github-enterprise.uri', 'https://configured.example/Other');
		const headers = { Authorization: `token ${selected.accessToken}` };
		await capi.makeRequest({ headers }, { type: RequestType.CopilotUserInfo });
		expect({ api: capi.dotcomAPIURL, requests: fetcher.requests }).toEqual({
			api: baseline.dotcomAPIURL,
			requests: [{ url: `${baseline.dotcomAPIURL}/copilot_internal/user`, authorization: headers.Authorization }],
		});
	});

	test('clears enterprise routing when switching to a public session with provenance', async () => {
		tokenStore.githubEnterpriseUri = URI.parse(hosts[1]);
		await configuration.setConfig(ConfigKey.Shared.AuthProvider, AuthProviderId.GitHub);
		tokenStore.githubEnterpriseUri = undefined;
		await capi.makeRequest({}, { type: RequestType.CopilotToken });
		expect(fetcher.requests.map(request => request.url)).toEqual(['https://api.github.com/copilot_internal/v2/token']);
	});

	test('token-only authentication uses token endpoints without a GitHub session', async () => {
		const staticFetcher = new RecordingFetcherService();
		const staticClient = new TestCAPIClientService(staticFetcher);
		const staticTokenStore = disposables.add(new CopilotTokenStore());
		disposables.add(new DomainService(configuration, staticTokenStore, staticClient));
		staticTokenStore.copilotToken = new CopilotToken(createTestExtendedTokenInfo({ endpoints: { api: 'https://static-api.example' } }));
		await staticClient.makeRequest({ headers: { Authorization: 'Bearer static-credential' } }, { type: RequestType.Models });
		expect(staticFetcher.requests).toEqual([{ url: 'https://static-api.example/models', authorization: 'Bearer static-credential' }]);
	});

	test('reads an enterprise URI that was published before domain service construction', () => {
		const stored = disposables.add(new CopilotTokenStore());
		stored.githubEnterpriseUri = URI.parse(hosts[1]);
		const client = new TestCAPIClientService(fetcher);
		disposables.add(new DomainService(configuration, stored, client));
		expect(client.dotcomAPIURL).toBe('https://api.second.ghe.com');
	});
});
