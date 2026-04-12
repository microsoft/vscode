/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize, localize2 } from '../../../../nls.js';
/**
 * An object holding strings shared by multiple parts of the terminal
 */
export const terminalStrings = {
    terminal: localize('terminal', "Terminal"),
    new: localize('terminal.new', "New Terminal"),
    doNotShowAgain: localize('doNotShowAgain', 'Do Not Show Again'),
    currentSessionCategory: localize('currentSessionCategory', 'current session'),
    previousSessionCategory: localize('previousSessionCategory', 'previous session'),
    typeTask: localize('task', "Task"),
    typeLocal: localize('local', "Local"),
    actionCategory: localize2('terminalCategory', "Terminal"),
    focus: localize2('workbench.action.terminal.focus', "Focus Terminal"),
    focusInstance: localize2('workbench.action.terminal.focusInstance', "Focus Terminal"),
    focusAndHideAccessibleBuffer: localize2('workbench.action.terminal.focusAndHideAccessibleBuffer', "Focus Terminal and Hide Accessible Buffer"),
    kill: {
        ...localize2('killTerminal', "Kill Terminal"),
        short: localize('killTerminal.short', "Kill"),
    },
    moveToEditor: localize2('moveToEditor', "Move Terminal into Editor Area"),
    moveIntoNewWindow: localize2('moveIntoNewWindow', "Move Terminal into New Window"),
    newInNewWindow: localize2('newInNewWindow', "New Terminal Window"),
    moveToTerminalPanel: localize2('workbench.action.terminal.moveToTerminalPanel', "Move Terminal into Panel"),
    changeIcon: localize2('workbench.action.terminal.changeIcon', "Change Icon..."),
    changeColor: localize2('workbench.action.terminal.changeColor', "Change Color..."),
    split: {
        ...localize2('splitTerminal', "Split Terminal"),
        short: localize('splitTerminal.short', "Split"),
    },
    unsplit: localize2('unsplitTerminal', "Unsplit Terminal"),
    rename: localize2('workbench.action.terminal.rename', "Rename..."),
    toggleSizeToContentWidth: localize2('workbench.action.terminal.sizeToContentWidthInstance', "Toggle Size to Content Width"),
    focusHover: localize2('workbench.action.terminal.focusHover', "Focus Hover"),
    newWithCwd: localize2('workbench.action.terminal.newWithCwd', "Create New Terminal Starting in a Custom Working Directory"),
    renameWithArgs: localize2('workbench.action.terminal.renameWithArg', "Rename the Currently Active Terminal"),
    scrollToPreviousCommand: localize2('workbench.action.terminal.scrollToPreviousCommand', "Scroll to Previous Command"),
    scrollToNextCommand: localize2('workbench.action.terminal.scrollToNextCommand', "Scroll to Next Command"),
    revealCommand: localize2('workbench.action.terminal.revealCommand', "Reveal Command in Terminal"),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdHJpbmdzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXpEOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFHO0lBQzlCLFFBQVEsRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FBQztJQUMxQyxHQUFHLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSxjQUFjLENBQUM7SUFDN0MsY0FBYyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxtQkFBbUIsQ0FBQztJQUMvRCxzQkFBc0IsRUFBRSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsaUJBQWlCLENBQUM7SUFDN0UsdUJBQXVCLEVBQUUsUUFBUSxDQUFDLHlCQUF5QixFQUFFLGtCQUFrQixDQUFDO0lBQ2hGLFFBQVEsRUFBRSxRQUFRLENBQUMsTUFBTSxFQUFFLE1BQU0sQ0FBQztJQUNsQyxTQUFTLEVBQUUsUUFBUSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUM7SUFDckMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxVQUFVLENBQUM7SUFDekQsS0FBSyxFQUFFLFNBQVMsQ0FBQyxpQ0FBaUMsRUFBRSxnQkFBZ0IsQ0FBQztJQUNyRSxhQUFhLEVBQUUsU0FBUyxDQUFDLHlDQUF5QyxFQUFFLGdCQUFnQixDQUFDO0lBQ3JGLDRCQUE0QixFQUFFLFNBQVMsQ0FBQyx3REFBd0QsRUFBRSwyQ0FBMkMsQ0FBQztJQUM5SSxJQUFJLEVBQUU7UUFDTCxHQUFHLFNBQVMsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDO1FBQzdDLEtBQUssRUFBRSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxDQUFDO0tBQzdDO0lBQ0QsWUFBWSxFQUFFLFNBQVMsQ0FBQyxjQUFjLEVBQUUsZ0NBQWdDLENBQUM7SUFDekUsaUJBQWlCLEVBQUUsU0FBUyxDQUFDLG1CQUFtQixFQUFFLCtCQUErQixDQUFDO0lBQ2xGLGNBQWMsRUFBRSxTQUFTLENBQUMsZ0JBQWdCLEVBQUUscUJBQXFCLENBQUM7SUFDbEUsbUJBQW1CLEVBQUUsU0FBUyxDQUFDLCtDQUErQyxFQUFFLDBCQUEwQixDQUFDO0lBQzNHLFVBQVUsRUFBRSxTQUFTLENBQUMsc0NBQXNDLEVBQUUsZ0JBQWdCLENBQUM7SUFDL0UsV0FBVyxFQUFFLFNBQVMsQ0FBQyx1Q0FBdUMsRUFBRSxpQkFBaUIsQ0FBQztJQUNsRixLQUFLLEVBQUU7UUFDTixHQUFHLFNBQVMsQ0FBQyxlQUFlLEVBQUUsZ0JBQWdCLENBQUM7UUFDL0MsS0FBSyxFQUFFLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxPQUFPLENBQUM7S0FDL0M7SUFDRCxPQUFPLEVBQUUsU0FBUyxDQUFDLGlCQUFpQixFQUFFLGtCQUFrQixDQUFDO0lBQ3pELE1BQU0sRUFBRSxTQUFTLENBQUMsa0NBQWtDLEVBQUUsV0FBVyxDQUFDO0lBQ2xFLHdCQUF3QixFQUFFLFNBQVMsQ0FBQyxzREFBc0QsRUFBRSw4QkFBOEIsQ0FBQztJQUMzSCxVQUFVLEVBQUUsU0FBUyxDQUFDLHNDQUFzQyxFQUFFLGFBQWEsQ0FBQztJQUM1RSxVQUFVLEVBQUUsU0FBUyxDQUFDLHNDQUFzQyxFQUFFLDREQUE0RCxDQUFDO0lBQzNILGNBQWMsRUFBRSxTQUFTLENBQUMseUNBQXlDLEVBQUUsc0NBQXNDLENBQUM7SUFDNUcsdUJBQXVCLEVBQUUsU0FBUyxDQUFDLG1EQUFtRCxFQUFFLDRCQUE0QixDQUFDO0lBQ3JILG1CQUFtQixFQUFFLFNBQVMsQ0FBQywrQ0FBK0MsRUFBRSx3QkFBd0IsQ0FBQztJQUN6RyxhQUFhLEVBQUUsU0FBUyxDQUFDLHlDQUF5QyxFQUFFLDRCQUE0QixDQUFDO0NBQ2pHLENBQUMifQ==