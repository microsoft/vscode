/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentHostMcpAuthenticationRequest } from '../../common/agentHostExtensionProtocol.js';
import { AuthenticateTargetKind } from '../../common/state/sessionProtocol.js';
import { McpAuthRequiredReason } from '../../common/state/protocol/channels-session/state.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';

suite('AgentHostClientConnectionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('forwards connection changes and releases the subscription when a source is removed', () => {
		const service = store.add(new AgentHostClientConnectionService());
		const changes = store.add(new Emitter<number>());
		const counts = new Map<string, number>();
		const observed: number[] = [];
		store.add(service.onDidChangeConnections(() => observed.push(service.getConnectionCounts('').connectedClientCount)));
		const registration = store.add(service.registerSource({
			onDidChangeConnectionCount: changes.event,
			hasSeenClient: () => false,
			isClientConnected: id => counts.has(id),
			isLocalClient: () => false,
			usesLegacyChatUris: () => false,
			getConnectedClientTransportCounts: () => counts,
			requestWorkspaceTrust: async () => false,
			requestMcpAuthentication: async () => false,
		}));
		counts.set('client', 1);
		changes.fire(1);
		registration.dispose();
		changes.fire(1);
		assert.deepStrictEqual(observed, [0, 1, 0]);
	});

	test('reports locality from registered sources and drops it when a source is removed', () => {
		const service = store.add(new AgentHostClientConnectionService());
		const withoutSources = service.isLocalClient('local');
		for (const local of [false, true]) {
			const registration = store.add(service.registerSource({
				hasSeenClient: () => true,
				isClientConnected: () => true,
				isLocalClient: clientId => local && clientId === 'local',
				usesLegacyChatUris: () => false,
				getConnectedClientTransportCounts: () => new Map(),
				requestWorkspaceTrust: async () => false,
				requestMcpAuthentication: async () => false,
			}));
			if (local) {
				const withLocalSource = service.isLocalClient('local');
				const otherClient = service.isLocalClient('other');
				registration.dispose();
				assert.deepStrictEqual({ withoutSources, withLocalSource, otherClient, afterRemoval: service.isLocalClient('local') }, {
					withoutSources: false, withLocalSource: true, otherClient: false, afterRemoval: false,
				});
			}
		}
	});

	test('requests MCP authentication from sources in order until successful', async () => {
		const service = store.add(new AgentHostClientConnectionService());
		const request: IAgentHostMcpAuthenticationRequest = {
			serverName: 'example',
			target: { kind: AuthenticateTargetKind.McpServer, session: 'ahp-session:/example', customizationId: 'example-mcp' },
			auth: { reason: McpAuthRequiredReason.Required, resource: { resource: 'https://mcp.example.com', authorization_servers: [] } },
		};
		const calls: { source: number; request: IAgentHostMcpAuthenticationRequest }[] = [];
		const withoutSources = await service.requestMcpAuthentication(request);
		for (const source of [0, 1, 2]) {
			store.add(service.registerSource({
				hasSeenClient: () => false,
				isClientConnected: () => false,
				isLocalClient: () => false,
				usesLegacyChatUris: () => false,
				getConnectedClientTransportCounts: () => new Map(),
				requestWorkspaceTrust: async () => false,
				requestMcpAuthentication: async request => {
					calls.push({ source, request });
					return source === 1;
				},
			}));
		}
		assert.deepStrictEqual({ withoutSources, authenticated: await service.requestMcpAuthentication(request), calls }, {
			withoutSources: false, authenticated: true, calls: [{ source: 0, request }, { source: 1, request }],
		});
	});
});
