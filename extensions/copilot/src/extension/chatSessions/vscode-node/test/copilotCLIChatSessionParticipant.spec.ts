/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Attachment, SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { NullChatDebugFileLoggerService } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { NullNativeEnvService } from '../../../../platform/env/common/nullEnvService';
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { MockFileSystemService } from '../../../../platform/filesystem/node/test/mockFileSystemService';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { NoopOTelService, resolveOTelConfig } from '../../../../platform/otel/common/index';
import { NullRequestLogger } from '../../../../platform/requestLogger/node/nullRequestLogger';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import type { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { IWorkspaceService, NullWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { Disposable, DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { sep } from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService, ServicesAccessor } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult2 } from '../../../../vscodeTypes';
import { NullPromptVariablesService } from '../../../prompt/node/promptVariablesService';
import { ChatSummarizerProvider } from '../../../prompt/node/summarizer';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { MockChatResponseStream, TestChatRequest } from '../../../test/node/testHelpers';
import { type IToolsService } from '../../../tools/common/toolsService';
import { mockLanguageModelChat } from '../../../tools/node/test/searchToolTestUtils';
import { IAgentSessionsWorkspace } from '../../common/agentSessionsWorkspace';
import { RepositoryProperties } from '../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeCheckpointService } from '../../common/chatSessionWorktreeCheckpointService';
import { IChatSessionWorktreeService, type ChatSessionWorktreeFile, type ChatSessionWorktreeProperties, type ChatSessionWorktreePropertiesV2 } from '../../common/chatSessionWorktreeService';
import { IChatFolderMruService } from '../../common/folderRepositoryManager';
import { MockChatSessionMetadataStore } from '../../common/test/mockChatSessionMetadataStore';
import { getWorkingDirectory, IWorkspaceInfo } from '../../common/workspaceInfo';
import { IChatDelegationSummaryService } from '../../copilotcli/common/delegationSummaryService';
import { type CopilotCLIModelInfo, type ICopilotCLIModels, type ICopilotCLISDK } from '../../copilotcli/node/copilotCli';
import { CopilotCLIPromptResolver } from '../../copilotcli/node/copilotcliPromptResolver';
import { CopilotCLISession, CopilotCLISessionInput } from '../../copilotcli/node/copilotcliSession';
import { CopilotCLISessionService, CopilotCLISessionWorkspaceTracker, ICopilotCLISessionService } from '../../copilotcli/node/copilotcliSessionService';
import { ICopilotCLIMCPHandler } from '../../copilotcli/node/mcpHandler';
import { MockCliSdkSession, MockCliSdkSessionManager, MockSkillLocations, NullCopilotCLIAgents, NullICopilotCLIImageSupport } from '../../copilotcli/node/test/testHelpers';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from '../../copilotcli/node/userInputHelpers';
import { CustomSessionTitleService } from '../../copilotcli/vscode-node/customSessionTitleServiceImpl';
import { CopilotCLIChatSessionContentProvider, CopilotCLIChatSessionItemProvider, CopilotCLIChatSessionParticipant } from '../copilotCLIChatSessionsContribution';
import { CopilotCloudSessionsProvider } from '../copilotCloudSessionsProvider';
import { CopilotCLIFolderRepositoryManager } from '../folderRepositoryManagerImpl';
import { MockPromptsService } from '../../../../platform/promptFiles/test/common/mockPromptsService';
import { MockRunCommandExecutionService } from '../../../../platform/commands/common/mockRunCommandExecutionService';

// Mock terminal integration to avoid importing PowerShell asset (.ps1) which Vite cannot parse during tests
vi.mock('../copilotCLITerminalIntegration', () => {
	// Minimal stand-in for createServiceIdentifier
	const createServiceIdentifier = (name: string) => {
		const fn: any = () => { /* decorator no-op */ };
		fn.toString = () => name;
		return fn;
	};
	class CopilotCLITerminalIntegration {
		dispose() { }
		openTerminal = vi.fn(async () => { });
	}
	return {
		ICopilotCLITerminalIntegration: createServiceIdentifier('ICopilotCLITerminalIntegration'),
		CopilotCLITerminalIntegration
	};
});

// Mock vscode.commands.executeCommand so we can control delegation behavior in tests.
// By default it throws (simulating commands API not being available), which causes
// createCLISessionAndSubmitRequest to fall into its catch block and call handleRequest directly.
// The workaround tests override this to simulate the full VS Code core round-trip.
const { mockExecuteCommand } = vi.hoisted(() => ({
	mockExecuteCommand: vi.fn()
}));

vi.mock('vscode', async (importOriginal) => {
	const actual = await import('../../../../vscodeTypes');
	return {
		...actual,
		env: {
			appName: 'VS Code'
		},
		version: 'test-vscode-version',
		extensions: {
			getExtension: vi.fn(() => ({ packageJSON: { version: 'test-version' } }))
		},
		commands: {
			executeCommand: mockExecuteCommand
		},
		workspace: {
			isAgentSessionsWorkspace: false
		}
	};
});

class FakeToolsService extends mock<IToolsService>() {
	nextConfirmationButton: string | undefined = undefined;
	override getTool(name: string) {
		if (name === 'vscode_get_modified_files_confirmation') {
			return { name } as any;
		}
		return undefined;
	}
	override invokeTool = vi.fn(async (name: string, _options: unknown, _token: unknown) => {
		if (name === 'vscode_get_modified_files_confirmation') {
			const button = this.nextConfirmationButton;
			if (button !== undefined) {
				return new LanguageModelToolResult2([new LanguageModelTextPart(button)]);
			}
			return new LanguageModelToolResult2([]);
		}
		return new LanguageModelToolResult2([]);
	});
}

class FakeChatSessionWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	private _sessionWorkspaceFolders = new Map<string, vscode.Uri>();
	private _sessionWorkspaceFolderRepositories = new Map<string, vscode.Uri | undefined>();
	private _workspaceChanges = new Map<string, readonly ChatSessionWorktreeFile[] | undefined>();
	override trackSessionWorkspaceFolder = vi.fn(async (sessionId: string, workspaceFolderUri: string, repositoryProperties?: RepositoryProperties) => {
		this._sessionWorkspaceFolders.set(sessionId, vscode.Uri.file(workspaceFolderUri));
		this._sessionWorkspaceFolderRepositories.set(sessionId, repositoryProperties?.repositoryPath ? vscode.Uri.file(repositoryProperties.repositoryPath) : undefined);
	});
	override deleteTrackedWorkspaceFolder = vi.fn(async (sessionId: string) => {
		this._sessionWorkspaceFolders.delete(sessionId);
		this._sessionWorkspaceFolderRepositories.delete(sessionId);
	});
	override getSessionWorkspaceFolder = vi.fn(async (sessionId: string): Promise<vscode.Uri | undefined> => {
		return this._sessionWorkspaceFolders.get(sessionId);
	});
	override getSessionWorkspaceFolderEntry = vi.fn(async (sessionId: string) => {
		const folder = this._sessionWorkspaceFolders.get(sessionId);
		if (!folder) {
			return undefined;
		}

		return {
			folderPath: folder.fsPath,
			timestamp: Date.now()
		};
	});
	override getRepositoryProperties = vi.fn(async (_sessionId: string): Promise<RepositoryProperties | undefined> => {
		return undefined;
	});
	override handleRequestCompleted = vi.fn(async (_sessionId: string): Promise<void> => { });
	override getWorkspaceChanges = vi.fn(async (sessionId: string): Promise<readonly ChatSessionWorktreeFile[] | undefined> => {
		return this._workspaceChanges.get(sessionId);
	});
	override clearWorkspaceChanges(sessionIdOrFolderUri: string | vscode.Uri): string[] {
		if (typeof sessionIdOrFolderUri === 'string') {
			this._workspaceChanges.delete(sessionIdOrFolderUri);
		}
		return [];
	}
}

class FakeChatSessionWorktreeService extends mock<IChatSessionWorktreeService>() {
	constructor() {
		super();
	}
	override createWorktree = vi.fn(async () => undefined) as unknown as IChatSessionWorktreeService['createWorktree'];
	override getWorktreeProperties: any = vi.fn(async (_id: string | vscode.Uri): Promise<ChatSessionWorktreeProperties | undefined> => undefined);
	override setWorktreeProperties = vi.fn(async () => { });
	override getWorktreePath: any = vi.fn(async (_id: string): Promise<vscode.Uri | undefined> => undefined);
	override handleRequestCompleted = vi.fn(async () => { });
	override getWorktreeRepository(sessionId: string): Promise<RepoContext | undefined> {
		return Promise.resolve(undefined);
	}
}

class FakeChatSessionWorktreeCheckpointService extends mock<IChatSessionWorktreeCheckpointService>() {
	constructor() {
		super();
	}
	override handleRequest = vi.fn(async () => { });
	override handleRequestCompleted = vi.fn(async () => { });
}


class FakeModels {
	_serviceBrand: undefined;
	resolveModel = vi.fn(async (modelId: string) => modelId);
	getDefaultModel = vi.fn(async () => 'base');
	getModels = vi.fn(async () => [{ id: 'base', name: 'Base', maxContextWindowTokens: 128000, supportsVision: false }] as CopilotCLIModelInfo[]);
	setDefaultModel = vi.fn(async () => { });
	registerLanguageModelChatProvider = vi.fn();
	toModelProvider = vi.fn((id: string) => id); // passthrough
}

class FakeGitService extends mock<IGitService>() {
	override activeRepository = { get: () => undefined } as unknown as IGitService['activeRepository'];
	override onDidFinishInitialization = Event.None;
	override onDidOpenRepository = Event.None;
	override repositories: RepoContext[] = [];
	private _recentRepositories: { rootUri: vscode.Uri; lastAccessTime: number }[] = [];
	setRepo(repos: RepoContext) {
		this.repositories = [repos];
	}
	override async getRepository(uri: URI, forceOpen?: boolean): Promise<RepoContext | undefined> {
		if (this.repositories.length === 1) {
			return Promise.resolve(this.repositories[0]);
		}
		return undefined;
	}
	override getRecentRepositories = vi.fn((): { rootUri: vscode.Uri; lastAccessTime: number }[] => {
		return this._recentRepositories;
	});
	setTestRecentRepositories(repos: { rootUri: vscode.Uri; lastAccessTime: number }[]): void {
		this._recentRepositories = repos;
	}
}

