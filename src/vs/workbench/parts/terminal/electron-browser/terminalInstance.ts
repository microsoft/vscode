/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lifecycle from 'vs/base/common/lifecycle';
import * as nls from 'vs/nls';
import * as platform from 'vs/base/common/platform';
import * as dom from 'vs/base/browser/dom';
import * as paths from 'vs/base/common/paths';
import { Event, Emitter } from 'vs/base/common/event';
import { WindowsShellHelper } from 'vs/workbench/parts/terminal/electron-browser/windowsShellHelper';
import { Terminal as XTermTerminal } from 'vscode-xterm';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { ITerminalInstance, KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED, TERMINAL_PANEL_ID, IShellLaunchConfig, ITerminalProcessManager, ProcessState } from 'vs/workbench/parts/terminal/common/terminal';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { TabFocus } from 'vs/editor/common/config/commonEditorConfig';
import { TerminalConfigHelper } from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';
import { TerminalLinkHandler } from 'vs/workbench/parts/terminal/electron-browser/terminalLinkHandler';
import { TerminalWidgetManager } from 'vs/workbench/parts/terminal/browser/terminalWidgetManager';
import { registerThemingParticipant, ITheme, ICssStyleCollector, IThemeService } from 'vs/platform/theme/common/themeService';
import { scrollbarSliderBackground, scrollbarSliderHoverBackground, scrollbarSliderActiveBackground, activeContrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { TPromise } from 'vs/base/common/winjs.base';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ansiColorIdentifiers, TERMINAL_BACKGROUND_COLOR, TERMINAL_FOREGROUND_COLOR, TERMINAL_CURSOR_FOREGROUND_COLOR, TERMINAL_CURSOR_BACKGROUND_COLOR, TERMINAL_SELECTION_BACKGROUND_COLOR } from 'vs/workbench/parts/terminal/electron-browser/terminalColorRegistry';
import { PANEL_BACKGROUND } from 'vs/workbench/common/theme';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ILogService } from 'vs/platform/log/common/log';
import { TerminalCommandTracker } from 'vs/workbench/parts/terminal/node/terminalCommandTracker';
import { TerminalProcessManager } from './terminalProcessManager';

let Terminal: typeof XTermTerminal;

export class TerminalInstance implements ITerminalInstance {
	private static readonly EOL_REGEX = /\r?\n/g;

	private static _lastKnownDimensions: dom.Dimension = null;
	private static _idCounter = 1;

	private _processManager: ITerminalProcessManager | undefined;

	private _id: number;
	private _isExiting: boolean;
	private _hadFocusOnExit: boolean;
	private _isVisible: boolean;
	private _isDisposed: boolean;
	private readonly _onDisposed: Emitter<ITerminalInstance>;
	private readonly _onFocused: Emitter<ITerminalInstance>;
	private readonly _onProcessIdReady: Emitter<ITerminalInstance>;
	private readonly _onTitleChanged: Emitter<string>;
	private _skipTerminalCommands: string[];
	private _title: string;
	// TODO: Rename to "_disposables"
	private _instanceDisposables: lifecycle.IDisposable[];
	private _wrapperElement: HTMLDivElement;
	private _xterm: XTermTerminal;
	private _xtermElement: HTMLDivElement;
	private _terminalHasTextContextKey: IContextKey<boolean>;
	private _cols: number;
	private _rows: number;
	private _messageTitleListener: (message: { type: string, content: string }) => void;
	private _windowsShellHelper: WindowsShellHelper;
	private _onLineDataListeners: ((lineData: string) => void)[];
	private _xtermReadyPromise: TPromise<void>;

	private _widgetManager: TerminalWidgetManager;
	private _linkHandler: TerminalLinkHandler;
	private _commandTracker: TerminalCommandTracker;

	public disableLayout: boolean;
	public get id(): number { return this._id; }
	// TODO: Ideally processId would be merged into processReady
	public get processId(): number { return this._processManager.shellProcessId; }
	// TODO: Should this be an event as it can fire twice?
	public get processReady(): TPromise<void> { return this._processManager.ptyProcessReady; }
	public get onDisposed(): Event<ITerminalInstance> { return this._onDisposed.event; }
	public get onFocused(): Event<ITerminalInstance> { return this._onFocused.event; }
	public get onProcessIdReady(): Event<ITerminalInstance> { return this._onProcessIdReady.event; }
	public get onTitleChanged(): Event<string> { return this._onTitleChanged.event; }
	public get title(): string { return this._title; }
	public get hadFocusOnExit(): boolean { return this._hadFocusOnExit; }
	public get isTitleSetByProcess(): boolean { return !!this._messageTitleListener; }
	public get shellLaunchConfig(): IShellLaunchConfig { return Object.freeze(this._shellLaunchConfig); }
	public get commandTracker(): TerminalCommandTracker { return this._commandTracker; }

