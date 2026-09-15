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

	async function createService(): Promise<AgentNetworkFilterService> {
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

	test('allows all domains when filter is disabled, regardless of configured lists', async () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, false);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['blocked.com']);

		const service = await createService();

		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://anything.test')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://blocked.com')), true);
	});

	test('denies all domains when both lists are empty', async () => {
		const service = await createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), false);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://anything.test')), false);
	});

	test('blocks denied domains', async () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['evil.com']);
		const service = await createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://evil.com')), false);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://good.com')), true);
	});

	test('restricts to allowed domains', async () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		const service = await createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://other.com')), false);
	});

	test('denied takes precedence over allowed', async () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*.com']);
		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['evil.com']);
		const service = await createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://safe.com')), true);
		assert.strictEqual(service.isUriAllowed(URI.parse('https://evil.com')), false);
	});

	suite('isUriAllowed', () => {

		test('allows file URIs', async () => {
			const service = await createService();
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*']);
			assert.strictEqual(service.isUriAllowed(URI.file('/tmp/test.txt')), true);
		});

		test('allows URIs without authority', async () => {
			const service = await createService();
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['*']);
			assert.strictEqual(service.isUriAllowed(URI.from({ scheme: 'untitled', path: 'Untitled-1' })), true);
		});

		test('fails closed for reported HTTP(S) parser-differential URLs with empty authorities', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*']);
			const service = await createService();
			const urls = [
				String.raw`http:\\\\evil.example/x`,
				String.raw`http:/\\/\\evil.example/x`,
				String.raw`http:\\/evil.example/x`,
				String.raw`http:\\evil.example/x`,
				String.raw`https:\\evil.example/x`,
			];

			assert.deepStrictEqual(urls.map(url => {
				const uri = URI.parse(url);
				return {
					scheme: uri.scheme,
					authority: uri.authority,
					allowed: service.isUriAllowed(uri),
				};
			}), [
				{ scheme: 'http', authority: '', allowed: false },
				{ scheme: 'http', authority: '', allowed: false },
				{ scheme: 'http', authority: '', allowed: false },
				{ scheme: 'http', authority: '', allowed: false },
				{ scheme: 'https', authority: '', allowed: false },
			]);
		});

		test('fails closed for WebSocket parser-differential URLs with empty authorities', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*']);
			const service = await createService();
			const urls = [
				String.raw`ws:\\evil.example/socket`,
				String.raw`wss:\evil.example/socket`,
			];

			assert.deepStrictEqual(urls.map(url => {
				const uri = URI.parse(url);
				return {
					scheme: uri.scheme,
					authority: uri.authority,
					allowed: service.isUriAllowed(uri),
				};
			}), [
				{ scheme: 'ws', authority: '', allowed: false },
				{ scheme: 'wss', authority: '', allowed: false },
			]);
		});

		test('checks domain for http/https URIs', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
			const service = await createService();
			assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com/page')), true);
			assert.strictEqual(service.isUriAllowed(URI.parse('https://other.com/page')), false);
		});

		test('allows explicitly configured local hosts', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['localhost', '*.localhost', '127.0.0.1', '0.0.0.0', '::1']);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://localhost:3000')),
				service.isUriAllowed(URI.parse('http://sub.localhost:3000')),
				service.isUriAllowed(URI.parse('http://127.0.0.1:3000')),
				service.isUriAllowed(URI.parse('http://0.0.0.0:3000')),
				service.isUriAllowed(URI.parse('http://[::1]:3000')),
				service.isUriAllowed(URI.parse('http://other.internal:3000')),
			], [
				true,
				true,
				true,
				true,
				true,
				false,
			]);
		});

		test('blocks parser-differential authorities denied by policy', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['github.com']);
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'127.0.0.1',
				'169.254.169.254',
				'evil.com',
				'*.evil.com',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://127.0.0.1:8931/control')),
				service.isUriAllowed(URI.parse('http://a@b@127.0.0.1:8931/private')),
				service.isUriAllowed(URI.parse('http://a%40b@127.0.0.1:8931/private')),
				service.isUriAllowed(URI.parse('http://[::1]:8931/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:169.254.169.254]/private')),
				service.isUriAllowed(URI.parse('https://attacker.evil.com/private')),
			], [
				false,
				false,
				false,
				false,
				false,
				false,
			]);
		});

		test('blocks alternative IPv4 forms denied by policy', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'127.1',
				'0300.0250.01.01',
				'0xa9fea9fe',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://127.0.0.1/private')),
				service.isUriAllowed(URI.parse('http://192.168.1.1/private')),
				service.isUriAllowed(URI.parse('http://169.254.169.254/private')),
			], [
				false,
				false,
				false,
			]);
		});

		test('blocks IPv4-mapped IPv6 literals in a deny-only configuration', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'127.0.0.1',
				'169.254.169.254',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://[::ffff:127.0.0.1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:7f00:1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:169.254.169.254]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:a9fe:a9fe]/private')),
			], [
				false,
				false,
				false,
				false,
			]);
		});

		test('blocks bare administrator deny patterns outside well-known public suffixes', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'evil.xyz',
				'evil.co.uk',
				'evil.ru',
				'evil.app',
				'evil.cn',
				'evil.info',
				'evil.biz',
				'evil.de',
				'evil.jp',
				'evil.site',
				'evil.zip',
				'metadata.internal',
				'host.local',
				'db.corp',
				'srv.lan',
				'169.254.169.254',
				'10.0.0.5',
				'127.0.0.1',
				'192.168.1.1',
				'localhost',
				'metadata',
				'metadata.google.internal',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('https://evil.xyz/private')),
				service.isUriAllowed(URI.parse('https://evil.co.uk/private')),
				service.isUriAllowed(URI.parse('https://evil.ru/private')),
				service.isUriAllowed(URI.parse('https://evil.app/private')),
				service.isUriAllowed(URI.parse('https://evil.cn/private')),
				service.isUriAllowed(URI.parse('https://evil.info/private')),
				service.isUriAllowed(URI.parse('https://evil.biz/private')),
				service.isUriAllowed(URI.parse('https://evil.de/private')),
				service.isUriAllowed(URI.parse('https://evil.jp/private')),
				service.isUriAllowed(URI.parse('https://evil.site/private')),
				service.isUriAllowed(URI.parse('https://evil.zip/private')),
				service.isUriAllowed(URI.parse('https://metadata.internal/private')),
				service.isUriAllowed(URI.parse('https://host.local/private')),
				service.isUriAllowed(URI.parse('https://db.corp/private')),
				service.isUriAllowed(URI.parse('https://srv.lan/private')),
				service.isUriAllowed(URI.parse('http://169.254.169.254/private')),
				service.isUriAllowed(URI.parse('http://10.0.0.5/private')),
				service.isUriAllowed(URI.parse('http://127.0.0.1/private')),
				service.isUriAllowed(URI.parse('http://192.168.1.1/private')),
				service.isUriAllowed(URI.parse('http://localhost/private')),
				service.isUriAllowed(URI.parse('http://metadata/private')),
				service.isUriAllowed(URI.parse('https://metadata.google.internal/private')),
			], [
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
				false,
			]);
		});

		test('blocks wildcard administrator deny patterns outside well-known public suffixes', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'*.internal',
				'*.corp',
				'*.lan',
				'*.corp.local',
				'*.co.uk',
				'*.example.co.uk',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('https://service.internal/private')),
				service.isUriAllowed(URI.parse('https://service.corp/private')),
				service.isUriAllowed(URI.parse('https://service.lan/private')),
				service.isUriAllowed(URI.parse('https://service.corp.local/private')),
				service.isUriAllowed(URI.parse('https://service.co.uk/private')),
				service.isUriAllowed(URI.parse('https://service.example.co.uk/private')),
			], [
				false,
				false,
				false,
				false,
				false,
				false,
			]);
		});

		test('blocks mapped and compatible IPv6 forms of wildcard IPv4 deny patterns', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'*.127.1',
				'*.0300.0250.01.01',
				'*.0xa9fea9fe',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://[::ffff:127.0.0.1]/private')),
				service.isUriAllowed(URI.parse('http://[::127.0.0.1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:192.168.1.1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:169.254.169.254]/private')),
				service.isUriAllowed(URI.parse('http://[::1]/allowed')),
			], [
				false,
				false,
				false,
				false,
				true,
			]);
		});

		test('blocks percent-encoded path separators in denied authorities', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['evil.com']);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('https://evil.com/x')),
				service.isUriAllowed(URI.parse('https://evil.com%2fx/')),
				service.isUriAllowed(URI.parse('https://evil.com%5c/')),
			], [
				false,
				false,
				false,
			]);
		});

		test('denies IPv6 literals when both domain lists are empty', async () => {
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://[::1]:3000/private')),
				service.isUriAllowed(URI.parse('http://[0:0:0:0:0:0:0:1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:127.0.0.1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:7f00:1]/private')),
				service.isUriAllowed(URI.parse('https://[2001:db8::1]/private')),
				service.isUriAllowed(URI.parse('https://[fe80::1]/private')),
			], [
				false,
				false,
				false,
				false,
				false,
				false,
			]);
		});

		test('does not allow IPv6 literals through a DNS-only allowlist', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['github.com']);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('https://github.com')),
				service.isUriAllowed(URI.parse('https://[2001:db8::1]')),
				service.isUriAllowed(URI.parse('http://[::ffff:127.0.0.1]')),
			], [
				true,
				false,
				false,
			]);
		});

		test('matches explicit IPv6 allow and deny patterns', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['[::1]', '[2001:db8::1]']);
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['[0:0:0:0:0:0:0:1]']);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://[::1]')),
				service.isUriAllowed(URI.parse('https://[2001:0db8:0:0:0:0:0:1]')),
				service.isUriAllowed(URI.parse('http://[::ffff:127.0.0.1]')),
			], [
				false,
				true,
				false,
			]);
		});

		test('blocks unbracketed IPv6 administrator deny patterns', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, [
				'::1',
				'0:0:0:0:0:0:0:1',
				'::ffff:127.0.0.1',
				'fe80::1',
			]);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.parse('http://[::1]/private')),
				service.isUriAllowed(URI.parse('http://[::ffff:127.0.0.1]/private')),
				service.isUriAllowed(URI.parse('http://[fe80::1]/private')),
			], [
				false,
				false,
				false,
			]);
		});

		test('fails closed for malformed non-empty HTTP authorities', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*']);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.from({ scheme: 'http', authority: '[::1', path: '/' })),
				service.isUriAllowed(URI.from({ scheme: 'https', authority: '::1]', path: '/' })),
				service.isUriAllowed(URI.from({ scheme: 'http', authority: '[::1]extra', path: '/' })),
				service.isUriAllowed(URI.from({ scheme: 'http', authority: '[fe80::1%25eth0]', path: '/' })),
				service.isUriAllowed(URI.from({ scheme: 'HTTP', authority: '[::1', path: '/' })),
				service.isUriAllowed(URI.parse('Https://allowed.com%2F@evil.com/private')),
			], [
				false,
				false,
				false,
				false,
				false,
				false,
			]);
		});

		test('fails closed for malformed non-empty WebSocket authorities', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['*']);
			const service = await createService();
			assert.deepStrictEqual([
				service.isUriAllowed(URI.from({ scheme: 'ws', authority: '[::1', path: '/' })),
				service.isUriAllowed(URI.from({ scheme: 'wss', authority: '::1]', path: '/' })),
				service.isUriAllowed(URI.from({ scheme: 'WS', authority: '[::1]extra', path: '/' })),
			], [
				false,
				false,
				false,
			]);
		});

		test('rejects URL authorities whose decoded representation changes the host', async () => {
			configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['allowed.com']);
			const service = await createService();
			assert.strictEqual(
				service.isUriAllowed(URI.parse('http://169.254.169.254%40allowed.com/private')),
				false
			);
		});
	});

	test('fires onDidChange when configuration changes', async () => {
		const service = await createService();
		let fired = false;
		disposables.add(service.onDidChange(() => { fired = true; }));

		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		fireConfigChange(AgentNetworkDomainSettingId.AllowedNetworkDomains);

		assert.strictEqual(fired, true);
	});

	test('updates filtering after configuration change', async () => {
		configService.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, ['example.com']);
		const service = await createService();
		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), true);

		configService.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['example.com']);
		fireConfigChange(AgentNetworkDomainSettingId.DeniedNetworkDomains);

		assert.strictEqual(service.isUriAllowed(URI.parse('https://example.com')), false);
	});

});