// Cloud provider fake for delegate scenario
class FakeCloudProvider extends mock<CopilotCloudSessionsProvider>() {
	override delegate = vi.fn(async () => ({
		uri: vscode.Uri.parse('pr://1'),
		title: 'PR Title',
		description: 'PR Description',
		author: 'Test Author',
		linkTag: '#1'
	})) as unknown as CopilotCloudSessionsProvider['delegate'];
}


function createChatContext(sessionId: string, isUntitled: boolean, ...requests: TestChatRequest[]): vscode.ChatContext {
	const resource = vscode.Uri.from({ scheme: 'copilotcli', path: `/${sessionId}` });
	for (const request of requests) {
		request.sessionResource = resource;
	}
	return {
		history: [],
		yieldRequested: false,
		chatSessionContext: {
			chatSessionItem: { resource, label: 'temp' } as vscode.ChatSessionItem,
			isUntitled
		} as vscode.ChatSessionContext,
	} as vscode.ChatContext;
}

class TestCopilotCLISession extends CopilotCLISession {
	public requests: Array<{ input: CopilotCLISessionInput; attachments: Attachment[]; model: { model: string; reasoningEffort?: string } | undefined; authInfo: NonNullable<SessionOptions['authInfo']>; token: vscode.CancellationToken }> = [];
	public static nextHandleRequestResult: Promise<void> | undefined;
	public static handleRequestHook: ((request: { id: string; toolInvocationToken: vscode.ChatParticipantToolToken; sessionResource?: vscode.Uri }, input: CopilotCLISessionInput) => Promise<void>) | undefined;
	public static statusOverride?: vscode.ChatSessionStatus;
	override get status(): vscode.ChatSessionStatus | undefined {
		return TestCopilotCLISession.statusOverride;
	}
	override handleRequest(request: { id: string; toolInvocationToken: vscode.ChatParticipantToolToken; sessionResource?: vscode.Uri }, input: CopilotCLISessionInput, attachments: Attachment[], model: { model: string; reasoningEffort?: string } | undefined, authInfo: NonNullable<SessionOptions['authInfo']>, token: vscode.CancellationToken): Promise<void> {
		this.requests.push({ input, attachments, model, authInfo, token });
		if (TestCopilotCLISession.handleRequestHook) {
			return TestCopilotCLISession.handleRequestHook(request, input);
		}
		return TestCopilotCLISession.nextHandleRequestResult ?? Promise.resolve();
	}
}


class FakeCopilotCLISessionService extends mock<ICopilotCLISessionService>() {
	private _sessionWorkingDirs = new Map<string, vscode.Uri>();
	override tryGetPartialSessionHistory: ICopilotCLISessionService['tryGetPartialSessionHistory'] = vi.fn(async () => undefined);

	override getSessionWorkingDirectory = vi.fn((sessionId: string): vscode.Uri | undefined => {
		return this._sessionWorkingDirs.get(sessionId);
	});

	setTestSessionWorkingDirectory(sessionId: string, uri: vscode.Uri): void {
		this._sessionWorkingDirs.set(sessionId, uri);
	}
}

