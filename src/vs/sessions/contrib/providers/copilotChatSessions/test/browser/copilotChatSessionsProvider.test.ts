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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileOperationError, FileOperationResult, IFileContent, IFileService, IFileStatWithPartialMetadata } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, ChatSendResult, IChatSendRequestData, IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionContentProvider, IChatSessionProviderOptionGroup, IChatSessionsService } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IChatResponseModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatAgentData } from '../../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { ISessionChangeEvent } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ChatModelSource, GITHUB_REMOTE_FILE_SCHEME, IChat, ISession, ISessionChangesSummary, ISessionFileChange, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SessionArtifactKind, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { CloudSandboxEnabledSettingId, type ICloudSandboxCreateSessionRequest } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CLOUD_SANDBOX_CREATION_PROVIDER_ID, CloudSandboxAgentHostContribution, type ICloudSandboxProvisionedSession } from '../../../remoteAgentHost/browser/cloudSandboxAgentHostContribution.js';
import { CloudSandboxSessionsProvider } from '../../../remoteAgentHost/browser/cloudSandboxSessionsProvider.js';
import { ChatModeKind, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { UNIFIED_WORKSPACE_PICKER_SETTING } from '../../../../chat/common/constants.js';
import { CopilotChatSessionsProvider, COPILOT_PROVIDER_ID, CopilotCloudSessionType, CopilotSandboxSessionType, RemoteNewSession } from '../../browser/copilotChatSessionsProvider.js';
import { ChatAIDisabledSettingId } from '../../../../../../platform/chat/common/chatSettings.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
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

	const configService = new TestConfigurationService();
	configService.setUserConfiguration(UNIFIED_WORKSPACE_PICKER_SETTING, opts?.consolidatedRemoteWorkspaces ?? false);

	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(ILogService, opts?.logService ?? new NullLogService());
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
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
	sandboxContribution: Pick<CloudSandboxAgentHostContribution, 'provisionSession'> | undefined;

	/** Only the timeout test lowers this; the rest keep the real budget so they cannot race it. */
	sandboxModelWaitMs: number | undefined;

	protected override _getCloudSandboxContribution(): Pick<CloudSandboxAgentHostContribution, 'provisionSession'> {
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
	opts?: { onDidCommitSession?: Event<{ original: URI; committed: URI }>; configurationService?: TestConfigurationService; getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined; notifications?: string[]; languageModelsService?: Partial<ILanguageModelsService>; providerMode?: 'default' | 'sandbox'; onGetChatSession?: () => void; chatContentProviders?: IChatSessionContentProvider[] },
): TestSandboxCopilotProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = opts?.configurationService ?? new TestConfigurationService();

	instantiationService.stub(ILogService, NullLogService);
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
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
		getOptionGroupsForSessionType: () => opts?.getOptionGroups?.(),
		updateSessionOptions: () => true,
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
	instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined, getModelConfiguration: () => undefined, setModelConfiguration: async () => { }, ...opts?.languageModelsService });
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
				changes: session.changes.read(reader),
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

		modelsState.optionGroups = [{
			id: 'models',
			name: 'Models',
			items: [{
				id: 'synthetic-cloud-model', name: 'Synthetic Cloud Model',
				modelMetadata: { id: 'synthetic-cloud-model', name: 'Synthetic Cloud Model', maxInputTokens: 100_000, maxOutputTokens: 20_000, maxContextWindowTokens: 100_000 },
			}],
		}];
		const afterResolve = provider.getModelsSnapshot(session.sessionId, 'removed-cloud-model');

		assert.deepStrictEqual({
			beforeResolve: { models: beforeResolve.models.map(model => model.identifier), desiredModelResolution: beforeResolve.desiredModelResolution, modelTarget: beforeResolve.modelTarget },
			afterResolve: { models: afterResolve.models.map(model => model.identifier), desiredModelResolution: afterResolve.desiredModelResolution, modelTarget: afterResolve.modelTarget },
			maxContextWindowTokens: afterResolve.models[0].metadata.maxContextWindowTokens,
		}, {
			beforeResolve: { models: [], desiredModelResolution: { kind: 'pending', identifier: 'removed-cloud-model' }, modelTarget: AgentSessionProviders.Cloud },
			afterResolve: { models: ['synthetic-cloud-model'], desiredModelResolution: { kind: 'unavailable', identifier: 'removed-cloud-model' }, modelTarget: AgentSessionProviders.Cloud },
			maxContextWindowTokens: 100_000,
		});
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

	test('cloud session that commits a new resource resolves without timing out', async () => {
		// Regression: a cloud session commits a different resource mid-request
		// (untitled → /task/<id>), so _sendFirstChat must wait for the committed
		// resource, not the untitled one, otherwise it times out and removes the session.
		const committedResource = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/task/${generateUuid()}` });
		const onDidCommit = disposables.add(new Emitter<{ original: URI; committed: URI }>());

		let resolveComplete!: () => void;
		const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
		const responseCreatedPromise = new Promise<IChatResponseModel>(() => { /* never resolves */ });

		const provider = createProviderForSendTests(disposables, model, async () => ({
			kind: 'sent' as const,
			data: {
				responseCompletePromise,
				responseCreatedPromise,
				agent: new class extends mock<IChatAgentData>() { }(),
			} as IChatSendRequestData,
		}), { onDidCommitSession: onDidCommit.event });

		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repo/HEAD' });
		const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);

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

		try {
			await assert.doesNotReject(sendPromise);
		} finally {
			sendSettled = true;
			await commitLoop;
		}

		assert.ok(
			!removals.includes(untitledResource.toString()),
			`Cloud session should not be removed after committing. Removals seen: [${removals.join(', ')}]`,
		);
	});
	suite('cloud sandbox send path', () => {
		// A browsed GitHub workspace root carries a ref (`/<owner>/<repo>/HEAD`), which is what
		// `repoNwo` has to strip back down to `owner/repo`.
		const repoWorkspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, authority: 'github', path: '/osortega/simple-server/HEAD' });

		function createSandboxProvider(opts: { enabled?: boolean; provision?: () => Promise<ICloudSandboxProvisionedSession>; getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined; providerMode?: 'default' | 'sandbox'; onGetChatSession?: () => void } = {}) {
			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, opts.enabled ?? true);
			configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);

			const cloudSends: string[] = [];
			const notifications: string[] = [];
			const chatContentProviders: IChatSessionContentProvider[] = [];
			const provider = createProviderForSendTests(disposables, model, async (_resource, message) => {
				cloudSends.push(message);
				// Never settles: these tests only assert which path the send took.
				return new Promise<ChatSendResult>(() => { });
			}, { configurationService, getOptionGroups: opts.getOptionGroups, notifications, providerMode: opts.providerMode, onGetChatSession: opts.onGetChatSession, chatContentProviders });

			const provisionRequests: ICloudSandboxCreateSessionRequest[] = [];
			provider.sandboxContribution = {
				provisionSession: async request => {
					provisionRequests.push(request);
					if (opts.provision) {
						return opts.provision();
					}
					throw new Error('provisioning failed');
				},
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
		function provisionedSession(sendRequest?: CloudSandboxSessionsProvider['sendRequest'], sandboxModels: () => readonly ILanguageModelChatMetadataAndIdentifier[] = () => []): ICloudSandboxProvisionedSession & { published: string[]; modelSelections: { modelId: string; source: ChatModelSource }[]; modelsChanged: Emitter<void> } {
			const committed = upcastPartial<ISession>({
				sessionId: 'agenthost:sess-new',
				resource: URI.parse('agent-host-copilot:/sess-new'),
			});
			const sandboxSession = upcastPartial<ISession>({
				sessionId: 'agenthost:sess-new',
				resource: URI.parse('agent-host-copilot:/sess-new'),
				mainChat: constObservable(upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/sess-new') })),
			});
			const published: string[] = [];
			const modelSelections: { modelId: string; source: ChatModelSource }[] = [];
			const modelsChanged = disposables.add(new Emitter<void>());
			return {
				taskId: 'task-new',
				sessionId: 'sess-new',
				environmentId: 'env-new',
				session: sandboxSession,
				published,
				modelSelections,
				modelsChanged,
				provider: upcastPartial<CloudSandboxSessionsProvider>({
					sendRequest: sendRequest ?? (async () => committed),
					publishWithheldSession: (rawId: string) => { published.push(rawId); },
					onDidChangeModels: modelsChanged.event,
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

		suite('explicit browser sandbox creation', () => {
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
				const { provider, provisionRequests, cloudSends, chatContentProviders } = createSandboxProvider({
					providerMode: 'sandbox',
					provision: () => pending.p,
					getOptionGroups: () => cloudModelOptionGroup('cloud-only-model', 'cloud-only-model'),
				});
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				const session = provider.getSession(draft.sessionId)!;
				session.setUseSandbox(false);
				provider.setModel(draft.sessionId, draft.resource, 'cloud-only-model', ChatModelSource.Chosen);
				const replacements: string[] = [];
				disposables.add(provider.onDidReplaceSession(event => replacements.push(event.to.sessionId)));
				const request = provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' });
				const repeatedRequest = assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'another prompt' }), /already being started/);
				const content = await chatContentProviders[0].provideChatSessionContent(draft.resource, CancellationToken.None);
				const startup = {
					resource: extUri.isEqual(content.sessionResource, draft.resource),
					prompt: content.history[0].type === 'request' ? content.history[0].prompt : undefined,
					progress: content.history[1].type === 'response' ? content.history[1].parts.map(part => part.kind === 'markdownContent' ? part.content.value : part.kind) : [],
					readOnly: content.isReadOnly?.get(),
				};
				let contentDisposed = false;
				disposables.add(Event.once(content.onWillDispose)(() => contentDisposed = true));
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
					contentDisposed,
				}, {
					provisionRequests: [{ repoNwo: 'osortega/simple-server', prompt: 'fix it' }],
					sent: [{ sessionId: 'agenthost:sess-new', resource: 'agent-host-copilot:/sess-new', query: 'fix it' }],
					cloudSends: [],
					modelSelections: [],
					published: ['sess-new'],
					replacements: ['agenthost:sess-new'],
					committed: 'agenthost:sess-new',
					placeholders: [],
					startup: { resource: true, prompt: 'fix it', progress: ['Starting GitHub sandbox...'], readOnly: true },
					contentDisposed: true,
				});
			});

			test('reopens the provisional transcript and retires it when provisioning fails', async () => {
				const pending = new DeferredPromise<ICloudSandboxProvisionedSession>();
				const { provider, chatContentProviders } = createSandboxProvider({ providerMode: 'sandbox', provision: () => pending.p });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				const request = provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' });
				const rejected = assert.rejects(request, /provisioning failed/);
				const contentProvider = chatContentProviders[0];
				const first = await contentProvider.provideChatSessionContent(draft.resource, CancellationToken.None);
				first.dispose();
				const reopened = await contentProvider.provideChatSessionContent(draft.resource, CancellationToken.None);
				let disposed = false;
				disposables.add(Event.once(reopened.onWillDispose)(() => disposed = true));
				await pending.error(new Error('provisioning failed'));
				await rejected;

				assert.deepStrictEqual({ recreated: first !== reopened, history: reopened.history, disposed }, { recreated: true, history: first.history, disposed: true });
				await assert.rejects(contentProvider.provideChatSessionContent(draft.resource, CancellationToken.None), /no longer available/);
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
				const { provider, cloudSends } = createSandboxProvider({ providerMode: 'sandbox', provision: async () => provisioned });
				const draft = provider.createNewSession(repoWorkspace, CopilotSandboxSessionType.id);
				await assert.rejects(provider.sendRequest(draft.sessionId, draft.resource, { query: 'fix it' }), /send failed/);
				assert.deepStrictEqual({ published: provisioned.published, placeholders: provider.getSessions(), cloudSends }, { published: ['sess-new'], placeholders: [], cloudSends: [] });
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
				assert.deepStrictEqual({ sends, published: provisioned.published, placeholders: provider.getSessions() }, { sends: 0, published: ['sess-new'], placeholders: [] });
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
			session.setUseSandbox(true);
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
			session.setUseSandbox(true);
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
			session.setUseSandbox(true);
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
			session.setUseSandbox(true);
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
			session.setUseSandbox(true);

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

		test('falls back to the server-run cloud agent when the feature is disabled', async () => {
			// A remembered preference must not strand the user with a send that always fails.
			const { provider, provisionRequests, cloudSends } = createSandboxProvider({ enabled: false });
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			session.setUseSandbox(true);

			void provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' });
			await timeout(0);

			assert.deepStrictEqual({ provisionRequests, cloudSends }, { provisionRequests: [], cloudSends: ['fix it'] });
		});

		test('reveals the withheld sandbox session as it retires the placeholder', async () => {
			const provisioned = provisionedSession();
			const { provider } = createSandboxProvider({ provision: async () => provisioned });
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			session.setUseSandbox(true);

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
			session.setUseSandbox(true);

			await assert.rejects(() => provider.sendRequest(sessionInfo.sessionId, session.mainChat.get().resource, { query: 'fix it' }));

			// The sandbox outlives the failed turn, so leaving it withheld would hide a session
			// that really exists.
			assert.deepStrictEqual(provisioned.published, ['sess-new']);
		});

		test('a failed provision removes the placeholder instead of stranding it in the list', async () => {
			const { provider } = createSandboxProvider();
			const sessionInfo = provider.createNewSession(repoWorkspace, CopilotCloudSessionType.id);
			const session = provider.getSession(sessionInfo.sessionId)!;
			session.setUseSandbox(true);

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
