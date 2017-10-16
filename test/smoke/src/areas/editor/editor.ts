/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SpectronApplication } from '../../spectron/application';
import { QuickOutline } from './quickoutline';
import { References } from './peek';
import { Rename } from './rename';

export class Editor {

	private static VIEW_LINES = '.monaco-editor .view-lines';
	private static LINE_NUMBERS = '.monaco-editor .margin .margin-view-overlays .line-numbers';
	private static FOLDING_EXPANDED = '.monaco-editor .margin .margin-view-overlays>:nth-child(${INDEX}) .folding';
	private static FOLDING_COLLAPSED = `${Editor.FOLDING_EXPANDED}.collapsed`;

	constructor(private spectron: SpectronApplication) {
	}

	public async openOutline(): Promise<QuickOutline> {
		const outline = new QuickOutline(this.spectron);
		await outline.open();
		return outline;
	}

	public async findReferences(term: string, line: number): Promise<References> {
		await this.clickOnTerm(term, line);
		await this.spectron.workbench.quickopen.runCommand('Find All References');
		const references = new References(this.spectron);
		await references.waitUntilOpen();
		return references;
	}

	public async rename(term: string, line: number): Promise<Rename> {
		await this.clickOnTerm(term, line);
		await this.spectron.workbench.quickopen.runCommand('Rename Symbol');
		const rename = new Rename(term, this.spectron);
		await rename.waitUntilOpen();
		return rename;
	}

	public async gotoDefinition(term: string, line: number): Promise<void> {
		await this.clickOnTerm(term, line);
		await this.spectron.workbench.quickopen.runCommand('Go to Definition');
	}

	public async peekDefinition(term: string, line: number): Promise<References> {
		await this.clickOnTerm(term, line);
		await this.spectron.workbench.quickopen.runCommand('Peek Definition');
		const peek = new References(this.spectron);
		await peek.waitUntilOpen();
		return peek;
	}

	public async waitForHighlightingLine(line: number): Promise<void> {
		const currentLineIndex = await this.getViewLineIndex(line);
		if (currentLineIndex) {
			await this.spectron.client.waitForElement(`.monaco-editor .view-overlays>:nth-child(${currentLineIndex}) .current-line`);
			return;
		}
		throw new Error('Cannot find line ' + line);
	}

	public async getSelector(term: string, line: number): Promise<string> {
		const lineIndex = await this.getViewLineIndex(line);
		const classNames = await this.spectron.client.waitFor(() => this.getClassSelectors(term, lineIndex), classNames => classNames && !!classNames.length, 'Getting class names for editor lines');
		return `${Editor.VIEW_LINES}>:nth-child(${lineIndex}) span span.${classNames[0]}`;
	}

	public async foldAtLine(line: number): Promise<any> {
		const lineIndex = await this.getViewLineIndex(line);
		await this.spectron.client.waitAndClick(Editor.FOLDING_EXPANDED.replace('${INDEX}', '' + lineIndex));
		await this.spectron.client.waitForElement(Editor.FOLDING_COLLAPSED.replace('${INDEX}', '' + lineIndex));
	}

	public async unfoldAtLine(line: number): Promise<any> {
		const lineIndex = await this.getViewLineIndex(line);
		await this.spectron.client.waitAndClick(Editor.FOLDING_COLLAPSED.replace('${INDEX}', '' + lineIndex));
		await this.spectron.client.waitForElement(Editor.FOLDING_EXPANDED.replace('${INDEX}', '' + lineIndex));
	}

	public async waitUntilHidden(line: number): Promise<void> {
		await this.spectron.client.waitFor<number>(() => this.getViewLineIndexWithoutWait(line), lineNumber => lineNumber === undefined, 'Waiting until line number is hidden');
	}

	public async waitUntilShown(line: number): Promise<void> {
		await this.getViewLineIndex(line);
	}

	public async clickOnTerm(term: string, line: number): Promise<void> {
		const selector = await this.getSelector(term, line);
		await this.spectron.client.waitAndClick(selector);
	}

	public async waitForTypeInEditor(filename: string, text: string): Promise<any> {
		const editor = `.monaco-editor[data-uri$="${filename}"]`;
		await this.spectron.client.waitAndClick(editor);

		const textarea = `${editor} textarea`;
		await this.spectron.client.waitForActiveElement(textarea);

		await this.spectron.client.type(text);

		await this.waitForEditorContents(filename, c => c.indexOf(text) > -1);
	}

	public async waitForEditorContents(filename: string, accept: (contents: string) => boolean): Promise<any> {
		const selector = `.monaco-editor[data-uri$="${filename}"] .view-lines`;
		return this.spectron.client.waitForTextContent(selector, undefined, c => accept(c.replace(/\u00a0/g, ' ')));
	}

	public async waitForActiveEditor(filename: string): Promise<any> {
		const selector = `.editor-container .monaco-editor[data-uri$="${filename}"] textarea`;
		return this.spectron.client.waitForActiveElement(selector);
	}

	// public async waitForActiveEditorFirstLineText(filename: string): Promise<string> {
	// 	const selector = `.editor-container .monaco-editor[data-uri$="${filename}"] textarea`;
	// 	const result = await this.spectron.client.waitFor(
	// 		() => this.spectron.client.spectron.client.execute(s => {
	// 			if (!document.activeElement.matches(s)) {
	// 				return undefined;
	// 			}

	// 			let element: Element | null = document.activeElement;
	// 			while (element && !/monaco-editor/.test(element.className) && element !== document.body) {
	// 				element = element.parentElement;
	// 			}

	// 			if (element && /monaco-editor/.test(element.className)) {
	// 				const firstLine = element.querySelector('.view-lines span span:nth-child(1)');

	// 				if (firstLine) {
	// 					return (firstLine.textContent || '').replace(/\u00a0/g, ' '); // DAMN
	// 				}
	// 			}

	// 			return undefined;
	// 		}, selector),
	// 		r => typeof r.value === 'string',
	// 		`wait for active editor first line: ${selector}`
	// 	);

	// 	return result.value;
	// }

	private async getClassSelectors(term: string, viewline: number): Promise<string[]> {
		const result: { text: string, className: string }[] = await this.spectron.webclient.selectorExecute(`${Editor.VIEW_LINES}>:nth-child(${viewline}) span span`,
			elements => (Array.isArray(elements) ? elements : [elements])
				.map(element => ({ text: element.textContent, className: element.className })));
		return result.filter(r => r.text === term).map(({ className }) => className);
	}

	private async getViewLineIndex(line: number): Promise<number> {
		return await this.spectron.client.waitFor<number>(() => this.getViewLineIndexWithoutWait(line), void 0, 'Getting line index');
	}

	private async getViewLineIndexWithoutWait(line: number): Promise<number | undefined> {
		const lineNumbers = await this.spectron.webclient.selectorExecute(Editor.LINE_NUMBERS,
			elements => (Array.isArray(elements) ? elements : [elements]).map(element => element.textContent));
		for (let index = 0; index < lineNumbers.length; index++) {
			if (lineNumbers[index] === `${line}`) {
				return index + 1;
			}
		}
		return undefined;
	}
}