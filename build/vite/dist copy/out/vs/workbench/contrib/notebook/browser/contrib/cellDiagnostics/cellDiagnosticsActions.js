/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Range } from '../../../../../../editor/common/core/range.js';
import { CodeActionController } from '../../../../../../editor/contrib/codeAction/browser/codeActionController.js';
import { CodeActionKind, CodeActionTriggerSource } from '../../../../../../editor/contrib/codeAction/common/types.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { NotebookCellAction, findTargetCellEditor } from '../../controller/coreActions.js';
import { CodeCellViewModel } from '../../viewModel/codeCellViewModel.js';
import { NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_HAS_ERROR_DIAGNOSTICS } from '../../../common/notebookContextKeys.js';
import { InlineChatController } from '../../../../inlineChat/browser/inlineChatController.js';
import { IChatWidgetService } from '../../../../chat/browser/chat.js';
export const OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID = 'notebook.cell.openFailureActions';
export const FIX_CELL_ERROR_COMMAND_ID = 'notebook.cell.chat.fixError';
export const EXPLAIN_CELL_ERROR_COMMAND_ID = 'notebook.cell.chat.explainError';
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: OPEN_CELL_FAILURE_ACTIONS_COMMAND_ID,
            title: localize2('notebookActions.cellFailureActions', "Show Cell Failure Actions"),
            precondition: ContextKeyExpr.and(NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_HAS_ERROR_DIAGNOSTICS, NOTEBOOK_CELL_EDITOR_FOCUSED.toNegated()),
            f1: true,
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_HAS_ERROR_DIAGNOSTICS, NOTEBOOK_CELL_EDITOR_FOCUSED.toNegated()),
                primary: 2048 /* KeyMod.CtrlCmd */ | 89 /* KeyCode.Period */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        if (context.cell instanceof CodeCellViewModel) {
            const error = context.cell.executionErrorDiagnostic.get();
            if (error?.location) {
                const location = Range.lift({
                    startLineNumber: error.location.startLineNumber + 1,
                    startColumn: error.location.startColumn + 1,
                    endLineNumber: error.location.endLineNumber + 1,
                    endColumn: error.location.endColumn + 1
                });
                context.notebookEditor.setCellEditorSelection(context.cell, Range.lift(location));
                const editor = findTargetCellEditor(context, context.cell);
                if (editor) {
                    const controller = CodeActionController.get(editor);
                    controller?.manualTriggerAtCurrentPosition(localize('cellCommands.quickFix.noneMessage', "No code actions available"), CodeActionTriggerSource.Default, { include: CodeActionKind.QuickFix });
                }
            }
        }
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: FIX_CELL_ERROR_COMMAND_ID,
            title: localize2('notebookActions.chatFixCellError', "Fix Cell Error"),
            precondition: ContextKeyExpr.and(NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_HAS_ERROR_DIAGNOSTICS, NOTEBOOK_CELL_EDITOR_FOCUSED.toNegated()),
            f1: true
        });
    }
    async runWithContext(accessor, context) {
        if (context.cell instanceof CodeCellViewModel) {
            const error = context.cell.executionErrorDiagnostic.get();
            if (error?.location) {
                const location = Range.lift({
                    startLineNumber: error.location.startLineNumber + 1,
                    startColumn: error.location.startColumn + 1,
                    endLineNumber: error.location.endLineNumber + 1,
                    endColumn: error.location.endColumn + 1
                });
                context.notebookEditor.setCellEditorSelection(context.cell, Range.lift(location));
                const editor = findTargetCellEditor(context, context.cell);
                if (editor) {
                    const controller = InlineChatController.get(editor);
                    const message = error.name ? `${error.name}: ${error.message}` : error.message;
                    if (controller) {
                        await controller.run({ message: '/fix ' + message, initialRange: location, autoSend: true });
                    }
                }
            }
        }
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: EXPLAIN_CELL_ERROR_COMMAND_ID,
            title: localize2('notebookActions.chatExplainCellError', "Explain Cell Error"),
            precondition: ContextKeyExpr.and(NOTEBOOK_CELL_FOCUSED, NOTEBOOK_CELL_HAS_ERROR_DIAGNOSTICS, NOTEBOOK_CELL_EDITOR_FOCUSED.toNegated()),
            f1: true
        });
    }
    async runWithContext(accessor, context) {
        if (context.cell instanceof CodeCellViewModel) {
            const error = context.cell.executionErrorDiagnostic.get();
            if (error?.message) {
                const widgetService = accessor.get(IChatWidgetService);
                const chatWidget = await widgetService.revealWidget();
                const message = error.name ? `${error.name}: ${error.message}` : error.message;
                // TODO: can we add special prompt instructions? e.g. use "%pip install"
                chatWidget?.acceptInput('@workspace /explain ' + message);
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbERpYWdub3N0aWNzQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9jZWxsRGlhZ25vc3RpY3MvY2VsbERpYWdub3N0aWNzQWN0aW9ucy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDdEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sNkVBQTZFLENBQUM7QUFDbkgsT0FBTyxFQUFFLGNBQWMsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3RILE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUU1RixPQUFPLEVBQThCLGtCQUFrQixFQUFFLG9CQUFvQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDdkgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDekUsT0FBTyxFQUFFLDRCQUE0QixFQUFFLHFCQUFxQixFQUFFLG1DQUFtQyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDbEosT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFDOUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFdEUsTUFBTSxDQUFDLE1BQU0sb0NBQW9DLEdBQUcsa0NBQWtDLENBQUM7QUFDdkYsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsNkJBQTZCLENBQUM7QUFDdkUsTUFBTSxDQUFDLE1BQU0sNkJB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