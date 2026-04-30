/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CopilotSession, SessionEventPayload, SessionEventType, TypedSessionEventHandler } from '@github/copilot-sdk';
import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Disposable, type DisposableStore, type IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, type AgentSignal, type IAgentSessionMetadata } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ResponsePartKind, SessionCustomization, TurnState, type CustomizationRef, type MarkdownResponsePart, type Turn } from '../../common/state/sessionState.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { signalToLegacyView, type LegacyMockEvent } from './mockAgent.js';
import { AgentConfigurationService, IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { CopilotAgent, getCopilotWorktreeBranchName, getCopilotWorktreeName, getCopilotWorktreesRoot, type ICopilotClient } from '../../node/copilot/copilotAgent.js';
import { CopilotAgentSession, type SessionWrapperFactory } from '../../node/copilot/copilotAgentSession.js';
import { CopilotSessionWrapper } from '../../node/copilot/copilotSessionWrapper.js';
import { ShellManager } from '../../node/copilot/copilotShellTools.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';

class TestAgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	async syncCustomizations(_clientId: string, _customizations: CustomizationRef[], _progress?: (status: SessionCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return [];
	}
}

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	repositoryRoot: URI | undefined = undefined;
	addedWorktrees: { repositoryRoot: URI; worktree: URI; branchName: string; startPoint: string }[] = [];

	async isInsideWorkTree(): Promise<boolean> { return false; }
	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<string | undefined> { return undefined; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return this.repositoryRoot; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(repositoryRoot: URI, worktree: URI, branchName: string, startPoint: string): Promise<void> {
		this.addedWorktrees.push({ repositoryRoot, worktree, branchName, startPoint });
	}
	async removeWorktree(): Promise<void> { }
	async getSessionGitState(): Promise<undefined> { return undefined; }
	async computeSessionFileDiffs(): Promise<undefined> { return undefined; }
	async showBlob(): Promise<undefined> { return undefined; }
}

class TestAgentHostTerminalManager implements IAgentHostTerminalManager {
	declare readonly _serviceBrand: undefined;

	async createTerminal(): Promise<void> { }
	writeInput(): void { }
	onData(): IDisposable { return Disposable.None; }
	onExit(): IDisposable { return Disposable.None; }
	onClaimChanged(): IDisposable { return Disposable.None; }
	onCommandFinished(): IDisposable { return Disposable.None; }
	getContent(): string | undefined { return undefined; }
	getClaim(): undefined { return undefined; }
	hasTerminal(): boolean { return false; }
	getExitCode(): number | undefined { return undefined; }
	supportsCommandDetection(): boolean { return false; }
	disposeTerminal(): void { }
	getTerminalInfos(): [] { return []; }
	getTerminalState(): undefined { return undefined; }
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
	cleanupOrphanedData(): Promise<void> { return Promise.resolve(); }
	whenIdle(): Promise<void> { return Promise.resolve(); }
}

class TestCopilotClient implements ICopilotClient {
	readonly rpc: ICopilotClient['rpc'] = { sessions: { fork: async () => ({ sessionId: 'forked-session' }) } };

	constructor(
		private readonly _sessions: Awaited<ReturnType<ICopilotClient['listSessions']>>,
	) { }

	async start(): Promise<void> { }
	async stop(): ReturnType<ICopilotClient['stop']> { return []; }
	async listSessions(): ReturnType<ICopilotClient['listSessions']> { return this._sessions; }
	async listModels(): ReturnType<ICopilotClient['listModels']> { return []; }
	async getSessionMetadata(): ReturnType<ICopilotClient['getSessionMetadata']> { return undefined; }
	createSession: ICopilotClient['createSession'] = async () => { throw new Error('not implemented'); };
	resumeSession: ICopilotClient['resumeSession'] = async () => { throw new Error('not implemented'); };
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
	async getMessages(): Promise<SessionEventPayload<SessionEventType>[]> { return []; }
	async destroy(): Promise<void> { }
}

class TestableCopilotAgent extends CopilotAgent {
	private readonly _fakeSessions = new Map<string, IFakeAgentSession>();
	readonly resumeCalls: string[] = [];

	constructor(
		private readonly _copilotClient: ICopilotClient,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentHostTerminalManager terminalManager: IAgentHostTerminalManager,
		@IAgentConfigurationService configurationService: IAgentConfigurationService,
	) {
		super(logService, instantiationService, fileService, sessionDataService, gitService, terminalManager, configurationService);
		this._enablePlanModeOnClient(this._copilotClient);
	}

	protected override _createCopilotClient(): ICopilotClient {
		return this._copilotClient;
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
						session: sessionUri.toString(),
						turnId,
						part: { kind: ResponsePartKind.Markdown, id: `synth-${Date.now()}`, content },
					},
				});
			},
		} as unknown as CopilotAgentSession;
		return stub;
	}

	resolveWorktreeForTest(config: Parameters<CopilotAgent['createSession']>[0], sessionId: string): Promise<URI | undefined> {
		return this._resolveSessionWorkingDirectory(config, sessionId);
	}
}

