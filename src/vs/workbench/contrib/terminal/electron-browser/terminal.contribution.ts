/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ITerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/electron-browser/terminalInstanceService';
import { getSystemShell } from 'vs/workbench/contrib/terminal/node/terminal';
import { TerminalNativeService } from 'vs/workbench/contrib/terminal/electron-browser/terminalNativeService';
import { ITerminalNativeService } from 'vs/workbench/contrib/terminal/common/terminal';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { getTerminalShellConfiguration } from 'vs/workbench/contrib/terminal/common/terminalConfiguration';

// This file contains additional desktop-only contributions on top of those in browser/

// Register services
registerSingleton(ITerminalNativeService, TerminalNativeService, true);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, true);

// Register configurations
const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration(getTerminalShellConfiguration(getSystemShell));
