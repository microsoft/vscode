/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { DisposableStore, ImmortalReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { isWeb } from '../../../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithPartialMetadata } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, ChatSendResult, IChatSendRequestData, IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionContentProvider, IChatSessionProviderOptionGroup, IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, isUserProvidedModel } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatResponseModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatAgentData } from '../../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IAutomationSessionConfiguration, ISendRequestOptions, ISessionChangeEvent, ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ChatModelSource, GITHUB_REMOTE_FILE_SCHEME, IChat, ISession, ISessionChangesSummary, ISessionCreationReference, ISessionFileChange, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SessionArtifactKind, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { CloudSandboxEnabledSettingId, CloudSandboxRequestError, type ICloudSandboxCreateSessionRequest } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID, CloudSandboxAgentHostContribution, type ICloudSandboxProvisionedSession } from '../../../remoteAgentHost/browser/cloudSandboxAgentHostContribution.js';
import { CloudSandboxSessionsProvider } from '../../../remoteAgentHost/browser/cloudSandboxSessionsProvider.js';
import { ChatConfiguration, ChatDefaultPermissionLevel, ChatModeKind, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../../chat/common/constants.js';
import { CopilotChatSessionsProvider, COPILOT_PROVIDER_ID, CopilotCloudSessionType, CopilotSandboxSessionType, RemoteNewSession } from '../../browser/copilotChatSessionsProvider.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgress } from '../../../../../../platform/progress/common/progress.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IPathService } from '../../../../../../workbench/services/path/common/pathService.js';
import { MockLabelService } from '../../../../../../workbench/services/label/test/common/mockLabelService.js';
import { TestPathService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { RepositoryPicker } from '../../../../../../workbench/contrib/chat/browser/agentSessions/repositoryPicker.js';
import { GitHubPullRequestModel } from '../../../../github/browser/models/githubPullRequestModel.js';
import { IPullRequestIconCache } from '../../../../github/browser/pullRequestIconCache.js';
import { computePullRequestIcon, GitHubPullRequestState, IGitHubPullRequest, IGitHubRepository } from '../../../../github/common/types.js';
import { CloudSandboxModels } from '../../../../../../workbench/contrib/chat/browser/remoteAgentHost/cloudSandboxModels.js';
import { createCloudSandboxSessionConfig } from '../../browser/cloudSandboxSessionConfig.js';
import { AutomationModelConfiguration } from '../../../../automations/browser/automationModelConfiguration.js';
import { validateSessionConfigWrite } from '../../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { IDefaultAccountService } from '../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IChatEntitlementService } from '../../../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IWorkbenchGitHubService } from '../../../../../../workbench/services/github/common/githubService.js';
import { SessionModelSelection } from '../../../../chat/browser/sessionModelSelection.js';
import { VisibleSession } from '../../../../../services/sessions/browser/visibleSessions.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';

// ---- Helpers ----------------------------------------------------------------

interface IGitHubContextBrowseHarness {
	readonly commandService: Pick<ICommandService, 'executeCommand'>;
	_pickRepository?(): Promise<string | undefined>;
}

interface IGitHubRepositoryBrowseHarness {
	readonly commandService: Pick<ICommandService, 'executeCommand'>;
	readonly notificationService: Pick<INotificationService, 'error'>;
	resolveWorkspace(uri: URI): ISessionWorkspace | undefined;
	_labelFromUri(uri: URI): string;
	_iconFromUri(uri: URI): ThemeIcon;
	_pickRepository?(allowRepositoryUrl: boolean): Promise<string | undefined>;
	_cloneRepository?(url: string): Promise<ISessionWorkspace | undefined>;
	_supportsLocalRepositoryActions(): boolean;
}

const browseForGitHubContext = Reflect.get(CopilotChatSessionsProvider.prototype, '_browseForGitHubContext') as (
	this: IGitHubContextBrowseHarness,
	commandId: string,
	icon: ThemeIcon,
	currentWorkspace: ISessionWorkspace | undefined,
) => Promise<ISessionWorkspace | undefined>;

const browseForRepository = Reflect.get(CopilotChatSessionsProvider.prototype, '_browseForRepository') as (
	this: IGitHubRepositoryBrowseHarness,
) => Promise<ISessionWorkspace | undefined>;
const cloneRepository = Reflect.get(CopilotChatSessionsProvider.prototype, '_cloneRepository') as (
	this: IGitHubRepositoryBrowseHarness,
	url: string,
) => Promise<ISessionWorkspace | undefined>;

function createMockAgentSession(resource: URI, opts?: {
	providerType?: string;
	title?: string;
	archived?: boolean;
	read?: boolean;
	createdAt?: number;
	status?: ChatSessionStatus;
	changes?: IAgentSession['changes'];
	metadata?: Record<string, unknown>;
	onSetRead?: () => void;
}): IAgentSession {
	const providerType = opts?.providerType ?? AgentSessionProviders.Cloud;
	let archived = opts?.archived ?? false;
	let read = opts?.read ?? true;
	return new class extends mock<IAgentSession>() {
		override readonly resource = resource;
		override readonly providerType = providerType;
		override readonly providerLabel = 'Copilot';
		override readonly label = opts?.title ?? 'Test Session';
		override readonly status = opts?.status ?? ChatSessionStatus.Completed;
		override readonly icon = Codicon.copilot;
		override readonly timing = { created: opts?.createdAt ?? Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined };
		override readonly changes = opts?.changes;
		override readonly metadata = opts?.metadata ?? { owner: 'owner', name: 'repo' };
		override isArchived(): boolean { return archived; }
		override setArchived(value: boolean): void { archived = value; }
		override isPinned(): boolean { return false; }
		override setPinned(): void { }
		override isRead(): boolean { return read; }
		override isMarkedUnread(): boolean { return false; }
		override setRead(value: boolean): void {
			read = value;
			// The real model fires its change event from `setRead`, which is how
			// the provider mirrors the new read state back onto the adapter.
			opts?.onSetRead?.();
		}
	}();
}

// ---- Mock Agent Sessions Service --------------------------------------------

class MockAgentSessionsModel {
	private readonly _sessions: IAgentSession[] = [];
	private readonly _onDidChangeSessions = new Emitter<void>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	readonly onWillResolve = Event.None;
	readonly onDidResolve = Event.None;
	readonly onDidChangeSessionArchivedState = Event.None;
	readonly resolved = true;

	get sessions(): IAgentSession[] { return [...this._sessions]; }

	getSession(resource: URI): IAgentSession | undefined {
		return this._sessions.find(s => s.resource.toString() === resource.toString());
	}

	addSession(session: IAgentSession): void {
		this._sessions.push(session);
		this._onDidChangeSessions.fire();
	}

	removeSession(resource: URI): void {
		const idx = this._sessions.findIndex(s => s.resource.toString() === resource.toString());
		if (idx !== -1) {
			this._sessions.splice(idx, 1);
			this._onDidChangeSessions.fire();
		}
	}

	replaceSession(session: IAgentSession): void {
		const idx = this._sessions.findIndex(s => s.resource.toString() === session.resource.toString());
		assert.ok(idx >= 0, 'session should exist before replacing');
		this._sessions.splice(idx, 1, session);
		this._onDidChangeSessions.fire();
	}

	fireDidChangeSessions(): void {
		this._onDidChangeSessions.fire();
	}

	async resolve(): Promise<void> { }

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

interface IExecutedCommand {
	readonly id: string;
	readonly args: readonly unknown[];
}

function serializeCreationReference(reference: ISessionCreationReference | undefined) {
	return reference ? {
		session: reference.session.toString(),
		chat: reference.chat?.toString(),
		turnId: reference.turnId,
	} : undefined;
}

interface ICreateProviderOptions {
	readonly providerMode?: 'default' | 'sandbox';
	readonly consolidatedRemoteWorkspaces?: boolean;
	readonly commandService?: ICommandService;
	readonly repositoryPicker?: Pick<RepositoryPicker, 'pickRepository' | 'dispose'>;
	readonly notificationErrors?: string[];
	readonly getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined;
	readonly languageModelsService?: Partial<ILanguageModelsService>;
	readonly gitHubService?: IGitHubService;
	readonly fileService?: IFileService;
	readonly pullRequestIconCache?: IPullRequestIconCache;
	readonly pathService?: IPathService;
	readonly storageService?: IStorageService;
	readonly logService?: ILogService;
}

function createGitConfigFileService(repositoryRoot: URI, config: string | (() => string), onRead?: () => void): IFileService {
	return upcastPartial<IFileService>({
		stat: async (resource): Promise<IFileStatWithPartialMetadata> => {
			if (resource.toString() === URI.joinPath(repositoryRoot, '.git').toString()) {
				return upcastPartial<IFileStatWithPartialMetadata>({ isDirectory: true });
			}
			throw new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND);
		},
		readFile: async (resource): Promise<IFileContent> => {
			if (resource.toString() === URI.joinPath(repositoryRoot, '.git', 'config').toString()) {
				onRead?.();
				return upcastPartial<IFileContent>({ value: VSBuffer.fromString(typeof config === 'string' ? config : config()) });
			}
			throw new FileOperationError('Not found', FileOperationResult.FILE_NOT_FOUND);
		},
	});
}

class TestPullRequestIconCache implements IPullRequestIconCache {

	declare readonly _serviceBrand: undefined;

	private readonly _icons = new Map<string, ReturnType<typeof computePullRequestIcon>>();

	get(prLink: string): ReturnType<typeof computePullRequestIcon> | undefined {
		return this._icons.get(prLink);
	}

	set(prLink: string, icon: ReturnType<typeof computePullRequestIcon>): void {
		this._icons.set(prLink, icon);
	}
}

class TestGitHubService extends mock<IGitHubService>() {

	override enterpriseHost: string | undefined;
	override async authenticateForRepositoryAccess(_token: CancellationToken): Promise<void> { }

	private readonly _pullRequest = observableValue<IGitHubPullRequest | undefined>(this, undefined);
	private readonly _pullRequestModel: GitHubPullRequestModel;

	lookupCalls = 0;
	pullRequestModelReferenceCalls = 0;

	constructor(private readonly _pullRequestNumber?: number) {
		super();
		const pullRequest = this._pullRequest;
		this._pullRequestModel = new class extends mock<GitHubPullRequestModel>() {
			override readonly pullRequest = pullRequest;
		}();
	}

	override findPullRequestNumberByHeadBranch = async (): Promise<number | undefined> => {
		this.lookupCalls++;
		return this._pullRequestNumber;
	};

	override createPullRequestModelReference = () => {
		this.pullRequestModelReferenceCalls++;
		return new ImmortalReference(this._pullRequestModel);
	};

	setPullRequest(pullRequest: IGitHubPullRequest): void {
		this._pullRequest.set(pullRequest, undefined);
	}
}

function createPullRequest(state: GitHubPullRequestState, isDraft = false): IGitHubPullRequest {
	return {
		number: 42,
		title: 'Cloud PR',
		body: '',
		state,
		author: { login: 'owner', avatarUrl: '' },
		headRef: 'feature',
		headSha: 'head',
		baseRef: 'main',
		isDraft,
		createdAt: '',
		updatedAt: '',
		mergedAt: state === GitHubPullRequestState.Merged ? '' : undefined,
		mergeable: undefined,
		mergeableState: '',
	};
}

// ---- Provider factory -------------------------------------------------------

function createProvider(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	opts?: ICreateProviderOptions,
): CopilotChatSessionsProvider {
	return createProviderWithConfig(disposables, model, opts).provider;
}

function createProviderWithConfig(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	opts?: ICreateProviderOptions,
): { provider: CopilotChatSessionsProvider; configService: TestConfigurationService; labelService: MockLabelService } {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stubInstance(CloudSandboxModels, upcastPartial<CloudSandboxModels>({ models: [], ready: true, onDidChange: Event.None, load: () => { }, dispose: () => { } }));
	instantiationService.stub(IDefaultAccountService, { currentDefaultAccount: null, onDidChangeDefaultAccount: Event.None });
	instantiationService.stub(IChatEntitlementService, { sentiment: {}, onDidChangeSentiment: Event.None });
	instantiationService.stub(IWorkbenchGitHubService, { onDidChangeDefaultClient: Event.None });

	const configService = new TestConfigurationService();
	configService.setUserConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING, opts?.consolidatedRemoteWorkspaces ?? false);

	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(ILogService, opts?.logService ?? new NullLogService());
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(IStorageService, opts?.storageService ?? disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(ICommandService, opts?.commandService ?? { executeCommand: async () => undefined });
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		registerChatSessionContentProvider: () => toDisposable(() => { }),
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
		onDidCommitSession: Event.None,
		updateSessionOptions: () => true,
		setSessionOption: () => true,
		getSessionOption: () => undefined,
		getOptionGroupsForSessionType: () => opts?.getOptionGroups?.(),
		onDidChangeOptionGroups: Event.None,
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }),
		removeHistoryEntry: async (resource: URI) => { model.removeSession(resource); },
		setChatSessionTitle: () => { },
	});
	instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined, getModelConfiguration: () => undefined, setModelConfiguration: async () => { }, ...opts?.languageModelsService });
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
		override warn(): void { }
		override error(message: Parameters<INotificationService['error']>[0]): void {
			opts?.notificationErrors?.push(String(message));
		}
	}());
	// Stub IInstantiationService so provider can use createInstance for RemoteNewSession
	instantiationService.stub(IInstantiationService, instantiationService);
	const labelService = new MockLabelService();
	instantiationService.stub(ILabelService, labelService);
	instantiationService.stub(IPathService, opts?.pathService ?? new TestPathService(URI.file('/home/test')));
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IFileService, opts?.fileService ?? createGitConfigFileService(URI.file('/missing'), ''));
	instantiationService.stub(IGitHubService, opts?.gitHubService ?? new TestGitHubService());
	instantiationService.stub(IPullRequestIconCache, opts?.pullRequestIconCache ?? new TestPullRequestIconCache());
	if (opts?.repositoryPicker) {
		instantiationService.stubInstance(RepositoryPicker, opts.repositoryPicker);
	}

	const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider, opts?.providerMode ?? 'default'));
	return { provider, configService, labelService };
}

// ---- Provider factory for send/cancel tests ---------------------------------

/**
 * Substitutes the sandbox contribution, which the provider otherwise resolves from the global
 * workbench contribution registry.
 */
class TestSandboxCopilotProvider extends CopilotChatSessionsProvider {
	sandboxContribution: Pick<CloudSandboxAgentHostContribution, 'provisionSession' | 'prepareSession' | 'trackSessionCreationProgress'> | undefined;

	/** Only the timeout test lowers this; the rest keep the real budget so they cannot race it. */
	sandboxModelWaitMs: number | undefined;

	protected override _getCloudSandboxContribution(): Pick<CloudSandboxAgentHostContribution, 'provisionSession' | 'prepareSession' | 'trackSessionCreationProgress'> {
		if (!this.sandboxContribution) {
			throw new Error('No cloud sandbox contribution was registered');
		}
		return this.sandboxContribution;
	}

	protected override get _sandboxModelWaitMs(): number {
		return this.sandboxModelWaitMs ?? super._sandboxModelWaitMs;
	}
}

/**
 * Creates a provider suitable for testing sendChat flows. The caller can pass a
 * custom `sendRequest` implementation to control the lifecycle of the in-flight request.
 */
function createProviderForSendTests(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	sendRequest: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>,
	opts?: { onDidCommitSession?: Event<{ original: URI; committed: URI }>; configurationService?: TestConfigurationService; getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined; notifications?: string[]; languageModelsService?: Partial<ILanguageModelsService>; providerMode?: 'default' | 'sandbox'; onGetChatSession?: () => void; updateChatSessionMetadata?: IChatSessionsService['updateChatSessionMetadata']; chatContentProviders?: IChatSessionContentProvider[]; storageService?: IStorageService; sandboxModels?: readonly ILanguageModelChatMetadataAndIdentifier[] },
): TestSandboxCopilotProvider {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.stubInstance(CloudSandboxModels, upcastPartial<CloudSandboxModels>({ models: opts?.sandboxModels ?? [], ready: true, onDidChange: Event.None, load: () => { }, dispose: () => { } }));

	const configService = opts?.configurationService ?? new TestConfigurationService();
	instantiationService.stub(IDefaultAccountService, { currentDefaultAccount: null, onDidChangeDefaultAccount: Event.None });
	instantiationService.stub(IChatEntitlementService, { sentiment: {}, onDidChangeSentiment: Event.None });
	instantiationService.stub(IWorkbenchGitHubService, { onDidChangeDefaultClient: Event.None });

	instantiationService.stub(ILogService, NullLogService);
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IStorageService, opts?.storageService ?? disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		registerChatSessionContentProvider: (_type: string, provider: IChatSessionContentProvider) => {
			opts?.chatContentProviders?.push(provider);
			return toDisposable(() => { });
		},
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => {
			opts?.onGetChatSession?.();
			return { onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } };
		},
		onDidCommitSession: opts?.onDidCommitSession ?? Event.None,
		canResolveChatSession: async () => true,
		getOptionGroupsForSessionType: () => opts?.getOptionGroups?.(),
		supportsAutoModelForSessionType: () => true,
		updateSessionOptions: () => true,
		updateChatSessionMetadata: opts?.updateChatSessionMetadata ?? (() => true),
		setSessionOption: () => true,
		getSessionOption: () => undefined,
		onDidChangeOptionGroups: Event.None,
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: sendRequest,
		removeHistoryEntry: async (resource: URI) => { model.removeSession(resource); },
		setChatSessionTitle: () => { },
	});
	instantiationService.stub(ILanguageModelsService, { onDidChangeLanguageModels: Event.None, lookupLanguageModel: id => opts?.sandboxModels?.find(model => model.identifier === id)?.metadata, getModelConfiguration: () => undefined, setModelConfiguration: async () => { }, ...opts?.languageModelsService });
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
		override warn(message: unknown): void { opts?.notifications?.push(String(message)); }
	}());
	instantiationService.stub(IInstantiationService, instantiationService);
	instantiationService.stub(ILabelService, new MockLabelService());
	instantiationService.stub(IPathService, new TestPathService(URI.file('/home/test')));
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IGitHubService, new TestGitHubService());
	instantiationService.stub(IPullRequestIconCache, new TestPullRequestIconCache());

	return disposables.add(instantiationService.createInstance(TestSandboxCopilotProvider, opts?.providerMode ?? 'default'));
}

