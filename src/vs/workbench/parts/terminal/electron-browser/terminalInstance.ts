/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import DOM = require('vs/base/browser/dom');
import Event, { Emitter } from 'vs/base/common/event';
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
import { ITerminalInstance, IShell } from 'vs/workbench/parts/terminal/common/terminal';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { Keybinding } from 'vs/base/common/keybinding';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { TabFocus } from 'vs/editor/common/config/commonEditorConfig';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';

export class TerminalInstance implements ITerminalInstance {
	/** The amount of time to consider terminal errors to be related to the launch */
	private static readonly LAUNCHING_DURATION = 500;
	private static readonly EOL_REGEX = /\r?\n/g;

	private static _idCounter = 1;

	private _id: number;
	private _isExiting: boolean;
	private _isLaunching: boolean;
	private _isVisible: boolean;
	private _onDisposed: Emitter<TerminalInstance>;
	private _onProcessIdReady: Emitter<TerminalInstance>;
	private _onTitleChanged: Emitter<string>;
	private _process: cp.ChildProcess;
	private _processId: number;
	private _skipTerminalKeybindings: Keybinding[];
	private _title: string;
	private _toDispose: lifecycle.IDisposable[];
	private _wrapperElement: HTMLDivElement;
	private _xterm: any;
	private _xtermElement: HTMLDivElement;

	public get id(): number { return this._id; }
	public get processId(): number { return this._processId; }
	public get onClosed(): Event<TerminalInstance> { return this._onDisposed.event; }
	public get onProcessIdReady(): Event<TerminalInstance> { return this._onProcessIdReady.event; }
	public get onTitleChanged(): Event<string> { return this._onTitleChanged.event; }
	public get title(): string { return this._title; }

	public constructor(
		private _terminalFocusContextKey: IContextKey<boolean>,
		private _configHelper: TerminalConfigHelper,
		private _container: HTMLElement,
		workspace: IWorkspace,
		name: string,
		shell: IShell,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IMessageService private _messageService: IMessageService
	) {
		this._toDispose = [];
		this._skipTerminalKeybindings = [];
		this._isExiting = false;
		this._isLaunching = true;
		this._isVisible = false;
		this._id = TerminalInstance._idCounter++;

		this._onDisposed = new Emitter<TerminalInstance>();
		this._onProcessIdReady = new Emitter<TerminalInstance>();
		this._onTitleChanged = new Emitter<string>();

		this._createProcess(workspace, name, shell);

		if (_container) {
			this.attachToElement(_container);
		}
	}

	public addDisposable(disposable: lifecycle.IDisposable): void {
		this._toDispose.push(disposable);
	}

