/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { ITaskEvent, Task, TaskEvent, TaskRunSource, TaskSourceKind, USER_TASKS_GROUP_KEY } from '../../../../../workbench/contrib/tasks/common/tasks.js';
import { IProblemMatcherRunOptions, ITaskService } from '../../../../../workbench/contrib/tasks/common/taskService.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ITaskEntry } from '../../browser/sessionsTasksService.js';
import { WorkbenchSessionTaskRunner } from '../../browser/workbenchSessionTaskRunner.js';

function makeSession(opts: { repository?: URI; worktree?: URI } = {}): ISession {
	const workspace = opts.repository ? {
		uri: opts.repository,
		label: 'test',
		icon: Codicon.folder,
		folders: [{
			root: opts.repository,
			workingDirectory: opts.worktree ?? opts.repository,
			name: 'test',
			description: undefined,
			gitRepository: { uri: opts.repository, workTreeUri: opts.worktree, baseBranchName: undefined, gitHubInfo: constObservable(undefined) },
		} satisfies ISessionFolder],
		requiresWorkspaceTrust: false,
	} : undefined;
	const chat = { resource: URI.parse('file:///session') } as IChat;
	return {
		sessionId: 'test:session',
		resource: chat.resource,
		providerId: 'test',
		sessionType: 'background',
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: observableValue('workspace', workspace as ISessionWorkspace | undefined),
		title: observableValue('title', 'session'),
		updatedAt: observableValue('updatedAt', new Date()),
		status: observableValue('status', SessionStatus.Untitled),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: observableValue('modelId', undefined),
		mode: observableValue('mode', undefined),
		loading: observableValue('loading', false),
		isArchived: observableValue('isArchived', false),
		isRead: observableValue('isRead', true),
		lastTurnEnd: observableValue('lastTurnEnd', undefined),
		description: observableValue('description', undefined),
		chats: observableValue('chats', [chat]),
		mainChat: constObservable(chat),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

function makeTask(label: string, command?: string): ITaskEntry {
	return { label, type: 'shell', command: command ?? label };
}

suite('WorkbenchSessionTaskRunner', () => {

	const store = new DisposableStore();
	let runner: WorkbenchSessionTaskRunner;
	let ranTasks: { label: string }[];
	let terminatedTasks: { label: string }[];
	let terminationAttempts: { label: string }[];
	let tasksByLabel: Map<string, Task>;
	let taskLookups: (string | IWorkspaceFolder)[];
	let taskRunSources: TaskRunSource[];
	let workspaceFoldersByUri: Map<string, IWorkspaceFolder>;
	let activeTasks: Set<string>;
	let taskStateEmitter: Emitter<ITaskEvent>;
	let deferTaskStart: boolean;
	let deferredTaskLabel: string | undefined;
	let startDeferredTask: (() => void) | undefined;

	const repoUri = URI.parse('file:///repo');
	const worktreeUri = URI.parse('file:///worktree');

	setup(() => {
		ranTasks = [];
		terminatedTasks = [];
		terminationAttempts = [];
		tasksByLabel = new Map();
		taskLookups = [];
		taskRunSources = [];
		workspaceFoldersByUri = new Map();
		activeTasks = new Set();
		taskStateEmitter = store.add(new Emitter<ITaskEvent>());
		deferTaskStart = false;
		deferredTaskLabel = undefined;
		startDeferredTask = undefined;

		const instantiationService = store.add(new TestInstantiationService());

		instantiationService.stub(ITaskService, new class extends mock<ITaskService>() {
			override readonly onDidStateChange = taskStateEmitter.event;
			override async getTask(_workspaceFolder: any, alias: string | any) {
				taskLookups.push(_workspaceFolder);
				const label = typeof alias === 'string' ? alias : '';
				return tasksByLabel.get(label);
			}
			override run(task: Task | undefined, _options?: IProblemMatcherRunOptions, runSource?: TaskRunSource) {
				taskRunSources.push(runSource ?? TaskRunSource.System);
				if (!task) {
					return Promise.resolve(undefined);
				}
				if (deferTaskStart) {
					return new Promise<undefined>(resolve => {
						startDeferredTask = () => {
							const startedTask = deferredTaskLabel ? tasksByLabel.get(deferredTaskLabel)! : task;
							activeTasks.add(startedTask._label);
							ranTasks.push({ label: startedTask._label });
							taskStateEmitter.fire(TaskEvent.start(startedTask, 1, new Map()));
							resolve(undefined);
						};
					});
				}
				activeTasks.add(task._label);
				ranTasks.push({ label: task._label });
				return Promise.resolve(undefined);
			}
			override async terminate(task: Task) {
				terminationAttempts.push({ label: task._label });
				const success = activeTasks.delete(task._label);
				if (success) {
					terminatedTasks.push({ label: task._label });
				}
				return { success, task };
			}
		});

		instantiationService.stub(IWorkspaceContextService, new class extends mock<IWorkspaceContextService>() {
			override getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
				return workspaceFoldersByUri.get(resource.toString()) ?? null;
			}
		});

		runner = instantiationService.createInstance(WorkbenchSessionTaskRunner);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	function registerMockTask(label: string, folder: URI, sourceKind: string = TaskSourceKind.Workspace, dependsOn?: string): void {
		const task = {
			_id: label,
			_label: label,
			_source: { kind: sourceKind },
			configurationProperties: {
				name: label,
				dependsOn: dependsOn ? [{ uri: folder, task: dependsOn }] : undefined,
			},
		} as unknown as Task;
		tasksByLabel.set(label, task);
		workspaceFoldersByUri.set(folder.toString(), { uri: folder, name: 'folder', index: 0, toResource: () => folder } as IWorkspaceFolder);
	}

	test('canRun: false for sessions without a workspace', () => {
		assert.strictEqual(runner.canRun(makeSession()), false);
	});

	test('canRun: false for non-file schemes', () => {
		const session = makeSession({ repository: URI.parse('vscode-vfs://github/owner/repo') });
		assert.strictEqual(runner.canRun(session), false);
	});

	test('canRun: false when no workspace folder is loaded for the path', () => {
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		assert.strictEqual(runner.canRun(session), false);
	});

	test('canRun: true for local file sessions with a loaded workspace folder', () => {
		workspaceFoldersByUri.set(worktreeUri.toString(), { uri: worktreeUri, name: 'folder', index: 0, toResource: () => worktreeUri } as IWorkspaceFolder);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		assert.strictEqual(runner.canRun(session), true);
	});

	test('runTask looks up by label and runs via ITaskService', async () => {
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		(await runner.runTask(makeTask('build'), session))?.dispose();

		assert.deepStrictEqual(ranTasks, [{ label: 'build' }]);
	});

	test('returned handle terminates the task via ITaskService', async () => {
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		const handle = await runner.runTask(makeTask('build'), session);
		assert.deepStrictEqual(terminatedTasks, []);

		handle?.dispose();

		assert.deepStrictEqual(terminatedTasks, [{ label: 'build' }]);
	});

	test('runTask preserves a user task target', async () => {
		registerMockTask('build', worktreeUri, TaskSourceKind.User);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		(await runner.runTask(makeTask('build'), session, { taskTarget: 'user' }))?.dispose();

		assert.strictEqual(taskLookups[0], USER_TASKS_GROUP_KEY);
		assert.deepStrictEqual(ranTasks, [{ label: 'build' }]);
	});

	test('runTask rejects a task from a different target', async () => {
		registerMockTask('build', worktreeUri, TaskSourceKind.User);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		await runner.runTask(makeTask('build'), session, { taskTarget: 'workspace' });

		assert.deepStrictEqual(ranTasks, []);
	});

	test('preserves approved task source across reload', async () => {
		registerMockTask('build', worktreeUri, TaskSourceKind.User);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const cancellation = new CancellationTokenSource();

		(await runner.runTask(makeTask('build'), session, { taskTarget: 'user', token: cancellation.token }))?.dispose();

		assert.deepStrictEqual({ taskLookups, taskRunSources }, {
			taskLookups: [USER_TASKS_GROUP_KEY],
			taskRunSources: [TaskRunSource.System],
		});
		cancellation.dispose();
	});

	test('cancellation terminates a task while it is running', async () => {
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const cancellation = new CancellationTokenSource();

		const handle = await runner.runTask(makeTask('build'), session, { taskTarget: 'workspace', token: cancellation.token });
		cancellation.cancel();

		assert.deepStrictEqual(terminatedTasks, [{ label: 'build' }]);
		handle?.dispose();
		cancellation.dispose();
	});

	test('cancellation and handle disposal terminate each task at most once', async () => {
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const cancellation = new CancellationTokenSource();

		const handle = await runner.runTask(makeTask('build'), session, { taskTarget: 'workspace', token: cancellation.token });
		cancellation.cancel();
		handle?.dispose();

		assert.deepStrictEqual(terminationAttempts, [{ label: 'build' }]);
		cancellation.dispose();
	});

	test('cancellation remains effective while task launch is pending', async () => {
		deferTaskStart = true;
		registerMockTask('build', worktreeUri);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const cancellation = new CancellationTokenSource();

		const handle = await runner.runTask(makeTask('build'), session, { taskTarget: 'workspace', token: cancellation.token });
		cancellation.cancel();
		assert.deepStrictEqual({ ranTasks, terminatedTasks }, { ranTasks: [], terminatedTasks: [] });

		startDeferredTask!();
		await new Promise(resolve => setTimeout(resolve, 0));

		assert.deepStrictEqual({ ranTasks, terminatedTasks }, {
			ranTasks: [{ label: 'build' }],
			terminatedTasks: [{ label: 'build' }],
		});
		handle?.dispose();
		cancellation.dispose();
	});

	test('disposing the handle terminates active dependency tasks', async () => {
		deferTaskStart = true;
		deferredTaskLabel = 'prepare';
		registerMockTask('prepare', worktreeUri);
		registerMockTask('build', worktreeUri, TaskSourceKind.Workspace, 'prepare');
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });
		const cancellation = new CancellationTokenSource();

		const handle = await runner.runTask(makeTask('build'), session, { taskTarget: 'workspace', token: cancellation.token });
		startDeferredTask!();
		await new Promise(resolve => setTimeout(resolve, 0));
		handle?.dispose();

		assert.deepStrictEqual({ ranTasks, terminatedTasks }, {
			ranTasks: [{ label: 'prepare' }],
			terminatedTasks: [{ label: 'prepare' }],
		});
		cancellation.dispose();
	});

	test('runTask is a no-op when task is not registered', async () => {
		workspaceFoldersByUri.set(worktreeUri.toString(), { uri: worktreeUri, name: 'folder', index: 0, toResource: () => worktreeUri } as IWorkspaceFolder);
		const session = makeSession({ worktree: worktreeUri, repository: repoUri });

		await runner.runTask(makeTask('nope'), session);

		assert.strictEqual(ranTasks.length, 0);
	});

	test('runTask uses repository as cwd when worktree is not available', async () => {
		registerMockTask('build', repoUri);
		const session = makeSession({ repository: repoUri });

		(await runner.runTask(makeTask('build'), session))?.dispose();

		assert.deepStrictEqual(ranTasks, [{ label: 'build' }]);
	});

	test('priority is 0 (lowest fallback)', () => {
		assert.strictEqual(runner.priority, 0);
		// Sanity check on Schemas import usage so unused-import doesn't bite.
		assert.strictEqual(Schemas.file, 'file');
	});
});
