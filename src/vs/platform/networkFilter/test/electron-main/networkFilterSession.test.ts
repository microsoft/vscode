/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PassThrough } from 'stream';
import { connect } from 'tls';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentNetworkFilterService } from '../../common/networkFilterService.js';
import { AgentNetworkDomainSettingId } from '../../common/settings.js';
import { AgentNetworkFilterSession } from '../../electron-main/networkFilterSession.js';

suite('AgentNetworkFilterSession', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects unspecified connection destinations without redefining loopback policy', async () => {
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.NetworkFilter, true);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.AllowedNetworkDomains, []);
		configuration.setUserConfiguration(AgentNetworkDomainSettingId.DeniedNetworkDomains, ['127.0.0.1']);
		const filter = store.add(new AgentNetworkFilterService(configuration));
		const cases = [
			{ url: 'http://0:8971/prodpath-zero-short', address: '0.0.0.0', blocked: true },
			{ url: 'http://0.0.0.0:8971/?', address: '0.0.0.0', blocked: true },
			{ url: 'http://unspecified.example.test/', address: '0.0.0.0', blocked: true },
			{ url: 'http://unspecified-v6.example.test/', address: '::', blocked: true },
			{ url: 'http://mapped-unspecified.example.test/', address: '::ffff:0.0.0.0', blocked: true },
			{ url: 'http://allowed.example/', address: '127.0.0.2', blocked: false },
			{ url: 'http://ipv6-loopback.example.test/', address: '::1', blocked: false },
		];
		const results = [];
		for (const entry of cases) {
			const destinations: string[] = [];
			let proxyStarted = false;
			const guard = store.add(new AgentNetworkFilterSession(upcastPartial<Electron.Session>({
				resolveHost: async () => ({ endpoints: [{ address: entry.address, family: 'unspec' }] }),
				setProxy: async config => { proxyStarted ||= config.proxyRules !== undefined; },
				closeAllConnections: async () => { },
			}), {
				resolveProxy: async () => 'DIRECT',
				connect: async address => {
					destinations.push(address);
					const stream = new PassThrough();
					store.add(toDisposable(() => stream.destroy()));
					return { stream, leftover: VSBuffer.alloc(0) };
				},
			}, filter, store.add(new NullLogService())));
			const uri = URI.parse(entry.url);
			let blocked = false;
			try {
				await guard.checkRequest(uri);
			} catch (error) {
				if (!(error instanceof Error) || !/unspecified/i.test(error.message)) {
					throw error;
				}
				blocked = true;
			}
			if (!blocked) {
				const info = guard.proxy;
				assert.ok(info, 'An allowed address-restricted request must use the filtering proxy');
				const target = new URL(entry.url);
				const status = await new Promise<string>((resolve, reject) => {
					const socket = connect({ host: info.host, port: info.port, rejectUnauthorized: false }, () => {
						const authorization = Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString('base64');
						socket.write(`CONNECT ${target.hostname}:${target.port || 80} HTTP/1.1\r\nHost: ${target.host}\r\nProxy-Authorization: Basic ${authorization}\r\n\r\n`);
					});
					store.add(toDisposable(() => socket.destroy()));
					let response = '';
					socket.on('data', data => {
						response += data.toString();
						if (response.includes('\r\n\r\n')) {
							socket.destroy();
							resolve(response.split('\r\n')[0]);
						}
					});
					socket.on('error', reject);
					socket.setTimeout(3000, () => socket.destroy(new Error('Connection boundary test timed out')));
				});
				assert.strictEqual(status, 'HTTP/1.1 200 Connection Established');
			}
			results.push({ nameAllowed: filter.isUriAllowed(uri), blocked, proxyStarted, destinations });
			guard.dispose();
		}
		assert.deepStrictEqual(results, cases.map(entry => ({
			nameAllowed: true,
			blocked: entry.blocked,
			proxyStarted: !entry.blocked,
			destinations: entry.blocked ? [] : [entry.address],
		})));
	});
});
