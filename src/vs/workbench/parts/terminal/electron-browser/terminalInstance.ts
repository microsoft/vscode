/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import nls = require('vs/nls');
import os = require('os');
import xterm = require('xterm');
import {Dimension} from 'vs/base/browser/builder';
import {IContextMenuService} from 'vs/platform/contextview/browser/contextView';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IKeybindingService, IKeybindingContextKey} from 'vs/platform/keybinding/common/keybinding';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITerminalFont} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {ITerminalProcess, ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {ScrollDownTerminalAction, ScrollUpTerminalAction} from 'vs/workbench/parts/terminal/electron-browser/terminalActions';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {Keybinding} from 'vs/base/common/keyCodes';
import {StandardKeyboardEvent} from 'vs/base/browser/keyboardEvent';
import {TabFocus} from 'vs/editor/common/config/commonEditorConfig';
import {ToggleTabFocusModeAction} from 'vs/editor/contrib/toggleTabFocusMode/common/toggleTabFocusMode';

export class TerminalInstance {

	private static eolRegex = /\r?\n/g;

	private isExiting: boolean = false;

	private toDispose: lifecycle.IDisposable[];
	private xterm;
	private terminalDomElement: HTMLDivElement;
	private wrapperElement: HTMLDivElement;
	private font: ITerminalFont;
	private skipTerminalKeybindings: Keybinding[];

	public constructor(
		private terminalProcess: ITerminalProcess,
		private parentDomElement: HTMLElement,
		private contextMenuService: IContextMenuService,
		private contextService: IWorkspaceContextService,
		private instantiationService: IInstantiationService,
		private keybindingService: IKeybindingService,
		private terminalService: ITerminalService,
		private messageService: IMessageService,
		private terminalFocusContextKey: IKeybindingContextKey<boolean>,
		private onExitCallback: (TerminalInstance) => void
	) {
		let self = this;
		this.toDispose = [];
		this.skipTerminalKeybindings = [].concat(
			self.keybindingService.lookupKeybindings(ToggleTabFocusModeAction.ID),
			self.keybindingService.lookupKeybindings(ScrollDownTerminalAction.ID),
			self.keybindingService.lookupKeybindings(ScrollUpTerminalAction.ID));
		console.log(this.skipTerminalKeybindings);
		this.wrapperElement = document.createElement('div');
		DOM.addClass(this.wrapperElement, 'terminal-wrapper');
		this.terminalDomElement = document.createElement('div');
		this.xterm = xterm();

		this.terminalProcess.process.on('message', (message) => {
			if (message.type === 'data') {
				this.xterm.write(message.content);
			}
		});
		this.xterm.on('data', (data) => {
			this.terminalProcess.process.send({
				event: 'input',
				data: this.sanitizeInput(data)
			});
			return false;
		});
		this.xterm.attachCustomKeydownHandler(function (event: KeyboardEvent) {
			// Allow the toggle tab mode keybinding to pass through the terminal so that focus can
			// be escaped
			let standardKeyboardEvent = new StandardKeyboardEvent(event);
			if (self.skipTerminalKeybindings.some((k) => standardKeyboardEvent.equals(k.value))) {
				event.preventDefault();
				return false;
			}

			// If tab focus mode is on, tab is not passed to the terminal
			if (TabFocus.getTabFocusMode() && event.keyCode === 9) {
				return false;
			}
		});
		this.terminalProcess.process.on('exit', (exitCode) => {
			// Prevent dispose functions being triggered multiple times
			if (!this.isExiting) {
				this.isExiting = true;
				this.dispose();
				if (exitCode) {
					this.messageService.show(Severity.Error, nls.localize('terminal.integrated.exitedWithCode', 'The terminal process terminated with exit code: {0}', exitCode));
				}
				this.onExitCallback(this);
			}
		});

		this.xterm.open(this.terminalDomElement);


		let xtermHelper: HTMLElement = this.xterm.element.querySelector('.xterm-helpers');
		let focusTrap: HTMLElement = document.createElement('div');
		focusTrap.setAttribute('tabindex', '0');
		DOM.addClass(focusTrap, 'focus-trap');
		focusTrap.addEventListener('focus', function (event: FocusEvent) {
			let currentElement = focusTrap;
			while (!DOM.hasClass(currentElement, 'part')) {
				currentElement = currentElement.parentElement;
			}
			let hidePanelElement = <HTMLElement>currentElement.querySelector('.hide-panel-action');
			hidePanelElement.focus();
		});
		xtermHelper.insertBefore(focusTrap, this.xterm.textarea);

		this.toDispose.push(DOM.addDisposableListener(this.xterm.textarea, 'focus', (event: KeyboardEvent) => {
			self.terminalFocusContextKey.set(true);
		}));
		this.toDispose.push(DOM.addDisposableListener(this.xterm.textarea, 'blur', (event: KeyboardEvent) => {
			self.terminalFocusContextKey.reset();
		}));
		this.toDispose.push(DOM.addDisposableListener(this.xterm.element, 'focus', (event: KeyboardEvent) => {
			self.terminalFocusContextKey.set(true);
		}));
		this.toDispose.push(DOM.addDisposableListener(this.xterm.element, 'blur', (event: KeyboardEvent) => {
			self.terminalFocusContextKey.reset();
		}));

		this.wrapperElement.appendChild(this.terminalDomElement);
		this.parentDomElement.appendChild(this.wrapperElement);
	}

	private sanitizeInput(data: any) {
		return typeof data === 'string' ? data.replace(TerminalInstance.eolRegex, os.EOL) : data;
	}

	public layout(dimension: Dimension): void {
		if (!this.font || !this.font.charWidth || !this.font.charHeight) {
			return;
		}
		if (!dimension.height) { // Minimized
			return;
		}
		let cols = Math.floor(dimension.width / this.font.charWidth);
		let rows = Math.floor(dimension.height / this.font.charHeight);
		if (this.xterm) {
			this.xterm.resize(cols, rows);
		}
		if (this.terminalProcess.process.connected) {
			this.terminalProcess.process.send({
				event: 'resize',
				cols: cols,
				rows: rows
			});
		}
	}

	public toggleVisibility(visible: boolean) {
		DOM.toggleClass(this.wrapperElement, 'active', visible);
	}

	public setFont(font: ITerminalFont): void {
		this.font = font;
	}

	public setCursorBlink(blink: boolean): void {
		if (this.xterm && this.xterm.cursorBlink !== blink) {
			this.xterm.cursorBlink = blink;
			this.xterm.refresh(0, this.xterm.rows - 1);
		}
	}

	public focus(force?: boolean): void {
		if (!this.xterm) {
			return;
		}
		let text = window.getSelection().toString();
		if (!text || force) {
			this.xterm.focus();
		}
	}

	public scrollDown(): void {
		this.xterm.scrollDisp(1);
	}

	public scrollUp(): void {
		this.xterm.scrollDisp(-1);
	}

	public dispose(): void {
		if (this.wrapperElement) {
			this.parentDomElement.removeChild(this.wrapperElement);
			this.wrapperElement = null;
		}
		if (this.xterm) {
			this.xterm.destroy();
			this.xterm = null;
		}
		if (this.terminalProcess) {
			this.terminalService.killTerminalProcess(this.terminalProcess);
			this.terminalProcess = null;
		}
		this.toDispose = lifecycle.dispose(this.toDispose);
	}
}