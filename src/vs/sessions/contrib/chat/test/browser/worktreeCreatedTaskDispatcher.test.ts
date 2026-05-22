/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsTasksService, ISessionTaskWithTarget, ITaskEntry } from '../../browser/sessionsTasksService.js';
import { WorktreeCreatedTaskDispatcher } from '../../browser/worktreeCreatedTaskDispatcher.js';

interface ITestSession {
	readonly session: ISession;
	readonly loading: ReturnType<typeof observableValue<boolean>>;
	readonly status: ReturnType<typeof observableValue<SessionStatus>>;
	readonly workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
}

function makeWorkspace(hasWorktree: boolean): ISessionWorkspace {
	const root = URI.parse('file:///repo');
	const workTreeUri = hasWorktree ? URI.parse('file:///repo-worktree') : undefined;
	return {
		uri: root,
		label: 'repo',
		icon: Codicon.folder,
		folders: [{
			root,
			workingDirectory: workTreeUri ?? root,
			name: 'repo',
			description: undefined,
			gitRepository: { uri: root, workTreeUri, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
		}],
		requiresWorkspaceTrust: true,
		isVirtualWorkspace: false,
	};
}

function makeSession(opts: { id?: string; runsWorktreeCreatedTasks?: boolean; loading?: boolean; status?: SessionStatus; hasWorktree?: boolean } = {}): ITestSession {
	const loading = observableValue('loading', opts.loading ?? false);
	const status = observableValue('status', opts.status ?? SessionStatus.InProgress);
	const workspace = observableValue<ISessionWorkspace | undefined>('workspace', makeWorkspace(opts.hasWorktree ?? true));
	const chat = { resource: URI.parse('file:///session') } as IChat;
	const session: ISession = {
		sessionId: opts.id ?? 'test:session',
		resource: chat.resource,
		providerId: 'test',
		sessionType: 'background',
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace,
		title: observableValue('title', 'session'),
		updatedAt: observableValue('updatedAt', new Date()),
		status,
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		loading,
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
		chats: observableValue('chats', [chat]),
		mainChat: constObservable(chat),
		capabilities: { supportsMultipleChats: false, runsWorktreeCreatedTasks: opts.runsWorktreeCreatedTasks },
	};
	return { session, loading, status, workspace };
}

function entry(label: string, runOn?: 'worktreeCreated' | 'folderOpen' | 'default'): ISessionTaskWithTarget {
	const task: ITaskEntry = {
		label,
		type: 'shell',
		command: label,
		runOptions: runOn ? { runOn } : undefined,
	};
	return { task, target: 'workspace' };
}

class FakeSessionsTasksService implements Partial<ISessionsTasksService> {
	declare readonly _serviceBrand: undefined;
	readonly ranTasks: { label: string; sessionId: string }[] = [];
	private readonly _tasks = new Map<string, readonly ISessionTaskWithTarget[]>();
	runTaskFails = false;

	setTasks(sessionId: string, tasks: readonly ISessionTaskWithTarget[]): void {
		this._tasks.set(sessionId, tasks);
	}

	async getSessionTasksOnce(session: ISession): Promise<readonly ISessionTaskWithTarget[]> {
		return this._tasks.get(session.sessionId) ?? [];
	}

	async runTask(task: ITaskEntry, session: ISession): Promise<void> {
		this.ranTasks.push({ label: task.label, sessionId: session.sessionId });
		if (this.runTaskFails) {
			throw new Error('simulated launch failure');
		}
	}
}

class FakeSessionsManagementService implements Partial<ISessionsManagementService> {
	declare readonly _serviceBrand: undefined;
	readonly emitter = new Emitter<ISessionsChangeEvent>();
	readonly onDidChangeSessions = this.emitter.event;
	sessions: ISession[] = [];
	getSessions(): ISession[] { return this.sessions; }
}

suite('WorktreeCreatedTaskDispatcher', () => {

	const store = new DisposableStore();
	let tasks: FakeSessionsTasksService;
	let mgmt: FakeSessionsManagementService;

	function createDispatcher(): WorktreeCreatedTaskDispatcher {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsTasksService, tasks as unknown as ISessionsTasksService);
		instantiationService.stub(ISessionsManagementService, mgmt as unknown as ISessionsManagementService);
		instantiationService.stub(ILogService, new NullLogService());
		return store.add(instantiationService.createInstance(WorktreeCreatedTaskDispatcher));
	}

	setup(() => {
		tasks = new FakeSessionsTasksService();
		mgmt = new FakeSessionsManagementService();
	});

	teardown(() => {
		mgmt.emitter.dispose();
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function settle(): Promise<void> {
		await new Promise(r => setTimeout(r, 0));
	}

	test('runs worktreeCreated tasks once for a newly added session', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('setup', 'worktreeCreated'),
			entry('lint'),
		]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('runTask failures are logged but do not abort the loop', async () => {
		createDispatcher();
		tasks.runTaskFails = true;
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('setup-a', 'worktreeCreated'),
			entry('setup-b', 'worktreeCreated'),
		]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		// Both tasks are attempted even though each throws.
		assert.deepStrictEqual(tasks.ranTasks, [
			{ label: 'setup-a', sessionId: 'a' },
			{ label: 'setup-b', sessionId: 'a' },
		]);
	});

	test('does not re-dispatch when loading flickers', async () => {
		createDispatcher();
		const { session, loading } = makeSession({ id: 'a', loading: true });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();

		loading.set(false, undefined);
		await settle();
		// Flip loading back to true and false again — dispatch must not retrigger.
		loading.set(true, undefined);
		await settle();
		loading.set(false, undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('per-session task lists do not cross-contaminate', async () => {
		createDispatcher();
		const { session: sessionA, workspace: workspaceA } = makeSession({ id: 'a', hasWorktree: false });
		const { session: sessionB, workspace: workspaceB } = makeSession({ id: 'b', hasWorktree: false });
		tasks.setTasks(sessionA.sessionId, [entry('setup-a', 'worktreeCreated')]);
		tasks.setTasks(sessionB.sessionId, [entry('setup-b', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [sessionA, sessionB], removed: [], changed: [] });
		workspaceA.set(makeWorkspace(true), undefined);
		workspaceB.set(makeWorkspace(true), undefined);
		await settle();

		// Each task fires against its own session.
		assert.deepStrictEqual(
			[...tasks.ranTasks].sort((x, y) => x.label.localeCompare(y.label)),
			[
				{ label: 'setup-a', sessionId: 'a' },
				{ label: 'setup-b', sessionId: 'b' },
			]
		);
	});

	test('skips sessions whose runtime already runs worktreeCreated tasks', async () => {
		createDispatcher();
		const { session } = makeSession({ id: 'a', runsWorktreeCreatedTasks: true });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('waits for loading to flip to false before running', async () => {
		createDispatcher();
		const { session, loading } = makeSession({ id: 'a', loading: true });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, []);

		loading.set(false, undefined);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('ignores tasks without runOn worktreeCreated', async () => {
		createDispatcher();
		const { session } = makeSession({ id: 'a' });
		tasks.setTasks(session.sessionId, [
			entry('default'),
			entry('on-open', 'folderOpen'),
			entry('explicit-default', 'default'),
		]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('does not run for sessions present at startup', async () => {
		const { session } = makeSession({ id: 'a' });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.sessions = [session];

		createDispatcher();
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('tracks pending untitled sessions present at startup', async () => {
		const { session, status, workspace } = makeSession({
			id: 'a',
			status: SessionStatus.Untitled,
			hasWorktree: false
		});
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.sessions = [session];

		createDispatcher();
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, []);

		status.set(SessionStatus.InProgress, undefined);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('does not run for restored sessions reported as added after startup', async () => {
		createDispatcher();
		const { session } = makeSession({ id: 'a' });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('runs for committed replacement of tracked pending session', async () => {
		createDispatcher();
		const { session: pending } = makeSession({ id: 'pending', hasWorktree: false });
		const { session: committed } = makeSession({ id: 'committed', hasWorktree: true });
		tasks.setTasks(committed.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.emitter.fire({ added: [pending], removed: [], changed: [] });
		await settle();
		mgmt.emitter.fire({ added: [], removed: [pending], changed: [committed] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'committed' }]);
	});

	test('does not treat mixed changed sessions as pending replacements', async () => {
		createDispatcher();
		const { session: pending } = makeSession({ id: 'pending', hasWorktree: false });
		const { session: committed } = makeSession({ id: 'committed', hasWorktree: true });
		const { session: restored } = makeSession({ id: 'restored', hasWorktree: true });
		tasks.setTasks(committed.sessionId, [entry('setup-committed', 'worktreeCreated')]);
		tasks.setTasks(restored.sessionId, [entry('setup-restored', 'worktreeCreated')]);

		mgmt.emitter.fire({ added: [pending], removed: [], changed: [] });
		await settle();
		mgmt.emitter.fire({ added: [], removed: [pending], changed: [committed, restored] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('does not treat dispatched sessions as pending replacements', async () => {
		createDispatcher();
		const { session: dispatched, workspace } = makeSession({ id: 'dispatched', hasWorktree: false });
		const { session: changed } = makeSession({ id: 'changed', hasWorktree: true });
		tasks.setTasks(dispatched.sessionId, [entry('setup-dispatched', 'worktreeCreated')]);
		tasks.setTasks(changed.sessionId, [entry('setup-changed', 'worktreeCreated')]);

		mgmt.emitter.fire({ added: [dispatched], removed: [], changed: [] });
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		mgmt.emitter.fire({ added: [], removed: [dispatched], changed: [changed] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup-dispatched', sessionId: 'dispatched' }]);
	});

	test('waits for a worktree before running', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, []);

		workspace.set(makeWorkspace(true), undefined);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('waits for untitled sessions to start before running', async () => {
		createDispatcher();
		const { session, status } = makeSession({ id: 'a', status: SessionStatus.Untitled });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, []);

		status.set(SessionStatus.InProgress, undefined);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('tears down subscription when a session is removed', async () => {
		createDispatcher();
		const { session } = makeSession({ id: 'a' });
		// No tasks yet — autorun should be subscribed but inert.
		mgmt.emitter.fire({ added: [session], removed: [], changed: [] });
		await settle();

		mgmt.emitter.fire({ added: [], removed: [session], changed: [] });
		// Now publish tasks; if the subscription still exists, it would run.
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});
});
