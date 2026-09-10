/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	parseTunnelGatewayInventory,
	parseTunnelGatewaySelectionResponse,
	isTunnelHosted,
	TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION,
	TUNNEL_GATEWAY_SELECT_PATH,
	TUNNEL_MIN_PROTOCOL_VERSION,
	TunnelGatewayProtocolError,
} from '../../common/tunnelAgentHost.js';

suite('tunnelAgentHost - gateway wire protocol', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('protocol version constants pin the wire format', () => {
		// A regression here silently breaks compatibility with the CLI's
		// PROTOCOL_VERSION / AGENT_HOST route constants (cli/src/constants.rs,
		// cli/src/tunnels/agent_host.rs) — pin the exact values.
		assert.strictEqual(TUNNEL_MIN_PROTOCOL_VERSION, 5);
		assert.strictEqual(TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION, 6);
		assert.ok(TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION > TUNNEL_MIN_PROTOCOL_VERSION, 'gateway selection requires a newer protocol than legacy direct connect');
		assert.strictEqual(TUNNEL_GATEWAY_SELECT_PATH, '/agent-host/select');
	});

	suite('parseTunnelGatewayInventory', () => {
		test('parses a well-formed inventory with editor and standalone endpoints', () => {
			const inventory = parseTunnelGatewayInventory(JSON.stringify({
				userDataPath: '/home/user/.vscode-server/data',
				delegatedInstanceId: 'editor-1',
				endpoints: [
					{ type: 'editor', pid: 111, instanceId: 'editor-1', quality: 'stable', endpointKind: 'socket', endpointLabel: '/tmp/editor-1.sock' },
					{ type: 'standalone', pid: 222, instanceId: 'standalone-1', tunnelName: 'my-tunnel', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9001' },
				],
			}));
			assert.deepStrictEqual(inventory, {
				userDataPath: '/home/user/.vscode-server/data',
				delegatedInstanceId: 'editor-1',
				endpoints: [
					{ type: 'editor', pid: 111, instanceId: 'editor-1', quality: 'stable', tunnelName: undefined, endpointKind: 'socket', endpointLabel: '/tmp/editor-1.sock' },
					{ type: 'standalone', pid: 222, instanceId: 'standalone-1', quality: undefined, tunnelName: 'my-tunnel', endpointKind: 'tcp', endpointLabel: '127.0.0.1:9001' },
				],
			});
		});

		test('parses an empty endpoint list', () => {
			const inventory = parseTunnelGatewayInventory(JSON.stringify({ userDataPath: '/data', endpoints: [] }));
			assert.deepStrictEqual(inventory, { userDataPath: '/data', endpoints: [] });
		});

		test('never exposes a connection token, even if the gateway were to send one', () => {
			const inventory = parseTunnelGatewayInventory(JSON.stringify({
				userDataPath: '/data',
				endpoints: [{ type: 'editor', pid: 1, instanceId: 'e1', endpointKind: 'tcp', endpointLabel: '127.0.0.1:1', connectionToken: 'leaked-secret' }],
			}));
			// `connectionToken` isn't part of `ITunnelGatewayEndpoint` — assert
			// via an untyped view rather than the `in` operator, since `hasKey`
			// only narrows keys that are actually declared on the type.
			const endpoint = inventory.endpoints[0] as unknown as Record<string, unknown>;
			assert.strictEqual(endpoint.connectionToken, undefined);
		});

		for (const [name, json] of [
			['non-object payload', JSON.stringify('not an object')],
			['missing userDataPath', JSON.stringify({ endpoints: [] })],
			['empty userDataPath', JSON.stringify({ userDataPath: '', endpoints: [] })],
			['empty delegatedInstanceId', JSON.stringify({ userDataPath: '/data', delegatedInstanceId: '', endpoints: [] })],
			['non-string delegatedInstanceId', JSON.stringify({ userDataPath: '/data', delegatedInstanceId: 1, endpoints: [] })],
			['non-array endpoints', JSON.stringify({ userDataPath: '/data', endpoints: 'nope' })],
			['endpoint with invalid type', JSON.stringify({ userDataPath: '/data', endpoints: [{ type: 'bogus', pid: 1, instanceId: 'x', endpointKind: 'tcp', endpointLabel: 'l' }] })],
			['endpoint with non-numeric pid', JSON.stringify({ userDataPath: '/data', endpoints: [{ type: 'editor', pid: '1', instanceId: 'x', endpointKind: 'tcp', endpointLabel: 'l' }] })],
			['endpoint with empty instanceId', JSON.stringify({ userDataPath: '/data', endpoints: [{ type: 'editor', pid: 1, instanceId: '', endpointKind: 'tcp', endpointLabel: 'l' }] })],
			['endpoint with invalid endpointKind', JSON.stringify({ userDataPath: '/data', endpoints: [{ type: 'editor', pid: 1, instanceId: 'x', endpointKind: 'udp', endpointLabel: 'l' }] })],
			['endpoint with empty endpointLabel', JSON.stringify({ userDataPath: '/data', endpoints: [{ type: 'editor', pid: 1, instanceId: 'x', endpointKind: 'tcp', endpointLabel: '' }] })],
		] as const) {
			test(`rejects malformed inventory: ${name}`, () => {
				assert.throws(() => parseTunnelGatewayInventory(json), TunnelGatewayProtocolError);
			});
		}
	});

	suite('parseTunnelGatewaySelectionResponse', () => {
		test('parses a successful acknowledgement for an existing editor endpoint', () => {
			const response = parseTunnelGatewaySelectionResponse(JSON.stringify({
				ok: true,
				selected: { type: 'editor', instanceId: 'editor-1', role: 'primary', lifecycle: 'external' },
			}));
			assert.deepStrictEqual(response, {
				ok: true,
				selected: { serverType: 'editor', instanceId: 'editor-1', role: 'primary', lifecycle: 'external' },
			});

			suite('isTunnelHosted', () => {
				test('matches the stable ID when tunnels share a display name and falls back to the name when it is unavailable', () => {
					const tunnel = {
						tunnelId: 'other-id',
						clusterId: 'cluster',
						name: 'shared-name',
						tags: [],
						protocolVersion: 6,
						hostConnectionCount: 1,
					};

					assert.deepStrictEqual([
						isTunnelHosted({ tunnelName: 'shared-name', tunnelId: 'hosted-id' }, tunnel),
						isTunnelHosted({ tunnelName: 'shared-name', tunnelId: 'other-id' }, tunnel),
						isTunnelHosted({ tunnelName: 'shared-name' }, tunnel),
					], [false, true, true]);
				});
			});
		});

		test('parses a successful acknowledgement for a newly spawned managed standalone', () => {
			const response = parseTunnelGatewaySelectionResponse(JSON.stringify({
				ok: true,
				selected: { type: 'standalone', instanceId: 'standalone-new', role: 'primary', lifecycle: 'managed' },
			}));
			assert.deepStrictEqual(response, {
				ok: true,
				selected: { serverType: 'standalone', instanceId: 'standalone-new', role: 'primary', lifecycle: 'managed' },
			});
		});

		test('parses a rejection with the server-provided error message', () => {
			const response = parseTunnelGatewaySelectionResponse(JSON.stringify({ ok: false, error: 'instance no longer live' }));
			assert.deepStrictEqual(response, { ok: false, error: 'instance no longer live' });
		});

		test('falls back to a generic error message when a rejection omits one', () => {
			const response = parseTunnelGatewaySelectionResponse(JSON.stringify({ ok: false }));
			assert.deepStrictEqual(response, { ok: false, error: 'Gateway selection failed' });
		});

		for (const [name, json] of [
			['non-object payload', JSON.stringify(42)],
			['missing ok', JSON.stringify({ selected: { type: 'editor', instanceId: 'x', role: 'primary', lifecycle: 'external' } })],
			['ok:true with missing selected', JSON.stringify({ ok: true })],
			['ok:true with invalid selected.type', JSON.stringify({ ok: true, selected: { type: 'bogus', instanceId: 'x', role: 'primary', lifecycle: 'external' } })],
			['ok:true with empty selected.instanceId', JSON.stringify({ ok: true, selected: { type: 'editor', instanceId: '', role: 'primary', lifecycle: 'external' } })],
			['ok:true with invalid selected.role', JSON.stringify({ ok: true, selected: { type: 'editor', instanceId: 'x', role: 'secondary', lifecycle: 'external' } })],
			['ok:true with invalid selected.lifecycle', JSON.stringify({ ok: true, selected: { type: 'editor', instanceId: 'x', role: 'primary', lifecycle: 'bogus' } })],
		] as const) {
			test(`rejects malformed selection acknowledgement: ${name}`, () => {
				assert.throws(() => parseTunnelGatewaySelectionResponse(json), TunnelGatewayProtocolError);
			});
		}
	});
});
