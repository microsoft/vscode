import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED } from '../../notebook/common/notebookContextKeys.js';
export class ReplEditorInputAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'REPL Editor Input';
        this.when = ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate());
        this.type = "help" /* AccessibleViewType.Help */;
    }
    getProvider(accessor) {
        return getAccessibilityHelpProvider(accessor.get(ICodeEditorService), getAccessibilityInputHelpText());
    }
}
function getAccessibilityInputHelpText() {
    return [
        localize('replEditor.inputOverview', 'You are in a REPL Editor Input box which will accept code to be executed in the REPL.'),
        localize('replEditor.execute', 'The Execute command{0} will evaluate the expression in the input box.', '<keybinding:repl.execute>'),
        localize('replEditor.configReadExecution', 'The setting `accessibility.replEditor.readLastExecutionOutput` controls if output will be automatically read when execution completes.'),
        localize('replEditor.autoFocusRepl', 'The setting `accessibility.replEditor.autoFocusReplExecution` controls if focus will automatically move to the REPL after executing code.'),
        localize('replEditor.focusLastItemAdded', 'The Focus Last executed command{0} will move focus to the last executed item in the REPL history.', '<keybinding:repl.focusLastItemExecuted>'),
        localize('replEditor.inputAccessibilityView', 'When you run the Open Accessbility View command{0} from this input box, the output from the last execution will be shown in the accessibility view.', '<keybinding:editor.action.accessibleView>'),
        localize('replEditor.focusReplInput', 'The Focus Input Editor command{0} will bring the focus back to this editor.', '<keybinding:repl.input.focus>'),
    ].join('\n');
}
export class ReplEditorHistoryAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'REPL Editor History';
        this.when = ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED);
        this.type = "help" /* AccessibleViewType.Help */;
    }
    getProvider(accessor) {
        return getAccessibilityHelpProvider(accessor.get(ICodeEditorService), getAccessibilityHistoryHelpText());
    }
}
function getAccessibilityHistoryHelpText() {
    return [
        localize('replEditor.historyOverview', 'You are in a REPL History which is a list of cells that have been executed in the REPL. Each cell has an input, an output, and the cell container.'),
        localize('replEditor.focusCellEditor', 'The Edit Cell command{0} will move focus to the read-only editor for the input of the cell.', '<keybinding:notebook.cell.edit>'),
        localize('replEditor.cellNavigation', 'The Quit Edit command{0} will move focus to the cell container, where the up and down arrows will also move focus between cells in the history.', '<keybinding:notebook.cell.quitEdit>'),
        localize('replEditor.accessibilityView', 'Run the Open Accessbility View command{0} while navigating the history for an accessible view of the item\'s output.', '<keybinding:editor.action.accessibleView>'),
        localize('replEditor.focusInOutput', 'The Focus Output command{0} will set focus on the output when focused on a previously executed item.', '<keybinding:notebook.cell.focusInOutput>'),
        localize('replEditor.focusReplInputFromHistory', 'The Focus Input Editor command{0} will move focus to the REPL input box.', '<keybinding:repl.input.focus>'),
        localize('replEditor.focusLastItemAdded', 'The Focus Last executed command{0} will move focus to the last executed item in the REPL history.', '<keybinding:repl.focusLastItemExecuted>'),
    ].join('\n');
}
function getAccessibilityHelpProvider(editorService, helpText) {
    const activeEditor = editorService.getActiveCodeEditor()
        || editorService.getFocusedCodeEditor();
    if (!activeEditor) {
        return;
    }
    return new AccessibleContentProvider("replEditor" /* AccessibleViewProviderId.ReplEditor */, { type: "help" /* AccessibleViewType.Help */ }, () => helpText, () => activeEditor.focus(), "accessibility.verbosity.replEditor" /* AccessibilityVerbositySettingId.ReplEditor */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVwbEVkaXRvckFjY2Vzc2liaWxpdHlIZWxwLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvcmVwbE5vdGVib29rL2Jyb3dzZXIvcmVwbEVkaXRvckFjY2Vzc2liaWxpdHlIZWxwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQU1BLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFnRCx5QkFBeUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXZKLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzlGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDhDQUE4QyxDQUFDO0FBRWpILE1BQU0sT0FBTyxnQ0FBZ0M7SUFBN0M7UUFDVSxhQUFRLEdBQUcsR0FBRyxDQUFDO1FBQ2YsU0FBSSxHQUFHLG1CQUFtQixDQUFDO1FBQzNCLFNBQUksR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFLDBCQUEwQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDdEYsU0FBSSx3Q0FBK0M7SUFJN0QsQ0FBQztJQUhBLFdBQVcsQ0FBQyxRQUEwQjtRQUNyQyxPQUFPLDRCQUE0QixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsRUFBRSw2QkFBNkIsRUFBRSxDQUFDLENBQUM7SUFDeEcsQ0FBQztDQUNEO0FBRUQsU0FBUyw2QkFBNkI7SUFDckMsT0FBTztRQUNOLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSx1RkFBdUYsQ0FBQztRQUM3SCxRQUFRLENBQUMsb0JBQW9CLEVBQUUsdUVBQXVFLEVBQUUsMkJBQTJCLENBQUM7UUFDcEksUUFBUSxDQUFDLGdDQUFnQyxFQUFFLHdJQUF3SSxDQUFDO1FBQ3BMLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSwySUFBMkksQ0FBQztRQUNqTCxRQUFRLENBQUMsK0JBQStCLEVBQUUsbUdBQW1HLEVBQUUseUNBQXlDLENBQUM7UUFDekwsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLHFKQUFxSixFQUFFLDJDQUEyQyxDQUFDO1FBQ2pQLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSw2RUFBNkUsRUFBRSwrQkFBK0IsQ0FBQztLQUNySixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLE9BQU8sa0NBQWtDO0lBQS9DO1FBQ1UsYUFBUSxHQUFHLEdBQUcsQ0FBQztRQUNmLFNBQUksR0FBRyxxQkFBcUIsQ0FBQztRQUM3QixTQUFJLEdBQUcsY0FBYyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO1FBQzdFLFNBQUksd0NBQStDO0lBSTdELENBQUM7SUFIQSxXQUFXLENBQUMsUUFBMEI7UUFDckMsT0FBTyw0QkFBNEIsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLEVBQUUsK0JBQStCLEVBQUUsQ0FBQyxDQUFDO0lBQzFHLENBQUM7Q0FDRDtBQUVELFNBQVMsK0JBQStCO0lBQ3ZDLE9BQU87UUFDTixRQUFRLENBQUMsNEJBQTRCLEVBQUUsb0pBQW9KLENBQUM7UUFDNUwsUUFBUSxDQUFDLDRCQUE0QixFQUFFLDZGQUE2RixFQUFFLGlDQUFpQyxDQUFDO1FBQ3hLLFFBQVEsQ0FBQywyQkFBMkIsRUFBRSxpSkFBaUosRUFBRSxxQ0FBcUMsQ0FBQztRQUMvTixRQUFRLENBQUMsOEJBQThCLEVBQUUsc0hBQXNILEVBQUUsMkNBQTJDLENBQUM7UUFDN00sUUFBUSxDQUFDLDBCQUEwQixFQUFFLHNHQUFzRyxFQUFFLDBDQUEwQyxDQUFDO1FBQ3hMLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSwwRUFBMEUsRUFBRSwrQkFBK0IsQ0FBQztRQUM3SixRQUFRLENBQUMsK0JBQStCLEVBQUUsbUdBQW1HLEVBQUUseUNBQXlDLENBQUM7S0FDekwsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDZCxDQUFDO0FBRUQsU0FBUyw0QkFBNEIsQ0FBQyxhQUFpQyxFQUFFLFFBQWdCO0lBQ3hGLE1BQU0sWUFBWSxHQUFHLGFBQWEsQ0FBQyxtQkFBbUIsRUFBRTtXQUNwRCxhQUFhLENBQUMsb0JBQW9CLEVBQUUsQ0FBQztJQUV6QyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbkIsT0FBTztJQUNSLENBQUM7SUFFRCxPQUFPLElBQUkseUJBQXlCLHlEQUVuQyxFQUFFLElBQUksc0NBQXlCLEVBQUUsRUFDakMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUNkLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsd0ZBRTFCLENBQUM7QUFDSCxDQUFDIn0=