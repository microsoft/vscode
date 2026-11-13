/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentNetworkFilterService } from '../../common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../common/settings.js';
import { AgentNetworkFilterSession } from '../../electron-main/networkFilterSession.js';

suite('AgentNetworkFilterSession lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('retries failed proxy setup after restoring routing without superseding policy updates', async () => {
		const results = [];
		for (const failureAt of ['proxy', 'close'] as const) {
			for (const updateDuringSetup of [false, true]) {
				const configuration = new TestConfigurationService();
				configuration.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
				configuration.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
				configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['127.0.0.1']);
				const filter = store.add(new AgentNetworkFilterService(configuration));
				const setupStarted = new DeferredPromise<void>();
				const setupFailed = new DeferredPromise<void>();
				const failure = new Error('test proxy setup failed');
				const routing: string[] = [];
				let failOnce = true;
				let installedProxy: string | undefined;
				const session = upcastPartial<Electron.Session>({
					resolveHost: async () => ({ endpoints: [{ address: '127.0.0.2', family: 'ipv4' }] }),
					setProxy: async config => {
						routing.push(config.proxyRules ? 'proxy' : 'system');
						if (failOnce && failureAt === 'proxy' && config.proxyRules) {
							failOnce = false;
							setupStarted.complete();
							await setupFailed.p;
							throw failure;
						}
						installedProxy = config.proxyRules ?? config.mode;
					},
					closeAllConnections: async () => {
						routing.push('close');
						if (failOnce && failureAt === 'close') {
							failOnce = false;
							setupStarted.complete();
							await setupFailed.p;
							throw failure;
						}
					},
				});
				const guard = store.add(new AgentNetworkFilterSession(session, { resolveProxy: async () => 'DIRECT' }, filter, store.add(new NullLogService())));
				const uri = URI.parse('http://allowed.example/');
				const rejected = assert.rejects(guard.checkRequest(uri), /test proxy setup failed/);
				await setupStarted.p;
				if (updateDuringSetup) {
					configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['127.0.0.1', '127.0.0.3']);
					configuration.onDidChangeConfigurationEmitter.fire({
						source: ConfigurationTarget.USER,
						affectedKeys: new Set([AgentNetworkDomainSettingId.DeniedNetworkDomains]),
						change: { keys: [AgentNetworkDomainSettingId.DeniedNetworkDomains], overrides: [] },
						affectsConfiguration: key => key === AgentNetworkDomainSettingId.DeniedNetworkDomains,
					});
				}
				setupFailed.complete();
				await rejected;
				const retried = await guard.checkRequest(uri).then(() => true, error => {
					if (error !== failure) {
						throw error;
					}
					return false;
				});
				results.push({
					failureAt, updateDuringSetup, retried,
					routing: [...routing],
					requestUsesGuard: !!guard.proxy && installedProxy === guard.proxy.url,
				});
				guard.dispose();
			}
		}
		assert.deepStrictEqual(results, [
			{ failureAt: 'proxy', updateDuringSetup: false, retried: true, routing: ['proxy', 'close', 'system', 'proxy', 'close'], requestUsesGuard: true },
			{ failureAt: 'proxy', updateDuringSetup: true, retried: true, routing: ['proxy', 'close', 'system', 'proxy', 'close'], requestUsesGuard: true },
			{ failureAt: 'close', updateDuringSetup: false, retried: true, routing: ['proxy', 'close', 'close', 'system', 'proxy', 'close'], requestUsesGuard: true },
			{ failureAt: 'close', updateDuringSetup: true, retried: true, routing: ['proxy', 'close', 'close', 'system', 'proxy', 'close'], requestUsesGuard: true },
		]);
	});

	test('waits for the previous guard to restore routing before validating another request', async () => {
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['127.0.0.1']);
		const filter = store.add(new AgentNetworkFilterService(configuration));
		const log = store.add(new NullLogService());
		const restoreStarted = new DeferredPromise<void>();
		const restoreAllowed = new DeferredPromise<void>();
		let holdRestore = false;
		let appliedProxy: string | undefined;
		const session = upcastPartial<Electron.Session>({
			resolveHost: async () => ({ endpoints: [{ address: '127.0.0.2', family: 'ipv4' }] }),
			closeAllConnections: async () => { },
			setProxy: async config => {
				if (config.mode === 'system' && holdRestore) {
					restoreStarted.complete();
					await restoreAllowed.p;
				}
				appliedProxy = config.proxyRules ?? config.mode;
			},
		});
		const uri = URI.parse('http://allowed.example/');
		const previous = store.add(new AgentNetworkFilterSession(session, { resolveProxy: async () => 'DIRECT' }, filter, log));
		await previous.checkRequest(uri);
		holdRestore = true;
		previous.dispose();
		await restoreStarted.p;

		let resolutions = 0;
		const replacement = store.add(new AgentNetworkFilterSession(session, {
			resolveProxy: async () => { resolutions++; return 'DIRECT'; },
		}, filter, log));
		const request = replacement.checkRequest(uri);
		await Promise.resolve();
		const resolutionsBeforeRestore = resolutions;
		holdRestore = false;
		restoreAllowed.complete();
		await request;

		assert.deepStrictEqual({
			resolutionsBeforeRestore,
			requestUsesGuard: !!replacement.proxy && appliedProxy === replacement.proxy.url,
		}, {
			resolutionsBeforeRestore: 0,
			requestUsesGuard: true,
		});
	});
});
