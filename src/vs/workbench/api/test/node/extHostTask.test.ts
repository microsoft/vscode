/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IExtHostApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { IExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { ExtHostTerminal, IExtHostTerminalService } from '../../common/extHostTerminalService.js';
import * as types from '../../common/extHostTypes.js';
import { IExtHostVariableResolverProvider } from '../../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { ITaskHandleDTO } from '../../common/shared/tasks.js';
import { ExtHostTask } from '../../node/extHostTask.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostTask', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const folder = { uri: URI.file('/workspace'), name: 'workspace', index: 0 };
	const taskId = 'fetched-task-id';

	function createExtHostTask(executeTask: (value: ITaskHandleDTO) => Promise<unknown>): ExtHostTask {
		const rpcProtocol = AnyCallRPCProtocol({
			$getTaskExecution: (value: ITaskHandleDTO) => Promise.resolve({ id: value.id, task: {} }),
			$executeTask: executeTask,
		});
		return new ExtHostTask(
			rpcProtocol,
			new class extends mock<IExtHostInitDataService>() {
				override remote = { isRemote: false, authority: undefined, connectionData: null };
			},
			new class extends mock<IExtHostWorkspace>() { },
			new class extends mock<IExtHostDocumentsAndEditors>() { },
			new class extends mock<IExtHostConfiguration>() { },
			new class extends mock<IExtHostTerminalService>() {
				override getTerminalById(): ExtHostTerminal | null {
					return null;
				}
			},
			new NullLogService(),
			new class extends mock<IExtHostApiDeprecationService>() { },
			new class extends mock<IExtHostVariableResolverProvider>() { },
		);
	}

	function createFetchedTask(): types.Task {
		const task = new types.Task({ type: 'custom-type' }, folder, 'my-task', 'custom-source');
		task._id = taskId;
		return task;
	}

	/** Lets each $executeTask call wait until the test settles it. */
	function createPendingCalls() {
		const calls: DeferredPromise<unknown>[] = [];
		return {
			calls,
			executeTask: () => {
				const call = new DeferredPromise<unknown>();
				calls.push(call);
				return call.p;
			},
			async waitFor(count: number) {
				while (calls.length < count) {
					await timeout(0);
				}
			},
		};
	}

	test('executeTask rejects when the main thread cannot find a fetched task', async () => {
		const extHostTask = createExtHostTask(() => Promise.reject(new Error('Task not found')));

		await assert.rejects(extHostTask.executeTask(nullExtensionDescription, createFetchedTask()), /Task not found/);
		assert.deepStrictEqual(extHostTask.taskExecutions, []);
	});

	test('executeTask returns the execution of a fetched task that the main thread runs', async () => {
		const extHostTask = createExtHostTask(value => Promise.resolve({ id: value.id, task: {} }));
		const task = createFetchedTask();

		const execution = await extHostTask.executeTask(nullExtensionDescription, task);

		assert.strictEqual(execution.task, task);
		assert.deepStrictEqual(extHostTask.taskExecutions, [execution]);
	});

	test('executeTask keeps the execution when an overlapping call runs the task after the first call failed', async () => {
		const pending = createPendingCalls();
		const extHostTask = createExtHostTask(pending.executeTask);
		const first = extHostTask.executeTask(nullExtensionDescription, createFetchedTask());
		const second = extHostTask.executeTask(nullExtensionDescription, createFetchedTask());
		await pending.waitFor(2);

		pending.calls[0].error(new Error('Task not found'));
		await assert.rejects(first, /Task not found/);
		pending.calls[1].complete({ id: taskId, task: {} });
		const execution = await second;

		assert.deepStrictEqual(extHostTask.taskExecutions, [execution]);
		const ended = Event.toPromise(extHostTask.onDidEndTask);
		await extHostTask.$OnDidEndTask({ id: taskId, task: undefined });
		assert.strictEqual((await ended).execution, execution);
	});

	test('executeTask removes the execution when all overlapping calls fail', async () => {
		const pending = createPendingCalls();
		const extHostTask = createExtHostTask(pending.executeTask);
		const first = extHostTask.executeTask(nullExtensionDescription, createFetchedTask());
		const second = extHostTask.executeTask(nullExtensionDescription, createFetchedTask());
		await pending.waitFor(2);

		pending.calls[0].error(new Error('Task not found'));
		await assert.rejects(first, /Task not found/);
		assert.strictEqual(extHostTask.taskExecutions.length, 1);
		pending.calls[1].error(new Error('Task not found'));
		await assert.rejects(second, /Task not found/);

		assert.deepStrictEqual(extHostTask.taskExecutions, []);
	});

	test('executeTask keeps the execution when the task starts by other means while the call fails', async () => {
		const pending = createPendingCalls();
		const extHostTask = createExtHostTask(pending.executeTask);
		const call = extHostTask.executeTask(nullExtensionDescription, createFetchedTask());
		await pending.waitFor(1);

		await extHostTask.$onDidStartTask({ id: taskId, task: undefined }, 1, { type: 'custom-type' });
		pending.calls[0].error(new Error('Task not found'));
		await assert.rejects(call, /Task not found/);

		assert.strictEqual(extHostTask.taskExecutions.length, 1);
	});
});
