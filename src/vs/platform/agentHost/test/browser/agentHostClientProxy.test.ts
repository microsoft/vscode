/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IRequestService } from '../../../request/common/request.js';
import { AgentHostClientProxy } from '../../browser/agentHostClientProxy.js';
import { AgentHostSystemProxyEnabledSettingId } from '../../common/agentService.js';

suite('AgentHostClientProxy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IOptions {
		readonly settings?: Record<string, unknown>;
		readonly resolveProxy?: (url: string) => string | undefined;
		readonly apiEndpoint?: string;
	}

	function createProxy(options: IOptions) {
		const resolvedUrls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService(options.settings));
		instantiationService.stub(IRequestService, {
			resolveProxy: async (url: string) => {
				resolvedUrls.push(url);
				return options.resolveProxy?.(url);
			},
			lookupKerberosAuthorization: async (url: string) => `Negotiate token:${new URL(url).hostname}`,
		});
		instantiationService.stub(IDefaultAccountService, {
			currentDefaultAccount: options.apiEndpoint ? { entitlementsData: { endpoints: { api: options.apiEndpoint } } } : null,
		} as Partial<IDefaultAccountService>);
		instantiationService.stub(ILogService, new NullLogService());
		return { proxy: instantiationService.createInstance(AgentHostClientProxy, () => true), resolvedUrls };
	}

	async function lookUp(proxyUrls: readonly string[], options: IOptions) {
		const { proxy, resolvedUrls } = createProxy(options);
		const authorizations: Record<string, string | undefined> = {};
		for (const proxyUrl of proxyUrls) {
			authorizations[proxyUrl] = await proxy.lookupKerberosAuthorization(proxyUrl);
		}
		return { authorizations, resolvedUrls };
	}

	test('only issues tickets for the proxies configured or resolved for GitHub Copilot', async () => {
		const results = {
			systemProxy: await lookUp(['http://proxy.corp:8080', 'http://PROXY.CORP', 'https://backup.corp:443', 'http://intranet.corp:8080', 'not a URL'], {
				resolveProxy: () => 'PROXY proxy.corp:8080; HTTPS backup.corp:443; DIRECT',
				apiEndpoint: 'https://api.enterprise.githubcopilot.com',
			}),
			configuredProxy: await lookUp(['http://configured.corp:3128', 'http://proxy.corp:8080'], {
				settings: { 'http.proxy': 'http://configured.corp:3128' },
				resolveProxy: () => 'PROXY proxy.corp:8080',
			}),
			configuredPrincipal: await lookUp(['http://other.corp:8080'], {
				settings: { 'http.proxyKerberosServicePrincipal': 'HTTP@custom.corp@CORP.COM' },
				resolveProxy: () => 'DIRECT',
			}),
			direct: await lookUp(['http://proxy.corp:8080'], {
				resolveProxy: () => 'DIRECT',
			}),
			systemProxyDisabled: await lookUp(['http://proxy.corp:8080'], {
				settings: { [AgentHostSystemProxyEnabledSettingId]: false },
				resolveProxy: () => 'PROXY proxy.corp:8080',
			}),
		};

		assert.deepStrictEqual(results, {
			systemProxy: {
				authorizations: {
					'http://proxy.corp:8080': 'Negotiate token:proxy.corp',
					'http://PROXY.CORP': 'Negotiate token:proxy.corp',
					'https://backup.corp:443': 'Negotiate token:backup.corp',
					'http://intranet.corp:8080': undefined,
					'not a URL': undefined,
				},
				resolvedUrls: Array(4).fill('https://api.enterprise.githubcopilot.com'),
			},
			configuredProxy: {
				authorizations: { 'http://configured.corp:3128': 'Negotiate token:configured.corp', 'http://proxy.corp:8080': undefined },
				resolvedUrls: [],
			},
			configuredPrincipal: {
				authorizations: { 'http://other.corp:8080': 'Negotiate token:other.corp' },
				resolvedUrls: [],
			},
			direct: {
				authorizations: { 'http://proxy.corp:8080': undefined },
				resolvedUrls: ['https://api.githubcopilot.com'],
			},
			systemProxyDisabled: {
				authorizations: { 'http://proxy.corp:8080': undefined },
				resolvedUrls: [],
			},
		});
	});

	test('issues tickets for proxies it resolved for the agent host', async () => {
		const { proxy } = createProxy({ resolveProxy: url => url.startsWith('https://github.example/') ? 'PROXY pac.corp:8080; DIRECT' : 'DIRECT' });

		const before = await proxy.lookupKerberosAuthorization('http://pac.corp:8080');
		const resolved = await proxy.resolveProxy('https://github.example/api');
		const after = await proxy.lookupKerberosAuthorization('http://pac.corp:8080');

		assert.deepStrictEqual({ before, resolved, after }, {
			before: undefined,
			resolved: 'PROXY pac.corp:8080; DIRECT',
			after: 'Negotiate token:pac.corp',
		});
	});

	test('leaves proxy resolution to the agent host when http.useLocalProxyConfiguration is off', async () => {
		const { proxy, resolvedUrls } = createProxy({ settings: { 'http.useLocalProxyConfiguration': false }, resolveProxy: () => 'PROXY proxy.corp:8080' });

		assert.deepStrictEqual({ resolved: await proxy.resolveProxy('https://example.com'), resolvedUrls }, { resolved: undefined, resolvedUrls: [] });
	});
});
