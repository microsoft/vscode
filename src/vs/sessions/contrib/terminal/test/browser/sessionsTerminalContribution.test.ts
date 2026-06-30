/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore, Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { IAgentHostTerminalService } from '../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';
import { ITerminalProfileService } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { ITerminalCapabilityStore, ICommandDetectionCapability, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChat, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { SessionsTerminalContribution } from '../../browser/sessionsTerminalContribution.js';
import { TestPathService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';

const HOME_DIR = URI.file('/home/user');

class TestLogService extends NullLogService {
	readonly infos: string[] = [];
	readonly traces: string[] = [];

	override info(message: string, ...args: unknown[]): void {
		this.infos.push([message, ...args].join(' '));
	}

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push([message, ...args].join(' '));
	}
}

type TestTerminalInstance = ITerminalInstance & {
	_testCommandHistory: { timestamp: number }[];
	_testSetDisposed(disposed: boolean): void;
	_testSetShellLaunchConfig(shellLaunchConfig: ITerminalInstance['shellLaunchConfig']): void;
};

type TestActiveSession = IActiveSession & {
	loading: ReturnType<typeof observableValue<boolean>>;
};

function makeAgentSession(opts: {
	repository?: URI;
	worktree?: URI;
	providerType?: string;
	isArchived?: boolean;
	loading?: boolean;
	sessionId?: string;
}): TestActiveSession {
	const folder = opts.repository || opts.worktree ? {
		root: opts.repository ?? opts.worktree!,
		workingDirectory: opts.worktree ?? opts.repository!,
		name: 'test',
		description: undefined,
		gitRepository: { uri: opts.repository ?? opts.worktree!, workTreeUri: opts.worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
	} : undefined;
	const chat: IChat = {
		resource: URI.parse('file:///session'),
		createdAt: new Date(),
		title: observableValue('test.title', 'Test Session'),
		updatedAt: observableValue('test.updatedAt', new Date()),
		status: observableValue('test.status', 0),
		changes: observableValue('test.changes', []),
		modelId: observableValue('test.modelId', undefined),
		mode: observableValue('test.mode', undefined),
		isArchived: observableValue('test.isArchived', opts.isArchived ?? false),
		isRead: observableValue('test.isRead', true),
		checkpoints: observableValue('test.checkpoints', undefined),
		lastTurnEnd: observableValue('test.lastTurnEnd', undefined),
		description: observableValue('test.description', undefined),
	} satisfies IChat;
	const session = {
		sessionId: opts.sessionId ?? 'test:session',
		resource: chat.resource,
		providerId: 'test',
		sessionType: opts.providerType ?? AgentSessionProviders.Local,
		icon: Codicon.copilot,
		createdAt: chat.createdAt,
		workspace: observableValue('test.workspace', folder
			? {
				uri: folder.root,
				label: 'test',
				icon: Codicon.repo,
				folders: [folder],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false
			} satisfies ISessionWorkspace
			: undefined),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: constObservable([]),
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('test.loading', opts.loading ?? false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		chats: observableValue('test.chats', [chat]),
		activeChat: observableValue('test.activeChat', chat),
		mainChat: constObservable(chat),
		capabilities: { supportsMultipleChats: false },
		isCreated: observableValue('test.isCreated', true),
		sticky: observableValue('test.sticky', false),
		openChats: observableValue('test.openChats', [chat]),
		closedChats: constObservable([]),
		visibleChatTabs: constObservable([chat]),
	} satisfies TestActiveSession;
	return session;
}

function makeNonAgentSession(opts: { repository?: URI; worktree?: URI; providerType?: string; sessionId?: string }): ISession {
	const folder = opts.repository || opts.worktree ? {
		root: opts.repository ?? opts.worktree!,
		workingDirectory: opts.worktree ?? opts.repository!,
		name: 'test',
		description: undefined,
		gitRepository: { uri: opts.repository ?? opts.worktree!, workTreeUri: opts.worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
	} : undefined;
	const chat: IChat = {
		resource: URI.parse('file:///session'),
		createdAt: new Date(),
		title: observableValue('test.title', 'Test Session'),
		updatedAt: observableValue('test.updatedAt', new Date()),
		status: observableValue('test.status', 0),
		changes: observableValue('test.changes', []),
		modelId: observableValue('test.modelId', undefined),
		mode: observableValue('test.mode', undefined),
		isArchived: observableValue('test.isArchived', false),
		isRead: observableValue('test.isRead', true),
		checkpoints: observableValue('test.checkpoints', undefined),
		lastTurnEnd: observableValue('test.lastTurnEnd', undefined),
		description: observableValue('test.description', undefined),
	} satisfies IChat;
	const session = {
		sessionId: opts.sessionId ?? 'test:non-agent',
		resource: chat.resource,
		providerId: 'test',
		sessionType: opts.providerType ?? AgentSessionProviders.Local,
		icon: Codicon.copilot,
		createdAt: chat.createdAt,
		workspace: observableValue('test.workspace', folder
			? {
				uri: folder.root,
				label: 'test',
				icon: Codicon.repo,
				folders: [folder],
				requiresWorkspaceTrust: false,
			} as ISessionWorkspace : undefined),
		title: chat.title,
		updatedAt: chat.updatedAt,
		status: chat.status,
		changesets: constObservable([]),
		changes: chat.changes,
		modelId: chat.modelId,
		mode: chat.mode,
		loading: observableValue('test.loading', false),
		isArchived: chat.isArchived,
		isRead: chat.isRead,
		lastTurnEnd: chat.lastTurnEnd,
		description: chat.description,
		chats: observableValue('test.chats', [chat]),
		mainChat: constObservable(chat),
		capabilities: { supportsMultipleChats: false },
	} satisfies ISession;
	return session;
}

function makeTerminalInstance(id: number, cwd: string): TestTerminalInstance {
	const commandHistory: { timestamp: number }[] = [];
	let isDisposed = false;
	let shellLaunchConfig: ITerminalInstance['shellLaunchConfig'] = {} as ITerminalInstance['shellLaunchConfig'];
	const capabilities = {
		get(cap: TerminalCapability) {
			if (cap === TerminalCapability.CommandDetection && commandHistory.length > 0) {
				return { commands: commandHistory } as unknown as ICommandDetectionCapability;
			}
			return undefined;
		}
	} as ITerminalCapabilityStore;

	return {
		instanceId: id,
		get isDisposed() { return isDisposed; },
		get shellLaunchConfig() { return shellLaunchConfig; },
		getInitialCwd: () => Promise.resolve(cwd),
		capabilities,
		_testCommandHistory: commandHistory,
		_testSetDisposed(disposed: boolean) {
			isDisposed = disposed;
		},
		_testSetShellLaunchConfig(value: ITerminalInstance['shellLaunchConfig']) {
			shellLaunchConfig = value;
		},
	} as unknown as TestTerminalInstance;
}

function addCommandToInstance(instance: ITerminalInstance, timestamp: number): void {
	(instance as TestTerminalInstance)._testCommandHistory.push({ timestamp });
}

suite('SessionsTerminalContribution', () => {
	const store = new DisposableStore();
	let contribution: SessionsTerminalContribution;
	let activeSessionObs: ReturnType<typeof observableValue<IActiveSession | undefined>>;
	let onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	let onDidReplaceSession: Emitter<{ readonly from: ISession; readonly to: ISession }>;
	let onDidCreateInstance: Emitter<ITerminalInstance>;
	let onDidDisposeInstance: Emitter<ITerminalInstance>;

	let createdTerminals: { cwd: URI }[];
	let activeInstanceSet: number[];
	let activeInstanceId: number | undefined;
	let focusCalls: number;
	let disposedInstances: ITerminalInstance[];
	let nextInstanceId: number;
	let terminalInstances: Map<number, ITerminalInstance>;
	let backgroundedInstances: Set<number>;
	let moveToBackgroundCalls: number[];
	let showBackgroundCalls: number[];
	let disposeOnCreatePaths: Set<string>;
	let defaultCwdCalls: (URI | undefined)[];
	let logService: TestLogService;
	let allSessions: ISession[];
	let instantiationService: TestInstantiationService;

	setup(() => {
		createdTerminals = [];
		activeInstanceSet = [];
		activeInstanceId = undefined;
		focusCalls = 0;
		disposedInstances = [];
		nextInstanceId = 1;
		terminalInstances = new Map();
		backgroundedInstances = new Set();
		moveToBackgroundCalls = [];
		showBackgroundCalls = [];
		disposeOnCreatePaths = new Set();
		defaultCwdCalls = [];
		logService = new TestLogService();
		allSessions = [];

		instantiationService = store.add(new TestInstantiationService());

		activeSessionObs = observableValue<IActiveSession | undefined>('activeSession', undefined);
		onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		onDidReplaceSession = store.add(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
		onDidCreateInstance = store.add(new Emitter<ITerminalInstance>());
		onDidDisposeInstance = store.add(new Emitter<ITerminalInstance>());

		instantiationService.stub(ILogService, logService);

		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
			override readonly onDidReplaceSession = onDidReplaceSession.event;
			override getSessions(): ISession[] { return [...allSessions]; }
		});
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = activeSessionObs;
		});

		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidCreateInstance = onDidCreateInstance.event;
			override onDidDisposeInstance = onDidDisposeInstance.event;
			override get instances(): readonly ITerminalInstance[] {
				return [...terminalInstances.values()];
			}
			override get foregroundInstances(): readonly ITerminalInstance[] {
				return [...terminalInstances.values()].filter(i => !backgroundedInstances.has(i.instanceId));
			}
			override get activeInstance(): ITerminalInstance | undefined {
				return activeInstanceId !== undefined ? terminalInstances.get(activeInstanceId) : undefined;
			}
			override async createTerminal(opts?: any): Promise<ITerminalInstance> {
				const id = nextInstanceId++;
				const cwdUri: URI | undefined = opts?.config?.cwd;
				const cwdStr = cwdUri?.fsPath ?? '';
				const instance = makeTerminalInstance(id, cwdStr);
				createdTerminals.push({ cwd: opts?.config?.cwd });
				terminalInstances.set(id, instance);
				if (disposeOnCreatePaths.has(cwdStr)) {
					instance._testSetDisposed(true);
					terminalInstances.delete(id);
				}
				return instance;
			}
			override getInstanceFromId(id: number): ITerminalInstance | undefined {
				return terminalInstances.get(id);
			}
			override setActiveInstance(instance: ITerminalInstance): void {
				activeInstanceSet.push(instance.instanceId);
				activeInstanceId = instance.instanceId;
			}
			override async focusActiveInstance(): Promise<void> {
				focusCalls++;
			}
			override async safeDisposeTerminal(instance: ITerminalInstance): Promise<void> {
				disposedInstances.push(instance);
				(instance as TestTerminalInstance)._testSetDisposed(true);
				terminalInstances.delete(instance.instanceId);
				backgroundedInstances.delete(instance.instanceId);
				if (activeInstanceId === instance.instanceId) {
					activeInstanceId = undefined;
				}
			}
			override moveToBackground(instance: ITerminalInstance): void {
				backgroundedInstances.add(instance.instanceId);
				moveToBackgroundCalls.push(instance.instanceId);
			}
			override async showBackgroundTerminal(instance: ITerminalInstance): Promise<void> {
				backgroundedInstances.delete(instance.instanceId);
				showBackgroundCalls.push(instance.instanceId);
			}
		});

		instantiationService.stub(IPathService, new TestPathService(HOME_DIR));

		instantiationService.stub(IAgentHostTerminalService, new class extends mock<IAgentHostTerminalService>() {
			override readonly profiles = constObservable<never[]>([]);
			override getProfileForConnection() { return undefined; }
			override setDefaultCwd(cwd: URI | undefined): void { defaultCwdCalls.push(cwd); }
			override async createTerminalForEntry() { return undefined; }
		});

		instantiationService.stub(ITerminalProfileService, new class extends mock<ITerminalProfileService>() {
			override overrideDefaultProfile() { return Disposable.None; }
		});

		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
			override getProvider() { return undefined; }
		});

		instantiationService.stub(IContextKeyService, store.add(new MockContextKeyService()));

		instantiationService.stub(IViewsService, new class extends mock<IViewsService>() {
			override isViewVisible(): boolean { return false; }
			override onDidChangeViewVisibility = store.add(new Emitter<{ id: string; visible: boolean }>()).event;
		});

		contribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- Background provider: uses worktree/repository path ---

	test('creates a terminal at the worktree for a background session', async () => {
		const worktreeUri = URI.file('/worktree');
		const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file('/repo'), providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
	});

	test('falls back to repository when worktree is undefined for a background session', async () => {
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({ repository: repoUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
	});

	// --- Claude provider: also uses worktree/repository path ---

	test('creates a terminal at the worktree for a Claude session', async () => {
		const worktreeUri = URI.file('/worktree');
		const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file('/repo'), providerType: AgentSessionProviders.Claude });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
	});

	test('falls back to repository when worktree is undefined for a Claude session', async () => {
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({ repository: repoUri, providerType: AgentSessionProviders.Claude });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
	});

	// --- Workspace-backed sessions: use working directory ---

	test('uses worktree directory for a cloud agent session when workspace exists', async () => {
		const session = makeAgentSession({ worktree: URI.file('/worktree'), repository: URI.file('/repo'), providerType: AgentSessionProviders.Cloud });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file('/worktree').fsPath);
	});

	test('uses worktree directory for a local agent session when workspace exists', async () => {
		const session = makeAgentSession({ worktree: URI.file('/worktree'), providerType: AgentSessionProviders.Local });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file('/worktree').fsPath);
	});

	test('uses home directory for a non-agent session', async () => {
		const session = makeNonAgentSession({ repository: URI.file('/repo') });
		activeSessionObs.set(session as IActiveSession, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
	});

	test('creates separate terminals when different non-background sessions share the home directory', async () => {
		const session1 = makeAgentSession({ providerType: AgentSessionProviders.Cloud, sessionId: 'test:cloud-1' });
		activeSessionObs.set(session1, undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		const session2 = makeAgentSession({ providerType: AgentSessionProviders.Local, sessionId: 'test:local-1' });
		activeSessionObs.set(session2, undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2);
	});

	test('does not create a terminal when there is no active session', async () => {
		activeSessionObs.set(undefined, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 0);
	});

	test('waits for a loading session before creating a terminal', async () => {
		const worktreeUri = URI.file('/worktree');
		const session = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background, loading: true });

		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 0, 'should not create a terminal while session is loading');
		assert.strictEqual(defaultCwdCalls.at(-1), undefined, 'should not set the default cwd while session is loading');

		session.loading.set(false, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
		assert.strictEqual(defaultCwdCalls.at(-1)?.fsPath, worktreeUri.fsPath);
	});

	test('does not recreate terminal for the same path', async () => {
		const worktreeUri = URI.file('/worktree');
		const session1 = makeAgentSession({ sessionId: 'test:session-1', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session1, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);

		const session2 = makeAgentSession({ sessionId: 'test:session-1', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session2, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
	});

	test('creates new terminal when switching to a different background path', async () => {
		const worktree1 = URI.file('/worktree1');
		const worktree2 = URI.file('/worktree2');

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: worktree1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-2', worktree: worktree2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 2);
		assert.strictEqual(createdTerminals[1].cwd.fsPath, worktree2.fsPath);
	});

	// --- ensureTerminal ---

	test('ensureTerminal creates terminal and sets it active', async () => {
		const cwd = URI.file('/test-cwd');
		await contribution.ensureTerminal(cwd, false);

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, cwd.fsPath);
		assert.strictEqual(activeInstanceSet.length, 1);
		assert.strictEqual(focusCalls, 0);
	});

	test('ensureTerminal focuses when requested', async () => {
		const cwd = URI.file('/test-cwd');
		await contribution.ensureTerminal(cwd, true);

		assert.strictEqual(focusCalls, 1);
	});

	test('ensureTerminal reuses existing terminal for same path', async () => {
		const cwd = URI.file('/test-cwd');
		await contribution.ensureTerminal(cwd, false);
		await contribution.ensureTerminal(cwd, false);

		assert.strictEqual(createdTerminals.length, 1, 'should reuse the existing terminal');
		assert.strictEqual(activeInstanceSet.length, 1, 'should only set active instance on creation');
	});

	test('ensureTerminal creates new terminal for different path', async () => {
		await contribution.ensureTerminal(URI.file('/cwd1'), false);
		await contribution.ensureTerminal(URI.file('/cwd2'), false);

		assert.strictEqual(createdTerminals.length, 2);
	});

	test('ensureTerminal path comparison is case-insensitive', async () => {
		await contribution.ensureTerminal(URI.file('/Test/CWD'), false);
		await contribution.ensureTerminal(URI.file('/test/cwd'), false);

		assert.strictEqual(createdTerminals.length, 1, 'should match case-insensitively');
	});

	test('ensureTerminal does not activate a terminal disposed during creation', async () => {
		const cwd = URI.file('/test-cwd');
		disposeOnCreatePaths.add(cwd.fsPath);

		const instances = await contribution.ensureTerminal(cwd, false);

		assert.strictEqual(instances.length, 0);
		assert.strictEqual(activeInstanceSet.length, 0);
		assert.ok(logService.traces.some(message => message.includes(`Cannot activate created terminal for ${cwd.fsPath}; terminal 1 is no longer available`)));
	});

	// --- onDidChangeSessions (archived) ---

	test('hides (does not dispose) terminals when session is archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:archived-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 at /worktree

		assert.strictEqual(createdTerminals.length, 1);

		// Archiving flips the active session away from the archived one, so the
		// archived session's terminal is no longer the focused (active) terminal.
		const otherSession = makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background });
		activeSessionObs.set(otherSession, undefined);
		await tick();

		// Isolate the archive-driven hide from the visibility-switch hide above.
		moveToBackgroundCalls.length = 0;

		const session = makeAgentSession({
			sessionId: 'test:archived-session',
			isArchived: true,
			worktree: worktreeUri,
			providerType: AgentSessionProviders.Background,
		});
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'archived session terminal must be hidden, not disposed');
		assert.deepStrictEqual(moveToBackgroundCalls, [1], 'archived session terminal should be moved to background');
	});

	test('does not hide or dispose terminals when session is not archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:active-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background }));

		moveToBackgroundCalls.length = 0;

		const session = makeAgentSession({
			sessionId: 'test:active-session',
			isArchived: false,
			worktree: worktreeUri,
		});
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0);
		assert.strictEqual(moveToBackgroundCalls.length, 0);
	});

	test('does not log info when an archived session has no tracked terminals', async () => {
		const session = makeAgentSession({
			sessionId: 'test:archived-without-terminal',
			isArchived: true,
			worktree: URI.file('/worktree'),
			providerType: AgentSessionProviders.Background,
		});

		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();
		assert.deepStrictEqual(logService.infos, []);
	});

	test('does not hide or dispose terminals when archived session has no worktree', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:active-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background }));

		moveToBackgroundCalls.length = 0;

		const session = makeAgentSession({ sessionId: 'test:archived-session', isArchived: true });
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0);
		assert.strictEqual(moveToBackgroundCalls.length, 0);
	});

	test('hides terminals when archived session has only a repository (no worktree)', async () => {
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({ sessionId: 'test:repo-session', repository: repoUri, providerType: AgentSessionProviders.Background, isArchived: false });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);

		// Switch the active session to a different cwd so the repo cwd is no longer
		// the protected active cwd (mirrors archiving flipping the active session
		// to a new one), then archive the repo-only session.
		const otherSession = makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background });
		activeSessionObs.set(otherSession, undefined);
		await tick();

		moveToBackgroundCalls.length = 0;

		const archivedSession = makeAgentSession({ sessionId: 'test:repo-session', repository: repoUri, providerType: AgentSessionProviders.Background, isArchived: true });
		onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'archived repo-only session terminal must be hidden, not disposed');
		assert.deepStrictEqual(moveToBackgroundCalls, [1]);
	});

	test('does not hide the terminal at the active session cwd when archiving (just-opened terminal is protected)', async () => {
		// Mirrors the "archive all sessions, then open a terminal" repro (#313510):
		// a late archive event must not touch the terminal the user is currently
		// working in at the active session's cwd.
		const worktreeUri = URI.file('/worktree');
		const activeSession = makeAgentSession({ sessionId: 'test:active-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(activeSession, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);

		moveToBackgroundCalls.length = 0;

		// A different, now-archived session that happens to share the active cwd.
		const archivedSession = makeAgentSession({ sessionId: 'test:archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
		onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'terminal at the active session cwd must not be disposed');
		assert.strictEqual(moveToBackgroundCalls.length, 0, 'terminal at the active session cwd must not be hidden');
	});

	test('does not re-hide a newly-opened terminal when an already-archived session is re-emitted', async () => {
		// Mirrors the "every new terminal keeps dying" repro (#313510, #318645):
		// the provider keeps archived sessions cached and re-emits them in `changed`
		// on every sync. The archive cleanup must only run on the first archived
		// transition, not on each re-emit.
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 at /worktree
		await contribution.ensureTerminal(URI.file('/other'), false, makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background })); // terminal 2 at /other, now active

		const archivedSession = makeAgentSession({ sessionId: 'test:archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });

		moveToBackgroundCalls.length = 0;

		// First archive event hides the terminal at the archived cwd (not active).
		onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
		await tick();
		assert.strictEqual(disposedInstances.length, 0);
		assert.deepStrictEqual(moveToBackgroundCalls, [1]);

		// The user opens a new terminal at the same cwd, then moves focus elsewhere.
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:later-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 3 at /worktree, active
		await contribution.ensureTerminal(URI.file('/other'), false, makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background })); // reuse terminal 2
		activeInstanceId = 2; // simulate the user refocusing terminal 2 at /other

		moveToBackgroundCalls.length = 0;

		// The provider re-emits the still-archived session on a later sync. Terminal 3
		// at /worktree is no longer the active terminal, so only the transition guard
		// keeps it alive: the re-emit must be a no-op so the newly-opened terminal survives.
		onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
		await tick();
		assert.strictEqual(disposedInstances.length, 0, 're-emitted archived session must not dispose any terminal');
		assert.strictEqual(moveToBackgroundCalls.length, 0, 're-emitted archived session must not re-hide the newly-opened terminal');
	});

	test('does not hide terminals for a session that was already archived when the contribution started', async () => {
		// Sessions restored already-archived from a previous window are seeded
		// into the tracked set at construction, so their first `changed` re-emit
		// must not count as a fresh archive transition. See #313510, #318645.
		const worktreeUri = URI.file('/worktree');
		const archivedSession = makeAgentSession({ sessionId: 'test:restored-archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
		allSessions = [archivedSession];

		// Dispose the default contribution (created in setup with no sessions) so
		// only the freshly-constructed, seeded contribution observes the event.
		contribution.dispose();

		// A fresh contribution observes the already-archived session at startup.
		const freshContribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
		await freshContribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:restored-archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal at /worktree
		await freshContribution.ensureTerminal(URI.file('/other'), false, makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background })); // move focus away

		moveToBackgroundCalls.length = 0;

		// The provider re-emits the already-archived session on its first sync.
		onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'already-archived session must not dispose any terminal');
		assert.strictEqual(moveToBackgroundCalls.length, 0, 'already-archived session must not be treated as a fresh archive transition');
	});

	test('closes terminals when a non-focused session is removed', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:removed-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 at /worktree, active
		// Open a terminal elsewhere so the /worktree terminal is no longer the
		// focused (active) instance — i.e. the user removed a session they were not
		// currently working in.
		await contribution.ensureTerminal(URI.file('/other'), false, makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background })); // terminal 2 at /other, active

		assert.strictEqual(createdTerminals.length, 2);

		const session = makeAgentSession({ sessionId: 'test:removed-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await tick();

		assert.strictEqual(disposedInstances.length, 1);
	});

	test('does not log info when a removed session has no tracked terminals', async () => {
		const session = makeAgentSession({
			sessionId: 'test:removed-without-terminal',
			worktree: URI.file('/worktree'),
			providerType: AgentSessionProviders.Background,
		});

		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await tick();

		assert.deepStrictEqual(logService.infos, []);
	});

	test('does not dispose the focused terminal when its session is removed (graduation case)', async () => {
		// Mirrors the first-turn untitled → committed graduation (#313510, #318645):
		// `onDidReplaceSession` surfaces the skeleton in `removed` while the
		// committed session inherits the same cwd but has not resolved its workspace
		// yet, so it does not appear in `liveCwdKeys`. The terminal the user just
		// used for the first turn is the focused (active) instance and must survive.
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:untitled', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 at /worktree, active

		assert.strictEqual(createdTerminals.length, 1);

		const skeleton = makeAgentSession({ sessionId: 'test:untitled', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		// The committed session reports no workspace yet, so it is not in allSessions.
		onDidChangeSessions.fire({ added: [], removed: [skeleton], changed: [] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'the focused terminal must not be disposed on graduation');
	});

	test('closes only the removed session terminal when sessions share a cwd', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:untitled', worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:committed', worktree: worktreeUri, providerType: AgentSessionProviders.Background }));

		// Simulate the onDidReplaceSession flow: `from` (untitled) is reported as
		// removed while `to` (committed) is still live at the same cwd.
		const fromSession = makeAgentSession({ sessionId: 'test:untitled', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		const toSession = makeAgentSession({ sessionId: 'test:committed', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		allSessions = [toSession];

		onDidChangeSessions.fire({ added: [], removed: [fromSession], changed: [toSession] });
		await tick();

		assert.deepStrictEqual(disposedInstances.map(instance => instance.instanceId), [1], 'only the removed session terminal should be closed');
		assert.ok(terminalInstances.has(2), 'the surviving session terminal should remain');
	});

	test('hides only the archived session terminal when sessions share a cwd', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:live', worktree: worktreeUri, providerType: AgentSessionProviders.Background }));
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background }));

		const liveSession = makeAgentSession({ sessionId: 'test:live', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		const archivedSession = makeAgentSession({ sessionId: 'test:archived', worktree: worktreeUri, providerType: AgentSessionProviders.Background, isArchived: true });
		allSessions = [liveSession, archivedSession];

		activeSessionObs.set(liveSession, undefined);
		await tick();
		activeInstanceId = 1;

		moveToBackgroundCalls.length = 0;

		onDidChangeSessions.fire({ added: [], removed: [], changed: [archivedSession] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'terminal should be hidden, not disposed');
		assert.deepStrictEqual(moveToBackgroundCalls, [2], 'only the archived session terminal should be hidden');
	});

	test('closes terminal when the only session at a cwd is removed even if other live sessions exist elsewhere', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:gone', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 at /worktree, active

		const otherLive = makeAgentSession({ sessionId: 'test:other', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background });
		const removedSession = makeAgentSession({ sessionId: 'test:gone', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		allSessions = [otherLive];

		// Switch focus to the other live session's terminal so the /worktree
		// terminal is no longer the protected active instance.
		await contribution.ensureTerminal(URI.file('/other'), false, makeAgentSession({ sessionId: 'test:other', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background })); // terminal 2 at /other, active

		onDidChangeSessions.fire({ added: [], removed: [removedSession], changed: [] });
		await tick();

		assert.strictEqual(disposedInstances.length, 1, 'no live session owns this cwd, terminal should be closed');
	});

	// --- switching back to previously used path reuses terminal ---

	test('switching back to a previously used background path reuses the existing terminal', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-2', worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2);

		// Switch back to cwd1 - should reuse terminal, not create a new one
		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2, 'should reuse the terminal for cwd1');
	});

	// --- Terminal visibility management (session-based with cwd fallback) ---

	test('hides terminals from previous session when switching to a new session', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-2', worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// The first terminal (id=1) should have been moved to background
		assert.ok(moveToBackgroundCalls.includes(1), 'terminal for cwd1 should be backgrounded');
		assert.ok(backgroundedInstances.has(1), 'terminal for cwd1 should remain backgrounded');
	});

	test('shows previously hidden terminals when switching back to their session', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-2', worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// Switch back to cwd1
		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// Terminal for cwd1 (id=1) should be shown again
		assert.ok(showBackgroundCalls.includes(1), 'terminal for cwd1 should be shown');
		assert.ok(!backgroundedInstances.has(1), 'terminal for cwd1 should be foreground');
		// Terminal for cwd2 (id=2) should now be backgrounded
		assert.ok(backgroundedInstances.has(2), 'terminal for cwd2 should be backgrounded');
	});

	test('only terminals of the active session are visible after multiple switches', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');
		const cwd3 = URI.file('/cwd3');

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-2', worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-3', worktree: cwd3, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// Only terminal for cwd3 (id=3) should be foreground
		assert.ok(backgroundedInstances.has(1), 'terminal for cwd1 should be backgrounded');
		assert.ok(backgroundedInstances.has(2), 'terminal for cwd2 should be backgrounded');
		assert.ok(!backgroundedInstances.has(3), 'terminal for cwd3 should be foreground');
	});

	test('shows pre-existing terminal with matching cwd instead of creating a new one', async () => {
		// Manually add a terminal that already exists with a matching cwd
		const cwd = URI.file('/worktree');
		const existingInstance = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		terminalInstances.set(existingInstance.instanceId, existingInstance);
		backgroundedInstances.add(existingInstance.instanceId);

		activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 0, 'should reuse existing terminal, not create a new one');
		assert.ok(showBackgroundCalls.includes(existingInstance.instanceId), 'should show the existing terminal');
	});

	test('does not background a restored terminal that is disposed before cwd resolves', async () => {
		let resolveInitialCwd: ((cwd: string) => void) | undefined;
		const restoredInstance = makeTerminalInstance(nextInstanceId++, '/restored');
		restoredInstance._testSetShellLaunchConfig({ attachPersistentProcess: {} as never } as ITerminalInstance['shellLaunchConfig']);
		restoredInstance.getInitialCwd = () => new Promise<string>(resolve => {
			resolveInitialCwd = resolve;
		});
		terminalInstances.set(restoredInstance.instanceId, restoredInstance);

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:active-session', worktree: URI.file('/active'), providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		onDidCreateInstance.fire(restoredInstance);
		restoredInstance._testSetDisposed(true);
		terminalInstances.delete(restoredInstance.instanceId);
		resolveInitialCwd?.('/other');
		await tick();

		assert.ok(!moveToBackgroundCalls.includes(restoredInstance.instanceId), 'disposed restored terminal should not be backgrounded');
		assert.ok(logService.traces.some(message => message.includes('Cannot hide restored terminal for /other; terminal') && message.includes('is no longer available')));
	});

	test('hides pre-existing terminal with non-matching cwd when session changes', async () => {
		// Manually add a terminal that already exists with a different cwd
		const otherInstance = makeTerminalInstance(nextInstanceId++, '/other/path');
		terminalInstances.set(otherInstance.instanceId, otherInstance);

		const cwd = URI.file('/worktree');
		activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		assert.ok(moveToBackgroundCalls.includes(otherInstance.instanceId), 'non-matching terminal should be backgrounded');
	});

	test('ensureTerminal finds a backgrounded terminal instead of creating a new one', async () => {
		const cwd = URI.file('/test-cwd');
		await contribution.ensureTerminal(cwd, false);
		const instanceId = activeInstanceSet[0];

		// Manually background it
		backgroundedInstances.add(instanceId);

		// ensureTerminal should find it by cwd, not create a new one
		const result = await contribution.ensureTerminal(cwd, false);

		assert.strictEqual(createdTerminals.length, 1, 'should not create a new terminal');
		assert.strictEqual(result[0].instanceId, instanceId, 'should return the existing backgrounded terminal');
	});

	test('does not reuse an untracked cwd match when it is already tracked to another session', async () => {
		const cwd = URI.file('/shared');
		const session1 = makeAgentSession({ sessionId: 'test:session-1', worktree: cwd, providerType: AgentSessionProviders.Background });
		const session2 = makeAgentSession({ sessionId: 'test:session-2', worktree: cwd, providerType: AgentSessionProviders.Background });

		activeSessionObs.set(session1, undefined);
		await tick();
		activeSessionObs.set(session2, undefined);
		await tick();

		assert.deepStrictEqual(createdTerminals.map(terminal => terminal.cwd.fsPath), [cwd.fsPath, cwd.fsPath]);
		assert.ok(backgroundedInstances.has(1), 'the first session terminal should be backgrounded');
		assert.ok(!backgroundedInstances.has(2), 'the second session terminal should stay visible');
	});

	test('visibility is determined by tracked session terminals when sessions share a cwd', async () => {
		const cwd = URI.file('/cwd');
		const session1 = makeAgentSession({ sessionId: 'test:session-1', worktree: cwd, providerType: AgentSessionProviders.Background });
		const session2 = makeAgentSession({ sessionId: 'test:session-2', worktree: cwd, providerType: AgentSessionProviders.Background });

		activeSessionObs.set(session1, undefined);
		await tick();
		activeSessionObs.set(session2, undefined);
		await tick();

		assert.ok(backgroundedInstances.has(1), 'session 1 terminal should be backgrounded when session 2 is active');
		assert.ok(!backgroundedInstances.has(2), 'session 2 terminal should be foreground');

		activeSessionObs.set(session1, undefined);
		await tick();

		assert.ok(!backgroundedInstances.has(1), 'session 1 terminal should be shown again when reactivated');
		assert.ok(backgroundedInstances.has(2), 'session 2 terminal should be backgrounded when session 1 is active');
	});

	// --- Most-recent-command active terminal selection ---

	test('sets the terminal with the most recent command as active after visibility update', async () => {
		const cwd = URI.file('/worktree');
		const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		terminalInstances.set(t1.instanceId, t1);
		terminalInstances.set(t2.instanceId, t2);

		// t1 ran a command at timestamp 100, t2 at timestamp 200 (more recent)
		addCommandToInstance(t1, 100);
		addCommandToInstance(t2, 200);

		activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// The most recent setActiveInstance call should be for t2
		assert.strictEqual(activeInstanceSet.at(-1), t2.instanceId, 'should set the terminal with the most recent command as active');
	});

	test('does not change active instance when no terminals have command history', async () => {
		const cwd = URI.file('/worktree');
		const t1 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		const t2 = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		terminalInstances.set(t1.instanceId, t1);
		terminalInstances.set(t2.instanceId, t2);

		const activeCountBefore = activeInstanceSet.length;

		activeSessionObs.set(makeAgentSession({ worktree: cwd, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// No setActiveInstance calls from visibility update since no commands were run
		assert.strictEqual(activeInstanceSet.length, activeCountBefore, 'should not call setActiveInstance when no command history exists');
	});

	// --- Remote agent host sessions ---

	test('uses the unwrapped repository path for a background session with a remote agent host repository', async () => {
		const remoteRepoUri = toAgentHostUri(URI.file('/Users/user/repo'), 'my-server');
		const session = makeAgentSession({ repository: remoteRepoUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1, 'should create a terminal at the unwrapped repository path');
		assert.strictEqual(createdTerminals[0].cwd.fsPath, URI.file('/Users/user/repo').fsPath);
	});

	// --- Hidden tool terminals (hideFromUser) ---

	test('does not hide hidden tool terminals when session is archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:regular-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 (regular) at /worktree

		// Simulate a hidden tool terminal (created by run_in_terminal) at the same cwd
		const toolTerminal = makeTerminalInstance(nextInstanceId++, worktreeUri.fsPath);
		toolTerminal._testSetShellLaunchConfig({ hideFromUser: true } as ITerminalInstance['shellLaunchConfig']);
		terminalInstances.set(toolTerminal.instanceId, toolTerminal);

		// Archiving flips the active session away, so the archived session's
		// regular terminal is no longer the focused (active) terminal.
		const otherSession = makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background });
		activeSessionObs.set(otherSession, undefined);
		await tick();

		moveToBackgroundCalls.length = 0;

		const session = makeAgentSession({
			sessionId: 'test:regular-session',
			isArchived: true,
			worktree: worktreeUri,
			providerType: AgentSessionProviders.Background,
		});
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		// The regular terminal should be hidden, but the tool terminal must survive untouched.
		assert.strictEqual(disposedInstances.length, 0, 'archived session terminal must be hidden, not disposed');
		assert.deepStrictEqual(moveToBackgroundCalls, [1], 'only the regular terminal should be hidden, not the tool terminal');
	});

	test('does not dispose hidden tool terminals when session is removed', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false, makeAgentSession({ sessionId: 'test:regular-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background })); // terminal 1 (regular) at /worktree, active

		const toolTerminal = makeTerminalInstance(nextInstanceId++, worktreeUri.fsPath);
		toolTerminal._testSetShellLaunchConfig({ hideFromUser: true } as ITerminalInstance['shellLaunchConfig']);
		terminalInstances.set(toolTerminal.instanceId, toolTerminal);

		// Switch focus away so the regular terminal is no longer the protected active instance.
		await contribution.ensureTerminal(URI.file('/other'), false, makeAgentSession({ sessionId: 'test:other-session', worktree: URI.file('/other'), providerType: AgentSessionProviders.Background })); // terminal at /other, active

		const session = makeAgentSession({ sessionId: 'test:regular-session', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await tick();

		assert.strictEqual(disposedInstances.length, 1, 'should dispose exactly one terminal');
		assert.notStrictEqual(disposedInstances[0].instanceId, toolTerminal.instanceId, 'should not dispose the tool terminal');
	});

	test('does not background hidden tool terminals during session switch', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-1', worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// Add a hidden tool terminal at cwd1
		const toolTerminal = makeTerminalInstance(nextInstanceId++, cwd1.fsPath);
		toolTerminal._testSetShellLaunchConfig({ hideFromUser: true } as ITerminalInstance['shellLaunchConfig']);
		terminalInstances.set(toolTerminal.instanceId, toolTerminal);

		// Switch to cwd2
		activeSessionObs.set(makeAgentSession({ sessionId: 'test:session-2', worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		assert.ok(!moveToBackgroundCalls.includes(toolTerminal.instanceId), 'hidden tool terminal should not be moved to background');
	});

	test('does not include hidden tool terminals in ensureTerminal matches', async () => {
		const cwd = URI.file('/worktree');

		// Add a hidden tool terminal at the target cwd
		const toolTerminal = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		toolTerminal._testSetShellLaunchConfig({ hideFromUser: true } as ITerminalInstance['shellLaunchConfig']);
		terminalInstances.set(toolTerminal.instanceId, toolTerminal);

		// ensureTerminal should not find the tool terminal, so it creates a new one
		await contribution.ensureTerminal(cwd, false);

		assert.strictEqual(createdTerminals.length, 1, 'should create a new terminal since tool terminal is hidden');
	});

	test('does not hide restored hidden tool terminals on session create', async () => {
		activeSessionObs.set(makeAgentSession({ sessionId: 'test:active-session', worktree: URI.file('/active'), providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		const toolTerminal = makeTerminalInstance(nextInstanceId++, '/other');
		toolTerminal._testSetShellLaunchConfig({
			hideFromUser: true,
			attachPersistentProcess: {} as never,
		} as ITerminalInstance['shellLaunchConfig']);
		terminalInstances.set(toolTerminal.instanceId, toolTerminal);

		onDidCreateInstance.fire(toolTerminal);
		await tick();

		assert.ok(!moveToBackgroundCalls.includes(toolTerminal.instanceId), 'hidden tool terminal should not be moved to background on restore');
	});

	test('transfers tracked terminals when a session is replaced (graduation)', async () => {
		const worktreeUri = URI.file('/worktree');
		const untitledSession = makeAgentSession({ sessionId: 'test:untitled', worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		const committedSession = makeAgentSession({ sessionId: 'test:committed', worktree: worktreeUri, providerType: AgentSessionProviders.Background });

		// Ensure a terminal for the untitled session
		await contribution.ensureTerminal(worktreeUri, false, untitledSession);
		assert.strictEqual(createdTerminals.length, 1);
		const terminalId = [...terminalInstances.keys()][0];

		// Fire onDidReplaceSession to transfer tracking
		onDidReplaceSession.fire({ from: untitledSession, to: committedSession });

		// Now removing the old session should not kill the terminal since
		// tracking was transferred to the committed session
		activeInstanceId = undefined; // terminal is not focused
		onDidChangeSessions.fire({ added: [], removed: [untitledSession], changed: [] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0, 'terminal should survive graduation because tracking was transferred');
		assert.ok(terminalInstances.has(terminalId), 'terminal should still exist');

		// And ensureTerminal for the committed session should reuse, not create
		const result = await contribution.ensureTerminal(worktreeUri, false, committedSession);
		assert.strictEqual(createdTerminals.length, 1, 'should reuse the transferred terminal');
		assert.strictEqual(result[0].instanceId, terminalId);
	});

	test('cleans up tracked terminal ids when terminals are externally disposed', async () => {
		const worktreeUri = URI.file('/worktree');
		const session = makeAgentSession({ sessionId: 'test:session', worktree: worktreeUri, providerType: AgentSessionProviders.Background });

		// Ensure a terminal for the session
		await contribution.ensureTerminal(worktreeUri, false, session);
		assert.strictEqual(createdTerminals.length, 1);
		const instance = [...terminalInstances.values()][0] as TestTerminalInstance;

		// Externally dispose the terminal (user closes the tab)
		instance._testSetDisposed(true);
		terminalInstances.delete(instance.instanceId);
		onDidDisposeInstance.fire(instance);

		// Now ensureTerminal should create a new terminal since the tracked one was disposed
		const result = await contribution.ensureTerminal(worktreeUri, false, session);
		assert.strictEqual(createdTerminals.length, 2, 'should create a new terminal since the tracked one was disposed');
		assert.notStrictEqual(result[0].instanceId, instance.instanceId, 'should be a different terminal');
	});

	test('untracked restored terminals are visible alongside tracked terminals for the same session', async () => {
		const cwd = URI.file('/worktree');
		const session = makeAgentSession({ sessionId: 'test:session', worktree: cwd, providerType: AgentSessionProviders.Background });

		// Simulate a restored terminal at the same cwd (not tracked)
		const restoredTerminal = makeTerminalInstance(nextInstanceId++, cwd.fsPath);
		terminalInstances.set(restoredTerminal.instanceId, restoredTerminal);
		backgroundedInstances.add(restoredTerminal.instanceId);

		// Activate the session — this creates a tracked terminal
		activeSessionObs.set(session, undefined);
		await tick();

		// The restored terminal should have been shown (via cwd fallback)
		// rather than left in the background
		assert.ok(showBackgroundCalls.includes(restoredTerminal.instanceId), 'untracked restored terminal at matching cwd should be shown');
	});
});

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
