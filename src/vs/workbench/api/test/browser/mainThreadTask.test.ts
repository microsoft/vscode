/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as Platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { RunAutomaticTasks } from '../../../contrib/tasks/browser/runAutomaticTasks.js';
import { TaskService } from '../../../contrib/tasks/browser/taskService.js';
import { ITaskService, IWorkspaceFolderTaskResult } from '../../../contrib/tasks/common/taskService.js';
import { ITaskSystemInfo } from '../../../contrib/tasks/common/taskSystem.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadTask } from '../../browser/mainThreadTask.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

class TestTaskService extends TaskService {
	get whenTaskSystemReady(): Promise<void> {
		return this._whenTaskSystemReady;
	}
}

suite('MainThreadTask', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('unregisters task systems on dispose', function () {
		let registrations = 0;
		let disposals = 0;
		const taskService = new class extends mock<ITaskService>() {
			override readonly onDidStateChange = Event.None;

			override registerTaskSystem(): IDisposable {
				registrations++;
				return toDisposable(() => disposals++);
			}
		};
		const mainThreadTask = new MainThreadTask(SingleProxyRPCProtocol(null), taskService, undefined!, undefined!);

		mainThreadTask.$registerTaskSystem('file', { scheme: 'file', authority: '', platform: 'linux' });
		assert.strictEqual(registrations, 1);

		mainThreadTask.dispose();
		assert.strictEqual(disposals, 1);
	});

	function createTaskService(remoteAuthority: string | undefined) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchEnvironmentService, new class extends mock<IWorkbenchEnvironmentService>() {
			override readonly remoteAuthority = remoteAuthority;
		});
		instantiationService.stub(IOutputService, { getChannel: () => undefined });
		instantiationService.stub(IConfigurationResolverService, { contributeVariable: () => { } });
		instantiationService.stub(ITerminalService, { whenConnected: Promise.resolve(), instances: [] });
		const taskService = store.add(instantiationService.createInstance(TestTaskService));
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
		const { taskService, instantiationService } = createTaskService('test-remote');
		let ready = false;
		const readiness = taskService.whenTaskSystemReady.then(() => ready = true);
		const local = store.add(instantiationService.createInstance(MainThreadTask, SingleProxyRPCProtocol(null)));
		local.$registerTaskSystem(Schemas.file, { scheme: Schemas.file, authority: '', platform: 'win32' });
		local.dispose();
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
		const { taskService } = createTaskService(undefined);
		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Linux)));
		await taskService.whenTaskSystemReady;
		assert.strictEqual(taskService.hasTaskSystemInfo, true);
	});

	test('automatic tasks ignore removal notifications before initial remote readiness', async () => {
		const { taskService, instantiationService } = createTaskService('test-remote');
		await timeout(0);
		const workspaceTasks = new DeferredPromise<Map<string, IWorkspaceFolderTaskResult>>();
		const getWorkspaceTasks = sinon.stub(taskService, 'getWorkspaceTasks').returns(workspaceTasks.p);
		store.add(instantiationService.createInstance(RunAutomaticTasks));
		const local = store.add(instantiationService.createInstance(MainThreadTask, SingleProxyRPCProtocol(null)));
		local.$registerTaskSystem(Schemas.file, { scheme: Schemas.file, authority: '', platform: 'win32' });
		local.dispose();
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		const replacement = store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		replacement.dispose();
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 0);

		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
		await timeout(0);
		assert.strictEqual(getWorkspaceTasks.callCount, 1);
	});

	for (const readyBeforeDisposal of [false, true]) {
		test(`disposing automatic tasks stops pending readiness work (ready before disposal: ${readyBeforeDisposal})`, async () => {
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
			if (readyBeforeDisposal) {
				store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.Platform.Windows)));
				store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
			}
			automaticTasks.dispose();
			await timeout(0);
			assert.deepStrictEqual({ eventListeners, discoveryCalls: getWorkspaceTasks.callCount }, { eventListeners: 0, discoveryCalls: 0 });
		});
	}

});
