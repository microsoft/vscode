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
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, Dimension} from 'vs/base/browser/builder';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IStringDictionary} from 'vs/base/common/collections';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IThemeService} from 'vs/workbench/services/themes/common/themeService';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITerminalService, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/electron-browser/terminal';
import {Panel} from 'vs/workbench/browser/panel';
import {DomScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';
import {TerminalConfigHelper} from 'vs/workbench/parts/terminal/electron-browser/terminalConfigHelper';

const TERMINAL_CHAR_WIDTH = 8;
const TERMINAL_CHAR_HEIGHT = 18;

export class TerminalPanel extends Panel {

	private toDispose: lifecycle.IDisposable[];
	private ptyProcess: cp.ChildProcess;
	private parentDomElement: HTMLElement;
	private terminal;
	private terminalDomElement: HTMLDivElement;
	private configurationHelper: TerminalConfigHelper;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITerminalService private terminalService: ITerminalService,
		@IThemeService private themeService: IThemeService
	) {
		super(TERMINAL_PANEL_ID, telemetryService);
		this.configurationHelper = new TerminalConfigHelper(platform.platform, this.configurationService, this.themeService);
		this.toDispose = [];
	}

	public layout(dimension: Dimension): void {
		let cols = Math.floor(this.parentDomElement.offsetWidth / TERMINAL_CHAR_WIDTH);
		let rows = Math.floor(this.parentDomElement.offsetHeight / TERMINAL_CHAR_HEIGHT);
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

	public create(parent: Builder): TPromise<void> {
		super.create(parent);
		this.parentDomElement = parent.getHTMLElement();
		return this.createTerminal();
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (visible && this.terminal === null) {
			return super.setVisible(visible).then(() => {
				return this.createTerminal();
			});
		}
		return super.setVisible(visible);
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
		env['PTYSHELL'] = this.configurationHelper.getShell();
		env['PTYCWD'] = this.contextService.getWorkspace() ? this.contextService.getWorkspace().resource.fsPath : os.homedir();
		return cp.fork('./terminalProcess', [], {
			env: env,
			cwd: URI.parse(path.dirname(require.toUrl('./terminalProcess'))).fsPath
		});
	}

	private createTerminal(): TPromise<void> {
		return new TPromise<void>(resolve => {
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
				this.toDispose = lifecycle.dispose(this.toDispose);
				this.terminal.destroy();
				this.terminal = null;
				// TODO: When multiple terminals are supported this should do something smarter. There is
				// also a weird bug here at least on Ubuntu 15.10 where the new terminal text does not
				// repaint correctly.
				if (exitCode !== 0) {
					// TODO: Allow the terminal to be relaunched after an error
					console.error('Integrated terminal exited with code ' + exitCode);
				}
				this.terminalService.toggle();
			});
			this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'mousedown', (event) => {
				// Drop selection and focus terminal on Linux to enable middle button paste when click
				// occurs on the selection itself.
				if (event.which === 2 && platform.isLinux) {
					this.focusTerminal(true);
				}
			}));
			this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'mouseup', (event) => {
				if (event.which !== 3) {
					this.focusTerminal();
				}
			}));
			this.toDispose.push(DOM.addDisposableListener(this.parentDomElement, 'keyup', (event: KeyboardEvent) => {
				// Keep terminal open on escape
				if (event.keyCode === 27) {
					event.stopPropagation();
				}
			}));
			this.toDispose.push(this.themeService.onDidThemeChange((themeId) => {
				this.setTerminalTheme();
			}));
			this.toDispose.push(this.configurationService.onDidUpdateConfiguration((e) => {
				this.setTerminalFont();
			}));

			this.terminal.open(this.terminalDomElement);
			this.parentDomElement.appendChild(terminalScrollbar.getDomNode());

			this.setTerminalFont();
			this.setTerminalTheme();
			resolve(void 0);
		});
	}

	private setTerminalTheme(): void {
		if (!this.terminal) {
			return;
		}
		this.terminal.colors = this.configurationHelper.getTheme();
		this.terminal.refresh(0, this.terminal.rows);
	}

	/**
	 * Set the terminal font to `terminal.integrated.fontFamily` if it is set, otherwise fallback to
	 * `editor.fontFamily`.
	 */
	private setTerminalFont(): void {
		this.terminalDomElement.style.fontFamily = this.configurationHelper.getFontFamily();
	}

	public focus(): void {
		this.focusTerminal(true);
	}

	private focusTerminal(force?: boolean): void {
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
		super.dispose();
	}
}
