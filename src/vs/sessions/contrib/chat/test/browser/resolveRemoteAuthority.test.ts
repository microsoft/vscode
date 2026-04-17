/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { resolveRemoteAuthority, sshAuthorityString } from '../../browser/openInVSCodeUtils.js';
import { decodeHex } from '../../../../../base/common/buffer.js';

suite('resolveRemoteAuthority', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeProvidersService(remoteAddress?: string): ISessionsProvidersService {
		return {
			getProvider: (id: string) => remoteAddress ? { id, remoteAddress } : undefined,
		} as unknown as ISessionsProvidersService; // no-as-any justification: lightweight test mock for a multi-method service interface
	}

	function makeRemoteAgentHostService(entries: IRemoteAgentHostEntry[] = []): IRemoteAgentHostService {
		return {
			getEntryByAddress: (address: string) => entries.find(e => getEntryAddress(e) === address),
		} as unknown as IRemoteAgentHostService; // no-as-any justification: lightweight test mock for a multi-method service interface
	}

	test('returns undefined for a local provider', () => {
		const result = resolveRemoteAuthority(
			'local-provider',
			makeProvidersService(undefined) as ISessionsProvidersService,
			makeRemoteAgentHostService() as IRemoteAgentHostService,
		);
		assert.strictEqual(result, undefined);
	});

	test('returns undefined when provider has no remoteAddress', () => {
		const noRemoteProviders = {
			getProvider: (id: string) => ({ id /* no remoteAddress */ }),
		} as unknown as ISessionsProvidersService; // no-as-any justification: lightweight test mock for a multi-method service interface
		const result = resolveRemoteAuthority(
			'agenthost-no-address',
			noRemoteProviders,
			makeRemoteAgentHostService() as IRemoteAgentHostService,
		);
		assert.strictEqual(result, undefined);
	});

	test('returns ssh-remote authority for SSH with sshConfigHost', () => {
		const result = resolveRemoteAuthority(
			'agenthost-myserver',
			makeProvidersService('localhost:4321') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'My Server',
				connection: {
					type: RemoteAgentHostEntryType.SSH,
					address: 'localhost:4321',
					sshConfigHost: 'my-ssh-host',
					hostName: 'myserver.example.com',
				},
			}]) as IRemoteAgentHostService,
		);
		assert.strictEqual(result, 'ssh-remote+my-ssh-host');
	});

	test('returns ssh-remote with simple hostName for SSH without sshConfigHost', () => {
		const result = resolveRemoteAuthority(
			'agenthost-myserver',
			makeProvidersService('localhost:4321') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'My Server',
				connection: {
					type: RemoteAgentHostEntryType.SSH,
					address: 'localhost:4321',
					hostName: 'myserver',
				},
			}]) as IRemoteAgentHostService,
		);
		assert.strictEqual(result, 'ssh-remote+myserver');
	});

	test('returns ssh-remote with hex-encoded authority for SSH with user and port', () => {
		const result = resolveRemoteAuthority(
			'agenthost-myserver',
			makeProvidersService('localhost:4321') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'My Server',
				connection: {
					type: RemoteAgentHostEntryType.SSH,
					address: 'localhost:4321',
					hostName: 'myserver.example.com',
					user: 'admin',
					port: 2222,
				},
			}]) as IRemoteAgentHostService,
		);
		assert.ok(result?.startsWith('ssh-remote+'));
		// The authority should be hex-encoded JSON
		const authority = result!.slice('ssh-remote+'.length);
		const decoded = decodeHex(authority).toString();
		assert.deepStrictEqual(JSON.parse(decoded), {
			hostName: 'myserver.example.com',
			user: 'admin',
			port: 2222,
		});
	});

	test('returns tunnel authority using label', () => {
		const result = resolveRemoteAuthority(
			'agenthost-tunnel',
			makeProvidersService('tunnel:myTunnelId') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'My Tunnel',
				connection: {
					type: RemoteAgentHostEntryType.Tunnel,
					tunnelId: 'myTunnelId',
					clusterId: 'usw2',
					label: 'my-machine',
				},
			}]) as IRemoteAgentHostService,
		);
		assert.strictEqual(result, 'tunnel+my-machine');
	});

	test('returns tunnel authority falling back to tunnelId when no label', () => {
		const result = resolveRemoteAuthority(
			'agenthost-tunnel',
			makeProvidersService('tunnel:myTunnelId') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'My Tunnel',
				connection: {
					type: RemoteAgentHostEntryType.Tunnel,
					tunnelId: 'myTunnelId',
					clusterId: 'usw2',
				},
			}]) as IRemoteAgentHostService,
		);
		assert.strictEqual(result, 'tunnel+myTunnelId.usw2');
	});

	test('returns undefined for WebSocket connections', () => {
		const result = resolveRemoteAuthority(
			'agenthost-ws',
			makeProvidersService('myhost:4321') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'WS Host',
				connection: {
					type: RemoteAgentHostEntryType.WebSocket,
					address: 'myhost:4321',
				},
			}]) as IRemoteAgentHostService,
		);
		assert.strictEqual(result, undefined);
	});

	test('returns undefined when no matching entry found', () => {
		const result = resolveRemoteAuthority(
			'agenthost-missing',
			makeProvidersService('unknown-address:9999') as ISessionsProvidersService,
			makeRemoteAgentHostService([{
				name: 'Other',
				connection: {
					type: RemoteAgentHostEntryType.WebSocket,
					address: 'different-address:1234',
				},
			}]) as IRemoteAgentHostService,
		);
		assert.strictEqual(result, undefined);
	});
});

suite('sshAuthorityString', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hex-encodes when user is present', () => {
		const result = sshAuthorityString({
			type: RemoteAgentHostEntryType.SSH,
			address: 'localhost:4321',
			hostName: 'myserver',
			user: 'admin',
		});
		const decoded = decodeHex(result).toString();
		assert.deepStrictEqual(JSON.parse(decoded), { hostName: 'myserver', user: 'admin' });
	});

	test('hex-encodes when port is present', () => {
		const result = sshAuthorityString({
			type: RemoteAgentHostEntryType.SSH,
			address: 'localhost:4321',
			hostName: 'myserver',
			port: 2222,
		});
		const decoded = decodeHex(result).toString();
		assert.deepStrictEqual(JSON.parse(decoded), { hostName: 'myserver', port: 2222 });
	});

	test('hex-encodes when hostName has uppercase letters', () => {
		const result = sshAuthorityString({
			type: RemoteAgentHostEntryType.SSH,
			address: 'localhost:4321',
			hostName: 'MyServer',
		});
		const decoded = decodeHex(result).toString();
		assert.deepStrictEqual(JSON.parse(decoded), { hostName: 'MyServer' });
	});

	test('hex-encodes with all fields', () => {
		const result = sshAuthorityString({
			type: RemoteAgentHostEntryType.SSH,
			address: 'localhost:4321',
			hostName: 'MyServer.example.com',
			user: 'root',
			port: 22,
		});
		const decoded = decodeHex(result).toString();
		assert.deepStrictEqual(JSON.parse(decoded), {
			hostName: 'MyServer.example.com',
			user: 'root',
			port: 22,
		});
	});

	test('uses hostName directly when address differs', () => {
		const result = sshAuthorityString({
			type: RemoteAgentHostEntryType.SSH,
			address: 'localhost:4321',
			hostName: 'actualhost',
		});
		assert.strictEqual(result, 'actualhost');
	});
});
