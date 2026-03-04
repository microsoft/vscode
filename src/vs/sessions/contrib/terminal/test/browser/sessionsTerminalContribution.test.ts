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
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IActiveSessionItem, ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { SessionsTerminalContribution } from '../../browser/sessionsTerminalContribution.js';
import { TestPathService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';

const HOME_DIR = URI.file('/home/user');

function makeAgentSession(opts: {
	repository?: URI;
	worktree?: URI;
	providerType?: string;
	isArchived?: boolean;
	worktreePath?: string;
}): IActiveSessionItem & IAgentSession {
	return {
		resource: URI.parse('file:///session'),
		repository: opts.repository,
		worktree: opts.worktree,
		providerType: opts.providerType ?? AgentSessionProviders.Local,
		setArchived: () => { },
		setRead: () => { },
		isArchived: () => opts.isArchived ?? false,
		isRead: () => true,
		metadata: opts.worktreePath ? { worktreePath: opts.worktreePath } : undefined,
	} as unknown as IActiveSessionItem & IAgentSession;
}

function makeNonAgentSession(opts: { repository?: URI; worktree?: URI; providerType?: string }): IActiveSessionItem {
	return {
		repository: opts.repository,
		worktree: opts.worktree,
		providerType: opts.providerType ?? AgentSessionProviders.Local,
	} as IActiveSessionItem;
}

suite('SessionsTerminalContribution', () => {

	const store = new DisposableStore();
	let contribution: SessionsTerminalContribution;
	let activeSessionObs: ReturnType<typeof observableValue<IActiveSessionItem | undefined>>;
	let onDidChangeSessionArchivedState: Emitter<IAgentSession>;
	let onDidDisposeInstance: Emitter<ITerminalInstance>;

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

		const instantiationService = store.add(new TestInstantiationService());

		activeSessionObs = observableValue('activeSession', undefined);
		onDidChangeSessionArchivedState = store.add(new Emitter<IAgentSession>());
		onDidDisposeInstance = store.add(new Emitter<ITerminalInstance>());
		onDidCreateInstance = store.add(new Emitter<ITerminalInstance>());

		instantiationService.stub(ILogService, new NullLogService());

		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = activeSessionObs;
		});

		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidDisposeInstance = onDidDisposeInstance.event;
			override onDidCreateInstance = onDidCreateInstance.event;
			override get foregroundInstances(): readonly ITerminalInstance[] {
				return [...terminalInstances.values()].filter(i => !backgroundedInstances.has(i.instanceId));
			}
			override async createTerminal(opts?: any): Promise<ITerminalInstance> {
				const id = nextInstanceId++;
				const instance = { instanceId: id } as ITerminalInstance;
				createdTerminals.push({ cwd: opts?.config?.cwd });
				terminalInstances.set(id, instance);
				onDidCreateInstance.fire(instance);
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

		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override model = {
				onDidChangeSessionArchivedState: onDidChangeSessionArchivedState.event,
			} as unknown as IAgentSessionsModel;
		});

		instantiationService.stub(IPathService, new TestPathService(HOME_DIR));

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
		assert.strictEqual(activeInstanceSet.length, 2, 'should set active instance both times');
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

	// --- onDidChangeSessionArchivedState ---

	test('closes terminals when session is archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		assert.strictEqual(createdTerminals.length, 1);

		const session = makeAgentSession({
			isArchived: true,
			worktreePath: worktreeUri.fsPath,
		});
		onDidChangeSessionArchivedState.fire(session);

		assert.strictEqual(disposedInstances.length, 1);
	});

	test('does not close terminals when session is not archived', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		const session = makeAgentSession({
			isArchived: false,
			worktreePath: worktreeUri.fsPath,
		});
		onDidChangeSessionArchivedState.fire(session);

		assert.strictEqual(disposedInstances.length, 0);
	});

	test('does not close terminals when archived session has no worktreePath', async () => {
		const worktreeUri = URI.file('/worktree');
		await contribution.ensureTerminal(worktreeUri, false);

		const session = makeAgentSession({ isArchived: true });
		onDidChangeSessionArchivedState.fire(session);

		assert.strictEqual(disposedInstances.length, 0);
	});

	// --- onDidDisposeInstance ---

	test('cleans up path mapping when terminal is disposed externally', async () => {
		const cwd = URI.file('/test-cwd');
		await contribution.ensureTerminal(cwd, false);
		assert.strictEqual(createdTerminals.length, 1);

		// Simulate external disposal of the terminal
		const instanceId = activeInstanceSet[0];
		const instance = terminalInstances.get(instanceId)!;
		onDidDisposeInstance.fire(instance);

		// Now ensureTerminal should create a new one since the mapping was cleaned up
		await contribution.ensureTerminal(cwd, false);
		assert.strictEqual(createdTerminals.length, 2, 'should create a new terminal after the old one was disposed');
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

	// --- Terminal visibility management ---

	test('hides terminals from previous session when switching to a new session', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();
		const firstTerminalId = createdTerminals.length;
		assert.strictEqual(firstTerminalId, 1);

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

	test('hides restored terminals that do not belong to the active session', async () => {
		// Set an active session first
		const cwd1 = URI.file('/cwd1');
		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Background }), undefined);
		await tick();

		// Simulate a terminal being restored (e.g. on startup) that is not tracked
		const restoredInstance = { instanceId: nextInstanceId++ } as ITerminalInstance;
		terminalInstances.set(restoredInstance.instanceId, restoredInstance);
		onDidCreateInstance.fire(restoredInstance);

		// The restored terminal should be moved to background
		assert.ok(moveToBackgroundCalls.includes(restoredInstance.instanceId), 'restored terminal should be backgrounded');
	});

	test('does not hide restored terminals before any session is active', async () => {
		// Simulate a terminal being restored before any session is active
		const restoredInstance = { instanceId: nextInstanceId++ } as ITerminalInstance;
		terminalInstances.set(restoredInstance.instanceId, restoredInstance);
		onDidCreateInstance.fire(restoredInstance);

		assert.strictEqual(moveToBackgroundCalls.length, 0, 'should not background before any session is active');
	});

	test('ensureTerminal shows a backgrounded terminal instead of creating a new one', async () => {
		const cwd = URI.file('/test-cwd');
		await contribution.ensureTerminal(cwd, false);
		const instanceId = activeInstanceSet[0];

		// Manually background it
		backgroundedInstances.add(instanceId);

		// ensureTerminal should show it, not create a new one
		await contribution.ensureTerminal(cwd, false);

		assert.strictEqual(createdTerminals.length, 1, 'should not create a new terminal');
		assert.ok(showBackgroundCalls.includes(instanceId), 'should show the backgrounded terminal');
	});
});

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
