/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun, observableValue } from '../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { AuthenticateParams } from '../../common/agent.js';
import { AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID, AgentHostTunnelAuthenticationIssuer, createAgentHostTunnelProtectedResources } from '../../common/agentHostFeatureAuthentication.js';
import { AgentHostClientState, AgentHostProtocolClientCore } from '../../common/agentHostProtocolClient.js';
import { AhpErrorCodes, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IProtocolTransport } from '../../common/state/sessionTransport.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { AuthRequiredReason } from '../../common/state/sessionActions.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostFeatureAuthenticationRegistry } from '../../node/agentHostFeatureAuthentication.js';
import { MockAgent } from './mockAgent.js';

const authenticationProviders = {
	github: { scopes: ['tunnel:manage', 'user:email'] },
	microsoft: { scopes: ['https://management.core.windows.net//.default', 'offline_access'] },
};

type ProtocolRequest = Extract<ProtocolMessage, { readonly id: number; readonly method: string }>;

class RecordingLogService extends NullLogService {
	readonly entries: string[] = [];

	override trace(message: string, ...args: unknown[]): void {
		this.entries.push([message, ...args].map(value => String(value)).join(' '));
	}

	override error(message: string | Error, ...args: unknown[]): void {
		this.entries.push([message, ...args].map(value => String(value)).join(' '));
	}
}

class OrderedAuthenticationAgent extends MockAgent {
	readonly firstAuthenticationStarted = new DeferredPromise<void>();
	readonly releaseFirstAuthentication = new DeferredPromise<void>();

	override async authenticate(resource: string, token: string, expiresIn?: number): Promise<boolean> {
		this.authenticateCalls.push({ resource, token, ...(expiresIn === undefined ? {} : { expiresIn }) });
		if (token) {
			this.firstAuthenticationStarted.complete();
			await this.releaseFirstAuthentication.p;
		}
		return true;
	}
}

class AuthenticationProtocolTransport extends Disposable implements IProtocolTransport {
	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly sentMessages: ProtocolMessage[] = [];

	send(message: ProtocolMessage): void {
		this.sentMessages.push(message);
	}

	fireMessage(message: ProtocolMessage): void {
		this._onMessage.fire(message);
	}

	fireClose(): void {
		this._onClose.fire();
	}
}