suite('CopilotChatSessionsProvider', () => {
	const disposables = new DisposableStore();
	let model: MockAgentSessionsModel;

	setup(() => {
		model = new MockAgentSessionsModel();
		disposables.add(toDisposable(() => model.dispose()));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider identity -------

	test('has correct id and label', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.id, COPILOT_PROVIDER_ID);
		assert.strictEqual(provider.sessionTypes.length, 1);
	});

	test('offers a single repository selection action', () => {
		const localProvider = createProvider(disposables, model, { consolidatedRemoteWorkspaces: true });
		const remoteProvider = createProvider(disposables, model, {
			consolidatedRemoteWorkspaces: true,
			pathService: new TestPathService(URI.file('/home/test'), Schemas.vscodeRemote),
		});

		assert.deepStrictEqual({
			local: localProvider.browseActions.map(action => ({ label: action.label, icon: action.icon.id })),
			remote: remoteProvider.browseActions.map(action => ({ label: action.label, icon: action.icon.id })),
		}, {
			local: [
				{ label: 'Work in Repository...', icon: 'github' },
				{ label: 'Issue...', icon: 'issues' },
				{ label: 'Pull Request...', icon: 'github' },
			],
			remote: [
				{ label: 'Work in Repository...', icon: 'github' },
				{ label: 'Issue...', icon: 'issues' },
				{ label: 'Pull Request...', icon: 'github' },
			],
		});
	});

	test('keeps repository selection available when a Cloud draft changes the default URI scheme', () => {
		const pathService = new TestPathService(URI.file('/home/test'));
		const provider = createProvider(disposables, model, {
			consolidatedRemoteWorkspaces: true,
			pathService,
		});
		const labels = () => provider.browseActions.map(action => action.label);

		const local = labels();
		pathService.defaultUriScheme = GITHUB_REMOTE_FILE_SCHEME;
		const cloud = labels();

		assert.deepStrictEqual({
			local,
			cloud,
		}, {
			local: [
				'Work in Repository...',
				'Issue...',
				'Pull Request...',
			],
			cloud: [
				'Work in Repository...',
				'Issue...',
				'Pull Request...',
			],
		});
	});

	test('preserves the legacy repository action when unified workspaces are disabled', () => {
		const provider = createProvider(disposables, model);

		assert.deepStrictEqual(provider.browseActions.map(action => ({ label: action.label, icon: action.icon.id })), [
			{ label: 'Repository...', icon: 'library' },
			{ label: 'Issue...', icon: 'issues' },
			{ label: 'Pull Request...', icon: 'git-pull-request' },
		]);
	});

	test('updates repository actions when unified workspaces setting changes', () => {
		const { provider, configService } = createProviderWithConfig(disposables, model);
		const legacyActions = provider.browseActions.map(action => ({ label: action.label, icon: action.icon.id }));

		configService.setUserConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING, true);
		const unifiedActions = provider.browseActions.map(action => ({ label: action.label, icon: action.icon.id }));

		assert.deepStrictEqual({
			legacyActions,
			unifiedActions,
		}, {
			legacyActions: [
				{ label: 'Repository...', icon: 'library' },
				{ label: 'Issue...', icon: 'issues' },
				{ label: 'Pull Request...', icon: 'git-pull-request' },
			],
			unifiedActions: [
				{ label: 'Work in Repository...', icon: 'github' },
				{ label: 'Issue...', icon: 'issues' },
				{ label: 'Pull Request...', icon: 'github' },
			],
		});
	});

	for (const consolidatedRemoteWorkspaces of [false, true]) {
		test(`shares repository selection and workspace resolution across creation modes (unified: ${consolidatedRemoteWorkspaces})`, async () => {
			const pickerCalls: string[] = [];
			const pickerDisposals: string[] = [];
			const commands: IExecutedCommand[] = [];
			const workspaces: (ISessionWorkspace | undefined)[] = [];
			const actions = [];

			for (const providerMode of ['default', 'sandbox'] as const) {
				const provider = createProvider(disposables, model, {
					providerMode,
					consolidatedRemoteWorkspaces,
					repositoryPicker: {
						pickRepository: async () => {
							pickerCalls.push(providerMode);
							return { repository: 'microsoft/vscode' };
						},
						dispose: () => pickerDisposals.push(providerMode),
					},
					commandService: new class extends mock<ICommandService>() {
						override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
							commands.push({ id, args });
							return 'microsoft/vscode' as T;
						}
					}(),
				});
				const action = provider.browseActions[0];
				actions.push({
					label: action.label,
					providerId: action.providerId,
					attachesContext: action.attachesContext,
					supportsContextAttachment: action.supportsContextAttachment,
				});
				workspaces.push(await action.run());
				provider.dispose();
			}

			assert.deepStrictEqual({
				actions,
				pickerCalls,
				pickerDisposals,
				commands,
				workspaces: workspaces.map(workspace => workspace && ({
					uri: workspace.uri.toString(),
					root: workspace.folders[0].root.toString(),
					group: workspace.group,
					isVirtualWorkspace: workspace.isVirtualWorkspace,
					requiresWorkspaceTrust: workspace.requiresWorkspaceTrust,
				})),
			}, {
				actions: [
					{ label: consolidatedRemoteWorkspaces ? 'Work in Repository...' : 'Repository...', providerId: COPILOT_PROVIDER_ID, attachesContext: false, supportsContextAttachment: true },
					{ label: 'Choose Repository...', providerId: CLOUD_SANDBOX_CREATION_PROVIDER_ID, attachesContext: false, supportsContextAttachment: false },
				],
				pickerCalls: isWeb ? ['default', 'sandbox'] : [],
				pickerDisposals: isWeb ? ['default', 'sandbox'] : [],
				commands: isWeb ? [] : [
					{ id: 'github.copilot.chat.cloudSessions.openRepository', args: [undefined, { allowRepositoryUrl: true }] },
					{ id: 'github.copilot.chat.cloudSessions.openRepository', args: [undefined, { allowRepositoryUrl: false }] },
				],
				workspaces: ['default', 'sandbox'].map(() => ({
					uri: 'https://github.com/microsoft/vscode',
					root: 'github-remote-file://github/microsoft/vscode/HEAD',
					group: SESSION_WORKSPACE_GROUP_GITHUB,
					isVirtualWorkspace: true,
					requiresWorkspaceTrust: false,
				})),
			});
		});

	}

	test('cancelling repository selection creates no workspace or session in either mode', async () => {
		const workspaces: (ISessionWorkspace | undefined)[] = [];
		const sessions: ISession[][] = [];
		for (const providerMode of ['default', 'sandbox'] as const) {
			const provider = createProvider(disposables, model, {
				providerMode,
				repositoryPicker: {
					pickRepository: async () => undefined,
					dispose: () => { },
				},
			});
			workspaces.push(await provider.browseActions[0].run());
			sessions.push(provider.getSessions());
		}

		assert.deepStrictEqual({ workspaces, sessions }, {
			workspaces: [undefined, undefined],
			sessions: [[], []],
		});
	});

	(isWeb ? test : test.skip)('authenticates before opening the original picker and supplies browser repository data', async () => {
		const steps: string[] = [];
		const gitHubService = new class extends TestGitHubService {
			override async authenticateForRepositoryAccess(): Promise<void> {
				steps.push('authenticate');
			}
			override async getRepositories(query: string): Promise<readonly IGitHubRepository[]> {
				steps.push(`search:${query}`);
				return [{ owner: 'microsoft', name: 'vscode', fullName: 'microsoft/vscode', defaultBranch: 'main', isPrivate: true, description: 'Visual Studio Code' }];
			}
		}();
		const provider = createProvider(disposables, model, {
			providerMode: 'sandbox',
			gitHubService,
			repositoryPicker: {
				pickRepository: async (getRepositories, _options, token) => {
					steps.push('picker');
					const repositories = await getRepositories('https://github.com/microsoft/vscode.git', token ?? CancellationToken.None);
					return { repository: repositories[0] };
				},
				dispose: () => steps.push('dispose'),
			},
		});
		const workspace = await provider.browseActions[0].run();

		assert.deepStrictEqual({ steps, uri: workspace?.uri.toString() }, {
			steps: ['authenticate', 'picker', 'search:microsoft/vscode', 'dispose'],
			uri: 'https://github.com/microsoft/vscode',
		});
	});

	for (const changesWhilePicking of [false, true]) {
		(isWeb ? test : test.skip)(`rejects enterprise identities instead of creating github.com workspaces (changes during picker: ${changesWhilePicking})`, async () => {
			const gitHubService = new TestGitHubService();
			gitHubService.enterpriseHost = changesWhilePicking ? undefined : 'example.ghe.com';
			const errors: string[] = [];
			let pickerCalls = 0;
			const provider = createProvider(disposables, model, {
				providerMode: 'sandbox',
				gitHubService,
				notificationErrors: errors,
				repositoryPicker: {
					pickRepository: async () => {
						pickerCalls++;
						gitHubService.enterpriseHost = 'example.ghe.com';
						return { repository: 'microsoft/vscode' };
					},
					dispose: () => { },
				},
			});

			assert.deepStrictEqual({ workspace: await provider.browseActions[0].run(), pickerCalls, errors }, {
				workspace: undefined,
				pickerCalls: changesWhilePicking ? 1 : 0,
				errors: ['Error: This picker supports github.com repositories only. Switch to a github.com account, then try again.'],
			});
		});
	}

	(isWeb ? test : test.skip)('provider disposal cancels sign-in without opening the repository picker', async () => {
		const authentication = new DeferredPromise<void>();
		const gitHubService = new class extends TestGitHubService {
			override authenticateForRepositoryAccess(): Promise<void> {
				return authentication.p;
			}
		}();
		const errors: string[] = [];
		let pickerCalls = 0;
		const provider = createProvider(disposables, model, {
			providerMode: 'sandbox',
			gitHubService,
			notificationErrors: errors,
			repositoryPicker: {
				pickRepository: async () => {
					pickerCalls++;
					return undefined;
				},
				dispose: () => { },
			},
		});
		const selection = provider.browseActions[0].run();
		provider.dispose();
		const workspace = await selection;
		await authentication.complete();

		assert.deepStrictEqual({ workspace, pickerCalls, errors }, { workspace: undefined, pickerCalls: 0, errors: [] });
	});

	test('selects accepted GitHub repository URLs without cloning', async () => {
		const selectionOptions: boolean[] = [];
		const selections = ['HTTPS://GITHUB.COM/microsoft/vscode.git', 'git://github.com/microsoft/vscode.git'];
		const harness: IGitHubRepositoryBrowseHarness = {
			commandService: new class extends mock<ICommandService>() { }(),
			notificationService: upcastPartial<INotificationService>({ error: () => undefined }),
			resolveWorkspace: () => undefined,
			_labelFromUri: () => 'microsoft/vscode',
			_iconFromUri: () => Codicon.repo,
			_supportsLocalRepositoryActions: () => true,
			_pickRepository: async allowRepositoryUrl => {
				selectionOptions.push(allowRepositoryUrl);
				return selections.shift();
			},
		};

		const workspaces = [
			await browseForRepository.call(harness),
			await browseForRepository.call(harness),
		];

		assert.deepStrictEqual({
			selectionOptions,
			workspaces: workspaces.map(workspace => workspace && {
				uri: workspace.uri.toString(),
				root: workspace.folders[0].root.toString(),
				group: workspace.group,
				isVirtualWorkspace: workspace.isVirtualWorkspace,
			}),
		}, {
			selectionOptions: [true, true],
			workspaces: [
				{
					uri: 'https://github.com/microsoft/vscode',
					root: 'github-remote-file://github/microsoft/vscode/HEAD',
					group: SESSION_WORKSPACE_GROUP_GITHUB,
					isVirtualWorkspace: true,
				},
				{
					uri: 'https://github.com/microsoft/vscode',
					root: 'github-remote-file://github/microsoft/vscode/HEAD',
					group: SESSION_WORKSPACE_GROUP_GITHUB,
					isVirtualWorkspace: true,
				},
			],
		});
	});

	test('clones a pasted non-GitHub repository', async () => {
		const calls: { commandId: string; args: unknown[] }[] = [];
		const selectionOptions: boolean[] = [];
		const harness: IGitHubRepositoryBrowseHarness = {
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
					calls.push({ commandId, args });
					return '/repos/project' as T;
				}
			}(),
			notificationService: upcastPartial<INotificationService>({ error: () => undefined }),
			resolveWorkspace: uri => ({
				uri,
				label: 'project',
				icon: Codicon.folder,
				group: SESSION_WORKSPACE_GROUP_LOCAL,
				folders: [{ root: uri, workingDirectory: uri, name: 'project', description: undefined, gitRepository: undefined }],
				requiresWorkspaceTrust: true,
				isVirtualWorkspace: false,
			}),
			_labelFromUri: () => 'project',
			_iconFromUri: () => Codicon.repo,
			_supportsLocalRepositoryActions: () => true,
			_pickRepository: async allowRepositoryUrl => {
				selectionOptions.push(allowRepositoryUrl);
				return 'ssh://git@gitlab.com/example/project.git';
			},
			_cloneRepository(url) {
				return cloneRepository.call(this, url);
			},
		};

		const workspace = await browseForRepository.call(harness);

		assert.deepStrictEqual({
			calls,
			selectionOptions,
			workspace: workspace?.uri.toString(),
		}, {
			selectionOptions: [true],
			calls: [
				{
					commandId: 'git.clone',
					args: [
						'ssh://git@gitlab.com/example/project.git',
						undefined,
						{ postCloneAction: 'none', returnRepositoryPath: true },
					],
				},
			],
			workspace: URI.file('/repos/project').toString(),
		});
	});

	test('does not offer or clone pasted URLs when local cloning is unsupported', async () => {
		const calls: { commandId: string; args: unknown[] }[] = [];
		const selectionOptions: boolean[] = [];
		const workspace = await browseForRepository.call({
			commandService: new class extends mock<ICommandService>() { }(),
			notificationService: upcastPartial<INotificationService>({ error: () => undefined }),
			resolveWorkspace: () => undefined,
			_labelFromUri: () => 'project',
			_iconFromUri: () => Codicon.repo,
			_supportsLocalRepositoryActions: () => false,
			_pickRepository: async allowRepositoryUrl => {
				selectionOptions.push(allowRepositoryUrl);
				return 'ssh://git@gitlab.com/example/project.git';
			},
			_cloneRepository: async url => {
				calls.push({ commandId: '_cloneRepository', args: [url] });
				return undefined;
			},
		});

		assert.deepStrictEqual({
			calls,
			selectionOptions,
			workspace,
		}, {
			calls: [],
			selectionOptions: [false],
			workspace: undefined,
		});
	});

	test('rejects a workspace file returned by clone', async () => {
		const errors: string[] = [];
		const workspace = await cloneRepository.call({
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(): Promise<T | undefined> {
					return '/repos/project/project.code-workspace' as T;
				}
			}(),
			notificationService: upcastPartial<INotificationService>({ error: error => errors.push(String(error)) }),
			resolveWorkspace: () => undefined,
			_labelFromUri: () => 'project',
			_iconFromUri: () => Codicon.repo,
			_supportsLocalRepositoryActions: () => true,
		}, 'ssh://git@gitlab.com/example/project.git');

		assert.deepStrictEqual({
			workspace,
			errors,
		}, {
			workspace: undefined,
			errors: ['The selected clone is a workspace file. Choose the repository again to select a repository folder.'],
		});
	});

	test('scopes issue and pull request browsing to a selected GitHub repository', async () => {
		const calls: { commandId: string; repoId: unknown }[] = [];
		const harness: IGitHubContextBrowseHarness = {
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string, repoId?: unknown): Promise<T | undefined> {
					calls.push({ commandId, repoId });
					return {
						repoId: 'cutelyaware/MC4D',
						url: `https://github.com/cutelyaware/MC4D/${commandId === 'openIssue' ? 'issues/1' : 'pull/2'}`,
						label: `cutelyaware/MC4D#${commandId === 'openIssue' ? '1' : '2'}`,
					} as T;
				}
			}(),
		};
		const repositoryRoot = URI.from({
			scheme: GITHUB_REMOTE_FILE_SCHEME,
			authority: 'github',
			path: '/cutelyaware/MC4D/HEAD',
		});
		const workspace: ISessionWorkspace = {
			uri: URI.parse('https://github.com/cutelyaware/MC4D'),
			label: 'cutelyaware/MC4D',
			icon: Codicon.repo,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: [{
				root: repositoryRoot,
				workingDirectory: repositoryRoot,
				name: 'MC4D',
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		};

		const issue = await browseForGitHubContext.call(harness, 'openIssue', Codicon.issues, workspace);
		const pullRequest = await browseForGitHubContext.call(harness, 'openPullRequest', Codicon.gitPullRequest, workspace);

		assert.deepStrictEqual({
			calls,
			issue: { uri: issue?.uri.toString(), label: issue?.label, icon: issue?.icon.id },
			pullRequest: { uri: pullRequest?.uri.toString(), label: pullRequest?.label, icon: pullRequest?.icon.id },
		}, {
			calls: [
				{ commandId: 'openIssue', repoId: 'cutelyaware/MC4D' },
				{ commandId: 'openPullRequest', repoId: 'cutelyaware/MC4D' },
			],
			issue: { uri: 'https://github.com/cutelyaware/MC4D/issues/1', label: 'cutelyaware/MC4D#1', icon: Codicon.issues.id },
			pullRequest: { uri: 'https://github.com/cutelyaware/MC4D/pull/2', label: 'cutelyaware/MC4D#2', icon: Codicon.gitPullRequest.id },
		});
	});

	test('selects a repository before browsing GitHub context when the repository is ambiguous', async () => {
		const calls: { commandId: string; repoId: unknown }[] = [];
		const harness: IGitHubContextBrowseHarness = {
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string, repoId?: unknown): Promise<T | undefined> {
					calls.push({ commandId, repoId });
					return {
						repoId: 'microsoft/vscode',
						url: `https://github.com/microsoft/vscode/${commandId === 'openIssue' ? 'issues/1' : 'pull/2'}`,
						label: `microsoft/vscode#${commandId === 'openIssue' ? '1' : '2'}`,
					} as T;
				}
			}(),
			_pickRepository: async () => {
				calls.push({ commandId: 'pickRepository', repoId: undefined });
				return 'microsoft/vscode';
			},
		};
		const repositoryRoot = (repositoryId: string) => URI.from({
			scheme: GITHUB_REMOTE_FILE_SCHEME,
			authority: 'github',
			path: `/${repositoryId}/HEAD`,
		});
		const multiRootWorkspace: ISessionWorkspace = {
			uri: URI.parse('https://github.com'),
			label: 'Multiple repositories',
			icon: Codicon.repo,
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			folders: ['microsoft/vscode', 'microsoft/typescript'].map(repositoryId => {
				const root = repositoryRoot(repositoryId);
				return {
					root,
					workingDirectory: root,
					name: repositoryId,
					description: undefined,
					gitRepository: undefined,
				};
			}),
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: true,
		};

		const issue = await browseForGitHubContext.call(harness, 'openIssue', Codicon.issues, undefined);
		const pullRequest = await browseForGitHubContext.call(harness, 'openPullRequest', Codicon.gitPullRequest, multiRootWorkspace);

		assert.deepStrictEqual({
			calls,
			issue: { uri: issue?.uri.toString(), label: issue?.label },
			pullRequest: { uri: pullRequest?.uri.toString(), label: pullRequest?.label },
		}, {
			calls: [
				{ commandId: 'pickRepository', repoId: undefined },
				{ commandId: 'openIssue', repoId: 'microsoft/vscode' },
				{ commandId: 'pickRepository', repoId: undefined },
				{ commandId: 'openPullRequest', repoId: 'microsoft/vscode' },
			],
			issue: { uri: 'https://github.com/microsoft/vscode/issues/1', label: 'microsoft/vscode#1' },
			pullRequest: { uri: 'https://github.com/microsoft/vscode/pull/2', label: 'microsoft/vscode#2' },
		});
	});

	test('cancelling shared repository selection does not browse GitHub context', async () => {
		const workspace = await browseForGitHubContext.call({
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(): Promise<T | undefined> {
					throw new Error('Context browsing must not start after cancellation');
				}
			}(),
			_pickRepository: async () => undefined,
		}, 'openIssue', Codicon.issues, undefined);

		assert.strictEqual(workspace, undefined);
	});

	test('uses the selected folder without waiting for unresolved local GitHub metadata', async () => {
		const calls: { commandId: string; repoId: unknown }[] = [];
		const harness: IGitHubContextBrowseHarness = {
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string, repoId?: unknown): Promise<T | undefined> {
					calls.push({ commandId, repoId });
					if (commandId === 'github.copilot.chat.cloudSessions.openRepository') {
						return 'microsoft/vscode' as T;
					}
					return {
						repoId: 'microsoft/vscode',
						url: 'https://github.com/microsoft/vscode/issues/1',
						label: 'microsoft/vscode#1',
					} as T;
				}
			}(),
		};
		const root = URI.file('/test/vscode');
		const workspace: ISessionWorkspace = {
			uri: root,
			label: 'vscode',
			icon: Codicon.folder,
			group: SESSION_WORKSPACE_GROUP_LOCAL,
			folders: [{
				root,
				workingDirectory: root,
				name: 'vscode',
				description: undefined,
				gitRepository: undefined,
			}],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		};

		const issue = await browseForGitHubContext.call(harness, 'openIssue', Codicon.issues, workspace);

		assert.deepStrictEqual({
			calls,
			issue: { uri: issue?.uri.toString(), label: issue?.label },
		}, {
			calls: [
				{ commandId: 'openIssue', repoId: root },
			],
			issue: { uri: 'https://github.com/microsoft/vscode/issues/1', label: 'microsoft/vscode#1' },
		});
	});

	test('passes the selected folder through when it has no matching Git root', async () => {
		const calls: { commandId: string; repoId: unknown }[] = [];
		const harness: IGitHubContextBrowseHarness = {
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string, repoId?: unknown): Promise<T | undefined> {
					calls.push({ commandId, repoId });
					if (commandId === 'github.copilot.chat.cloudSessions.openRepository') {
						return 'microsoft/vscode' as T;
					}
					return {
						repoId: 'microsoft/vscode',
						url: 'https://github.com/microsoft/vscode/issues/1',
						label: 'microsoft/vscode#1',
					} as T;
				}
			}(),
		};
		const root = URI.file('/test/new-folder');
		const workspace: ISessionWorkspace = {
			uri: root,
			label: 'new-folder',
			icon: Codicon.folder,
			group: SESSION_WORKSPACE_GROUP_LOCAL,
			folders: [{ root, workingDirectory: root, name: 'new-folder', description: undefined, gitRepository: undefined }],
			requiresWorkspaceTrust: true,
			isVirtualWorkspace: false,
		};

		await browseForGitHubContext.call(harness, 'openIssue', Codicon.issues, workspace);

		assert.deepStrictEqual(calls, [
			{ commandId: 'openIssue', repoId: root },
		]);
	});

	test('advertises only Copilot Cloud, never a local Copilot CLI harness', () => {
		const provider = createProvider(disposables, model);

		assert.deepStrictEqual({
			sessionTypes: provider.sessionTypes.map(type => type.id),
			localFolderTypes: provider.getSessionTypes(URI.file('/test/project')).map(type => type.id),
		}, {
			sessionTypes: [CopilotCloudSessionType.id],
			localFolderTypes: [],
		});
	});

	// ---- getSessionTypes -------

	test('getSessionTypes returns only Cloud for a remote workspace', () => {
		const provider = createProvider(disposables, model);
		const types = provider.getSessionTypes(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repo' }));
		assert.strictEqual(types.length, 1);
	});

	test('rejects session types other than Copilot Cloud', () => {
		const provider = createProvider(disposables, model);
		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/repo/HEAD' });

		assert.throws(
			() => provider.createNewSession(workspace, 'copilotcli'),
			/Unsupported session type 'copilotcli'/,
		);
	});

	test('getSessionTypes offers Cloud for a local workspace with a GitHub remote', async () => {
		const folder = URI.file('/test/vscode');
		const provider = createProvider(disposables, model, {
			consolidatedRemoteWorkspaces: true,
			fileService: createGitConfigFileService(folder, '[remote "origin"]\n\turl = https://github.com/microsoft/vscode.git'),
		});
		const changes: string[][] = [];
		disposables.add(provider.onDidChangeSessionTypes(() => {
			changes.push(provider.getSessionTypes(folder).map(type => type.label));
		}));

		const beforeResolve = provider.getSessionTypes(folder).map(type => type.label);
		await timeout(0);
		const afterResolve = provider.getSessionTypes(folder).map(type => type.label);
		const session = provider.createNewSession(folder, CopilotCloudSessionType.id);

		assert.deepStrictEqual({
			beforeResolve,
			afterResolve,
			changes,
			sessionType: session.sessionType,
			workspaceRoot: session.workspace.get()?.folders[0].root.toString(),
		}, {
			beforeResolve: [],
			afterResolve: ['Cloud'],
			changes: [['Cloud']],
			sessionType: CopilotCloudSessionType.id,
			workspaceRoot: 'github-remote-file://github/microsoft/vscode/HEAD',
		});
	});

	test('getSessionTypes hides Cloud for a local workspace without a GitHub remote', async () => {
		const folder = URI.file('/test/local-only');
		const provider = createProvider(disposables, model, {
			consolidatedRemoteWorkspaces: true,
			fileService: createGitConfigFileService(folder, '[core]\n\trepositoryformatversion = 0'),
		});

		const beforeResolve = provider.getSessionTypes(folder).map(type => type.label);
		await timeout(0);
		const isRepository = provider.resolveWorkspace(folder)?.folders[0].gitRepository?.isRepository?.get();

		assert.deepStrictEqual({
			beforeResolve,
			afterResolve: provider.getSessionTypes(folder).map(type => type.label),
			isRepository,
		}, {
			beforeResolve: [],
			afterResolve: [],
			isRepository: true,
		});
	});

	// ---- Session listing -------

	test('getSessions returns empty array initially', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.getSessions().length, 0);
	});

	test('getSessions returns adapted sessions from agent model', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 2);
	});

	test('publishes changesets on each chat', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session' });
		model.addSession(createMockAgentSession(resource));

		const chat = createProvider(disposables, model).getSessions()[0].mainChat.get();

		assert.deepStrictEqual(chat.changesets.get()?.map(changeset => changeset.id), [
			'branch',
			'allChanges',
			'lastTurnChanges',
		]);
	});

	test('adapts and atomically refreshes aggregate change metadata without synthetic file changes', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session' });
		model.addSession(createMockAgentSession(resource, {
			changes: { files: 2, insertions: 12, deletions: 4 },
		}));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const observed: { readonly changes: readonly ISessionFileChange[]; readonly changesSummary: ISessionChangesSummary | undefined }[] = [];
		disposables.add(autorun(reader => {
			observed.push({
				changes: session.mainChat.read(reader).changes.read(reader),
				changesSummary: session.changesSummary?.read(reader),
			});
		}));

		model.replaceSession(createMockAgentSession(resource, {
			changes: { files: 3, insertions: 20, deletions: 6 },
		}));

		assert.deepStrictEqual(observed, [
			{
				changes: [],
				changesSummary: { files: 2, additions: 12, deletions: 4 },
			},
			{
				changes: [],
				changesSummary: { files: 3, additions: 20, deletions: 6 },
			},
		]);
	});

	test('getSessions does not emit session changes while reading the initial cache', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session' });
		model.addSession(createMockAgentSession(resource));
		const provider = createProvider(disposables, model);
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const sessions = provider.getSessions();

		assert.deepStrictEqual({ sessionCount: sessions.length, changes }, { sessionCount: 1, changes: [] });
	});

	test('getSessions only includes Copilot Cloud sessions', () => {
		const cloudResource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/cloud-session' });
		model.addSession(createMockAgentSession(cloudResource));
		model.addSession(createMockAgentSession(URI.from({ scheme: AgentSessionProviders.Background, path: '/cli-session' }), { providerType: AgentSessionProviders.Background, metadata: { repositoryPath: '/test/repo' } }));
		model.addSession(createMockAgentSession(URI.from({ scheme: AgentSessionProviders.Local, path: '/local-session' }), { providerType: AgentSessionProviders.Local }));
		model.addSession(createMockAgentSession(URI.from({ scheme: 'claude-code', path: '/claude-session' }), { providerType: 'claude-code' }));

		const provider = createProvider(disposables, model);

		assert.deepStrictEqual(provider.getSessions().map(session => session.resource.toString()), [cloudResource.toString()]);
	});

	test('onDidChangeSessions fires when agent model changes', () => {
		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/new-session' });
		model.addSession(createMockAgentSession(resource, { title: 'New Session' }));

		assert.ok(changes.length > 0);
		assert.strictEqual(changes[0].added.length, 1);
	});

	test('onDidChangeSessions does not fire when cached agent session is unchanged', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/existing-session' });
		model.addSession(createMockAgentSession(resource, { title: 'Existing Session', createdAt: 1 }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.fireDidChangeSessions();

		assert.deepStrictEqual(changes, []);
	});

	test('onDidChangeSessions fires changed session when cached agent session changes', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/existing-session' });
		model.addSession(createMockAgentSession(resource, { title: 'Existing Session', createdAt: 1 }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.replaceSession(createMockAgentSession(resource, { title: 'Updated Session', createdAt: 1 }));

		assert.deepStrictEqual(changes.map(e => ({
			added: e.added.length,
			removed: e.removed.length,
			changed: e.changed.map(session => session.title.get()),
		})), [{
			added: 0,
			removed: 0,
			changed: ['Updated Session'],
		}]);
	});

	test('marks a session unread when its turn completes (InProgress → terminal)', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/turn-session' });
		// Session starts a turn (in progress) and is currently read.
		model.addSession(createMockAgentSession(resource, { title: 'Turn Session', createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache with the in-progress session

		// The turn completes: the underlying session flips to a terminal status.
		model.replaceSession(createMockAgentSession(resource, { title: 'Turn Session', createdAt: 1, status: ChatSessionStatus.Completed, read: true, onSetRead: () => model.fireDidChangeSessions() }));

		assert.strictEqual(provider.getSessions()[0].isRead.get(), false);
	});

	test('does not mark unread when status stays in progress', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/still-running' });
		model.addSession(createMockAgentSession(resource, { title: 'Running', createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));

		const provider = createProvider(disposables, model);
		provider.getSessions();

		// A refresh that does not complete the turn must not mark it unread.
		model.replaceSession(createMockAgentSession(resource, { title: 'Running (updated)', createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));

		assert.strictEqual(provider.getSessions()[0].isRead.get(), true);
	});

	test('setSessionReadState updates the agent session read state', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { read: false, onSetRead: () => model.fireDidChangeSessions() }));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const readBefore = session.isRead.get();

		await provider.setSessionReadState(session.sessionId, true);

		assert.deepStrictEqual({
			readBefore,
			readAfter: provider.getSessions()[0].isRead.get(),
		}, {
			readBefore: false,
			readAfter: true,
		});
	});

	// ---- Session creation -------

	test('cloud models resolve arbitrary restored ids with option groups', () => {
		const modelsState: { optionGroups: IChatSessionProviderOptionGroup[] | undefined } = { optionGroups: undefined };
		const provider = createProvider(disposables, model, { getOptionGroups: () => modelsState.optionGroups });
		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repository' });
		const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
		const beforeResolve = provider.getModelsSnapshot(session.sessionId, 'removed-cloud-model');
		const creationBeforeResolve = provider.getModelsSnapshotForCreation(workspace, CopilotCloudSessionType.id, 'removed-cloud-model');

		modelsState.optionGroups = [{
			id: 'models',
			name: 'Models',
			items: [{
				id: 'synthetic-cloud-model', name: 'Synthetic Cloud Model',
				modelMetadata: { id: 'synthetic-cloud-model', name: 'Synthetic Cloud Model', maxInputTokens: 100_000, maxOutputTokens: 20_000, maxContextWindowTokens: 100_000 },
			}],
		}];
		const afterResolve = provider.getModelsSnapshot(session.sessionId, 'removed-cloud-model');
		const creationAfterResolve = provider.getModelsSnapshotForCreation(workspace, CopilotCloudSessionType.id, 'removed-cloud-model');

		assert.deepStrictEqual({
			beforeResolve: { models: beforeResolve.models.map(model => model.identifier), desiredModelResolution: beforeResolve.desiredModelResolution, modelTarget: beforeResolve.modelTarget },
			afterResolve: { models: afterResolve.models.map(model => model.identifier), desiredModelResolution: afterResolve.desiredModelResolution, modelTarget: afterResolve.modelTarget },
			creationBeforeResolve: creationBeforeResolve.desiredModelResolution,
			creationAfterResolve: creationAfterResolve.models.map(model => model.identifier),
			maxContextWindowTokens: afterResolve.models[0].metadata.maxContextWindowTokens,
		}, {
			beforeResolve: { models: [], desiredModelResolution: { kind: 'pending', identifier: 'removed-cloud-model' }, modelTarget: AgentSessionProviders.Cloud },
			afterResolve: { models: ['synthetic-cloud-model'], desiredModelResolution: { kind: 'unavailable', identifier: 'removed-cloud-model' }, modelTarget: AgentSessionProviders.Cloud },
			creationBeforeResolve: { kind: 'pending', identifier: 'removed-cloud-model' },
			creationAfterResolve: ['synthetic-cloud-model'],
			maxContextWindowTokens: 100_000,
		});
	});

	test('cloud models are Copilot models, whoever made them', () => {
		const provider = createProvider(disposables, model, {
			getOptionGroups: () => [{
				id: 'models',
				name: 'Models',
				items: [
					{ id: 'auto', name: 'Auto', modelMetadata: { id: 'auto', name: 'Auto' } },
					{ id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', modelMetadata: { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', vendor: 'Anthropic' } },
					{ id: 'gpt-5', name: 'GPT-5', modelMetadata: { id: 'gpt-5', name: 'GPT-5', vendor: 'OpenAI' } },
				],
			}],
		});
		const session = provider.createNewSession(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repository' }), CopilotCloudSessionType.id);
		const languageModelsService = upcastPartial<ILanguageModelsService>({ getVendors: () => [] });

		assert.deepStrictEqual(provider.getModelsSnapshot(session.sessionId).models.map(cloudModel => ({
			identifier: cloudModel.identifier,
			vendor: cloudModel.metadata.vendor,
			userProvided: isUserProvidedModel(cloudModel, languageModelsService),
		})), [
			{ identifier: 'auto', vendor: 'copilot', userProvided: false },
			{ identifier: 'claude-sonnet-4.5', vendor: 'copilot', userProvided: false },
			{ identifier: 'gpt-5', vendor: 'copilot', userProvided: false },
		]);
	});

	test('committed sessions keep an empty Copilot catalog pending until live models arrive', () => {
		const models = new Map<string, ILanguageModelChatMetadata>();
		model.addSession(createMockAgentSession(URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' })));
		const provider = createProvider(disposables, model, {
			languageModelsService: {
				getLanguageModelIds: () => [...models.keys()],
				lookupLanguageModel: identifier => models.get(identifier),
				hasResolvedVendor: () => true,
			},
		});
		const session = provider.getSessions()[0];
		const empty = provider.getModelsSnapshot(session.sessionId, 'copilot/remembered');

		models.set('copilot/other', {
			extension: new ExtensionIdentifier('test.extension'),
			id: 'other',
			name: 'Other',
			vendor: 'copilot',
			version: '1.0',
			family: 'other',
			maxInputTokens: 1,
			maxOutputTokens: 1,
			isUserSelectable: true,
			isDefaultForLocation: {},
			targetChatSessionType: AgentSessionProviders.Cloud,
		});
		const live = provider.getModelsSnapshot(session.sessionId, 'copilot/remembered');

		assert.deepStrictEqual({
			empty: { resolution: empty.desiredModelResolution, modelTarget: empty.modelTarget },
			live: { resolution: live.desiredModelResolution, modelTarget: live.modelTarget },
		}, {
			empty: { resolution: { kind: 'pending', identifier: 'copilot/remembered' }, modelTarget: AgentSessionProviders.Cloud },
			live: { resolution: { kind: 'unavailable', identifier: 'copilot/remembered' }, modelTarget: AgentSessionProviders.Cloud },
		});
	});

	test('new session config captures cloud provider options', async () => {
		const provider = createProvider(disposables, model);
		const session = provider.createNewSession(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repository' }), CopilotCloudSessionType.id);
		const providerSession = provider.getSession(session.sessionId) as RemoteNewSession;
		providerSession.setOption('customOption', { id: 'selected', name: 'Selected' });
		const config = await provider.getNewSessionConfig(session.sessionId);
		providerSession.setOption('customOption', { id: 'changed', name: 'Changed' });

		assert.deepStrictEqual({
			selected: config?.providerConfig.customOption,
			current: (await provider.getNewSessionConfig(session.sessionId))?.providerConfig.customOption,
			isolation: config?.isolation,
			missing: await provider.getNewSessionConfig('missing'),
		}, { selected: 'selected', current: 'changed', isolation: undefined, missing: undefined });
	});

	// ---- Session actions -------

	test('archiveSession sets archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const agentSession = createMockAgentSession(resource);
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const session = provider.getSessions()[0];
		provider.archiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), true);
	});

	test('unarchiveSession clears archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const agentSession = createMockAgentSession(resource, { archived: true });
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions();

		const session = provider.getSessions()[0];
		provider.unarchiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), false);
	});

	// ---- Session capabilities -------

	test('copilot cloud sessions expose single-chat capabilities', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);

		assert.deepStrictEqual(provider.getSessions().map(session => session.capabilities.get()), [{
			supportsMultipleChats: false,
			supportsRename: false,
			supportsDelete: false,
			runsWorktreeCreatedTasks: true,
		}]);
	});

	test('cloud session exposes linked issues as artifacts and issue pill references', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const linkedIssues = [
			{ url: 'https://github.com/microsoft/vscode/issues/335868', title: 'Info spotlight not screen reader accessible' },
			{ url: 'https://github.com/microsoft/vscode-docs/issues/42', title: 'Document accessible spotlight cards' },
		];
		model.addSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				owner: 'microsoft',
				name: 'vscode',
				pullRequestUrl: 'https://github.com/microsoft/vscode/pull/336399',
				linkedIssues: [...linkedIssues, { url: 'https://github.com/Microsoft/VSCode/issues/335868/', title: 'Duplicate' }],
			},
		}));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const info = session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();

		assert.deepStrictEqual({
			artifacts: session.artifacts?.get().map(artifact => ({ ...artifact, link: artifact.link?.toString() })),
			issues: info?.issues?.map(issue => ({ ...issue, uri: issue.uri.toString() })),
		}, {
			artifacts: linkedIssues.map(issue => ({
				id: `linked-issue:${issue.url}`,
				kind: SessionArtifactKind.Issue,
				label: issue.title,
				isArtifact: true,
				link: issue.url,
				isGitHub: true,
			})),
			issues: [
				{ owner: 'microsoft', repo: 'vscode', number: 335868, uri: linkedIssues[0].url, title: linkedIssues[0].title },
				{ owner: 'microsoft', repo: 'vscode-docs', number: 42, uri: linkedIssues[1].url, title: linkedIssues[1].title },
			],
		});
	});

	test('cloud session stays external until refreshed metadata reports it as adopted', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const metadata = { owner: 'microsoft', name: 'vscode' };
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: { ...metadata, external: true } }));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const observed: (boolean | undefined)[] = [];
		disposables.add(autorun(reader => observed.push(session.isExternal?.read(reader))));
		model.replaceSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata }));

		assert.deepStrictEqual({ observed, harness: session.harness, environment: session.environment, application: session.application.get() }, {
			observed: [true, false],
			harness: 'copilot',
			environment: 'cloud',
			application: { id: 'github/autopilot', label: 'Copilot App' },
		});
	});

	test('cloud application metadata hydrates from event_type and survives adoption', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/from-cli' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: { external: true } }));
		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const applications: string[] = [];
		disposables.add(autorun(reader => applications.push(session.application.read(reader).id)));
		model.replaceSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: { event_type: 'github/cli', external: true } }));
		model.replaceSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: {} }));
		assert.deepStrictEqual(applications, ['github/autopilot', 'github/cli']);
	});

	test('formats unknown cloud application labels without changing event_type identities through refresh and adoption', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/custom-application' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: { event_type: 'CUSTOM_cloud_app', external: true } }));
		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const applications = [session.application.get()];
		model.replaceSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: { event_type: 'another_APPLICATION', external: true } }));
		applications.push(session.application.get());
		model.replaceSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, createdAt: 1, metadata: {} }));
		applications.push(session.application.get());
		assert.deepStrictEqual(applications, [
			{ id: 'CUSTOM_cloud_app', label: 'Custom Cloud App' },
			{ id: 'another_APPLICATION', label: 'Another Application' },
			{ id: 'another_APPLICATION', label: 'Another Application' },
		]);
	});

	test('cloud session refreshes linked issue artifacts and pill references atomically and removes stale links', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const metadata = { owner: 'microsoft', name: 'vscode', pullRequestUrl: 'https://github.com/microsoft/vscode/pull/336399' };
		const original = createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			createdAt: 1,
			metadata: { ...metadata, linkedIssues: [{ url: 'https://github.com/microsoft/vscode/issues/335868', title: 'Original title' }] },
		});
		model.addSession(original);
		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		const snapshots: { artifactLabels: readonly string[]; issueTitles: readonly (string | undefined)[] }[] = [];
		disposables.add(autorun(reader => {
			snapshots.push({
				artifactLabels: session.artifacts?.read(reader).map(artifact => artifact.label) ?? [],
				issueTitles: session.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader)?.issues?.map(issue => issue.title) ?? [],
			});
		}));

		const updated = createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			createdAt: 1,
			metadata: { ...metadata, linkedIssues: [{ url: 'https://github.com/microsoft/vscode/issues/335868', title: 'Updated title' }] },
		});
		model.replaceSession(updated);
		model.replaceSession(updated);
		model.replaceSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			createdAt: 1,
			metadata,
		}));

		assert.deepStrictEqual(snapshots, [
			{ artifactLabels: ['Original title'], issueTitles: ['Original title'] },
			{ artifactLabels: ['Updated title'], issueTitles: ['Updated title'] },
			{ artifactLabels: [], issueTitles: [] },
		]);
	});

	test('cloud session keeps enterprise issue artifacts without public GitHub promotion and logs invalid metadata', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const metadata = {
			owner: 'owner',
			name: 'repo',
			host: 'github.example.com',
			pullRequestUrl: 'https://github.example.com/owner/repo/pull/1',
		};
		const issueUrl = 'https://github.example.com/owner/repo/issues/42';
		model.addSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				...metadata,
				linkedIssues: [
					null,
					{ url: issueUrl, title: 42 },
					{ url: 'not a URL', title: 'Invalid' },
					{ url: 'command:example', title: 'Not a web link' },
					{ url: 'https://github.com/owner/repo/pull/42', title: 'Not an issue' },
					{ url: issueUrl, title: 'Enterprise issue' },
				],
			},
		}));
		const provider = createProvider(disposables, model, { logService });
		const session = provider.getSessions()[0];
		const before = {
			artifactLinks: session.artifacts?.get().map(artifact => artifact.link?.toString()),
			issues: session.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.issues,
			warnings: warnings.length,
		};
		model.replaceSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: { ...metadata, linkedIssues: 'invalid' },
		}));

		assert.deepStrictEqual({
			before,
			after: { artifacts: session.artifacts?.get(), warnings: warnings.length },
		}, {
			before: { artifactLinks: [issueUrl], issues: undefined, warnings: 5 },
			after: { artifacts: [], warnings: 6 },
		});
	});

	test('cloud session reports the provider pull request and uses the cached icon while live data loads', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const gitHubService = new TestGitHubService(7);
		const iconCache = new TestPullRequestIconCache();
		const prUri = URI.parse('https://github.com/owner/repo/pull/42');
		const cachedIcon = computePullRequestIcon(GitHubPullRequestState.Merged);
		iconCache.set(prUri.toString(), cachedIcon);
		model.addSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				owner: 'wrong-owner',
				name: 'wrong-repo',
				branch: 'feature',
				pullRequestNumber: 7,
				pullRequestUrl: prUri.toString(),
				pullRequestState: GitHubPullRequestState.Open,
			},
		}));

		const provider = createProvider(disposables, model, { gitHubService, pullRequestIconCache: iconCache });
		const gitHubInfo = provider.getSessions()[0].workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();

		assert.deepStrictEqual({
			owner: gitHubInfo?.owner,
			repo: gitHubInfo?.repo,
			pullRequest: gitHubInfo?.pullRequest && {
				number: gitHubInfo.pullRequest.number,
				uri: gitHubInfo.pullRequest.uri.toString(),
				icon: gitHubInfo.pullRequest.icon,
			},
			lookupCalls: gitHubService.lookupCalls,
			pullRequestModelReferenceCalls: gitHubService.pullRequestModelReferenceCalls,
		}, {
			owner: 'owner',
			repo: 'repo',
			pullRequest: {
				number: 42,
				uri: prUri.toString(),
				icon: cachedIcon,
			},
			lookupCalls: 0,
			pullRequestModelReferenceCalls: 1,
		});
	});

	test('cloud session accepts pull request URL-only metadata without creating an invalid workspace URI', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const gitHubService = new TestGitHubService();
		model.addSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				pullRequestUrl: 'https://github.com/owner/repo/pull/42',
				pullRequestState: GitHubPullRequestState.Open,
			},
		}));

		const provider = createProvider(disposables, model, { gitHubService });
		const workspace = provider.getSessions()[0].workspace.get();
		const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.get();

		assert.deepStrictEqual({
			workspaceRoot: workspace?.folders[0]?.root.toString(),
			owner: gitHubInfo?.owner,
			repo: gitHubInfo?.repo,
			pullRequest: gitHubInfo?.pullRequest && {
				number: gitHubInfo.pullRequest.number,
				uri: gitHubInfo.pullRequest.uri.toString(),
			},
		}, {
			workspaceRoot: URI.parse('unknown:///').toString(),
			owner: 'owner',
			repo: 'repo',
			pullRequest: {
				number: 42,
				uri: 'https://github.com/owner/repo/pull/42',
			},
		});
	});

	test('cloud session keeps provider-reported enterprise PR identity without public GitHub polling', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const gitHubService = new TestGitHubService(7);
		model.addSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				owner: 'wrong-owner',
				name: 'wrong-repo',
				host: 'github.example.com',
				branch: 'feature',
				pullRequestNumber: 7,
				pullRequestUrl: 'https://github.example.com/owner/repo/pull/42',
				pullRequestState: GitHubPullRequestState.Open,
			},
		}));

		const provider = createProvider(disposables, model, { gitHubService });
		const gitHubInfo = provider.getSessions()[0].workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();

		assert.deepStrictEqual({
			owner: gitHubInfo?.owner,
			repo: gitHubInfo?.repo,
			pullRequest: gitHubInfo?.pullRequest && {
				number: gitHubInfo.pullRequest.number,
				uri: gitHubInfo.pullRequest.uri.toString(),
				icon: gitHubInfo.pullRequest.icon,
			},
			lookupCalls: gitHubService.lookupCalls,
			pullRequestModelReferenceCalls: gitHubService.pullRequestModelReferenceCalls,
		}, {
			owner: 'owner',
			repo: 'repo',
			pullRequest: {
				number: 42,
				uri: 'https://github.example.com/owner/repo/pull/42',
				icon: computePullRequestIcon(GitHubPullRequestState.Open),
			},
			lookupCalls: 0,
			pullRequestModelReferenceCalls: 0,
		});
	});

	test('cloud session infers a provider-omitted pull request from its branch and updates the live icon', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const gitHubService = new TestGitHubService(42);
		const iconCache = new TestPullRequestIconCache();
		model.addSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				owner: 'owner',
				name: 'repo',
				branch: 'feature',
			},
		}));

		const provider = createProvider(disposables, model, { gitHubService, pullRequestIconCache: iconCache });
		const gitHubInfoObs = provider.getSessions()[0].workspace.get()!.folders[0].gitRepository!.gitHubInfo;
		const firstObservation = disposables.add(autorun(reader => gitHubInfoObs.read(reader)));
		await timeout(0);
		const beforeLiveUpdate = gitHubInfoObs.get()?.pullRequest;

		gitHubService.setPullRequest(createPullRequest(GitHubPullRequestState.Merged));
		const afterLiveUpdate = gitHubInfoObs.get()?.pullRequest;
		firstObservation.dispose();

		let firstReobservedNumber: number | undefined;
		let captured = false;
		const secondObservation = autorun(reader => {
			const pullRequestNumber = gitHubInfoObs.read(reader)?.pullRequest?.number;
			if (!captured) {
				firstReobservedNumber = pullRequestNumber;
				captured = true;
			}
		});
		disposables.add(secondObservation);
		model.replaceSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			title: 'Updated Cloud Session',
			metadata: {
				owner: 'owner',
				name: 'repo',
				branch: 'feature',
			},
		}));

		assert.deepStrictEqual({
			beforeLiveUpdate: beforeLiveUpdate && {
				number: beforeLiveUpdate.number,
				uri: beforeLiveUpdate.uri.toString(),
				icon: beforeLiveUpdate.icon,
				title: beforeLiveUpdate.title,
			},
			afterLiveUpdate: afterLiveUpdate && {
				number: afterLiveUpdate.number,
				uri: afterLiveUpdate.uri.toString(),
				icon: afterLiveUpdate.icon,
				title: afterLiveUpdate.title,
			},
			lookupCalls: gitHubService.lookupCalls,
			cachedIcon: iconCache.get('https://github.com/owner/repo/pull/42'),
			firstReobservedNumber,
			numberAfterUpdate: gitHubInfoObs.get()?.pullRequest?.number,
		}, {
			beforeLiveUpdate: {
				number: 42,
				uri: 'https://github.com/owner/repo/pull/42',
				icon: computePullRequestIcon(GitHubPullRequestState.Open),
				title: undefined,
			},
			afterLiveUpdate: {
				number: 42,
				uri: 'https://github.com/owner/repo/pull/42',
				icon: computePullRequestIcon(GitHubPullRequestState.Merged),
				title: 'Cloud PR',
			},
			lookupCalls: 1,
			cachedIcon: computePullRequestIcon(GitHubPullRequestState.Merged),
			firstReobservedNumber: 42,
			numberAfterUpdate: 42,
		});
	});

	test('cloud session waits for provider PR metadata after an unsuccessful branch lookup without polling on unrelated updates', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const gitHubService = new TestGitHubService();
		const metadata = {
			owner: 'owner',
			name: 'repo',
			branch: 'feature',
		};
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, metadata }));

		const provider = createProvider(disposables, model, { gitHubService });
		const gitHubInfoObs = provider.getSessions()[0].workspace.get()!.folders[0].gitRepository!.gitHubInfo;
		disposables.add(autorun(reader => gitHubInfoObs.read(reader)));
		await timeout(0);
		model.replaceSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			title: 'Updated Cloud Session',
			metadata,
		}));
		await timeout(0);

		model.replaceSession(createMockAgentSession(resource, {
			providerType: AgentSessionProviders.Cloud,
			metadata: {
				...metadata,
				pullRequestUrl: 'https://github.com/owner/repo/pull/42',
			},
		}));

		assert.deepStrictEqual({
			lookupCalls: gitHubService.lookupCalls,
			pullRequest: gitHubInfoObs.get()?.pullRequest && {
				number: gitHubInfoObs.get()!.pullRequest!.number,
				uri: gitHubInfoObs.get()!.pullRequest!.uri.toString(),
			},
		}, {
			lookupCalls: 1,
			pullRequest: {
				number: 42,
				uri: 'https://github.com/owner/repo/pull/42',
			},
		});
	});

	// ---- Session wrappers -------

	test('each session has exactly one chat initially', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].chats.get().length, 1);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
	});

	test('setModel applies to existing sessions, which do not support additional chats', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		provider.setModel(session.sessionId, session.resource, 'copilot/gpt-4o', ChatModelSource.Chosen);

		assert.deepStrictEqual({
			model: session.modelId.get(),
			source: session.mainChat.get().modelSource?.get(),
		}, {
			model: 'copilot/gpt-4o',
			source: ChatModelSource.Chosen,
		});
		await assert.rejects(() => provider.createNewChat(session.sessionId), /does not support multiple chats/);
		await assert.rejects(() => provider.sendRequest(session.sessionId, resource, { query: 'test' }), /Multiple chats per session is not supported/);
	});

	test('sendRequest throws for unknown session', async () => {
		const provider = createProvider(disposables, model);
		await assert.rejects(
			() => provider.sendRequest('nonexistent', URI.parse('untitled:chat'), { query: 'test' }),
			/not found/,
		);
	});

	test('session title comes from the agent session', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { title: 'Primary Title' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].title.get(), 'Primary Title');
	});

	test('deleteSession removes session from model and list', async () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		await provider.deleteSession(sessions[0].sessionId);

		const remainingSessions = provider.getSessions();
		assert.strictEqual(remainingSessions.length, 1);
		assert.strictEqual(remainingSessions[0].title.get(), 'Session 2');
	});

	test('deleteChat throws because sessions have a single chat', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const session = sessions[0];

		await assert.rejects(
			() => provider.deleteChat(session.sessionId, resource),
			/Deleting individual chats is not supported/,
		);
	});

	test('session wrapper cache is invalidated on session removal', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);

		// Initialize sessions
		let sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		// Remove one from the model
		model.removeSession(resource1);

		// Re-fetch
		sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].title.get(), 'Session 2');
	});

	test('getSessions returns stable session wrappers on repeated calls', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);

		// Call getSessions multiple times
		const sessions1 = provider.getSessions();
		const sessions2 = provider.getSessions();

		assert.strictEqual(sessions1.length, 1);
		assert.strictEqual(sessions2.length, 1);
		// Should return the same cached session object
		assert.strictEqual(sessions1[0], sessions2[0]);
	});

	// ---- Browse actions -------

	test('resolveWorkspace creates proper workspace structure', () => {
		const provider = createProvider(disposables, model);
		const uri = URI.file('/test/project');

		const workspace = provider.resolveWorkspace(uri);

		assert.ok(workspace, 'resolveWorkspace should resolve file:// URIs');
		assert.strictEqual(workspace.label, 'project');
		assert.strictEqual(workspace.folders.length, 1);
		assert.strictEqual(workspace.folders[0].root.toString(), uri.toString());
		assert.strictEqual(workspace.requiresWorkspaceTrust, true);
	});

	test('resolveWorkspace resolves local GitHub metadata only when requested', async () => {
		let readConfigCalls = 0;
		const folder = URI.file('/test/vscode');
		const fileService = createGitConfigFileService(
			folder,
			'[remote "origin"]\n\turl = https://github.com/microsoft/vscode.git',
			() => readConfigCalls++,
		);
		const provider = createProvider(disposables, model, { fileService });
		const workspace = provider.resolveWorkspace(folder);
		const gitRepository = workspace?.folders[0].gitRepository;

		const beforeResolve = {
			readConfigCalls,
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		};
		gitRepository?.resolveGitHubInfo?.();
		await timeout(0);
		gitRepository?.resolveGitHubInfo?.();

		assert.deepStrictEqual({
			beforeResolve,
			readConfigCalls,
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		}, {
			beforeResolve: {
				readConfigCalls: 0,
				gitHubInfo: undefined,
			},
			readConfigCalls: 1,
			gitHubInfo: { owner: 'microsoft', repo: 'vscode' },
		});
	});

	test('resolveWorkspace retries unresolved GitHub metadata', async () => {
		let readConfigCalls = 0;
		let config = '[core]\n\trepositoryformatversion = 0';
		const folder = URI.file('/test/vscode');
		const provider = createProvider(disposables, model, {
			fileService: createGitConfigFileService(folder, () => config, () => readConfigCalls++),
		});
		const gitRepository = provider.resolveWorkspace(folder)?.folders[0].gitRepository;

		gitRepository?.resolveGitHubInfo?.();
		await timeout(0);
		const beforeRemote = {
			readConfigCalls,
			isRepository: gitRepository?.isRepository?.get(),
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		};

		config = '[remote "origin"]\n\turl = https://github.com/microsoft/vscode.git';
		gitRepository?.resolveGitHubInfo?.();
		await timeout(0);

		assert.deepStrictEqual({
			beforeRemote,
			readConfigCalls,
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		}, {
			beforeRemote: {
				readConfigCalls: 1,
				isRepository: true,
				gitHubInfo: undefined,
			},
			readConfigCalls: 2,
			gitHubInfo: { owner: 'microsoft', repo: 'vscode' },
		});
	});

	test('builds an unknown workspace fallback when repository metadata is missing', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/unknown-workspace-session' });
		model.addSession(createMockAgentSession(resource, { metadata: {} }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const workspace = sessions[0].workspace.get();

		assert.ok(workspace);
		assert.strictEqual(workspace.folders.length, 1);
		assert.strictEqual(workspace.folders[0].root.toString(), URI.parse('unknown:///').toString());
		assert.strictEqual(workspace.requiresWorkspaceTrust, false);

		// The core symptom of #310777: any of these calls must not throw.
		assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, '.vscode', 'settings.json'));
		assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, '.vscode/extensions.json'));
	});

	// ---- Rename -------

	test('renameChat throws for unsupported session type', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/cloud-session' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		await assert.rejects(
			() => provider.renameChat(sessions[0].sessionId, resource, 'New Title'),
			/not supported/,
		);
	});

	// ---- Uncommitted temp session cleanup ------------------------------------

	suite('uncommitted temp session cleanup', () => {
		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/repo/HEAD' });

		/**
		 * Returns a provider wired up so that sendRequest keeps the request
		 * in-flight indefinitely. Also returns helpers to resolve the request
		 * as a cancellation (so the provider cleans up promptly in tests).
		 */
		function makeInFlightProvider(): {
			provider: CopilotChatSessionsProvider;
			cancelRequest: () => void;
		} {
			let resolveComplete!: () => void;
			let resolveCreated!: (r: IChatResponseModel) => void;
			const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
			const responseCreatedPromise = new Promise<IChatResponseModel>(r => { resolveCreated = r; });

			const provider = createProviderForSendTests(disposables, model, async () => ({
				kind: 'sent' as const,
				data: {
					responseCompletePromise,
					responseCreatedPromise,
					agent: new class extends mock<IChatAgentData>() { }(),
				} as IChatSendRequestData,
			}));

			return {
				provider,
				cancelRequest: () => {
					resolveCreated({ isCanceled: true } as unknown as IChatResponseModel);
					resolveComplete();
				},
			};
		}

		/** Wait for the provider to fire an "added" session change event. */
		function waitForSessionAdded(provider: CopilotChatSessionsProvider): Promise<void> {
			return new Promise<void>(resolve => {
				const d = provider.onDidChangeSessions(e => {
					if (e.added.length > 0) {
						d.dispose();
						resolve();
					}
				});
			});
		}

		test('deleteSession removes a temp session that is awaiting commit', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCloudSessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const chat = await provider.createNewChat(sessionId);
			const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			await provider.deleteSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 0, 'session should be removed after deleteSession');

			// Cancellation after delete should resolve cleanly
			cancelRequest();
			await assert.doesNotReject(sendPromise);
		});

		test('archiveSession archives a temp session that is awaiting commit', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCloudSessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const chat = await provider.createNewChat(sessionId);
			const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			await provider.archiveSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 1, 'session should still be in the list after archiveSession');
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, 'session should be archived');

			// Cancellation after archive should resolve cleanly
			cancelRequest();
			await assert.doesNotReject(sendPromise);

			// Clean up to avoid leaked disposable
			await provider.deleteSession(sessionId);
		});

		test('archiveSession archives a stopped session that was never committed', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCloudSessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const chat = await provider.createNewChat(sessionId);
			const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: 'test' });
			await added;

			// Stop before commit arrives — session should stay as completed
			cancelRequest();
			await sendPromise;

			assert.strictEqual(provider.getSessions().length, 1, 'stopped session should remain in the list');
			assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, 'session should be completed');

			await provider.archiveSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 1, 'session should still be in the list after archiving');
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, 'session should be archived');

			// Unarchive should also work
			await provider.unarchiveSession(sessionId);
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), false, 'session should be unarchived');

			// Clean up to avoid leaked disposable
			await provider.deleteSession(sessionId);
		});
	});

	// ---- Automation session configuration ----------------------------------

	suite('Automation session configuration', () => {
		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/owner/repo/HEAD' });

		async function createAutomationProvider() {
			const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled: true } } } });
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			await configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, true);
			await configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
			const rawModel = 'claude-opus-5.5';
			const sandboxModel: ILanguageModelChatMetadataAndIdentifier = {
				identifier: `default-copilot-sandbox-models:${rawModel}`,
				metadata: {
					extension: new ExtensionIdentifier('test'), id: rawModel, name: 'Claude Opus 5.5',
					vendor: 'copilot', family: rawModel, version: '1', maxInputTokens: 1_000_000, maxOutputTokens: 32_000,
					isDefaultForLocation: {},
					configurationSchema: { type: 'object', properties: { reasoningEffort: { type: 'string', enum: ['low', 'high'] } } },
				},
			};
			const provider = createProviderForSendTests(disposables, model, async () => { throw new Error('Capture must not send a request.'); }, {
				configurationService, sandboxModels: [sandboxModel],
				getOptionGroups: () => [{ id: 'models', name: 'Models', items: [{ id: rawModel, name: 'Claude Opus 5.5' }] }],
			});
			return { provider, configurationService, rawModel, sandboxModel };
		}

		test('automation drafts capture scheduled Cloud models with sandbox routing enabled', async () => {
			const { provider, rawModel } = await createAutomationProvider();
			const draft = provider.createNewSession(workspace, CopilotCloudSessionType.id, { isAutomationDraft: true });
			const snapshot = provider.getModelsSnapshot(draft.sessionId);
			const selected = snapshot.models[0].identifier;
			provider.setModel(draft.sessionId, draft.mainChat.get().resource, selected, ChatModelSource.Chosen);
			const capture = await provider.getAutomationSessionConfiguration(draft.sessionId).then(
				configuration => ({ configuration }),
				(error: Error) => ({ error: error.message }),
			);
			assert.deepStrictEqual({
				modelTarget: snapshot.modelTarget, selected,
				modelConfiguration: provider.getAutomationModelConfiguration(draft.sessionId)?.captureModelConfiguration(selected),
				capture,
			}, {
				modelTarget: AgentSessionProviders.Cloud, selected: rawModel, modelConfiguration: undefined,
				capture: { configuration: { sessionTemplate: { modelId: rawModel } } },
			});
		});

		test('automation purpose survives sandbox setting changes without changing ordinary Cloud drafts', async () => {
			const { provider, configurationService, rawModel, sandboxModel } = await createAutomationProvider();
			const sessionTemplate = { modelId: rawModel, config: { tools: ['read', 'future-tool'], reasoningEffort: 'high' } };
			const restored = provider.createNewSession(workspace, CopilotCloudSessionType.id, { isAutomationDraft: true, automationConfiguration: { sessionTemplate } });
			const ordinary = provider.createNewSession(workspace, CopilotCloudSessionType.id);
			const quickChat = provider.createQuickChat(CopilotCloudSessionType.id);
			for (const enabled of [true, false, true]) {
				await configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, enabled);
				const fresh = provider.createNewSession(workspace, CopilotCloudSessionType.id, { isAutomationDraft: true });
				assert.deepStrictEqual({
					restoredModels: provider.getModelsSnapshot(restored.sessionId).models.map(model => model.identifier),
					freshModels: provider.getModelsSnapshot(fresh.sessionId).models.map(model => model.identifier),
					config: provider.getSessionConfig(restored.sessionId),
					picker: provider.getModelPickerOptions(restored.sessionId).showAutoModel,
					captured: await provider.getAutomationSessionConfiguration(restored.sessionId),
					ordinaryModels: provider.getModelsSnapshot(ordinary.sessionId).models.map(model => model.identifier),
					ordinaryConfig: provider.getSessionConfig(ordinary.sessionId) !== undefined,
					creationModels: provider.getModelsSnapshotForCreation(workspace, CopilotCloudSessionType.id).models.map(model => model.identifier),
					quickChatModels: provider.getModelsSnapshot(quickChat.sessionId).models.map(model => model.identifier),
				}, {
					restoredModels: [rawModel], freshModels: [rawModel], config: undefined, picker: true,
					captured: { sessionTemplate },
					ordinaryModels: [enabled ? sandboxModel.identifier : rawModel], ordinaryConfig: enabled,
					creationModels: [enabled ? sandboxModel.identifier : rawModel], quickChatModels: [sandboxModel.identifier],
				});
				provider.deleteNewSession(fresh.sessionId);
			}
		});

		test('shared model selection captures raw Cloud models for automation drafts', async () => {
			const { provider, configurationService, rawModel } = await createAutomationProvider();
			const draft = provider.createNewSession(workspace, CopilotCloudSessionType.id, { isAutomationDraft: true });
			const session = disposables.add(new VisibleSession(draft, draft.mainChat.get()));
			const providers = upcastPartial<ISessionsProvidersService>({
				onDidChangeProviders: Event.None,
				getProvider: <T extends ISessionsProvider>(id: string) => {
					const result: ISessionsProvider | undefined = id === provider.id ? provider : undefined;
					return result as T | undefined;
				},
			});
			const selection = disposables.add(new SessionModelSelection(
				constObservable(session), { modelConfiguration: true }, providers,
				disposables.add(new TestStorageService()), configurationService, disposables.add(new NullLogService()),
			));
			const selected = selection.selectModel(rawModel);
			assert.deepStrictEqual({
				selected, id: draft.modelId.get(),
				preferences: selection.modelConfiguration?.getModelConfiguration(rawModel),
				captured: await provider.getAutomationSessionConfiguration(draft.sessionId),
			}, { selected: true, id: rawModel, preferences: undefined, captured: { sessionTemplate: { modelId: rawModel } } });
		});

		test('automation drafts still reject unsupported configuration', async () => {
			const { provider, rawModel } = await createAutomationProvider();
			const configurations: IAutomationSessionConfiguration[] = [
				{ mode: 'plan' },
				{ permissionLevel: 'autopilot' },
				{ sessionTemplate: { modelId: rawModel, modelConfiguration: { reasoningEffort: 'high' } } },
				{ sessionTemplate: { modelId: rawModel, modelConfiguration: {} } },
			];
			for (const configuration of configurations) {
				const draft = provider.createNewSession(workspace, CopilotCloudSessionType.id, { isAutomationDraft: true, automationConfiguration: configuration });
				await assert.rejects(provider.getAutomationSessionConfiguration(draft.sessionId), /Cloud automations do not support/);
			}
			assert.throws(() => provider.createNewSession(workspace, CopilotCloudSessionType.id, {
				isAutomationDraft: true, automationConfiguration: { sessionTemplate: { agent: { uri: 'file:///agent.md' } } },
			}), /does not support custom agents/);
		});

		test('sandbox-only providers reject fresh automation purpose without requiring configuration', async () => {
			const configurationService = new TestConfigurationService();
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			await configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, true);
			await configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
			const provider = createProviderForSendTests(disposables, model, async () => { throw new Error('Must not send.'); }, {
				configurationService, providerMode: 'sandbox',
			});
			assert.throws(() => provider.createNewSession(workspace, CopilotSandboxSessionType.id, { isAutomationDraft: true }), /not supported/);
			assert.throws(() => provider.createQuickChat(CopilotSandboxSessionType.id, { isAutomationDraft: true }), /not supported/);
		});

		test('enabled cloud automations capture model and opaque tools without local approval defaults', async () => {
			const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled: true } } } });
			const provider = createProviderForSendTests(disposables, model, async () => { throw new Error('Configuration must not send a request.'); }, { configurationService });
			const sessionTemplate = { modelId: 'cloud-model', config: { tools: ['read', 'future-tool'], reasoningEffort: 'high' } };
			const session = provider.createNewSession(workspace, CopilotCloudSessionType.id, { automationConfiguration: { sessionTemplate } });
			assert.deepStrictEqual({
				canConfigure: provider.supportsAutomationSessionConfiguration,
				captured: await provider.getAutomationSessionConfiguration(session.sessionId),
			}, { canConfigure: true, captured: { sessionTemplate } });
		});

		test('restores and captures Automation session configuration', async () => {
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }));
			const sessionTemplate = {
				modelId: 'model',
				modelConfiguration: { thinkingLevel: 'low', futureOption: true },
				config: {
					providerOption: true,
				},
			};
			const automationConfiguration = {
				sessionTemplate,
				modelId: 'model',
				mode: ChatModeKind.Ask,
				permissionLevel: ChatPermissionLevel.Autopilot,
			};

			const sessionInfo = provider.createNewSession(workspace, CopilotCloudSessionType.id, { automationConfiguration });
			const session = provider.getSession(sessionInfo.sessionId);
			const captured = await provider.getAutomationSessionConfiguration(sessionInfo.sessionId);

			assert.deepStrictEqual({
				modelId: session?.modelId.get(),
				captured,
			}, {
				modelId: 'model',
				captured: {
					sessionTemplate: {
						modelId: 'model',
						modelConfiguration: sessionTemplate.modelConfiguration,
						config: {
							providerOption: true,
							mode: ChatModeKind.Ask,
							autoApprove: ChatPermissionLevel.Autopilot,
						},
					},
					modelId: 'model',
					mode: ChatModeKind.Ask,
					permissionLevel: ChatPermissionLevel.Autopilot,
				},
			});
		});

		for (const restored of [true, false]) {
			test(`sends ${restored ? 'restored' : 'explicitly selected'} Automation model options through the Cloud provider`, async () => {
				const sent: IChatSendRequestOptions[] = [];
				const writes: Record<string, unknown>[] = [];
				const provider = createProviderForSendTests(disposables, model, async (_resource, _message, options) => {
					if (options) {
						sent.push(options);
					}
					return { kind: 'rejected', reason: 'Test request captured' };
				}, {
					languageModelsService: {
						lookupLanguageModel: () => ({
							extension: new ExtensionIdentifier('test'),
							id: 'model', name: 'Model', vendor: 'test', family: 'test', version: '1',
							maxInputTokens: 1, maxOutputTokens: 1, isDefaultForLocation: {},
							configurationSchema: {
								type: 'object',
								properties: { thinkingLevel: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' } },
							},
						}),
						getModelConfiguration: () => ({ thinkingLevel: 'high' }),
						setModelConfiguration: async (_modelId, values) => { writes.push(values); },
					},
				});
				const session = provider.createNewSession(workspace, CopilotCloudSessionType.id, {
					automationConfiguration: {
						sessionTemplate: { modelId: 'model', ...(restored ? { modelConfiguration: { thinkingLevel: 'low' } } : {}) },
					},
				});
				if (!restored) {
					await provider.getAutomationModelConfiguration(session.sessionId)!.setModelConfiguration('model', { thinkingLevel: 'low' });
				}
				const captured = await provider.getAutomationSessionConfiguration(session.sessionId);
				await assert.rejects(provider.sendRequest(session.sessionId, session.mainChat.get().resource, { query: 'hello' }), /Test request captured/);

				assert.deepStrictEqual({
					captured: captured?.sessionTemplate?.modelConfiguration,
					sent: sent.map(options => ({ model: options.userSelectedModelId, configuration: options.userSelectedModelConfiguration })),
					writes,
				}, {
					captured: { thinkingLevel: 'low' },
					sent: [{ model: 'model', configuration: { thinkingLevel: 'low' } }],
					writes: restored ? [] : [{ thinkingLevel: 'low' }],
				});
			});
		}

		test('forwards a Cloud new-session response observer without changing its identity', async () => {
			const observers: IChatSendRequestOptions['onDidCreateResponse'][] = [];
			const onDidCreateResponse: NonNullable<IChatSendRequestOptions['onDidCreateResponse']> = () => { };
			const provider = createProviderForSendTests(disposables, model, async (_resource, _message, options) => {
				observers.push(options?.onDidCreateResponse);
				return { kind: 'rejected', reason: 'Observer captured' };
			});
			const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
			const chat = await provider.createNewChat(session.sessionId);
			await assert.rejects(provider.sendRequest(session.sessionId, chat.resource, { query: 'test', onDidCreateResponse }), /Observer captured/);
			assert.deepStrictEqual(observers, [onDidCreateResponse]);
		});

		test('rejects Automation model configuration without a model before creating a Cloud draft', () => {
			const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'rejected', reason: 'Unexpected send' }));
			assert.throws(() => provider.createNewSession(workspace, CopilotCloudSessionType.id, {
				automationConfiguration: { sessionTemplate: { modelConfiguration: { thinkingLevel: 'low' } } },
			}), /model configuration requires a model identifier/);
			assert.deepStrictEqual(provider.getSessions(), []);
		});

		test('rejects unsupported canonical custom agents on cloud drafts', () => {
			const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'rejected', reason: 'Unexpected send' }));
			assert.throws(() => provider.createNewSession(
				URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repo/HEAD' }),
				CopilotCloudSessionType.id,
				{ automationConfiguration: { sessionTemplate: { agent: { uri: 'file:///agents/reviewer.agent.md' } } } },
			), /does not support custom agents/);
		});

	});

	function waitForSessionAdded(provider: CopilotChatSessionsProvider): Promise<void> {
		return new Promise<void>(resolve => {
			const disposable = provider.onDidChangeSessions(e => {
				if (e.added.length > 0) {
					disposable.dispose();
					resolve();
				}
			});
		});
	}

	test('cloud session that commits a new resource resolves without timing out and restores provenance', async () => {
		// Regression: a cloud session commits a different resource mid-request
		// (untitled → /task/<id>), so _sendFirstChat must wait for the committed
		// resource, not the untitled one, otherwise it times out and removes the session.
		const committedResource = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/task/${generateUuid()}` });
		const onDidCommit = disposables.add(new Emitter<{ original: URI; committed: URI }>());

		let resolveComplete!: () => void;
		const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
		const responseCreatedPromise = new Promise<IChatResponseModel>(() => { /* never resolves */ });

		const storageService = disposables.add(new TestStorageService());
		const provider = createProviderForSendTests(disposables, model, async () => ({
			kind: 'sent' as const,
			data: {
				responseCompletePromise,
				responseCreatedPromise,
				agent: new class extends mock<IChatAgentData>() { }(),
			} as IChatSendRequestData,
		}), { onDidCommitSession: onDidCommit.event, storageService });

		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repo/HEAD' });
		const createdBySession = {
			session: URI.parse('agent-host-copilotcli:/parent'),
			chat: URI.parse('agent-host-chat:/parent/default'),
			turnId: 'turn-1',
		};
		const session = provider.createNewSession(workspace, CopilotCloudSessionType.id, { createdBySession });
		assert.deepStrictEqual(session.createdBySession?.get(), createdBySession);

		const removals: string[] = [];
		disposables.add(provider.onDidChangeSessions(e => {
			for (const r of e.removed) {
				removals.push(r.resource.toString());
			}
		}));

		const added = waitForSessionAdded(provider);
		const chat = await provider.createNewChat(session.sessionId);
		const untitledResource = chat.resource;
		const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: 'hi' });
		await added;

		// The response completes early (cloud returns a confirmation) before the
		// commit lands — this must not cause the wait to give up.
		resolveComplete();

		model.addSession(createMockAgentSession(committedResource, { providerType: AgentSessionProviders.Cloud }));

		// _waitForCommittedSession subscribes to onDidCommitSession only after
		// sendRequest resolves, so re-fire until the send settles to avoid the race.
		let sendSettled = false;
		const fireCommitUntilSettled = async () => {
			while (!sendSettled) {
				onDidCommit.fire({ original: untitledResource, committed: committedResource });
				await timeout(5);
			}
		};
		const commitLoop = fireCommitUntilSettled();
		let committedSession!: ISession;

		try {
			committedSession = await sendPromise;
		} finally {
			sendSettled = true;
			await commitLoop;
		}

		assert.deepStrictEqual({
			createdBySession: serializeCreationReference(committedSession.createdBySession?.get()),
			untitledRemoved: removals.includes(untitledResource.toString()),
		}, {
			createdBySession: serializeCreationReference(createdBySession),
			untitledRemoved: false,
		});

		const restoredProvider = createProviderForSendTests(disposables, model, async () => ({ kind: 'rejected', reason: 'Unexpected send' }), { storageService });
		const restoredSession = restoredProvider.getSessions().find(candidate => candidate.resource.toString() === committedResource.toString());
		assert.deepStrictEqual(serializeCreationReference(restoredSession?.createdBySession?.get()), serializeCreationReference(createdBySession));
	});
	suite('cloud sandbox send path', () => {
		// A browsed GitHub workspace root carries a ref (`/<owner>/<repo>/HEAD`), which is what
		// `repoNwo` has to strip back down to `owner/repo`.
		const repoWorkspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/osortega/simple-server/HEAD' });

		test('seeds cloud approvals from each default configuration value', () => {
			const values = [ChatDefaultPermissionLevel.Manual, ChatDefaultPermissionLevel.Assisted, ChatDefaultPermissionLevel.AllowAll, undefined].map(approvals => {
				const configuration = new TestConfigurationService({ [ChatConfiguration.DefaultConfiguration]: { approvals } });
				disposables.add(configuration.onDidChangeConfigurationEmitter);
				return createCloudSandboxSessionConfig(configuration).values.approvalMode;
			});
			assert.deepStrictEqual(values, ['manual', 'assisted', 'allow-all', 'assisted']);
		});

		test('enterprise policy clamps an Allow All default to Manual', () => {
			const configuration = new class extends TestConfigurationService {
				override inspect<T>(key: string) {
					const inspected = super.inspect<T>(key);
					return { ...inspected, policyValue: key === ChatConfiguration.GlobalAutoApprove ? inspected.value : undefined };
				}
			}({
				[ChatConfiguration.DefaultConfiguration]: { approvals: ChatDefaultPermissionLevel.AllowAll },
				[ChatConfiguration.GlobalAutoApprove]: false,
			});
			disposables.add(configuration.onDidChangeConfigurationEmitter);
			const config = createCloudSandboxSessionConfig(configuration);
			assert.deepStrictEqual({ values: config.values, approvals: config.schema.properties.approvalMode.enum }, {
				values: { mode: 'interactive', approvalMode: 'manual' }, approvals: ['manual'],
			});
		});

		function createSandboxProvider(opts: { enabled?: boolean; remoteHostsEnabled?: boolean; provision?: CloudSandboxAgentHostContribution['provisionSession']; prepare?: CloudSandboxAgentHostContribution['prepareSession']; trackProgress?: CloudSandboxAgentHostContribution['trackSessionCreationProgress']; getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined; providerMode?: 'default' | 'sandbox'; onGetChatSession?: () => void; updateChatSessionMetadata?: IChatSessionsService['updateChatSessionMetadata']; sandboxModels?: readonly ILanguageModelChatMetadataAndIdentifier[]; storageService?: IStorageService } = {}) {
			const configurationService = new TestConfigurationService();
			disposables.add(configurationService.onDidChangeConfigurationEmitter);
			configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, opts.enabled ?? true);
			configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, opts.remoteHostsEnabled ?? true);

			const cloudSends: string[] = [];
			const notifications: string[] = [];
			const chatContentProviders: IChatSessionContentProvider[] = [];
			const provider = createProviderForSendTests(disposables, model, async (_resource, message) => {
				cloudSends.push(message);
				// Never settles: these tests only assert which path the send took.
				return new Promise<ChatSendResult>(() => { });
			}, { configurationService, getOptionGroups: opts.getOptionGroups, notifications, providerMode: opts.providerMode, onGetChatSession: opts.onGetChatSession, updateChatSessionMetadata: opts.updateChatSessionMetadata, chatContentProviders, sandboxModels: opts.sandboxModels, storageService: opts.storageService });

			const provisionRequests: ICloudSandboxCreateSessionRequest[] = [];
			provider.sandboxContribution = {
				provisionSession: async (request, token, progress) => {
					provisionRequests.push(request);
					if (opts.provision) {
						return opts.provision(request, token, progress);
					}
					throw new Error('provisioning failed');
				},
				prepareSession: opts.prepare ?? (async () => { }),
				trackSessionCreationProgress: opts.trackProgress ?? (() => toDisposable(() => { })),
			};
			return { provider, provisionRequests, cloudSends, notifications, configurationService, chatContentProviders };
		}

		/**
		 * A provisioned session whose provider immediately commits the send.
		 *
		 * `sandboxModels` is a function so a test can model a catalog that is still arriving:
		 * resolution reports `pending` until it yields the model, mirroring an agent host that has
		 * connected but not yet published.
		 */
		function provisionedSession(sendRequest?: CloudSandboxSessionsProvider['sendRequest'], sandboxModels: () => readonly ILanguageModelChatMetadataAndIdentifier[] = () => []): ICloudSandboxProvisionedSession & { published: string[]; renames: { sessionId: string; title: string }[]; modelSelections: { modelId: string; source: ChatModelSource }[]; modelsChanged: Emitter<void>; configurations: Record<string, unknown>[]; modelConfigurations: Record<string, unknown>[] } {
			const title = observableValue('title', 'main');
			const committed = upcastPartial<ISession>({
				sessionId: 'agenthost:sess-new',
				resource: URI.parse('agent-host-copilot:/sess-new'),
				title,
			});
			const sandboxSession = upcastPartial<ISession>({
				sessionId: 'agenthost:sess-new',
				resource: URI.parse('agent-host-copilot:/sess-new'),
				title,
				mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/sess-new') })),
			});
			const published: string[] = [];
			const renames: { sessionId: string; title: string }[] = [];
			const modelSelections: { modelId: string; source: ChatModelSource }[] = [];
			const modelsChanged = disposables.add(new Emitter<void>());
			const configurations: Record<string, unknown>[] = [];
			const modelConfigurations: Record<string, unknown>[] = [];
			const config = createCloudSandboxSessionConfig(new TestConfigurationService());
			for (const property of Object.values(config.schema.properties)) {
				property.sessionMutable = true;
			}
			return {
				taskId: 'task-new',
				sessionId: 'sess-new',
				environmentId: 'env-new',
				session: sandboxSession,
				published,
				renames,
				modelSelections,
				modelsChanged,
				configurations,
				modelConfigurations,
				provider: upcastPartial<CloudSandboxSessionsProvider>({
					sendRequest: sendRequest ?? (async () => committed),
					setInitialSessionTitle: async (sessionId, newTitle) => {
						renames.push({ sessionId, title: newTitle });
						title.set(newTitle, undefined);
					},
					publishWithheldSession: (rawId: string) => { published.push(rawId); },
					onDidChangeModels: modelsChanged.event,
					onDidChangeSessionConfig: Event.None,
					getSessionConfig: () => config,
					resolveInitialSessionConfig: async (_sessionId, values) => {
						for (const [key, value] of Object.entries(values)) {
							validateSessionConfigWrite(config.schema, config.values, key, value, true);
						}
						configurations.push(values);
						return values;
					},
					getAutomationModelConfiguration: () => upcastPartial<AutomationModelConfiguration>({
						setModelConfiguration: async (_id, values) => { modelConfigurations.push(values); },
					}),
					getModelsSnapshot: (_sessionId: string, desiredModelId?: string) => {
						const models = sandboxModels();
						const model = models.find(m => m.identifier === desiredModelId);
						return {
							models,
							desiredModelResolution: !desiredModelId
								? { kind: 'notRequested' as const }
								: model
									? { kind: 'available' as const, model }
									// An empty catalog is "not yet"; a populated one that lacks the
									// model is conclusive.
									: models.length === 0
										? { kind: 'pending' as const, identifier: desiredModelId }
										: { kind: 'unavailable' as const, identifier: desiredModelId },
							modelTarget: 'agent-host-copilot',
						};
					},
					setModel: (_sessionId: string, _chatResource: URI, modelId: string, source: ChatModelSource) => { modelSelections.push({ modelId, source }); },
				}) as CloudSandboxSessionsProvider,
			};
		}

		/** A model as the sandbox advertises it: vendor-prefixed identifier, bare backend id. */
		function sandboxModel(rawId: string): ILanguageModelChatMetadataAndIdentifier {
			return upcastPartial<ILanguageModelChatMetadataAndIdentifier>({
				identifier: `agent-host-copilot:${rawId}`,
				metadata: upcastPartial<ILanguageModelChatMetadata>({ id: rawId, name: rawId }),
			});
		}

		/** The `models` option group a cloud composer picks from, whose ids are its own. */
		function cloudModelOptionGroup(itemId: string, backendModelId: string): IChatSessionProviderOptionGroup[] {
			return [{
				id: 'models',
				name: 'Models',
				items: [{ id: itemId, name: backendModelId, modelMetadata: { id: backendModelId, name: backendModelId } }],
			}];
		}

		for (const providerMode of ['default', 'sandbox'] as const) {
			const sessionTypeId = providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id;

			test(`${providerMode} creates a repo-less quick-chat draft without provisioning a sandbox`, () => {
				const { provider, provisionRequests } = createSandboxProvider({ providerMode });
				const draft = provider.createQuickChat(sessionTypeId);
				const session = provider.getSession(draft.sessionId);
				assert.ok(session instanceof RemoteNewSession);

				assert.deepStrictEqual({
					supportsQuickChats: provider.supportsQuickChats,
					sessionType: draft.sessionType,
					quickChat: draft.isQuickChat?.get(),
					workspace: draft.workspace.get(),
					chatWorkspace: draft.mainChat.get().workspace.get(),
					disabled: session.disabled,
					repository: session.repoNwo,
					options: [...session.selectedOptions],
					provisionRequests,
					listed: provider.getSessions(),
				}, {
					supportsQuickChats: true,
					sessionType: sessionTypeId,
					quickChat: true,
					workspace: undefined,
					chatWorkspace: undefined,
					disabled: false,
					repository: undefined,
					options: [],
					provisionRequests: [],
					listed: [],
				});
			});

			test(`${providerMode} sends a repo-less quick chat to a sandbox without repository preparation`, async () => {
				const cloudModel = sandboxModel('cloud-model');
				const sent: { resource: string; options: ISendRequestOptions }[] = [];
				const metadataUpdates: { resource: string; metadata: Record<string, unknown> }[] = [];
				const provisioned = provisionedSession(async (_sessionId, resource, options) => {
					sent.push({ resource: resource.toString(), options });
					return provisioned.session;
				}, () => [cloudModel]);
				const { provider, provisionRequests, cloudSends } = createSandboxProvider({
					providerMode,
					provision: async () => provisioned,
					prepare: async () => assert.fail('Repo-less chats must not prepare a repository'),
					trackProgress: () => assert.fail('Repo-less chats must not track repository cloning'),
					onGetChatSession: () => assert.fail('Repo-less chats must not load an extension Cloud session'),
					updateChatSessionMetadata: (resource, metadata) => {
						metadataUpdates.push({ resource: resource.toString(), metadata });
						return true;
					},
					sandboxModels: [cloudModel],
				});
				const draft = provider.createQuickChat(sessionTypeId);
				const chat = await provider.createNewChat(draft.sessionId);
				provider.setModel(draft.sessionId, chat.resource, cloudModel.identifier, ChatModelSource.Chosen);
				await provider.setSessionConfigValue(draft.sessionId, 'mode', 'plan');
				const replacements: { from: string; to: string; quickChat: boolean | undefined }[] = [];
				disposables.add(provider.onDidReplaceSession(({ from, to }) => replacements.push({ from: from.sessionId, to: to.sessionId, quickChat: from.isQuickChat?.get() })));

				const committed = await provider.sendRequest(draft.sessionId, chat.resource, { query: 'hello' });

				assert.deepStrictEqual({
					committed: committed.sessionId,
					provisionRequests,
					cloudSends,
					sent,
					metadataUpdates,
					modelSelections: provisioned.modelSelections,
					published: provisioned.published,
					replacements,
				}, {
					committed: provisioned.session.sessionId,
					provisionRequests: [{ prompt: 'hello' }],
					cloudSends: [],
					sent: [{ resource: provisioned.session.mainChat.get().resource.toString(), options: { query: 'hello', sessionConfig: { mode: 'plan', approvalMode: 'assisted' } } }],
					metadataUpdates: [{ resource: provisioned.session.mainChat.get().resource.toString(), metadata: { workspaceless: true } }],
					modelSelections: [{ modelId: cloudModel.identifier, source: ChatModelSource.CarriedOver }],
					published: ['sess-new'],
					replacements: [{ from: draft.sessionId, to: provisioned.session.sessionId, quickChat: true }],
				});
			});

			for (const [setting, disabledValue] of [[CloudSandboxEnabledSettingId, false], [RemoteAgentHostsEnabledSettingId, false], [ChatAIDisabledSettingId, true]] as const) {
				test(`${providerMode} withdraws quick chats and never falls back to legacy Cloud when ${setting} changes`, async () => {
					const { provider, provisionRequests, cloudSends, configurationService } = createSandboxProvider({
						providerMode,
						onGetChatSession: () => assert.fail('Repo-less chats must not fall back to an extension Cloud session'),
					});
					const draft = provider.createQuickChat(sessionTypeId);
					const availability = {
						sessionTypes: [provider.supportsQuickChats],
						capabilities: [provider.supportsQuickChats],
					};
					disposables.add(provider.onDidChangeSessionTypes(() => availability.sessionTypes.push(provider.supportsQuickChats)));
					disposables.add(provider.onDidChangeCapabilities(() => availability.capabilities.push(provider.supportsQuickChats)));
					await configurationService.setUserConfiguration(setting, disabledValue);
					configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
						affectsConfiguration: key => key === setting,
					}));

					assert.throws(() => provider.createQuickChat(sessionTypeId), /not enabled/);
					const chat = await provider.createNewChat(draft.sessionId);
					await assert.rejects(provider.sendRequest(draft.sessionId, chat.resource, { query: 'hello' }), /no longer available/);

					await configurationService.setUserConfiguration(setting, !disabledValue);
					configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
						affectsConfiguration: key => key === setting,
					}));
					assert.deepStrictEqual({ availability, provisionRequests, cloudSends }, {
						availability: {
							sessionTypes: [true, false, true],
							capabilities: [true, false, true],
						},
						provisionRequests: [],
						cloudSends: [],
					});
				});
			}

			test(`${providerMode} does not send a repo-less prompt if the sandbox cannot retain its workspace-less metadata`, async () => {
				const provisioned = provisionedSession(async () => assert.fail('The prompt must not be sent'));
				const { provider, cloudSends } = createSandboxProvider({
					providerMode,
					provision: async () => provisioned,
					updateChatSessionMetadata: () => false,
				});
				const draft = provider.createQuickChat(sessionTypeId);

				await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'hello' }), /Your prompt was not sent/);

				assert.deepStrictEqual({ published: provisioned.published, cloudSends, listed: provider.getSessions() }, {
					published: ['sess-new'], cloudSends: [], listed: [],
				});
			});

			test(`${providerMode} creation uses initial title synchronization instead of an explicit rename`, async () => {
				const sent: string[] = [];
				const provisioned = provisionedSession(async (_sessionId, _resource, options) => {
					sent.push(options.query);
					return provisioned.session;
				});
				provisioned.provider.renameSession = async () => { throw new CloudSandboxRequestError(500, 'Explicit task rename failed'); };
				const { provider } = createSandboxProvider({ providerMode, provision: async () => provisioned });
				const draft = provider.createNewSession(repoWorkspace, providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id);

				const committed = await provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'First prompt' });

				assert.deepStrictEqual({
					renames: provisioned.renames,
					sent,
					title: committed.title.get(),
					published: provisioned.published,
					placeholders: provider.getSessions(),
				}, {
					renames: [{ sessionId: 'agenthost:sess-new', title: 'First prompt' }],
					sent: ['First prompt'],
					title: 'First prompt',
					published: ['sess-new'],
					placeholders: [],
				});
			});

			test(`${providerMode} creation does not dispatch after a fatal initial title failure`, async () => {
				let sent = false;
				const provisioned = provisionedSession(async () => {
					sent = true;
					return provisioned.session;
				});
				const error = new CloudSandboxRequestError(403, 'Task rename forbidden');
				provisioned.provider.setInitialSessionTitle = async () => { throw error; };
				const { provider } = createSandboxProvider({ providerMode, provision: async () => provisioned });
				const draft = provider.createNewSession(repoWorkspace, providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id);

				await assert.rejects(provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'First prompt' }), error);

				assert.deepStrictEqual({ sent, published: provisioned.published, placeholders: provider.getSessions() }, {
					sent: false, published: ['sess-new'], placeholders: [],
				});
			});

			for (const { name, options, expected } of [
				{ name: 'first prompt', options: { query: 'Fix the login bug' }, expected: 'Fix the login bug' },
				{ name: 'multiline prompt', options: { query: 'Fix the login bug\nHere are the details' }, expected: 'Fix the login bug' },
				{ name: 'surrounding whitespace', options: { query: '  Fix the login bug  \nHere are the details' }, expected: 'Fix the login bug' },
				{ name: 'long prompt', options: { query: 'x'.repeat(101) }, expected: 'x'.repeat(100) },
				{ name: 'explicit title', options: { query: 'Fix the login bug', title: 'Login fix' }, expected: 'Login fix' },
				{ name: 'empty first line', options: { query: '\nFix the login bug' }, expected: 'New Session' },
				{ name: 'whitespace first line', options: { query: '  \nFix the login bug' }, expected: 'New Session' },
			]) {
				test(`${providerMode} creation pushes the ${name} title to the sandbox before sending`, async () => {
					let titleAtSend: string | undefined;
					const provisioned = provisionedSession(async () => {
						titleAtSend = provisioned.session.title.get();
						return provisioned.session;
					});
					const { provider } = createSandboxProvider({ providerMode, provision: async () => provisioned });
					const sessionType = providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id;
					const draft = provider.createNewSession(repoWorkspace, sessionType);

					const committed = await provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, options);

					assert.deepStrictEqual({
						renames: provisioned.renames,
						titleAtSend,
						committedTitle: committed.title.get(),
					}, {
						renames: [{ sessionId: 'agenthost:sess-new', title: expected }],
						titleAtSend: expected,
						committedTitle: expected,
					});
				});
			}
			test(`${providerMode} sandbox startup uses draft preparation progress without registering a chat provider or changing its resource`, async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				const preparing = new DeferredPromise<void>();
				const tracking = new DeferredPromise<void>();
				const sending = new DeferredPromise<void>();
				const dispatched = new DeferredPromise<ISession>();
				let progress: IProgress<string> | undefined;
				let released = false;
				const provisioned = provisionedSession(async () => {
					await sending.complete();
					return dispatched.p;
				});
				const { provider, chatContentProviders } = createSandboxProvider({
					providerMode,
					provision: (_request, _token, progress) => {
						progress?.report('Connecting to cloud container');
						return pending.p;
					},
					prepare: () => preparing.p,
					trackProgress: (_environmentId, _repoNwo, reporter) => {
						progress = reporter;
						progress.report('Cloning repository (0%)');
						void tracking.complete();
						return toDisposable(() => { released = true; });
					},
				});
				const draft = provider.createNewSession(repoWorkspace, providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id);
				const activity = disposables.add(provider.startNewSessionRequest(draft.sessionId)!);
				const initial = draft.preparationProgress?.get()?.message;
				const before = draft.mainChat.get().resource;
				await provider.createNewChat(draft.sessionId);
				const updates: (string | undefined)[] = [];
				disposables.add(autorun(reader => updates.push(draft.preparationProgress?.read(reader)?.message)));
				const request = provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'fix it' });
				const resource = draft.mainChat.get().resource;
				await pending.complete(provisioned);
				await tracking.p;
				progress!.report('Cloning repository (58%)');
				const current = provider.getSessions()[0].preparationProgress?.get()?.message;
				await preparing.complete();
				await sending.p;
				await dispatched.complete(upcastPartial<ISession>({ sessionId: 'committed' }));
				await request;
				activity.dispose();
				progress!.report('Late progress');

				assert.deepStrictEqual({
					initial,
					updates,
					current,
					sameResource: extUri.isEqual(resource, before),
					contentProviders: chatContentProviders.length,
					released,
					final: draft.preparationProgress?.get(),
					active: draft.isNewSessionRequestInProgress?.get(),
				}, {
					initial: 'Setting up cloud container',
					updates: ['Setting up cloud container', 'Connecting to cloud container', 'Cloning repository (0%)', 'Cloning repository (58%)', 'Starting Copilot agent', undefined],
					current: 'Cloning repository (58%)',
					sameResource: true,
					contentProviders: 0,
					released: true,
					final: undefined,
					active: false,
				});
			});

			test(`${providerMode} sandbox preparation can be canceled from the existing progress surface`, async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				const { provider } = createSandboxProvider({ providerMode, provision: () => pending.p });
				const draft = provider.createNewSession(repoWorkspace, providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id);
				const activity = disposables.add(provider.startNewSessionRequest(draft.sessionId)!);
				const request = provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'fix it' });
				const rejected = assert.rejects(request, /Canceled/);
				draft.preparationProgress?.get()?.cancel();
				await rejected;
				await pending.complete(provisionedSession());
				activity.dispose();
				assert.deepStrictEqual({
					progress: draft.preparationProgress?.get(),
					active: draft.isNewSessionRequestInProgress?.get(),
					listed: provider.getSessions(),
				}, { progress: undefined, active: false, listed: [] });
			});

			test(`${providerMode} rejected overlapping request does not clear the active sandbox preparation`, async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				let token: CancellationToken | undefined;
				let progress: IProgress<string> | undefined;
				const { provider } = createSandboxProvider({
					providerMode,
					provision: (_request, requestToken, reporter) => {
						token = requestToken;
						progress = reporter;
						return pending.p;
					},
				});
				const draft = provider.createNewSession(repoWorkspace, providerMode === 'sandbox' ? CopilotSandboxSessionType.id : CopilotCloudSessionType.id);
				const firstActivity = disposables.add(provider.startNewSessionRequest(draft.sessionId)!);
				const request = provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'fix it' });
				const secondActivity = disposables.add(provider.startNewSessionRequest(draft.sessionId)!);
				await assert.rejects(provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'duplicate' }), /already being started/);
				secondActivity.dispose();
				secondActivity.dispose();
				progress?.report('Connecting to cloud container');
				const afterRejectedRequest = {
					message: draft.preparationProgress?.get()?.message,
					active: draft.isNewSessionRequestInProgress?.get(),
					cancelled: token?.isCancellationRequested,
				};
				firstActivity.dispose();
				const stillSending = draft.isNewSessionRequestInProgress?.get();
				await pending.complete(provisionedSession());
				await request;
				assert.deepStrictEqual({
					afterRejectedRequest,
					stillSending,
					progress: draft.preparationProgress?.get(),
					active: draft.isNewSessionRequestInProgress?.get(),
				}, {
					afterRejectedRequest: { message: 'Connecting to cloud container', active: true, cancelled: false },
					stillSending: true,
					progress: undefined,
					active: false,
				});
			});
		}

		test('does not start sandbox preparation when either required setting is disabled', () => {
			const results = [];
			for (const [enabled, remoteHostsEnabled] of [[false, true], [true, false]] as const) {
				const { provider } = createSandboxProvider({ enabled, remoteHostsEnabled });
				const draft = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
				results.push({
					activity: provider.startNewSessionRequest(draft.sessionId),
					progress: draft.preparationProgress?.get(),
					active: draft.isNewSessionRequestInProgress?.get(),
				});
			}
			assert.deepStrictEqual(results, [{ activity: undefined, progress: undefined, active: false }, { activity: undefined, progress: undefined, active: false }]);
		});

		for (const enabled of [false, true]) {
			for (const rememberedChoice of [false, true]) {
				test(`uses the configured Cloud backend (${enabled}) instead of the old checkbox preference (${rememberedChoice})`, async () => {
					const storageService = disposables.add(new TestStorageService());
					storageService.store('sessions.cloudSandboxPicker.useSandbox', rememberedChoice, StorageScope.PROFILE, StorageTarget.MACHINE);
					let extensionChatLoaded = false;
					const { provider, provisionRequests, cloudSends } = createSandboxProvider({
						enabled,
						storageService,
						provision: async () => provisionedSession(),
						onGetChatSession: () => { extensionChatLoaded = true; },
					});
					const draft = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
					const chat = await provider.createNewChat(draft.sessionId);
					const request = provider.sendRequest(draft.sessionId, chat.resource, { query: 'fix it' });
					if (enabled) {
						await request;
					} else {
						await timeout(0);
					}

					assert.deepStrictEqual({ provisionRequests, cloudSends, extensionChatLoaded }, {
						provisionRequests: enabled ? [{ repoNwo: 'osortega/simple-server', prompt: 'fix it' }] : [],
						cloudSends: enabled ? [] : ['fix it'],
						extensionChatLoaded: !enabled,
					});
				});
			}
		}

		for (const setting of [CloudSandboxEnabledSettingId, RemoteAgentHostsEnabledSettingId]) {
			test(`updates Cloud draft models and controls when ${setting} changes`, async () => {
				const cloudModel = sandboxModel('github-cloud');
				const { provider, configurationService } = createSandboxProvider({
					sandboxModels: [cloudModel],
					getOptionGroups: () => cloudModelOptionGroup('legacy-cloud', 'legacy-cloud'),
				});
				const draft = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
				const configurationChanges: string[] = [];
				let modelChanges = 0;
				disposables.add(provider.onDidChangeSessionConfig(sessionId => configurationChanges.push(sessionId)));
				disposables.add(provider.onDidChangeModels(() => modelChanges++));
				const snapshot = () => ({
					models: provider.getModelsSnapshot(draft.sessionId).models.map(model => model.metadata.id),
					creationModels: provider.getModelsSnapshotForCreation(repoWorkspace, CopilotCloudSessionType.id).models.map(model => model.metadata.id),
					config: provider.getSessionConfig(draft.sessionId)?.values,
					showAutoModel: provider.getModelPickerOptions(draft.sessionId).showAutoModel,
				});
				const initial = snapshot();
				await configurationService.setUserConfiguration(setting, false);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === setting,
				}));
				const disabled = snapshot();
				await configurationService.setUserConfiguration(setting, true);
				configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
					affectsConfiguration: key => key === setting,
				}));
				const cloud = {
					models: ['github-cloud'],
					creationModels: ['github-cloud'],
					config: { mode: 'interactive', approvalMode: 'assisted' },
					showAutoModel: false,
				};

				assert.deepStrictEqual({ initial, disabled, restored: snapshot(), configurationChanges, modelChanges }, {
					initial: cloud,
					disabled: { models: ['legacy-cloud'], creationModels: ['legacy-cloud'], config: undefined, showAutoModel: true },
					restored: cloud,
					configurationChanges: [draft.sessionId, draft.sessionId],
					modelChanges: 2,
				});
			});
		}

		test('does not fall back to the legacy backend when GitHub Cloud has no repository', async () => {
			const { provider, provisionRequests, cloudSends } = createSandboxProvider();
			const draft = provider.createNewSession(repoWorkspace.with({ path: '/' }), CopilotCloudSessionType.id);

			await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' }), /choose a repository/);

			assert.deepStrictEqual({ provisionRequests, cloudSends }, { provisionRequests: [], cloudSends: [] });
		});

		test('does not start GitHub Cloud when AI features are disabled after draft creation', async () => {
			const { provider, provisionRequests, cloudSends, configurationService } = createSandboxProvider();
			const draft = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			await configurationService.setUserConfiguration(ChatAIDisabledSettingId, true);

			await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' }), /no longer available/);

			assert.deepStrictEqual({ provisionRequests, cloudSends }, { provisionRequests: [], cloudSends: [] });
		});

		suite('explicit browser sandbox creation', () => {
			test('waits for cloud-service models even when the host already published a smaller catalog', async () => {
				const cloudModel = { ...sandboxModel('claude-sonnet-4.6'), identifier: 'cloud-catalog:claude-sonnet-4.6' };
				const models = [sandboxModel('auto')];
				const provisioned = provisionedSession(undefined, () => models);
				const { provider, notifications } = createSandboxProvider({ providerMode: 'sandbox', sandboxModels: [cloudModel], provision: async () => provisioned });
				const waiting = new DeferredPromise<void>();
				const originalGetModels = provisioned.provider.getModelsSnapshot;
				provisioned.provider.getModelsSnapshot = (sessionId, desired) => {
					const result = originalGetModels(sessionId, desired);
					if (desired && result.desiredModelResolution.kind === 'unavailable') {
						waiting.complete();
					}
					return result;
				};
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				provider.setModel(draft.sessionId, draft.resource, cloudModel.identifier, ChatModelSource.Chosen);
				const sent = provider.sendRequest(draft.sessionId, draft.resource, { query: 'hello' });
				await waiting.p;
				models.push(sandboxModel('claude-sonnet-4.6'));
				provisioned.modelsChanged.fire();
				await sent;
				assert.deepStrictEqual({ models: provisioned.modelSelections, notifications }, {
					models: [{ modelId: 'agent-host-copilot:claude-sonnet-4.6', source: ChatModelSource.CarriedOver }], notifications: [],
				});
			});
			test('uses cloud models and sends mode, approvals, and reasoning before the first turn', async () => {
				const schema = { type: 'object' as const, properties: { reasoningEffort: { type: 'string' as const, enum: ['low', 'high'] } } };
				const cloudModel = { ...sandboxModel('new-model'), identifier: 'cloud-catalog:new-model', metadata: { ...sandboxModel('new-model').metadata, configurationSchema: schema } };
				const hostModel = { ...sandboxModel('new-model'), metadata: { ...sandboxModel('new-model').metadata, configurationSchema: schema } };
				let sentWith: object | undefined;
				let prepared = false;
				const provisioned = provisionedSession(async (_sessionId, _chatResource, options) => {
					sentWith = { prepared, title: provisioned.session.title.get(), sessionConfig: options.sessionConfig, configurations: [...provisioned.configurations], models: [...provisioned.modelSelections], modelConfigurations: [...provisioned.modelConfigurations] };
					return provisioned.session;
				}, () => [hostModel]);
				const { provider } = createSandboxProvider({ providerMode: 'sandbox', sandboxModels: [cloudModel], provision: async () => provisioned, prepare: async () => { prepared = true; } });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				provider.setModel(draft.sessionId, draft.resource, cloudModel.identifier, ChatModelSource.Chosen);
				await provider.getAutomationModelConfiguration(draft.sessionId)!.setModelConfiguration(cloudModel.identifier, { reasoningEffort: 'high' });
				await provider.setSessionConfigValue(draft.sessionId, 'mode', 'plan');
				await provider.setSessionConfigValue(draft.sessionId, 'approvalMode', 'manual');
				await provider.sendRequest(draft.sessionId, draft.resource, { query: 'make a plan' });
				assert.deepStrictEqual(sentWith, {
					prepared: true,
					title: 'make a plan',
					sessionConfig: { mode: 'plan', approvalMode: 'manual' },
					configurations: [{ mode: 'plan', approvalMode: 'manual' }],
					models: [{ modelId: hostModel.identifier, source: ChatModelSource.CarriedOver }],
					modelConfigurations: [{ reasoningEffort: 'high' }],
				});
			});

			test('does not send when the host rejects the requested configuration', async () => {
				let sent = false;
				const provisioned = provisionedSession(async () => { sent = true; return provisioned.session; });
				const hostConfig = provisioned.provider.getSessionConfig('agenthost:sess-new')!;
				hostConfig.schema.properties.mode.enum = ['interactive'];
				const { provider } = createSandboxProvider({ providerMode: 'sandbox', provision: async () => provisioned });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				await provider.setSessionConfigValue(draft.sessionId, 'mode', 'autopilot');
				await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'work' }), /does not offer/);
				assert.deepStrictEqual({ sent, published: provisioned.published }, { sent: false, published: ['sess-new'] });
			});
			test('creates a repository-only draft without allocating or loading an extension chat', async () => {
				model.addSession(createMockAgentSession(URI.parse('copilot-cloud-agent:/existing-cloud'), { providerType: AgentSessionProviders.Cloud }));
				model.addSession(createMockAgentSession(URI.parse('copilotcli:/existing-cli'), { providerType: AgentSessionProviders.Background }));
				const { provider, provisionRequests, cloudSends } = createSandboxProvider({
					providerMode: 'sandbox',
					getOptionGroups: () => cloudModelOptionGroup('cloud-only-model', 'cloud-only-model'),
					onGetChatSession: () => { throw new Error('Copilot Chat extension is not installed'); },
				});
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				const chat = await provider.createNewChat(draft.sessionId);

				assert.deepStrictEqual({
					providerId: draft.providerId,
					sessionType: draft.sessionType,
					harnesses: provider.sessionTypes.map(type => type.label),
					localWorkspace: provider.resolveWorkspace(URI.file('/repo')),
					localTypes: provider.getSessionTypes(URI.file('/repo')),
					localBrowsing: provider.supportsLocalWorkspaces,
					browseActions: provider.browseActions.map(action => ({ providerId: action.providerId, group: action.group })),
					models: provider.getModelsSnapshot(draft.sessionId).models,
					mainChat: chat.resource.toString() === draft.mainChat.get().resource.toString(),
					listed: provider.getSessions(),
					provisionRequests,
					cloudSends,
				}, {
					providerId: CLOUD_SANDBOX_CREATION_PROVIDER_ID,
					sessionType: CopilotSandboxSessionType.id,
					harnesses: ['Copilot'],
					localWorkspace: undefined,
					localTypes: [],
					localBrowsing: false,
					browseActions: [{ providerId: CLOUD_SANDBOX_CREATION_PROVIDER_ID, group: SESSION_WORKSPACE_GROUP_GITHUB }],
					models: [],
					mainChat: true,
					listed: [],
					provisionRequests: [],
					cloudSends: [],
				});
			});

			test('sends the first prompt once to the provisioned main chat with the host default model', async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				const sent: { sessionId: string; resource: string; query: string }[] = [];
				const provisioned = provisionedSession(async (sessionId, resource, options) => {
					sent.push({ sessionId, resource: resource.toString(), query: options.query });
					return upcastPartial<ISession>({ sessionId, resource });
				});
				const { provider, provisionRequests, cloudSends } = createSandboxProvider({
					providerMode: 'sandbox',
					provision: () => pending.p,
					getOptionGroups: () => cloudModelOptionGroup('cloud-only-model', 'cloud-only-model'),
				});
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				const replacements: string[] = [];
				disposables.add(provider.onDidReplaceSession(event => replacements.push(event.to.sessionId)));
				const request = provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' });
				const repeatedRequest = assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'another prompt' }), /already being started/);
				const startup = draft.preparationProgress?.get()?.message;
				await pending.complete(provisioned);
				const committed = await request;
				await repeatedRequest;

				assert.deepStrictEqual({
					provisionRequests,
					sent,
					cloudSends,
					modelSelections: provisioned.modelSelections,
					published: provisioned.published,
					replacements,
					committed: committed.sessionId,
					placeholders: provider.getSessions(),
					startup,
					progressCleared: draft.preparationProgress?.get(),
				}, {
					provisionRequests: [{ repoNwo: 'osortega/simple-server', prompt: 'fix it' }],
					sent: [{ sessionId: 'agenthost:sess-new', resource: 'agent-host-copilot:/sess-new', query: 'fix it' }],
					cloudSends: [],
					modelSelections: [],
					published: ['sess-new'],
					replacements: ['agenthost:sess-new'],
					committed: 'agenthost:sess-new',
					placeholders: [],
					startup: 'Setting up cloud container',
					progressCleared: undefined,
				});
			});

			test('clears draft preparation progress when provisioning fails', async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				const { provider, chatContentProviders } = createSandboxProvider({ providerMode: 'sandbox', provision: () => pending.p });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				const request = provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' });
				const rejected = assert.rejects(request, /provisioning failed/);
				const initial = draft.preparationProgress?.get()?.message;
				await pending.error(new Error('provisioning failed'));
				await rejected;

				assert.deepStrictEqual({
					initial,
					progress: draft.preparationProgress?.get(),
					active: draft.isNewSessionRequestInProgress?.get(),
					contentProviders: chatContentProviders.length,
				}, { initial: 'Setting up cloud container', progress: undefined, active: false, contentProviders: 0 });
			});

			for (const [setting, disabledValue] of [[CloudSandboxEnabledSettingId, false], [RemoteAgentHostsEnabledSettingId, false], [ChatAIDisabledSettingId, true]] as const) {
				test(`does not fall back to Cloud when ${setting} disables a draft`, async () => {
					const { provider, provisionRequests, cloudSends, configurationService } = createSandboxProvider({ providerMode: 'sandbox' });
					const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
					configurationService.setUserConfiguration(setting, disabledValue);

					await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' }), /no longer available/);
					assert.deepStrictEqual({ provisionRequests, cloudSends, status: draft.status.get() }, { provisionRequests: [], cloudSends: [], status: SessionStatus.Untitled });
				});
			}

			test('rejects new drafts when sandbox creation is disabled', () => {
				const { provider } = createSandboxProvider({ providerMode: 'sandbox', enabled: false });
				assert.throws(() => provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id), /not enabled/);
			});

			test('preserves a provisioned session after the first send fails', async () => {
				const provisioned = provisionedSession(async () => { throw new Error('send failed'); });
				let released = false;
				const { provider, cloudSends } = createSandboxProvider({
					providerMode: 'sandbox',
					provision: async () => provisioned,
					trackProgress: () => toDisposable(() => { released = true; }),
				});
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' }), /send failed/);
				assert.deepStrictEqual({ published: provisioned.published, placeholders: provider.getSessions(), cloudSends, released }, { published: ['sess-new'], placeholders: [], cloudSends: [], released: true });
			});

			test('cleans up the placeholder after provisioning fails', async () => {
				const { provider, cloudSends } = createSandboxProvider({ providerMode: 'sandbox' });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' }), /provisioning failed/);
				assert.deepStrictEqual({ placeholders: provider.getSessions(), cloudSends }, { placeholders: [], cloudSends: [] });
			});

			test('does not send after a pending draft is disposed', async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				let sends = 0;
				const provisioned = provisionedSession(async () => {
					sends++;
					throw new Error('Must not send after cancellation');
				});
				const { provider } = createSandboxProvider({ providerMode: 'sandbox', provision: () => pending.p });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				const request = provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' });
				provider.deleteNewSession(draft.sessionId);
				const rejected = assert.rejects(request, /Canceled/);
				await pending.complete(provisioned);
				await rejected;
				assert.deepStrictEqual({ sends, placeholders: provider.getSessions(), progress: draft.preparationProgress?.get() }, { sends: 0, placeholders: [], progress: undefined });
			});
		});

		test('carries the composer model into the sandbox before the first turn', async () => {
			// Mission Control starts no run, so a session that has never run has no model to
			// restore: without this the first turn would silently take the agent host default.
			const provisioned = provisionedSession(undefined, () => [sandboxModel('claude-sonnet-4.6')]);
			const { provider, notifications } = createSandboxProvider({
				provision: async () => provisioned,
				getOptionGroups: () => cloudModelOptionGroup('synthetic-cloud-model', 'claude-sonnet-4.6'),
			});
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			provider.setModel(sessionInfo.sessionId, session.mainChat.get().resource, 'synthetic-cloud-model', ChatModelSource.Chosen);

			await provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });

			// The id crosses id spaces by backend model id, and arrives as carried over: the user
			// picked it for the composer, not for the session that replaced it. Applying the pick
			// is the silent case — nothing to tell the user about.
			assert.deepStrictEqual(
				{ selections: provisioned.modelSelections, notifications },
				{ selections: [{ modelId: 'agent-host-copilot:claude-sonnet-4.6', source: ChatModelSource.CarriedOver }], notifications: [] }
			);
		});

		test('waits for a sandbox catalog that is still arriving rather than sending without the model', async () => {
			// A freshly connected sandbox publishes its models asynchronously. Treating that empty
			// window as a miss would reinstate the very race this carries the model to avoid.
			let models: readonly ILanguageModelChatMetadataAndIdentifier[] = [];
			const provisioned = provisionedSession(undefined, () => models);
			const { provider } = createSandboxProvider({
				provision: async () => provisioned,
				getOptionGroups: () => cloudModelOptionGroup('synthetic-cloud-model', 'claude-sonnet-4.6'),
			});
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			provider.setModel(sessionInfo.sessionId, session.mainChat.get().resource, 'synthetic-cloud-model', ChatModelSource.Chosen);

			const sent = provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });
			// Publish only once the send is already waiting on the pending catalog.
			await timeout(0);
			const beforeCatalog = [...provisioned.modelSelections];
			models = [sandboxModel('claude-sonnet-4.6')];
			provisioned.modelsChanged.fire();
			await sent;

			assert.deepStrictEqual(
				{ beforeCatalog, afterCatalog: provisioned.modelSelections },
				{ beforeCatalog: [], afterCatalog: [{ modelId: 'agent-host-copilot:claude-sonnet-4.6', source: ChatModelSource.CarriedOver }] }
			);
		});

		test('tells the user when the sandbox does not advertise the model they picked', async () => {
			// Sending an unroutable id would fail the turn outright, so an unmatched pick still
			// lets the host choose — but an absent `Message.model` means "host decides", so
			// nothing else would report the substitution.
			const provisioned = provisionedSession(undefined, () => [sandboxModel('gpt-5')]);
			const { provider, notifications } = createSandboxProvider({
				provision: async () => provisioned,
				getOptionGroups: () => cloudModelOptionGroup('synthetic-cloud-model', 'claude-sonnet-4.6'),
			});
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			provider.setModel(sessionInfo.sessionId, session.mainChat.get().resource, 'synthetic-cloud-model', ChatModelSource.Chosen);

			await provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });

			assert.deepStrictEqual(
				{ selections: provisioned.modelSelections, notified: notifications.length, namesModel: notifications[0]?.includes('claude-sonnet-4.6') },
				{ selections: [], notified: 1, namesModel: true }
			);
		});

		test('tells the user when the catalog never arrives before the turn is dispatched', async () => {
			// The likeliest fallback in practice is a slow sandbox rather than a missing model, so
			// the timeout has to be as visible as a conclusive miss.
			const provisioned = provisionedSession(undefined, () => []);
			const { provider, notifications } = createSandboxProvider({
				provision: async () => provisioned,
				getOptionGroups: () => cloudModelOptionGroup('synthetic-cloud-model', 'claude-sonnet-4.6'),
			});
			provider.sandboxModelWaitMs = 1;
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			provider.setModel(sessionInfo.sessionId, session.mainChat.get().resource, 'synthetic-cloud-model', ChatModelSource.Chosen);

			await provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });

			assert.deepStrictEqual(
				{ selections: provisioned.modelSelections, notified: notifications.length, namesModel: notifications[0]?.includes('claude-sonnet-4.6') },
				{ selections: [], notified: 1, namesModel: true }
			);
		});

		test('provisions a sandbox and replaces the draft with the committed session', async () => {
			const { provider, provisionRequests, cloudSends } = createSandboxProvider({ provision: async () => provisionedSession() });
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;

			const replacements: { from: string; to: string }[] = [];
			disposables.add(provider.onDidReplaceSession(e => replacements.push({ from: e.from.sessionId, to: e.to.sessionId })));

			const committed = await provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });

			assert.deepStrictEqual({
				committed: committed.sessionId,
				// The repo comes from the workspace root; no baseRef, matching the Copilot app.
				provisionRequests,
				// The prompt must not also go through the server-run cloud agent.
				cloudSends,
				replacements: replacements.map(r => ({ from: r.from === sessionInfo.sessionId, to: r.to })),
			}, {
				committed: 'agenthost:sess-new',
				provisionRequests: [{ repoNwo: 'osortega/simple-server', prompt: 'fix it' }],
				cloudSends: [],
				replacements: [{ from: true, to: 'agenthost:sess-new' }],
			});
		});

		for (const setting of [CloudSandboxEnabledSettingId, RemoteAgentHostsEnabledSettingId]) {
			test(`uses the legacy backend when ${setting} is disabled after draft creation`, async () => {
				const { provider, provisionRequests, cloudSends, configurationService } = createSandboxProvider();
				const draft = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
				await configurationService.setUserConfiguration(setting, false);

				void provider.sendRequest(draft.sessionId, draft.mainChat.get().resource, { query: 'fix it' });
				await timeout(0);

				assert.deepStrictEqual({ provisionRequests, cloudSends }, { provisionRequests: [], cloudSends: ['fix it'] });
			});
		}

		test('reveals the withheld sandbox session as it retires the placeholder', async () => {
			const provisioned = provisionedSession();
			const { provider } = createSandboxProvider({ provision: async () => provisioned });
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;

			// The sandbox session is seeded before connecting so a discovery pass reconciles
			// against it, but it must stay out of the list until the placeholder goes away —
			// otherwise both rows show for as long as the sandbox takes to wake.
			await provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });

			assert.deepStrictEqual(provisioned.published, ['sess-new']);
		});

		test('a failed send still reveals the sandbox session it already provisioned', async () => {
			const provisioned = provisionedSession(async () => { throw new Error('send failed'); });
			const { provider } = createSandboxProvider({ provision: async () => provisioned });
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;

			await assert.rejects(() => provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' }));

			// The sandbox outlives the failed turn, so leaving it withheld would hide a session
			// that really exists.
			assert.deepStrictEqual(provisioned.published, ['sess-new']);
		});

		test('a failed provision removes the placeholder instead of stranding it in the list', async () => {
			const { provider } = createSandboxProvider();
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;

			const removed: string[] = [];
			disposables.add(provider.onDidChangeSessions(e => removed.push(...e.removed.map(s => s.sessionId))));

			await assert.rejects(() => provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' }));

			assert.deepStrictEqual({
				removed,
				stillListed: provider.getSessions().some(s => s.sessionId === sessionInfo.sessionId),
			}, {
				removed: [sessionInfo.sessionId],
				stillListed: false,
			});
		});
	});
});
