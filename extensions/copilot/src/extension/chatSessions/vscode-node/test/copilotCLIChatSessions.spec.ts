/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
// eslint-disable-next-line no-duplicate-imports
import * as vscodeShim from 'vscode';
import { IRunCommandExecutionService } from '../../../../platform/commands/common/runCommandExecutionService';
import { DefaultsOnlyConfigurationService } from '../../../../platform/configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../../platform/configuration/test/common/inMemoryConfigurationService';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem } from '../../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry';
import { NullWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { URI } from '../../../../util/vs/base/common/uri';
import { IChatSessionMetadataStore } from '../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../common/chatSessionWorkspaceFolderService';
import { ChatSessionWorktreeProperties, IChatSessionWorktreeService } from '../../common/chatSessionWorktreeService';
import { IFolderRepositoryManager, IsolationMode } from '../../common/folderRepositoryManager';
import { emptyWorkspaceInfo } from '../../common/workspaceInfo';
import { IChatDelegationSummaryService } from '../../copilotcli/common/delegationSummaryService';
import { SessionIdForCLI } from '../../copilotcli/common/utils';
import { ICopilotCLIModels, ICopilotCLISDK } from '../../copilotcli/node/copilotCli';
import { CopilotCLIPromptResolver } from '../../copilotcli/node/copilotcliPromptResolver';
import { ICustomSessionTitleService } from '../../copilotcli/common/customSessionTitleService';
import { ICopilotCLISession } from '../../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionItem, ICopilotCLISessionService } from '../../copilotcli/node/copilotcliSessionService';
import { ICopilotCLIChatSessionInitializer } from '../../copilotcli/vscode-node/copilotCLIChatSessionInitializer';
import { ICopilotCLISessionTracker } from '../../copilotcli/vscode-node/copilotCLISessionTracker';
import { CopilotCLIChatSessionContentProvider, CopilotCLIChatSessionParticipant, resolveBranchLockState, resolveBranchSelection, resolveIsolationSelection, resolveSessionDirsForTerminal } from '../copilotCLIChatSessions';
import { PullRequestDetectionService } from '../pullRequestDetectionService';
import { ISessionOptionGroupBuilder } from '../sessionOptionGroupBuilder';
import { ISessionRequestLifecycle } from '../sessionRequestLifecycle';
vi.mock('../copilotCLIShim.ps1', () => ({ default: '# mock powershell script' }));

beforeAll(() => {
	(vscodeShim as Record<string, unknown>).chat = {
		createChatSessionItemController: () => ({
			id: 'copilotcli',
			items: {
				get: () => undefined,
				add: () => { },
				delete: () => { },
				replace: () => { },
				[Symbol.iterator]: function* () { },
				forEach: () => { },
			},
			createChatSessionItem: (resource: vscode.Uri, label: string): vscode.ChatSessionItem => ({ resource, label }),
			dispose: () => { },
		}),
	};
	(vscodeShim as Record<string, unknown>).workspace = {
		...((vscodeShim as Record<string, unknown>).workspace as object),
		workspaceFolders: [],
		isAgentSessionsWorkspace: false,
		isResourceTrusted: async () => true,
	};
});

class TestSessionService extends mock<ICopilotCLISessionService>() {
	declare readonly _serviceBrand: undefined;
	override onDidChangeSessions = Event.None;
	override onDidDeleteSession = Event.None;
	override onDidChangeSession = Event.None;
	override onDidCreateSession = Event.None;
	override getSessionWorkingDirectory = vi.fn(() => undefined);
	override getSessionItem = vi.fn(async () => undefined);
	override getAllSessions = vi.fn(async () => [] as ICopilotCLISessionItem[]);
	override createNewSessionId = vi.fn(() => 'new-session');
	override isNewSessionId = vi.fn((_sessionId: string) => false);
	override deleteSession = vi.fn(async () => { });
	override renameSession = vi.fn(async () => { });
	override getSessionTitle = vi.fn(async () => '');
	override getSession = vi.fn(async () => ({
		object: {
			sessionId: 'session-1',
			workspace: emptyWorkspaceInfo,
			getChatHistory: async () => [],
		},
		dispose: () => { },
	} as unknown as { object: ICopilotCLISession; dispose(): void }));
	override createSession = vi.fn(async () => {
		throw new Error('Not implemented');
	});
	override forkSession = vi.fn(async () => 'forked-session');
	override tryGetPartialSessionHistory = vi.fn(async () => undefined);
	override getChatHistory = vi.fn(async () => []);
}

class TestWorktreeService extends mock<IChatSessionWorktreeService>() {
	declare readonly _serviceBrand: undefined;
	override getWorktreeProperties = vi.fn(async (_sessionId: string | vscode.Uri): Promise<ChatSessionWorktreeProperties | undefined> => undefined);
	override setWorktreeProperties = vi.fn(async () => { });
	override getWorktreeChanges = vi.fn(async () => []);
	override hasCachedChanges = vi.fn(async () => false);
	override onDidChangeWorktreeChanges = Event.None;
}

class TestWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	declare readonly _serviceBrand: undefined;
	override getWorkspaceChanges = vi.fn(async () => []);
	override hasCachedChanges = vi.fn(async () => false);
	override onDidChangeWorkspaceFolderChanges = Event.None;
}

