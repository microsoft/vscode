/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/electron-browser/terminalInstanceService';
import { getSystemShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { registerShellConfiguration } from 'vs/workbench/contrib/terminal/common/terminalShellConfig';
import { TerminalNativeService } from 'vs/workbench/contrib/terminal/electron-browser/terminalNativeService';
import { ITerminalNativeService } from 'vs/workbench/contrib/terminal/common/terminal';

registerShellConfiguration(getSystemShell);
registerSingleton(ITerminalNativeService, TerminalNativeService, true);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);
