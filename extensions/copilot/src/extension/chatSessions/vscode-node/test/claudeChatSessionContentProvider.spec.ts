/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as path from 'path';
import type * as vscode from 'vscode';
// eslint-disable-next-line no-duplicate-imports
import * as vscodeShim from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IGitService, RepoContext } from '../../../../platform/git/common/gitService';
import { Change, Repository } from '../../../../platform/git/vscode/git';
import { MockGitService } from '../../../../platform/ignore/node/test/mockGitService';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../util/common/test/simpleMock';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { observableValue } from '../../../../util/vs/base/common/observableInternal/observables/observableValue';
import { URI } from '../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { ChatSessionStatus, MarkdownString, ThemeIcon } from '../../../../vscodeTypes';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { MockChatResponseStream, TestChatRequest } from '../../../test/node/testHelpers';
import { ClaudeFolderInfo } from '../../claude/common/claudeFolderInfo';
import { ClaudeSessionUri } from '../../claude/common/claudeSessionUri';
import type { ClaudeAgentManager } from '../../claude/node/claudeCodeAgent';
import { IClaudeCodeSdkService } from '../../claude/node/claudeCodeSdkService';
import { parseClaudeModelId } from '../../claude/node/claudeModelId';
import { IClaudeSessionStateService } from '../../claude/common/claudeSessionStateService';
import { IClaudeCodeSessionService } from '../../claude/node/sessionParser/claudeCodeSessionService';
import { IClaudeCodeSessionInfo } from '../../claude/node/sessionParser/claudeSessionSchema';
import { IClaudeSlashCommandService } from '../../claude/vscode-node/claudeSlashCommandService';
import { FolderRepositoryMRUEntry, IChatFolderMruService } from '../../common/folderRepositoryManager';
import { IClaudeWorkspaceFolderService } from '../../common/claudeWorkspaceFolderService';
import { builtinSlashCommands } from '../../common/builtinSlashCommands';
import { ClaudeChatSessionContentProvider, ClaudeChatSessionItemController } from '../claudeChatSessionContentProvider';

// Expose the most recently created items map so tests can inspect controller items.
let lastCreatedItemsMap: Map<string, vscode.ChatSessionItem>;
// Expose the most recently registered fork handler so tests can invoke it directly.
let lastForkHandler: ((sessionResource: vscode.Uri, request: vscode.ChatRequestTurn2 | undefined, token: CancellationToken) => Thenable<vscode.ChatSessionItem>) | undefined;
// Expose the most recently registered getChatSessionInputState handler so tests can invoke it.
let lastGetChatSessionInputState: vscode.ChatSessionControllerGetInputState | undefined;

// Patch vscode shim with missing namespaces before any production code imports it.
beforeAll(() => {
	(vscodeShim as Record<string, unknown>).commands = {
		registerCommand: vi.fn().mockReturnValue({ dispose: () => { } }),
		executeCommand: vi.fn().mockResolvedValue(undefined),
	};
	(vscodeShim as Record<string, unknown>).chat = {
		createChatSessionItemController: () => {
			const itemsMap = new Map<string, vscode.ChatSessionItem>();
			lastCreatedItemsMap = itemsMap;
			lastForkHandler = undefined;
			lastGetChatSessionInputState = undefined;
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
				createChatSessionInputState: (groups: vscode.ChatSessionProviderOptionGroup[]) => {
					const emitter = new Emitter<void>();
					const state: vscode.ChatSessionInputState = {
						groups,
						sessionResource: undefined,
						onDidChange: emitter.event,
						onDidDispose: Event.None,
					};
					// Proxy that fires onDidChange when groups are replaced
					return new Proxy(state, {
						set(target, prop, value) {
							(target as any)[prop] = value;
							if (prop === 'groups') {
								emitter.fire();
							}
							return true;
						},
					});
				},
				set getChatSessionInputState(handler: vscode.ChatSessionControllerGetInputState) { lastGetChatSessionInputState = handler; },
				set forkHandler(handler: typeof lastForkHandler) { lastForkHandler = handler; },
				refreshHandler: () => Promise.resolve(),
				dispose: () => { },
				onDidArchiveChatSessionItem: () => ({ dispose: () => { } }),
			};
		},
	};
});

class MockChatFolderMruService implements IChatFolderMruService {
	declare _serviceBrand: undefined;

	private _mruEntries: FolderRepositoryMRUEntry[] = [];

	setMRUEntries(entries: FolderRepositoryMRUEntry[]): void {
		this._mruEntries = entries;
	}

	async getRecentlyUsedFolders(): Promise<FolderRepositoryMRUEntry[]> {
		return this._mruEntries;
	}

	async deleteRecentlyUsedFolder(): Promise<void> { }
}

