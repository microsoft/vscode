/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as env from 'vs/base/common/platform';
import { WinTerminalService, MacTerminalService, LinuxTerminalService } from 'vs/workbench/parts/execution/electron-browser/terminalService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';

if (env.isWindows) {
	registerSingleton(ITerminalService, WinTerminalService);
} else if (env.isMacintosh) {
	registerSingleton(ITerminalService, MacTerminalService);
} else if (env.isLinux) {
	registerSingleton(ITerminalService, LinuxTerminalService);
}
