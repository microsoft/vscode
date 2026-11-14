/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CopilotClient, RuntimeConnection, approveAll, type CopilotSession, type EntraTokenProvider } from '@github/copilot-sdk';
import { Event } from '../../../../base/common/event.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
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
		const authentication = store.add(new AgentHostAuthenticationService(log));
		const bridge = store.add(new CopilotEntraAuthentication(authentication));
		const provider = new class extends mock<IAgent>() {
			override readonly id = 'copilotcli';
			override getProtectedResources() { return bridge.getProtectedResources(); }
			override async authenticate() { return false; }
			override validateAuthentication(params: AuthenticateParams) { bridge.validateAuthentication(params); }
			override handleAuthenticationToken(params: AuthenticateParams) { return bridge.authenticate(params); }
		}();
		const service = new class extends mock<IAgentService>() {
			override readonly onMcpNotification = Event.None;
			override authenticate(...args: Parameters<IAgentService['authenticate']>) { return authentication.authenticate(args[0], [provider], args[1]); }
			override addSubscriber() { }
			override unsubscribe() { }
			override async subscribe(resource: URI) {
				const snapshot = state.getSnapshot(resource.toString());
				assert.ok(snapshot);
				return snapshot;
			}
		}();
		const server = store.add(await WebSocketProtocolServer.create({ port: 0, host: '127.0.0.1' }, log));
		const handler = store.add(new ProtocolServerHandler(
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
			const accountSession = session;
			const login = async () => {
				const flow = await accountSession.rpc.accounts.login.begin({ kind: 'entra' });
				for (let step = 0; step < 4; step++) {
					const result = await accountSession.rpc.accounts.login.advance({ flowId: flow.flowId });
					if (result.kind === 'completed') {
						return result;
					}
				}
				throw new Error('Entra login did not reach a terminal result');
			};
			const completeWithoutCredential = () => raceTimeout(login().catch((error: unknown) => {
				if (!(error instanceof Error)) {
					throw error;
				}
				return error;
			}), 5_000);
			const noIdentity = await completeWithoutCredential();
			assert.ok(noIdentity instanceof Error, 'Absent identity must finish without waiting for authenticate');
			const identityChallenge = await client.waitForNotification(n => n.method === 'auth/required');
			assert.deepStrictEqual(identityChallenge.params, {
				channel: ROOT_STATE_URI,
				resource: { resource: copilotEntraDiscoveryResource, authorization_servers: ['https://login.microsoftonline.com/organizations'], scopes_supported: ['User.Read'], required: false },
				reason: 'required',
			});
			await client.call('authenticate', {
				channel: ROOT_STATE_URI, resource: copilotEntraDiscoveryResource, scopes: ['User.Read'],
				token: 'synthetic-graph-credential', expiresIn: 3600,
				_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: 'transport-selected-account' }),
			});
			const result = await completeWithoutCredential();
			assert.ok(result, 'Missing resource credentials must complete without waiting for a negative AHP reply');
			await client.waitForNotification(n => n.method === 'auth/required' && JSON.stringify(n.params).includes(copilotEntraEmuAudience));
			const required = bridge.authenticationRequired.get();
			assert.deepStrictEqual(required?.resource.scopes_supported, [`${copilotEntraEmuAudience}/user_impersonation`]);
			assert.strictEqual(stopping, undefined, 'An unavailable resource must not revoke the signed-in identity');
			assert.deepStrictEqual(await bridge.options.tokenProvider?.({ kind: 'identity', clientId: bridge.options.clientId, accountId: 'transport-selected-account', reason: 'renewal' }, CancellationToken.None as Parameters<EntraTokenProvider>[1]), {
				kind: 'identity', accountId: 'transport-selected-account',
			});
			// No synthetic resource token is sent to Microsoft or GitHub.
			// Like GitHub, any connected client can withdraw the credential.
			const otherClient = new TestProtocolClient(server.boundPort);
			store.add(toDisposable(() => otherClient.close()));
			await otherClient.connect();
			await otherClient.call('initialize', { channel: ROOT_STATE_URI, clientId: 'entra-other-client', protocolVersions: [PROTOCOL_VERSION], initialSubscriptions: [ROOT_STATE_URI] });
			await otherClient.call('authenticate', { channel: ROOT_STATE_URI, resource: copilotEntraDiscoveryResource, token: '' });
			otherClient.close();
			assert.ok(result instanceof Error || result.result.status !== 'completed', 'Unavailable credentials must not report a completed login');
			assert.ok(stopping);
			assert.deepStrictEqual(await stopping, [], 'Withdrawing authority must stop the runtime connection');
			assert.deepStrictEqual({
				resource: required?.resource.resource,
				readvertised: [bridge.authenticationRequired.get()?.resource.resource, bridge.authenticationRequired.get()?.reason],
				graphToken: authentication.getAuthToken({ resource: copilotEntraDiscoveryResource }),
			}, {
				resource: 'https://github.com/login/oauth/access_token',
				readvertised: [copilotEntraDiscoveryResource, 'expired'],
				graphToken: undefined,
			});
			session = undefined;
			await bridge.options.tokenProvider?.({ kind: 'identity', clientId: bridge.options.clientId, reason: 'signIn' }, CancellationToken.None as Parameters<EntraTokenProvider>[1]);
			await client.call('authenticate', {
				channel: ROOT_STATE_URI, resource: copilotEntraDiscoveryResource, scopes: ['User.Read'],
				token: 'synthetic-reconnected-graph-credential', expiresIn: 3600,
				_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: 'transport-selected-account' }),
			});
			await runtime.start();
			stopping = undefined;
			const disconnected = Event.toPromise(Event.filter(handler.onDidChangeConnectionCount, count => count === 0));
			client.close();
			await disconnected;
			assert.deepStrictEqual({
				stopping,
				identity: await bridge.options.tokenProvider?.({ kind: 'identity', clientId: bridge.options.clientId, accountId: 'transport-selected-account', reason: 'renewal' }, CancellationToken.None as Parameters<EntraTokenProvider>[1]),
				graphToken: authentication.getAuthToken({ resource: copilotEntraDiscoveryResource, scopes: ['User.Read'] }),
				ping: (await runtime.ping('disconnected-host')).message,
			}, {
				stopping: undefined,
				identity: { kind: 'identity', accountId: 'transport-selected-account' },
				graphToken: 'synthetic-reconnected-graph-credential',
				ping: 'pong: disconnected-host',
			});
			const reconnected = new TestProtocolClient(server.boundPort);
			store.add(toDisposable(() => reconnected.close()));
			await reconnected.connect();
			await reconnected.call('initialize', { channel: ROOT_STATE_URI, clientId: 'entra-reconnected', protocolVersions: [PROTOCOL_VERSION], initialSubscriptions: [ROOT_STATE_URI] });
			await assert.rejects(reconnected.call('authenticate', {
				channel: ROOT_STATE_URI, resource: copilotEntraDiscoveryResource, scopes: ['User.Read'],
				token: 'synthetic-other-account', expiresIn: 3600,
				_meta: authenticationAccountMeta({ providerId: 'microsoft', accountId: 'another-account' }),
			}), /original account/i);
			assert.deepStrictEqual(await bridge.options.tokenProvider?.({
				kind: 'identity', clientId: bridge.options.clientId, accountId: 'transport-selected-account', reason: 'renewal',
			}, CancellationToken.None as Parameters<EntraTokenProvider>[1]), { kind: 'identity', accountId: 'transport-selected-account' });
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
