import { IS_COMPOSITE_NOTEBOOK, NOTEBOOK_EDITOR_FOCUSED } from '../common/notebookContextKeys.js';
import { localize } from '../../../../nls.js';
import { AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
export class NotebookAccessibilityHelp {
    constructor() {
        this.priority = 105;
        this.name = 'notebook';
        this.when = ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, IS_COMPOSITE_NOTEBOOK.negate());
        this.type = "help" /* AccessibleViewType.Help */;
    }
    getProvider(accessor) {
        const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor()
            || accessor.get(ICodeEditorService).getFocusedCodeEditor()
            || accessor.get(IEditorService).activeEditorPane;
        if (!activeEditor) {
            return;
        }
        return getAccessibilityHelpProvider(accessor, activeEditor);
    }
}
function getAccessibilityHelpText() {
    return [
        localize('notebook.overview', 'The notebook view is a collection of code and markdown cells. Code cells can be executed and will produce output directly below the cell.'),
        localize('notebook.cell.edit', 'The Edit Cell command{0} will focus on the cell input.', '<keybinding:notebook.cell.edit>'),
        localize('notebook.cell.quitEdit', 'The Quit Edit command{0} will set focus on the cell container. The default (Escape) key may need to be pressed twice first exit the virtual cursor if active.', '<keybinding:notebook.cell.quitEdit>'),
        localize('notebook.cell.focusInOutput', 'The Focus Output command{0} will set focus in the cell\'s output.', '<keybinding:notebook.cell.focusInOutput>'),
        localize('notebook.focusNextEditor', 'The Focus Next Cell Editor command{0} will set focus in the next cell\'s editor.', '<keybinding:notebook.focusNextEditor>'),
        localize('notebook.focusPreviousEditor', 'The Focus Previous Cell Editor command{0} will set focus in the previous cell\'s editor.', '<keybinding:notebook.focusPreviousEditor>'),
        localize('notebook.cellNavigation', 'The up and down arrows will also move focus between cells while focused on the outer cell container.'),
        localize('notebook.cell.executeAndFocusContainer', 'The Execute Cell command{0} executes the cell that currently has focus.', '<keybinding:notebook.cell.executeAndFocusContainer>'),
        localize('notebook.cell.insertCodeCellBelowAndFocusContainer', 'The Insert Cell Above{0} and Below{1} commands will create new empty code cells.', '<keybinding:notebook.cell.insertCodeCellAbove>', '<keybinding:notebook.cell.insertCodeCellBelow>'),
        localize('notebook.changeCellType', 'The Change Cell to Code/Markdown commands are used to switch between cell types.')
    ].join('\n');
}
function getAccessibilityHelpProvider(accessor, editor) {
    const helpText = getAccessibilityHelpText();
    return new AccessibleContentProvider("notebook" /* AccessibleViewProviderId.Notebook */, { type: "help" /* AccessibleViewType.Help */ }, () => helpText, () => editor.focus(), "accessibility.verbosity.notebook" /* AccessibilityVerbositySettingId.Notebook */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tBY2Nlc3NpYmlsaXR5SGVscC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tBY2Nlc3NpYmlsaXR5SGVscC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFNQSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFnRCx5QkFBeUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRXZKLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVsRixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUM5RixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFFdEYsTUFBTSxPQUFPLHlCQUF5QjtJQUF0QztRQUNVLGFBQVEsR0FBRyxHQUFHLENBQUM7UUFDZixTQUFJLEdBQUcsVUFBVSxDQUFDO1FBQ2xCLFNBQUksR0FBRyxjQUFjLENBQUMsR0FBRyxDQUFDLHVCQUF1QixFQUFFLHFCQUFxQixDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDbkYsU0FBSSx3Q0FBK0M7SUFXN0QsQ0FBQztJQVZBLFdBQVcsQ0FBQyxRQUEwQjtRQUNyQyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGtCQUFrQixDQUFDLENBQUMsbUJBQW1CLEVBQUU7ZUFDdkUsUUFBUSxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLG9CQUFvQixFQUFFO2VBQ3ZELFFBQVEsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUMsZ0JBQWdCLENBQUM7UUFFbEQsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO1lBQ25CLE9BQU87UUFDUixDQUFDO1FBQ0QsT0FBTyw0QkFBNEIsQ0FBQyxRQUFRLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDN0QsQ0FBQztDQUNEO0FBRUQsU0FBUyx3QkFBd0I7SUFDaEMsT0FBTztRQUNOLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSwySUFBMkksQ0FBQztRQUMxSyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsd0RBQXdELEVBQUUsaUNBQWlDLENBQUM7UUFDM0gsUUFBUSxDQUFDLHdCQUF3QixFQUFFLCtKQUErSixFQUFFLHFDQUFxQyxDQUFDO1FBQzFPLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxtRUFBbUUsRUFBRSwwQ0FBMEMsQ0FBQztRQUN4SixRQUFRLENBQUMsMEJBQTBCLEVBQUUsa0ZBQWtGLEVBQUUsdUNBQXVDLENBQUM7UUFDakssUUFBUSxDQUFDLDhCQUE4QixFQUFFLDBGQUEwRixFQUFFLDJDQUEyQyxDQUFDO1FBQ2pMLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxzR0FBc0csQ0FBQztRQUMzSSxRQUFRLENBQUMsd0NBQXdDLEVBQUUseUVBQXlFLEVBQUUscURBQXFELENBQUM7UUFDcEwsUUFBUSxDQUFDLG9EQUFvRCxFQUFFLGtGQUFrRixFQUFFLGdEQUFnRCxFQUFFLGdEQUFnRCxDQUFDO1FBQ3RQLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxrRkFBa0YsQ0FBQztLQUN2SCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFTLDRCQUE0QixDQUFDLFFBQTBCLEVBQUUsTUFBd0M7SUFDekcsTUFBTSxRQUFRLEdBQUcsd0JBQXdCLEVBQUUsQ0FBQztJQUM1QyxPQUFPLElBQUkseUJBQXlCLHFEQUVuQyxFQUFFLElBQUksc0NBQXlCLEVBQUUsRUFDakMsR0FBRyxFQUFFLENBQUMsUUFBUSxFQUNkLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsb0ZBRXBCLENBQUM7QUFDSCxDQUFDIn0=