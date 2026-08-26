/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import {
	CloudSandboxEnabledSettingId,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	cloudSandboxAddress,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxCreateSessionRequest,
	type ICloudSandboxCreatedSession,
	type ICloudSandboxDiscoveredSession,
	type ICloudSandboxDiscoveryResult,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { CloudSandboxAgentHostContribution } from '../../browser/cloudSandboxAgentHostContribution.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../browser/remoteAgentHostConnectionCustomization.js';
import { IRemoteAgentHostSessionsProviderConfig } from '../../browser/remoteAgentHostSessionsProvider.js';
import { CloudSandboxSessionsProvider } from '../../browser/cloudSandboxSessionsProvider.js';

class StubProvider extends mock<CloudSandboxSessionsProvider>() {
	readonly seeded: IAgentSessionMetadata[] = [];
	/** Raw ids seeded as provisional, mirroring the real provider's listing gate. */
	readonly withheld = new Set<string>();
	disposed = false;

	override readonly id: string;

	constructor(readonly config: IRemoteAgentHostSessionsProviderConfig) {
		super();
		this.id = `agenthost-${config.address}`;
	}

	/**
	 * Records seeds, de-duplicating by session id. Unlike the real provider this does not model
	 * the project backfill on an already-seeded session — that path is covered against the real
	 * provider in `remoteAgentHostSessionsProvider.test.ts`.
	 */
	override seedSessions(metas: readonly IAgentSessionMetadata[]): void {
		for (const meta of metas) {
			if (!this.seeded.some(seen => seen.session.toString() === meta.session.toString())) {
				this.seeded.push(meta);
			}
		}
	}

	override seedProvisionalSession(meta: IAgentSessionMetadata): void {
		if (this.seeded.some(seen => seen.session.toString() === meta.session.toString())) {
			return;
		}
		this.seeded.push(meta);
		this.withheld.add(AgentSession.id(meta.session));
	}

	/** Surfaces each seed under the UI resource scheme, which is what keys the raw session id. */
	override getSessions(): ISession[] {
		return this.seeded
			.filter(meta => !this.withheld.has(AgentSession.id(meta.session)))
			.map(meta => this._toSession(meta));
	}

	/** Reaches withheld seeds too, which is the whole point of the cache accessor. */
	override getCachedSession(rawId: string): ISession | undefined {
		const meta = this.seeded.find(seen => AgentSession.id(seen.session) === rawId);
		return meta ? this._toSession(meta) : undefined;
	}

	override publishWithheldSession(rawId: string): void {
		this.withheld.delete(rawId);
	}

	private _toSession(meta: IAgentSessionMetadata): ISession {
		return upcastPartial<ISession>({
			resource: URI.from({ scheme: 'agent-host-copilot', path: `/${AgentSession.id(meta.session)}` }),
		});
	}

	override setConnectionStatus(): void { }

	override setReadOnly(): void { }

	override dispose(): void {
		this.disposed = true;
	}
}

class TestCloudSandboxContribution extends CloudSandboxAgentHostContribution {
	readonly stubProviders = new Map<string, StubProvider>();

	protected override _instantiateProvider(config: IRemoteAgentHostSessionsProviderConfig): CloudSandboxSessionsProvider {
		const stub = new StubProvider(config);
		this.stubProviders.set(config.address, stub);
		return stub as unknown as CloudSandboxSessionsProvider;
	}
}

class StubSessionsProvidersService extends Disposable {
	declare readonly _serviceBrand: undefined;
	readonly onDidChangeProviders = Event.None;
	registerProvider(_provider: ISessionsProvider): IDisposable { return toDisposable(() => { }); }
	getProviders(): ISessionsProvider[] { return []; }
}

interface ITestHarness {
	readonly contribution: TestCloudSandboxContribution;
	readonly configurationService: TestConfigurationService;
	/** Discovery's answer, mutable so a test can change what a later pass reports. */
	discovered: readonly ICloudSandboxDiscoveredSession[];
	/** Runs a discovery pass and waits for it to reconcile. */
	runDiscovery(): Promise<void>;
	/** Runs while a `connect` is in flight, for testing what can race with it. */
	onConnect?: () => Promise<void>;
	readonly created: ICloudSandboxCreateSessionRequest[];
	readonly connectedTo: string[];
}

/**
 * Creates the contribution with a discovery result, and resolves once the constructor's eager
 * `_discoverAndSeed()` pass has committed its seeds.
 */
async function createContribution(store: Pick<DisposableStore, 'add'>, sessions: readonly ICloudSandboxDiscoveredSession[], options?: {
	/** Task Mission Control returns from `createSession`, or a rejection. */
	readonly createSession?: () => Promise<ICloudSandboxCreatedSession>;
}): Promise<ITestHarness> {
	const discoveryHandlers: (() => Promise<void>)[] = [];
	const instantiationService = store.add(new TestInstantiationService());
	const created: ICloudSandboxCreateSessionRequest[] = [];
	const connectedTo: string[] = [];
	const harness: ITestHarness = {
		discovered: sessions,
		created,
		connectedTo,
		runDiscovery: async () => { await Promise.all(discoveryHandlers.map(handler => handler())); },
	} as ITestHarness;

	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override async listSessions(_token: CancellationToken): Promise<ICloudSandboxDiscoveryResult> {
			return { kind: 'complete', sessions: harness.discovered };
		}
		override async createSession(request: ICloudSandboxCreateSessionRequest): Promise<ICloudSandboxCreatedSession> {
			created.push(request);
			return options?.createSession
				? options.createSession()
				: { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' };
		}
	}());
	instantiationService.stub(ICloudSandboxAgentHostService, new class extends mock<ICloudSandboxAgentHostService>() {
		override async connect(connectOptions: ICloudSandboxConnectOptions): Promise<string> {
			connectedTo.push(connectOptions.environmentId);
			await harness.onConnect?.();
			return cloudSandboxAddress(connectOptions.environmentId);
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
		override readonly onDidChangeConnections = Event.None;
		override readonly connections = [];
		override async removeRemoteAgentHost(): Promise<void> { }
	}());
	instantiationService.stub(IRemoteAgentHostConnectionCustomizationService, new class extends mock<IRemoteAgentHostConnectionCustomizationService>() {
		override register(): IDisposable { return toDisposable(() => { }); }
	}());
	instantiationService.stub(ISessionsProvidersService, store.add(new StubSessionsProvidersService()) as unknown as ISessionsProvidersService);
	instantiationService.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
		override registerDiscoveryHandler(handler: () => Promise<void>): IDisposable {
			discoveryHandlers.push(handler);
			return toDisposable(() => { });
		}
	}());
	const configurationService = new TestConfigurationService({
		[CloudSandboxEnabledSettingId]: true,
		[RemoteAgentHostsEnabledSettingId]: true,
	});
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidRegisterAuthenticationProvider = Event.None;
	}());
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
	instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() { }());
	instantiationService.stub(ILogService, new NullLogService());

	const contribution = store.add(instantiationService.createInstance(TestCloudSandboxContribution));
	// The constructor kicks off discovery eagerly; re-running the registered handler awaits it,
	// because `_discoverAndSeed` serializes onto the in-flight pass.
	await harness.runDiscovery();
	return Object.assign(harness, { contribution, configurationService });
}

