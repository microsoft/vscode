/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
export class TerminalFindAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'terminal-find';
        this.type = "help" /* AccessibleViewType.Help */;
        this.when = TerminalContextKeys.findFocus;
    }
    getProvider(accessor) {
        const commandService = accessor.get(ICommandService);
        return new TerminalFindAccessibilityHelpProvider(commandService);
    }
}
class TerminalFindAccessibilityHelpProvider extends Disposable {
    constructor(_commandService) {
        super();
        this._commandService = _commandService;
        this.id = "terminalFindHelp" /* AccessibleViewProviderId.TerminalFindHelp */;
        this.verbositySettingKey = "accessibility.verbosity.find" /* AccessibilityVerbositySettingId.Find */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    onClose() {
        // The Escape key that closes the accessible help will also propagate
        // and close the terminal find widget. Re-open the find widget after
        // the Escape event has fully propagated through all handlers.
        setTimeout(() => {
            this._commandService.executeCommand("workbench.action.terminal.focusFind" /* TerminalFindCommandId.FindFocus */);
        }, 200);
    }
    provideContent() {
        const content = [];
        // Header
        content.push(localize('terminal.header', "Accessibility Help: Terminal Find"));
        content.push(localize('terminal.context', "You are in the Terminal Find input. This searches the entire terminal buffer: both the current output and the scrollback history."));
        content.push('');
        // Current Search Status
        content.push(localize('terminal.statusHeader', "Current Search Status:"));
        content.push(localize('terminal.statusDesc', "You are searching the terminal buffer."));
        content.push('');
        // Inside the Terminal Find Input
        content.push(localize('terminal.inputHeader', "Inside the Terminal Find Input (What It Does):"));
        content.push(localize('terminal.inputDesc', "While you are in the Terminal Find input, your focus stays in the field. You can type, edit your search term, or navigate matches without leaving the input. When you navigate to a match, the terminal scrolls to show it, but your focus remains in the Find input."));
        content.push('');
        // What You Hear
        content.push(localize('terminal.hearHeader', "What You Hear Each Time You Move to a Match:"));
        content.push(localize('terminal.hearDesc', "Each navigation step gives you a complete spoken update:"));
        content.push(localize('terminal.hear1', "1) The full line that contains the match is read first, so you get immediate context."));
        content.push(localize('terminal.hear2', "2) Your position among the matches is announced, so you know how far you are through the results."));
        content.push(localize('terminal.hear3', "3) The exact line and column are announced, so you know precisely where the match is in the buffer."));
        content.push('');
        // Focus Behavior
        content.push(localize('terminal.focusHeader', "Focus Behavior (Important):"));
        content.push(localize('terminal.focusDesc1', "When you navigate from the Terminal Find input, the terminal buffer updates in the background while your focus stays in the input. This is intentional, so you can keep refining your search without losing your place."));
        content.push(localize('terminal.focusDesc2', "The terminal automatically scrolls to show the match you navigate to."));
        content.push(localize('terminal.focusDesc3', "If you want to close Find and return focus to the terminal command line, press Escape. Focus moves to the command input at the bottom of the terminal."));
        content.push('');
        // Keyboard Navigation Summary
        content.push(localize('terminal.keyboardHeader', "Keyboard Navigation Summary:"));
        content.push('');
        content.push(localize('terminal.keyNavHeader', "While focused IN the Find input:"));
        content.push(localize('terminal.keyEnter', "- Enter: Move to the next match while staying in the Find input."));
        content.push(localize('terminal.keyShiftEnter', "- Shift+Enter: Move to the previous match while staying in the Find input."));
        content.push('');
        content.push(localize('terminal.keyNavNote', "Note: Terminal Find keeps focus in the Find input. If you need to return to the terminal command line, press Escape to close Find."));
        content.push('');
        // Find Options
        content.push(localize('terminal.optionsHeader', "Find Options:"));
        content.push(localize('terminal.optionCase', "- Match Case: Only exact case matches are included."));
        content.push(localize('terminal.optionWord', "- Whole Word: Only full words are matched."));
        content.push(localize('terminal.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
        content.push('');
        // Settings
        content.push(localize('terminal.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
        content.push(localize('terminal.settingsDesc', "Terminal Find has limited configuration options. Most behavior is controlled by the terminal itself."));
        content.push(localize('terminal.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Terminal Find input announces the Accessibility Help hint."));
        content.push('');
        // Closing
        content.push(localize('terminal.closingHeader', "Closing:"));
        content.push(localize('terminal.closingDesc', "Press Escape to close Terminal Find. Focus moves to the terminal command line, and your search history is available on next Find."));
        return content.join('\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxGaW5kQWNjZXNzaWJpbGl0eUhlbHAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvZmluZC9icm93c2VyL3Rlcm1pbmFsRmluZEFjY2Vzc2liaWxpdHlIZWxwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNyRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFJakQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFckYsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBR3RGLE1BQU0sT0FBTyw2QkFBNkI7SUFBMUM7UUFDVSxhQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ2YsU0FBSSxHQUFHLGVBQWUsQ0FBQztRQUN2QixTQUFJLHdDQUEyQjtRQUMvQixTQUFJLEdBQUcsbUJBQW1CLENBQUMsU0FBUyxDQUFDO0lBTS9DLENBQUM7SUFKQSxXQUFXLENBQUMsUUFBMEI7UUFDckMsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUNyRCxPQUFPLElBQUkscUNBQXFDLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDbEUsQ0FBQztDQUNEO0FBRUQsTUFBTSxxQ0FBc0MsU0FBUSxVQUFVO0lBSzdELFlBQ2tCLGVBQWdDO1FBRWpELEtBQUssRUFBRSxDQUFDO1FBRlMsb0JBQWUsR0FBZixlQUFlLENBQWlCO1FBTHpDLE9BQUUsc0VBQTZDO1FBQy9DLHdCQUFtQiw2RUFBd0M7UUFDM0QsWUFBTyxHQUEyQixFQUFFLElBQUksc0NBQXlCLEVBQUUsQ0FBQztJQU03RSxDQUFDO0lBRUQsT0FBTztRQUNO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