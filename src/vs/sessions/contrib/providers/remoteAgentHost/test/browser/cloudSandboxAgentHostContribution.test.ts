/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { URI } from '../../../../../../base/common/uri.js';
import { StorageValue } from '../../../../../../base/parts/storage/common/storage.js';
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
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../../../../workbench/services/host/browser/host.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostGroup } from '../../../../../common/agentHostSessionsProvider.js';
import { IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISession } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID, CloudSandboxAgentHostContribution } from '../../browser/cloudSandboxAgentHostContribution.js';
import { IRemoteAgentHostConnectionCustomizationService } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
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
	private _displayLabel: string;
	override get label(): string { return this._displayLabel; }

	constructor(readonly config: IRemoteAgentHostSessionsProviderConfig) {
		super();
		this.id = `agenthost-${config.address}`;
		this._displayLabel = config.name;
	}

	override setLabel(label: string): void {
		this._displayLabel = label;
	}

	/** Records opt-in metadata updates; host-state merging is covered by the real provider's tests. */
	override seedSessions(metas: readonly IAgentSessionMetadata[], options?: { readonly updateExisting?: boolean }): void {
		for (const meta of metas) {
			const index = this.seeded.findIndex(seen => seen.session.toString() === meta.session.toString());
			if (index === -1) {
				this.seeded.push(meta);
			} else if (options?.updateExisting) {
				this.seeded[index] = meta;
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

	override getSessionModifiedTime(rawId: string): number | undefined {
		return this.getCachedSession(rawId)?.updatedAt.get().getTime();
	}

	override publishWithheldSession(rawId: string): void {
		this.withheld.delete(rawId);
	}

	private _toSession(meta: IAgentSessionMetadata): ISession {
		return upcastPartial<ISession>({
			resource: URI.from({ scheme: 'agent-host-copilot', path: `/${AgentSession.id(meta.session)}` }),
			updatedAt: constObservable(new Date(meta.modifiedTime)),
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

	checkForUpdates(): Promise<void> {
		return this._refreshIfStale();
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

class TestLogService extends NullLogService {
	readonly warnings: (string | Error)[] = [];

	override warn(message: string | Error, ..._args: unknown[]): void {
		this.warnings.push(message);
	}
}

/** The single host filter entry every sandbox environment folds into. */
const GITHUB_SANDBOX_GROUP: IAgentHostGroup = {
	id: 'githubsandbox',
	label: 'GitHub Sandboxes',
	order: 1,
	connectable: false,
	sessionCreationProviderId: isWeb ? CLOUD_SANDBOX_CREATION_PROVIDER_ID : undefined,
};

interface ITestHarness {
	readonly contribution: TestCloudSandboxContribution;
	readonly configurationService: TestConfigurationService;
	setEnabled(enabled: boolean): Promise<void>;
	setChatHidden(hidden: boolean): void;
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
	readonly discoveryModes: boolean[];
	setFocused(focused: boolean): void;
	selectSandboxHost(): void;
	changeAccount(accountKey: string | undefined): void;
}

/**
 * Creates the contribution with a discovery result, and resolves once the constructor's eager
 * `_discoverAndSeed()` pass has committed its seeds. `hostGroups` holds the groups currently
 * declared to the host filter, so tests can assert the entry's presence and its teardown.
 */
async function createContribution(store: Pick<DisposableStore, 'add'>, sessions: readonly ICloudSandboxDiscoveredSession[], options?: {
	/** Task Mission Control returns from `createSession`, or a rejection. */
	readonly createSession?: () => Promise<ICloudSandboxCreatedSession>;
	readonly listSessions?: (token: CancellationToken, options?: { readonly incremental?: boolean }) => Promise<ICloudSandboxDiscoveryResult>;
	readonly getEnvironment?: (id: string, token: CancellationToken) => Promise<ICloudSandboxEnvironmentRecord>;
	/** Whether the sandbox feature settings start on. Defaults to `true`. */
	readonly enabled?: boolean;
	readonly aiDisabled?: boolean;
	readonly chatHidden?: boolean;
	readonly logService?: ILogService;
	readonly storageService?: IStorageService;
	readonly accountKey?: string | null;
	readonly waitForDiscovery?: boolean;
}): Promise<ITestHarness> {
	const discoveryHandlers: (() => Promise<void>)[] = [];
	const hostGroups: IAgentHostGroup[] = [];
	const readOnlySessionTypes: string[] = [];
	const instantiationService = store.add(new TestInstantiationService());
	const created: ICloudSandboxCreateSessionRequest[] = [];
	const connectedTo: string[] = [];
	const historyRequests: string[] = [];
	const onDidChangeSentiment = store.add(new Emitter<void>());
	let chatHidden = options?.chatHidden ?? false;
	const discoveryModes: boolean[] = [];
	const focusChanges = store.add(new Emitter<boolean>());
	const hostSelectionChanges = store.add(new Emitter<void>());
	const accountChanges = store.add(new Emitter<string | undefined>());
	let accountKey = options?.accountKey === null ? undefined : options?.accountKey ?? '["github","account-1"]';
	let focused = true;
	let selectedHostId: string | undefined;
	const harness: ITestHarness = {
		discovered: sessions,
		environmentStatus: 'offline',
		readOnlySessionTypes,
		created,
		connectedTo,
		historyRequests,
		hostGroups,
		discoveryModes,
		changeAccount: value => {
			accountKey = value;
			accountChanges.fire(value);
		},
		setFocused: value => {
			focused = value;
			focusChanges.fire(value);
		},
		selectSandboxHost: () => {
			selectedHostId = GITHUB_SANDBOX_GROUP.id;
			hostSelectionChanges.fire();
		},
		setEnabled: async (enabled: boolean) => {
			await configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === CloudSandboxEnabledSettingId,
				affectedKeys: new Set([CloudSandboxEnabledSettingId]),
				change: { keys: [CloudSandboxEnabledSettingId], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		},
		setChatHidden: hidden => {
			chatHidden = hidden;
			onDidChangeSentiment.fire();
		},
		runDiscovery: async () => { await Promise.all(discoveryHandlers.map(handler => handler())); },
		activate: async (environmentId: string) => {
			const sessionType = remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER);
			return harness.contribution.activate(sessionType);
		},
	} as ITestHarness;

	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override readonly onDidChangeAccount = accountChanges.event;
		override async getAccountKey(): Promise<string | undefined> { return accountKey; }
		override async listSessions(token: CancellationToken, discoveryOptions?: { readonly incremental?: boolean }): Promise<ICloudSandboxDiscoveryResult> {
			discoveryModes.push(discoveryOptions?.incremental === true);
			if (options?.listSessions) {
				return options.listSessions(token, discoveryOptions);
			}
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
		override readonly onDidChange = hostSelectionChanges.event;
		override get selectedHostId() { return selectedHostId; }
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
		[ChatAIDisabledSettingId]: options?.aiDisabled ?? false,
	});
	instantiationService.stub(IConfigurationService, configurationService);
	instantiationService.stub(IStorageService, options?.storageService ?? store.add(new InMemoryStorageService()));
	instantiationService.stub(IHostService, new class extends mock<IHostService>() {
		override readonly onDidChangeFocus = focusChanges.event;
		override get hasFocus() { return focused; }
	}());
	instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
		override readonly onDidChangeSentiment = Event.any(
			onDidChangeSentiment.event,
			Event.map(Event.filter(configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatAIDisabledSettingId)), () => undefined),
		);
		override get sentiment(): IChatSentiment {
			return { hidden: chatHidden || configurationService.getValue<boolean>(ChatAIDisabledSettingId) };
		}
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
	instantiationService.stub(ILogService, options?.logService ?? new NullLogService());

	const contribution = store.add(instantiationService.createInstance(TestCloudSandboxContribution));
	// The constructor kicks off discovery eagerly; re-running the registered handler awaits it,
	// because `_discoverAndSeed` serializes onto the in-flight pass.
	if (options?.waitForDiscovery !== false) {
		await harness.runDiscovery();
	}
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

	test('does not advertise or discover sandboxes when AI features are disabled', async () => {
		let discoveries = 0;
		const { contribution, hostGroups } = await createContribution(store, [], {
			aiDisabled: true,
			listSessions: async () => {
				discoveries++;
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});

		assert.deepStrictEqual({ discoveries, groups: [...hostGroups], providers: [...contribution.stubProviders.keys()] }, { discoveries: 0, groups: [], providers: [] });
	});

	test('removes sandbox hosts and disposes their providers when AI features are disabled', async () => {
		const { contribution, configurationService, hostGroups } = await createContribution(store, [discoveredSession()]);
		const providers = [...contribution.stubProviders.values()];
		await configurationService.setUserConfiguration(ChatAIDisabledSettingId, true);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === ChatAIDisabledSettingId,
			affectedKeys: new Set([ChatAIDisabledSettingId]),
			change: { keys: [ChatAIDisabledSettingId], overrides: [] },
			source: ConfigurationTarget.USER,
		});

		assert.deepStrictEqual({ disposed: providers.map(provider => provider.disposed), groups: [...hostGroups] }, { disposed: [true], groups: [] });
	});

	test('does not advertise or discover sandboxes when hidden by entitlement policy', async () => {
		let discoveries = 0;
		const { contribution, hostGroups } = await createContribution(store, [], {
			chatHidden: true,
			listSessions: async () => {
				discoveries++;
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});

		assert.deepStrictEqual({ discoveries, groups: [...hostGroups], providers: [...contribution.stubProviders.keys()] }, { discoveries: 0, groups: [], providers: [] });
	});

	test('tears down sandbox hosts when entitlement policy hides chat and rediscovers when restored', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const originalProvider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;

		harness.setChatHidden(true);
		await harness.runDiscovery();
		const hidden = { groups: [...harness.hostGroups], disposed: originalProvider.disposed };

		harness.setChatHidden(false);
		await harness.runDiscovery();
		const restoredProvider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'));

		assert.deepStrictEqual({
			hidden,
			restored: {
				groups: [...harness.hostGroups],
				replaced: restoredProvider !== originalProvider,
				disposed: restoredProvider?.disposed,
			},
		}, {
			hidden: { groups: [], disposed: true },
			restored: { groups: [GITHUB_SANDBOX_GROUP], replaced: true, disposed: false },
		});
	});

	test('does not warn when discovery is cancelled', async () => {
		const logService = new TestLogService();
		const { contribution } = await createContribution(store, [], {
			listSessions: async () => { throw new CancellationError(); },
			logService,
		});

		assert.deepStrictEqual({
			providers: [...contribution.stubProviders.keys()],
			warnings: logService.warnings,
		}, {
			providers: [],
			warnings: [],
		});
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

suite('CloudSandboxAgentHostContribution startup inventory', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const account = '["github","account-1"]';
	const storageKey = `sessions.cloudSandbox.inventory.${account}`;

	function entryKey(session: ICloudSandboxDiscoveredSession, accountKey = account): string {
		return `sessions.cloudSandbox.inventory.${accountKey}.${JSON.stringify([session.environmentId, session.sessionId])}`;
	}

	function readInventory(storageService: IStorageService, accountKey = account): readonly ICloudSandboxDiscoveredSession[] {
		return storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE)
			.filter(key => key.startsWith(`sessions.cloudSandbox.inventory.${accountKey}.`))
			.flatMap(key => {
				const cached = storageService.getObject<{ sessions: ICloudSandboxDiscoveredSession[] }>(key, StorageScope.PROFILE);
				assert.ok(cached);
				return cached.sessions;
			});
	}

	class IsolatedWindowStorageService extends InMemoryStorageService {
		constructor(private readonly shared: IStorageService) {
			super();
			for (const key of shared.keys(StorageScope.PROFILE, StorageTarget.MACHINE)) {
				super.store(key, shared.get(key, StorageScope.PROFILE), StorageScope.PROFILE, StorageTarget.MACHINE, true);
			}
		}

		override store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget, external = false): void {
			super.store(key, value, scope, target, external);
			if (!external && value !== undefined && value !== null) {
				this.shared.store(key, value, scope, target);
			}
		}

		override remove(key: string, scope: StorageScope, external = false): void {
			super.remove(key, scope, external);
			if (!external) {
				this.shared.remove(key, scope);
			}
		}
	}

	test('restores session rows and repository metadata before discovery finishes without connecting', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const session = discoveredSession();
		const first = await createContribution(store, [session], { storageService });
		first.contribution.dispose();
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		const restored = await createContribution(store, [], {
			storageService, waitForDiscovery: false,
			listSessions: async () => {
				await started.complete();
				return pending.p;
			},
		});
		await started.p;
		const provider = restored.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId));

		assert.deepStrictEqual({
			cached: readInventory(storageService),
			machineKeys: storageService.keys(StorageScope.PROFILE, StorageTarget.MACHINE),
			seeded: provider?.seeded.map(meta => ({
				id: AgentSession.id(meta.session), title: meta.summary,
				modifiedTime: meta.modifiedTime, repository: meta.project?.displayName,
			})),
			connected: restored.connectedTo,
			history: restored.historyRequests,
		}, {
			cached: [session],
			machineKeys: [entryKey(session)],
			seeded: [{ id: session.sessionId, title: session.name, modifiedTime: Date.parse(session.updatedAt!), repository: session.repoName }],
			connected: [], history: [],
		});
		await pending.complete({ kind: 'complete', sessions: [session] });
		await restored.runDiscovery();
		await restored.activate(session.environmentId);
		assert.deepStrictEqual(restored.historyRequests, [session.taskId]);
	});

	test('keeps restored rows on failure and persists removals only after authoritative discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		let result: ICloudSandboxDiscoveryResult = { kind: 'failed', reason: 'offline' };
		const restored = await createContribution(store, [], { storageService, listSessions: async () => result });
		const provider = restored.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const retained = !provider.disposed;
		result = { kind: 'complete', sessions: [] };
		await restored.runDiscovery();
		restored.contribution.dispose();
		const next = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			retained, removed: provider.disposed,
			cached: readInventory(storageService),
			reappeared: next.contribution.stubProviders.size,
		}, { retained: true, removed: true, cached: [], reappeared: 0 });
	});

	test('merges partial discoveries into the saved inventory and persists explicit removals', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		const other = discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' });
		let result: ICloudSandboxDiscoveryResult = { kind: 'partial', sessions: [other] };
		const restored = await createContribution(store, [], { storageService, listSessions: async () => result });
		const merged = readInventory(storageService);
		result = { kind: 'incremental', sessions: [], removedTaskIds: ['task-1'] };
		await restored.runDiscovery();

		assert.deepStrictEqual({
			merged, afterRemoval: readInventory(storageService),
		}, {
			merged: [discoveredSession(), other],
			afterRemoval: [other],
		});
	});

	test('refreshes existing provider metadata and persists repository replacement and removal', async () => {
		const storageService = store.add(new InMemoryStorageService());
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [discoveredSession()] };
		const harness = await createContribution(store, [], { storageService, listSessions: async () => result });
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const updated = discoveredSession({
			name: 'Renamed task', repoName: 'owner/other', updatedAt: '2026-09-22T11:00:00Z',
		});
		result = { kind: 'incremental', sessions: [updated], removedTaskIds: [] };
		await harness.runDiscovery();
		const replacedRepository = provider.seeded[0].project?.displayName;
		const withoutRepository = { ...updated, repoName: undefined };
		result = { kind: 'incremental', sessions: [withoutRepository], removedTaskIds: [] };
		await harness.runDiscovery();

		assert.deepStrictEqual({
			sameProvider: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
			disposed: provider.disposed,
			label: provider.label,
			title: provider.seeded[0].summary,
			modifiedTime: provider.seeded[0].modifiedTime,
			replacedRepository,
			project: provider.seeded[0].project,
			cached: readInventory(storageService).map(session => ({ name: session.name, repoName: session.repoName, updatedAt: session.updatedAt })),
		}, {
			sameProvider: true,
			disposed: false,
			label: updated.name,
			title: updated.name,
			modifiedTime: Date.parse(updated.updatedAt!),
			replacedRepository: 'owner/other',
			project: undefined,
			cached: [{ name: updated.name, repoName: undefined, updatedAt: updated.updatedAt }],
		});
	});

	test('never restores another account inventory or displays it while signed out', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		const other = await createContribution(store, [], {
			storageService, accountKey: '["github","account-2"]',
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const otherAccountRows = other.contribution.stubProviders.size;
		other.changeAccount(account);
		const ownCached = other.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const restoredImmediately = !ownCached.disposed;
		await other.runDiscovery();
		other.changeAccount(undefined);
		await other.runDiscovery();
		const signedOut = await createContribution(store, [], { storageService, accountKey: null });

		assert.deepStrictEqual({
			otherAccountRows, restoredImmediately, hiddenOnSignOut: ownCached.disposed,
			signedOutRows: signedOut.contribution.stubProviders.size,
			signedOutRequests: signedOut.discoveryModes,
			saved: readInventory(storageService),
		}, {
			otherAccountRows: 0, restoredImmediately: true, hiddenOnSignOut: true,
			signedOutRows: 0, signedOutRequests: [],
			saved: [discoveredSession()],
		});
	});

	test('does not treat a refresh without a timestamp as new session activity', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const session = discoveredSession({ updatedAt: undefined });
		const harness = await createContribution(store, [session]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress(session.environmentId))!;
		const modifiedTime = provider.seeded[0].modifiedTime;
		await timeout(60_000);
		harness.discovered = [{ ...session, name: 'Renamed without a timestamp' }];
		await harness.runDiscovery();

		assert.deepStrictEqual({
			title: provider.seeded[0].summary,
			modifiedTime: provider.seeded[0].modifiedTime,
			elapsed: Date.now() - modifiedTime,
		}, { title: 'Renamed without a timestamp', modifiedTime, elapsed: 60_000 });
	}));

	test('does not dispose providers when credentials change for the same account', async () => {
		const harness = await createContribution(store, [discoveredSession()]);
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		harness.changeAccount(account);
		await harness.runDiscovery();

		assert.deepStrictEqual({
			disposed: provider.disposed,
			same: harness.contribution.stubProviders.get(cloudSandboxAddress('env-1')) === provider,
		}, { disposed: false, same: true });
	});

	test('ignores an old account discovery result after switching accounts', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		let block = false;
		let oldToken: CancellationToken | undefined;
		let sessions = [discoveredSession()];
		const harness = await createContribution(store, [], {
			storageService,
			listSessions: async token => {
				if (block) {
					oldToken = token;
					await started.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions };
			},
		});
		block = true;
		const previous = harness.runDiscovery();
		await started.p;
		const otherAccount = '["github","account-2"]';
		harness.changeAccount(otherAccount);
		block = false;
		sessions = [discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' })];
		const current = harness.runDiscovery();
		await pending.complete({ kind: 'complete', sessions: [discoveredSession({ environmentId: 'late' })] });
		await Promise.all([previous, current]);

		assert.deepStrictEqual({
			cancelled: oldToken?.isCancellationRequested,
			visible: [...harness.contribution.stubProviders].filter(([, provider]) => !provider.disposed).map(([address]) => address),
			previousAccount: readInventory(storageService),
			currentAccount: readInventory(storageService, otherAccount),
		}, {
			cancelled: true, visible: [cloudSandboxAddress('env-2')],
			previousAccount: [discoveredSession()],
			currentAccount: sessions,
		});
	});

	test('an older scan cannot discard a session provisioned in another window before storage events arrive', async () => {
		const shared = store.add(new InMemoryStorageService());
		const firstStorage = store.add(new IsolatedWindowStorageService(shared));
		const first = await createContribution(store, [discoveredSession()], { storageService: firstStorage });
		const secondStorage = store.add(new IsolatedWindowStorageService(shared));
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		let block = false;
		const second = await createContribution(store, [], {
			storageService: secondStorage,
			listSessions: async () => {
				if (block) {
					await started.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		block = true;
		const olderScan = second.runDiscovery();
		await started.p;
		first.onConnect = async () => { throw new Error('offline'); };
		await assert.rejects(first.contribution.provisionSession({ prompt: 'hello' }, CancellationToken.None), /offline/);
		await pending.complete({ kind: 'complete', sessions: [discoveredSession()] });
		await olderScan;
		first.contribution.dispose();
		second.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService: store.add(new IsolatedWindowStorageService(shared)),
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			staleWindowInventory: readInventory(secondStorage).map(session => session.sessionId),
			saved: readInventory(shared).map(session => session.sessionId).sort(),
			restored: [...restored.contribution.stubProviders.keys()].sort(),
			connected: restored.connectedTo,
		}, {
			staleWindowInventory: ['sess-1'],
			saved: ['sess-1', 'sess-new'],
			restored: [cloudSandboxAddress('env-1'), cloudSandboxAddress('env-new')],
			connected: [],
		});
	});

	test('does not replay unchanged inventory over another window metadata updates or removals', async () => {
		const shared = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], {
			storageService: store.add(new IsolatedWindowStorageService(shared)),
		});
		const second = await createContribution(store, [discoveredSession()], {
			storageService: store.add(new IsolatedWindowStorageService(shared)),
		});
		const updated = discoveredSession({ name: 'Renamed in another window', updatedAt: '2026-09-22T11:00:00Z' });
		first.discovered = [updated];
		await first.runDiscovery();
		await second.runDiscovery();
		const afterUpdate = readInventory(shared);
		first.discovered = [];
		await first.runDiscovery();
		await second.runDiscovery();

		assert.deepStrictEqual({ afterUpdate, afterRemoval: readInventory(shared) }, {
			afterUpdate: [updated],
			afterRemoval: [],
		});
	});

	test('migrates a legacy account snapshot before awaiting network discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const sessions = [discoveredSession(), discoveredSession({ environmentId: 'env-2', sessionId: 'sess-2', taskId: 'task-2' })];
		storageService.store(storageKey, { version: 1, sessions }, StorageScope.PROFILE, StorageTarget.MACHINE);
		const harness = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			saved: readInventory(storageService),
			legacy: storageService.get(storageKey, StorageScope.PROFILE),
			rows: [...harness.contribution.stubProviders.keys()],
		}, {
			saved: sessions,
			legacy: undefined,
			rows: [cloudSandboxAddress('env-1'), cloudSandboxAddress('env-2')],
		});
	});

	test('restores newly provisioned sessions even when connecting failed before the next discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [], { storageService });
		first.onConnect = async () => { throw new Error('offline'); };
		await assert.rejects(first.contribution.provisionSession({ repoNwo: 'owner/repository', prompt: 'hello' }, CancellationToken.None), /offline/);
		first.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService, listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});

		assert.deepStrictEqual({
			sessions: restored.contribution.stubProviders.get(cloudSandboxAddress('env-new'))?.seeded.map(meta => ({
				id: AgentSession.id(meta.session), repository: meta.project?.displayName,
			})),
			connected: restored.connectedTo,
		}, { sessions: [{ id: 'sess-new', repository: 'owner/repository' }], connected: [] });
	});

	test('does not restore inventory while disabled and restores it on enablement', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = await createContribution(store, [discoveredSession()], { storageService });
		first.contribution.dispose();
		const restored = await createContribution(store, [], {
			storageService, enabled: false,
			listSessions: async () => ({ kind: 'failed', reason: 'offline' }),
		});
		const disabledRows = restored.contribution.stubProviders.size;
		await restored.configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		await restored.setEnabled(true);
		await restored.runDiscovery();

		assert.deepStrictEqual({
			disabledRows, restoredRows: [...restored.contribution.stubProviders.keys()],
		}, { disabledRows: 0, restoredRows: [cloudSandboxAddress('env-1')] });
	});

	test('reports invalid cached inventory and continues with discovery', async () => {
		const storageService = store.add(new InMemoryStorageService());
		storageService.store(storageKey, { version: 1, sessions: [{ ...discoveredSession(), taskId: 42 }] }, StorageScope.PROFILE, StorageTarget.MACHINE);
		const logService = new TestLogService();
		const harness = await createContribution(store, [], { storageService, logService });

		assert.deepStrictEqual({
			rows: harness.contribution.stubProviders.size,
			warnings: logService.warnings,
		}, { rows: 0, warnings: ['[CloudSandboxAgentHost] Ignoring invalid cached sandbox inventory.'] });
	});

	test('continues discovery when cached inventory JSON cannot be read', async () => {
		const storageService = store.add(new InMemoryStorageService());
		storageService.store(storageKey, '{invalid', StorageScope.PROFILE, StorageTarget.MACHINE);
		const logService = new TestLogService();
		const harness = await createContribution(store, [discoveredSession()], { storageService, logService });

		assert.deepStrictEqual({
			rows: [...harness.contribution.stubProviders.keys()],
			warnings: logService.warnings,
		}, {
			rows: [cloudSandboxAddress('env-1')],
			warnings: ['[CloudSandboxAgentHost] Reading cached sandbox inventory failed.'],
		});
	});
});

