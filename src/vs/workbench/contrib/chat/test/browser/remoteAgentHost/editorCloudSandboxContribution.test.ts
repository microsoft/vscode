/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { AgentSession, IAgentConnection, IAgentSessionMetadata } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolutionPolicy } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority, createAgentHostResourceUriMapper } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { remoteAgentHostSessionTypeId } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER, cloudSandboxAddress, CloudSandboxEnabledSettingId, ICloudSandboxAgentHostService, ICloudSandboxApiService, ICloudSandboxConnectOptions, ICloudSandboxDiscoveredSession, ICloudSandboxDiscoveryResult } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { INotification, NotificationType } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { createChatState, createDefaultChatSummary, createSessionState, MessageKind, RootState, SessionStatus, TurnState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IReplayedTaskHistory } from '../../../../../../platform/agentHost/common/taskEventReplay.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IAgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { AgentSessionsFilter } from '../../../browser/agentSessions/agentSessionsFilter.js';
import { IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { EditorCloudSandboxContribution, EditorCloudSandboxSessionContribution } from '../../../browser/remoteAgentHost/editorCloudSandboxContribution.js';
import { IRemoteAgentHostAuthenticationService, RemoteAgentHostAuthenticationService } from '../../../browser/remoteAgentHost/remoteAgentHostAuthentication.js';
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from '../../../browser/remoteAgentHost/remoteAgentHostConnectionCustomization.js';
import { IChatService } from '../../../common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionContentProvider, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionsService, IChatSessionsExtensionPoint, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../common/chatSessionsService.js';

const discovered: ICloudSandboxDiscoveredSession = {
	environmentId: 'environment-one',
	sessionId: 'original-session',
	taskId: 'original-task',
	name: 'Original sandbox session',
	repoName: 'example/project',
	updatedAt: '2026-01-02T03:04:05.000Z',
	status: SessionStatus.InputNeeded,
};
const address = cloudSandboxAddress(discovered.environmentId);
const authority = agentHostAuthority(address);
const sessionType = remoteAgentHostSessionTypeId(authority, CLOUD_SANDBOX_AGENT_PROVIDER);
const resource = URI.from({ scheme: sessionType, path: `/${discovered.sessionId}` });
const backendSession = AgentSession.uri('ahp-session', discovered.sessionId);

class TestEditorCloudSandboxContribution extends EditorCloudSandboxSessionContribution {
	activate(): Promise<boolean> {
		return this._waitForActivation(sessionType);
	}
}

function history(): IReplayedTaskHistory {
	const summary = {
		resource: backendSession.toString(),
		provider: CLOUD_SANDBOX_AGENT_PROVIDER,
		title: discovered.name,
		status: SessionStatus.Idle,
		createdAt: discovered.updatedAt!,
		modifiedAt: discovered.updatedAt!,
	};
	const chat = createChatState(createDefaultChatSummary(summary, 'ahp-chat:/original-chat'));
	chat.turns.push({
		id: 'original-turn',
		message: { text: 'Original request', origin: { kind: MessageKind.User } },
		responseParts: [],
		usage: undefined,
		state: TurnState.Complete,
	});
	return {
		sessions: [{
			session: summary.resource,
			state: createSessionState(summary),
			chats: new Map([[chat.resource, chat]]),
			defaultChat: chat.resource,
			modifiedAt: summary.modifiedAt,
		}],
		truncated: false,
	};
}

function createHarness(store: Pick<DisposableStore, 'add'>, options?: {
	readonly enabled?: boolean;
	readonly listSessions?: () => Promise<ICloudSandboxDiscoveryResult>;
	readonly storageService?: IStorageService;
}) {
	const instantiationService = store.add(new TestInstantiationService());
	const configuration = new TestConfigurationService({
		[CloudSandboxEnabledSettingId]: options?.enabled ?? true,
		[RemoteAgentHostsEnabledSettingId]: true,
	});
	const connectionsChanged = store.add(new Emitter<void>());
	const authenticationService = new RemoteAgentHostAuthenticationService();
	const authenticationPending = store.add(authenticationService.acquire(address)).object;
	const notifications = store.add(new Emitter<INotification>());
	const sentimentChanged = store.add(new Emitter<void>());
	const accountChanged = store.add(new Emitter<string | undefined>());
	const focusChanged = store.add(new Emitter<boolean>());
	const controllers = new Map<string, IChatSessionItemController>();
	const contributions = new Map<string, ResolvedChatSessionsExtensionPoint>();
	const contentProviders = new Map<string, IChatSessionContentProvider>();
	const initialRefreshes: Promise<void>[] = [];
	const discoveryModes: boolean[] = [];
	const calls = { discovered: 0, created: 0, connected: [] as ICloudSandboxConnectOptions[], history: [] as string[], removed: [] as string[] };
	const state = {
		result: { kind: 'complete', sessions: [discovered] } as ICloudSandboxDiscoveryResult,
		online: false,
		connected: false,
		completeAuthentication: true,
		hidden: false,
		accountKey: 'github:editor-account' as string | undefined,
		connectError: undefined as Error | undefined,
		hostSessions: [{
			session: backendSession, summary: discovered.name,
			startTime: Date.parse(discovered.updatedAt!), modifiedTime: Date.parse(discovered.updatedAt!),
			status: SessionStatus.InputNeeded,
			workingDirectories: [URI.file('/remote/project')],
		}] as IAgentSessionMetadata[],
	};
	const rootState: RootState = { agents: [{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, displayName: 'Copilot', description: '', models: [] }] };
	const connection = new class extends mock<IAgentConnection>() {
		override readonly clientId = 'editor-client';
		override readonly rootState = upcastPartial<IAgentSubscription<RootState>>({ value: rootState, onDidChange: Event.None });
		override readonly onDidNotification = notifications.event;
		override readonly initializeResult = constObservable(undefined);
		override readonly resourceUris = createAgentHostResourceUriMapper(authority);
		override async listSessions(): Promise<IAgentSessionMetadata[]> { return state.hostSessions; }
	}();
	const chatSessionsService = new class extends mock<IChatSessionsService>() {
		override readonly onDidChangeItemsProviders = Event.None;
		override readonly onDidChangeAvailability = Event.None;
		override getChatSessionContribution(type: string) { return contributions.get(type); }
		override getAllChatSessionContributions() { return [...contributions.values()]; }
		override registerChatSessionContribution(contribution: IChatSessionsExtensionPoint) {
			contributions.set(contribution.type, { ...contribution, icon: undefined });
			return toDisposable(() => contributions.delete(contribution.type));
		}
		override registerChatSessionItemController(type: string, controller: IChatSessionItemController) {
			controllers.set(type, controller);
			initialRefreshes.push(controller.refresh(CancellationToken.None));
			return toDisposable(() => controllers.delete(type));
		}
		override registerChatSessionContentProvider(type: string, provider: IChatSessionContentProvider) {
			assert.ok(!contentProviders.has(type), 'only one content provider can own a session type');
			contentProviders.set(type, provider);
			return toDisposable(() => contentProviders.delete(type));
		}
		override getContentProviderSchemes() { return [...contentProviders.keys()]; }
	}();
	instantiationService.stub(IChatSessionsService, chatSessionsService);
	instantiationService.stub(IConfigurationService, configuration);
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IStorageService, options?.storageService ?? store.add(new InMemoryStorageService()));
	instantiationService.stub(IHostService, new class extends mock<IHostService>() {
		override readonly onDidChangeFocus = focusChanged.event;
		override readonly hasFocus = true;
	}());
	instantiationService.stub(IChatEntitlementService, new class extends mock<IChatEntitlementService>() {
		override readonly onDidChangeSentiment = sentimentChanged.event;
		override get sentiment() { return { hidden: state.hidden }; }
	}());
	instantiationService.stub(ICloudSandboxApiService, new class extends mock<ICloudSandboxApiService>() {
		override readonly onDidChangeAccount = accountChanged.event;
		override async getAccountKey() { return state.accountKey; }
		override async listSessions(_token: CancellationToken, discoveryOptions?: { readonly incremental?: boolean }) {
			calls.discovered++;
			discoveryModes.push(discoveryOptions?.incremental === true);
			return options?.listSessions ? options.listSessions() : state.result;
		}
		override async createSession(): Promise<never> {
			calls.created++;
			throw new Error('Opening a discovered session must not create a task');
		}
		override async getEnvironment(id: string) { return { id, status: state.online ? 'online' as const : 'offline' as const }; }
		override async getSessionHistory(taskId: string) {
			calls.history.push(taskId);
			return history();
		}
	}());
	instantiationService.stub(ICloudSandboxAgentHostService, new class extends mock<ICloudSandboxAgentHostService>() {
		override async connect(options: ICloudSandboxConnectOptions) {
			calls.connected.push(options);
			if (state.connectError) {
				throw state.connectError;
			}
			state.connected = true;
			connectionsChanged.fire();
			if (state.completeAuthentication) {
				authenticationPending.set(false, undefined);
			}
			return address;
		}
	}());
	instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() {
		override readonly onDidChangeConnections = connectionsChanged.event;
		override get connections() {
			return state.connected ? [upcastPartial<IRemoteAgentHostConnectionInfo>({
				address, name: discovered.name, clientId: connection.clientId, status: RemoteAgentHostConnectionStatus.connected,
			})] : [];
		}
		override getConnection(candidate: string) { return state.connected && candidate === address ? connection : undefined; }
		override async removeRemoteAgentHost(candidate: string) {
			calls.removed.push(candidate);
			state.connected = false;
		}
	}());
	instantiationService.stub(IRemoteAgentHostConnectionCustomizationService, new RemoteAgentHostConnectionCustomizationService());
	instantiationService.stub(IRemoteAgentHostAuthenticationService, authenticationService);
	const policies: string[] = [];
	instantiationService.stub(IAgentHostConnectionsService, new class extends mock<IAgentHostConnectionsService>() {
		override registerSessionResolutionPolicy(connectionAuthority: string, policy: IAgentHostSessionResolutionPolicy) {
			assert.deepStrictEqual(policy.sessionSchemeAlias, { ui: 'copilot', backend: 'ahp-session' });
			policies.push(connectionAuthority);
			return toDisposable(() => policies.splice(policies.indexOf(connectionAuthority), 1));
		}
	}());
	const resolvers = new Map<string, { resolve: (resource: URI) => URI | undefined; isNew: (resource: URI) => boolean }>();
	instantiationService.stub(IAgentHostSessionWorkingDirectoryResolver, new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() {
		override registerResolver(type: string, resolve: (resource: URI) => URI | undefined, isNew: (resource: URI) => boolean = () => false) {
			resolvers.set(type, { resolve, isNew });
			return toDisposable(() => resolvers.delete(type));
		}
	}());
	instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
		override readonly onDidChangeWorkspaceFolders = Event.None;
		override getWorkspace() {
			return { id: 'unrelated-workspace', folders: [{ uri: URI.file('/local/unrelated'), name: 'unrelated', index: 0, toResource: () => URI.file('/local/unrelated') }] };
		}
	}());
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly onDidDisposeSession = Event.None;
	}());
	instantiationService.stub(IAgentHostUntitledProvisionalSessionService, new class extends mock<IAgentHostUntitledProvisionalSessionService>() { }());
	instantiationService.stub(IAgentHostImportConversationStore, new class extends mock<IAgentHostImportConversationStore>() { }());
	instantiationService.stub(IAgentHostNewSessionFolderService, new class extends mock<IAgentHostNewSessionFolderService>() { }());
	const contribution = store.add(instantiationService.createInstance(TestEditorCloudSandboxContribution));
	return {
		contribution, controllers, contributions, contentProviders, chatSessionsService, state, calls, policies, notifications, resolvers, sentimentChanged, accountChanged, authenticationPending, initialRefreshes, connectionsChanged, focusChanged, discoveryModes,
		refresh: async () => {
			await contribution.refresh(CancellationToken.None);
			await Promise.all(initialRefreshes);
		},
		items: () => [...controllers.values()].flatMap(controller => controller.items),
		setEnabled: async (key: string, enabled: boolean) => {
			await configuration.setUserConfiguration(key, enabled);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: candidate => candidate === key,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		},
	};
}

