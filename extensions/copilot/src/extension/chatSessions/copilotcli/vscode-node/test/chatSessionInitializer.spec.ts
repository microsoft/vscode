/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SweCustomAgent } from '@github/copilot/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IPromptsService } from '../../../../../platform/promptFiles/common/promptsService';
import { IWorkspaceService, NullWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../../util/vs/base/common/cancellation';
import { DisposableStore, IReference } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IChatSessionMetadataStore } from '../../../common/chatSessionMetadataStore';
import { IChatSessionWorkspaceFolderService } from '../../../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../../../common/chatSessionWorktreeService';
import { FolderRepositoryInfo, IFolderRepositoryManager, IsolationMode } from '../../../common/folderRepositoryManager';
import { IWorkspaceInfo } from '../../../common/workspaceInfo';
import { ICopilotCLIAgents, ICopilotCLIModels } from '../../../copilotcli/node/copilotCli';
import { ICopilotCLISession } from '../../../copilotcli/node/copilotcliSession';
import { ICopilotCLISessionService } from '../../../copilotcli/node/copilotcliSessionService';
import { CopilotCLIChatSessionInitializer } from '../copilotCLIChatSessionInitializer';

// ─── Test Helpers ────────────────────────────────────────────────

class TestSessionService extends mock<ICopilotCLISessionService>() {
	declare readonly _serviceBrand: undefined;
	override isNewSessionId = vi.fn(() => true);
	override createSession = vi.fn(async (): Promise<IReference<ICopilotCLISession>> => ({
		object: makeSessionObject(),
		dispose: vi.fn(),
	}));
	override getSession = vi.fn(async (): Promise<IReference<ICopilotCLISession> | undefined> => ({
		object: makeSessionObject(),
		dispose: vi.fn(),
	}));
}

class TestFolderRepositoryManager extends mock<IFolderRepositoryManager>() {
	declare readonly _serviceBrand: undefined;
	override initializeFolderRepository = vi.fn(async (): Promise<FolderRepositoryInfo> => ({
		folder: URI.file('/workspace') as unknown as vscode.Uri,
		repository: undefined,
		repositoryProperties: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
		trusted: true,
	}));
	override getFolderRepository = vi.fn(async (): Promise<FolderRepositoryInfo> => ({
		folder: URI.file('/workspace') as unknown as vscode.Uri,
		repository: undefined,
		repositoryProperties: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
		trusted: true,
	}));
}

class TestWorktreeService extends mock<IChatSessionWorktreeService>() {
	declare readonly _serviceBrand: undefined;
	override setWorktreeProperties = vi.fn(async () => { });
}

class TestWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	declare readonly _serviceBrand: undefined;
	override trackSessionWorkspaceFolder = vi.fn(async () => { });
}

class TestModels extends mock<ICopilotCLIModels>() {
	declare readonly _serviceBrand: undefined;
	override resolveModel = vi.fn(async (id: string) => id === 'known-model' ? 'resolved-model' : undefined);
	override getDefaultModel = vi.fn(async () => 'default-model');
}

class TestAgents extends mock<ICopilotCLIAgents>() {
	declare readonly _serviceBrand: undefined;
	override resolveAgent = vi.fn(async (): Promise<SweCustomAgent | undefined> => undefined);
}

class TestPromptsService extends mock<IPromptsService>() {
	declare readonly _serviceBrand: undefined;
	override parseFile = vi.fn(async () => ({ uri: URI.file('/test.prompt'), header: undefined, body: undefined }));
}

class TestMetadataStore extends mock<IChatSessionMetadataStore>() {
	declare readonly _serviceBrand: undefined;
	override updateRequestDetails = vi.fn(async () => { });
}

class TestConfigurationService extends mock<IConfigurationService>() {
	declare readonly _serviceBrand: undefined;
	override getConfig = vi.fn(() => undefined as any);
}

class TestLogService extends mock<ILogService>() {
	declare readonly _serviceBrand: undefined;
	override trace = vi.fn();
	override debug = vi.fn();
	override info = vi.fn();
	override error = vi.fn();
}

function makeSessionObject(overrides?: Partial<ICopilotCLISession>): ICopilotCLISession {
	return {
		sessionId: 'test-session-id',
		workspace: {
			folder: URI.file('/workspace') as unknown as vscode.Uri,
			repository: undefined,
			repositoryProperties: undefined,
			worktree: undefined,
			worktreeProperties: undefined,
		},
		attachStream: vi.fn(() => ({ dispose: vi.fn() })),
		setPermissionLevel: vi.fn(),
		dispose: vi.fn(),
		...overrides,
	} as unknown as ICopilotCLISession;
}

