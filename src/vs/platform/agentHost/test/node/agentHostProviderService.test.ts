/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession, type AuthenticateParams, type IAgent, type IMcpNotification } from '../../common/agent.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { AgentHostAuthenticationService } from '../../node/agentHostAuthenticationService.js';
import { AgentHostProviderService } from '../../node/agentHostProviderService.js';
import { buildMcpChannel } from '../../node/shared/mcpCustomizationController.js';
import { MockAgent } from './mockAgent.js';

class TestAuthenticationService extends AgentHostAuthenticationService {
	readonly replayedProviders: IAgent[] = [];
	readonly authenticateCalls: { params: AuthenticateParams; providers: readonly IAgent[] }[] = [];
	replayGate: DeferredPromise<void> | undefined;

	override async replay(provider: IAgent): Promise<void> {
		this.replayedProviders.push(provider);
		await this.replayGate?.p;
	}

	override async authenticate(params: AuthenticateParams, providers: Iterable<IAgent>) {
		this.authenticateCalls.push({ params, providers: [...providers] });
		return { authenticated: true };
	}
}

class TestProvider extends MockAgent {
	private readonly _onMcpNotification = new Emitter<IMcpNotification>();
	readonly onMcpNotification = this._onMcpNotification.event;
	disposeCount = 0;
	shutdownCount = 0;
	shutdownError: Error | undefined;
	mcpRequests: { chat: URI; serverName: string; method: string; params: Record<string, unknown> | undefined }[] = [];

	async handleMcpRequest(chat: URI, serverName: string, method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
		this.mcpRequests.push({ chat, serverName, method, params });
		return 'mcp-result';
	}

	fireMcpNotification(notification: IMcpNotification): void {
		this._onMcpNotification.fire(notification);
	}

	override async shutdown(): Promise<void> {
		this.shutdownCount++;
		if (this.shutdownError) {
			throw this.shutdownError;
		}
	}

	override dispose(): void {
		this.disposeCount++;
		this._onMcpNotification.dispose();
		super.dispose();
	}
}