class TestFolderRepositoryManager extends mock<IFolderRepositoryManager>() {
	declare readonly _serviceBrand: undefined;
	override setNewSessionFolder = vi.fn();
	override deleteNewSessionFolder = vi.fn();
	override getFolderRepository = vi.fn(async () => ({
		folder: undefined,
		repository: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
		trusted: undefined,
	}));
	override initializeFolderRepository = vi.fn(async () => ({
		folder: undefined,
		repository: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
		trusted: undefined,
	}));
	override getRepositoryInfo = vi.fn(async () => ({ repository: undefined, headBranchName: undefined }));
	override getFolderMRU = vi.fn(async () => []);
}

class TestGitService extends mock<IGitService>() {
	declare readonly _serviceBrand: undefined;
	override onDidOpenRepository = Event.None;
	override onDidCloseRepository = Event.None;
	override onDidFinishInitialization = Event.None;
	override activeRepository = { get: () => undefined } as IGitService['activeRepository'];
	override repositories: RepoContext[] = [];

	setRepo(repo: RepoContext): void {
		this.repositories = [repo];
	}

	override getRepository = vi.fn(async () => this.repositories[0]);
}

class TestOctoKitService extends mock<IOctoKitService>() {
	declare readonly _serviceBrand: undefined;
	override findPullRequestByHeadBranch = vi.fn(async (): Promise<PullRequestSearchItem | undefined> => undefined);
}

class TestRunCommandExecutionService extends mock<IRunCommandExecutionService>() {
	declare readonly _serviceBrand: undefined;
	override executeCommand = vi.fn(async () => undefined);
}

class TestCustomSessionTitleService extends mock<ICustomSessionTitleService>() {
	declare readonly _serviceBrand: undefined;
	override getCustomSessionTitle = vi.fn(async () => 'Session Title');
	override setCustomSessionTitle = vi.fn(async () => { });
	override generateSessionTitle = vi.fn(async () => undefined);
}

