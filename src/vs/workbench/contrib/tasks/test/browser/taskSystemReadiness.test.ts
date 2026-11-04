/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import * as Platform from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { RunAutomaticTasks } from '../../browser/runAutomaticTasks.js';
import { IWorkspaceFolderTaskResult } from '../../common/taskService.js';
import { createTaskService, taskSystemInfo } from './taskTestUtils.js';

suite('Task system readiness', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let commandsBeforeTest: ReturnType<typeof CommandsRegistry.getCommands>;
	setup(() => commandsBeforeTest = CommandsRegistry.getCommands());
	teardown(() => {
		sinon.restore();
		const commands = CommandsRegistry.getCommands();
		assert.strictEqual(commands.size, commandsBeforeTest.size);
		for (const [id, command] of commandsBeforeTest) {
			assert.strictEqual(commands.get(id), command, id);
		}
	});

	test('removal before initial remote readiness does not release the readiness promise', async () => {
		const { taskService } = createTaskService(store, 'test-remote');
		let ready = false;
		const readiness = taskService.whenTaskSystemReady.then(() => ready = true);
		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		taskService.removeTaskSystem(Schemas.file);
		await timeout(0);
		assert.deepStrictEqual({ ready, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, { ready: false, hasTaskSystemInfo: false });

		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
		await timeout(0);
		assert.deepStrictEqual({ ready, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, { ready: false, hasTaskSystemInfo: false });

		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		await readiness;
		assert.deepStrictEqual({ ready, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, { ready: true, hasTaskSystemInfo: true });
	});

	test('local readiness resolves on the first task system registration', async () => {
		const { taskService } = createTaskService(store);
		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Linux)));
		await taskService.whenTaskSystemReady;
		assert.strictEqual(taskService.hasTaskSystemInfo, true);
	});

	test('automatic tasks ignore removal notifications before initial remote readiness', async () => {
		const { taskService, instantiationService } = createTaskService(store, 'test-remote');
		await timeout(0);
		const workspaceTasks = new DeferredPromise<Map<string, IWorkspaceFolderTaskResult>>();
		const getWorkspaceTasks = sinon.stub(taskService, 'getWorkspaceTasks').returns(workspaceTasks.p);
		store.add(instantiationService.createInstance(RunAutomaticTasks));
		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		taskService.removeTaskSystem(Schemas.file);
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		taskService.removeTaskSystem(Schemas.file);
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 1);
	});

	for (const readinessBeforeDisposal of ['waiting', 'ready', 'lost'] as const) {
		test(`disposing automatic tasks stops pending readiness work (readiness before disposal: ${readinessBeforeDisposal})`, async () => {
			const { taskService, instantiationService } = createTaskService(store, 'test-remote');
			await timeout(0);
			const workspaceTasks = new DeferredPromise<Map<string, IWorkspaceFolderTaskResult>>();
			const getWorkspaceTasks = sinon.stub(taskService, 'getWorkspaceTasks').returns(workspaceTasks.p);
			const onDidChangeTaskSystemInfo = taskService.onDidChangeTaskSystemInfo;
			let eventListeners = 0;
			sinon.stub(taskService, 'onDidChangeTaskSystemInfo').value((listener: () => void) => {
				eventListeners++;
				const registration = onDidChangeTaskSystemInfo(listener);
				return toDisposable(() => {
					eventListeners--;
					registration.dispose();
				});
			});
			const automaticTasks = store.add(instantiationService.createInstance(RunAutomaticTasks));
			assert.strictEqual(eventListeners, 1);
			if (readinessBeforeDisposal !== 'waiting') {
				store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
				store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
				if (readinessBeforeDisposal === 'lost') {
					taskService.removeTaskSystem(Schemas.file);
				}
			}
			automaticTasks.dispose();
			await timeout(0);
			assert.deepStrictEqual({ eventListeners, discoveryCalls: getWorkspaceTasks.callCount }, { eventListeners: 0, discoveryCalls: 0 });
		});
	}

});
