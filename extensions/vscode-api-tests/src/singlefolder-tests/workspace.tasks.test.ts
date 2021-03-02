/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { window, tasks, Disposable, TaskDefinition, Task, EventEmitter, CustomExecution, Pseudoterminal, TaskScope, commands, env, UIKind, ShellExecution, TaskExecution, Terminal, Event } from 'vscode';
import { assertNoRpc } from '../utils';

// Disable tasks tests:
// - Web https://github.com/microsoft/vscode/issues/90528
((env.uiKind === UIKind.Web) ? suite.skip : suite)('vscode API - tasks', () => {

	suite('Tasks', () => {
		let disposables: Disposable[] = [];

		teardown(() => {
			assertNoRpc();
			disposables.forEach(d => d.dispose());
			disposables.length = 0;
		});

		test('CustomExecution task should start and shutdown successfully', async () => {
			interface CustomTestingTaskDefinition extends TaskDefinition {
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
						const kind: CustomTestingTaskDefinition = {
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
				disposables.push(window.onDidCloseTerminal(() => {
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

		test('sync CustomExecution task should flush all data on close', async () => {
			interface CustomTestingTaskDefinition extends TaskDefinition {
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
						const kind: CustomTestingTaskDefinition = {
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

		test('Execution from onDidEndTaskProcess and onDidStartTaskProcess are equal to original', () => {
			return new Promise<void>(async (resolve) => {
				const task = new Task({ type: 'testTask' }, TaskScope.Workspace, 'echo', 'testTask', new ShellExecution('echo', ['hello test']));
				let taskExecution: TaskExecution | undefined;
				const executeDoneEvent: EventEmitter<void> = new EventEmitter();
				const taskExecutionShouldBeSet: Promise<void> = new Promise(resolve => {
					const disposable = executeDoneEvent.event(() => {
						resolve();
						disposable.dispose();
					});
				});
				let count = 2;
				const progressMade: EventEmitter<void> = new EventEmitter();
				let startSucceeded = false;
				let endSucceeded = false;
				disposables.push(progressMade.event(() => {
					count--;
					if ((count === 0) && startSucceeded && endSucceeded) {
						resolve();
					}
				}));


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

				taskExecution = await tasks.executeTask(task);
				executeDoneEvent.fire();
			});
		});

		// https://github.com/microsoft/vscode/issues/100577
		test('A CustomExecution task can be fetched and executed', () => {
			return new Promise<void>(async (resolve, reject) => {
				class CustomTerminal implements Pseudoterminal {
					private readonly writeEmitter = new EventEmitter<string>();
					public readonly onDidWrite: Event<string> = this.writeEmitter.event;
					public async close(): Promise<void> { }
					private closeEmitter = new EventEmitter<void>();
					onDidClose: Event<void> = this.closeEmitter.event;
					public open(): void {
						this.closeEmitter.fire();
						resolve();
					}
				}

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
								return new CustomTerminal();
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
					reject('fetched task can\'t be undefined');
				}
			});
		});
	});
});