describe('CopilotCLIChatSessionParticipant.handleRequest', () => {
	const disposables = new DisposableStore();
	let promptResolver: CopilotCLIPromptResolver;
	let itemProvider: CopilotCLIChatSessionItemProvider;
	let cloudProvider: FakeCloudProvider;
	let summarizer: ChatSummarizerProvider;
	let worktree: FakeChatSessionWorktreeService;
	let worktreeCheckpointService: FakeChatSessionWorktreeCheckpointService;
	let workspaceFolderService: FakeChatSessionWorkspaceFolderService;
	let git: FakeGitService;
	let models: FakeModels;
	let sessionService: CopilotCLISessionService;
	let telemetry: ITelemetryService;
	let tools: FakeToolsService;
	let participant: CopilotCLIChatSessionParticipant;
	let workspaceService: IWorkspaceService;
	let instantiationService: IInstantiationService;
	let logService: ILogService;
	let configurationService: InMemoryConfigurationService;
	let manager: MockCliSdkSessionManager;
	let mcpHandler: ICopilotCLIMCPHandler;
	let folderRepositoryManager: CopilotCLIFolderRepositoryManager;
	let cliSessionServiceForFolderManager: FakeCopilotCLISessionService;
	let contentProvider: CopilotCLIChatSessionContentProvider;
	let sdk: ICopilotCLISDK;
	let customSessionTitleService: CustomSessionTitleService;
	const cliSessions: TestCopilotCLISession[] = [];

	beforeEach(async () => {
		cliSessions.length = 0;
		TestCopilotCLISession.nextHandleRequestResult = undefined;
		TestCopilotCLISession.handleRequestHook = undefined;
		TestCopilotCLISession.statusOverride = undefined;
		// By default, simulate VS Code core opening the delegated session and
		// re-invoking handleRequest with the copilotcli:// resource. This matches
		// the production flow where executeCommand opens the session.
		// The chatSessionContext lost workaround tests override this.
		mockExecuteCommand.mockImplementation(async (command: string, args: any) => {
			if (command === 'workbench.action.chat.openSessionWithPrompt.copilotcli') {
				const callbackRequest = new TestChatRequest(args.prompt);
				callbackRequest.sessionResource = args.resource;
				const callbackContext = createChatContext(args.resource.path.slice(1), false, callbackRequest);
				const callbackStream = new MockChatResponseStream();
				const callbackToken = disposables.add(new CancellationTokenSource()).token;
				await participant.createHandler()(callbackRequest, callbackContext, callbackStream, callbackToken);
			}
		});
		sdk = {
			getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, createLocalFeatureFlagService: () => ({}), noopTelemetryBinder: {} })),
			getAuthInfo: vi.fn(async () => ({ type: 'token' as const, token: 'valid-token', host: 'https://github.com' })),
		} as unknown as ICopilotCLISDK;
		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		disposables.add(accessor);
		promptResolver = new class extends mock<CopilotCLIPromptResolver>() {
			override resolvePrompt = vi.fn(async (request: vscode.ChatRequest, prompt: string | undefined, _additionalReferences: vscode.ChatPromptReference[], _workspaceInfo: IWorkspaceInfo, _additionalWorkspaces: IWorkspaceInfo[], _token: vscode.CancellationToken) => {
				return { prompt: prompt ?? request.prompt, attachments: [], references: [] };
			});
		}();
		itemProvider = new class extends mock<CopilotCLIChatSessionItemProvider>() {
			override swap = vi.fn();
			override notifySessionsChange = vi.fn();
			override untitledSessionIdMapping = new Map<string, string>();
			override sdkToUntitledUriMapping = new Map<string, Uri>();
			override isNewSession = vi.fn((_session: string) => false);
			override detectPullRequestOnSessionOpen = vi.fn(async () => { });
		}();
		cloudProvider = new FakeCloudProvider();
		summarizer = new class extends mock<ChatSummarizerProvider>() {
			override provideChatSummary(_context: vscode.ChatContext) { return Promise.resolve('summary text'); }
		}();
		worktree = new FakeChatSessionWorktreeService();
		worktreeCheckpointService = new FakeChatSessionWorktreeCheckpointService();
		workspaceFolderService = new FakeChatSessionWorkspaceFolderService();
		git = new FakeGitService();
		models = new FakeModels();
		cliSessionServiceForFolderManager = new FakeCopilotCLISessionService();
		telemetry = new NullTelemetryService();
		tools = new FakeToolsService();
		workspaceService = new NullWorkspaceService([URI.file('/workspace')]);
		const logger = accessor.get(ILogService);
		logService = accessor.get(ILogService);
		mcpHandler = new class extends mock<ICopilotCLIMCPHandler>() {
			override loadMcpConfig = vi.fn(async () => {
				return { mcpConfig: undefined, disposable: Disposable.None };
			});
		}();
		const delegationService = new class extends mock<IChatDelegationSummaryService>() {
			override async summarize(context: vscode.ChatContext, token: vscode.CancellationToken): Promise<string | undefined> {
				return undefined;
			}
		}();
		const fileSystem = new MockFileSystemService();
		class FakeUserQuestionHandler implements IUserQuestionHandler {
			_serviceBrand: undefined;
			async askUserQuestion(question: IQuestion, toolInvocationToken: vscode.ChatParticipantToolToken, token: vscode.CancellationToken): Promise<IQuestionAnswer | undefined> {
				return undefined;
			}
		}

		instantiationService = {
			invokeFunction<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
				return fn(accessor, ...args);
			},
			createInstance: (ctor: unknown, workspaceInfo: any, agentName: any, sdkSession: any) => {
				if (ctor === CopilotCLISessionWorkspaceTracker) {
					return new class extends mock<CopilotCLISessionWorkspaceTracker>() {
						override async initialize(): Promise<void> { return; }
						override shouldShowSession(_sessionId: string): { isOldGlobalSession?: boolean; isWorkspaceSession?: boolean } {
							return { isOldGlobalSession: false, isWorkspaceSession: true };
						}
					}();
				}
				const session = new TestCopilotCLISession(workspaceInfo, agentName, sdkSession, [], logService, workspaceService, new MockChatSessionMetadataStore(), instantiationService, new NullRequestLogger(), new NullICopilotCLIImageSupport(), new FakeToolsService(), new FakeUserQuestionHandler(), accessor.get(IConfigurationService), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new MockRunCommandExecutionService(), new FakeGitService());
				cliSessions.push(session);
				return disposables.add(session);
			}
		} as unknown as IInstantiationService;
		customSessionTitleService = new CustomSessionTitleService(new MockExtensionContext() as unknown as IVSCodeExtensionContext, accessor.get(IInstantiationService), logService, new MockChatSessionMetadataStore());
		sessionService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), fileSystem, mcpHandler, new NullCopilotCLIAgents(), workspaceService, customSessionTitleService, accessor.get(IConfigurationService), new MockSkillLocations(), delegationService, new MockChatSessionMetadataStore(), { _serviceBrand: undefined, isAgentSessionsWorkspace: false } as IAgentSessionsWorkspace, workspaceFolderService, worktree, new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));

		manager = await sessionService.getSessionManager() as unknown as MockCliSdkSessionManager;
		contentProvider = new class extends mock<CopilotCLIChatSessionContentProvider>() {
			override notifySessionOptionsChange = vi.fn((_resource: vscode.Uri, _updates: ReadonlyArray<{ optionId: string; value: string | vscode.ChatSessionProviderOptionItem }>): void => {
				// tracked by vi.fn
			});
		}();
		folderRepositoryManager = new CopilotCLIFolderRepositoryManager(
			worktree,
			workspaceFolderService,
			cliSessionServiceForFolderManager as unknown as ICopilotCLISessionService,
			git,
			workspaceService,
			logService,
			tools,
			fileSystem
		);

		instantiationService = accessor.get(IInstantiationService);
		configurationService = accessor.get(IConfigurationService) as InMemoryConfigurationService;
		await configurationService.setConfig(ConfigKey.Advanced.CLIBranchSupport, true);

		participant = new CopilotCLIChatSessionParticipant(
			contentProvider,
			promptResolver,
			itemProvider,
			cloudProvider,
			undefined,
			git,
			models as unknown as ICopilotCLIModels,
			new NullCopilotCLIAgents(),
			sessionService,
			worktree,
			worktreeCheckpointService,
			workspaceFolderService,
			telemetry,
			logger,
			disposables.add(new MockPromptsService()),
			delegationService,
			folderRepositoryManager,
			configurationService,
			sdk,
			new MockChatSessionMetadataStore(),
			customSessionTitleService,
			new (mock<IOctoKitService>())(),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		disposables.clear();
	});

	it('creates new session for untitled context and invokes request', async () => {
		const request = new TestChatRequest('Say hi');
		const context = createChatContext('temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;
		const authInfo = await sdk.getAuthInfo();
		expect(cliSessions.length).toBe(0);

		await participant.createHandler()(request, context, stream, token);

		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0]).toEqual({ input: { prompt: 'Say hi' }, attachments: [], model: { model: 'base' }, authInfo, token });
	});

	it('uses worktree workingDirectory when isolation is enabled for a new untitled session', async () => {
		const worktreeProperties = {
			autoCommit: true,
			baseCommit: 'deadbeef',
			branchName: 'test',
			repositoryPath: `${sep}repo`,
			worktreePath: `${sep}worktree`,
			version: 1
		} satisfies ChatSessionWorktreeProperties;
		// Set up untitled session folder
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}repo`));
		// Configure git to return repository for the folder
		git.setRepo({ rootUri: Uri.file(`${sep}repo`), remotes: [], kind: 'repository' } as unknown as RepoContext);
		// Configure worktree service to return worktree properties when createWorktree is called
		(worktree.createWorktree as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(worktreeProperties);

		const request = new TestChatRequest('Say hi');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].workspace.worktreeProperties).toBeDefined();
		expect(getWorkingDirectory(cliSessions[0].workspace)?.fsPath).toBe(`${sep}worktree`);
		expect(mcpHandler.loadMcpConfig).toHaveBeenCalled();
		// Prompt resolver should receive the effective workingDirectory.
		expect(promptResolver.resolvePrompt).toHaveBeenCalled();
		expect(getWorkingDirectory((promptResolver.resolvePrompt as unknown as ReturnType<typeof vi.fn>).mock.calls[0][3])?.fsPath).toBe(`${sep}worktree`);
	});

	it('falls back to workspace workingDirectory when isolation is enabled but worktree creation fails', async () => {
		// Set up untitled session folder (no git repo)
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}workspace`));
		// Git returns no repository for this folder (default FakeGitService behavior)
		const request = new TestChatRequest('Say hi');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].workspace.worktreeProperties).toBeUndefined();
		expect(getWorkingDirectory(cliSessions[0].workspace)?.fsPath).toBe(`${sep}workspace`);
		expect(mcpHandler.loadMcpConfig).toHaveBeenCalled();
		// Prompt resolver should receive the effective workingDirectory.
		expect(promptResolver.resolvePrompt).toHaveBeenCalled();
		expect(getWorkingDirectory((promptResolver.resolvePrompt as unknown as ReturnType<typeof vi.fn>).mock.calls[0][3])?.fsPath).toBe(`${sep}workspace`);
	});

	it('reuses existing session (non-untitled) and does not create new one', async () => {
		const sessionId = 'existing-123';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		const authInfo = await sdk.getAuthInfo();
		const request = new TestChatRequest('Continue');
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		expect(cliSessions.length).toBe(0);

		await participant.createHandler()(request, context, stream, token);

		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].sessionId).toBe(sessionId);
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0]).toEqual({ input: { prompt: 'Continue' }, attachments: [], model: { model: 'base' }, authInfo, token });

		expect(itemProvider.swap).not.toHaveBeenCalled();
	});

	it('maps known slash commands to CLI command input for existing sessions', async () => {
		const sessionId = 'existing-compact';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		const request = new TestChatRequest('');
		request.command = 'compact';
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests).toHaveLength(1);
		expect(cliSessions[0].requests[0].input).toEqual({ command: 'compact', prompt: '' });
		expect(promptResolver.resolvePrompt).not.toHaveBeenCalled();
	});

	it.skip('returns early when yield is requested while the session is still running', async () => {
		const sessionId = 'existing-yield';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		let resolveHandleRequest!: () => void;
		let yieldRequested = false;
		TestCopilotCLISession.nextHandleRequestResult = new Promise<void>(resolve => {
			resolveHandleRequest = resolve;
		});

		const request = new TestChatRequest('Continue');
		const context = createChatContext(sessionId, false, request) as vscode.ChatContext & { history: []; readonly yieldRequested: boolean };
		Object.defineProperty(context, 'history', {
			value: [],
			configurable: true,
		});
		Object.defineProperty(context, 'yieldRequested', {
			get: () => yieldRequested,
			configurable: true,
		});
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;
		let resolved = false;

		const handlerPromise = (async () => {
			await participant.createHandler()(request, context, stream, token);
			resolved = true;
		})();
		await new Promise(resolve => setTimeout(resolve, 50));
		expect(resolved).toBe(false);

		yieldRequested = true;
		await new Promise(resolve => setTimeout(resolve, 600));
		expect(resolved).toBe(true);

		resolveHandleRequest();
		await handlerPromise;
	});

	it('defers worktree handleRequestCompleted until all steering requests complete', async () => {
		// Use an existing (non-untitled) session so both concurrent requests are guaranteed to
		// resolve to the same SDK session and share the same pendingRequestBySession entry.
		const sessionId = 'existing-worktree-session';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);

		const worktreeProperties = {
			autoCommit: true,
			baseCommit: 'deadbeef',
			branchName: 'test',
			repositoryPath: `${sep}repo`,
			worktreePath: `${sep}worktree`,
			version: 1
		} satisfies ChatSessionWorktreeProperties;
		// FolderRepositoryManagerImpl.getFolderRepository checks worktreeService.getWorktreeProperties(sessionId)
		// when the session ID is not an untitled ID.
		(worktree.getWorktreeProperties as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(worktreeProperties);
		// Simulate the session completing so the worktree commit path runs
		TestCopilotCLISession.statusOverride = vscode.ChatSessionStatus.Completed;

		let resolveFirst!: () => void;
		const firstDeferred = new Promise<void>(resolve => { resolveFirst = resolve; });
		let resolveSecond!: () => void;
		const secondDeferred = new Promise<void>(resolve => { resolveSecond = resolve; });

		TestCopilotCLISession.handleRequestHook = vi.fn((_request, input) => {
			if (input.prompt === 'First') { return firstDeferred; }
			return secondDeferred;
		});

		const context = createChatContext(sessionId, false);
		const sessionResource = vscode.Uri.from({ scheme: 'copilotcli', path: `/${sessionId}` });
		const stream = new MockChatResponseStream();

		const firstRequest = new TestChatRequest('First');
		firstRequest.sessionResource = sessionResource;
		const firstToken = disposables.add(new CancellationTokenSource()).token;
		const firstPromise = participant.createHandler()(firstRequest, context, stream, firstToken);

		const secondRequest = new TestChatRequest('Second');
		secondRequest.sessionResource = sessionResource;
		const secondToken = disposables.add(new CancellationTokenSource()).token;
		const secondPromise = participant.createHandler()(secondRequest, context, stream, secondToken);

		// Second (steering) request completes first — commit must NOT fire while first is still pending
		resolveSecond();
		await secondPromise;
		expect(worktree.handleRequestCompleted).not.toHaveBeenCalled();

		// First request completes last — commit fires exactly once
		resolveFirst();
		await firstPromise;
		expect(worktree.handleRequestCompleted).toHaveBeenCalledTimes(1);
	});

	it('defers untitled session swap while a steering request is still pending', async () => {
		(itemProvider.isNewSession as ReturnType<typeof vi.fn>).mockImplementation((sessionId: string) => sessionId.startsWith('untitled:'));
		let resolveFirstRequest!: () => void;
		const firstRequestDeferred = new Promise<void>(resolve => {
			resolveFirstRequest = resolve;
		});
		let resolveSteeringRequest1!: () => void;
		const steeringRequestDeferred1 = new Promise<void>(resolve => {
			resolveSteeringRequest1 = resolve;
		});
		let resolveSteeringRequest2!: () => void;
		const steeringRequestDeferred2 = new Promise<void>(resolve => {
			resolveSteeringRequest2 = resolve;
		});
		let resolveSteeringRequest3!: () => void;
		const steeringRequestDeferred3 = new Promise<void>(resolve => {
			resolveSteeringRequest3 = resolve;
		});
		TestCopilotCLISession.handleRequestHook = vi.fn((_request, input) => {
			if (input.prompt === 'First request') {
				return firstRequestDeferred;
			}
			if (input.prompt === 'Steering request 1') {
				return steeringRequestDeferred1;
			}
			if (input.prompt === 'Steering request 2') {
				return steeringRequestDeferred2;
			}
			if (input.prompt === 'Steering request 3') {
				return steeringRequestDeferred3;
			}
			return Promise.resolve();
		});

		const context = createChatContext('untitled:temp-steering', true);
		const steeringSessionResource = vscode.Uri.from({ scheme: 'copilotcli', path: '/untitled:temp-steering' });
		const stream = new MockChatResponseStream();

		const firstRequest = new TestChatRequest('First request');
		firstRequest.sessionResource = steeringSessionResource;
		const firstToken = disposables.add(new CancellationTokenSource()).token;
		const firstPromise = participant.createHandler()(firstRequest, context, stream, firstToken);

		const secondRequest = new TestChatRequest('Steering request 1');
		secondRequest.sessionResource = steeringSessionResource;
		const secondToken = disposables.add(new CancellationTokenSource()).token;
		const secondPromise = participant.createHandler()(secondRequest, context, stream, secondToken);

		const thirdRequest = new TestChatRequest('Steering request 2');
		thirdRequest.sessionResource = steeringSessionResource;
		const thirdToken = disposables.add(new CancellationTokenSource()).token;
		const thirdPromise = participant.createHandler()(thirdRequest, context, stream, thirdToken);

		const fourthRequest = new TestChatRequest('Steering request 3');
		fourthRequest.sessionResource = steeringSessionResource;
		const fourthToken = disposables.add(new CancellationTokenSource()).token;
		const fourthPromise = participant.createHandler()(fourthRequest, context, stream, fourthToken);

		resolveFirstRequest();
		await firstPromise;

		expect(itemProvider.swap).not.toHaveBeenCalled();

		resolveSteeringRequest1();
		await secondPromise;

		expect(itemProvider.swap).not.toHaveBeenCalled();

		resolveSteeringRequest2();
		await thirdPromise;

		expect(itemProvider.swap).not.toHaveBeenCalled();

		const otherSessionId = 'existing-unblocked-session';
		manager.sessions.set(otherSessionId, new MockCliSdkSession(otherSessionId, new Date()));
		const otherContext = createChatContext(otherSessionId, false);
		const otherRequest = new TestChatRequest('Request from other session');
		otherRequest.sessionResource = vscode.Uri.from({ scheme: 'copilotcli', path: `/${otherSessionId}` });
		const otherStream = new MockChatResponseStream();
		const otherToken = disposables.add(new CancellationTokenSource()).token;
		const otherRequestPromise = participant.createHandler()(otherRequest, otherContext, otherStream, otherToken);
		const otherResult = await Promise.race([
			Promise.resolve(otherRequestPromise).then(() => 'done'),
			new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 75))
		]);
		expect(otherResult).toBe('done');

		expect(itemProvider.swap).not.toHaveBeenCalled();

		resolveSteeringRequest3();
		await fourthPromise;

		expect(itemProvider.swap).toHaveBeenCalledTimes(1);
	});

	it('hydrates invalid sessions from partial history and blocks follow-up requests', async () => {
		const sessionId = 'invalid-session';
		const invalidSessionService = new class extends FakeCopilotCLISessionService {
			override getSession = vi.fn(async () => {
				throw new Error('Failed to load session. Unknown event type: custom.unknown.');
			});
			override getChatHistory = vi.fn(async () => {
				throw new Error('Failed to load session. Unknown event type: custom.unknown.');
			}) as unknown as ICopilotCLISessionService['getChatHistory'];
			override createSession = vi.fn(async () => {
				throw new Error('createSession should not be called for invalid sessions');
			});
			override tryGetPartialSessionHistory: ICopilotCLISessionService['tryGetPartialSessionHistory'] = vi.fn(async () => ([{} as unknown as vscode.ChatRequestTurn, {} as unknown as vscode.ChatResponseTurn]));
		}();
		invalidSessionService.setTestSessionWorkingDirectory(sessionId, Uri.file(`${sep}workspace`));
		const invalidContentProvider = new CopilotCLIChatSessionContentProvider(
			itemProvider,
			new NullCopilotCLIAgents(),
			invalidSessionService,
			worktree,
			workspaceService,
			new MockFileSystemService(),
			git,
			folderRepositoryManager,
			configurationService,
			customSessionTitleService,
			new MockExtensionContext() as unknown as IVSCodeExtensionContext,
			logService,
			new (mock<IChatFolderMruService>())(),
		);
		const invalidParticipant = new CopilotCLIChatSessionParticipant(
			invalidContentProvider,
			promptResolver,
			itemProvider,
			cloudProvider,
			undefined,
			git,
			models as unknown as ICopilotCLIModels,
			new NullCopilotCLIAgents(),
			invalidSessionService,
			worktree,
			worktreeCheckpointService,
			workspaceFolderService,
			telemetry,
			logService,
			disposables.add(new MockPromptsService()),
			new class extends mock<IChatDelegationSummaryService>() {
				override async summarize(_context: vscode.ChatContext, _token: vscode.CancellationToken): Promise<string | undefined> {
					return undefined;
				}
			}(),
			folderRepositoryManager,
			configurationService,
			sdk,
			new MockChatSessionMetadataStore(),
			customSessionTitleService,
			new (mock<IOctoKitService>())(),
		);
		const sessionResource = vscode.Uri.from({ scheme: 'copilotcli', path: `/${sessionId}` });
		const contentToken = disposables.add(new CancellationTokenSource()).token;

		const sessionContent = await invalidContentProvider.provideChatSessionContentForExistingSession(sessionResource, contentToken);

		expect(sessionContent.history).toHaveLength(2);
		expect(invalidSessionService.tryGetPartialSessionHistory).toHaveBeenCalledWith(sessionId);

		(invalidSessionService.getSession as ReturnType<typeof vi.fn>).mockClear();
		(invalidSessionService.createSession as ReturnType<typeof vi.fn>).mockClear();
		(invalidSessionService.tryGetPartialSessionHistory as ReturnType<typeof vi.fn>).mockClear();
		const request = new TestChatRequest('Continue from VS Code');
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const requestToken = disposables.add(new CancellationTokenSource()).token;

		await invalidParticipant.createHandler()(request, context, stream, requestToken);

		const output = stream.output.join('\n');
		expect(output).toContain('Failed loading this session');
		expect(output).toContain('report an issue');
		// The error message is appended via MarkdownString.appendText which encodes spaces as &nbsp;
		expect(output).toContain('Failed&nbsp;to&nbsp;load&nbsp;session');
		expect(invalidSessionService.getSession).not.toHaveBeenCalled();
		expect(invalidSessionService.createSession).not.toHaveBeenCalled();
	});

	it('handles /delegate command for existing session (no session.handleRequest)', async () => {
		const sessionId = 'existing-123';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);

		git.activeRepository = { get: () => ({ changes: { indexChanges: [{ path: 'file.ts' }] } }) } as unknown as IGitService['activeRepository'];
		const request = new TestChatRequest('Build feature');
		request.command = 'delegate';
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;
		expect(cliSessions.length).toBe(0);

		await participant.createHandler()(request, context, stream, token);

		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].sessionId).toBe(sessionId);
		expect(cliSessions[0].requests.length).toBe(0);
		expect(sdkSession.emittedEvents.length).toBe(2);
		expect(sdkSession.emittedEvents[0].event).toBe('user.message');
		expect(sdkSession.emittedEvents[0].content).toBe('/delegate Build feature');
		expect(sdkSession.emittedEvents[1].event).toBe('assistant.message');
		expect(sdkSession.emittedEvents[1].content).toContain('pr://1');
		// Uncommitted changes warning surfaced
		// Warning should appear (we emitted stream.warning). The mock stream only records markdown.
		// Delegate path adds assistant PR metadata; ensure output contains PR metadata tag instead of relying on warning capture.
		expect(sdkSession.emittedEvents[1].content).toMatch(/<pr_metadata uri="pr:\/\/1"/);
		expect(cloudProvider.delegate).toHaveBeenCalled();
	});

	it('handles /delegate command from another chat (has uncommitted changes and user copies changes)', async () => {
		expect(manager.sessions.size).toBe(0);
		const repoContext = { rootUri: Uri.file(`${sep}workspace`), changes: { indexChanges: [{ path: 'file.ts' }], workingTree: [] } } as unknown as RepoContext;
		git.activeRepository = { get: () => repoContext } as unknown as IGitService['activeRepository'];
		git.setRepo(repoContext);
		tools.nextConfirmationButton = 'Copy Changes';
		const request = new TestChatRequest('/delegate Build feature');
		const context = { chatSessionContext: undefined } as vscode.ChatContext;
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// With the awaitable confirmation, the session should be created in a single request
		expect(manager.sessions.size).toBe(1);
		const delegateCallArgs = (tools.invokeTool as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(delegateCallArgs[0]).toBe('vscode_get_modified_files_confirmation');
		expect(delegateCallArgs[1].input.title).toBe('Delegate to Copilot CLI');
		expect(delegateCallArgs[1].input.modifiedFiles).toHaveLength(1);
		expect(delegateCallArgs[1].input.modifiedFiles[0].uri.toString()).toBe(Uri.file(`${sep}workspace${sep}file.ts`).toString());
		expect(delegateCallArgs[2]).toBe(token);
	});

	it('handles /delegate command from another chat without active repository', async () => {
		expect(manager.sessions.size).toBe(0);
		const request = new TestChatRequest('/delegate Build feature');
		const context = { chatSessionContext: undefined } as vscode.ChatContext;
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		expect(manager.sessions.size).toBe(1);
		// No confirmation should be invoked when there are no uncommitted changes
		expect(tools.invokeTool).not.toHaveBeenCalled();
	});

	it('handles /delegate command for new session without uncommitted changes', async () => {
		expect(manager.sessions.size).toBe(0);
		git.activeRepository = { get: () => ({ changes: { indexChanges: [], workingTree: [] } }) } as unknown as IGitService['activeRepository'];
		const request = new TestChatRequest('Build feature');
		request.command = 'delegate';
		const context = createChatContext('existing-delegate', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		expect(manager.sessions.size).toBe(1);
		const sdkSession = Array.from(manager.sessions.values())[0];
		expect(cloudProvider.delegate).toHaveBeenCalled();
		// PR metadata recorded
		expect(sdkSession.emittedEvents.length).toBe(2);
		expect(sdkSession.emittedEvents[0].event).toBe('user.message');
		expect(sdkSession.emittedEvents[0].content).toBe('/delegate Build feature');
		expect(sdkSession.emittedEvents[1].event).toBe('assistant.message');
		expect(sdkSession.emittedEvents[1].content).toContain('pr://1');
		// Warning should appear (we emitted stream.warning). The mock stream only records markdown.
		// Delegate path adds assistant PR metadata; ensure output contains PR metadata tag instead of relying on warning capture.
		expect(sdkSession.emittedEvents[1].content).toMatch(/<pr_metadata uri="pr:\/\/1"/);
	});

	it('starts a new chat session and submits the request', async () => {
		const request = new TestChatRequest('Push this');
		(request as Record<string, any>).model = mockLanguageModelChat;
		const context = { chatSessionContext: undefined, chatSummary: undefined } as unknown as vscode.ChatContext;
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;
		const summarySpy = vi.spyOn(summarizer, 'provideChatSummary');

		await participant.createHandler()(request, context, stream, token);

		expect(manager.sessions.size).toBe(1);
		expect(summarySpy).toHaveBeenCalledTimes(0);
		// Delegation creates the session and fires executeCommand (fire-and-forget).
		// The request is processed asynchronously when VS Code opens the session.
		expect(mockExecuteCommand).toHaveBeenCalledWith(
			'workbench.action.chat.openSessionWithPrompt.copilotcli',
			expect.objectContaining({
				prompt: 'Push this',
			})
		);
	});

	it('handles existing session with acceptedConfirmationData (no longer triggers cloud delegation)', async () => {
		// With the new flow, acceptedConfirmationData is no longer used for uncommitted changes.
		// Existing sessions proceed directly to handleRequest without confirmation flow.
		const sessionId = 'existing-confirm';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		const request = new TestChatRequest('my prompt');
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should call session.handleRequest normally
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'my prompt' });
	});

	it('handles existing session with rejectedConfirmationData (proceeds normally)', async () => {
		// With the new flow, rejectedConfirmationData is no longer used for uncommitted changes.
		const sessionId = 'existing-confirm-reject';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		const request = new TestChatRequest('Apply');
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should proceed normally (no cloud delegation)
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'Apply' });
	});

	it('handles existing session with unknown step acceptedConfirmationData (proceeds normally)', async () => {
		const sessionId = 'existing-confirm-unknown';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		const request = new TestChatRequest('Apply');
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should proceed normally
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests.length).toBe(1);
	});

	it('prompts for uncommitted changes action for untitled session with uncommitted changes', async () => {
		git.activeRepository = { get: () => ({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } }) } as unknown as IGitService['activeRepository'];
		git.setRepo({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } } as unknown as RepoContext);
		// Set up untitled session folder so getFolderRepository returns repository info
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}repo`));
		// User selects Copy Changes
		tools.nextConfirmationButton = 'Copy Changes';
		const request = new TestChatRequest('Fix the bug');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Session should be created in one request (no separate confirmation round-trip)
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'Fix the bug' });
		// Verify confirmation tool was invoked with the right title
		const confirmCallArgs = (tools.invokeTool as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(confirmCallArgs[0]).toBe('vscode_get_modified_files_confirmation');
		expect(confirmCallArgs[1].input.title).toBe('Uncommitted Changes');
		expect(confirmCallArgs[1].input.modifiedFiles).toHaveLength(1);
		expect(confirmCallArgs[1].input.modifiedFiles[0].uri.toString()).toBe(Uri.file(`${sep}repo${sep}file.ts`).toString());
		expect(confirmCallArgs[2]).toBe(token);
	});

	it('uses request prompt directly when user accepts uncommitted changes confirmation', async () => {
		git.activeRepository = { get: () => ({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } }) } as unknown as IGitService['activeRepository'];
		git.setRepo({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } } as unknown as RepoContext);
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}repo`));
		tools.nextConfirmationButton = 'Copy Changes';

		const request = new TestChatRequest('Fix the bug');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should create session and use request.prompt directly
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'Fix the bug' });
		// Verify promptResolver was called without override prompt
		expect(promptResolver.resolvePrompt).toHaveBeenCalled();
		expect((promptResolver.resolvePrompt as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBeUndefined();
	});

	it('uses request prompt for session label when swapping untitled session', async () => {
		git.activeRepository = { get: () => ({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } }) } as unknown as IGitService['activeRepository'];
		git.setRepo({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } } as unknown as RepoContext);
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}repo`));
		tools.nextConfirmationButton = 'Move Changes';

		const request = new TestChatRequest('Implement new feature');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should swap with request.prompt as label
		expect(itemProvider.swap).toHaveBeenCalled();
		const swapCall = (itemProvider.swap as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(swapCall[1].label).toBe('Implement new feature');
	});

	it('passes empty references array to resolvePrompt after confirmation', async () => {
		git.activeRepository = { get: () => ({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } }) } as unknown as IGitService['activeRepository'];
		git.setRepo({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } } as unknown as RepoContext);
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}repo`));
		tools.nextConfirmationButton = 'Copy Changes';

		const request = new TestChatRequest('Fix the bug');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should pass empty array to resolvePrompt (no metadata to recover from)
		expect(promptResolver.resolvePrompt).toHaveBeenCalled();
		const resolvePromptCall = (promptResolver.resolvePrompt as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(resolvePromptCall[2]).toEqual([]);
	});

	it('returns empty when user cancels untitled session confirmation', async () => {
		git.activeRepository = { get: () => ({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } }) } as unknown as IGitService['activeRepository'];
		git.setRepo({ rootUri: Uri.file(`${sep}repo`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } } as unknown as RepoContext);
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}repo`));
		// User clicks Cancel
		tools.nextConfirmationButton = 'Cancel';

		const request = new TestChatRequest('Fix the bug');
		const context = createChatContext('untitled:temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should not create session
		expect(cliSessions.length).toBe(0);
		expect(itemProvider.swap).not.toHaveBeenCalled();
	});

	it('does not prompt for confirmation for untitled session without uncommitted changes', async () => {
		git.activeRepository = { get: () => ({ changes: { indexChanges: [], workingTree: [] } }) } as unknown as IGitService['activeRepository'];

		const request = new TestChatRequest('Fix the bug');
		const context = createChatContext('temp-new', true, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should create session directly without confirmation
		expect(tools.invokeTool).not.toHaveBeenCalled();
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'Fix the bug' });
	});

	it('does not prompt for confirmation for existing (non-untitled) session with uncommitted changes', async () => {
		const sessionId = 'existing-123';
		const sdkSession = new MockCliSdkSession(sessionId, new Date());
		manager.sessions.set(sessionId, sdkSession);
		git.activeRepository = { get: () => ({ changes: { indexChanges: [{ path: 'file.ts' }], workingTree: [] } }) } as unknown as IGitService['activeRepository'];

		const request = new TestChatRequest('Continue work');
		const context = createChatContext(sessionId, false, request);
		const stream = new MockChatResponseStream();
		const token = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request, context, stream, token);

		// Should not prompt for confirmation for existing sessions
		expect(tools.invokeTool).not.toHaveBeenCalled();
		expect(cliSessions.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'Continue work' });
	});

	it('reuses untitled session without uncommitted changes instead of creating new session', async () => {
		git.activeRepository = { get: () => ({ changes: { indexChanges: [], workingTree: [] } }) } as unknown as IGitService['activeRepository'];

		// First request creates the session
		const request1 = new TestChatRequest('First request');
		const context1 = createChatContext('temp-new', true, request1);
		const stream1 = new MockChatResponseStream();
		const token1 = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request1, context1, stream1, token1);
		expect(cliSessions.length).toBe(1);
		const firstSessionId = cliSessions[0].sessionId;

		// Second request should reuse the same session (now it's not untitled anymore after first request)
		const request2 = new TestChatRequest('Second request');
		const context2 = createChatContext(firstSessionId, false, request2);
		const stream2 = new MockChatResponseStream();
		const token2 = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request2, context2, stream2, token2);

		// Session wrapper can be recreated, but the SDK session should be reused.
		expect(manager.sessions.size).toBe(1);
		expect(new Set(cliSessions.map(s => s.sessionId))).toEqual(new Set([firstSessionId]));
		expect(cliSessions.reduce((count, s) => count + s.requests.length, 0)).toBe(2);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'First request' });
		expect(cliSessions.at(-1)?.requests.at(-1)?.input).toEqual({ prompt: 'Second request' });
	});

	it('reuses untitled session after confirmation without creating new session', async () => {
		git.activeRepository = { get: () => ({ remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } }) } as unknown as IGitService['activeRepository'];
		git.setRepo({ rootUri: Uri.file(`${sep}workspace`), remotes: [], changes: { indexChanges: [{ path: 'file.ts' }], mergeChanges: [], workingTree: [], untrackedChanges: [] } } as unknown as RepoContext);
		// Set up untitled session folder so getFolderRepository returns repository info (for uncommitted changes check)
		folderRepositoryManager.setNewSessionFolder('untitled:temp-new', Uri.file(`${sep}workspace`));
		// User selects Copy Changes via the tools confirmation
		tools.nextConfirmationButton = 'Copy Changes';

		// First request creates the session (with confirmation handled inline)
		const request1 = new TestChatRequest('First request');
		const context1 = createChatContext('untitled:temp-new', true, request1);
		const stream1 = new MockChatResponseStream();
		const token1 = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request1, context1, stream1, token1);

		// Session should be created
		expect(cliSessions.length).toBe(1);
		const firstSessionId = cliSessions[0].sessionId;
		expect(cliSessions[0].requests.length).toBe(1);
		expect(cliSessions[0].requests[0].input).toEqual({ prompt: 'First request' });

		// Second request should reuse the same session
		const request2 = new TestChatRequest('Second request');
		const context2 = createChatContext(firstSessionId, false, request2);
		const stream2 = new MockChatResponseStream();
		const token2 = disposables.add(new CancellationTokenSource()).token;

		await participant.createHandler()(request2, context2, stream2, token2);

		// Session wrapper can be recreated, but the SDK session should be reused.
		expect(manager.sessions.size).toBe(1);
		expect(new Set(cliSessions.map(s => s.sessionId))).toEqual(new Set([firstSessionId]));
		expect(cliSessions.reduce((count, s) => count + s.requests.length, 0)).toBe(2);
		expect(cliSessions.at(-1)?.requests.at(-1)?.input).toEqual({ prompt: 'Second request' });
	});

	describe('Authorization check', () => {
		it('throws when auth token is empty and no proxy URL configured', async () => {
			(sdk.getAuthInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'token', token: '', host: 'https://github.com' });

			const request = new TestChatRequest('Say hi');
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await expect(participant.createHandler()(request, context, stream, token)).rejects.toThrow('Authorization failed');
			expect(cliSessions.length).toBe(0);
		});

		it('proceeds normally when auth token is valid', async () => {
			(sdk.getAuthInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'token', token: 'valid-token', host: 'https://github.com' });

			const request = new TestChatRequest('Say hi');
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			expect(cliSessions.length).toBe(1);
			expect(cliSessions[0].requests.length).toBe(1);
		});

		it('proceeds when auth type is not token even if token is empty', async () => {
			(sdk.getAuthInfo as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'oauth', token: '', host: 'https://github.com' });

			const request = new TestChatRequest('Say hi');
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			expect(cliSessions.length).toBe(1);
			expect(cliSessions[0].requests.length).toBe(1);
		});

		it('throws when getAuthInfo rejects', async () => {
			(sdk.getAuthInfo as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

			const request = new TestChatRequest('Say hi');
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await expect(participant.createHandler()(request, context, stream, token)).rejects.toThrow('Authorization failed');
			expect(cliSessions.length).toBe(0);
		});
	});

	describe('Repository option locking behavior', () => {
		it('locks repository option on request start for untitled sessions', async () => {
			// Setup folder repository manager to return valid folder data
			const sessionId = 'untitled:temp-lock';
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: Uri.file(`${sep}workspace`),
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify lock was called with locked: true before other operations
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);
		});

		it('does not lock repository option for existing (non-untitled) sessions', async () => {
			const sessionId = 'existing-lock-123';
			const sdkSession = new MockCliSdkSession(sessionId, new Date());
			manager.sessions.set(sessionId, sdkSession);

			const request = new TestChatRequest('Continue work');
			const context = createChatContext(sessionId, false, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify lock was NOT called (no calls with locked flag)
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBe(0);
		});

		it('unlocks repository option when user rejects trust check', async () => {
			const sessionId = 'untitled:temp-trust-fail';
			// Mock folderRepositoryManager to simulate trust rejection
			const mockGetFolderRepository = vi.fn(async () => ({
				trusted: false,
				folder: Uri.file(`${sep}workspace`)
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;
			// Trust rejection now happens in initializeFolderRepository (not in the removed hasUncommittedChangesToHandleInRequest)
			const mockInitializeFolderRepository = vi.fn(async () => ({
				trusted: false,
				folder: Uri.file(`${sep}workspace`),
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined
			}));
			(folderRepositoryManager.initializeFolderRepository as any) = mockInitializeFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify lock was called
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);

			// Verify unlock was called (value is string with no locked flag)
			const unlockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && typeof update.value === 'string')
			);
			expect(unlockCalls.length).toBeGreaterThan(0);

			// Verify no session was created due to trust rejection
			expect(cliSessions.length).toBe(0);
		});

		it('does not unlock repository option when user cancels confirmation', async () => {
			const sessionId = 'untitled:temp-cancel';
			git.activeRepository = {
				get: () => ({
					rootUri: Uri.file(`${sep}repo`),
					changes: { indexChanges: [{ path: 'file.ts' }], workingTree: [] }
				})
			} as unknown as IGitService['activeRepository'];
			git.setRepo({
				rootUri: Uri.file(`${sep}repo`),
				changes: { indexChanges: [{ path: 'file.ts' }], workingTree: [] }
			} as unknown as RepoContext);

			const mockGetFolderRepository = vi.fn(async () => ({
				repository: { rootUri: Uri.file(`${sep}repo`), kind: 'repository' } as unknown as RepoContext,
				folder: Uri.file(`${sep}repo`),
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			// User cancels the confirmation
			tools.nextConfirmationButton = 'Cancel';

			const request = new TestChatRequest('Fix bug');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify lock was called
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);

			// After cancel, there should be no unlock calls (repository option remains locked)
			const unlockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && typeof update.value === 'string')
			);
			expect(unlockCalls.length).toBe(0);

			// No session created due to cancellation
			expect(cliSessions.length).toBe(0);
		});

		it('does not unlock repository option when session creation fails', async () => {
			const sessionId = 'untitled:temp-fail';
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: Uri.file(`${sep}workspace`),
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			// Mock sessionService.createSession to return null
			const originalCreateSession = sessionService.createSession;
			(sessionService.createSession as any) = vi.fn(async () => undefined);

			try {
				await participant.createHandler()(request, context, stream, token);
			} finally {
				(sessionService.createSession as any) = originalCreateSession;
			}

			// Verify lock was called
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);

			// Verify unlock was NOT called on failure (session creation failed but workspace was trusted)
			const unlockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && typeof update.value === 'string')
			);
			expect(unlockCalls.length).toBe(0);

			// No session created due to failure
			expect(cliSessions.length).toBe(0);
		});

		it('keeps repository option locked throughout successful request flow', async () => {
			const sessionId = 'untitled:temp-success';
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: Uri.file(`${sep}workspace`),
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify lock was called
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);

			// Verify unlock was NOT called on successful completion
			const unlockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && typeof update.value === 'string')
			);
			expect(unlockCalls.length).toBe(0);

			// Verify session was created
			expect(cliSessions.length).toBe(1);
		});

		it('displays repo directory name (not parent workspace folder name) for sub-directory git repos in multi-root workspaces', async () => {
			// Bug scenario: multi-root workspace with folders A, B where B has sub-directories repo1, repo2.
			// When user selects repo2, the locked dropdown should display "repo2", not "B".
			const sessionId = 'untitled:temp-multiroot';
			const repoUri = Uri.file(`${sep}workspaces${sep}B${sep}repo2`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: { rootUri: repoUri, kind: 'repository' } as unknown as RepoContext,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify the locked option uses the repo name "repo2", not the parent workspace folder "B"
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);
			// When repository is available, toRepositoryOptionItem derives name from the repo URI path
			const repoLockUpdate = lockCalls.flatMap(call => call[1]).find(
				(update: any) => update.optionId === 'repository' && update.value?.locked === true
			);
			expect(repoLockUpdate.value.name).toBe('repo2');
			expect(repoLockUpdate.value.id).toBe(repoUri.fsPath);
		});

		it('displays folder basename (not workspace folder name) when locking a non-repo sub-directory folder', async () => {
			// When the selected folder is NOT a git repo but is a sub-directory of a workspace folder,
			// the locked dropdown should display the folder's basename, not the workspace folder name.
			const sessionId = 'untitled:temp-subfolder';
			const folderUri = Uri.file(`${sep}workspaces${sep}B${sep}subfolder`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: folderUri,
				repository: undefined,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Verify the locked option uses basename "subfolder", not workspace folder name "B"
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			expect(lockCalls.length).toBeGreaterThan(0);
			const folderLockUpdate = lockCalls.flatMap(call => call[1]).find(
				(update: any) => update.optionId === 'repository' && update.value?.locked === true
			);
			expect(folderLockUpdate.value.name).toBe('subfolder');
			expect(folderLockUpdate.value.id).toBe(folderUri.fsPath);
			// Non-repo folder should use folder icon
			expect(folderLockUpdate.value.icon.id).toBe('folder');
		});

		it('uses repo icon for repository and folder icon for plain folder when locking', async () => {
			// Verify icon differentiation: repo gets 'repo' icon, plain folder gets 'folder' icon
			const sessionId = 'untitled:temp-icon';
			const repoUri = Uri.file(`${sep}workspace${sep}myrepo`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: { rootUri: repoUri, kind: 'repository' } as unknown as RepoContext,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const repoLockUpdate = allCalls.flatMap(call => call[1]).find(
				(update: any) => update.optionId === 'repository' && update.value?.locked === true
			);
			// Repository should use 'repo' icon
			expect(repoLockUpdate.value.icon.id).toBe('repo');
		});

		it('eagerly re-locks repo option with accurate info after session creation for untitled sessions', async () => {
			// The new code at line ~735 fires `void this.lockRepoOptionForSession(context, token)`
			// after session creation to update the locked dropdown with more accurate info.
			const sessionId = 'untitled:temp-eager-lock';
			const repoUri = Uri.file(`${sep}workspace${sep}myrepo`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: { rootUri: repoUri, kind: 'repository' } as unknown as RepoContext,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// There should be multiple lock calls: one initial lock and one eager re-lock after session creation.
			// The eager lock should contain the updated repo information.
			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const lockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'repository' && update.value?.locked === true)
			);
			// Expect at least 2 lock calls (initial lock + eager re-lock after session creation)
			expect(lockCalls.length).toBeGreaterThanOrEqual(2);

			// The last lock call should have the accurate repo information
			const lastLockCall = lockCalls[lockCalls.length - 1];
			const lastLockUpdate = lastLockCall[1].find(
				(update: any) => update.optionId === 'repository' && update.value?.locked === true
			);
			expect(lastLockUpdate.value.name).toBe('myrepo');
			expect(lastLockUpdate.value.id).toBe(repoUri.fsPath);
		});

		it('locks with submodule/archive icon for submodule repositories', async () => {
			const sessionId = 'untitled:temp-submodule';
			const repoUri = Uri.file(`${sep}workspace${sep}submodule-repo`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: { rootUri: repoUri, kind: 'submodule' } as unknown as RepoContext,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const repoLockUpdate = allCalls.flatMap(call => call[1]).find(
				(update: any) => update.optionId === 'repository' && update.value?.locked === true
			);
			// Submodule repositories should use 'archive' icon (not 'repo')
			expect(repoLockUpdate.value.icon.id).toBe('archive');
			expect(repoLockUpdate.value.name).toBe('submodule-repo');
		});

		it('locks branch option alongside repository option when branch is selected', async () => {
			const sessionId = 'untitled:temp-branch-lock';
			const repoUri = Uri.file(`${sep}workspace${sep}myrepo`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: { rootUri: repoUri, kind: 'repository' } as unknown as RepoContext,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			// Simulate branch selection via initial options
			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			(context.chatSessionContext as any).initialSessionOptions = [
				{ optionId: 'branch', value: 'feature-branch' }
			];
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			// Find a lock call that includes both repo and branch locking
			const branchLockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'branch' && update.value?.locked === true)
			);
			expect(branchLockCalls.length).toBeGreaterThan(0);

			const branchLockUpdate = branchLockCalls.flatMap(call => call[1]).find(
				(update: any) => update.optionId === 'branch' && update.value?.locked === true
			);
			expect(branchLockUpdate.value.name).toBe('feature-branch');
			expect(branchLockUpdate.value.icon.id).toBe('git-branch');
		});

		it('does not lock branch option when no branch is selected', async () => {
			const sessionId = 'untitled:temp-no-branch-lock';
			const repoUri = Uri.file(`${sep}workspace${sep}myrepo`);
			const mockGetFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: { rootUri: repoUri, kind: 'repository' } as unknown as RepoContext,
				trusted: true
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			const branchLockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'branch')
			);
			expect(branchLockCalls.length).toBe(0);
		});

		it('unlocks branch option alongside repository option when trust is denied', async () => {
			const sessionId = 'untitled:temp-branch-unlock';
			const mockGetFolderRepository = vi.fn(async () => ({
				trusted: false,
				folder: Uri.file(`${sep}workspace`)
			}));
			(folderRepositoryManager.getFolderRepository as any) = mockGetFolderRepository;
			const mockInitializeFolderRepository = vi.fn(async () => ({
				trusted: false,
				folder: Uri.file(`${sep}workspace`),
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined
			}));
			(folderRepositoryManager.initializeFolderRepository as any) = mockInitializeFolderRepository;

			// Simulate having a branch selected before running
			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			(context.chatSessionContext as any).initialSessionOptions = [
				{ optionId: 'branch', value: 'my-branch' }
			];
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			const allCalls = (contentProvider.notifySessionOptionsChange as unknown as ReturnType<typeof vi.fn>).mock.calls;
			// Find unlock calls (value is string, not an object with locked flag)
			const branchUnlockCalls = allCalls.filter(
				call => call[1].some((update: any) => update.optionId === 'branch' && typeof update.value === 'string')
			);
			expect(branchUnlockCalls.length).toBeGreaterThan(0);
		});

		it('passes branch to initializeFolderRepository when branch is set via initial options', async () => {
			const sessionId = 'untitled:temp-branch-pass';
			const repoUri = Uri.file(`${sep}workspace${sep}myrepo`);
			const mockInitializeFolderRepository = vi.fn(async () => ({
				folder: repoUri,
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted: true,
				cancelled: false,
			}));
			(folderRepositoryManager.initializeFolderRepository as any) = mockInitializeFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			// Simulate branch being pre-selected (e.g. by provideChatSessionContent auto-selecting default branch)
			(context.chatSessionContext as any).initialSessionOptions = [
				{ optionId: 'branch', value: 'feature-branch' }
			];
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			expect(mockInitializeFolderRepository).toHaveBeenCalled();
			const [, options] = mockInitializeFolderRepository.mock.calls[0] as unknown as Parameters<typeof folderRepositoryManager.initializeFolderRepository>;
			expect(options.branch).toBe('feature-branch');
		});

		it('passes undefined branch to initializeFolderRepository when no branch is selected', async () => {
			const sessionId = 'untitled:temp-no-branch-pass';
			const mockInitializeFolderRepository = vi.fn(async () => ({
				folder: Uri.file(`${sep}workspace`),
				repository: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted: true,
				cancelled: false,
			}));
			(folderRepositoryManager.initializeFolderRepository as any) = mockInitializeFolderRepository;

			const request = new TestChatRequest('Say hi');
			const context = createChatContext(sessionId, true, request);
			// No initialSessionOptions with branch
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			expect(mockInitializeFolderRepository).toHaveBeenCalled();
			const [, options] = mockInitializeFolderRepository.mock.calls[0] as unknown as Parameters<typeof folderRepositoryManager.initializeFolderRepository>;
			expect(options.branch).toBeUndefined();
		});
	});

	describe('chatSessionContext lost workaround (core bug)', () => {
		// Full end-to-end tests for the delegation → executeCommand → workaround round-trip.
		//
		// When delegating from another chat:
		// 1. handleRequest is called with chatSessionContext=undefined → triggers handleDelegationFromAnotherChat
		// 2. createCLISessionAndSubmitRequest creates a session, stores prompt in contextForRequest,
		//    then calls vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.copilotcli', ...)
		// 3. VS Code core opens the new session and calls handleRequest again with the copilotcli:// resource,
		//    but due to a core bug chatSessionContext may be undefined
		// 4. The workaround detects the copilotcli:// scheme + stored contextForRequest data and
		//    reconstructs a synthetic chatSessionContext, so the session is reused with the stored prompt.

		let callbackDone: Promise<void> | undefined;

		beforeEach(() => {
			callbackDone = undefined;
			// Override the default round-trip behavior to simulate VS Code core
			// calling handleRequest again with the copilotcli:// resource but with chatSessionContext lost.
			mockExecuteCommand.mockImplementation(async (command: string, args: any) => {
				if (command === 'workbench.action.chat.openSessionWithPrompt.copilotcli') {
					// Simulate VS Code core: it opens the session and fires handleRequest,
					// but the core bug means chatSessionContext is undefined.
					const callbackRequest = new TestChatRequest(args.prompt);
					callbackRequest.sessionResource = args.resource;
					const callbackContext = { chatSessionContext: undefined } as vscode.ChatContext;
					const callbackStream = new MockChatResponseStream();
					const callbackToken = disposables.add(new CancellationTokenSource()).token;
					const result = participant.createHandler()(callbackRequest, callbackContext, callbackStream, callbackToken);
					callbackDone = !result ? Promise.resolve() : Promise.resolve(result).then(() => {/** */ });
					await callbackDone;
				}
			});
		});

		it('full delegation round-trip: executeCommand triggers callback that uses workaround to reconstruct context and reuse session', async () => {
			// Start delegation: call handleRequest with no chatSessionContext.
			// This triggers handleDelegationFromAnotherChat → createCLISessionAndSubmitRequest
			// which creates a session, stores prompt/attachments, calls executeCommand.
			// The mock executeCommand simulates VS Code calling handleRequest again with
			// the copilotcli:// resource but chatSessionContext=undefined (the core bug).
			// The workaround reconstructs context and reuses the session.
			const request = new TestChatRequest('Build feature X');
			const context = { chatSessionContext: undefined } as vscode.ChatContext;
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);
			await callbackDone;

			// executeCommand should have been called with the correct command and args
			expect(mockExecuteCommand).toHaveBeenCalledWith(
				'workbench.action.chat.openSessionWithPrompt.copilotcli',
				expect.objectContaining({
					resource: expect.objectContaining({ scheme: 'copilotcli' }),
					prompt: 'Build feature X',
				})
			);

			// Only one session should have been created (the delegation creates it,
			// and the callback reuses it via the workaround — no second session).
			expect(cliSessions.length).toBe(1);

			// The session's handleRequest should have been called exactly once,
			// using the stored prompt from contextForRequest (set during delegation).
			expect(cliSessions[0].requests.length).toBe(1);
			expect(cliSessions[0].requests[0].input).toEqual(
				expect.objectContaining({ prompt: expect.stringContaining('Build feature X') })
			);

			// contextForRequest should have been consumed (cleaned up after use)
			expect((participant as any).contextForRequest.size).toBe(0);
		});

		it('does not attempt workaround for non-copilotcli resource and proceeds with normal delegation', async () => {
			const request = new TestChatRequest('do some work');
			// Default sessionResource is test://session/... (not copilotcli scheme),
			// so the workaround check at the top of handleRequest is skipped entirely.
			const context = { chatSessionContext: undefined } as vscode.ChatContext;
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);
			await callbackDone;

			// A session should have been created via the delegation path
			expect(cliSessions.length).toBe(1);
			expect(cliSessions[0].requests.length).toBe(1);
			expect(cliSessions[0].requests[0].input).toEqual(
				expect.objectContaining({ prompt: expect.stringContaining('do some work') })
			);
		});
	});

	describe('agent tool references via modeInstructions2', () => {
		class MockCopilotCLIAgentsWithCustomAgent extends NullCopilotCLIAgents {
			constructor(private readonly agentTools: string[] | null) {
				super();
			}
			override resolveAgent(agentId: string): Promise<SweCustomAgent | undefined> {
				if (agentId === 'custom-agent') {
					return Promise.resolve({
						name: 'custom-agent',
						displayName: 'Custom Agent',
						description: 'A test agent',
						tools: this.agentTools,
						prompt: async () => 'System prompt',
						disableModelInvocation: false,
					});
				}
				return Promise.resolve(undefined);
			}
		}

		function makeParticipantWithAgents(agents: MockCopilotCLIAgentsWithCustomAgent): CopilotCLIChatSessionParticipant {
			const nullDelegationService = new class extends mock<IChatDelegationSummaryService>() {
				override async summarize(_context: vscode.ChatContext, _token: vscode.CancellationToken): Promise<string | undefined> {
					return undefined;
				}
			}();
			return new CopilotCLIChatSessionParticipant(
				contentProvider,
				promptResolver,
				itemProvider,
				cloudProvider,
				undefined,
				git,
				models as unknown as ICopilotCLIModels,
				agents,
				sessionService,
				worktree,
				worktreeCheckpointService,
				workspaceFolderService,
				telemetry,
				logService,
				disposables.add(new MockPromptsService()),
				nullDelegationService,
				folderRepositoryManager,
				configurationService,
				sdk,
				new MockChatSessionMetadataStore(),
				customSessionTitleService,
				new (mock<IOctoKitService>())(),
			);
		}

		it('preserves agent tools when modeInstructions2 has no tool references', async () => {
			const agentParticipant = makeParticipantWithAgents(new MockCopilotCLIAgentsWithCustomAgent(['original-tool']));
			const createSessionSpy = vi.spyOn(sessionService, 'createSession');

			const request = new TestChatRequest('Do something');
			(request as any).modeInstructions2 = { name: 'custom-agent', content: 'agent content' };
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await agentParticipant.createHandler()(request, context, stream, token);

			expect(createSessionSpy).toHaveBeenCalled();
			const { agent } = createSessionSpy.mock.calls[0][0];
			expect(agent?.tools).toEqual(['original-tool']);
		});

		it('overrides agent tools when modeInstructions2 provides tool references', async () => {
			const agentParticipant = makeParticipantWithAgents(new MockCopilotCLIAgentsWithCustomAgent(['original-tool']));
			const createSessionSpy = vi.spyOn(sessionService, 'createSession');

			const request = new TestChatRequest('Do something');
			(request as any).modeInstructions2 = {
				name: 'custom-agent',
				content: 'agent content',
				toolReferences: [{ name: 'override-tool-1' }, { name: 'override-tool-2' }],
			};
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await agentParticipant.createHandler()(request, context, stream, token);

			expect(createSessionSpy).toHaveBeenCalled();
			const { agent } = createSessionSpy.mock.calls[0][0];
			expect(agent?.tools).toEqual(['override-tool-1', 'override-tool-2']);
		});

		it('preserves null tools when modeInstructions2 has no tool references', async () => {
			const agentParticipant = makeParticipantWithAgents(new MockCopilotCLIAgentsWithCustomAgent(null));
			const createSessionSpy = vi.spyOn(sessionService, 'createSession');

			const request = new TestChatRequest('Do something');
			(request as any).modeInstructions2 = { name: 'custom-agent', content: 'agent content' };
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await agentParticipant.createHandler()(request, context, stream, token);

			expect(createSessionSpy).toHaveBeenCalled();
			const { agent } = createSessionSpy.mock.calls[0][0];
			expect(agent?.tools).toBeNull();
		});

		it('does not use session agent when no modeInstructions2 is provided', async () => {
			const agentParticipant = makeParticipantWithAgents(new MockCopilotCLIAgentsWithCustomAgent(['tool-a']));
			const createSessionSpy = vi.spyOn(sessionService, 'createSession');

			const request = new TestChatRequest('Do something');
			// No modeInstructions2 set — agent should be undefined regardless of session state
			const context = createChatContext('temp-new', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await agentParticipant.createHandler()(request, context, stream, token);

			expect(createSessionSpy).toHaveBeenCalled();
			const { agent } = createSessionSpy.mock.calls[0][0];
			expect(agent).toBeUndefined();
		});
	});

	describe('PR detection with retry', () => {
		let octoKitService: IOctoKitService;

		const v2WorktreeProperties: ChatSessionWorktreePropertiesV2 = {
			version: 2,
			baseCommit: 'abc123',
			branchName: 'copilot/test-branch',
			baseBranchName: 'main',
			repositoryPath: `${sep}repo`,
			worktreePath: `${sep}worktree`,
		};

		const repoContext: RepoContext = {
			rootUri: Uri.file(`${sep}repo`),
			kind: 'repository',
			remotes: ['origin'],
			remoteFetchUrls: ['https://github.com/testowner/testrepo.git'],
		} as unknown as RepoContext;

		beforeEach(() => {
			vi.useFakeTimers();
			octoKitService = {
				findPullRequestByHeadBranch: vi.fn(async () => undefined),
			} as unknown as IOctoKitService;

			// Set up folder & git repo so session creation succeeds with worktree isolation
			folderRepositoryManager.setNewSessionFolder('untitled:pr-test', Uri.file(`${sep}repo`));
			git.setRepo(repoContext);
			(worktree.createWorktree as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(v2WorktreeProperties);
			// After session creation, getWorktreeProperties returns v2 for any session
			(worktree.getWorktreeProperties as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(v2WorktreeProperties);
			TestCopilotCLISession.statusOverride = vscode.ChatSessionStatus.Completed;

			// Recreate participant with the controllable octoKitService
			participant = new CopilotCLIChatSessionParticipant(
				contentProvider,
				promptResolver,
				itemProvider,
				cloudProvider,
				undefined,
				git,
				models as unknown as ICopilotCLIModels,
				new NullCopilotCLIAgents(),
				sessionService,
				worktree,
				worktreeCheckpointService,
				workspaceFolderService,
				telemetry,
				logService,
				disposables.add(new MockPromptsService()),
				new (mock<IChatDelegationSummaryService>())(),
				folderRepositoryManager,
				configurationService,
				sdk,
				new MockChatSessionMetadataStore(),
				customSessionTitleService,
				octoKitService,
			);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('retries PR detection with exponential backoff and succeeds on second attempt', async () => {
			const findPr = octoKitService.findPullRequestByHeadBranch as ReturnType<typeof vi.fn>;
			findPr
				.mockResolvedValueOnce(undefined) // attempt 1: not found
				.mockResolvedValueOnce({ url: 'https://github.com/testowner/testrepo/pull/42', state: 'OPEN' }); // attempt 2: found

			const request = new TestChatRequest('Create a PR');
			const context = createChatContext('untitled:pr-test', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			const handlerPromise = participant.createHandler()(request, context, stream, token);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// Should have been called twice (after 2s delay, then after 4s delay)
			expect(findPr).toHaveBeenCalledTimes(2);
			// Should have persisted the PR URL and state
			expect(worktree.setWorktreeProperties).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ pullRequestUrl: 'https://github.com/testowner/testrepo/pull/42', pullRequestState: 'open' })
			);
		});

		it('stops retrying once all attempts are exhausted', async () => {
			const findPr = octoKitService.findPullRequestByHeadBranch as ReturnType<typeof vi.fn>;
			findPr.mockResolvedValue(undefined); // always returns not found

			const request = new TestChatRequest('Create something');
			const context = createChatContext('untitled:pr-test', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			const handlerPromise = participant.createHandler()(request, context, stream, token);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// 5 attempts total (after 2s, 4s, 8s, 16s, and 32s delays)
			expect(findPr).toHaveBeenCalledTimes(5);
			// Should NOT have persisted any PR URL since all attempts failed
			const setPropsCallsWithPrUrl = (worktree.setWorktreeProperties as ReturnType<typeof vi.fn>).mock.calls
				.filter((args: unknown[]) => (args[1] as { pullRequestUrl?: string })?.pullRequestUrl !== undefined);
			expect(setPropsCallsWithPrUrl).toHaveLength(0);
		});

		it('skips retry when session already has createdPullRequestUrl', async () => {
			const findPr = octoKitService.findPullRequestByHeadBranch as ReturnType<typeof vi.fn>;

			// Make the session report a PR URL directly
			TestCopilotCLISession.handleRequestHook = vi.fn(async () => {
				const session = cliSessions[cliSessions.length - 1];
				(session as any)._createdPullRequestUrl = 'https://github.com/testowner/testrepo/pull/99';
			});

			const request = new TestChatRequest('Create a PR via MCP');
			const context = createChatContext('untitled:pr-test', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			const handlerPromise = participant.createHandler()(request, context, stream, token);
			await vi.runAllTimersAsync();
			await handlerPromise;

			// Should NOT have called the GitHub API since session had the URL
			expect(findPr).not.toHaveBeenCalled();
			// Should have persisted the session's PR URL
			expect(worktree.setWorktreeProperties).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ pullRequestUrl: 'https://github.com/testowner/testrepo/pull/99' })
			);
		});
	});

	describe('sdkToUntitledUriMapping lifecycle', () => {
		it('populates sdkToUntitledUriMapping during request and cleans up after swap', async () => {
			folderRepositoryManager.setNewSessionFolder('untitled:mapping-test', Uri.file(`${sep}workspace`));

			let capturedSdkSessionId: string | undefined;
			let mappingExistedDuringRequest = false;
			TestCopilotCLISession.handleRequestHook = vi.fn(async () => {
				const session = cliSessions[cliSessions.length - 1];
				capturedSdkSessionId = session.sessionId;
				mappingExistedDuringRequest = itemProvider.sdkToUntitledUriMapping.has(capturedSdkSessionId);
			});

			const request = new TestChatRequest('Hello');
			const context = createChatContext('untitled:mapping-test', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			// Mapping should have existed during the request
			expect(mappingExistedDuringRequest).toBe(true);
			// After the request completes and the session is swapped, the mapping should be cleaned up
			expect(itemProvider.sdkToUntitledUriMapping.has(capturedSdkSessionId!)).toBe(false);
		});

		it('maps SDK session ID to the original untitled URI', async () => {
			folderRepositoryManager.setNewSessionFolder('untitled:uri-check', Uri.file(`${sep}workspace`));

			let capturedUri: Uri | undefined;
			TestCopilotCLISession.handleRequestHook = vi.fn(async () => {
				const session = cliSessions[cliSessions.length - 1];
				capturedUri = itemProvider.sdkToUntitledUriMapping.get(session.sessionId);
			});

			const request = new TestChatRequest('Hello');
			const context = createChatContext('untitled:uri-check', true, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			expect(capturedUri).toBeDefined();
			expect(capturedUri!.scheme).toBe('copilotcli');
			expect(capturedUri!.path).toBe('/untitled:uri-check');
		});

		it('does not populate sdkToUntitledUriMapping for existing sessions', async () => {
			const sessionId = 'existing-mapping-test';
			const sdkSession = new MockCliSdkSession(sessionId, new Date());
			manager.sessions.set(sessionId, sdkSession);

			const request = new TestChatRequest('Continue');
			const context = createChatContext(sessionId, false, request);
			const stream = new MockChatResponseStream();
			const token = disposables.add(new CancellationTokenSource()).token;

			await participant.createHandler()(request, context, stream, token);

			expect(cliSessions.length).toBe(1);
			// Should NOT have set sdkToUntitledUriMapping for existing sessions
			expect(itemProvider.sdkToUntitledUriMapping.size).toBe(0);
		});
	});
});
