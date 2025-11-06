/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { QuickAccess } from './quickaccess';
import { QuickInput } from './quickinput';

const anyRowSelector = `.notebook-editor .monaco-list-row`;
const activeRowSelector = `${anyRowSelector}.focused`;
const activeMarkdownRowSelector = `${activeRowSelector}.markdown-cell-row`;

export class Notebook {

	constructor(
		private readonly quickAccess: QuickAccess,
		private readonly quickInput: QuickInput,
		private readonly code: Code) {
	}

	async openNotebook() {
		await this.code.whenWorkbenchRestored();
		await this.quickAccess.openFileQuickAccessAndWait('notebook.ipynb', 1);
		await this.quickInput.selectQuickInputElement(0);

		await this.code.waitForElement(anyRowSelector);
		await this.focusFirstCell();
		await this.code.waitForElement(activeRowSelector);
	}

	async focusNextCell() {
		await this.code.dispatchKeybinding('down', async () => {
			// TODO: Add an accept callback to verify the keybinding was successful
		});
	}

	async focusFirstCell() {
		await this.quickAccess.runCommand('notebook.focusTop');
	}

	async editCell() {
		await this.code.dispatchKeybinding('enter', async () => {
			// TODO: Add an accept callback to verify the keybinding was successful
		});
	}

	async stopEditingCell() {
		await this.quickAccess.runCommand('notebook.cell.quitEdit');
	}

	async waitForTypeInEditor(text: string): Promise<any> {
		const editor = `${activeRowSelector} .monaco-editor`;

		await this.code.waitForElement(editor);

		const editContext = `${editor} ${!this.code.editContextEnabled ? 'textarea' : '.native-edit-context'}`;
		await this.code.waitForActiveElement(editContext);

		await this.code.waitForTypeInEditor(editContext, text);

		await this._waitForActiveCellEditorContents(c => c.indexOf(text) > -1);
	}

	async waitForActiveCellEditorContents(contents: string): Promise<any> {
		return this._waitForActiveCellEditorContents(str => str === contents);
	}

	private async _waitForActiveCellEditorContents(accept: (contents: string) => boolean): Promise<any> {
		const selector = `${activeRowSelector} .monaco-editor .view-lines`;
		return this.code.waitForTextContent(selector, undefined, c => accept(c.replace(/\u00a0/g, ' ')));
	}

	async waitForMarkdownContents(markdownSelector: string, text: string): Promise<void> {
		const selector = `${activeMarkdownRowSelector} ${markdownSelector}`;
		await this.code.waitForTextContent(selector, text);
	}

	async insertNotebookCell(kind: 'markdown' | 'code'): Promise<void> {
		if (kind === 'markdown') {
			await this.quickAccess.runCommand('notebook.cell.insertMarkdownCellBelow');
		} else {
			await this.quickAccess.runCommand('notebook.cell.insertCodeCellBelow');
		}
	}

	async deleteActiveCell(): Promise<void> {
		await this.quickAccess.runCommand('notebook.cell.delete');
	}

	async focusInCellOutput(): Promise<void> {
		await this.quickAccess.runCommand('notebook.cell.focusInOutput');
		await this.code.waitForActiveElement('iframe.webview.ready');
	}

	async focusOutCellOutput(): Promise<void> {
		await this.quickAccess.runCommand('notebook.cell.focusOutOutput');
	}

	async executeActiveCell(): Promise<void> {
		await this.quickAccess.runCommand('notebook.cell.execute');
	}

	async executeCellAction(selector: string): Promise<void> {
		await this.code.waitAndClick(selector);
	}
}