suite('CloudSandboxAgentHostContribution discovery refresh', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares overlapping full refreshes without an unnecessary follow-up scan', async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		let hold = false;
		const harness = await createContribution(store, [], {
			listSessions: async () => hold ? pending.p : { kind: 'complete', sessions: [] },
		});
		hold = true;
		const first = harness.runDiscovery();
		const second = harness.runDiscovery();
		await pending.complete({ kind: 'complete', sessions: [] });
		await Promise.all([first, second]);

		assert.deepStrictEqual(harness.discoveryModes, [false, false]);
	});

	test('refreshes on stale focus and host selection but not while blurred or fresh', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => options?.incremental
				? { kind: 'incremental', sessions: [], removedTaskIds: [] }
				: { kind: 'complete', sessions: [] },
		});
		harness.setFocused(false);
		harness.setFocused(true);
		await harness.contribution.checkForUpdates();
		const fresh = harness.discoveryModes.length;

		harness.setFocused(false);
		await timeout(60_000);
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();
		const blurred = harness.discoveryModes.length;

		harness.setFocused(true);
		await harness.contribution.checkForUpdates();
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();
		await timeout(60_000);
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();

		assert.deepStrictEqual({ fresh, blurred, modes: harness.discoveryModes }, {
			fresh: 1, blurred: 1, modes: [false, true, true],
		});
	}));

	test('automatically reconciles the full inventory after the full-scan interval', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		let sessions = [discoveredSession()];
		const harness = await createContribution(store, sessions, {
			listSessions: async (_token, options) => options?.incremental
				? { kind: 'incremental', sessions: [], removedTaskIds: [] }
				: { kind: 'complete', sessions },
		});
		const provider = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		await timeout(60_000);
		await harness.contribution.checkForUpdates();
		const retainedAfterIncremental = !provider.disposed;
		sessions = [];
		await timeout(14 * 60_000);
		await harness.contribution.checkForUpdates();

		assert.deepStrictEqual({
			modes: harness.discoveryModes, retainedAfterIncremental, removedAfterFull: provider.disposed,
		}, { modes: [false, true, false], retainedAfterIncremental: true, removedAfterFull: true });
	}));

	test('backs off unsuccessful automatic refreshes while manual refresh bypasses staleness', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => options?.incremental
				? { kind: 'failed', reason: 'temporarily unavailable' }
				: { kind: 'complete', sessions: [] },
		});
		await timeout(60_000);
		await harness.contribution.checkForUpdates();
		await timeout(60_000);
		await harness.contribution.checkForUpdates();
		const duringBackoff = harness.discoveryModes.length;
		await timeout(60_000);
		await harness.contribution.checkForUpdates();
		await harness.runDiscovery();

		assert.deepStrictEqual({ duringBackoff, modes: harness.discoveryModes }, {
			duringBackoff: 2, modes: [false, true, true, false],
		});
	}));

	test('queues one full refresh when manual requests overlap an incremental scan', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const harness = await createContribution(store, [], {
			listSessions: async (_token, options) => options?.incremental ? pending.p : { kind: 'complete', sessions: [] },
		});
		await timeout(60_000);
		const automatic = harness.contribution.checkForUpdates();
		const manual = harness.runDiscovery();
		const anotherManual = harness.runDiscovery();
		await pending.complete({ kind: 'incremental', sessions: [], removedTaskIds: [] });
		await Promise.all([automatic, manual, anotherManual]);

		assert.deepStrictEqual(harness.discoveryModes, [false, true, false]);
	}));

	test('keeps absent sessions but reconciles explicit removals from incremental and partial scans', async () => {
		let result: ICloudSandboxDiscoveryResult = {
			kind: 'complete',
			sessions: [
				discoveredSession(),
				discoveredSession({ environmentId: 'env-2', taskId: 'task-2', sessionId: 'sess-2' }),
			],
		};
		const harness = await createContribution(store, [], { listSessions: async () => result });
		const first = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		const second = harness.contribution.stubProviders.get(cloudSandboxAddress('env-2'))!;
		result = { kind: 'incremental', sessions: [], removedTaskIds: [] };
		await harness.runDiscovery();
		const retained = [!first.disposed, !second.disposed];
		result = { kind: 'partial', sessions: [], removedTaskIds: ['task-1'] };
		await harness.runDiscovery();

		assert.deepStrictEqual({ retained, disposed: [first.disposed, second.disposed] }, {
			retained: [true, true], disposed: [true, false],
		});
	});

	test('replaces a disconnected environment when an incremental update moves its task', async () => {
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [discoveredSession()] };
		const harness = await createContribution(store, [], { listSessions: async () => result });
		const previous = harness.contribution.stubProviders.get(cloudSandboxAddress('env-1'))!;
		result = {
			kind: 'incremental',
			sessions: [discoveredSession({ environmentId: 'env-replacement', sessionId: 'replacement' })],
			removedTaskIds: [],
		};
		await harness.runDiscovery();

		assert.deepStrictEqual({
			previousDisposed: previous.disposed,
			current: [...harness.contribution.stubProviders].filter(([, provider]) => !provider.disposed).map(([address]) => address),
		}, { previousDisposed: true, current: [cloudSandboxAddress('env-replacement')] });
	});

	test('re-enabling queues fresh discovery and ignores a cancelled in-flight result', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const started = new DeferredPromise<void>();
		let incrementalToken: CancellationToken | undefined;
		const harness = await createContribution(store, [], {
			listSessions: async (token, options) => {
				if (options?.incremental) {
					incrementalToken = token;
					await started.complete();
					return pending.p;
				}
				return { kind: 'complete', sessions: [discoveredSession()] };
			},
		});
		await timeout(60_000);
		const automatic = harness.contribution.checkForUpdates();
		await started.p;
		await harness.setEnabled(false);
		await harness.setEnabled(true);
		const manual = harness.runDiscovery();
		await pending.complete({
			kind: 'incremental',
			sessions: [discoveredSession({ environmentId: 'cancelled' })],
			removedTaskIds: [],
		});
		await Promise.all([automatic, manual]);

		assert.deepStrictEqual({
			cancelled: incrementalToken?.isCancellationRequested,
			modes: harness.discoveryModes,
			current: [...harness.contribution.stubProviders].filter(([, provider]) => !provider.disposed).map(([address]) => address),
		}, { cancelled: true, modes: [false, true, false], current: [cloudSandboxAddress('env-1')] });
	}));

	test('does not automatically refresh a disabled or disposed contribution', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const harness = await createContribution(store, []);
		await harness.setEnabled(false);
		await timeout(60_000);
		harness.setFocused(true);
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();
		await harness.setEnabled(true);
		await harness.runDiscovery();
		harness.contribution.dispose();
		await timeout(60_000);
		harness.setFocused(true);
		harness.selectSandboxHost();
		await harness.contribution.checkForUpdates();

		assert.deepStrictEqual(harness.discoveryModes, [false, false]);
	}));
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
