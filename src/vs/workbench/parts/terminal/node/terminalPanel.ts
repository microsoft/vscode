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
import {ITerminalConfiguration, TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/common/terminal';
import {Panel} from 'vs/workbench/browser/panel';
import {ScrollableElement} from 'vs/base/browser/ui/scrollbar/scrollableElementImpl';
import {DomNodeScrollable} from 'vs/base/browser/ui/scrollbar/domNodeScrollable';

const TERMINAL_CHAR_WIDTH = 8;
const TERMINAL_CHAR_HEIGHT = 18;

export class TerminalPanel extends Panel {

	private ptyProcess: Terminal;
	private parentDomElement: HTMLElement;
	private terminal;
	private terminalDomElement: HTMLDivElement;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService
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

		this.ptyProcess = fork(this.getShell(), [], {
			name: fs.existsSync('/usr/share/terminfo/x/xterm-256color') ? 'xterm-256color' : 'xterm',
			cols: 80,
			rows: 6,
			cwd: process.env.HOME
		});
		this.parentDomElement = parent.getHTMLElement();
		this.terminalDomElement = document.createElement('div');
		this.parentDomElement.classList.add('integrated-terminal');
		let terminalScrollable = new DomNodeScrollable(this.terminalDomElement);
		let terminalContainer = new ScrollableElement(this.terminalDomElement, terminalScrollable, { horizontal: 'hidden', vertical: 'auto' });
		this.terminal = termJs();

		this.ptyProcess.on('data', (data) => {
			this.terminal.write(data);
		});
		this.terminal.on('data', (data) => {
			this.ptyProcess.write(data);
			return false;
		});

		this.terminal.open(this.terminalDomElement);
		this.parentDomElement.appendChild(terminalContainer.getDomNode());

		let config = this.configurationService.getConfiguration<ITerminalConfiguration>();
		this.terminalDomElement.style.fontFamily = config.integratedTerminal.fontFamily;
		this.terminal.colors = this.getTerminalColors();

		return TPromise.as(null);
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