suite('AgentHostFeatureAuthenticationRegistry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createActiveRegistry(initialTunnelDiscoveryEnabled = true): {
		readonly registry: AgentHostFeatureAuthenticationRegistry;
		readonly tunnelDiscoveryEnabled: ReturnType<typeof observableValue<boolean>>;
		readonly activation: DisposableStore;
	} {
		const registry = disposables.add(new AgentHostFeatureAuthenticationRegistry(authenticationProviders));
		const tunnelDiscoveryEnabled = observableValue<boolean>('testTunnelDiscoveryEnabled', initialTunnelDiscoveryEnabled);
		const activation = disposables.add(new DisposableStore());
		activation.add(registry.activate({
			cancellationToken: CancellationToken.None,
			tunnelDiscoveryEnabled,
			registerTargetConnector: () => { },
		}));
		return { registry, tunnelDiscoveryEnabled, activation };
	}

	async function waitForRequest(transport: AuthenticationProtocolTransport, method: string, index = 0): Promise<ProtocolRequest> {
		const deadline = Date.now() + 5_000;
		while (true) {
			const requests = transport.sentMessages.filter(
				(message): message is ProtocolRequest => 'method' in message && message.method === method && 'id' in message,
			);
			if (requests[index]) {
				return requests[index];
			}
			if (Date.now() > deadline) {
				throw new Error(`Timed out waiting for '${method}' request #${index}.`);
			}
			await timeout(0);
		}
	}

	function respondToAuthentication(transport: AuthenticationProtocolTransport, registry: AgentHostFeatureAuthenticationRegistry, request: ProtocolRequest): void {
		const result = registry.authenticate(request.params as AuthenticateParams);
		transport.fireMessage(result.authenticated
			? { jsonrpc: '2.0', id: request.id, result: {} }
			: { jsonrpc: '2.0', id: request.id, error: { code: AhpErrorCodes.AuthRequired, message: 'Authentication failed' } });
	}

	test('advertises issuer-specific optional requirements only while tunnel discovery needs authentication', () => {
		const { registry, tunnelDiscoveryEnabled } = createActiveRegistry(false);
		assert.deepStrictEqual(registry.requirements.get(), []);

		tunnelDiscoveryEnabled.set(true, undefined);
		assert.deepStrictEqual(registry.requirements.get(), createAgentHostTunnelProtectedResources(authenticationProviders).map(resource => ({
			resource,
			reason: AuthRequiredReason.Required,
		})));

		tunnelDiscoveryEnabled.set(false, undefined);
		assert.deepStrictEqual(registry.requirements.get(), []);
	});

	test('replaces a same-issuer credential and rejects conflicts, unknown resources, and insufficient scopes', () => {
		const { registry } = createActiveRegistry();
		const [github, microsoft] = createAgentHostTunnelProtectedResources(authenticationProviders);
		const observedTokens: Array<string | undefined> = [];
		disposables.add(autorun(reader => observedTokens.push(registry.credential.read(reader)?.token)));

		const results = [
			registry.authenticate({ resource: github.resource, scopes: github.scopes_supported, token: 'github-one', expiresIn: 60 }),
			registry.authenticate({ resource: github.resource, scopes: github.scopes_supported, token: 'github-two', expiresIn: 120 }),
			registry.authenticate({ resource: microsoft.resource, scopes: microsoft.scopes_supported, token: 'microsoft-one', expiresIn: 60 }),
			registry.authenticate({ resource: `${AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID}/unknown`, token: 'unknown' }),
			registry.authenticate({ resource: github.resource, scopes: ['user:email'], token: 'underscoped' }),
		];

		assert.deepStrictEqual({
			results,
			credential: registry.credential.get(),
			requirements: registry.requirements.get(),
			observedTokens,
		}, {
			results: [
				{ handled: true, authenticated: true },
				{ handled: true, authenticated: true },
				{ handled: true, authenticated: false },
				{ handled: true, authenticated: false },
				{ handled: true, authenticated: false },
			],
			credential: {
				issuer: AgentHostTunnelAuthenticationIssuer.GitHub,
				scopes: github.scopes_supported,
				token: 'github-two',
				expiresAt: Date.now() + 120_000,
			},
			requirements: [],
			observedTokens: [undefined, 'github-one', 'github-two'],
		});
	});

	test('fresh initialize restores only the tunnel issuer selected after Microsoft to GitHub fallback', async function () {
		this.timeout(10_000);
		const registries: AgentHostFeatureAuthenticationRegistry[] = [];
		const transports: AuthenticationProtocolTransport[] = [];
		const client = disposables.add(new AgentHostProtocolClientCore(
			'test://agent-host',
			() => {
				const registry = createActiveRegistry().registry;
				const transport = disposables.add(new AuthenticationProtocolTransport());
				registries.push(registry);
				transports.push(transport);
				return transport;
			},
			{
				reconnectPolicy: {
					autoRestore: true,
					initialDelayMs: 0,
					maxDelayMs: 0,
					maxAttempts: 2,
				},
			},
			new NullLogService(),
		));
		const [github, microsoft] = createAgentHostTunnelProtectedResources(authenticationProviders);

		const connect = client.connect();
		const initialize = await waitForRequest(transports[0], 'initialize');
		transports[0].fireMessage({
			jsonrpc: '2.0',
			id: initialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connect;

		const microsoftAuthentication = client.authenticate({
			resource: microsoft.resource,
			scopes: microsoft.scopes_supported,
			token: 'microsoft-token',
		});
		respondToAuthentication(transports[0], registries[0], await waitForRequest(transports[0], 'authenticate', 0));
		await microsoftAuthentication;

		assert.deepStrictEqual(registries[0].authenticate({
			resource: microsoft.resource,
			scopes: microsoft.scopes_supported,
			token: '',
		}), { handled: true, authenticated: true });

		const githubAuthentication = client.authenticate({
			resource: github.resource,
			scopes: github.scopes_supported,
			token: 'github-token',
		});
		respondToAuthentication(transports[0], registries[0], await waitForRequest(transports[0], 'authenticate', 1));
		await githubAuthentication;

		transports[0].fireClose();
		while (transports.length < 2) {
			await timeout(0);
		}
		const reconnect = await waitForRequest(transports[1], 'reconnect');
		transports[1].fireMessage({
			jsonrpc: '2.0',
			id: reconnect.id,
			error: { code: AhpErrorCodes.NotFound, message: 'Client state was lost' },
		});
		const freshInitialize = await waitForRequest(transports[1], 'initialize');
		transports[1].fireMessage({
			jsonrpc: '2.0',
			id: freshInitialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});

		const restoredResources: string[] = [];
		let handledRequests = 0;
		const reconnectDeadline = Date.now() + 5_000;
		while (client.connectionState !== AgentHostClientState.Connected) {
			const requests = transports[1].sentMessages.filter(
				(message): message is ProtocolRequest => 'method' in message && message.method === 'authenticate' && 'id' in message,
			);
			while (handledRequests < requests.length) {
				const request = requests[handledRequests++];
				restoredResources.push((request.params as AuthenticateParams).resource);
				respondToAuthentication(transports[1], registries[1], request);
			}
			if (Date.now() > reconnectDeadline) {
				throw new Error('Timed out waiting for authentication restore after fresh initialize.');
			}
			await timeout(0);
		}

		assert.deepStrictEqual({
			restoredResources,
			restoredIssuer: registries[1].credential.get()?.issuer,
		}, {
			restoredResources: [github.resource],
			restoredIssuer: AgentHostTunnelAuthenticationIssuer.GitHub,
		});
	});

	test('expires in memory and publishes an expired optional requirement', () => runWithFakedTimers({ useFakeTimers: true, startTime: 1_000 }, async () => {
		const { registry } = createActiveRegistry();
		const [github] = createAgentHostTunnelProtectedResources(authenticationProviders);

		registry.authenticate({ resource: github.resource, scopes: github.scopes_supported, token: 'expiring', expiresIn: 1 });
		await timeout(1_000);

		assert.deepStrictEqual({
			credential: registry.credential.get(),
			requirements: registry.requirements.get(),
		}, {
			credential: undefined,
			requirements: createAgentHostTunnelProtectedResources(authenticationProviders).map(resource => ({
				resource,
				reason: AuthRequiredReason.Expired,
			})),
		});
	}));

	test('revocation and master disable clear the credential observed by dependent features', () => {
		const { registry, activation, tunnelDiscoveryEnabled } = createActiveRegistry();
		const [github, microsoft] = createAgentHostTunnelProtectedResources(authenticationProviders);
		const observedIssuers: Array<AgentHostTunnelAuthenticationIssuer | undefined> = [];
		disposables.add(autorun(reader => observedIssuers.push(registry.credential.read(reader)?.issuer)));

		const accepted = registry.authenticate({ resource: github.resource, token: 'github-token' });
		const conflict = registry.authenticate({ resource: microsoft.resource, token: 'microsoft-token' });
		tunnelDiscoveryEnabled.set(false, undefined);
		const revoked = registry.authenticate({ resource: github.resource, token: '' });
		tunnelDiscoveryEnabled.set(true, undefined);
		const replacementIssuer = registry.authenticate({ resource: microsoft.resource, token: 'microsoft-token' });
		activation.dispose();

		assert.deepStrictEqual({
			results: [accepted, conflict, revoked, replacementIssuer],
			credential: registry.credential.get(),
			requirements: registry.requirements.get(),
			observedIssuers,
		}, {
			results: [
				{ handled: true, authenticated: true },
				{ handled: true, authenticated: false },
				{ handled: true, authenticated: true },
				{ handled: true, authenticated: true },
			],
			credential: undefined,
			requirements: [],
			observedIssuers: [
				undefined,
				AgentHostTunnelAuthenticationIssuer.GitHub,
				undefined,
				AgentHostTunnelAuthenticationIssuer.Microsoft,
				undefined,
			],
		});
	});

	test('routes host-feature authentication before providers without logging secrets', async () => {
		const { registry } = createActiveRegistry();
		const [github] = createAgentHostTunnelProtectedResources(authenticationProviders);
		const logService = new RecordingLogService();
		const service = disposables.add(new AgentHostAuthenticationService(logService, registry));
		const provider = disposables.add(new MockAgent('copilot'));

		const hostResult = await service.authenticate({
			resource: github.resource,
			scopes: github.scopes_supported,
			token: 'host-feature-secret',
		}, [provider]);
		const unknownResult = await service.authenticate({
			resource: `${AGENT_HOST_GITHUB_TUNNEL_PROTECTED_RESOURCE_ID}/unknown`,
			token: 'unknown-secret',
		}, [provider]);
		const providerResult = await service.authenticate({
			resource: 'https://api.github.com',
			token: 'provider-secret',
		}, [provider]);

		assert.deepStrictEqual({
			hostResult,
			unknownResult,
			providerResult,
			providerCalls: provider.authenticateCalls,
			logContainsHostSecret: logService.entries.join('\n').includes('host-feature-secret'),
			logContainsProviderSecret: logService.entries.join('\n').includes('provider-secret'),
			logContainsUnknownSecret: logService.entries.join('\n').includes('unknown-secret'),
		}, {
			hostResult: { authenticated: true },
			unknownResult: { authenticated: false },
			providerResult: { authenticated: true },
			providerCalls: [{ resource: 'https://api.github.com', token: 'provider-secret' }],
			logContainsHostSecret: false,
			logContainsProviderSecret: false,
			logContainsUnknownSecret: false,
		});
	});

	test('serializes normalized resource and scope operations so a later revocation wins', async () => {
		const service = disposables.add(new AgentHostAuthenticationService(new NullLogService()));
		const provider = disposables.add(new OrderedAuthenticationAgent('copilot'));
		const resource = 'https://api.github.com';
		const bearer = service.authenticate({ resource, scopes: ['write:user', 'read:user'], token: 'token' }, [provider]);
		await provider.firstAuthenticationStarted.p;
		const revocation = service.authenticate({ resource, scopes: ['read:user', 'write:user'], token: '' }, [provider]);
		await Promise.resolve();
		const callsBeforeRelease = [...provider.authenticateCalls];
		provider.releaseFirstAuthentication.complete();
		await Promise.all([bearer, revocation]);

		assert.deepStrictEqual({
			callsBeforeRelease,
			callsAfterRelease: provider.authenticateCalls,
			storedToken: service.getAuthToken({ resource, scopes: ['read:user', 'write:user'] }),
		}, {
			callsBeforeRelease: [{ resource, token: 'token' }],
			callsAfterRelease: [
				{ resource, token: 'token' },
				{ resource, token: '' },
			],
			storedToken: undefined,
		});
	});
});
