/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../../base/common/codicons.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize } from '../../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { insertCell } from './cellOperations.js';
import { NotebookAction } from './coreActions.js';
import { NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_EDITOR_EDITABLE } from '../../common/notebookContextKeys.js';
import { CellKind, NotebookSetting } from '../../common/notebookCommon.js';
import { INotebookKernelHistoryService } from '../../common/notebookKernelService.js';
const INSERT_CODE_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertCodeCellAbove';
const INSERT_CODE_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertCodeCellBelow';
const INSERT_CODE_CELL_ABOVE_AND_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.insertCodeCellAboveAndFocusContainer';
const INSERT_CODE_CELL_BELOW_AND_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.insertCodeCellBelowAndFocusContainer';
const INSERT_CODE_CELL_AT_TOP_COMMAND_ID = 'notebook.cell.insertCodeCellAtTop';
const INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.insertMarkdownCellAbove';
const INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID = 'notebook.cell.insertMarkdownCellBelow';
const INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID = 'notebook.cell.insertMarkdownCellAtTop';
export function insertNewCell(accessor, context, kind, direction, focusEditor) {
    let newCell = null;
    if (context.ui) {
        context.notebookEditor.focus();
    }
    const languageService = accessor.get(ILanguageService);
    const kernelHistoryService = accessor.get(INotebookKernelHistoryService);
    if (context.cell) {
        const idx = context.notebookEditor.getCellIndex(context.cell);
        newCell = insertCell(languageService, context.notebookEditor, idx, kind, direction, undefined, true, kernelHistoryService);
    }
    else {
        const focusRange = context.notebookEditor.getFocus();
        const next = Math.max(focusRange.end - 1, 0);
        newCell = insertCell(languageService, context.notebookEditor, next, kind, direction, undefined, true, kernelHistoryService);
    }
    return newCell;
}
export class InsertCellCommand extends NotebookAction {
    constructor(desc, kind, direction, focusEditor) {
        super(desc);
        this.kind = kind;
        this.direction = direction;
        this.focusEditor = focusEditor;
    }
    async runWithContext(accessor, context) {
        const newCell = await insertNewCell(accessor, context, this.kind, this.direction, this.focusEditor);
        if (newCell) {
            await context.notebookEditor.focusNotebookCell(newCell, this.focusEditor ? 'editor' : 'container');
        }
    }
}
registerAction2(class InsertCodeCellAboveAction extends InsertCellCommand {
    constructor() {
        super({
            id: INSERT_CODE_CELL_ABOVE_COMMAND_ID,
            title: localize('notebookActions.insertCodeCellAbove', "Insert Code Cell Above"),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellInsert,
                order: 0
            }
        }, CellKind.Code, 'above', true);
    }
});
registerAction2(class InsertCodeCellAboveAndFocusContainerAction extends InsertCellCommand {
    constructor() {
        super({
            id: INSERT_CODE_CELL_ABOVE_AND_FOCUS_CONTAINER_COMMAND_ID,
            title: localize('notebookActions.insertCodeCellAboveAndFocusContainer', "Insert Code Cell Above and Focus Container")
        }, CellKind.Code, 'above', false);
    }
});
registerAction2(class InsertCodeCellBelowAction extends InsertCellCommand {
    constructor() {
        super({
            id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
            title: localize('notebookActions.insertCodeCellBelow', "Insert Code Cell Below"),
            keybinding: {
                primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellInsert,
                order: 1
            }
        }, CellKind.Code, 'below', true);
    }
});
registerAction2(class InsertCodeCellBelowAndFocusContainerAction extends InsertCellCommand {
    constructor() {
        super({
            id: INSERT_CODE_CELL_BELOW_AND_FOCUS_CONTAINER_COMMAND_ID,
            title: localize('notebookActions.insertCodeCellBelowAndFocusContainer', "Insert Code Cell Below and Focus Container"),
        }, CellKind.Code, 'below', false);
    }
});
registerAction2(class InsertMarkdownCellAboveAction extends InsertCellCommand {
    constructor() {
        super({
            id: INSERT_MARKDOWN_CELL_ABOVE_COMMAND_ID,
            title: localize('notebookActions.insertMarkdownCellAbove', "Insert Markdown Cell Above"),
            menu: {
                id: MenuId.NotebookCellInsert,
                order: 2
            }
        }, CellKind.Markup, 'above', true);
    }
});
registerAction2(class InsertMarkdownCellBelowAction extends InsertCellCommand {
    constructor() {
        super({
            id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
            title: localize('notebookActions.insertMarkdownCellBelow', "Insert Markdown Cell Below"),
            menu: {
                id: MenuId.NotebookCellInsert,
                order: 3
            }
        }, CellKind.Markup, 'below', true);
    }
});
registerAction2(class InsertCodeCellAtTopAction extends NotebookAction {
    constructor() {
        super({
            id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
            title: localize('notebookActions.insertCodeCellAtTop', "Add Code Cell At Top"),
            f1: false
        });
    }
    async run(accessor, context) {
        context = context ?? this.getEditorContextFromArgsOrActive(accessor);
        if (context) {
            this.runWithContext(accessor, context);
        }
    }
    async runWithContext(accessor, context) {
        const languageService = accessor.get(ILanguageService);
        const kernelHistoryService = accessor.get(INotebookKernelHistoryService);
        const newCell = insertCell(languageService, context.notebookEditor, 0, CellKind.Code, 'above', undefined, true, kernelHistoryService);
        if (newCell) {
            await context.notebookEditor.focusNotebookCell(newCell, 'editor');
        }
    }
});
registerAction2(class InsertMarkdownCellAtTopAction extends NotebookAction {
    constructor() {
        super({
            id: INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID,
            title: localize('notebookActions.insertMarkdownCellAtTop', "Add Markdown Cell At Top"),
            f1: false
        });
    }
    async run(accessor, context) {
        context = context ?? this.getEditorContextFromArgsOrActive(accessor);
        if (context) {
            this.runWithContext(accessor, context);
        }
    }
    async runWithContext(accessor, context) {
        const languageService = accessor.get(ILanguageService);
        const kernelHistoryService = accessor.get(INotebookKernelHistoryService);
        const newCell = insertCell(languageService, context.notebookEditor, 0, CellKind.Markup, 'above', undefined, true, kernelHistoryService);
        if (newCell) {
            await context.notebookEditor.focusNotebookCell(newCell, 'editor');
        }
    }
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
    command: {
        id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
        title: '$(add) ' + localize('notebookActions.menu.insertCode', "Code"),
        tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
    },
    order: 0,
    group: 'inline',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
    command: {
        id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
        title: localize('notebookActions.menu.insertCode.minimalToolbar', "Add Code"),
        icon: Codicon.add,
        tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
    },
    order: 0,
    group: 'inline',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.equals('config.notebook.experimental.insertToolbarAlignment', 'left'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
    command: {
        id: INSERT_CODE_CELL_BELOW_COMMAND_ID,
        icon: Codicon.add,
        title: localize('notebookActions.menu.insertCode.ontoolbar', "Code"),
        tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
    },
    order: -5,
    group: 'navigation/add',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'), ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
    command: {
        id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
        title: '$(add) ' + localize('notebookActions.menu.insertCode', "Code"),
        tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
    },
    order: 0,
    group: 'inline',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
    command: {
        id: INSERT_CODE_CELL_AT_TOP_COMMAND_ID,
        title: localize('notebookActions.menu.insertCode.minimaltoolbar', "Add Code"),
        icon: Codicon.add,
        tooltip: localize('notebookActions.menu.insertCode.tooltip', "Add Code Cell")
    },
    order: 0,
    group: 'inline',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.equals('config.notebook.experimental.insertToolbarAlignment', 'left'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellBetween, {
    command: {
        id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
        title: '$(add) ' + localize('notebookActions.menu.insertMarkdown', "Markdown"),
        tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
    },
    order: 1,
    group: 'inline',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
    command: {
        id: INSERT_MARKDOWN_CELL_BELOW_COMMAND_ID,
        icon: Codicon.add,
        title: localize('notebookActions.menu.insertMarkdown.ontoolbar', "Markdown"),
        tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
    },
    order: -5,
    group: 'navigation/add',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'betweenCells'), ContextKeyExpr.notEquals('config.notebook.insertToolbarLocation', 'hidden'), ContextKeyExpr.notEquals(`config.${NotebookSetting.globalToolbarShowLabel}`, false), ContextKeyExpr.notEquals(`config.${NotebookSetting.globalToolbarShowLabel}`, 'never'))
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellListTop, {
    command: {
        id: INSERT_MARKDOWN_CELL_AT_TOP_COMMAND_ID,
        title: '$(add) ' + localize('notebookActions.menu.insertMarkdown', "Markdown"),
        tooltip: localize('notebookActions.menu.insertMarkdown.tooltip', "Add Markdown Cell")
    },
    order: 1,
    group: 'inline',
    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), ContextKeyExpr.notEquals('config.notebook.experimental.insertToolbarAlignment', 'left'))
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5zZXJ0Q2VsbEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvaW5zZXJ0Q2VsbEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWpFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQW1CLE1BQU0sRUFBRSxZQUFZLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDM0gsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBRy9GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQTBCLGNBQWMsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQzFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSx3QkFBd0IsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTNHLE9BQU8sRUFBRSxRQUFRLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDM0UsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFFdEYsTUFBTSxpQ0FBaUMsR0FBRyxtQ0FBbUMsQ0FBQztBQUM5RSxNQUFNLGlDQUFpQyxHQUFHLG1DQUFtQyxDQUFDO0FBQzlFLE1BQU0scURBQXFELEdBQUcsb0RBQW9ELENBQUM7QUFDbkgsTUFBTSxxREFBcUQsR0FBRyxvREFBb0QsQ0FBQztBQUNuSCxNQUFNLGtDQUFr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