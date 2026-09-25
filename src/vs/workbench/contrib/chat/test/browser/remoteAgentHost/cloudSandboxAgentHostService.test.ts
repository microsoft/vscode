/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { AgentHostProtocolClient, InitialAuthenticationError, type IAgentHostProtocolClientOptions } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import {
	CloudSandboxEnabledSettingId,
	cloudSandboxAddress,
	ICloudSandboxApiService,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
	type ICloudSandboxConnectOptions,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostConnectionFactory, IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionObserver, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITelemetryData, ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { CloudSandboxAgentHostService, MAX_SEALED_TOKEN_RETRIES } from '../../../browser/remoteAgentHost/cloudSandboxAgentHostService.js';
import { CloudSandboxTelemetryService, ICloudSandboxTelemetryService } from '../../../browser/remoteAgentHost/cloudSandboxTelemetry.js';

function clientToken(sealed: string | undefined): ICloudSandboxClientToken {
	return {
		access_token: 'wps-token',
		expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
		wps_endpoint: 'wss://relay.example.com',
		hub: 'hub',
		subprotocol: 'json.reliable.webpubsub.azure.v1',
		client_id: 'client-1',
		groups: { to_host: 'to_host', to_client: 'to_client', broadcast: 'broadcast' },
		...(sealed ? { encrypted_github_token: sealed } : {}),
	} as ICloudSandboxClientToken;
}

/** Exposes the re-mint delay and skips the relay, so the mint loop runs in isolation. */
class TestCloudSandboxAgentHostService extends CloudSandboxAgentHostService {
	protected override readonly sealedTokenRetryDelayMs = 0;

	/** The sealed token as it stood when minting finished. */
	sealedTokenAtEstablish: string | undefined;
	connectThroughFactory = false;

	protected override async _establish(options: ICloudSandboxConnectOptions, address: string, clientToken: ICloudSandboxClientToken, token: CancellationToken): Promise<string> {
		this.sealedTokenAtEstablish = clientToken.encrypted_github_token;
		return this.connectThroughFactory ? super._establish(options, address, clientToken, token) : address;
	}
}

type ScriptedConnectResult = CloudSandboxConnectResult | Error | (() => Promise<CloudSandboxConnectResult>);

function createService(store: Pick<{ add<T extends { dispose(): void }>(t: T): T }, 'add'>, results: readonly ScriptedConnectResult[]) {
	let calls = 0;
	let factory: IRemoteAgentHostConnectionFactory | undefined;
	let observer: RemoteAgentHostConnectionObserver | undefined;
	let info: IRemoteAgentHostConnectionInfo | undefined;
	const started = new DeferredPromise<void>();
	let ready = new DeferredPromise<IRemoteAgentHostConnectionInfo>();
	const events: { eventName: string; data?: ITelemetryData }[] = [];
	const instantiationService = store.add(new TestInstantiationService());
	const telemetry = store.add(new CloudSandboxTelemetryService(new class extends mock<ITelemetryService>() {
		override publicLog2(eventName: string, data?: ITelemetryData): void { events.push({ eventName, data }); }
	}()));
	instantiationService.stub(ICloudSandboxTelemetryService, telemetry);

	const configurationService = new TestConfigurationService();
	configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, true);
	configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
	instantiationService.stub(IConfigurationService, configurationService);

	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override async connect(): Promise<CloudSandboxConnectResult> {
			// Hold the last result so a caller can keep re-minting past the scripted responses.
			const result = results[Math.min(calls, results.length - 1)];
			calls++;
			if (result instanceof Error) {
				throw result;
			}
			return typeof result === 'function' ? result() : result;
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
		override readonly onDidChangeConnections = Event.None;
		override get connections() { return info ? [info] : []; }
		override getConnection() { return info?.status.kind === 'connected' ? new class extends mock<IAgentConnection>() { }() : undefined; }
		override registerConnectionFactory(value: IRemoteAgentHostConnectionFactory) {
			factory = value;
			return { dispose: () => observer?.('disposed') };
		}
		override reconnect(address: string): void {
			if (info?.status.kind === 'reconnecting') {
				ready = new DeferredPromise<IRemoteAgentHostConnectionInfo>();
				info = { ...info, status: RemoteAgentHostConnectionStatus.connecting };
				observer?.('connecting');
			}
			if (!observer) {
				const entry = factory?.entries.get()[0];
				assert.ok(entry);
				observer = factory?.getConnectionObserver?.(entry);
				observer?.('connecting');
				info = { address, name: 'Sandbox', status: RemoteAgentHostConnectionStatus.connecting };
				started.complete();
			}
		}
		override waitForConnection(): Promise<IRemoteAgentHostConnectionInfo> { return ready.p; }
		override async removeRemoteAgentHost(): Promise<void> {
			observer?.('disposed');
			info = undefined;
		}
	}());
	instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
		override readonly logsHome = URI.file('/logs');
	}());
	instantiationService.stub(ILogService, new NullLogService());

	return {
		service: store.add(instantiationService.createInstance(TestCloudSandboxAgentHostService)),
		instantiationService,
		getFactory(): IRemoteAgentHostConnectionFactory {
			assert.ok(factory);
			return factory;
		},
		connectCalls: () => calls,
		events,
		started: started.p,
		setState(state: 'reconnecting' | 'connected'): void {
			assert.ok(info);
			info = { ...info, status: state === 'connected' ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.reconnecting };
			observer?.(state);
		},
		settle(error?: Error): void {
			assert.ok(info);
			info = { ...info, status: error ? RemoteAgentHostConnectionStatus.disconnected : RemoteAgentHostConnectionStatus.connected };
			if (error) {
				ready.error(error);
			} else {
				observer?.('connected');
				ready.complete(info);
			}
		},
	};
}

