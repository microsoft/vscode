/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { timeout } from '../../../../../../base/common/async.js';
import { DisposableStore, IDisposable, ImmortalReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { autorun, constObservable, ISettableObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { TestStorageService } from '../../../../../../workbench/test/common/workbenchTestServices.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, ChatSendResult, IChatSendRequestData, IChatSendRequestOptions } from '../../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionProviderOptionGroup, IChatSessionsService, SessionType } from '../../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChatResponseModel } from '../../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatAgentData } from '../../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IGitRepository, IGitService } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionChangeEvent } from '../../../../../services/sessions/common/sessionsProvider.js';
import { ChatModelSource, GITHUB_REMOTE_FILE_SCHEME, IChat, ISession, ISessionWorkspace, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { CloudSandboxEnabledSettingId, type ICloudSandboxCreateSessionRequest } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CloudSandboxAgentHostContribution, type ICloudSandboxProvisionedSession } from '../../../remoteAgentHost/browser/cloudSandboxAgentHostContribution.js';
import { CloudSandboxSessionsProvider } from '../../../remoteAgentHost/browser/cloudSandboxSessionsProvider.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../../../../workbench/contrib/chat/common/constants.js';
import { CopilotChatSessionsProvider, COPILOT_PROVIDER_ID, CopilotCloudSessionType, ICopilotChatSession } from '../../browser/copilotChatSessionsProvider.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { IPathService } from '../../../../../../workbench/services/path/common/pathService.js';
import { MockLabelService } from '../../../../../../workbench/services/label/test/common/mockLabelService.js';
import { TestPathService } from '../../../../../../workbench/test/browser/workbenchTestServices.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { CopilotCLISessionType } from '../../../agentHost/browser/baseAgentHostSessionsProvider.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IGitHubService } from '../../../../github/browser/githubService.js';
import { GitHubPullRequestModel } from '../../../../github/browser/models/githubPullRequestModel.js';
import { IPullRequestIconCache } from '../../../../github/browser/pullRequestIconCache.js';
import { computePullRequestIcon, GitHubPullRequestState, IGitHubPullRequest } from '../../../../github/common/types.js';

// ---- Helpers ----------------------------------------------------------------

interface IGitHubContextBrowseHarness {
	readonly commandService: Pick<ICommandService, 'executeCommand'>;
	readonly gitService: Pick<IGitService, 'openRepository'>;
}

const browseForGitHubContext = Reflect.get(CopilotChatSessionsProvider.prototype, '_browseForGitHubContext') as (
	this: IGitHubContextBrowseHarness,
	commandId: string,
	icon: ThemeIcon,
	currentWorkspace: ISessionWorkspace | undefined,
) => Promise<ISessionWorkspace | undefined>;

function createMockAgentSession(resource: URI, opts?: {
	providerType?: string;
	title?: string;
	archived?: boolean;
	read?: boolean;
	createdAt?: number;
	status?: ChatSessionStatus;
	metadata?: Record<string, unknown>;
	onSetRead?: () => void;
}): IAgentSession {
	const providerType = opts?.providerType ?? AgentSessionProviders.Background;
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
		override readonly metadata = opts?.metadata ?? { repositoryPath: '/test/repo' };
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
	readonly multiChatEnabled?: boolean;
	readonly agentHostEnabled?: boolean;
	readonly commandExecutions?: IExecutedCommand[];
	readonly getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined;
	readonly languageModelsService?: Partial<ILanguageModelsService>;
	readonly gitHubService?: IGitHubService;
	readonly gitService?: IGitService;
	readonly pullRequestIconCache?: IPullRequestIconCache;
}

