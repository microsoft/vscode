/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as os from 'os';
import * as path from 'path';
import * as cp from 'child_process';
import platform = require('vs/base/common/platform');
import processes = require('vs/base/node/processes');

export const TERMINAL_DEFAULT_SHELL_LINUX = !platform.isWindows ? (process.env.SHELL || 'sh') : 'sh';
export const TERMINAL_DEFAULT_SHELL_OSX = !platform.isWindows ? (process.env.SHELL || 'sh') : 'sh';

const isAtLeastWindows10 = platform.isWindows && parseFloat(os.release()) >= 10;
const is64BitWindows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
const powerShellPath = `${process.env.windir}\\${is64BitWindows ? 'Sysnative' : 'System32'}\\WindowsPowerShell\\v1.0\\powershell.exe`;

export const TERMINAL_DEFAULT_SHELL_WINDOWS = isAtLeastWindows10 ? powerShellPath : processes.getWindowsShell();

// Terminal flow control is disabled if the shell is zsh since the popular oh-my-zsh configuration
// overrides the ^S and ^Q keybindings which are used for flow control. fish also overrides the
// keybindings.
// TODO #19474: This should be enabled for zsh when ~/.oh-my-zsh does not exist as well
export const TERMINAL_DEFAULT_FLOW_CONTROL = (typeof process.env.SHELL === 'string' && path.basename(process.env.SHELL) === 'bash');

export interface ITerminalProcessFactory {
	create(env: { [key: string]: string }): cp.ChildProcess;
}
