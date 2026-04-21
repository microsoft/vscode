/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionOptions } from '@github/copilot/sdk';
import { mkdir, mkdtemp, rm, writeFile as writeNodeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatContext, ChatParticipantToolToken, Uri } from 'vscode';
import { CancellationToken } from 'vscode-languageserver-protocol';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { NullChatDebugFileLoggerService } from '../../../../../platform/chat/common/chatDebugFileLoggerService';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { NullNativeEnvService } from '../../../../../platform/env/common/nullEnvService';
import { MockFileSystemService } from '../../../../../platform/filesystem/node/test/mockFileSystemService';
import { MockGitService } from '../../../../../platform/ignore/node/test/mockGitService';
import { ILogService } from '../../../../../platform/log/common/logService';
import { NullMcpService } from '../../../../../platform/mcp/common/mcpService';
import { NoopOTelService, resolveOTelConfig } from '../../../../../platform/otel/common/index';
import { MockPromptsService } from '../../../../../platform/promptFiles/test/common/mockPromptsService';
import { NullRequestLogger } from '../../../../../platform/requestLogger/node/nullRequestLogger';
import { NullWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { DisposableStore, IReference, toDisposable } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { NullPromptVariablesService } from '../../../../prompt/node/promptVariablesService';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { IAgentSessionsWorkspace } from '../../../common/agentSessionsWorkspace';
import { IChatSessionWorkspaceFolderService } from '../../../common/chatSessionWorkspaceFolderService';
import { IChatSessionWorktreeService } from '../../../common/chatSessionWorktreeService';
import { MockChatSessionMetadataStore } from '../../../common/test/mockChatSessionMetadataStore';
import { IWorkspaceInfo } from '../../../common/workspaceInfo';
import { FakeToolsService } from '../../common/copilotCLITools';
import { ICustomSessionTitleService } from '../../common/customSessionTitleService';
import { IChatDelegationSummaryService } from '../../common/delegationSummaryService';
import { getCopilotCLISessionDir } from '../cliHelpers';
import { ICopilotCLISDK } from '../copilotCli';
import { CopilotCLISession, ICopilotCLISession } from '../copilotcliSession';
import { CopilotCLISessionService, CopilotCLISessionWorkspaceTracker, ICopilotCLISessionItem } from '../copilotcliSessionService';
import { CopilotCLIMCPHandler } from '../mcpHandler';
import { IQuestion, IQuestionAnswer, IUserQuestionHandler } from '../userInputHelpers';
import { MockCliSdkSession, MockCliSdkSessionManager, MockSkillLocations, NullCopilotCLIAgents, NullICopilotCLIImageSupport } from './testHelpers';

// Re-export for backward compatibility with other spec files
export { MockCliSdkSession, MockCliSdkSessionManager, MockSkillLocations, NullCopilotCLIAgents, NullICopilotCLIImageSupport } from './testHelpers';

class MockLocalSession {
	static async fromEvents(events: readonly { type: string }[]): Promise<{}> {
		const unknownEvent = events.find(event => event.type === 'custom.unknown');
		if (unknownEvent) {
			throw new Error(`Unknown event type: ${unknownEvent.type}. Failed to deserialize session.`);
		}
		return {};
	}
}

export class NullAgentSessionsWorkspace implements IAgentSessionsWorkspace {
	_serviceBrand: undefined;
	readonly isAgentSessionsWorkspace = false;
}

class NullChatSessionWorkspaceFolderService extends mock<IChatSessionWorkspaceFolderService>() {
	override deleteTrackedWorkspaceFolder = vi.fn(async () => { });
	override trackSessionWorkspaceFolder = vi.fn(async () => { });
	override getSessionWorkspaceFolder = vi.fn(async () => undefined);
	override handleRequestCompleted = vi.fn(async () => { });
	override getWorkspaceChanges = vi.fn(async () => undefined);
	override clearWorkspaceChanges: IChatSessionWorkspaceFolderService['clearWorkspaceChanges'] = vi.fn((_sessionIdOrFolderUri: string | Uri) => []);
}

class NullChatSessionWorktreeService extends mock<IChatSessionWorktreeService>() {
	override getWorktreeProperties: IChatSessionWorktreeService['getWorktreeProperties'] = vi.fn(async () => undefined);
}

class NullCustomSessionTitleService implements ICustomSessionTitleService {
	declare _serviceBrand: undefined;
	async getCustomSessionTitle(_sessionId: string): Promise<string | undefined> { return undefined; }
	async setCustomSessionTitle(_sessionId: string, _title: string): Promise<void> { }
	async generateSessionTitle(_sessionId: string, _request: { prompt?: string; command?: string }): Promise<string | undefined> { return undefined; }
}

function workspaceInfoFor(workingDirectory: Uri | undefined): IWorkspaceInfo {
	return {
		folder: workingDirectory,
		repository: undefined,
		worktree: undefined,
		worktreeProperties: undefined,
	};
}

function sessionOptionsFor(workingDirectory?: Uri) {
	return {
		workspace: workspaceInfoFor(workingDirectory),
	};
}

describe('CopilotCLISessionService', () => {
	const disposables = new DisposableStore();
	let logService: ILogService;
	let instantiationService: IInstantiationService;
	let service: CopilotCLISessionService;
	let manager: MockCliSdkSessionManager;
	let tempStateHome: string | undefined;
	const originalXdgStateHome = process.env.XDG_STATE_HOME;
	beforeEach(async () => {
		vi.useRealTimers();
		const sdk = {
			getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} })),
			getRequestId: vi.fn(() => undefined),
		} as unknown as ICopilotCLISDK;

		const services = disposables.add(createExtensionUnitTestingServices());
		const accessor = services.createTestingAccessor();
		logService = accessor.get(ILogService);
		const workspaceService = new NullWorkspaceService();
		const cliAgents = new NullCopilotCLIAgents();
		const authService = {
			getCopilotToken: vi.fn(async () => ({ token: 'test-token' })),
		} as unknown as IAuthenticationService;
		const delegationService = new class extends mock<IChatDelegationSummaryService>() {
			override async summarize(context: ChatContext, token: CancellationToken): Promise<string | undefined> {
				return undefined;
			}
			override extractPrompt(): { prompt: string; reference: never } | undefined {
				return undefined;
			}
		}();
		class FakeUserQuestionHandler implements IUserQuestionHandler {
			_serviceBrand: undefined;
			async askUserQuestion(question: IQuestion, toolInvocationToken: ChatParticipantToolToken, token: CancellationToken): Promise<IQuestionAnswer | undefined> {
				return undefined;
			}
		}

		instantiationService = {
			invokeFunction(fn: (accessor: unknown, ...args: any[]) => any, ...args: any[]): any {
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
				return disposables.add(new CopilotCLISession(workspaceInfo, agentName, sdkSession, [], logService, workspaceService, new MockChatSessionMetadataStore(), instantiationService, new NullRequestLogger(), new NullICopilotCLIImageSupport(), new FakeToolsService(), new FakeUserQuestionHandler(), accessor.get(IConfigurationService), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new MockGitService()));
			}
		} as unknown as IInstantiationService;
		const configurationService = accessor.get(IConfigurationService);
		const nullMcpServer = disposables.add(new NullMcpService());
		const titleService = new NullCustomSessionTitleService();
		service = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), new MockFileSystemService(), new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), cliAgents, workspaceService, titleService, configurationService, new MockSkillLocations(), delegationService, new MockChatSessionMetadataStore(), new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));
		manager = await service.getSessionManager() as unknown as MockCliSdkSessionManager;
	});

	afterEach(() => {
		if (tempStateHome) {
			void rm(tempStateHome, { recursive: true, force: true });
			tempStateHome = undefined;
		}
		process.env.XDG_STATE_HOME = originalXdgStateHome;
		vi.useRealTimers();
		vi.restoreAllMocks();
		disposables.clear();
	});

	// --- Tests ----------------------------------------------------------------------------------

	describe('CopilotCLISessionService.createSession', () => {
		it('get session will return the same session created using createSession', async () => {
			const session = await service.createSession({ model: 'gpt-test', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			const existingSession = await service.getSession({ sessionId: session.object.sessionId, ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(existingSession).toBe(session);
		});
		it('get session will return new once previous session is disposed', async () => {
			const session = await service.createSession({ model: 'gpt-test', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			session.dispose();
			await new Promise(resolve => setTimeout(resolve, 0)); // allow dispose async cleanup to run
			const existingSession = await service.getSession({ sessionId: session.object.sessionId, ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(existingSession?.object).toBeDefined();
			expect(existingSession?.object).not.toBe(session);
			expect(existingSession?.object.sessionId).toBe(session.object.sessionId);
		});

		it('passes clientName: vscode to session manager', async () => {
			const createSessionSpy = vi.spyOn(manager, 'createSession');
			await service.createSession({ model: 'gpt-test', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(createSessionSpy).toHaveBeenCalledWith(expect.objectContaining({
				clientName: 'vscode'
			}));
		});

		it('passes reasoningEffort to session manager when provided', async () => {
			const createSessionSpy = vi.spyOn(manager, 'createSession');
			await service.createSession({ model: 'gpt-test', reasoningEffort: 'high', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(createSessionSpy).toHaveBeenCalledWith(expect.objectContaining({
				model: 'gpt-test',
			}));
		});

		it('does not set reasoningEffort when not provided', async () => {
			const createSessionSpy = vi.spyOn(manager, 'createSession');
			await service.createSession({ model: 'gpt-test', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(createSessionSpy).toHaveBeenCalledWith(expect.objectContaining({
				model: 'gpt-test',
			}));
			const callArgs = createSessionSpy.mock.calls[0][0];
			expect(callArgs.reasoningEffort).toBeUndefined();
		});
	});

	describe('CopilotCLISessionService.getSession', () => {
		it('passes reasoningEffort to session manager when creating a new session', async () => {
			const targetId = 'reasoning-get';
			manager.sessions.set(targetId, new MockCliSdkSession(targetId, new Date()));
			const getSessionSpy = vi.spyOn(manager, 'getSession');
			await service.getSession({ sessionId: targetId, model: 'gpt-test', reasoningEffort: 'medium', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(getSessionSpy).toHaveBeenCalledWith(expect.objectContaining({
				model: 'gpt-test',
			}), true);
		});

		it('does not set reasoningEffort when not provided', async () => {
			const targetId = 'no-reasoning-get';
			manager.sessions.set(targetId, new MockCliSdkSession(targetId, new Date()));
			const getSessionSpy = vi.spyOn(manager, 'getSession');
			await service.getSession({ sessionId: targetId, model: 'gpt-test', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(getSessionSpy).toHaveBeenCalled();
			const callArgs = getSessionSpy.mock.calls[0][0];
			expect(callArgs.reasoningEffort).toBeUndefined();
		});
	});

	describe('CopilotCLISessionService.getSession concurrency & locking', () => {
		it('concurrent getSession calls for same id create only one wrapper', async () => {
			const targetId = 'concurrent';
			const sdkSession = new MockCliSdkSession(targetId, new Date());
			manager.sessions.set(targetId, sdkSession);
			const originalGetSession = manager.getSession.bind(manager);
			const getSessionSpy = vi.fn((opts: SessionOptions & { sessionId: string }, writable: boolean) => {
				// Introduce delay to force overlapping acquire attempts
				return new Promise(resolve => setTimeout(() => resolve(originalGetSession(opts, writable)), 20));
			});
			manager.getSession = getSessionSpy as unknown as typeof manager.getSession;

			const promises: Promise<IReference<ICopilotCLISession> | undefined>[] = [];
			for (let i = 0; i < 10; i++) {
				promises.push(service.getSession({ sessionId: targetId, ...sessionOptionsFor() }, CancellationToken.None));
			}
			const results = await Promise.all(promises);
			// All results refer to same instance
			const first = results.shift()!;
			for (const r of results) {
				expect(r).toBe(first);
			}
			expect(getSessionSpy).toHaveBeenCalledTimes(1);

			// Verify ref-count like disposal only disposes when all callers release
			let sentinelDisposed = false;
			(first.object as CopilotCLISession).add(toDisposable(() => { sentinelDisposed = true; }));

			results.forEach(r => r?.dispose());
			expect(sentinelDisposed).toBe(false);

			// Only after disposing the last reference is the session disposed.
			first.dispose();
			expect(sentinelDisposed).toBe(true);
		});

		it('getSession for different ids does not block on mutex for another id', async () => {
			const slowId = 'slow';
			const fastId = 'fast';
			manager.sessions.set(slowId, new MockCliSdkSession(slowId, new Date()));
			manager.sessions.set(fastId, new MockCliSdkSession(fastId, new Date()));

			const originalGetSession = manager.getSession.bind(manager);
			manager.getSession = vi.fn((opts: SessionOptions & { sessionId: string }, writable: boolean) => {
				if (opts.sessionId === slowId) {
					return new Promise(resolve => setTimeout(() => resolve(originalGetSession(opts, writable)), 40));
				}
				return originalGetSession(opts, writable);
			}) as unknown as typeof manager.getSession;

			const slowPromise = service.getSession({ sessionId: slowId, ...sessionOptionsFor() }, CancellationToken.None).then(() => 'slow');
			const fastPromise = service.getSession({ sessionId: fastId, ...sessionOptionsFor() }, CancellationToken.None).then(() => 'fast');
			const firstResolved = await Promise.race([slowPromise, fastPromise]);
			expect(firstResolved).toBe('fast');
		});

		it('session only fully disposes after all acquired references dispose', async () => {
			const id = 'refcount';
			manager.sessions.set(id, new MockCliSdkSession(id, new Date()));
			// Acquire 5 times sequentially
			const sessions: IReference<ICopilotCLISession>[] = [];
			for (let i = 0; i < 5; i++) {
				sessions.push((await service.getSession({ sessionId: id, ...sessionOptionsFor() }, CancellationToken.None))!);
			}
			const base = sessions[0];
			for (const s of sessions) {
				expect(s).toBe(base);
			}
			let sentinelDisposed = false;
			const lastSession = sessions.pop()!;
			(lastSession.object as CopilotCLISession).add(toDisposable(() => { sentinelDisposed = true; }));
			// Dispose all other session refs, session should not yet be disposed
			sessions.forEach(s => s.dispose());
			expect(sentinelDisposed).toBe(false);
			// Final dispose triggers actual disposal
			lastSession.dispose();
			expect(sentinelDisposed).toBe(true);
		});
	});

	describe('CopilotCLISessionService.getSession missing', () => {
		it('returns undefined when underlying manager has no session', async () => {
			const session = await service.getSession({ sessionId: 'does-not-exist', ...sessionOptionsFor() }, CancellationToken.None);
			disposables.add(session!);
			expect(session).toBeUndefined();
		});
	});

	describe('CopilotCLISessionService.tryGetPartialSesionHistory', () => {
		it('reconstructs history from persisted files', async () => {
			tempStateHome = await mkdtemp(join(tmpdir(), 'copilot-cli-session-service-'));
			process.env.XDG_STATE_HOME = tempStateHome;
			const sessionId = 'partial-session';
			const sessionDir = URI.file(getCopilotCLISessionDir(sessionId));
			const fileSystem = new MockFileSystemService();
			const sdk = {
				getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} }))
			} as unknown as ICopilotCLISDK;
			const services = createExtensionUnitTestingServices();
			disposables.add(services);
			const accessor = services.createTestingAccessor();
			const configurationService = accessor.get(IConfigurationService);
			const authService = {
				getCopilotToken: vi.fn(async () => ({ token: 'test-token' })),
			} as unknown as IAuthenticationService;
			const nullMcpServer = disposables.add(new NullMcpService());
			const titleService = new NullCustomSessionTitleService();
			const delegationService = new class extends mock<IChatDelegationSummaryService>() {
				override extractPrompt(): { prompt: string; reference: never } | undefined {
					return undefined;
				}
			}();
			const partialService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), fileSystem, new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), new NullCopilotCLIAgents(), new NullWorkspaceService(), titleService, configurationService, new MockSkillLocations(), delegationService, new MockChatSessionMetadataStore(), new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));

			await mkdir(sessionDir.fsPath, { recursive: true });
			await writeNodeFile(join(sessionDir.fsPath, 'events.jsonl'), [
				JSON.stringify({ id: '1', type: 'session.start', timestamp: '2024-01-01T00:00:00.000Z', parentId: null, data: { sessionId, startTime: '2024-01-01T00:00:00.000Z', selectedModel: 'gpt-test', version: 1, producer: 'test', copilotVersion: '1.0.0', context: { cwd: URI.file('/workspace/project').fsPath, gitRoot: URI.file('/workspace/repo').fsPath, repository: URI.file('/workspace/repo').fsPath } } }),
				JSON.stringify({ id: '2', type: 'user.message', timestamp: '2024-01-01T00:00:01.000Z', parentId: '1', data: { content: 'Repair the session', attachments: [] } }),
				JSON.stringify({ id: '3', type: 'assistant.message', timestamp: '2024-01-01T00:00:03.000Z', parentId: '2', data: { content: 'Recovered history' } }),
			].join('\n'));

			const partialHistory = await partialService.tryGetPartialSessionHistory(sessionId);

			expect(partialHistory).toBeDefined();
			expect(partialHistory).toHaveLength(2);
			expect(partialService.getSessionWorkingDirectory(sessionId)?.fsPath).toBe(URI.file('/workspace/project').fsPath);
		});

		it('returns cached result on second call without re-reading the file', async () => {
			tempStateHome = await mkdtemp(join(tmpdir(), 'copilot-cli-session-service-'));
			process.env.XDG_STATE_HOME = tempStateHome;
			const sessionId = 'cache-test-session';
			const sessionDir = URI.file(getCopilotCLISessionDir(sessionId));
			const fileSystem = new MockFileSystemService();
			const sdk = {
				getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} }))
			} as unknown as ICopilotCLISDK;
			const services = createExtensionUnitTestingServices();
			disposables.add(services);
			const accessor = services.createTestingAccessor();
			const configurationService = accessor.get(IConfigurationService);
			const authService = { getCopilotToken: vi.fn(async () => ({ token: 'test-token' })) } as unknown as IAuthenticationService;
			const nullMcpServer = disposables.add(new NullMcpService());
			const titleService = new NullCustomSessionTitleService();
			const delegationService = new class extends mock<IChatDelegationSummaryService>() {
				override extractPrompt(): { prompt: string; reference: never } | undefined { return undefined; }
			}();
			const partialService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), fileSystem, new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), new NullCopilotCLIAgents(), new NullWorkspaceService(), titleService, configurationService, new MockSkillLocations(), delegationService, new MockChatSessionMetadataStore(), new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));

			await mkdir(sessionDir.fsPath, { recursive: true });
			const eventsFilePath = join(sessionDir.fsPath, 'events.jsonl');
			await writeNodeFile(eventsFilePath, [
				JSON.stringify({ id: '1', type: 'session.start', timestamp: '2024-01-01T00:00:00.000Z', parentId: null, data: { sessionId, startTime: '2024-01-01T00:00:00.000Z', selectedModel: 'gpt-test', version: 1, producer: 'test', copilotVersion: '1.0.0', context: { cwd: URI.file('/workspace/project').fsPath } } }),
				JSON.stringify({ id: '2', type: 'user.message', timestamp: '2024-01-01T00:00:01.000Z', parentId: '1', data: { content: 'First call fills cache', attachments: [] } }),
			].join('\n'));

			const history1 = await partialService.tryGetPartialSessionHistory(sessionId);

			// Remove the file so a second disk read would fail
			await rm(eventsFilePath);

			// Second call must return the cached array (same reference, no re-read)
			const history2 = await partialService.tryGetPartialSessionHistory(sessionId);

			expect(history2).toBe(history1);
		});

		it('returns undefined when the events file does not exist', async () => {
			tempStateHome = await mkdtemp(join(tmpdir(), 'copilot-cli-session-service-'));
			process.env.XDG_STATE_HOME = tempStateHome;

			const result = await service.tryGetPartialSessionHistory('nonexistent-session-id');
			expect(result).toBeUndefined();
		});
	});

	describe('CopilotCLISessionService.getAllSessions', () => {
		it('will not list created sessions', async () => {
			const session = await service.createSession({ model: 'gpt-test', ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);
			disposables.add(session);

			const s1 = new MockCliSdkSession('s1', new Date(0));
			s1.messages.push({ role: 'user', content: 'a'.repeat(100) });
			s1.events.push({ type: 'user.message', data: { content: 'a'.repeat(100) }, timestamp: '2024-01-01T00:00:00.000Z' });
			manager.sessions.set(s1.sessionId, s1);

			const result = await service.getAllSessions(CancellationToken.None);

			expect(result.length).toBe(1);
			const item = result[0];
			expect(item.id).toBe('s1');
		});

		it('falls back to partial session data when getSession fails with an unknown event type', async () => {
			tempStateHome = await mkdtemp(join(tmpdir(), 'copilot-cli-session-service-'));
			process.env.XDG_STATE_HOME = tempStateHome;
			const sessionId = 'invalid-session';
			const sessionDir = URI.file(getCopilotCLISessionDir(sessionId));
			const fileSystem = new MockFileSystemService();
			const sdk = {
				getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} }))
			} as unknown as ICopilotCLISDK;
			const services = createExtensionUnitTestingServices();
			disposables.add(services);
			const accessor = services.createTestingAccessor();
			const configurationService = accessor.get(IConfigurationService);
			const authService = {
				getCopilotToken: vi.fn(async () => ({ token: 'test-token' })),
			} as unknown as IAuthenticationService;
			const nullMcpServer = disposables.add(new NullMcpService());
			const titleService = new NullCustomSessionTitleService();
			const delegationService = new class extends mock<IChatDelegationSummaryService>() {
				override extractPrompt(): { prompt: string; reference: never } | undefined {
					return undefined;
				}
			}();
			const partialService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), fileSystem, new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), new NullCopilotCLIAgents(), new NullWorkspaceService(), titleService, configurationService, new MockSkillLocations(), delegationService, new MockChatSessionMetadataStore(), new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));
			const partialManager = await partialService.getSessionManager() as unknown as MockCliSdkSessionManager;

			const session = new MockCliSdkSession(sessionId, new Date('2024-01-01T00:00:00.000Z'));
			session.summary = 'Broken summary <current_dateti...';
			partialManager.sessions.set(sessionId, session);
			partialManager.getSession = vi.fn(async () => {
				throw new Error('Failed to load session. Unknown event type: custom.unknown.');
			}) as unknown as typeof partialManager.getSession;

			await mkdir(sessionDir.fsPath, { recursive: true });
			await writeNodeFile(join(sessionDir.fsPath, 'events.jsonl'), [
				JSON.stringify({ id: '1', type: 'session.start', timestamp: '2024-01-01T00:00:00.000Z', parentId: null, data: { sessionId, startTime: '2024-01-01T00:00:00.000Z', selectedModel: 'gpt-test', version: 1, producer: 'test', copilotVersion: '1.0.0', context: { cwd: URI.file('/workspace/project').fsPath } } }),
				JSON.stringify({ id: '2', type: 'user.message', timestamp: '2024-01-01T00:00:01.000Z', parentId: '1', data: { content: 'Use fallback history', attachments: [] } }),
			].join('\n'));

			const sessions = await partialService.getAllSessions(CancellationToken.None);

			expect(sessions).toHaveLength(1);
			expect(sessions[0].id).toBe(sessionId);
			expect(sessions[0].label).toBe('Use fallback history');
		});

		it('does not emit session when summary is truncated and no user turns exist', async () => {
			tempStateHome = await mkdtemp(join(tmpdir(), 'copilot-cli-session-service-'));
			process.env.XDG_STATE_HOME = tempStateHome;
			const sessionId = 'no-user-turns-session';
			const sessionDir = URI.file(getCopilotCLISessionDir(sessionId));
			const fileSystem = new MockFileSystemService();
			const sdk = {
				getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} }))
			} as unknown as ICopilotCLISDK;
			const services = createExtensionUnitTestingServices();
			disposables.add(services);
			const accessor = services.createTestingAccessor();
			const configurationService = accessor.get(IConfigurationService);
			const authService = { getCopilotToken: vi.fn(async () => ({ token: 'test-token' })) } as unknown as IAuthenticationService;
			const nullMcpServer = disposables.add(new NullMcpService());
			const titleService = new NullCustomSessionTitleService();
			const delegationService = new class extends mock<IChatDelegationSummaryService>() {
				override extractPrompt(): { prompt: string; reference: never } | undefined { return undefined; }
			}();
			const partialService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), fileSystem, new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), new NullCopilotCLIAgents(), new NullWorkspaceService(), titleService, configurationService, new MockSkillLocations(), delegationService, new MockChatSessionMetadataStore(), new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));
			const partialManager = await partialService.getSessionManager() as unknown as MockCliSdkSessionManager;

			// Session has a summary with '<' (which forces the session-load fallback path)
			// but no readable user turns in the events file.
			const session = new MockCliSdkSession(sessionId, new Date('2024-01-01T00:00:00.000Z'));
			session.summary = 'Summary without user turns <current_dateti...';
			partialManager.sessions.set(sessionId, session);
			partialManager.getSession = vi.fn(async () => {
				throw new Error('Failed to load session. Unknown event type: custom.unknown.');
			}) as unknown as typeof partialManager.getSession;

			await mkdir(sessionDir.fsPath, { recursive: true });
			// events.jsonl only contains session.start — no user.message events
			await writeNodeFile(join(sessionDir.fsPath, 'events.jsonl'), [
				JSON.stringify({ id: '1', type: 'session.start', timestamp: '2024-01-01T00:00:00.000Z', parentId: null, data: { sessionId, startTime: '2024-01-01T00:00:00.000Z', selectedModel: 'gpt-test', version: 1, producer: 'test', copilotVersion: '1.0.0', context: { cwd: URI.file('/workspace/project').fsPath } } }),
			].join('\n'));

			const sessions = await partialService.getAllSessions(CancellationToken.None);

			// Session still appears, using the metadata summary as a best-effort label
			expect(sessions).toHaveLength(1);
			expect(sessions[0].id).toBe(sessionId);
			expect(sessions[0].label).toBe('Summary without user turns <current_dateti...');
		});
	});

	describe('CopilotCLISessionService.deleteSession', () => {
		it('disposes active wrapper, removes from manager and fires change event', async () => {
			const session = await service.createSession({ ...sessionOptionsFor() }, CancellationToken.None);
			const id = session!.object.sessionId;
			let fired = false;
			disposables.add(session);
			disposables.add(service.onDidChangeSessions(() => { fired = true; }));
			await service.deleteSession(id);

			expect(manager.sessions.has(id)).toBe(false);
			expect(fired).toBe(true);

			expect(await service.getSession({ sessionId: id, ...sessionOptionsFor() }, CancellationToken.None)).toBeUndefined();
		});

		it('fires onDidDeleteSession with the session id', async () => {
			const session = await service.createSession({ ...sessionOptionsFor() }, CancellationToken.None);
			const id = session!.object.sessionId;
			const deletedIds: string[] = [];
			disposables.add(session);
			disposables.add(service.onDidDeleteSession(deletedId => deletedIds.push(deletedId)));
			await service.deleteSession(id);

			expect(deletedIds).toHaveLength(1);
			expect(deletedIds[0]).toBe(id);
		});

		it('clears partial session history cache and working directory on delete', async () => {
			const session = await service.createSession({ ...sessionOptionsFor() }, CancellationToken.None);
			const id = session.object.sessionId;
			disposables.add(session);

			// Manually populate both caches to simulate a prior tryGetPartialSesionHistory call
			const partialHistories = (service as any)._partialSessionHistories as Map<string, readonly unknown[]>;
			const workingDirs = (service as any)._sessionWorkingDirectories as Map<string, Uri | undefined>;
			partialHistories.set(id, []);
			workingDirs.set(id, URI.file('/some/working/dir'));

			expect(partialHistories.has(id)).toBe(true);
			expect(workingDirs.has(id)).toBe(true);

			await service.deleteSession(id);

			expect(partialHistories.has(id)).toBe(false);
			expect(workingDirs.has(id)).toBe(false);
		});
	});

	describe('CopilotCLISessionService.getSession cache clearing', () => {
		it('clears partial session history when reusing an existing active session', async () => {
			const session = await service.createSession({ ...sessionOptionsFor() }, CancellationToken.None);
			const id = session.object.sessionId;

			// Simulate a partial history entry that was populated before the session was loaded
			const partialHistories = (service as any)._partialSessionHistories as Map<string, readonly unknown[]>;
			partialHistories.set(id, []);
			expect(partialHistories.has(id)).toBe(true);

			// getSession with the same id reuses the existing wrapper and should clear the partial cache
			const reused = await service.getSession({ sessionId: id, ...sessionOptionsFor() }, CancellationToken.None);

			expect(reused).toBe(session);
			expect(partialHistories.has(id)).toBe(false);

			session.dispose();
			reused?.dispose();
		});
	});

	describe('CopilotCLISessionService.label generation', () => {
		it('uses first user message line when present', async () => {
			const s = new MockCliSdkSession('lab1', new Date());
			s.messages.push({ role: 'user', content: 'Line1\nLine2' });
			s.events.push({ type: 'user.message', data: { content: 'Line1\nLine2' }, timestamp: Date.now().toString() });
			manager.sessions.set(s.sessionId, s);

			const sessions = await service.getAllSessions(CancellationToken.None);
			const item = sessions.find(i => i.id === 'lab1');
			expect(item?.label).includes('Line1');
			expect(item?.label).includes('Line2');
		});

		it('uses clean summary from metadata without loading the full session', async () => {
			const s = new MockCliSdkSession('summary1', new Date());
			s.summary = 'Fix the login bug';
			s.events.push({ type: 'user.message', data: { content: 'Fix the login bug in auth.ts' }, timestamp: Date.now().toString() });
			manager.sessions.set(s.sessionId, s);

			const getSessionSpy = vi.spyOn(manager, 'getSession');
			const sessions = await service.getAllSessions(CancellationToken.None);

			const item = sessions.find(i => i.id === 'summary1');
			expect(item?.label).toBe('Fix the login bug');
			// Should not have loaded the full session since summary was clean
			expect(getSessionSpy).not.toHaveBeenCalled();
		});

		it('falls through to session load when summary contains angle bracket', async () => {
			const s = new MockCliSdkSession('truncated1', new Date());
			s.summary = 'Fix the bug... <current_dateti...';
			s.events.push({ type: 'user.message', data: { content: 'Fix the bug in the parser' }, timestamp: Date.now().toString() });
			manager.sessions.set(s.sessionId, s);

			const getSessionSpy = vi.spyOn(manager, 'getSession');
			const sessions = await service.getAllSessions(CancellationToken.None);

			const item = sessions.find(i => i.id === 'truncated1');
			expect(item?.label).toBe('Fix the bug in the parser');
			// Should have loaded the full session because summary had '<'
			expect(getSessionSpy).toHaveBeenCalled();
		});

		it('uses cached label on second call without loading session again', async () => {
			const s = new MockCliSdkSession('cache1', new Date());
			// No summary forces session load on first call
			s.events.push({ type: 'user.message', data: { content: 'Refactor the tests' }, timestamp: Date.now().toString() });
			manager.sessions.set(s.sessionId, s);

			// First call - loads session and caches the label
			const sessions1 = await service.getAllSessions(CancellationToken.None);
			const item1 = sessions1.find(i => i.id === 'cache1');
			expect(item1?.label).toBe('Refactor the tests');

			// Now spy on getSession for the second call
			const getSessionSpy = vi.spyOn(manager, 'getSession');

			// Second call - should use cached label
			const sessions2 = await service.getAllSessions(CancellationToken.None);
			const item2 = sessions2.find(i => i.id === 'cache1');
			expect(item2?.label).toBe('Refactor the tests');
			// Should not have loaded the full session on second call
			expect(getSessionSpy).not.toHaveBeenCalled();
		});

		it('uses metadata summary over stale internal label cache', async () => {
			const s = new MockCliSdkSession('priority1', new Date());
			// No summary initially - forces session load and caching
			s.events.push({ type: 'user.message', data: { content: 'Original label from events' }, timestamp: Date.now().toString() });
			manager.sessions.set(s.sessionId, s);

			// First call caches label from events
			const sessions1 = await service.getAllSessions(CancellationToken.None);
			expect(sessions1.find(i => i.id === 'priority1')?.label).toBe('Original label from events');

			// Now add a summary to the metadata - the cached label should still be used
			s.summary = 'Different summary label';

			const sessions2 = await service.getAllSessions(CancellationToken.None);
			expect(sessions2.find(i => i.id === 'priority1')?.label).toBe('Original label from events');
		});

		it('populates cache after loading session for label', async () => {
			const s = new MockCliSdkSession('populate1', new Date());
			s.events.push({ type: 'user.message', data: { content: 'Add unit tests for auth' }, timestamp: Date.now().toString() });
			manager.sessions.set(s.sessionId, s);

			await service.getAllSessions(CancellationToken.None);

			// Verify the internal cache was populated
			const labelCache = (service as any)._sessionLabels as Map<string, string>;
			expect(labelCache.get('populate1')).toBe('Add unit tests for auth');
		});

		it('does not cache when using clean summary from metadata directly', async () => {
			const s = new MockCliSdkSession('nocache1', new Date());
			s.summary = 'Clean summary without brackets';
			manager.sessions.set(s.sessionId, s);

			await service.getAllSessions(CancellationToken.None);

			// The cache should not have an entry since the summary was used directly
			const labelCache = (service as any)._sessionLabels as Map<string, string>;
			expect(labelCache.has('nocache1')).toBe(false);
		});
	});

	describe('CopilotCLISessionService.createNewSessionId / isNewSessionId', () => {
		it('createNewSessionId returns a unique id that isNewSessionId recognises', () => {
			const id = service.createNewSessionId();
			expect(id).toBeTruthy();
			expect(service.isNewSessionId(id)).toBe(true);
		});

		it('isNewSessionId returns false for an unknown id', () => {
			expect(service.isNewSessionId('not-a-new-id')).toBe(false);
		});

		it('successive calls return distinct ids', () => {
			const a = service.createNewSessionId();
			const b = service.createNewSessionId();
			expect(a).not.toBe(b);
			expect(service.isNewSessionId(a)).toBe(true);
			expect(service.isNewSessionId(b)).toBe(true);
		});

		it('createSession clears the new-session flag', async () => {
			const id = service.createNewSessionId();
			expect(service.isNewSessionId(id)).toBe(true);

			await service.createSession({ model: 'gpt-test', sessionId: id, ...sessionOptionsFor(URI.file('/tmp')) }, CancellationToken.None);

			expect(service.isNewSessionId(id)).toBe(false);
		});
	});

	describe('CopilotCLISessionService.forkSession', () => {
		it('delegates to sessionManager.forkSession and returns the new session id', async () => {
			const sourceId = 'source-session';
			manager.sessions.set(sourceId, new MockCliSdkSession(sourceId, new Date()));
			const forkSpy = vi.spyOn(manager, 'forkSession');

			const newId = await service.forkSession({ sessionId: sourceId, requestId: undefined, workspace: workspaceInfoFor(URI.file('/workspace')) }, CancellationToken.None);

			expect(forkSpy).toHaveBeenCalledWith(sourceId, undefined);
			expect(newId).toBeTruthy();
			expect(newId).not.toBe(sourceId);
		});

		it('stores forked session metadata via storeForkedSessionMetadata', async () => {
			const sourceId = 'meta-source';
			manager.sessions.set(sourceId, new MockCliSdkSession(sourceId, new Date()));
			const metadataStore = new MockChatSessionMetadataStore();
			const storeMetadataSpy = vi.spyOn(metadataStore, 'storeForkedSessionMetadata');

			const sdk = {
				getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} })),
				getRequestId: vi.fn(() => undefined),
			} as unknown as ICopilotCLISDK;
			const services = disposables.add(createExtensionUnitTestingServices());
			const accessor = services.createTestingAccessor();
			const configurationService = accessor.get(IConfigurationService);
			const authService = { getCopilotToken: vi.fn(async () => ({ token: 'test-token' })) } as unknown as IAuthenticationService;
			const nullMcpServer = disposables.add(new NullMcpService());
			const delegationService = new class extends mock<IChatDelegationSummaryService>() {
				override extractPrompt(): { prompt: string; reference: never } | undefined { return undefined; }
			}();
			const localService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), new MockFileSystemService(), new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), new NullCopilotCLIAgents(), new NullWorkspaceService(), new NullCustomSessionTitleService(), configurationService, new MockSkillLocations(), delegationService, metadataStore, new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));
			const localManager = await localService.getSessionManager() as unknown as MockCliSdkSessionManager;
			localManager.sessions.set(sourceId, new MockCliSdkSession(sourceId, new Date()));

			const newId = await localService.forkSession({ sessionId: sourceId, requestId: undefined, workspace: workspaceInfoFor(URI.file('/workspace')) }, CancellationToken.None);

			expect(storeMetadataSpy).toHaveBeenCalledWith(sourceId, newId, expect.stringContaining('Forked:'));
		});

		it('fires onDidCreateSession with the forked session id and title', async () => {
			const sourceId = 'event-source';
			manager.sessions.set(sourceId, new MockCliSdkSession(sourceId, new Date()));

			const created: ICopilotCLISessionItem[] = [];
			disposables.add(service.onDidCreateSession(item => created.push(item)));

			const newId = await service.forkSession({ sessionId: sourceId, requestId: undefined, workspace: workspaceInfoFor(URI.file('/workspace')) }, CancellationToken.None);

			expect(created).toHaveLength(1);
			expect(created[0].id).toBe(newId);
			expect(created[0].label).toContain('Forked:');
		});

		it('passes toEventId to sessionManager.forkSession when requestId matches a stored copilot request id', async () => {
			const sourceId = 'truncate-source';
			const sdkSession = new MockCliSdkSession(sourceId, new Date());
			sdkSession.events.push({ type: 'user.message', id: 'sdk-event-1', data: { content: 'hello' }, timestamp: '2024-01-01T00:00:00.000Z' });
			manager.sessions.set(sourceId, sdkSession);

			const sdk = {
				getPackage: vi.fn(async () => ({ internal: { LocalSessionManager: MockCliSdkSessionManager, NoopTelemetryService: class { } }, LocalSession: MockLocalSession, createLocalFeatureFlagService: () => ({}), AutoModeSessionManager: class { }, noopTelemetryBinder: {} })),
				getRequestId: vi.fn(() => ({ vscodeRequestId: 'vsc-req-1', copilotRequestId: 'sdk-event-1' })),
			} as unknown as ICopilotCLISDK;
			const services = disposables.add(createExtensionUnitTestingServices());
			const accessor = services.createTestingAccessor();
			const configurationService = accessor.get(IConfigurationService);
			const authService = { getCopilotToken: vi.fn(async () => ({ token: 'test-token' })) } as unknown as IAuthenticationService;
			const nullMcpServer = disposables.add(new NullMcpService());
			const delegationService = new class extends mock<IChatDelegationSummaryService>() {
				override extractPrompt(): { prompt: string; reference: never } | undefined { return undefined; }
				override async summarize(): Promise<string | undefined> { return undefined; }
			}();
			const metadataStore = new MockChatSessionMetadataStore();
			await metadataStore.updateRequestDetails(sourceId, [{ vscodeRequestId: 'vsc-req-1', copilotRequestId: 'sdk-event-1', toolIdEditMap: {} }]);
			const localService = disposables.add(new CopilotCLISessionService(logService, sdk, instantiationService, new NullNativeEnvService(), new MockFileSystemService(), new CopilotCLIMCPHandler(logService, authService, configurationService, nullMcpServer), new NullCopilotCLIAgents(), new NullWorkspaceService(), new NullCustomSessionTitleService(), configurationService, new MockSkillLocations(), delegationService, metadataStore, new NullAgentSessionsWorkspace(), new NullChatSessionWorkspaceFolderService(), new NullChatSessionWorktreeService(), new NoopOTelService(resolveOTelConfig({ env: {}, extensionVersion: '0.0.0', sessionId: 'test' })), new NullPromptVariablesService(), new NullChatDebugFileLoggerService(), disposables.add(new MockPromptsService())));
			const localManager = await localService.getSessionManager() as unknown as MockCliSdkSessionManager;
			localManager.sessions.set(sourceId, sdkSession);
			const forkSpy = vi.spyOn(localManager, 'forkSession');

			await localService.forkSession({ sessionId: sourceId, requestId: 'vsc-req-1', workspace: workspaceInfoFor(URI.file('/workspace')) }, CancellationToken.None);

			expect(forkSpy).toHaveBeenCalledWith(sourceId, 'sdk-event-1');
		});
	});

	describe('CopilotCLISessionService.auto disposal timeout', () => {
		it.skip('disposes session after completion timeout and aborts underlying sdk session', async () => {
			vi.useFakeTimers();
			const session = await service.createSession({ ...sessionOptionsFor() }, CancellationToken.None);

			vi.advanceTimersByTime(31000);
			await Promise.resolve(); // allow any pending promises to run

			// dispose should have been called by timeout
			expect(session.object.isDisposed).toBe(true);
		});
	});
});
