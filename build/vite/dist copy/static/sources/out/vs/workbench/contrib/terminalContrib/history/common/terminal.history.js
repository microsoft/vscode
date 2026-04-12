/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
export var TerminalHistoryCommandId;
(function (TerminalHistoryCommandId) {
    TerminalHistoryCommandId["ClearPreviousSessionHistory"] = "workbench.action.terminal.clearPreviousSessionHistory";
    TerminalHistoryCommandId["GoToRecentDirectory"] = "workbench.action.terminal.goToRecentDirectory";
    TerminalHistoryCommandId["RunRecentCommand"] = "workbench.action.terminal.runRecentCommand";
})(TerminalHistoryCommandId || (TerminalHistoryCommandId = {}));
export const defaultTerminalHistoryCommandsToSkipShell = [
    "workbench.action.terminal.goToRecentDirectory" /* TerminalHistoryCommandId.GoToRecentDirectory */,
    "workbench.action.terminal.runRecentCommand" /* TerminalHistoryCommandId.RunRecentCommand */
];
export var TerminalHistorySettingId;
(function (TerminalHistorySettingId) {
    TerminalHistorySettingId["ShellIntegrationCommandHistory"] = "terminal.integrated.shellIntegration.history";
})(TerminalHistorySettingId || (TerminalHistorySettingId = {}));
export const terminalHistoryConfiguration = {
    ["terminal.integrated.shellIntegration.history" /* TerminalHistorySettingId.ShellIntegrationCommandHistory */]: {
        restricted: true,
        markdownDescription: localize('terminal.integrated.shellIntegration.history', "Controls the number of recently used commands to keep in the terminal command history. Set to 0 to disable terminal command history."),
        type: 'number',
        default: 100
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWwuaGlzdG9yeS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9oaXN0b3J5L2NvbW1vbi90ZXJtaW5hbC5oaXN0b3J5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUdqRCxNQUFNLENBQU4sSUFBa0Isd0JBSWpCO0FBSkQsV0FBa0Isd0JBQXdCO0lBQ3pDLGlIQUFxRixDQUFBO0lBQ3JGLGlHQUFxRSxDQUFBO0lBQ3JFLDJGQUErRCxDQUFBO0FBQ2hFLENBQUMsRUFKaUIsd0JBQXdCLEtBQXhCLHdCQUF3QixRQUl6QztBQUVELE1BQU0sQ0FBQyxNQUFNLHlDQUF5QyxHQUFHOzs7Q0FHeEQsQ0FBQztBQUVGLE1BQU0sQ0FBTixJQUFrQix3QkFFakI7QUFGRCxXQUFrQix3QkFBd0I7SUFDekMsMkdBQStFLENBQUE7QUFDaEYsQ0FBQyxFQUZpQix3QkFBd0IsS0FBeEIsd0JBQXdCLFFBRXpDO0FBRUQsTUFBTSxDQUFDLE1BQU0sNEJBQTRCLEdBQW9EO0lBQzVGLDhHQUF5RCxFQUFFO1FBQzFELFVBQVUsRUFBRSxJQUFJO1FBQ2hCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyw4Q0FBOEMsRUFBRSxzSUFBc0ksQ0FBQztRQUNyTixJQUFJLEVBQUUsUUFBUTtRQUNkLE9BQU8sRUFBRSxHQUFHO0tBQ1o7Q0FDRCxDQUFDIn0=