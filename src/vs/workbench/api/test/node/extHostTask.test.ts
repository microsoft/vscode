/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { hasKey } from '../../../../base/common/types.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../../platform/extensions/common/extensions.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadTaskShape } from '../../common/extHost.protocol.js';
import { NullApiDeprecationService } from '../../common/extHostApiDeprecationService.js';
import { IExtHostConfiguration } from '../../common/extHostConfiguration.js';
import { IExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { IExtHostInitDataService } from '../../common/extHostInitDataService.js';
import { TaskDTO, WorkerExtHostTask } from '../../common/extHostTask.js';
import { IExtHostTerminalService } from '../../common/extHostTerminalService.js';
import { CustomExecution, Task, TaskScope } from '../../common/extHostTypes.js';
import { IExtHostVariableResolverProvider } from '../../common/extHostVariableResolverService.js';
import { IExtHostWorkspace } from '../../common/extHostWorkspace.js';
import { ITaskDTO, ITaskHandleDTO } from '../../common/shared/tasks.js';
import { ExtHostTask } from '../../node/extHostTask.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

class TestExtHostTask extends ExtHostTask {
	readonly cache = this._providedCustomExecutions2;
	readonly active = this._activeCustomExecutions2;
	readonly emitters = [
		this._onDidExecuteTask, this._onDidTerminateTask,
		this._onDidTaskProcessStarted, this._onDidTaskProcessEnded,
		this._onDidStartTaskProblemMatchers, this._onDidEndTaskProblemMatchers
	];
}

class TestWorkerExtHostTask extends WorkerExtHostTask {
	readonly cache = this._providedCustomExecutions2;
	readonly active = this._activeCustomExecutions2;
	readonly emitters = [
		this._onDidExecuteTask, this._onDidTerminateTask,
		this._onDidTaskProcessStarted, this._onDidTaskProcessEnded,
		this._onDidStartTaskProblemMatchers, this._onDidEndTaskProblemMatchers
	];
}

for (const host of ['node', 'worker'] as const) {
	suite(`ExtHostTask custom execution ownership (${host})`, () => {
		const store = ensureNoDisposablesAreLeakedInTestSuite();
		const extension = new class extends mock<IExtensionDescription>() {
			override readonly identifier = new ExtensionIdentifier('test.tasks');
		};
		const pty: vscode.Pseudoterminal = { onDidWrite: Event.None, open() { }, close() { } };

		function createTask(name: string, callback: CustomExecution['callback'] = async () => pty): Task {
			return new Task({ type: 'testTask', name }, TaskScope.Workspace, name, 'test', new CustomExecution(callback));
		}

		function toDTO(task: vscode.Task): ITaskDTO {
			const dto = TaskDTO.from(task, extension);
			assert.ok(dto);
			return { ...dto, _id: task.name };
		}

		function createService(
			createTaskId: (task: ITaskDTO) => Promise<string> = async task => task.name!,
			unregister: (handle: number) => Promise<void> = async () => { }
		) {
			let lastHandle = -1;
			let unregistered = Promise.resolve();
			const knownTasks = new Map<string, ITaskDTO>();
			const attached: vscode.Pseudoterminal[] = [];
			const proxy = new class extends mock<MainThreadTaskShape>() {
				override async $registerSupportedExecutions() { }
				override $registerTaskSystem() { }
				override async $registerTaskProvider(handle: number) { lastHandle = handle; }
				override $unregisterTaskProvider(handle: number) { return unregistered = unregister(handle); }
				override async $createTaskId(task: ITaskDTO) {
					const id = await createTaskId(task);
					knownTasks.set(id, { ...task, _id: id });
					return id;
				}
				override async $getTaskExecution(value: ITaskDTO | ITaskHandleDTO) {
					const task = hasKey(value, { id: true }) ? knownTasks.get(value.id) : { ...value, _id: value.name! };
					assert.ok(task);
					return { id: task._id, task };
				}
				override async $executeTask(value: ITaskDTO | ITaskHandleDTO) {
					return this.$getTaskExecution(value);
				}
			};
			const args = [
				SingleProxyRPCProtocol(proxy),
				upcastPartial<IExtHostInitDataService>({ remote: { isRemote: false, authority: undefined, connectionData: null } }),
				new class extends mock<IExtHostWorkspace>() { },
				new class extends mock<IExtHostDocumentsAndEditors>() { },
				new class extends mock<IExtHostConfiguration>() { },
				new class extends mock<IExtHostTerminalService>() {
					override attachPtyToTerminal(_id: number, terminal: vscode.Pseudoterminal) { attached.push(terminal); }
					override getTerminalById() { return null; }
				},
				store.add(new NullLogService()),
				NullApiDeprecationService
			] as const;
			const service = host === 'node'
				? new TestExtHostTask(...args, new class extends mock<IExtHostVariableResolverProvider>() { })
				: new TestWorkerExtHostTask(...args);
			for (const emitter of service.emitters) {
				store.add(emitter);
			}

			function register(provider: vscode.TaskProvider) {
				const registration = store.add(service.registerTaskProvider(extension, 'testTask', provider));
				return { handle: lastHandle, dispose: async () => { registration.dispose(); await unregistered; } };
			}
			return {
				service,
				attached,
				register,
				provide: (handle: number) => service.$provideTasks(handle, { testTask: true }),
				cache: service.cache,
				active: service.active,
				start: (task: vscode.Task) => service.$onDidStartTask({ id: task.name, task: toDTO(task) }, 1, task.definition),
				end: (task: vscode.Task) => service.$OnDidEndTask({ id: task.name, task: toDTO(task) })
			};
		}

		function provider(task: Task): vscode.TaskProvider {
			return { provideTasks: () => [task], resolveTask: value => value };
		}

		test('ending during callback creation closes the unclaimed terminal without a late start', async () => {
			const h = createService();
			const result = new DeferredPromise<vscode.Pseudoterminal>();
			let closed = 0;
			let started = 0;
			const task = createTask('canceled', () => result.p);
			const registration = h.register(provider(task));
			await h.provide(registration.handle);
			store.add(h.service.onDidStartTask(() => started++));
			h.service.$onWillStartTask(task.name);
			const starting = h.start(task);
			await registration.dispose();
			await h.end(task);
			await result.complete({ ...pty, close: () => closed++ });
			await starting;
			assert.deepStrictEqual({
				closed, started, attached: h.attached, cached: [...h.cache], active: [...h.active], executions: h.service.taskExecutions
			}, { closed: 1, started: 0, attached: [], cached: [], active: [], executions: [] });
		});

		test('a failed callback releases its startup reservation when the task ends', async () => {
			const h = createService();
			const task = createTask('failed', async () => { throw new Error('callback failed'); });
			const registration = h.register(provider(task));
			await h.provide(registration.handle);
			h.service.$onWillStartTask(task.name);
			await registration.dispose();
			await assert.rejects(h.start(task), /callback failed/);
			await h.end(task);
			await h.start(task);
			await h.end(task);
			assert.deepStrictEqual({ attached: h.attached, cached: [...h.cache], active: [...h.active], executions: h.service.taskExecutions },
				{ attached: [], cached: [], active: [], executions: [] });
		});

		test('an unregister reply cannot remove a newer registration with the same identity', async () => {
			const unregistered = new DeferredPromise<void>();
			const h = createService(undefined, () => unregistered.p);
			const first = h.register(provider(createTask('same')));
			await h.provide(first.handle);
			h.service.$onWillStartTask('same');
			const disposing = first.dispose();
			const replacement = createTask('same');
			const second = h.register(provider(replacement));
			await h.provide(second.handle);
			await unregistered.complete();
			await disposing;
			await h.start(replacement);
			await h.end(replacement);
			assert.deepStrictEqual({ cached: [...h.cache], active: [...h.active], attached: h.attached },
				{ cached: [['same', replacement.execution]], active: [], attached: [pty] });
		});

		test('releases every successfully discovered identity when its provider is disposed', async () => {
			const h = createService();
			let task = createTask('warmup');
			const registration = h.register({ provideTasks: () => [task], resolveTask: value => value });
			for (let i = 0; i < 5; i++) {
				task = createTask(`task-${i}`);
				await h.provide(registration.handle);
			}
			assert.strictEqual(h.cache.size, 5);
			await registration.dispose();
			assert.deepStrictEqual([...h.cache], []);
		});

		test('repeated discovery replaces the callback for the same identity', async () => {
			const h = createService();
			let task = createTask('same');
			const registration = h.register({ provideTasks: () => [task], resolveTask: value => value });
			await h.provide(registration.handle);
			task = createTask('same');
			await h.provide(registration.handle);
			assert.deepStrictEqual([...h.cache], [['same', task.execution]]);
			await registration.dispose();
			assert.strictEqual(h.cache.size, 0);
		});

		test('re-registration does not accumulate callbacks', async () => {
			const h = createService();
			const sizes: number[] = [];
			for (let i = 0; i < 5; i++) {
				const registration = h.register(provider(createTask(`task-${i}`)));
				await h.provide(registration.handle);
				await registration.dispose();
				sizes.push(h.cache.size);
			}
			assert.deepStrictEqual(sizes, [0, 0, 0, 0, 0]);
		});

		test('disposal preserves unrelated providers', async () => {
			const h = createService();
			const a = h.register(provider(createTask('a')));
			const b = h.register(provider(createTask('b')));
			await h.provide(a.handle);
			await h.provide(b.handle);
			await a.dispose();
			assert.deepStrictEqual([...h.cache.keys()], ['b']);
		});

		for (const disposeNewest of [false, true]) {
			test(`colliding identities preserve the ${disposeNewest ? 'older' : 'newer'} live owner`, async () => {
				const h = createService();
				const first = createTask('same');
				const second = createTask('same');
				const a = h.register(provider(first));
				const b = h.register(provider(second));
				await h.provide(a.handle);
				await h.provide(b.handle);
				await (disposeNewest ? b : a).dispose();
				assert.deepStrictEqual([...h.cache], [['same', (disposeNewest ? first : second).execution]]);
				await (disposeNewest ? a : b).dispose();
				assert.strictEqual(h.cache.size, 0);
			});
		}

		test('two providers can own the same callback object', async () => {
			const h = createService();
			const task = createTask('same');
			const a = h.register(provider(task));
			const b = h.register(provider(task));
			await h.provide(a.handle);
			await h.provide(b.handle);
			await a.dispose();
			assert.deepStrictEqual([...h.cache], [['same', task.execution]]);
			await b.dispose();
			assert.strictEqual(h.cache.size, 0);
		});

		test('resolved custom executions belong to their provider', async () => {
			const h = createService();
			const task = createTask('resolved');
			const registration = h.register({
				provideTasks: () => [],
				resolveTask: value => { value.execution = task.execution; return value; }
			});
			await h.service.$resolveTask(registration.handle, toDTO(task));
			assert.deepStrictEqual([...h.cache], [['resolved', task.execution]]);
			await registration.dispose();
			assert.strictEqual(h.cache.size, 0);
		});

		test('discovery finishing after disposal does not publish orphaned tasks', async () => {
			const h = createService();
			const result = new DeferredPromise<Task[]>();
			const registration = h.register({ provideTasks: () => result.p, resolveTask: value => value });
			const pending = h.provide(registration.handle);
			await registration.dispose();
			await result.complete([createTask('late')]);
			assert.deepStrictEqual({ tasks: (await pending).tasks, callbacks: [...h.cache] }, { tasks: [], callbacks: [] });
		});

		for (const resolve of [false, true]) {
			test(`task ID finishing after ${resolve ? 'resolution' : 'discovery'} disposal cannot reinsert callbacks`, async () => {
				const requested = new DeferredPromise<void>();
				const taskId = new DeferredPromise<string>();
				const h = createService(async () => { requested.complete(); return taskId.p; });
				const task = createTask('late');
				const registration = h.register({
					provideTasks: () => [task],
					resolveTask: value => { value.execution = task.execution; return value; }
				});
				const pending = resolve
					? h.service.$resolveTask(registration.handle, toDTO(task))
					: h.provide(registration.handle);
				await requested.p;
				await registration.dispose();
				await taskId.complete('late');
				await pending;
				assert.deepStrictEqual([...h.cache], []);
			});
		}

		test('resolution finishing after disposal does not publish orphaned tasks', async () => {
			const h = createService();
			const result = new DeferredPromise<vscode.Task>();
			const requested = new DeferredPromise<vscode.Task>();
			const task = createTask('late');
			const registration = h.register({
				provideTasks: () => [],
				resolveTask: value => { requested.complete(value); return result.p; }
			});
			const pending = h.service.$resolveTask(registration.handle, toDTO(task));
			const resolving = await requested.p;
			resolving.execution = task.execution;
			await registration.dispose();
			await result.complete(resolving);
			assert.deepStrictEqual({ task: await pending, callbacks: [...h.cache] }, { task: undefined, callbacks: [] });
		});

		test('late discovery from a disposed provider cannot replace a new owner', async () => {
			const requested = new DeferredPromise<void>();
			const taskId = new DeferredPromise<string>();
			let calls = 0;
			const h = createService(async task => {
				if (calls++ === 0) {
					requested.complete();
					return taskId.p;
				}
				return task.name!;
			});
			const first = h.register(provider(createTask('same')));
			const pending = h.provide(first.handle);
			await requested.p;
			await first.dispose();
			const replacement = createTask('same');
			const second = h.register(provider(replacement));
			await h.provide(second.handle);
			await taskId.complete('same');
			await pending;
			assert.deepStrictEqual([...h.cache], [['same', replacement.execution]]);
		});

		test('an active execution survives provider disposal and releases on completion', async () => {
			const h = createService();
			const task = createTask('running');
			const registration = h.register(provider(task));
			await h.provide(registration.handle);
			await h.start(task);
			await registration.dispose();
			assert.deepStrictEqual({ active: [...h.active], cached: [...h.cache] }, { active: [['running', task.execution]], cached: [] });
			await h.end(task);
			assert.deepStrictEqual({ active: [...h.active], cached: [...h.cache], tasks: h.service.taskExecutions }, { active: [], cached: [], tasks: [] });
		});

		test('disposal during an asynchronous callback preserves the execution task', async () => {
			const h = createService();
			const result = new DeferredPromise<vscode.Pseudoterminal>();
			const task = createTask('running', () => result.p);
			const registration = h.register(provider(task));
			await h.provide(registration.handle);
			const starting = h.start(task);
			await registration.dispose();
			await result.complete(pty);
			await starting;
			assert.deepStrictEqual({ callback: h.service.taskExecutions[0].task.execution, attached: h.attached }, { callback: task.execution, attached: [pty] });
			await h.end(task);
			assert.deepStrictEqual({ active: [...h.active], cached: [...h.cache] }, { active: [], cached: [] });
		});

		test('completing an old execution does not remove a newly registered callback', async () => {
			const h = createService();
			const first = createTask('same');
			const second = createTask('same');
			const a = h.register(provider(first));
			await h.provide(a.handle);
			await h.start(first);
			await a.dispose();
			const b = h.register(provider(second));
			await h.provide(b.handle);
			await h.end(first);
			assert.deepStrictEqual({ active: [...h.active], cached: [...h.cache] }, { active: [], cached: [['same', second.execution]] });
		});

		test('a running task does not mask a newly provided callback with the same identity', async () => {
			const h = createService();
			const called: string[] = [];
			let task = createTask('same', async () => { called.push('first'); return pty; });
			const registration = h.register({ provideTasks: () => [task], resolveTask: value => value });
			await h.provide(registration.handle);
			await h.start(task);
			task = createTask('same', async () => { called.push('second'); return pty; });
			await h.provide(registration.handle);
			await h.start(task);
			assert.deepStrictEqual(called, ['first', 'second']);
			await h.end(task);
		});

		test('an extension-held task remains executable after provider disposal', async () => {
			const h = createService();
			const task = createTask('held');
			const registration = h.register(provider(task));
			await h.provide(registration.handle);
			await registration.dispose();
			await h.service.executeTask(extension, task);
			await h.start(task);
			await h.end(task);
			assert.deepStrictEqual({ attached: h.attached, active: [...h.active], tasks: h.service.taskExecutions }, { attached: [pty], active: [], tasks: [] });
		});

		test('a fetched task requested before disposal keeps its callback until it starts', async () => {
			const h = createService();
			const task = createTask('held');
			const registration = h.register(provider(task));
			await h.provide(registration.handle);
			task._id = task.name;
			await h.service.executeTask(extension, task);
			await registration.dispose();
			await h.start(task);
			await h.end(task);
			assert.deepStrictEqual({ attached: h.attached, active: [...h.active] }, { attached: [pty], active: [] });
		});

		test('direct execution preserves rerun retention and prunes older identities', async () => {
			const h = createService();
			const states: string[][] = [];
			for (const name of ['first', 'second']) {
				const task = createTask(name);
				await h.service.executeTask(extension, task);
				await h.start(task);
				await h.end(task);
				states.push([...h.cache.keys()]);
			}
			assert.deepStrictEqual(states, [['first'], ['second']]);
		});

		test('direct execution and a provider can share an identity independently', async () => {
			const h = createService();
			const provided = createTask('same');
			const direct = createTask('same');
			const registration = h.register(provider(provided));
			await h.provide(registration.handle);
			await h.service.executeTask(extension, direct);
			await h.start(direct);
			await h.end(direct);
			const next = createTask('next');
			await h.service.executeTask(extension, next);
			await h.start(next);
			await h.end(next);
			assert.deepStrictEqual(h.cache.get('same'), provided.execution);
			await registration.dispose();
			assert.deepStrictEqual([...h.cache.keys()], ['next']);
		});

		test('rediscovery cannot replace a pending direct execution callback', async () => {
			const h = createService();
			const called: string[] = [];
			const direct = createTask('same', async () => { called.push('direct'); return pty; });
			const provided = createTask('same', async () => { called.push('provider'); return pty; });
			await h.service.executeTask(extension, direct);
			const registration = h.register(provider(provided));
			await h.provide(registration.handle);
			await registration.dispose();
			await h.start(direct);
			await h.end(direct);
			assert.deepStrictEqual(called, ['direct']);
		});
	});
}
