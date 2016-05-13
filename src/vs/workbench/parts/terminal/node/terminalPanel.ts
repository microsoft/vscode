/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import termJs = require('term.js');
import fs = require('fs');
import {fork, Terminal} from 'pty.js';
import platform = require('vs/base/common/platform');
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, Dimension} from 'vs/base/browser/builder';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {ITerminalConfiguration, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/common/terminal';
import {Panel} from 'vs/workbench/browser/panel';
import {DomScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {ScrollbarVisibility} from 'vs/base/browser/ui/scrollbar/scrollableElementOptions';

const TERMINAL_CHAR_WIDTH = 8;
const TERMINAL_CHAR_HEIGHT = 18;

export class TerminalPanel extends Panel {

	private ptyProcess: Terminal;
	private parentDomElement: HTMLElement;
	private terminal;
	private terminalDomElement: HTMLDivElement;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(TERMINAL_PANEL_ID, telemetryService);
	}

	public layout(dimension: Dimension): void {
		let cols = Math.floor(this.parentDomElement.offsetWidth / TERMINAL_CHAR_WIDTH);
		let rows = Math.floor(this.parentDomElement.offsetHeight / TERMINAL_CHAR_HEIGHT);
		this.terminal.resize(cols, rows);
		this.ptyProcess.resize(cols, rows);
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.parentDomElement = parent.getHTMLElement();
		this.createTerminal();

		return TPromise.as(null);
	}

	private createTerminal(): void {
		this.parentDomElement.innerHTML = '';
		this.ptyProcess = fork(this.getShell(), [], {
			name: fs.existsSync('/usr/share/terminfo/x/xterm-256color') ? 'xterm-256color' : 'xterm',
			cols: 80,
			rows: 6,
			cwd: this.contextService.getWorkspace() ? this.contextService.getWorkspace().resource.fsPath : process.env.HOME
		});
		this.terminalDomElement = document.createElement('div');
		this.parentDomElement.classList.add('integrated-terminal');
		let terminalScrollable = new DomScrollableElement(this.terminalDomElement, {
			canUseTranslate3d: false,
			horizontal: ScrollbarVisibility.Hidden,
			vertical: ScrollbarVisibility.Auto
		});
		//let terminalContainer = new ScrollableElement(this.terminalDomElement, terminalScrollable, { horizontal: 'hidden', vertical: 'auto' });
		this.terminal = termJs({
			cursorBlink: false // term.js' blinking cursor breaks selection
		});

		this.ptyProcess.on('data', (data) => {
			this.terminal.write(data);
		});
		this.terminal.on('data', (data) => {
			this.ptyProcess.write(data);
			return false;
		});
		this.ptyProcess.on('exit', (data) => {
			this.terminal.destroy();
			// TODO: When multiple terminals are supported this should do something smarter. There is
			// also a weird bug here at leasy on Ubuntu 15.10 where the new terminal text does not
			// repaint correctly.
			this.createTerminal();
		});
		this.parentDomElement.addEventListener('mousedown', (event) => {
			// Drop selection and focus terminal on Linux to enable middle button paste when click
			// occurs on the selection itself.
			if (event.which === 2 && platform.isLinux) {
				this.focusTerminal(true);
			}
		});
		this.parentDomElement.addEventListener('mouseup', (event) => {
			if (event.which !== 3) {
				this.focusTerminal();
			}
		});

		this.terminal.open(this.terminalDomElement);
		this.parentDomElement.appendChild(terminalScrollable.getDomNode());

		let config = this.configurationService.getConfiguration<ITerminalConfiguration>();
		this.terminalDomElement.style.fontFamily = config.integratedTerminal.fontFamily;
		this.terminal.colors = this.getTerminalColors();
	}

	private focusTerminal(force?: boolean): void {
		let text = window.getSelection().toString();
		if (!text || force) {
			this.terminal.focus();
			if (this.terminal._textarea) {
				this.terminal._textarea.focus();
			}
		}
	}

	private getShell(): string {
		let config = this.configurationService.getConfiguration<ITerminalConfiguration>();
		if (platform.isWindows) {
			return config.integratedTerminal.shell.windows;
		}
		return config.integratedTerminal.shell.unixLike;
	}

	private getTerminalColors(): string[] {
		let config = this.configurationService.getConfiguration<ITerminalConfiguration>().integratedTerminal.ansiColors;
		let colors = [
			config.black,
			config.red,
			config.green,
			config.yellow,
			config.blue,
			config.magenta,
			config.cyan,
			config.white,
			config.brightBlack,
			config.brightRed,
			config.brightGreen,
			config.brightYellow,
			config.brightBlue,
			config.brightMagenta,
			config.brightCyan,
			config.brightWhite
		];
		return colors;
	}
}
