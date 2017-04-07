/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import DOM = require('vs/base/browser/dom');
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import cp = require('child_process');
import lifecycle = require('vs/base/common/lifecycle');
import nls = require('vs/nls');
import os = require('os');
import platform = require('vs/base/common/platform');
import xterm = require('xterm');
import { Dimension } from 'vs/base/browser/builder';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IStringDictionary } from 'vs/base/common/collections';
import { ITerminalInstance, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, TERMINAL_PANEL_ID, IShellLaunchConfig } from 'vs/workbench/parts/terminal/common/terminal';
import { ITerminalProcessFactory } from 'vs/workbench/parts/terminal/electron-browser/terminal';
import { IWorkspace, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { TabFocus } from 'vs/editor/common/config/commonEditorConfig';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { TerminalLinkHandler } from 'vs/workbench/parts/terminal/electron-browser/terminalLinkHandler';
import { TerminalWidgetManager } from 'vs/workbench/parts/terminal/browser/terminalWidgetManager';

/** The amount of time to consider terminal errors to be related to the launch */
const LAUNCHING_DURATION = 500;

class StandardTerminalProcessFactory implements ITerminalProcessFactory {
	public create(env: { [key: string]: string }): cp.ChildProcess {
		return cp.fork('./terminalProcess', [], {
			env,
			cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
		});
	}
}

export class TerminalInstance implements ITerminalInstance {
	private static readonly EOL_REGEX = /\r?\n/g;

	private static _terminalProcessFactory: ITerminalProcessFactory = new StandardTerminalProcessFactory();
	private static _lastKnownDimensions: Dimension = null;
	private static _idCounter = 1;

	private _id: number;
	private _isExiting: boolean;
	private _hadFocusOnExit: boolean;
	private _isLaunching: boolean;
	private _isVisible: boolean;
	private _isDisposed: boolean;
	private _onDisposed: Emitter<ITerminalInstance>;
	private _onDataForApi: Emitter<{ instance: ITerminalInstance, data: string }>;
	private _onProcessIdReady: Emitter<TerminalInstance>;
	private _onTitleChanged: Emitter<string>;
	private _process: cp.ChildProcess;
	private _processId: number;
	private _skipTerminalCommands: string[];
	private _title: string;
	private _instanceDisposables: lifecycle.IDisposable[];
	private _processDisposables: lifecycle.IDisposable[];
	private _wrapperElement: HTMLDivElement;
	private _xterm: any;
	private _xtermElement: HTMLDivElement;
	private _terminalHasTextContextKey: IContextKey<boolean>;
	private _cols: number;
	private _rows: number;

	private _widgetManager: TerminalWidgetManager;
	private _linkHandler: TerminalLinkHandler;

	public get id(): number { return this._id; }
	public get processId(): number { return this._processId; }
	public get onDisposed(): Event<ITerminalInstance> { return this._onDisposed.event; }
	public get onDataForApi(): Event<{ instance: ITerminalInstance, data: string }> { return this._onDataForApi.event; }
	public get onProcessIdReady(): Event<TerminalInstance> { return this._onProcessIdReady.event; }
	public get onTitleChanged(): Event<string> { return this._onTitleChanged.event; }
	public get title(): string { return this._title; }
	public get hadFocusOnExit(): boolean { return this._hadFocusOnExit; }

	public constructor(
		private _terminalFocusContextKey: IContextKey<boolean>,
		private _configHelper: TerminalConfigHelper,
		private _container: HTMLElement,
		private _shellLaunchConfig: IShellLaunchConfig,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IKeybindingService private _keybindingService: IKeybindingService,
		@IMessageService private _messageService: IMessageService,
		@IPanelService private _panelService: IPanelService,
		@IWorkspaceContextService private _contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private _editorService: IWorkbenchEditorService,
		@IInstantiationService private _instantiationService: IInstantiationService
	) {
		this._instanceDisposables = [];
		this._processDisposables = [];
		this._skipTerminalCommands = [];
		this._isExiting = false;
		this._hadFocusOnExit = false;
		this._isLaunching = true;
		this._isVisible = false;
		this._isDisposed = false;
		this._id = TerminalInstance._idCounter++;
		this._terminalHasTextContextKey = KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED.bindTo(this._contextKeyService);

		this._onDisposed = new Emitter<TerminalInstance>();
		this._onDataForApi = new Emitter<{ instance: ITerminalInstance, data: string }>();
		this._onProcessIdReady = new Emitter<TerminalInstance>();
		this._onTitleChanged = new Emitter<string>();

		this._initDimensions();
		this._createProcess(this._contextService.getWorkspace(), this._shellLaunchConfig);
		this._createXterm();

		// Only attach xterm.js to the DOM if the terminal panel has been opened before.
		if (_container) {
			this.attachToElement(_container);
		}
	}

	public addDisposable(disposable: lifecycle.IDisposable): void {
		this._instanceDisposables.push(disposable);
	}

	private _initDimensions(): void {
		// The terminal panel needs to have been created
		if (!this._container) {
			return;
		}

		const computedStyle = window.getComputedStyle(this._container);
		const width = parseInt(computedStyle.getPropertyValue('width').replace('px', ''), 10);
		const height = parseInt(computedStyle.getPropertyValue('height').replace('px', ''), 10);
		this._evaluateColsAndRows(width, height);
	}

	/**
	 * Evaluates and sets the cols and rows of the terminal if possible.
	 * @param width The width of the container.
	 * @param height The height of the container.
	 * @return The terminal's width if it requires a layout.
	 */
	private _evaluateColsAndRows(width: number, height: number): number {
		const dimension = this._getDimension(width, height);
		if (!dimension) {
			return null;
		}
		const font = this._configHelper.getFont();
		this._cols = Math.floor(dimension.width / font.charWidth);
		this._rows = Math.floor(dimension.height / font.charHeight);
		// Caps cols at 159 on Windows due to #19665 (hopefully temporary)
		if (platform.isWindows && this._cols >= 160) {
			this._cols = 159;
		}
		return dimension.width;
	}

	private _getDimension(width: number, height: number): Dimension {
		// The font needs to have been initialized
		const font = this._configHelper.getFont();
		if (!font || !font.charWidth || !font.charHeight) {
			return null;
		}

		// The panel is minimized
		if (!height) {
			return TerminalInstance._lastKnownDimensions;
		} else {
			// Trigger scroll event manually so that the viewport's scroll area is synced. This
			// needs to happen otherwise its scrollTop value is invalid when the panel is toggled as
			// it gets removed and then added back to the DOM (resetting scrollTop to 0).
			// Upstream issue: https://github.com/sourcelair/xterm.js/issues/291
			if (this._xterm) {
				this._xterm.emit('scroll', this._xterm.ydisp);
			}
		}

		const padding = parseInt(getComputedStyle(document.querySelector('.terminal-outer-container')).paddingLeft.split('px')[0], 10);
		// Use left padding as right padding, right padding is not defined in CSS just in case
		// xterm.js causes an unexpected overflow.
		const innerWidth = width - padding * 2;
		TerminalInstance._lastKnownDimensions = new Dimension(innerWidth, height);
		return TerminalInstance._lastKnownDimensions;
	}

	/**
	 * Create xterm.js instance and attach data listeners.
	 */
	protected _createXterm(): void {
		this._xterm = xterm({
			scrollback: this._configHelper.config.scrollback
		});
		if (this._shellLaunchConfig.initialText) {
			this._xterm.writeln(this._shellLaunchConfig.initialText);
		}
		this._process.on('message', (message) => this._sendPtyDataToXterm(message));
		this._xterm.on('data', (data) => {
			if (this._process) {
				this._process.send({
					event: 'input',
					data: this._sanitizeInput(data)
				});
			}
			return false;
		});
		this._linkHandler = this._instantiationService.createInstance(TerminalLinkHandler, this._xterm, platform.platform);
		this._linkHandler.registerLocalLinkHandler();
	}

	public attachToElement(container: HTMLElement): void {
		if (this._wrapperElement) {
			throw new Error('The terminal instance has already been attached to a container');
		}

		this._container = container;
		this._wrapperElement = document.createElement('div');
		DOM.addClass(this._wrapperElement, 'terminal-wrapper');
		this._xtermElement = document.createElement('div');

		this._xterm.open(this._xtermElement);
		this._xterm.attachCustomKeydownHandler((event: KeyboardEvent) => {
			// Disable all input if the terminal is exiting
			if (this._isExiting) {
				return false;
			}

			// Skip processing by xterm.js of keyboard events that resolve to commands described
			// within commandsToSkipShell
			const standardKeyboardEvent = new StandardKeyboardEvent(event);
			const resolveResult = this._keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
			if (resolveResult && this._skipTerminalCommands.some(k => k === resolveResult.commandId)) {
				event.preventDefault();
				return false;
			}

			// If tab focus mode is on, tab is not passed to the terminal
			if (TabFocus.getTabFocusMode() && event.keyCode === 9) {
				return false;
			}
			return undefined;
		});
		this._instanceDisposables.push(DOM.addDisposableListener(this._xterm.element, 'mouseup', (event: KeyboardEvent) => {
			// Wait until mouseup has propogated through the DOM before evaluating the new selection
			// state.
			setTimeout(() => {
				this._refreshSelectionContextKey();
			}, 0);
		}));

		// xterm.js currently drops selection on keyup as we need to handle this case.
		this._instanceDisposables.push(DOM.addDisposableListener(this._xterm.element, 'keyup', (event: KeyboardEvent) => {
			// Wait until keyup has propogated through the DOM before evaluating the new selection
			// state.
			setTimeout(() => {
				this._refreshSelectionContextKey();
			}, 0);
		}));

		const xtermHelper: HTMLElement = this._xterm.element.querySelector('.xterm-helpers');
		const focusTrap: HTMLElement = document.createElement('div');
		focusTrap.setAttribute('tabindex', '0');
		DOM.addClass(focusTrap, 'focus-trap');
		this._instanceDisposables.push(DOM.addDisposableListener(focusTrap, 'focus', (event: FocusEvent) => {
			let currentElement = focusTrap;
			while (!DOM.hasClass(currentElement, 'part')) {
				currentElement = currentElement.parentElement;
			}
			const hidePanelElement = <HTMLElement>currentElement.querySelector('.hide-panel-action');
			hidePanelElement.focus();
		}));
		xtermHelper.insertBefore(focusTrap, this._xterm.textarea);

		this._instanceDisposables.push(DOM.addDisposableListener(this._xterm.textarea, 'focus', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.set(true);
		}));
		this._instanceDisposables.push(DOM.addDisposableListener(this._xterm.textarea, 'blur', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.reset();
			this._refreshSelectionContextKey();
		}));
		this._instanceDisposables.push(DOM.addDisposableListener(this._xterm.element, 'focus', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.set(true);
		}));
		this._instanceDisposables.push(DOM.addDisposableListener(this._xterm.element, 'blur', (event: KeyboardEvent) => {
			this._terminalFocusContextKey.reset();
			this._refreshSelectionContextKey();
		}));

		this._wrapperElement.appendChild(this._xtermElement);
		this._widgetManager = new TerminalWidgetManager(this._configHelper, this._wrapperElement);
		this._linkHandler.setWidgetManager(this._widgetManager);
		this._container.appendChild(this._wrapperElement);

		const computedStyle = window.getComputedStyle(this._container);
		const width = parseInt(computedStyle.getPropertyValue('width').replace('px', ''), 10);
		const height = parseInt(computedStyle.getPropertyValue('height').replace('px', ''), 10);
		this.layout(new Dimension(width, height));
		this.setVisible(this._isVisible);
		this.updateConfig();
	}

	public registerLinkMatcher(regex: RegExp, handler: (url: string) => void, matchIndex?: number, validationCallback?: (uri: string, element: HTMLElement, callback: (isValid: boolean) => void) => void): number {
		return this._linkHandler.registerCustomLinkHandler(regex, handler, matchIndex, validationCallback);
	}

	public deregisterLinkMatcher(linkMatcherId: number): void {
		this._xterm.deregisterLinkMatcher(linkMatcherId);
	}

	public hasSelection(): boolean {
		return !document.getSelection().isCollapsed;
	}

	public copySelection(): void {
		if (document.activeElement.classList.contains('xterm')) {
			document.execCommand('copy');
		} else {
			this._messageService.show(Severity.Warning, nls.localize('terminal.integrated.copySelection.noSelection', 'Cannot copy terminal selection when terminal does not have focus'));
		}
	}

	public clearSelection(): void {
		document.getSelection().empty();
	}

	public dispose(): void {
		if (this._xterm && this._xterm.element) {
			this._hadFocusOnExit = DOM.hasClass(this._xterm.element, 'focus');
		}
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
		if (!this._isDisposed) {
			this._isDisposed = true;
			this._onDisposed.fire(this);
		}
		this._processDisposables = lifecycle.dispose(this._processDisposables);
		this._instanceDisposables = lifecycle.dispose(this._instanceDisposables);
	}

	public focus(force?: boolean): void {
		if (!this._xterm) {
			return;
		}
		const text = window.getSelection().toString();
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
		if (visible && this._xterm) {
			// Trigger a manual scroll event which will sync the viewport and scroll bar. This is
			// necessary if the number of rows in the terminal has decreased while it was in the
			// background since scrollTop changes take no effect but the terminal's position does
			// change since the number of visible rows decreases.
			this._xterm.emit('scroll', this._xterm.ydisp);
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

	private _refreshSelectionContextKey() {
		const activePanel = this._panelService.getActivePanel();
		const isFocused = activePanel && activePanel.getId() === TERMINAL_PANEL_ID;
		this._terminalHasTextContextKey.set(isFocused && !window.getSelection().isCollapsed);
	}

	private _sanitizeInput(data: any) {
		return typeof data === 'string' ? data.replace(TerminalInstance.EOL_REGEX, os.EOL) : data;
	}

	protected _getCwd(shell: IShellLaunchConfig, workspace: IWorkspace): string {
		if (shell.cwd) {
			return shell.cwd;
		}

		let cwd: string;

		// TODO: Handle non-existent customCwd
		if (!shell.ignoreConfigurationCwd) {
			// Evaluate custom cwd first
			const customCwd = this._configHelper.config.cwd;
			if (customCwd) {
				if (path.isAbsolute(customCwd)) {
					cwd = customCwd;
				} else if (workspace) {
					cwd = path.normalize(path.join(workspace.resource.fsPath, customCwd));
				}
			}
		}

		// If there was no custom cwd or it was relative with no workspace
		if (!cwd) {
			cwd = workspace ? workspace.resource.fsPath : os.homedir();
		}

		return TerminalInstance._sanitizeCwd(cwd);
	}

	protected _createProcess(workspace: IWorkspace, shell: IShellLaunchConfig): void {
		const locale = this._configHelper.config.setLocaleVariables ? platform.locale : undefined;
		if (!shell.executable) {
			this._configHelper.mergeDefaultShellPathAndArgs(shell);
		}
		const env = TerminalInstance.createTerminalEnv(process.env, shell, this._getCwd(shell, workspace), locale, this._cols, this._rows);
		this._title = shell.name || '';
		this._process = cp.fork('./terminalProcess', [], {
			env: env,
			cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
		});
		if (!shell.name) {
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
		this._process.on('exit', exitCode => this._onPtyProcessExit(exitCode));
		setTimeout(() => {
			this._isLaunching = false;
		}, LAUNCHING_DURATION);
	}

	private _sendPtyDataToXterm(message: { type: string, content: string }): void {
		if (message.type === 'data') {
			if (this._widgetManager) {
				this._widgetManager.closeMessage();
			}
			if (this._linkHandler) {
				this._linkHandler.disposeTooltipListeners();
			}
			if (this._xterm) {
				this._xterm.write(message.content);
			}
		}
	}

	private _onPtyProcessExit(exitCode: number): void {
		// Prevent dispose functions being triggered multiple times
		if (this._isExiting) {
			return;
		}

		this._isExiting = true;
		let exitCodeMessage: string;
		if (exitCode) {
			exitCodeMessage = nls.localize('terminal.integrated.exitedWithCode', 'The terminal process terminated with exit code: {0}', exitCode);
		}

		// Only trigger wait on exit when the exit was triggered by the process, not through the
		// `workbench.action.terminal.kill` command
		const triggeredByProcess = exitCode !== null;

		if (triggeredByProcess && this._shellLaunchConfig.waitOnExit) {
			if (exitCode) {
				this._xterm.writeln(exitCodeMessage);
			}
			this._xterm.writeln(nls.localize('terminal.integrated.waitOnExit', 'Press any key to close the terminal'));
			// Disable all input if the terminal is exiting and listen for next keypress
			this._xterm.setOption('disableStdin', true);
			if (this._xterm.textarea) {
				this._processDisposables.push(DOM.addDisposableListener(this._xterm.textarea, 'keypress', (event: KeyboardEvent) => {
					this.dispose();
					event.preventDefault();
				}));
			}
		} else {
			this.dispose();
			if (exitCode) {
				if (this._isLaunching) {
					let args = '';
					if (typeof this._shellLaunchConfig.args === 'string') {
						args = this._shellLaunchConfig.args;
					} else if (this._shellLaunchConfig.args && this._shellLaunchConfig.args.length) {
						args = ' ' + this._shellLaunchConfig.args.map(a => {
							if (a.indexOf(' ') !== -1) {
								return `'${a}'`;
							}
							return a;
						}).join(' ');
					}
					this._messageService.show(Severity.Error, nls.localize('terminal.integrated.launchFailed', 'The terminal process command `{0}{1}` failed to launch (exit code: {2})', this._shellLaunchConfig.executable, args, exitCode));
				} else {
					this._messageService.show(Severity.Error, exitCodeMessage);
				}
			}
		}
	}

	public reuseTerminal(shell?: IShellLaunchConfig): void {
		// Kill and clean up old process
		if (this._process) {
			this._process.removeAllListeners('exit');
			if (this._process.connected) {
				this._process.kill();
			}
			this._process = null;
		}
		lifecycle.dispose(this._processDisposables);
		this._processDisposables = [];

		// Ensure new processes' output starts at start of new line
		this._xterm.write('\n\x1b[G');

		// Print initialText if specified
		if (shell.initialText) {
			this._xterm.writeln(shell.initialText);
		}

		// Initialize new process
		const oldTitle = this._title;
		this._createProcess(this._contextService.getWorkspace(), shell);
		if (oldTitle !== this._title) {
			this._onTitleChanged.fire(this._title);
		}
		this._process.on('message', (message) => this._sendPtyDataToXterm(message));

		// Clean up waitOnExit state
		if (this._isExiting && this._shellLaunchConfig.waitOnExit) {
			this._xterm.setOption('disableStdin', false);
			this._isExiting = false;
		}

		// Set the new shell launch config
		this._shellLaunchConfig = shell;
	}

	// TODO: This should be private/protected
	// TODO: locale should not be optional
	public static createTerminalEnv(parentEnv: IStringDictionary<string>, shell: IShellLaunchConfig, cwd: string, locale?: string, cols?: number, rows?: number): IStringDictionary<string> {
		const env = shell.env ? shell.env : TerminalInstance._cloneEnv(parentEnv);
		env['PTYPID'] = process.pid.toString();
		env['PTYSHELL'] = shell.executable;
		if (shell.args) {
			if (typeof shell.args === 'string') {
				env[`PTYSHELLCMDLINE`] = shell.args;
			} else {
				shell.args.forEach((arg, i) => env[`PTYSHELLARG${i}`] = arg);
			}
		}
		env['PTYCWD'] = cwd;
		env['LANG'] = TerminalInstance._getLangEnvVariable(locale);
		if (cols && rows) {
			env['PTYCOLS'] = cols.toString();
			env['PTYROWS'] = rows.toString();
		}
		return env;
	}

	public onData(listener: (data: string) => void): lifecycle.IDisposable {
		let callback = (message) => {
			if (message.type === 'data') {
				listener(message.content);
			}
		};
		this._process.on('message', callback);
		return {
			dispose: () => {
				if (this._process) {
					this._process.removeListener('message', callback);
				}
			}
		};
	}

	public onExit(listener: (exitCode: number) => void): lifecycle.IDisposable {
		this._process.on('exit', listener);
		return {
			dispose: () => {
				if (this._process) {
					this._process.removeListener('exit', listener);
				}
			}
		};
	}

	private static _sanitizeCwd(cwd: string) {
		// Make the drive letter uppercase on Windows (see #9448)
		if (platform.platform === platform.Platform.Windows && cwd && cwd[1] === ':') {
			return cwd[0].toUpperCase() + cwd.substr(1);
		}
		return cwd;
	}

	private static _cloneEnv(env: IStringDictionary<string>): IStringDictionary<string> {
		const newEnv: IStringDictionary<string> = Object.create(null);
		Object.keys(env).forEach((key) => {
			newEnv[key] = env[key];
		});
		return newEnv;
	}

	private static _getLangEnvVariable(locale?: string) {
		const parts = locale ? locale.split('-') : [];
		const n = parts.length;
		if (n === 0) {
			// Fallback to en_US to prevent possible encoding issues.
			return 'en_US.UTF-8';
		}
		if (n === 1) {
			// app.getLocale can return just a language without a variant, fill in the variant for
			// supported languages as many shells expect a 2-part locale.
			const languageVariants = {
				de: 'DE',
				en: 'US',
				es: 'ES',
				fr: 'FR',
				it: 'IT',
				ja: 'JP',
				ko: 'KR',
				ru: 'RU',
				zh: 'CN'
			};
			if (parts[0] in languageVariants) {
				parts.push(languageVariants[parts[0]]);
			}
		} else {
			// Ensure the variant is uppercase
			parts[1] = parts[1].toUpperCase();
		}
		return parts.join('_') + '.UTF-8';
	}

	public updateConfig(): void {
		this._setCursorBlink(this._configHelper.config.cursorBlinking);
		this._setCursorStyle(this._configHelper.config.cursorStyle);
		this._setCommandsToSkipShell(this._configHelper.config.commandsToSkipShell);
		this._setScrollback(this._configHelper.config.scrollback);
	}

	private _setCursorBlink(blink: boolean): void {
		if (this._xterm && this._xterm.getOption('cursorBlink') !== blink) {
			this._xterm.setOption('cursorBlink', blink);
			this._xterm.refresh(0, this._xterm.rows - 1);
		}
	}

	private _setCursorStyle(style: string): void {
		if (this._xterm && this._xterm.getOption('cursorStyle') !== style) {
			// 'line' is used instead of bar in VS Code to be consistent with editor.cursorStyle
			const xtermOption = style === 'line' ? 'bar' : style;
			this._xterm.setOption('cursorStyle', xtermOption);
		}
	}

	private _setCommandsToSkipShell(commands: string[]): void {
		this._skipTerminalCommands = commands;
	}

	private _setScrollback(lineCount: number): void {
		if (this._xterm && this._xterm.getOption('scrollback') !== lineCount) {
			this._xterm.setOption('scrollback', lineCount);
		}
	}

	public layout(dimension: Dimension): void {
		const terminalWidth = this._evaluateColsAndRows(dimension.width, dimension.height);
		if (!terminalWidth) {
			return;
		}
		if (this._xterm) {
			this._xterm.resize(this._cols, this._rows);
			this._xterm.element.style.width = terminalWidth + 'px';
		}
		if (this._process.connected) {
			this._process.send({
				event: 'resize',
				cols: this._cols,
				rows: this._rows
			});
		}
	}

	public enableApiOnData(): void {
		// Only send data through IPC if the API explicitly requests it.
		this.onData(data => this._onDataForApi.fire({ instance: this, data }));
	}

	public static setTerminalProcessFactory(factory: ITerminalProcessFactory): void {
		this._terminalProcessFactory = factory;
	}
}
