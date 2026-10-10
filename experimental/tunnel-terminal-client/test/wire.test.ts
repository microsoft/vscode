/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { once } from 'node:events';
import { RelayConnectionError, RelayErrorType, TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import { TunnelConnectionMode, type TunnelRelayTunnelEndpoint } from '@microsoft/dev-tunnels-contracts';
import { hasAgentHostPort, parseMachine, relayConnectionFailure, selectHost } from '../src/tunnel.js';
import { deadline } from '../src/wire.js';
import { messages, peer, reply, rpc } from './helpers.js';

test('tunnel descriptors preserve offline and incompatible machines', () => {
	assert.deepEqual([
		parseMachine({ tunnelId: 'one', clusterId: 'eu', labels: ['vscode-server-launcher', '_flag1', 'box', 'protocolv6'], status: { hostConnectionCount: { current: 1 } } }),
		parseMachine({ tunnelId: 'two', clusterId: 'us', name: 'older' }),
	], [
		{ id: 'one', cluster: 'eu', name: 'box', protocolVersion: 6, online: true },
		{ id: 'two', cluster: 'us', name: 'older', protocolVersion: 2, online: false },
	]);
});

test('agent-host port detection uses retrieved tunnel port metadata', () => {
	assert.deepEqual([
		hasAgentHostPort({ ports: [{ portNumber: 31546 }] }),
		hasAgentHostPort({ ports: [{ portNumber: 8000 }] }),
		hasAgentHostPort({}),
	], [true, false, false]);
});

test('relay failures preserve unknown SDK reasons instead of assuming an account mismatch', () => {
	assert.deepEqual([
		relayConnectionFailure(new Error('No hosts are currently accepting connections for the tunnel.')),
		relayConnectionFailure(new Error('There are multiple hosts for the tunnel. Specify a host ID to connect to.')),
		relayConnectionFailure(new Error('Request failed with status code 403 and secret details')),
		relayConnectionFailure(new Error('Unsupported key exchange algorithm')),
	], [
		'The tunnel has no active remote host. Restart the remote tunnel/agent-host command and keep it running.',
		'The tunnel has multiple active relay hosts, which this prototype cannot disambiguate yet. Stop stale tunnel processes and leave only the intended remote host running.',
		'The tunnel relay rejected the connection (HTTP 403). Discovery succeeded, but relay authorization did not. Check tunnel connect permissions and organization access policies; this does not by itself establish an account mismatch.',
		`Unable to connect to the tunnel relay. SDK reason: Unsupported key exchange algorithm (Node ${process.version}).`,
	]);
});

test('relay diagnostics use the SDK structured status even when its message contains no HTTP prefix', () => {
	assert.match(relayConnectionFailure(new RelayConnectionError('Forbidden (403). Provide a fresh tunnel access token.', {
		errorType: RelayErrorType.Unauthorized, statusCode: 403,
	})), /HTTP 403/);
	assert.match(relayConnectionFailure(new Error('Not authorized (401).')), /HTTP 401/);
});

test('relay diagnostics identify TLS, DNS, and timeout failures', () => {
	assert.match(relayConnectionFailure(new Error('error.relayConnectionError unable to verify the first certificate')), /TLS certificate validation failed/);
	assert.match(relayConnectionFailure(new Error('getaddrinfo ENOTFOUND relay.example.test')), /DNS lookup failed/);
	assert.match(relayConnectionFailure(new Error('Tunnel relay connection timed out.')), /connection timed out/);
});

test('relay diagnostics redact known credentials and recognizable tokens before truncation', () => {
	const result = relayConnectionFailure(new Error(
		'ECONNRESET opaque-secret refreshed-secret %2Bencoded%2Fsecret '
		+ 'https://relay.example.test/path?tkn=query-secret '
		+ 'gho_unknownsecret github_pat_unknownsecret eyJheader.eyJpayload.signature '
		+ 'password=another-secret tkn="quoted secret"\n'
		+ 'Authorization: tunnel header-secret\n'
		+ '\x1b[31mconnection closed\x1b[0m',
	), ['opaque-secret', 'refreshed-secret', '+encoded/secret']);
	assert.match(result, /ECONNRESET.*connection closed/);
	assert.doesNotMatch(result, /opaque-secret|refreshed-secret|encoded|relay\.example|query-secret|unknownsecret|eyJ|another-secret|quoted secret|header-secret|\x1b/);
	assert.ok(relayConnectionFailure(new Error('x'.repeat(5000))).length < 1400);
});

test('a real SDK relay handshake rejection retains its HTTP status', { timeout: 5000 }, async t => {
	const server = createServer();
	server.on('upgrade', (_request, socket) => {
		socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
	});
	t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	if (!address || typeof address === 'string') {
		throw new Error('Test relay did not publish an address.');
	}
	const endpoint: TunnelRelayTunnelEndpoint = {
		hostId: 'test-host',
		connectionMode: TunnelConnectionMode.TunnelRelay,
		clientRelayUri: `ws://127.0.0.1:${address.port}`,
	};
	const relay = new TunnelRelayTunnelClient();
	t.after(() => relay.dispose());
	relay.acceptLocalConnectionsForForwardedPorts = false;
	await assert.rejects(relay.connect({
		tunnelId: 'test-tunnel',
		clusterId: 'test-cluster',
		endpoints: [endpoint],
		accessTokens: { connect: 'test-connect-token' },
	}, { enableRetry: false, enableReconnect: false }), (error: Error) => {
		assert.match(relayConnectionFailure(error, ['test-connect-token']), /HTTP 403/);
		return true;
	});
});

test('gateway buffers an immediate inventory and validates host selection', async t => {
	const connection = await peer(t, socket => {
		socket.send(JSON.stringify({ userDataPath: 'test', endpoints: [{ type: 'editor', pid: 42, instanceId: 'editor-1' }] }));
		socket.once('message', data => {
			assert.deepEqual(JSON.parse(data.toString()), { instanceId: 'editor-1' });
			socket.send(JSON.stringify({ ok: true, selected: { type: 'editor', instanceId: 'editor-1', role: 'primary', lifecycle: 'external' } }));
		});
	});
	await selectHost(connection, async (hosts, canCreate) => {
		assert.deepEqual({ hosts, canCreate }, { hosts: [{ type: 'editor', pid: 42, instanceId: 'editor-1' }], canCreate: true });
		return { instanceId: hosts[0].instanceId };
	}, new AbortController().signal);
});

test('gateway rejects spawning on a delegated tunnel', async t => {
	const connection = await peer(t, socket => {
		socket.send(JSON.stringify({ endpoints: [], delegatedInstanceId: 'editor-1' }));
	});
	await assert.rejects(selectHost(connection, async () => ({ newDedicated: true }), new AbortController().signal), /cannot create/);
});

test('gateway surfaces selection rejection', async t => {
	const connection = await peer(t, socket => {
		socket.send(JSON.stringify({ endpoints: [] }));
		socket.once('message', () => socket.send(JSON.stringify({ ok: false, error: 'Host unavailable' })));
	});
	await assert.rejects(selectHost(connection, async () => ({ newDedicated: true }), new AbortController().signal), /Host unavailable/);
});

test('gateway cannot silently substitute a different selected host', async t => {
	const connection = await peer(t, socket => {
		socket.send(JSON.stringify({ endpoints: [{ type: 'editor', pid: 42, instanceId: 'expected' }] }));
		socket.once('message', () => socket.send(JSON.stringify({
			ok: true, selected: { type: 'editor', instanceId: 'different', role: 'primary', lifecycle: 'external' },
		})));
	});
	await assert.rejects(selectHost(connection, async () => ({ instanceId: 'expected' }), new AbortController().signal), /different host/);
});

test('gateway rejects malformed inventory rather than starting another host', async t => {
	const connection = await peer(t, socket => socket.send(JSON.stringify({ endpoints: 'invalid' })));
	await assert.rejects(selectHost(connection, async () => {
		assert.fail('No picker should be shown for malformed inventory.');
	}, new AbortController().signal), /Malformed gateway inventory/);
});

test('RPC correlates responses, reports errors, and times out unanswered requests', async t => {
	const connection = await peer(t, socket => messages(socket, (message) => {
		if (message.method === 'ok') {
			reply(socket, message, { accepted: true });
		} else if (message.method === 'fail') {
			socket.send(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32005, message: 'Unsupported version' } }));
		}
	}));
	const client = rpc(t, connection);
	assert.deepEqual(await client.request('ok', {}), { accepted: true });
	await assert.rejects(client.request('fail', {}), /Unsupported version/);
	await assert.rejects(client.request('noResponse', {}, 20), /timed out/);
});

test('malformed frames fail visibly and terminate the connection', async t => {
	const connection = await peer(t, socket => socket.send('invalid-json'));
	await assert.rejects(connection.read(), /Malformed protocol JSON/);
});

test('closing the transport rejects pending RPCs', async t => {
	const connection = await peer(t, socket => socket.once('message', () => socket.close()));
	const client = rpc(t, connection);
	await assert.rejects(client.request('pending', {}), /disconnected/);
});

test('disposal removes WebSocket listeners', async t => {
	const connection = await peer(t, () => {});
	const closed = once(connection.socket, 'close');
	connection.dispose();
	await closed;
	assert.deepEqual(['message', 'error', 'pong', 'close'].map(event => connection.socket.listenerCount(event)), [0, 0, 0, 0]);
});

test('deadline honors cancellation and releases the wait', async () => {
	const controller = new AbortController();
	const pending = deadline(new Promise<void>(() => {}), 'operation', controller.signal);
	controller.abort();
	await assert.rejects(pending, /cancelled/);
});
