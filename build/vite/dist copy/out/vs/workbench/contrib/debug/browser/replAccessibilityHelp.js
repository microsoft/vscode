/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { getReplView } from './repl.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { localize } from '../../../../nls.js';
import { CONTEXT_IN_DEBUG_REPL } from '../common/debug.js';
export class ReplAccessibilityHelp {
    constructor() {
        this.priority = 120;
        this.name = 'replHelp';
        this.when = ContextKeyExpr.or(ContextKeyExpr.equals('focusedView', 'workbench.panel.repl.view'), CONTEXT_IN_DEBUG_REPL);
        this.type = "help" /* AccessibleViewType.Help */;
    }
    getProvider(accessor) {
        const viewsService = accessor.get(IViewsService);
        const replView = getReplView(viewsService);
        if (!replView) {
            return undefined;
        }
        return new ReplAccessibilityHelpProvider(replView);
    }
}
class ReplAccessibilityHelpProvider extends Disposable {
    constructor(_replView) {
        super();
        this._replView = _replView;
        this.id = "replHelp" /* AccessibleViewProviderId.ReplHelp */;
        this.verbositySettingKey = "accessibility.verbosity.find" /* AccessibilityVerbositySettingId.Find */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    onClose() {
        this._replView.focusFilter();
    }
    provideContent() {
        const content = [];
        // Header
        content.push(localize('repl.header', "Accessibility Help: Debug Console Filter"));
        content.push(localize('repl.context', "You are in the Debug Console filter input. This is a filter that instantly hides console messages that do not match your filter, showing only the messages you want to see."));
        content.push('');
        // Current Filter Status
        content.push(localize('repl.statusHeader', "Current Filter Status:"));
        content.push(localize('repl.statusDesc', "You are filtering the console output."));
        content.push('');
        // Inside the Filter Input
        content.push(localize('repl.inputHeader', "Inside the Filter Input (What It Does):"));
        content.push(localize('repl.inputDesc', "While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input. As you type, the console instantly updates to show only messages matching your filter."));
        content.push('');
        // What Happens When You Filter
        content.push(localize('repl.filterHeader', "What Happens When You Filter:"));
        content.push(localize('repl.filterDesc', "Each time you change the filter text, the console instantly regenerates to show only matching messages. Your screen reader announces how many messages are now visible. This is live feedback: text searches console output, variable values, and log messages."));
        content.push('');
        // Focus Behavior
        content.push(localize('repl.focusHeader', "Focus Behavior (Important):"));
        content.push(localize('repl.focusDesc1', "Your focus stays in the filter input while the console updates in the background. This is intentional, so you can keep typing without losing your place."));
        content.push(localize('repl.focusDesc2', "If you want to review the filtered console output, press Down Arrow to move focus from the filter into the console messages above."));
        content.push(localize('repl.focusDesc3', "Important: The console input area is at the bottom of the console, separate from the filter. To evaluate expressions, navigate to the console input (after the filtered messages) and type your expression."));
        content.push('');
        // Distinguishing Filter from Console Input
        content.push(localize('repl.distinguishHeader', "Distinguishing Filter from Console Input:"));
        content.push(localize('repl.distinguishFilter', "The filter input is where you are now. It hides or shows messages without running code."));
        content.push(localize('repl.distinguishConsole', "The console input is at the bottom of the console, after all displayed messages. That is where you type and press Enter to evaluate expressions during debugging."));
        content.push(localize('repl.distinguishSwitch', "To switch to the console input and evaluate an expression, use {0} to focus the console input.", '<keybinding:workbench.panel.repl.view.focus>'));
        content.push('');
        // Filter Syntax
        content.push(localize('repl.syntaxHeader', "Filter Syntax and Patterns:"));
        content.push(localize('repl.syntaxText', "- Type text: Shows only messages containing that text."));
        content.push(localize('repl.syntaxExclude', "- !text (exclude): Hides messages containing the text, showing all others."));
        content.push('');
        // Keyboard Navigation Summary
        content.push(localize('repl.keyboardHeader', "Keyboard Navigation Summary:"));
        content.push(localize('repl.keyDown', "- Down Arrow: Move focus from filter into the console output."));
        content.push(localize('repl.keyTab', "- Tab: Move to other console controls if available."));
        content.push(localize('repl.keyEscape', "- Escape: Clear the filter or close the filter."));
        content.push(localize('repl.keyFocus', "- {0}: Focus the console input to evaluate expressions.", '<keybinding:workbench.panel.repl.view.focus>'));
        content.push('');
        // Settings
        content.push(localize('repl.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
        content.push(localize('repl.settingsIntro', "These settings affect the Debug Console."));
        content.push(localize('repl.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint."));
        content.push(localize('repl.settingCloseOnEnd', "- `debug.console.closeOnEnd`: Automatically close the Debug Console when the debugging session ends."));
        content.push(localize('repl.settingFontSize', "- `debug.console.fontSize`: Font size in the console."));
        content.push(localize('repl.settingFontFamily', "- `debug.console.fontFamily`: Font family in the console."));
        content.push(localize('repl.settingWordWrap', "- `debug.console.wordWrap`: Wrap lines in the console."));
        content.push(localize('repl.settingHistory', "- `debug.console.historySuggestions`: Suggest previously typed input."));
        content.push(localize('repl.settingCollapse', "- `debug.console.collapseIdenticalLines`: Collapse repeated messages with a count."));
        content.push(localize('repl.settingMaxLines', "- `debug.console.maximumLines`: Maximum number of messages to keep in the console."));
        content.push('');
        // Closing
        content.push(localize('repl.closingHeader', "Closing:"));
        content.push(localize('repl.closingDesc', "Press Escape to clear the filter, or close the Debug Console. Your filter text is preserved if you reopen the console."));
        return content.join('\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEFjY2Vzc2liaWxpdHlIZWxwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZGVidWcvYnJvd3Nlci9yZXBsQWNjZXNzaWJpbGl0eUhlbHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFLaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFRLE1BQU0sV0FBVyxDQUFDO0FBQzlDLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUUvRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFM0QsTUFBTSxPQUFPLHFCQUFxQjtJQUFsQztRQUNDLGFBQVEsR0FBRyxHQUFHLENBQUM7UUFDZixTQUFJLEdBQUcsVUFBVSxDQUFDO1FBQ2xCLFNBQUksR0FBRyxjQUFjLENBQUMsRUFBRSxDQUN2QixjQUFjLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSwyQkFBMkIsQ0FBQyxFQUNqRSxxQkFBcUIsQ0FDckIsQ0FBQztRQUNGLFNBQUksd0NBQStDO0lBU3BELENBQUM7SUFSQSxXQUFXLENBQUMsUUFBMEI7UUFDckMsTUFBTSxZQUFZLEdBQUcsUUFBUSxDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNqRCxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTyxTQUFTLENBQUM7UUFDbEIsQ0FBQztRQUNELE9BQU8sSUFBSSw2QkFBNkIsQ0FBQyxRQUFRLENB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