function discoveredSession(overrides?: Partial<ICloudSandboxDiscoveredSession>): ICloudSandboxDiscoveredSession {
	return {
		environmentId: 'env-1',
		sessionId: 'sess-1',
		taskId: 'task-1',
		name: 'Change port to 5555',
		repoName: 'osortega/simple-server',
		updatedAt: '2026-08-05T12:00:00Z',
		...overrides,
	};
}

suite('CloudSandboxAgentHostContribution', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('seeds the discovered repository so a never-opened session is not workspace-less', async () => {
		// Without a project the workspace is undefined and the session groups under "Unknown".
		// The seeded shape matches what the host reports on connect, so reconciling is a no-op.
		const { contribution } = await createContribution(store, [discoveredSession()]);

		const provider = contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.deepStrictEqual(provider?.seeded.map(m => ({
			session: m.session.toString(),
			summary: m.summary,
			project: m.project && { uri: m.project.uri.toString(), displayName: m.project.displayName },
		})), [{
			session: 'copilot:/sess-1',
			summary: 'Change port to 5555',
			project: { uri: 'https://github.com/osortega/simple-server', displayName: 'osortega/simple-server' },
		}]);
	});

	test('omits the project when discovery could not resolve a repository', async () => {
		const { contribution } = await createContribution(store, [discoveredSession({ repoName: undefined })]);

		const provider = contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.strictEqual(provider?.seeded[0]?.project, undefined);
	});

	test('opts sandbox providers out of the [host] workspace-label suffix', async () => {
		// Each sandbox is its own provider named after its task, so the suffix would put every
		// session in a workspace group of one.
		const { contribution } = await createContribution(store, [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2', name: 'hi' }),
		]);

		assert.deepStrictEqual([...contribution.stubProviders.values()].map(p => ({
			name: p.config.name,
			omitHostFromWorkspaceLabel: p.config.omitHostFromWorkspaceLabel,
		})), [
			{ name: 'Change port to 5555', omitHostFromWorkspaceLabel: true },
			{ name: 'hi', omitHostFromWorkspaceLabel: true },
		]);
	});
});

