/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AgentNetworkFilterService } from '../../common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../common/settings.js';

suite('AgentNetworkFilterService', () => {

	let disposables: DisposableStore;
	let configService: TestConfigurationService;

	setup(() => {
		disposables = new DisposableStore();
		configService = new TestConfigurationService();
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, []);
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): AgentNetworkFilterService {
		const service = new AgentNetworkFilterService(configService);
		disposables.add(service);
		return service;
	}

	function fireConfigChange(key: string): void {
		configService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: (k: string) => k === key,
		});
	}

	test('allows all domains when filter is disabled', () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, false);
		const service = createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://anything.test')), true);
	});

	test('denies all domains when both lists are empty', () => {
		const service = createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), false);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://anything.test')), false);
	});

	test('blocks denied domains', () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['evil.com']);
		const service = createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://evil.com')), false);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://good.com')), true);
	});

	test('restricts to allowed domains', () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		const service = createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://other.com')), false);
	});

	test('denied takes precedence over allowed', () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.com']);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['evil.com']);
		const service = createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://safe.com')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://evil.com')), false);
	});

	suite('isUriAllowed', () => {

		test('allows file URIs', () => {
			const service = createService();
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*']);
			assert.strictEqual(service.isUriAllowed(URI.file('/tmp/test.txt')), true);
		});

		test('allows URIs without authority', () => {
			const service = createService();
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*']);
			assert.strictEqual(service.isUriAllowed(URI.from({ scheme: 'untitled', path: 'Untitled-1' })), true);
		});

		test('checks domain for http/https URIs', () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
			const service = createService();
			assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com/page')), true);
			assert.strictEqual(service.isUriAllowed(URI.parse('https://other.com/page')), false);
		});
	});

	test('fires onDidChange when configuration changes', async () => {
		const service = createService();
		let fired = false;
		disposables.add(service.onDidChange(() => { fired = true; }));

		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		fireConfigChange(AgentNetworkDomainSettingId.AllowedNetworkDomains);

		assert.strictEqual(fired, true);
	});

	test('updates filtering after configuration change', async () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		const service = createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), true);

		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['example.com']);
		fireConfigChange(AgentNetworkDomainSettingId.DeniedNetworkDomains);

		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), false);
	});
});
