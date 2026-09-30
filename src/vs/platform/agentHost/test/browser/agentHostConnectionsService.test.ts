/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { OperatingSystem } from '../../../../base/common/platform.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { NullLogService } from '../../../log/common/log.js';
import { IPathService, type IResourcePathProvider } from '../../../path/common/pathService.js';
import { AgentHostConnectionsService } from '../../browser/agentHostConnectionsService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY } from '../../common/agentHostConnectionsService.js';
import type { IAgentConnection, IAgentHostService } from '../../common/agentService.js';
import { ChangesetKind } from '../../common/changesetUri.js';
import type { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../common/remoteAgentHostService.js';
import { AGENT_HOST_SCHEME, createAgentHostResourceUriMapper, identityAgentHostResourceUriMapper } from '../../common/agentHostUri.js';

/** A connection stand-in identified by a `marker` so equality checks read clearly. */
function fakeConnection(marker: string, operatingSystem = 'linux'): IAgentConnection {
	return {
		marker,
		getNetworkDiagnosticsInfo: async () => ({
			version: '1.0.0',
			os: operatingSystem,
			arch: 'x64',
			proxySettings: {},
			proxyEnv: {},
			endpoints: [],
		}),
	} as unknown as IAgentConnection;
}

suite('AgentHostConnectionsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(
		remoteConnections: readonly IRemoteAgentHostConnectionInfo[],
		remoteByAddress: Map<string, IAgentConnection>,
		options?: { ambientResourceAuthority?: string; ambientOperatingSystem?: string },
	): { service: AgentHostConnectionsService; ambient: IAgentConnection; pathProvider: IResourcePathProvider; fireRemoteChange: () => void } {
		const onRemoteChange = store.add(new Emitter<void>());

		const agentHostService = {
			...fakeConnection('ambient', options?.ambientOperatingSystem),
			onAgentHostStart: Event.None,
			onAgentHostExit: Event.None,
			resourceUris: options?.ambientResourceAuthority
				? createAgentHostResourceUriMapper(options.ambientResourceAuthority)
				: identityAgentHostResourceUriMapper,
		} as unknown as IAgentHostService;

		const remoteAgentHostService = {
			onDidChangeConnections: onRemoteChange.event,
			get connections() { return remoteConnections; },
			getConnection: (address: string) => remoteByAddress.get(address),
			getConnectionByAuthority: (authority: string) => {
				for (const info of remoteConnections) {
					if (toAuthority(info.address) === authority) {
						return remoteByAddress.get(info.address);
					}
				}
				return undefined;
			},
		} as unknown as IRemoteAgentHostService;

		let pathProvider!: IResourcePathProvider;
		const pathService = upcastPartial<IPathService>({
			registerPathProvider: (scheme, provider) => {
				assert.strictEqual(scheme, AGENT_HOST_SCHEME);
				pathProvider = provider;
				return Disposable.None;
			},
		});
		const service = store.add(new AgentHostConnectionsService(agentHostService, remoteAgentHostService, pathService, new NullLogService()));
		return { service, ambient: agentHostService as unknown as IAgentConnection, pathProvider, fireRemoteChange: () => onRemoteChange.fire() };
	}

	// Mirror agentHostAuthority for the simple alphanumeric/host cases used here.
	function toAuthority(address: string): string {
		return /^[a-zA-Z0-9]+$/.test(address) ? address : address.replaceAll(':', '__');
	}

	function info(address: string, name: string, operatingSystem?: OperatingSystem): IRemoteAgentHostConnectionInfo {
		return { address, name, clientId: `id-${address}`, status: { kind: 'connected' }, operatingSystem };
	}

	test('enumerates [ambient, ...remotes] and resolves by authority/address', () => {
		const remoteConn = fakeConnection('remote-host');
		const byAddress = new Map<string, IAgentConnection>([['example.com:8080', remoteConn]]);
		const { service, ambient } = createService([info('example.com:8080', 'My Remote')], byAddress);

		const snapshot = service.connections.map(c => ({
			authority: c.authority,
			address: c.address,
			name: c.name,
			isAmbient: c.isAmbient,
			connection: c.connection,
		}));

		assert.deepStrictEqual(snapshot, [
			{ authority: AMBIENT_AGENT_HOST_AUTHORITY, address: undefined, name: 'Local', isAmbient: true, connection: ambient },
			{ authority: 'example.com__8080', address: 'example.com:8080', name: 'My Remote', isAmbient: false, connection: remoteConn },
		]);

		assert.strictEqual(service.ambientConnection, ambient);
		assert.strictEqual(service.getConnectionByAuthority(AMBIENT_AGENT_HOST_AUTHORITY), ambient);
		assert.strictEqual(service.getConnectionByAuthority('example.com__8080'), remoteConn);
		assert.strictEqual(service.getConnectionByAddress('example.com:8080'), remoteConn);
		assert.strictEqual(service.getConnectionByAddress('missing'), undefined);
	});

	test('forwards remote connection changes', () => {
		const { service, fireRemoteChange } = createService([], new Map());
		let fired = 0;
		store.add(service.onDidChangeConnections(() => fired++));

		fireRemoteChange();

		assert.strictEqual(fired, 1);
	});

	test('provides path semantics for mixed remote authorities and the ambient resource authority', async () => {
		const windows = fakeConnection('windows', 'win32');
		const linux = fakeConnection('linux', 'linux');
		const { service, ambient, pathProvider } = createService([
			info('windows', 'Windows', OperatingSystem.Windows),
			info('linux', 'Linux', OperatingSystem.Linux),
		], new Map([
			['windows', windows],
			['linux', linux],
		]), {
			ambientResourceAuthority: 'ambient-remote',
			ambientOperatingSystem: 'darwin',
		});

		assert.deepStrictEqual({
			windows: await pathProvider.getOperatingSystem(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'windows', path: '/' })),
			linux: await pathProvider.getOperatingSystem(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'linux', path: '/' })),
			ambient: await pathProvider.getOperatingSystem(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'ambient-remote', path: '/' })),
			unknown: await pathProvider.getOperatingSystem(URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'unknown', path: '/' })),
			ambientAlias: service.getConnectionByAuthority('ambient-remote'),
		}, {
			windows: OperatingSystem.Windows,
			linux: OperatingSystem.Linux,
			ambient: OperatingSystem.Macintosh,
			unknown: undefined,
			ambientAlias: ambient,
		});
	});

	test('resolveSessionResource maps local and remote schemes to connections', () => {
		const remoteConn = fakeConnection('remote-host');
		const byAddress = new Map<string, IAgentConnection>([['myhost', remoteConn]]);
		const { service, ambient } = createService([info('myhost', 'My Remote')], byAddress);

		const local = service.resolveSessionResource(URI.parse('agent-host-copilotcli:/abc123'));
		assert.strictEqual(local?.connection, ambient);
		assert.strictEqual(local?.connectionAuthority, AMBIENT_AGENT_HOST_AUTHORITY);
		assert.strictEqual(local?.backendSession.toString(), 'copilotcli:/abc123');

		const remote = service.resolveSessionResource(URI.parse('remote-myhost-copilotcli:/xyz789'));
		assert.strictEqual(remote?.connection, remoteConn);
		assert.strictEqual(remote?.connectionAuthority, 'myhost');
		assert.strictEqual(remote?.backendSession.toString(), 'copilotcli:/xyz789');

		// Non-agent-host scheme and unknown remote authority resolve to undefined.
		assert.strictEqual(service.resolveSessionResource(URI.parse('vscode-chat-editor:/foo')), undefined);
		assert.strictEqual(service.resolveSessionResource(URI.parse('remote-unknown-copilotcli:/foo')), undefined);
	});

	test('applies provider session resolution policy', () => {
		const remoteConn = fakeConnection('remote-host');
		const byAddress = new Map<string, IAgentConnection>([['myhost', remoteConn]]);
		const { service } = createService([info('myhost', 'My Remote')], byAddress);
		let resolutionChanges = 0;
		store.add(service.onDidChangeSessionResolution(() => resolutionChanges++));

		const registration = store.add(service.registerSessionResolutionPolicy('myhost', {
			sessionSchemeAlias: { ui: 'copilot', backend: 'ahp-session' },
			defaultChangesetKind: ChangesetKind.Session,
		}));
		const mapped = service.resolveSessionResource(URI.parse('remote-myhost-copilot:/xyz789'));
		registration.dispose();
		const restored = service.resolveSessionResource(URI.parse('remote-myhost-copilot:/xyz789'));

		assert.deepStrictEqual({
			mapped: {
				backendSession: mapped?.backendSession.toString(),
				defaultChangesetKind: mapped?.defaultChangesetKind,
			},
			restored: {
				backendSession: restored?.backendSession.toString(),
				defaultChangesetKind: restored?.defaultChangesetKind,
			},
			resolutionChanges,
		}, {
			mapped: {
				backendSession: 'ahp-session:/xyz789',
				defaultChangesetKind: ChangesetKind.Session,
			},
			restored: {
				backendSession: 'copilot:/xyz789',
				defaultChangesetKind: undefined,
			},
			resolutionChanges: 2,
		});
	});

	test('resolves remote session identity while disconnected', () => {
		const { service } = createService([info('myhost', 'My Remote')], new Map());
		store.add(service.registerSessionResolutionPolicy('myhost', {
			sessionSchemeAlias: { ui: 'copilot', backend: 'ahp-session' },
			defaultChangesetKind: ChangesetKind.Session,
		}));

		const resource = URI.parse('remote-myhost-copilot:/xyz789');
		const identity = service.resolveSessionResourceIdentity(resource);

		assert.deepStrictEqual({
			identity: identity && {
				connectionAuthority: identity.connectionAuthority,
				backendSession: identity.backendSession.toString(),
				defaultChangesetKind: identity.defaultChangesetKind,
			},
			resolution: service.resolveSessionResource(resource),
		}, {
			identity: {
				connectionAuthority: 'myhost',
				backendSession: 'ahp-session:/xyz789',
				defaultChangesetKind: ChangesetKind.Session,
			},
			resolution: undefined,
		});
	});
});
