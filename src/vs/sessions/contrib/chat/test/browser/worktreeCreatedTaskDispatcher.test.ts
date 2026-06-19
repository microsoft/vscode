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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IChat, ISession, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsTasksService, ISessionTaskWithTarget, ITaskEntry } from '../../browser/sessionsTasksService.js';
import { AGENT_HOST_RUN_WORKTREE_CREATED_TASKS_SETTING, WorktreeCreatedTaskDispatcher } from '../../browser/worktreeCreatedTaskDispatcher.js';

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

function makeSession(opts: { id?: string; providerId?: string; runsWorktreeCreatedTasks?: boolean; loading?: boolean; status?: SessionStatus; hasWorktree?: boolean } = {}): ITestSession {
	const loading = observableValue('loading', opts.loading ?? false);
	const status = observableValue('status', opts.status ?? SessionStatus.InProgress);
	const workspace = observableValue<ISessionWorkspace | undefined>('workspace', makeWorkspace(opts.hasWorktree ?? true));
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

	function createDispatcher(): WorktreeCreatedTaskDispatcher {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsTasksService, tasks as unknown as ISessionsTasksService);
		instantiationService.stub(ISessionsManagementService, mgmt as unknown as ISessionsManagementService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(ILogService, new NullLogService());
		return store.add(instantiationService.createInstance(WorktreeCreatedTaskDispatcher));
	}

	setup(() => {
		tasks = new FakeSessionsTasksService();
		mgmt = new FakeSessionsManagementService();
		configurationService = new TestConfigurationService();
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
});
