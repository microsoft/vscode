/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentHostConnectionsService } from '../../browser/agentHostConnectionsService.js';
import { AMBIENT_AGENT_HOST_AUTHORITY } from '../../common/agentHostConnectionsService.js';
import type { IAgentConnection, IAgentHostService } from '../../common/agentService.js';
import { ChangesetKind } from '../../common/changesetUri.js';
import type { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService } from '../../common/remoteAgentHostService.js';

/** A connection stand-in identified by a `marker` so equality checks read clearly. */
function fakeConnection(marker: string): IAgentConnection {
	return { marker } as unknown as IAgentConnection;
}

suite('AgentHostConnectionsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(remoteConnections: readonly IRemoteAgentHostConnectionInfo[], remoteByAddress: Map<string, IAgentConnection>): { service: AgentHostConnectionsService; ambient: IAgentConnection; fireRemoteChange: () => void } {
		const onRemoteChange = store.add(new Emitter<void>());

		const agentHostService = {
			marker: 'ambient',
			onAgentHostStart: Event.None,
			onAgentHostExit: Event.None,
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

		const service = store.add(new AgentHostConnectionsService(agentHostService, remoteAgentHostService));
		return { service, ambient: agentHostService as unknown as IAgentConnection, fireRemoteChange: () => onRemoteChange.fire() };
	}

	// Mirror agentHostAuthority for the simple alphanumeric/host cases used here.
	function toAuthority(address: string): string {
		return /^[a-zA-Z0-9]+$/.test(address) ? address : address.replaceAll(':', '__');
	}

	function info(address: string, name: string): IRemoteAgentHostConnectionInfo {
		return { address, name, clientId: `id-${address}`, status: { kind: 'connected' } };
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
