/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import env = require('vs/base/common/platform');
import {WinExecutionService, MacExecutionService, LinuxExecutionService} from 'vs/workbench/parts/execution/electron-browser/executionService';
import {WinTerminalService, MacTerminalService, LinuxTerminalService} from 'vs/workbench/parts/execution/electron-browser/terminalService';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';
import {ITerminalService, IExecutionService} from 'vs/workbench/parts/execution/common/execution';

if (env.isWindows) {
	registerSingleton(IExecutionService, WinExecutionService);
	registerSingleton(ITerminalService, WinTerminalService);
} else if (env.isMacintosh) {
	registerSingleton(IExecutionService, MacExecutionService);
	registerSingleton(ITerminalService, MacTerminalService);
} else if (env.isLinux) {
	registerSingleton(IExecutionService, LinuxExecutionService);
	registerSingleton(ITerminalService, LinuxTerminalService);
}