function createProvider() {
	const sessionService = new TestSessionService();
	const worktreeService = new TestWorktreeService();
	const metadataStore = new class extends mock<IChatSessionMetadataStore>() {
		override getRequestDetails = vi.fn(async () => []);
		override getRepositoryProperties = vi.fn(async () => undefined);
		override getSessionParentId = vi.fn(async () => undefined);
	};
	const gitService = new TestGitService();
	const folderRepositoryManager = new TestFolderRepositoryManager();
	const configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
	const customSessionTitleService = new TestCustomSessionTitleService();
	const commandExecutionService = new TestRunCommandExecutionService();
	const workspaceFolderService = new TestWorkspaceFolderService();
	const octoKitService = new TestOctoKitService();
	const logService = new class extends mock<ILogService>() {
		declare readonly _serviceBrand: undefined;
		override trace = vi.fn();
		override debug = vi.fn();
		override info = vi.fn();
		override error = vi.fn();
	}();

	const prDetectionService = new PullRequestDetectionService(
		worktreeService,
		gitService,
		octoKitService,
		logService,
	);
	const optionGroupBuilder = new class extends mock<ISessionOptionGroupBuilder>() {
		declare readonly _serviceBrand: undefined;
		override provideChatSessionProviderOptionGroups = vi.fn(async () => []);
		override buildBranchOptionGroup = vi.fn(() => undefined);
		override handleInputStateChange = vi.fn(async () => { });
		override rebuildInputState = vi.fn(async () => { });
		override buildExistingSessionInputStateGroups = vi.fn(async () => []);
		override getBranchOptionItemsForRepository = vi.fn(async () => []);
		override getRepositoryOptionItems = vi.fn(() => []);
	}();
	const provider = new CopilotCLIChatSessionContentProvider(
		sessionService,
		worktreeService,
		folderRepositoryManager,
		configurationService,
		customSessionTitleService,
		commandExecutionService,
		logService,
		prDetectionService,
		optionGroupBuilder,
		gitService,
		workspaceFolderService,
		metadataStore,
		new NullWorkspaceService(),
		worktreeService,
	);

	return {
		provider,
		prDetectionService,
		sessionService,
		worktreeService,
		gitService,
		octoKitService,
	};
}

describe('CopilotCLIChatSessionContentProvider', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('triggers pull request detection when opening an existing session', async () => {
		const { provider, prDetectionService } = createProvider();
		const detectSpy = vi.spyOn(prDetectionService, 'detectPullRequest');

		await provider.provideChatSessionContent(
			URI.from({ scheme: 'copilotcli', path: '/session-1' }),
			CancellationToken.None,
		);

		expect(detectSpy).toHaveBeenCalledWith('session-1');
	});

	it('persists detected pull request url and state on session open', async () => {
		const { prDetectionService, worktreeService, gitService, octoKitService } = createProvider();
		const worktreeProperties: ChatSessionWorktreeProperties = {
			version: 2,
			baseCommit: 'abc123',
			baseBranchName: 'main',
			branchName: 'copilot/test-branch',
			repositoryPath: '/repo',
			worktreePath: '/worktree',
		};

		worktreeService.getWorktreeProperties.mockResolvedValue(worktreeProperties);
		gitService.setRepo({
			rootUri: URI.file('/repo'),
			kind: 'repository',
			remotes: ['origin'],
			remoteFetchUrls: ['https://github.com/testowner/testrepo.git'],
		} as unknown as RepoContext);
		octoKitService.findPullRequestByHeadBranch.mockResolvedValue({
			id: 'pr-42',
			number: 42,
			title: 'Test PR',
			url: 'https://github.com/testowner/testrepo/pull/42',
			state: 'OPEN',
			isDraft: false,
			createdAt: '2026-01-01T00:00:00Z',
			updatedAt: '2026-01-01T00:00:00Z',
			author: { login: 'testowner' },
			repository: { owner: { login: 'testowner' }, name: 'testrepo' },
			additions: 1,
			deletions: 0,
			files: { totalCount: 1 },
			fullDatabaseId: 42,
			headRefOid: 'deadbeef',
			headRefName: 'copilot/test-branch',
			baseRefName: 'main',
			body: '',
		});

		prDetectionService.detectPullRequest('session-1');

		await vi.waitFor(() => expect(worktreeService.setWorktreeProperties).toHaveBeenCalledWith(
			'session-1',
			expect.objectContaining({
				pullRequestUrl: 'https://github.com/testowner/testrepo/pull/42',
				pullRequestState: 'open',
			}),
		));
	});

	it('skips session-open detection for merged pull requests', async () => {
		const { prDetectionService, worktreeService, octoKitService } = createProvider();
		const mergedProperties: ChatSessionWorktreeProperties = {
			version: 2,
			baseCommit: 'abc123',
			baseBranchName: 'main',
			branchName: 'copilot/test-branch',
			repositoryPath: '/repo',
			worktreePath: '/worktree',
			pullRequestState: 'merged',
		};

		worktreeService.getWorktreeProperties.mockResolvedValue(mergedProperties);

		prDetectionService.detectPullRequest('session-1');

		await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
		expect(octoKitService.findPullRequestByHeadBranch).not.toHaveBeenCalled();
		expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
	});
});

