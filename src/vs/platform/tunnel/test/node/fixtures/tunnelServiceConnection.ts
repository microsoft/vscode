/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { once } from 'events';
import * as net from 'net';
import { raceTimeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { PersistentProtocol } from '../../../../../base/parts/ipc/common/ipc.net.js';
import { NodeSocket } from '../../../../../base/parts/ipc/node/ipc.net.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../log/common/log.js';
import { IProductService } from '../../../../product/common/productService.js';
import { ConnectionType, HandshakeMessage } from '../../../../remote/common/remoteAgentConnection.js';
import { RemoteConnectionType, WebSocketRemoteConnection } from '../../../../remote/common/remoteAuthorityResolver.js';
import { RemoteSocketFactoryService } from '../../../../remote/common/remoteSocketFactoryService.js';
import { TunnelService } from '../../../node/tunnelService.js';

const count = Number(process.argv[2]);
const disconnectFirst = process.argv[3] === 'true';
assert.ok(count === 1 || count === 2);
const store = new DisposableStore();
try {
	const server = net.createServer(socket => {
		const peer = store.add(new PersistentProtocol({ socket: store.add(new NodeSocket(socket)), sendKeepAlive: false }));
		store.add(peer.onControlMessage(raw => {
			const message: HandshakeMessage = JSON.parse(raw.toString());
			if (message.type === 'auth') {
				peer.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'sign', data: 'test', signedData: 'test' })));
			} else if (message.type === 'connectionType') {
				assert.strictEqual(message.desiredConnectionType, ConnectionType.Tunnel);
				peer.sendControl(VSBuffer.fromString(JSON.stringify({ type: 'ok' })));
				peer.dispose();
				socket.pipe(socket);
			}
		}));
	});
	store.add(toDisposable(() => server.close()));
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	assert.ok(address && typeof address !== 'string');

	const remoteSocketFactoryService = new RemoteSocketFactoryService();
	store.add(remoteSocketFactoryService.register(RemoteConnectionType.WebSocket, {
		supports: () => true,
		connect: async () => {
			const socket = store.add(new NodeSocket(net.createConnection({ host: '127.0.0.1', port: address.port })));
			await once(socket.socket, 'connect');
			return socket;
		}
	}));
	const configurationService = new TestConfigurationService();
	store.add(configurationService.onDidChangeConfigurationEmitter);
	const service = store.add(new TunnelService(remoteSocketFactoryService, store.add(new NullLogService()), {
		_serviceBrand: undefined,
		createNewMessage: async value => ({ id: 'test', data: value }),
		validate: async () => true,
		sign: async value => value
	}, new class extends mock<IProductService>() { }(), configurationService));
	const tunnel = await service.openTunnel({
		getAddress: async () => ({ connectTo: new WebSocketRemoteConnection('127.0.0.1', address.port), connectionToken: undefined })
	}, '127.0.0.1', address.port, '127.0.0.1', 0);
	assert.ok(tunnel && typeof tunnel !== 'string');
	assert.ok(tunnel.tunnelLocalPort);

	const clients: net.Socket[] = [];
	for (let i = 0; i < count; i++) {
		const client: net.Socket = net.createConnection({ host: '127.0.0.1', port: tunnel.tunnelLocalPort });
		store.add(toDisposable(() => client.destroy()));
		const response: Promise<Buffer[]> = once(client, 'data');
		client.write('ready');
		assert.strictEqual((await response)[0].toString(), 'ready');
		clients.push(client);
	}

	if (disconnectFirst) {
		const first = clients.shift()!;
		const firstClosed = once(first, 'close');
		first.end();
		await firstClosed;
	}
	const closed = Promise.all(clients.map(client => once(client, 'close')));
	await service.closeTunnel('127.0.0.1', address.port);
	await raceTimeout(closed, 1000);
	process.send?.(clients.map(client => client.destroyed));
} finally {
	store.dispose();
}
