/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentNetworkFilterService } from '../../common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../common/settings.js';
import { AgentNetworkFilterSession } from '../../electron-main/networkFilterSession.js';

suite('AgentNetworkFilterSession policy refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('closes direct connections when the first IP deny rule becomes active', async () => {
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['blocked.example']);
		const filter = store.add(new AgentNetworkFilterService(configuration));
		let responseOpen = true;
		let connectionClosures = 0;
		let proxyChanges = 0;
		const session = upcastPartial<Electron.Session>({
			resolveHost: async () => ({ endpoints: [{ address: '127.0.0.2', family: 'ipv4' }] }),
			setProxy: async () => { proxyChanges++; },
			closeAllConnections: async () => {
				connectionClosures++;
				responseOpen = false;
			},
		});
		const guard = store.add(new AgentNetworkFilterSession(session, { resolveProxy: async () => 'DIRECT' }, filter, store.add(new NullLogService())));
		const update = (denied: string[]) => {
			configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, denied);
			configuration.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([AgentNetworkDomainSettingId.DeniedNetworkDomains]),
				change: { keys: [AgentNetworkDomainSettingId.DeniedNetworkDomains], overrides: [] },
				affectsConfiguration: key => key === AgentNetworkDomainSettingId.DeniedNetworkDomains,
			});
		};
		update(['another-blocked.example']);
		await guard.checkRequest(URI.parse('http://allowed.example/'));
		const hostnameOnly = { responseOpen, connectionClosures, proxyChanges };

		update(['another-blocked.example', '127.0.0.1']);
		await assert.rejects(guard.checkRequest(URI.parse('http://127.0.0.1/')), /blocked by network domain policy/);
		assert.deepStrictEqual({
			hostnameOnly,
			addressRestricted: { responseOpen, connectionClosures, proxyChanges },
		}, {
			hostnameOnly: { responseOpen: true, connectionClosures: 0, proxyChanges: 0 },
			addressRestricted: { responseOpen: false, connectionClosures: 1, proxyChanges: 0 },
		});
	});

	test('cancels stale resolutions without poisoning requests under the updated policy', async () => {
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['127.0.0.1']);
		const filter = store.add(new AgentNetworkFilterService(configuration));
		const lookupStarted = new DeferredPromise<void>();
		const firstLookup = new DeferredPromise<Electron.ResolvedHost>();
		let installedProxy: string | undefined;
		const session = upcastPartial<Electron.Session>({
			resolveHost: async host => {
				if (host === 'slow.example') {
					lookupStarted.complete();
					return firstLookup.p;
				}
				return { endpoints: [{ address: '127.0.0.2', family: 'ipv4' }] };
			},
			setProxy: async config => { installedProxy = config.proxyRules; },
			closeAllConnections: async () => { },
		});
		const guard = store.add(new AgentNetworkFilterSession(session, { resolveProxy: async () => 'DIRECT' }, filter, store.add(new NullLogService())));
		const previous = guard.checkRequest(URI.parse('http://slow.example/'));
		await lookupStarted.p;
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['127.0.0.1', '127.0.0.3']);
		configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([AgentNetworkDomainSettingId.DeniedNetworkDomains]),
			change: { keys: [AgentNetworkDomainSettingId.DeniedNetworkDomains], overrides: [] },
			affectsConfiguration: key => key === AgentNetworkDomainSettingId.DeniedNetworkDomains,
		});
		firstLookup.complete({ endpoints: [{ address: '127.0.0.2', family: 'ipv4' }] });
		await assert.rejects(previous, CancellationError);
		const allowed = await guard.checkRequest(URI.parse('http://allowed.example/')).then(() => true, error => {
			if (error instanceof CancellationError) {
				return false;
			}
			throw error;
		});
		assert.deepStrictEqual({ allowed, hasProxy: installedProxy !== undefined }, { allowed: true, hasProxy: true });
	});
});
