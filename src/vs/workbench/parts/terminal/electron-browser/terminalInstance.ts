/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import Event, {Emitter} from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import cp = require('child_process');
import lifecycle = require('vs/base/common/lifecycle');
import nls = require('vs/nls');
import os = require('os');
import path = require('path');
import platform = require('vs/base/common/platform');
import xterm = require('xterm');
import { Dimension } from 'vs/base/browser/builder';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IStringDictionary } from 'vs/base/common/collections';
import { ITerminalInstance } from 'vs/workbench/parts/terminal/electron-browser/terminal';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { Keybinding } from 'vs/base/common/keybinding';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { TabFocus } from 'vs/editor/common/config/commonEditorConfig';
import { TerminalConfigHelper, IShell } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';

export class TerminalInstance implements ITerminalInstance {
	private static ID_COUNTER = 1;
	private static EOL_REGEX = /\r?\n/g;


	private _id: number;
	private _title: string;
	private _onTitleChanged: Emitter<string>;
	public get id(): number { return this._id; }
	public get title(): string { return this._title; }
	public get onTitleChanged(): Event<string> { return this._onTitleChanged.event; }

	private isExiting: boolean = false;
	private isVisible: boolean = false;
	private toDispose: lifecycle.IDisposable[] = [];
	private skipTerminalKeybindings: Keybinding[] = [];
	private process: cp.ChildProcess;
	private xterm: any;
	private wrapperElement: HTMLDivElement;
	private xtermElement: HTMLDivElement;

	public constructor(
		private terminalFocusContextKey: IContextKey<boolean>,
		private onExitCallback: (TerminalInstance) => void,
		private configHelper: TerminalConfigHelper,
		private container: HTMLElement,
		private workspace: IWorkspace,
		name: string,
		shell: IShell,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMessageService private messageService: IMessageService
	) {
		this._id = TerminalInstance.ID_COUNTER++;
		this._onTitleChanged = new Emitter<string>();
		this.createProcess(workspace, name, shell);

		if (container) {
			this.attachToElement(container);
		}
	}

	public addDisposable(disposable: lifecycle.IDisposable): void {
		this.toDispose.push(disposable);
	}

