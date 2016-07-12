/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import cp = require('child_process');
import platform = require('vs/base/common/platform');
import processes = require('vs/base/node/processes');
import {Builder} from 'vs/base/browser/builder';
import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export const TERMINAL_PANEL_ID = 'workbench.panel.terminal';

export const TERMINAL_SERVICE_ID = 'terminalService';

export const TERMINAL_DEFAULT_SHELL_LINUX = !platform.isWindows ? (process.env.SHELL || 'sh') : 'sh';
export const TERMINAL_DEFAULT_SHELL_OSX = !platform.isWindows ? (process.env.SHELL || 'sh') : 'sh';
export const TERMINAL_DEFAULT_SHELL_WINDOWS = processes.getWindowsShell();

/**
 * A context key that is set when the integrated terminal has focus.
 */
export const KEYBINDING_CONTEXT_TERMINAL_FOCUS = 'terminalFocus';

export var ITerminalService = createDecorator<ITerminalService>(TERMINAL_SERVICE_ID);

export interface ITerminalConfiguration {
	terminal: {
		integrated: {
			shell: {
				linux: string,
				osx: string,
				windows: string
			},
			shellArgs: {
				linux: string[],
				osx: string[]
			},
			cursorBlinking: boolean,
			fontFamily: string,
			fontLigatures: boolean,
			fontSize: number,
			lineHeight: number
		}
	};
}

export interface ITerminalProcess {
	title: string;
	process: cp.ChildProcess;
}

export interface ITerminalService {
	_serviceBrand: any;
	onActiveInstanceChanged: Event<string>;
	onInstancesChanged: Event<string>;
	onInstanceTitleChanged: Event<string>;

	close(): TPromise<any>;
	copySelection(): TPromise<any>;
	createNew(): TPromise<any>;
	focus(): TPromise<any>;
	focusNext(): TPromise<any>;
	focusPrevious(): TPromise<any>;
	hide(): TPromise<any>;
	paste(): TPromise<any>;
	runSelectedText(): TPromise<any>;
	setActiveTerminal(index: number): TPromise<any>;
	toggle(): TPromise<any>;

	getActiveTerminalIndex(): number;
	getTerminalInstanceTitles(): string[];
	initConfigHelper(panelContainer: Builder): void;
	killTerminalProcess(terminalProcess: ITerminalProcess): void;
}
