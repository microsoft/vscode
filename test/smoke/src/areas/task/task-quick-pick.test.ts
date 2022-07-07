/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Application, Task } from '../../../../automation/';

export function setup() {
	describe('Task Quick Pick', () => {
		// Acquire automation API

		let app: Application;
		let task: Task;
		before(async function () {
			// Fetch task automation API
			app = this.app as Application;
			task = app.workbench.task;
		});
		describe('run', () => {
			const name = "name";
			const type = "shell";
			const command = "echo 'test'";
			describe('hide', () => {
				it('true', async () => {
					await task.configureTask({ type, command, label: name, hide: true });
					await task.runTask(name, []);
				});
				// it('false', async () => {
				// 	await task.configureTask({ type, command, label: name, hide: false });
				// 	await task.runTask(name, [{ label: name }]);
				// });
				// it('undefined', async () => {
				// 	await task.configureTask({ type, command, label: name });
				// 	await task.runTask(name, [{ label: name }]);
				// });
			});

			describe('icon', () => {
				// it('icon', async () => {
				// 	const config = { label: name, type, command, icon: { id: "lightbulb" } };
				// 	await task.configureTask(config);
				// 	await task.runTask(name, [config]);
				// });
				// it('color', async () => {
				// 	const config = { label: name, type, command, icon: { color: "terminal.ansiRed" } };
				// 	await task.configureTask(config);
				// 	await task.runTask(name, [config]);
				// });
				// it('icon & color', async () => {
				// 	const config = { label: name, type, command, icon: { id: "lightbulb", color: "terminal.ansiRed" } };
				// 	await task.configureTask(config);
				// 	await task.runTask(name, [config]);
				// });
			});
		});
	});
}
