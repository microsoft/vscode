/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SDKSessionInfo, SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { IFileSystemService } from '../../../../../../platform/filesystem/common/fileSystemService';
import { MockFileSystemService } from '../../../../../../platform/filesystem/node/test/mockFileSystemService';
import { TestingServiceCollection } from '../../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../../platform/workspace/common/workspaceService';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../util/common/test/testUtils';
import { CancellationToken, CancellationTokenSource } from '../../../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../../util/vs/platform/instantiation/common/instantiation';
import { FolderRepositoryMRUEntry, IFolderRepositoryManager } from '../../../../../chatSessions/common/folderRepositoryManager';
import { createExtensionUnitTestingServices } from '../../../../../test/node/services';
import { IClaudeCodeSdkService } from '../../claudeCodeSdkService';
import { computeFolderSlug } from '../../claudeProjectFolders';
import { MockClaudeCodeSdkService } from '../../test/mockClaudeCodeSdkService';
import { ClaudeCodeSessionService } from '../claudeCodeSessionService';

// #region Test Data Factories

function createSdkSessionInfo(overrides?: Partial<SDKSessionInfo>): SDKSessionInfo {
	return {
		sessionId: 'test-session-id',
		summary: 'Test session summary',
		lastModified: 1700000000000,
		...overrides,
	};
}

function createUserSessionMessage(overrides?: Partial<SessionMessage>): SessionMessage {
	return {
		type: 'user',
		uuid: 'user-uuid-1',
		session_id: 'test-session-id',
		message: { role: 'user', content: 'Hello, world!' },
		parent_tool_use_id: null,
		...overrides,
	};
}

function createAssistantSessionMessage(overrides?: Partial<SessionMessage>): SessionMessage {
	return {
		type: 'assistant',
		uuid: 'assistant-uuid-1',
		session_id: 'test-session-id',
		message: {
			role: 'assistant',
			content: [{ type: 'text', text: 'Hello! How can I help?' }],
		},
		parent_tool_use_id: null,
		...overrides,
	};
}

// #endregion

// #region Mock Implementations

class MockFolderRepositoryManager implements IFolderRepositoryManager {
	declare _serviceBrand: undefined;
	private _mruEntries: FolderRepositoryMRUEntry[] = [];

	setMRUEntries(entries: FolderRepositoryMRUEntry[]): void {
		this._mruEntries = entries;
	}

	setNewSessionFolder(): void { }
	deleteNewSessionFolder(): void { }
	async getFolderRepository(): Promise<{ folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }> { return { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }; }
	async initializeFolderRepository(): Promise<{ folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }> { return { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }; }
	async initializeMultiRootFolderRepositories(): Promise<{ primary: { folder: undefined; repository: undefined; worktree: undefined; worktreeProperties: undefined; trusted: undefined }; additional: never[] }> { return { primary: { folder: undefined, repository: undefined, worktree: undefined, worktreeProperties: undefined, trusted: undefined }, additional: [] }; }
	async getRepositoryInfo(): Promise<{ repository: undefined; headBranchName: undefined }> { return { repository: undefined, headBranchName: undefined }; }
	async getFolderMRU(): Promise<FolderRepositoryMRUEntry[]> { return this._mruEntries; }
}

// #endregion