suite('Editor cloud sandbox discovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('registering the discovery controller starts exactly one initial scan', async () => {
		const h = createHarness(store);
		await Promise.all(h.initialRefreshes);
		assert.deepStrictEqual({ scans: h.calls.discovered, items: h.items().map(item => item.label) }, { scans: 1, items: [discovered.name] });
	});

	test('does not install a second sandbox adapter in the Agents Window', () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: true });
		assert.doesNotThrow(() => store.add(instantiationService.createInstance(EditorCloudSandboxContribution)));
	});

	test('discovers once per identity without connecting, creating, or filtering to the local workspace', async () => {
		const h = createHarness(store);
		await h.refresh();
		await h.refresh();
		assert.deepStrictEqual({
			items: h.items().map(item => ({ resource: item.resource.toString(), title: item.label, status: item.status, archived: item.archived, isRead: item.isRead })),
			created: h.calls.created,
			connected: h.calls.connected,
			isNew: h.resolvers.get(sessionType)?.isNew(resource),
			group: h.contributions.get(sessionType)?.sessionListGroup,
		}, {
			items: [{ resource: resource.toString(), title: discovered.name, status: ChatSessionStatus.NeedsInput, archived: undefined, isRead: undefined }],
			created: 0, connected: [], isNew: false, group: SessionType.CopilotCloud,
		});
	});

	test('keeps refresh available after an empty discovery and finds sessions created later', async () => {
		const h = createHarness(store);
		h.state.result = { kind: 'complete', sessions: [] };
		await h.refresh();
		const refreshController = [...h.controllers.values()][0];
		h.state.result = { kind: 'complete', sessions: [discovered] };
		await refreshController.refresh(CancellationToken.None);
		assert.deepStrictEqual(h.items().map(item => item.resource.toString()), [resource.toString()]);
	});

	test('refresh updates the original row instead of adding a second session', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.result = { kind: 'complete', sessions: [{ ...discovered, name: 'Renamed session', status: SessionStatus.Error }] };
		await h.refresh();
		assert.deepStrictEqual(h.items().map(item => [item.resource.toString(), item.label, item.status]), [
			[resource.toString(), 'Renamed session', ChatSessionStatus.Failed],
		]);
	});

	test('restores cached rows before network discovery without waking, then refreshes activity', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = createHarness(store, { storageService });
		await first.refresh();
		first.contribution.dispose();

		const started = new DeferredPromise<void>();
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const restored = createHarness(store, {
			storageService,
			listSessions: () => {
				void started.complete();
				return pending.p;
			},
		});
		await started.p;
		const before = restored.items().map(item => [item.resource.toString(), item.label, item.status]);
		await pending.complete({
			kind: 'complete',
			sessions: [{ ...discovered, name: 'Renamed after reload', updatedAt: '2026-01-03T03:04:05.000Z', status: SessionStatus.InputNeeded }],
		});
		await Promise.all(restored.initialRefreshes);

		assert.deepStrictEqual({
			before,
			after: restored.items().map(item => [item.resource.toString(), item.label, item.status]),
			connected: restored.calls.connected,
			created: restored.calls.created,
		}, {
			before: [[resource.toString(), discovered.name, ChatSessionStatus.Completed]],
			after: [[resource.toString(), 'Renamed after reload', ChatSessionStatus.NeedsInput]],
			connected: [],
			created: 0,
		});
	});

	test('isolates cached rows by account and restores them when the original account returns', async () => {
		const h = createHarness(store);
		await h.refresh();
		const originalAccount = h.state.accountKey;
		h.state.result = { kind: 'failed', reason: 'Discovery unavailable' };
		h.state.accountKey = 'github:another-account';
		h.accountChanged.fire(h.state.accountKey);
		await h.refresh();
		const otherAccount = h.items().map(item => item.resource.toString());
		h.state.accountKey = originalAccount;
		h.accountChanged.fire(h.state.accountKey);
		await h.refresh();

		assert.deepStrictEqual({
			otherAccount,
			restored: h.items().map(item => item.resource.toString()),
			connected: h.calls.connected,
			removed: h.calls.removed,
		}, { otherAccount: [], restored: [resource.toString()], connected: [], removed: [address] });
	});

	test('does not restore a stale discovery response after switching accounts', async () => {
		const started = new DeferredPromise<void>();
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		let scans = 0;
		const h = createHarness(store, {
			listSessions: () => {
				if (++scans === 1) {
					void started.complete();
					return pending.p;
				}
				return Promise.resolve({ kind: 'complete', sessions: [] });
			},
		});
		await started.p;
		h.state.accountKey = 'github:another-account';
		h.accountChanged.fire(h.state.accountKey);
		await pending.complete({ kind: 'complete', sessions: [discovered] });
		await h.refresh();
		assert.deepStrictEqual({ items: h.items(), scans, connected: h.calls.connected }, { items: [], scans: 2, connected: [] });
	});

	test('incremental discovery retains absent rows but honors explicit task removal', async () => {
		const h = createHarness(store);
		await h.refresh();
		const counts: number[] = [];
		for (const result of [
			{ kind: 'incremental', sessions: [], removedTaskIds: [] },
			{ kind: 'partial', sessions: [], removedTaskIds: [] },
			{ kind: 'incremental', sessions: [], removedTaskIds: [discovered.taskId] },
		] satisfies ICloudSandboxDiscoveryResult[]) {
			h.state.result = result;
			await h.refresh();
			counts.push(h.items().length);
		}
		assert.deepStrictEqual({ counts, removed: h.calls.removed }, { counts: [1, 1, 0], removed: [address] });
	});

	test('refreshes incrementally when the Editor regains focus after discovery becomes stale', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.result = { kind: 'incremental', sessions: [], removedTaskIds: [] };
		await timeout(61_000);
		h.focusChanged.fire(true);
		await timeout(0);
		assert.deepStrictEqual({ modes: h.discoveryModes, items: h.items().map(item => item.resource.toString()) }, {
			modes: [false, true], items: [resource.toString()],
		});
	}));

	test('keeps account-triggered retries after a successful scan and disable/re-enable', async () => {
		const retried = new DeferredPromise<void>();
		let result: ICloudSandboxDiscoveryResult = { kind: 'complete', sessions: [discovered] };
		let expectRetry = false;
		const h = createHarness(store, {
			listSessions: async () => {
				if (expectRetry) {
					await retried.complete();
				}
				return result;
			},
		});
		await h.refresh();
		await h.setEnabled(CloudSandboxEnabledSettingId, false);
		result = { kind: 'failed', reason: 'Authentication unavailable' };
		await h.setEnabled(CloudSandboxEnabledSettingId, true);
		await h.refresh();
		result = { kind: 'complete', sessions: [{ ...discovered, name: 'Found after signing in' }] };
		expectRetry = true;
		h.accountChanged.fire(h.state.accountKey);
		await retried.p;
		await h.refresh();
		assert.deepStrictEqual(h.items().map(item => item.label), ['Found after signing in']);
	});

	test('a corrected discovery status clears input needed and an older response cannot restore it', async () => {
		const h = createHarness(store);
		await h.refresh();
		const statuses = [h.items()[0].status];
		h.state.result = { kind: 'complete', sessions: [{ ...discovered, status: SessionStatus.Idle, updatedAt: '2026-01-02T03:05:00.000Z' }] };
		await h.refresh();
		statuses.push(h.items()[0].status);
		h.state.result = { kind: 'complete', sessions: [discovered] };
		await h.refresh();
		statuses.push(h.items()[0].status);
		assert.deepStrictEqual(statuses, [ChatSessionStatus.NeedsInput, ChatSessionStatus.Completed, ChatSessionStatus.Completed]);
	});

	test('discovery with no activity does not manufacture completion', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.result = { kind: 'complete', sessions: [{ ...discovered, status: undefined, updatedAt: '2026-01-02T03:05:00.000Z' }] };
		await h.refresh();
		assert.deepStrictEqual(h.items().map(item => item.status), [ChatSessionStatus.NeedsInput]);
	});

	test('a later discovery scan cannot replace the last host status after disconnection', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		h.state.hostSessions = [{ ...h.state.hostSessions[0], status: SessionStatus.Idle }];
		await h.contribution.activate();
		await h.controllers.get(sessionType)!.refresh(CancellationToken.None);
		const before = h.items()[0].status;
		h.state.connected = false;
		h.connectionsChanged.fire();
		h.state.result = { kind: 'complete', sessions: [{ ...discovered, updatedAt: '2026-01-02T03:05:00.000Z' }] };
		await h.refresh();
		assert.deepStrictEqual({ before, after: h.items()[0].status }, {
			before: ChatSessionStatus.Completed,
			after: ChatSessionStatus.Completed,
		});
	});

	test('retries startup discovery when the authentication provider becomes available', async () => {
		let available = false;
		const h = createHarness(store, {
			listSessions: async () => available ? { kind: 'complete', sessions: [discovered] } : { kind: 'failed', reason: 'Authentication not ready' },
		});
		await h.refresh();
		const before = h.items().length;
		available = true;
		h.accountChanged.fire(h.state.accountKey);
		await h.refresh();
		assert.deepStrictEqual({ before, after: h.items().map(item => item.label) }, { before: 0, after: [discovered.name] });
	});

	test('opens the original live session and reconciles host updates under the same identity', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		const activated = await h.contribution.activate();
		await h.controllers.get(sessionType)!.refresh(CancellationToken.None);
		h.notifications.fire({ type: NotificationType.SessionSummaryChanged, channel: 'ahp-root://', session: backendSession.toString(), changes: { title: 'Updated remotely', status: SessionStatus.InProgress } });
		assert.deepStrictEqual({
			activated,
			connected: h.calls.connected,
			created: h.calls.created,
			items: h.items().map(item => [item.resource.toString(), item.label, item.status]),
		}, {
			activated: true,
			connected: [{ environmentId: discovered.environmentId, sessionId: discovered.sessionId, name: discovered.name }],
			created: 0,
			items: [[resource.toString(), 'Updated remotely', ChatSessionStatus.InProgress]],
		});
	});

	test('opens original offline history without waking or replacing the sandbox', async () => {
		const h = createHarness(store);
		await h.refresh();
		await h.contribution.activate();
		const session = store.add(await h.contentProviders.get(sessionType)!.provideChatSessionContent(resource, CancellationToken.None));
		assert.deepStrictEqual({
			resource: session.sessionResource.toString(),
			title: session.title,
			readOnly: session.isReadOnly?.get(),
			requests: session.history.filter(item => item.type === 'request').map(item => item.prompt),
			history: h.calls.history,
			connected: h.calls.connected,
			created: h.calls.created,
		}, {
			resource: resource.toString(), title: discovered.name, readOnly: true,
			requests: ['Original request'], history: [discovered.taskId], connected: [], created: 0,
		});
	});

	test('waits for authentication before adopting host read and archive flags', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		h.state.completeAuthentication = false;
		h.state.hostSessions = [{ ...h.state.hostSessions[0], summary: 'Host title', status: SessionStatus.Idle | SessionStatus.IsRead | SessionStatus.IsArchived }];
		await h.contribution.activate();
		await h.controllers.get(sessionType)!.refresh(CancellationToken.None);
		const before = h.items().map(item => [item.label, item.isRead, item.archived]);
		h.authenticationPending.set(false, undefined);
		await h.controllers.get(sessionType)!.refresh(CancellationToken.None);
		assert.deepStrictEqual({ before, after: h.items().map(item => [item.label, item.isRead, item.archived]) }, {
			before: [[discovered.name, undefined, undefined]],
			after: [['Host title', true, true]],
		});
	});

	test('publishes unknown read and archive flags on disconnect without changing activity', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		h.state.hostSessions = [{ ...h.state.hostSessions[0], status: SessionStatus.InputNeeded | SessionStatus.IsRead | SessionStatus.IsArchived }];
		await h.contribution.activate();
		const controller = h.controllers.get(sessionType)!;
		await controller.refresh(CancellationToken.None);
		const before = controller.items.map(item => [item.resource.toString(), item.status, item.isRead, item.archived]);
		const deltas: IChatSessionItemsDelta[] = [];
		store.add(controller.onDidChangeChatSessionItems(delta => deltas.push(delta)));

		h.state.connected = false;
		h.connectionsChanged.fire();
		h.connectionsChanged.fire();

		assert.deepStrictEqual({
			before,
			deltas: deltas.map(delta => ({
				items: delta.addedOrUpdated?.map(item => [item.resource.toString(), item.status, item.isRead, item.archived]),
				removed: delta.removed,
			})),
			items: controller.items.map(item => [item.resource.toString(), item.status, item.isRead, item.archived]),
		}, {
			before: [[resource.toString(), ChatSessionStatus.NeedsInput, true, true]],
			deltas: [{
				items: [[resource.toString(), ChatSessionStatus.NeedsInput, undefined, undefined]],
				removed: undefined,
			}],
			items: [[resource.toString(), ChatSessionStatus.NeedsInput, undefined, undefined]],
		});
	});

	test('publishes host read and archive flags again when connection availability returns', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		h.state.hostSessions = [{ ...h.state.hostSessions[0], status: SessionStatus.Idle | SessionStatus.IsRead | SessionStatus.IsArchived }];
		await h.contribution.activate();
		const controller = h.controllers.get(sessionType)!;
		await controller.refresh(CancellationToken.None);
		h.state.connected = false;
		h.connectionsChanged.fire();
		h.authenticationPending.set(true, undefined);
		const deltas: IChatSessionItemsDelta[] = [];
		store.add(controller.onDidChangeChatSessionItems(delta => deltas.push(delta)));

		h.state.connected = true;
		h.connectionsChanged.fire();

		assert.deepStrictEqual(deltas.map(delta => delta.addedOrUpdated?.map(item => [item.isRead, item.archived])), [[[true, true]]]);
	});

	test('falls back to original history after a failed live connection, without creating a replacement', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		h.state.connectError = new Error('Connection unavailable');
		const activated = await h.contribution.activate();
		const session = store.add(await h.contentProviders.get(sessionType)!.provideChatSessionContent(resource, CancellationToken.None));
		assert.deepStrictEqual({
			activated, resource: session.sessionResource.toString(), readOnly: session.isReadOnly?.get(),
			history: h.calls.history, created: h.calls.created,
		}, { activated: true, resource: resource.toString(), readOnly: true, history: [discovered.taskId], created: 0 });
	});

	test('shares authentication readiness only while its environment has an owner', () => {
		const authenticationService = new RemoteAgentHostAuthenticationService();
		const connection = store.add(authenticationService.acquire(address));
		const provider = store.add(authenticationService.acquire(address));
		connection.object.set(false, undefined);
		connection.dispose();
		const retained = provider.object.get();
		provider.dispose();
		const next = store.add(authenticationService.acquire(address));
		assert.deepStrictEqual({ retained, next: next.object.get() }, { retained: false, next: true });
	});

	test('keeps discovered entries after incomplete or failed scans and removes them after a complete scan', async () => {
		const h = createHarness(store);
		await h.refresh();
		const counts: number[] = [];
		for (const result of [
			{ kind: 'partial', sessions: [] },
			{ kind: 'failed', reason: 'temporarily unavailable' },
			{ kind: 'complete', sessions: [] },
		] satisfies ICloudSandboxDiscoveryResult[]) {
			h.state.result = result;
			await h.refresh();
			counts.push(h.items().length);
		}
		assert.deepStrictEqual({ counts, policies: h.policies, removed: h.calls.removed }, { counts: [1, 1, 0], policies: [], removed: [address] });
	});

	for (const setting of [CloudSandboxEnabledSettingId, RemoteAgentHostsEnabledSettingId]) {
		test(`tears down discovery, content, and routing when ${setting} is disabled`, async () => {
			const h = createHarness(store);
			await h.refresh();
			await h.contribution.activate();
			await h.setEnabled(setting, false);
			assert.deepStrictEqual({
				items: h.items(), controllers: h.controllers.size, content: h.contentProviders.size,
				contributions: h.contributions.size, policies: h.policies, removed: h.calls.removed,
			}, { items: [], controllers: 0, content: 0, contributions: 0, policies: [], removed: [address] });
		});
	}

	test('does not expose sandboxes when AI features are hidden', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.hidden = true;
		h.sentimentChanged.fire();
		await h.refresh();
		assert.deepStrictEqual({ items: h.items(), controllers: h.controllers.size, contributions: h.contributions.size }, { items: [], controllers: 0, contributions: 0 });
	});

	test('does not commit a discovery response after the feature is disabled', async () => {
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const h = createHarness(store, { listSessions: () => pending.p });
		await h.setEnabled(CloudSandboxEnabledSettingId, false);
		await pending.complete({ kind: 'complete', sessions: [discovered] });
		await h.refresh();
		assert.deepStrictEqual({ items: h.items(), controllers: h.controllers.size, policies: h.policies }, { items: [], controllers: 0, policies: [] });
	});

	test('can enable discovery without reloading the Editor Window', async () => {
		const h = createHarness(store, { enabled: false });
		await h.refresh();
		const before = { discovered: h.calls.discovered, controllers: h.controllers.size };
		await h.setEnabled(CloudSandboxEnabledSettingId, true);
		await h.refresh();
		assert.deepStrictEqual({ before, after: h.items().map(item => item.label) }, { before: { discovered: 0, controllers: 0 }, after: [discovered.name] });
	});

	test('uses the Cloud provider filter while retaining connection-specific routing', async () => {
		const h = createHarness(store);
		await h.refresh();
		const storage = store.add(new InMemoryStorageService());
		const cloud = store.add(new AgentSessionsFilter({ allowedProviders: [AgentSessionProviders.Cloud] }, h.chatSessionsService, storage));
		const local = store.add(new AgentSessionsFilter({ allowedProviders: [AgentSessionProviders.Local] }, h.chatSessionsService, storage));
		const session = upcastPartial<IAgentSession>({ providerType: sessionType, status: ChatSessionStatus.NeedsInput });
		assert.deepStrictEqual({ cloud: cloud.exclude(session), local: local.exclude(session), resource: h.items()[0].resource.toString() }, { cloud: false, local: true, resource: resource.toString() });
	});
});
