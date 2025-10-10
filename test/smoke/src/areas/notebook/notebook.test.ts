/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger) {
	describe('Notebooks', () => { // https://github.com/microsoft/vscode/issues/140575

		// Shared before/after handling
		installAllHandlers(logger);

		afterEach(async function () {
			const app = this.app as Application;
			await app.workbench.quickaccess.runCommand('workbench.action.files.save');
			await app.workbench.quickaccess.runCommand('workbench.action.closeActiveEditor');
		});

		after(async function () {
			const app = this.app as Application;
			cp.execSync('git checkout . --quiet', { cwd: app.workspacePathOrFolder });
			cp.execSync('git reset --hard HEAD --quiet', { cwd: app.workspacePathOrFolder });
		});

		// the heap snapshot fails to parse
		it.skip('check heap leaks', async function () {
			const app = this.app as Application;
			await app.profiler.checkHeapLeaks(['NotebookTextModel', 'NotebookCellTextModel', 'NotebookEventDispatcher'], async () => {
				await app.workbench.notebook.openNotebook();
				await app.workbench.quickaccess.runCommand('workbench.action.files.save');
				await app.workbench.quickaccess.runCommand('workbench.action.closeActiveEditor');
			});
		});

		for (let i = 0; i < 30; i++) {
			it(`check object leaks ${i}`, async function () {
				const app = this.app as Application;
				await app.profiler.checkObjectLeaks(['NotebookTextModel', 'NotebookCellTextModel', 'NotebookEventDispatcher'], async () => {
					await app.workbench.notebook.openNotebook();
					await app.workbench.quickaccess.runCommand('workbench.action.files.save');
					await app.workbench.quickaccess.runCommand('workbench.action.closeActiveEditor');
				});
			});
		}


	});
}