suite('CloudSandboxAgentHostContribution provisioning', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates the task, seeds it like a discovered one, and connects to the bound environment', async () => {
		const harness = await createContribution(store, []);

		const provisioned = await harness.contribution.provisionSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None);

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual({
			ids: { taskId: provisioned.taskId, sessionId: provisioned.sessionId, environmentId: provisioned.environmentId },
			// The seed must match discovery's shape, or a later pass would duplicate the session.
			seeded: provider?.seeded.map(m => ({ session: m.session.toString(), summary: m.summary, project: m.project?.displayName })),
			// The relay must target the bound VM, never the `github-sandbox` sentinel.
			connectedTo: harness.connectedTo,
			resolvedSession: provisioned.session.resource.path,
		}, {
			ids: { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' },
			seeded: [{ session: 'copilot:/sess-new', summary: 'osortega/simple-server', project: 'osortega/simple-server' }],
			connectedTo: ['env-new'],
			resolvedSession: '/sess-new',
		});
	});

	test('a discovery pass that cannot see the new task yet does not tear it down mid-provision', async () => {
		// The scan was issued before the task existed, so it reports the environment as absent.
		// Without the in-flight guard, reconciliation disposes the provider we are connecting to.
		const harness = await createContribution(store, []);
		harness.onConnect = () => harness.runDiscovery();

		const provisioned = await harness.contribution.provisionSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None);

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual({
			disposed: provider?.disposed,
			returnedLiveProvider: provisioned.provider === provider,
		}, {
			disposed: false,
			returnedLiveProvider: true,
		});
	});

	test('publishes the seeded session when connecting fails, so it is not withheld forever', async () => {
		// The task exists remotely once `createSession` returns, and nothing else clears a
		// withheld seed.
		const harness = await createContribution(store, []);
		harness.onConnect = async () => {
			throw new Error('relay unavailable');
		};

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual({
			withheld: [...(provider?.withheld ?? [])],
			listed: provider?.getSessions().map(s => AgentSession.id(s.resource)),
		}, {
			withheld: [],
			listed: ['sess-new'],
		});
	});

	test('rejects when the feature is disabled while the sandbox is waking', async () => {
		// Connecting waits out the VM boot, which is long enough for the setting to change.
		// Returning a provider that teardown has already disposed would send into nothing.
		const harness = await createContribution(store, []);
		harness.onConnect = async () => {
			harness.configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, false);
		};

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));
	});

	test('registers nothing when the feature is disabled while the task is being created', async () => {
		// `_teardownAll` snapshots the environments it knows about, so a provider registered after
		// it runs is never reconciled — it would outlive the feature being turned off.
		let disable = () => { };
		const harness = await createContribution(store, [], {
			createSession: async () => {
				disable();
				return { taskId: 'task-new', sessionId: 'sess-new', environmentId: 'env-new' };
			},
		});
		disable = () => harness.configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, false);

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));

		assert.deepStrictEqual({
			providers: [...harness.contribution.stubProviders.keys()],
			connectedTo: harness.connectedTo,
		}, {
			providers: [],
			connectedTo: [],
		});
	});

	test('rejects without provisioning anything when the feature is already disabled', async () => {
		const harness = await createContribution(store, []);
		harness.configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);

		await assert.rejects(() => harness.contribution.provisionSession({ prompt: 'fix it' }, CancellationToken.None));

		assert.deepStrictEqual({ created: harness.created, connectedTo: harness.connectedTo }, { created: [], connectedTo: [] });
	});

	test('a later discovery pass reconciles with the provisioned session instead of duplicating it', async () => {
		const harness = await createContribution(store, []);
		await harness.contribution.provisionSession({ repoNwo: 'osortega/simple-server', prompt: 'fix it' }, CancellationToken.None);

		// The task is now visible to discovery, under the same session id it was created with.
		harness.discovered = [discoveredSession({ environmentId: 'env-new', sessionId: 'sess-new', taskId: 'task-new', name: 'fix it' })];
		await harness.runDiscovery();

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-new'));
		assert.deepStrictEqual(provider?.seeded.map(m => m.session.toString()), ['copilot:/sess-new']);
	});
});
