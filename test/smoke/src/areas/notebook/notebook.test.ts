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

		it.skip('check heap leaks', async function () {
			const app = this.app as Application;
			await app.profiler.checkHeapLeaks(['NotebookTextModel', 'NotebookCellTextModel', 'NotebookEventDispatcher'], async () => {
				await app.workbench.notebook.openNotebook();
				await app.workbench.quickaccess.runCommand('workbench.action.files.save');
				await app.workbench.quickaccess.runCommand('workbench.action.closeActiveEditor');
			});
		});

		it('check object leaks', async function () {
			const app = this.app as Application;
			await app.profiler.checkObjectLeaks(['NotebookTextModel', 'NotebookCellTextModel', 'NotebookEventDispatcher'], async () => {
				await app.workbench.notebook.openNotebook();
				await app.workbench.quickaccess.runCommand('workbench.action.files.save');
				await app.workbench.quickaccess.runCommand('workbench.action.closeActiveEditor');
			});
		});

		it.skip('inserts/edits code cell', async function () {
			const app = this.app as Application;
			await app.workbench.notebook.openNotebook();
			await app.workbench.notebook.focusNextCell();
			await app.workbench.notebook.insertNotebookCell('code');
			await app.workbench.notebook.waitForTypeInEditor('// some code');
			await app.workbench.notebook.stopEditingCell();
		});

		it.skip('inserts/edits markdown cell', async function () {
			const app = this.app as Application;
			await app.workbench.notebook.openNotebook();
			await app.workbench.notebook.focusNextCell();
			await app.workbench.notebook.insertNotebookCell('markdown');
			await app.workbench.notebook.waitForTypeInEditor('## hello2! ');
			await app.workbench.notebook.stopEditingCell();
			await app.workbench.notebook.waitForMarkdownContents('h2', 'hello2!');
		});

		it.skip('moves focus as it inserts/deletes a cell', async function () {
			const app = this.app as Application;
			await app.workbench.notebook.openNotebook();
			await app.workbench.notebook.insertNotebookCell('code');
			await app.workbench.notebook.waitForActiveCellEditorContents('');
			await app.workbench.notebook.stopEditingCell();
			await app.workbench.notebook.deleteActiveCell();
			await app.workbench.notebook.waitForMarkdownContents('p', 'Markdown Cell');
		});

		it.skip('moves focus in and out of output', async function () { // TODO@rebornix https://github.com/microsoft/vscode/issues/139270
			const app = this.app as Application;
			await app.workbench.notebook.openNotebook();
			await app.workbench.notebook.executeActiveCell();
			await app.workbench.notebook.focusInCellOutput();
			await app.workbench.notebook.focusOutCellOutput();
			await app.workbench.notebook.waitForActiveCellEditorContents('code()');
		});

		it.skip('cell action execution', async function () { // TODO@rebornix https://github.com/microsoft/vscode/issues/139270
			const app = this.app as Application;
			await app.workbench.notebook.openNotebook();
			await app.workbench.notebook.insertNotebookCell('code');
			await app.workbench.notebook.executeCellAction('.notebook-editor .monaco-list-row.focused div.monaco-toolbar .codicon-debug');
			await app.workbench.notebook.waitForActiveCellEditorContents('test');
		});
	});
}
