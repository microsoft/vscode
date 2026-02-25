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

function makeNonAgentSession(opts: { repository?: URI; worktree?: URI }): IActiveSessionItem {
	return {
		repository: opts.repository,
		worktree: opts.worktree,
	} as IActiveSessionItem;
}

suite('SessionsTerminalContribution', () => {

	const store = new DisposableStore();
	let contribution: SessionsTerminalContribution;
	let activeSessionObs: ReturnType<typeof observableValue<IActiveSessionItem | undefined>>;
	let onDidChangeSessionArchivedState: Emitter<IAgentSession>;
	let onDidDisposeInstance: Emitter<ITerminalInstance>;

	let createdTerminals: { cwd: URI }[];
	let activeInstanceSet: number[];
	let focusCalls: number;
	let disposedInstances: ITerminalInstance[];
	let nextInstanceId: number;
	let terminalInstances: Map<number, ITerminalInstance>;

	setup(() => {
		createdTerminals = [];
		activeInstanceSet = [];
		focusCalls = 0;
		disposedInstances = [];
		nextInstanceId = 1;
		terminalInstances = new Map();

		const instantiationService = store.add(new TestInstantiationService());

		activeSessionObs = observableValue('activeSession', undefined);
		onDidChangeSessionArchivedState = store.add(new Emitter<IAgentSession>());
		onDidDisposeInstance = store.add(new Emitter<ITerminalInstance>());

		instantiationService.stub(ILogService, new NullLogService());

		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override activeSession = activeSessionObs;
		});

		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onDidDisposeInstance = onDidDisposeInstance.event;
			override async createTerminal(opts?: any): Promise<ITerminalInstance> {
				const id = nextInstanceId++;
				const instance = { instanceId: id } as ITerminalInstance;
				createdTerminals.push({ cwd: opts?.config?.cwd });
				terminalInstances.set(id, instance);
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
			}
		});

		instantiationService.stub(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
			override model = {
				onDidChangeSessionArchivedState: onDidChangeSessionArchivedState.event,
			} as unknown as IAgentSessionsModel;
		});

		contribution = store.add(instantiationService.createInstance(SessionsTerminalContribution));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// --- getSessionCwd logic (via active session changes) ---

	test('creates a terminal when active session has a worktree (non-cloud agent)', async () => {
		const worktreeUri = URI.file('/worktree');
		const session = makeAgentSession({ worktree: worktreeUri, repository: URI.file('/repo'), providerType: AgentSessionProviders.Local });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
	});

	test('creates a terminal with repository for cloud agent sessions', async () => {
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({ worktree: URI.file('/worktree'), repository: repoUri, providerType: AgentSessionProviders.Cloud });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
	});

	test('creates a terminal with repository for non-agent sessions', async () => {
		const repoUri = URI.file('/repo');
		const session = makeNonAgentSession({ repository: repoUri });
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
	});

	test('does not create a terminal when no path is available', async () => {
		const session = makeNonAgentSession({});
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 0);
	});

	test('does not recreate terminal for the same path', async () => {
		const worktreeUri = URI.file('/worktree');
		const session1 = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Local });
		activeSessionObs.set(session1, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);

		// Setting a different session with the same worktree should not create a new terminal
		const session2 = makeAgentSession({ worktree: worktreeUri, providerType: AgentSessionProviders.Local });
		activeSessionObs.set(session2, undefined);
		await tick();

		assert.strictEqual(createdTerminals.length, 1);
	});

	test('creates new terminal when switching to a different path', async () => {
		const worktree1 = URI.file('/worktree1');
		const worktree2 = URI.file('/worktree2');

		activeSessionObs.set(makeAgentSession({ worktree: worktree1, providerType: AgentSessionProviders.Local }), undefined);
		await tick();

		activeSessionObs.set(makeAgentSession({ worktree: worktree2, providerType: AgentSessionProviders.Local }), undefined);
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

	// --- agent session with worktree preferred over repository for non-cloud ---

	test('prefers worktree over repository for local agent session', async () => {
		const worktreeUri = URI.file('/worktree');
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({
			worktree: worktreeUri,
			repository: repoUri,
			providerType: AgentSessionProviders.Local,
		});
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals[0].cwd.fsPath, worktreeUri.fsPath);
	});

	test('falls back to repository when worktree is undefined for agent session', async () => {
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({
			repository: repoUri,
			providerType: AgentSessionProviders.Local,
		});
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
	});

	test('uses repository for cloud agent session even when worktree exists', async () => {
		const worktreeUri = URI.file('/worktree');
		const repoUri = URI.file('/repo');
		const session = makeAgentSession({
			worktree: worktreeUri,
			repository: repoUri,
			providerType: AgentSessionProviders.Cloud,
		});
		activeSessionObs.set(session, undefined);
		await tick();

		assert.strictEqual(createdTerminals[0].cwd.fsPath, repoUri.fsPath);
	});

	// --- switching back to previously used path reuses terminal ---

	test('switching back to a previously used path reuses the existing terminal', async () => {
		const cwd1 = URI.file('/cwd1');
		const cwd2 = URI.file('/cwd2');

		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Local }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 1);

		activeSessionObs.set(makeAgentSession({ worktree: cwd2, providerType: AgentSessionProviders.Local }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2);

		// Switch back to cwd1 - should reuse terminal, not create a new one
		activeSessionObs.set(makeAgentSession({ worktree: cwd1, providerType: AgentSessionProviders.Local }), undefined);
		await tick();
		assert.strictEqual(createdTerminals.length, 2, 'should reuse the terminal for cwd1');
	});
});

function tick(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}
