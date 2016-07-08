/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import nls = require('vs/nls');
import os = require('os');
import platform = require('vs/base/common/platform');
import xterm = require('xterm');
import {Dimension} from 'vs/base/browser/builder';
import {IMessageService, Severity} from 'vs/platform/message/common/message';
import {ITerminalFont} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {ITerminalProcess, ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

export class TerminalInstance {

	private static eolRegex = /\r?\n/g;

	private isExiting: boolean = false;

	private toDispose: lifecycle.IDisposable[];
	private xterm;
	private terminalDomElement: HTMLDivElement;
	private wrapperElement: HTMLDivElement;
	private font: ITerminalFont;

	public constructor(
		private terminalProcess: ITerminalProcess,
		private parentDomElement: HTMLElement,
		private contextService: IWorkspaceContextService,
		private terminalService: ITerminalService,
		private messageService: IMessageService,
		private onExitCallback: (TerminalInstance) => void
	) {
		this.toDispose = [];
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
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'mousedown', (event) => {
			// Drop selection and focus terminal on Linux to enable middle button paste when click
			// occurs on the selection itself.
			if (event.which === 2 && platform.isLinux) {
				this.focus(true);
			}
		}));
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'mouseup', (event) => {
			if (event.which !== 3) {
				this.focus();
			}
		}));
		this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'keyup', (event: KeyboardEvent) => {
			// Keep terminal open on escape
			if (event.keyCode === 27) {
				event.stopPropagation();
			}
		}));

		this.xterm.open(this.terminalDomElement);
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
		this.terminalDomElement.style.fontFamily = this.font.fontFamily;
		this.terminalDomElement.style.lineHeight = this.font.lineHeight;
		this.terminalDomElement.style.fontSize = this.font.fontSize;
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