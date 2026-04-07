/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
// eslint-disable-next-line no-duplicate-imports
import * as vscodeShim from 'vscode';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatSessionStatus, MarkdownString, ThemeIcon } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { MockChatResponseStream, TestChatRequest } from '../../../test/node/testHelpers';
import { ClaudeSessionUri } from '../../claude/common/claudeSessionUri';
import type { ClaudeAgentManager } from '../../claude/node/claudeCodeAgent';
import { IClaudeCodeModels } from '../../claude/node/claudeCodeModels';
import { IClaudeCodeSdkService } from '../../claude/node/claudeCodeSdkService';
import { IClaudeSessionStateService } from '../../claude/node/claudeSessionStateService';
import { IClaudeCodeSessionService } from '../../claude/node/sessionParser/claudeCodeSessionService';
import { IClaudeCodeSessionInfo } from '../../claude/node/sessionParser/claudeSessionSchema';
import { IClaudeSlashCommandService } from '../../claude/vscode-node/claudeSlashCommandService';
import { FolderRepositoryMRUEntry, IFolderRepositoryManager } from '../../common/folderRepositoryManager';
import { ClaudeChatSessionContentProvider, ClaudeChatSessionItemController } from '../claudeChatSessionContentProvider';

// Expose the most recently created items map so tests can inspect controller items.
let lastCreatedItemsMap: Map<string, vscode.ChatSessionItem>;
// Expose the most recently registered fork handler so tests can invoke it directly.
let lastForkHandler: ((sessionResource: vscode.Uri, request: vscode.ChatRequestTurn2 | undefined, token: CancellationToken) => Thenable<vscode.ChatSessionItem>) | undefined;

// Patch vscode shim with missing namespaces before any production code imports it.
beforeAll(() => {
	(vscodeShim as Record<string, unknown>).commands = {
		registerCommand: vi.fn().mockReturnValue({ dispose: () => { } }),
	};
	(vscodeShim as Record<string, unknown>).chat = {
		createChatSessionItemController: () => {
			const itemsMap = new Map<string, vscode.ChatSessionItem>();
			lastCreatedItemsMap = itemsMap;
			lastForkHandler = undefined;
			return {
				id: 'claude-code',
				items: {
					get: (resource: URI) => itemsMap.get(resource.toString()),
					add: (item: vscode.ChatSessionItem) => { itemsMap.set(item.resource.toString(), item); },
					delete: (resource: URI) => { itemsMap.delete(resource.toString()); },
					replace: (items: vscode.ChatSessionItem[]) => {
						itemsMap.clear();
						for (const item of items) {
							itemsMap.set(item.resource.toString(), item);
						}
					},
					get size() { return itemsMap.size; },
					[Symbol.iterator]: function* () { yield* itemsMap.values(); },
					forEach: (cb: (item: vscode.ChatSessionItem) => void) => { itemsMap.forEach(cb); },
				},
				createChatSessionItem: (resource: unknown, label: string) => ({
					resource,
					label,
				}),
				set forkHandler(handler: typeof lastForkHandler) { lastForkHandler = handler; },
				refreshHandler: () => Promise.resolve(),
				dispose: () => { },
				onDidArchiveChatSessionItem: () => ({ dispose: () => { } }),
			};
		},
	};
});

// Mock types for testing
interface MockClaudeSession {
	id: string;
	messages: Array<{
		type: 'user' | 'assistant';
		message: Record<string, unknown>;
	}>;
	subagents: Array<unknown>;
}

class MockFolderRepositoryManager implements IFolderRepositoryManager {
	declare _serviceBrand: undefined;

	private readonly _untitledFolders = new Map<string, vscode.Uri>();
	private _mruEntries: FolderRepositoryMRUEntry[] = [];

	setMRUEntries(entries: FolderRepositoryMRUEntry[]): void {
		this._mruEntries = entries;
	}

	setLastUsedFolderIdInUntitledWorkspace(id: string | undefined): void {
	}

	setNewSessionFolder(sessionId: string, folderUri: vscode.Uri): void {
		this._untitledFolders.set(sessionId, folderUri);
	}

	deleteNewSessionFolder(sessionId: string): void {
		this._untitledFolders.delete(sessionId);
	}

	async getFolderRepository(): Promise<{ folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }> {
		return { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined };
	}

	async initializeFolderRepository(): Promise<{ folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }> {
		return { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined };
	}

	async initializeMultiRootFolderRepositories(): Promise<{ primary: { folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }; additional: never[] }> {
		return { primary: { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }, additional: [] };
	}

	async getRepositoryInfo(): Promise<{ repository: undefined; headBranchName: undefined }> {
		return { repository: undefined, headBranchName: undefined };
	}

	async getFolderMRU(): Promise<FolderRepositoryMRUEntry[]> {
		return this._mruEntries;
	}
}