suite('CloudSandboxAgentHostService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	async function createRecoveryFixture() {
		const initialToken = { ...clientToken('copilot-sealed.v1.key.original'), expires_at: new Date(Date.now()).toISOString() };
		const fixture = createService(store, [{ kind: 'token', token: initialToken }]);
		fixture.service.connectThroughFactory = true;
		const connecting = fixture.service.connect({ environmentId: 'env-1', sessionId: 'session-1', name: 'Sandbox' }, CancellationToken.None);
		await fixture.started;
		const response = new DeferredPromise<CloudSandboxConnectResult>();
		let refreshCalls = 0;
		fixture.instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
			override async reconnect(): Promise<CloudSandboxConnectResult> {
				refreshCalls++;
				return response.p;
			}
		}());
		fixture.instantiationService.stubInstance(AgentHostProtocolClient, {
			dispose: () => { },
			onDidChangeConnectionState: Event.None,
		});
		const createInstance = sinon.spy(fixture.instantiationService, 'createInstance');
		const factory = fixture.getFactory();
		const created = await factory.createConnection(factory.entries.get()[0], { userInitiated: true });
		assert.ok(created.transportDisposable);
		store.add(created.transportDisposable);
		store.add(created.connection);
		const call = createInstance.getCalls().find(call => call.args[0] === AgentHostProtocolClient);
		const options = call?.args[3] as IAgentHostProtocolClientOptions | undefined;
		assert.ok(options?.prepareReconnect);
		return {
			...fixture, response, initialToken, resources: created.transportDisposable,
			prepareReconnect: options.prepareReconnect,
			refreshCalls: () => refreshCalls,
			async finish(): Promise<void> {
				fixture.settle();
				await connecting;
				created.transportDisposable?.dispose();
				fixture.service.dispose();
			},
		};
	}

	test('refreshes expired credentials before reconnect even before the first successful connection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = await createRecoveryFixture();
		const preparing = fixture.prepareReconnect();
		const sealedWhileRefreshing = fixture.service.getSealedGitHubToken('env-1');
		await fixture.response.complete({ kind: 'token', token: clientToken('copilot-sealed.v1.key.refreshed') });
		await preparing;
		const sealedAfterRefresh = fixture.service.getSealedGitHubToken('env-1');
		await fixture.finish();

		assert.deepStrictEqual({ calls: fixture.refreshCalls(), sealedWhileRefreshing, sealedAfterRefresh }, {
			calls: 1, sealedWhileRefreshing: fixture.initialToken.encrypted_github_token, sealedAfterRefresh: 'copilot-sealed.v1.key.refreshed',
		});
	}));

	test('disposes recovery refresh with the connection resources and ignores its late result', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = await createRecoveryFixture();
		const preparing = assert.rejects(fixture.prepareReconnect(), isCancellationError);
		fixture.resources.dispose();
		await preparing;
		await fixture.response.complete({ kind: 'token', token: clientToken('copilot-sealed.v1.key.late') });
		await timeout(60_000);
		const sealedAfterDisposal = fixture.service.getSealedGitHubToken('env-1');
		await fixture.finish();

		assert.deepStrictEqual({ calls: fixture.refreshCalls(), sealedAfterDisposal }, {
			calls: 1, sealedAfterDisposal: fixture.initialToken.encrypted_github_token,
		});
	}));

	test('re-mints credentials until the sealed GitHub token arrives', async () => {
		// A fresh environment can answer `/connect` before its credentials are complete.
		const { service, connectCalls } = createService(store, [
			{ kind: 'token', token: clientToken(undefined) },
			{ kind: 'token', token: clientToken(undefined) },
			{ kind: 'token', token: clientToken('copilot-sealed.v1.key.payload') },
		]);

		await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);

		assert.deepStrictEqual({ calls: connectCalls(), sealed: service.sealedTokenAtEstablish }, {
			calls: 3,
			sealed: 'copilot-sealed.v1.key.payload',
		});
	});

	suite('connection telemetry', () => {
		const options: ICloudSandboxConnectOptions = { environmentId: 'env-1', name: 'Sandbox' };
		const sealedToken: CloudSandboxConnectResult = { kind: 'token', token: clientToken('copilot-sealed.v1.key.payload') };

		test('includes waking and credential waiting through AHP readiness, and excludes ready reuse', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [
				async () => {
					await timeout(1000);
					return { kind: 'waking', waking: { retryAfterSeconds: 2 } };
				},
				{ kind: 'token', token: clientToken(undefined) },
				async () => {
					await timeout(1000);
					return sealedToken;
				},
			]);
			fixture.service.connectThroughFactory = true;
			const connecting = fixture.service.connect(options, CancellationToken.None);
			await fixture.started;
			await timeout(5000);
			fixture.settle();
			await connecting;
			await fixture.service.connect(options, CancellationToken.None);
			fixture.service.dispose();
			assert.deepStrictEqual({ calls: fixture.connectCalls(), events: fixture.events }, {
				calls: 3,
				events: [{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 9000 } }],
			});
		}));

		test('overlapping callers and duplicate completion do not multiply a physical connect', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [sealedToken]);
			fixture.service.connectThroughFactory = true;
			const first = fixture.service.connect(options, CancellationToken.None);
			const second = fixture.service.connect(options, CancellationToken.None);
			await fixture.started;
			await timeout(3000);
			fixture.settle();
			await Promise.all([first, second]);
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 3000 } },
			]);
		}));

		test('a failed credential request joining recovery does not discard the ongoing outage or healthy exposure', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [sealedToken, new Error('mint failed')]);
			fixture.service.connectThroughFactory = true;
			const connecting = fixture.service.connect(options, CancellationToken.None);
			await fixture.started;
			fixture.settle();
			await connecting;
			await timeout(1000);
			fixture.setState('reconnecting');
			await timeout(1000);
			await assert.rejects(fixture.service.connect(options, CancellationToken.None));
			await timeout(2000);
			fixture.setState('connected');
			await timeout(1000);
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 0 } },
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'recover', outcome: 'success', stage: 'connection', durationMs: 3000 } },
				{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 2000, unexpectedDisconnects: 1, receivedFrames: 0 } },
			]);
		}));

		test('a failed redial joining recovery is a failure, not a cleanup cancellation', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [sealedToken]);
			fixture.service.connectThroughFactory = true;
			const connecting = fixture.service.connect(options, CancellationToken.None);
			await fixture.started;
			fixture.settle();
			await connecting;
			await timeout(1000);
			fixture.setState('reconnecting');
			await timeout(1000);
			const redial = assert.rejects(fixture.service.connect(options, CancellationToken.None));
			await timeout(1000);
			fixture.settle(new Error('dial failed'));
			await redial;
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'success', stage: 'connection', durationMs: 0 } },
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'recover', outcome: 'failure', stage: 'connection', durationMs: 2000 } },
				{ eventName: 'cloudSandboxConnectionHealth', data: { connectedMs: 1000, unexpectedDisconnects: 1, receivedFrames: 0 } },
			]);
		}));

		test('reports a mint failure before any protocol client is created', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [async () => {
				await timeout(1700);
				throw new Error('private request details must not escape');
			}]);
			await assert.rejects(fixture.service.connect(options, CancellationToken.None));
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'failure', stage: 'credentials', durationMs: 1700 } },
			]);
		}));

		test('reports an authentication failure before cleanup can relabel it as cancellation', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [sealedToken]);
			fixture.service.connectThroughFactory = true;
			const connecting = assert.rejects(fixture.service.connect(options, CancellationToken.None), InitialAuthenticationError);
			await fixture.started;
			await timeout(2400);
			fixture.settle(new InitialAuthenticationError(new Error('private token details')));
			await connecting;
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'failure', stage: 'connection', durationMs: 2400 } },
			]);
		}));

		test('cancellation while waiting for credentials wins over a late token', () => runWithFakedTimers({}, async () => {
			const minted = new DeferredPromise<CloudSandboxConnectResult>();
			const fixture = createService(store, [() => minted.p]);
			fixture.service.connectThroughFactory = true;
			const cts = store.add(new CancellationTokenSource());
			const connecting = assert.rejects(fixture.service.connect(options, cts.token), isCancellationError);
			await timeout(1100);
			cts.cancel();
			await timeout(900);
			minted.complete(sealedToken);
			await connecting;
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'cancelled', stage: 'credentials', durationMs: 1100 } },
			]);
		}));

		test('cancellation of a pending handshake ignores late readiness callbacks', () => runWithFakedTimers({}, async () => {
			const fixture = createService(store, [sealedToken]);
			fixture.service.connectThroughFactory = true;
			const cts = store.add(new CancellationTokenSource());
			const connecting = assert.rejects(fixture.service.connect(options, cts.token), isCancellationError);
			await fixture.started;
			await timeout(1200);
			cts.cancel();
			fixture.settle();
			await connecting;
			fixture.service.dispose();
			assert.deepStrictEqual(fixture.events, [
				{ eventName: 'cloudSandboxConnectionOutcome', data: { operation: 'connect', outcome: 'cancelled', stage: 'connection', durationMs: 1200 } },
			]);
		}));
	});

	test('gives up re-minting and connects anyway, since a host may never seal one', async () => {
		// Refusing to connect would be worse than a session that cannot reach GitHub APIs.
		const { service, connectCalls } = createService(store, [
			{ kind: 'token', token: clientToken(undefined) },
		]);

		await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);

		// Bounded, and the connection still proceeds unsealed. Initial mint plus one per retry.
		assert.deepStrictEqual({ calls: connectCalls(), sealed: service.sealedTokenAtEstablish }, {
			calls: MAX_SEALED_TOKEN_RETRIES + 1,
			sealed: undefined,
		});
	});

	test('does not re-mint when the first credentials already carry a sealed token', async () => {
		const { service, connectCalls } = createService(store, [
			{ kind: 'token', token: clientToken('copilot-sealed.v1.key.payload') },
		]);

		await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);

		assert.strictEqual(connectCalls(), 1);
	});

	test('keeps re-minting when the value is present but not a sealed envelope', async () => {
		// A plaintext bearer is refused when forwarding, so accepting it here would skip re-minting.
		const { service, connectCalls } = createService(store, [
			{ kind: 'token', token: clientToken('ghu_plaintext') },
			{ kind: 'token', token: clientToken('copilot-sealed.v1.key.payload') },
		]);

		await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);

		assert.deepStrictEqual({ calls: connectCalls(), sealed: service.sealedTokenAtEstablish }, {
			calls: 2,
			sealed: 'copilot-sealed.v1.key.payload',
		});
	});

	test('connects with the initial credentials when a re-mint fails', async () => {
		// A transient failure while chasing the seal must not discard credentials that work.
		const { service } = createService(store, [
			{ kind: 'token', token: clientToken(undefined) },
			new Error('network blip'),
		]);

		const address = await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);

		assert.deepStrictEqual({ address, sealed: service.sealedTokenAtEstablish }, {
			address: cloudSandboxAddress('env-1'),
			sealed: undefined,
		});
	});

	test('stops re-minting when the environment goes back to waking', async () => {
		// Re-entering the wake loop would stack two waits; the handshake watchdog covers this.
		const { service, connectCalls } = createService(store, [
			{ kind: 'token', token: clientToken(undefined) },
			{ kind: 'waking', waking: { retryAfterSeconds: 5 } as never },
		]);

		await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);

		assert.deepStrictEqual({ calls: connectCalls(), sealed: service.sealedTokenAtEstablish }, {
			calls: 2,
			sealed: undefined,
		});
	});
});
