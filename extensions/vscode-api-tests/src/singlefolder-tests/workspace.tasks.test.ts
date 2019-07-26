/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('workspace-namespace', () => {

	suite('Tasks', () => {

		test('CustomExecution2 task should start and shutdown successfully', (done) => {
			interface CustomTestingTaskDefinition extends vscode.TaskDefinition {
				/**
				 * One of the task properties. This can be used to customize the task in the tasks.json
				 */
				customProp1: string;
			}
			const taskType: string = 'customTesting';
			const taskName = 'First custom task';
			const reg1 = vscode.window.onDidOpenTerminal(term => {
				reg1.dispose();
				const reg2 = term.onDidWriteData(e => {
					reg2.dispose();
					assert.equal(e, 'testing\r\n');
					term.dispose();
				});
			});
			const taskProvider = vscode.tasks.registerTaskProvider(taskType, {
				provideTasks: () => {
					const result: vscode.Task[] = [];
					const kind: CustomTestingTaskDefinition = {
						type: taskType,
						customProp1: 'testing task one'
					};
					const writeEmitter = new vscode.EventEmitter<string>();
					const execution = new vscode.CustomExecution2((): Thenable<vscode.Pseudoterminal> => {
						const pty: vscode.Pseudoterminal = {
							onDidWrite: writeEmitter.event,
							open: () => {
								writeEmitter.fire('testing\r\n');
							},
							close: () => {
								taskProvider.dispose();
								done();
							}
						};
						return Promise.resolve(pty);
					});
					const task = new vscode.Task2(kind, vscode.TaskScope.Workspace, taskName, taskType, execution);
					result.push(task);
					return result;
				},
				resolveTask(_task: vscode.Task): vscode.Task | undefined {
					assert.fail('resolveTask should not trigger during the test');
					return undefined;
				}
			});
			vscode.commands.executeCommand('workbench.action.tasks.runTask', `${taskType}: ${taskName}`);
		});
	});
});
