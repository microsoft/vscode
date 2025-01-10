/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { References } from './peek';
import { Commands } from './workbench';
import { Code } from './code';
import { Quality } from './application';

const RENAME_BOX = '.monaco-editor .monaco-editor.rename-box';
const RENAME_INPUT = `${RENAME_BOX} .rename-input`;
const EDITOR = (filename: string) => `.monaco-editor[data-uri$="${filename}"]`;
const VIEW_LINES = (filename: string) => `${EDITOR(filename)} .view-lines`;
const LINE_NUMBERS = (filename: string) => `${EDITOR(filename)} .margin .margin-view-overlays .line-numbers`;

export class Editor {

	private static readonly FOLDING_EXPANDED = '.monaco-editor .margin .margin-view-overlays>:nth-child(${INDEX}) .folding';
	private static readonly FOLDING_COLLAPSED = `${Editor.FOLDING_EXPANDED}.collapsed`;

	constructor(private code: Code, private commands: Commands) { }

	async findReferences(filename: string, term: string, line: number): Promise<References> {
		await this.clickOnTerm(filename, term, line);
		await this.commands.runCommand('Peek References');
		const references = new References(this.code);
		await references.waitUntilOpen();
		return references;
	}

	async rename(filename: string, line: number, from: string, to: string): Promise<void> {
		await this.clickOnTerm(filename, from, line);
		await this.commands.runCommand('Rename Symbol');

		await this.code.waitForActiveElement(RENAME_INPUT);
		await this.code.waitForSetValue(RENAME_INPUT, to);

		await this.code.dispatchKeybinding('enter');
	}

	async gotoDefinition(filename: string, term: string, line: number): Promise<void> {
		await this.clickOnTerm(filename, term, line);
		await this.commands.runCommand('Go to Implementations');
	}

	async peekDefinition(filename: string, term: string, line: number): Promise<References> {
		await this.clickOnTerm(filename, term, line);
		await this.commands.runCommand('Peek Definition');
		const peek = new References(this.code);
		await peek.waitUntilOpen();
		return peek;
	}

	private async getSelector(filename: string, term: string, line: number): Promise<string> {
		const lineIndex = await this.getViewLineIndex(filename, line);
		const classNames = await this.getClassSelectors(filename, term, lineIndex);

		return `${VIEW_LINES(filename)}>:nth-child(${lineIndex}) span span.${classNames[0]}`;
	}

	async foldAtLine(filename: string, line: number): Promise<any> {
		const lineIndex = await this.getViewLineIndex(filename, line);
		await this.code.waitAndClick(Editor.FOLDING_EXPANDED.replace('${INDEX}', '' + lineIndex));
		await this.code.waitForElement(Editor.FOLDING_COLLAPSED.replace('${INDEX}', '' + lineIndex));
	}

	async unfoldAtLine(filename: string, line: number): Promise<any> {
		const lineIndex = await this.getViewLineIndex(filename, line);
		await this.code.waitAndClick(Editor.FOLDING_COLLAPSED.replace('${INDEX}', '' + lineIndex));
		await this.code.waitForElement(Editor.FOLDING_EXPANDED.replace('${INDEX}', '' + lineIndex));
	}

	private async clickOnTerm(filename: string, term: string, line: number): Promise<void> {
		const selector = await this.getSelector(filename, term, line);
		await this.code.waitAndClick(selector);
	}

	async waitForEditorFocus(filename: string, lineNumber: number, selectorPrefix = ''): Promise<void> {
		const editor = [selectorPrefix || '', EDITOR(filename)].join(' ');
		const line = `${editor} .view-lines > .view-line:nth-child(${lineNumber})`;
		const editContext = `${editor} ${this._editContextSelector()}`;

		await this.code.waitAndClick(line, 1, 1);
		await this.code.waitForActiveElement(editContext);
	}

	async waitForTypeInEditor(filename: string, text: string, selectorPrefix = ''): Promise<any> {
		if (text.includes('\n')) {
			throw new Error('waitForTypeInEditor does not support new lines, use either a long single line or dispatchKeybinding(\'Enter\')');
		}
		const editor = [selectorPrefix || '', EDITOR(filename)].join(' ');

		await this.code.waitForElement(editor);

		const editContext = `${editor} ${this._editContextSelector()}`;
		await this.code.waitForActiveElement(editContext);

		await this.code.waitForTypeInEditor(editContext, text);

		await this.waitForEditorContents(filename, c => c.indexOf(text) > -1, selectorPrefix);
	}

	async waitForEditorSelection(filename: string, accept: (selection: { selectionStart: number; selectionEnd: number }) => boolean): Promise<void> {
		const selector = `${EDITOR(filename)} ${this._editContextSelector()}`;
		await this.code.waitForEditorSelection(selector, accept);
	}

	private _editContextSelector() {
		return this.code.quality === Quality.Stable ? 'textarea' : '.native-edit-context';
	}

	async waitForEditorContents(filename: string, accept: (contents: string) => boolean, selectorPrefix = ''): Promise<any> {
		const selector = [selectorPrefix || '', `${EDITOR(filename)} .view-lines`].join(' ');
		return this.code.waitForTextContent(selector, undefined, c => accept(c.replace(/\u00a0/g, ' ')));
	}

	private async getClassSelectors(filename: string, term: string, viewline: number): Promise<string[]> {
		const elements = await this.code.waitForElements(`${VIEW_LINES(filename)}>:nth-child(${viewline}) span span`, false, els => els.some(el => el.textContent === term));
		const { className } = elements.filter(r => r.textContent === term)[0];
		return className.split(/\s/g);
	}

	private async getViewLineIndex(filename: string, line: number): Promise<number> {
		const elements = await this.code.waitForElements(LINE_NUMBERS(filename), false, els => {
			return els.some(el => el.textContent === `${line}`);
		});

		for (let index = 0; index < elements.length; index++) {
			if (elements[index].textContent === `${line}`) {
				return index + 1;
			}
		}

		throw new Error('Line not found');
	}
}
