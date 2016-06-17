/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import lifecycle = require('vs/base/common/lifecycle');
import platform = require('vs/base/common/platform');
import xterm = require('xterm');
import {Dimension} from 'vs/base/browser/builder';
import {DomScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {IShell, ITerminalFont} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import {ITerminalProcess, ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';

export class TerminalInstance {

	private toDispose: lifecycle.IDisposable[];
	private terminalProcess: ITerminalProcess;
	private terminal;
	private terminalDomElement: HTMLDivElement;
	private wrapperElement: HTMLDivElement;
	private font: ITerminalFont;

	public constructor(
		private shell: IShell,
		private parentDomElement: HTMLElement,
		private contextService: IWorkspaceContextService,
		private terminalService: ITerminalService,
		private onExitCallback: (TerminalInstance) => void
	) {
		this.toDispose = [];
		this.wrapperElement = document.createElement('div');
		DOM.addClass(this.wrapperElement, 'terminal-wrapper');
		this.terminalProcess = this.terminalService.createTerminalProcess();
		this.terminalDomElement = document.createElement('div');
		let terminalScrollbar = new DomScrollableElement(this.terminalDomElement, {
			canUseTranslate3d: false,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto
		});
		this.toDispose.push(terminalScrollbar);
		this.terminal = xterm();

		this.terminalProcess.process.on('message', (message) => {
			if (message.type === 'data') {
				this.terminal.write(message.content);
			} else if (message.type === 'title') {
				// TODO: Should this live in TerminalService?
				this.terminalProcess.title = message.content;
			}
		});
		this.terminal.on('data', (data) => {
			this.terminalProcess.process.send({
				event: 'input',
				data: data
			});
			return false;
		});
		this.terminalProcess.process.on('exit', (exitCode) => {
			this.dispose();
			if (exitCode) {
				console.error('Integrated terminal exited with code ' + exitCode);
			}
			this.onExitCallback(this);
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

		this.terminal.open(this.terminalDomElement);
		this.wrapperElement.appendChild(terminalScrollbar.getDomNode());
		this.parentDomElement.appendChild(this.wrapperElement);
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
		if (this.terminal) {
			this.terminal.resize(cols, rows);
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
		this.terminalDomElement.style.lineHeight = this.font.lineHeight + 'px';
		this.terminalDomElement.style.fontSize = this.font.fontSize + 'px';
	}

	public focus(force?: boolean): void {
		if (!this.terminal) {
			return;
		}
		let text = window.getSelection().toString();
		if (!text || force) {
			this.terminal.focus();
		}
	}

	public dispatchEvent(event: Event) {
		this.terminal.element.dispatchEvent(event);
	}

	public dispose(): void {
		if (this.wrapperElement) {
			this.parentDomElement.removeChild(this.wrapperElement);
			this.wrapperElement = null;
		}
		this.toDispose = lifecycle.dispose(this.toDispose);
		this.terminal.destroy();
		this.terminalService.killTerminalProcess(this.terminalProcess);
	}
}