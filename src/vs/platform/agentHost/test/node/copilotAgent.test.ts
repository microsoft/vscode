/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotClient, CopilotSession, ModelInfo, SessionEventPayload, SessionEventType, TypedSessionEventHandler } from '@github/copilot-sdk';
import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, type DisposableStore, type IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { Schemas } from '../../../../base/common/network.js';
import { waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostConfigKey } from '../../common/agentHostCustomizationConfig.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, GITHUB_COPILOT_PROTECTED_RESOURCE, type AgentSignal, type IAgentActionSignal, type IAgentSessionMetadata } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildSubagentSessionUri, CustomizationLoadStatus, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, TurnState, customizationId, type ClientPluginCustomization, type MarkdownResponsePart, type PluginCustomization, type ToolCallResult, type Turn, RuleCustomization } from '../../common/state/sessionState.js';
import { CustomizationType, type ToolDefinition } from '../../common/state/protocol/state.js';
import { ActionType, type IDeltaAction, type SessionAction } from '../../common/state/sessionActions.js';

import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';
import { AgentHostCompletions, IAgentHostCompletions } from '../../node/agentHostCompletions.js';
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE, CopilotAgent, getCopilotBranchNameHintFromMessage, getCopilotWorktreeBranchName, getCopilotWorktreeName, getCopilotWorktreesRoot } from '../../node/copilot/copilotAgent.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { CopilotAgentSession } from '../../node/copilot/copilotAgentSession.js';
import type { CopilotSessionLaunchPlan, IActiveClientSnapshot } from '../../node/copilot/copilotSessionLauncher.js';
import { ShellManager } from '../../node/copilot/copilotShellTools.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';
import { ActiveClientState } from '../../node/activeClientState.js';

class TestAgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	readonly basePath = URI.from({ scheme: 'inmemory', path: '/agentPlugins' });

	async syncCustomizations(_clientId: string, _customizations: ClientPluginCustomization[], _progress?: (status: PluginCustomization) => void): Promise<ISyncedCustomization[]> {
		return [];
	}
}

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	repositoryRoot: URI | undefined = undefined;
	addedWorktrees: { repositoryRoot: URI; worktree: URI; branchName: string; startPoint: string }[] = [];
	addedExistingWorktrees: { repositoryRoot: URI; worktree: URI; branchName: string }[] = [];
	removedWorktrees: { repositoryRoot: URI; worktree: URI }[] = [];
	existingBranches = new Set<string>();
	dirtyWorkingDirectories = new Set<string>();

	async isInsideWorkTree(): Promise<boolean> { return false; }
	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<string | undefined> { return undefined; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void> {
		this.addedWorktrees.push({ repositoryRoot, worktree, branchName, startPoint });
		this.existingBranches.add(branchName);
	}
	async addExistingWorktree(repositoryRoot: URI, worktree: URI, branchName: string): Promise<void> {
		this.addedExistingWorktrees.push({ repositoryRoot, worktree, branchName });
	}
	async removeWorktree(repositoryRoot: URI, worktree: URI): Promise<void> {
		this.removedWorktrees.push({ repositoryRoot, worktree });
	}
	async branchExists(_repositoryRoot: URI, branchName: string): Promise<boolean> {
		return this.existingBranches.has(branchName);
	}
	async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {
		return this.dirtyWorkingDirectories.has(workingDirectory.fsPath);
	}
	async commitAll(): Promise<void> { }
	async hasUpstream(): Promise<boolean> { return false; }
	async pushBranch(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<undefined> { return undefined; }
	async showBlob(): Promise<undefined> { return undefined; }
	async captureWorkingTreeAsTree(): Promise<undefined> { return undefined; }
	async commitTree(): Promise<undefined> { return undefined; }
	async updateRef(): Promise<void> { }
	async deleteRefs(): Promise<void> { }
	async revParse(): Promise<undefined> { return undefined; }
	async computeFileDiffsBetweenRefs(): Promise<undefined> { return undefined; }
}

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	async createTerminal(): Promise<void> { }
	writeInput(): void { }
	async sendText(): Promise<void> { }
	onData(): IDisposable { return Disposable.None; }
	onExit(): IDisposable { return Disposable.None; }
	onClaimChanged(): IDisposable { return Disposable.None; }
	onCommandFinished(): IDisposable { return Disposable.None; }
	createAltBufferPromise(_uri: string, _store: DisposableStore): Promise<void> { return new Promise(() => { }); }
	getContent(): string | undefined { return undefined; }
	getClaim(): undefined { return undefined; }
	hasTerminal(): boolean { return false; }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return false; }
	disposeTerminal(): void { }
	getTerminalInfos(): [] { return []; }
	getTerminalState(): undefined { return undefined; }
	async getDefaultShell(): Promise<string> { return '/bin/bash'; }
}

class TestSessionDataService extends Disposable implements ISessionDataService {
	declare readonly _serviceBrand: undefined;

	private readonly _databases = new Map<string, SessionDatabase>();
	readonly openedSessions: string[] = [];

	getSessionDataDir(session: URI): URI { return URI.from({ scheme: 'test', path: `/session-data/${AgentSession.id(session)}` }); }
	getSessionDataDirById(sessionId: string): URI { return URI.from({ scheme: 'test', path: `/session-data/${sessionId}` }); }

	openDatabase(session: URI): IReference<SessionDatabase> {
		const sessionId = AgentSession.id(session);
		this.openedSessions.push(sessionId);
		let db = this._databases.get(sessionId);
		if (!db) {
			db = this._register(new SessionDatabase(':memory:'));
			this._databases.set(sessionId, db);
		}
		return { object: db, dispose: () => { } };
	}

	async tryOpenDatabase(session: URI): Promise<IReference<SessionDatabase> | undefined> {
		const db = this._databases.get(AgentSession.id(session));
		return db ? { object: db, dispose: () => { } } : undefined;
	}

	deleteSessionData(): Promise<void> { return Promise.resolve(); }
	readonly onWillDeleteSessionData = Event.None;
	cleanupOrphanedData(): Promise<void> { return Promise.resolve(); }
	whenIdle(): Promise<void> { return Promise.resolve(); }
}

interface ITestCopilotModelInfo {
	readonly id: string;
	readonly name: string;
	readonly capabilities?: {
		readonly supports?: { readonly vision?: boolean };
		readonly limits?: { readonly max_context_window_tokens?: number };
	};
	readonly policy?: { readonly state?: NonNullable<ModelInfo['policy']>['state'] };
	readonly billing?: ModelInfo['billing'] & {
		readonly tokenPrices?: {
			readonly contextMax?: number;
			readonly longContext?: { readonly contextMax?: number; readonly inputPrice?: number; readonly outputPrice?: number };
		};
	};
	readonly supportedReasoningEfforts?: ModelInfo['supportedReasoningEfforts'];
	readonly defaultReasoningEffort?: ModelInfo['defaultReasoningEffort'];
}

interface ITestCopilotClient extends Pick<CopilotClient, 'start' | 'stop' | 'listSessions' | 'listModels' | 'createSession' | 'resumeSession' | 'getSessionMetadata' | 'deleteSession'> {
	readonly rpc: { readonly sessions: { readonly fork: CopilotClient['rpc']['sessions']['fork'] } };
}

