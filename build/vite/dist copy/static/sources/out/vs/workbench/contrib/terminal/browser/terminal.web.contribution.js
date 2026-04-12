/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ITerminalProfileResolverService } from '../common/terminal.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { BrowserTerminalProfileResolverService } from './terminalProfileResolverService.js';
import { TerminalContextKeys } from '../common/terminalContextKey.js';
registerSingleton(ITerminalProfileResolverService, BrowserTerminalProfileResolverService, 1 /* InstantiationType.Delayed */);
// Register standard external terminal keybinding as integrated terminal when in web as the
// external terminal is not available
KeybindingsRegistry.registerKeybindingRule({
    id: "workbench.action.terminal.new" /* TerminalCommandId.New */,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: TerminalContextKeys.notFocus,
    primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 33 /* KeyCode.KeyC */
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwud2ViLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwud2ViLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQW9CLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLCtCQUErQixFQUFxQixNQUFNLHVCQUF1QixDQUFDO0FBQzNGLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUscUNBQXFDLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUV0RSxpQkFBaUIsQ0FBQywrQkFBK0IsRUFBRSxxQ0FBcUMsb0NBQTRCLENBQUM7QUFFckgsMkZBQTJGO0FBQzNGLHFDQUFxQztBQUNyQyxtQkFBbUIsQ0FBQyxzQkFBc0IsQ0FBQztJQUMxQyxFQUFFLDZEQUF1QjtJQUN6QixNQUFNLDZDQUFtQztJQUN6QyxJQUFJLEVBQUUsbUJBQW1CLENBQUMsUUFBUTtJQUNsQyxPQUFPLEVBQUUsbURBQTZCLHdCQUFlO0NBQ3JELENBQUMsQ0FBQyJ9