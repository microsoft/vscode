/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import termJs = require('term.js');
import fs = require('fs');
import {fork, Terminal} from 'pty.js';
import {TPromise} from 'vs/base/common/winjs.base';
import {Builder, Dimension} from 'vs/base/browser/builder';
import {ITelemetryService} from 'vs/platform/telemetry/common/telemetry';
import {TERMINAL_PANEL_ID} from 'vs/workbench/parts/terminal/common/terminal';
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

		this.ptyProcess = fork(process.env.SHELL || 'sh', [], {
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

		this.terminalDomElement.style.fontFamily = 'Hack, mono';
		this.terminal.colors = [
			'#000000', // black
			'#cd3131', // red
			'#09885a', // green
			'#e5e510', // yellow
			'#0451a5', // blue
			'#bc05bc', // magenta
			'#0598bc', // cyan
			'#e5e5e5', // white
			'#111111', // bright black
			'#dc6f6f', // bright red
			'#53ac8c', // bright green
			'#eded58', // bright yellow
			'#4f85c0', // bright blue
			'#d050d0', // bright magenta
			'#50b7d0', // bright cyan
			'#FFFFFF', // bright white
		];

		return TPromise.as(null);
	}
}
