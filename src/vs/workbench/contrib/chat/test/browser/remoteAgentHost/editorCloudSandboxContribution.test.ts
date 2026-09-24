/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
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
import { INotificationService, NotificationMessage } from '../../../../../../platform/notification/common/notification.js';
import { IProgress, IProgressService, IProgressStep, Progress } from '../../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, toWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { GitRefType, GitRepositoryState, IGitRepository, IGitService } from '../../../../git/common/gitService.js';
import { ISCMProvider, ISCMRepository, ISCMService, ISCMViewService } from '../../../../scm/common/scm.js';
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
import { ChatSessionOptionsMap, ChatSessionStatus, IChatSessionContentProvider, IChatSessionCreationHandler, IChatSessionItemController, IChatSessionItemsDelta, IChatSessionProviderOptionModelMetadata, IChatSessionsService, IChatSessionsExtensionPoint, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../common/chatSessionsService.js';
import { isVisibleEditorChatSessionType } from '../../../common/constants.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatModel, IChatRequestModel } from '../../../common/model/chatModel.js';

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
const workspaceFolder = URI.file('/local/project');
const otherDiscovered: ICloudSandboxDiscoveredSession = {
	...discovered,
	environmentId: 'environment-two',
	sessionId: 'other-session',
	taskId: 'other-task',
	repoName: 'other/project',
};

function repository(remoteUrls: readonly string[], rootUri = workspaceFolder): IGitRepository {
	return new class extends mock<IGitRepository>() {
		override readonly rootUri = rootUri;
		override readonly state = observableValue<GitRepositoryState>(this, {
			remotes: remoteUrls.map((fetchUrl, index) => ({ name: `remote-${index}`, fetchUrl, isReadOnly: false })),
			mergeChanges: [], indexChanges: [], workingTreeChanges: [], untrackedChanges: [],
		});
		override updateState(state: GitRepositoryState): void {
			this.state.set(state, undefined);
		}
	}();
}

function scmRepository(repository: IGitRepository): ISCMRepository {
	return upcastPartial<ISCMRepository>({ provider: upcastPartial<ISCMProvider>({ providerId: 'git', rootUri: repository.rootUri }) });
}

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
	readonly workspaceFolders?: readonly URI[];
	readonly repositories?: readonly IGitRepository[];
	readonly knownRepositories?: readonly IGitRepository[];
	readonly scmRepositories?: readonly IGitRepository[];
	readonly activeRepository?: IGitRepository;
	readonly openRepository?: (root: URI) => Promise<IGitRepository | undefined>;
	readonly createSession?: ICloudSandboxApiService['createSession'];
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
	const workspaceFoldersChanged = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
	const repositoryAdded = store.add(new Emitter<ISCMRepository>());
	const repositoryRemoved = store.add(new Emitter<ISCMRepository>());
	const controllers = new Map<string, IChatSessionItemController>();
	const contributions = new Map<string, ResolvedChatSessionsExtensionPoint>();
	const contentProviders = new Map<string, IChatSessionContentProvider>();
	const creationHandlers = new Map<string, IChatSessionCreationHandler>();
	const sessionOptions = new ResourceMap<ChatSessionOptionsMap>();
	const warnings: string[] = [];
	const disposedSessions = store.add(new Emitter<{ readonly sessionResources: URI[]; reason: 'cleared' | 'disposed' }>());
	const initialRefreshes: Promise<void>[] = [];
	const discoveryModes: boolean[] = [];
	const calls = { discovered: 0, created: 0, connected: [] as ICloudSandboxConnectOptions[], history: [] as string[], removed: [] as string[], repositoryErrors: [] as string[] };
	const repositories = [...(options?.repositories ?? [repository(['https://github.com/example/project.git'])])];
	const activeRepository = observableValue<ReturnType<ISCMViewService['activeRepository']['get']>>('activeRepository', options?.activeRepository
		? { repository: scmRepository(options.activeRepository), pinned: false }
		: undefined);
	const state = {
		workspaceFolders: (options?.workspaceFolders ?? [workspaceFolder]).map(toWorkspaceFolder),
		repositories,
		scmRepositories: [...(options?.scmRepositories ?? repositories)],
		result: { kind: 'complete', sessions: [discovered] } as ICloudSandboxDiscoveryResult,
		online: false,
		connected: false,
		completeAuthentication: true,
		hidden: false,
		accountKey: 'github:editor-account' as string | undefined,
		cancelProgress: undefined as (() => void) | undefined,
		models: [] as string[],
		hasRequests: false,
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
		override registerChatSessionCreationHandler(type: string, handler: IChatSessionCreationHandler) {
			creationHandlers.set(type, handler);
			return toDisposable(() => creationHandlers.delete(type));
		}
		override getSessionOption(resource: URI, key: string) { return sessionOptions.get(resource)?.get(key); }
		override getSessionOptions(resource: URI) {
			const options = sessionOptions.get(resource);
			return options && new Map<string, string>([...options].map(([key, value]) => [key, typeof value === 'string' ? value : value.id]));
		}
		override setSessionOption(resource: URI, key: string, value: Parameters<IChatSessionsService['setSessionOption']>[2]) {
			let options = sessionOptions.get(resource);
			if (!options) {
				options = new Map();
				sessionOptions.set(resource, options);
			}
			options.set(key, value);
			return true;
		}
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
	instantiationService.stub(ILogService, new class extends NullLogService {
		override warn(message: string): void { calls.repositoryErrors.push(message); }
	}());
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
		override async createSession(request: Parameters<ICloudSandboxApiService['createSession']>[0], token: CancellationToken) {
			calls.created++;
			if (options?.createSession) {
				return options.createSession(request, token);
			}
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
		override readonly onDidChangeWorkspaceFolders = workspaceFoldersChanged.event;
		override getWorkspace() {
			return { id: 'editor-workspace', folders: state.workspaceFolders };
		}
	}());
	instantiationService.stub(IGitService, new class extends mock<IGitService>() {
		override get repositories() { return options?.knownRepositories ?? (options?.openRepository ? [] : state.repositories); }
		override async openRepository(root: URI) {
			return options?.openRepository ? options.openRepository(root) : state.repositories
				.filter(repository => extUriBiasedIgnorePathCase.isEqualOrParent(root, repository.rootUri))
				.sort((a, b) => b.rootUri.path.length - a.rootUri.path.length)[0];
		}
	}());
	instantiationService.stub(ISCMService, new class extends mock<ISCMService>() {
		override readonly onDidAddRepository = repositoryAdded.event;
		override readonly onDidRemoveRepository = repositoryRemoved.event;
		override get repositories() { return state.scmRepositories.map(scmRepository); }
	}());
	instantiationService.stub(ISCMViewService, new class extends mock<ISCMViewService>() {
		override readonly activeRepository = activeRepository;
	}());
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly onDidDisposeSession = disposedSessions.event;
		override getSession() {
			return state.hasRequests ? upcastPartial<IChatModel>({ getRequests: () => [upcastPartial<IChatRequestModel>({})] }) : undefined;
		}
	}());
	instantiationService.stub(IProgressService, new class extends mock<IProgressService>() {
		override async withProgress<R>(_options: Parameters<IProgressService['withProgress']>[0], task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
			state.cancelProgress = onDidCancel;
			try {
				return await task(Progress.None);
			} finally {
				state.cancelProgress = undefined;
			}
		}
	}());
	instantiationService.stub(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
		override readonly onDidChangeLanguageModels = Event.None;
		override async selectLanguageModels(selector: { vendor?: string }) {
			return state.models.map(model => `${selector.vendor}:${model}`);
		}
		override lookupLanguageModel(identifier: string) {
			const id = identifier.slice(identifier.lastIndexOf(':') + 1);
			return state.models.includes(id) ? upcastPartial<ILanguageModelChatMetadata>({ id }) : undefined;
		}
	}());
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
		override warn(message: NotificationMessage | NotificationMessage[]) {
			warnings.push(String(message));
		}
	}());
	instantiationService.stub(IAgentHostUntitledProvisionalSessionService, new class extends mock<IAgentHostUntitledProvisionalSessionService>() { }());
	instantiationService.stub(IAgentHostImportConversationStore, new class extends mock<IAgentHostImportConversationStore>() { }());
	instantiationService.stub(IAgentHostNewSessionFolderService, new class extends mock<IAgentHostNewSessionFolderService>() { }());
	const contribution = store.add(instantiationService.createInstance(TestEditorCloudSandboxContribution));
	return {
		contribution, controllers, contributions, contentProviders, chatSessionsService, state, calls, policies, notifications, resolvers, sentimentChanged, accountChanged, authenticationPending, initialRefreshes, connectionsChanged, focusChanged, discoveryModes, creationHandlers, warnings, disposedSessions,
		refresh: async () => {
			await contribution.refresh(CancellationToken.None);
			await Promise.all(initialRefreshes);
		},
		items: () => [...controllers.values()].flatMap(controller => controller.items),
		setWorkspaceFolders: (folders: readonly URI[]) => {
			const removed = state.workspaceFolders;
			state.workspaceFolders = folders.map(toWorkspaceFolder);
			workspaceFoldersChanged.fire({ added: state.workspaceFolders, removed, changed: [] });
		},
		addRepository: (repository: IGitRepository) => {
			state.repositories.push(repository);
			state.scmRepositories.push(repository);
			repositoryAdded.fire(scmRepository(repository));
		},
		removeRepository: (repository: IGitRepository) => {
			state.repositories = state.repositories.filter(candidate => candidate !== repository);
			state.scmRepositories = state.scmRepositories.filter(candidate => candidate !== repository);
			repositoryRemoved.fire(scmRepository(repository));
		},
		setActiveRepository: (repository: IGitRepository | undefined) => {
			activeRepository.set(repository ? { repository: scmRepository(repository), pinned: false } : undefined, undefined);
		},
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

suite('Editor cloud sandbox creation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createDraft(options?: Parameters<typeof createHarness>[1]) {
		const requests: Parameters<ICloudSandboxApiService['createSession']>[0][] = [];
		const h = createHarness(store, {
			listSessions: async () => ({ kind: 'complete', sessions: [] }),
			...options,
			createSession: async (request, token) => {
				requests.push(request);
				return options?.createSession ? options.createSession(request, token) : {
					environmentId: discovered.environmentId, sessionId: discovered.sessionId, taskId: discovered.taskId,
				};
			},
		});
		await h.refresh();
		const draft = URI.from({ scheme: SessionType.CopilotCloud, path: '/untitled-sandbox' });
		const handler = h.creationHandlers.get(SessionType.CopilotCloud)!;
		return {
			...h, draft, handler, requests,
			create: (token = CancellationToken.None) => handler.createSession({
				prompt: 'Fix the tests', untitledResource: draft,
				initialSessionOptions: h.chatSessionsService.getSessionOptions(draft),
			}, token),
		};
	}

	test('unchecked Cloud keeps its regular creation path', async () => {
		const h = await createDraft();
		assert.deepStrictEqual({
			checked: h.handler.getOption(h.draft).checked,
			created: await h.create(),
			requests: h.requests,
			connections: h.calls.connected.map(connection => connection.environmentId),
		}, { checked: false, created: undefined, requests: [], connections: [] });
	});

	test('the checkbox is per draft and requires a GitHub repository', async () => {
		const h = await createDraft({ workspaceFolders: [], repositories: [] });
		const unavailable = h.handler.getOption(h.draft);
		unavailable.setChecked(true);
		h.chatSessionsService.setSessionOption(h.draft, 'repositories', 'example/selected');
		const available = h.handler.getOption(h.draft);
		available.setChecked(true);
		assert.deepStrictEqual({
			unavailable: { enabled: unavailable.enabled, checked: unavailable.checked },
			available: available.enabled,
			checked: h.handler.getOption(h.draft).checked,
			anotherDraft: h.handler.getOption(h.draft.with({ path: '/untitled-other' })).checked,
			warnings: h.warnings.length,
		}, {
			unavailable: { enabled: false, checked: false },
			available: true, checked: true, anotherDraft: false, warnings: 1,
		});
	});

	test('allocates and returns the existing backend session using the workspace repository', async () => {
		const h = await createDraft();
		h.handler.getOption(h.draft).setChecked(true);
		const created = await h.create();
		assert.deepStrictEqual({
			resource: created?.resource.toString(),
			modelId: created?.modelId,
			requests: h.requests,
			connections: h.calls.connected.map(connection => connection.environmentId),
		}, {
			resource: resource.toString(), modelId: undefined,
			requests: [{ repoNwo: 'example/project', prompt: 'Fix the tests' }],
			connections: [discovered.environmentId],
		});
	});

	test('an explicitly selected repository works in an empty window', async () => {
		const h = await createDraft({ workspaceFolders: [], repositories: [] });
		h.chatSessionsService.setSessionOption(h.draft, 'repositories', 'example/selected');
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual(h.requests, [{ repoNwo: 'example/selected', prompt: 'Fix the tests' }]);
	});

	test('resolves the open workspace before SCM registers a repository and enables the checkbox', async () => {
		const pending = new DeferredPromise<IGitRepository | undefined>();
		const roots: string[] = [];
		const h = await createDraft({
			repositories: [],
			openRepository: root => {
				roots.push(root.toString());
				return pending.p;
			},
		});
		const before = h.handler.getOption(h.draft).enabled;
		const updates: boolean[] = [];
		store.add(h.handler.onDidChangeOption!(() => updates.push(h.handler.getOption(h.draft).enabled)));
		await pending.complete(repository(['git@github.com:Example/Project.git']));
		await h.refresh();
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual({ roots, before, updates, requests: h.requests }, {
			roots: [workspaceFolder.toString()],
			before: false,
			updates: [true],
			requests: [{ repoNwo: 'example/project', prompt: 'Fix the tests' }],
		});
	});

	test('does not open workspace repositories until sandboxes are enabled', async () => {
		const roots: string[] = [];
		const h = await createDraft({
			enabled: false,
			repositories: [],
			openRepository: async root => {
				roots.push(root.toString());
				return repository(['https://github.com/example/project.git']);
			},
		});
		const before = { enabled: h.handler.getOption(h.draft).enabled, lookups: roots.length };
		await h.setEnabled(CloudSandboxEnabledSettingId, true);
		await h.refresh();
		assert.deepStrictEqual({ before, enabled: h.handler.getOption(h.draft).enabled, roots }, {
			before: { enabled: false, lookups: 0 }, enabled: true, roots: [workspaceFolder.toString()],
		});
	});

	test('uses the containing repository when a workspace subfolder is open before SCM registration', async () => {
		const h = await createDraft({ workspaceFolders: [URI.joinPath(workspaceFolder, 'src')], scmRepositories: [] });
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual(h.requests, [{ repoNwo: 'example/project', prompt: 'Fix the tests' }]);
	});

	test('resolves an active nested repository instead of reusing its already known parent', async () => {
		const parent = repository(['https://github.com/example/project.git']);
		const nested = repository(['https://github.com/example/nested.git'], URI.joinPath(workspaceFolder, 'nested'));
		const h = await createDraft({
			repositories: [parent, nested],
			knownRepositories: [parent],
			activeRepository: nested,
			openRepository: async root => extUriBiasedIgnorePathCase.isEqual(root, nested.rootUri) ? nested : undefined,
		});
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual(h.requests, [{ repoNwo: 'example/nested', prompt: 'Fix the tests' }]);
	});

	test('retries workspace detection when Git registers after the initial lookup found no repository', async () => {
		const h = await createDraft({ repositories: [] });
		const before = h.handler.getOption(h.draft).enabled;
		const updates: boolean[] = [];
		store.add(h.handler.onDidChangeOption!(() => updates.push(h.handler.getOption(h.draft).enabled)));
		h.addRepository(repository(['https://github.com/example/project.git']));
		await h.refresh();
		assert.deepStrictEqual({ before, updates, enabled: h.handler.getOption(h.draft).enabled }, {
			before: false, updates: [true], enabled: true,
		});
	});

	for (const upstream of [undefined, 'upstream']) {
		test(`uses ${upstream ?? 'origin'} rather than treating multiple Git remotes as multiple workspaces`, async () => {
			const localRepository = repository([]);
			localRepository.updateState({
				...localRepository.state.get(),
				HEAD: { type: GitRefType.Head, name: 'main' },
				remotes: [
					{ name: 'upstream', fetchUrl: 'https://github.com/example/upstream.git', isReadOnly: false },
					{ name: 'origin', fetchUrl: 'git@github.com:example/fork.git', isReadOnly: false },
				],
			});
			const h = await createDraft({ repositories: [localRepository] });
			let optionChanges = 0;
			store.add(h.handler.onDidChangeOption!(() => optionChanges++));
			if (upstream) {
				localRepository.updateState({
					...localRepository.state.get(),
					HEAD: { type: GitRefType.Head, name: 'main', upstream: { remote: upstream, name: 'main' } },
				});
			}
			h.handler.getOption(h.draft).setChecked(true);
			await h.create();
			assert.deepStrictEqual({ optionChanges, requests: h.requests }, {
				optionChanges: upstream ? 1 : 0,
				requests: [{ repoNwo: upstream ? 'example/upstream' : 'example/fork', prompt: 'Fix the tests' }],
			});
		});
	}

	test('follows the active workspace repository and its remote changes', async () => {
		const first = repository(['https://gitlab.com/example/project.git']);
		const second = repository(['https://github.com/other/project.git'], URI.file('/local/second'));
		const h = await createDraft({
			workspaceFolders: [first.rootUri, second.rootUri],
			repositories: [first, second],
			activeRepository: first,
		});
		const enabled = [h.handler.getOption(h.draft).enabled];
		store.add(h.handler.onDidChangeOption!(() => enabled.push(h.handler.getOption(h.draft).enabled)));
		h.setActiveRepository(second);
		second.updateState({ ...second.state.get(), remotes: [] });
		second.updateState({
			...second.state.get(), remotes: [{ name: 'origin', fetchUrl: 'https://github.com/other/renamed.git', isReadOnly: false }],
		});
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual({ enabled, requests: h.requests }, {
			enabled: [false, true, false, true],
			requests: [{ repoNwo: 'other/renamed', prompt: 'Fix the tests' }],
		});
	});

	test('does not guess between multiple workspace repositories without an active repository', async () => {
		const secondFolder = URI.file('/local/second');
		const h = await createDraft({
			workspaceFolders: [workspaceFolder, secondFolder],
			repositories: [repository(['https://github.com/example/project.git']), repository(['https://github.com/other/project.git'], secondFolder)],
		});
		const before = h.handler.getOption(h.draft).enabled;
		h.chatSessionsService.setSessionOption(h.draft, 'repositories', 'example/selected');
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual({ before, requests: h.requests }, {
			before: false, requests: [{ repoNwo: 'example/selected', prompt: 'Fix the tests' }],
		});
	});

	test('an explicit Cloud repository takes precedence over the active workspace repository', async () => {
		const localRepository = repository(['https://github.com/example/project.git']);
		const h = await createDraft({ repositories: [localRepository], activeRepository: localRepository });
		h.chatSessionsService.setSessionOption(h.draft, 'repositories', 'example/selected');
		h.handler.getOption(h.draft).setChecked(true);
		await h.create();
		assert.deepStrictEqual(h.requests, [{ repoNwo: 'example/selected', prompt: 'Fix the tests' }]);
	});

	test('maps the Cloud model to the connected sandbox catalog', async () => {
		const h = await createDraft();
		h.state.models = ['preferred-model'];
		h.chatSessionsService.setSessionOption(h.draft, 'models', {
			id: 'cloud-model-option', name: 'Preferred model',
			modelMetadata: upcastPartial<IChatSessionProviderOptionModelMetadata>({ id: 'preferred-model' }),
		});
		h.handler.getOption(h.draft).setChecked(true);
		const created = await h.create();
		assert.deepStrictEqual({ modelId: created?.modelId, warnings: h.warnings }, {
			modelId: `${sessionType}:preferred-model`, warnings: [],
		});
	});

	test('warns and uses the host default when the selected Cloud model is unavailable', async () => {
		const h = await createDraft();
		h.state.models = ['another-model'];
		h.chatSessionsService.setSessionOption(h.draft, 'models', 'unavailable-model');
		h.handler.getOption(h.draft).setChecked(true);
		const created = await h.create();
		assert.deepStrictEqual({
			modelId: created?.modelId, allocations: h.requests.length,
			warnedAboutModel: h.warnings.length === 1 && h.warnings[0].includes('unavailable-model'),
		}, { modelId: undefined, allocations: 1, warnedAboutModel: true });
	});

	test('a checked draft fails instead of falling back when the feature is disabled', async () => {
		const h = await createDraft();
		h.handler.getOption(h.draft).setChecked(true);
		await h.setEnabled(CloudSandboxEnabledSettingId, false);
		await assert.rejects(h.create(), /Enable GitHub sandboxes/);
		assert.deepStrictEqual(h.requests, []);
	});

	test('a checked draft fails when no repository can be resolved', async () => {
		const h = await createDraft({ workspaceFolders: [], repositories: [] });
		h.chatSessionsService.setSessionOption(h.draft, 'githubSandbox', 'true');
		await assert.rejects(h.create(), /repository/i);
		assert.deepStrictEqual(h.requests, []);
	});

	test('cannot enable sandbox creation after a Cloud message has already been sent', async () => {
		const h = await createDraft();
		h.state.hasRequests = true;
		const option = h.handler.getOption(h.draft);
		option.setChecked(true);
		assert.deepStrictEqual({
			enabled: option.enabled, checked: h.handler.getOption(h.draft).checked, warnings: h.warnings.length,
		}, { enabled: false, checked: false, warnings: 1 });
	});

	test('a failed connection can be retried without allocating another sandbox', async () => {
		const h = await createDraft();
		h.handler.getOption(h.draft).setChecked(true);
		h.state.connectError = new Error('Connection failed');
		await assert.rejects(h.create(), /Connection failed/);
		h.state.connectError = undefined;
		const created = await h.create();
		assert.deepStrictEqual({
			resource: created?.resource.toString(), allocations: h.requests.length,
		}, { resource: resource.toString(), allocations: 1 });
	});

	test('does not reuse an allocated sandbox after the repository selection changes', async () => {
		const h = await createDraft();
		h.handler.getOption(h.draft).setChecked(true);
		h.state.connectError = new Error('Connection failed');
		await assert.rejects(h.create(), /Connection failed/);
		h.state.connectError = undefined;
		h.chatSessionsService.setSessionOption(h.draft, 'repositories', 'example/another');
		await assert.rejects(h.create(), /repository, account, or connection changed/);
		assert.strictEqual(h.requests.length, 1);
	});

	test('already-cancelled creation never allocates a sandbox', async () => {
		const h = await createDraft();
		h.handler.getOption(h.draft).setChecked(true);
		const source = store.add(new CancellationTokenSource());
		source.cancel();
		await assert.rejects(h.create(source.token), /Canceled/);
		assert.deepStrictEqual(h.requests, []);
	});

	for (const cancelVia of ['notification', 'closing the draft', 'disabling AI'] as const) {
		test(`cancels allocation by ${cancelVia} without connecting or falling back`, async () => {
			const started = new DeferredPromise<void>();
			const h = await createDraft({
				createSession: async (_request, token) => {
					started.complete();
					await new Promise<void>(resolve => store.add(token.onCancellationRequested(resolve)));
					return { environmentId: discovered.environmentId, sessionId: discovered.sessionId, taskId: discovered.taskId };
				},
			});
			h.handler.getOption(h.draft).setChecked(true);
			const creating = h.create();
			await started.p;
			switch (cancelVia) {
				case 'notification':
					h.state.cancelProgress!();
					break;
				case 'closing the draft':
					h.disposedSessions.fire({ sessionResources: [h.draft], reason: 'disposed' });
					break;
				case 'disabling AI':
					h.state.hidden = true;
					h.sentimentChanged.fire();
					break;
			}
			await assert.rejects(creating, /Canceled/);
			assert.deepStrictEqual({ allocations: h.requests.length, connections: h.calls.connected }, {
				allocations: 1, connections: [],
			});
		});
	}
});

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

	test('hides discovery and individual sandboxes from the harness picker without hiding their sessions', async () => {
		const h = createHarness(store, { workspaceFolders: [] });
		h.state.result = { kind: 'complete', sessions: [discovered, otherDiscovered] };
		await h.refresh();
		const configurationService = new TestConfigurationService();
		const workspace = { id: 'editor-workspace', folders: [] };

		assert.deepStrictEqual({
			contributions: h.chatSessionsService.getAllChatSessionContributions().map(contribution => ({
				type: contribution.type,
				visible: isVisibleEditorChatSessionType(contribution.type, configurationService, h.chatSessionsService, workspace),
			})),
			sessions: h.items().map(item => item.resource.path),
		}, {
			contributions: [
				{ type: 'cloud-sandbox', visible: false },
				{ type: sessionType, visible: false },
				{ type: remoteAgentHostSessionTypeId(agentHostAuthority(cloudSandboxAddress(otherDiscovered.environmentId)), CLOUD_SANDBOX_AGENT_PROVIDER), visible: false },
			],
			sessions: ['/original-session', '/other-session'],
		});
	});

	test('discovers matching repositories without connecting or creating a session', async () => {
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

	test('scopes discovery to workspace repositories and excludes sessions with no repository', async () => {
		const h = createHarness(store);
		h.state.result = {
			kind: 'complete', sessions: [discovered, otherDiscovered, {
				...discovered, environmentId: 'environment-three', sessionId: 'unscoped-session', taskId: 'unscoped-task', repoName: undefined,
			}]
		};
		await h.refresh();
		assert.deepStrictEqual({
			items: h.items().map(item => item.resource.path),
			created: h.calls.created,
			connected: h.calls.connected,
		}, { items: ['/original-session'], created: 0, connected: [] });
	});

	test('an empty window lists all projects, including sessions with no repository', async () => {
		const h = createHarness(store, { workspaceFolders: [] });
		h.state.result = {
			kind: 'complete', sessions: [discovered, otherDiscovered, {
				...discovered, environmentId: 'environment-three', sessionId: 'unscoped-session', taskId: 'unscoped-task', repoName: undefined,
			}]
		};
		await h.refresh();
		assert.deepStrictEqual(h.items().map(item => item.resource.path), ['/original-session', '/other-session', '/unscoped-session']);
	});

	for (const remoteUrl of ['https://github.com/Example/Project.git/', 'git@github.com:EXAMPLE/PROJECT.git', 'ssh://git@github.com/example/project.git']) {
		test(`matches repository identity rather than checkout name for ${remoteUrl}`, async () => {
			const folder = URI.file('/local/different-checkout-name');
			const h = createHarness(store, { workspaceFolders: [folder], repositories: [repository([remoteUrl], folder)] });
			await h.refresh();
			assert.deepStrictEqual(h.items().map(item => item.resource.path), ['/original-session']);
		});
	}

	for (const remoteUrls of [[], ['https://gitlab.com/example/project.git'], ['https://github.com/unrelated/project.git']]) {
		test(`does not list unrelated sandboxes for workspace remotes ${JSON.stringify(remoteUrls)}`, async () => {
			const h = createHarness(store, { repositories: [repository(remoteUrls)] });
			await h.refresh();
			assert.deepStrictEqual(h.items(), []);
		});
	}

	test('matches all workspace roots and GitHub fetch remotes', async () => {
		const secondFolder = URI.file('/local/second');
		const h = createHarness(store, {
			workspaceFolders: [workspaceFolder, secondFolder],
			repositories: [
				repository(['https://github.com/fork/project.git', 'git@github.com:example/project.git']),
				repository(['https://github.com/other/project.git'], secondFolder),
			],
		});
		h.state.result = { kind: 'complete', sessions: [discovered, otherDiscovered] };
		await h.refresh();
		assert.deepStrictEqual(h.items().map(item => item.resource.path), ['/original-session', '/other-session']);
	});

	test('matches an open subfolder of a repository', async () => {
		const h = createHarness(store, { workspaceFolders: [URI.joinPath(workspaceFolder, 'src')] });
		await h.refresh();
		assert.deepStrictEqual(h.items().map(item => item.resource.path), ['/original-session']);
	});

	test('does not use repositories outside the workspace', async () => {
		const h = createHarness(store, { workspaceFolders: [URI.file('/local/unrelated')] });
		await h.refresh();
		assert.deepStrictEqual(h.items(), []);
	});

	test('workspace changes remove and restore cached rows without rediscovery or connections', async () => {
		const h = createHarness(store);
		await h.refresh();
		const controller = h.controllers.get(sessionType)!;
		const deltas: IChatSessionItemsDelta[] = [];
		store.add(controller.onDidChangeChatSessionItems(delta => deltas.push(delta)));
		h.setWorkspaceFolders([URI.file('/local/unrelated')]);
		const unrelated = h.items().map(item => item.resource.path);
		h.setWorkspaceFolders([]);
		assert.deepStrictEqual({
			unrelated,
			restored: h.items().map(item => item.resource.path),
			removed: deltas.flatMap(delta => delta.removed?.map(resource => resource.path) ?? []),
			added: deltas.flatMap(delta => delta.addedOrUpdated?.map(item => item.resource.path) ?? []),
			scans: h.calls.discovered,
			connected: h.calls.connected,
		}, { unrelated: [], restored: ['/original-session'], removed: ['/original-session'], added: ['/original-session'], scans: 1, connected: [] });
	});

	test('repository discovery, remote changes, and removal update the scoped list', async () => {
		const h = createHarness(store, { repositories: [] });
		await h.refresh();
		const before = h.items().map(item => item.resource.path);
		const localRepository = repository(['https://github.com/example/project.git']);
		const addedEvent = Event.toPromise(Event.filter(h.controllers.get(sessionType)!.onDidChangeChatSessionItems, delta => !!delta.addedOrUpdated?.length));
		h.addRepository(localRepository);
		await addedEvent;
		const added = h.items().map(item => item.resource.path);
		const originalState = localRepository.state.get();
		localRepository.updateState({ ...originalState, remotes: [{ name: 'origin', fetchUrl: 'https://github.com/other/project.git', isReadOnly: false }] });
		const changed = h.items().map(item => item.resource.path);
		localRepository.updateState(originalState);
		const restored = h.items().map(item => item.resource.path);
		h.removeRepository(localRepository);
		assert.deepStrictEqual({ before, added, changed, restored, removed: h.items(), scans: h.calls.discovered, connected: h.calls.connected }, {
			before: [], added: ['/original-session'], changed: [], restored: ['/original-session'], removed: [], scans: 1, connected: [],
		});
	});

	test('ignores Git status changes that do not change repository scope', async () => {
		const h = createHarness(store);
		await h.refresh();
		const deltas: IChatSessionItemsDelta[] = [];
		store.add(h.controllers.get(sessionType)!.onDidChangeChatSessionItems(delta => deltas.push(delta)));
		const localRepository = h.state.repositories[0];
		localRepository.updateState({
			...localRepository.state.get(),
			indexChanges: [{ uri: URI.joinPath(workspaceFolder, 'file.ts'), originalUri: undefined, modifiedUri: undefined }],
		});
		assert.deepStrictEqual(deltas, []);
	});

	test('refreshes discovery repository scope without accepting older metadata', async () => {
		const h = createHarness(store);
		await h.refresh();
		const snapshots: string[][] = [];
		for (const session of [
			{ ...discovered, repoName: 'other/project', updatedAt: '2026-01-03T03:04:05.000Z' },
			discovered,
			{ ...discovered, updatedAt: '2026-01-04T03:04:05.000Z' },
			{ ...discovered, repoName: undefined, updatedAt: '2026-01-05T03:04:05.000Z' },
		]) {
			h.state.result = { kind: 'complete', sessions: [session] };
			await h.refresh();
			snapshots.push(h.items().map(item => item.resource.path));
		}
		assert.deepStrictEqual(snapshots, [[], [], ['/original-session'], []]);
	});

	test('a repository lookup completing after a workspace change does not restore unrelated rows', async () => {
		const pending = new DeferredPromise<IGitRepository | undefined>();
		const h = createHarness(store, { openRepository: () => pending.p });
		await h.refresh();
		h.setWorkspaceFolders([URI.file('/local/unrelated')]);
		await pending.complete(repository(['https://github.com/example/project.git']));
		await h.refresh();
		const draft = URI.from({ scheme: SessionType.CopilotCloud, path: '/untitled-sandbox' });
		assert.deepStrictEqual({
			items: h.items(), enabled: h.creationHandlers.get(SessionType.CopilotCloud)!.getOption(draft).enabled,
		}, { items: [], enabled: false });
	});

	test('repository lookup failures are logged and do not expose all projects', async () => {
		const h = createHarness(store, { openRepository: async () => { throw new Error('Git unavailable'); } });
		await h.refresh();
		assert.deepStrictEqual({ items: h.items(), errors: h.calls.repositoryErrors }, {
			items: [], errors: ['[CloudSandbox] Failed to resolve workspace repository'],
		});
	});

	test('scopes persisted discovery to the new window before network discovery finishes', async () => {
		const storageService = store.add(new InMemoryStorageService());
		const first = createHarness(store, { storageService, workspaceFolders: [] });
		await first.refresh();
		first.contribution.dispose();
		const started = new DeferredPromise<void>();
		const pending = new DeferredPromise<ICloudSandboxDiscoveryResult>();
		const restored = createHarness(store, {
			storageService,
			repositories: [repository(['https://github.com/other/project.git'])],
			listSessions: () => {
				void started.complete();
				return pending.p;
			},
		});
		await started.p;
		const before = restored.items().map(item => item.resource.path);
		restored.setWorkspaceFolders([]);
		const unscoped = restored.items().map(item => item.resource.path);
		await pending.complete({ kind: 'failed', reason: 'Discovery unavailable' });
		await Promise.all(restored.initialRefreshes);
		assert.deepStrictEqual({ before, unscoped, connected: restored.calls.connected }, { before: [], unscoped: ['/original-session'], connected: [] });
	});

	test('scopes connected sessions by repository, retaining discovery identity when the host reports a directory', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		h.state.hostSessions = [
			{ ...h.state.hostSessions[0], project: { uri: URI.file('/remote/project'), displayName: 'project' } },
			{
				...h.state.hostSessions[0], session: AgentSession.uri('ahp-session', 'other-host-session'),
				project: { uri: URI.parse('https://github.com/other/project'), displayName: 'other/project' },
			},
		];
		await h.contribution.activate();
		await h.controllers.get(sessionType)!.refresh(CancellationToken.None);
		const connected = h.items().map(item => item.resource.path);
		h.state.connected = false;
		h.connectionsChanged.fire();
		assert.deepStrictEqual({ connected, disconnected: h.items().map(item => item.resource.path) }, {
			connected: ['/original-session'], disconnected: ['/original-session'],
		});
	});

	test('host project changes publish removals and additions without losing session routing', async () => {
		const h = createHarness(store);
		await h.refresh();
		h.state.online = true;
		await h.contribution.activate();
		const controller = h.controllers.get(sessionType)!;
		await controller.refresh(CancellationToken.None);
		const deltas: IChatSessionItemsDelta[] = [];
		store.add(controller.onDidChangeChatSessionItems(delta => deltas.push(delta)));
		for (const project of ['https://gitlab.com/example/project', 'https://github.com/example/project']) {
			h.notifications.fire({
				type: NotificationType.SessionSummaryChanged, channel: 'ahp-root://', session: backendSession.toString(),
				changes: { project: { uri: project, displayName: 'project' } },
			});
		}
		assert.deepStrictEqual(deltas.map(delta => ({
			added: delta.addedOrUpdated?.map(item => item.resource.toString()),
			removed: delta.removed?.map(resource => resource.toString()),
		})), [
			{ added: undefined, removed: [resource.toString()] },
			{ added: [resource.toString()], removed: undefined },
		]);
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