function createDefaultMocks() {
	const mockSessionService: IClaudeCodeSessionService = {
		getSession: vi.fn()
	} as any;

	const mockClaudeCodeModels: IClaudeCodeModels = {
		resolveModel: vi.fn().mockResolvedValue('claude-3-5-sonnet-20241022'),
		getDefaultModel: vi.fn().mockResolvedValue('claude-3-5-sonnet-20241022'),
		setDefaultModel: vi.fn().mockResolvedValue(undefined),
		getModels: vi.fn().mockResolvedValue([
			{ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
			{ id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' }
		]),
		mapSdkModelToEndpointModel: vi.fn().mockResolvedValue(undefined)
	} as any;

	const mockFolderRepositoryManager = new MockFolderRepositoryManager();

	return { mockSessionService, mockClaudeCodeModels, mockFolderRepositoryManager };
}

function createMockAgentManager(): ClaudeAgentManager {
	return {
		handleRequest: vi.fn().mockResolvedValue({}),
	} as unknown as ClaudeAgentManager;
}

/** Creates a TestChatRequest with a mock model that has an id property */
function createTestRequest(prompt: string): TestChatRequest {
	const request = new TestChatRequest(prompt);
	(request as any).model = { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', family: 'claude' };
	return request;
}

/**
 * Adds a session item to the controller's items map so that metadata methods work.
 * This simulates what newChatSessionItemHandler does when VS Code creates a new session.
 */
function seedSessionItem(sessionId: string, metadata?: Record<string, unknown>): void {
	const resource = ClaudeSessionUri.forSessionId(sessionId);
	const item: vscode.ChatSessionItem = {
		resource,
		label: sessionId,
		metadata,
	};
	lastCreatedItemsMap.set(resource.toString(), item);
}

function createProviderWithServices(
	store: DisposableStore,
	workspaceFolders: URI[],
	mocks: ReturnType<typeof createDefaultMocks>,
	agentManager?: ClaudeAgentManager,
): { provider: ClaudeChatSessionContentProvider; accessor: ITestingServicesAccessor } {
	const serviceCollection = store.add(createExtensionUnitTestingServices(store));

	const workspaceService = new TestWorkspaceService(workspaceFolders);
	serviceCollection.set(IWorkspaceService, workspaceService);
	serviceCollection.set(IGitService, new MockGitService());

	serviceCollection.define(IClaudeCodeSessionService, mocks.mockSessionService);
	serviceCollection.define(IClaudeCodeModels, mocks.mockClaudeCodeModels);
	serviceCollection.define(IFolderRepositoryManager, mocks.mockFolderRepositoryManager);
	serviceCollection.define(IClaudeSlashCommandService, {
		_serviceBrand: undefined,
		tryHandleCommand: vi.fn().mockResolvedValue({ handled: false }),
		getRegisteredCommands: vi.fn().mockReturnValue([]),
	});
	serviceCollection.define(IClaudeCodeSdkService, {
		_serviceBrand: undefined,
		query: vi.fn(),
		listSessions: vi.fn().mockResolvedValue([]),
		getSessionInfo: vi.fn().mockResolvedValue(undefined),
		getSessionMessages: vi.fn().mockResolvedValue([]),
		renameSession: vi.fn().mockResolvedValue(undefined),
		forkSession: vi.fn().mockResolvedValue({ sessionId: 'forked' }),
	});

	const accessor = serviceCollection.createTestingAccessor();
	const instaService = accessor.get(IInstantiationService);
	const provider = instaService.createInstance(ClaudeChatSessionContentProvider, agentManager ?? createMockAgentManager());
	return { provider, accessor };
}

describe('ChatSessionContentProvider', () => {
	let mockSessionService: IClaudeCodeSessionService;
	let mockFolderRepositoryManager: MockFolderRepositoryManager;
	let provider: ClaudeChatSessionContentProvider;
	const store = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	const workspaceFolderUri = URI.file('/project');

	beforeEach(() => {
		const mocks = createDefaultMocks();
		mockSessionService = mocks.mockSessionService;
		mockFolderRepositoryManager = mocks.mockFolderRepositoryManager;

		const result = createProviderWithServices(store, [workspaceFolderUri], mocks);
		provider = result.provider;
		accessor = result.accessor;
	});

	afterEach(() => {
		vi.clearAllMocks();
		store.clear();
	});

	// #region Provider-Level Tests

	describe('provideChatSessionContent', () => {
		it('returns empty history when no existing session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			const sessionUri = createClaudeSessionUri('test-session');
			const result = await provider.provideChatSessionContent(sessionUri, CancellationToken.None);

			expect(result.history).toEqual([]);
			expect(mockSessionService.getSession).toHaveBeenCalledWith(sessionUri, CancellationToken.None);
		});
	});

	// #endregion

	// #region newSessionOptions

	describe('newSessionOptions in provideChatSessionProviderOptions', () => {
		it('falls back to acceptEdits for permission mode in newSessionOptions', async () => {
			const options = await provider.provideChatSessionProviderOptions();
			expect(options.newSessionOptions!['permissionMode']).toBe('acceptEdits');
		});

		it('uses last-used permission mode in newSessionOptions', async () => {
			// Change permission mode on an existing session
			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');
			await provider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: 'plan' }],
				CancellationToken.None,
			);

			const options = await provider.provideChatSessionProviderOptions();
			expect(options.newSessionOptions!['permissionMode']).toBe('plan');
		});

		it('does not include folder in newSessionOptions for single-root workspace', async () => {
			const options = await provider.provideChatSessionProviderOptions();
			expect(options.newSessionOptions!['folder']).toBeUndefined();
		});
	});

	describe('newSessionOptions in multi-root workspace', () => {
		const folderA = URI.file('/project-a');
		const folderB = URI.file('/project-b');
		let multiRootProvider: ClaudeChatSessionContentProvider;

		beforeEach(() => {
			const mocks = createDefaultMocks();

			const result = createProviderWithServices(store, [folderA, folderB], mocks);
			multiRootProvider = result.provider;
		});

		it('includes default folder in newSessionOptions for multi-root workspace', async () => {
			const options = await multiRootProvider.provideChatSessionProviderOptions();
			expect(options.newSessionOptions).toBeDefined();
			expect(options.newSessionOptions!['folder']).toBe(folderA.fsPath);
		});
	});

	// #endregion

	// #region Folder Option Tests

	describe('folder option - single-root workspace', () => {
		it('does NOT include folder option group when single-root workspace', async () => {
			const options = await provider.provideChatSessionProviderOptions();
			const folderGroup = options.optionGroups?.find(g => g.id === 'folder');
			expect(folderGroup).toBeUndefined();
		});

		it('getFolderInfoForSession returns the one workspace folder as cwd', async () => {
			const folderInfo = await provider.getFolderInfoForSession('test-session');
			expect(folderInfo.cwd).toBe(workspaceFolderUri.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([]);
		});

		it('does NOT include folder in provideChatSessionContent options', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);
			const sessionUri = createClaudeSessionUri('test-session');
			const result = await provider.provideChatSessionContent(sessionUri, CancellationToken.None);
			expect(result.options?.['folder']).toBeUndefined();
		});
	});

	describe('folder option - multi-root workspace', () => {
		const folderA = URI.file('/project-a');
		const folderB = URI.file('/project-b');
		const folderC = URI.file('/project-c');
		let multiRootProvider: ClaudeChatSessionContentProvider;

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderRepositoryManager = mocks.mockFolderRepositoryManager;

			const result = createProviderWithServices(store, [folderA, folderB, folderC], mocks);
			multiRootProvider = result.provider;
		});

		it('includes folder option group with all workspace folders', async () => {
			const options = await multiRootProvider.provideChatSessionProviderOptions();
			const folderGroup = options.optionGroups?.find(g => g.id === 'folder');

			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items).toHaveLength(3);
			expect(folderGroup!.items.map(i => i.id)).toEqual([
				folderA.fsPath,
				folderB.fsPath,
				folderC.fsPath,
			]);
		});

		it('defaults cwd to first workspace folder when no selection made', async () => {
			const folderInfo = await multiRootProvider.getFolderInfoForSession('test-session');
			expect(folderInfo.cwd).toBe(folderA.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([folderB.fsPath, folderC.fsPath]);
		});

		it('uses selected folder as cwd after provideHandleOptionsChange', async () => {
			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');
			await multiRootProvider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'folder', value: folderB.fsPath }],
				CancellationToken.None,
			);

			const folderInfo = await multiRootProvider.getFolderInfoForSession('test-session');
			expect(folderInfo.cwd).toBe(folderB.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([folderA.fsPath, folderC.fsPath]);
		});

		it('includes default folder in provideChatSessionContent options for new session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);
			const sessionUri = createClaudeSessionUri('test-session');
			const result = await multiRootProvider.provideChatSessionContent(sessionUri, CancellationToken.None);

			// Should include folder option as string (not locked) for new sessions
			expect(result.options?.['folder']).toBe(folderA.fsPath);
		});

		it('locks folder option for existing sessions', async () => {
			const session: MockClaudeSession = {
				id: 'test-session',
				messages: [{
					type: 'user',
					message: { role: 'user', content: 'Hello' },
				}],
				subagents: [],
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const sessionUri = createClaudeSessionUri('test-session');
			const result = await multiRootProvider.provideChatSessionContent(sessionUri, CancellationToken.None);

			const folderOption = result.options?.['folder'];
			expect(folderOption).toBeDefined();
			expect(typeof folderOption).toBe('object');
			expect((folderOption as vscode.ChatSessionProviderOptionItem).locked).toBe(true);
		});

		it('locked folder option preserves the selected folder, not the first one', async () => {
			// Simulate user selecting folder B before the session is created
			seedSessionItem('pre-created-session');
			const sessionUri = createClaudeSessionUri('pre-created-session');
			await multiRootProvider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'folder', value: folderB.fsPath }],
				CancellationToken.None,
			);

			// Verify the selection took effect
			const folderInfo = await multiRootProvider.getFolderInfoForSession('pre-created-session');
			expect(folderInfo.cwd).toBe(folderB.fsPath);

			// Now load the same session as an existing session
			const session: MockClaudeSession = {
				id: 'pre-created-session',
				messages: [{
					type: 'user',
					message: { role: 'user', content: 'Hello' },
				}],
				subagents: [],
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const result = await multiRootProvider.provideChatSessionContent(sessionUri, CancellationToken.None);

			const folderOption = result.options?.['folder'] as vscode.ChatSessionProviderOptionItem;
			expect(folderOption).toBeDefined();
			expect(folderOption.locked).toBe(true);
			// Should show folder B (the selected folder), not folder A (the first)
			expect(folderOption.id).toBe(folderB.fsPath);
		});
	});

	describe('folder option - empty workspace', () => {
		let emptyWorkspaceProvider: ClaudeChatSessionContentProvider;
		let emptyMocks: ReturnType<typeof createDefaultMocks>;

		beforeEach(() => {
			emptyMocks = createDefaultMocks();
			mockSessionService = emptyMocks.mockSessionService;
			mockFolderRepositoryManager = emptyMocks.mockFolderRepositoryManager;

			const result = createProviderWithServices(store, [], emptyMocks);
			emptyWorkspaceProvider = result.provider;
		});

		it('includes folder option group with MRU entries', async () => {
			const mruFolder = URI.file('/recent/project');
			const mruRepo = URI.file('/recent/repo');
			mockFolderRepositoryManager.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
				{ folder: mruRepo, repository: mruRepo, lastAccessed: Date.now() - 1000 },
			]);

			const options = await emptyWorkspaceProvider.provideChatSessionProviderOptions();
			const folderGroup = options.optionGroups?.find(g => g.id === 'folder');

			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items).toHaveLength(2);
			expect(folderGroup!.items[0].id).toBe(mruFolder.fsPath);
			expect(folderGroup!.items[1].id).toBe(mruRepo.fsPath);
		});

		it('shows empty folder options when no MRU entries', async () => {
			const options = await emptyWorkspaceProvider.provideChatSessionProviderOptions();
			const folderGroup = options.optionGroups?.find(g => g.id === 'folder');

			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items).toHaveLength(0);
		});

		it('getFolderInfoForSession uses MRU fallback when no selection', async () => {
			const mruFolder = URI.file('/recent/project');
			mockFolderRepositoryManager.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			const folderInfo = await emptyWorkspaceProvider.getFolderInfoForSession('test-session');
			expect(folderInfo.cwd).toBe(mruFolder.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([]);
		});

		it('getFolderInfoForSession falls back to home directory when no folder available', async () => {
			const folderInfo = await emptyWorkspaceProvider.getFolderInfoForSession('test-session');
			expect(folderInfo.cwd).toBe(URI.file('/home/testuser').fsPath);
			expect(folderInfo.additionalDirectories).toEqual([]);
		});

		it('getFolderInfoForSession uses selected folder over MRU', async () => {
			const mruFolder = URI.file('/recent/project');
			const selectedFolder = URI.file('/selected/project');
			mockFolderRepositoryManager.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');
			await emptyWorkspaceProvider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'folder', value: selectedFolder.fsPath }],
				CancellationToken.None,
			);

			const folderInfo = await emptyWorkspaceProvider.getFolderInfoForSession('test-session');
			expect(folderInfo.cwd).toBe(selectedFolder.fsPath);
		});
	});

	// #endregion

	// #region Option Change Local Storage

	describe('provideHandleOptionsChange stores locally without updating session state', () => {
		it('stores permission mode selection locally and does not update session state service', async () => {
			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');
			const mockSessionStateService = accessor.get(IClaudeSessionStateService);
			const setPermissionSpy = vi.spyOn(mockSessionStateService, 'setPermissionModeForSession');

			await provider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: 'plan' }],
				CancellationToken.None
			);

			// Session state service should NOT have been called
			expect(setPermissionSpy).not.toHaveBeenCalled();

			// But getPermissionModeForSession should return the local selection
			const permissionMode = provider.getPermissionModeForSession('test-session');
			expect(permissionMode).toBe('plan');
		});

		it('local permission mode selection is used in provideChatSessionContent', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');

			// Set a local permission mode selection
			await provider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: 'plan' }],
				CancellationToken.None
			);

			const result = await provider.provideChatSessionContent(sessionUri, CancellationToken.None);
			expect(result.options?.['permissionMode']).toBe('plan');
		});

		it('local permission mode selection takes priority over session state service', async () => {
			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');

			// Set a value in the session state service directly
			const mockSessionStateService = accessor.get(IClaudeSessionStateService);
			mockSessionStateService.setPermissionModeForSession('test-session', 'acceptEdits');

			// Now set a different local selection
			await provider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: 'plan' }],
				CancellationToken.None
			);

			// Local selection should take priority
			const permissionMode = provider.getPermissionModeForSession('test-session');
			expect(permissionMode).toBe('plan');
		});

		it('ignores invalid permission mode values in provideHandleOptionsChange', async () => {
			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');

			await provider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: 'not-a-real-mode' }],
				CancellationToken.None,
			);

			// Should fall through to session state service default, not store the invalid value
			const permissionMode = provider.getPermissionModeForSession('test-session');
			expect(permissionMode).not.toBe('not-a-real-mode');
		});

		it('ignores empty permission mode value in provideHandleOptionsChange', async () => {
			seedSessionItem('test-session');
			const sessionUri = createClaudeSessionUri('test-session');

			await provider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: '' }],
				CancellationToken.None,
			);

			// Should not store empty string as permission mode
			const permissionMode = provider.getPermissionModeForSession('test-session');
			expect(permissionMode).not.toBe('');
		});

		it('accepts all valid permission modes in provideHandleOptionsChange', async () => {
			const validModes = ['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk'] as const;

			for (const mode of validModes) {
				seedSessionItem(`test-session-${mode}`);
				const sessionUri = createClaudeSessionUri(`test-session-${mode}`);
				await provider.provideHandleOptionsChange(
					sessionUri,
					[{ optionId: 'permissionMode', value: mode }],
					CancellationToken.None,
				);

				const permissionMode = provider.getPermissionModeForSession(`test-session-${mode}`);
				expect(permissionMode).toBe(mode);
			}
		});

		it('does not update _lastUsedPermissionMode when invalid mode is provided', async () => {
			// First set a valid mode
			seedSessionItem('session-valid');
			const sessionUri1 = createClaudeSessionUri('session-valid');
			await provider.provideHandleOptionsChange(
				sessionUri1,
				[{ optionId: 'permissionMode', value: 'plan' }],
				CancellationToken.None,
			);

			// Try to set an invalid mode on a different session
			seedSessionItem('session-invalid');
			const sessionUri2 = createClaudeSessionUri('session-invalid');
			await provider.provideHandleOptionsChange(
				sessionUri2,
				[{ optionId: 'permissionMode', value: 'bogus' }],
				CancellationToken.None,
			);

			// newSessionOptions should still reflect the last valid mode
			const options = await provider.provideChatSessionProviderOptions();
			expect(options.newSessionOptions!['permissionMode']).toBe('plan');
		});
	});

	// #endregion

	// #region Initial Session Options

	describe('initial session options on new sessions', () => {
		let mockAgentManager: ClaudeAgentManager;
		let handlerProvider: ClaudeChatSessionContentProvider;

		function createChatContext(sessionId: string, initialSessionOptions?: Array<{ optionId: string; value: string }>): vscode.ChatContext {
			return {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId(sessionId),
						label: 'Test Session',
					},
					initialSessionOptions,
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderRepositoryManager = mocks.mockFolderRepositoryManager;
			mockAgentManager = createMockAgentManager();

			const result = createProviderWithServices(store, [workspaceFolderUri], mocks, mockAgentManager);
			handlerProvider = result.provider;
		});

		it('sets permission mode from item metadata on new session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			// Seed the item with metadata (simulating newChatSessionItemHandler)
			seedSessionItem('new-session-1', { permissionMode: 'plan' });

			const handler = handlerProvider.createHandler();
			const context = createChatContext('new-session-1');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			// The handler commits state — verify the permission mode was used
			expect(handlerProvider.getPermissionModeForSession('new-session-1')).toBe('plan');
		});

		it('falls back to session state service when item metadata has no permission mode', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			// Seed a session item without explicit permission mode
			// getMetadata defaults to 'acceptEdits' when no valid permission mode is present
			seedSessionItem('new-session-2');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('new-session-2');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			// Without explicit permission mode in metadata, getMetadata falls back to 'acceptEdits'
			expect(handlerProvider.getPermissionModeForSession('new-session-2')).toBe('acceptEdits');
		});

		it('does not overwrite permission mode if already set for the session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			// Pre-set permission mode via provideHandleOptionsChange
			seedSessionItem('pre-set-session');
			const sessionUri = createClaudeSessionUri('pre-set-session');
			await handlerProvider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'permissionMode', value: 'default' }],
				CancellationToken.None,
			);

			const handler = handlerProvider.createHandler();
			const context = createChatContext('pre-set-session');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			// Should keep the pre-set value
			expect(handlerProvider.getPermissionModeForSession('pre-set-session')).toBe('default');
		});

		it('does not apply initialSessionOptions on resumed sessions', async () => {
			// Session exists on disk → not new
			vi.mocked(mockSessionService.getSession).mockResolvedValue({
				id: 'existing-session',
				messages: [{ type: 'user', message: { role: 'user', content: 'Hello' } }],
				subagents: [],
			} as any);

			// Seed the item without bypassPermissions — simulates an existing session
			seedSessionItem('existing-session', { permissionMode: 'acceptEdits' });

			const handler = handlerProvider.createHandler();
			const context = createChatContext('existing-session');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			// Should not have been set to bypassPermissions since that wasn't in metadata
			expect(handlerProvider.getPermissionModeForSession('existing-session')).not.toBe('bypassPermissions');
		});
	});

	describe('initial folder option on new sessions', () => {
		const folderA = URI.file('/project-a');
		const folderB = URI.file('/project-b');
		let mockAgentManager: ClaudeAgentManager;
		let multiRootProvider: ClaudeChatSessionContentProvider;

		function createChatContext(sessionId: string, initialSessionOptions?: Array<{ optionId: string; value: string }>): vscode.ChatContext {
			return {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId(sessionId),
						label: 'Test Session',
					},
					initialSessionOptions,
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;
			mockAgentManager = createMockAgentManager();

			const result = createProviderWithServices(store, [folderA, folderB], mocks, mockAgentManager);
			multiRootProvider = result.provider;
		});

		it('sets folder from item metadata on new session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			// Seed the item with folder metadata (simulating newChatSessionItemHandler)
			seedSessionItem('new-folder-session', { cwd: folderB });

			const handler = multiRootProvider.createHandler();
			const context = createChatContext('new-folder-session');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const folderInfo = await multiRootProvider.getFolderInfoForSession('new-folder-session');
			expect(folderInfo.cwd).toBe(folderB.fsPath);
		});

		it('does not overwrite folder if already set for the session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			// Pre-set folder via provideHandleOptionsChange
			seedSessionItem('pre-folder-session');
			const sessionUri = createClaudeSessionUri('pre-folder-session');
			await multiRootProvider.provideHandleOptionsChange(
				sessionUri,
				[{ optionId: 'folder', value: folderA.fsPath }],
				CancellationToken.None,
			);

			const handler = multiRootProvider.createHandler();
			const context = createChatContext('pre-folder-session');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const folderInfo = await multiRootProvider.getFolderInfoForSession('pre-folder-session');
			expect(folderInfo.cwd).toBe(folderA.fsPath);
		});
	});

	// #endregion

	// #region isNewSession Handling

	describe('isNewSession determination via session service', () => {
		let mockAgentManager: ClaudeAgentManager;
		let handlerProvider: ClaudeChatSessionContentProvider;

		function createChatContext(sessionId: string): vscode.ChatContext {
			return {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId(sessionId),
						label: 'Test Session',
					},
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderRepositoryManager = mocks.mockFolderRepositoryManager;
			mockAgentManager = createMockAgentManager();

			const result = createProviderWithServices(store, [workspaceFolderUri], mocks, mockAgentManager);
			handlerProvider = result.provider;
		});

		it('treats session as new when no session exists on disk', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);
			seedSessionItem('real-uuid-123');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('real-uuid-123');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const handleRequestMock = vi.mocked(mockAgentManager.handleRequest);
			expect(handleRequestMock).toHaveBeenCalledOnce();

			const [sessionId, , , , , isNewSession] = handleRequestMock.mock.calls[0];
			expect(sessionId).toBe('real-uuid-123');
			expect(isNewSession).toBe(true);
		});

		it('treats session as resumed when session exists on disk', async () => {
			seedSessionItem('real-uuid-123');
			vi.mocked(mockSessionService.getSession).mockResolvedValue({
				id: 'real-uuid-123',
				messages: [{ type: 'user', message: { role: 'user', content: 'Hello' } }],
				subagents: [],
			} as any);

			const handler = handlerProvider.createHandler();
			const context = createChatContext('real-uuid-123');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const handleRequestMock = vi.mocked(mockAgentManager.handleRequest);
			expect(handleRequestMock).toHaveBeenCalledOnce();

			const [sessionId, , , , , isNewSession] = handleRequestMock.mock.calls[0];
			expect(sessionId).toBe('real-uuid-123');
			expect(isNewSession).toBe(false);
		});

		it('second request is not treated as new when session exists on disk', async () => {
			seedSessionItem('real-uuid-123');
			const handler = handlerProvider.createHandler();
			const stream = new MockChatResponseStream();

			// First request: no session on disk yet → new session
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);
			const firstContext = createChatContext('real-uuid-123');
			await handler(createTestRequest('first'), firstContext, stream, CancellationToken.None);

			// Second request: session now exists on disk → resumed
			vi.mocked(mockSessionService.getSession).mockResolvedValue({
				id: 'real-uuid-123',
				messages: [{ type: 'user', message: { role: 'user', content: 'first' } }],
				subagents: [],
			} as any);
			const secondContext = createChatContext('real-uuid-123');
			await handler(createTestRequest('second'), secondContext, stream, CancellationToken.None);

			const handleRequestMock = vi.mocked(mockAgentManager.handleRequest);
			const [, , , , , secondIsNew] = handleRequestMock.mock.calls[1];
			expect(secondIsNew).toBe(false);
		});
	});

	// #endregion

	// #region Handler Integration

	describe('handler integration', () => {
		let mockAgentManager: ClaudeAgentManager;
		let handlerProvider: ClaudeChatSessionContentProvider;
		let handlerAccessor: ITestingServicesAccessor;

		function createChatContext(sessionId: string): vscode.ChatContext {
			return {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId(sessionId),
						label: 'Test Session',
					},
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderRepositoryManager = mocks.mockFolderRepositoryManager;
			mockAgentManager = createMockAgentManager();

			const result = createProviderWithServices(store, [workspaceFolderUri], mocks, mockAgentManager);
			handlerProvider = result.provider;
			handlerAccessor = result.accessor;
		});

		it('commits request.model.id to session state service', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);
			seedSessionItem('session-1');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('session-1');
			const stream = new MockChatResponseStream();

			const mockSessionStateService = handlerAccessor.get(IClaudeSessionStateService);
			const setModelSpy = vi.spyOn(mockSessionStateService, 'setModelIdForSession');

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			expect(setModelSpy).toHaveBeenCalledWith('session-1', 'claude-3-5-sonnet-20241022');
		});

		it('short-circuits before session resolution when slash command is handled', async () => {
			const slashCommandService = handlerAccessor.get(IClaudeSlashCommandService);
			vi.mocked(slashCommandService.tryHandleCommand).mockResolvedValue({
				handled: true,
				result: { metadata: { command: '/test' } },
			} as any);

			const handler = handlerProvider.createHandler();
			const context = createChatContext('session-1');
			const stream = new MockChatResponseStream();

			const result = await handler(new TestChatRequest('/test'), context, stream, CancellationToken.None);

			// Slash command handled → no agent call
			expect(vi.mocked(mockAgentManager.handleRequest)).not.toHaveBeenCalled();
			expect(result).toEqual({ metadata: { command: '/test' } });
		});
	});

	// #endregion
});

