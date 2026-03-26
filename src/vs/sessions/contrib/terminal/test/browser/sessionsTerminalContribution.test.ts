/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { ITerminalCapabilityStore, ICommandDetectionCapability, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { ISessionData } from '../../../sessions/common/sessionData.js';
import { ISessionsChangeEvent } from '../../../sessions/browser/sessionsProvider.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { SessionsTerminalContribution } from '../../browser/sessionsTerminalContribution.js';
import { TestPathService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';

const HOME_DIR = URI.file('/home/user');

class TestLogService extends NullLogService {
	readonly traces: string[] = [];

	override trace(message: string, ...args: unknown[]): void {
		this.traces.push([message, ...args].join(' '));
	}
}

type TestTerminalInstance = ITerminalInstance & {
	_testCommandHistory: { timestamp: number }[];
	_testSetDisposed(disposed: boolean): void;
	_testSetShellLaunchConfig(shellLaunchConfig: ITerminalInstance['shellLaunchConfig']): void;
};

function makeAgentSession(opts: {
	repository?: URI;
	worktree?: URI;
	providerType?: string;
	isArchived?: boolean;
}): ISessionData {
	const repo = opts.repository || opts.worktree ? {
		uri: opts.repository ?? opts.worktree!,
		workingDirectory: opts.worktree,
		detail: undefined,
		baseBranchProtected: undefined,
	} : undefined;
	return {
		sessionId: 'test:session',
		resource: URI.parse('file:///session'),
		providerId: 'test',
		sessionType: opts.providerType ?? AgentSessionProviders.Local,
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: observableValue('test.workspace', repo ? { label: 'test', icon: Codicon.repo, repositories: [repo], requiresWorkspaceTrust: false, } : undefined),
		title: observableValue('test.title', 'Test Session'),
		updatedAt: observableValue('test.updatedAt', new Date()),
		status: observableValue('test.status', 0),
		changes: observableValue('test.changes', []),
		modelId: observableValue('test.modelId', undefined),
		mode: observableValue('test.mode', undefined),
		loading: observableValue('test.loading', false),
		isArchived: observableValue('test.isArchived', opts.isArchived ?? false),
		isRead: observableValue('test.isRead', true),
		lastTurnEnd: observableValue('test.lastTurnEnd', undefined),
		description: observableValue('test.description', undefined),
		pullRequest: observableValue('test.pullRequest', undefined),
	};
}

function makeNonAgentSession(opts: { repository?: URI; worktree?: URI; providerType?: string }): ISessionData {
	const repo = opts.repository || opts.worktree ? {
		uri: opts.repository ?? opts.worktree!,
		workingDirectory: opts.worktree,
		detail: undefined,
		baseBranchProtected: undefined,
	} : undefined;
	return {
		sessionId: 'test:non-agent',
		resource: URI.parse('file:///session'),
		providerId: 'test',
		sessionType: opts.providerType ?? AgentSessionProviders.Local,
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: observableValue('test.workspace', repo ? { label: 'test', icon: Codicon.repo, repositories: [repo], requiresWorkspaceTrust: false, } : undefined),
		title: observableValue('test.title', 'Test Session'),
		updatedAt: observableValue('test.updatedAt', new Date()),
		status: observableValue('test.status', 0),
		changes: observableValue('test.changes', []),
		modelId: observableValue('test.modelId', undefined),
		mode: observableValue('test.mode', undefined),
		loading: observableValue('test.loading', false),
		isArchived: observableValue('test.isArchived', false),
		isRead: observableValue('test.isRead', true),
		lastTurnEnd: observableValue('test.lastTurnEnd', undefined),
		description: observableValue('test.description', undefined),
		pullRequest: observableValue('test.pullRequest', undefined),
	};
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
	let activeSessionObs: ReturnType<typeof observableValue<ISessionData | undefined>>;
	let onDidChangeSessions: Emitter<ISessionsChangeEvent>;
	let onDidCreateInstance: Emitter<ITerminalInstance>;

	let createdTerminals: { cwd: URI }[];
	let activeInstanceSet: number[];
	let focusCalls: number;
	let disposedInstances: ITerminalInstance[];
	let nextInstanceId: number;
	let terminalInstances: Map<number, ITerminalInstance>;
	let backgroundedInstances: Set<number>;
	let moveToBackgroundCalls: number[];
	let showBackgroundCalls: number[];
	let disposeOnCreatePaths: Set<string>;
	let logService: TestLogService;

	setup(() => {
		createdTerminals = [];
		activeInstanceSet = [];
		focusCalls = 0;
		disposedInstances = [];
		nextInstanceId = 1;
		terminalInstances = new Map();
		backgroundedInstances = new Set();
		moveToBackgroundCalls = [];
		showBackgroundCalls = [];
		disposeOnCreatePaths = new Set();
		logService = new TestLogService();

		const instantiationService = store.add(new TestInstantiationService());

		activeSessionObs = observableValue<ISessionData | undefined>('activeSession', undefined);
		onDidChangeSessions = store.add(new Emitter<ISessionsChangeEvent>());
		onDidCreateInstance = store.add(new Emitter<ITerminalInstance>());

		instantiationService.stub(ILogService, logService);

		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = activeSessionObs;
			override readonly onDidChangeSessions = onDidChangeSessions.event;
		});

		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidCreateInstance = onDidCreateInstance.event;
			override get instances(): readonly ITerminalInstance[] {
				return [...terminalInstances.values()];
			}
			override get foregroundInstances(): readonly ITerminalInstance[] {
				return [...terminalInstances.values()].filter(i => !backgroundedInstances.has(i.instanceId));
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
			}
			override async focusActiveInstance(): Promise<void> {
				focusCalls++;
			}
			override async safeDisposeTerminal(instance: ITerminalInstance): Promise<void> {
				disposedInstances.push(instance);
				(instance as TestTerminalInstance)._testSetDisposed(true);
				terminalInstances.delete(instance.instanceId);
				backgroundedInstances.delete(instance.instanceId);
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

	// --- Non-background providers: use home directory ---

	test('uses home directory for a cloud agent session', async () => {
		const session = makeAgentSession({ worktree: URI.file('/worktree'), repository: URI.file('/repo'), providerType: AgentSessionProviders.Cloud });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
	});

	test('uses home directory for a local agent session', async () => {
		const session = makeAgentSession({ worktree: URI.file('/worktree'), providerType: AgentSessionProviders.Local });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
	});

	test('uses home directory for a non-agent session', async () => {
		const session = makeNonAgentSession({ repository: URI.file('/repo') });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, HOME_DIR.fsPath);
	});

	test('does not recreate terminal when multiple non-background sessions share the home directory', async () => {
		const session1 = makeAgentSession({ providerType: AgentSessionProviders.Cloud });
		activeSessionObs.set(session1, undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		// Different non-background session — same home dir, no new terminal
		const session2 = makeAgentSession({ providerType: AgentSessionProviders.Local });
		activeSessionObs.set(session2, undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);
	});

	test('does not create a terminal when there is no active session', async () => {
		activeSessionObs.set(undefined, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 0);
	});

	test('does not recreate terminal for the same path', async () => {
		const worktreeUri = URI.file('/worktree');
		const session1 = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session1, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);

		// Setting a different session with the same worktree should not create a new terminal
		const session2 = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Background });
		activeSessionObs.set(session2, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
	});

	test('creates new terminal when switching to a different background path', async () => {
		const worktree1 = URI.file('/worktree1');
		const worktree2 = URI.file('/worktree2');

		activeSessionObs.set(makeAgentSession({ worktree: worktree1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ worktree: worktree2, providerType: AgentSessionProviders.Background }), undefined);
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

	test('closes terminals when session is archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		assert.strictEqual(createdTerminals.length, 1);

		const session = makeAgentSession({
			isArchived: true,
			worktree: worktreeUri,
		});
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		assert.strictEqual(disposedInstances.length, 1);
	});

	test('does not close terminals when session is not archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		const session = makeAgentSession({
			isArchived: false,
			worktree: worktreeUri,
		});
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0);
	});

	test('does not close terminals when archived session has no worktree', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		const session = makeAgentSession({ isArchived: true });
		onDidChangeSessions.fire({ added: [], removed: [], changed: [session] });
		await tick();

		assert.strictEqual(disposedInstances.length, 0);
	});

	test('closes terminals when session is removed', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		assert.strictEqual(createdTerminals.length, 1);

		const session = makeAgentSession({ worktree: worktreeUri });
		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await tick();

		assert.strictEqual(disposedInstances.length, 1);
	});

	// --- switching back to previously used path reuses terminal ---

	test('switching back to a previously used background path reuses the existing terminal', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2);

		// Switch back to cwd1 - should reuse terminal, not create a new one
		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2, 'should reuse the terminal for cwd1');
	});

	// --- Terminal visibility management (cwd-based) ---

	test('hides terminals from previous session when switching to a new session', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// The first terminal (id=1) should have been moved to background
		assert.ok(moveToBackgroundCalls.includes(1), 'terminal for cwd1 should be backgrounded');
		assert.ok(backgroundedInstances.has(1), 'terminal for cwd1 should remain backgrounded');
	});

	test('shows previously hidden terminals when switching back to their session', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// Switch back to cwd1
		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
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

		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ worktree: cwd3, providerType: AgentSessionProviders.Background }), undefined);
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

		activeSessionObs.set(makeAgentSession({ worktree: URI.file('/active'), providerType: AgentSessionProviders.Background }), undefined);
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

	test('visibility is determined by initial cwd, not by stored IDs', async () => {
		// Create a terminal externally (not via ensureTerminal) with a known cwd
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');
		const ext1 = makeTerminalInstance(nextInstanceId++, cwd1.fsPath);
		const ext2 = makeTerminalInstance(nextInstanceId++, cwd2.fsPath);
		terminalInstances.set(ext1.instanceId, ext1);
		terminalInstances.set(ext2.instanceId, ext2);

		// Switch to cwd1 — ext1 should stay visible, ext2 should be hidden
		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		assert.ok(!backgroundedInstances.has(ext1.instanceId), 'ext1 should be foreground (matching cwd)');
		assert.ok(backgroundedInstances.has(ext2.instanceId), 'ext2 should be backgrounded (non-matching cwd)');

		// Switch to cwd2 — ext2 should be shown, ext1 should be hidden
		activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		assert.ok(backgroundedInstances.has(ext1.instanceId), 'ext1 should now be backgrounded');
		assert.ok(!backgroundedInstances.has(ext2.instanceId), 'ext2 should now be foreground');
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
});

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
