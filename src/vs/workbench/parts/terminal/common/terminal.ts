/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import path = require('path');
import platform = require('vs/base/common/platform');

export const TERMINAL_PANEL_ID = 'workbench.panel.terminal';

export const TERMINAL_SERVICE_ID = 'terminalService';

export const TERMINAL_DEFAULT_SHELL_LINUX = process.env.SHELL || 'sh';
export const TERMINAL_DEFAULT_SHELL_OSX = process.env.SHELL || 'sh';
export const TERMINAL_DEFAULT_SHELL_WINDOWS = platform.isWindows ? path.resolve(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : '';

export var ITerminalService = createDecorator<ITerminalService>(TERMINAL_SERVICE_ID);

export interface ITerminalConfiguration {
	integratedTerminal: {
		shell: {
			linux: string,
			osx: string,
			windows: string
		},
		fontFamily: string,
		ansiColors: {
			black: string,
			red: string,
			green: string,
			yellow: string,
			blue: string,
			magenta: string,
			cyan: string,
			white: string,
			brightBlack: string,
			brightRed: string,
			brightGreen: string,
			brightYellow: string,
			brightBlue: string,
			brightMagenta: string,
			brightCyan: string,
			brightWhite: string,
		}
	};
}

export interface ITerminalService {
	serviceId: ServiceIdentifier<any>;

	toggle(): TPromise<any>;
}
