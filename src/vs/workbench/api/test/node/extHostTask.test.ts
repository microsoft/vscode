/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { IExtHostApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { IExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { IExtHostTerminalService } from '../../common/extHostTerminalService.js';
import * as types from '../../common/extHostTypes.js';
import { IExtHostVariableResolverProvider } from '../../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { ITaskHandleDTO } from '../../common/shared/tasks.js';
import { ExtHostTask } from '../../node/extHostTask.js';
import { AnyCallRPCProtocol } from '../common/testRPCProtocol.js';

suite('ExtHostTask', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const folder = { uri: URI.file('/workspace'), name: 'workspace', index: 0 };

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
			new class extends mock<IExtHostTerminalService>() { },
			new NullLogService(),
			new class extends mock<IExtHostApiDeprecationService>() { },
			new class extends mock<IExtHostVariableResolverProvider>() { },
		);
	}

	function createFetchedTask(): types.Task {
		const task = new types.Task({ type: 'custom-type' }, folder, 'my-task', 'custom-source');
		task._id = 'fetched-task-id';
		return task;
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
});