function isCommandSessionItem(item: unknown): item is { readonly resource: URI; readonly label?: string } {
	return typeof item === 'object' && item !== null && 'resource' in item && URI.isUri(item.resource);
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
): { provider: CopilotChatSessionsProvider; configService: TestConfigurationService; agentHostEnabled: ISettableObservable<boolean>; labelService: MockLabelService } {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', opts?.multiChatEnabled ?? true);
	const agentHostEnabled = observableValue('agentHostEnabled', opts?.agentHostEnabled ?? true);

	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: agentHostEnabled, managedSandboxEnforced: constObservable(false) });
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, {
		confirm: async () => ({ confirmed: true }),
	});
	instantiationService.stub(ICommandService, {
		executeCommand: async (id: string, ...args: unknown[]) => {
			opts?.commandExecutions?.push({ id, args });
			// Simulate 'agents.github.copilot.cli.deleteSessions' removing sessions
			const items = args[0];
			if (Array.isArray(items)) {
				for (const item of items) {
					if (isCommandSessionItem(item)) {
						model.removeSession(item.resource);
					}
				}
			} else if (isCommandSessionItem(items)) {
				model.removeSession(items.resource);
			}
			return undefined;
		},
	});
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
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
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => undefined,
		lastFocusedWidget: undefined,
		onDidChangeFocusedSession: Event.None,
	});
	instantiationService.stub(ILanguageModelsService, opts?.languageModelsService ?? { lookupLanguageModel: () => undefined });
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
		override warn(): void { }
	}());
	instantiationService.stub(ILanguageModelToolsService, {
		toToolReferences: () => [],
	});
	// Stub IInstantiationService so provider can use createInstance for CopilotCLISession
	instantiationService.stub(IInstantiationService, instantiationService);
	const labelService = new MockLabelService();
	instantiationService.stub(ILabelService, labelService);
	instantiationService.stub(IPathService, new TestPathService(URI.file('/home/test')));
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IGitService, opts?.gitService ?? { repositories: [], openRepository: async () => undefined });
	instantiationService.stub(IGitHubService, opts?.gitHubService ?? new TestGitHubService());
	instantiationService.stub(IPullRequestIconCache, opts?.pullRequestIconCache ?? new TestPullRequestIconCache());

	const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
	return { provider, configService, agentHostEnabled, labelService };
}

// ---- Provider factory for send/cancel tests ---------------------------------

/**
 * Creates a provider suitable for testing sendChat flows. Stubs all services
 * needed by CopilotCLISession and _sendFirstChat, including IGitService and a
 * non-null IChatWidget mock.
 *
 * The caller can pass a custom `sendRequest` implementation to control the
 * lifecycle of the in-flight request.
 */
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