function toSdkModelInfo(model: ITestCopilotModelInfo): ModelInfo {
	return {
		id: model.id,
		name: model.name,
		capabilities: {
			supports: {
				vision: model.capabilities?.supports?.vision ?? false,
				reasoningEffort: !!model.supportedReasoningEfforts?.length,
			},
			limits: {
				max_context_window_tokens: model.capabilities?.limits?.max_context_window_tokens ?? 0,
			},
		},
		...(model.policy ? { policy: { state: model.policy.state ?? 'enabled', terms: '' } } : {}),
		...(model.billing ? { billing: model.billing } : {}),
		...(model.supportedReasoningEfforts ? { supportedReasoningEfforts: model.supportedReasoningEfforts } : {}),
		...(model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
	};
}

class TestCopilotClient implements ITestCopilotClient {
	readonly rpc: ITestCopilotClient['rpc'] = { sessions: { fork: async () => ({ sessionId: 'forked-session' }) } };
	listSessionCallCount = 0;
	readonly getSessionMetadataCalls: string[] = [];
	readonly deletedSessionIds: string[] = [];

	constructor(
		private readonly _sessions: Awaited<ReturnType<ITestCopilotClient['listSessions']>>,
		private readonly _models: readonly ITestCopilotModelInfo[] = [],
	) { }

	async start(): Promise<void> { }
	async stop(): ReturnType<ITestCopilotClient['stop']> { return []; }
	async listSessions(): ReturnType<ITestCopilotClient['listSessions']> {
		this.listSessionCallCount++;
		return this._sessions;
	}
	async listModels(): ReturnType<ITestCopilotClient['listModels']> { return this._models.map(toSdkModelInfo); }
	async getSessionMetadata(sessionId: string): ReturnType<ITestCopilotClient['getSessionMetadata']> {
		this.getSessionMetadataCalls.push(sessionId);
		return this._sessions.find(s => s.sessionId === sessionId);
	}
	async deleteSession(sessionId: string): Promise<void> {
		this.deletedSessionIds.push(sessionId);
	}
	createSession: ITestCopilotClient['createSession'] = async () => { throw new Error('not implemented'); };
	resumeSession: ITestCopilotClient['resumeSession'] = async () => { throw new Error('not implemented'); };
}

interface IFakeAgentSession {
	send: (prompt: string, attachments?: unknown, turnId?: string, announcement?: string) => Promise<void>;
	getMessages: () => Promise<readonly Turn[]>;
	dispose: () => void;
}

class MockCopilotSession {
	readonly sessionId = 'test-session-1';

	on<K extends SessionEventType>(_eventType: K, _handler: TypedSessionEventHandler<K>): () => void {
		return () => { };
	}

	async send(): Promise<string> { return ''; }
	async abort(): Promise<void> { }
	async setModel(): Promise<void> { }
	async getEvents(): Promise<SessionEventPayload<SessionEventType>[]> { return []; }
	async disconnect(): Promise<void> { }
}

class TestSdkError extends Error {
	constructor(message: string, readonly code: number) {
		super(message);
	}
}

class MockAgentHostOTelService implements IAgentHostOTelService {
	readonly _serviceBrand: undefined;

	async getSdkTelemetryConfig() {
		return undefined;
	}
	getSpansDbPath() {
		return undefined;
	}
	async flush() {
		//
	}
}

class ResumePathCopilotAgent extends CopilotAgent {
	constructor(
		private readonly _copilotClient: ITestCopilotClient,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@IAgentHostCompletions completions: IAgentHostCompletions,
	) {
		super(logService, instantiationService, sessionDataService, gitService, configurationService, new MockAgentHostOTelService(), completions, NULL_CHECKPOINT_SERVICE);
		this._enablePlanModeOnClient(this._copilotClient as CopilotClient);
	}

	protected override _createCopilotClient(): CopilotClient {
		return this._copilotClient as CopilotClient;
	}
}

class TestableCopilotAgent extends CopilotAgent {
	private readonly _fakeSessions = new Map<string, IFakeAgentSession>();
	readonly resumeCalls: string[] = [];

	constructor(
		private readonly _copilotClient: ITestCopilotClient,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
		@IAgentHostCompletions completions: IAgentHostCompletions,
	) {
		super(logService, instantiationService, sessionDataService, gitService, configurationService, new MockAgentHostOTelService(), completions, NULL_CHECKPOINT_SERVICE);
		this._enablePlanModeOnClient(this._copilotClient as CopilotClient);
	}

	protected override _createCopilotClient(): CopilotClient {
		return this._copilotClient as CopilotClient;
	}

	registerFakeSession(sessionId: string, fake: IFakeAgentSession): void {
		this._fakeSessions.set(sessionId, fake);
	}

	protected override async _resumeSession(sessionId: string): Promise<CopilotAgentSession> {
		this.resumeCalls.push(sessionId);
		const fake = this._fakeSessions.get(sessionId);
		if (!fake) {
			throw new Error(`No fake session registered for '${sessionId}'`);
		}
		const sessionUri = AgentSession.uri('copilotcli', sessionId);
		const emitter = (this as unknown as { _onDidSessionProgress: { fire(s: AgentSignal): void } })._onDidSessionProgress;
		let turnId = '';
		// `_sessions` is a DisposableMap, so it will dispose() the entry on
		// teardown. The fields below are the only ones touched by sendMessage
		// and getSessionMessages in the code under test.
		const stub = {
			send: fake.send,
			getMessages: fake.getMessages,
			appliedSnapshot: undefined,
			dispose: fake.dispose,
			resetTurnState: (newTurnId: string) => { turnId = newTurnId; },
			emitInitialMarkdown: (content: string) => {
				emitter.fire({
					kind: 'action',
					session: sessionUri,
					action: {
						type: ActionType.SessionResponsePart,
						turnId,
						part: { kind: ResponsePartKind.Markdown, id: `synth-${Date.now()}`, content },
					},
				});
			},
		} as unknown as CopilotAgentSession;
		return stub;
	}

	resolveWorktreeForTest(config: Parameters<CopilotAgent['createSession']>[0], sessionId: string, prompt?: string): Promise<URI | undefined> {
		return this._resolveSessionWorkingDirectory(config, sessionId, prompt);
	}
}

function createTestAgentContext(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ITestCopilotClient; useRealResumePath?: boolean; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager; fileService?: FileService }): { agent: CopilotAgent; instantiationService: IInstantiationService; configurationService: IAgentConfigurationService; fileService: FileService } {
	const services = new ServiceCollection();
	const logService = new NullLogService();
	const fileService = options?.fileService ?? disposables.add(new FileService(logService));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	services.set(ILogService, logService);
	services.set(IFileService, fileService);
	services.set(IAgentConfigurationService, configService);
	services.set(ISessionDataService, options?.sessionDataService ?? createNullSessionDataService());
	services.set(IAgentPluginManager, options?.pluginManager ?? new TestAgentPluginManager());
	services.set(IAgentHostGitService, options?.gitService ?? new TestAgentHostGitService());
	services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
	services.set(IAgentHostOTelService, {
		_serviceBrand: undefined,
		getSdkTelemetryConfig: async () => undefined,
		getSpansDbPath: () => undefined,
		flush: async () => undefined,
	});
	services.set(IAgentHostCompletions, disposables.add(new AgentHostCompletions(logService)));
	services.set(ITelemetryService, NullTelemetryService);
	if (options?.environmentServiceRegistration !== 'none') {
		const environmentService = {
			_serviceBrand: undefined,
			userHome: URI.file('/mock-home'),
		} as INativeEnvironmentService;
		services.set(INativeEnvironmentService, environmentService);
	}
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	services.set(IInstantiationService, instantiationService);
	const agent = options?.copilotClient
		? instantiationService.createInstance(options.useRealResumePath ? ResumePathCopilotAgent : TestableCopilotAgent, options.copilotClient)
		: instantiationService.createInstance(CopilotAgent);
	return { agent, instantiationService, configurationService: configService, fileService };
}

function createTestAgent(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ITestCopilotClient; useRealResumePath?: boolean; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager }): CopilotAgent {
	return createTestAgentContext(disposables, options).agent;
}

type CopilotCreateSessionOptions = Parameters<CopilotClient['createSession']>[0];

function createAgentSessionThroughAgent(agent: CopilotAgent, instantiationService: IInstantiationService): { readonly session: CopilotAgentSession; readonly createOptions: () => CopilotCreateSessionOptions | undefined } {
	const sessionUri = AgentSession.uri('copilotcli', 'test-session-1');
	const shellManager = instantiationService.createInstance(ShellManager, sessionUri, undefined);
	let createOptions: CopilotCreateSessionOptions | undefined;
	const launchPlan: CopilotSessionLaunchPlan = {
		kind: 'create',
		client: {
			createSession: async options => {
				createOptions = options;
				return new MockCopilotSession() as unknown as CopilotSession;
			},
			resumeSession: async () => new MockCopilotSession() as unknown as CopilotSession,
		},
		activeClientState: new ActiveClientState(),
		sessionId: 'test-session-1',
		workingDirectory: undefined,
		resolvedAgentName: undefined,
		snapshot: { tools: [], plugins: [] },
		shellManager,
		githubToken: 'token',
		model: undefined,
	};
	const session = (agent as unknown as {
		_createAgentSession: (launchPlan: CopilotSessionLaunchPlan, customizationDirectory: URI | undefined) => CopilotAgentSession;
	})._createAgentSession(launchPlan, undefined);
	return { session, createOptions: () => createOptions };
}

function withoutUndefinedProperties(metadata: IAgentSessionMetadata): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(metadata)) {
		if (value !== undefined) {
			result[key] = value;
		}
	}
	return result;
}

function sdkSession(sessionId: string, cwd?: string): Awaited<ReturnType<ITestCopilotClient['listSessions']>>[number] {
	return {
		sessionId,
		startTime: new Date(1000),
		modifiedTime: new Date(2000),
		summary: `SDK ${sessionId}`,
		isRemote: false,
		...(cwd ? { context: { workingDirectory: cwd } } : {}),
	};
}

async function disposeAgent(agent: CopilotAgent): Promise<void> {
	await agent.shutdown();
	agent.dispose();
	// CopilotAgent.dispose calls super.dispose() from a promise continuation so
	// async shutdown can stop SDK sessions before child disposables are released.
	// Let that continuation run before the disposable leak tracker checks.
	await Promise.resolve();
}

