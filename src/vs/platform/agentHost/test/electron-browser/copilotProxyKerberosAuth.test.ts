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
import { INativeHostService } from '../../../native/common/native.js';
import { IRequestService } from '../../../request/common/request.js';
import { AgentHostSystemProxyEnabledSettingId } from '../../common/agentService.js';
import { CopilotProxyKerberosAuth } from '../../electron-browser/copilotProxyKerberosAuth.js';

suite('CopilotProxyKerberosAuth', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function lookUp(spns: readonly string[], options: { settings?: Record<string, unknown>; resolvedProxy?: string; apiEndpoint?: string }) {
		const resolvedUrls: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService(options.settings));
		instantiationService.stub(IRequestService, {
			resolveProxy: async (url: string) => {
				resolvedUrls.push(url);
				return options.resolvedProxy;
			},
		});
		instantiationService.stub(IDefaultAccountService, {
			currentDefaultAccount: options.apiEndpoint ? { entitlementsData: { endpoints: { api: options.apiEndpoint } } } : null,
		} as Partial<IDefaultAccountService>);
		instantiationService.stub(INativeHostService, { lookupKerberosToken: async (spn: string) => `token:${spn}` });
		instantiationService.stub(ILogService, new NullLogService());
		const auth = instantiationService.createInstance(CopilotProxyKerberosAuth);
		const tokens: Record<string, string | undefined> = {};
		for (const spn of spns) {
			tokens[spn] = await auth.lookup({ spn });
		}
		return { tokens, resolvedUrls };
	}

	test('only looks up tokens for the GitHub Copilot proxy', async () => {
		const results = {
			systemProxy: await lookUp(['HTTP/proxy.corp', 'HTTP/PROXY.CORP@CORP.COM', 'HTTP/backup.corp', 'HTTP/intranet.corp', 'ldap/proxy.corp'], {
				resolvedProxy: 'PROXY proxy.corp:8080; HTTPS backup.corp:443; DIRECT',
				apiEndpoint: 'https://api.enterprise.githubcopilot.com',
			}),
			configuredProxy: await lookUp(['HTTP/configured.corp', 'HTTP/proxy.corp'], {
				settings: { 'http.proxy': 'http://configured.corp:3128' },
				resolvedProxy: 'PROXY proxy.corp:8080',
			}),
			configuredPrincipal: await lookUp(['HTTP/custom.corp@CORP.COM', 'HTTP/other.corp'], {
				settings: { 'http.proxyKerberosServicePrincipal': 'HTTP@custom.corp@CORP.COM' },
				resolvedProxy: 'PROXY proxy.corp:8080',
			}),
			direct: await lookUp(['HTTP/proxy.corp'], {
				settings: { 'http.proxyKerberosServicePrincipal': 'HTTP/proxy.corp' },
				resolvedProxy: 'DIRECT',
			}),
			systemProxyDisabled: await lookUp(['HTTP/proxy.corp'], {
				settings: { [AgentHostSystemProxyEnabledSettingId]: false },
				resolvedProxy: 'PROXY proxy.corp:8080',
			}),
		};

		assert.deepStrictEqual(results, {
			systemProxy: {
				tokens: {
					'HTTP/proxy.corp': 'token:HTTP/proxy.corp',
					'HTTP/PROXY.CORP@CORP.COM': 'token:HTTP/PROXY.CORP@CORP.COM',
					'HTTP/backup.corp': 'token:HTTP/backup.corp',
					'HTTP/intranet.corp': undefined,
					'ldap/proxy.corp': undefined,
				},
				resolvedUrls: Array(5).fill('https://api.enterprise.githubcopilot.com'),
			},
			configuredProxy: {
				tokens: { 'HTTP/configured.corp': 'token:HTTP/configured.corp', 'HTTP/proxy.corp': undefined },
				resolvedUrls: [],
			},
			configuredPrincipal: {
				tokens: { 'HTTP/custom.corp@CORP.COM': 'token:HTTP/custom.corp@CORP.COM', 'HTTP/other.corp': undefined },
				resolvedUrls: ['https://api.githubcopilot.com', 'https://api.githubcopilot.com'],
			},
			direct: {
				tokens: { 'HTTP/proxy.corp': undefined },
				resolvedUrls: ['https://api.githubcopilot.com'],
			},
			systemProxyDisabled: {
				tokens: { 'HTTP/proxy.corp': undefined },
				resolvedUrls: [],
			},
		});
	});
});
