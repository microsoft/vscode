/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import * as Platform from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { RunAutomaticTasks } from '../../browser/runAutomaticTasks.js';
import { TaskProblemMonitor } from '../../browser/taskProblemMonitor.js';
import { ProblemMatcherRegistry } from '../../common/problemMatcher.js';
import { IWorkspaceFolderTaskResult } from '../../common/taskService.js';
import { VerifiedTask } from '../../common/taskSystem.js';
import { CustomTask } from '../../common/tasks.js';
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

	const folder = URI.from({ scheme: Schemas.vscodeRemote, authority: 'test-remote', path: '/workspace' });

	function createRemoteTaskService(workspace = testWorkspace(folder)) {
		const { taskService, instantiationService } = createTaskService(store, 'test-remote', workspace);
		const configuration = {
			version: '2.0.0',
			tasks: [{
				label: 'platform task', type: 'shell', command: 'default-command', problemMatcher: [],
				windows: { command: 'windows-command' }, linux: { command: 'linux-command' }, osx: { command: 'osx-command' }
			}]
		};
		const inspect = sinon.stub(instantiationService.get(IConfigurationService), 'inspect').callThrough();
		inspect.withArgs('tasks', sinon.match.any).returns({ workspaceFolderValue: configuration });
		const problemMatchersReady = sinon.stub(ProblemMatcherRegistry, 'onReady').resolves();
		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.platform)));
		const remote = store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Windows)));
		return { taskService, instantiationService, remote, folder, problemMatchersReady };
	}

	function getCommand(tasks: Map<string, IWorkspaceFolderTaskResult>, uri = folder) {
		const task = tasks.get(uri.toString())?.set?.tasks[0];
		assert.ok(CustomTask.is(task));
		return task.command.name;
	}

	test('workspace discovery waits for remote task system info after initial readiness', async () => {
		const { taskService, remote, folder } = createRemoteTaskService();
		await taskService.whenTaskSystemReady;
		remote.dispose();
		// Two local registrations satisfy the global count but not the remote scheme.
		store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.platform)));
		assert.strictEqual(taskService.hasTaskSystemInfo, true);
		let completed = false;
		const discovery = taskService.getWorkspaceTasks().then(tasks => {
			completed = true;
			return tasks;
		});
		await timeout(0);
		assert.strictEqual(completed, false, 'discovery must stay pending while the remote host restarts');
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Windows))).dispose();
		await timeout(0);
		assert.strictEqual(completed, false, 'a replacement removed before the waiter resumes is not ready');
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Windows)));
		const tasks = await discovery;
		assert.strictEqual(getCommand(tasks, folder), 'windows-command');
	});

	test('remote task system replacement invalidates cached platform overrides', async () => {
		const { taskService, remote, folder } = createRemoteTaskService();
		const initial = await taskService.getWorkspaceTasks();
		assert.strictEqual(getCommand(initial, folder), 'windows-command');
		remote.dispose();
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
		const replacement = await taskService.getWorkspaceTasks();
		assert.strictEqual(getCommand(replacement, folder), 'linux-command');
	});

	test('discovery rechecks remote info after waiting for problem matchers', async () => {
		const { taskService, remote, folder, problemMatchersReady } = createRemoteTaskService();
		const entered = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		problemMatchersReady.onFirstCall().callsFake(() => {
			entered.complete();
			return resume.p;
		});
		let completed = false;
		const discovery = taskService.getWorkspaceTasks().then(tasks => {
			completed = true;
			return tasks;
		});
		await entered.p;
		remote.dispose();
		await resume.complete();
		await timeout(0);
		assert.strictEqual(completed, false);
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Windows)));
		assert.strictEqual(getCommand(await discovery, folder), 'windows-command');
	});

	test('concurrent discovery discards results parsed before a remote replacement', async () => {
		const secondFolder = folder.with({ path: '/second' });
		const workspace = testWorkspace(folder, secondFolder);
		workspace.configuration = folder.with({ path: '/test.code-workspace' });
		const { taskService, remote, problemMatchersReady } = createRemoteTaskService(workspace);
		const entered = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		problemMatchersReady.onSecondCall().callsFake(() => {
			entered.complete();
			return resume.p;
		});
		const originalDiscovery = taskService.getWorkspaceTasks();
		await entered.p;
		// Let the first folder finish parsing with the old Windows registration.
		await timeout(0);
		remote.dispose();
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Linux)));
		const replacementDiscovery = taskService.getWorkspaceTasks();
		const replacement = await replacementDiscovery;
		await resume.complete();
		const original = await originalDiscovery;
		assert.deepStrictEqual({
			commands: [folder, secondFolder].map(uri => getCommand(original, uri)),
			shared: original === replacement, cached: await taskService.getWorkspaceTasks() === replacement
		}, { commands: ['linux-command', 'linux-command'], shared: true, cached: true });
	});

	test('disposing the task service cancels discovery waiting for a remote replacement', async () => {
		const { taskService, remote } = createRemoteTaskService();
		await taskService.whenTaskSystemReady;
		remote.dispose();
		const discovery = taskService.getWorkspaceTasks();
		const canceled = assert.rejects(discovery, isCancellationError);
		await timeout(0);
		const changes = Reflect.get(taskService, '_onDidChangeTaskSystemInfo') as Emitter<void>;
		assert.strictEqual(changes.hasListeners(), true);
		taskService.dispose();
		await canceled;
		assert.strictEqual(changes.hasListeners(), false);
	});

	test('task execution waits for the remote replacement before resolving variables', async () => {
		const { taskService, instantiationService, remote, folder } = createRemoteTaskService();
		// Problem monitoring is unrelated to variable resolution and terminal launch.
		instantiationService.stubInstance(TaskProblemMonitor, { dispose() { } });
		const task = (await taskService.getWorkspaceTasks()).get(folder.toString())!.set!.tasks[0];
		const system = store.add(taskService.createTerminalTaskSystem());
		remote.dispose();
		let completed = false;
		const execution = system.run(task, { resolve: async () => undefined }).promise.then(result => {
			completed = true;
			return result;
		});
		await timeout(0);
		assert.strictEqual(completed, false);
		const resolveVariables = sinon.stub().resolves(undefined);
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, { ...taskSystemInfo(Platform.Platform.Windows), resolveVariables }));
		assert.deepStrictEqual({ result: await execution, resolutionCalls: resolveVariables.callCount }, {
			result: { exitCode: 0 }, resolutionCalls: 1
		});
	});

	test('disposing the task service cancels task execution waiting for a remote replacement', async () => {
		const { taskService, instantiationService, remote, folder } = createRemoteTaskService();
		instantiationService.stubInstance(TaskProblemMonitor, { dispose() { } });
		const task = (await taskService.getWorkspaceTasks()).get(folder.toString())!.set!.tasks[0];
		const system = store.add(taskService.createTerminalTaskSystem());
		remote.dispose();
		const execution = system.run(task, { resolve: async () => undefined }).promise;
		const canceled = assert.rejects(execution, isCancellationError);
		await timeout(0);
		taskService.dispose();
		await canceled;
	});

	test('rerun waits for the remote replacement instead of using the disposed host', async () => {
		const { taskService, instantiationService, remote, folder } = createRemoteTaskService();
		instantiationService.stubInstance(TaskProblemMonitor, { dispose() { } });
		const task = (await taskService.getWorkspaceTasks()).get(folder.toString())!.set!.tasks[0];
		assert.ok(CustomTask.is(task));
		task.runOptions.reevaluateOnRerun = false;
		task.command.name = '${variables}';
		const previous = new VerifiedTask(task, { resolve: async () => undefined }, 'command');
		previous.workspaceFolder = task.getWorkspaceFolder();
		const oldResolveVariables = sinon.stub().resolves(undefined);
		previous.systemInfo = { ...taskSystemInfo(Platform.Platform.Windows), resolveVariables: oldResolveVariables };
		previous.resolvedVariables = { variables: new Map() };
		previous.shellLaunchConfig = {};
		const system = store.add(taskService.createTerminalTaskSystem());
		system.lastTask = previous;
		remote.dispose();
		let completed = false;
		const execution = system.rerun()!.promise.then(result => {
			completed = true;
			return result;
		});
		await timeout(0);
		assert.deepStrictEqual({ completed, oldCalls: oldResolveVariables.callCount }, { completed: false, oldCalls: 0 });
		const resolveVariables = sinon.stub().resolves(undefined);
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, { ...taskSystemInfo(Platform.Platform.Windows), resolveVariables }));
		assert.deepStrictEqual({ result: await execution, resolutionCalls: resolveVariables.callCount }, {
			result: { exitCode: 0 }, resolutionCalls: 1
		});
	});

	for (const scheme of [undefined, 'test-virtual']) {
		test(`discovery preserves client fallback without a registered workspace scheme (${scheme ?? 'empty window'})`, async () => {
			const workspace = scheme ? testWorkspace(URI.from({ scheme, path: '/virtual' })) : testWorkspace();
			const { taskService } = createTaskService(store, undefined, workspace);
			store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.platform)));
			const tasks = await taskService.getWorkspaceTasks();
			assert.ok(Array.from(tasks.values()).every(result => !result.set?.tasks.length));
		});
	}

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
