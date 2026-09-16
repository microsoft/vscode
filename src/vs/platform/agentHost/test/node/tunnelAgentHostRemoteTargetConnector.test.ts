/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable, isObservable, observableValue } from '../../../../base/common/observable.js';
import { hasKey } from '../../../../base/common/types.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { AgentHostRemoteTargetStatus, type IAgentHostRemoteTargetConnector } from '../../common/agentHostRemoteAgents.js';
import { AgentHostTunnelAuthenticationIssuer } from '../../common/agentHostFeatureAuthentication.js';
import { AgentHostProtocolClientCore } from '../../common/agentHostProtocolClient.js';
import {
	TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY,
	TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY,
	TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY,
	TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY,
	TunnelAgentHostDiscoveryDisabledError,
	TunnelAgentHostDiscoveryNeedsAuthenticationError,
} from '../../common/tunnelAgentHostDiscovery.js';
import {
	TUNNEL_ADDRESS_PREFIX,
	TUNNEL_LAUNCHER_LABEL,
	TunnelNotFoundError,
	type HostedTunnelIdentity,
	type ICachedTunnel,
	type ITunnelAgentHostMainService,
	type ITunnelConnectResult,
	type ITunnelGatewaySelection,
	type ITunnelGatewaySelectionSession,
	type ITunnelInfo,
	type ITunnelRelayMessage,
} from '../../common/tunnelAgentHost.js';
import { ReconnectResultType } from '../../common/state/protocol/commands.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';
import type { JsonRpcRequest, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IAgentHostFeatureAuthenticationCredential, IAgentHostFeatureAuthenticationRegistry, IAgentHostFeatureAuthenticationResult } from '../../node/agentHostFeatureAuthentication.js';
import type { IAgentHostRemoteAgentsActivationContext } from '../../node/agentHostRemoteAgentsService.js';
import { AgentHostRemoteTargetRegistry } from '../../node/agentHostRemoteTargetRegistry.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';
import { TunnelAgentHostRemoteTargetConnector } from '../../node/tunnelAgentHostRemoteTargetConnector.js';

const githubCredential: IAgentHostFeatureAuthenticationCredential = {
	issuer: AgentHostTunnelAuthenticationIssuer.GitHub,
	scopes: ['tunnel:manage'],
	token: 'github-token',
	expiresAt: undefined,
};

function tunnel(
	tunnelId: string,
	options: {
		readonly labels?: readonly string[];
		readonly protocolVersion?: number;
		readonly name?: string;
	} = {},
): ITunnelInfo {
	const protocolVersion = options.protocolVersion ?? 6;
	return {
		tunnelId,
		clusterId: `cluster-${tunnelId}`,
		name: options.name ?? `Tunnel ${tunnelId}`,
		tags: options.labels ?? [TUNNEL_LAUNCHER_LABEL, `protocolv${protocolVersion}`],
		protocolVersion,
		hostConnectionCount: 1,
	};
}

class TestFeatureAuthenticationRegistry implements IAgentHostFeatureAuthenticationRegistry {
	declare readonly _serviceBrand: undefined;

	readonly requirements = constObservable([]);
	readonly credential = observableValue<IAgentHostFeatureAuthenticationCredential | undefined>(this, undefined);

	authenticate(_params: AuthenticateParams): IAgentHostFeatureAuthenticationResult {
		return { handled: false, authenticated: false };
	}

	setCredential(credential: IAgentHostFeatureAuthenticationCredential | undefined): void {
		this.credential.set(credential, undefined);
	}
}