describe('ClaudeCodeSessionService', () => {
	const workspaceFolderPath = '/project';
	const folderUri = URI.file(workspaceFolderPath);
	// Must match NullNativeEnvService.userHome used in the test service collection
	const userHome = URI.file('/home/testuser');

	let mockFs: MockFileSystemService;
	let mockSdkService: MockClaudeCodeSdkService;
	let testingServiceCollection: TestingServiceCollection;
	let service: ClaudeCodeSessionService;

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	beforeEach(() => {
		mockFs = new MockFileSystemService();
		mockSdkService = new MockClaudeCodeSdkService();
		testingServiceCollection = store.add(createExtensionUnitTestingServices(store));
		testingServiceCollection.set(IFileSystemService, mockFs);
		testingServiceCollection.set(IClaudeCodeSdkService, mockSdkService);

		const workspaceService = store.add(new TestWorkspaceService([folderUri]));
		testingServiceCollection.set(IWorkspaceService, workspaceService);
		testingServiceCollection.define(IFolderRepositoryManager, new MockFolderRepositoryManager());

		const accessor = testingServiceCollection.createTestingAccessor();
		mockFs = accessor.get(IFileSystemService) as MockFileSystemService;
		const instaService = accessor.get(IInstantiationService);
		service = instaService.createInstance(ClaudeCodeSessionService);
	});

	// #region getAllSessions

	describe('getAllSessions', () => {
		it('returns sessions from SDK for workspace folder', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId: 'session-1', summary: 'First session' }),
				createSdkSessionInfo({ sessionId: 'session-2', summary: 'Second session' }),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(2);
			expect(sessions[0].id).toBe('session-1');
			expect(sessions[0].label).toBe('First session');
			expect(sessions[1].id).toBe('session-2');
			expect(sessions[1].label).toBe('Second session');
		});

		it('returns empty array when SDK returns empty', async () => {
			mockSdkService.mockSessions = [];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(0);
		});

		it('converts SDKSessionInfo timestamps correctly', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					sessionId: 'ts-session',
					lastModified: 1700000000000,
					createdAt: 1699000000000,
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(1);
			expect(sessions[0].created).toBe(1699000000000);
			expect(sessions[0].lastRequestEnded).toBe(1700000000000);
		});

		it('uses lastModified as created when createdAt is missing', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					sessionId: 'no-created',
					lastModified: 1700000000000,
					createdAt: undefined,
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].created).toBe(1700000000000);
		});

		it('uses customTitle as label when available', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					customTitle: 'My Custom Title',
					summary: 'Some summary that should be ignored',
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].label).toBe('My Custom Title');
		});

		it('strips system-reminders from summary labels', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					summary: '<system-reminder>This should be removed</system-reminder>Actual summary',
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].label).toBe('Actual summary');
		});

		it('strips system-reminders from firstPrompt labels', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					summary: '',
					firstPrompt: '<system-reminder>Hidden context</system-reminder>Fix the bug',
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].label).toBe('Fix the bug');
		});

		it('falls back to firstPrompt when summary is empty', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					summary: '',
					firstPrompt: 'Add dark mode toggle',
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].label).toBe('Add dark mode toggle');
		});

		it('falls back to default label when summary and firstPrompt are empty', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({
					summary: '',
					firstPrompt: undefined,
				}),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].label).toBe('Claude Session');
		});

		it('truncates long labels to 50 characters with ellipsis', async () => {
			const longSummary = 'A'.repeat(60);
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ summary: longSummary }),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].label.length).toBeLessThanOrEqual(51); // 50 + ellipsis char
			expect(sessions[0].label).toMatch(/^A{50}\u2026$/);
		});

		it('sets folderName from the workspace folder basename', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId: 'with-folder' }),
			];

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions[0].folderName).toBe('project');
		});

		it('handles cancellation correctly', async () => {
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId: 'should-not-appear' }),
			];

			const tokenSource = new CancellationTokenSource();
			tokenSource.cancel();

			const sessions = await service.getAllSessions(tokenSource.token);

			expect(sessions).toHaveLength(0);
		});

		it('handles SDK errors gracefully', async () => {
			// Override listSessions to throw
			mockSdkService.listSessions = async () => { throw new Error('SDK error'); };

			const sessions = await service.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(0);
		});
	});

	// #endregion

	// #region getSession

	describe('getSession', () => {
		it('returns full session with messages from SDK', async () => {
			const sessionId = 'full-session-id';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId, summary: 'Full session' }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({ uuid: 'u1', session_id: sessionId }),
				createAssistantSessionMessage({ uuid: 'a1', session_id: sessionId }),
			];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.id).toBe(sessionId);
			expect(session?.label).toBe('Full session');
			expect(session?.messages).toHaveLength(2);
		});

		it('returns undefined when session info is not found', async () => {
			mockSdkService.mockSessions = [];

			const resource = URI.from({ scheme: 'claude-code', path: '/non-existent' });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session).toBeUndefined();
		});

		it('converts user messages correctly', async () => {
			const sessionId = 'user-msg-session';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({
					uuid: 'user-1',
					session_id: sessionId,
					message: { role: 'user', content: 'Test user message' },
				}),
			];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session?.messages).toHaveLength(1);
			expect(session?.messages[0].type).toBe('user');
			expect(session?.messages[0].uuid).toBe('user-1');
		});

		it('converts assistant messages correctly', async () => {
			const sessionId = 'assistant-msg-session';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createAssistantSessionMessage({
					uuid: 'asst-1',
					session_id: sessionId,
					message: {
						role: 'assistant',
						content: [{ type: 'text', text: 'Hello from assistant' }],
					},
				}),
			];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session?.messages).toHaveLength(1);
			expect(session?.messages[0].type).toBe('assistant');
			expect(session?.messages[0].uuid).toBe('asst-1');
		});

		it('handles multi-turn conversations', async () => {
			const sessionId = 'multi-turn';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({ uuid: 'u1', session_id: sessionId }),
				createAssistantSessionMessage({ uuid: 'a1', session_id: sessionId }),
				createUserSessionMessage({ uuid: 'u2', session_id: sessionId }),
				createAssistantSessionMessage({ uuid: 'a2', session_id: sessionId }),
			];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session?.messages).toHaveLength(4);
		});

		it('skips messages that fail validation', async () => {
			const sessionId = 'validation-session';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({ uuid: 'valid-1', session_id: sessionId }),
				{ type: 'system', uuid: 'invalid-1', session_id: sessionId, message: 'not a valid message', parent_tool_use_id: null } as unknown as SessionMessage,
				createAssistantSessionMessage({ uuid: 'valid-2', session_id: sessionId }),
			];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session?.messages).toHaveLength(2);
			expect(session!.messages[0].uuid).toBe('valid-1');
			expect(session!.messages[1].uuid).toBe('valid-2');
		});

		it('handles SDK errors in getSession gracefully', async () => {
			mockSdkService.getSessionInfo = async () => { throw new Error('SDK read failed'); };

			const resource = URI.from({ scheme: 'claude-code', path: '/error-session' });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session).toBeUndefined();
		});

		it('returns empty messages when SDK returns no messages', async () => {
			const sessionId = 'empty-messages';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.messages).toHaveLength(0);
		});

		it('sets folderName from the workspace folder basename', async () => {
			const sessionId = 'folder-session';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [];

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, CancellationToken.None);

			expect(session?.folderName).toBe('project');
		});

		it('respects cancellation during getSession', async () => {
			const sessionId = 'cancel-session';
			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({ session_id: sessionId }),
			];

			const tokenSource = new CancellationTokenSource();

			// Override getSessionMessages to cancel the token before returning
			const originalGetMessages = mockSdkService.getSessionMessages.bind(mockSdkService);
			mockSdkService.getSessionMessages = async (id, dir) => {
				tokenSource.cancel();
				return originalGetMessages(id, dir);
			};

			const resource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(resource, tokenSource.token);

			expect(session).toBeUndefined();
		});
	});

	// #endregion

	// #region Workspace Scenarios

	describe('no-workspace scenario (MRU folders)', () => {
		const mruFolder = URI.file('/recent/project');
		let noWorkspaceService: ClaudeCodeSessionService;
		let noWorkspaceSdkService: MockClaudeCodeSdkService;
		let noWorkspaceFolderManager: MockFolderRepositoryManager;

		beforeEach(() => {
			noWorkspaceSdkService = new MockClaudeCodeSdkService();
			noWorkspaceFolderManager = new MockFolderRepositoryManager();
			const noWorkspaceTestingServiceCollection = store.add(createExtensionUnitTestingServices(store));
			noWorkspaceTestingServiceCollection.set(IFileSystemService, new MockFileSystemService());
			noWorkspaceTestingServiceCollection.set(IClaudeCodeSdkService, noWorkspaceSdkService);

			const emptyWorkspaceService = store.add(new TestWorkspaceService([]));
			noWorkspaceTestingServiceCollection.set(IWorkspaceService, emptyWorkspaceService);
			noWorkspaceTestingServiceCollection.define(IFolderRepositoryManager, noWorkspaceFolderManager);

			noWorkspaceFolderManager.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
			]);

			const accessor = noWorkspaceTestingServiceCollection.createTestingAccessor();
			const instaService = accessor.get(IInstantiationService);
			noWorkspaceService = instaService.createInstance(ClaudeCodeSessionService);
		});

		it('loads sessions from MRU folder directories', async () => {
			noWorkspaceSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId: 'mru-session', summary: 'MRU session' }),
			];

			const sessions = await noWorkspaceService.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(1);
			expect(sessions[0].id).toBe('mru-session');
			expect(sessions[0].label).toBe('MRU session');
		});

		it('returns empty array when no MRU entries exist', async () => {
			noWorkspaceFolderManager.setMRUEntries([]);
			const noMruServiceCollection = store.add(createExtensionUnitTestingServices(store));
			noMruServiceCollection.set(IFileSystemService, new MockFileSystemService());
			noMruServiceCollection.set(IClaudeCodeSdkService, new MockClaudeCodeSdkService());
			noMruServiceCollection.set(IWorkspaceService, store.add(new TestWorkspaceService([])));
			noMruServiceCollection.define(IFolderRepositoryManager, noWorkspaceFolderManager);

			const accessor = noMruServiceCollection.createTestingAccessor();
			const noMruService = accessor.get(IInstantiationService).createInstance(ClaudeCodeSessionService);

			const sessions = await noMruService.getAllSessions(CancellationToken.None);
			expect(sessions).toHaveLength(0);
		});

		it('discovers sessions across all MRU folder paths', async () => {
			const mruFolder2 = URI.file('/another/project');

			noWorkspaceFolderManager.setMRUEntries([
				{ folder: mruFolder, repository: undefined, lastAccessed: Date.now() },
				{ folder: mruFolder2, repository: undefined, lastAccessed: Date.now() - 1000 },
			]);

			const multiMruServiceCollection = store.add(createExtensionUnitTestingServices(store));
			const multiSdkService = new MockClaudeCodeSdkService();
			multiSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId: 'mru-1', summary: 'From MRU 1' }),
				createSdkSessionInfo({ sessionId: 'mru-2', summary: 'From MRU 2' }),
			];
			multiMruServiceCollection.set(IFileSystemService, new MockFileSystemService());
			multiMruServiceCollection.set(IClaudeCodeSdkService, multiSdkService);
			multiMruServiceCollection.set(IWorkspaceService, store.add(new TestWorkspaceService([])));
			multiMruServiceCollection.define(IFolderRepositoryManager, noWorkspaceFolderManager);

			const accessor = multiMruServiceCollection.createTestingAccessor();
			const multiMruService = accessor.get(IInstantiationService).createInstance(ClaudeCodeSessionService);
			const sessions = await multiMruService.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(4); // 2 sessions returned per folder (listSessions called for each)
			const ids = sessions.map(s => s.id);
			expect(ids).toContain('mru-1');
			expect(ids).toContain('mru-2');
		});
	});

	describe('multi-root workspace scenario', () => {
		const folder1 = URI.file('/project1');
		const folder2 = URI.file('/project2');
		let multiRootService: ClaudeCodeSessionService;
		let multiRootSdkService: MockClaudeCodeSdkService;

		beforeEach(() => {
			multiRootSdkService = new MockClaudeCodeSdkService();
			const multiRootTestingServiceCollection = store.add(createExtensionUnitTestingServices(store));
			multiRootTestingServiceCollection.set(IFileSystemService, new MockFileSystemService());
			multiRootTestingServiceCollection.set(IClaudeCodeSdkService, multiRootSdkService);

			const multiRootWorkspaceService = store.add(new TestWorkspaceService([folder1, folder2]));
			multiRootTestingServiceCollection.set(IWorkspaceService, multiRootWorkspaceService);
			multiRootTestingServiceCollection.define(IFolderRepositoryManager, new MockFolderRepositoryManager());

			const accessor = multiRootTestingServiceCollection.createTestingAccessor();
			const instaService = accessor.get(IInstantiationService);
			multiRootService = instaService.createInstance(ClaudeCodeSessionService);
		});

		it('loads sessions from all workspace folder directories', async () => {
			multiRootSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId: 'multi-1', summary: 'Folder 1 session' }),
			];

			const sessions = await multiRootService.getAllSessions(CancellationToken.None);

			// SDK returns the same mock sessions for each folder scan
			expect(sessions.length).toBeGreaterThan(0);
			expect(sessions[0].id).toBe('multi-1');
		});

		it('returns empty array when no sessions exist', async () => {
			multiRootSdkService.mockSessions = [];

			const sessions = await multiRootService.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(0);
		});
	});

	// #endregion

	// #region Subagent Loading

	describe('subagent loading', () => {
		it('loads subagents for a session when SDK returns subagent IDs', async () => {
			const sessionId = 'test-session';

			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({ uuid: 'uuid-main', session_id: sessionId }),
			];

			// Configure subagent data via SDK mock
			mockSdkService.mockSubagentIds = ['a139fcf'];
			mockSdkService.mockSubagentMessages.set('a139fcf', [
				createUserSessionMessage({ uuid: 'uuid-subagent', session_id: 'subagent-session', message: { role: 'user', content: 'subagent task' } }),
				createAssistantSessionMessage({ uuid: 'uuid-subagent-reply', session_id: 'subagent-session' }),
			]);

			// Mock parent JSONL for correlation (still uses filesystem)
			const slug = computeFolderSlug(folderUri);
			const projectDirUri = URI.joinPath(userHome, '.claude', 'projects', slug);
			mockFs.mockFile(URI.joinPath(projectDirUri, `${sessionId}.jsonl`), '', 1000);

			const sessionResource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(sessionResource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.subagents).toHaveLength(1);
			expect(session?.subagents[0].agentId).toBe('a139fcf');
			expect(session?.subagents[0].messages).toHaveLength(2);
		});

		it('returns empty subagents when SDK returns no subagent IDs', async () => {
			const sessionId = 'test-session';

			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [
				createUserSessionMessage({ session_id: sessionId }),
			];
			mockSdkService.mockSubagentIds = [];

			const sessionResource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(sessionResource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.subagents).toHaveLength(0);
		});

		it('loads multiple subagents and sorts by timestamp', async () => {
			const sessionId = 'test-session';

			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [];

			mockSdkService.mockSubagentIds = ['agent-b', 'agent-a'];
			mockSdkService.mockSubagentMessages.set('agent-a', [
				createUserSessionMessage({ uuid: 'u-a', session_id: sessionId }),
			]);
			mockSdkService.mockSubagentMessages.set('agent-b', [
				createUserSessionMessage({ uuid: 'u-b', session_id: sessionId }),
			]);

			const slug = computeFolderSlug(folderUri);
			const projectDirUri = URI.joinPath(userHome, '.claude', 'projects', slug);
			mockFs.mockFile(URI.joinPath(projectDirUri, `${sessionId}.jsonl`), '', 1000);

			const sessionResource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(sessionResource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.subagents).toHaveLength(2);
		});

		it('handles SDK errors in listSubagents gracefully', async () => {
			const sessionId = 'test-session';

			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [];
			mockSdkService.listSubagents = async () => { throw new Error('SDK error'); };

			const sessionResource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(sessionResource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.subagents).toHaveLength(0);
		});

		it('handles SDK errors in getSubagentMessages gracefully', async () => {
			const sessionId = 'test-session';

			mockSdkService.mockSessions = [
				createSdkSessionInfo({ sessionId }),
			];
			mockSdkService.mockSessionMessages = [];
			mockSdkService.mockSubagentIds = ['broken-agent'];
			mockSdkService.getSubagentMessages = async () => { throw new Error('SDK error'); };

			const slug = computeFolderSlug(folderUri);
			const projectDirUri = URI.joinPath(userHome, '.claude', 'projects', slug);
			mockFs.mockFile(URI.joinPath(projectDirUri, `${sessionId}.jsonl`), '', 1000);

			const sessionResource = URI.from({ scheme: 'claude-code', path: '/' + sessionId });
			const session = await service.getSession(sessionResource, CancellationToken.None);

			expect(session).toBeDefined();
			expect(session?.subagents).toHaveLength(0);
		});
	});

	// #endregion
});
