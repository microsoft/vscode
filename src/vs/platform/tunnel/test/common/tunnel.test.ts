/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import {
	AbstractTunnelService,
	extractLocalHostUriMetaDataForPortMapping,
	extractQueryLocalHostUriMetaDataForPortMapping,
	isTunnelProvider,
	ITunnelProvider,
	RemoteTunnel,
	TunnelPrivacyId
} from '../../common/tunnel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IAddressProvider } from '../../../remote/common/remoteAgentConnection.js';


suite('Tunnel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function portMappingDoTest(uri: string,
		func: (uri: URI) => { address: string; port: number } | undefined,
		expectedAddress?: string,
		expectedPort?: number) {
		const res = func(URI.parse(uri));
		assert.strictEqual(!expectedAddress, !res);
		assert.strictEqual(res?.address, expectedAddress);
		assert.strictEqual(res?.port, expectedPort);
	}

	function portMappingTest(uri: string, expectedAddress?: string, expectedPort?: number) {
		portMappingDoTest(uri, extractLocalHostUriMetaDataForPortMapping, expectedAddress, expectedPort);
	}

	function portMappingTestQuery(uri: string, expectedAddress?: string, expectedPort?: number) {
		portMappingDoTest(uri, extractQueryLocalHostUriMetaDataForPortMapping, expectedAddress, expectedPort);
	}

	test('portMapping', () => {
		portMappingTest('file:///foo.bar/baz');
		portMappingTest('http://foo.bar:1234');
		portMappingTest('http://localhost:8080', 'localhost', 8080);
		portMappingTest('https://localhost:443', 'localhost', 443);
		portMappingTest('http://127.0.0.1:3456', '127.0.0.1', 3456);
		portMappingTest('http://0.0.0.0:7654', '0.0.0.0', 7654);
		portMappingTest('http://localhost:8080/path?foo=bar', 'localhost', 8080);
		portMappingTest('http://localhost:8080/path?foo=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8080);
		portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8081);
		portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Flocalhost%3A8081&url2=http%3A%2F%2Flocalhost%3A8082', 'localhost', 8081);
		portMappingTestQuery('http://foo.bar/path?url=http%3A%2F%2Fmicrosoft.com%2Fbad&url2=http%3A%2F%2Flocalhost%3A8081', 'localhost', 8081);
	});

	class TestTunnelService extends AbstractTunnelService {
		readonly creations: Promise<RemoteTunnel | string | undefined>[] = [];

		isPortPrivileged(): boolean {
			return false;
		}

		protected retainOrCreateTunnel(addressOrTunnelProvider: IAddressProvider | ITunnelProvider, remoteHost: string, remotePort: number, _localHost: string, localPort: number | undefined, elevateIfNeeded: boolean, privacy?: string, protocol?: string): Promise<RemoteTunnel | string | undefined> | undefined {
			const existing = this.getTunnelFromMap(remoteHost, remotePort);
			if (existing) {
				++existing.refcount;
				return existing.value;
			}
			if (isTunnelProvider(addressOrTunnelProvider)) {
				return this.createWithProvider(addressOrTunnelProvider, remoteHost, remotePort, localPort, elevateIfNeeded, privacy, protocol);
			}
			return this.addTunnelToMap(remoteHost, remotePort, this.creations.shift()!);
		}
	}

	function createTunnelService(): TestTunnelService {
		const configurationService = new TestConfigurationService();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		return store.add(new TestTunnelService(new NullLogService(), configurationService));
	}

	const addressProvider: IAddressProvider = { getAddress: () => Promise.reject(new Error('Not used')) };

	test('reports a tunnel that fails to be created to everything waiting for it and lets the port be forwarded again', async () => {
		const service = createTunnelService();
		const creation = new DeferredPromise<RemoteTunnel | string | undefined>();
		const tunnel: RemoteTunnel = { tunnelRemoteHost: '127.0.0.1', tunnelRemotePort: 3000, localAddress: 'localhost:3000', privacy: TunnelPrivacyId.Private, dispose: async () => { } };
		service.creations.push(creation.p, Promise.resolve(tunnel));

		const failed = service.openTunnel(addressProvider, 'localhost', 3000);
		// Waits for the same tunnel through another address of the same host.
		const joined = service.openTunnel(addressProvider, '127.0.0.1', 3000);
		const retried = Promise.resolve(joined).then(() => service.openTunnel(addressProvider, '127.0.0.1', 3000));
		const existing = service.getExistingTunnel('localhost', 3000);
		const tunnels = service.tunnels;
		creation.error(new Error('listen EADDRINUSE'));
		const actual = { failed: await failed, joined: await joined, existing: await existing, tunnels: await tunnels, retried: await retried };
		await service.closeTunnel('127.0.0.1', 3000);

		assert.deepStrictEqual({ ...actual, retried: typeof actual.retried === 'object' ? actual.retried.localAddress : actual.retried }, {
			failed: 'listen EADDRINUSE',
			joined: 'listen EADDRINUSE',
			existing: 'listen EADDRINUSE',
			tunnels: [],
			retried: 'localhost:3000'
		});
	});

	test('closes a tunnel that the tunnel provider fails to create', async () => {
		const service = createTunnelService();
		const creation = new DeferredPromise<RemoteTunnel | string | undefined>();
		store.add(service.setTunnelProvider({ forwardPort: () => creation.p }));

		const failed = service.openTunnel(addressProvider, 'localhost', 3000);
		const closed = service.closeTunnel('localhost', 3000);
		creation.error(new Error('Port forwarding is not available'));

		assert.deepStrictEqual({ failed: await failed, closed: await closed }, { failed: 'Port forwarding is not available', closed: undefined });
	});
});
