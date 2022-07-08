/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Task, Terminal, TerminalCommandId } from '../../../../automation/';

export function setup() {
	describe('Task Quick Pick', () => {
		let app: Application;
		let task: Task;
		let terminal: Terminal;

		// Acquire automation API
		before(async function () {
			app = this.app as Application;
			task = app.workbench.task;
			terminal = app.workbench.terminal;
		});

		afterEach(async () => {
			// Kill all terminals between every test for a consistent testing environment
			await terminal.runCommand(TerminalCommandId.KillAll);
		});

		describe('Tasks: Run Task', () => {
			const label = "name";
			const type = "shell";
			const command = "echo 'test'";
			describe('hide', () => {
				it('true should hide the task', async () => {
					await task.configureTask({ type, command, label, hide: true });
					await task.assertTasks(label, [], 'run');
				});
				it('false should show the task', async () => {
					await task.configureTask({ type, command, label, hide: false });
					await task.assertTasks(label, [{ label }], 'run');
				});
				it('undefined should show the task', async () => {
					await task.configureTask({ type, command, label });
					await task.assertTasks(label, [{ label }], 'run');
				});
			});
			describe('icon', () => {
				it('icon', async () => {
					const config = { label, type, command, icon: { id: "lightbulb" } };
					await task.configureTask(config);
					await task.assertTasks(label, [config], 'run');
				});
				it('color', async () => {
					const config = { label, type, command, icon: { color: "terminal.ansiRed" } };
					await task.configureTask(config);
					await task.assertTasks(label, [{ label, type, command, icon: { color: "Red" } }], 'run');
				});
				it('icon & color', async () => {
					const config = { label, type, command, icon: { id: "lightbulb", color: "terminal.ansiRed" } };
					await task.configureTask(config);
					await task.assertTasks(label, [{ label, type, command, icon: { id: "lightbulb", color: "Red" } }], 'run');
				});
			});
		});
		//TODO: why won't this command run
		describe.skip('Tasks: Configure Task', () => {
			const label = "name";
			const type = "shell";
			const command = "echo 'test'";
			describe('hide', () => {
				it('true should still show the task', async () => {
					await task.configureTask({ type, command, label, hide: true });
					await task.assertTasks(label, [{ label }], 'configure');
				});
			});
		});
	});
}
