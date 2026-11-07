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
import { ContributedTask, ITaskSet, JsonSchemaVersion, Task, TaskScope, TaskSourceKind } from '../../common/tasks.js';

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
});
