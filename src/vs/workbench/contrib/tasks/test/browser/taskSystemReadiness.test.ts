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
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IPathService } from '../../../../services/path/common/pathService.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { RunAutomaticTasks } from '../../browser/runAutomaticTasks.js';
import { TaskProblemMonitor } from '../../browser/taskProblemMonitor.js';
import { ProblemMatcherRegistry } from '../../common/problemMatcher.js';
import { IWorkspaceFolderTaskResult, ProcessExecutionSupportedContext, ShellExecutionSupportedContext } from '../../common/taskService.js';
import { VerifiedTask } from '../../common/taskSystem.js';
import { CustomTask, USER_TASKS_GROUP_KEY } from '../../common/tasks.js';
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

	function createRemoteTaskService(workspace = testWorkspace(folder), operatingSystem = Platform.OperatingSystem.Windows) {
		const { taskService, instantiationService } = createTaskService(store, 'test-remote', workspace);
		const environment = upcastPartial<IRemoteAgentEnvironment>({ os: operatingSystem });
		const remoteEnvironment = sinon.stub(instantiationService.get(IRemoteAgentService), 'getRawEnvironment').resolves(environment);
		const getOperatingSystem = sinon.stub(instantiationService.get(IPathService), 'getOperatingSystem').callsFake(async resource => resource.scheme === Schemas.file ? Platform.OS : undefined);
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
		const local = store.add(taskService.registerTaskSystem(Schemas.file, taskSystemInfo(Platform.platform)));
		const remote = store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Windows)));
		return { taskService, instantiationService, remote, folder, problemMatchersReady, remoteEnvironment, environment, getOperatingSystem, inspect, configuration, local };
	}

	function getCommand(tasks: Map<string, IWorkspaceFolderTaskResult>, uri: URI | string = folder) {
		const task = tasks.get(uri.toString())?.set?.tasks[0];
		assert.ok(CustomTask.is(task));
		return task.command.name;
	}

	for (const [operatingSystem, command] of [
		[Platform.OperatingSystem.Windows, 'windows-command'],
		[Platform.OperatingSystem.Linux, 'linux-command'],
		[Platform.OperatingSystem.Macintosh, 'osx-command']
	] as const) {
		test(`discovery uses independent remote platform metadata (${command})`, async () => {
			const { taskService, remote } = createRemoteTaskService(undefined, operatingSystem);
			await taskService.whenTaskSystemReady;
			remote.dispose();
			assert.strictEqual(getCommand(await taskService.getWorkspaceTasks()), command);
		});
	}

	test('task-system registration changes preserve cached tasks without retaining callbacks', async () => {
		const { taskService, remote } = createRemoteTaskService(undefined, Platform.OperatingSystem.Linux);
		const initial = await taskService.getWorkspaceTasks();
		remote.dispose();
		const whileRestarting = await taskService.getWorkspaceTasks();
		assert.strictEqual(taskService.getTaskSystemInfo(Schemas.vscodeRemote), undefined);
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, taskSystemInfo(Platform.Platform.Windows)));
		assert.deepStrictEqual({
			command: getCommand(whileRestarting), sameWhileRestarting: initial === whileRestarting,
			sameAfterRestart: initial === await taskService.getWorkspaceTasks()
		}, { command: 'linux-command', sameWhileRestarting: true, sameAfterRestart: true });
	});

	test('local discovery uses path metadata after task host registrations disappear', async () => {
		const uri = URI.file('/local');
		const { taskService, local, remote, getOperatingSystem } = createRemoteTaskService(testWorkspace(uri));
		getOperatingSystem.withArgs(uri).resolves(Platform.OperatingSystem.Linux);
		await taskService.whenTaskSystemReady;
		local.dispose();
		remote.dispose();
		assert.strictEqual(getCommand(await taskService.getWorkspaceTasks(), uri), Platform.isWeb ? 'default-command' : 'linux-command');
	});

	test('discovery can finish when a host disappears while problem matchers load', async () => {
		const { taskService, remote, problemMatchersReady } = createRemoteTaskService();
		const entered = new DeferredPromise<void>();
		const resume = new DeferredPromise<void>();
		problemMatchersReady.onFirstCall().callsFake(() => {
			entered.complete();
			return resume.p;
		});
		const discovery = taskService.getWorkspaceTasks();
		await entered.p;
		remote.dispose();
		await resume.complete();
		assert.strictEqual(getCommand(await discovery), 'windows-command');
	});

	test('discovery waits for remote metadata without requiring a replacement host', async () => {
		const { taskService, remote, remoteEnvironment, environment } = createRemoteTaskService();
		const metadata = new DeferredPromise<IRemoteAgentEnvironment>();
		remoteEnvironment.returns(metadata.p);
		await taskService.whenTaskSystemReady;
		remote.dispose();
		let completed = false;
		const discovery = (async () => {
			const tasks = await taskService.getWorkspaceTasks();
			completed = true;
			return tasks;
		})();
		await timeout(0);
		assert.strictEqual(completed, false);
		await metadata.complete(environment);
		assert.strictEqual(getCommand(await discovery), 'windows-command');
	});

	for (const failure of ['missing', 'rejected'] as const) {
		test(`remote metadata failure does not cache client-platform tasks (${failure})`, async () => {
			const { taskService, remoteEnvironment, environment } = createRemoteTaskService();
			if (failure === 'missing') {
				remoteEnvironment.resolves(null);
			} else {
				remoteEnvironment.rejects(new Error('remote metadata unavailable'));
			}
			await assert.rejects(taskService.getWorkspaceTasks());
			remoteEnvironment.resolves(environment);
			assert.strictEqual(getCommand(await taskService.getWorkspaceTasks()), 'windows-command');
		});
	}

	test('workspace and user configurations use remote metadata while the host is absent', async () => {
		const workspace = testWorkspace(folder);
		workspace.configuration = folder.with({ path: '/test.code-workspace' });
		const { taskService, remote, inspect, configuration } = createRemoteTaskService(workspace, Platform.OperatingSystem.Linux);
		inspect.withArgs('tasks', sinon.match.any).returns({ workspaceValue: configuration, userValue: configuration });
		await taskService.whenTaskSystemReady;
		remote.dispose();
		const tasks = await taskService.getWorkspaceTasks();
		assert.deepStrictEqual([getCommand(tasks, workspace.configuration), getCommand(tasks, USER_TASKS_GROUP_KEY)], ['linux-command', 'linux-command']);
	});

	for (const parsingStarted of [false, true]) {
		test(`folder removal refreshes discovery during a host restart (parsing started: ${parsingStarted})`, async () => {
			const workspace = testWorkspace(folder);
			workspace.configuration = folder.with({ path: '/test.code-workspace' });
			const { taskService, instantiationService, remote, problemMatchersReady } = createRemoteTaskService(workspace);
			await taskService.whenTaskSystemReady;
			const entered = new DeferredPromise<void>();
			const resume = new DeferredPromise<void>();
			if (parsingStarted) {
				problemMatchersReady.onFirstCall().callsFake(() => {
					entered.complete();
					return resume.p;
				});
			}
			remote.dispose();
			const discovery = taskService.getWorkspaceTasks();
			if (parsingStarted) {
				await entered.p;
			} else {
				await discovery;
			}
			const context = instantiationService.get(IWorkspaceContextService) as TestContextService;
			const removed = context.getWorkspace().folders;
			const currentWorkspace = testWorkspace();
			currentWorkspace.configuration = workspace.configuration;
			context.setWorkspace(currentWorkspace);
			const changes = Reflect.get(context, '_onDidChangeWorkspaceFolders') as Emitter<IWorkspaceFoldersChangeEvent>;
			changes.fire({ added: [], removed, changed: [] });
			const current = await taskService.getWorkspaceTasks();
			await resume.complete();
			const original = await discovery;
			assert.deepStrictEqual({ removed: current.has(folder.toString()), shared: !parsingStarted || original === current }, { removed: false, shared: true });
		});
	}

	test('disposing discovery before remote metadata arrives cancels the result', async () => {
		const { taskService, remoteEnvironment, environment } = createRemoteTaskService();
		const metadata = new DeferredPromise<IRemoteAgentEnvironment>();
		remoteEnvironment.returns(metadata.p);
		const discovery = taskService.getWorkspaceTasks();
		const canceled = assert.rejects(discovery, isCancellationError);
		await timeout(0);
		taskService.dispose();
		await metadata.complete(environment);
		await canceled;
	});

	for (const registeredPlatform of [Platform.Platform.Web, Platform.Platform.Windows]) {
		test(`virtual workspace preserves platform metadata after host disposal (${registeredPlatform})`, async () => {
			const uri = URI.from({ scheme: 'test-virtual', path: '/workspace' });
			const { taskService, instantiationService } = createRemoteTaskService(testWorkspace(uri));
			const context = instantiationService.get(IContextKeyService);
			ShellExecutionSupportedContext.bindTo(context).set(true);
			ProcessExecutionSupportedContext.bindTo(context).set(true);
			store.add(taskService.registerTaskSystem(uri.scheme, taskSystemInfo(registeredPlatform))).dispose();
			assert.strictEqual(getCommand(await taskService.getWorkspaceTasks(), uri), registeredPlatform === Platform.Platform.Web ? 'default-command' : 'windows-command');
		});
	}

	test('virtual task parsing follows the surviving provider platform', async () => {
		const uri = URI.from({ scheme: 'test-virtual', path: '/workspace' });
		const { taskService, instantiationService } = createRemoteTaskService(testWorkspace(uri));
		const context = instantiationService.get(IContextKeyService);
		ShellExecutionSupportedContext.bindTo(context).set(true);
		ProcessExecutionSupportedContext.bindTo(context).set(true);
		const web = store.add(taskService.registerTaskSystem(uri.scheme, taskSystemInfo(Platform.Platform.Web)));
		const native = store.add(taskService.registerTaskSystem(uri.scheme, taskSystemInfo(Platform.Platform.Windows)));
		const nativeCommand = getCommand(await taskService.getWorkspaceTasks(), uri);
		native.dispose();
		const surviving = await taskService.getWorkspaceTasks();
		web.dispose();
		assert.deepStrictEqual({
			nativeCommand, survivingCommand: getCommand(surviving, uri),
			cachedAfterDisposal: surviving === await taskService.getWorkspaceTasks(),
			registration: taskService.getTaskSystemInfo(uri.scheme)
		}, { nativeCommand: 'windows-command', survivingCommand: 'default-command', cachedAfterDisposal: true, registration: undefined });
	});

	test('virtual task parsing can use an independent path provider', async () => {
		const uri = URI.from({ scheme: 'test-virtual', path: '/workspace' });
		const { taskService, instantiationService, getOperatingSystem } = createRemoteTaskService(testWorkspace(uri));
		const context = instantiationService.get(IContextKeyService);
		ShellExecutionSupportedContext.bindTo(context).set(true);
		ProcessExecutionSupportedContext.bindTo(context).set(true);
		getOperatingSystem.withArgs(uri).resolves(Platform.OperatingSystem.Windows);
		assert.strictEqual(getCommand(await taskService.getWorkspaceTasks(), uri), 'windows-command');
	});

	test('task execution waits for the remote replacement before resolving variables', async () => {
		const { taskService, instantiationService, remote, folder } = createRemoteTaskService();
		// Problem monitoring is unrelated to variable resolution and terminal launch.
		instantiationService.stubInstance(TaskProblemMonitor, { dispose() { } });
		const task = (await taskService.getWorkspaceTasks()).get(folder.toString())!.set!.tasks[0];
		const system = store.add(taskService.createTerminalTaskSystem());
		remote.dispose();
		let completed = false;
		const execution = (async () => {
			const result = await system.run(task, { resolve: async () => undefined }).promise;
			completed = true;
			return result;
		})();
		await timeout(0);
		assert.strictEqual(completed, false);
		const resolveVariables = sinon.stub().resolves(undefined);
		store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, { ...taskSystemInfo(Platform.Platform.Windows), resolveVariables }));
		assert.deepStrictEqual({ result: await execution, resolutionCalls: resolveVariables.callCount }, {
			result: { exitCode: 0 }, resolutionCalls: 1
		});
	});

	for (const rerun of [false, true]) {
		test(`${rerun ? 'rerun' : 'launch'} never calls a registration after its removal`, async () => {
			const { taskService, instantiationService, remote, folder } = createRemoteTaskService();
			instantiationService.stubInstance(TaskProblemMonitor, { dispose() { } });
			const task = (await taskService.getWorkspaceTasks()).get(folder.toString())!.set!.tasks[0];
			assert.ok(CustomTask.is(task));
			const system = store.add(taskService.createTerminalTaskSystem());
			if (rerun) {
				task.runOptions.reevaluateOnRerun = false;
				task.command.name = '${variables}';
				const previous = new VerifiedTask(task, { resolve: async () => undefined }, 'command');
				previous.workspaceFolder = task.getWorkspaceFolder();
				previous.systemInfo = taskSystemInfo(Platform.Platform.Windows);
				previous.resolvedVariables = { variables: new Map() };
				previous.shellLaunchConfig = {};
				system.lastTask = previous;
			}
			remote.dispose();
			const execution = (rerun ? system.rerun()! : system.run(task, { resolve: async () => undefined })).promise;
			await timeout(0);
			let removed = false;
			let callsAfterRemoval = 0;
			const staleResolveVariables = sinon.stub().callsFake(async () => {
				if (removed) {
					callsAfterRemoval++;
				}
				return undefined;
			});
			const replacement = store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, {
				...taskSystemInfo(Platform.Platform.Windows), resolveVariables: staleResolveVariables
			}));
			queueMicrotask(() => {
				replacement.dispose();
				removed = true;
			});
			await timeout(0);
			const resolveVariables = sinon.stub().resolves(undefined);
			store.add(taskService.registerTaskSystem(Schemas.vscodeRemote, { ...taskSystemInfo(Platform.Platform.Windows), resolveVariables }));
			assert.deepStrictEqual({
				result: await execution, callsAfterRemoval,
				resolutionCalls: staleResolveVariables.callCount + resolveVariables.callCount
			}, { result: { exitCode: 0 }, callsAfterRemoval: 0, resolutionCalls: 1 });
		});
	}

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
		const execution = (async () => {
			const result = await system.rerun()!.promise;
			completed = true;
			return result;
		})();
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
		const readiness = (async () => {
			await taskService.whenTaskSystemReady;
			ready = true;
		})();
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