class TestTunnelAgentHostMainService extends Disposable implements ITunnelAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRelayMessage = this._register(new Emitter<ITunnelRelayMessage>());
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose = this._onDidRelayClose.event;

	tunnels: readonly ITunnelInfo[] = [];
	listError: Error | undefined;
	listPromise: Promise<readonly ITunnelInfo[]> | undefined;
	selectionSession: ITunnelGatewaySelectionSession | undefined;
	selectionPromise: Promise<ITunnelGatewaySelectionSession | undefined> | undefined;
	completeSelectionPromise: Promise<void> | undefined;
	readonly listCalls: Array<{ readonly token: string; readonly authProvider: 'github' | 'microsoft' }> = [];
	readonly listAdditionalTunnelNames: Array<readonly string[] | undefined> = [];
	readonly listCancellationTokens: Array<CancellationToken | undefined> = [];
	readonly connectCalls: Array<{ readonly token: string; readonly authProvider: 'github' | 'microsoft'; readonly tunnelId: string; readonly clusterId: string; readonly connectionId: string }> = [];
	readonly connectCancellationTokens: Array<CancellationToken | undefined> = [];
	readonly connectDelays: Promise<void>[] = [];
	readonly connectErrors: Array<Error | undefined> = [];
	prepareSelectionCallCount = 0;
	readonly prepareSelectionCancellationTokens: Array<CancellationToken | undefined> = [];
	readonly completeSelectionCalls: Array<{ readonly selectionId: string; readonly selection: ITunnelGatewaySelection }> = [];
	readonly completeSelectionCancellationTokens: Array<CancellationToken | undefined> = [];
	readonly cancelSelectionCalls: string[] = [];
	readonly disconnectCalls: string[] = [];
	readonly protocolClientIds: string[] = [];

	async listTunnels(token: string, authProvider: 'github' | 'microsoft', additionalTunnelNames?: string[], cancellationToken?: CancellationToken): Promise<ITunnelInfo[]> {
		this.listCalls.push({ token, authProvider });
		this.listAdditionalTunnelNames.push(additionalTunnelNames);
		this.listCancellationTokens.push(cancellationToken);
		if (this.listError) {
			throw this.listError;
		}
		if (this.listPromise) {
			return [...await (cancellationToken ? raceCancellationError(this.listPromise, cancellationToken) : this.listPromise)];
		}
		return [...this.tunnels];
	}

	async deleteTunnel(_token: string, _authProvider: 'github' | 'microsoft', _tunnelId: string, _clusterId: string): Promise<void> {
		throw new Error('Unexpected tunnel deletion');
	}

	async connect(token: string, authProvider: 'github' | 'microsoft', tunnelId: string, clusterId: string, cancellationToken?: CancellationToken): Promise<ITunnelConnectResult> {
		const connectionId = `connection-${this.connectCalls.length + 1}`;
		this.connectCalls.push({ token, authProvider, tunnelId, clusterId, connectionId });
		this.connectCancellationTokens.push(cancellationToken);
		const error = this.connectErrors.shift();
		if (error) {
			throw error;
		}
		const delay = this.connectDelays.shift();
		if (delay) {
			await (cancellationToken ? raceCancellationError(delay, cancellationToken) : delay);
		}
		return {
			connectionId,
			address: `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`,
			name: tunnelId,
			connectionToken: 'connection-token',
			selected: { serverType: 'unknown', instanceId: '', role: 'primary', lifecycle: 'external' },
		};
	}

	async prepareSelection(_token: string, _authProvider: 'github' | 'microsoft', _tunnelId: string, _clusterId: string, cancellationToken?: CancellationToken): Promise<ITunnelGatewaySelectionSession | undefined> {
		this.prepareSelectionCallCount++;
		this.prepareSelectionCancellationTokens.push(cancellationToken);
		return this.selectionPromise
			? await (cancellationToken ? raceCancellationError(this.selectionPromise, cancellationToken) : this.selectionPromise)
			: this.selectionSession;
	}

	async completeSelection(selectionId: string, selection: ITunnelGatewaySelection, cancellationToken?: CancellationToken): Promise<ITunnelConnectResult> {
		this.completeSelectionCalls.push({ selectionId, selection });
		this.completeSelectionCancellationTokens.push(cancellationToken);
		if (this.completeSelectionPromise) {
			await (cancellationToken ? raceCancellationError(this.completeSelectionPromise, cancellationToken) : this.completeSelectionPromise);
		}
		return {
			connectionId: `selection-connection-${this.completeSelectionCalls.length}`,
			address: 'tunnel:selected',
			name: 'Selected tunnel',
			connectionToken: 'connection-token',
			selected: {
				serverType: 'standalone',
				instanceId: 'standalone-a',
				role: 'primary',
				lifecycle: 'managed',
			},
		};
	}

	async cancelSelection(selectionId: string): Promise<void> {
		this.cancelSelectionCalls.push(selectionId);
	}

	async relaySend(connectionId: string, messageText: string): Promise<void> {
		const message = JSON.parse(messageText) as ProtocolMessage;
		if (!hasKey(message, { id: true, method: true })) {
			return;
		}
		const request = message as JsonRpcRequest;
		const params = request.params as { readonly clientId?: string };
		if (params.clientId) {
			this.protocolClientIds.push(params.clientId);
		}
		if (request.method === 'initialize') {
			this._onDidRelayMessage.fire({
				connectionId,
				data: JSON.stringify({
					jsonrpc: '2.0',
					id: request.id,
					result: {
						protocolVersion: PROTOCOL_VERSION,
						serverSeq: 0,
						snapshots: [{ resource: ROOT_STATE_URI, state: { agents: [] }, fromSeq: 0 }],
					},
				}),
			});
		} else if (request.method === 'reconnect') {
			this._onDidRelayMessage.fire({
				connectionId,
				data: JSON.stringify({
					jsonrpc: '2.0',
					id: request.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				}),
			});
		}
	}

	async disconnect(connectionId: string): Promise<void> {
		this.disconnectCalls.push(connectionId);
	}

	closeRelay(connectionId: string): void {
		this._onDidRelayClose.fire(connectionId);
	}
}