describe('CopilotCLIChatSessionParticipant', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('keeps local /remote output visible for new sessions', async () => {
		const resource = SessionIdForCLI.getResource('new-session');
		const sessionItemProvider = {
			refreshSession: vi.fn(async () => { }),
			dispose: vi.fn(),
		};
		const session = {
			sessionId: 'new-session',
			workspace: emptyWorkspaceInfo,
			status: undefined,
			onDidChangeStatus: Event.None,
			createdPullRequestUrl: undefined,
			attachStream: vi.fn(() => ({ dispose: vi.fn() })),
			handleRequest: vi.fn(async () => { }),
			getSelectedModelId: vi.fn(async () => undefined),
			getLastResponseModelId: vi.fn(() => undefined),
		} as unknown as ICopilotCLISession;
		const sessionService = new TestSessionService();
		sessionService.isNewSessionId.mockImplementation(id => id === 'new-session');
		const promptResolver = {
			resolvePrompt: vi.fn(async () => ({ prompt: 'on', attachments: [] })),
		} as unknown as CopilotCLIPromptResolver;
		const logService = new class extends mock<ILogService>() {
			declare readonly _serviceBrand: undefined;
			override error = vi.fn();
		}();
		const participant = new CopilotCLIChatSessionParticipant(
			sessionItemProvider,
			promptResolver,
			undefined,
			undefined,
			new TestGitService(),
			sessionService,
			new TestWorktreeService(),
			new class extends mock<ITelemetryService>() {
				declare readonly _serviceBrand: undefined;
				override sendMSFTTelemetryEvent = vi.fn();
			}(),
			logService,
			new class extends mock<IChatDelegationSummaryService>() {
				declare readonly _serviceBrand: undefined;
			}(),
			new InMemoryConfigurationService(new DefaultsOnlyConfigurationService()),
			new class extends mock<ICopilotCLISDK>() {
				declare readonly _serviceBrand: undefined;
				override getAuthInfo = vi.fn(async () => ({ type: 'token' as const, token: 'token', host: 'https://github.com' }));
			}(),
			new class extends mock<ICopilotCLIChatSessionInitializer>() {
				declare readonly _serviceBrand: undefined;
				override getOrCreateSession = vi.fn(async () => ({
					session: { object: session, dispose: vi.fn() },
					isNewSession: true,
					model: undefined,
					agent: undefined,
					trusted: true,
				}));
			}(),
			new class extends mock<ISessionRequestLifecycle>() {
				declare readonly _serviceBrand: undefined;
				override startRequest = vi.fn(async () => { });
				override endRequest = vi.fn(async () => { });
			}(),
			new class extends mock<PullRequestDetectionService>() {
				override onDidDetectPullRequest = Event.None;
			}() as unknown as PullRequestDetectionService,
			new class extends mock<ISessionOptionGroupBuilder>() {
				declare readonly _serviceBrand: undefined;
				override lockInputStateGroups = vi.fn();
				override updateBranchInInputState = vi.fn();
			}(),
			new class extends mock<ICopilotCLIModels>() {
				declare readonly _serviceBrand: undefined;
				override getModels = vi.fn(async () => []);
			}(),
			new class extends mock<IChatSessionMetadataStore>() {
				declare readonly _serviceBrand: undefined;
			}(),
			{ _serviceBrand: undefined, resetTurnCredits() { }, getCreditsForTurn() { return undefined; }, setLastCopilotUsage() { } } as any,
		);

		await participant.createHandler()(
			{
				id: 'request-1',
				command: 'remote',
				prompt: 'on',
				sessionResource: resource,
				references: [],
				tools: [],
				toolInvocationToken: undefined,
			} as unknown as vscode.ChatRequest,
			{
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					chatSessionItem: { resource, label: 'New Session' },
					inputState: { groups: [] },
				},
			} as unknown as vscode.ChatContext,
			{} as vscode.ChatResponseStream,
			CancellationToken.None,
		);

		expect(session.handleRequest).toHaveBeenCalledWith(
			expect.anything(),
			{ command: 'remote', prompt: 'on' },
			[],
			undefined,
			{ type: 'token', token: 'token', host: 'https://github.com' },
			CancellationToken.None,
		);
		expect(sessionItemProvider.refreshSession).not.toHaveBeenCalled();
	});
});

