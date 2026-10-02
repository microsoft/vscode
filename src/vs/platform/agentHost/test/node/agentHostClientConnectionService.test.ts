/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentHostMcpAuthenticationRequest } from '../../common/agentHostExtensionProtocol.js';
import { McpAuthRequiredReason } from '../../common/state/protocol/channels-session/state.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';

suite('AgentHostClientConnectionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports locality from registered sources and drops it when a source is removed', () => {
		const service = store.add(new AgentHostClientConnectionService());
		const withoutSources = service.isLocalClient('local');
		for (const local of [false, true]) {
			const registration = store.add(service.registerSource({
				hasSeenClient: () => true,
				isClientConnected: () => true,
				isLocalClient: clientId => local && clientId === 'local',
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
			auth: { reason: McpAuthRequiredReason.Required, resource: { resource: 'https://mcp.example.com', authorization_servers: [] } },
		};
		const calls: { source: number; request: IAgentHostMcpAuthenticationRequest }[] = [];
		const withoutSources = await service.requestMcpAuthentication(request);
		for (const source of [0, 1, 2]) {
			store.add(service.registerSource({
				hasSeenClient: () => false,
				isClientConnected: () => false,
				isLocalClient: () => false,
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