function createDefaultMocks() {
	const mockSessionService: IClaudeCodeSessionService = {
		getSession: vi.fn()
	} as any;

	const mockFolderMruService = new MockChatFolderMruService();

	return { mockSessionService, mockFolderMruService };
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
 * Adds a session item to the controller's items map.
 * This simulates what newChatSessionItemHandler does when VS Code creates a new session.
 */
function seedSessionItem(sessionId: string): void {
	const resource = ClaudeSessionUri.forSessionId(sessionId);
	const item: vscode.ChatSessionItem = {
		resource,
		label: sessionId,
	};
	lastCreatedItemsMap.set(resource.toString(), item);
}

/**
 * Builds a minimal permission mode input state group with the given mode selected.
 * Defaults to 'acceptEdits' if no mode specified.
 */
function buildPermissionModeGroup(selectedMode: string = 'acceptEdits'): vscode.ChatSessionProviderOptionGroup {
	const items = [
		{ id: 'default', name: 'Ask before edits' },
		{ id: 'acceptEdits', name: 'Edit automatically' },
		{ id: 'plan', name: 'Plan mode' },
		{ id: 'bypassPermissions', name: 'Yolo mode' },
		{ id: 'dontAsk', name: 'Don\'t ask' },
	];
	const selected = items.find(i => i.id === selectedMode) ?? items[1];
	return {
		id: 'permissionMode',
		name: 'Permission Mode',
		items,
		selected: { ...selected },
	};
}

/**
 * Builds a minimal folder input state group with the given folder selected.
 */
function buildFolderGroup(selectedFolderPath: string, allFolderPaths?: string[]): vscode.ChatSessionProviderOptionGroup {
	const paths = allFolderPaths ?? [selectedFolderPath];
	const items = paths.map(p => ({ id: p, name: path.basename(p) }));
	const selected = items.find(i => i.id === selectedFolderPath) ?? items[0];
	return {
		id: 'folder',
		name: 'Folder',
		items,
		selected: { ...selected },
	};
}

/**
 * Builds inputState groups for test chat contexts.
 * Always includes a permission mode group. Folder group is added when folderPath is provided.
 */
function buildInputStateGroups(options?: { permissionMode?: string; folderPath?: string; allFolderPaths?: string[] }): vscode.ChatSessionProviderOptionGroup[] {
	const groups: vscode.ChatSessionProviderOptionGroup[] = [
		buildPermissionModeGroup(options?.permissionMode),
	];
	if (options?.folderPath) {
		groups.push(buildFolderGroup(options.folderPath, options.allFolderPaths));
	}
	return groups;
}

/**
 * Workspace service whose folder list can be mutated at runtime so tests can
 * exercise folder-change events through the observable pipeline.
 */
class MutableWorkspaceService extends TestWorkspaceService {
	private _folders: URI[];

	constructor(folders: URI[]) {
		super(folders);
		this._folders = [...folders];
	}

	override getWorkspaceFolders(): URI[] {
		return this._folders;
	}

	setFolders(folders: URI[]): void {
		this._folders = [...folders];
		this.didChangeWorkspaceFoldersEmitter.fire({ added: [], removed: [] } as any);
	}
}

function createProviderWithServices(
	store: DisposableStore,
	workspaceFolders: URI[],
	mocks: ReturnType<typeof createDefaultMocks>,
	agentManager?: ClaudeAgentManager,
	workspaceServiceOverride?: TestWorkspaceService,
): { provider: ClaudeChatSessionContentProvider; accessor: ITestingServicesAccessor } {
	const serviceCollection = store.add(createExtensionUnitTestingServices(store));

	const workspaceService = workspaceServiceOverride ?? new TestWorkspaceService(workspaceFolders);
	serviceCollection.set(IWorkspaceService, workspaceService);
	serviceCollection.set(IGitService, new MockGitService());

	serviceCollection.define(IClaudeCodeSessionService, mocks.mockSessionService);
	serviceCollection.define(IChatFolderMruService, mocks.mockFolderMruService);
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
		listSubagents: vi.fn().mockResolvedValue([]),
		getSubagentMessages: vi.fn().mockResolvedValue([]),
	});
	serviceCollection.define(IClaudeWorkspaceFolderService, {
		_serviceBrand: undefined,
		getWorkspaceChanges: vi.fn().mockResolvedValue([]),
	});

	const accessor = serviceCollection.createTestingAccessor();
	const instaService = accessor.get(IInstantiationService);
	const provider = instaService.createInstance(ClaudeChatSessionContentProvider, agentManager ?? createMockAgentManager());
	return { provider, accessor };
}

/**
 * Invokes the getChatSessionInputState handler that was set by the provider.
 * Pass a sessionResource for existing sessions, or undefined for new sessions.
 */
async function getInputState(
	sessionResource?: vscode.Uri,
	previousInputState?: vscode.ChatSessionInputState,
): Promise<vscode.ChatSessionInputState> {
	if (!lastGetChatSessionInputState) {
		throw new Error('getChatSessionInputState handler was not set');
	}
	return lastGetChatSessionInputState(
		sessionResource,
		{ previousInputState: previousInputState ?? undefined } as Parameters<vscode.ChatSessionControllerGetInputState>[1],
		CancellationToken.None,
	);
}

function getGroup(state: vscode.ChatSessionInputState, groupId: string): vscode.ChatSessionProviderOptionGroup | undefined {
	return state.groups.find(g => g.id === groupId);
}

/**
 * Runs the handler for a session and returns the values committed to session state service.
 * This is how tests verify permission mode / folder resolution without reaching into internals.
 */
async function runHandlerAndCapture(
	contentProvider: ClaudeChatSessionContentProvider,
	testAccessor: ITestingServicesAccessor,
	sessionId: string,
	sessionService: IClaudeCodeSessionService,
	options?: { permissionMode?: string; folderPath?: string; allFolderPaths?: string[] },
): Promise<{ permissionMode: string; folderInfo: ClaudeFolderInfo }> {
	vi.mocked(sessionService.getSession).mockResolvedValue(undefined);
	if (!lastCreatedItemsMap.has(ClaudeSessionUri.forSessionId(sessionId).toString())) {
		seedSessionItem(sessionId);
	}

	const sessionStateService = testAccessor.get(IClaudeSessionStateService);
	const setPermissionSpy = vi.spyOn(sessionStateService, 'setPermissionModeForSession');
	const setFolderInfoSpy = vi.spyOn(sessionStateService, 'setFolderInfoForSession');

	const handler = contentProvider.createHandler();
	const groups = buildInputStateGroups(options);
	const context: vscode.ChatContext = {
		history: [],
		yieldRequested: false,
		chatSessionContext: {
			isUntitled: false,
			chatSessionItem: {
				resource: ClaudeSessionUri.forSessionId(sessionId),
				label: 'Test Session',
			},
			inputState: { groups, sessionResource: undefined, onDidChange: Event.None, onDidDispose: Event.None },
		},
	} as vscode.ChatContext;

	const stream = new MockChatResponseStream();
	await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

	const permissionCall = setPermissionSpy.mock.calls.find(c => c[0] === sessionId);
	const folderCall = setFolderInfoSpy.mock.calls.find(c => c[0] === sessionId);

	return {
		permissionMode: permissionCall![1],
		folderInfo: folderCall![1],
	};
}

