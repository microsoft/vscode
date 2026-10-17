/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { MainThreadTaskShape } from '../../common/extHost.protocol.js';
import { WorkerExtHostTask } from '../../common/extHostTask.js';
import { CustomExecution, Task, TaskScope } from '../../common/extHostTypes.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostTask', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestExtHostTask extends WorkerExtHostTask {
		dispose(): void {
			this._onDidExecuteTask.dispose();
			this._onDidTerminateTask.dispose();
			this._onDidTaskProcessStarted.dispose();
			this._onDidTaskProcessEnded.dispose();
			this._onDidStartTaskProblemMatchers.dispose();
			this._onDidEndTaskProblemMatchers.dispose();
		}
	}

	function createTaskService(provider: vscode.TaskProvider, createTaskId: () => Promise<string> = async () => 'task-id'): TestExtHostTask {
		const proxy = new class extends mock<MainThreadTaskShape>() {
			override async $registerSupportedExecutions(): Promise<void> { }
			override $registerTaskSystem(): void { }
			override async $registerTaskProvider(): Promise<void> { }
			override async $unregisterTaskProvider(): Promise<void> { }
			override $createTaskId(): Promise<string> { return createTaskId(); }
		};
		const service = store.add(new TestExtHostTask(
			SingleProxyRPCProtocol(proxy), undefined!, undefined!, undefined!, undefined!, undefined!,
			store.add(new NullLogService()), undefined!
		));
		store.add(service.registerTaskProvider(nullExtensionDescription, 'test', provider));
		return service;
	}

	for (const asynchronous of [false, true]) {
		test(`propagates ${asynchronous ? 'asynchronous' : 'synchronous'} provider failures`, async () => {
			const expected = new Error('provider failed');
			const service = createTaskService({
				provideTasks: () => {
					if (asynchronous) {
						return Promise.reject(expected);
					}
					throw expected;
				},
				resolveTask: () => undefined
			});
			const result = await raceTimeout(service.$provideTasks(0, {}).then(() => undefined, error => error), 100);
			assert.strictEqual(result, expected);
		});
	}

	function customTask(): Task {
		return new Task({ type: 'test' }, TaskScope.Workspace, 'test', 'test', new CustomExecution(async () => {
			throw new Error('Discovery must not execute the task');
		}));
	}

	test('propagates task ID failures', async () => {
		const expected = new Error('task ID failed');
		const service = createTaskService({ provideTasks: () => [customTask()], resolveTask: () => undefined }, async () => { throw expected; });
		const result = await raceTimeout(service.$provideTasks(0, { test: true }).then(() => undefined, error => error), 100);
		assert.strictEqual(result, expected);
	});

	test('waits for custom task IDs before returning tasks', async () => {
		const id = new DeferredPromise<string>();
		const requested = new DeferredPromise<void>();
		const service = createTaskService({ provideTasks: () => [customTask()], resolveTask: () => undefined }, () => {
			requested.complete();
			return id.p;
		});
		let settled = false;
		const result = service.$provideTasks(0, { test: true }).then(value => { settled = true; return value; });
		await requested.p;
		assert.strictEqual(settled, false);
		await id.complete('task-id');
		assert.strictEqual((await result).tasks.length, 1);
	});

	test('accepts an empty provider result', async () => {
		const service = createTaskService({ provideTasks: () => undefined, resolveTask: () => undefined });
		assert.deepStrictEqual((await service.$provideTasks(0, {})).tasks, []);
	});
});
