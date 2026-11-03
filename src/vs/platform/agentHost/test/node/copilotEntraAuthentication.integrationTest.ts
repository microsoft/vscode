/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, RuntimeConnection, approveAll, type CopilotSession } from '@github/copilot-sdk';
import { Event } from '../../../../base/common/event.js';
import type { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { join } from '../../../../base/common/path.js';
import { isLinux } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import type { AuthenticateParams, IAgent } from '../../common/agent.js';
import { AgentHostFileSystemProvider } from '../../common/agentHostFileSystemProvider.js';
import { AgentHostLaunchKind } from '../../common/agentHostTelemetry.js';
import type { IAgentService } from '../../common/agentService.js';
import { copilotEntraDiscoveryResource, copilotEntraEmuAudience } from '../../common/copilotEntraAuthentication.js';
import type { IDevContainerAgentHostMainService } from '../../common/devContainerAgentHost.js';
import { authenticationAccountMeta } from '../../common/meta/agentAuthenticationAccount.js';
import { NullAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CopilotEntraAuthentication } from '../../node/copilot/copilotEntraAuthentication.js';
import { createCopilotCliEnvironment } from '../../node/copilot/copilotCliEnvironment.js';
import { ProtocolServerHandler } from '../../node/protocolServerHandler.js';
import { WebSocketProtocolServer } from '../../node/webSocketTransport.js';
import { createTestAgentHostProxyResolver } from './agentServiceTestUtils.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';
import { createIsolatedProviderEnvironment } from './providerTestEnvironment.js';
import { TestProtocolClient } from './serverIntegrationTestHelpers.js';

suite('Copilot Entra authentication transport', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	(isLinux ? test.skip : test)('uses real AHP and packaged stdio for identity acquisition and explicit unavailability', async function () {
		this.timeout(60_000);
		const root = await mkdtemp(join(tmpdir(), 'copilot-entra-transport-'));
		const log = new NullLogService();
		const state = store.add(new AgentHostStateManager(log));
		const connections = store.add(new AgentHostClientConnectionService());
		const bridge = store.add(new CopilotEntraAuthentication(connections));
		const authentication = store.add(new AgentHostAuthenticationService(log));
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return bridge.getProtectedResources(); }
			override async authenticate() { return false; }
			override handleAuthenticationToken(params: AuthenticateParams, connection?: CancellationToken) { return bridge.authenticate(params, connection); }
		}();
		const service = new class extends mock<IAgentService>() {
			override readonly onMcpNotification = Event.None;
			override authenticate(...args: Parameters<IAgentService['authenticate']>) { return authentication.authenticate(args[0], [provider], args[1], args[2]); }
			override addSubscriber() { }
			override unsubscribe() { }
			override async subscribe(resource: URI) {
				const snapshot = state.getSnapshot(resource.toString());
				assert.ok(snapshot);
				return snapshot;
			}
		}();
		const server = store.add(await WebSocketProtocolServer.create({ port: 0, host: '127.0.0.1' }, log));
		store.add(new ProtocolServerHandler(
			service, state, server, { hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess, allowExtensionMethods: false },
			store.add(new AgentHostFileSystemProvider()), log, NullTelemetryService,
			store.add(new AgentHostManagedSettingsService()), connections,
			new class extends mock<IDevContainerAgentHostMainService>() { }(),
			NullAgentHostOTelService, createTestChatOwnershipService(state),
			createTestAgentHostProxyResolver(),
		));
		store.add(autorun(reader => {
			const requirement = bridge.authenticationRequired.read(reader);
			if (requirement) {
				state.dispatchServerAction(ROOT_STATE_URI, {
					type: ActionType.RootAgentsChanged,
					agents: [{ provider: 'copilotcli', displayName: 'Copilot', description: 'Credential transport fixture', models: [], protectedResources: bridge.getProtectedResources() }],
				});
				state.emitAuthRequired(requirement);
			}
		}));
		await server.whenListening;
		assert.ok(server.boundPort);
		const client = new TestProtocolClient(server.boundPort);
		store.add(toDisposable(() => client.close()));
		const env = createCopilotCliEnvironment(createIsolatedProviderEnvironment(root));
		Object.assign(env, {
			COPILOT_HOME: root, COPILOT_CACHE_HOME: join(root, 'cache'), GH_CONFIG_DIR: root,
			COPILOT_DISABLE_KEYTAR: '1', COPILOT_ENTRA_ONEAUTH: '0',
		});
		for (const name of Object.keys(env)) {
			if (/TOKEN|SECRET|API_KEY|HMAC_KEY|ENTRA_AUTH|DEBUG_ENTRA|LOKI/.test(name)) {
				delete env[name];
			}
		}
		const runtime = new CopilotClient({
			mode: 'empty', baseDirectory: root, connection: RuntimeConnection.forStdio(),
			useLoggedInUser: false, env, logLevel: 'error', entra: bridge.options,
		});
		let stopping: ReturnType<CopilotClient['stop']> | undefined;
		store.add(bridge.onDidRevoke(() => { stopping = runtime.stop(); }));
		let session: CopilotSession | undefined;
		try {
			await client.connect();
			await client.call('initialize', { channel: ROOT_STATE_URI, clientId: 'entra-transport', protocolVersions: [PROTOCOL_VERSION], initialSubscriptions: [ROOT_STATE_URI] });
			await runtime.start();
			session = await runtime.createSession({
				configDirectory: root, availableTools: [], disabledMcpServers: ['github-mcp-server'],
				enableConfigDiscovery: false, onPermissionRequest: approveAll,
			});
			const login = await session.rpc.accounts.login.begin({ kind: 'entra' });
			const accountSession = session;
			const completed = (async () => {
				for (let step = 0; step < 4; step++) {
					const result = await accountSession.rpc.accounts.login.advance({ flowId: login.flowId });
					if (result.kind === 'completed') {
						return result;
					}
				}
				throw new Error('Entra login did not reach a terminal result');
			})().catch((error: unknown) => {
				if (error instanceof Error) {
					return error;
				}
				throw error;
			});
			const identityChallenge = await client.waitForNotification(n => n.method === 'auth/required');
			assert.deepStrictEqual(identityChallenge.params, {
				channel: ROOT_STATE_URI,
				resource: { resource: copilotEntraDiscoveryResource, authorization_servers: ['https://login.microsoftonline.com/organizations'], scopes_supported: ['User.Read'] },
				reason: 'required',
			});
			await client.call('authenticate', {
				channel: ROOT_STATE_URI, resource: copilotEntraDiscoveryResource, scopes: ['User.Read'],
				token: 'synthetic-graph-credential', expiresIn: 3600,
				_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: 'transport-selected-account' }),
			});
			await client.waitForNotification(n => n.method === 'auth/required' && JSON.stringify(n.params).includes(copilotEntraEmuAudience));
			const required = bridge.authenticationRequired.get();
			assert.deepStrictEqual(required?.resource.scopes_supported, [`${copilotEntraEmuAudience}/user_impersonation`]);
			// No synthetic resource token is sent to Microsoft or GitHub.
			await client.call('authenticate', { channel: ROOT_STATE_URI, resource: copilotEntraDiscoveryResource, token: '' });
			const result = await completed;
			assert.ok(result instanceof Error || result.result.status !== 'completed', 'Unavailable credentials must not report a completed login');
			assert.ok(stopping);
			assert.deepStrictEqual(await stopping, [], 'Withdrawing authority must stop the runtime connection');
			assert.deepStrictEqual({
				resource: required?.resource.resource,
				identityRevoked: bridge.authenticationRequired.get(),
				graphToken: authentication.getAuthToken({ resource: copilotEntraDiscoveryResource }),
			}, {
				resource: 'https://github.com/login/oauth/access_token',
				identityRevoked: undefined,
				graphToken: undefined,
			});
		} finally {
			client.close();
			try {
				await session?.disconnect();
			} finally {
				await runtime.stop();
				await rm(root, { recursive: true, force: true });
			}
		}
	});
});