describe('ChatSessionContentProvider', () => {
	let mockSessionService: IClaudeCodeSessionService;
	let mockFolderMruService: MockChatFolderMruService;
	let provider: ClaudeChatSessionContentProvider;
	const store = new DisposableStore();
	let accessor: ITestingServicesAccessor;
	const workspaceFolderUri = URI.file('/project');

	beforeEach(() => {
		const mocks = createDefaultMocks();
		mockSessionService = mocks.mockSessionService;
		mockFolderMruService = mocks.mockFolderMruService;

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

	// #region New Session Input State

	describe('new session input state via getChatSessionInputState', () => {
		it('defaults to acceptEdits for permission mode', async () => {
			const state = await getInputState();
			const permissionGroup = getGroup(state, 'permissionMode');
			expect(permissionGroup).toBeDefined();
			expect(permissionGroup!.selected?.id).toBe('acceptEdits');
		});

		it('restores previous permission mode selection', async () => {
			// First, get an initial state and change the permission mode
			const initialState = await getInputState();
			const permissionGroup = getGroup(initialState, 'permissionMode');
			const planItem = permissionGroup!.items.find(i => i.id === 'plan');
			initialState.groups = initialState.groups.map(g =>
				g.id === 'permissionMode' ? { ...g, selected: planItem } : g
			);

			// Now get a new state that restores from the previous one
			const restoredState = await getInputState(undefined, initialState);
			const restoredGroup = getGroup(restoredState, 'permissionMode');
			expect(restoredGroup!.selected?.id).toBe('plan');
		});

		it('does not include folder group for single-root workspace', async () => {
			const state = await getInputState();
			const folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeUndefined();
		});
	});

	describe('new session input state in multi-root workspace', () => {
		const folderA = URI.file('/project-a');
		const folderB = URI.file('/project-b');

		beforeEach(() => {
			const mocks = createDefaultMocks();

			createProviderWithServices(store, [folderA, folderB], mocks);
		});

		it('includes folder group with default selection for multi-root workspace', async () => {
			const state = await getInputState();
			const folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeDefined();
			expect(folderGroup!.selected?.id).toBe(folderA.fsPath);
		});
	});

	// #endregion

	// #region Folder Option Tests

	describe('folder option - single-root workspace', () => {
		it('does NOT include folder option group for single-root workspace', async () => {
			const state = await getInputState();
			const folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeUndefined();
		});

		it('handler commits single workspace folder as cwd', async () => {
			const { folderInfo } = await runHandlerAndCapture(provider, accessor, 'test-session', mockSessionService);
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
		let multiRootAccessor: ITestingServicesAccessor;

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderMruService = mocks.mockFolderMruService;

			const result = createProviderWithServices(store, [folderA, folderB, folderC], mocks);
			multiRootProvider = result.provider;
			multiRootAccessor = result.accessor;
		});

		it('includes folder option group with all workspace folders', async () => {
			const state = await getInputState();
			const folderGroup = getGroup(state, 'folder');

			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items).toHaveLength(3);
			expect(folderGroup!.items.map(i => i.id)).toEqual([
				folderA.fsPath,
				folderB.fsPath,
				folderC.fsPath,
			]);
		});

		it('defaults cwd to first workspace folder when no selection made', async () => {
			const { folderInfo } = await runHandlerAndCapture(multiRootProvider, multiRootAccessor, 'test-session', mockSessionService);
			expect(folderInfo.cwd).toBe(folderA.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([folderB.fsPath, folderC.fsPath]);
		});

		it('uses selected folder from inputState as cwd', async () => {
			seedSessionItem('test-session');

			const { folderInfo } = await runHandlerAndCapture(multiRootProvider, multiRootAccessor, 'test-session', mockSessionService, {
				folderPath: folderB.fsPath,
				allFolderPaths: [folderA.fsPath, folderB.fsPath, folderC.fsPath],
			});
			expect(folderInfo.cwd).toBe(folderB.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([folderA.fsPath, folderC.fsPath]);
		});

		it('includes default folder in provideChatSessionContent options for new session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);
			const sessionUri = createClaudeSessionUri('test-session');
			const result = await multiRootProvider.provideChatSessionContent(sessionUri, CancellationToken.None);

			// Without input state context, options should be empty
			expect(result.options).toEqual({});
		});

		it('locks folder but not permission mode for existing sessions', async () => {
			const session = {
				id: 'test-session',
				messages: [{
					type: 'user',
					message: { role: 'user', content: 'Hello' },
				}],
				subagents: [],
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const sessionUri = createClaudeSessionUri('test-session');
			const state = await getInputState(sessionUri);

			const permissionGroup = getGroup(state, 'permissionMode');
			expect(permissionGroup).toBeDefined();
			expect(permissionGroup!.selected?.locked).toBeUndefined();
			expect(permissionGroup!.items.every(i => !i.locked)).toBe(true);

			const folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeDefined();
			expect(folderGroup!.selected?.locked).toBe(true);
			expect(folderGroup!.items.every(i => i.locked)).toBe(true);
		});

		it('locked folder option preserves the selected folder, not the first one', async () => {
			// Set folderB as the session's folder via sessionStateService
			const sessionStateService = multiRootAccessor.get(IClaudeSessionStateService);
			sessionStateService.setFolderInfoForSession('pre-created-session', {
				cwd: folderB.fsPath,
				additionalDirectories: [folderA.fsPath],
			});

			// Now load the same session as an existing session
			const session = {
				id: 'pre-created-session',
				messages: [{
					type: 'user',
					message: { role: 'user', content: 'Hello' },
				}],
				subagents: [],
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(session as any);

			const sessionUri = createClaudeSessionUri('pre-created-session');
			const state = await getInputState(sessionUri);
			const folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeDefined();
			expect(folderGroup!.selected?.locked).toBe(true);
			// Should show folder B (the selected folder), not folder A (the first)
			expect(folderGroup!.selected?.id).toBe(folderB.fsPath);
		});
	});

	describe('folder option - empty workspace', () => {
		let emptyWorkspaceProvider: ClaudeChatSessionContentProvider;
		let emptyMocks: ReturnType<typeof createDefaultMocks>;
		let emptyAccessor: ITestingServicesAccessor;

		beforeEach(() => {
			emptyMocks = createDefaultMocks();
			mockSessionService = emptyMocks.mockSessionService;
			mockFolderMruService = emptyMocks.mockFolderMruService;

			const result = createProviderWithServices(store, [], emptyMocks);
			emptyWorkspaceProvider = result.provider;
			emptyAccessor = result.accessor;
		});

		it('includes folder option group with MRU entries', async () => {
			const mruFolder = URI.file('/recent/project');
			const mruRepo = URI.file('/recent/repo');
			mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
				{ folder: mruRepo, repository: mruRepo, lastAccessed: Date.now() - 1000 },
			]);

			const state = await getInputState();
			const folderGroup = getGroup(state, 'folder');

			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items).toHaveLength(2);
			expect(folderGroup!.items[0].id).toBe(mruFolder.fsPath);
			expect(folderGroup!.items[1].id).toBe(mruRepo.fsPath);
		});

		it('shows empty folder options when no MRU entries', async () => {
			const state = await getInputState();
			const folderGroup = getGroup(state, 'folder');

			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items).toHaveLength(0);
		});

		it('handler commits MRU fallback folder when no selection', async () => {
			const mruFolder = URI.file('/recent/project');
			mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			const { folderInfo } = await runHandlerAndCapture(emptyWorkspaceProvider, emptyAccessor, 'test-session', mockSessionService);
			expect(folderInfo.cwd).toBe(mruFolder.fsPath);
			expect(folderInfo.additionalDirectories).toEqual([]);
		});

		it('handler commits home directory fallback when no folder available', async () => {
			const { folderInfo } = await runHandlerAndCapture(emptyWorkspaceProvider, emptyAccessor, 'test-session', mockSessionService);
			expect(folderInfo.cwd).toBe(URI.file('/home/testuser').fsPath);
			expect(folderInfo.additionalDirectories).toEqual([]);
		});

		it('handler commits selected folder over MRU', async () => {
			const mruFolder = URI.file('/recent/project');
			const selectedFolder = URI.file('/selected/project');
			mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			seedSessionItem('test-session');

			const { folderInfo } = await runHandlerAndCapture(emptyWorkspaceProvider, emptyAccessor, 'test-session', mockSessionService, {
				folderPath: selectedFolder.fsPath,
			});
			expect(folderInfo.cwd).toBe(selectedFolder.fsPath);
		});
	});

	// #endregion

	// #endregion

	// #region Initial Session Options

	describe('initial session options on new sessions', () => {
		let mockAgentManager: ClaudeAgentManager;
		let handlerProvider: ClaudeChatSessionContentProvider;
		let handlerAccessor: ITestingServicesAccessor;

		function createChatContext(sessionId: string, options?: { permissionMode?: string }): vscode.ChatContext {
			return {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId(sessionId),
						label: 'Test Session',
					},
					inputState: { groups: buildInputStateGroups(options), sessionResource: undefined, onDidChange: Event.None, onDidDispose: Event.None },
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderMruService = mocks.mockFolderMruService;
			mockAgentManager = createMockAgentManager();

			const result = createProviderWithServices(store, [workspaceFolderUri], mocks, mockAgentManager);
			handlerProvider = result.provider;
			handlerAccessor = result.accessor;
		});

		it('sets permission mode from inputState on new session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			seedSessionItem('new-session-1');

			const sessionStateService = handlerAccessor.get(IClaudeSessionStateService);
			const setPermissionSpy = vi.spyOn(sessionStateService, 'setPermissionModeForSession');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('new-session-1', { permissionMode: 'plan' });
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			expect(setPermissionSpy).toHaveBeenCalledWith('new-session-1', 'plan');
		});

		it('defaults to acceptEdits when inputState has default permission mode', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			seedSessionItem('new-session-2');

			const sessionStateService = handlerAccessor.get(IClaudeSessionStateService);
			const setPermissionSpy = vi.spyOn(sessionStateService, 'setPermissionModeForSession');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('new-session-2');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			expect(setPermissionSpy).toHaveBeenCalledWith('new-session-2', 'acceptEdits');
		});

		it('commits the inputState permission mode to session state service', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			seedSessionItem('pre-set-session');

			const sessionStateService = handlerAccessor.get(IClaudeSessionStateService);
			const setPermissionSpy = vi.spyOn(sessionStateService, 'setPermissionModeForSession');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('pre-set-session', { permissionMode: 'default' });
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			expect(setPermissionSpy).toHaveBeenCalledWith('pre-set-session', 'default');
		});

		it('commits inputState permission mode on resumed sessions', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue({
				id: 'existing-session',
				messages: [{ type: 'user', message: { role: 'user', content: 'Hello' } }],
				subagents: [],
			} as any);

			seedSessionItem('existing-session');

			const sessionStateService = handlerAccessor.get(IClaudeSessionStateService);
			const setPermissionSpy = vi.spyOn(sessionStateService, 'setPermissionModeForSession');

			const handler = handlerProvider.createHandler();
			const context = createChatContext('existing-session');
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const committedMode = setPermissionSpy.mock.calls.find(c => c[0] === 'existing-session')?.[1];
			expect(committedMode).toBe('acceptEdits');
		});
	});

	describe('initial folder option on new sessions', () => {
		const folderA = URI.file('/project-a');
		const folderB = URI.file('/project-b');
		let mockAgentManager: ClaudeAgentManager;
		let multiRootProvider: ClaudeChatSessionContentProvider;
		let multiRootAccessor: ITestingServicesAccessor;

		function createChatContext(sessionId: string, options?: { folderPath?: string }): vscode.ChatContext {
			return {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId(sessionId),
						label: 'Test Session',
					},
					inputState: {
						groups: buildInputStateGroups({
							folderPath: options?.folderPath,
							allFolderPaths: [folderA.fsPath, folderB.fsPath],
						}),
						sessionResource: undefined,
						onDidChange: Event.None,
						onDidDispose: Event.None,
					},
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;
			mockAgentManager = createMockAgentManager();

			const result = createProviderWithServices(store, [folderA, folderB], mocks, mockAgentManager);
			multiRootProvider = result.provider;
			multiRootAccessor = result.accessor;
		});

		it('sets folder from inputState on new session', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			seedSessionItem('new-folder-session');

			const sessionStateService = multiRootAccessor.get(IClaudeSessionStateService);
			const setFolderInfoSpy = vi.spyOn(sessionStateService, 'setFolderInfoForSession');

			const handler = multiRootProvider.createHandler();
			const context = createChatContext('new-folder-session', { folderPath: folderB.fsPath });
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const folderInfo = setFolderInfoSpy.mock.calls.find(c => c[0] === 'new-folder-session')?.[1];
			expect(folderInfo?.cwd).toBe(folderB.fsPath);
		});

		it('commits inputState folder selection to session state service', async () => {
			vi.mocked(mockSessionService.getSession).mockResolvedValue(undefined);

			seedSessionItem('pre-folder-session');

			const sessionStateService = multiRootAccessor.get(IClaudeSessionStateService);
			const setFolderInfoSpy = vi.spyOn(sessionStateService, 'setFolderInfoForSession');

			const handler = multiRootProvider.createHandler();
			const context = createChatContext('pre-folder-session', { folderPath: folderA.fsPath });
			const stream = new MockChatResponseStream();

			await handler(createTestRequest('hello'), context, stream, CancellationToken.None);

			const folderInfo = setFolderInfoSpy.mock.calls.find(c => c[0] === 'pre-folder-session')?.[1];
			expect(folderInfo?.cwd).toBe(folderA.fsPath);
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
					inputState: { groups: buildInputStateGroups(), sessionResource: undefined, onDidChange: Event.None, onDidDispose: Event.None },
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderMruService = mocks.mockFolderMruService;
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
					inputState: { groups: buildInputStateGroups(), sessionResource: undefined, onDidChange: Event.None, onDidDispose: Event.None },
				},
			} as vscode.ChatContext;
		}

		beforeEach(() => {
			const mocks = createDefaultMocks();
			mockSessionService = mocks.mockSessionService;

			mockFolderMruService = mocks.mockFolderMruService;
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

			expect(setModelSpy).toHaveBeenCalledWith('session-1', parseClaudeModelId('claude-3-5-sonnet-20241022'));
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

	// #region Observable pipeline reactivity

	/**
	 * These tests drive the input-state observable pipeline end-to-end via the
	 * external signals it observes (config change, workspace folder change,
	 * session-state change, session start) and assert the resulting
	 * `state.groups` reflect each event. This is the "series of events" testing
	 * the observable refactor was designed to enable.
	 */
	describe('observable pipeline reactivity', () => {
		const folderA = URI.file('/project-a');
		const folderB = URI.file('/project-b');

		async function flushMicrotasks(): Promise<void> {
			// Autoruns that schedule async work (e.g. MRU fetch when workspace goes empty)
			// settle on the microtask queue. Two ticks covers chained thenables.
			await Promise.resolve();
			await Promise.resolve();
		}

		it('toggling bypass-permissions config adds/removes the bypass item reactively', async () => {
			const mocks = createDefaultMocks();
			const { accessor: localAccessor } = createProviderWithServices(store, [folderA, folderB], mocks);
			const configService = localAccessor.get(IConfigurationService);

			const state = await getInputState();
			let permissionGroup = getGroup(state, 'permissionMode')!;
			expect(permissionGroup.items.map(i => i.id)).not.toContain('bypassPermissions');

			await configService.setConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions, true);
			permissionGroup = getGroup(state, 'permissionMode')!;
			expect(permissionGroup.items.map(i => i.id)).toContain('bypassPermissions');

			await configService.setConfig(ConfigKey.ClaudeAgentAllowDangerouslySkipPermissions, false);
			permissionGroup = getGroup(state, 'permissionMode')!;
			expect(permissionGroup.items.map(i => i.id)).not.toContain('bypassPermissions');
		});

		it('workspace folder changes reshape the folder group', async () => {
			const mocks = createDefaultMocks();
			const mutableWs = new MutableWorkspaceService([folderA, folderB]);
			createProviderWithServices(store, [], mocks, undefined, mutableWs);

			const state = await getInputState();
			let folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items.map(i => i.id)).toEqual([folderA.fsPath, folderB.fsPath]);

			// Add a third folder
			const folderC = URI.file('/project-c');
			mutableWs.setFolders([folderA, folderB, folderC]);
			folderGroup = getGroup(state, 'folder');
			expect(folderGroup!.items.map(i => i.id)).toEqual([folderA.fsPath, folderB.fsPath, folderC.fsPath]);

			// Transition to a single folder → group hides
			mutableWs.setFolders([folderA]);
			folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeUndefined();

			// Back to multi-root
			mutableWs.setFolders([folderA, folderB]);
			folderGroup = getGroup(state, 'folder');
			expect(folderGroup!.items.map(i => i.id)).toEqual([folderA.fsPath, folderB.fsPath]);
		});

		it('emptying the workspace falls back to MRU items', async () => {
			const mocks = createDefaultMocks();
			const mutableWs = new MutableWorkspaceService([folderA, folderB]);
			const mruFolder = URI.file('/recent/project');
			mocks.mockFolderMruService.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);
			createProviderWithServices(store, [], mocks, undefined, mutableWs);

			const state = await getInputState();
			mutableWs.setFolders([]);
			await flushMicrotasks();

			const folderGroup = getGroup(state, 'folder');
			expect(folderGroup).toBeDefined();
			expect(folderGroup!.items.map(i => i.id)).toEqual([mruFolder.fsPath]);
		});

		it('external session-state permission change syncs into the input state', async () => {
			const mocks = createDefaultMocks();
			const { accessor: localAccessor } = createProviderWithServices(store, [workspaceFolderUri], mocks);
			const sessionStateService = localAccessor.get(IClaudeSessionStateService);

			// Mark as existing so the pipeline wires up the external permission autorun
			const existingSession = { id: 'external-session', messages: [], subagents: [] };
			vi.mocked(mocks.mockSessionService.getSession).mockResolvedValue(existingSession as any);

			const sessionUri = createClaudeSessionUri('external-session');
			const state = await getInputState(sessionUri);
			expect(getGroup(state, 'permissionMode')!.selected?.id).not.toBe('plan');

			sessionStateService.setPermissionModeForSession('external-session', 'plan');
			expect(getGroup(state, 'permissionMode')!.selected?.id).toBe('plan');

			sessionStateService.setPermissionModeForSession('external-session', 'default');
			expect(getGroup(state, 'permissionMode')!.selected?.id).toBe('default');
		});

		it('external permission change syncs into a previousInputState-restored pipeline', async () => {
			const mocks = createDefaultMocks();
			const { accessor: localAccessor } = createProviderWithServices(store, [workspaceFolderUri], mocks);
			const sessionStateService = localAccessor.get(IClaudeSessionStateService);

			const existingSession = { id: 'prev-state-session', messages: [], subagents: [] };
			vi.mocked(mocks.mockSessionService.getSession).mockResolvedValue(existingSession as any);

			const sessionUri = createClaudeSessionUri('prev-state-session');
			const firstState = await getInputState(sessionUri);

			// Simulate getChatSessionInputState being called again with previousInputState
			// (e.g. user refocuses the chat window). The pipeline is rebuilt from scratch.
			const restoredState = await getInputState(sessionUri, firstState);
			expect(getGroup(restoredState, 'permissionMode')!.selected?.id).not.toBe('plan');

			// Permission mode changes externally (e.g. EnterPlanMode tool call)
			sessionStateService.setPermissionModeForSession('prev-state-session', 'plan');
			expect(getGroup(restoredState, 'permissionMode')!.selected?.id).toBe('plan');

			sessionStateService.setPermissionModeForSession('prev-state-session', 'acceptEdits');
			expect(getGroup(restoredState, 'permissionMode')!.selected?.id).toBe('acceptEdits');
		});

		it('markSessionStarted locks the folder group mid-session', async () => {
			const mocks = createDefaultMocks();
			createProviderWithServices(store, [folderA, folderB], mocks);

			const state = await getInputState();
			let folderGroup = getGroup(state, 'folder')!;
			expect(folderGroup.items.every(i => !i.locked)).toBe(true);
			expect(folderGroup.selected?.locked).toBeUndefined();

			// Simulate a new session starting by invoking the handler (which calls markSessionStarted)
			// The handler is owned by the content provider — we go through it via createHandler.
			// Easier: reach through via the exported accessor pattern — call markSessionStarted through the controller.
			// The content provider does not export the controller, but the handler path covers it.
			vi.mocked(mocks.mockSessionService.getSession).mockResolvedValue(undefined);
			seedSessionItem('new-session');

			const { provider: handlerProvider } = createProviderWithServices(store, [folderA, folderB], mocks);
			const handler = handlerProvider.createHandler();
			// The state we want to observe must be the one passed into the handler
			const newState = await getInputState();
			const context: vscode.ChatContext = {
				history: [],
				yieldRequested: false,
				chatSessionContext: {
					isUntitled: false,
					chatSessionItem: {
						resource: ClaudeSessionUri.forSessionId('new-session'),
						label: 'New',
					},
					inputState: newState,
				},
			} as vscode.ChatContext;
			await handler(createTestRequest('hello'), context, new MockChatResponseStream(), CancellationToken.None);

			folderGroup = getGroup(newState, 'folder')!;
			expect(folderGroup.items.every(i => i.locked === true)).toBe(true);
			expect(folderGroup.selected?.locked).toBe(true);
		});

		it('restoring a locked previousInputState preserves the lock across workspace changes', async () => {
			const mocks = createDefaultMocks();
			const mutableWs = new MutableWorkspaceService([folderA, folderB]);
			createProviderWithServices(store, [], mocks, undefined, mutableWs);

			// First state — mark it as started to get locked items
			const initialState = await getInputState();
			const initialGroup = getGroup(initialState, 'folder')!;
			// Synthesize a locked previousInputState (matching what a started session looks like)
			const lockedGroups: vscode.ChatSessionProviderOptionGroup[] = initialState.groups.map(g =>
				g.id === 'folder'
					? {
						...g,
						items: g.items.map(i => ({ ...i, locked: true })),
						selected: g.selected ? { ...g.selected, locked: true } : undefined,
					}
					: g
			);
			const lockedPrevious: vscode.ChatSessionInputState = {
				groups: lockedGroups,
				sessionResource: undefined,
				onDidChange: Event.None,
				onDidDispose: Event.None,
			};
			// sanity check
			expect(initialGroup.items.map(i => i.id)).toEqual([folderA.fsPath, folderB.fsPath]);

			// Restore from the locked previous state
			const restoredState = await getInputState(undefined, lockedPrevious);
			let restoredGroup = getGroup(restoredState, 'folder')!;
			expect(restoredGroup.items.every(i => i.locked === true)).toBe(true);

			// Now workspace folders change — lock must persist
			const folderC = URI.file('/project-c');
			mutableWs.setFolders([folderA, folderB, folderC]);
			restoredGroup = getGroup(restoredState, 'folder')!;
			expect(restoredGroup.items).toHaveLength(3);
			expect(restoredGroup.items.every(i => i.locked === true)).toBe(true);
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
		super.dispose();
		this._onDidOpenRepository.dispose();
		this._onDidCloseRepository.dispose();
	}
}

// #endregion

// #region Test helpers

function buildRepoContext(overrides: {
	rootUri?: URI;
	headBranchName?: string;
	upstreamRemote?: string;
	upstreamBranchName?: string;
	headIncomingChanges?: number;
	headOutgoingChanges?: number;
	changes?: RepoContext['changes'];
	remoteFetchUrls?: Array<string | undefined>;
} = {}): RepoContext {
	return {
		rootUri: overrides.rootUri ?? URI.file('/project'),
		kind: 'repository',
		isUsingVirtualFileSystem: false,
		headIncomingChanges: overrides.headIncomingChanges ?? 0,
		headOutgoingChanges: overrides.headOutgoingChanges ?? 0,
		headBranchName: overrides.headBranchName ?? 'main',
		headCommitHash: 'abc123',
		upstreamBranchName: overrides.upstreamBranchName,
		upstreamRemote: overrides.upstreamRemote,
		isRebasing: false,
		remoteFetchUrls: overrides.remoteFetchUrls ?? [],
		remotes: [],
		worktrees: [],
		changes: overrides.changes,
		headBranchNameObs: observableValue('test', overrides.headBranchName ?? 'main'),
		headCommitHashObs: observableValue('test', 'abc123'),
		upstreamBranchNameObs: observableValue('test', overrides.upstreamBranchName),
		upstreamRemoteObs: observableValue('test', overrides.upstreamRemote),
		isRebasingObs: observableValue('test', false),
		isIgnored: () => Promise.resolve(false),
	};
}

const MockChange = mock<Change>();
function mockChange(): Change {
	return new MockChange();
}

function findCommandHandler(commandId: string): (...args: unknown[]) => Promise<void> {
	const calls = vi.mocked(vscodeShim.commands.registerCommand).mock.calls;
	const matchingCalls = calls.filter(c => c[0] === commandId);
	const call = matchingCalls[matchingCalls.length - 1];
	if (!call) {
		throw new Error(`Command ${commandId} was not registered`);
	}
	return call[1];
}

function buildDiskSession(id: string, overrides: Partial<IClaudeCodeSessionInfo> = {}): IClaudeCodeSessionInfo {
	return {
		id,
		label: id,
		created: Date.now(),
		lastRequestEnded: Date.now(),
		folderName: 'my-project',
		cwd: '/home/user/my-project',
		...overrides,
	} as IClaudeCodeSessionInfo;
}

// #endregion

describe('ClaudeChatSessionItemController', () => {
	const store = new DisposableStore();
	let mockSessionService: IClaudeCodeSessionService;
	let mockSdkService: IClaudeCodeSdkService;
	let controller: ClaudeChatSessionItemController;
	let lastControllerAccessor: ITestingServicesAccessor;

	function getItem(sessionId: string): vscode.ChatSessionItem | undefined {
		return lastCreatedItemsMap.get(ClaudeSessionUri.forSessionId(sessionId).toString());
	}

	function createController(workspaceFolders: URI[], gitService?: IGitService): ClaudeChatSessionItemController {
		const serviceCollection = store.add(createExtensionUnitTestingServices());
		const workspaceService = new TestWorkspaceService(workspaceFolders);
		serviceCollection.set(IWorkspaceService, workspaceService);
		serviceCollection.set(IGitService, gitService ?? new MockGitService());
		serviceCollection.define(IClaudeCodeSessionService, mockSessionService);
		serviceCollection.define(IChatFolderMruService, new MockChatFolderMruService());
		mockSdkService = {
			_serviceBrand: undefined,
			query: vi.fn(),
			listSessions: vi.fn().mockResolvedValue([]),
			getSessionInfo: vi.fn().mockResolvedValue(undefined),
			getSessionMessages: vi.fn().mockResolvedValue([]),
			renameSession: vi.fn().mockResolvedValue(undefined),
			forkSession: vi.fn().mockResolvedValue({ sessionId: 'forked-session-id' }),
			listSubagents: vi.fn().mockResolvedValue([]),
			getSubagentMessages: vi.fn().mockResolvedValue([]),
		};
		serviceCollection.define(IClaudeCodeSdkService, mockSdkService);
		serviceCollection.define(IClaudeWorkspaceFolderService, {
			_serviceBrand: undefined,
			getWorkspaceChanges: vi.fn().mockResolvedValue([]),
		});
		const accessor = serviceCollection.createTestingAccessor();
		lastControllerAccessor = accessor;
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

		it('calls getWorkspaceChanges on Completed status when session has cwd', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'changes-session',
				label: 'Changes Session',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'my-project',
				cwd: '/home/user/my-project',
				gitBranch: 'feature-branch',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			const mockChanges = [{ uri: URI.file('/home/user/my-project/file.ts') }];
			const workspaceFolderService = lastControllerAccessor.get(IClaudeWorkspaceFolderService);
			vi.mocked(workspaceFolderService.getWorkspaceChanges).mockResolvedValue(mockChanges as any);

			await controller.updateItemStatus('changes-session', ChatSessionStatus.InProgress, 'Prompt');
			await controller.updateItemStatus('changes-session', ChatSessionStatus.Completed, 'Prompt');

			expect(workspaceFolderService.getWorkspaceChanges).toHaveBeenCalledWith(
				'/home/user/my-project',
				'feature-branch',
				undefined,
				true,
			);
			const item = getItem('changes-session');
			expect(item!.changes).toBe(mockChanges);
		});

		it('does not call getWorkspaceChanges on Completed when session has no cwd', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'no-cwd',
				label: 'No CWD',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: undefined,
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			const workspaceFolderService = lastControllerAccessor.get(IClaudeWorkspaceFolderService);

			await controller.updateItemStatus('no-cwd', ChatSessionStatus.InProgress, 'Prompt');
			await controller.updateItemStatus('no-cwd', ChatSessionStatus.Completed, 'Prompt');

			expect(workspaceFolderService.getWorkspaceChanges).not.toHaveBeenCalled();
		});

		it('does not call getWorkspaceChanges with forceRefresh on InProgress status', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'in-progress',
				label: 'In Progress',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'my-project',
				cwd: '/home/user/my-project',
				gitBranch: 'feature-branch',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			const workspaceFolderService = lastControllerAccessor.get(IClaudeWorkspaceFolderService);

			await controller.updateItemStatus('in-progress', ChatSessionStatus.InProgress, 'Prompt');

			expect(workspaceFolderService.getWorkspaceChanges).not.toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.anything(),
				true,
			);
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

		it('sets metadata with workingDirectoryPath when session has cwd', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'cwd-session',
				label: 'CWD Session',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'my-project',
				cwd: '/home/user/my-project',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('cwd-session', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('cwd-session');
			expect(item!.metadata).toEqual({ workingDirectoryPath: '/home/user/my-project' });
		});

		it('does not set metadata when session has no cwd', async () => {
			await controller.updateItemStatus('no-cwd-session', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('no-cwd-session');
			expect(item!.metadata).toBeUndefined();
		});

		it('populates item.changes when session has cwd and gitBranch', async () => {
			const diskSession: IClaudeCodeSessionInfo = {
				id: 'changes-item',
				label: 'Changes Item',
				created: Date.now(),
				lastRequestEnded: Date.now(),
				folderName: 'my-project',
				cwd: '/home/user/my-project',
				gitBranch: 'feature-branch',
			};
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			const mockChanges = [{ uri: URI.file('/home/user/my-project/file.ts') }];
			const workspaceFolderService = lastControllerAccessor.get(IClaudeWorkspaceFolderService);
			vi.mocked(workspaceFolderService.getWorkspaceChanges).mockResolvedValue(mockChanges as any);

			await controller.updateItemStatus('changes-item', ChatSessionStatus.InProgress, 'Prompt');

			expect(workspaceFolderService.getWorkspaceChanges).toHaveBeenCalledWith(
				'/home/user/my-project',
				'feature-branch',
				undefined,
			);
			const item = getItem('changes-item');
			expect(item!.changes).toBe(mockChanges);
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
			});

			const result = await lastForkHandler!(sessionResource, undefined, CancellationToken.None);

			expect(mockSdkService.forkSession).toHaveBeenCalledWith('sess-1', { upToMessageId: undefined, title: expect.any(String) });
			expect(result.resource.toString()).toContain('forked-session-id');
			expect(result.label).toContain('Forked');
		});

		it('copies session state from parent to forked session', async () => {
			const sessionResource = ClaudeSessionUri.forSessionId('sess-1');
			lastCreatedItemsMap.set(sessionResource.toString(), {
				resource: sessionResource,
				label: 'Original',
			});

			// Seed the parent session with non-default state
			const sessionStateService = lastControllerAccessor.get(IClaudeSessionStateService);
			sessionStateService.setPermissionModeForSession('sess-1', 'plan');
			sessionStateService.setFolderInfoForSession('sess-1', {
				cwd: '/custom/folder',
				additionalDirectories: ['/extra'],
			});

			const setPermissionSpy = vi.spyOn(sessionStateService, 'setPermissionModeForSession');
			const setFolderInfoSpy = vi.spyOn(sessionStateService, 'setFolderInfoForSession');

			await lastForkHandler!(sessionResource, undefined, CancellationToken.None);

			expect(setPermissionSpy).toHaveBeenCalledWith('forked-session-id', 'plan');
			expect(setFolderInfoSpy).toHaveBeenCalledWith('forked-session-id', {
				cwd: '/custom/folder',
				additionalDirectories: ['/extra'],
			});
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

	// #region Session metadata enrichment

	describe('session metadata enrichment', () => {
		it('includes enriched git metadata when repository exists', async () => {
			const gitService = new MockGitService();
			const repoCtx = buildRepoContext({
				rootUri: URI.file('/home/user/my-project'),
				headBranchName: 'feature-branch',
				upstreamRemote: 'origin',
				upstreamBranchName: 'feature-branch',
				headIncomingChanges: 2,
				headOutgoingChanges: 3,
				remoteFetchUrls: ['https://github.com/owner/repo.git'],
				changes: {
					mergeChanges: [],
					indexChanges: [mockChange(), mockChange()],
					workingTree: [mockChange()],
					untrackedChanges: [],
				},
			});
			vi.spyOn(gitService, 'getRepository').mockResolvedValue(repoCtx);
			controller = createController([URI.file('/project')], gitService);

			const diskSession = buildDiskSession('enriched-meta');
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('enriched-meta', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('enriched-meta');
			expect(item!.metadata).toEqual({
				workingDirectoryPath: '/home/user/my-project',
				repositoryPath: URI.file('/home/user/my-project').fsPath,
				branchName: 'feature-branch',
				upstreamBranchName: 'origin/feature-branch',
				hasGitHubRemote: true,
				incomingChanges: 2,
				outgoingChanges: 3,
				uncommittedChanges: 3,
			});
		});

		it('sets upstreamBranchName to undefined when no upstream remote', async () => {
			const gitService = new MockGitService();
			const repoCtx = buildRepoContext({
				rootUri: URI.file('/home/user/my-project'),
				headBranchName: 'local-only',
				upstreamRemote: undefined,
				upstreamBranchName: undefined,
			});
			vi.spyOn(gitService, 'getRepository').mockResolvedValue(repoCtx);
			controller = createController([URI.file('/project')], gitService);

			const diskSession = buildDiskSession('no-upstream');
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('no-upstream', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('no-upstream');
			expect(item!.metadata).toMatchObject({
				branchName: 'local-only',
				upstreamBranchName: undefined,
			});
		});

		it('sums uncommittedChanges from all change categories', async () => {
			const gitService = new MockGitService();
			const repoCtx = buildRepoContext({
				rootUri: URI.file('/home/user/my-project'),
				changes: {
					mergeChanges: [mockChange(), mockChange()],
					indexChanges: [mockChange(), mockChange(), mockChange()],
					workingTree: [mockChange()],
					untrackedChanges: [mockChange(), mockChange(), mockChange(), mockChange()],
				},
			});
			vi.spyOn(gitService, 'getRepository').mockResolvedValue(repoCtx);
			controller = createController([URI.file('/project')], gitService);

			const diskSession = buildDiskSession('many-changes');
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('many-changes', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('many-changes');
			expect(item!.metadata).toMatchObject({ uncommittedChanges: 10 });
		});

		it('sets uncommittedChanges to 0 when changes is undefined', async () => {
			const gitService = new MockGitService();
			const repoCtx = buildRepoContext({
				rootUri: URI.file('/home/user/my-project'),
				changes: undefined,
			});
			vi.spyOn(gitService, 'getRepository').mockResolvedValue(repoCtx);
			controller = createController([URI.file('/project')], gitService);

			const diskSession = buildDiskSession('no-changes');
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('no-changes', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('no-changes');
			expect(item!.metadata).toMatchObject({ uncommittedChanges: 0 });
		});

		it('sets hasGitHubRemote to false when no GitHub remote', async () => {
			const gitService = new MockGitService();
			const repoCtx = buildRepoContext({
				rootUri: URI.file('/home/user/my-project'),
				remoteFetchUrls: ['https://gitlab.com/owner/repo.git'],
			});
			vi.spyOn(gitService, 'getRepository').mockResolvedValue(repoCtx);
			controller = createController([URI.file('/project')], gitService);

			const diskSession = buildDiskSession('no-github');
			vi.mocked(mockSessionService.getSession).mockResolvedValue(diskSession as any);

			await controller.updateItemStatus('no-github', ChatSessionStatus.InProgress, 'Prompt');

			const item = getItem('no-github');
			expect(item!.metadata).toMatchObject({ hasGitHubRemote: false });
		});
	});

	// #endregion

	// #region Command handlers

	describe('command handlers', () => {
		it('commit command sends /commit prompt to the session', async () => {
			createController([URI.file('/project')]);
			const resource = ClaudeSessionUri.forSessionId('test-session');

			await findCommandHandler('github.copilot.claude.sessions.commit')(resource);

			expect(vscodeShim.commands.executeCommand).toHaveBeenCalledWith(
				'workbench.action.chat.openSessionWithPrompt.claude-code',
				{ resource, prompt: builtinSlashCommands.commit },
			);
		});

		it('commitAndSync command sends combined /commit and /sync prompt', async () => {
			createController([URI.file('/project')]);
			const resource = ClaudeSessionUri.forSessionId('test-session');

			await findCommandHandler('github.copilot.claude.sessions.commitAndSync')(resource);

			expect(vscodeShim.commands.executeCommand).toHaveBeenCalledWith(
				'workbench.action.chat.openSessionWithPrompt.claude-code',
				{ resource, prompt: `${builtinSlashCommands.commit} and ${builtinSlashCommands.sync}` },
			);
		});

		it('sync command sends /sync prompt to the session', async () => {
			createController([URI.file('/project')]);
			const resource = ClaudeSessionUri.forSessionId('test-session');

			await findCommandHandler('github.copilot.claude.sessions.sync')(resource);

			expect(vscodeShim.commands.executeCommand).toHaveBeenCalledWith(
				'workbench.action.chat.openSessionWithPrompt.claude-code',
				{ resource, prompt: builtinSlashCommands.sync },
			);
		});

		it('commit command extracts resource from ChatSessionItem', async () => {
			createController([URI.file('/project')]);
			const resource = ClaudeSessionUri.forSessionId('test-session');
			const sessionItem = { resource, label: 'Test' };

			await findCommandHandler('github.copilot.claude.sessions.commit')(sessionItem);

			expect(vscodeShim.commands.executeCommand).toHaveBeenCalledWith(
				'workbench.action.chat.openSessionWithPrompt.claude-code',
				{ resource, prompt: builtinSlashCommands.commit },
			);
		});

		it('commands do not execute when resource is undefined', async () => {
			createController([URI.file('/project')]);

			await findCommandHandler('github.copilot.claude.sessions.commit')(undefined);
			await findCommandHandler('github.copilot.claude.sessions.commitAndSync')(undefined);
			await findCommandHandler('github.copilot.claude.sessions.sync')(undefined);

			expect(vscodeShim.commands.executeCommand).not.toHaveBeenCalled();
		});

		it('initializeRepository calls gitService.initRepository with workspace folder', async () => {
			const gitService = new MockGitService();
			const initSpy = vi.spyOn(gitService, 'initRepository').mockResolvedValue({} as Repository);
			controller = createController([], gitService);

			const sessionId = 'init-repo-session';
			const sessionStateService = lastControllerAccessor.get(IClaudeSessionStateService);
			sessionStateService.setFolderInfoForSession(sessionId, {
				cwd: '/home/user/my-project',
				additionalDirectories: [],
			});

			const resource = ClaudeSessionUri.forSessionId(sessionId);
			await findCommandHandler('github.copilot.claude.sessions.initializeRepository')(resource);

			expect(initSpy).toHaveBeenCalledWith(URI.file('/home/user/my-project'));
		});

		it('initializeRepository does not throw when init returns undefined', async () => {
			const gitService = new MockGitService();
			vi.spyOn(gitService, 'initRepository').mockResolvedValue(undefined);
			controller = createController([], gitService);

			const sessionId = 'init-fail-session';
			const sessionStateService = lastControllerAccessor.get(IClaudeSessionStateService);
			sessionStateService.setFolderInfoForSession(sessionId, {
				cwd: '/home/user/my-project',
				additionalDirectories: [],
			});

			const resource = ClaudeSessionUri.forSessionId(sessionId);
			await findCommandHandler('github.copilot.claude.sessions.initializeRepository')(resource);
		});
	});

	// #endregion
});

function createClaudeSessionUri(id: string): URI {
	return URI.parse(`claude-code:/${id}`);
}