	public attachToElement(container: HTMLElement): void {
		if (this.wrapperElement) {
			throw new Error('The terminal instance has already been attached to a container');
		}

		this.container = container;
		this.wrapperElement = document.createElement('div');
		DOM.addClass(this.wrapperElement, 'terminal-wrapper');
		this.xtermElement = document.createElement('div');

		this.xterm = xterm();
		this.xterm.open(this.xtermElement);

		this.process.on('message', (message) => {
			if (message.type === 'data') {
				this.xterm.write(message.content);
			}
		});
		this.xterm.on('data', (data) => {
			this.process.send({
				event: 'input',
				data: this.sanitizeInput(data)
			});
			return false;
		});
		this.xterm.attachCustomKeydownHandler((event: KeyboardEvent) => {
			// Allow the toggle tab mode keybinding to pass through the terminal so that focus can
			// be escaped
			let standardKeyboardEvent = new StandardKeyboardEvent(event);
			if (this.skipTerminalKeybindings.some((k) => standardKeyboardEvent.equals(k.value))) {
				event.preventDefault();
				return false;
			}

			// If tab focus mode is on, tab is not passed to the terminal
			if (TabFocus.getTabFocusMode() && event.keyCode === 9) {
				return false;
			}
		});

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
			this.terminalFocusContextKey.set(true);
		}));
		this.toDispose.push(DOM.addDisposableListener(this.xterm.textarea, 'blur', (event: KeyboardEvent) => {
			this.terminalFocusContextKey.reset();
		}));
		this.toDispose.push(DOM.addDisposableListener(this.xterm.element, 'focus', (event: KeyboardEvent) => {
			this.terminalFocusContextKey.set(true);
		}));
		this.toDispose.push(DOM.addDisposableListener(this.xterm.element, 'blur', (event: KeyboardEvent) => {
			this.terminalFocusContextKey.reset();
		}));

		this.wrapperElement.appendChild(this.xtermElement);
		this.container.appendChild(this.wrapperElement);

		this.layout(new Dimension(this.container.offsetWidth, this.container.offsetHeight));
		this.setVisible(this.isVisible);
	}

	public copySelection(): void {
		if (document.activeElement.classList.contains('xterm')) {
			document.execCommand('copy');
		} else {
			this.messageService.show(Severity.Warning, nls.localize('terminal.integrated.copySelection.noSelection', 'Cannot copy terminal selection when terminal does not have focus'));
		}
	}

	public dispose(): void {
		if (this.wrapperElement) {
			this.container.removeChild(this.wrapperElement);
			this.wrapperElement = null;
		}
		if (this.xterm) {
			this.xterm.destroy();
			this.xterm = null;
		}
		if (this.process) {
			if (this.process.connected) {
				this.process.disconnect();
				this.process.kill();
			}
			this.process = null;
		}
		this.toDispose = lifecycle.dispose(this.toDispose);
		this.onExitCallback(this);
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

	public paste(): void {
		this.focus();
		document.execCommand('paste');
	}

	public sendText(text: string, addNewLine: boolean): void {
		if (addNewLine && text.substr(text.length - os.EOL.length) !== os.EOL) {
			text += os.EOL;
		}
		this.process.send({
			event: 'input',
			data: text
		});
	}

	public setVisible(visible: boolean): void {
		this.isVisible = visible;
		if (this.wrapperElement) {
			DOM.toggleClass(this.wrapperElement, 'active', visible);
		}
	}

	public scrollDown(): void {
		this.xterm.scrollDisp(1);
	}

	public scrollUp(): void {
		this.xterm.scrollDisp(-1);
	}

	private sanitizeInput(data: any) {
		return typeof data === 'string' ? data.replace(TerminalInstance.EOL_REGEX, os.EOL) : data;
	}

	private createProcess(workspace: IWorkspace, name: string, shell: IShell) {
		let locale = this.configHelper.isSetLocaleVariables() ? platform.locale : undefined;
		if (!shell.executable) {
			shell = this.configHelper.getShell();
		}
		let env = TerminalInstance.createTerminalEnv(process.env, shell, workspace, locale);
		this._title = name ? name : '';
		this.process = cp.fork('./terminalProcess', [], {
			env: env,
			cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
		});
		if (!name) {
			// Only listen for process title changes when a name is not provided
			this.process.on('message', (message) => {
				if (message.type === 'title') {
					this._title = message.content ? message.content : '';
					this._onTitleChanged.fire(this._title);
				}
			});
		}
		this.process.on('exit', (exitCode) => {
			// Prevent dispose functions being triggered multiple times
			if (!this.isExiting) {
				this.isExiting = true;
				this.dispose();
				if (exitCode) {
					this.messageService.show(Severity.Error, nls.localize('terminal.integrated.exitedWithCode', 'The terminal process terminated with exit code: {0}', exitCode));
				}
			}
		});
	}

	public static createTerminalEnv(parentEnv: IStringDictionary<string>, shell: IShell, workspace: IWorkspace, locale?: string): IStringDictionary<string> {
		let env = TerminalInstance.cloneEnv(parentEnv);
		env['PTYPID'] = process.pid.toString();
		env['PTYSHELL'] = shell.executable;
		if (shell.args) {
			shell.args.forEach((arg, i) => {
				env[`PTYSHELLARG${i}`] = arg;
			});
		}
		env['PTYCWD'] = TerminalInstance.sanitizeCwd(workspace ? workspace.resource.fsPath : os.homedir());
		if (locale) {
			env['LANG'] = TerminalInstance.getLangEnvVariable(locale);
		}
		return env;
	}

	private static sanitizeCwd(cwd: string) {
		// Make the drive letter uppercase on Windows (see #9448)
		if (platform.platform === platform.Platform.Windows && cwd && cwd[1] === ':') {
			return cwd[0].toUpperCase() + cwd.substr(1);
		}
		return cwd;
	}

	private static cloneEnv(env: IStringDictionary<string>): IStringDictionary<string> {
		let newEnv: IStringDictionary<string> = Object.create(null);
		Object.keys(env).forEach((key) => {
			newEnv[key] = env[key];
		});
		return newEnv;
	}

	private static getLangEnvVariable(locale: string) {
		const parts = locale.split('-');
		const n = parts.length;
		if (n > 1) {
			parts[n - 1] = parts[n - 1].toUpperCase();
		}
		return parts.join('_') + '.UTF-8';
	}

	public setCursorBlink(blink: boolean): void {
		if (this.xterm && this.xterm.cursorBlink !== blink) {
			this.xterm.cursorBlink = blink;
			this.xterm.refresh(0, this.xterm.rows - 1);
		}
	}

	public setCommandsToSkipShell(commands: string[]): void {
		this.skipTerminalKeybindings = commands.map((c) => {
			return this.keybindingService.lookupKeybindings(c);
		}).reduce((prev, curr) => {
			return prev.concat(curr);
		});
	}

	public layout(dimension: Dimension): void {
		let font = this.configHelper.getFont();
		if (!font || !font.charWidth || !font.charHeight) {
			return;
		}
		if (!dimension.height) { // Minimized
			return;
		}
		let leftPadding = parseInt(getComputedStyle(document.querySelector('.terminal-outer-container')).paddingLeft.split('px')[0], 10);
		let innerWidth = dimension.width - leftPadding;
		let cols = Math.floor(innerWidth / font.charWidth);
		let rows = Math.floor(dimension.height / font.charHeight);
		if (this.xterm) {
			this.xterm.resize(cols, rows);
			this.xterm.element.style.width = innerWidth + 'px';
		}
		if (this.process.connected) {
			this.process.send({
				event: 'resize',
				cols: cols,
				rows: rows
			});
		}
	}
}