suite('AgentHostProviderService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createService(): { service: AgentHostProviderService; authentication: TestAuthenticationService } {
		const authentication = disposables.add(new TestAuthenticationService(new NullLogService()));
		return {
			service: disposables.add(new AgentHostProviderService(authentication, new NullLogService())),
			authentication,
		};
	}

	test('registers providers synchronously and transfers disposal ownership', async () => {
		const { service, authentication } = createService();
		const provider = new TestProvider('copilot');
		const initializations: string[] = [];
		const registrations: string[] = [];
		let initializerDisposed = false;
		disposables.add(service.registerProviderInitializer(registered => {
			assert.strictEqual(service.getProvider(registered.id), provider);
			assert.deepStrictEqual(service.agents.get(), []);
			initializations.push(registered.id);
			return toDisposable(() => initializerDisposed = true);
		}));
		disposables.add(service.onDidRegisterProvider(registered => {
			assert.deepStrictEqual(service.agents.get().map(agent => agent.id), ['copilot']);
			registrations.push(registered.id);
		}));

		service.registerProvider(provider);
		await Promise.resolve();
		assert.throws(() => service.registerProviderInitializer(() => Disposable.None), /before providers/);

		assert.deepStrictEqual({
			initializations,
			registrations,
			agents: service.agents.get().map(agent => agent.id),
			defaultProvider: service.resolveProvider()?.id,
			replayedProviders: authentication.replayedProviders.map(agent => agent.id),
		}, {
			initializations: ['copilot'],
			registrations: ['copilot'],
			agents: ['copilot'],
			defaultProvider: 'copilot',
			replayedProviders: ['copilot'],
		});

		service.dispose();
		assert.deepStrictEqual({ providerDisposeCount: provider.disposeCount, initializerDisposed }, { providerDisposeCount: 1, initializerDisposed: true });
	});

	test('rejects duplicate providers without taking ownership of the duplicate', () => {
		const { service } = createService();
		const provider = new TestProvider('copilot');
		const duplicate = new TestProvider('copilot');
		service.registerProvider(provider);

		assert.throws(() => service.registerProvider(duplicate), /already registered/);
		assert.strictEqual(duplicate.disposeCount, 0);
		duplicate.dispose();
	});

	test('rolls back a provider when registration setup throws', async () => {
		const { service, authentication } = createService();
		const provider = new TestProvider('copilot');
		let initializerDisposed = false;
		disposables.add(service.registerProviderInitializer(() => toDisposable(() => initializerDisposed = true)));
		disposables.add(service.registerProviderInitializer(() => {
			throw new Error('initialization failed');
		}));

		assert.throws(() => service.registerProvider(provider), /initialization failed/);
		await Promise.resolve();
		assert.deepStrictEqual({
			provider: service.getProvider('copilot'),
			agents: service.agents.get(),
			defaultProvider: service.resolveProvider(),
			disposeCount: provider.disposeCount,
			replayedProviders: authentication.replayedProviders,
			initializerDisposed,
		}, {
			provider: undefined,
			agents: [],
			defaultProvider: undefined,
			disposeCount: 1,
			replayedProviders: [],
			initializerDisposed: true,
		});
	});

	test('routes associated and scheme sessions and tracks the default provider', () => {
		const { service } = createService();
		const first = new TestProvider('first');
		const second = new TestProvider('second');
		service.registerProvider(first);
		service.registerProvider(second);
		const associated = URI.parse('unknown:/session');

		assert.strictEqual(service.resolveProvider(), first);
		assert.strictEqual(service.getProviderForSession(associated), undefined);
		assert.strictEqual(service.getProviderForSession(URI.parse('second:/session')), second);
		service.associateSession(associated, 'second');
		assert.strictEqual(service.getProviderForSession(associated), second);
		service.releaseSession(associated, 'first');
		assert.strictEqual(service.getProviderForSession(associated), second);
		service.releaseSession(associated, 'second');
		assert.strictEqual(service.getProviderForSession(associated), undefined);
	});

	test('routes MCP requests and notifications', async () => {
		const { service } = createService();
		const provider = new TestProvider('copilot');
		service.registerProvider(provider);
		const notifications: IMcpNotification[] = [];
		disposables.add(service.onMcpNotification(notification => notifications.push(notification)));
		const chat = URI.parse(buildDefaultChatUri(AgentSession.uri('copilot', 'session').toString()));
		const channel = buildMcpChannel(chat, 'server');
		const notification = { channel, method: 'notifications/tools/list_changed' };

		provider.fireMcpNotification(notification);
		const result = await service.handleMcpRequest(channel, 'tools/list', { channel });

		assert.deepStrictEqual({
			notifications,
			result,
			requests: provider.mcpRequests.map(request => ({
				...request,
				chat: request.chat.toString(),
			})),
		}, {
			notifications: [notification],
			result: 'mcp-result',
			requests: [{ chat: chat.toString(), serverName: 'server', method: 'tools/list', params: { channel } }],
		});
	});

	test('aggregates provider network diagnostics in registration order', async () => {
		const { service } = createService();
		const first: IAgent = new TestProvider('first');
		const second: IAgent = new TestProvider('second');
		const failing: IAgent = new TestProvider('failing');
		const late: IAgent = new TestProvider('late');
		const endpointsGate = new DeferredPromise<void>();
		first.getNetworkDiagnosticsEndpoints = async () => {
			await endpointsGate.p;
			return [
				{ name: 'First', url: 'https://example.com' },
				{ name: 'Other', url: 'not a url' },
			];
		};
		first.getNetworkDiagnosticsAccount = async () => { throw new Error('account unavailable'); };
		second.getNetworkDiagnosticsEndpoints = async () => [
			{ name: 'Duplicate normalized URL', url: 'https://example.com/' },
			{ name: 'Duplicate invalid URL', url: 'not a url' },
		];
		second.getNetworkDiagnosticsAccount = async () => 'octocat';
		failing.getNetworkDiagnosticsEndpoints = async () => { throw new Error('endpoints unavailable'); };
		late.getNetworkDiagnosticsEndpoints = async () => [{ name: 'Late', url: 'https://late.example.com' }];
		late.getNetworkDiagnosticsAccount = async () => 'late-account';
		service.registerProvider(first);
		service.registerProvider(second);
		service.registerProvider(failing);

		const diagnostics = service.getNetworkDiagnostics();
		service.registerProvider(late);
		endpointsGate.complete();

		assert.deepStrictEqual(await diagnostics, {
			endpoints: [
				{ name: 'First', url: 'https://example.com' },
				{ name: 'Other', url: 'not a url' },
			],
			account: 'octocat',
		});
	});

	test('aggregates managed-settings diagnostics from capable providers', async () => {
		const { service } = createService();
		const supported: IAgent = new TestProvider('supported');
		const unsupported: IAgent = new TestProvider('unsupported');
		const failing: IAgent = new TestProvider('failing');
		supported.getManagedSettingsDiagnostics = async () => ({
			source: 'device',
			serverManaged: false,
			deviceManaged: true,
			failClosed: false,
			bypassPermissionsDisabled: false,
			managedKeys: ['permissions'],
			settings: { permissions: { allow: ['Shell(echo *)'] } },
		});
		failing.getManagedSettingsDiagnostics = async () => { throw new Error('unavailable'); };
		service.registerProvider(supported);
		service.registerProvider(unsupported);
		service.registerProvider(failing);

		assert.deepStrictEqual(await service.getManagedSettingsDiagnostics(), [
			{
				provider: 'supported',
				snapshot: {
					source: 'device',
					serverManaged: false,
					deviceManaged: true,
					failClosed: false,
					bypassPermissionsDisabled: false,
					managedKeys: ['permissions'],
					settings: { permissions: { allow: ['Shell(echo *)'] } },
				},
			},
			{ provider: 'failing', error: 'unavailable' },
		]);
	});

	test('fans out authentication and shutdown', async () => {
		const { service, authentication } = createService();
		const first = new TestProvider('first');
		const second = new TestProvider('second');
		second.shutdownError = new Error('shutdown failed');
		service.registerProvider(first);
		service.registerProvider(second);
		const params = { resource: 'resource', token: 'token' };

		assert.deepStrictEqual(await service.authenticate(params), { authenticated: true });
		await assert.rejects(service.shutdown(), /shutdown failed/);

		assert.deepStrictEqual({
			authenticateProviders: authentication.authenticateCalls[0].providers.map(provider => provider.id),
			shutdownCounts: [first.shutdownCount, second.shutdownCount],
		}, {
			authenticateProviders: ['first', 'second'],
			shutdownCounts: [1, 1],
		});
	});

	test('waits for authentication replay before shutdown', async () => {
		const { service, authentication } = createService();
		const provider = new TestProvider('copilot');
		authentication.replayGate = new DeferredPromise<void>();
		service.registerProvider(provider);

		const shutdown = service.shutdown();
		await Promise.resolve();
		assert.deepStrictEqual({
			replayedProviders: authentication.replayedProviders.map(provider => provider.id),
			shutdownCount: provider.shutdownCount,
		}, {
			replayedProviders: ['copilot'],
			shutdownCount: 0,
		});
		const lateProvider = new TestProvider('late');
		assert.throws(() => service.registerProvider(lateProvider), /shutdown has started/);
		lateProvider.dispose();

		authentication.replayGate.complete();
		await shutdown;
		assert.strictEqual(provider.shutdownCount, 1);
	});
});
