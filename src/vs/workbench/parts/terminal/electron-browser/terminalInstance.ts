/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp = require('child_process');
import termJs = require('term.js');
import lifecycle = require('vs/base/common/lifecycle');
import os = require('os');
import path = require('path');
import URI from 'vs/base/common/uri';
import DOM = require('vs/base/browser/dom');
import platform = require('vs/base/common/platform');
import {Dimension} from 'vs/base/browser/builder';
import {IStringDictionary} from 'vs/base/common/collections';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITerminalService} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {DomScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import {IShell, ITerminalFont} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';

export class TerminalInstance {

	private toDispose: lifecycle.IDisposable[];
	private ptyProcess: cp.ChildProcess;
	private terminal;
	private terminalDomElement: HTMLDivElement;
	private font: ITerminalFont;

	public constructor(
		private shell: IShell,
		private parentDomElement: HTMLElement,
		private contextService: IWorkspaceContextService,
		private terminalService: ITerminalService,
		private onExitCallback: (TerminalInstance) => void
	) {
		this.toDispose = [];
		this.parentDomElement.innerHTML = '';
		this.ptyProcess = this.createTerminalProcess();
		this.terminalDomElement = document.createElement('div');
		this.parentDomElement.classList.add('integrated-terminal');
		let terminalScrollbar = new DomScrollableElement(this.terminalDomElement, {
			canUseTranslate3d: false,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto
		});
		this.toDispose.push(terminalScrollbar);
		this.terminal = termJs({
			cursorBlink: false // term.js' blinking cursor breaks selection
		});

		this.ptyProcess.on('message', (data) => {
			this.terminal.write(data);
		});
		this.terminal.on('data', (data) => {
			this.ptyProcess.send({
				event: 'input',
				data: data
			});
			return false;
		});
		this.ptyProcess.on('exit', (exitCode) => {
			this.dispose();
			// TODO: When multiple terminals are supported this should do something smarter. There is
			// also a weird bug here at least on Ubuntu 15.10 where the new terminal text does not
			// repaint correctly.
			if (exitCode !== 0) {
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
		this.parentDomElement.appendChild(terminalScrollbar.getDomNode());
	}

	public layout(dimension: Dimension): void {
		if (!this.font || !this.font.charWidth || !this.font.charHeight) {
			return;
		}
		let cols = Math.floor(this.parentDomElement.offsetWidth / this.font.charWidth);
		let rows = Math.floor(this.parentDomElement.offsetHeight / this.font.charHeight);
		if (this.terminal) {
			this.terminal.resize(cols, rows);
		}
		if (this.ptyProcess.connected) {
			this.ptyProcess.send({
				event: 'resize',
				cols: cols,
				rows: rows
			});
		}
	}

	private cloneEnv(): IStringDictionary<string> {
		let newEnv: IStringDictionary<string> = Object.create(null);
		Object.keys(process.env).forEach((key) => {
			newEnv[key] = process.env[key];
		});
		return newEnv;
	}

	private createTerminalProcess(): cp.ChildProcess {
		let env = this.cloneEnv();
		env['PTYSHELL'] = this.shell.executable;
		this.shell.args.forEach((arg, i) => {
			env[`PTYSHELLARG${i}`] = arg;
		});
		env['PTYCWD'] = this.contextService.getWorkspace() ? this.contextService.getWorkspace().resource.fsPath : os.homedir();
		return cp.fork('./terminalProcess', [], {
			env: env,
			cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
		});
	}

	public setTheme(colors: string[]): void {
		if (!this.terminal) {
			return;
		}
		this.terminal.colors = colors;
		this.terminal.refresh(0, this.terminal.rows);
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
			if (this.terminal._textarea) {
				this.terminal._textarea.focus();
			}
		}
	}

	public dispose(): void {
		this.toDispose = lifecycle.dispose(this.toDispose);
		this.terminal.destroy();
		this.ptyProcess.kill();
	}
}