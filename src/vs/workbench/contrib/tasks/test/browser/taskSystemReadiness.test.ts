/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import * as Platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { RunAutomaticTasks } from '../../browser/runAutomaticTasks.js';
import { TaskService } from '../../browser/taskService.js';
import { ITaskService, IWorkspaceFolderTaskResult } from '../../common/taskService.js';
import { ITaskSystemInfo } from '../../common/taskSystem.js';

class TestTaskService extends TaskService {
	get whenTaskSystemReady(): Promise<void> {
		return this._whenTaskSystemReady;
	}

	removeTaskSystem(key: string): void {
		this._taskSystemInfos.delete(key);
		const emitter = Reflect.get(this, '_onDidChangeTaskSystemInfo') as Emitter<void>;
		emitter.fire();
	}
}

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

	function createTaskService(remoteAuthority: string | undefined) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly remoteAuthority = remoteAuthority;
		});
		instantiationService.stub(IOutputService, { getChannel: () => undefined });
		instantiationService.stub(IConfigurationResolverService, { contributeVariable: () => { } });
		instantiationService.stub(ITerminalService, { whenConnected: Promise.resolve(), instances: [] });
		const registerCommand = sinon.spy(CommandsRegistry, 'registerCommand');
		let taskService: TestTaskService;
		try {
			taskService = store.add(instantiationService.createInstance(TestTaskService));
		} finally {
			for (const call of registerCommand.getCalls()) {
				store.add(call.returnValue);
			}
			registerCommand.restore();
		}
		taskService.registerSupportedExecutions(true, true, true);
		instantiationService.stub(ITaskService, taskService);
		return { taskService, instantiationService };
	}

	function taskSystemInfo(platform: Platform.Platform): ITaskSystemInfo {
		return {
			platform,
			context: undefined,
			uriProvider: path => URI.file(path),
			resolveVariables: async () => undefined,
			findExecutable: async () => undefined,
		};
	}

	test('removal before initial remote readiness does not release the readiness promise', async () => {
		const { taskService } = createTaskService('test-remote');
		let ready = false;
		const readiness = taskService.whenTaskSystemReady.then(() => ready = true);
		taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows));
		taskService.removeTaskSystem(Schemas.file);
		await timeout(0);
		assert.deepStrictEqual({ ready, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, { ready: false, hasTaskSystemInfo: false });

		taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux));
		await timeout(0);
		assert.deepStrictEqual({ ready, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, { ready: false, hasTaskSystemInfo: false });

		taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows));
		await readiness;
		assert.deepStrictEqual({ ready, hasTaskSystemInfo: taskService.hasTaskSystemInfo }, { ready: true, hasTaskSystemInfo: true });
	});

	test('local readiness resolves on the first task system registration', async () => {
		const { taskService } = createTaskService(undefined);
		taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Linux));
		await taskService.whenTaskSystemReady;
		assert.strictEqual(taskService.hasTaskSystemInfo, true);
	});

	test('automatic tasks ignore removal notifications before initial remote readiness', async () => {
		const { taskService, instantiationService } = createTaskService('test-remote');
		await timeout(0);
		const workspaceTasks = new DeferredPromise<Map<string, IWorkspaceFolderTaskResult>>();
		const getWorkspaceTasks = sinon.stub(taskService, 'getWorkspaceTasks').returns(workspaceTasks.p);
		store.add(instantiationService.createInstance(RunAutomaticTasks));
		taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows));
		taskService.removeTaskSystem(Schemas.file);
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux));
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows));
		taskService.removeTaskSystem(Schemas.file);
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows));
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 1);
	});

	for (const readinessBeforeDisposal of ['waiting', 'ready', 'lost'] as const) {
		test(`disposing automatic tasks stops pending readiness work (readiness before disposal: ${readinessBeforeDisposal})`, async () => {
			const { taskService, instantiationService } = createTaskService('test-remote');
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
				taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows));
				taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux));
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
