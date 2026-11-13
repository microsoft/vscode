/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { AbstractTaskService } from '../../browser/abstractTaskService.js';
import { ITaskProvider, IWorkspaceFolderTaskResult } from '../../common/taskService.js';
import { ContributedTask, CustomTask, ITaskSet, JsonSchemaVersion, RunOptions, RuntimeType, Task, TaskScope, TaskSourceKind, USER_TASKS_GROUP_KEY } from '../../common/tasks.js';

suite('AbstractTaskService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const settlement of ['reject', 'resolve'] as const) {
		test(`counts a timed-out provider only once when it later ${settlement}s`, async () => {
			const clock = sinon.useFakeTimers();
			try {
				const folder = new WorkspaceFolder({ uri: URI.file('/workspace'), name: 'workspace', index: 0 });
				const createTask = (id: string) => new ContributedTask(id, {
					kind: TaskSourceKind.Extension, label: 'test', extension: 'test', scope: TaskScope.Folder, workspaceFolder: folder
				}, id, 'test', { type: 'test', _key: id }, {}, false, {}, {});
				const lateTask = createTask('late');
				const healthyTask = createTask('healthy');
				const first = new DeferredPromise<ITaskSet>();
				const second = new DeferredPromise<ITaskSet>();
				const providers = new Map<number, ITaskProvider>([
					[1, { provideTasks: () => first.p, resolveTask: async () => undefined }],
					[2, {
						provideTasks: () => {
							// Install B's timeout one millisecond after A's to expose the ordering.
							clock.tick(1);
							return second.p;
						},
						resolveTask: async () => undefined
					}]
				]);
				// Exercise the real discovery and task-map aggregation without initializing the UI.
				const service = Object.assign(Object.create(AbstractTaskService.prototype), {
					_waitForAllSupportedExecutions: Promise.resolve(),
					_schemaVersion: JsonSchemaVersion.V2_0_0,
					_providers: providers,
					_providerTypes: new Map([[1, 'test'], [2, 'test']]),
					_contextKeyService: { contextMatchesRules: () => true },
					_activateTaskProviders: async () => { },
					_needsRecentTasksMigration: () => false,
					_isProvideTasksEnabled: () => true,
					_log: () => { },
					_showOutput: () => { },
					getWorkspaceTasks: async () => new Map<string, IWorkspaceFolderTaskResult>([[folder.uri.toString(), {
						workspaceFolder: folder, set: undefined, configurations: undefined, hasErrors: false
					}]])
				}) as { _getGroupedTasks(): Promise<{ all(): Task[] }> };
				let settled = false;
				const discovery = service._getGroupedTasks().then(result => {
					settled = true;
					return result.all();
				});
				await clock.tickAsync(0);
				await clock.tickAsync(4999);
				assert.strictEqual(settled, false, 'A timed out, but B is still pending');

				if (settlement === 'reject') {
					await first.error(new Error('provider failed after timeout'));
				} else {
					await first.complete({ tasks: [lateTask] });
				}
				await clock.tickAsync(0);
				assert.strictEqual(settled, false, 'A settling after its timeout must not finish B');

				await second.complete({ tasks: [healthyTask] });
				await clock.tickAsync(0);
				assert.deepStrictEqual(await discovery, settlement === 'reject' ? [healthyTask] : [lateTask, healthyTask]);
			} finally {
				clock.restore();
			}
		});
	}

	test('resolves known tasks from workspace before matching user tasks without activating providers', async () => {
		const folder = new WorkspaceFolder({ uri: URI.file('/workspace'), name: 'workspace', index: 0 });
		const otherFolder = new WorkspaceFolder({ uri: URI.file('/other'), name: 'other', index: 1 });
		const createTask = (id: string, workspaceFolder: WorkspaceFolder) => new ContributedTask(id, {
			kind: TaskSourceKind.Extension, label: 'test', extension: 'test', scope: TaskScope.Folder, workspaceFolder
		}, id, 'test', { type: 'test', _key: id }, {}, false, {}, {});
		const workspaceTask = new CustomTask('same-id', {
			kind: TaskSourceKind.WorkspaceFile, label: 'workspace', config: { workspaceFolder: folder, file: '', index: 0, element: undefined }
		}, 'workspace-task', 'shell', { runtime: RuntimeType.Process, name: 'echo', args: [] }, false, RunOptions.defaults, {
			name: 'workspace-task', identifier: 'workspace-task', problemMatchers: []
		});
		const otherWorkspaceTask = createTask('other-only', otherFolder);
		const matchingUserTask = new CustomTask('same-id', {
			kind: TaskSourceKind.User, label: 'user', config: { file: '', index: 0, element: undefined }
		}, 'user-task', 'shell', { runtime: RuntimeType.Process, name: 'echo', args: [] }, false, RunOptions.defaults, {
			name: 'user-task', identifier: 'user-task', problemMatchers: []
		});
		const userTask = new CustomTask('user-task', {
			kind: TaskSourceKind.User, label: 'user', config: { file: '', index: 0, element: undefined }
		}, 'user-only-task', 'shell', { runtime: RuntimeType.Process, name: 'echo', args: [] }, false, RunOptions.defaults, {
			name: 'user-only-task', identifier: 'user-only-task', problemMatchers: []
		});
		const tasksByFolder = new Map<string, Task[]>([
			[folder.uri.toString(), [workspaceTask]],
			[otherFolder.uri.toString(), [otherWorkspaceTask]],
			[USER_TASKS_GROUP_KEY, [matchingUserTask, userTask]]
		]);
		const service = Object.assign(Object.create(AbstractTaskService.prototype), {
			_versionAndEngineCompatible: () => true,
			_getGroupedTasks: async (filter: undefined, waitToActivate: boolean, knownOnlyOrTrusted: boolean) => {
				assert.deepStrictEqual([filter, waitToActivate, knownOnlyOrTrusted], [undefined, true, true]);
				return {
					get: (workspaceFolder: string) => tasksByFolder.get(workspaceFolder) ?? []
				};
			}
		}) as Pick<AbstractTaskService, 'getKnownTask'>;

		assert.deepStrictEqual([
			(await service.getKnownTask(folder.uri.toString(), 'same-id'))?._label,
			(await service.getKnownTask(folder.uri.toString(), 'user-only-task'))?._id,
			(await service.getKnownTask(folder.uri.toString(), 'other-only'))?._id
		], ['workspace-task', 'user-task', undefined]);
	});

	test('getTask preserves workspace before user precedence in both lookup phases', async () => {
		const folder = new WorkspaceFolder({ uri: URI.file('/workspace'), name: 'workspace', index: 0 });
		const workspaceTask = new CustomTask('same-id', {
			kind: TaskSourceKind.WorkspaceFile, label: 'workspace', config: { workspaceFolder: folder, file: '', index: 0, element: undefined }
		}, 'workspace-task', 'shell', { runtime: RuntimeType.Process, name: 'echo workspace', args: [] }, false, RunOptions.defaults, {
			name: 'workspace-task', identifier: 'workspace-task', problemMatchers: []
		});
		const userTask = new CustomTask('same-id', {
			kind: TaskSourceKind.User, label: 'user', config: { file: '', index: 0, element: undefined }
		}, 'user-task', 'shell', { runtime: RuntimeType.Process, name: 'echo user', args: [] }, false, RunOptions.defaults, {
			name: 'user-task', identifier: 'user-task', problemMatchers: []
		});

		const workspacePhaseService = Object.assign(Object.create(AbstractTaskService.prototype), {
			_trust: async () => true,
			_ignoredWorkspaceFolders: [],
			_findWorkspaceTasks: async (predicate: (task: Task, workspaceFolder: WorkspaceFolder) => boolean) =>
				[workspaceTask, userTask].filter(task => predicate(task, folder)),
			_getGroupedTasks: async () => {
				assert.fail('Expected a match in the workspace-task lookup phase');
			}
		}) as Pick<AbstractTaskService, 'getTask'>;
		const knownTasksPhaseService = Object.assign(Object.create(AbstractTaskService.prototype), {
			_trust: async () => true,
			_ignoredWorkspaceFolders: [],
			_findWorkspaceTasks: async () => [],
			_getGroupedTasks: async () => ({
				get: (workspaceFolder: string) => workspaceFolder === folder.uri.toString() ? [workspaceTask] : [userTask]
			})
		}) as Pick<AbstractTaskService, 'getTask'>;

		assert.deepStrictEqual([
			(await workspacePhaseService.getTask(folder.uri.toString(), 'same-id', true))?._label,
			(await knownTasksPhaseService.getTask(folder.uri.toString(), 'same-id', true))?._label
		], ['workspace-task', 'workspace-task']);
	});
});
