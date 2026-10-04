/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { ITaskService } from '../../../contrib/tasks/common/taskService.js';
import { ContributedTask, ITaskEvent, RunOptions, RuntimeType, TaskEvent, TaskEventKind, TaskScope as InternalTaskScope, TaskSourceKind } from '../../../contrib/tasks/common/tasks.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { ConfigurationResolverExpression } from '../../../services/configurationResolver/common/configurationResolverExpression.js';
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

class TestExtHostTask extends WorkerExtHostTask {
	readonly cache = this._providedCustomExecutions2;
	readonly active = this._activeCustomExecutions2;
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
				resolveAsync: stub().callsFake(async (_folder: IWorkspaceFolder | undefined, expression: ConfigurationResolverExpression<ITaskDefinitionDTO>) => {
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
