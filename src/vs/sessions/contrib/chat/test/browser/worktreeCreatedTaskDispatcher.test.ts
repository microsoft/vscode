/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionTaskRunOptions } from '../../browser/sessionTaskRunner.js';
import { ISessionsTasksService, ISessionTaskWithTarget, ITaskEntry, TaskStorageTarget } from '../../browser/sessionsTasksService.js';
import { AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, WorktreeCreatedTaskDispatcher } from '../../browser/worktreeCreatedTaskDispatcher.js';

interface ITestSession {
	readonly session: ISession;
	readonly loading: ReturnType<typeof observableValue<boolean>>;
	readonly status: ReturnType<typeof observableValue<SessionStatus>>;
	readonly workspace: ReturnType<typeof observableValue<ISessionWorkspace | undefined>>;
	readonly isArchived: ReturnType<typeof observableValue<boolean>>;
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

function makeSession(opts: { id?: string; providerId?: string; runsWorktreeCreatedTasks?: boolean; loading?: boolean; status?: SessionStatus; hasWorktree?: boolean } = {}): ITestSession {
	const loading = observableValue('loading', opts.loading ?? false);
	const status = observableValue('status', opts.status ?? SessionStatus.InProgress);
	const workspace = observableValue<ISessionWorkspace | undefined>('workspace', makeWorkspace(opts.hasWorktree ?? true));
	const isArchived = observableValue('isArchived', false);
	const chat = { resource: URI.parse('file:///session') } as IChat;
	const session: ISession = {
		sessionId: opts.id ?? 'test:session',
		resource: chat.resource,
		providerId: opts.providerId ?? 'test',
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
		isArchived,
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
		chats: observableValue('chats', [chat]),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false, runsWorktreeCreatedTasks: opts.runsWorktreeCreatedTasks }),
	};
	return { session, loading, status, workspace, isArchived };
}

function entry(label: string, runOn?: 'worktreeCreated' | 'folderOpen' | 'default', target: TaskStorageTarget = 'workspace', dependsOn?: string | readonly string[]): ISessionTaskWithTarget {
	const task: ITaskEntry = {
		label,
		type: 'shell',
		command: label,
		runOptions: runOn ? { runOn } : undefined,
		dependsOn,
	};
	return { task, target };
}

class FakeSessionsTasksService implements Partial<ISessionsTasksService> {
	declare readonly _serviceBrand: undefined;
	readonly ranTasks: { label: string; sessionId: string }[] = [];
	readonly runOptions: (ISessionTaskRunOptions | undefined)[] = [];
	readonly stoppedTasks: { label: string; sessionId: string }[] = [];
	private readonly _tasks = new Map<string, readonly ISessionTaskWithTarget[]>();
	runTaskFails = false;
	runTaskResultPromise: Promise<IDisposable | undefined> | undefined;

	setTasks(sessionId: string, tasks: readonly ISessionTaskWithTarget[]): void {
		this._tasks.set(sessionId, tasks);
	}

	async getSessionTasksOnce(session: ISession): Promise<readonly ISessionTaskWithTarget[]> {
		return this._tasks.get(session.sessionId) ?? [];
	}

	async runTask(task: ITaskEntry, session: ISession, options?: ISessionTaskRunOptions): Promise<IDisposable | undefined> {
		this.ranTasks.push({ label: task.label, sessionId: session.sessionId });
		this.runOptions.push(options);
		if (this.runTaskFails) {
			throw new Error('simulated launch failure');
		}
		if (this.runTaskResultPromise) {
			return this.runTaskResultPromise;
		}
		return toDisposable(() => this.stoppedTasks.push({ label: task.label, sessionId: session.sessionId }));
	}
}

class FakeDialogService extends mock<IDialogService>() {
	readonly confirmations: IConfirmation[] = [];
	confirmed = true;
	confirmError: Error | undefined;
	confirmationPromise: Promise<IConfirmationResult> | undefined;

	override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.confirmations.push(confirmation);
		if (this.confirmError) {
			throw this.confirmError;
		}
		return this.confirmationPromise ?? { confirmed: this.confirmed };
	}
}

class FakeSessionsManagementService implements Partial<ISessionsManagementService> {
	declare readonly _serviceBrand: undefined;
	readonly sessionStartedEmitter = new Emitter<ISession>();
	readonly sessionsChangedEmitter = new Emitter<ISessionsChangeEvent>();
	readonly onDidStartSession = this.sessionStartedEmitter.event;
	readonly onDidChangeSessions = this.sessionsChangedEmitter.event;
	getSessions(): ISession[] { return []; }
}

