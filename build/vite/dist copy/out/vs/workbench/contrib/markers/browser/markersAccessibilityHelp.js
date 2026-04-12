/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import * as nls from '../../../../nls.js';
import { MarkersContextKeys } from '../common/markers.js';
export class ProblemsAccessibilityHelp {
    constructor() {
        this.type = "help" /* AccessibleViewType.Help */;
        this.priority = 105;
        this.name = 'problemsFilter';
        this.when = MarkersContextKeys.MarkerViewFilterFocusContextKey;
    }
    getProvider(accessor) {
        return new ProblemsAccessibilityHelpProvider(accessor.get(IKeybindingService));
    }
}
class ProblemsAccessibilityHelpProvider extends Disposable {
    constructor(_keybindingService) {
        super();
        this._keybindingService = _keybindingService;
        this.id = "problemsFilterHelp" /* AccessibleViewProviderId.ProblemsFilterHelp */;
        this.verbositySettingKey = "accessibility.verbosity.find" /* AccessibilityVerbositySettingId.Find */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    provideContent() {
        const lines = [];
        // Header
        lines.push(nls.localize('problems.header', 'Accessibility Help: Problems Panel Filter'));
        lines.push(nls.localize('problems.context', 'You are in the Problems panel filter input. This is a filter, not a navigating search. It instantly hides problems that do not match your filter, showing only the problems you want to see.'));
        lines.push('');
        // Current Filter Status
        lines.push(nls.localize('problems.statusHeader', 'Current Filter Status:'));
        lines.push(nls.localize('problems.statusDesc', 'You are filtering the problems.'));
        lines.push('');
        // Inside the Filter Input
        lines.push(nls.localize('problems.inputHeader', 'Inside the Filter Input (What It Does):'));
        lines.push(nls.localize('problems.inputDesc', 'While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input. As you type, the Problems panel instantly updates to show only problems matching your filter.'));
        lines.push('');
        // What Happens When You Filter
        lines.push(nls.localize('problems.filterHeader', 'What Happens When You Filter:'));
        lines.push(nls.localize('problems.filterDesc1', 'Each time you change the filter text, the panel instantly regenerates to show only matching problems. Your screen reader announces how many problems are now visible. This is live feedback: as you type or delete characters, the displayed problems update immediately.'));
        lines.push(nls.localize('problems.filterDesc2', 'The panel searches problem messages, file names, and error codes, so you can filter by any of these details.'));
        lines.push('');
        // Focus Behavior
        lines.push(nls.localize('problems.focusHeader', 'Focus Behavior (Important):'));
        lines.push(nls.localize('problems.focusDesc1', 'Your focus stays in the filter input while the panel updates in the background. This is intentional, so you can keep typing without losing your place.'));
        lines.push(nls.localize('problems.focusDesc2', 'If you want to navigate the filtered problems, press Down Arrow to move focus from the filter into the problems list below.'));
        lines.push(nls.localize('problems.focusDesc3', 'When a problem is focused, press Enter to navigate to that problem in the editor.'));
        lines.push(nls.localize('problems.focusDesc4', 'If you want to clear the filter and see all problems, press Escape or delete all filter text.'));
        lines.push('');
        // Filter Syntax
        lines.push(nls.localize('problems.syntaxHeader', 'Filter Syntax and Patterns:'));
        lines.push(nls.localize('problems.syntaxText', '- Type text: Shows problems whose message, file path, or code contains that text.'));
        lines.push(nls.localize('problems.syntaxExclude', '- !text (exclude): Hides problems containing the text, showing all others.'));
        lines.push(nls.localize('problems.syntaxExample', 'Example: typing "node_modules" hides all problems in node_modules.'));
        lines.push('');
        // Severity and Scope Filtering
        lines.push(nls.localize('problems.severityHeader', 'Severity and Scope Filtering:'));
        lines.push(nls.localize('problems.severityIntro', 'Above the filter input are toggle buttons for severity levels and scope:'));
        lines.push(nls.localize('problems.severityErrors', '- Errors button: Toggle to show or hide error problems.'));
        lines.push(nls.localize('problems.severityWarnings', '- Warnings button: Toggle to show or hide warning problems.'));
        lines.push(nls.localize('problems.severityInfo', '- Info button: Toggle to show or hide informational problems.'));
        lines.push(nls.localize('problems.severityActiveFile', '- Active File Only button: When enabled, shows only problems in the currently open file.'));
        lines.push(nls.localize('problems.severityConclusion', 'These buttons work together with your text filter.'));
        lines.push('');
        // Keyboard Navigation Summary
        lines.push(nls.localize('problems.keyboardHeader', 'Keyboard Navigation Summary:'));
        lines.push(nls.localize('problems.keyDown', '- Down Arrow: Move focus from filter into the problems list.'));
        lines.push(nls.localize('problems.keyTab', '- Tab: Move to severity and scope toggle buttons.'));
        lines.push(nls.localize('problems.keyEnter', '- Enter (on a problem): Navigate to that problem in the editor.'));
        lines.push(nls.localize('problems.keyF8', '- {0}: Move to the next problem globally from anywhere in the editor.', this._describeCommand('editor.action.marker.nextInFiles') || 'F8'));
        lines.push(nls.localize('problems.keyShiftF8', '- {0}: Move to the previous problem globally from anywhere in the editor.', this._describeCommand('editor.action.marker.prevInFiles') || 'Shift+F8'));
        lines.push(nls.localize('problems.keyEscape', '- Escape: Clear the filter and return to showing all problems.'));
        lines.push('');
        // Settings
        lines.push(nls.localize('problems.settingsHeader', 'Settings You Can Adjust ({0} opens Settings):', this._describeCommand('workbench.action.openSettings') || 'Ctrl+,'));
        lines.push(nls.localize('problems.settingsIntro', 'These settings affect the Problems panel.'));
        lines.push(nls.localize('problems.settingVerbosity', '- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.'));
        lines.push(nls.localize('problems.settingAutoReveal', '- `problems.autoReveal`: Automatically reveal problems in the editor when you select them.'));
        lines.push(nls.localize('problems.settingViewMode', '- `problems.defaultViewMode`: Show problems as a table or tree.'));
        lines.push(nls.localize('problems.settingSortOrder', '- `problems.sortOrder`: Sort problems by severity or position.'));
        lines.push(nls.localize('problems.settingShowCurrent', '- `problems.showCurrentInStatus`: Show the current problem in the status bar.'));
        lines.push('');
        // Closing
        lines.push(nls.localize('problems.closingHeader', 'Closing:'));
        lines.push(nls.localize('problems.closingDesc', 'Press Escape to clear the filter and see all problems. Your filter text is preserved if you reopen the panel. Problems are shown from your entire workspace; use Active File Only to focus on a single file.'));
        return lines.join('\n');
    }
    _describeCommand(commandId) {
        const kb = this._keybindingService.lookupKeybinding(commandId);
        return kb?.getAriaLabel() ?? undefined;
    }
    onClose() {
        // No-op
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFya2Vyc0FjY2Vzc2liaWxpdHlIZWxwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbWFya2Vycy9icm93c2VyL21hcmtlcnNBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzQkFBc0IsQ0FBQztBQUUxRCxNQUFNLE9BQU8seUJBQXlCO0lBQXRDO1FBQ1UsU0FBSSx3Q0FBMkI7UUFDL0IsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxnQkFBZ0IsQ0FBQztRQUN4QixTQUFJLEdBQUcsa0JBQWtCLENBQUMsK0JBQStCLENBQUM7SUFLcEUsQ0FBQztJQUhBLFdBQVcsQ0FBQyxRQUEwQjtRQUNyQyxPQUFPLElBQUksaUNBQWlDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7SUFDaEYsQ0FBQztDQUNEO0FBRUQsTUFBTSxpQ0FBa0MsU0FBUSxVQUFVO0lBS3pELFlBQ2tCLGtCQUFzQztRQUV2RCxLQUFLLEVBQUUsQ0FBQztRQUZTLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFML0MsT0FBRSwwRUFBK0M7UUFDakQsd0JBQW1CLDZFQUF3QztRQUMzRCxZQUFPLEdBQUcsRUFBRSxJQUFJLHNDQUF5QixFQUFFLENBQUM7SUFNckQsQ0FBQztJQUVELGNBQWM7UUFDYixNQUFNLEtBQUssR0FBYSxFQUFFLENBQUM7UUFFM0IsU0FBUztRQUNULEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSwyQ0FBMkMsQ0FBQyxDQUFDLENBQUM7UUFDekYsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLDhMQUE4TCxDQUFDLENBQUMsQ0FBQztRQUM3TyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWYsd0JBQXdCO1FBQ3hCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDLENBQUM7UUFDNUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLGlDQUFpQyxDQUFDLENBQUMsQ0FBQztRQUNuRixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWYsMEJBQTBCO1FBQzFCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSx5Q0FBeUMsQ0FBQyxDQUFDLENBQUM7UUFDNUYsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLG9CQUFvQixFQUFFLHNPQUFzTyxDQUFDLENBQUMsQ0FBQztRQUN2UixLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWYsK0JBQStCO1FBQy9CLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx1QkFBdUIsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLENBQUM7UUFDbkYsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLDJRQUEyUSxDQUFDLENBQUMsQ0FBQztRQUM5VCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsc0JBQXNCLEVBQUUsOEdBQThHLENBQUMsQ0FBQyxDQUFDO1FBQ2pLLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFZixpQkFBaUI7UUFDakIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHNCQUFzQixFQUFFLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNoRixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsd0pBQXdKLENBQUMsQ0FBQyxDQUFDO1FBQzFNLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSw2SEFBNkgsQ0FBQyxDQUFDLENBQUM7UUFDL0ssS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLG1GQUFtRixDQUFDLENBQUMsQ0FBQztRQUNySSxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsK0ZBQStGLENBQUMsQ0FBQyxDQUFDO1FBQ2pKLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFZixnQkFBZ0I7UUFDaEIsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLDZCQUE2QixDQUFDLENBQUMsQ0FBQztRQUNqRixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMscUJBQXFCLEVBQUUsbUZBQW1GLENBQUMsQ0FBQyxDQUFDO1FBQ3JJLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSw0RUFBNEUsQ0FBQyxDQUFDLENBQUM7UUFDakksS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLG9FQUFvRSxDQUFDLENBQUMsQ0FBQztRQUN6SCxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWYsK0JBQStCO1FBQy9CLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLENBQUM7UUFDckYsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDBFQUEwRSxDQUFDLENBQUMsQ0FBQztRQUMvSCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUseURBQXlELENBQUMsQ0FBQyxDQUFDO1FBQy9HLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSw2REFBNkQsQ0FBQyxDQUFDLENBQUM7UUFDckgsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHVCQUF1QixFQUFFLCtEQUErRCxDQUFDLENBQUMsQ0FBQztRQUNuSCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsNkJBQTZCLEVBQUUsMEZBQTBGLENBQUMsQ0FBQyxDQUFDO1FBQ3BKLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxvREFBb0QsQ0FBQyxDQUFDLENBQUM7UUFDOUcsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVmLDhCQUE4QjtRQUM5QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsOEJBQThCLENBQUMsQ0FBQyxDQUFDO1FBQ3BGLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSw4REFBOEQsQ0FBQyxDQUFDLENBQUM7UUFDN0csS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLG1EQUFtRCxDQUFDLENBQUMsQ0FBQztRQUNqRyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUJBQW1CLEVBQUUsaUVBQWlFLENBQUMsQ0FBQyxDQUFDO1FBQ2pILEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSx1RUFBdUUsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsa0NBQWtDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ3ZMLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSwyRUFBMkUsRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsa0NBQWtDLENBQUMsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3RNLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxnRUFBZ0UsQ0FBQyxDQUFDLENBQUM7UUFDakgsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUVmLFdBQVc7UUFDWCxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsK0NBQStDLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixDQUFDLCtCQUErQixDQUFDLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQztRQUN6SyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsMkNBQTJDLENBQUMsQ0FBQyxDQUFDO1FBQ2hHLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSw0R0FBNEcsQ0FBQyxDQUFDLENBQUM7UUFDcEssS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLDRCQUE0QixFQUFFLDRGQUE0RixDQUFDLENBQUMsQ0FBQztRQUNySixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsaUVBQWlFLENBQUMsQ0FBQyxDQUFDO1FBQ3hILEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxnRUFBZ0UsQ0FBQyxDQUFDLENBQUM7UUFDeEgsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLCtFQUErRSxDQUFDLENBQUMsQ0FBQztRQUN6SSxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRWYsVUFBVTtRQUNWLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQy9ELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSw4TUFBOE0sQ0FBQyxDQUFDLENBQUM7UUFFalEsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFTyxnQkFBZ0IsQ0FBQyxTQUFpQjtRQUN6QyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDL0QsT0FBTyxFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksU0FBUyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxPQUFPO1FBQ04sUUFBUTtJQUNULENBQUM7Q0FDRCJ9