/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationOverrides, IConfigurationService, IConfigurationValue } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AuthInfo, IRequestService } from '../../../request/common/request.js';
import { AgentHostClientProxy } from '../../browser/agentHostClientProxy.js';
import { AgentHostSystemProxyEnabledSettingId } from '../../common/agentService.js';

/** Settings where `remoteKeys` come only from a remote: part of the merged value, absent from the local user layer. */
class RemoteSettingsConfigurationService extends TestConfigurationService {
	constructor(settings: Record<string, unknown>, private readonly _remoteKeys: ReadonlySet<string>) {
		super(settings);
	}

	override inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		const inspected = super.inspect<T>(key, overrides);
		return this._remoteKeys.has(key) ? { ...inspected, userLocalValue: undefined, userRemoteValue: inspected.value } : inspected;
	}
}

suite('AgentHostClientProxy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IOptions {
		readonly settings?: Record<string, unknown>;
		readonly remoteSettings?: Record<string, unknown>;
		readonly resolveProxy?: (url: string) => string | undefined;
		readonly apiEndpoint?: string;
		readonly environment?: IProcessEnvironment;
		readonly logService?: ILogService;
	}

	function createProxy(options: IOptions) {
		const resolvedUrls: string[] = [];
		const authInfos: AuthInfo[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new RemoteSettingsConfigurationService({ ...options.settings, ...options.remoteSettings }, new Set(Object.keys(options.remoteSettings ?? {})));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IRequestService, {
			resolveProxy: async (url: string) => {
				resolvedUrls.push(url);
				return options.resolveProxy?.(url);
			},
			lookupKerberosAuthorization: async (url: string) => `Negotiate token:${new URL(url).hostname}`,
			lookupAuthorization: async (authInfo: AuthInfo) => {
				authInfos.push(authInfo);
				return { username: 'user', password: `secret:${authInfo.host}` };
			},
		});
		instantiationService.stub(IDefaultAccountService, {
			currentDefaultAccount: options.apiEndpoint ? { entitlementsData: { endpoints: { api: options.apiEndpoint } } } : null,
		} as Partial<IDefaultAccountService>);
		instantiationService.stub(ILogService, options.logService ?? new NullLogService());
		return { proxy: instantiationService.createInstance(AgentHostClientProxy, () => true, options.environment ?? {}), resolvedUrls, authInfos, configurationService };
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
			remotePrincipal: await lookUp(['http://other.corp:8080'], {
				remoteSettings: { 'http.proxyKerberosServicePrincipal': 'HTTP@custom.corp@CORP.COM' },
				resolveProxy: () => 'DIRECT',
			}),
			remoteProxy: await lookUp(['http://configured.corp:3128'], {
				remoteSettings: { 'http.proxy': 'http://configured.corp:3128' },
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
				// The proxies resolved for the first lookup are remembered, while a declined one is checked again.
				resolvedUrls: Array(2).fill('https://api.enterprise.githubcopilot.com'),
			},
			configuredProxy: {
				authorizations: { 'http://configured.corp:3128': 'Negotiate token:configured.corp', 'http://proxy.corp:8080': undefined },
				resolvedUrls: [],
			},
			configuredPrincipal: {
				authorizations: { 'http://other.corp:8080': 'Negotiate token:other.corp' },
				resolvedUrls: [],
			},
			// Remote settings cannot authorize this client's tickets: the native lookup reads local settings only.
			remotePrincipal: {
				authorizations: { 'http://other.corp:8080': undefined },
				resolvedUrls: ['https://api.githubcopilot.com'],
			},
			remoteProxy: {
				authorizations: { 'http://configured.corp:3128': undefined },
				resolvedUrls: ['https://api.githubcopilot.com'],
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

	test('only looks up Basic credentials for the proxies it points the agent host at', async () => {
		async function lookUpBasic(proxyUrls: readonly string[], options: IOptions) {
			const { proxy, authInfos } = createProxy(options);
			const credentials: Record<string, string | undefined> = {};
			for (const [index, proxyUrl] of proxyUrls.entries()) {
				credentials[proxyUrl] = (await proxy.lookupBasicAuthorization(proxyUrl, index ? undefined : 'Corp', index + 1))?.password;
			}
			return { credentials, authInfos };
		}

		const results = {
			systemProxy: await lookUpBasic(['http://proxy.corp:8080', 'https://secure.corp', 'http://secure.corp', 'http://proxy.corp:3128', 'http://intranet.corp:8080'], {
				resolveProxy: () => 'PROXY proxy.corp:8080; HTTPS secure.corp; DIRECT',
			}),
			configuredProxy: await lookUpBasic(['http://configured.corp:3128', 'http://configured.corp', 'http://proxy.corp:8080'], {
				settings: { 'http.proxy': 'http://user:pass@configured.corp:3128' },
				resolveProxy: () => 'PROXY proxy.corp:8080',
			}),
			configuredPrincipal: await lookUpBasic(['http://other.corp:8080'], {
				settings: { 'http.proxyKerberosServicePrincipal': 'HTTP@custom.corp@CORP.COM' },
				resolveProxy: () => 'DIRECT',
			}),
			useLocalProxyConfigurationOff: await lookUpBasic(['http://proxy.corp:8080'], {
				settings: { 'http.useLocalProxyConfiguration': false },
				resolveProxy: () => 'PROXY proxy.corp:8080',
			}),
			resolvedBeforeConfiguredProxy: await (async () => {
				const { proxy, configurationService } = createProxy({ resolveProxy: () => 'PROXY pac.corp:8080' });
				await proxy.resolveProxy('https://github.example/api');
				const before = (await proxy.lookupBasicAuthorization('http://pac.corp:8080', undefined, 1))?.password;
				await configurationService.setUserConfiguration('http.proxy', 'http://user:pass@configured.corp:3128');
				const after = (await proxy.lookupBasicAuthorization('http://pac.corp:8080', undefined, 1))?.password;
				return { before, after };
			})(),
			environmentProxy: await lookUpBasic(['http://pac.corp:8080', 'http://envproxy.corp:3128'], {
				environment: { HTTPS_PROXY: 'http://user:pass@envproxy.corp:3128' },
				resolveProxy: () => 'PROXY pac.corp:8080; PROXY envproxy.corp:3128',
			}),
			unresolvedEnvironmentProxy: await lookUpBasic(['http://pac.corp:8080', 'http://envproxy.corp:3128'], {
				environment: { HTTPS_PROXY: 'http://user:pass@envproxy.corp:3128' },
				resolveProxy: () => 'PROXY pac.corp:8080',
			}),
			environmentProxyWithoutCredentials: await lookUpBasic(['http://pac.corp:8080'], {
				environment: { HTTPS_PROXY: 'http://envproxy.corp:3128', HTTP_PROXY: 'http://user:pass@other.corp:3128' },
				resolveProxy: () => 'PROXY pac.corp:8080',
			}),
			clearedConfiguredProxy: await (async () => {
				const { proxy, configurationService } = createProxy({
					settings: { 'http.proxy': 'http://configured.corp:3128' },
					environment: { HTTPS_PROXY: 'http://user:pass@envproxy.corp:3128' },
					resolveProxy: () => 'PROXY pac.corp:8080',
				});
				await proxy.resolveProxy('https://github.example/api');
				const configured = (await proxy.lookupBasicAuthorization('http://configured.corp:3128', undefined, 1))?.password;
				await configurationService.setUserConfiguration('http.proxy', '');
				const pac = (await proxy.lookupBasicAuthorization('http://pac.corp:8080', undefined, 1))?.password;
				return { configured, pac };
			})(),
		};

		assert.deepStrictEqual(results, {
			systemProxy: {
				credentials: {
					'http://proxy.corp:8080': 'secret:proxy.corp',
					'https://secure.corp': 'secret:secure.corp',
					'http://secure.corp': undefined,
					'http://proxy.corp:3128': undefined,
					'http://intranet.corp:8080': undefined,
				},
				authInfos: [
					{ isProxy: true, scheme: 'basic', host: 'proxy.corp', port: 8080, realm: 'Corp', attempt: 1 },
					{ isProxy: true, scheme: 'basic', host: 'secure.corp', port: 443, realm: '', attempt: 2 },
				],
			},
			configuredProxy: {
				credentials: { 'http://configured.corp:3128': 'secret:configured.corp', 'http://configured.corp': undefined, 'http://proxy.corp:8080': undefined },
				authInfos: [{ isProxy: true, scheme: 'basic', host: 'configured.corp', port: 3128, realm: 'Corp', attempt: 1 }],
			},
			// Unlike Kerberos tickets, a configured principal does not release Basic credentials for other proxies.
			configuredPrincipal: { credentials: { 'http://other.corp:8080': undefined }, authInfos: [] },
			useLocalProxyConfigurationOff: { credentials: { 'http://proxy.corp:8080': undefined }, authInfos: [] },
			// The native lookup would return the credentials of `http.proxy` for the proxy resolved before.
			resolvedBeforeConfiguredProxy: { before: 'secret:pac.corp', after: undefined },
			// Likewise, it would return the credentials of the environment's proxy for any other proxy.
			environmentProxy: {
				credentials: { 'http://pac.corp:8080': undefined, 'http://envproxy.corp:3128': 'secret:envproxy.corp' },
				authInfos: [{ isProxy: true, scheme: 'basic', host: 'envproxy.corp', port: 3128, realm: '', attempt: 2 }],
			},
			unresolvedEnvironmentProxy: { credentials: { 'http://pac.corp:8080': undefined, 'http://envproxy.corp:3128': undefined }, authInfos: [] },
			// The first proxy variable the native lookup reads has no credentials, so it returns none for any proxy.
			environmentProxyWithoutCredentials: {
				credentials: { 'http://pac.corp:8080': 'secret:pac.corp' },
				authInfos: [{ isProxy: true, scheme: 'basic', host: 'pac.corp', port: 8080, realm: 'Corp', attempt: 1 }],
			},
			// Once `http.proxy` is cleared, the native lookup reads the environment's proxy.
			clearedConfiguredProxy: { configured: 'secret:configured.corp', pac: undefined },
		});
	});

	test('logs a declined proxy once', async () => {
		const declined: string[] = [];
		const logService = new class extends NullLogService {
			override info(message: string): void {
				declined.push(message);
			}
		}();
		const { proxy } = createProxy({ resolveProxy: () => 'PROXY proxy.corp:8080', logService });

		for (const proxyUrl of ['http://intranet.corp:8080', 'http://intranet.corp:3128', 'http://other.corp:8080']) {
			await proxy.lookupKerberosAuthorization(proxyUrl);
		}

		assert.deepStrictEqual(declined, [
			'[AgentHostClientProxy] Declined Kerberos lookup for intranet.corp: not a proxy this client points the agent host at',
			'[AgentHostClientProxy] Declined Kerberos lookup for other.corp: not a proxy this client points the agent host at',
		]);
	});

	test('leaves proxy resolution to the agent host when http.useLocalProxyConfiguration is off', async () => {
		const { proxy, resolvedUrls } = createProxy({ settings: { 'http.useLocalProxyConfiguration': false }, resolveProxy: () => 'PROXY proxy.corp:8080' });

		assert.deepStrictEqual({ resolved: await proxy.resolveProxy('https://example.com'), resolvedUrls }, { resolved: undefined, resolvedUrls: [] });
	});

	test('signals changes to the settings that affect proxy resolution', () => {
		const { proxy, configurationService } = createProxy({});
		const signaled: string[] = [];

		for (const key of ['http.useLocalProxyConfiguration', 'http.proxy', 'editor.fontSize']) {
			const listener = proxy.onDidChange(() => signaled.push(key));
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (affected: string) => affected === key } as IConfigurationChangeEvent);
			listener.dispose();
		}

		assert.deepStrictEqual(signaled, ['http.useLocalProxyConfiguration', 'http.proxy']);
	});
});