suite('CopilotAgent', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the Copilot CLI sibling worktrees root convention', () => {
		assert.strictEqual(
			getCopilotWorktreesRoot(URI.file('/Users/me/src/vscode')).fsPath,
			URI.file('/Users/me/src/vscode.worktrees').fsPath,
		);
	});

	test('uses Agents-window Copilot CLI branch prefix', () => {
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', 'add-agent-host-config'), 'agents/add-agent-host-config-12345678');
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', undefined), 'agents/12345678-aaaa-bbbb-cccc-123456789abc');
	});

	test('uses Git extension branch-derived worktree folder names', () => {
		assert.strictEqual(getCopilotWorktreeName('agents/add-agent-host-config-12345678'), 'agents-add-agent-host-config-12345678');
	});

	test('keeps hinted branch names short', () => {
		assert.strictEqual(getCopilotWorktreeBranchName('12345678-aaaa-bbbb-cccc-123456789abc', 'a'.repeat(48)).length, 'agents/'.length + 48 + '-12345678'.length);
	});

	test('derives slug branch hint from first message', () => {
		assert.strictEqual(getCopilotBranchNameHintFromMessage('Add agent host config'), 'add-agent-host-config');
		assert.strictEqual(getCopilotBranchNameHintFromMessage('  Fix: the bug!! '), 'fix-the-bug');
		assert.strictEqual(getCopilotBranchNameHintFromMessage('Refactor café ☕ rendering'), 'refactor-cafe-rendering');
		assert.strictEqual(getCopilotBranchNameHintFromMessage('one two three four five six seven eight nine ten'), 'one-two-three-four-five-six-seven-eight');
		assert.strictEqual(getCopilotBranchNameHintFromMessage('a'.repeat(100))?.length, 48);
		assert.strictEqual(getCopilotBranchNameHintFromMessage('!!! ??? ...'), undefined);
		assert.strictEqual(getCopilotBranchNameHintFromMessage(''), undefined);
	});

	test('returns empty models and throws AuthRequired for sessions before authentication', async () => {
		const agent = createTestAgent(disposables);
		try {
			assert.deepStrictEqual(agent.models.get(), []);
			await assert.rejects(
				() => agent.listSessions(),
				(error: Error) => error instanceof ProtocolError && error.code === AHP_AUTH_REQUIRED,
			);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('requires authentication before creating a session', async () => {
		const agent = createTestAgent(disposables);
		try {
			await assert.rejects(
				() => agent.createSession({ workingDirectory: URI.file('/workspace') }),
				(error: Error) => error instanceof ProtocolError && error.code === AHP_AUTH_REQUIRED,
			);
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('restart on startup config change', () => {

		class StopCountingClient extends TestCopilotClient {
			stopCount = 0;
			override async stop(): ReturnType<ITestCopilotClient['stop']> {
				this.stopCount++;
				return super.stop();
			}
		}

		test('restarts the idle client when the rubber duck config changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				// Force the client to start so a subsequent config change has something to restart.
				await agent.listSessions();

				configurationService.updateRootConfig({ [AgentHostConfigKey.RubberDuck]: true });
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 1);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('restarts and disposes active sessions when the config changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				let disposed = false;
				const sessions = (agent as unknown as { _sessions: { set(k: string, v: { dispose(): void }): void } })._sessions;
				sessions.set('active', { dispose() { disposed = true; } });

				configurationService.updateRootConfig({ [AgentHostConfigKey.RubberDuck]: true });
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 1);
				assert.strictEqual(disposed, true);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not restart when an unrelated config key changes', async () => {
			const client = new StopCountingClient([]);
			const { agent, configurationService } = createTestAgentContext(disposables, { copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.listSessions();

				configurationService.updateRootConfig({ [AgentHostConfigKey.EnableCustomTerminalTool]: true });
				await Promise.resolve();

				assert.strictEqual(client.stopCount, 0);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	test('models include billing multiplier metadata when SDK provides it', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'gpt-4o',
				name: 'GPT-4o',
				billing: { multiplier: 1.5 },
				capabilities: { limits: { max_context_window_tokens: 128000 }, supports: { vision: true } },
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			assert.deepStrictEqual(models, [{
				provider: 'copilotcli',
				id: 'gpt-4o',
				name: 'GPT-4o',
				maxContextWindow: 128000,
				supportsVision: true,
				configSchema: undefined,
				policyState: undefined,
				_meta: { multiplierNumeric: 1.5 },
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema emits a thinkingLevel property when the model advertises reasoning efforts', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'o3',
				name: 'o3',
				capabilities: { limits: { max_context_window_tokens: 128000 } },
				supportedReasoningEfforts: ['low', 'medium', 'high'],
				defaultReasoningEffort: 'medium',
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			const schema = models[0].configSchema;
			assert.deepStrictEqual(schema?.properties.thinkingLevel?.enum, ['low', 'medium', 'high']);
			assert.strictEqual(schema?.properties.thinkingLevel?.default, 'medium');
			assert.strictEqual(schema?.properties.contextTier, undefined);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema emits a contextTier property when long_context tier exceeds default', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [{
				id: 'claude-sonnet',
				name: 'Claude Sonnet',
				capabilities: { limits: { max_context_window_tokens: 200_000 } },
				billing: {
					multiplier: 1,
					tokenPrices: {
						contextMax: 200_000,
						longContext: { contextMax: 1_000_000, inputPrice: 2 },
					},
				},
			}]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			const contextTier = models[0].configSchema?.properties.contextTier;
			assert.deepStrictEqual(contextTier?.enum, ['default', 'long_context']);
			assert.strictEqual(contextTier?.default, 'default');
			assert.deepStrictEqual(contextTier?.enumLabels, ['200K', '1M']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('configSchema omits contextTier when long_context tier is missing or not larger', async () => {
		const agent = createTestAgent(disposables, {
			copilotClient: new TestCopilotClient([], [
				{
					id: 'no-long-context',
					name: 'No Long Context',
					billing: { multiplier: 1, tokenPrices: { contextMax: 200_000 } },
				},
				{
					id: 'equal-long-context',
					name: 'Equal Long Context',
					billing: {
						multiplier: 1,
						tokenPrices: { contextMax: 200_000, longContext: { contextMax: 200_000 } },
					},
				},
			]),
		});
		try {
			await agent.authenticate('https://api.github.com', 'token');
			const models = await waitForState(agent.models, models => models.length > 0);

			assert.strictEqual(models[0].configSchema, undefined);
			assert.strictEqual(models[1].configSchema, undefined);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('agent-created sessions can resolve session-state paths via INativeEnvironmentService', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, {
			environmentServiceRegistration: 'native',
			sessionDataService,
		});
		const previousXdgStateHome = process.env['XDG_STATE_HOME'];
		delete process.env['XDG_STATE_HOME'];
		try {
			const createdSession = createAgentSessionThroughAgent(agent, instantiationService);
			const agentSession = disposables.add(createdSession.session);
			await agentSession.initializeSession();
			const onPermissionRequest = createdSession.createOptions()?.onPermissionRequest;
			assert.ok(onPermissionRequest);

			const result = await onPermissionRequest({
				kind: 'read',
				intention: 'read plan',
				path: URI.file('/mock-home/.copilot/session-state/test-session-1/plan.md').fsPath,
				toolCallId: 'tc-read-plan-agent-composition',
			}, { sessionId: 'test-session-1' });

			assert.strictEqual(result.kind, 'approve-once');
		} finally {
			if (previousXdgStateHome === undefined) {
				delete process.env['XDG_STATE_HOME'];
			} else {
				process.env['XDG_STATE_HOME'] = previousXdgStateHome;
			}
			await disposeAgent(agent);
		}
	});

	test('listSessions only returns sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const ownedSession = AgentSession.uri('copilotcli', 'owned');
		const ownedDb = sessionDataService.openDatabase(ownedSession);
		ownedDb.dispose();

		const client = new TestCopilotClient([sdkSession('owned'), sdkSession('external')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual((await agent.listSessions()).map(s => AgentSession.id(s.session)), ['owned']);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listSessions reads stored metadata from sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const legacySession = AgentSession.uri('copilotcli', 'legacy');
		const legacyDb = sessionDataService.openDatabase(legacySession);
		await legacyDb.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		legacyDb.dispose();

		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession('legacy')]) });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual((await agent.listSessions()).map(withoutUndefinedProperties), [{
				session: legacySession,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK legacy',
				workingDirectory: URI.file('/workspace'),
			}]);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('getSessionMetadata reads one SDK session and stored metadata without listing sessions', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'target');
		const db = sessionDataService.openDatabase(session);
		await db.object.setMetadata('copilot.workingDirectory', URI.file('/workspace').toString());
		db.dispose();

		const client = new TestCopilotClient([sdkSession('target')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			const metadata = await agent.getSessionMetadata(session);
			assert.ok(metadata);
			assert.deepStrictEqual(withoutUndefinedProperties(metadata), {
				session,
				startTime: 1000,
				modifiedTime: 2000,
				summary: 'SDK target',
				workingDirectory: URI.file('/workspace'),
			});
			assert.deepStrictEqual(client.getSessionMetadataCalls, ['target']);
			assert.strictEqual(client.listSessionCallCount, 0);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('getSessionMetadata only returns sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const session = AgentSession.uri('copilotcli', 'external');
		const client = new TestCopilotClient([sdkSession('external', '/workspace')]);
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.strictEqual(await agent.getSessionMetadata(session), undefined);
			assert.deepStrictEqual(client.getSessionMetadataCalls, []);
			assert.strictEqual(client.listSessionCallCount, 0);
			assert.deepStrictEqual(sessionDataService.openedSessions, []);
		} finally {
			await disposeAgent(agent);
		}
	});

	test('listSessions does not create databases for unowned SDK sessions', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const agent = createTestAgent(disposables, { sessionDataService, copilotClient: new TestCopilotClient([sdkSession('external', '/workspace')]) });
		try {
			await agent.authenticate('https://api.github.com', 'token');

			assert.deepStrictEqual(await agent.listSessions(), []);
			assert.deepStrictEqual(sessionDataService.openedSessions, []);
		} finally {
			await disposeAgent(agent);
		}
	});

	suite('createSession activeClient eager-claim', () => {

		class SpyingPluginManager extends TestAgentPluginManager {
			public readonly calls: { clientId: string; customizations: ClientPluginCustomization[] }[] = [];

			override async syncCustomizations(clientId: string, customizations: ClientPluginCustomization[], _progress?: (status: PluginCustomization) => void): Promise<ISyncedCustomization[]> {
				this.calls.push({ clientId, customizations: [...customizations] });
				return [];
			}
		}

		test('createSession seeds activeClient tools and syncs customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			// `createSession` now creates a provisional record without
			// touching the SDK; activeClient seeding and plugin sync happen
			// inline before the provisional record is stored.
			client.createSession = async () => { throw new Error('SDK should not be touched on provisional create'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const customizations: ClientPluginCustomization[] = [{ type: CustomizationType.Plugin, id: customizationId('file:///plugin-a'), uri: 'file:///plugin-a', name: 'Plugin A', enabled: true }];
				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'test-session'),
					workingDirectory: URI.file('/workspace'),
					activeClient: {
						clientId: 'client-1',
						tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
						customizations,
					},
				});

				assert.strictEqual(result.provisional, true);
				assert.deepStrictEqual(pluginManager.calls, [{ clientId: 'client-1', customizations }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createSession without activeClient does not sync customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			client.createSession = async () => { throw new Error('SDK should not be touched on provisional create'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'test-session-2'),
					workingDirectory: URI.file('/workspace'),
				});

				assert.strictEqual(result.provisional, true);
				assert.deepStrictEqual(pluginManager.calls, []);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('setClientCustomizations publishes parsed agents in SessionCustomizationUpdated', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const pluginDir = URI.from({ scheme: Schemas.inMemory, path: '/plugin-a' });
			await fileService.createFolder(URI.joinPath(pluginDir, 'agents'));
			await fileService.writeFile(
				URI.joinPath(pluginDir, 'agents', 'helper.md'),
				VSBuffer.fromString('---\nname: helper-agent\ndescription: helps out\n---\nbody'),
			);

			class PluginDirSpyManager extends TestAgentPluginManager {
				override async syncCustomizations(_clientId: string, customizations: ClientPluginCustomization[]): Promise<ISyncedCustomization[]> {
					return customizations.map(c => ({
						customization: { ...c, load: { kind: CustomizationLoadStatus.Loaded } },
						pluginDir,
					}));
				}
			}

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new PluginDirSpyManager();
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, pluginManager, fileService });

			const actions: SessionAction[] = [];
			disposables.add(agent.onDidSessionProgress(s => {
				if (s.kind === 'action') {
					actions.push(s.action);
				}
			}));

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'sync-customizations-test');
				await agent.setClientCustomizations(session, 'client-1', [{ type: CustomizationType.Plugin, id: customizationId(pluginDir.toString()), uri: pluginDir.toString(), name: 'Plugin A', enabled: true }]);

				// Wait for the deferred resolution chain in PluginController.sync.
				await new Promise(r => setTimeout(r, 50));

				const updatesWithChildren = actions
					.filter(a => a.type === ActionType.SessionCustomizationUpdated)
					.filter((a): a is Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }> => true)
					.filter(a => (a.customization as PluginCustomization).children !== undefined);

				assert.strictEqual(updatesWithChildren.length > 0, true, 'expected SessionCustomizationUpdated to carry parsed children');
				const agentChildren = (updatesWithChildren.at(-1)!.customization as PluginCustomization).children!.filter(c => c.type === CustomizationType.Agent);
				assert.deepStrictEqual(agentChildren, [{
					type: CustomizationType.Agent,
					id: customizationId(URI.joinPath(pluginDir, 'agents', 'helper.md').toString()),
					uri: URI.joinPath(pluginDir, 'agents', 'helper.md').toString(),
					name: 'helper-agent',
					description: 'helps out',
				}]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations publishes discovered files as Directory customizations', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const agentContent = [
				'---',
				'name: helper',
				'description: helps out',
				'---',
				'agent body',
			];
			const instructionContent = [
				'---',
				'name: nested',
				'description: nested instructions',
				'applyTo: *.ts, *.js',
				'---',
				'instruction body',
			];


			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			await fileService.createFolder(URI.joinPath(workspace, '.github', 'agents'));
			await fileService.createFolder(URI.joinPath(workspace, '.github', 'instructions', 'team'));
			const agentFile = URI.joinPath(workspace, '.github', 'agents', 'helper.agent.md');
			const instructionFile = URI.joinPath(workspace, '.github', 'instructions', 'team', 'nested.instructions.md');
			await fileService.writeFile(agentFile, VSBuffer.fromString(agentContent.join('\n')));
			await fileService.writeFile(instructionFile, VSBuffer.fromString(instructionContent.join('\n')));
			const agentsMdFile = URI.joinPath(workspace, 'AGENTS.md');
			await fileService.writeFile(agentsMdFile, VSBuffer.fromString('agents md body'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-directories');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				const customizations = await agent.getSessionCustomizations(session);
				const discoveredDirectories = customizations.filter(customization => customization.type === CustomizationType.Directory);

				assert.strictEqual(discoveredDirectories.length, 3);
				assert.deepStrictEqual(discoveredDirectories.map(customization => customization.uri).sort(), [
					workspace.toString(),
					URI.joinPath(workspace, '.github', 'agents').toString(),
					URI.joinPath(workspace, '.github', 'instructions').toString(),
				].sort());

				const agentDirectory = discoveredDirectories.find(customization => customization.uri === URI.joinPath(workspace, '.github', 'agents').toString());
				assert.ok(agentDirectory);
				assert.strictEqual(agentDirectory.contents, CustomizationType.Agent);
				assert.deepStrictEqual(agentDirectory.children, [{
					type: CustomizationType.Agent,
					id: customizationId(agentFile.toString()),
					uri: agentFile.toString(),
					name: 'helper',
					description: 'helps out',
				}]);

				const instructionDirectory = discoveredDirectories.find(customization => customization.uri === URI.joinPath(workspace, '.github', 'instructions').toString());
				assert.ok(instructionDirectory);
				assert.strictEqual(instructionDirectory.contents, CustomizationType.Rule);
				assert.deepStrictEqual(instructionDirectory.children, [{
					type: CustomizationType.Rule,
					id: customizationId(instructionFile.toString()),
					uri: instructionFile.toString(),
					name: 'nested',
					description: 'nested instructions',
					globs: ['*.ts', '*.js'],
					alwaysApply: undefined,
				}]);

				const agentInstructionsDirectory = discoveredDirectories.find(customization => customization.uri === workspace.toString());
				assert.ok(agentInstructionsDirectory);
				assert.strictEqual(agentInstructionsDirectory.contents, CustomizationType.Rule);
				assert.deepStrictEqual(agentInstructionsDirectory.children, [{
					type: CustomizationType.Rule,
					id: customizationId(agentsMdFile.toString()),
					uri: agentsMdFile.toString(),
					name: 'AGENTS.md',
					alwaysApply: true,
				} satisfies RuleCustomization]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations clears discovered files when the root disappears', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			const agentsRoot = URI.joinPath(workspace, '.github', 'agents');
			await fileService.createFolder(agentsRoot);
			await fileService.writeFile(URI.joinPath(agentsRoot, 'helper.agent.md'), VSBuffer.fromString('agent body'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-cleared');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				const before = await agent.getSessionCustomizations(session);
				assert.deepStrictEqual(before.filter(customization => customization.type === CustomizationType.Directory).map(customization => customization.uri), [agentsRoot.toString()]);

				await fileService.del(agentsRoot, { recursive: true });

				let after = await agent.getSessionCustomizations(session);
				for (let i = 0; i < 20 && after.filter(customization => customization.type === CustomizationType.Directory).length > 0; i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					after = await agent.getSessionCustomizations(session);
				}
				assert.deepStrictEqual(after.filter(customization => customization.type === CustomizationType.Directory).map(customization => customization.uri), []);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations does not republish discovered directories when watcher changes are discovery-neutral', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			const agentsRoot = URI.joinPath(workspace, '.github', 'agents');
			await fileService.createFolder(agentsRoot);
			await fileService.writeFile(URI.joinPath(agentsRoot, 'helper.agent.md'), VSBuffer.fromString('agent body'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			const actions: SessionAction[] = [];
			disposables.add(agent.onDidSessionProgress(progress => {
				if (progress.kind === 'action') {
					actions.push(progress.action);
				}
			}));

			const countDirectoryPublishesForAgentsRoot = (): number => actions.filter(action => {
				if (action.type === ActionType.SessionCustomizationUpdated) {
					const customization = (action as Extract<SessionAction, { type: ActionType.SessionCustomizationUpdated }>).customization;
					return customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString();
				}
				if (action.type === ActionType.SessionCustomizationsChanged) {
					const customizations = (action as Extract<SessionAction, { type: ActionType.SessionCustomizationsChanged }>).customizations;
					return customizations.some(customization => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString());
				}
				return false;
			}).length;

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-neutral-watcher-change');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				await agent.getSessionCustomizations(session);
				await new Promise(resolve => setTimeout(resolve, 50));
				const publishCountBefore = countDirectoryPublishesForAgentsRoot();

				// README.md is intentionally excluded from discovered agents.
				await fileService.writeFile(URI.joinPath(agentsRoot, 'README.md'), VSBuffer.fromString('ignored'));

				for (let i = 0; i < 20; i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					assert.strictEqual(countDirectoryPublishesForAgentsRoot(), publishCountBefore, 'expected no republish when discovery output is unchanged');
				}

				const after = await agent.getSessionCustomizations(session);
				assert.deepStrictEqual(after.filter(customization => customization.type === CustomizationType.Directory).map(customization => customization.uri), [agentsRoot.toString()]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('getSessionCustomizations coalesces burst watcher changes into one discovered refresh publish', async () => {
			const fileService = disposables.add(new FileService(new NullLogService()));
			disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

			const workspace = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
			const agentsRoot = URI.joinPath(workspace, '.github', 'agents');
			const instructionsRoot = URI.joinPath(workspace, '.github', 'instructions');
			await fileService.createFolder(agentsRoot);
			await fileService.createFolder(instructionsRoot);
			await fileService.writeFile(URI.joinPath(agentsRoot, 'helper-0.agent.md'), VSBuffer.fromString('agent 0'));
			await fileService.writeFile(URI.joinPath(instructionsRoot, 'base.instructions.md'), VSBuffer.fromString('---\napplyTo:\n  - src/**\n---\nbase instruction'));

			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const { agent } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client, fileService });

			const actions: SessionAction[] = [];
			disposables.add(agent.onDidSessionProgress(progress => {
				if (progress.kind === 'action') {
					actions.push(progress.action);
				}
			}));

			type DiscoveredDirectoryCustomization = PluginCustomization & { children: NonNullable<PluginCustomization['children']> };

			const countDiscoveredRefreshPublishes = (): number => actions.filter(action => {
				if (action.type !== ActionType.SessionCustomizationsChanged) {
					return false;
				}
				const customizations = (action as Extract<SessionAction, { type: ActionType.SessionCustomizationsChanged }>).customizations;
				return customizations.some(customization => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString())
					&& customizations.some(customization => customization.type === CustomizationType.Directory && customization.uri === instructionsRoot.toString());
			}).length;

			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'session-discovery-burst-watcher-change');
				await agent.createSession({
					session,
					workingDirectory: workspace,
				});

				await agent.getSessionCustomizations(session);
				await new Promise(resolve => setTimeout(resolve, 50));
				const publishCountBeforeBurst = countDiscoveredRefreshPublishes();

				await Promise.all([
					fileService.writeFile(URI.joinPath(agentsRoot, 'helper-1.agent.md'), VSBuffer.fromString('agent 1')),
					fileService.writeFile(URI.joinPath(agentsRoot, 'helper-2.agent.md'), VSBuffer.fromString('agent 2')),
					fileService.writeFile(URI.joinPath(instructionsRoot, 'extra.instructions.md'), VSBuffer.fromString('---\napplyTo:\n  - test/**\n---\nextra instruction')),
				]);

				let discoveredAgentCount = 0;
				let discoveredInstructionCount = 0;
				for (let i = 0; i < 20 && (discoveredAgentCount < 3 || discoveredInstructionCount < 2); i++) {
					await new Promise(resolve => setTimeout(resolve, 50));
					const customizations = await agent.getSessionCustomizations(session);
					const discoveredAgentDirectory = customizations.find((customization): customization is DiscoveredDirectoryCustomization => customization.type === CustomizationType.Directory && customization.uri === agentsRoot.toString());
					const discoveredInstructionDirectory = customizations.find((customization): customization is DiscoveredDirectoryCustomization => customization.type === CustomizationType.Directory && customization.uri === instructionsRoot.toString());
					discoveredAgentCount = discoveredAgentDirectory?.children.filter(child => child.type === CustomizationType.Agent).length ?? 0;
					discoveredInstructionCount = discoveredInstructionDirectory?.children.filter(child => child.type === CustomizationType.Rule).length ?? 0;
				}

				assert.strictEqual(discoveredAgentCount, 3, 'expected agent burst changes to be discovered');
				assert.strictEqual(discoveredInstructionCount, 2, 'expected instruction burst changes to be discovered');
				assert.strictEqual(
					countDiscoveredRefreshPublishes(),
					publishCountBeforeBurst + 1,
					'expected burst watcher changes across folders to result in exactly one discovered refresh publish (_onDidRefresh)'
				);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('provisional sessions', () => {

		test('createSession does not call client.createSession or create worktrees', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const gitService = new TestAgentHostGitService();
			let clientCreateCalls = 0;
			let worktreeCalls = 0;
			client.createSession = async () => { clientCreateCalls++; throw new Error('SDK not expected'); };
			const origAddWorktree = gitService.addWorktree.bind(gitService);
			gitService.addWorktree = async (...args) => { worktreeCalls++; return origAddWorktree(...args); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, gitService });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-1'),
					workingDirectory: URI.file('/workspace'),
					config: { isolation: 'worktree', branch: 'main' },
				});

				assert.strictEqual(result.provisional, true);
				assert.strictEqual(clientCreateCalls, 0, 'client.createSession should not be called for provisional sessions');
				assert.strictEqual(worktreeCalls, 0, 'no worktree should be created for provisional sessions');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession on provisional session does not touch SDK or worktree', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const gitService = new TestAgentHostGitService();
			let removeWorktreeCalls = 0;
			const origRemoveWorktree = gitService.removeWorktree.bind(gitService);
			gitService.removeWorktree = async (...args) => { removeWorktreeCalls++; return origRemoveWorktree(...args); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, gitService });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-2'),
					workingDirectory: URI.file('/workspace'),
				});

				await agent.disposeSession(result.session);

				assert.strictEqual(removeWorktreeCalls, 0, 'no worktree to remove for provisional');
				assert.strictEqual(agent.hasSession(result.session), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession removes the session from the SDK on-disk store', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-1');
				await agent.disposeSession(session);

				assert.deepStrictEqual(client.deletedSessionIds, ['persisted-session-1']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession on provisional session does not call client.deleteSession', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'prov-3'),
					workingDirectory: URI.file('/workspace'),
				});

				await agent.disposeSession(result.session);

				assert.deepStrictEqual(client.deletedSessionIds, []);
				assert.strictEqual(agent.hasSession(result.session), false);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('disposeSession propagates SDK delete errors and preserves in-memory state', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			client.deleteSession = async () => { throw new Error('boom'); };
			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const session = AgentSession.uri('copilotcli', 'persisted-session-2');
				await assert.rejects(() => agent.disposeSession(session), /boom/);
			} finally {
				await disposeAgent(agent);
			}
		});

		// Forking a provisional session is no longer a special case: the agent
		// service drops `config.fork` for sources with no turns, so the call
		// reduces to a plain new-session create.

		test('materialization passes VS Code-specific system message to the SDK', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'system-message-session'),
					workingDirectory: URI.file('/workspace'),
				});
				assert.strictEqual(result.provisional, true);

				await agent.sendMessage(result.session, 'hello');

				assert.ok(capturedConfig, 'SDK createSession should be called during provisional materialization');
				const systemMessage = capturedConfig.systemMessage;
				assert.deepStrictEqual(systemMessage, COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
				if (!systemMessage || systemMessage.mode !== 'customize') {
					assert.fail('Expected customize-mode system message');
				}
				assert.strictEqual(systemMessage.sections?.identity?.action, 'replace');
				assert.strictEqual(
					systemMessage.sections?.identity?.content,
					'You are an AI assistant using Copilot CLI runtime in VS Code. You help users with software engineering tasks. When asked about your identity, you must state that you are an AI assistant using Copilot CLI runtime in VS Code.'
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('materialization forwards the GitHub token to the SDK at the session level (#318693)', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'gh-token-abc');

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'session-level-token'),
					workingDirectory: URI.file('/workspace'),
				});
				assert.strictEqual(result.provisional, true);

				await agent.sendMessage(result.session, 'hello');

				assert.strictEqual(capturedConfig?.gitHubToken, 'gh-token-abc',
					'createSession should receive the GitHub token at session level so the SDK can resolve a per-session GitHub identity');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('materialization skips managed shell tools when root config disables the custom terminal tool', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			let capturedConfig: Parameters<ITestCopilotClient['createSession']>[0] | undefined;
			client.createSession = async config => {
				capturedConfig = config;
				return new MockCopilotSession() as unknown as CopilotSession;
			};

			const { agent, configurationService } = createTestAgentContext(disposables, { sessionDataService, copilotClient: client });
			try {
				await agent.authenticate('https://api.github.com', 'token');
				configurationService.updateRootConfig({ [AgentHostConfigKey.EnableCustomTerminalTool]: false });

				const result = await agent.createSession({
					session: AgentSession.uri('copilotcli', 'sdk-terminal-defaults'),
					workingDirectory: URI.file('/workspace'),
				});
				assert.strictEqual(result.provisional, true);

				await agent.sendMessage(result.session, 'hello');

				assert.deepStrictEqual(capturedConfig?.tools?.map(tool => tool.name), []);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('onClientToolCallComplete', () => {

		/**
		 * Injects a stub session into the agent's `_sessions` map so we can
		 * observe how `onClientToolCallComplete` resolves URIs to session
		 * entries without standing up a full Copilot SDK session.
		 */
		function installStubSession(agent: CopilotAgent, sessionId: string): { calls: { toolCallId: string; result: ToolCallResult }[] } {
			const calls: { toolCallId: string; result: ToolCallResult }[] = [];
			const stub = {
				handleClientToolCallComplete(toolCallId: string, result: ToolCallResult) {
					calls.push({ toolCallId, result });
				},
				dispose() { },
			};
			const sessions = (agent as unknown as { _sessions: Map<string, unknown> })._sessions;
			sessions.set(sessionId, stub);
			return { calls };
		}

		test('routes a top-level session URI to its session entry', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-top');
				const { calls } = installStubSession(agent, AgentSession.id(sessionUri));

				const result: ToolCallResult = { success: true, pastTenseMessage: 'did it' };
				agent.onClientToolCallComplete(sessionUri, 'tc-top', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-top', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('routes a subagent session URI to its parent session entry', async () => {
			// Regression: client-tool completions for tools running inside a
			// subagent are dispatched against the subagent session URI by
			// the renderer. The agent must resolve that to the parent
			// session entry — only the parent owns the SDK session and the
			// pending deferred for the tool call.
			const agent = createTestAgent(disposables);
			try {
				const parentUri = AgentSession.uri('copilotcli', 'session-parent');
				const { calls } = installStubSession(agent, AgentSession.id(parentUri));

				const subagentUri = URI.parse(buildSubagentSessionUri(parentUri.toString(), 'tc-parent'));
				const result: ToolCallResult = { success: true, pastTenseMessage: 'subagent tool done' };
				agent.onClientToolCallComplete(subagentUri, 'tc-inner', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-inner', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('routes a nested subagent session URI (depth > 1) to the root session entry', async () => {
			// Regression for depth > 1: a nested subagent URI like
			// `copilot:/root/subagent/tc1/subagent/tc2` must walk all the way
			// to the root session entry in `_sessions`, not stop at the
			// intermediate parent `copilot:/root/subagent/tc1`.
			const agent = createTestAgent(disposables);
			try {
				const rootUri = AgentSession.uri('copilotcli', 'session-root');
				const { calls } = installStubSession(agent, AgentSession.id(rootUri));

				const subagentUri = URI.parse(buildSubagentSessionUri(rootUri.toString(), 'tc-parent'));
				const nestedUri = URI.parse(buildSubagentSessionUri(subagentUri.toString(), 'tc-nested'));
				const result: ToolCallResult = { success: true, pastTenseMessage: 'nested done' };
				agent.onClientToolCallComplete(nestedUri, 'tc-inner', result);

				assert.deepStrictEqual(calls, [{ toolCallId: 'tc-inner', result }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('is a no-op when no session entry exists for the resolved id', async () => {
			const agent = createTestAgent(disposables);
			try {
				const sessionUri = AgentSession.uri('copilotcli', 'session-missing');
				// No stub installed — the call should be silently ignored.
				agent.onClientToolCallComplete(sessionUri, 'tc-x', { success: true, pastTenseMessage: 'noop' });
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	// Regression for the #319516 incident: a window reload reconnects with a
	// NEW clientId but an identical tool list. The cached SDK session's
	// staleness check (`ActiveClient.requiresRestart`) must NOT treat a
	// clientId-only change as a config change — otherwise either the session
	// is needlessly restarted, or (the actual bug) the cached session is
	// reused while the live clientId is never updated, so subsequent client
	// tool calls are stamped with the dead window's id and hang forever.
	suite('client tool refresh on reload (#319516)', () => {
		/** Minimal structural view of the agent's private per-session ActiveClient. */
		type TestActiveClient = {
			readonly state: { readonly clientId: string | undefined };
			snapshot(): Promise<IActiveClientSnapshot>;
			requiresRestart(snap: IActiveClientSnapshot): Promise<boolean>;
		};

		function getActiveClient(agent: CopilotAgent, session: URI): TestActiveClient {
			const activeClients = (agent as unknown as { _activeClients: { get(s: URI): TestActiveClient | undefined } })._activeClients;
			const activeClient = activeClients.get(session);
			assert.ok(activeClient, 'expected an ActiveClient to exist after setClientTools');
			return activeClient;
		}

		const tools: ToolDefinition[] = [{ name: 'my_tool', description: 'A test tool', inputSchema: { type: 'object', properties: {} } }];

		test('clientId-only change (reload) does NOT require a restart and updates the live clientId', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'reload-session');

				// Window A registers its tools; this is the snapshot the SDK
				// session would be created with.
				agent.setClientTools(session, 'client-A', tools);
				const activeClient = getActiveClient(agent, session);
				const appliedSnapshot = await activeClient.snapshot();
				assert.strictEqual(activeClient.state.clientId, 'client-A');

				// Window A reloads: window B reconnects with a new clientId but
				// the identical tool list.
				agent.setClientTools(session, 'client-B', [...tools]);

				// Root-cause assertions: the cached SDK session must be reused
				// (no restart) AND the live clientId must now be window B's, so
				// the next client tool call is stamped with a live owner.
				assert.strictEqual(await activeClient.requiresRestart(appliedSnapshot), false);
				assert.strictEqual(activeClient.state.clientId, 'client-B');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('a structural tool change still requires a restart', async () => {
			const agent = createTestAgent(disposables);
			try {
				const session = AgentSession.uri('copilotcli', 'tools-change-session');

				agent.setClientTools(session, 'client-A', tools);
				const activeClient = getActiveClient(agent, session);
				const appliedSnapshot = await activeClient.snapshot();

				// A genuinely different tool set (added tool) must restart so the
				// SDK session is rebuilt with the new tools.
				agent.setClientTools(session, 'client-A', [...tools, { name: 'second_tool', description: 'another', inputSchema: { type: 'object', properties: {} } }]);

				assert.strictEqual(await activeClient.requiresRestart(appliedSnapshot), true);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('_resumeSession dedup', () => {
		// Regression: two concurrent paths (e.g. an outdated-config refresh in
		// `sendMessage` and a `getSessionMessages` subscribe) each calling
		// `_resumeSession(id)` used to construct two `CopilotAgentSession`
		// entries for the same id; the second `_sessions.set(id, …)` on the
		// underlying `DisposableMap` disposed the first one mid
		// `initializeSession()`, producing 'Trying to add a disposable to a
		// DisposableStore that has already been disposed' warnings and a
		// half-initialised session with no event subscriptions.

		type AgentInternals = {
			_resumeSession: (id: string) => Promise<CopilotAgentSession>;
			_doResumeSession: (id: string) => Promise<CopilotAgentSession>;
		};
		const makeFakeSession = () => ({ dispose: () => { } } as unknown as CopilotAgentSession);

		test('dedupes concurrent calls for the same sessionId', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			const deferred = new DeferredPromise<CopilotAgentSession>();
			let doResumeCalls = 0;
			internals._doResumeSession = () => {
				doResumeCalls++;
				return deferred.p;
			};
			try {
				const p1 = internals._resumeSession('s1');
				const p2 = internals._resumeSession('s1');
				assert.strictEqual(p1, p2);
				assert.strictEqual(doResumeCalls, 1);

				const session = makeFakeSession();
				deferred.complete(session);
				assert.strictEqual(await p1, session);
				assert.strictEqual(await p2, session);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('clears inflight entry after resolution so the next call re-invokes _doResumeSession', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			let doResumeCalls = 0;
			internals._doResumeSession = async () => {
				doResumeCalls++;
				return makeFakeSession();
			};
			try {
				await internals._resumeSession('s1');
				await internals._resumeSession('s1');
				assert.strictEqual(doResumeCalls, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('clears inflight entry on rejection so the next call retries', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			let attempt = 0;
			internals._doResumeSession = async () => {
				attempt++;
				if (attempt === 1) {
					throw new Error('first failed');
				}
				return makeFakeSession();
			};
			try {
				await assert.rejects(() => internals._resumeSession('s1'), /first failed/);
				await internals._resumeSession('s1');
				assert.strictEqual(attempt, 2);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not dedupe across different sessionIds', async () => {
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as AgentInternals;
			const ids: string[] = [];
			internals._doResumeSession = async (id: string) => {
				ids.push(id);
				return makeFakeSession();
			};
			try {
				await Promise.all([
					internals._resumeSession('s1'),
					internals._resumeSession('s2'),
				]);
				assert.deepStrictEqual([...ids].sort(), ['s1', 's2']);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('post-init shutdown race: disposes the session and throws CancellationError instead of registering on a disposed _sessions map', async () => {
			// Without this guard an in-flight `_resumeSession` /
			// `_materializeProvisional` whose `initializeSession()`
			// resolves AFTER `dispose()` -> `shutdown()` -> `super.dispose()`
			// has run would call `_sessions.set(...)` on a disposed
			// DisposableMap, leaking the session and reproducing the
			// 'Trying to add a disposable to a DisposableStore that has
			// already been disposed' warning this PR exists to eliminate.
			const agent = createTestAgent(disposables);
			const internals = agent as unknown as {
				_registerInitializedSession: (id: string, s: CopilotAgentSession) => void;
				_shutdownPromise: Promise<void> | undefined;
			};
			let disposed = 0;
			const fakeSession = { dispose: () => { disposed++; } } as unknown as CopilotAgentSession;
			internals._shutdownPromise = Promise.resolve();
			try {
				assert.throws(
					() => internals._registerInitializedSession('s1', fakeSession),
					(err: unknown) => isCancellationError(err),
				);
				assert.strictEqual(disposed, 1, 'session should be disposed by the guard');
			} finally {
				// Clear the fake shutdown promise so disposeAgent doesn't
				// short-circuit and leave real state behind.
				internals._shutdownPromise = undefined;
				await disposeAgent(agent);
			}
		});
	});

	suite('_resumeSession fallback', () => {
		type AgentInternals = {
			_resumeSession: (id: string) => Promise<CopilotAgentSession>;
		};

		function createResumeFailingClient(message: string, code = -32603): { readonly client: TestCopilotClient; readonly getCreateSessionCalls: () => number } {
			let createSessionCalls = 0;
			const client = new TestCopilotClient([sdkSession('s1', '/workspace')]);
			client.resumeSession = async () => {
				throw new TestSdkError(message, code);
			};
			client.createSession = async () => {
				createSessionCalls++;
				return new MockCopilotSession() as unknown as CopilotSession;
			};
			return { client, getCreateSessionCalls: () => createSessionCalls };
		}

		test('falls back to createSession after a Start Over truncate leaves the session empty', async () => {
			// Simulates the post-`truncateSession`/"Start Over" case: the on-disk
			// session has zero events, so the SDK's resumeSession refuses to
			// resume it. The exact wording varies across SDK versions, so we
			// assert on the general -32603 + "no events" shape.
			const { client, getCreateSessionCalls } = createResumeFailingClient(`Request session.resume failed with message: LocalRpcSession: 'session.getMessages' returned no events for session s1`);
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService: disposables.add(new TestSessionDataService()) });
			const internals = agent as unknown as AgentInternals;
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				await internals._resumeSession('s1');
				assert.strictEqual(getCreateSessionCalls(), 1);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('falls back to createSession for an unknown -32603 from resumeSession', async () => {
			// Defensive: if the SDK starts emitting some other generic
			// "cannot resume this session" message, we should still recover
			// rather than leaving the user with an unopenable session.
			const { client, getCreateSessionCalls } = createResumeFailingClient('Request session.resume failed: something went wrong');
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService: disposables.add(new TestSessionDataService()) });
			const internals = agent as unknown as AgentInternals;
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				await internals._resumeSession('s1');
				assert.strictEqual(getCreateSessionCalls(), 1);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not replace a corrupted session file with an empty session', async () => {
			const { client, getCreateSessionCalls } = createResumeFailingClient('Request session.resume failed with message: Session file is corrupted (line 19567: data.compactionTokensUsed.copilotUsage.tokenDetails.0.batchSize: Number must be greater than 0)');
			const agent = createTestAgent(disposables, { copilotClient: client, useRealResumePath: true, sessionDataService: disposables.add(new TestSessionDataService()) });
			const internals = agent as unknown as AgentInternals;
			try {
				await agent.authenticate(GITHUB_COPILOT_PROTECTED_RESOURCE.resource, 'token');
				await assert.rejects(() => internals._resumeSession('s1'), /Session file is corrupted/);
				assert.strictEqual(getCreateSessionCalls(), 0);
			} finally {
				await disposeAgent(agent);
			}
		});
	});

	suite('worktree announcement', () => {
		// Drives a real session through worktree creation (calling the
		// agent's _resolveSessionWorkingDirectory via a test seam so we don't
		// need a full Copilot SDK), then exercises both the live path
		// (sendMessage emits a synthetic delta) and the restore path
		// (getSessionMessages prepends to the first assistant message). A
		// stubbed CopilotAgentSession is injected via overriding _resumeSession
		// because the real one requires a full SDK CopilotSession with ~30
		// event subscriptions.

		let tmpDir: string;

		setup(async () => {
			tmpDir = await fs.mkdtemp(`${os.tmpdir()}/copilot-agent-worktree-test-`);
		});

		teardown(async () => {
			await fs.rm(tmpDir, { recursive: true, force: true });
		});

		test('emits announcement live as a delta on first sendMessage and persists it for restore via getSessionMessages', async () => {
			const sessionId = 'wt-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const repositoryRoot = URI.joinPath(URI.file(tmpDir), 'repo');
			await fs.mkdir(repositoryRoot.fsPath, { recursive: true });

			const gitService = new TestAgentHostGitService();
			gitService.repositoryRoot = repositoryRoot;

			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, {
				sessionDataService,
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			const fakeMessages: Turn[] = [
				{
					id: 'u1',
					message: { text: 'hi', origin: { kind: MessageKind.User } },
					responseParts: [
						{
							kind: ResponsePartKind.ToolCall,
							toolCall: {
								status: ToolCallStatus.Completed,
								toolCallId: 'tc-1',
								toolName: 'view',
								displayName: 'View File',
								invocationMessage: 'Reading file',
								success: true,
								pastTenseMessage: 'Read file',
								confirmed: ToolCallConfirmationReason.NotNeeded,
							},
						},
						{ kind: ResponsePartKind.Markdown, id: 'a1', content: 'hello back' },
					],
					usage: undefined,
					state: TurnState.Complete,
				},
			];
			let sendCalls = 0;
			agent.registerFakeSession(sessionId, {
				send: async () => { sendCalls++; },
				getMessages: async () => fakeMessages,
				dispose: () => { },
			});

			try {
				await agent.authenticate('https://api.github.com', 'token');

				// 1. Drive worktree resolution: this is what createSession does
				//    before constructing the SDK session. Verifies that the
				//    real production code path persists branch metadata and
				//    queues the live announcement.
				const branchHint = 'add-feature';
				const expectedBranchName = getCopilotWorktreeBranchName(sessionId, branchHint);
				const workingDir = await agent.resolveWorktreeForTest({
					workingDirectory: repositoryRoot,
					config: { isolation: 'worktree', branch: 'main' },
				}, sessionId, 'Add feature');
				assert.ok(workingDir, 'resolveWorktreeForTest must return a worktree URI');
				assert.deepStrictEqual(gitService.addedWorktrees.length, 1, 'addWorktree must be called once');
				assert.strictEqual(gitService.addedWorktrees[0].branchName, expectedBranchName);

				// 2. Live path: sendMessage must fire a synthetic markdown
				//    delta carrying the announcement before delegating to the
				//    SDK. The session is responsible for emitting the
				//    announcement after resetting partId tracking.
				const signals: AgentSignal[] = [];
				disposables.add(agent.onDidSessionProgress(s => {
					signals.push(s);
				}));

				await agent.sendMessage(session, 'hello');
				assert.strictEqual(sendCalls, 1, 'underlying SDK send must still be called');

				const markdownSignals = signals.filter((s): s is IAgentActionSignal =>
					s.kind === 'action' && (
						(s.action.type === ActionType.SessionResponsePart && s.action.part.kind === ResponsePartKind.Markdown) ||
						s.action.type === ActionType.SessionDelta
					)
				);
				assert.strictEqual(markdownSignals.length, 1, 'exactly one markdown announcement signal should be emitted for the worktree announcement');
				const announcement = markdownSignals[0];
				const announcementContent = announcement.action.type === ActionType.SessionResponsePart
					? (announcement.action.part as MarkdownResponsePart).content
					: (announcement.action as IDeltaAction).content;
				assert.ok(announcementContent.includes(expectedBranchName), `announcement should contain branch name '${expectedBranchName}', got '${announcementContent}'`);

				// 3. Live path is one-shot: a second sendMessage must not re-emit.
				signals.length = 0;
				await agent.sendMessage(session, 'follow-up');
				const reemittedMarkdown = signals.filter(s =>
					s.kind === 'action' && (
						(s.action.type === ActionType.SessionResponsePart && s.action.part.kind === ResponsePartKind.Markdown) ||
						s.action.type === ActionType.SessionDelta
					)
				);
				assert.strictEqual(reemittedMarkdown.length, 0, 'announcement must not be re-emitted on subsequent sends');

				// 4. Restore path: getSessionMessages must prepend the
				//    announcement ahead of every first-turn response part,
				//    using the persisted branch metadata.
				const restored = await agent.getSessionMessages(session);
				const md = restored[0]?.responseParts[0] as MarkdownResponsePart | undefined;
				assert.ok(md, 'restored turns should include a markdown response part');
				assert.strictEqual(md.kind, ResponsePartKind.Markdown, 'worktree announcement must be the first response part');
				assert.ok(md.content.includes(expectedBranchName), `restored markdown content should include the branch name, got '${md.content}'`);
				assert.strictEqual(restored[0]?.responseParts[1]?.kind, ResponsePartKind.ToolCall, 'existing tool calls must remain after the announcement');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('does not announce or persist branch metadata when isolation is not worktree', async () => {
			const sessionId = 'no-wt-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const repositoryRoot = URI.joinPath(URI.file(tmpDir), 'repo');
			await fs.mkdir(repositoryRoot.fsPath, { recursive: true });

			const gitService = new TestAgentHostGitService();
			gitService.repositoryRoot = repositoryRoot;

			const sessionDataService = disposables.add(new TestSessionDataService());
			const agent = createTestAgent(disposables, {
				sessionDataService,
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			const fakeMessages: Turn[] = [
				{ id: 'u1', message: { text: 'hi', origin: { kind: MessageKind.User } }, responseParts: [{ kind: ResponsePartKind.Markdown, id: 'a1', content: 'untouched reply' }], usage: undefined, state: TurnState.Complete },
			];
			agent.registerFakeSession(sessionId, {
				send: async () => { },
				getMessages: async () => fakeMessages,
				dispose: () => { },
			});

			try {
				await agent.authenticate('https://api.github.com', 'token');

				await agent.resolveWorktreeForTest({ workingDirectory: repositoryRoot }, sessionId);
				assert.deepStrictEqual(gitService.addedWorktrees, [], 'addWorktree must not be called without worktree isolation');

				const signals: AgentSignal[] = [];
				disposables.add(agent.onDidSessionProgress(s => {
					signals.push(s);
				}));
				await agent.sendMessage(session, 'hello');
				const markdownSignals = signals.filter(s =>
					s.kind === 'action' && (
						(s.action.type === ActionType.SessionResponsePart && s.action.part.kind === ResponsePartKind.Markdown) ||
						s.action.type === ActionType.SessionDelta
					)
				);
				assert.deepStrictEqual(markdownSignals, [], 'no announcement should be emitted live');

				const restored = await agent.getSessionMessages(session);
				const md = restored[0]?.responseParts.find((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
				assert.strictEqual(md?.content, 'untouched reply', 'restored markdown content must not be modified');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('onArchivedChanged removes the worktree on archive and recreates it on unarchive', async () => {
			const sessionId = 'archive-cleanup-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const repositoryRoot = URI.joinPath(URI.file(tmpDir), 'repo');
			await fs.mkdir(repositoryRoot.fsPath, { recursive: true });

			const gitService = new TestAgentHostGitService();
			gitService.repositoryRoot = repositoryRoot;

			const agent = createTestAgent(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const workingDir = await agent.resolveWorktreeForTest({
					workingDirectory: repositoryRoot,
					config: { isolation: 'worktree', branch: 'main' },
				}, sessionId);
				assert.ok(workingDir, 'worktree must be created');
				// Simulate the worktree directory existing on disk so the archive
				// path's existence-check passes; the test git service has no real repo.
				await fs.mkdir(workingDir!.fsPath, { recursive: true });

				await agent.onArchivedChanged(session, true);
				assert.deepStrictEqual(
					gitService.removedWorktrees.map(r => r.worktree.fsPath),
					[workingDir!.fsPath],
					'archive must remove the worktree once it is clean and the branch is preserved',
				);

				// Simulate that the worktree directory is gone after removal.
				await fs.rm(workingDir!.fsPath, { recursive: true, force: true });

				await agent.onArchivedChanged(session, false);
				assert.deepStrictEqual(
					gitService.addedExistingWorktrees.map(r => ({ worktree: r.worktree.fsPath, branchName: r.branchName })),
					[{ worktree: workingDir!.fsPath, branchName: gitService.addedWorktrees[0].branchName }],
					'unarchive must recreate the worktree using the preserved branch',
				);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('onArchivedChanged skips removal when worktree has uncommitted changes', async () => {
			const sessionId = 'archive-skip-dirty-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const repositoryRoot = URI.joinPath(URI.file(tmpDir), 'repo-dirty');
			await fs.mkdir(repositoryRoot.fsPath, { recursive: true });

			const gitService = new TestAgentHostGitService();
			gitService.repositoryRoot = repositoryRoot;

			const agent = createTestAgent(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const workingDir = await agent.resolveWorktreeForTest({
					workingDirectory: repositoryRoot,
					config: { isolation: 'worktree', branch: 'main' },
				}, sessionId);
				await fs.mkdir(workingDir!.fsPath, { recursive: true });
				gitService.dirtyWorkingDirectories.add(workingDir!.fsPath);

				await agent.onArchivedChanged(session, true);
				assert.deepStrictEqual(gitService.removedWorktrees, [], 'must not remove a dirty worktree');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('onArchivedChanged skips removal when branch is missing', async () => {
			const sessionId = 'archive-skip-no-branch-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const repositoryRoot = URI.joinPath(URI.file(tmpDir), 'repo-nobranch');
			await fs.mkdir(repositoryRoot.fsPath, { recursive: true });

			const gitService = new TestAgentHostGitService();
			gitService.repositoryRoot = repositoryRoot;

			const agent = createTestAgent(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const workingDir = await agent.resolveWorktreeForTest({
					workingDirectory: repositoryRoot,
					config: { isolation: 'worktree', branch: 'main' },
				}, sessionId);
				await fs.mkdir(workingDir!.fsPath, { recursive: true });
				// Drop the branch so cleanup must skip.
				gitService.existingBranches.clear();

				await agent.onArchivedChanged(session, true);
				assert.deepStrictEqual(gitService.removedWorktrees, [], 'must not remove a worktree whose branch is missing');
			} finally {
				await disposeAgent(agent);
			}
		});

		test('onArchivedChanged is a no-op when no worktree metadata is persisted', async () => {
			const sessionId = 'archive-no-meta-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const gitService = new TestAgentHostGitService();
			const agent = createTestAgent(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			try {
				await agent.authenticate('https://api.github.com', 'token');
				await agent.onArchivedChanged(session, true);
				await agent.onArchivedChanged(session, false);
				assert.deepStrictEqual({
					removed: gitService.removedWorktrees,
					addedExisting: gitService.addedExistingWorktrees,
				}, { removed: [], addedExisting: [] });
			} finally {
				await disposeAgent(agent);
			}
		});

		test('onArchivedChanged unarchive skips when worktree directory already exists', async () => {
			const sessionId = 'unarchive-existing-session';
			const session = AgentSession.uri('copilotcli', sessionId);
			const repositoryRoot = URI.joinPath(URI.file(tmpDir), 'repo-exists');
			await fs.mkdir(repositoryRoot.fsPath, { recursive: true });

			const gitService = new TestAgentHostGitService();
			gitService.repositoryRoot = repositoryRoot;

			const agent = createTestAgent(disposables, {
				sessionDataService: disposables.add(new TestSessionDataService()),
				copilotClient: new TestCopilotClient([]),
				gitService,
			}) as TestableCopilotAgent;

			try {
				await agent.authenticate('https://api.github.com', 'token');
				const workingDir = await agent.resolveWorktreeForTest({
					workingDirectory: repositoryRoot,
					config: { isolation: 'worktree', branch: 'main' },
				}, sessionId);
				await fs.mkdir(workingDir!.fsPath, { recursive: true });

				await agent.onArchivedChanged(session, false);
				assert.deepStrictEqual(gitService.addedExistingWorktrees, [], 'must not recreate a worktree whose directory already exists');
			} finally {
				await disposeAgent(agent);
			}
		});

	});
});