function createTestAgentContext(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ICopilotClient; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager }): { agent: CopilotAgent; instantiationService: IInstantiationService } {
	const services = new ServiceCollection();
	const logService = new NullLogService();
	const fileService = disposables.add(new FileService(logService));
	const stateManager = disposables.add(new AgentHostStateManager(logService));
	const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
	services.set(ILogService, logService);
	services.set(IFileService, fileService);
	services.set(IAgentConfigurationService, configService);
	services.set(ISessionDataService, options?.sessionDataService ?? createNullSessionDataService());
	services.set(IAgentPluginManager, options?.pluginManager ?? new TestAgentPluginManager());
	services.set(IAgentHostGitService, options?.gitService ?? new TestAgentHostGitService());
	services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
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
		? instantiationService.createInstance(TestableCopilotAgent, options.copilotClient)
		: instantiationService.createInstance(CopilotAgent);
	return { agent, instantiationService };
}

function createTestAgent(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ICopilotClient; gitService?: TestAgentHostGitService; environmentServiceRegistration?: 'native' | 'none'; pluginManager?: IAgentPluginManager }): CopilotAgent {
	return createTestAgentContext(disposables, options).agent;
}

function createAgentSessionThroughAgent(agent: CopilotAgent, instantiationService: IInstantiationService): CopilotAgentSession {
	const sessionUri = AgentSession.uri('copilotcli', 'test-session-1');
	const shellManager = instantiationService.createInstance(ShellManager, sessionUri, undefined);
	const wrapperFactory: SessionWrapperFactory = async () => new CopilotSessionWrapper(new MockCopilotSession() as unknown as CopilotSession);
	return (agent as unknown as {
		_createAgentSession: (wrapperFactory: SessionWrapperFactory, sessionId: string, shellManager: ShellManager) => CopilotAgentSession;
	})._createAgentSession(wrapperFactory, 'test-session-1', shellManager);
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

function sdkSession(sessionId: string, cwd?: string): Awaited<ReturnType<ICopilotClient['listSessions']>>[number] {
	return {
		sessionId,
		startTime: new Date(1000),
		modifiedTime: new Date(2000),
		summary: `SDK ${sessionId}`,
		isRemote: false,
		...(cwd ? { context: { cwd } } : {}),
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

	test('agent-created sessions can resolve session-state paths via INativeEnvironmentService', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const { agent, instantiationService } = createTestAgentContext(disposables, {
			environmentServiceRegistration: 'native',
			sessionDataService,
		});
		const previousXdgStateHome = process.env['XDG_STATE_HOME'];
		delete process.env['XDG_STATE_HOME'];
		try {
			const agentSession = disposables.add(createAgentSessionThroughAgent(agent, instantiationService));
			await agentSession.initializeSession();

			const result = await agentSession.handlePermissionRequest({
				kind: 'read',
				path: URI.file('/mock-home/.copilot/session-state/test-session-1/plan.md').fsPath,
				toolCallId: 'tc-read-plan-agent-composition',
			});

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
			public readonly calls: { clientId: string; customizations: CustomizationRef[] }[] = [];

			override async syncCustomizations(clientId: string, customizations: CustomizationRef[], _progress?: (status: SessionCustomization[]) => void): Promise<ISyncedCustomization[]> {
				this.calls.push({ clientId, customizations: [...customizations] });
				return [];
			}
		}

		test('createSession seeds activeClient tools and syncs customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			// Fail fast inside the SDK factory so we don't need to wire up a
			// real raw session. The seeding of activeClient and the plugin
			// sync both happen before `client.createSession` is invoked.
			client.createSession = async () => { throw new Error('sentinel'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				const customizations: CustomizationRef[] = [{ uri: 'file:///plugin-a', displayName: 'Plugin A' }];
				await assert.rejects(
					agent.createSession({
						session: AgentSession.uri('copilotcli', 'test-session'),
						workingDirectory: URI.file('/workspace'),
						activeClient: {
							clientId: 'client-1',
							tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
							customizations,
						},
					}),
					(err: Error) => /sentinel/.test(err.message),
				);

				assert.deepStrictEqual(pluginManager.calls, [{ clientId: 'client-1', customizations }]);
			} finally {
				await disposeAgent(agent);
			}
		});

		test('createSession without activeClient does not sync customizations', async () => {
			const sessionDataService = disposables.add(new TestSessionDataService());
			const client = new TestCopilotClient([]);
			const pluginManager = new SpyingPluginManager();
			client.createSession = async () => { throw new Error('sentinel'); };

			const agent = createTestAgent(disposables, { sessionDataService, copilotClient: client, pluginManager });
			try {
				await agent.authenticate('https://api.github.com', 'token');

				await assert.rejects(
					agent.createSession({
						session: AgentSession.uri('copilotcli', 'test-session-2'),
						workingDirectory: URI.file('/workspace'),
					}),
					(err: Error) => /sentinel/.test(err.message),
				);

				assert.deepStrictEqual(pluginManager.calls, []);
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
				{ id: 'u1', userMessage: { text: 'hi' }, responseParts: [{ kind: ResponsePartKind.Markdown, id: 'a1', content: 'hello back' }], usage: undefined, state: TurnState.Complete },
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
					config: { isolation: 'worktree', branch: 'main', branchNameHint: branchHint },
				}, sessionId);
				assert.ok(workingDir, 'resolveWorktreeForTest must return a worktree URI');
				assert.deepStrictEqual(gitService.addedWorktrees.length, 1, 'addWorktree must be called once');
				assert.strictEqual(gitService.addedWorktrees[0].branchName, expectedBranchName);

				// 2. Live path: sendMessage must fire a synthetic markdown
				//    delta carrying the announcement before delegating to the
				//    SDK. The session is responsible for emitting the
				//    announcement after resetting partId tracking.
				const events: LegacyMockEvent[] = [];
				disposables.add(agent.onDidSessionProgress(s => {
					const v = signalToLegacyView(s);
					if (v) { events.push(v); }
				}));

				await agent.sendMessage(session, 'hello');
				assert.strictEqual(sendCalls, 1, 'underlying SDK send must still be called');

				const deltas = events.filter((e): e is LegacyMockEvent & { type: 'delta' } => e.type === 'delta');
				assert.strictEqual(deltas.length, 1, 'exactly one delta should be emitted for the worktree announcement');
				const announcement = deltas[0];
				assert.ok(announcement.content.includes(expectedBranchName), `announcement should contain branch name '${expectedBranchName}', got '${announcement.content}'`);

				// 3. Live path is one-shot: a second sendMessage must not re-emit.
				events.length = 0;
				await agent.sendMessage(session, 'follow-up');
				assert.strictEqual(events.filter(e => e.type === 'delta').length, 0, 'announcement must not be re-emitted on subsequent sends');

				// 4. Restore path: getSessionMessages must prepend the
				//    announcement to the first turn's first markdown part,
				//    using the persisted branch metadata.
				const restored = await agent.getSessionMessages(session);
				const md = restored[0]?.responseParts.find((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
				assert.ok(md, 'restored turns should include a markdown response part');
				assert.ok(md.content.includes(expectedBranchName), `restored markdown content should include the branch name, got '${md.content}'`);
				assert.ok(md.content.endsWith('hello back'), `restored markdown content should still end with the original reply, got '${md.content}'`);
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
				{ id: 'u1', userMessage: { text: 'hi' }, responseParts: [{ kind: ResponsePartKind.Markdown, id: 'a1', content: 'untouched reply' }], usage: undefined, state: TurnState.Complete },
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

				const events: LegacyMockEvent[] = [];
				disposables.add(agent.onDidSessionProgress(s => {
					const v = signalToLegacyView(s);
					if (v) { events.push(v); }
				}));
				await agent.sendMessage(session, 'hello');
				assert.deepStrictEqual(events.filter(e => e.type === 'delta'), [], 'no announcement should be emitted live');

				const restored = await agent.getSessionMessages(session);
				const md = restored[0]?.responseParts.find((p): p is MarkdownResponsePart => p.kind === ResponsePartKind.Markdown);
				assert.strictEqual(md?.content, 'untouched reply', 'restored markdown content must not be modified');
			} finally {
				await disposeAgent(agent);
			}
		});
	});
});
