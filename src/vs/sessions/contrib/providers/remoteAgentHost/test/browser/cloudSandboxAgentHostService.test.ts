/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import {
	CloudSandboxEnabledSettingId,
	cloudSandboxAddress,
	ICloudSandboxApiService,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostConnectionFactory, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { CloudSandboxAgentHostService, MAX_SEALED_TOKEN_RETRIES } from '../../browser/cloudSandboxAgentHostService.js';
import { createCloudSandboxConnectionCustomization } from '../../browser/cloudSandboxConnectionCustomization.js';
import { createCloudSandboxProject as project, createCloudSandboxProjectsTestConnection } from './cloudSandboxProjectsTestUtils.js';

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

	protected override async _establish(_options: never, address: string, clientToken: { encrypted_github_token?: string }): Promise<string> {
		this.sealedTokenAtEstablish = clientToken.encrypted_github_token;
		return address;
	}
}

type ScriptedConnectResult = CloudSandboxConnectResult | Error;

function createService(store: Pick<{ add<T extends { dispose(): void }>(t: T): T }, 'add'>, results: readonly ScriptedConnectResult[]): { service: TestCloudSandboxAgentHostService; connectCalls: () => number } {
	let calls = 0;
	const instantiationService = store.add(new TestInstantiationService());

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
			return result;
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
		override readonly onDidChangeConnections = Event.None;
		override readonly connections = [];
		override getConnection() { return undefined; }
		override registerConnectionFactory(_factory: IRemoteAgentHostConnectionFactory) { return { dispose() { } }; }
	}());
	instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
		override readonly logsHome = URI.file('/logs');
	}());
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IProgressService, { withProgress: (_options, task) => task({ report: () => { } }) });

	return {
		service: store.add(instantiationService.createInstance(TestCloudSandboxAgentHostService)),
		connectCalls: () => calls,
	};
}

suite('CloudSandboxAgentHostService', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

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

	suite('project connections', () => {
		const repository = URI.parse('https://github.com/owner/repo');

		async function createHarness() {
			const instantiationService = store.add(new TestInstantiationService());
			const remote = new class extends mock<IRemoteAgentHostService>() {
				factory: IRemoteAgentHostConnectionFactory | undefined;
				override readonly connections = [];
				override getConnection() { return undefined; }
				override registerConnectionFactory(factory: IRemoteAgentHostConnectionFactory) {
					this.factory = factory;
					return toDisposable(() => { this.factory = undefined; });
				}
				override reconnect(): void { }
				override async waitForConnection(address: string) {
					return { address, name: 'Sandbox', clientId: 'client-1', status: RemoteAgentHostConnectionStatus.connected };
				}
			}();
			instantiationService.stub(IRemoteAgentHostService, remote);
			instantiationService.stub(IConfigurationService, new TestConfigurationService({
				[CloudSandboxEnabledSettingId]: true,
				[RemoteAgentHostsEnabledSettingId]: true,
			}));
			instantiationService.stub(ICloudSandboxApiService, {
				connect: async () => ({ kind: 'token', token: clientToken('copilot-sealed.v1.key.payload') }),
			});
			instantiationService.stub(IEnvironmentService, { logsHome: URI.file('/logs') });
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IProgressService, { withProgress: (_options, task) => task({ report: () => { } }) });
			const service = store.add(instantiationService.createInstance(CloudSandboxAgentHostService));
			await service.connect({ environmentId: 'env-1', name: 'Sandbox' }, CancellationToken.None);
			const factory = remote.factory;
			assert.ok(factory);
			const entry = factory.entries.get()[0];
			assert.ok(entry);
			return {
				service,
				createConnection: async (client: AgentHostProtocolClient) => {
					instantiationService.stubInstance(AgentHostProtocolClient, client);
					const created = await factory.createConnection(entry, { userInitiated: true });
					assert.ok(created.transportDisposable);
					return { connection: created.connection, lifetime: store.add(created.transportDisposable) };
				},
			};
		}

		test('the sandbox customization uses the typed adapter created with its connection', async () => {
			const h = await createHarness();
			const raw = createCloudSandboxProjectsTestConnection(store, { projects: [project()] });
			const created = await h.createConnection(raw.connection);
			const prepare = createCloudSandboxConnectionCustomization(cloudSandboxAddress('env-1'), h.service)?.prepareWorkingDirectory;
			assert.ok(prepare);
			const result = await prepare(created.connection, repository, CancellationToken.None);
			assert.deepStrictEqual({ directory: result?.toString(), requests: raw.requests }, {
				directory: toAgentHostUri(URI.file('/checkout/owner/repo'), 'sandbox').toString(),
				requests: [],
			});
		});

		test('disposing an old connection cannot remove the replacement adapter at the same address', async () => {
			const h = await createHarness();
			const firstRaw = createCloudSandboxProjectsTestConnection(store, { projects: [project()] });
			const secondRaw = createCloudSandboxProjectsTestConnection(store, { projects: [project({ path: '/replacement/owner/repo' })] });
			const first = await h.createConnection(firstRaw.connection);
			const second = await h.createConnection(secondRaw.connection);
			first.lifetime.dispose();
			await assert.rejects(h.service.prepareWorkingDirectory(first.connection, repository, CancellationToken.None), /connection is no longer available/);
			const result = await h.service.prepareWorkingDirectory(second.connection, repository, CancellationToken.None);
			assert.strictEqual(result?.toString(), toAgentHostUri(URI.file('/replacement/owner/repo'), 'sandbox').toString());
		});

		for (const awaitingResponse of [false, true]) {
			test(`disposing the connection cancels preparation (${awaitingResponse ? 'clone response' : 'catalogue readiness'})`, async () => {
				const response = new DeferredPromise<unknown>();
				const h = await createHarness();
				const raw = createCloudSandboxProjectsTestConnection(store, {
					projects: awaitingResponse ? [] : [project({ status: 'cloning', git: false })],
					request: () => response.p,
				});
				const created = await h.createConnection(raw.connection);
				const result = h.service.prepareWorkingDirectory(created.connection, repository, CancellationToken.None);
				created.lifetime.dispose();
				await assert.rejects(result, CancellationError);
				assert.strictEqual(raw.hasListeners(), false);
				response.complete({ project: project() });
			});
		}

		test('a connection not created by the sandbox factory cannot prepare a project', async () => {
			const h = await createHarness();
			const raw = createCloudSandboxProjectsTestConnection(store);
			await assert.rejects(h.service.prepareWorkingDirectory(raw.connection, repository, CancellationToken.None), /connection is no longer available/);
			assert.deepStrictEqual(raw.requests, []);
		});
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