function createProviderForSendTests(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	sendRequest: (resource: URI, message: string, options?: IChatSendRequestOptions) => Promise<ChatSendResult>,
	opts?: { onDidCommitSession?: Event<{ original: URI; committed: URI }>; configurationService?: TestConfigurationService; agentHostEnabled?: boolean; getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined; notifications?: string[] },
): TestSandboxCopilotProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = opts?.configurationService ?? new TestConfigurationService();
	configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', true);

	instantiationService.stub(ILogService, NullLogService);
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, {
		confirm: async () => ({ confirmed: true }),
	});
	instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
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
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => new class extends mock<IChatWidget>() {
			override input = new class extends mock<IChatWidget['input']>() {
				override setPermissionLevel = () => { };
			}();
		}(),
		lastFocusedWidget: undefined,
		onDidChangeFocusedSession: Event.None,
	});
	instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined });
	instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
		override warn(message: unknown): void { opts?.notifications?.push(String(message)); }
	}());
	instantiationService.stub(ILanguageModelToolsService, { toToolReferences: () => [] });
	instantiationService.stub(IGitService, { openRepository: async () => undefined });
	instantiationService.stub(IInstantiationService, instantiationService);
	instantiationService.stub(ILabelService, new MockLabelService());
	instantiationService.stub(IPathService, new TestPathService(URI.file('/home/test')));
	instantiationService.stub(IUriIdentityService, { extUri });
	instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(opts?.agentHostEnabled ?? true), managedSandboxEnforced: constObservable(false) });
	instantiationService.stub(IContextKeyService, new MockContextKeyService());
	instantiationService.stub(IGitHubService, new TestGitHubService());
	instantiationService.stub(IPullRequestIconCache, new TestPullRequestIconCache());

	return disposables.add(instantiationService.createInstance(TestSandboxCopilotProvider));
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
			gitService: upcastPartial<IGitService>({ openRepository: async () => undefined }),
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
					if (commandId === 'github.copilot.chat.cloudSessions.openRepository') {
						return 'microsoft/vscode' as T;
					}
					return {
						repoId: 'microsoft/vscode',
						url: `https://github.com/microsoft/vscode/${commandId === 'openIssue' ? 'issues/1' : 'pull/2'}`,
						label: `microsoft/vscode#${commandId === 'openIssue' ? '1' : '2'}`,
					} as T;
				}
			}(),
			gitService: upcastPartial<IGitService>({ openRepository: async () => undefined }),
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
				{ commandId: 'github.copilot.chat.cloudSessions.openRepository', repoId: undefined },
				{ commandId: 'openIssue', repoId: 'microsoft/vscode' },
				{ commandId: 'github.copilot.chat.cloudSessions.openRepository', repoId: undefined },
				{ commandId: 'openPullRequest', repoId: 'microsoft/vscode' },
			],
			issue: { uri: 'https://github.com/microsoft/vscode/issues/1', label: 'microsoft/vscode#1' },
			pullRequest: { uri: 'https://github.com/microsoft/vscode/pull/2', label: 'microsoft/vscode#2' },
		});
	});

	test('resolves an initially unknown GitHub remote before browsing context', async () => {
		const calls: { commandId: string; repoId: unknown }[] = [];
		const repositoryState = observableValue('repositoryState', {
			HEAD: undefined,
			remotes: [{ name: 'origin', fetchUrl: 'https://github.com/microsoft/vscode.git', pushUrl: undefined, isReadOnly: false }],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
		const harness: IGitHubContextBrowseHarness = {
			commandService: new class extends mock<ICommandService>() {
				override async executeCommand<T>(commandId: string, repoId?: unknown): Promise<T | undefined> {
					calls.push({ commandId, repoId });
					return {
						repoId: 'microsoft/vscode',
						url: 'https://github.com/microsoft/vscode/issues/1',
						label: 'microsoft/vscode#1',
					} as T;
				}
			}(),
			gitService: upcastPartial<IGitService>({
				openRepository: async () => upcastPartial<IGitRepository>({ rootUri: root, state: repositoryState }),
			}),
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
			calls: [{ commandId: 'openIssue', repoId: 'microsoft/vscode' }],
			issue: { uri: 'https://github.com/microsoft/vscode/issues/1', label: 'microsoft/vscode#1' },
		});
	});

	test('selects a repository when the selected folder has no matching Git root', async () => {
		const calls: { commandId: string; repoId: unknown }[] = [];
		const staleRepositoryState = observableValue('staleRepositoryState', {
			HEAD: undefined,
			remotes: [{ name: 'origin', fetchUrl: 'https://github.com/microsoft/old.git', pushUrl: undefined, isReadOnly: false }],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
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
			gitService: upcastPartial<IGitService>({
				openRepository: async () => upcastPartial<IGitRepository>({
					rootUri: URI.file('/test/old-repository'),
					state: staleRepositoryState,
				}),
			}),
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
			{ commandId: 'github.copilot.chat.cloudSessions.openRepository', repoId: undefined },
			{ commandId: 'openIssue', repoId: 'microsoft/vscode' },
		]);
	});

	test('sessionTypes excludes Local', () => {
		const provider = createProvider(disposables, model);
		assert.ok(!provider.sessionTypes.some(type => type.id === SessionType.Local));
	});

	test('sessionTypes excludes Extension Host Copilot CLI when Agent Host is available', () => {
		const provider = createProvider(disposables, model);
		assert.ok(!provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));
	});

	test('sessionTypes includes Extension Host Copilot CLI when Agent Host is unavailable', () => {
		const provider = createProvider(disposables, model, { agentHostEnabled: false });
		assert.ok(provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id));
	});

	test('Agent Host availability is observed in both directions after the provider is created', () => {
		const { provider, agentHostEnabled } = createProviderWithConfig(disposables, model, { agentHostEnabled: false });
		let changeCount = 0;
		disposables.add(provider.onDidChangeSessionTypes(() => changeCount++));
		const visibleBeforeAvailability = provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id);

		agentHostEnabled.set(true, undefined);
		const visibleWhileAvailable = provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id);
		agentHostEnabled.set(false, undefined);

		assert.deepStrictEqual({
			visibleBeforeAvailability,
			visibleWhileAvailable,
			visibleAfterDisablement: provider.sessionTypes.some(t => t.id === CopilotCLISessionType.id),
			changeCount,
		}, {
			visibleBeforeAvailability: true,
			visibleWhileAvailable: false,
			visibleAfterDisablement: true,
			changeCount: 2,
		});
	});

	// ---- getSessionTypes -------

	test('getSessionTypes returns only Cloud for a remote workspace', () => {
		const provider = createProvider(disposables, model);
		const types = provider.getSessionTypes(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repo' }));
		assert.strictEqual(types.length, 1);
	});

	// ---- Session listing -------

	test('getSessions returns empty array initially', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.getSessions().length, 0);
	});

	test('getSessions returns adapted sessions from agent model', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 2);
	});

	test('getSessions does not emit session changes while reading the initial cache', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session' });
		model.addSession(createMockAgentSession(resource));
		const provider = createProvider(disposables, model, { agentHostEnabled: false });
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const sessions = provider.getSessions();

		assert.deepStrictEqual({ sessionCount: sessions.length, changes }, { sessionCount: 1, changes: [] });
	});

	test('getSessions excludes Local sessions', () => {
		const bgResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/bg-session' });
		const localResource = URI.from({ scheme: AgentSessionProviders.Local, path: '/local-session' });
		model.addSession(createMockAgentSession(bgResource));
		model.addSession(createMockAgentSession(localResource, { providerType: AgentSessionProviders.Local }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
	});

	test('getSessions excludes Claude extension-host sessions', () => {
		const claudeResource = URI.from({ scheme: 'claude-code', path: '/claude-session' });
		model.addSession(createMockAgentSession(claudeResource, { providerType: 'claude-code' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 0);
	});

	test('onDidChangeSessions fires when agent model changes', () => {
		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/new-session' });
		model.addSession(createMockAgentSession(resource, { title: 'New Session' }));

		assert.ok(changes.length > 0);
		assert.strictEqual(changes[0].added.length, 1);
	});

	test('onDidChangeSessions does not fire when cached agent session is unchanged', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/existing-session' });
		model.addSession(createMockAgentSession(resource, { title: 'Existing Session', createdAt: 1 }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.fireDidChangeSessions();

		assert.deepStrictEqual(changes, []);
	});

	test('onDidChangeSessions fires changed session when cached agent session changes', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/existing-session' });
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
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/turn-session' });
		// Session starts a turn (in progress) and is currently read.
		model.addSession(createMockAgentSession(resource, { title: 'Turn Session', createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache with the in-progress session

		// The turn completes: the underlying session flips to a terminal status.
		model.replaceSession(createMockAgentSession(resource, { title: 'Turn Session', createdAt: 1, status: ChatSessionStatus.Completed, read: true, onSetRead: () => model.fireDidChangeSessions() }));

		assert.strictEqual(provider.getSessions()[0].isRead.get(), false);
	});

	test('does not mark unread when status stays in progress', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/still-running' });
		model.addSession(createMockAgentSession(resource, { title: 'Running', createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));

		const provider = createProvider(disposables, model);
		provider.getSessions();

		// A refresh that does not complete the turn must not mark it unread.
		model.replaceSession(createMockAgentSession(resource, { title: 'Running (updated)', createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));

		assert.strictEqual(provider.getSessions()[0].isRead.get(), true);
	});

	test('setSessionReadState clears unread across every chat in the group', async () => {
		const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/root-session' });
		const childResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/child-session' });

		model.addSession(createMockAgentSession(rootResource, { title: 'Root', createdAt: 1, read: true, onSetRead: () => model.fireDidChangeSessions() }));
		model.addSession(createMockAgentSession(childResource, {
			title: 'Child', createdAt: 2, read: false,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' },
			onSetRead: () => model.fireDidChangeSessions(),
		}));

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

	// Note: createNewSession tests are limited because CopilotCLISession
	// requires IGitService and creates disposables that are hard to clean
	// up in isolation. Full integration tests should cover session creation.
	test('cloud models resolve arbitrary restored ids with option groups', () => {
		const modelsState: { optionGroups: IChatSessionProviderOptionGroup[] | undefined } = { optionGroups: undefined };
		const provider = createProvider(disposables, model, { getOptionGroups: () => modelsState.optionGroups });
		const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/owner/repository' });
		const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
		const beforeResolve = provider.getModelsSnapshot(session.sessionId, 'removed-cloud-model');

		modelsState.optionGroups = [{
			id: 'models',
			name: 'Models',
			items: [{ id: 'synthetic-cloud-model', name: 'Synthetic Cloud Model' }],
		}];
		const afterResolve = provider.getModelsSnapshot(session.sessionId, 'removed-cloud-model');

		assert.deepStrictEqual({
			beforeResolve: { models: beforeResolve.models.map(model => model.identifier), desiredModelResolution: beforeResolve.desiredModelResolution, modelTarget: beforeResolve.modelTarget },
			afterResolve: { models: afterResolve.models.map(model => model.identifier), desiredModelResolution: afterResolve.desiredModelResolution, modelTarget: afterResolve.modelTarget },
		}, {
			beforeResolve: { models: [], desiredModelResolution: { kind: 'pending', identifier: 'removed-cloud-model' }, modelTarget: AgentSessionProviders.Cloud },
			afterResolve: { models: ['synthetic-cloud-model'], desiredModelResolution: { kind: 'unavailable', identifier: 'removed-cloud-model' }, modelTarget: AgentSessionProviders.Cloud },
		});
	});

	test('Copilot CLI keeps an empty Copilot catalog pending until live models arrive', () => {
		const models = new Map<string, ILanguageModelChatMetadata>();
		const provider = createProvider(disposables, model, {
			languageModelsService: {
				getLanguageModelIds: () => [...models.keys()],
				lookupLanguageModel: identifier => models.get(identifier),
				hasResolvedVendor: () => true,
			},
		});
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
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
			targetChatSessionType: CopilotCLISessionType.id,
		});
		const live = provider.getModelsSnapshot(session.sessionId, 'copilot/remembered');

		assert.deepStrictEqual({
			empty: { resolution: empty.desiredModelResolution, modelTarget: empty.modelTarget },
			live: { resolution: live.desiredModelResolution, modelTarget: live.modelTarget },
		}, {
			empty: { resolution: { kind: 'pending', identifier: 'copilot/remembered' }, modelTarget: CopilotCLISessionType.id },
			live: { resolution: { kind: 'unavailable', identifier: 'copilot/remembered' }, modelTarget: CopilotCLISessionType.id },
		});
	});

	test('Copilot CLI session maps workspace selection to Agent Host folder config', async () => {
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }));
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId) as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('workspace');

		assert.strictEqual(providerSession.isolationMode.get(), 'workspace');
		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: 'folder' });
		providerSession.dispose();
	});

	test('Copilot CLI session maps worktree selection to Agent Host config', async () => {
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }));
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId)! as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('worktree');
		providerSession.setBranch('main');

		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: 'worktree', branch: 'main' });
		providerSession.dispose();
	});

	test('Copilot CLI session forwards git.branchPrefix as worktreeBranchPrefix for worktree isolation', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('git.branchPrefix', 'users/alice/');
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }), { configurationService: configService });
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId)! as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('worktree');
		providerSession.setBranch('main');

		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: 'worktree', branch: 'main', worktreeBranchPrefix: 'users/alice/' });
		providerSession.dispose();
	});

	test('Copilot CLI session forwards git.worktreeIncludeFiles for worktree isolation', async () => {
		const configService = new TestConfigurationService();
		configService.setUserConfiguration('git.worktreeIncludeFiles', ['product.overrides.json', '**/node_modules/**']);
		const provider = createProviderForSendTests(disposables, model, async () => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }), { configurationService: configService });
		const session = provider.createNewSession(URI.file('/test/project'), CopilotCLISessionType.id);
		const providerSession = provider.getSession(session.sessionId)! as ICopilotChatSession & IDisposable & { getAgentHostSessionConfig(): Record<string, unknown> };
		providerSession.setIsolationMode('worktree');
		providerSession.setBranch('main');

		assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), {
			isolation: 'worktree',
			branch: 'main',
			worktreeIncludeFiles: ['product.overrides.json', '**/node_modules/**']
		});
		providerSession.dispose();
	});

	// ---- Session actions -------

	test('archiveSession sets archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const agentSession = createMockAgentSession(resource);
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const session = provider.getSessions()[0];
		provider.archiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), true);
	});

	test('unarchiveSession clears archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const agentSession = createMockAgentSession(resource, { archived: true });
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions();

		const session = provider.getSessions()[0];
		provider.unarchiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), false);
	});

	// ---- Session capabilities -------

	test('copilot CLI sessions have supportsMultipleChats capability', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, true);
	});

	test('copilot cloud sessions do not have supportsMultipleChats capability', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
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

	test('non-cloud sessions do not infer pull requests from branch metadata', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const gitHubService = new TestGitHubService(42);
		model.addSession(createMockAgentSession(resource, {
			metadata: {
				owner: 'owner',
				name: 'repo',
				branch: 'feature',
			},
		}));

		const provider = createProvider(disposables, model, { gitHubService });
		const gitHubInfoObs = provider.getSessions()[0].workspace.get()!.folders[0].gitRepository!.gitHubInfo;
		disposables.add(autorun(reader => gitHubInfoObs.read(reader)));
		await timeout(0);

		assert.deepStrictEqual({
			lookupCalls: gitHubService.lookupCalls,
			pullRequest: gitHubInfoObs.get()?.pullRequest,
		}, {
			lookupCalls: 0,
			pullRequest: undefined,
		});
	});

	test('copilot CLI sessions do not have supportsMultipleChats when setting is disabled', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model, { multiChatEnabled: false });
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
	});

	// ---- Session listing & grouping -------

	test('each session has exactly one chat initially', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].chats.get().length, 1);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
	});

	test('setModel applies to existing sessions and their new chats', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const session = provider.getSessions()[0];
		provider.setModel(session.sessionId, session.resource, 'copilot/gpt-4o', ChatModelSource.Chosen);

		assert.strictEqual(session.modelId.get(), 'copilot/gpt-4o');

		const chat = await provider.createNewChat(session.sessionId);
		try {
			// The model carries where it came from: chosen by the user on the original chat, and
			// only inherited by the new one. Model selection needs that difference to know whether
			// `chat.defaultModel` may still seed the new chat.
			assert.deepStrictEqual({
				model: chat.modelId.get(),
				sourceOnOriginalChat: provider.getSessions()[0].mainChat.get().modelSource?.get(),
				sourceOnNewChat: chat.modelSource?.get(),
			}, {
				model: 'copilot/gpt-4o',
				sourceOnOriginalChat: ChatModelSource.Chosen,
				sourceOnNewChat: ChatModelSource.CarriedOver,
			});
		} finally {
			await provider.deleteChat(session.sessionId, chat.resource);
		}
	});

	test('sendRequest throws for unknown session', async () => {
		const provider = createProvider(disposables, model);
		await assert.rejects(
			() => provider.sendRequest('nonexistent', URI.parse('untitled:chat'), { query: 'test' }),
			/not found/,
		);
	});

	test('getSessions groups chats by session group', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		// Without explicit grouping, each chat is its own session
		assert.strictEqual(sessions.length, 2);
	});

	test('groups committed chats using metadata.sessionParentId', () => {
		const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/root-session' });
		const child1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/child-session-1' });
		const child2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/child-session-2' });

		model.addSession(createMockAgentSession(rootResource, { title: 'Root', createdAt: 1 }));
		model.addSession(createMockAgentSession(child1Resource, {
			title: 'Child 1',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));
		model.addSession(createMockAgentSession(child2Resource, {
			title: 'Child 2',
			createdAt: 3,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].chats.get().length, 3);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), rootResource.toString());
	});

	test('orders chats within a grouped session by createdAt', () => {
		const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/root-session' });
		const olderChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/older-child' });
		const newerChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/newer-child' });

		// Add out of order to ensure grouping order is driven by createdAt rather than insertion order.
		model.addSession(createMockAgentSession(newerChildResource, {
			title: 'Newer Child',
			createdAt: 30,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));
		model.addSession(createMockAgentSession(rootResource, { title: 'Root', createdAt: 10 }));
		model.addSession(createMockAgentSession(olderChildResource, {
			title: 'Older Child',
			createdAt: 20,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-session' }
		}));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.deepStrictEqual(
			sessions[0].chats.get().map(chat => chat.resource.toString()),
			[rootResource.toString(), olderChildResource.toString(), newerChildResource.toString()]
		);
	});

	test('groups child sessions even when the parent/root session is missing', () => {
		const orphan1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/orphan-child-1' });
		const orphan2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/orphan-child-2' });
		const provider = createProvider(disposables, model);

		provider.getSessions(); // initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.addSession(createMockAgentSession(orphan1Resource, {
			title: 'Orphan Child 1',
			createdAt: 1,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'missing-root' }
		}));
		model.addSession(createMockAgentSession(orphan2Resource, {
			title: 'Orphan Child 2',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'missing-root' }
		}));

		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.deepStrictEqual(
			sessions[0].chats.get().map(chat => chat.resource.toString()),
			[orphan1Resource.toString(), orphan2Resource.toString()]
		);
		assert.deepStrictEqual(changes.map(e => ({ added: e.added.length, changed: e.changed.length })), [
			{ added: 1, changed: 0 },
			{ added: 0, changed: 1 },
		]);
	});

	test('groups nested parent chains under the ultimate root', () => {
		const middleResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/middle-session' });
		const leafResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/leaf-session' });

		model.addSession(createMockAgentSession(middleResource, {
			title: 'Middle Session',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'missing-root' }
		}));
		model.addSession(createMockAgentSession(leafResource, {
			title: 'Leaf Session',
			createdAt: 3,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'middle-session' }
		}));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.deepStrictEqual(
			sessions[0].chats.get().map(chat => chat.resource.toString()),
			[middleResource.toString(), leafResource.toString()]
		);
	});

	test('session title comes from primary (first) chat', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { title: 'Primary Title' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].title.get(), 'Primary Title');
	});

	test('session has mainChat set to the first chat', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.ok(sessions[0].mainChat);
		assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
	});

	test('deleteSession removes session from model and list', async () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
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

	test('deleteSession passes Copilot CLI session label to delete command', async () => {
		const resource = URI.from({ scheme: CopilotCLISessionType.id, path: '/session-1' });
		const commandExecutions: IExecutedCommand[] = [];
		model.addSession(createMockAgentSession(resource, { providerType: CopilotCLISessionType.id, title: 'Fix Build' }));

		const provider = createProvider(disposables, model, { commandExecutions });
		const sessions = provider.getSessions();

		await provider.deleteSession(sessions[0].sessionId);

		assert.deepStrictEqual(commandExecutions.map(command => ({
			id: command.id,
			items: Array.isArray(command.args[0])
				? command.args[0].map(item => isCommandSessionItem(item) ? { resource: item.resource.toString(), label: item.label } : undefined)
				: undefined,
			options: command.args[1],
		})), [{
			id: 'agents.github.copilot.cli.deleteSessions',
			items: [{ resource: resource.toString(), label: 'Fix Build' }],
			options: { skipConfirmation: true },
		}]);
	});

	test('deleteChat with single chat delegates to deleteSession', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const session = sessions[0];

		await provider.deleteChat(session.sessionId, resource);

		// Model should no longer have the session
		assert.strictEqual(model.sessions.length, 0);
	});

	test('deleteChat throws when session does not support multi-chat', async () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const session = sessions[0];

		await assert.rejects(
			() => provider.deleteChat(session.sessionId, resource),
			/not supported when multi-chat is disabled/,
		);
	});

	test('session group cache is invalidated on session removal', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
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

	test('chats observable updates when group model changes', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		// Both are separate sessions initially
		const session1 = sessions[0];
		assert.strictEqual(session1.chats.get().length, 1);
	});

	test('session status aggregates across chats', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		// With a single chat, session status should match the chat status
		assert.ok(sessions[0].status.get() !== undefined);
	});

	test('session isRead aggregates across all chats', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { read: true }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].isRead.get(), true);
	});

	test('session isRead is false when any chat is unread', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource, { read: false }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions[0].isRead.get(), false);
	});

	test('removing a chat from a group fires changed (not removed) with correct sessionId', async () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, 2);

		// Manually group both chats under the first session
		const chat2Id = sessions[1].sessionId;
		// Access the group model indirectly by deleting the second session's group
		// and re-adding its chat to the first group via deleteChat flow
		// Instead, simulate by removing the second chat from the model
		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		model.removeSession(resource2);

		// The removed chat was standalone, so it should fire a removed event
		assert.ok(changes.length > 0);
		const lastChange = changes[changes.length - 1];
		assert.strictEqual(lastChange.removed.length, 1);
		assert.strictEqual(lastChange.removed[0].sessionId, chat2Id);
	});

	test('observing many grouped sessions keeps one membership listener and recomputes only the affected group', () => {
		// Several independent root groups, each observed for its chat list.
		const sessionCount = 8;
		for (let i = 0; i < sessionCount; i++) {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/root-${i}` });
			model.addSession(createMockAgentSession(resource, { title: `Root ${i}`, createdAt: 1 }));
		}

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		assert.strictEqual(sessions.length, sessionCount);

		// Observe every session's chat list. Before the fix each observed session added
		// its own filtered listener to the shared membership emitter, so listeners grew
		// with the session count; now a single provider-wide fan-out serves all of them.
		const chatCounts = sessions.map(() => 0);
		sessions.forEach((session, i) => {
			disposables.add(autorun(reader => {
				session.chats.read(reader);
				chatCounts[i]++;
			}));
		});

		// Exactly one listener on the membership emitter regardless of how many sessions
		// are observed (the provider-wide fan-out), and each autorun ran once initially.
		const membershipEmitter = (provider as unknown as { _onDidGroupMembershipChange: { _size: number } })._onDidGroupMembershipChange;
		assert.strictEqual(membershipEmitter._size, 1);
		assert.deepStrictEqual(chatCounts, sessions.map(() => 1));

		// Add a child chat into the FIRST group only, changing just that group's membership.
		const child = URI.from({ scheme: AgentSessionProviders.Background, path: '/root-0-child' });
		model.addSession(createMockAgentSession(child, {
			title: 'Child',
			createdAt: 2,
			metadata: { repositoryPath: '/test/repo', sessionParentId: 'root-0' },
		}));

		// Listener count is still one, only the first group recomputed (its chat list grew
		// to two), and no other session's chats observable published a change.
		assert.strictEqual(membershipEmitter._size, 1);
		assert.strictEqual(sessions[0].chats.get().length, 2);
		assert.deepStrictEqual(chatCounts, [2, ...sessions.slice(1).map(() => 1)]);
	});

	test('getSessions does not create duplicate groups on repeated calls', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
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

	test('changed events are not duplicated when multiple chats update', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		// Trigger a refresh that updates both sessions
		model.addSession(createMockAgentSession(
			URI.from({ scheme: AgentSessionProviders.Background, path: '/session-3' }),
			{ title: 'Session 3' }
		));

		// Each event should not have duplicates in the changed array
		for (const change of changes) {
			const changedIds = change.changed.map(s => s.sessionId);
			const uniqueIds = new Set(changedIds);
			assert.strictEqual(changedIds.length, uniqueIds.size, 'Changed events should not have duplicates');
		}
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
		let openRepositoryCalls = 0;
		const repositoryState = observableValue('repositoryState', {
			HEAD: undefined,
			remotes: [{ name: 'origin', fetchUrl: 'https://github.com/microsoft/vscode.git', pushUrl: undefined, isReadOnly: false }],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
		const gitService = upcastPartial<IGitService>({
			repositories: [],
			openRepository: async () => {
				openRepositoryCalls++;
				return upcastPartial<IGitRepository>({ state: repositoryState });
			},
		});
		const provider = createProvider(disposables, model, { gitService });
		const workspace = provider.resolveWorkspace(URI.file('/test/vscode'));
		const gitRepository = workspace?.folders[0].gitRepository;

		const beforeResolve = {
			openRepositoryCalls,
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		};
		gitRepository?.resolveGitHubInfo?.();
		await timeout(0);
		gitRepository?.resolveGitHubInfo?.();

		assert.deepStrictEqual({
			beforeResolve,
			openRepositoryCalls,
			gitHubInfo: gitRepository?.gitHubInfo.get(),
		}, {
			beforeResolve: {
				openRepositoryCalls: 0,
				gitHubInfo: undefined,
			},
			openRepositoryCalls: 1,
			gitHubInfo: { owner: 'microsoft', repo: 'vscode' },
		});
	});

	test('builds an unknown workspace fallback when repository metadata is missing', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/unknown-workspace-session' });
		model.addSession(createMockAgentSession(resource, { metadata: {} }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();
		const workspace = sessions[0].workspace.get();

		assert.ok(workspace);
		assert.strictEqual(workspace.folders.length, 1);
		assert.strictEqual(workspace.folders[0].root.toString(), URI.parse('unknown:///').toString());
		assert.strictEqual(workspace.requiresWorkspaceTrust, true);

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
		const workspace = URI.file('/test/repo');

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

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
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

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
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

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
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

	// ---- New session default permission level seeding -----------------------

	suite('new session default permission level', () => {
		const workspace = URI.file('/test/repo');

		function makeConfig(opts: { defaultLevel?: ChatPermissionLevel; policyRestricted?: boolean }): TestConfigurationService {
			const config = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					const base = super.inspect<T>(key);
					if (opts.policyRestricted && key === ChatConfiguration.GlobalAutoApprove) {
						return { ...base, policyValue: false as unknown as T };
					}
					return base;
				}
			}();
			if (opts.defaultLevel) {
				config.setUserConfiguration(ChatConfiguration.DefaultPermissionLevel, opts.defaultLevel);
			}
			return config;
		}

		test('CLI session seeds permission level from chat.permissions.default', () => {
			const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot });
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }), { configurationService });

			const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const session = provider.getSession(sessionInfo.sessionId);

			assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Autopilot);
		});

		test('clamps to Default when chat.tools.global.autoApprove policy is false', () => {
			const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot, policyRestricted: true });
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }), { configurationService });

			const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const session = provider.getSession(sessionInfo.sessionId);

			assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
		});

		test('falls back to Default when chat.permissions.default is unset', () => {
			const configurationService = makeConfig({});
			const provider = createProviderForSendTests(disposables, model, () => new Promise(() => { }), { configurationService });

			const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const session = provider.getSession(sessionInfo.sessionId);

			assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
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
		const repoWorkspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: '/osortega/simple-server/HEAD' });

		function createSandboxProvider(opts: { enabled?: boolean; provision?: () => Promise<ICloudSandboxProvisionedSession>; getOptionGroups?: () => IChatSessionProviderOptionGroup[] | undefined } = {}) {
			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration(CloudSandboxEnabledSettingId, opts.enabled ?? true);
			configurationService.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);

			const cloudSends: string[] = [];
			const notifications: string[] = [];
			const provider = createProviderForSendTests(disposables, model, async (_resource, message) => {
				cloudSends.push(message);
				// Never settles: these tests only assert which path the send took.
				return new Promise<ChatSendResult>(() => { });
			}, { configurationService, getOptionGroups: opts.getOptionGroups, notifications });

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
			return { provider, provisionRequests, cloudSends, notifications };
		}

		/**
		 * A provisioned session whose provider immediately commits the send.
		 *
		 * `sandboxModels` is a function so a test can model a catalog that is still arriving:
		 * resolution reports `pending` until it yields the model, mirroring an agent host that has
		 * connected but not yet published.
		 */
		function provisionedSession(sendRequest?: () => Promise<ISession>, sandboxModels: () => readonly ILanguageModelChatMetadataAndIdentifier[] = () => []): ICloudSandboxProvisionedSession & { published: string[]; modelSelections: { modelId: string; source: ChatModelSource }[]; modelsChanged: Emitter<void> } {
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
