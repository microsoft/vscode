/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeHex, encodeHex, VSBuffer } from '../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, getEntryAddress, RemoteAgentHostEntryType } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { AGENT_HOST_SCHEME } from '../../../platform/agentHost/common/agentHostUri.js';
import { URI } from '../../../base/common/uri.js';
import { resolveRemoteAuthority, resolveRemoteFolderUri, sshAuthorityString } from '../../browser/openInVSCodeUtils.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';

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

	test('returns a WSL authority and folder URI using the distribution, not the host label', () => {
		const providersService = makeProvidersService('wsl:Ubuntu-24.04');
		const remoteService = makeRemoteAgentHostService([{
			name: 'My Linux Host',
			connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu-24.04', distro: 'Ubuntu-24.04' },
		}]);
		const folderUri = resolveRemoteFolderUri(
			URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'wsl__Ubuntu-24.04', path: '/home/test/project' }),
			'agenthost-wsl',
			providersService,
			remoteService,
		);
		assert.deepStrictEqual({
			authority: resolveRemoteAuthority('agenthost-wsl', providersService, remoteService),
			folderUri: { scheme: folderUri.scheme, authority: folderUri.authority, path: folderUri.path },
		}, {
			authority: 'wsl+Ubuntu-24.04',
			folderUri: { scheme: 'vscode-remote', authority: 'wsl+Ubuntu-24.04', path: '/home/test/project' },
		});
	});

	function assertDevContainerAuthority(hostPath: string, hostAuthority?: string, expectedHostPath = hostPath, expectedHostAuthority = hostAuthority): void {
		const address = 'devcontainer:container-id';
		const providersService = makeProvidersService(address);
		const remoteAgentHostService = makeRemoteAgentHostService([{
			name: 'Project Dev Container',
			connection: {
				type: RemoteAgentHostEntryType.DevContainer,
				address,
				hostPath,
				hostAuthority,
			},
		}]);
		const authority = resolveRemoteAuthority('agenthost-devcontainer', providersService, remoteAgentHostService);
		const folderUri = resolveRemoteFolderUri(
			URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'devcontainer__container-id', path: '/workspaces/project' }),
			'agenthost-devcontainer',
			providersService,
			remoteAgentHostService,
		);

		assert.deepStrictEqual({
			authority,
			decodedHostPath: authority ? decodeHex(authority.slice('dev-container+'.length).split('@')[0]).toString() : undefined,
			folderUri: {
				scheme: folderUri.scheme,
				authority: folderUri.authority,
				path: folderUri.path,
			},
		}, {
			authority: `dev-container+${encodeHex(VSBuffer.fromString(expectedHostPath))}${expectedHostAuthority ? `@${expectedHostAuthority}` : ''}`,
			decodedHostPath: expectedHostPath,
			folderUri: {
				scheme: 'vscode-remote',
				authority: `dev-container+${encodeHex(VSBuffer.fromString(expectedHostPath))}${expectedHostAuthority ? `@${expectedHostAuthority}` : ''}`,
				path: '/workspaces/project',
			},
		});
	}

	test('returns a Dev Containers authority for a POSIX source folder', () => {
		assertDevContainerAuthority('/Users/test/project');
	});

	test('returns a Dev Containers authority for a Windows drive-letter source folder', () => {
		assertDevContainerAuthority('C:\\Users\\Test User\\project');
	});

	test('returns a Dev Containers authority for a Windows WSL UNC source folder', () => {
		assertDevContainerAuthority('\\\\wsl.localhost\\Ubuntu\\home\\test\\project');
	});

	test('preserves the SSH parent authority when opening a remote Dev Container', () => {
		assertDevContainerAuthority('/home/test/project', 'ssh-remote+server');
	});

	test('preserves the Tunnel parent authority when opening a remote Dev Container', () => {
		assertDevContainerAuthority('/home/test/project', 'tunnel+server.region');
	});

	test('encodes a WSL source as a UNC path without a parent authority', () => {
		assertDevContainerAuthority('/home/test/My Project', 'wsl+Ubuntu-24.04', '\\\\wsl.localhost\\Ubuntu-24.04\\home\\test\\My Project', '');
	});

	test('keeps mounted Windows folders scoped to their WSL distribution', () => {
		assertDevContainerAuthority('/mnt/c/Users/test/project', 'wsl+Fedora', '\\\\wsl.localhost\\Fedora\\mnt\\c\\Users\\test\\project', '');
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