	public attachToElement(container: HTMLElement): void {
		if (this._wrapperElement) {
			throw new Error('The terminal instance has already been attached to a container');
		}

		this._container = container;
		this._wrapperElement = document.createElement('div');
		DOM.addClass(this._wrapperElement, 'terminal-wrapper');
		this._xtermElement = document.createElement('div');

		this._xterm = xterm();
		this._xterm.open(this._xtermElement);

		this._process.on('message', (message) => {
			if (!this._xterm) {
				return;
			}
			if (message.type === 'data') {
				this._xterm.write(message.content);
			}
		});
		this._xterm.on('data', (data) => {
			this._process.send({
				event: 'input',
				data: this.sanitizeInput(data)
			});
			return false;
		});
		this._xterm.attachCustomKeydownHandler((event: KeyboardEvent) => {
			// Allow the toggle tab mode keybinding to pass through the terminal so that focus can
			// be escaped
			let standardKeyboardEvent = new StandardKeyboardEvent(event);
			if (this._skipTerminalKeybindings.some((k) => standardKeyboardEvent.equals(k.value))) {
				event.preventDefault();
				return false;
			}

			// If tab focus mode is on, tab is not passed to the terminal
			if (TabFocus.getTabFocusMode() && event.keyCode === 9) {
				return false;
			}
		});

		let xtermHelper: HTMLElement = this._xterm.element.querySelector('.xterm-helpers');
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
		xtermHelper.insertBefore(focusTrap, this._xterm.textarea);

		this._toDispose.push(DOM.addDisposableListener(this._xterm.textarea, 'focus', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.set(true);
		}));
		this._toDispose.push(DOM.addDisposableListener(this._xterm.textarea, 'blur', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.reset();
		}));
		this._toDispose.push(DOM.addDisposableListener(this._xterm.element, 'focus', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.set(true);
		}));
		this._toDispose.push(DOM.addDisposableListener(this._xterm.element, 'blur', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.reset();
		}));

		this._wrapperElement.appendChild(this._xtermElement);
		this._container.appendChild(this._wrapperElement);

		const computedStyle = window.getComputedStyle(this._container);
		const width = parseInt(computedStyle.getPropertyValue('width').replace('px', ''), 10);
		const height = parseInt(computedStyle.getPropertyValue('height').replace('px', ''), 10);
		this.layout(new Dimension(width, height));
		this.setVisible(this._isVisible);
	}

	public copySelection(): void {
		if (document.activeElement.classList.contains('xterm')) {
			document.execCommand('copy');
		} else {
			this._messageService.show(Severity.Warning, nls.localize('terminal.integrated.copySelection.noSelection', 'Cannot copy terminal selection when terminal does not have focus'));
		}
	}

	public dispose(): void {
		this._isExiting = true;
		if (this._wrapperElement) {
			this._container.removeChild(this._wrapperElement);
			this._wrapperElement = null;
		}
		if (this._xterm) {
			this._xterm.destroy();
			this._xterm = null;
		}
		if (this._process) {
			if (this._process.connected) {
				this._process.kill();
			}
			this._process = null;
		}
		this._onDisposed.fire(this);
		this._toDispose = lifecycle.dispose(this._toDispose);
	}

	public focus(force?: boolean): void {
		if (!this._xterm) {
			return;
		}
		let text = window.getSelection().toString();
		if (!text || force) {
			this._xterm.focus();
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
		this._process.send({
			event: 'input',
			data: text
		});
	}

	public setVisible(visible: boolean): void {
		this._isVisible = visible;
		if (this._wrapperElement) {
			DOM.toggleClass(this._wrapperElement, 'active', visible);
		}
	}

	public scrollDownLine(): void {
		this._xterm.scrollDisp(1);
	}

	public scrollDownPage(): void {
		this._xterm.scrollPages(1);
	}

	public scrollToBottom(): void {
		this._xterm.scrollToBottom();
	}

	public scrollUpLine(): void {
		this._xterm.scrollDisp(-1);
	}

	public scrollUpPage(): void {
		this._xterm.scrollPages(-1);
	}

	public scrollToTop(): void {
		this._xterm.scrollToTop();
	}

	public clear(): void {
		this._xterm.clear();
	}

	private sanitizeInput(data: any) {
		return typeof data === 'string' ? data.replace(TerminalInstance.EOL_REGEX, os.EOL) : data;
	}

	private _createProcess(workspace: IWorkspace, name: string, shell: IShell) {
		let locale = this._configHelper.isSetLocaleVariables() ? platform.locale : undefined;
		if (!shell.executable) {
			shell = this._configHelper.getShell();
		}
		let env = TerminalInstance.createTerminalEnv(process.env, shell, workspace, locale);
		this._title = name ? name : '';
		this._process = cp.fork('./terminalProcess', [], {
			env: env,
			cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
		});
		if (!name) {
			// Only listen for process title changes when a name is not provided
			this._process.on('message', (message) => {
				if (message.type === 'title') {
					this._title = message.content ? message.content : '';
					this._onTitleChanged.fire(this._title);
				}
			});
		}
		this._process.on('message', (message) => {
			if (message.type === 'pid') {
				this._processId = message.content;
				this._onProcessIdReady.fire(this);
			}
		});
		this._process.on('exit', (exitCode) => {
			// Prevent dispose functions being triggered multiple times
			if (!this._isExiting) {
				this.dispose();
				if (exitCode) {
					if (this._isLaunching) {
						const args = shell.args && shell.args.length ? ' ' + shell.args.map(a => a.indexOf(' ') !== -1 ? `'${a}'` : a).join(' ') : '';
						this._messageService.show(Severity.Error, nls.localize('terminal.integrated.launchFailed', 'The terminal process command `{0}{1}` failed to launch (exit code: {2})', shell.executable, args, exitCode));
					} else {
						this._messageService.show(Severity.Error, nls.localize('terminal.integrated.exitedWithCode', 'The terminal process terminated with exit code: {0}', exitCode));
					}
				}
			}
		});
		setTimeout(() => {
			this._isLaunching = false;
		}, TerminalInstance.LAUNCHING_DURATION);
	}

	public static createTerminalEnv(parentEnv: IStringDictionary<string>, shell: IShell, workspace: IWorkspace, locale?: string): IStringDictionary<string> {
		let env = TerminalInstance._cloneEnv(parentEnv);
		env['PTYPID'] = process.pid.toString();
		env['PTYSHELL'] = shell.executable;
		if (shell.args) {
			shell.args.forEach((arg, i) => {
				env[`PTYSHELLARG${i}`] = arg;
			});
		}
		env['PTYCWD'] = TerminalInstance._sanitizeCwd(workspace ? workspace.resource.fsPath : os.homedir());
		if (locale) {
			env['LANG'] = TerminalInstance._getLangEnvVariable(locale);
		}
		return env;
	}

	private static _sanitizeCwd(cwd: string) {
		// Make the drive letter uppercase on Windows (see #9448)
		if (platform.platform === platform.Platform.Windows && cwd && cwd[1] === ':') {
			return cwd[0].toUpperCase() + cwd.substr(1);
		}
		return cwd;
	}

	private static _cloneEnv(env: IStringDictionary<string>): IStringDictionary<string> {
		let newEnv: IStringDictionary<string> = Object.create(null);
		Object.keys(env).forEach((key) => {
			newEnv[key] = env[key];
		});
		return newEnv;
	}

	private static _getLangEnvVariable(locale: string) {
		const parts = locale.split('-');
		const n = parts.length;
		if (n > 1) {
			parts[n - 1] = parts[n - 1].toUpperCase();
		}
		return parts.join('_') + '.UTF-8';
	}

	public setCursorBlink(blink: boolean): void {
		if (this._xterm && this._xterm.getOption('cursorBlink') !== blink) {
			this._xterm.setOption('cursorBlink', blink);
			this._xterm.refresh(0, this._xterm.rows - 1);
		}
	}

	public setCommandsToSkipShell(commands: string[]): void {
		this._skipTerminalKeybindings = commands.map((c) => {
			return this._keybindingService.lookupKeybindings(c);
		}).reduce((prev, curr) => {
			return prev.concat(curr);
		}, []);
	}

	public setScrollback(lineCount: number): void {
		if (this._xterm && this._xterm.getOption('scrollback') !== lineCount) {
			this._xterm.setOption('scrollback', lineCount);
		}
	}

	public layout(dimension: { width: number, height: number }): void {
		let font = this._configHelper.getFont();
		if (!font || !font.charWidth || !font.charHeight) {
			return;
		}
		if (!dimension.height) { // Minimized
			return;
		} else {
			// Trigger scroll event manually so that the viewport's scroll area is synced. This
			// needs to happen otherwise its scrollTop value is invalid when the panel is toggled as
			// it gets removed and then added back to the DOM (resetting scrollTop to 0).
			// Upstream issue: https://github.com/sourcelair/xterm.js/issues/291
			this._xterm.emit('scroll', this._xterm.ydisp);
		}
		let leftPadding = parseInt(getComputedStyle(document.querySelector('.terminal-outer-container')).paddingLeft.split('px')[0], 10);
		let innerWidth = dimension.width - leftPadding;
		let cols = Math.floor(innerWidth / font.charWidth);
		let rows = Math.floor(dimension.height / font.charHeight);
		if (this._xterm) {
			this._xterm.resize(cols, rows);
			this._xterm.element.style.width = innerWidth + 'px';
		}
		if (this._process.connected) {
			this._process.send({
				event: 'resize',
				cols: cols,
				rows: rows
			});
		}
	}
}