suite('TunnelAgentHostRemoteTargetConnector', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IFixtureOptions {
		readonly credential?: IAgentHostFeatureAuthenticationCredential;
		readonly tunnels?: readonly ITunnelInfo[];
		readonly listPromise?: Promise<readonly ITunnelInfo[]>;
		readonly hostedTunnel?: HostedTunnelIdentity | IObservable<HostedTunnelIdentity>;
		readonly additionalTunnelNames?: IObservable<readonly string[]>;
		readonly prepareStorage?: (storageService: AgentHostStorageService) => void;
	}

	function createFixture(options: IFixtureOptions = {}) {
		const logService = new NullLogService();
		const storageService = disposables.add(new AgentHostStorageService(undefined, logService));
		options.prepareStorage?.(storageService);
		const authenticationRegistry = new TestFeatureAuthenticationRegistry();
		authenticationRegistry.setCredential(options.credential);
		const tunnelService = disposables.add(new TestTunnelAgentHostMainService());
		tunnelService.tunnels = options.tunnels ?? [];
		tunnelService.listPromise = options.listPromise;
		const hostedTunnel = isObservable<HostedTunnelIdentity>(options.hostedTunnel)
			? options.hostedTunnel
			: constObservable<HostedTunnelIdentity>(options.hostedTunnel ?? { kind: 'unknown' });
		const connector = disposables.add(new TunnelAgentHostRemoteTargetConnector(
			tunnelService,
			authenticationRegistry,
			storageService,
			logService,
			hostedTunnel,
			options.additionalTunnelNames,
		));
		const tunnelDiscoveryEnabled = observableValue<boolean>('testTunnelDiscoveryEnabled', true);
		let registeredConnector: IAgentHostRemoteTargetConnector | undefined;
		const activationContext: IAgentHostRemoteAgentsActivationContext = {
			cancellationToken: CancellationToken.None,
			tunnelDiscoveryEnabled,
			registerTargetConnector: value => { registeredConnector = value; },
		};
		const activation = disposables.add(connector.activate(activationContext));
		assert.strictEqual(registeredConnector, connector);
		return { activation, authenticationRegistry, connector, storageService, tunnelDiscoveryEnabled, tunnelService };
	}

	async function flushUntil(predicate: () => boolean): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (predicate()) {
				return;
			}
			await Promise.resolve();
		}
		throw new Error('Timed out waiting for tunnel connector state');
	}

	test('filters launcher labels and supported protocol versions', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [
				tunnel('eligible'),
				tunnel('wrong-label', { labels: ['other-launcher', 'protocolv6'] }),
				tunnel('old-protocol', { protocolVersion: 4 }),
			],
		});

		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get(),
			listCalls: fixture.tunnelService.listCalls,
		}, {
			targets: [{
				internalKey: JSON.stringify([AgentHostTunnelAuthenticationIssuer.GitHub, 'eligible']),
				targetId: 'tunnel:eligible',
				label: 'Tunnel eligible',
			}],
			listCalls: [{ token: 'github-token', authProvider: 'github' }],
		});
	});

	test('reconciles synchronized dismissal changes without another discovery request', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('existing-dismissal')],
		});
		await fixture.connector.refresh();

		fixture.storageService.set(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY, ['existing-dismissal']);
		const afterDismissal = fixture.connector.targets.get().map(target => target.targetId);
		fixture.storageService.set(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY, []);

		assert.deepStrictEqual({
			afterDismissal,
			afterRestore: fixture.connector.targets.get().map(target => target.targetId),
			discoveryRequests: fixture.tunnelService.listCalls.length,
		}, {
			afterDismissal: [],
			afterRestore: ['tunnel:existing-dismissal'],
			discoveryRequests: 1,
		});
	});

	test('passes configured additional tunnel names to authoritative discovery', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			additionalTunnelNames: constObservable(['shared-one', 'shared-two']),
		});

		await fixture.connector.refresh();

		assert.deepStrictEqual(fixture.tunnelService.listAdditionalTunnelNames, [['shared-one', 'shared-two']]);
	});

	test('refreshes once when configured additional tunnel names change', async () => {
		const additionalTunnelNames = observableValue<readonly string[]>('testAdditionalTunnelNames', []);
		const fixture = createFixture({
			credential: githubCredential,
			additionalTunnelNames,
		});
		await fixture.connector.refresh();

		additionalTunnelNames.set(['shared'], undefined);
		await flushUntil(() => fixture.tunnelService.listCalls.length === 2);

		assert.deepStrictEqual(fixture.tunnelService.listAdditionalTunnelNames, [undefined, ['shared']]);
	});

	test('excludes this host own tunnel before admission', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			hostedTunnel: { kind: 'hosted', tunnel: { tunnelId: 'self', tunnelName: 'Self' } },
			tunnels: [tunnel('self', { name: 'Self' }), tunnel('other')],
		});

		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
		}, {
			targets: ['tunnel:other'],
			suppressed: ['self'],
		});
	});

	test('surfaces needs-auth without reporting an empty successful catalog', async () => {
		const fixture = createFixture({ tunnels: [tunnel('hidden-without-auth')] });

		await assert.rejects(
			() => fixture.connector.refresh(),
			error => error instanceof TunnelAgentHostDiscoveryNeedsAuthenticationError,
		);

		assert.deepStrictEqual({
			status: fixture.connector.discoveryState.get(),
			listCalls: fixture.tunnelService.listCalls,
			targets: fixture.connector.targets.get(),
		}, {
			status: { kind: 'needsAuthentication' },
			listCalls: [],
			targets: [],
		});
	});

	test('refreshes when the in-memory credential arrives or is replaced', async () => {
		const fixture = createFixture({ tunnels: [tunnel('authenticated')] });

		fixture.authenticationRegistry.setCredential(githubCredential);
		await flushUntil(() => fixture.tunnelService.listCalls.length === 1);
		fixture.authenticationRegistry.setCredential({ ...githubCredential, token: 'replacement-token' });
		await flushUntil(() => fixture.tunnelService.listCalls.length === 2);

		assert.deepStrictEqual({
			tokens: fixture.tunnelService.listCalls.map(call => call.token),
			targets: fixture.connector.targets.get().map(target => target.targetId),
		}, {
			tokens: ['github-token', 'replacement-token'],
			targets: ['tunnel:authenticated'],
		});
	});

	test('removes and disconnects missing targets only after a successful authoritative refresh', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('one'), tunnel('two')],
		});
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get().every(target => target.status.get() === AgentHostRemoteTargetStatus.Connected));

		fixture.tunnelService.tunnels = [tunnel('two')];
		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			disconnectCalls: fixture.tunnelService.disconnectCalls,
		}, {
			targets: ['tunnel:two'],
			disconnectCalls: ['connection-1'],
		});
	});

	test('cancels an in-flight connection immediately when an authoritative refresh removes its target', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('removed-during-connect')],
		});
		await fixture.connector.refresh();
		const selection = new DeferredPromise<ITunnelGatewaySelectionSession | undefined>();
		fixture.tunnelService.selectionPromise = selection.p;
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => fixture.tunnelService.prepareSelectionCallCount === 1);

		fixture.tunnelService.tunnels = [];
		await fixture.connector.refresh();
		const immediatelyCancelled = fixture.tunnelService.prepareSelectionCancellationTokens[0]?.isCancellationRequested ?? false;
		selection.complete(undefined);
		await Promise.resolve();

		assert.deepStrictEqual({
			immediatelyCancelled,
			targets: targetRegistry.targets.get(),
		}, {
			immediatelyCancelled: true,
			targets: [],
		});
	});

	test('retains targets and cache after a failed refresh', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('retained')],
		});
		await fixture.connector.refresh();
		fixture.tunnelService.listError = new Error('enumeration failed');

		await assert.rejects(() => fixture.connector.refresh(), /enumeration failed/);

		assert.deepStrictEqual({
			status: fixture.connector.discoveryState.get().kind,
			targets: fixture.connector.targets.get().map(target => target.targetId),
			cached: fixture.storageService.get<readonly ICachedTunnel[]>(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY),
		}, {
			status: 'error',
			targets: ['tunnel:retained'],
			cached: [{
				tunnelId: 'retained',
				clusterId: 'cluster-retained',
				name: 'Tunnel retained',
				protocolVersion: 6,
				authProvider: 'github',
			}],
		});
	});

	test('does not poll after its startup refresh', () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('once')],
		});
		await fixture.connector.refresh();

		await timeout(60 * 60 * 1000);

		assert.strictEqual(fixture.tunnelService.listCalls.length, 1);
	}));

	test('preserves dismissals and auto-connect suppressions', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('dismissed'), tunnel('suppressed'), tunnel('visible')],
			prepareStorage: storageService => {
				storageService.set(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY, ['dismissed']);
				storageService.set(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY, ['suppressed']);
			},
		});

		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			cached: fixture.storageService.get<readonly ICachedTunnel[]>(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY)?.map(candidate => candidate.tunnelId),
			dismissed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
		}, {
			targets: ['tunnel:visible'],
			cached: ['suppressed', 'visible'],
			dismissed: ['dismissed'],
			suppressed: ['suppressed'],
		});
	});

	test('deduplicates repeated tunnels and repeated refreshes', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('one'), tunnel('one'), tunnel('two')],
		});
		await Promise.all([fixture.connector.refresh(), fixture.connector.refresh()]);
		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			listCallCount: fixture.tunnelService.listCalls.length,
		}, {
			targets: ['tunnel:one', 'tunnel:two'],
			listCallCount: 2,
		});
	});

	test('ignores a successful refresh that completes after activation disposal', async () => {
		const discovery = new DeferredPromise<readonly ITunnelInfo[]>();
		const fixture = createFixture({ credential: githubCredential, listPromise: discovery.p });
		const refresh = fixture.connector.refresh();

		fixture.activation.dispose();
		discovery.complete([tunnel('late')]);
		await assert.rejects(refresh, isCancellationError);

		assert.deepStrictEqual({
			status: fixture.connector.discoveryState.get(),
			targets: fixture.connector.targets.get(),
			cached: fixture.storageService.get<readonly ICachedTunnel[]>(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY),
		}, {
			status: { kind: 'disabled' },
			targets: [],
			cached: undefined,
		});
	});

	test('preserves the target handle and client identity through relay reconnect', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('reconnecting')],
		});
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const handle = targetRegistry.targets.get()[0];
		const connection = handle.requireConnection();
		assert.ok(connection instanceof AgentHostProtocolClientCore);

		fixture.tunnelService.closeRelay(fixture.tunnelService.connectCalls[0].connectionId);
		assert.strictEqual(connection.reconnectNow(), true);
		await flushUntil(() => fixture.tunnelService.connectCalls.length === 2 && handle.status.get() === AgentHostRemoteTargetStatus.Connected);

		assert.deepStrictEqual({
			sameHandle: targetRegistry.targets.get()[0] === handle,
			targetId: handle.targetId,
			connectCount: fixture.tunnelService.connectCalls.length,
			distinctRelayIds: new Set(fixture.tunnelService.connectCalls.map(call => call.connectionId)).size,
			protocolClientIds: fixture.tunnelService.protocolClientIds,
		}, {
			sameHandle: true,
			targetId: 'tunnel:reconnecting',
			connectCount: 2,
			distinctRelayIds: 2,
			protocolClientIds: [handle.clientId, handle.clientId],
		});
	});

	test('redials with a replacement credential when the same issuer rotates during connect', async () => {
		const firstConnect = new DeferredPromise<void>();
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('credential-rotation')],
		});
		fixture.tunnelService.connectDelays.push(firstConnect.p);
		await fixture.connector.refresh();
		const target = fixture.connector.targets.get()[0];
		const client = disposables.add(await fixture.connector.createConnection(target, {
			clientId: 'credential-rotation-client',
			cancellationToken: CancellationToken.None,
		}));
		const firstConnection = client.connect();
		await flushUntil(() => fixture.tunnelService.connectCalls.length === 1);

		fixture.authenticationRegistry.setCredential({ ...githubCredential, token: 'replacement-token' });
		firstConnect.complete();
		await assert.rejects(firstConnection, /credentials changed while connecting/);
		assert.strictEqual(client.reconnectNow(), true);
		await flushUntil(() => fixture.tunnelService.connectCalls.length === 2 && fixture.tunnelService.protocolClientIds.length === 1);

		assert.deepStrictEqual({
			clientId: client.clientId,
			tokens: fixture.tunnelService.connectCalls.map(call => call.token),
			attemptsReceivedCancellation: fixture.tunnelService.connectCancellationTokens.every(token => token !== undefined),
		}, {
			clientId: 'credential-rotation-client',
			tokens: ['github-token', 'replacement-token'],
			attemptsReceivedCancellation: true,
		});
	});

	test('removes a tunnel descriptor and cache entry when reconnect reports not found', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('removed-remotely')],
		});
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const connection = targetRegistry.targets.get()[0].requireConnection();
		assert.ok(connection instanceof AgentHostProtocolClientCore);

		fixture.tunnelService.connectErrors.push(new TunnelNotFoundError('removed-remotely'));
		fixture.tunnelService.closeRelay(fixture.tunnelService.connectCalls[0].connectionId);
		assert.strictEqual(connection.reconnectNow(), true);
		await flushUntil(() => targetRegistry.targets.get().length === 0);

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get(),
			cached: fixture.storageService.get<readonly ICachedTunnel[]>(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY),
		}, {
			targets: [],
			cached: [],
		});
	});

	test('uses deterministic background gateway selection for protocol-v6 tunnels', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('gateway')],
		});
		fixture.tunnelService.selectionSession = {
			selectionId: 'selection-1',
			inventory: {
				userDataPath: '/data',
				endpoints: [
					{ type: 'editor', pid: 1, instanceId: 'editor-a', endpointKind: 'tcp', endpointLabel: 'editor' },
					{ type: 'standalone', pid: 2, instanceId: 'standalone-z', endpointKind: 'tcp', endpointLabel: 'standalone-z' },
					{ type: 'standalone', pid: 3, instanceId: 'standalone-a', endpointKind: 'tcp', endpointLabel: 'standalone-a' },
				],
			},
		};
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);

		assert.deepStrictEqual({
			connectCalls: fixture.tunnelService.connectCalls,
			completeSelectionCalls: fixture.tunnelService.completeSelectionCalls,
		}, {
			connectCalls: [],
			completeSelectionCalls: [{
				selectionId: 'selection-1',
				selection: { instanceId: 'standalone-a' },
			}],
		});
	});

	test('cancels a pending gateway selection when activation is disposed', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('pending-selection')],
		});
		await fixture.connector.refresh();
		const selection = new DeferredPromise<ITunnelGatewaySelectionSession | undefined>();
		fixture.tunnelService.selectionPromise = selection.p;
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => fixture.tunnelService.prepareSelectionCallCount === 1);

		fixture.activation.dispose();
		const immediatelyCancelled = fixture.tunnelService.prepareSelectionCancellationTokens[0]?.isCancellationRequested ?? false;
		selection.complete({
			selectionId: 'cancelled-selection',
			inventory: { userDataPath: '/data', endpoints: [] },
		});
		await Promise.resolve();

		assert.deepStrictEqual({
			immediatelyCancelled,
			targets: targetRegistry.targets.get(),
			cancelSelectionCalls: fixture.tunnelService.cancelSelectionCalls,
			completeSelectionCalls: fixture.tunnelService.completeSelectionCalls,
			connectCalls: fixture.tunnelService.connectCalls,
		}, {
			immediatelyCancelled: true,
			targets: [],
			cancelSelectionCalls: [],
			completeSelectionCalls: [],
			connectCalls: [],
		});
	});

	test('discovery disable removes admitted targets and disconnects exactly once', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('cleanup')],
		});
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);

		fixture.tunnelDiscoveryEnabled.set(false, undefined);
		await flushUntil(() => fixture.connector.discoveryState.get().kind === 'disabled');
		const afterDiscoveryDisable = {
			targetCount: targetRegistry.targets.get().length,
			disconnectCount: fixture.tunnelService.disconnectCalls.length,
		};

		fixture.activation.dispose();
		fixture.activation.dispose();

		assert.deepStrictEqual({
			afterDiscoveryDisable,
			finalTargetCount: targetRegistry.targets.get().length,
			disconnectCalls: fixture.tunnelService.disconnectCalls,
		}, {
			afterDiscoveryDisable: { targetCount: 0, disconnectCount: 1 },
			finalTargetCount: 0,
			disconnectCalls: ['connection-1'],
		});
	});

	test('discovery disable cancels a pending gateway acknowledgement immediately', async () => {
		const completion = new DeferredPromise<void>();
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('pending-completion')],
		});
		fixture.tunnelService.selectionSession = {
			selectionId: 'pending-completion-selection',
			inventory: { userDataPath: '/data', endpoints: [] },
		};
		fixture.tunnelService.completeSelectionPromise = completion.p;
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => fixture.tunnelService.completeSelectionCalls.length === 1);

		fixture.tunnelDiscoveryEnabled.set(false, undefined);
		const immediatelyCancelled = fixture.tunnelService.completeSelectionCancellationTokens[0]?.isCancellationRequested ?? false;
		completion.complete();
		await Promise.resolve();

		assert.deepStrictEqual({
			immediatelyCancelled,
			targets: targetRegistry.targets.get(),
			disconnectCalls: fixture.tunnelService.disconnectCalls,
		}, {
			immediatelyCancelled: true,
			targets: [],
			disconnectCalls: [],
		});
	});

	test('credential loss removes dependent targets without persisting tokens', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			tunnels: [tunnel('credential-bound')],
		});
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const storedBeforeLoss = JSON.stringify({
			cached: fixture.storageService.get<readonly ICachedTunnel[]>(TUNNEL_AGENT_HOST_CACHED_TUNNELS_STORAGE_KEY),
			dismissed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_DISMISSALS_STORAGE_KEY),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
		});

		fixture.authenticationRegistry.setCredential(undefined);
		await flushUntil(() => fixture.connector.discoveryState.get().kind === 'needsAuthentication');

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get(),
			tokenPersisted: storedBeforeLoss.includes(githubCredential.token),
			disconnectCalls: fixture.tunnelService.disconnectCalls,
		}, {
			targets: [],
			tokenPersisted: false,
			disconnectCalls: ['connection-1'],
		});
	});

	test('evicts and reconnects targets as the observable hosted tunnel identity becomes known and changes', async () => {
		const hostedTunnel = observableValue<HostedTunnelIdentity>('testHostedTunnel', { kind: 'unknown' });
		const fixture = createFixture({
			credential: githubCredential,
			hostedTunnel,
			tunnels: [tunnel('self'), tunnel('other')],
		});
		await fixture.connector.refresh();
		const targetRegistry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		disposables.add(targetRegistry.registerConnector(fixture.connector));
		await flushUntil(() => targetRegistry.targets.get().every(target => target.status.get() === AgentHostRemoteTargetStatus.Connected));

		hostedTunnel.set({ kind: 'hosted', tunnel: { tunnelId: 'self', tunnelName: 'Tunnel self' } }, undefined);
		await flushUntil(() => fixture.connector.targets.get().map(target => target.targetId).join(',') === 'tunnel:other');
		hostedTunnel.set({ kind: 'hosted', tunnel: { tunnelId: 'other', tunnelName: 'Tunnel other' } }, undefined);
		await flushUntil(() => fixture.connector.targets.get().map(target => target.targetId).join(',') === 'tunnel:self');

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
			disconnectCalls: fixture.tunnelService.disconnectCalls,
		}, {
			targets: ['tunnel:self'],
			suppressed: ['other'],
			disconnectCalls: ['connection-1', 'connection-2'],
		});
	});

	test('clears connector-owned self suppression when hosting becomes confirmed absent', async () => {
		const hostedTunnel = observableValue<HostedTunnelIdentity>('testHostedTunnel', { kind: 'unknown' });
		const fixture = createFixture({
			credential: githubCredential,
			hostedTunnel,
			tunnels: [tunnel('self'), tunnel('other')],
		});
		await fixture.connector.refresh();

		hostedTunnel.set({ kind: 'hosted', tunnel: { tunnelId: 'self', tunnelName: 'Tunnel self' } }, undefined);
		await flushUntil(() => fixture.connector.targets.get().map(target => target.targetId).join(',') === 'tunnel:other');
		hostedTunnel.set({ kind: 'unhosted' }, undefined);
		await flushUntil(() => fixture.connector.targets.get().map(target => target.targetId).join(',') === 'tunnel:self,tunnel:other');

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
		}, {
			targets: ['tunnel:self', 'tunnel:other'],
			suppressed: [],
		});
	});

	test('clears persisted connector-owned suppression when bootstrap confirms initial absence', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			hostedTunnel: { kind: 'unhosted' },
			tunnels: [tunnel('previous-self'), tunnel('other')],
			prepareStorage: storageService => {
				storageService.set(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY, ['previous-self']);
				storageService.set(TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY, ['previous-self']);
			},
		});

		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
			owned: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_SELF_SUPPRESSIONS_STORAGE_KEY),
			discoveryRequests: fixture.tunnelService.listCalls.length,
		}, {
			targets: ['tunnel:previous-self', 'tunnel:other'],
			suppressed: [],
			owned: [],
			discoveryRequests: 1,
		});
	});

	test('clears connector-owned self suppression after authoritative disappearance', async () => {
		const fixture = createFixture({
			credential: githubCredential,
			hostedTunnel: { kind: 'hosted', tunnel: { tunnelId: 'self', tunnelName: 'Tunnel self' } },
			tunnels: [tunnel('self'), tunnel('other')],
		});
		await fixture.connector.refresh();

		fixture.tunnelService.tunnels = [tunnel('other')];
		await fixture.connector.refresh();

		assert.deepStrictEqual({
			targets: fixture.connector.targets.get().map(target => target.targetId),
			suppressed: fixture.storageService.get<readonly string[]>(TUNNEL_AGENT_HOST_AUTO_CONNECT_SUPPRESSIONS_STORAGE_KEY),
		}, {
			targets: ['tunnel:other'],
			suppressed: [],
		});
	});

	test('explicit refresh fails while tunnel discovery is disabled', async () => {
		const fixture = createFixture({ credential: githubCredential });
		fixture.tunnelDiscoveryEnabled.set(false, undefined);

		await assert.rejects(
			() => fixture.connector.refresh(),
			error => error instanceof TunnelAgentHostDiscoveryDisabledError,
		);
	});
});
