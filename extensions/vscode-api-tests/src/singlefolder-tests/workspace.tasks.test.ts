/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { commands, ConfigurationTarget, CustomExecution, Disposable, env, Event, EventEmitter, Pseudoterminal, ShellExecution, Task, TaskDefinition, TaskProcessStartEvent, tasks, TaskScope, Terminal, UIKind, Uri, window, workspace } from 'vscode';
import { asPromise, assertNoRpc, DeferredPromise } from '../utils';

// Disable tasks tests:
// - Web https://github.com/microsoft/vscode/issues/90528
((env.uiKind === UIKind.Web) ? suite.skip : suite)('vscode API - tasks', () => {

	suiteSetup(async () => {
		const config = workspace.getConfiguration('terminal.integrated');
		// Disable exit alerts as tests may trigger then and we're not testing the notifications
		await config.update('showExitAlert', false, ConfigurationTarget.Global);
		// Canvas may cause problems when running in a container
		await config.update('gpuAcceleration', 'off', ConfigurationTarget.Global);
		// Disable env var relaunch for tests to prevent terminals relaunching themselves
		await config.update('environmentChangesRelaunch', false, ConfigurationTarget.Global);
	});

	suite('Tasks', () => {
		const disposables: Disposable[] = [];

		teardown(() => {
			assertNoRpc();
			disposables.forEach(d => d.dispose());
			disposables.length = 0;
		});

		suite('ShellExecution', () => {
			test('Execution from onDidEndTaskProcess and onDidStartTaskProcess are equal to original', async () => {
				window.terminals.forEach(terminal => terminal.dispose());
				const executeDoneEvent: EventEmitter<void> = new EventEmitter();
				const taskExecutionShouldBeSet: Promise<void> = new Promise(resolve => {
					const disposable = executeDoneEvent.event(() => {
						resolve();
						disposable.dispose();
					});
				});

				const progressMade: EventEmitter<void> = new EventEmitter();
				let count = 2;
				let startSucceeded = false;
				let endSucceeded = false;
				const testDonePromise = new Promise<void>(resolve => {
					disposables.push(progressMade.event(() => {
						count--;
						if ((count === 0) && startSucceeded && endSucceeded) {
							resolve();
						}
					}));
				});

				const task = new Task({ type: 'testTask' }, TaskScope.Workspace, 'echo', 'testTask', new ShellExecution('echo', ['hello test']));

				disposables.push(tasks.onDidStartTaskProcess(async (e) => {
					await taskExecutionShouldBeSet;
					if (e.execution === taskExecution) {
						startSucceeded = true;
						progressMade.fire();
					}
				}));

				disposables.push(tasks.onDidEndTaskProcess(async (e) => {
					await taskExecutionShouldBeSet;
					if (e.execution === taskExecution) {
						endSucceeded = true;
						progressMade.fire();
					}
				}));
				const taskExecution = await tasks.executeTask(task);
				executeDoneEvent.fire();
				await testDonePromise;
			});

			test.skip('dependsOn task should start with a different processId (#118256)', async () => {
				// Set up dependsOn task by creating tasks.json since this is not possible via the API
				// Tasks API
				const tasksConfig = workspace.getConfiguration('tasks');
				await tasksConfig.update('version', '2.0.0', ConfigurationTarget.Workspace);
				await tasksConfig.update('tasks', [
					{
						label: 'taskToDependOn',
						type: 'shell',
						command: 'sleep 1',
						problemMatcher: []
					},
					{
						label: 'Run this task',
						type: 'shell',
						command: 'sleep 1',
						problemMatcher: [],
						dependsOn: 'taskToDependOn'
					}
				], ConfigurationTarget.Workspace);

				const waitForTaskToFinish = new Promise<void>(resolve => {
					tasks.onDidEndTask(e => {
						if (e.execution.task.name === 'Run this task') {
							resolve();
						}
					});
				});

				const waitForStartEvent1 = new Promise<TaskProcessStartEvent>(r => {
					// Listen for first task and verify valid process ID
					const listener = tasks.onDidStartTaskProcess(async (e) => {
						if (e.execution.task.name === 'taskToDependOn') {
							listener.dispose();
							r(e);
						}
					});
				});

				const waitForStartEvent2 = new Promise<TaskProcessStartEvent>(r => {
					// Listen for second task, verify valid process ID and that it's not the process ID of
					// the first task
					const listener = tasks.onDidStartTaskProcess(async (e) => {
						if (e.execution.task.name === 'Run this task') {
							listener.dispose();
							r(e);
						}
					});
				});

				// Run the task
				commands.executeCommand('workbench.action.tasks.runTask', 'Run this task');

				const startEvent1 = await waitForStartEvent1;
				assert.ok(startEvent1.processId);

				const startEvent2 = await waitForStartEvent2;
				assert.ok(startEvent2.processId);
				assert.notStrictEqual(startEvent1.processId, startEvent2.processId);
				await waitForTaskToFinish;
				// Clear out tasks config
				await tasksConfig.update('tasks', []);
			});
		});

		suite('CustomExecution', () => {
			const reviewTaskType = 'custombuildscript';

			for (const dependencyExitCode of [0, 1]) {
				test(`accepted workbench custom task survives provider disposal during dependency wait (exit: ${dependencyExitCode})`, async () => {
					const folder = workspace.workspaceFolders?.[0];
					assert.ok(folder);
					const config = workspace.getConfiguration('tasks', folder.uri);
					const oldTasks = config.inspect<readonly TaskDefinition[]>('tasks')?.workspaceValue;
					const oldVersion = config.inspect<string>('version')?.workspaceValue;
					const gateName = `review gate ${dependencyExitCode}`;
					const targetName = `review target ${dependencyExitCode}`;
					const gateOpen = new EventEmitter<void>();
					const gateWrite = new EventEmitter<string>();
					const gateClose = new EventEmitter<number>();
					const targetWrite = new EventEmitter<string>();
					const targetClose = new EventEmitter<number>();
					const targetOutput = new EventEmitter<string>();
					const targetEnd = new EventEmitter<void>();
					const gateEnd = new EventEmitter<void>();
					disposables.push(gateOpen, gateWrite, gateClose, targetWrite, targetClose, targetOutput, targetEnd, gateEnd);
					let targetCalls = 0;
					const gate = new Task({ type: reviewTaskType, flavor: gateName }, folder, gateName, reviewTaskType, new CustomExecution(async () => ({
						onDidWrite: gateWrite.event, onDidClose: gateClose.event, open: () => gateOpen.fire(), close() { }
					})));
					const target = new Task({ type: reviewTaskType, flavor: targetName }, folder, targetName, reviewTaskType, new CustomExecution(async () => {
						targetCalls++;
						return { onDidWrite: targetWrite.event, onDidClose: targetClose.event, open: () => targetWrite.fire(`${targetName}\r\n`), close() { } };
					}));
					const registration = tasks.registerTaskProvider(reviewTaskType, { provideTasks: () => [gate, target], resolveTask: value => value });
					disposables.push(registration);
					disposables.push(window.onDidWriteTerminalData(event => {
						if (event.data.includes(targetName)) {
							targetOutput.fire(event.data);
						}
					}));
					disposables.push(tasks.onDidEndTask(event => {
						if (event.execution.task.name === targetName) {
							targetEnd.fire();
						} else if (event.execution.task.name === gateName) {
							gateEnd.fire();
						}
					}));
					disposables.push(window.onDidOpenTerminal(terminal => {
						if (terminal.name === gateName || terminal.name === targetName) {
							disposables.push(terminal);
						}
					}));
					try {
						await config.update('version', '2.0.0', ConfigurationTarget.Workspace);
						await config.update('tasks', [
							{ label: gateName, type: reviewTaskType, flavor: gateName, problemMatcher: [] },
							{ label: targetName, type: reviewTaskType, flavor: targetName, dependsOn: gateName, problemMatcher: [] }
						], ConfigurationTarget.Workspace);
						const discovered = await tasks.fetchTasks({ type: reviewTaskType });
						assert.ok(discovered.some(task => task.definition.flavor === targetName));
						const opened = asPromise(gateOpen.event, 10000);
						const running = commands.executeCommand('workbench.action.tasks.runTask', { type: reviewTaskType, flavor: targetName });
						await opened;
						registration.dispose();
						await tasks.fetchTasks({ type: reviewTaskType });
						assert.strictEqual(targetCalls, 0, 'Target must still be waiting for the dependency');
						const gateEnded = asPromise(gateEnd.event, 10000);
						if (dependencyExitCode === 0) {
							const output = asPromise(targetOutput.event, 10000);
							gateClose.fire(0);
							assert.strictEqual(await output, `${targetName}\r\n`);
							const ended = asPromise(targetEnd.event, 10000);
							targetClose.fire(0);
							await ended;
						} else {
							gateClose.fire(dependencyExitCode);
						}
						await gateEnded;
						await running;
						assert.strictEqual(targetCalls, dependencyExitCode === 0 ? 1 : 0);
					} finally {
						gateClose.fire(1);
						targetClose.fire(1);
						await config.update('tasks', oldTasks, ConfigurationTarget.Workspace);
						await config.update('version', oldVersion, ConfigurationTarget.Workspace);
					}
				});
			}

			test('concurrent workbench custom instances open both delayed terminals independently', async () => {
				const folder = workspace.workspaceFolders?.[0];
				assert.ok(folder);
				const config = workspace.getConfiguration('tasks', folder.uri);
				const oldTasks = config.inspect<readonly TaskDefinition[]>('tasks')?.workspaceValue;
				const oldVersion = config.inspect<string>('version')?.workspaceValue;
				const name = 'review concurrent custom';
				const gates = [new DeferredPromise<Pseudoterminal>(), new DeferredPromise<Pseudoterminal>()];
				const entered = [new EventEmitter<void>(), new EventEmitter<void>()];
				const output = [new EventEmitter<string>(), new EventEmitter<string>()];
				const writes = [new EventEmitter<string>(), new EventEmitter<string>()];
				const closes = [new EventEmitter<number>(), new EventEmitter<number>()];
				const ended = new EventEmitter<void>();
				disposables.push(...entered, ...output, ...writes, ...closes, ended);
				let calls = 0;
				const exitSent = [false, false];
				const prematureClose: number[] = [];
				const observedTerminals: Terminal[] = [];
				const ptys = gates.map((_, index): Pseudoterminal => ({
					onDidWrite: writes[index].event,
					onDidClose: closes[index].event,
					open: () => writes[index].fire(`INSTANCE_${index}_READY\r\n`),
					close: () => { if (!exitSent[index]) { prematureClose.push(index); } }
				}));
				const task = new Task({ type: reviewTaskType, flavor: name }, folder, name, reviewTaskType, new CustomExecution(() => {
					const index = calls++;
					entered[index].fire();
					return gates[index].p;
				}));
				const registration = tasks.registerTaskProvider(reviewTaskType, { provideTasks: () => [task], resolveTask: value => value });
				disposables.push(registration);
				disposables.push(window.onDidOpenTerminal(terminal => {
					if (terminal.name.includes(name)) {
						disposables.push(terminal);
					}
				}));
				disposables.push(window.onDidWriteTerminalData(event => {
					for (let index = 0; index < 2; index++) {
						if (event.data.includes(`INSTANCE_${index}_READY`)) {
							observedTerminals[index] = event.terminal;
							output[index].fire(event.data);
						}
					}
				}));
				disposables.push(tasks.onDidEndTask(event => {
					if (event.execution.task.name === name) {
						ended.fire();
					}
				}));
				try {
					await config.update('version', '2.0.0', ConfigurationTarget.Workspace);
					await config.update('tasks', [{ label: name, type: reviewTaskType, flavor: name, problemMatcher: [], runOptions: { instanceLimit: 2 }, presentation: { panel: 'new' } }], ConfigurationTarget.Workspace);
					const discovered = await tasks.fetchTasks({ type: reviewTaskType });
					assert.ok(discovered.some(task => task.definition.flavor === name));
					const firstEntered = asPromise(entered[0].event, 10000);
					const firstRun = commands.executeCommand('workbench.action.tasks.runTask', { type: reviewTaskType, flavor: name });
					await firstEntered;
					const secondEntered = asPromise(entered[1].event, 10000);
					const secondRun = commands.executeCommand('workbench.action.tasks.runTask', { type: reviewTaskType, flavor: name });
					await secondEntered;
					registration.dispose();
					await tasks.fetchTasks({ type: reviewTaskType });
					for (let index = 0; index < 2; index++) {
						const received = asPromise(output[index].event, 10000);
						await gates[index].complete(ptys[index]);
						assert.strictEqual(await received, `INSTANCE_${index}_READY\r\n`);
						const finished = asPromise(ended.event, 10000);
						exitSent[index] = true;
						closes[index].fire(0);
						await finished;
					}
					await Promise.all([firstRun, secondRun]);
					assert.deepStrictEqual({ calls, prematureClose, distinctTerminals: observedTerminals[0] !== observedTerminals[1] }, { calls: 2, prematureClose: [], distinctTerminals: true });
				} finally {
					for (let index = 0; index < 2; index++) {
						exitSent[index] = true;
						if (!gates[index].isSettled) {
							await gates[index].complete(ptys[index]);
						}
						closes[index].fire(1);
						observedTerminals[index]?.dispose();
					}
					await config.update('tasks', oldTasks, ConfigurationTarget.Workspace);
					await config.update('version', oldVersion, ConfigurationTarget.Workspace);
				}
			});

			test('main-thread startup survives provider disposal before the extension host observes the start', async () => {
				window.terminals.forEach(terminal => terminal.dispose());
				const name = 'Custom task startup disposal';
				const folder = workspace.workspaceFolders?.[0];
				assert.ok(folder);
				const writes = new EventEmitter<string>();
				const closes = new EventEmitter<number>();
				disposables.push(writes, closes);
				let callbackCount = 0;
				let startCount = 0;
				let disposedBeforeStart = false;
				let definition: TaskDefinition | undefined;
				let terminal: Terminal | undefined;
				const task = new Task({ type: 'customTesting', customProp1: '${workspaceFolder}' }, folder, name, 'customTesting', new CustomExecution(async value => {
					callbackCount++;
					definition = value;
					return {
						onDidWrite: writes.event,
						onDidClose: closes.event,
						open: () => writes.fire(`${name}\r\n`),
						close() { }
					};
				}));
				const registration = tasks.registerTaskProvider('customTesting', {
					provideTasks: () => [task],
					resolveTask: value => value
				});
				disposables.push(registration);
				disposables.push(window.onDidOpenTerminal(value => {
					if (value.name === name) {
						terminal = value;
						disposables.push(value);
						disposedBeforeStart = callbackCount === 0 && startCount === 0;
						registration.dispose();
					}
				}));
				disposables.push(tasks.onDidStartTask(event => {
					if (event.execution.task.name === name) {
						startCount++;
					}
				}));
				const output = new Promise<string>(resolve => {
					disposables.push(window.onDidWriteTerminalData(event => {
						if (event.terminal === terminal && event.data.includes(name)) {
							resolve(event.data);
						}
					}));
				});
				const ended = new Promise<void>(resolve => {
					disposables.push(tasks.onDidEndTask(event => {
						if (event.execution.task.name === name) {
							resolve();
						}
					}));
				});
				const running = commands.executeCommand('workbench.action.tasks.runTask', `customTesting: ${name}`);
				const data = await output;
				closes.fire(0);
				await ended;
				await running;
				assert.deepStrictEqual({
					data, callbackCount, startCount, disposedBeforeStart,
					resolvedFolder: typeof definition?.customProp1 === 'string' ? Uri.file(definition.customProp1).fsPath : undefined,
					discovered: await tasks.fetchTasks({ type: 'customTesting' }),
					active: tasks.taskExecutions.some(execution => execution.task.name === name)
				}, {
					data: `${name}\r\n`, callbackCount: 1, startCount: 1, disposedBeforeStart: true,
					resolvedFolder: folder.uri.fsPath, discovered: [], active: false
				});
			});

			for (const disposeBeforeExecution of [true, false]) {
				test(`provider disposal ${disposeBeforeExecution ? 'before execution preserves an extension-held task' : 'during execution preserves output and completion'}`, async () => {
					window.terminals.forEach(terminal => terminal.dispose());
					const name = `Disposed provider ${disposeBeforeExecution}`;
					const writes = new EventEmitter<string>();
					disposables.push(writes);
					const closes = new EventEmitter<number>();
					disposables.push(closes);
					let callbackCount = 0;
					let terminal: Terminal | undefined;
					disposables.push(window.onDidOpenTerminal(value => {
						terminal = value;
						disposables.push(value);
					}));
					const output = new Promise<string>(resolve => {
						disposables.push(window.onDidWriteTerminalData(event => {
							if (event.terminal === terminal && event.data.includes(name)) {
								resolve(event.data);
							}
						}));
					});
					const ended = new Promise<void>(resolve => {
						disposables.push(tasks.onDidEndTask(event => {
							if (event.execution.task.name === name) {
								resolve();
							}
						}));
					});
					const task = new Task({ type: 'customTesting', customProp1: name }, TaskScope.Workspace, name, 'customTesting', new CustomExecution(async () => {
						callbackCount++;
						return {
							onDidWrite: writes.event,
							onDidClose: closes.event,
							open: () => writes.fire(`${name}\r\n`),
							close() { }
						};
					}));
					const registration = tasks.registerTaskProvider('customTesting', {
						provideTasks: () => [task],
						resolveTask: value => value
					});
					disposables.push(registration);
					assert.strictEqual((await tasks.fetchTasks({ type: 'customTesting' })).some(value => value.name === name), true);
					if (disposeBeforeExecution) {
						registration.dispose();
						assert.deepStrictEqual(await tasks.fetchTasks({ type: 'customTesting' }), []);
					}
					const execution = await tasks.executeTask(task);
					const data = await output;
					if (!disposeBeforeExecution) {
						registration.dispose();
						assert.deepStrictEqual(await tasks.fetchTasks({ type: 'customTesting' }), []);
						assert.ok(tasks.taskExecutions.includes(execution));
					}
					closes.fire(0);
					await ended;
					assert.ok(terminal);
					const closed = new Promise<void>(resolve => {
						disposables.push(window.onDidCloseTerminal(value => {
							if (value === terminal) {
								resolve();
							}
						}));
					});
					terminal.dispose();
					await closed;
					assert.deepStrictEqual({ data, callbackCount, active: tasks.taskExecutions.includes(execution) }, {
						data: `${name}\r\n`,
						callbackCount: 1,
						active: false
					});
				});
			}

			test('task should start and shutdown successfully', async () => {
				window.terminals.forEach(terminal => terminal.dispose());
				interface ICustomTestingTaskDefinition extends TaskDefinition {
					/**
					 * One of the task properties. This can be used to customize the task in the tasks.json
					 */
					customProp1: string;
				}
				const taskType: string = 'customTesting';
				const taskName = 'First custom task';
				let isPseudoterminalClosed = false;
				// There's a strict order that should be observed here:
				// 1. The terminal opens
				// 2. The terminal is written to.
				// 3. The terminal is closed.
				enum TestOrder {
					Start,
					TerminalOpened,
					TerminalWritten,
					TerminalClosed
				}

				let testOrder = TestOrder.Start;

				// Launch the task
				const terminal = await new Promise<Terminal>(r => {
					disposables.push(window.onDidOpenTerminal(e => {
						assert.strictEqual(testOrder, TestOrder.Start);
						testOrder = TestOrder.TerminalOpened;
						r(e);
					}));
					disposables.push(tasks.registerTaskProvider(taskType, {
						provideTasks: () => {
							const result: Task[] = [];
							const kind: ICustomTestingTaskDefinition = {
								type: taskType,
								customProp1: 'testing task one'
							};
							const writeEmitter = new EventEmitter<string>();
							const execution = new CustomExecution((): Thenable<Pseudoterminal> => {
								const pty: Pseudoterminal = {
									onDidWrite: writeEmitter.event,
									open: () => writeEmitter.fire('testing\r\n'),
									close: () => isPseudoterminalClosed = true
								};
								return Promise.resolve(pty);
							});
							const task = new Task(kind, TaskScope.Workspace, taskName, taskType, execution);
							result.push(task);
							return result;
						},
						resolveTask(_task: Task): Task | undefined {
							assert.fail('resolveTask should not trigger during the test');
						}
					}));
					commands.executeCommand('workbench.action.tasks.runTask', `${taskType}: ${taskName}`);
				});

				// Verify the output
				await new Promise<void>(r => {
					disposables.push(window.onDidWriteTerminalData(e => {
						if (e.terminal !== terminal) {
							return;
						}
						assert.strictEqual(testOrder, TestOrder.TerminalOpened);
						testOrder = TestOrder.TerminalWritten;
						assert.notStrictEqual(terminal, undefined);
						assert.strictEqual(e.data, 'testing\r\n');
						r();
					}));
				});

				// Dispose the terminal
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal((e) => {
						if (e !== terminal) {
							return;
						}
						assert.strictEqual(testOrder, TestOrder.TerminalWritten);
						testOrder = TestOrder.TerminalClosed;
						// Pseudoterminal.close should have fired by now, additionally we want
						// to make sure all events are flushed before continuing with more tests
						assert.ok(isPseudoterminalClosed);
						r();
					}));
					terminal.dispose();
				});
			});

			test('sync task should flush all data on close', async () => {
				interface ICustomTestingTaskDefinition extends TaskDefinition {
					/**
					 * One of the task properties. This can be used to customize the task in the tasks.json
					 */
					customProp1: string;
				}
				const taskType: string = 'customTesting';
				const taskName = 'First custom task';

				// Launch the task
				const terminal = await new Promise<Terminal>(r => {
					disposables.push(window.onDidOpenTerminal(e => r(e)));
					disposables.push(tasks.registerTaskProvider(taskType, {
						provideTasks: () => {
							const result: Task[] = [];
							const kind: ICustomTestingTaskDefinition = {
								type: taskType,
								customProp1: 'testing task one'
							};
							const writeEmitter = new EventEmitter<string>();
							const closeEmitter = new EventEmitter<void>();
							const execution = new CustomExecution((): Thenable<Pseudoterminal> => {
								const pty: Pseudoterminal = {
									onDidWrite: writeEmitter.event,
									onDidClose: closeEmitter.event,
									open: () => {
										writeEmitter.fire('exiting');
										closeEmitter.fire();
									},
									close: () => { }
								};
								return Promise.resolve(pty);
							});
							const task = new Task(kind, TaskScope.Workspace, taskName, taskType, execution);
							result.push(task);
							return result;
						},
						resolveTask(_task: Task): Task | undefined {
							assert.fail('resolveTask should not trigger during the test');
						}
					}));
					commands.executeCommand('workbench.action.tasks.runTask', `${taskType}: ${taskName}`);
				});

				// Verify the output
				await new Promise<void>(r => {
					disposables.push(window.onDidWriteTerminalData(e => {
						if (e.terminal !== terminal) {
							return;
						}
						assert.strictEqual(e.data, 'exiting');
						r();
					}));
				});

				// Dispose the terminal
				await new Promise<void>(r => {
					disposables.push(window.onDidCloseTerminal(() => r()));
					terminal.dispose();
				});
			});

			test('A task can be fetched and executed (#100577)', async () => {
				class CustomTerminal implements Pseudoterminal {
					private readonly writeEmitter = new EventEmitter<string>();
					public readonly onDidWrite: Event<string> = this.writeEmitter.event;
					public async close(): Promise<void> { }
					private closeEmitter = new EventEmitter<void>();
					onDidClose: Event<void> = this.closeEmitter.event;
					private readonly _onDidOpen = new EventEmitter<void>();
					public readonly onDidOpen = this._onDidOpen.event;
					public open(): void {
						this._onDidOpen.fire();
						this.closeEmitter.fire();
					}
				}

				const customTerminal = new CustomTerminal();
				const terminalOpenedPromise = new Promise<void>(resolve => {
					const disposable = customTerminal.onDidOpen(() => {
						disposable.dispose();
						resolve();
					});
				});

				function buildTask(): Task {
					const task = new Task(
						{
							type: 'customTesting',
						},
						TaskScope.Workspace,
						'Test Task',
						'customTesting',
						new CustomExecution(
							async (): Promise<Pseudoterminal> => {
								return customTerminal;
							}
						)
					);
					return task;
				}

				disposables.push(tasks.registerTaskProvider('customTesting', {
					provideTasks: () => {
						return [buildTask()];
					},
					resolveTask(_task: Task): undefined {
						return undefined;
					}
				}));


				const task = await tasks.fetchTasks({ type: 'customTesting' });

				if (task && task.length > 0) {
					await tasks.executeTask(task[0]);
				} else {
					assert.fail('fetched task can\'t be undefined');
				}
				await terminalOpenedPromise;
			});

			test('A task can be fetched with default task group information', async () => {
				// Add default to tasks.json since this is not possible using an API yet.
				const tasksConfig = workspace.getConfiguration('tasks');
				await tasksConfig.update('version', '2.0.0', ConfigurationTarget.Workspace);
				await tasksConfig.update('tasks', [
					{
						label: 'Run this task',
						type: 'shell',
						command: 'sleep 1',
						problemMatcher: [],
						group: {
							kind: 'build',
							isDefault: true
						}
					}
				], ConfigurationTarget.Workspace);

				const task = <Task[]>(await tasks.fetchTasks());

				if (task && task.length > 0) {
					const grp = task[0].group;
					assert.strictEqual(grp?.isDefault, true);
				} else {
					assert.fail('fetched task can\'t be undefined');
				}
				// Reset tasks.json
				await tasksConfig.update('tasks', []);
			});

			test('Tasks can be run back to back', async () => {
				class Pty implements Pseudoterminal {
					writer = new EventEmitter<string>();
					onDidWrite = this.writer.event;
					closer = new EventEmitter<number | undefined>();
					onDidClose = this.closer.event;

					constructor(readonly num: number, readonly quick: boolean) { }

					cleanup() {
						this.writer.dispose();
						this.closer.dispose();
					}

					open() {
						this.writer.fire('starting\r\n');
						setTimeout(() => {
							this.closer.fire(this.num);
							this.cleanup();
						}, this.quick ? 1 : 200);
					}

					close() {
						this.closer.fire(undefined);
						this.cleanup();
					}
				}

				async function runTask(num: number, quick: boolean) {
					const pty = new Pty(num, quick);
					const task = new Task(
						{ type: 'task_bug', exampleProp: `hello world ${num}` },
						TaskScope.Workspace, `task bug ${num}`, 'task bug',
						new CustomExecution(
							async () => {
								return pty;
							},
						));
					tasks.executeTask(task);
					return new Promise<number | undefined>(resolve => {
						pty.onDidClose(exitCode => {
							resolve(exitCode);
						});
					});
				}


				const [r1, r2, r3, r4] = await Promise.all([
					runTask(1, false), runTask(2, false), runTask(3, false), runTask(4, false)
				]);
				assert.strictEqual(r1, 1);
				assert.strictEqual(r2, 2);
				assert.strictEqual(r3, 3);
				assert.strictEqual(r4, 4);

				const [j1, j2, j3, j4] = await Promise.all([
					runTask(5, true), runTask(6, true), runTask(7, true), runTask(8, true)
				]);
				assert.strictEqual(j1, 5);
				assert.strictEqual(j2, 6);
				assert.strictEqual(j3, 7);
				assert.strictEqual(j4, 8);
			});
		});
	});
});