// ─── Re-exported helper function smoke tests ────────────────────
// Full test coverage lives in sessionOptionGroupBuilder.spec.ts;
// these just verify the re-exports are wired up correctly.

describe('re-exported dropdown helpers', () => {
	it('resolveBranchSelection is callable', () => {
		const branches = [{ id: 'main', name: 'main' }];
		expect(resolveBranchSelection(branches, 'main', undefined)?.id).toBe('main');
	});

	it('resolveBranchLockState is callable', () => {
		const result = resolveBranchLockState(false, undefined);
		expect(result.locked).toBe(true);
	});

	it('resolveIsolationSelection is callable', () => {
		expect(resolveIsolationSelection(IsolationMode.Workspace, undefined)).toBe(IsolationMode.Workspace);
	});
});

// ─── resolveSessionDirsForTerminal ──────────────────────────────

describe('resolveSessionDirsForTerminal', () => {
	it('returns matching terminal sessions before non-matching ones', async () => {
		const terminal = {} as vscode.Terminal;
		const otherTerminal = {} as vscode.Terminal;
		const tracker: ICopilotCLISessionTracker = {
			_serviceBrand: undefined,
			getSessionIds: () => ['session-a', 'session-b'],
			getTerminal: vi.fn(async (id: string) => id === 'session-a' ? terminal : otherTerminal),
		} as unknown as ICopilotCLISessionTracker;

		const dirs = await resolveSessionDirsForTerminal(tracker, terminal);
		expect(dirs).toHaveLength(2);
		// First dir should be for the matching session
		expect(dirs[0].fsPath).toContain('session-a');
	});

	it('returns empty array when no sessions exist', async () => {
		const terminal = {} as vscode.Terminal;
		const tracker: ICopilotCLISessionTracker = {
			_serviceBrand: undefined,
			getSessionIds: () => [],
			getTerminal: vi.fn(async () => undefined),
		} as unknown as ICopilotCLISessionTracker;

		const dirs = await resolveSessionDirsForTerminal(tracker, terminal);
		expect(dirs).toHaveLength(0);
	});
});

// ─── Additional CopilotCLIChatSessionContentProvider tests ──────

describe('CopilotCLIChatSessionContentProvider (additional)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('toChatSessionItem maps session to chat session item', async () => {
		const { provider } = createProvider();
		const sessionItem: ICopilotCLISessionItem = {
			id: 'session-1',
			label: 'Test Session',
			status: undefined,
			workingDirectory: undefined,
		} as unknown as ICopilotCLISessionItem;

		const item = await provider.toChatSessionItem(sessionItem);
		expect(item.label).toBe('Test Session');
	});

	it('does not call refreshSession when PR detection finds no update', async () => {
		const { provider, prDetectionService, worktreeService } = createProvider();
		const refreshSpy = vi.spyOn(provider, 'refreshSession').mockResolvedValue();

		// No worktree properties means no PR detection
		worktreeService.getWorktreeProperties.mockResolvedValue(undefined);

		prDetectionService.detectPullRequest('session-1');
		await vi.waitFor(() => expect(worktreeService.getWorktreeProperties).toHaveBeenCalled());
		expect(refreshSpy).not.toHaveBeenCalled();
	});
});
