/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITerminalProfileResolverService, TERMINAL_COMMAND_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { getNoDefaultTerminalShellConfiguration } from 'vs/workbench/contrib/terminal/common/terminalConfiguration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { BrowserTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/browser/terminalProfileResolverService';

registerSingleton(ITerminalProfileResolverService, BrowserTerminalProfileResolverService, true);

// Desktop shell configuration are registered in electron-browser as their default values rely
// on process.env
const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
configurationRegistry.registerConfiguration(getNoDefaultTerminalShellConfiguration());

// Register standard external terminal keybinding as integrated terminal when in web as the
// external terminal is not available
KeybindingsRegistry.registerKeybindingRule({
	id: TERMINAL_COMMAND_ID.NEW,
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C
});
