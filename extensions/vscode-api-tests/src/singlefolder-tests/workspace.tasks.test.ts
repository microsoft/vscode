/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { commands, ConfigurationTarget, CustomExecution, Disposable, env, Event, EventEmitter, Pseudoterminal, ShellExecution, Task, TaskDefinition, TaskProcessStartEvent, tasks, TaskScope, Terminal, UIKind, window, workspace } from 'vscode';
import { assertNoRpc } from '../utils';

// Disable tasks tests:
// - Web https://github.com/microsoft/vscode/issues/90528
((env.uiKind === UIKind.Web) ? suite.skip : suite)('vscode API - tasks', () => {

	suiteSetup(async () => {
		const config = workspace.getConfiguration('terminal.integrated');
		// Disable conpty in integration tests because of https://github.com/microsoft/vscode/issues/76548
		await config.update('windowsEnableConpty', false, ConfigurationTarget.Global);
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
