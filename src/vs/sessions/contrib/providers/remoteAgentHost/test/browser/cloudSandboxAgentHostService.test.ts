/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	CloudSandboxEnabledSettingId,
	cloudSandboxAddress,
	ICloudSandboxApiService,
	type CloudSandboxConnectResult,
	type ICloudSandboxClientToken,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { CloudSandboxAgentHostService, MAX_SEALED_TOKEN_RETRIES } from '../../browser/cloudSandboxAgentHostService.js';

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
	}());
	instantiationService.stub(IEnvironmentService, new class extends mock<IEnvironmentService>() {
		override readonly logsHome = URI.file('/logs');
	}());
	instantiationService.stub(ILogService, new NullLogService());

	return {
		service: store.add(instantiationService.createInstance(TestCloudSandboxAgentHostService)),
		connectCalls: () => calls,
	};
}

suite('CloudSandboxAgentHostService sealed token', () => {

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