suite('WorktreeCreatedTaskDispatcher', () => {

	const store = new DisposableStore();
	let tasks: FakeSessionsTasksService;
	let mgmt: FakeSessionsManagementService;
	let configurationService: TestConfigurationService;
	let dialogService: FakeDialogService;

	function createDispatcher(): WorktreeCreatedTaskDispatcher {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsTasksService, tasks as unknown as ISessionsTasksService);
		instantiationService.stub(ISessionsManagementService, mgmt as unknown as ISessionsManagementService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IDialogService, dialogService);
		instantiationService.stub(ILogService, new NullLogService());
		return store.add(instantiationService.createInstance(WorktreeCreatedTaskDispatcher));
	}

	setup(() => {
		tasks = new FakeSessionsTasksService();
		mgmt = new FakeSessionsManagementService();
		configurationService = new TestConfigurationService();
		dialogService = new FakeDialogService();
	});

	teardown(() => {
		mgmt.sessionStartedEmitter.dispose();
		mgmt.sessionsChangedEmitter.dispose();
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function settle(): Promise<void> {
		await new Promise(r => setTimeout(r, 0));
	}

	test('runs worktreeCreated tasks once for a newly started session', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('setup', 'worktreeCreated'),
			entry('lint'),
		]);

		mgmt.sessionStartedEmitter.fire(session);
		await settle();
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
		assert.deepStrictEqual(dialogService.confirmations.map(confirmation => confirmation.message), ['Run Automatic Tasks from This Worktree?']);
		assert.deepStrictEqual(tasks.runOptions.map(options => ({
			taskTarget: options?.taskTarget,
			allowWorkspaceTaskDependencies: options?.allowWorkspaceTaskDependencies,
			cancelled: options?.token?.isCancellationRequested,
		})), [{ taskTarget: 'workspace', allowWorkspaceTaskDependencies: true, cancelled: false }]);
	});

	test('does not run workspace tasks without confirmation', async () => {
		dialogService.confirmed = false;
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
		assert.strictEqual(dialogService.confirmations.length, 1);
	});

	test('runs user tasks without confirmation', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated', 'user')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
		assert.deepStrictEqual(dialogService.confirmations, []);
		assert.deepStrictEqual(tasks.runOptions.map(options => ({
			taskTarget: options?.taskTarget,
			allowWorkspaceTaskDependencies: options?.allowWorkspaceTaskDependencies,
			cancelled: options?.token?.isCancellationRequested,
		})), [{ taskTarget: 'user', allowWorkspaceTaskDependencies: false, cancelled: false }]);
	});

	test('runs only user tasks when workspace task confirmation is declined', async () => {
		dialogService.confirmed = false;
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('workspace setup', 'worktreeCreated'),
			entry('user setup', 'worktreeCreated', 'user'),
		]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'user setup', sessionId: 'a' }]);
		assert.deepStrictEqual(tasks.runOptions.map(options => ({
			taskTarget: options?.taskTarget,
			allowWorkspaceTaskDependencies: options?.allowWorkspaceTaskDependencies,
			cancelled: options?.token?.isCancellationRequested,
		})), [{ taskTarget: 'user', allowWorkspaceTaskDependencies: false, cancelled: false }]);
	});

	test('requires confirmation when a user task has dependencies', async () => {
		dialogService.confirmed = false;
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated', 'user', 'workspace dependency')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
		assert.strictEqual(dialogService.confirmations.length, 1);
	});

	test('does not require confirmation for a user task with empty dependsOn', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated', 'user', [])]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
		assert.deepStrictEqual(dialogService.confirmations, []);
	});

	test('prompts once for multiple workspace tasks', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('setup-a', 'worktreeCreated'),
			entry('setup-b', 'worktreeCreated'),
		]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [
			{ label: 'setup-a', sessionId: 'a' },
			{ label: 'setup-b', sessionId: 'a' },
		]);
		assert.strictEqual(dialogService.confirmations.length, 1);
	});

	test('fails closed when confirmation cannot be shown', async () => {
		dialogService.confirmError = new Error('simulated dialog failure');
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('workspace setup', 'worktreeCreated'),
			entry('user setup', 'worktreeCreated', 'user'),
		]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'user setup', sessionId: 'a' }]);
	});

	test('does not run for sessions only reported via onDidChangeSessions.added', async () => {
		createDispatcher();
		const { session } = makeSession({ id: 'restored' });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionsChangedEmitter.fire({ added: [session], removed: [], changed: [] });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('runTask failures are logged but do not abort the loop', async () => {
		createDispatcher();
		tasks.runTaskFails = true;
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [
			entry('setup-a', 'worktreeCreated'),
			entry('setup-b', 'worktreeCreated'),
		]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [
			{ label: 'setup-a', sessionId: 'a' },
			{ label: 'setup-b', sessionId: 'a' },
		]);
	});

	test('does not re-dispatch when loading flickers', async () => {
		createDispatcher();
		const { session, loading } = makeSession({ id: 'a', loading: true });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		await settle();

		loading.set(false, undefined);
		await settle();
		loading.set(true, undefined);
		await settle();
		loading.set(false, undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('waits for untitled sessions to start before running', async () => {
		createDispatcher();
		const { session, status } = makeSession({ id: 'a', status: SessionStatus.Untitled });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, []);

		status.set(SessionStatus.InProgress, undefined);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('tears down subscription when a started session is removed', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		mgmt.sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('does not run after the session is removed while confirmation is pending', async () => {
		let resolveConfirmation!: (result: IConfirmationResult) => void;
		dialogService.confirmationPromise = new Promise(resolve => resolveConfirmation = resolve);
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		mgmt.sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
		resolveConfirmation({ confirmed: true });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('does not run after the session is archived while confirmation is pending', async () => {
		let resolveConfirmation!: (result: IConfirmationResult) => void;
		dialogService.confirmationPromise = new Promise(resolve => resolveConfirmation = resolve);
		createDispatcher();
		const { session, workspace, isArchived } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		isArchived.set(true, undefined);
		resolveConfirmation({ confirmed: true });
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('disposes a task that finishes launching after the session is removed', async () => {
		let resolveRunTask!: (handle: IDisposable) => void;
		let lateHandleDisposed = false;
		tasks.runTaskResultPromise = new Promise(resolve => resolveRunTask = resolve);
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		mgmt.sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
		resolveRunTask(toDisposable(() => lateHandleDisposed = true));
		await settle();

		assert.strictEqual(tasks.runOptions[0]?.token?.isCancellationRequested, true);
		assert.strictEqual(lateHandleDisposed, true);
	});

	test('disposes a task that finishes launching after the session is archived', async () => {
		let resolveRunTask!: (handle: IDisposable) => void;
		let lateHandleDisposed = false;
		tasks.runTaskResultPromise = new Promise(resolve => resolveRunTask = resolve);
		createDispatcher();
		const { session, workspace, isArchived } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		isArchived.set(true, undefined);
		resolveRunTask(toDisposable(() => lateHandleDisposed = true));
		await settle();

		assert.strictEqual(tasks.runOptions[0]?.token?.isCancellationRequested, true);
		assert.strictEqual(lateHandleDisposed, true);
	});

	test('skips sessions whose runtime already runs worktreeCreated tasks', async () => {
		createDispatcher();
		const { session } = makeSession({ id: 'a', runsWorktreeCreatedTasks: true });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('skips agent host sessions when the setting is disabled', async () => {
		await configurationService.setUserConfiguration(AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, false);
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
	});

	test('runs agent host sessions when the setting is enabled', async () => {
		await configurationService.setUserConfiguration(AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, true);
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', providerId: LOCAL_AGENT_HOST_PROVIDER_ID, hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('does not gate non-agent-host sessions on the agent host setting', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', providerId: 'non-agent-host', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('stops dispatched tasks when the session is marked done (archived)', async () => {
		createDispatcher();
		const { session, workspace, isArchived } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		assert.deepStrictEqual(tasks.stoppedTasks, []);

		isArchived.set(true, undefined);
		await settle();

		assert.deepStrictEqual(tasks.stoppedTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('stops dispatched tasks when a started session is removed', async () => {
		createDispatcher();
		const { session, workspace } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		workspace.set(makeWorkspace(true), undefined);
		await settle();
		assert.deepStrictEqual(tasks.ranTasks, [{ label: 'setup', sessionId: 'a' }]);

		mgmt.sessionsChangedEmitter.fire({ added: [], removed: [session], changed: [] });
		await settle();

		assert.deepStrictEqual(tasks.stoppedTasks, [{ label: 'setup', sessionId: 'a' }]);
	});

	test('does not launch tasks for a session that is already archived', async () => {
		createDispatcher();
		const { session, workspace, isArchived } = makeSession({ id: 'a', hasWorktree: false });
		tasks.setTasks(session.sessionId, [entry('setup', 'worktreeCreated')]);

		mgmt.sessionStartedEmitter.fire(session);
		isArchived.set(true, undefined);
		workspace.set(makeWorkspace(true), undefined);
		await settle();

		assert.deepStrictEqual(tasks.ranTasks, []);
		assert.deepStrictEqual(tasks.stoppedTasks, []);
	});
});
