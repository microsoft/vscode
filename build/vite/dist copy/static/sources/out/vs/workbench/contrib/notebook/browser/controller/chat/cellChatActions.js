/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../../base/common/codicons.js';
import { KeyChord } from '../../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContextKey } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_RESPONSE_TYPE, CTX_INLINE_CHAT_VISIBLE, MENU_INLINE_CHAT_WIDGET_STATUS } from '../../../../inlineChat/common/inlineChat.js';
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from './notebookChatContext.js';
import { NotebookAction, getContextFromActiveEditor, getEditorFromArgsOrActivePane } from '../coreActions.js';
import { insertNewCell } from '../insertCellActions.js';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon.js';
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from '../../../common/notebookContextKeys.js';
import { Iterable } from '../../../../../../base/common/iterator.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { InlineChatController } from '../../../../inlineChat/browser/inlineChatController.js';
import { EditorAction2 } from '../../../../../../editor/browser/editorExtensions.js';
async function startChat(accessor, context, index, input, autoSend, source) {
    const configurationService = accessor.get(IConfigurationService);
    const commandService = accessor.get(ICommandService);
    if (configurationService.getValue(NotebookSetting.cellGenerate) || configurationService.getValue(NotebookSetting.cellChat)) {
        const activeCell = context.notebookEditor.getActiveCell();
        const targetCell = activeCell?.getTextLength() === 0 && source !== 'insertToolbar' ? activeCell : (await insertNewCell(accessor, context, CellKind.Code, 'below', true));
        if (targetCell) {
            targetCell.enableAutoLanguageDetection();
            await context.notebookEditor.revealFirstLineIfOutsideViewport(targetCell);
            const codeEditor = context.notebookEditor.codeEditors.find(ce => ce[0] === targetCell)?.[1];
            if (codeEditor) {
                codeEditor.focus();
                commandService.executeCommand('inlineChat.start');
            }
        }
    }
}
registerAction2(class extends NotebookAction {
    constructor() {
        super({
            id: 'notebook.cell.chat.start',
            title: {
                value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
                original: '$(sparkle) Generate',
            },
            tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Start Chat to Generate Code"),
            metadata: {
                description: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Start Chat to Generate Code"),
                args: [
                    {
                        name: 'args',
                        schema: {
                            type: 'object',
                            required: ['index'],
                            properties: {
                                'index': {
                                    type: 'number'
                                },
                                'input': {
                                    type: 'string'
                                },
                                'autoSend': {
                                    type: 'boolean'
                                }
                            }
                        }
                    }
                ]
            },
            f1: false,
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.not(InputFocusedContextKey), CTX_NOTEBOOK_CHAT_HAS_AGENT, ContextKeyExpr.or(ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true), ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true))),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */,
                secondary: [KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 39 /* KeyCode.KeyI */)],
            },
            menu: [
                {
                    id: MenuId.NotebookCellBetween,
                    group: 'inline',
                    order: -1,
                    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), CTX_NOTEBOOK_CHAT_HAS_AGENT, ContextKeyExpr.or(ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true), ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)))
                }
            ]
        });
    }
    getEditorContextFromArgsOrActive(accessor, ...args) {
        const [firstArg] = args;
        if (!firstArg) {
            const notebookEditor = getEditorFromArgsOrActivePane(accessor);
            if (!notebookEditor) {
                return undefined;
            }
            const activeCell = notebookEditor.getActiveCell();
            if (!activeCell) {
                return undefined;
            }
            return {
                cell: activeCell,
                notebookEditor,
                input: undefined,
                autoSend: undefined
            };
        }
        if (typeof firstArg !== 'object' || typeof firstArg.index !== 'number') {
            return undefined;
        }
        const notebookEditor = getEditorFromArgsOrActivePane(accessor);
        if (!notebookEditor) {
            return undefined;
        }
        const cell = firstArg.index <= 0 ? undefined : notebookEditor.cellAt(firstArg.index - 1);
        return {
            cell,
            notebookEditor,
            input: firstArg.input,
            autoSend: firstArg.autoSend
        };
    }
    async runWithContext(accessor, context) {
        const index = Math.max(0, context.cell ? context.notebookEditor.getCellIndex(context.cell) + 1 : 0);
        await startChat(accessor, context, index, context.input, context.autoSend, context.source);
    }
});
registerAction2(class extends NotebookAction {
    constructor() {
        super({
            id: 'notebook.cell.chat.startAtTop',
            title: {
                value: '$(sparkle) ' + localize('notebookActions.menu.insertCodeCellWithChat', "Generate"),
                original: '$(sparkle) Generate',
            },
            tooltip: localize('notebookActions.menu.insertCodeCellWithChat.tooltip', "Start Chat to Generate Code"),
            f1: false,
            menu: [
                {
                    id: MenuId.NotebookCellListTop,
                    group: 'inline',
                    order: -1,
                    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), CTX_NOTEBOOK_CHAT_HAS_AGENT, ContextKeyExpr.or(ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true), ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)))
                },
            ]
        });
    }
    async runWithContext(accessor, context) {
        await startChat(accessor, context, 0, '', false);
    }
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
    command: {
        id: 'notebook.cell.chat.start',
        icon: Codicon.sparkle,
        title: localize('notebookActions.menu.insertCode.ontoolbar', "Generate"),
        tooltip: localize('notebookActions.menu.insertCode.tooltip', "Start Chat to Generate Code")
    },
    order: -10,
    group: 'navigation/add',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'), ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden'), CTX_NOTEBOOK_CHAT_HAS_AGENT, ContextKeyExpr.or(ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true), ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)))
});
export class AcceptChangesAndRun extends EditorAction2 {
    constructor() {
        super({
            id: 'notebook.inlineChat.acceptChangesAndRun',
            title: localize2('notebook.apply1', "Accept and Run"),
            shortTitle: localize('notebook.apply2', 'Accept & Run'),
            tooltip: localize('notebook.apply3', 'Accept the changes and run the cell'),
            icon: Codicon.check,
            f1: true,
            precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), CTX_INLINE_CHAT_VISIBLE),
            keybinding: undefined,
            menu: [{
                    id: MENU_INLINE_CHAT_WIDGET_STATUS,
                    group: '0_main',
                    order: 2,
                    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ChatContextKeys.inputHasText.toNegated(), CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated(), CTX_INLINE_CHAT_RESPONSE_TYPE.isEqualTo("messagesAndEdits" /* InlineChatResponseType.MessagesAndEdits */))
                }]
        });
    }
    runEditorCommand(accessor, codeEditor) {
        const editor = getContextFromActiveEditor(accessor.get(IEditorService));
        const ctrl = InlineChatController.get(codeEditor);
        if (!editor || !ctrl) {
            return;
        }
        const matchedCell = editor.notebookEditor.codeEditors.find(e => e[1] === codeEditor);
        const cell = matchedCell?.[0];
        if (!cell) {
            return;
        }
        ctrl.acceptSession();
        return editor.notebookEditor.executeNotebookCells(Iterable.single(cell));
    }
}
registerAction2(AcceptChangesAndRun);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbENoYXRBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cm9sbGVyL2NoYXQvY2VsbENoYXRBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsUUFBUSxFQUFtQixNQUFNLDJDQUEyQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDL0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDN0csT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQ3pHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUdyRyxPQUFPLEVBQUUsbUNBQW1DLEVBQUUsNkJBQTZCLEVBQUUsdUJBQXVCLEVBQTBCLDhCQUE4QixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDbE4sT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDdkUsT0FBTyxFQUEwQixjQUFjLEVBQUUsMEJBQTBCLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQUN0SSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDeEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM5RSxPQUFP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