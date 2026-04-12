/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { Extensions as QuickAccessExtensions } from '../../../../../platform/quickinput/common/quickAccess.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { getQuickNavigateHandler } from '../../../../browser/quickaccess.js';
import { registerTerminalAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { TerminalQuickAccessProvider } from '../../../terminalContrib/quickAccess/browser/terminalQuickAccess.js';
var TerminalQuickAccessCommandId;
(function (TerminalQuickAccessCommandId) {
    TerminalQuickAccessCommandId["QuickOpenTerm"] = "workbench.action.quickOpenTerm";
})(TerminalQuickAccessCommandId || (TerminalQuickAccessCommandId = {}));
const quickAccessRegistry = (Registry.as(QuickAccessExtensions.Quickaccess));
const inTerminalsPicker = 'inTerminalPicker';
quickAccessRegistry.registerQuickAccessProvider({
    ctor: TerminalQuickAccessProvider,
    prefix: TerminalQuickAccessProvider.PREFIX,
    contextKey: inTerminalsPicker,
    placeholder: nls.localize('tasksQuickAccessPlaceholder', "Type the name of a terminal to open."),
    helpEntries: [{ description: nls.localize('tasksQuickAccessHelp', "Show All Opened Terminals"), commandId: "workbench.action.quickOpenTerm" /* TerminalQuickAccessCommandId.QuickOpenTerm */ }]
});
const quickAccessNavigateNextInTerminalPickerId = 'workbench.action.quickOpenNavigateNextInTerminalPicker';
CommandsRegistry.registerCommand({ id: quickAccessNavigateNextInTerminalPickerId, handler: getQuickNavigateHandler(quickAccessNavigateNextInTerminalPickerId, true) });
const quickAccessNavigatePreviousInTerminalPickerId = 'workbench.action.quickOpenNavigatePreviousInTerminalPicker';
CommandsRegistry.registerCommand({ id: quickAccessNavigatePreviousInTerminalPickerId, handler: getQuickNavigateHandler(quickAccessNavigatePreviousInTerminalPickerId, false) });
registerTerminalAction({
    id: "workbench.action.quickOpenTerm" /* TerminalQuickAccessCommandId.QuickOpenTerm */,
    title: nls.localize2('quickAccessTerminal', 'Switch Active Terminal'),
    precondition: ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    run: (c, accessor) => accessor.get(IQuickInputService).quickAccess.show(TerminalQuickAccessProvider.PREFIX)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwucXVpY2tBY2Nlc3MuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3F1aWNrQWNjZXNzL2Jyb3dzZXIvdGVybWluYWwucXVpY2tBY2Nlc3MuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sdUJBQXVCLENBQUM7QUFDN0MsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdkYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBd0IsVUFBVSxJQUFJLHFCQUFxQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDckksT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBRWxILElBQVcsNEJBRVY7QUFGRCxXQUFXLDRCQUE0QjtJQUN0QyxnRkFBZ0QsQ0FBQTtBQUNqRCxDQUFDLEVBRlUsNEJBQTRCLEtBQTVCLDRCQUE0QixRQUV0QztBQUVELE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUF1QixxQkFBcUIsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO0FBQ25HLE1BQU0saUJBQWlCLEdBQUcsa0JBQWtCLENBQUM7QUFDN0MsbUJBQW1CLENBQUMsMkJBQTJCLENBQUM7SUFDL0MsSUFBSSxFQUFFLDJCQUEyQjtJQUNqQyxNQUFNLEVBQUUsMkJBQTJCLENBQUMsTUFBTTtJQUMxQyxVQUFVLEVBQUUsaUJBQWlCO0lBQzdCLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHNDQUFzQyxDQUFDO0lBQ2hHLFdBQVcsRUFBRSxDQUFDLEVBQUUsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsMkJBQTJCLENBQUMsRUFBRSxTQUFTLG1GQUE0QyxFQUFFLENBQUM7Q0FDeEosQ0FBQyxDQUFDO0FBQ0gsTUFBTSx5Q0FBeUMsR0FBRyx3REFBd0QsQ0FBQztBQUMzRyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsRUFBRSxFQUFFLEVBQUUseUNBQXlDLEVBQUUsT0FBTyxFQUFFLHVCQUF1QixDQUFDLHlDQUF5QyxFQUFFLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN2SyxNQUFNLDZDQUE2QyxHQUFHLDREQUE0RCxDQUFDO0FBQ25ILGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxFQUFFLEVBQUUsRUFBRSw2Q0FBNkMsRUFBRSxPQUFPLEVBQUUsdUJBQXVCLENBQUMsNkNBQTZDLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRWhMLHNCQUFzQixDQUFDO0lBQ3RCLEVBQUUsbUZBQTRDO0lBQzlDLEtBQUssRUFBRSxHQUFHLENBQUMsU0FBUyxDQUFDLHFCQUFxQixFQUFFLHdCQUF3QixDQUFDO0lBQ3JFLFlBQVksRUFBRSxjQUFjLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLGdCQUFnQixFQUFFLG1CQUFtQixDQUFDLHNCQUFzQixDQUFDO0lBQ2pILEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxRQUFRLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLE1BQU0sQ0FBQztDQUMzRyxDQUFDLENBQUMifQ==