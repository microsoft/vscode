/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from './webview.js';
export class WebviewFindAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'webview-find';
        this.type = "help" /* AccessibleViewType.Help */;
        this.when = KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED;
    }
    getProvider(accessor) {
        return new WebviewFindAccessibilityHelpProvider();
    }
}
class WebviewFindAccessibilityHelpProvider extends Disposable {
    constructor() {
        super(...arguments);
        this.id = "webviewFindHelp" /* AccessibleViewProviderId.WebviewFindHelp */;
        this.verbositySettingKey = "accessibility.verbosity.find" /* AccessibilityVerbositySettingId.Find */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    onClose() {
        // Focus will remain on webview
    }
    provideContent() {
        const content = [];
        // Header
        content.push(localize('webview.header', "Accessibility Help: Webview Find"));
        content.push(localize('webview.context', "You are in the Find input for embedded web content. This could be a Markdown preview, a documentation viewer, or a web-based extension interface."));
        content.push('');
        // Current Search Status
        content.push(localize('webview.statusHeader', "Current Search Status:"));
        content.push(localize('webview.statusDesc', "You are searching the web content."));
        content.push('');
        // Inside the Webview Find Input
        content.push(localize('webview.inputHeader', "Inside the Webview Find Input (What It Does):"));
        content.push(localize('webview.inputDesc', "While you are in the Find input, your focus stays in the field. You can type, edit your search term, or navigate matches without leaving the input. When you navigate to a match, the webview updates to show it, but your focus remains in the Find input."));
        content.push('');
        // What You Hear
        content.push(localize('webview.hearHeader', "What You Hear Each Time You Move to a Match:"));
        content.push(localize('webview.hearDesc', "Each navigation step gives you a complete spoken update:"));
        content.push(localize('webview.hear1', "1) The content containing the match is read first, so you get immediate context."));
        content.push(localize('webview.hear2', "2) Your position among the matches is announced, so you know how far you are through the results."));
        content.push(localize('webview.hear3', "3) The exact location information is announced so you know where the match is."));
        content.push('');
        // Focus Behavior
        content.push(localize('webview.focusHeader', "Focus Behavior (Important):"));
        content.push(localize('webview.focusDesc1', "When you navigate from the Webview Find input, the content updates in the background while your focus stays in the input. This is intentional, so you can keep refining your search without losing your place."));
        content.push(localize('webview.focusDesc2', "The webview may scroll to show the match, depending on how it is designed."));
        content.push(localize('webview.focusDesc3', "If you want to close Find and return focus to the webview content, press Escape. Focus moves back into the webview."));
        content.push('');
        // Keyboard Navigation Summary
        content.push(localize('webview.keyboardHeader', "Keyboard Navigation Summary:"));
        content.push('');
        content.push(localize('webview.keyNavHeader', "While focused IN the Find input:"));
        content.push(localize('webview.keyEnter', "- Enter: Move to the next match while staying in the Find input."));
        content.push(localize('webview.keyShiftEnter', "- Shift+Enter: Move to the previous match while staying in the Find input."));
        content.push('');
        // Find Options
        content.push(localize('webview.optionsHeader', "Find Options:"));
        content.push(localize('webview.optionCase', "- Match Case: Only exact case matches are included."));
        content.push(localize('webview.optionWord', "- Whole Word: Only full words are matched."));
        content.push(localize('webview.optionRegex', "- Regular Expression: Use pattern matching for advanced searches."));
        content.push('');
        // Important About Webviews
        content.push(localize('webview.importantHeader', "Important About Webviews:"));
        content.push(localize('webview.importantDesc', "Some webviews intercept keyboard input before VS Code's Find can use it. If Enter or Shift+Enter do not navigate matches, the webview may be handling those keys. Try clicking or tabbing into the webview content first to ensure the webview has focus, then reopen Find and try navigation again."));
        content.push('');
        // Settings
        content.push(localize('webview.settingsHeader', "Settings You Can Adjust ({0} opens Settings):", '<keybinding:workbench.action.openSettings>'));
        content.push(localize('webview.settingsDesc', "Webview Find has minimal configuration. Most behavior depends on the webview itself."));
        content.push(localize('webview.settingVerbosity', "- `accessibility.verbosity.find`: Controls whether the Webview Find input announces the Accessibility Help hint."));
        content.push('');
        // Closing
        content.push(localize('webview.closingHeader', "Closing:"));
        content.push(localize('webview.closingDesc', "Press Escape to close Webview Find. Focus moves back into the webview content, and your search history is available on next Find."));
        return content.join('\n');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vidmlld0ZpbmRBY2Nlc3NpYmlsaXR5SGVscC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci93ZWJ2aWV3RmluZEFjY2Vzc2liaWxpdHlIZWxwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFJOUMsT0FBTyxFQUFFLDhDQUE4QyxFQUFFLE1BQU0sY0FBYyxDQUFDO0FBRzlFLE1BQU0sT0FBTyw0QkFBNEI7SUFBekM7UUFDVSxhQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ2YsU0FBSSxHQUFHLGNBQWMsQ0FBQztRQUN0QixTQUFJLHdDQUEyQjtRQUMvQixTQUFJLEdBQUcsOENBQThDLENBQUM7SUFLaEUsQ0FBQztJQUhBLFdBQVcsQ0FBQyxRQUEwQjtRQUNyQyxPQUFPLElBQUksb0NBQW9DLEVBQUUsQ0FBQztJQUNuRCxDQUFDO0NBQ0Q7QUFFRCxNQUFNLG9DQUFxQyxTQUFRLFVBQVU7SUFBN0Q7O1FBQ1UsT0FBRSxvRUFBNEM7UUFDOUMsd0JBQW1CLDZFQUF3QztRQUMzRCxZQUFPLEdBQTJCLEVBQUUsSUFBSSxzQ0FBeUIsRUFBRSxDQUFDO0lBdUU5RSxDQUFDO0lBckVBLE9BQU87UUFDTiwrQkFBK0I7SUFDaEMsQ0FBQztJQUVELGNBQWM7UUFDYixNQUFNLE9BQU8sR0FBYSxFQUFFLENBQUM7UUFFN0IsU0FBUztRQUNULE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixFQUFFLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztRQUM3RSxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxtSkFBbUos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