	public constructor(
		private _terminalFocusContextKey: IContextKey<boolean>,
		private _configHelper: TerminalConfigHelper,
		private _container: HTMLElement,
		private _shellLaunchConfig: IShellLaunchConfig,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IPanelService private readonly _panelService: IPanelService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IThemeService private readonly _themeService: IThemeService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private _logService: ILogService
	) {
		this._instanceDisposables = [];
		this._skipTerminalCommands = [];
		this._onLineDataListeners = [];
		this._isExiting = false;
		this._hadFocusOnExit = false;
		this._isVisible = false;
		this._isDisposed = false;
		this._id = TerminalInstance._idCounter++;
		this._terminalHasTextContextKey = KEYBINDING_CONTEXT_TERMINAL_TEXT_SELECTED.bindTo(this._contextKeyService);
		this.disableLayout = false;

		this._logService.trace(`terminalInstance#ctor (id: ${this.id})`, this._shellLaunchConfig);

		this._onDisposed = new Emitter<TerminalInstance>();
		this._onFocused = new Emitter<TerminalInstance>();
		this._onProcessIdReady = new Emitter<TerminalInstance>();
		this._onTitleChanged = new Emitter<string>();

		this._initDimensions();
		this._createProcess();

		this._xtermReadyPromise = this._createXterm();
		this._xtermReadyPromise.then(() => {
			if (platform.isWindows) {
				this._processManager.ptyProcessReady.then(() => {
					if (!this._isDisposed) {
						this._windowsShellHelper = new WindowsShellHelper(this._processManager.shellProcessId, this, this._xterm);
					}
				});
			}

			// Only attach xterm.js to the DOM if the terminal panel has been opened before.
			if (_container) {
				this._attachToElement(_container);
			}
		});

		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('terminal.integrated')) {
				this.updateConfig();
			}
			if (e.affectsConfiguration('editor.accessibilitySupport')) {
				this.updateAccessibilitySupport();
			}
		});
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
		// Ignore if dimensions are undefined or 0
		if (!width || !height) {
			return null;
		}

		const dimension = this._getDimension(width, height);
		if (!dimension) {
			return null;
		}

		const font = this._configHelper.getFont(this._xterm);

		// Because xterm.js converts from CSS pixels to actual pixels through
		// the use of canvas, window.devicePixelRatio needs to be used here in
		// order to be precise. font.charWidth/charHeight alone as insufficient
		// when window.devicePixelRatio changes.
		const scaledWidthAvailable = dimension.width * window.devicePixelRatio;
		const scaledCharWidth = Math.floor(font.charWidth * window.devicePixelRatio);
		this._cols = Math.max(Math.floor(scaledWidthAvailable / scaledCharWidth), 1);

		const scaledHeightAvailable = dimension.height * window.devicePixelRatio;
		const scaledCharHeight = Math.ceil(font.charHeight * window.devicePixelRatio);
		const scaledLineHeight = Math.floor(scaledCharHeight * font.lineHeight);
		this._rows = Math.max(Math.floor(scaledHeightAvailable / scaledLineHeight), 1);

		return dimension.width;
	}

	private _getDimension(width: number, height: number): dom.Dimension {
		// The font needs to have been initialized
		const font = this._configHelper.getFont(this._xterm);
		if (!font || !font.charWidth || !font.charHeight) {
			return null;
		}

		// The panel is minimized
		if (!this._isVisible) {
			return TerminalInstance._lastKnownDimensions;
		} else {
			// Trigger scroll event manually so that the viewport's scroll area is synced. This
			// needs to happen otherwise its scrollTop value is invalid when the panel is toggled as
			// it gets removed and then added back to the DOM (resetting scrollTop to 0).
			// Upstream issue: https://github.com/sourcelair/xterm.js/issues/291
			if (this._xterm) {
				this._xterm.emit('scroll', this._xterm.buffer.ydisp);
			}
		}

		if (!this._wrapperElement) {
			return null;
		}

		const wrapperElementStyle = getComputedStyle(this._wrapperElement);
		const marginLeft = parseInt(wrapperElementStyle.marginLeft.split('px')[0], 10);
		const marginRight = parseInt(wrapperElementStyle.marginRight.split('px')[0], 10);
		const bottom = parseInt(wrapperElementStyle.bottom.split('px')[0], 10);

		const innerWidth = width - marginLeft - marginRight;
		const innerHeight = height - bottom;

		TerminalInstance._lastKnownDimensions = new dom.Dimension(innerWidth, innerHeight);
		return TerminalInstance._lastKnownDimensions;
	}

	/**
	 * Create xterm.js instance and attach data listeners.
	 */
	protected async _createXterm(): TPromise<void> {
		if (!Terminal) {
			Terminal = (await import('vscode-xterm')).Terminal;
			// Enable xterm.js addons
			Terminal.applyAddon(require.__$__nodeRequire('vscode-xterm/lib/addons/search/search'));
			Terminal.applyAddon(require.__$__nodeRequire('vscode-xterm/lib/addons/webLinks/webLinks'));
			Terminal.applyAddon(require.__$__nodeRequire('vscode-xterm/lib/addons/winptyCompat/winptyCompat'));
			// Localize strings
			Terminal.strings.blankLine = nls.localize('terminal.integrated.a11yBlankLine', 'Blank line');
			Terminal.strings.promptLabel = nls.localize('terminal.integrated.a11yPromptLabel', 'Terminal input');
			Terminal.strings.tooMuchOutput = nls.localize('terminal.integrated.a11yTooMuchOutput', 'Too much output to announce, navigate to rows manually to read');
		}
		const accessibilitySupport = this._configurationService.getValue<IEditorOptions>('editor').accessibilitySupport;
		const font = this._configHelper.getFont(undefined, true);
		this._xterm = new Terminal({
			scrollback: this._configHelper.config.scrollback,
			theme: this._getXtermTheme(),
			fontFamily: font.fontFamily,
			fontWeight: this._configHelper.config.fontWeight,
			fontWeightBold: this._configHelper.config.fontWeightBold,
			fontSize: font.fontSize,
			lineHeight: font.lineHeight,
			bellStyle: this._configHelper.config.enableBell ? 'sound' : 'none',
			screenReaderMode: accessibilitySupport === 'on',
			macOptionIsMeta: this._configHelper.config.macOptionIsMeta,
			rightClickSelectsWord: this._configHelper.config.rightClickBehavior === 'selectWord'
		});
		if (this._shellLaunchConfig.initialText) {
			this._xterm.writeln(this._shellLaunchConfig.initialText);
		}
		this._xterm.winptyCompatInit();
		this._xterm.on('linefeed', () => this._onLineFeed());
		this._processManager.process.on('message', (message) => this._sendPtyDataToXterm(message));
		this._xterm.on('data', data => this._processManager.write(data));
		this._linkHandler = this._instantiationService.createInstance(TerminalLinkHandler, this._xterm, platform.platform, this._processManager.initialCwd);
		this._commandTracker = new TerminalCommandTracker(this._xterm);
		this._instanceDisposables.push(this._themeService.onThemeChange(theme => this._updateTheme(theme)));
	}

	public reattachToElement(container: HTMLElement): void {
		if (!this._wrapperElement) {
			throw new Error('The terminal instance has not been attached to a container yet');
		}

		if (this._wrapperElement.parentNode) {
			this._wrapperElement.parentNode.removeChild(this._wrapperElement);
		}
		this._container = container;
		this._container.appendChild(this._wrapperElement);
	}

	public attachToElement(container: HTMLElement): void {
		// The container did not change, do nothing
		if (this._container === container) {
			return;
		}

		// Attach has not occured yet
		if (!this._wrapperElement) {
			this._attachToElement(container);
			return;
		}

		// TODO: Verify listeners still work
		// The container changed, reattach
		this._container.removeChild(this._wrapperElement);
		this._container = container;
		this._container.appendChild(this._wrapperElement);
	}

	public _attachToElement(container: HTMLElement): void {
		this._xtermReadyPromise.then(() => {
			if (this._wrapperElement) {
				throw new Error('The terminal instance has already been attached to a container');
			}

			this._container = container;
			this._wrapperElement = document.createElement('div');
			dom.addClass(this._wrapperElement, 'terminal-wrapper');
			this._xtermElement = document.createElement('div');

			// Attach the xterm object to the DOM, exposing it to the smoke tests
			(<any>this._wrapperElement).xterm = this._xterm;

			this._xterm.open(this._xtermElement);
			this._xterm.attachCustomKeyEventHandler((event: KeyboardEvent) => {
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
				// Always have alt+F4 skip the terminal on Windows and allow it to be handled by the
				// system
				if (platform.isWindows && event.altKey && event.key === 'F4' && !event.ctrlKey) {
					return false;
				}

				return undefined;
			});
			this._instanceDisposables.push(dom.addDisposableListener(this._xterm.element, 'mousedown', (event: KeyboardEvent) => {
				// We need to listen to the mouseup event on the document since the user may release
				// the mouse button anywhere outside of _xterm.element.
				const listener = dom.addDisposableListener(document, 'mouseup', (event: KeyboardEvent) => {
					// Delay with a setTimeout to allow the mouseup to propagate through the DOM
					// before evaluating the new selection state.
					setTimeout(() => this._refreshSelectionContextKey(), 0);
					listener.dispose();
				});
			}));

			// xterm.js currently drops selection on keyup as we need to handle this case.
			this._instanceDisposables.push(dom.addDisposableListener(this._xterm.element, 'keyup', (event: KeyboardEvent) => {
				// Wait until keyup has propagated through the DOM before evaluating
				// the new selection state.
				setTimeout(() => this._refreshSelectionContextKey(), 0);
			}));

			const xtermHelper: HTMLElement = <HTMLElement>this._xterm.element.querySelector('.xterm-helpers');
			const focusTrap: HTMLElement = document.createElement('div');
			focusTrap.setAttribute('tabindex', '0');
			dom.addClass(focusTrap, 'focus-trap');
			this._instanceDisposables.push(dom.addDisposableListener(focusTrap, 'focus', (event: FocusEvent) => {
				let currentElement = focusTrap;
				while (!dom.hasClass(currentElement, 'part')) {
					currentElement = currentElement.parentElement;
				}
				const hidePanelElement = <HTMLElement>currentElement.querySelector('.hide-panel-action');
				hidePanelElement.focus();
			}));
			xtermHelper.insertBefore(focusTrap, this._xterm.textarea);

			this._instanceDisposables.push(dom.addDisposableListener(this._xterm.textarea, 'focus', (event: KeyboardEvent) => {
				this._terminalFocusContextKey.set(true);
				this._onFocused.fire(this);
			}));
			this._instanceDisposables.push(dom.addDisposableListener(this._xterm.textarea, 'blur', (event: KeyboardEvent) => {
				this._terminalFocusContextKey.reset();
				this._refreshSelectionContextKey();
			}));
			this._instanceDisposables.push(dom.addDisposableListener(this._xterm.element, 'focus', (event: KeyboardEvent) => {
				this._terminalFocusContextKey.set(true);
			}));
			this._instanceDisposables.push(dom.addDisposableListener(this._xterm.element, 'blur', (event: KeyboardEvent) => {
				this._terminalFocusContextKey.reset();
				this._refreshSelectionContextKey();
			}));

			this._wrapperElement.appendChild(this._xtermElement);
			this._widgetManager = new TerminalWidgetManager(this._wrapperElement);
			this._linkHandler.setWidgetManager(this._widgetManager);
			this._container.appendChild(this._wrapperElement);

			const computedStyle = window.getComputedStyle(this._container);
			const width = parseInt(computedStyle.getPropertyValue('width').replace('px', ''), 10);
			const height = parseInt(computedStyle.getPropertyValue('height').replace('px', ''), 10);
			this.layout(new dom.Dimension(width, height));
			this.setVisible(this._isVisible);
			this.updateConfig();

			// If IShellLaunchConfig.waitOnExit was true and the process finished before the terminal
			// panel was initialized.
			if (this._xterm.getOption('disableStdin')) {
				this._attachPressAnyKeyToCloseListener();
			}
		});
	}

	public registerLinkMatcher(regex: RegExp, handler: (url: string) => void, matchIndex?: number, validationCallback?: (uri: string, callback: (isValid: boolean) => void) => void): number {
		return this._linkHandler.registerCustomLinkHandler(regex, handler, matchIndex, validationCallback);
	}

	public deregisterLinkMatcher(linkMatcherId: number): void {
		this._xterm.deregisterLinkMatcher(linkMatcherId);
	}

	public hasSelection(): boolean {
		return this._xterm && this._xterm.hasSelection();
	}

	public copySelection(): void {
		if (this.hasSelection()) {
			this._clipboardService.writeText(this._xterm.getSelection());
		} else {
			this._notificationService.warn(nls.localize('terminal.integrated.copySelection.noSelection', 'The terminal has no selection to copy'));
		}
	}

	get selection(): string | undefined {
		return this.hasSelection() ? this._xterm.getSelection() : undefined;
	}

	public clearSelection(): void {
		this._xterm.clearSelection();
	}

	public selectAll(): void {
		// Focus here to ensure the terminal context key is set
		this._xterm.focus();
		this._xterm.selectAll();
	}

	public findNext(term: string): boolean {
		return this._xterm.findNext(term);
	}

	public findPrevious(term: string): boolean {
		return this._xterm.findPrevious(term);
	}

	public notifyFindWidgetFocusChanged(isFocused: boolean): void {
		const terminalFocused = !isFocused && (document.activeElement === this._xterm.textarea || document.activeElement === this._xterm.element);
		this._terminalFocusContextKey.set(terminalFocused);
	}

	public dispose(): void {
		this._logService.trace(`terminalInstance#dispose (id: ${this.id})`);

		if (this._windowsShellHelper) {
			this._windowsShellHelper.dispose();
		}
		if (this._linkHandler) {
			this._linkHandler.dispose();
		}
		if (this._xterm && this._xterm.element) {
			this._hadFocusOnExit = dom.hasClass(this._xterm.element, 'focus');
		}
		if (this._wrapperElement) {
			this._container.removeChild(this._wrapperElement);
			this._wrapperElement = null;
		}
		if (this._xterm) {
			const buffer = (<any>this._xterm.buffer);
			this._sendLineData(buffer, buffer.ybase + buffer.y);
			this._xterm.destroy();
			this._xterm = null;
		}
		if (this._processManager.process) {
			if (this._processManager.process.connected) {
				// If the process was still connected this dispose came from
				// within VS Code, not the process, so mark the process as
				// killed by the user.
				this._processManager.processState = ProcessState.KILLED_BY_USER;
				this._processManager.process.send({ event: 'shutdown' });
			}
			this._processManager.process = null;
		}
		if (!this._isDisposed) {
			this._isDisposed = true;
			this._onDisposed.fire(this);
		}
		this._processManager.dispose();
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
		this._processManager.ptyProcessReady.then(() => {
			// Normalize line endings to 'enter' press.
			text = text.replace(TerminalInstance.EOL_REGEX, '\r');
			if (addNewLine && text.substr(text.length - 1) !== '\r') {
				text += '\r';
			}
			this._processManager.process.send({
				event: 'input',
				data: text
			});
		});
	}

	public setVisible(visible: boolean): void {
		this._isVisible = visible;
		if (this._wrapperElement) {
			dom.toggleClass(this._wrapperElement, 'active', visible);
		}
		if (visible && this._xterm) {
			// Trigger a manual scroll event which will sync the viewport and scroll bar. This is
			// necessary if the number of rows in the terminal has decreased while it was in the
			// background since scrollTop changes take no effect but the terminal's position does
			// change since the number of visible rows decreases.
			this._xterm.emit('scroll', this._xterm.buffer.ydisp);
			if (this._container) {
				// Force a layout when the instance becomes invisible. This is particularly important
				// for ensuring that terminals that are created in the background by an extension will
				// correctly get correct character measurements in order to render to the screen (see
				// #34554).
				const computedStyle = window.getComputedStyle(this._container);
				const width = parseInt(computedStyle.getPropertyValue('width').replace('px', ''), 10);
				const height = parseInt(computedStyle.getPropertyValue('height').replace('px', ''), 10);
				this.layout(new dom.Dimension(width, height));
			}
		}
	}

	public scrollDownLine(): void {
		this._xterm.scrollLines(1);
	}

	public scrollDownPage(): void {
		this._xterm.scrollPages(1);
	}

	public scrollToBottom(): void {
		this._xterm.scrollToBottom();
	}

	public scrollUpLine(): void {
		this._xterm.scrollLines(-1);
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
		const isActive = activePanel && activePanel.getId() === TERMINAL_PANEL_ID;

		this._terminalHasTextContextKey.set(isActive && this.hasSelection());
	}

	protected _createProcess(): void {
		// TODO: This should be injected in to the terminal instance (from service?)
		this._processManager = this._instantiationService.createInstance(TerminalProcessManager, this._configHelper, this._cols, this._rows);
		this._processManager.onShellProcessIdReady(() => this._onProcessIdReady.fire(this));
		this._processManager.createProcess(this._shellLaunchConfig);

		if (this._shellLaunchConfig.name) {
			this.setTitle(this._shellLaunchConfig.name, false);
		} else {
			// Only listen for process title changes when a name is not provided
			this.setTitle(this._shellLaunchConfig.executable, true);
			this._messageTitleListener = (message) => {
				if (message.type === 'title') {
					this.setTitle(message.content ? message.content : '', true);
				}
			};
			this._processManager.process.on('message', this._messageTitleListener);
		}
		this._processManager.process.on('exit', exitCode => this._onPtyProcessExit(exitCode));
	}

	private _sendPtyDataToXterm(message: { type: string, content: string }): void {
		this._logService.debug(`Terminal process message (id: ${this.id})`, message);
		if (message.type === 'data') {
			if (this._widgetManager) {
				this._widgetManager.closeMessage();
			}
			if (this._xterm) {
				this._xterm.write(message.content);
			}
		}
	}

	// TODO: Move most to TerminalProcessManager, fire an event when it happens
	private _onPtyProcessExit(exitCode: number): void {
		this._logService.debug(`Terminal process exit (id: ${this.id}) with code ${exitCode}`);

		// Prevent dispose functions being triggered multiple times
		if (this._isExiting) {
			return;
		}

		this._isExiting = true;
		this._processManager.process = null;
		let exitCodeMessage: string;

		if (exitCode) {
			exitCodeMessage = nls.localize('terminal.integrated.exitedWithCode', 'The terminal process terminated with exit code: {0}', exitCode);
		}

		// If the process is marked as launching then mark the process as killed
		// during launch. This typically means that there is a problem with the
		// shell and args.
		if (this._processManager.processState === ProcessState.LAUNCHING) {
			this._processManager.processState = ProcessState.KILLED_DURING_LAUNCH;
		}

		// If TerminalInstance did not know about the process exit then it was
		// triggered by the process, not on VS Code's side.
		if (this._processManager.processState === ProcessState.RUNNING) {
			this._processManager.processState = ProcessState.KILLED_BY_PROCESS;
		}


		this._logService.debug(`Terminal process exit (id: ${this.id}) state ${this._processManager.processState}`);

		// Only trigger wait on exit when the exit was *not* triggered by the
		// user (via the `workbench.action.terminal.kill` command).
		if (this._shellLaunchConfig.waitOnExit && this._processManager.processState !== ProcessState.KILLED_BY_USER) {
			if (exitCode) {
				this._xterm.writeln(exitCodeMessage);
			}
			let message = typeof this._shellLaunchConfig.waitOnExit === 'string'
				? this._shellLaunchConfig.waitOnExit
				: nls.localize('terminal.integrated.waitOnExit', 'Press any key to close the terminal');
			// Bold the message and add an extra new line to make it stand out from the rest of the output
			message = `\n\x1b[1m${message}\x1b[0m`;
			this._xterm.writeln(message);
			// Disable all input if the terminal is exiting and listen for next keypress
			this._xterm.setOption('disableStdin', true);
			if (this._xterm.textarea) {
				this._attachPressAnyKeyToCloseListener();
			}
		} else {
			this.dispose();
			if (exitCode) {
				if (this._processManager.processState === ProcessState.KILLED_DURING_LAUNCH) {
					let args = '';
					if (typeof this._shellLaunchConfig.args === 'string') {
						args = this._shellLaunchConfig.args;
					} else if (this._shellLaunchConfig.args && this._shellLaunchConfig.args.length) {
						args = ' ' + this._shellLaunchConfig.args.map(a => {
							if (typeof a === 'string' && a.indexOf(' ') !== -1) {
								return `'${a}'`;
							}
							return a;
						}).join(' ');
					}
					this._notificationService.error(nls.localize('terminal.integrated.launchFailed', 'The terminal process command \'{0}{1}\' failed to launch (exit code: {2})', this._shellLaunchConfig.executable, args, exitCode));
				} else {
					if (this._configHelper.config.showExitAlert) {
						this._notificationService.error(exitCodeMessage);
					} else {
						console.warn(exitCodeMessage);
					}
				}
			}
		}
	}

	private _attachPressAnyKeyToCloseListener() {
		this._processManager.addDisposable(dom.addDisposableListener(this._xterm.textarea, 'keypress', (event: KeyboardEvent) => {
			this.dispose();
			event.preventDefault();
		}));
	}

	public reuseTerminal(shell?: IShellLaunchConfig): void {
		// Kill and clean up old process
		if (this._processManager.process) {
			this._processManager.process.removeAllListeners('exit');
			if (this._processManager.process.connected) {
				this._processManager.process.kill();
			}
			this._processManager.process = null;
		}

		// TODO: This should not call dispose directly, process manager should dispose any
		// disposables when creating a new process
		this._processManager.dispose();

		// Ensure new processes' output starts at start of new line
		this._xterm.write('\n\x1b[G');

		// Print initialText if specified
		if (shell.initialText) {
			this._xterm.writeln(shell.initialText);
		}

		// Initialize new process
		const oldTitle = this._title;
		this._shellLaunchConfig = shell;
		this._createProcess();
		if (oldTitle !== this._title) {
			this.setTitle(this._title, true);
		}
		this._processManager.process.on('message', (message) => this._sendPtyDataToXterm(message));

		// Clean up waitOnExit state
		if (this._isExiting && this._shellLaunchConfig.waitOnExit) {
			this._xterm.setOption('disableStdin', false);
			this._isExiting = false;
		}

		// Set the new shell launch config
		this._shellLaunchConfig = shell;
	}

	public onLineData(listener: (lineData: string) => void): lifecycle.IDisposable {
		this._onLineDataListeners.push(listener);
		return {
			dispose: () => {
				const i = this._onLineDataListeners.indexOf(listener);
				if (i >= 0) {
					this._onLineDataListeners.splice(i, 1);
				}
			}
		};
	}

	private _onLineFeed(): void {
		if (this._onLineDataListeners.length === 0) {
			return;
		}
		const buffer = (<any>this._xterm.buffer);
		const newLine = buffer.lines.get(buffer.ybase + buffer.y);
		if (!newLine.isWrapped) {
			this._sendLineData(buffer, buffer.ybase + buffer.y - 1);
		}
	}

	private _sendLineData(buffer: any, lineIndex: number): void {
		let lineData = buffer.translateBufferLineToString(lineIndex, true);
		while (lineIndex >= 0 && buffer.lines.get(lineIndex--).isWrapped) {
			lineData = buffer.translateBufferLineToString(lineIndex, false) + lineData;
		}
		this._onLineDataListeners.forEach(listener => {
			try {
				listener(lineData);
			} catch (err) {
				console.error(`onLineData listener threw`, err);
			}
		});
	}

	public onExit(listener: (exitCode: number) => void): lifecycle.IDisposable {
		if (this._processManager.process) {
			this._processManager.process.on('exit', listener);
		}
		return {
			dispose: () => {
				if (this._processManager.process) {
					this._processManager.process.removeListener('exit', listener);
				}
			}
		};
	}

	public updateConfig(): void {
		this._setCursorBlink(this._configHelper.config.cursorBlinking);
		this._setCursorStyle(this._configHelper.config.cursorStyle);
		this._setCommandsToSkipShell(this._configHelper.config.commandsToSkipShell);
		this._setScrollback(this._configHelper.config.scrollback);
		this._setEnableBell(this._configHelper.config.enableBell);
		this._setMacOptionIsMeta(this._configHelper.config.macOptionIsMeta);
		this._setRightClickSelectsWord(this._configHelper.config.rightClickBehavior === 'selectWord');
	}

	public updateAccessibilitySupport(): void {
		const value = this._configurationService.getValue('editor.accessibilitySupport');
		this._xterm.setOption('screenReaderMode', value === 'on');
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

	private _setMacOptionIsMeta(value: boolean): void {
		if (this._xterm && this._xterm.getOption('macOptionIsMeta') !== value) {
			this._xterm.setOption('macOptionIsMeta', value);
		}
	}

	private _setRightClickSelectsWord(value: boolean): void {
		if (this._xterm && this._xterm.getOption('rightClickSelectsWord') !== value) {
			this._xterm.setOption('rightClickSelectsWord', value);
		}
	}

	private _setEnableBell(isEnabled: boolean): void {
		if (this._xterm) {
			if (this._xterm.getOption('bellStyle') === 'sound') {
				if (!this._configHelper.config.enableBell) {
					this._xterm.setOption('bellStyle', 'none');
				}
			} else {
				if (this._configHelper.config.enableBell) {
					this._xterm.setOption('bellStyle', 'sound');
				}
			}
		}
	}

	public layout(dimension: dom.Dimension): void {
		if (this.disableLayout) {
			return;
		}

		const terminalWidth = this._evaluateColsAndRows(dimension.width, dimension.height);
		if (!terminalWidth) {
			return;
		}

		if (this._xterm) {
			const font = this._configHelper.getFont(this._xterm);

			// Only apply these settings when the terminal is visible so that
			// the characters are measured correctly.
			if (this._isVisible) {
				if (this._xterm.getOption('lineHeight') !== font.lineHeight) {
					this._xterm.setOption('lineHeight', font.lineHeight);
				}
				if (this._xterm.getOption('fontSize') !== font.fontSize) {
					this._xterm.setOption('fontSize', font.fontSize);
				}
				if (this._xterm.getOption('fontFamily') !== font.fontFamily) {
					this._xterm.setOption('fontFamily', font.fontFamily);
				}
				if (this._xterm.getOption('fontWeight') !== this._configHelper.config.fontWeight) {
					this._xterm.setOption('fontWeight', this._configHelper.config.fontWeight);
				}
				if (this._xterm.getOption('fontWeightBold') !== this._configHelper.config.fontWeightBold) {
					this._xterm.setOption('fontWeightBold', this._configHelper.config.fontWeightBold);
				}
			}

			this._xterm.resize(this._cols, this._rows);
			this._xterm.element.style.width = terminalWidth + 'px';
			if (this._isVisible) {
				// Force the renderer to unpause by simulating an IntersectionObserver event. This
				// is to fix an issue where dragging the window to the top of the screen to maximize
				// on Winodws/Linux would fire an event saying that the terminal was not visible.
				// This should only force a refresh if one is needed.
				(<any>this._xterm).renderer.onIntersectionChange({ intersectionRatio: 1 });
			}
		}

		this._processManager.ptyProcessReady.then(() => {
			if (this._processManager.process && this._processManager.process.connected) {
				// The child process could aready be terminated
				try {
					this._processManager.process.send({
						event: 'resize',
						cols: this._cols,
						rows: this._rows
					});
				} catch (error) {
					// We tried to write to a closed pipe / channel.
					if (error.code !== 'EPIPE' && error.code !== 'ERR_IPC_CHANNEL_CLOSED') {
						throw (error);
					}
				}
			}
		});
	}

	public setTitle(title: string, eventFromProcess: boolean): void {
		if (!title) {
			return;
		}
		if (eventFromProcess) {
			title = paths.basename(title);
			if (platform.isWindows) {
				// Remove the .exe extension
				title = title.split('.exe')[0];
			}
		} else {
			// If the title has not been set by the API or the rename command, unregister the handler that
			// automatically updates the terminal name
			if (this._processManager.process && this._messageTitleListener) {
				this._processManager.process.removeListener('message', this._messageTitleListener);
				this._messageTitleListener = null;
			}
		}
		const didTitleChange = title !== this._title;
		this._title = title;
		if (didTitleChange) {
			this._onTitleChanged.fire(title);
		}
	}

	private _getXtermTheme(theme?: ITheme): any {
		if (!theme) {
			theme = this._themeService.getTheme();
		}

		const foregroundColor = theme.getColor(TERMINAL_FOREGROUND_COLOR);
		const backgroundColor = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
		const cursorColor = theme.getColor(TERMINAL_CURSOR_FOREGROUND_COLOR) || foregroundColor;
		const cursorAccentColor = theme.getColor(TERMINAL_CURSOR_BACKGROUND_COLOR) || backgroundColor;
		const selectionColor = theme.getColor(TERMINAL_SELECTION_BACKGROUND_COLOR);

		return {
			background: backgroundColor ? backgroundColor.toString() : null,
			foreground: foregroundColor ? foregroundColor.toString() : null,
			cursor: cursorColor ? cursorColor.toString() : null,
			cursorAccent: cursorAccentColor ? cursorAccentColor.toString() : null,
			selection: selectionColor ? selectionColor.toString() : null,
			black: theme.getColor(ansiColorIdentifiers[0]).toString(),
			red: theme.getColor(ansiColorIdentifiers[1]).toString(),
			green: theme.getColor(ansiColorIdentifiers[2]).toString(),
			yellow: theme.getColor(ansiColorIdentifiers[3]).toString(),
			blue: theme.getColor(ansiColorIdentifiers[4]).toString(),
			magenta: theme.getColor(ansiColorIdentifiers[5]).toString(),
			cyan: theme.getColor(ansiColorIdentifiers[6]).toString(),
			white: theme.getColor(ansiColorIdentifiers[7]).toString(),
			brightBlack: theme.getColor(ansiColorIdentifiers[8]).toString(),
			brightRed: theme.getColor(ansiColorIdentifiers[9]).toString(),
			brightGreen: theme.getColor(ansiColorIdentifiers[10]).toString(),
			brightYellow: theme.getColor(ansiColorIdentifiers[11]).toString(),
			brightBlue: theme.getColor(ansiColorIdentifiers[12]).toString(),
			brightMagenta: theme.getColor(ansiColorIdentifiers[13]).toString(),
			brightCyan: theme.getColor(ansiColorIdentifiers[14]).toString(),
			brightWhite: theme.getColor(ansiColorIdentifiers[15]).toString()
		};
	}

	private _updateTheme(theme?: ITheme): void {
		this._xterm.setOption('theme', this._getXtermTheme(theme));
	}
}

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	// Border
	const border = theme.getColor(activeContrastBorder);
	if (border) {
		collector.addRule(`
			.hc-black .monaco-workbench .panel.integrated-terminal .xterm.focus::before,
			.hc-black .monaco-workbench .panel.integrated-terminal .xterm:focus::before { border-color: ${border}; }`
		);
	}

	// Scrollbar
	const scrollbarSliderBackgroundColor = theme.getColor(scrollbarSliderBackground);
	if (scrollbarSliderBackgroundColor) {
		collector.addRule(`
			.monaco-workbench .panel.integrated-terminal .xterm.focus .xterm-viewport,
			.monaco-workbench .panel.integrated-terminal .xterm:focus .xterm-viewport,
			.monaco-workbench .panel.integrated-terminal .xterm:hover .xterm-viewport { background-color: ${scrollbarSliderBackgroundColor} !important; }`
		);
	}

	const scrollbarSliderHoverBackgroundColor = theme.getColor(scrollbarSliderHoverBackground);
	if (scrollbarSliderHoverBackgroundColor) {
		collector.addRule(`.monaco-workbench .panel.integrated-terminal .xterm .xterm-viewport::-webkit-scrollbar-thumb:hover { background-color: ${scrollbarSliderHoverBackgroundColor}; }`);
	}

	const scrollbarSliderActiveBackgroundColor = theme.getColor(scrollbarSliderActiveBackground);
	if (scrollbarSliderActiveBackgroundColor) {
		collector.addRule(`.monaco-workbench .panel.integrated-terminal .xterm .xterm-viewport::-webkit-scrollbar-thumb:active { background-color: ${scrollbarSliderActiveBackgroundColor}; }`);
	}
});
