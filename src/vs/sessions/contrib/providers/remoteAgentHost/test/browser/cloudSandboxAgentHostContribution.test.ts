/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { URI } from '../../../../../../base/common/uri.js';
import { AgentSession } from '../../../../../../platform/agentHost/common/agent.js';
import { IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { IReplayedTaskHistory } from '../../../../../../platform/agentHost/common/taskEventReplay.js';
import {
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CloudSandboxEnabledSettingId,
	ICloudSandboxAgentHostService,
	ICloudSandboxApiService,
	cloudSandboxAddress,
	type CloudSandboxEnvironmentStatus,
	type ICloudSandboxConnectOptions,
	type ICloudSandboxCreateSessionRequest,
	type ICloudSandboxCreatedSession,
	type ICloudSandboxDiscoveredSession,
	type ICloudSandboxDiscoveryResult,
	type ICloudSandboxEnvironment as ICloudSandboxEnvironmentRecord,
} from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostGroup } from '../../../../../common/agentHostSessionsProvider.js';
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
	/** Every connection status pushed onto this provider, in order. */
	readonly statuses: string[] = [];
	private readonly _status = observableValue<RemoteAgentHostConnectionStatus>('stubStatus', RemoteAgentHostConnectionStatus.disconnected);
	override readonly connectionStatus: IObservable<RemoteAgentHostConnectionStatus> = this._status;
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

	override setConnectionStatus(status: RemoteAgentHostConnectionStatus): void {
		this.statuses.push(status.kind);
		this._status.set(status, undefined);
	}

	override dispose(): void {
		this.disposed = true;
	}
}

class TestCloudSandboxContribution extends CloudSandboxAgentHostContribution {
	readonly stubProviders = new Map<string, StubProvider>();

