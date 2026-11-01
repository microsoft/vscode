/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import type * as vscode from 'vscode';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import * as Platform from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { RunAutomaticTasks } from '../../../contrib/tasks/browser/runAutomaticTasks.js';
import { TaskService } from '../../../contrib/tasks/browser/taskService.js';
import { ITaskService, IWorkspaceFolderTaskResult } from '../../../contrib/tasks/common/taskService.js';
import { ITaskSystemInfo } from '../../../contrib/tasks/common/taskSystem.js';
import { ContributedTask, ITaskEvent, RunOptions, RuntimeType, TaskEvent, TaskEventKind, TaskScope as InternalTaskScope, TaskSourceKind } from '../../../contrib/tasks/common/tasks.js';
import { ITerminalService } from '../../../contrib/terminal/browser/terminal.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { workbenchInstantiationService } from '../../../test/browser/workbenchTestServices.js';
import { MainThreadTask } from '../../browser/mainThreadTask.js';
import { ExtHostContext, MainContext, MainThreadTaskShape } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { IExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { WorkerExtHostTask } from '../../common/extHostTask.js';
import { IExtHostTerminalService } from '../../common/extHostTerminalService.js';
import { CustomExecution, Task, TaskScope } from '../../common/extHostTypes.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { ITaskDefinitionDTO, ITaskDTO } from '../../common/shared/tasks.js';
import { SingleProxyRPCProtocol, TestRPCProtocol } from '../common/testRPCProtocol.js';

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

class TestExtHostTask extends WorkerExtHostTask {
	readonly cache = this._providedCustomExecutions2;
	readonly active = this._activeCustomExecutions2;
	get startupStateSizes() {
		/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Inspect private lifecycle ownership without production test APIs. */
		return { pending: this['_taskStarts'].size, active: this['_activeTaskStarts'].size };
		/* eslint-enable local/code-no-bracket-notation-for-identifiers */
	}
	readonly emitters = [
		this._onDidExecuteTask, this._onDidTerminateTask,
		this._onDidTaskProcessStarted, this._onDidTaskProcessEnded,
		this._onDidStartTaskProblemMatchers, this._onDidEndTaskProblemMatchers
	];
}

suite('MainThreadTask custom execution startup', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const extension = new class extends mock<IExtensionDescription>() {
		override readonly identifier = new ExtensionIdentifier('test.tasks');
	};
	const pty: vscode.Pseudoterminal = { onDidWrite: Event.None, open() { }, close() { } };

	function createTask(callback: CustomExecution['callback'] = async () => pty): Task {
		return new Task({ type: 'testTask', name: 'starting', value: '${test}' }, TaskScope.Workspace, 'starting', 'test', new CustomExecution(callback));
	}

	function createService(task: Task, delayedDelivery: boolean) {
		const rpc = new TestRPCProtocol();
		const attached: vscode.Pseudoterminal[] = [];
		let unregistered = Promise.resolve();
		const service = new TestExtHostTask(
			SingleProxyRPCProtocol(new class extends mock<MainThreadTaskShape>() {
				override async $registerSupportedExecutions() { }
				override $registerTaskSystem() { }
				override async $registerTaskProvider() { }
				override async $createTaskId(task: ITaskDTO) { return task.name!; }
				override $unregisterTaskProvider(handle: number) {
					return unregistered = rpc.getProxy(MainContext.MainThreadTask).$unregisterTaskProvider(handle);
				}
			}),
			new class extends mock<IExtHostInitDataService>() { },
			new class extends mock<IExtHostWorkspace>() { },
			new class extends mock<IExtHostDocumentsAndEditors>() { },
			new class extends mock<IExtHostConfiguration>() { },
			new class extends mock<IExtHostTerminalService>() {
				override attachPtyToTerminal(_id: number, terminal: vscode.Pseudoterminal) { attached.push(terminal); }
				override getTerminalById() { return null; }
			},
			store.add(new NullLogService()),
			NullApiDeprecationService
		);
		for (const emitter of service.emitters) {
			store.add(emitter);
		}
		rpc.set(ExtHostContext.ExtHostTask, service);
		const resolution = new DeferredPromise<void>();
		let dispatch!: (event: ITaskEvent) => void;
		const mainThread = store.add(new MainThreadTask(
			delayedDelivery ? rpc : SingleProxyRPCProtocol(service),
			new class extends mock<ITaskService>() {
				override readonly onDidStateChange: Event<ITaskEvent> = listener => {
					dispatch = listener;
					return Disposable.None;
				};
			},
			new class extends mock<IWorkspaceContextService>() { },
			upcastPartial<IConfigurationResolverService>({
				resolveAsync: sinon.stub().callsFake(async (_folder: IWorkspaceFolder | undefined, expression: ConfigurationResolverExpression<ITaskDefinitionDTO>) => {
					await resolution.p;
					return expression.toObject();
				})
			})
		));
		rpc.set(MainContext.MainThreadTask, mainThread);
		const contributed = new ContributedTask(task.name, {
			kind: TaskSourceKind.Extension, label: 'test', extension: 'test.tasks', scope: InternalTaskScope.Workspace, workspaceFolder: undefined
		}, task.name, 'testTask', { ...task.definition, type: 'testTask', _key: task.name },
			{ runtime: RuntimeType.CustomExecution }, false, RunOptions.defaults, {
			name: task.name, identifier: task.name, problemMatchers: []
		});
		const registration = store.add(service.registerTaskProvider(extension, 'testTask', {
			provideTasks: () => [task], resolveTask: value => value
		}));
		return {
			service, attached, rpc, resolution, contributed,
			dispatch: (event: ITaskEvent) => dispatch(event),
			provide: () => service.$provideTasks(0, { testTask: true }),
			disposeProvider: async () => { registration.dispose(); await unregistered; }
		};
	}

	for (const starts of [false, true]) {
		test(`accepted custom task owns its callback before Start and releases on completion (starts: ${starts})`, async () => {
			let called = 0;
			const h = createService(createTask(async () => { called++; return pty; }), true);
			await h.provide();
			h.dispatch(TaskEvent.general(TaskEventKind.CustomExecutionAccepted, h.contributed));
			await h.disposeProvider();
			await h.rpc.sync();
			await h.resolution.complete();
			if (starts) {
				h.dispatch(TaskEvent.start(h.contributed, 1, new Map([['test', 'resolved']])));
				await h.rpc.sync();
			}
			h.dispatch(TaskEvent.general(TaskEventKind.CustomExecutionFinished, h.contributed));
			await h.rpc.sync();
			assert.deepStrictEqual({
				called, attached: h.attached, cache: [...h.service.cache], active: [...h.service.active], executions: h.service.taskExecutions,
				startup: h.service.startupStateSizes
			}, { called: starts ? 1 : 0, attached: starts ? [pty] : [], cache: [], active: [], executions: [], startup: { pending: 0, active: 0 } });
		});
	}

	for (const delayedDelivery of [false, true]) {
		test(`ending one instance during resolution preserves the other startup (${delayedDelivery ? 'IPC' : 'direct'})`, async () => {
			let called = 0;
			const h = createService(createTask(async () => { called++; return pty; }), delayedDelivery);
			await h.provide();
			const second = h.contributed.clone();
			assert.ok(ContributedTask.is(second));
			second.instance = 1;
			const firstStart = h.dispatch(TaskEvent.start(h.contributed, 1, new Map()));
			const secondStart = h.dispatch(TaskEvent.start(second, 2, new Map()));
			await h.disposeProvider();
			h.dispatch(TaskEvent.general(TaskEventKind.End, h.contributed));
			await h.rpc.sync();
			await h.resolution.complete();
			await Promise.all([firstStart, secondStart]);
			await h.rpc.sync();
			await timeout(0);
			h.dispatch(TaskEvent.general(TaskEventKind.End, second));
			await h.rpc.sync();
			await timeout(0);
			assert.deepStrictEqual({ called, attached: h.attached, startup: h.service.startupStateSizes }, {
				called: 1, attached: [pty], startup: { pending: 0, active: 0 }
			});
		});
	}

	test('concurrent task instances preserve each pending callback and matching end', async () => {
		const gates = [new DeferredPromise<vscode.Pseudoterminal>(), new DeferredPromise<vscode.Pseudoterminal>()];
		const entered = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const closed: number[] = [];
		const terminals = gates.map((_, index) => ({ ...pty, close: () => closed.push(index) }));
		let calls = 0;
		const h = createService(createTask(() => {
			const index = calls++;
			entered[index].complete();
			return gates[index].p;
		}), false);
		await h.provide();
		await h.resolution.complete();
		const second = h.contributed.clone();
		assert.ok(ContributedTask.is(second));
		second.instance = 1;
		h.dispatch(TaskEvent.start(h.contributed, 1, new Map([['test', 'resolved']])));
		await entered[0].p;
		h.dispatch(TaskEvent.start(second, 2, new Map([['test', 'resolved']])));
		await entered[1].p;
		await h.disposeProvider();
		await gates[0].complete(terminals[0]);
		await timeout(0);
		h.dispatch(TaskEvent.general(TaskEventKind.End, h.contributed));
		await timeout(0);
		await gates[1].complete(terminals[1]);
		await timeout(0);
		h.dispatch(TaskEvent.general(TaskEventKind.End, second));
		await timeout(0);
		assert.deepStrictEqual({ calls, closed, attached: h.attached }, { calls: 2, closed: [], attached: terminals });
	});

	for (const delayedDelivery of [false, true]) {
		test(`main-thread startup preserves callbacks when disposal precedes ${delayedDelivery ? 'IPC delivery' : 'variable resolution'}`, async () => {
			const definitions: vscode.TaskDefinition[] = [];
			const h = createService(createTask(async definition => { definitions.push(definition); return pty; }), delayedDelivery);
			await h.provide();
			const started = new DeferredPromise<void>();
			store.add(h.service.onDidStartTask(() => started.complete()));
			const starting = h.dispatch(TaskEvent.start(h.contributed, 1, new Map([['test', 'resolved']])));
			const disposing = h.disposeProvider();
			await h.rpc.sync();
			await disposing;
			await h.resolution.complete();
			await starting;
			await started.p;
			assert.deepStrictEqual({ definitions, attached: h.attached }, {
				definitions: [{ type: 'testTask', name: 'starting', value: 'resolved' }], attached: [pty]
			});
			h.dispatch(TaskEvent.general(TaskEventKind.End, h.contributed));
			await h.rpc.sync();
		});

		for (const rejectResolution of [false, true]) {
			test(`main-thread startup ${rejectResolution ? 'resolution failure' : 'cancellation'} releases callbacks (${delayedDelivery ? 'IPC' : 'immediate'} delivery)`, async () => {
				let callbackCount = 0;
				let startCount = 0;
				const h = createService(createTask(async () => { callbackCount++; return pty; }), delayedDelivery);
				await h.provide();
				store.add(h.service.onDidStartTask(() => startCount++));
				const starting = h.dispatch(TaskEvent.start(h.contributed, 1, new Map()));
				const disposing = h.disposeProvider();
				await h.rpc.sync();
				await disposing;
				if (rejectResolution) {
					const failure = assert.rejects(Promise.resolve(starting), /resolution failed/);
					await h.resolution.error(new Error('resolution failed'));
					await failure;
					h.dispatch(TaskEvent.general(TaskEventKind.End, h.contributed));
				} else {
					h.dispatch(TaskEvent.general(TaskEventKind.End, h.contributed));
					await h.rpc.sync();
					await h.resolution.complete();
					await starting;
				}
				await h.rpc.sync();
				assert.deepStrictEqual({
					callbackCount, startCount, attached: h.attached, cached: [...h.service.cache], active: [...h.service.active], executions: h.service.taskExecutions
				}, { callbackCount: 0, startCount: 0, attached: [], cached: [], active: [], executions: [] });
			});
		}
	}

	test('main-thread startup survives disposal before IPC delivery without suspended variable resolution', async () => {
		const h = createService(createTask(), true);
		await h.provide();
		await h.resolution.complete();
		await h.dispatch(TaskEvent.start(h.contributed, 1, new Map([['test', 'resolved']])));
		await h.disposeProvider();
		await h.rpc.sync();
		assert.deepStrictEqual(h.attached, [pty]);
		h.dispatch(TaskEvent.general(TaskEventKind.End, h.contributed));
		await h.rpc.sync();
	});
});