// #region FakeGitService

/**
 * A git service mock with event emitters that can be fired in tests.
 * Unlike MockGitService, this supports onDidOpenRepository event firing.
 */
class FakeGitService extends mock<IGitService>() {
	private readonly _onDidOpenRepository = new Emitter<RepoContext>();
	override readonly onDidOpenRepository = this._onDidOpenRepository.event;

	private readonly _onDidCloseRepository = new Emitter<RepoContext>();
	override readonly onDidCloseRepository = this._onDidCloseRepository.event;

	override readonly onDidFinishInitialization: Event<void> = Event.None;

	override repositories: RepoContext[] = [];
	override isInitialized = true;

	fireOpenRepository(repo: RepoContext): void {
		this._onDidOpenRepository.fire(repo);
	}

	fireCloseRepository(repo: RepoContext): void {
		this._onDidCloseRepository.fire(repo);
	}

	override dispose(): void {
		this._onDidOpenRepository.dispose();
		this._onDidCloseRepository.dispose();
	}
}

// #endregion

describe('ClaudeChatSessionItemController', () => {
	const store = new DisposableStore();
	let mockSessionService: IClaudeCodeSessionService;
	let mockSdkService: IClaudeCodeSdkService;
	let controller: ClaudeChatSessionItemController;

	function getItem(sessionId: string): vscode.ChatSessionItem | undefined {
		return lastCreatedItemsMap.get(ClaudeSessionUri.forSessionId(sessionId).toString());
	}

	function createController(workspaceFolders: URI[], gitService?: IGitService): ClaudeChatSessionItemController {
		const serviceCollection = store.add(createExtensionUnitTestingServices());
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		serviceCollection.set(IWorkspaceService, workspaceService);
		serviceCollection.set(IGitService, gitService ?? new MockGitService());
		serviceCollection.define(IClaudeCodeSessionService, mockSessionService);
		mockSdkService = {
			_serviceBrand: undefined,
			query: vi.fn(),
			listSessions: vi.fn().mockResolvedValue([]),
			getSessionInfo: vi.fn().mockResolvedValue(undefined),
			getSessionMessages: vi.fn().mockResolvedValue([]),
			renameSession: vi.fn().mockResolvedValue(undefined),
			forkSession: vi.fn().mockResolvedValue({ sessionId: 'forked-session-id' }),
		};
		serviceCollection.define(IClaudeCodeSdkService, mockSdkService);
		const accessor = serviceCollection.createTestingAccessor();
		const ctrl = accessor.get(IInstantiationService).createInstance(ClaudeChatSessionItemController);
		store.add(ctrl);
		return ctrl;
	}

	beforeEach(() => {
		mockSessionService = {
			_serviceBrand: undefined,
			getSession: vi.fn().mockResolvedValue(undefined),
			getAllSessions: vi.fn().mockResolvedValue([]),
		} as unknown as IClaudeCodeSessionService;
	});

	afterEach(() => {
		vi.clearAllMocks();
		store.clear();
	});

	// #region updateItemStatus

	describe('updateItemStatus', () => {
		beforeEach(() => {
			controller = createController([URI.file('/project')]);
		});

		it('creates a new item with the provided label when no disk session exists', async () => {
			await controller.updateItemStatus('new-session', ChatSessionStatus.InProgress, 'Hello world');

			const item = getItem('new-session');
			expect(item).toBeDefined();
			expect(item!.label).toBe('Hello world');
			expect(item!.status).toBe(ChatSessionStatus.InProgress);
		});

		it('sets timing.lastRequestStarted and clears lastRequestEnded for InProgress', async () => {
			const before = Date.now();
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'Test prompt');
			const after = Date.now();

			const item = getItem('session-1');
			expect(item!.timing).toBeDefined();
			expect(item!.timing!.lastRequestStarted).toBeGreaterThanOrEqual(before);
			expect(item!.timing!.lastRequestStarted).toBeLessThanOrEqual(after);
			expect(item!.timing!.lastRequestEnded).toBeUndefined();
		});

		it('sets timing.lastRequestEnded for Completed status', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'Test prompt');

			const beforeComplete = Date.now();
			await controller.updateItemStatus('session-1', ChatSessionStatus.Completed, 'Test prompt');
			const afterComplete = Date.now();

			const item = getItem('session-1');
			expect(item!.timing!.lastRequestEnded).toBeGreaterThanOrEqual(beforeComplete);
			expect(item!.timing!.lastRequestEnded).toBeLessThanOrEqual(afterComplete);
		});

		it('clears lastRequestEnded on second InProgress after Completed', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'Test prompt');
			await controller.updateItemStatus('session-1', ChatSessionStatus.Completed, 'Test prompt');
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'Test prompt');

			const item = getItem('session-1');
			expect(item!.timing!.lastRequestEnded).toBeUndefined();
			expect(item!.timing!.lastRequestStarted).toBeDefined();
		});

		it('creates timing with lastRequestEnded when Completed is called without prior InProgress', async () => {
			const before = Date.now();
			await controller.updateItemStatus('session-1', ChatSessionStatus.Completed, 'Test prompt');
			const after = Date.now();

			const item = getItem('session-1');
			expect(item!.timing).toBeDefined();
			expect(item!.timing!.created).toBeGreaterThanOrEqual(before);
			expect(item!.timing!.created).toBeLessThanOrEqual(after);
			expect(item!.timing!.lastRequestEnded).toBeGreaterThanOrEqual(before);
			expect(item!.timing!.lastRequestEnded).toBeLessThanOrEqual(after);
		});

		it('uses session data from disk when available', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'disk-session',
				label: 'Disk Session Label',
				created: new Date('2024-01-01T00:00:00Z').getTime(),
				lastRequestEnded: new Date('2024-01-01T01:00:00Z').getTime(),
				folderName: 'my-project',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('disk-session', ChatSessionStatus.InProgress, 'Ignored label');

			const item = getItem('disk-session');
			expect(item).toBeDefined();
			expect(item!.label).toBe('Disk Session Label');
			expect(item!.tooltip).toBe('Claude Code session: Disk Session Label');

			expect(mockSessionService.getSession).toHaveBeenCalledOnce();
			const [calledUri] = vi.mocked(mockSessionService.getSession).mock.calls[0];
			expect(calledUri.scheme).toBe('claude-code');
			expect(calledUri.path).toBe('/disk-session');
		});

		it('handles multiple independent sessions', async () => {
			await controller.updateItemStatus('session-a', ChatSessionStatus.InProgress, 'Prompt A');
			await controller.updateItemStatus('session-b', ChatSessionStatus.InProgress, 'Prompt B');
			await controller.updateItemStatus('session-a', ChatSessionStatus.Completed, 'Prompt A');

			const itemA = getItem('session-a');
			const itemB = getItem('session-b');
			expect(itemA!.status).toBe(ChatSessionStatus.Completed);
			expect(itemB!.status).toBe(ChatSessionStatus.InProgress);
		});
	});

	// #endregion

	// #region Session item properties

	describe('session item properties', () => {
		beforeEach(() => {
			controller = createController([URI.file('/project')]);
		});

		it('sets resource with correct scheme and path', async () => {
			await controller.updateItemStatus('my-session', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('my-session');
			expect(item!.resource.scheme).toBe('claude-code');
			expect(item!.resource.path).toBe('/my-session');
		});

		it('sets tooltip to formatted session name', async () => {
			await controller.updateItemStatus('my-session', ChatSessionStatus.InProgress, 'fix the bug');

			const item = getItem('my-session');
			expect(item!.tooltip).toBe('Claude Code session: fix the bug');
		});

		it('sets iconPath to claude ThemeIcon', async () => {
			await controller.updateItemStatus('my-session', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('my-session');
			expect(item!.iconPath).toBeDefined();
			expect(item!.iconPath).toBeInstanceOf(ThemeIcon);
			expect((item!.iconPath as ThemeIcon).id).toBe('claude');
		});

		it('uses disk session label and timestamps when available', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'disk-session',
				label: 'Disk Label',
				created: new Date('2024-06-01T12:00:00Z').getTime(),
				lastRequestEnded: new Date('2024-06-01T13:00:00Z').getTime(),
				folderName: undefined,
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('disk-session', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('disk-session');
			expect(item!.label).toBe('Disk Label');
			expect(item!.tooltip).toBe('Claude Code session: Disk Label');
			// timing.created is derived from created
			expect(item!.timing!.created).toBe(new Date('2024-06-01T12:00:00Z').getTime());
		});
	});

	// #endregion

	// #region Badge visibility

	describe('badge visibility', () => {
		it('does not show badge in single-root workspace with zero repos', async () => {
			controller = createController([URI.file('/project')]);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test',
				label: 'Test',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'project',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			expect(item!.badge).toBeUndefined();
		});

		it('shows badge in multi-root workspace', async () => {
			controller = createController([URI.file('/project-a'), URI.file('/project-b')]);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test',
				label: 'Test',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'project-a',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			expect(item!.badge).toBeDefined();
			expect(item!.badge).toBeInstanceOf(MarkdownString);
			expect((item!.badge as MarkdownString).value).toBe('$(folder) project-a');
		});

		it('shows badge in empty workspace', async () => {
			controller = createController([]);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test',
				label: 'Test',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'my-folder',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			expect(item!.badge).toBeDefined();
			expect((item!.badge as MarkdownString).value).toBe('$(folder) my-folder');
		});

		it('badge has supportThemeIcons set to true', async () => {
			controller = createController([URI.file('/a'), URI.file('/b')]);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test',
				label: 'Test',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'project',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			expect((item!.badge as MarkdownString).supportThemeIcons).toBe(true);
		});

		it('badge is undefined when session has no folderName', async () => {
			controller = createController([URI.file('/a'), URI.file('/b')]);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			// No disk session → no folderName → no badge even though multi-root
			expect(item!.badge).toBeUndefined();
		});

		it('different sessions show their own folder names', async () => {
			controller = createController([URI.file('/a'), URI.file('/b')]);

			vi.mocked(mockSessionService.getSession)
				.mockResolvedValueOnce({
					id: 'session-1', label: 'S1',
					created: Date.now(), lastRequestEnded: Date.now(),
					folderName: 'frontend',
				} as any)
				.mockResolvedValueOnce({
					id: 'session-2', label: 'S2',
					created: Date.now(), lastRequestEnded: Date.now(),
					folderName: 'backend',
				} as any);

			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'S1');
			await controller.updateItemStatus('session-2', ChatSessionStatus.InProgress, 'S2');

			expect((getItem('session-1')!.badge as MarkdownString).value).toBe('$(folder) frontend');
			expect((getItem('session-2')!.badge as MarkdownString).value).toBe('$(folder) backend');
		});

		it('shows badge in single-root workspace with multiple non-worktree repos', async () => {
			const fakeGit = new FakeGitService();
			fakeGit.repositories = [
				{ rootUri: URI.file('/project/repo1'), kind: 'repository' } as unknown as RepoContext,
				{ rootUri: URI.file('/project/repo2'), kind: 'repository' } as unknown as RepoContext,
			];
			controller = createController([URI.file('/project')], fakeGit);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test', label: 'Test',
				created: Date.now(), lastRequestEnded: Date.now(),
				folderName: 'repo1',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			expect(item!.badge).toBeDefined();
			expect((item!.badge as MarkdownString).value).toBe('$(folder) repo1');
		});

		it('does not show badge when extra repos are worktrees', async () => {
			const fakeGit = new FakeGitService();
			fakeGit.repositories = [
				{ rootUri: URI.file('/project/main'), kind: 'repository' } as unknown as RepoContext,
				{ rootUri: URI.file('/project/wt'), kind: 'worktree' } as unknown as RepoContext,
			];
			controller = createController([URI.file('/project')], fakeGit);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test', label: 'Test',
				created: Date.now(), lastRequestEnded: Date.now(),
				folderName: 'main',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('test');
			// Only 1 non-worktree repo → no badge
			expect(item!.badge).toBeUndefined();
		});
	});

	// #endregion

	// #region Git event refresh

	describe('git event refresh', () => {
		it('recomputes badge when a repository opens', async () => {
			const fakeGit = new FakeGitService();
			fakeGit.repositories = [];
			controller = createController([URI.file('/project')], fakeGit);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test', label: 'Test',
				created: Date.now(), lastRequestEnded: Date.now(),
				folderName: 'repo1',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);
			vi.mocked(mockSessionService.getAllSessions).mockResolvedValue([sessionInfo]);

			// Initially no repos → single-root with 0 repos, _computeShowBadge returns false
			await controller.updateItemStatus('test', ChatSessionStatus.Completed, 'hello');
			expect(getItem('test')!.badge).toBeUndefined();

			// Now simulate two repos opening (monorepo scenario)
			const repo1 = { rootUri: URI.file('/project/r1'), kind: 'repository' } as unknown as RepoContext;
			const repo2 = { rootUri: URI.file('/project/r2'), kind: 'repository' } as unknown as RepoContext;
			fakeGit.repositories = [repo1, repo2];
			fakeGit.fireOpenRepository(repo2);

			// Flush microtask queue so the async _refreshItems completes.
			await new Promise(r => setTimeout(r, 0));

			const refreshedItem = getItem('test');
			expect(refreshedItem).toBeDefined();
			expect(refreshedItem!.badge).toBeDefined();
			expect((refreshedItem!.badge as MarkdownString).value).toBe('$(folder) repo1');
		});

		it('recomputes badge when a repository closes', async () => {
			const fakeGit = new FakeGitService();
			const repo1 = { rootUri: URI.file('/project/r1'), kind: 'repository' } as unknown as RepoContext;
			const repo2 = { rootUri: URI.file('/project/r2'), kind: 'repository' } as unknown as RepoContext;
			fakeGit.repositories = [repo1, repo2];
			controller = createController([URI.file('/project')], fakeGit);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test', label: 'Test',
				created: Date.now(), lastRequestEnded: Date.now(),
				folderName: 'repo1',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);
			vi.mocked(mockSessionService.getAllSessions).mockResolvedValue([sessionInfo]);

			await controller.updateItemStatus('test', ChatSessionStatus.Completed, 'hello');
			expect(getItem('test')!.badge).toBeDefined();

			// Close one repo → single non-worktree repo → badge should disappear
			fakeGit.repositories = [repo1];
			fakeGit.fireCloseRepository(repo2);

			// Flush microtask queue so the async _refreshItems completes.
			await new Promise(r => setTimeout(r, 0));

			const refreshedItem = getItem('test');
			expect(refreshedItem).toBeDefined();
			expect(refreshedItem!.badge).toBeUndefined();
		});

		it('preserves in-progress items after refresh', async () => {
			const fakeGit = new FakeGitService();
			fakeGit.repositories = [];
			controller = createController([URI.file('/project')], fakeGit);

			const sessionInfo: IClaudeCodeSessionInfo = {
				id: 'test', label: 'Test',
				created: Date.now(), lastRequestEnded: Date.now(),
				folderName: 'repo1',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(sessionInfo as any);
			vi.mocked(mockSessionService.getAllSessions).mockResolvedValue([sessionInfo]);

			await controller.updateItemStatus('test', ChatSessionStatus.InProgress, 'hello');
			const itemBeforeRefresh = getItem('test');
			expect(itemBeforeRefresh).toBeDefined();
			expect(itemBeforeRefresh!.status).toBe(ChatSessionStatus.InProgress);

			// Trigger a refresh via git event
			const repo1 = { rootUri: URI.file('/project/r1'), kind: 'repository' } as unknown as RepoContext;
			fakeGit.repositories = [repo1];
			fakeGit.fireOpenRepository(repo1);

			await new Promise(r => setTimeout(r, 0));

			const refreshedItem = getItem('test');
			expect(refreshedItem).toBeDefined();
			expect(refreshedItem!.status).toBe(ChatSessionStatus.InProgress);
		});
	});

	// #endregion

	// #region Metadata management

	describe('getMetadata and setMetadata', () => {
		beforeEach(() => {
			controller = createController([URI.file('/project')]);
		});

		it('returns undefined when no item exists for the session', () => {
			const result = controller.getMetadata('nonexistent-session');
			expect(result).toBeUndefined();
		});

		it('returns undefined permission mode when item has no metadata set', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			const meta = controller.getMetadata('session-1');
			expect(meta).toBeDefined();
			expect(meta!.permissionMode).toBeUndefined();
		});

		it('stores and retrieves permission mode', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			controller.setMetadata('session-1', { permissionMode: 'plan' });

			const meta = controller.getMetadata('session-1');
			expect(meta!.permissionMode).toBe('plan');
		});

		it('stores and retrieves cwd', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			const folderUri = URI.file('/some/folder');
			controller.setMetadata('session-1', { cwd: folderUri });

			const meta = controller.getMetadata('session-1');
			expect(meta!.cwd).toBeDefined();
			expect(meta!.cwd!.fsPath).toBe(folderUri.fsPath);
		});

		it('preserves existing permission mode when only cwd is updated', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			controller.setMetadata('session-1', { permissionMode: 'plan' });
			controller.setMetadata('session-1', { cwd: URI.file('/folder') });

			const meta = controller.getMetadata('session-1');
			expect(meta!.permissionMode).toBe('plan');
			expect(meta!.cwd!.fsPath).toBe(URI.file('/folder').fsPath);
		});

		it('preserves existing cwd when only permission mode is updated', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			const folderUri = URI.file('/some/folder');
			controller.setMetadata('session-1', { cwd: folderUri });
			controller.setMetadata('session-1', { permissionMode: 'default' });

			const meta = controller.getMetadata('session-1');
			expect(meta!.permissionMode).toBe('default');
			expect(meta!.cwd!.fsPath).toBe(folderUri.fsPath);
		});

		it('falls back to acceptEdits for invalid permission mode in metadata', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			// Directly set invalid metadata to simulate corrupted state
			const item = getItem('session-1');
			item!.metadata = { permissionMode: 'garbage' };

			const meta = controller.getMetadata('session-1');
			expect(meta!.permissionMode).toBe('acceptEdits');
		});

		it('falls back to acceptEdits for empty string permission mode in metadata', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('session-1');
			item!.metadata = { permissionMode: '' };

			const meta = controller.getMetadata('session-1');
			expect(meta!.permissionMode).toBe('acceptEdits');
		});

		it('preserves unknown metadata fields when setting known fields', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			const item = getItem('session-1');
			item!.metadata = { permissionMode: 'plan', customField: 'should-survive' };

			controller.setMetadata('session-1', { cwd: URI.file('/new-cwd') });

			expect(item!.metadata.customField).toBe('should-survive');
			expect(item!.metadata.permissionMode).toBe('plan');
			expect(URI.isUri(item!.metadata.cwd)).toBe(true);
		});

		it('clears invalid cwd in metadata', async () => {
			await controller.updateItemStatus('session-1', ChatSessionStatus.InProgress, 'hello');

			// Directly set invalid cwd metadata
			const item = getItem('session-1');
			item!.metadata = { permissionMode: 'plan', cwd: 'not-a-uri' };

			const meta = controller.getMetadata('session-1');
			expect(meta!.permissionMode).toBe('plan');
			expect(meta!.cwd).toBeUndefined();
		});

		it('does nothing when setting metadata on a nonexistent session', () => {
			// Should not throw
			controller.setMetadata('nonexistent', { permissionMode: 'plan' });
			expect(controller.getMetadata('nonexistent')).toBeUndefined();
		});
	});

	// #endregion

	// #region forkHandler

	describe('forkHandler', () => {
		beforeEach(() => {
			controller = createController([URI.file('/project')]);
		});

		function makeSession(id: string, messages: Array<{ uuid: string; type: string }>) {
			return {
				id,
				label: 'Test session',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				messages: messages.map(m => ({
					...m,
					sessionId: id,
					timestamp: new Date(),
					parentUuid: null,
					message: {},
				})),
				subagents: [],
			};
		}

		it('forks whole history when no request is specified', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), {
				resource: sessionResource,
				label: 'Original',
				metadata: { permissionMode: 'plan', cwd: URI.file('/project') },
			});

			const result = await lastForkHandler!(sessionResource, undefined, CancellationToken.None);

			expect(mockSdkService.forkSession).toHaveBeenCalledWith('sess-1', { upToMessageId: undefined, title: expect.any(String) });
			expect(result.resource.toString()).toContain('forked-session-id');
			expect(result.label).toContain('Forked');
		});

		it('clones metadata from original item to forked item', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			const originalMetadata = { permissionMode: 'plan', cwd: URI.file('/project'), customField: 'preserved' };
			lastCreatedItemsMap.set(sessionResource.toString(), {
				resource: sessionResource,
				label: 'Original',
				metadata: originalMetadata,
			});

			const result = await lastForkHandler!(sessionResource, undefined, CancellationToken.None);

			// Metadata should be a clone, not the same reference
			expect(result.metadata).toEqual(originalMetadata);
			expect(result.metadata).not.toBe(originalMetadata);
		});

		it('forks at the message before the specified request', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), { resource: sessionResource, label: 'Original' });

			const session = makeSession('sess-1', [
				{ uuid: 'msg-1', type: 'user' },
				{ uuid: 'msg-2', type: 'assistant' },
				{ uuid: 'msg-3', type: 'user' },
			]);
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const request = { id: 'msg-3', prompt: 'test' } as vscode.ChatRequestTurn2;
			await lastForkHandler!(sessionResource, request, CancellationToken.None);

			expect(mockSdkService.forkSession).toHaveBeenCalledWith('sess-1', { upToMessageId: 'msg-2', title: expect.any(String) });
		});

		it('throws when session is not found for a specific request fork', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), { resource: sessionResource, label: 'Original' });
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			const request = { id: 'msg-1', prompt: 'test' } as vscode.ChatRequestTurn2;
			await expect(lastForkHandler!(sessionResource, request, CancellationToken.None)).rejects.toThrow(/session not found/i);
		});

		it('throws when request message is not found in session', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), { resource: sessionResource, label: 'Original' });

			const session = makeSession('sess-1', [{ uuid: 'msg-1', type: 'user' }]);
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const request = { id: 'nonexistent', prompt: 'test' } as vscode.ChatRequestTurn2;
			await expect(lastForkHandler!(sessionResource, request, CancellationToken.None)).rejects.toThrow(/could not be found/i);
		});

		it('throws when trying to fork at the first message', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), { resource: sessionResource, label: 'Original' });

			const session = makeSession('sess-1', [{ uuid: 'msg-1', type: 'user' }]);
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const request = { id: 'msg-1', prompt: 'test' } as vscode.ChatRequestTurn2;
			await expect(lastForkHandler!(sessionResource, request, CancellationToken.None)).rejects.toThrow(/first message/i);
		});

		it('adds the forked item to the controller items', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), { resource: sessionResource, label: 'Original' });

			await lastForkHandler!(sessionResource, undefined, CancellationToken.None);

			const forkedItem = getItem('forked-session-id');
			expect(forkedItem).toBeDefined();
			expect(forkedItem!.iconPath).toBeDefined();
			expect(forkedItem!.timing).toBeDefined();
		});
	});

	// #endregion
});
function createClaudeSessionUri(id: string): URI {
	return URI.parse(`claude-code:/${id}`);
}
