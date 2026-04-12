/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
export var TerminalStickyScrollSettingId;
(function (TerminalStickyScrollSettingId) {
    TerminalStickyScrollSettingId["Enabled"] = "terminal.integrated.stickyScroll.enabled";
    TerminalStickyScrollSettingId["MaxLineCount"] = "terminal.integrated.stickyScroll.maxLineCount";
    TerminalStickyScrollSettingId["IgnoredCommands"] = "terminal.integrated.stickyScroll.ignoredCommands";
})(TerminalStickyScrollSettingId || (TerminalStickyScrollSettingId = {}));
export const terminalStickyScrollConfiguration = {
    ["terminal.integrated.stickyScroll.enabled" /* TerminalStickyScrollSettingId.Enabled */]: {
        markdownDescription: localize('stickyScroll.enabled', "Shows the current command at the top of the terminal. This feature requires [shell integration]({0}) to be activated. See {1}.", 'https://code.visualstudio.com/docs/terminal/shell-integration', `\`#${"terminal.integrated.shellIntegration.enabled" /* TerminalSettingId.ShellIntegrationEnabled */}#\``),
        type: 'boolean',
        default: true
    },
    ["terminal.integrated.stickyScroll.maxLineCount" /* TerminalStickyScrollSettingId.MaxLineCount */]: {
        markdownDescription: localize('stickyScroll.maxLineCount', "Defines the maximum number of sticky lines to show. Sticky scroll lines will never exceed 40% of the viewport regardless of this setting."),
        type: 'number',
        default: 5,
        minimum: 1,
        maximum: 10
    },
    ["terminal.integrated.stickyScroll.ignoredCommands" /* TerminalStickyScrollSettingId.IgnoredCommands */]: {
        markdownDescription: localize('stickyScroll.ignoredCommands', "A list of commands that should not trigger sticky scroll. When a command from this list is detected, the sticky scroll overlay will be hidden."),
        type: 'array',
        items: {
            type: 'string'
        },
        default: [
            'clear',
            'cls',
            'clear-host',
            'copilot',
            'claude',
            'codex',
            'gemini'
        ]
    },
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxTdGlja3lTY3JvbGxDb25maWd1cmF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3N0aWNreVNjcm9sbC9jb21tb24vdGVybWluYWxTdGlja3lTY3JvbGxDb25maWd1cmF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUlqRCxNQUFNLENBQU4sSUFBa0IsNkJBSWpCO0FBSkQsV0FBa0IsNkJBQTZCO0lBQzlDLHFGQUFvRCxDQUFBO0lBQ3BELCtGQUE4RCxDQUFBO0lBQzlELHFHQUFvRSxDQUFBO0FBQ3JFLENBQUMsRUFKaUIsNkJBQTZCLEtBQTdCLDZCQUE2QixRQUk5QztBQVFELE1BQU0sQ0FBQyxNQUFNLGlDQUFpQyxHQUFvRDtJQUNqRyx3RkFBdUMsRUFBRTtRQUN4QyxtQkFBbUIsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsZ0lBQWdJLEVBQUUsK0RBQStELEVBQUUsTUFBTSw4RkFBeUMsS0FBSyxDQUFDO1FBQzlTLElBQUksRUFBRSxTQUFTO1FBQ2YsT0FBTyxFQUFFLElBQUk7S0FDYjtJQUNELGtHQUE0QyxFQUFFO1FBQzdDLG1CQUFtQixFQUFFLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSwySUFBMkksQ0FBQztRQUN2TSxJQUFJLEVBQUUsUUFBUTtRQUNkLE9BQU8sRUFBRSxDQUFDO1FBQ1YsT0FBTyxFQUFFLENBQUM7UUFDVixPQUFPLEVBQUUsRUFBRTtLQUNYO0lBQ0Qsd0dBQStDLEVBQUU7UUFDaEQsbUJBQW1CLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGdKQUFnSixDQUFDO1FBQy9NLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7U0FDZDtRQUNELE9BQU8sRUFBRTtZQUNSLE9BQU87WUFDUCxLQUFLO1lBQ0wsWUFBWTtZQUNaLFNBQVM7WUFDVCxRQUFRO1lBQ1IsT0FBTztZQUNQLFFBQVE7U0FDUjtLQUNEO0NBQ0QsQ0FBQyJ9