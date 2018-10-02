/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from '../workbench/viewlet';
import { Commands } from '../workbench/workbench';
import { Code, findElement } from '../../vscode/code';
import { Editors } from '../editor/editors';
import { Editor } from '../editor/editor';
import { IElement } from '../../vscode/driver';

const VIEWLET = 'div[id="workbench.view.debug"]';
const DEBUG_VIEW = `${VIEWLET} .debug-view-content`;
const CONFIGURE = `div[id="workbench.parts.sidebar"] .actions-container .configure`;
const STOP = `.debug-toolbar .debug-action.stop`;
const STEP_OVER = `.debug-toolbar .debug-action.step-over`;
const STEP_IN = `.debug-toolbar .debug-action.step-into`;
const STEP_OUT = `.debug-toolbar .debug-action.step-out`;
const CONTINUE = `.debug-toolbar .debug-action.continue`;
const GLYPH_AREA = '.margin-view-overlays>:nth-child';
const BREAKPOINT_GLYPH = '.debug-breakpoint';
const PAUSE = `.debug-toolbar .debug-action.pause`;
const DEBUG_STATUS_BAR = `.statusbar.debugging`;
const NOT_DEBUG_STATUS_BAR = `.statusbar:not(debugging)`;
const TOOLBAR_HIDDEN = `.debug-toolbar[aria-hidden="true"]`;
const STACK_FRAME = `${VIEWLET} .monaco-tree-row .stack-frame`;
const SPECIFIC_STACK_FRAME = filename => `${STACK_FRAME} .file[title*="${filename}"]`;
const VARIABLE = `${VIEWLET} .debug-variables .monaco-tree-row .expression`;
const CONSOLE_OUTPUT = `.repl .output.expression .value`;
const CONSOLE_INPUT_OUTPUT = `.repl .input-output-pair .output.expression .value`;

const REPL_FOCUSED = '.repl-input-wrapper .monaco-editor textarea';

export interface IStackFrame {
	name: string;
	lineNumber: number;
}

function toStackFrame(element: IElement): IStackFrame {
	const name = findElement(element, e => /\bfile-name\b/.test(e.className))!;
	const line = findElement(element, e => /\bline-number\b/.test(e.className))!;
	const lineNumber = line.textContent ? parseInt(line.textContent.split(':').shift() || '0') : 0;

	return {
		name: name.textContent || '',
		lineNumber
	};
}

export class Debug extends Viewlet {

	constructor(code: Code, private commands: Commands, private editors: Editors, private editor: Editor) {
		super(code);
	}

	async openDebugViewlet(): Promise<any> {
		if (process.platform === 'darwin') {
			await this.code.dispatchKeybinding('cmd+shift+d');
		} else {
			await this.code.dispatchKeybinding('ctrl+shift+d');
		}

		await this.code.waitForElement(DEBUG_VIEW);
	}

	async configure(): Promise<any> {
		await this.code.waitAndClick(CONFIGURE);
		await this.editors.waitForEditorFocus('launch.json');
	}

	async setBreakpointOnLine(lineNumber: number): Promise<any> {
		await this.code.waitForElement(`${GLYPH_AREA}(${lineNumber})`);
		await this.code.waitAndClick(`${GLYPH_AREA}(${lineNumber})`, 5, 5);
		await this.code.waitForElement(BREAKPOINT_GLYPH);
	}

	async startDebugging(): Promise<number> {
		await this.code.dispatchKeybinding('f5');
		await this.code.waitForElement(PAUSE);
		await this.code.waitForElement(DEBUG_STATUS_BAR);
		const portPrefix = 'Port: ';

		const output = await this.waitForOutput(output => output.some(line => line.indexOf(portPrefix) >= 0));
		const lastOutput = output.filter(line => line.indexOf(portPrefix) >= 0)[0];

		return lastOutput ? parseInt(lastOutput.substr(portPrefix.length)) : 3000;
	}

	async stepOver(): Promise<any> {
		await this.code.waitAndClick(STEP_OVER);
	}

	async stepIn(): Promise<any> {
		await this.code.waitAndClick(STEP_IN);
	}

	async stepOut(): Promise<any> {
		await this.code.waitAndClick(STEP_OUT);
	}

	async continue(): Promise<any> {
		await this.code.waitAndClick(CONTINUE);
		await this.waitForStackFrameLength(0);
	}

	async stopDebugging(): Promise<any> {
		await this.code.waitAndClick(STOP);
		await this.code.waitForElement(TOOLBAR_HIDDEN);
		await this.code.waitForElement(NOT_DEBUG_STATUS_BAR);
	}

	async waitForStackFrame(func: (stackFrame: IStackFrame) => boolean, message: string): Promise<IStackFrame> {
		const elements = await this.code.waitForElements(STACK_FRAME, true, elements => elements.some(e => func(toStackFrame(e))));
		return elements.map(toStackFrame).filter(s => func(s))[0];
	}

	async waitForStackFrameLength(length: number): Promise<any> {
		await this.code.waitForElements(STACK_FRAME, false, result => result.length === length);
	}

	async focusStackFrame(name: string, message: string): Promise<any> {
		await this.code.waitAndClick(SPECIFIC_STACK_FRAME(name), 0, 0);
		await this.editors.waitForTab(name);
	}

	async waitForReplCommand(text: string, accept: (result: string) => boolean): Promise<void> {
		await this.commands.runCommand('Debug: Focus on Debug Console View');
		await this.code.waitForActiveElement(REPL_FOCUSED);
		await this.code.waitForSetValue(REPL_FOCUSED, text);

		// Wait for the keys to be picked up by the editor model such that repl evalutes what just got typed
		await this.editor.waitForEditorContents('debug:replinput', s => s.indexOf(text) >= 0);
		await this.code.dispatchKeybinding('enter');
		await this.code.waitForElement(CONSOLE_INPUT_OUTPUT);
		await this.waitForOutput(output => accept(output[output.length - 1] || ''));
	}

	async waitForVariableCount(count: number): Promise<void> {
		await this.code.waitForElements(VARIABLE, false, els => els.length === count);
	}

	private async waitForOutput(fn: (output: string[]) => boolean): Promise<string[]> {
		const elements = await this.code.waitForElements(CONSOLE_OUTPUT, false, elements => fn(elements.map(e => e.textContent)));
		return elements.map(e => e.textContent);
	}
}
