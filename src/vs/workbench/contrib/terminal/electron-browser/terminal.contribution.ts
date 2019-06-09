/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/electron-browser/terminalInstanceService';
import { TerminalService } from 'vs/workbench/contrib/terminal/electron-browser/terminalService';
import { getDefaultShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { registerShellConfiguration } from 'vs/workbench/contrib/terminal/common/terminalShellConfig';

registerShellConfiguration(getDefaultShell);
registerSingleton(ITerminalService, TerminalService, true);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
