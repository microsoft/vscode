/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Code } from './code';
import { QuickAccess } from './quickaccess';
import { IElement } from './driver';

const notebookEditorSelector = `.notebook-editor`;
const activeRowSelector = `${notebookEditorSelector}:focus-within .monaco-list-row.focused`;

export interface ICellData {
	top: number;
	elementHeight: number;
	editorHeight: number | undefined;
	language: string | undefined;
	posInSet: number;
}

export class Notebook {

	constructor(
		private readonly quickAccess: QuickAccess,
		private readonly code: Code) {
	}

	async getCellDatas(): Promise<ICellData[][]> {
		if (await this.notebookIsEmpty()) {
			return [];
		}

		const [cells, cellEditorsOrMarkdowns, languagePickersOrMarkdowns] = await Promise.all([
			this.code.waitForElements('.notebookOverlay .monaco-list-row', false),
			this.code.waitForElements('.notebookOverlay .monaco-list-row .cell-editor-part:not([aria-hidden=true]) .cell-editor-container > .monaco-editor, .notebookOverlay .monaco-list-row .markdown', false),
			this.code.waitForElements('.notebookOverlay .monaco-list-row .cell-editor-part:not([aria-hidden=true]) .cell-language-picker, .notebookOverlay .monaco-list-row .markdown', false),
		]);

		if (cells.length !== cellEditorsOrMarkdowns.length) {
			throw new Error(`Number of cells does not match number of editors/rendered markdowns. ${cells.length} cells, ${cellEditorsOrMarkdowns.length} editors/markdowns`);
		}

		if (cells.length !== languagePickersOrMarkdowns.length) {
			throw new Error(`Number of cells does not match number of language pickers/rendered markdowns. ${cells.length} cells, ${languagePickersOrMarkdowns.length} language pickers/markdowns`);
		}

		const flatCellDatas = cells.map((element, i) => {
			const editorOrMarkdown = cellEditorsOrMarkdowns[i];
			const languagePickerOrMarkdown = languagePickersOrMarkdowns[i];
			const editorHeight = editorOrMarkdown.className.includes('monaco-editor') ? editorOrMarkdown.height : undefined;
			const language = languagePickerOrMarkdown.className.includes('cell-language-picker') ? languagePickerOrMarkdown.textContent.toLowerCase() : undefined;

			const cellData = <ICellData>{
				top: element.top,
				elementHeight: element.height,
				language,
				posInSet: Number.parseInt(element.attributes['aria-posinset'])
			};
			if (typeof editorHeight === 'number') {
				cellData.editorHeight = editorHeight;
			}

			return cellData;
		});

		let currentGroup: ICellData[] = [];
		const cellDatas: ICellData[][] = [currentGroup];
		flatCellDatas.forEach(cell => {
			if (currentGroup[cell.posInSet]) {
				currentGroup = [];
				cellDatas.push(currentGroup);
			}

			currentGroup[cell.posInSet] = cell;
		});

		cellDatas.forEach(group => {
			group.forEach((cell, i) => {
				const prev = group[i];
				if (prev && cell.top <= prev.top) {
					throw new Error('Cells are in the wrong order');
				}
			});
		});

		return cellDatas;
	}

	async notebookIsEmpty(): Promise<boolean> {
		const empty = this.code.waitForElement(`.notebookOverlay .emptyNotebook`, () => true, 2);
		return !!empty;
	}

	async createNewNotebook() {
		await this.quickAccess.runCommand('vscode-notebook-tests.createNewNotebook');
		await this.code.waitForElement(activeRowSelector);
		await this.focusFirstCell();
		await this.waitForActiveCellEditorContents('code()');
	}

	async openNotebook() {
		await this.quickAccess.runCommand('vscode-notebook-tests.createNewNotebook');
		await this.code.waitForElement(activeRowSelector);
		await this.focusFirstCell();
		await this.waitForActiveCellEditorContents('code()');
	}

	async createRealNotebook() {
		await this.quickAccess.runCommand('notebook-random-tests.createNotebook');
		await this.code.waitForElement(notebookEditorSelector);
		await this.code.dispatchKeybinding('down');
		await this.code.dispatchKeybinding('up');
		await this.code.waitForElement(activeRowSelector);
		await this.waitForActiveCellEditorContents('code()');
	}

	async reopenNotebook() {
		await this.quickAccess.openFile('random_smoketest.random-nb', false);
		await this.code.waitForElement(activeRowSelector);
	}

	async focusNextCell() {
		await this.code.dispatchKeybinding('down');
	}

	async focusPreviousCell() {
		await this.code.dispatchKeybinding('up');
	}

	async focusFirstCell() {
		await this.quickAccess.runCommand('notebook.focusTop');
	}

	async editCell() {
		await this.code.dispatchKeybinding('enter');
	}

	async stopEditingCell() {
		await this.quickAccess.runCommand('notebook.cell.quitEdit');
	}

	async waitForTypeInEditor(text: string): Promise<any> {
		const editor = `${activeRowSelector} .monaco-editor`;

		await this.code.waitForElement(editor);

		const textarea = `${editor} textarea`;
		await this.code.waitForActiveElement(textarea);

		await this.code.waitForTypeInEditor(textarea, text);

		await this._waitForActiveCellEditorContents(c => {
			c = c.replace(/\n/g, '').trim();
			text = text.replace(/\n\n/g, ' ').replace(/\n/g, '').trim();

			// console.log('a', c, c.length);
			// console.log('b', text, text.length);

			// console.log(c.split('').map(char => char.charCodeAt(0)));
			// console.log(text.split('').map(char => char.charCodeAt(0)));

			return c.includes(text);
		});
	}

	async waitForActiveCellEditorContents(contents: string): Promise<any> {
		return this._waitForActiveCellEditorContents(str => str === contents);
	}

	private async _waitForActiveCellEditorContents(accept: (contents: string) => boolean): Promise<any> {
		const selector = `${activeRowSelector} .monaco-editor .view-lines`;
		return this.code.waitForTextContent(selector, undefined, c => accept(c.replace(/\u00a0/g, ' ')));
	}

	async waitForMarkdownContents(markdownSelector: string, text: string): Promise<void> {
		const selector = `${activeRowSelector} .markdown ${markdownSelector}`;
		await this.code.waitForTextContent(selector, text);
	}

	async getRowCount(): Promise<number> {
		return (await this.code.waitForElements(activeRowSelector, false, () => true)).length;
	}

	async getFocusedRow(): Promise<IElement> {
		return await this.code.waitForElement(activeRowSelector, undefined, 10);
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
		await this.code.waitForActiveElement('webview, .webview');
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