	/**
	 * Drives the async activation the chat service performs on open. Called directly rather than
	 * through the global activation registry, which also holds the generic remote-agent-host
	 * activator for the same session type.
	 */
	activate(sessionType: string): Promise<boolean> {
		return this._waitForActivation(sessionType);
	}

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

/** The single host filter entry every sandbox environment folds into. */
const GITHUB_SANDBOX_GROUP: IAgentHostGroup = {
	id: 'githubsandbox',
	label: 'GitHub Sandboxes',
	order: 1,
	connectable: false,
};

interface ITestHarness {
	readonly contribution: TestCloudSandboxContribution;
	readonly configurationService: TestConfigurationService;
	setEnabled(enabled: boolean): Promise<void>;
	/** Discovery's answer, mutable so a test can change what a later pass reports. */
	discovered: readonly ICloudSandboxDiscoveredSession[];
	/** Runs a discovery pass and waits for it to reconcile. */
	runDiscovery(): Promise<void>;
	/** Runs while a `connect` is in flight, for testing what can race with it. */
	onConnect?: () => Promise<void>;
	/** The state Mission Control reports for an environment. Defaults to `offline`. */
	environmentStatus: CloudSandboxEnvironmentStatus;
	/** Session types currently served from replayed history. */
	readonly readOnlySessionTypes: string[];
	/** Drives the async activation the chat service performs when a session is opened. */
	activate(environmentId: string): Promise<boolean>;
	readonly created: ICloudSandboxCreateSessionRequest[];
	readonly connectedTo: string[];
	readonly historyRequests: string[];
	/** Host groups currently declared to the filter service. */
	readonly hostGroups: IAgentHostGroup[];
}

/**
 * Creates the contribution with a discovery result, and resolves once the constructor's eager
 * `_discoverAndSeed()` pass has committed its seeds. `hostGroups` holds the groups currently
 * declared to the host filter, so tests can assert the entry's presence and its teardown.
 */
async function createContribution(store: Pick<DisposableStore, 'add'>, sessions: readonly ICloudSandboxDiscoveredSession[], options?: {
	/** Task Mission Control returns from `createSession`, or a rejection. */
	readonly createSession?: () => Promise<ICloudSandboxCreatedSession>;
	readonly getEnvironment?: (id: string, token: CancellationToken) => Promise<ICloudSandboxEnvironmentRecord>;
	/** Whether the sandbox feature settings start on. Defaults to `true`. */
	readonly enabled?: boolean;
}): Promise<ITestHarness> {
	const discoveryHandlers: (() => Promise<void>)[] = [];
	const hostGroups: IAgentHostGroup[] = [];
	const readOnlySessionTypes: string[] = [];
	const instantiationService = store.add(new TestInstantiationService());
	const created: ICloudSandboxCreateSessionRequest[] = [];
	const connectedTo: string[] = [];
	const historyRequests: string[] = [];
	const harness: ITestHarness = {
		discovered: sessions,
		environmentStatus: 'offline',
		readOnlySessionTypes,
		created,
		connectedTo,
		historyRequests,
		hostGroups,
		setEnabled: async (enabled: boolean) => {
			await configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === CloudSandboxEnabledSettingId,
				affectedKeys: new Set([CloudSandboxEnabledSettingId]),
				change: { keys: [CloudSandboxEnabledSettingId], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		},
		runDiscovery: async () => { await Promise.all(discoveryHandlers.map(handler => handler())); },
		activate: async (environmentId: string) => {
			const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER);
			return harness.contribution.activate(sessionType);
		},
	} as ITestHarness;

	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override async listSessions(_token: CancellationToken): Promise<ICloudSandboxDiscoveryResult> {
			return { kind: 'complete', sessions: harness.discovered };
		}
		override async getEnvironment(id: string, token: CancellationToken): Promise<ICloudSandboxEnvironmentRecord> {
			if (options?.getEnvironment) {
				return options.getEnvironment(id, token);
			}
			return { id, status: harness.environmentStatus };
		}
		override async getSessionHistory(taskId: string): Promise<IReplayedTaskHistory> {
			historyRequests.push(taskId);
			return { sessions: [], truncated: false };
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
		// No live protocol client is modelled, so activation stops once the connect has been made
		// rather than going on to wait for the host to advertise its agents.
		override getConnection() { return undefined; }
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
		override registerHostGroup(group: IAgentHostGroup): IDisposable {
			hostGroups.push(group);
			return toDisposable(() => {
				const index = hostGroups.indexOf(group);
				if (index >= 0) {
					hostGroups.splice(index, 1);
				}
			});
		}
	}());
	const configurationService = new TestConfigurationService({
		[CloudSandboxEnabledSettingId]: options?.enabled ?? true,
		[RemoteAgentHostsEnabledSettingId]: options?.enabled ?? true,
	});
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IAuthenticationService, new class extends mock<IAuthenticationService>() {
		override readonly onDidChangeSessions = Event.None;
		override readonly onDidRegisterAuthenticationProvider = Event.None;
	}());
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { }());
	instantiationService.stub(IChatSessionsService, new class extends mock<IChatSessionsService>() {
		override getContentProviderSchemes(): string[] { return [...readOnlySessionTypes]; }
		override registerChatSessionContentProvider(sessionType: string): IDisposable {
			readOnlySessionTypes.push(sessionType);
			return toDisposable(() => {
				const index = readOnlySessionTypes.indexOf(sessionType);
				if (index >= 0) {
					readOnlySessionTypes.splice(index, 1);
				}
			});
		}
	}());
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

	test('supplies environment connection labels independently of the task name', async () => {
		const { contribution } = await createContribution(store, [discoveredSession({ name: 'hi' })]);
		const labels = contribution.stubProviders.get(cloudSandboxAddress('env-1'))?.config.connectionLabels;

		assert.deepStrictEqual(labels && { ...labels, reconnectingIn: labels.reconnectingIn(5) }, {
			unavailableTitle: 'Environment Offline',
			unavailable: 'Environment offline.',
			connectingTitle: 'Connecting to the Environment',
			connecting: 'Connecting...',
			reconnecting: 'Reconnecting...',
			reconnectingIn: 'Reconnecting in 5s',
			incompatibleTitle: 'Cannot Connect to the Environment',
			incompatible: 'This environment is incompatible with this version of Visual Studio Code.',
		});
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

	test('folds every sandbox into one non-connectable host filter group', async () => {
		const { contribution } = await createContribution(store, [
			discoveredSession(),
			discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2', name: 'hi' }),
		]);

		assert.deepStrictEqual([...contribution.stubProviders.values()].map(p => p.config.hostGroup), [
			GITHUB_SANDBOX_GROUP,
			GITHUB_SANDBOX_GROUP,
		]);
	});

	test('declares the host filter group even with no sandbox sessions', async () => {
		const { contribution, hostGroups } = await createContribution(store, []);

		assert.deepStrictEqual([...contribution.stubProviders.keys()], []);
		assert.deepStrictEqual([...hostGroups], [GITHUB_SANDBOX_GROUP]);
	});

	test('declares no host filter group while the feature is disabled', async () => {
		const { hostGroups } = await createContribution(store, [discoveredSession()], { enabled: false });

		assert.deepStrictEqual([...hostGroups], []);
	});

	test('serves a dormant environment from history instead of waking it to open a session', async () => {
		// Resuming costs minutes and Mission Control cannot say in advance whether a dormant
		// environment will come back, so opening a session must not gamble that on the user's
		// behalf. The session still opens — from replayed history — and the connect is offered.
		const harness = await createContribution(store, [discoveredSession()]);
		harness.environmentStatus = 'offline';

		const opened = await harness.activate('env-1');

		assert.deepStrictEqual({ opened, connectedTo: harness.connectedTo, servedFromHistory: harness.readOnlySessionTypes.length }, {
			opened: true,
			connectedTo: [],
			servedFromHistory: 1,
		});
	});

	test('connects when opening a session on an environment that is already online', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		harness.environmentStatus = 'online';

		await harness.activate('env-1');

		assert.deepStrictEqual({ connectedTo: harness.connectedTo, servedFromHistory: harness.readOnlySessionTypes.length }, {
			connectedTo: ['env-1'],
			servedFromHistory: 0,
		});
	});

	test('does not wake an environment whose state could not be read', async () => {
		const harness = await createContribution(store, [discoveredSession()], {
			getEnvironment: async () => { throw new Error('Expected environment lookup failure'); },
		});

		const opened = await harness.activate('env-1');

		assert.deepStrictEqual({
			opened,
			connectedTo: harness.connectedTo,
			historyRequests: harness.historyRequests,
			servedFromHistory: harness.readOnlySessionTypes.length,
		}, { opened: true, connectedTo: [], historyRequests: ['task-1'], servedFromHistory: 1 });
	});

	for (const reenable of [false, true]) {
		test(`abandons a cancelled environment lookup when the feature is ${reenable ? 're-enabled' : 'disabled'}`, async () => {
			const environment = new DeferredPromise<ICloudSandboxEnvironmentRecord>();
			const requestedToken = new DeferredPromise<CancellationToken>();
			const harness = await createContribution(store, [discoveredSession()], {
				getEnvironment: (_id, token) => {
					void requestedToken.complete(token);
					return environment.p;
				},
			});
			const activation = harness.activate('env-1');
			const token = await requestedToken.p;

			await harness.setEnabled(false);
			if (reenable) {
				await harness.setEnabled(true);
				await harness.runDiscovery();
			}
			await environment.error(new CancellationError());

			assert.deepStrictEqual({
				opened: await activation,
				cancelled: token.isCancellationRequested,
				connectedTo: harness.connectedTo,
				historyRequests: harness.historyRequests,
				readOnlySessionTypes: harness.readOnlySessionTypes,
			}, { opened: false, cancelled: true, connectedTo: [], historyRequests: [], readOnlySessionTypes: [] });
		});
	}

	for (const status of ['online', 'offline'] as const) {
		test(`does not reactivate a removed environment after a late ${status} record`, async () => {
			const environment = new DeferredPromise<ICloudSandboxEnvironmentRecord>();
			const harness = await createContribution(store, [discoveredSession()], {
				getEnvironment: () => environment.p,
			});
			const activation = harness.activate('env-1');
			harness.discovered = [];
			await harness.runDiscovery();
			await environment.complete({ id: 'env-1', status });

			assert.deepStrictEqual({
				opened: await activation,
				connectedTo: harness.connectedTo,
				historyRequests: harness.historyRequests,
				readOnlySessionTypes: harness.readOnlySessionTypes,
			}, { opened: false, connectedTo: [], historyRequests: [], readOnlySessionTypes: [] });
		});
	}

	test('does not register old history against a replacement provider at the same address', async () => {
		const environment = new DeferredPromise<ICloudSandboxEnvironmentRecord>();
		const harness = await createContribution(store, [discoveredSession()], {
			getEnvironment: () => environment.p,
		});
		const activation = harness.activate('env-1');
		harness.discovered = [];
		await harness.runDiscovery();
		harness.discovered = [discoveredSession({ taskId: 'task-2' })];
		await harness.runDiscovery();
		await environment.complete({ id: 'env-1', status: 'offline' });

		assert.deepStrictEqual({
			opened: await activation,
			historyRequests: harness.historyRequests,
			readOnlySessionTypes: harness.readOnlySessionTypes,
		}, { opened: false, historyRequests: [], readOnlySessionTypes: [] });
	});

	test('keeps activation valid across a discovery refresh of the same provider', async () => {
		const environment = new DeferredPromise<ICloudSandboxEnvironmentRecord>();
		const harness = await createContribution(store, [discoveredSession()], {
			getEnvironment: () => environment.p,
		});
		const activation = harness.activate('env-1');
		await harness.runDiscovery();
		await environment.complete({ id: 'env-1', status: 'offline' });

		assert.deepStrictEqual({
			opened: await activation,
			connectedTo: harness.connectedTo,
			historyRequests: harness.historyRequests,
		}, { opened: true, connectedTo: [], historyRequests: ['task-1'] });
	});

	test('does not restore history after an old connect fails across disable and re-enable', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		harness.environmentStatus = 'online';
		harness.onConnect = async () => {
			await harness.setEnabled(false);
			await harness.setEnabled(true);
			await harness.runDiscovery();
			throw new Error('Expected connection failure after teardown');
		};

		assert.deepStrictEqual({
			opened: await harness.activate('env-1'),
			historyRequests: harness.historyRequests,
			readOnlySessionTypes: harness.readOnlySessionTypes,
		}, { opened: false, historyRequests: [], readOnlySessionTypes: [] });
	});

	test('connects a dormant environment that has no history to fall back on', async () => {
		// Without a task there is nothing to serve read-only, so refusing to connect would leave
		// the session unopenable rather than merely offline. The harness models no live protocol
		// client, so the dial itself is what this asserts.
		const harness = await createContribution(store, [discoveredSession({ taskId: undefined })]);
		harness.environmentStatus = 'offline';

		await harness.activate('env-1');

		assert.deepStrictEqual({ connectedTo: harness.connectedTo, servedFromHistory: harness.readOnlySessionTypes.length }, {
			connectedTo: ['env-1'],
			servedFromHistory: 0,
		});
	});

	test('settles the status after a failed connect so the connect action comes back', async () => {
		// A wake that exhausts its retry budget fails before any transport entry exists, so no
		// connections-changed event follows. Left alone the provider would sit at `connecting`
		// forever: a permanent spinner, a permanently hidden composer, and no way to retry.
		const harness = await createContribution(store, [discoveredSession()]);
		harness.environmentStatus = 'online';
		harness.onConnect = () => Promise.reject(new Error('Timed out waiting for sandbox environment to wake.'));

		await harness.activate('env-1');

		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'));
		assert.deepStrictEqual(provider?.statuses, ['connecting', 'disconnected']);
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
