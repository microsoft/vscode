/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Viewlet } from '../workbench/viewlet';
import { Commands } from '../workbench/workbench';
import { API } from '../../api';
import { Editors } from '../editor/editors';
import { Editor } from '../editor/editor';
import { findElement, Element } from '../../driver';

const VIEWLET = 'div[id="workbench.view.debug"]';
const DEBUG_VIEW = `${VIEWLET} .debug-view-content`;
const CONFIGURE = `div[id="workbench.parts.sidebar"] .actions-container .configure`;
const START = `.icon[title="Start Debugging"]`;
const STOP = `.debug-actions-widget .debug-action.stop`;
const STEP_OVER = `.debug-actions-widget .debug-action.step-over`;
const STEP_IN = `.debug-actions-widget .debug-action.step-into`;
const STEP_OUT = `.debug-actions-widget .debug-action.step-out`;
const CONTINUE = `.debug-actions-widget .debug-action.continue`;
const GLYPH_AREA = '.margin-view-overlays>:nth-child';
const BREAKPOINT_GLYPH = '.debug-breakpoint';
const PAUSE = `.debug-actions-widget .debug-action.pause`;
const DEBUG_STATUS_BAR = `.statusbar.debugging`;
const NOT_DEBUG_STATUS_BAR = `.statusbar:not(debugging)`;
const TOOLBAR_HIDDEN = `.debug-actions-widget.monaco-builder-hidden`;
const STACK_FRAME = `${VIEWLET} .monaco-tree-row .stack-frame`;
const SPECIFIC_STACK_FRAME = filename => `${STACK_FRAME} .file[title$="${filename}"]`;
const VARIABLE = `${VIEWLET} .debug-variables .monaco-tree-row .expression`;
const CONSOLE_OUTPUT = `.repl .output.expression .value`;
const CONSOLE_INPUT_OUTPUT = `.repl .input-output-pair .output.expression .value`;

const REPL_FOCUSED = '.repl-input-wrapper .monaco-editor textarea';

export interface IStackFrame {
	name: string;
	lineNumber: number;
}

function toStackFrame(element: Element): IStackFrame {
	const name = findElement(element, e => /\bfile-name\b/.test(e.className))!;
	const line = findElement(element, e => /\bline-number\b/.test(e.className))!;
	const lineNumber = line.textContent ? parseInt(line.textContent.split(':').shift() || '0') : 0;

	return {
		name: name.textContent || '',
		lineNumber
	};
}

export class Debug extends Viewlet {

	constructor(api: API, private commands: Commands, private editors: Editors, private editor: Editor) {
		super(api);
	}

	async openDebugViewlet(): Promise<any> {
		await this.commands.runCommand('workbench.view.debug');
		await this.api.waitForElement(DEBUG_VIEW);
	}

	async configure(): Promise<any> {
		await this.api.waitAndClick(CONFIGURE);
		await this.editors.waitForEditorFocus('launch.json');
	}

	async setBreakpointOnLine(lineNumber: number): Promise<any> {
		await this.api.waitForElement(`${GLYPH_AREA}(${lineNumber})`);
		await this.api.waitAndClick(`${GLYPH_AREA}(${lineNumber})`, 5, 5);
		await this.api.waitForElement(BREAKPOINT_GLYPH);
	}

	async startDebugging(): Promise<number> {
		await this.api.waitAndClick(START);
		await this.api.waitForElement(PAUSE);
		await this.api.waitForElement(DEBUG_STATUS_BAR);
		const portPrefix = 'Port: ';

		const output = await this.waitForOutput(output => output.some(line => line.indexOf(portPrefix) >= 0));
		const lastOutput = output.filter(line => line.indexOf(portPrefix) >= 0)[0];

		return lastOutput ? parseInt(lastOutput.substr(portPrefix.length)) : 3000;
	}

	async stepOver(): Promise<any> {
		await this.api.waitAndClick(STEP_OVER);
	}

	async stepIn(): Promise<any> {
		await this.api.waitAndClick(STEP_IN);
	}

	async stepOut(): Promise<any> {
		await this.api.waitAndClick(STEP_OUT);
	}

	async continue(): Promise<any> {
		await this.api.waitAndClick(CONTINUE);
		await this.waitForStackFrameLength(0);
	}

	async stopDebugging(): Promise<any> {
		await this.api.waitAndClick(STOP);
		await this.api.waitForElement(TOOLBAR_HIDDEN);
		await this.api.waitForElement(NOT_DEBUG_STATUS_BAR);
	}

	async waitForStackFrame(func: (stackFrame: IStackFrame) => boolean, message: string): Promise<IStackFrame> {
		const elements = await this.api.waitForElements(STACK_FRAME, true, elements => elements.some(e => func(toStackFrame(e))));
		return elements.map(toStackFrame).filter(s => func(s))[0];
	}

	async waitForStackFrameLength(length: number): Promise<any> {
		await this.api.waitForElements(STACK_FRAME, false, result => result.length === length);
	}

	async focusStackFrame(name: string, message: string): Promise<any> {
		await this.api.waitAndClick(SPECIFIC_STACK_FRAME(name));
		await this.editors.waitForTab(name);
	}

	async waitForReplCommand(text: string, accept: (result: string) => boolean): Promise<void> {
		await this.commands.runCommand('Debug: Focus Debug Console');
		await this.api.waitForActiveElement(REPL_FOCUSED);
		await this.api.setValue(REPL_FOCUSED, text);

		// Wait for the keys to be picked up by the editor model such that repl evalutes what just got typed
		await this.editor.waitForEditorContents('debug:input', s => s.indexOf(text) >= 0);
		await this.api.dispatchKeybinding('enter');
		await this.api.waitForElement(CONSOLE_INPUT_OUTPUT);
		await this.waitForOutput(output => accept(output[output.length - 1] || ''));
	}

	async getLocalVariableCount(): Promise<number> {
		return await this.api.getElementCount(VARIABLE);
	}

	private async waitForOutput(fn: (output: string[]) => boolean): Promise<string[]> {
		const elements = await this.api.waitForElements(CONSOLE_OUTPUT, false, elements => fn(elements.map(e => e.textContent)));
		return elements.map(e => e.textContent);
	}
}