function makeRequest(overrides?: Partial<vscode.ChatRequest>): vscode.ChatRequest {
	return {
		id: 'request-1',
		prompt: 'hello',
		model: { id: 'known-model' },
		references: [],
		tools: [],
		toolInvocationToken: {} as vscode.ChatParticipantToolToken,
		permissionLevel: 'full',
		modeInstructions2: undefined,
		...overrides,
	} as unknown as vscode.ChatRequest;
}

function makeStream(): vscode.ChatResponseStream {
	return {
		warning: vi.fn(),
		markdown: vi.fn(),
	} as unknown as vscode.ChatResponseStream;
}

function makeChatResource(sessionId: string = 'untitled:new-session'): vscode.Uri {
	return URI.from({ scheme: 'copilotcli', path: `/${sessionId}` }) as unknown as vscode.Uri;
}

function createInitializer(overrides?: {
	sessionService?: TestSessionService;
	folderRepoManager?: TestFolderRepositoryManager;
	worktreeService?: TestWorktreeService;
	workspaceFolderService?: TestWorkspaceFolderService;
	workspaceService?: IWorkspaceService;
	models?: TestModels;
	agents?: TestAgents;
	promptsService?: TestPromptsService;
	metadataStore?: TestMetadataStore;
	logService?: TestLogService;
	configurationService?: TestConfigurationService;
}) {
	const sessionService = overrides?.sessionService ?? new TestSessionService();
	const folderRepoManager = overrides?.folderRepoManager ?? new TestFolderRepositoryManager();
	const worktreeService = overrides?.worktreeService ?? new TestWorktreeService();
	const workspaceFolderService = overrides?.workspaceFolderService ?? new TestWorkspaceFolderService();
	const workspaceService = overrides?.workspaceService ?? new NullWorkspaceService([URI.file('/workspace')]);
	const models = overrides?.models ?? new TestModels();
	const agents = overrides?.agents ?? new TestAgents();
	const promptsService = overrides?.promptsService ?? new TestPromptsService();
	const metadataStore = overrides?.metadataStore ?? new TestMetadataStore();
	const logService = overrides?.logService ?? new TestLogService();
	const configurationService = overrides?.configurationService ?? new TestConfigurationService();

	const initializer = new CopilotCLIChatSessionInitializer(
		sessionService,
		folderRepoManager,
		workspaceService,
		models,
		agents,
		promptsService,
		logService,
		configurationService,
	);

	return { initializer, sessionService, folderRepoManager, worktreeService, workspaceFolderService, models, agents, promptsService, metadataStore, logService, configurationService };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ChatSessionInitializer', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe('resolveModelId', () => {
		it('returns resolved model from request.model.id', async () => {
			const { initializer } = createInitializer();
			const request = makeRequest({ model: { id: 'known-model' } } as Partial<vscode.ChatRequest>);
			const result = await initializer.resolveModel(request, CancellationToken.None);
			expect(result).toEqual(expect.objectContaining({ model: 'resolved-model' }));
		});

		it('falls back to default model when request model is not resolvable', async () => {
			const { initializer } = createInitializer();
			const request = makeRequest({ model: { id: 'unknown-model' } } as Partial<vscode.ChatRequest>);
			const result = await initializer.resolveModel(request, CancellationToken.None);
			expect(result).toEqual(expect.objectContaining({ model: 'default-model' }));
		});

		it('returns default model when request is undefined', async () => {
			const { initializer } = createInitializer();
			const result = await initializer.resolveModel(undefined, CancellationToken.None);
			expect(result).toEqual(expect.objectContaining({ model: 'default-model' }));
		});

		it('returns default model when request has no model', async () => {
			const { initializer } = createInitializer();
			const request = makeRequest({ model: undefined } as Partial<vscode.ChatRequest>);
			const result = await initializer.resolveModel(request, CancellationToken.None);
			expect(result).toEqual(expect.objectContaining({ model: 'default-model' }));
		});
	});

	describe('resolveAgent', () => {
		it('returns undefined when request has no modeInstructions2', async () => {
			const { initializer } = createInitializer();
			const request = makeRequest({ modeInstructions2: undefined } as Partial<vscode.ChatRequest>);
			const result = await initializer.resolveAgent(request, CancellationToken.None);
			expect(result).toBeUndefined();
		});

		it('returns undefined when request is undefined', async () => {
			const { initializer } = createInitializer();
			const result = await initializer.resolveAgent(undefined, CancellationToken.None);
			expect(result).toBeUndefined();
		});

		it('resolves agent by URI when modeInstructions2 has uri', async () => {
			const agents = new TestAgents();
			const fakeAgent = { name: 'test-agent' } as SweCustomAgent;
			agents.resolveAgent.mockResolvedValue(fakeAgent);
			const { initializer } = createInitializer({ agents });

			const request = makeRequest({
				modeInstructions2: {
					uri: URI.file('/agent.md') as unknown as vscode.Uri,
					name: 'test-agent',
					content: '',
					toolReferences: [],
				},
			} as Partial<vscode.ChatRequest>);

			const result = await initializer.resolveAgent(request, CancellationToken.None);
			expect(result).toBe(fakeAgent);
			expect(agents.resolveAgent).toHaveBeenCalledWith(URI.file('/agent.md').toString());
		});

		it('resolves agent by name when modeInstructions2 has no uri', async () => {
			const agents = new TestAgents();
			const fakeAgent = { name: 'test-agent' } as SweCustomAgent;
			agents.resolveAgent.mockResolvedValue(fakeAgent);
			const { initializer } = createInitializer({ agents });

			const request = makeRequest({
				modeInstructions2: {
					uri: undefined,
					name: 'test-agent',
					content: '',
					toolReferences: [],
				},
			} as Partial<vscode.ChatRequest>);

			const result = await initializer.resolveAgent(request, CancellationToken.None);
			expect(result).toBe(fakeAgent);
			expect(agents.resolveAgent).toHaveBeenCalledWith('test-agent');
		});

		it('overrides agent tools when modeInstructions2 provides toolReferences', async () => {
			const agents = new TestAgents();
			const fakeAgent = { name: 'test-agent', tools: [] } as unknown as SweCustomAgent;
			agents.resolveAgent.mockResolvedValue(fakeAgent);
			const { initializer } = createInitializer({ agents });

			const request = makeRequest({
				modeInstructions2: {
					uri: undefined,
					name: 'test-agent',
					content: '',
					toolReferences: [{ name: 'tool-a' }, { name: 'tool-b' }],
				},
			} as Partial<vscode.ChatRequest>);

			const result = await initializer.resolveAgent(request, CancellationToken.None);
			expect(result!.tools).toEqual(['tool-a', 'tool-b']);
		});

		it('returns undefined when agent cannot be resolved', async () => {
			const agents = new TestAgents();
			agents.resolveAgent.mockResolvedValue(undefined);
			const { initializer } = createInitializer({ agents });

			const request = makeRequest({
				modeInstructions2: {
					uri: undefined,
					name: 'unknown-agent',
					content: '',
					toolReferences: [],
				},
			} as Partial<vscode.ChatRequest>);

			const result = await initializer.resolveAgent(request, CancellationToken.None);
			expect(result).toBeUndefined();
		});
	});

	describe('initializeWorkingDirectory', () => {
		it('initializes folder for new session with chat session context', async () => {
			const sessionService = new TestSessionService();
			sessionService.isNewSessionId.mockReturnValue(true);
			const { initializer, folderRepoManager } = createInitializer({ sessionService });

			const result = await initializer.initializeWorkingDirectory(
				makeChatResource('untitled:new'), { stream: makeStream() },
				{} as vscode.ChatParticipantToolToken, CancellationToken.None
			);

			expect(result.cancelled).toBe(false);
			expect(result.trusted).toBe(true);
			expect(result.workspaceInfo.folder).toBeDefined();
			expect(folderRepoManager.initializeFolderRepository).toHaveBeenCalled();
		});

		it('gets existing folder for non-new session', async () => {
			const sessionService = new TestSessionService();
			sessionService.isNewSessionId.mockReturnValue(false);
			const { initializer, folderRepoManager } = createInitializer({ sessionService });

			const result = await initializer.initializeWorkingDirectory(
				makeChatResource('existing-session'), { stream: makeStream() },
				{} as vscode.ChatParticipantToolToken, CancellationToken.None
			);

			expect(result.cancelled).toBe(false);
			expect(folderRepoManager.getFolderRepository).toHaveBeenCalled();
		});

		it('initializes with active repository when no chat session context', async () => {
			const { initializer, folderRepoManager } = createInitializer();

			const result = await initializer.initializeWorkingDirectory(
				undefined, { stream: makeStream() },
				{} as vscode.ChatParticipantToolToken, CancellationToken.None
			);

			expect(result.cancelled).toBe(false);
			expect(folderRepoManager.initializeFolderRepository).toHaveBeenCalledWith(
				undefined, expect.anything(), expect.anything()
			);
		});

		it('returns cancelled when trust is denied', async () => {
			const folderRepoManager = new TestFolderRepositoryManager();
			folderRepoManager.initializeFolderRepository.mockResolvedValue({
				folder: URI.file('/workspace') as unknown as vscode.Uri,
				repository: undefined,
				repositoryProperties: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted: false,
			});
			const { initializer } = createInitializer({ folderRepoManager });

			const result = await initializer.initializeWorkingDirectory(
				undefined, { stream: makeStream() },
				{} as vscode.ChatParticipantToolToken, CancellationToken.None
			);

			expect(result.cancelled).toBe(true);
			expect(result.trusted).toBe(false);
		});

		it('returns cancelled when user cancels', async () => {
			const folderRepoManager = new TestFolderRepositoryManager();
			folderRepoManager.initializeFolderRepository.mockResolvedValue({
				folder: undefined,
				repository: undefined,
				repositoryProperties: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
				trusted: true,
				cancelled: true,
			});
			const { initializer } = createInitializer({ folderRepoManager });

			const result = await initializer.initializeWorkingDirectory(
				undefined, { stream: makeStream() },
				{} as vscode.ChatParticipantToolToken, CancellationToken.None
			);

			expect(result.cancelled).toBe(true);
			expect(result.trusted).toBe(true);
		});

		it('parses session options from chat session context', async () => {
			const sessionService = new TestSessionService();
			sessionService.isNewSessionId.mockReturnValue(true);
			const { initializer, folderRepoManager } = createInitializer({ sessionService });

			await initializer.initializeWorkingDirectory(
				makeChatResource('untitled:new'),
				{
					folder: URI.file('/selected-repo') as unknown as vscode.Uri,
					branch: 'feature-branch',
					isolation: IsolationMode.Worktree,
					stream: makeStream(),
				},
				{} as vscode.ChatParticipantToolToken, CancellationToken.None
			);

			expect(folderRepoManager.initializeFolderRepository).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					branch: 'feature-branch',
					isolation: IsolationMode.Worktree,
				}),
				expect.anything()
			);
		});
	});

	describe('getOrCreateSession', () => {
		it('creates new session and attaches stream', async () => {
			const { initializer, sessionService } = createInitializer();
			sessionService.isNewSessionId.mockReturnValue(true);
			const disposables = new DisposableStore();
			const stream = makeStream();

			const result = await initializer.getOrCreateSession(
				makeRequest(), makeChatResource(), { stream },
				disposables, CancellationToken.None
			);

			expect(result.session).toBeDefined();
			expect(result.isNewSession).toBe(true);
			expect(result.model).toEqual(expect.objectContaining({ model: 'resolved-model' }));
			expect(result.trusted).toBe(true);
			expect(sessionService.createSession).toHaveBeenCalled();
			expect(result.session!.object.attachStream).toHaveBeenCalledWith(stream);
			expect(result.session!.object.setPermissionLevel).toHaveBeenCalled();
			disposables.dispose();
		});

		it('gets existing session for non-new session ID', async () => {
			const { initializer, sessionService } = createInitializer();
			sessionService.isNewSessionId.mockReturnValue(false);
			const disposables = new DisposableStore();

			const result = await initializer.getOrCreateSession(
				makeRequest(), makeChatResource('existing-session'), { stream: makeStream() },
				disposables, CancellationToken.None
			);

			expect(result.session).toBeDefined();
			expect(result.isNewSession).toBe(false);
			expect(sessionService.getSession).toHaveBeenCalled();
			expect(sessionService.createSession).not.toHaveBeenCalled();
			disposables.dispose();
		});

		it('returns undefined session when working directory init is cancelled', async () => {
			const folderRepoManager = new TestFolderRepositoryManager();
			folderRepoManager.initializeFolderRepository.mockResolvedValue({
				folder: undefined, repository: undefined, repositoryProperties: undefined,
				worktree: undefined, worktreeProperties: undefined,
				trusted: false,
			});
			const { initializer } = createInitializer({ folderRepoManager });
			const disposables = new DisposableStore();

			const result = await initializer.getOrCreateSession(
				makeRequest(), makeChatResource(), { stream: makeStream() },
				disposables, CancellationToken.None
			);

			expect(result.session).toBeUndefined();
			expect(result.trusted).toBe(false);
			disposables.dispose();
		});

		it('returns undefined session when session service returns undefined', async () => {
			const sessionService = new TestSessionService();
			sessionService.isNewSessionId.mockReturnValue(false);
			sessionService.getSession.mockResolvedValue(undefined);
			const { initializer } = createInitializer({ sessionService });
			const disposables = new DisposableStore();
			const stream = makeStream();

			const result = await initializer.getOrCreateSession(
				makeRequest(), makeChatResource('missing'), { stream },
				disposables, CancellationToken.None
			);

			expect(result.session).toBeUndefined();
			expect(stream.warning).toHaveBeenCalled();
			disposables.dispose();
		});

		it('does not set worktree properties (moved to startRequest)', async () => {
			const sessionService = new TestSessionService();
			sessionService.isNewSessionId.mockReturnValue(true);
			const folderRepoManager = new TestFolderRepositoryManager();
			folderRepoManager.initializeFolderRepository.mockResolvedValue({
				folder: URI.file('/workspace') as unknown as vscode.Uri,
				repository: URI.file('/repo') as unknown as vscode.Uri,
				repositoryProperties: undefined,
				worktree: URI.file('/worktree') as unknown as vscode.Uri,
				worktreeProperties: {
					version: 2,
					baseCommit: 'abc',
					baseBranchName: 'main',
					branchName: 'copilot/test',
					repositoryPath: '/repo',
					worktreePath: '/worktree',
				},
				trusted: true,
			});
			const { initializer, worktreeService } = createInitializer({ sessionService, folderRepoManager });
			const disposables = new DisposableStore();

			await initializer.getOrCreateSession(
				makeRequest(), makeChatResource(), { stream: makeStream() },
				disposables, CancellationToken.None
			);

			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
			disposables.dispose();
		});

		it('does not track workspace folder (moved to startRequest)', async () => {
			const sessionService = new TestSessionService();
			sessionService.isNewSessionId.mockReturnValue(true);
			const { initializer, workspaceFolderService } = createInitializer({ sessionService });
			const disposables = new DisposableStore();

			await initializer.getOrCreateSession(
				makeRequest(), makeChatResource(), { stream: makeStream() },
				disposables, CancellationToken.None
			);

			expect(workspaceFolderService.trackSessionWorkspaceFolder).not.toHaveBeenCalled();
			disposables.dispose();
		});

		it('does not record request metadata (moved to startRequest)', async () => {
			const { initializer, metadataStore } = createInitializer();
			const disposables = new DisposableStore();

			await initializer.getOrCreateSession(
				makeRequest(), makeChatResource(), { stream: makeStream() },
				disposables, CancellationToken.None
			);

			expect(metadataStore.updateRequestDetails).not.toHaveBeenCalled();
			disposables.dispose();
		});
	});

	describe('createDelegatedSession', () => {
		it('creates session and resolves model', async () => {
			const { initializer, sessionService } = createInitializer();
			const workspace: IWorkspaceInfo = {
				folder: URI.file('/workspace') as unknown as vscode.Uri,
				repository: undefined,
				repositoryProperties: undefined,
				worktree: undefined,
				worktreeProperties: undefined,
			};

			const session = await initializer.createDelegatedSession(
				makeRequest(), workspace, { mcpServerMappings: new Map() },
				CancellationToken.None
			);

			expect(session).toBeDefined();
			expect(sessionService.createSession).toHaveBeenCalled();
		});

		it('does not set worktree properties or track workspace folder (moved to startRequest)', async () => {
			const { initializer, worktreeService, workspaceFolderService, metadataStore } = createInitializer();
			const workspace: IWorkspaceInfo = {
				folder: URI.file('/workspace') as unknown as vscode.Uri,
				repository: URI.file('/repo') as unknown as vscode.Uri,
				repositoryProperties: undefined,
				worktree: URI.file('/worktree') as unknown as vscode.Uri,
				worktreeProperties: {
					version: 2,
					baseCommit: 'abc',
					baseBranchName: 'main',
					branchName: 'copilot/test',
					repositoryPath: '/repo',
					worktreePath: '/worktree',
				},
			};

			await initializer.createDelegatedSession(
				makeRequest(), workspace, { mcpServerMappings: new Map() },
				CancellationToken.None
			);

			expect(worktreeService.setWorktreeProperties).not.toHaveBeenCalled();
			expect(workspaceFolderService.trackSessionWorkspaceFolder).not.toHaveBeenCalled();
			expect(metadataStore.updateRequestDetails).not.toHaveBeenCalled();
		});
	});
});
