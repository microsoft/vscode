/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Disposable, type DisposableStore, type IDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IAgentPluginManager, ISyncedCustomization } from '../../common/agentPluginManager.js';
import { AgentSession, type IAgentSessionMetadata } from '../../common/agentService.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../common/state/sessionProtocol.js';
import { ISessionCustomization, ICustomizationRef } from '../../common/state/sessionState.js';
import { IAgentHostGitService } from '../../node/agentHostGitService.js';
import { IAgentHostTerminalManager } from '../../node/agentHostTerminalManager.js';
import { CopilotAgent, getCopilotWorktreeBranchName, getCopilotWorktreeName, getCopilotWorktreesRoot, type ICopilotClient } from '../../node/copilot/copilotAgent.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
import { createNullSessionDataService } from '../common/sessionTestHelpers.js';

class TestAgentPluginManager implements IAgentPluginManager {
	declare readonly _serviceBrand: undefined;

	async syncCustomizations(_clientId: string, _customizations: ICustomizationRef[], _progress?: (status: ISessionCustomization[]) => void): Promise<ISyncedCustomization[]> {
		return [];
	}
}

class TestAgentHostGitService implements IAgentHostGitService {
	declare readonly _serviceBrand: undefined;

	async isInsideWorkTree(): Promise<boolean> { return false; }
	async getCurrentBranch(): Promise<string | undefined> { return undefined; }
	async getDefaultBranch(): Promise<string | undefined> { return undefined; }
	async getBranches(): Promise<string[]> { return []; }
	async getRepositoryRoot(): Promise<URI | undefined> { return undefined; }
	async getWorktreeRoots(): Promise<URI[]> { return []; }
	async addWorktree(): Promise<void> { }
	async removeWorktree(): Promise<void> { }
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

class TestableCopilotAgent extends CopilotAgent {
	constructor(
		private readonly _copilotClient: ICopilotClient,
		@ILogService logService: ILogService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
		@ISessionDataService sessionDataService: ISessionDataService,
		@IAgentHostGitService gitService: IAgentHostGitService,
		@IAgentHostTerminalManager terminalManager: IAgentHostTerminalManager,
	) {
		super(logService, instantiationService, fileService, sessionDataService, gitService, terminalManager);
	}

	protected override _createCopilotClient(): ICopilotClient {
		return this._copilotClient;
	}
}

function createTestAgent(disposables: Pick<DisposableStore, 'add'>, options?: { sessionDataService?: ISessionDataService; copilotClient?: ICopilotClient }): CopilotAgent {
	const services = new ServiceCollection();
	const logService = new NullLogService();
	const fileService = disposables.add(new FileService(logService));
	services.set(ILogService, logService);
	services.set(IFileService, fileService);
	services.set(ISessionDataService, options?.sessionDataService ?? createNullSessionDataService());
	services.set(IAgentPluginManager, new TestAgentPluginManager());
	services.set(IAgentHostGitService, new TestAgentHostGitService());
	services.set(IAgentHostTerminalManager, new TestAgentHostTerminalManager());
	const instantiationService: IInstantiationService = disposables.add(new InstantiationService(services));
	services.set(IInstantiationService, instantiationService);
	if (options?.copilotClient) {
		return instantiationService.createInstance(TestableCopilotAgent, options.copilotClient);
	}
	return instantiationService.createInstance(CopilotAgent);
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

	test('returns empty models and sessions before authentication', async () => {
		const agent = createTestAgent(disposables);
		try {
			assert.deepStrictEqual(agent.models.get(), []);
			assert.deepStrictEqual(await agent.listSessions(), []);
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

	test('listSessions only returns sessions with a database', async () => {
		const sessionDataService = disposables.add(new TestSessionDataService());
		const ownedSession = AgentSession.uri('copilot', 'owned');
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
		const legacySession = AgentSession.uri('copilot', 'legacy');
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
});
