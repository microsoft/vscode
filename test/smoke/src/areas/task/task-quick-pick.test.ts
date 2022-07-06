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

		describe('hide', () => {
			const name = "name";
			it('true', async () => {
				await task.configureTask({ name, hide: true });
				await task.runTask(name, []);
			});
			it('false', async () => {
				await task.configureTask({ name, hide: false });
				await task.runTask(name, [{ name }]);
			});
			it('undefined', async () => {
				await task.configureTask({ name });
				await task.runTask(name, [{ name }]);
			});
		});

		describe('icon', () => {
			const name = "name";
			it('icon', async () => {
				const config = { name, icon: { id: "lightbulb" } };
				await task.configureTask(config);
				await task.runTask(name, [config]);
			});
			it('color', async () => {
				const config = { name, icon: { color: "terminal.ansiRed" } };
				await task.configureTask(config);
				await task.runTask(name, [config]);
			});
			it('icon & color', async () => {
				const config = { name, icon: { id: "lightbulb", color: "terminal.ansiRed" } };
				await task.configureTask(config);
				await task.runTask(name, [config]);
			});
		});
	});
}
