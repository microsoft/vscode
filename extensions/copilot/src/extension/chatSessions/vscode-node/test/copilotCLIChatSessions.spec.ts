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
import { IVSCodeExtensionContext } from '../../../../platform/extContext/common/extensionContext';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { PullRequestSearchItem } from '../../../../platform/github/common/githubAPI';
import { IOctoKitService } from '../../../../platform/github/common/githubService';
import { ILogService } from '../../../../platform/log/common/logService';
import { MockExtensionContext } from '../../../../platform/test/node/extensionContext';
import { IWorkspaceService, NullWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Event } from '../../../../util/vs/base/common/event';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { IAgentSessionsWorkspace } from '../../common/agentSessionsWorkspace';
import { IChatSessionMetadataStore } from '../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../common/chatSessionWorkspaceFolderService';
import { ChatSessionWorktreeProperties, IChatSessionWorktreeService } from '../../common/chatSessionWorktreeService';
import { IFolderRepositoryManager } from '../../common/folderRepositoryManager';
import { emptyWorkspaceInfo } from '../../common/workspaceInfo';
import { ICustomSessionTitleService } from '../../copilotcli/common/customSessionTitleService';
import { ICopilotCLISession } from '../../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionService } from '../../copilotcli/node/copilotcliSessionService';
import { ICopilotCLISessionTracker } from '../../copilotcli/vscode-node/copilotCLISessionTracker';
import { CopilotCLIChatSessionContentProvider } from '../copilotCLIChatSessions';
import { ICopilotCLIFolderMruService } from '../copilotCLIFolderMru';
import { ICopilotCLITerminalIntegration } from '../copilotCLITerminalIntegration';
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
});

class TestSessionService extends mock<ICopilotCLISessionService>() {
	declare readonly _serviceBrand: undefined;
	override onDidChangeSessions = Event.None;
	override onDidDeleteSession = Event.None;
	override onDidChangeSession = Event.None;
	override onDidCreateSession = Event.None;
	override getSessionWorkingDirectory = vi.fn(() => undefined);
	override getSessionItem = vi.fn(async () => undefined);
	override getAllSessions = vi.fn(async () => []);
	override createNewSessionId = vi.fn(() => 'new-session');
	override isNewSessionId = vi.fn(() => false);
	override deleteSession = vi.fn(async () => { });
	override renameSession = vi.fn(async () => { });
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
	override tryGetPartialSesionHistory = vi.fn(async () => undefined);
	override getChatHistory = vi.fn(async () => []);
}

class TestWorktreeService extends mock<IChatSessionWorktreeService>() {
	declare readonly _serviceBrand: undefined;
	override getWorktreeProperties = vi.fn(async (_sessionId: string | vscode.Uri): Promise<ChatSessionWorktreeProperties | undefined> => undefined);
	override setWorktreeProperties = vi.fn(async () => { });
	override getWorktreeChanges = vi.fn(async () => []);
}

class TestWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	declare readonly _serviceBrand: undefined;
	override getWorkspaceChanges = vi.fn(async () => []);
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

class TestSessionTracker extends mock<ICopilotCLISessionTracker>() {
	declare readonly _serviceBrand: undefined;
	override getSessionIds = vi.fn(() => []);
	override getTerminal = vi.fn(async () => undefined);
}

class TestTerminalIntegration extends Disposable implements ICopilotCLITerminalIntegration {
	declare readonly _serviceBrand: undefined;
	openTerminal = vi.fn(async () => undefined);
	setTerminalSessionDir = vi.fn();
	setSessionDirResolver = vi.fn();
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
	const workspaceService = new NullWorkspaceService([URI.file('/workspace')]);
	const metadataStore = new class extends mock<IChatSessionMetadataStore>() { };
	const gitService = new TestGitService();
	const folderRepositoryManager = new TestFolderRepositoryManager();
	const configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
	const customSessionTitleService = new TestCustomSessionTitleService();
	const context = new MockExtensionContext() as unknown as IVSCodeExtensionContext;
	const sessionTracker = new TestSessionTracker();
	const terminalIntegration = new TestTerminalIntegration();
	const commandExecutionService = new TestRunCommandExecutionService();
	const workspaceFolderService = new TestWorkspaceFolderService();
	const octoKitService = new TestOctoKitService();
	const logService = new class extends mock<ILogService>() {
		declare readonly _serviceBrand: undefined;
		override trace = vi.fn();
		override debug = vi.fn();
		override error = vi.fn();
	}();

	const provider = new CopilotCLIChatSessionContentProvider(
		sessionService,
		metadataStore,
		worktreeService,
		workspaceService as IWorkspaceService,
		gitService,
		folderRepositoryManager,
		configurationService,
		customSessionTitleService,
		context,
		sessionTracker,
		terminalIntegration,
		commandExecutionService,
		workspaceFolderService,
		octoKitService,
		logService,
		new class extends mock<IAgentSessionsWorkspace>() { override get isAgentSessionsWorkspace() { return false; } },
		new (mock<ICopilotCLIFolderMruService>())(),
	);

	return {
		provider,
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
		const { provider } = createProvider();
		const detectSpy = vi.spyOn(provider, 'detectPullRequestOnSessionOpen').mockResolvedValue();

		await provider.provideChatSessionContentForExistingSession(
			URI.from({ scheme: 'copilotcli', path: '/session-1' }),
			CancellationToken.None,
		);

		expect(detectSpy).toHaveBeenCalledWith('session-1');
	});

	it('persists detected pull request url and state on session open', async () => {
		const { provider, worktreeService, gitService, octoKitService } = createProvider();
		const refreshSpy = vi.spyOn(provider, 'refreshSession').mockResolvedValue();
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

		await provider.detectPullRequestOnSessionOpen('session-1');

		expect(worktreeService.setWorktreeProperties).toHaveBeenCalledWith(
			'session-1',
			expect.objectContaining({
				pullRequestUrl: 'https://github.com/testowner/testrepo/pull/42',
				pullRequestState: 'open',
			}),
		);
		expect(refreshSpy).toHaveBeenCalledWith({ reason: 'update', sessionId: 'session-1' });
	});

	it('skips session-open detection for merged pull requests', async () => {
		const { provider, worktreeService, octoKitService } = createProvider();
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

		await provider.detectPullRequestOnSessionOpen('session-1');

		expect(octoKitService.findPullRequestByHeadBranch).not.toHaveBeenCalled();
		expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
	});
});
