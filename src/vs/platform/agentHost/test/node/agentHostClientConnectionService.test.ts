/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { mock } from '../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentHostMcpAuthenticationRequest } from '../../common/agentHostExtensionProtocol.js';
import { AuthenticateTargetKind } from '../../common/state/sessionProtocol.js';
import { McpAuthRequiredReason } from '../../common/state/protocol/channels-session/state.js';
import { AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD, AgentHostClientConnectionService, type IAgentHostClientConnectionSource } from '../../node/agentHostClientConnectionService.js';

suite('AgentHostClientConnectionService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function registerPermissionSource(service: AgentHostClientConnectionService) {
		const sessions = new Set<string>();
		const changed = store.add(new Emitter<void>());
		const registration = store.add(service.registerSource(new class extends mock<IAgentHostClientConnectionSource>() {
			override readonly onDidChangeSessionPermissionClients = changed.event;
			override hasSessionPermissionClient(session: string): boolean { return sessions.has(session); }
		}));
		return { sessions, changed, registration };
	}

	test('bounds initial client absence without extending the grace on unrelated changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const service = store.add(new AgentHostClientConnectionService());
		const source = registerPermissionSource(service);
		let unavailable = 0;
		store.add(service.watchSessionPermissionClient('opaque:session', () => unavailable++));
		await timeout(10_000);
		source.sessions.add('opaque:other');
		source.changed.fire();
		await timeout(AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD - 10_001);
		const beforeDeadline = unavailable;
		await timeout(1);
		assert.deepStrictEqual({ beforeDeadline, afterDeadline: unavailable }, { beforeDeadline: 0, afterDeadline: 1 });
	}));

	test('waits indefinitely for people across sources and gives a fresh grace after the last client leaves', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const service = store.add(new AgentHostClientConnectionService());
		const first = registerPermissionSource(service);
		const second = registerPermissionSource(service);
		let unavailable = 0;
		store.add(service.watchSessionPermissionClient('opaque:session', () => unavailable++));
		await timeout(AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD - 1);
		first.sessions.add('opaque:session');
		first.changed.fire();
		await timeout(AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD * 2);
		const whileConnected = unavailable;
		first.sessions.clear();
		first.changed.fire();
		await timeout(20_000);
		second.sessions.add('opaque:session');
		second.changed.fire();
		await timeout(AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD * 2);
		const afterRecovery = unavailable;
		second.registration.dispose();
		await timeout(AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD - 1);
		const beforeDeadline = unavailable;
		await timeout(1);
		assert.deepStrictEqual({ whileConnected, afterRecovery, beforeDeadline, afterDeadline: unavailable }, {
			whileConnected: 0, afterRecovery: 0, beforeDeadline: 0, afterDeadline: 1,
		});
	}));

	test('does not expire a completed permission watch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const service = store.add(new AgentHostClientConnectionService());
		let unavailable = false;
		const watch = store.add(service.watchSessionPermissionClient('opaque:session', () => unavailable = true));
		watch.dispose();
		await timeout(AGENT_HOST_CLIENT_RECONNECT_GRACE_PERIOD * 2);
		assert.strictEqual(unavailable, false);
	}));

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
