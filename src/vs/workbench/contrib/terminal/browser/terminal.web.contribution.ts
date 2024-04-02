/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingWeight, KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ITerminalProfileResolverService, TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { BrowserTerminalProfileResolverService } from 'vs/workbench/contrib/terminal/browser/terminalProfileResolverService';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';

registerSingleton(ITerminalProfileResolverService, BrowserTerminalProfileResolverService, InstantiationType.Delayed);

// Register standard external terminal keybinding as integrated terminal when in web as the
// external terminal is not available
KeybindingsRegistry.registerKeybindingRule({
	id: TerminalCommandId.New,
	weight: KeybindingWeight.WorkbenchContrib,
	when: TerminalContextKeys.notFocus,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyC
});
