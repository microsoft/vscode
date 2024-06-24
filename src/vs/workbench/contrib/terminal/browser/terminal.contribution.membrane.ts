/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalProfileService } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalService } from 'vs/workbench/contrib/terminal/browser/terminalService.membrane';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalLogService } from 'vs/platform/terminal/common/terminal';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminalInstanceService.membrane';
import { TerminalEditorService } from 'vs/workbench/contrib/terminal/browser/terminalEditorService';
import { TerminalGroupService } from 'vs/workbench/contrib/terminal/browser/terminalGroupService';
import { TerminalProfileService } from 'vs/workbench/contrib/terminal/browser/terminalProfileService.membrane';
import { TerminalLogService } from 'vs/platform/terminal/common/terminalLogService';

// Register services
registerSingleton(ITerminalLogService, TerminalLogService, InstantiationType.Delayed);
registerSingleton(ITerminalService, TerminalService, InstantiationType.Delayed);
registerSingleton(ITerminalEditorService, TerminalEditorService, InstantiationType.Delayed);
registerSingleton(ITerminalGroupService, TerminalGroupService, InstantiationType.Delayed);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, InstantiationType.Delayed);
registerSingleton(ITerminalProfileService, TerminalProfileService, InstantiationType.Delayed);
