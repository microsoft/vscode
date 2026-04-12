/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import * as nls from '../../../../nls.js';
import { OUTPUT_FILTER_FOCUS_CONTEXT } from '../../../services/output/common/output.js';
export class OutputAccessibilityHelp {
    constructor() {
        this.type = "help" /* AccessibleViewType.Help */;
        this.priority = 105;
        this.name = 'outputFilter';
        this.when = OUTPUT_FILTER_FOCUS_CONTEXT;
    }
    getProvider(accessor) {
        return new OutputAccessibilityHelpProvider(accessor.get(IKeybindingService));
    }
}
class OutputAccessibilityHelpProvider extends Disposable {
    constructor(_keybindingService) {
        super();
        this._keybindingService = _keybindingService;
        this.id = "outputFindHelp" /* AccessibleViewProviderId.OutputFindHelp */;
        this.verbositySettingKey = "accessibility.verbosity.find" /* AccessibilityVerbositySettingId.Find */;
        this.options = { type: "help" /* AccessibleViewType.Help */ };
    }
    provideContent() {
        const lines = [];
        // Header
        lines.push(nls.localize('output.header', 'Accessibility Help: Output Panel Filter'));
        lines.push(nls.localize('output.context', 'You are in the Output panel filter input. This is NOT a navigating search. Instead, it instantly hides lines that do not match your filter, showing only the lines you want to see.'));
        lines.push('');
        // Current Filter Status
        lines.push(nls.localize('output.statusHeader', 'Current Filter Status:'));
        lines.push(nls.localize('output.statusDesc', 'You are filtering the output.'));
        lines.push('');
        // Inside the Filter Input
        lines.push(nls.localize('output.inputHeader', 'Inside the Filter Input (What It Does):'));
        lines.push(nls.localize('output.inputDesc', 'While you are in the filter input, your focus stays in the field. You can type, edit, or adjust your filter without leaving the input. As you type, the Output panel instantly updates to show only lines matching your filter.'));
        lines.push('');
        // What Happens When You Filter
        lines.push(nls.localize('output.filterHeader', 'What Happens When You Filter:'));
        lines.push(nls.localize('output.filterDesc1', 'Each time you change the filter text, the panel instantly regenerates to show only matching lines. Your screen reader announces how many lines are now visible. This is live feedback: as you type or delete characters, the displayed lines update immediately.'));
        lines.push(nls.localize('output.filterDesc2', 'New output from your running program is appended to the panel and automatically filtered, so matching new output appears instantly.'));
        lines.push('');
        // Focus Behavior
        lines.push(nls.localize('output.focusHeader', 'Focus Behavior (Important):'));
        lines.push(nls.localize('output.focusDesc1', 'Your focus stays in the filter input while the panel updates in the background. This is intentional, so you can keep typing without losing your place.'));
        lines.push(nls.localize('output.focusDesc2', 'If you want to review the filtered output, press Down Arrow to move focus from the filter into the output content below.'));
        lines.push(nls.localize('output.focusDesc3', 'If you want to clear the filter and see all output, press Escape or delete all filter text.'));
        lines.push('');
        // Filter Syntax
        lines.push(nls.localize('output.syntaxHeader', 'Filter Syntax and Patterns:'));
        lines.push(nls.localize('output.syntaxText', '- Type text: Shows only lines containing that text (case-insensitive by default).'));
        lines.push(nls.localize('output.syntaxExclude', '- !text (exclude): Hides lines containing \'text\', showing all other lines.'));
        lines.push(nls.localize('output.syntaxEscape', '- \\\\! (escape): Use backslash to search for a literal "!" character.'));
        lines.push(nls.localize('output.syntaxMultiple', '- text1, text2 (multiple patterns): Separate patterns with commas to show lines matching ANY pattern.'));
        lines.push(nls.localize('output.syntaxExample', 'Example: typing "error, warning" shows lines containing either "error" or "warning".'));
        lines.push('');
        // Keyboard Navigation Summary
        lines.push(nls.localize('output.keyboardHeader', 'Keyboard Navigation Summary:'));
        lines.push(nls.localize('output.keyDown', '- Down Arrow: Move focus from filter into the output content.'));
        lines.push(nls.localize('output.keyTab', '- Tab: Move to log level filter buttons if available.'));
        lines.push(nls.localize('output.keyEscape', '- Escape: Clear the filter and return to showing all output.'));
        lines.push('');
        // Settings
        lines.push(nls.localize('output.settingsHeader', 'Settings You Can Adjust ({0} opens Settings):', this._describeCommand('workbench.action.openSettings') || 'Ctrl+,'));
        lines.push(nls.localize('output.settingsIntro', 'These settings affect how the Output panel works.'));
        lines.push(nls.localize('output.settingVerbosity', '- `accessibility.verbosity.find`: Controls whether the filter input announces the Accessibility Help hint.'));
        lines.push(nls.localize('output.settingSmartScroll', '- `output.smartScroll.enabled`: Automatically scroll to the latest output when messages arrive.'));
        lines.push('');
        // Closing
        lines.push(nls.localize('output.closingHeader', 'Closing:'));
        lines.push(nls.localize('output.closingDesc', 'Press Escape to clear the filter and see all output, or close the Output panel. Your filter text is preserved if you reopen the panel.'));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3V0cHV0QWNjZXNzaWJpbGl0eUhlbHAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9vdXRwdXQvYnJvd3Nlci9vdXRwdXRBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJbEUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDMUYsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsMkJBQTJCLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUV4RixNQUFNLE9BQU8sdUJBQXVCO0lBQXBDO1FBQ1UsU0FBSSx3Q0FBMkI7UUFDL0IsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxjQUFjLENBQUM7UUFDdEIsU0FBSSxHQUFHLDJCQUEyQixDQUFDO0lBSzdDLENBQUM7SUFIQSxXQUFXLENBQUMsUUFBMEI7UUFDckMsT0FBTyxJQUFJLCtCQUErQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDO0lBQzlFLENBQUM7Q0FDRDtBQUVELE1BQU0sK0JBQWdDLFNBQVEsVUFBVTtJQUt2RCxZQUNrQixrQkFBc0M7UUFFdkQsS0FBSyxFQUFFLENBQUM7UUFGUyx1QkFBa0IsR0FBbEIsa0JBQWtCLENBQW9CO1FBTC9DLE9BQUUsa0VBQTJDO1FBQzdDLHdCQUFtQiw2RUFBd0M7UUFDM0QsWUFBTyxHQUFHLEVBQUUsSUFBSSxzQ0FBeUIsRUFBRSxDQUFDO0lBTXJELENBQUM7SUFFRCxjQUFjO1FBQ2IsTUFBTSxLQUFLLEdBQWEsRUFBRSxDQUFDO1FBRTNCLFNBQVM7UUFDVCxLQUFLLENBQUMsSUFBSSxDQUFDLEdB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