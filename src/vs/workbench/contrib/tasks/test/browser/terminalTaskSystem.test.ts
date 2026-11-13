/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, Sequencer, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { MarkerService } from '../../../../../platform/markers/common/markerService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { ITerminalInstance } from '../../../terminal/browser/terminal.js';
import { IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { TestWorkspaceTrustManagementService } from '../../../../test/common/workbenchTestServices.js';
import { TerminalTaskSystem } from '../../browser/terminalTaskSystem.js';
import { assertTaskWorkspaceTrust, ITaskResolver, ITaskSummary } from '../../common/taskSystem.js';
import { ContributedTask, DependsOrder, ITaskEvent, PanelKind, PresentationOptions, RuntimeType, Task, TaskEvent, TaskEventKind, TaskScope, TaskSourceKind } from '../../common/tasks.js';
import { ApplyToKind, FileLocationKind, ProblemMatcher } from '../../common/problemMatcher.js';

suite('TerminalTaskSystem workspace trust', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const folder = new WorkspaceFolder({ uri: URI.file('/workspace'), name: 'workspace', index: 0 });

	function createTask(id: string): ContributedTask {
		return new ContributedTask(id, {
			kind: TaskSourceKind.Extension, label: 'test', extension: 'test', scope: TaskScope.Folder, workspaceFolder: folder
		}, id, 'test', { type: 'test', _key: id }, {
			runtime: RuntimeType.Process, name: 'recorder', presentation: { ...PresentationOptions.defaults, panel: PanelKind.New }
		}, false, {}, {});
	}

	for (const preparation of ['dependency resolution', 'dependency completion', 'input'] as const) {
		test(`does not start a command after trust is revoked during ${preparation}`, async () => {
			const trust = store.add(new TestWorkspaceTrustManagementService());
			const pending = new DeferredPromise<void>();
			const entered = new DeferredPromise<void>();
			const pause = async () => {
				await entered.complete();
				await pending.p;
			};
			const launches: string[] = [];
			const task = createTask('parent');
			const dependency = createTask('dependency');
			if (preparation !== 'input') {
				task.configurationProperties.dependsOn = [{ uri: folder.uri, task: dependency._id }];
				task.configurationProperties.dependsOrder = DependsOrder.sequence;
			}
			const resolver: ITaskResolver = {
				resolve: async () => {
					if (preparation === 'dependency resolution') {
						await pause();
					}
					return dependency;
				}
			};
			const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
				_workspaceTrustManagementService: trust,
				_activeTasks: {},
				_taskDependencies: {},
				_getInstances: () => [],
				_showTaskLoadErrors: () => { },
				_fireTaskEvent: () => { },
				_adoptConfigurationForDependencyTask: () => { },
				_executeDependencyTask: async () => {
					launches.push('dependency');
					await pause();
					return { exitCode: 0 };
				},
				_taskSystemInfoResolver: () => undefined,
				_acquireInput: async () => {
					await pause();
					return { variables: new Map<string, string>() };
				},
				_executeInTerminal: async (task: Task) => {
					launches.push(task._id);
					return { exitCode: 0 };
				},
				_logService: { error: () => { } }
			}) as TerminalTaskSystem;
			const execution = system.run(task, resolver).promise;
			const rejected = assert.rejects(execution, /workspace is no longer trusted/);
			await entered.p;
			await trust.setWorkspaceTrust(false);
			await pending.complete();
			await rejected;
			assert.deepStrictEqual(launches, preparation === 'dependency completion' ? ['dependency'] : []);
		});
	}

	test('releases the inactive listener when a background dependency is cancelled', async () => {
		const trust = store.add(new TestWorkspaceTrustManagementService());
		const emitter = store.add(new Emitter<ITaskEvent>());
		const pending = new DeferredPromise<void>();
		const task = createTask('background');
		task.configurationProperties.isBackground = true;
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_onDidStateChange: emitter,
			_executeTask: async () => {
				await pending.p;
				assertTaskWorkspaceTrust(trust);
				return { exitCode: 0 };
			}
		}) as {
			_executeDependencyTask(task: Task, resolver: ITaskResolver, trigger: string, liveDependencies: Set<string>, encounteredTasks: Map<string, Promise<ITaskSummary>>): Promise<ITaskSummary>;
		};
		const execution = system._executeDependencyTask(task, { resolve: async () => undefined }, 'command', new Set(), new Map());
		const rejected = assert.rejects(execution, /workspace is no longer trusted/);
		await trust.setWorkspaceTrust(false);
		await pending.complete();
		await rejected;
		assert.strictEqual(emitter.hasListeners(), false);
	});

	test('balances background activity and rejects readiness when terminal preparation is cancelled', async () => {
		const trust = store.add(new TestWorkspaceTrustManagementService());
		const emitter = store.add(new Emitter<ITaskEvent>());
		const events: TaskEventKind[] = [];
		const observer = store.add(emitter.event(event => events.push(event.kind)));
		const pending = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		const task = createTask('background');
		const matcher: ProblemMatcher = {
			owner: 'test', applyTo: ApplyToKind.allDocuments, fileLocation: FileLocationKind.Relative, filePrefix: '/workspace',
			pattern: { regexp: /^(.*):(\d+): (.*)$/, file: 1, line: 2, message: 3 },
			watching: { activeOnStart: true, beginsPattern: { regexp: /^begin$/ }, endsPattern: { regexp: /^end$/ } }
		};
		task.configurationProperties.isBackground = true;
		task.configurationProperties.problemMatchers = [matcher];
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_workspaceTrustManagementService: trust,
			_onDidStateChange: emitter,
			_activeTasks: {},
			_busyTasks: {},
			_taskDependencies: {},
			_taskErrors: {},
			_getInstances: () => [],
			_showTaskLoadErrors: () => { },
			_logService: store.add(new NullLogService()),
			_markerService: store.add(new MarkerService()),
			_modelService: new class extends mock<IModelService>() {
				override readonly onModelAdded = Event.None;
				override readonly onModelRemoved = Event.None;
				override getModels() { return []; }
			},
			_resolveMatchers: async () => [matcher, { ...matcher, owner: 'second' }],
			_executeCommand: () => system._executeInTerminal(task, 'command', { values: new Map() }, folder),
			_createTerminal: async () => {
				await entered.complete();
				await pending.p;
				assertTaskWorkspaceTrust(trust);
				throw new Error('Expected task cancellation');
			}
		}) as {
			getBusyTasks(): Task[];
			_executeInTerminal(task: Task, trigger: string, resolver: { values: Map<string, string> }, folder: WorkspaceFolder): Promise<ITaskSummary>;
			_executeDependencyTask(task: Task, resolver: ITaskResolver, trigger: string, liveDependencies: Set<string>, encounteredTasks: Map<string, Promise<ITaskSummary>>): Promise<ITaskSummary>;
			_getDependencyPromise(task: { task: Task; state: TaskEventKind; promise: Promise<ITaskSummary> }): Promise<ITaskSummary>;
		};
		const execution = system._executeDependencyTask(task, { resolve: async () => undefined }, 'command', new Set(), new Map());
		const rejected = assert.rejects(execution, /workspace is no longer trusted/);
		await entered.p;
		assert.deepStrictEqual(system.getBusyTasks(), [task]);
		const alreadyActiveRejected = assert.rejects(system._getDependencyPromise({ task, state: TaskEventKind.Active, promise: execution }), /workspace is no longer trusted/);
		await trust.setWorkspaceTrust(false);
		await pending.complete();
		await Promise.all([rejected, alreadyActiveRejected]);
		observer.dispose();
		assert.deepStrictEqual({
			busyTasks: system.getBusyTasks(), events, hasListeners: emitter.hasListeners()
		}, {
			busyTasks: [],
			events: [TaskEventKind.Active, TaskEventKind.Active, TaskEventKind.End, TaskEventKind.Inactive, TaskEventKind.Inactive],
			hasListeners: false
		});
	});

	for (const outcome of ['ready', 'exit successfully', 'exit unsuccessfully'] as const) {
		test(`preserves background dependency completion when tasks ${outcome}`, async () => {
			const emitter = store.add(new Emitter<ITaskEvent>());
			const pending = new DeferredPromise<ITaskSummary>();
			const task = createTask('background');
			task.configurationProperties.isBackground = true;
			task.configurationProperties.problemMatchers = ['$test'];
			const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
				_onDidStateChange: emitter
			}) as {
				_getDependencyPromise(task: { task: Task; state: TaskEventKind; promise: Promise<ITaskSummary> }): Promise<ITaskSummary>;
			};
			const readiness = system._getDependencyPromise({ task, state: TaskEventKind.Active, promise: pending.p });
			emitter.fire(outcome === 'ready' ? TaskEvent.inactive(task, 1) : TaskEvent.general(TaskEventKind.End, task));
			if (outcome !== 'ready') {
				await pending.complete({ exitCode: outcome === 'exit successfully' ? 0 : 7 });
			}
			const summary = await readiness;
			if (outcome === 'ready') {
				await pending.complete({ exitCode: 7 });
			}
			assert.deepStrictEqual({ summary, hasListeners: emitter.hasListeners() }, {
				summary: { exitCode: outcome === 'exit unsuccessfully' ? 7 : 0 }, hasListeners: false
			});
		});
	}

	test('observes pending parallel dependency failures after parent cancellation', async () => {
		const trust = store.add(new TestWorkspaceTrustManagementService());
		const entered = new DeferredPromise<void>();
		const pendingResolver = new DeferredPromise<Task>();
		const dependencyResult = new DeferredPromise<ITaskSummary>();
		const errors: Error[] = [];
		const task = createTask('parent');
		task.configurationProperties.dependsOn = [
			{ uri: folder.uri, task: 'first' },
			{ uri: folder.uri, task: 'second' }
		];
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_workspaceTrustManagementService: trust,
			_activeTasks: {},
			_taskDependencies: {},
			_getInstances: () => [],
			_showTaskLoadErrors: () => { },
			_fireTaskEvent: () => { },
			_adoptConfigurationForDependencyTask: () => { },
			_executeDependencyTask: () => dependencyResult.p,
			_logService: { error: (_message: string, error: Error) => errors.push(error) }
		}) as TerminalTaskSystem;
		const execution = system.run(task, {
			resolve: async (_uri, identifier) => {
				if (identifier === 'first') {
					return createTask('first');
				}
				await entered.complete();
				return pendingResolver.p;
			}
		}).promise;
		const rejected = assert.rejects(execution, /workspace is no longer trusted/);
		await entered.p;
		await trust.setWorkspaceTrust(false);
		await pendingResolver.complete(createTask('second'));
		await rejected;
		await dependencyResult.error(new Error('dependency cancelled'));
		await timeout(0);
		assert.deepStrictEqual(errors.map(error => error.message.includes('workspace is no longer trusted') ? 'parent cancelled' : error.message), ['parent cancelled', 'dependency cancelled']);
	});

	test('rechecks trust after launch configuration resolution before reusing a terminal', async () => {
		const trust = store.add(new TestWorkspaceTrustManagementService());
		const pending = new DeferredPromise<IShellLaunchConfig>();
		const entered = new DeferredPromise<void>();
		const launches: string[] = [];
		const task = createTask('test');
		task.command.presentation!.panel = PanelKind.Dedicated;
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_workspaceTrustManagementService: trust,
			_currentTask: {},
			_resolveOptions: async () => ({}),
			_resolveCommandAndArgs: async () => ({ command: 'recorder', args: [] }),
			_createShellLaunchConfig: async () => {
				await entered.complete();
				return pending.p;
			},
			_sameTaskTerminals: { [task.getMapKey()]: '1' },
			_terminals: {
				'1': { terminal: { scrollToBottom: () => { }, reuseTerminal: async () => launches.push('reuse') } }
			}
		}) as { _createTerminal(task: Task, resolver: { taskSystemInfo: undefined }, folder: WorkspaceFolder): Promise<[ITerminalInstance | undefined, Error | undefined]> };
		const execution = system._createTerminal(task, { taskSystemInfo: undefined }, folder);
		const rejected = assert.rejects(execution, /workspace is no longer trusted/);
		await entered.p;
		await trust.setWorkspaceTrust(false);
		await pending.complete({ type: 'Task' });
		await rejected;
		assert.deepStrictEqual(launches, []);
	});

	test('queued terminal creation rechecks trust and a rejected creation does not block later work', async () => {
		const trust = store.add(new TestWorkspaceTrustManagementService());
		const pending = new DeferredPromise<void>();
		const entered = new DeferredPromise<void>();
		const launches: string[] = [];
		const system = Object.assign(Object.create(TerminalTaskSystem.prototype), {
			_workspaceTrustManagementService: trust,
			_currentTask: {},
			_resolveOptions: async () => ({}),
			_resolveCommandAndArgs: async () => ({ command: 'recorder', args: [] }),
			_createShellLaunchConfig: async () => ({ type: 'Task' }),
			_terminalCreationQueue: new Sequencer(),
			_terminals: {},
			_reconnectToTerminal: async () => {
				await entered.complete();
				await pending.p;
				return undefined;
			},
			_terminalService: {
				createTerminal: async () => {
					launches.push('create');
					return { instanceId: 1, shellLaunchConfig: { type: 'Task' }, onDisposed: Event.None };
				}
			},
			_logService: { trace: () => { } }
		}) as { _createTerminal(task: Task, resolver: { taskSystemInfo: undefined }, folder: WorkspaceFolder): Promise<[ITerminalInstance | undefined, Error | undefined]> };
		const execution = system._createTerminal(createTask('test'), { taskSystemInfo: undefined }, folder);
		const rejected = assert.rejects(execution, /workspace is no longer trusted/);
		await entered.p;
		const queued = system._createTerminal(createTask('queued'), { taskSystemInfo: undefined }, folder);
		const queuedRejected = assert.rejects(queued, /workspace is no longer trusted/);
		await trust.setWorkspaceTrust(false);
		await pending.complete();
		await rejected;
		await queuedRejected;
		await trust.setWorkspaceTrust(true);
		await system._createTerminal(createTask('next'), { taskSystemInfo: undefined }, folder);
		assert.deepStrictEqual(launches, ['create']);
	});
});
