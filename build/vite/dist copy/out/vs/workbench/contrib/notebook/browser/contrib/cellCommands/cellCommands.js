/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../../../base/common/keyCodes.js';
import { Mimes } from '../../../../../../base/common/mime.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../../editor/browser/services/bulkEditService.js';
import { localize, localize2 } from '../../../../../../nls.js';
import { MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext, InputFocusedContextKey } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { ResourceNotebookCellEdit } from '../../../../bulkEdit/browser/bulkCellEdits.js';
import { changeCellToKind, computeCellLinesContents, copyCellRange, joinCellsWithSurrounds, joinSelectedCells, moveCellRange } from '../../controller/cellOperations.js';
import { cellExecutionArgs, CELL_TITLE_CELL_GROUP_ID, NotebookCellAction, NotebookMultiCellAction, parseMultiCellExecutionArgs } from '../../controller/coreActions.js';
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID, EXPAND_CELL_OUTPUT_COMMAND_ID } from '../../notebookBrowser.js';
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_INPUT_COLLAPSED, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_OUTPUT_FOCUSED } from '../../../common/notebookContextKeys.js';
import * as icons from '../../notebookIcons.js';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { EditorContextKeys } from '../../../../../../editor/common/editorContextKeys.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
//#region Move/Copy cells
const MOVE_CELL_UP_COMMAND_ID = 'notebook.cell.moveUp';
const MOVE_CELL_DOWN_COMMAND_ID = 'notebook.cell.moveDown';
const COPY_CELL_UP_COMMAND_ID = 'notebook.cell.copyUp';
const COPY_CELL_DOWN_COMMAND_ID = 'notebook.cell.copyDown';
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: MOVE_CELL_UP_COMMAND_ID,
            title: localize2('notebookActions.moveCellUp', "Move Cell Up"),
            icon: icons.moveUpIcon,
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 16 /* KeyCode.UpArrow */,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.equals('config.notebook.dragAndDropEnabled', false),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
                order: 14
            }
        });
    }
    async runWithContext(accessor, context) {
        return moveCellRange(context, 'up');
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: MOVE_CELL_DOWN_COMMAND_ID,
            title: localize2('notebookActions.moveCellDown', "Move Cell Down"),
            icon: icons.moveDownIcon,
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 18 /* KeyCode.DownArrow */,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.equals('config.notebook.dragAndDropEnabled', false),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
                order: 14
            }
        });
    }
    async runWithContext(accessor, context) {
        return moveCellRange(context, 'down');
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: COPY_CELL_UP_COMMAND_ID,
            title: localize2('notebookActions.copyCellUp', "Copy Cell Up"),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 16 /* KeyCode.UpArrow */,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        return copyCellRange(context, 'up');
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: COPY_CELL_DOWN_COMMAND_ID,
            title: localize2('notebookActions.copyCellDown', "Copy Cell Down"),
            keybinding: {
                primary: 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 18 /* KeyCode.DownArrow */,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
                order: 13
            }
        });
    }
    async runWithContext(accessor, context) {
        return copyCellRange(context, 'down');
    }
});
//#endregion
//#region Join/Split
const SPLIT_CELL_COMMAND_ID = 'notebook.cell.split';
const JOIN_SELECTED_CELLS_COMMAND_ID = 'notebook.cell.joinSelected';
const JOIN_CELL_ABOVE_COMMAND_ID = 'notebook.cell.joinAbove';
const JOIN_CELL_BELOW_COMMAND_ID = 'notebook.cell.joinBelow';
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: SPLIT_CELL_COMMAND_ID,
            title: localize2('notebookActions.splitCell', "Split Cell"),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated()),
                order: 5 /* CellToolbarOrder.SplitCell */,
                group: CELL_TITLE_CELL_GROUP_ID
            },
            icon: icons.splitCellIcon,
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, EditorContextKeys.editorTextFocus),
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 93 /* KeyCode.Backslash */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
        });
    }
    async runWithContext(accessor, context) {
        if (context.notebookEditor.isReadOnly) {
            return;
        }
        const bulkEditService = accessor.get(IBulkEditService);
        const cell = context.cell;
        const index = context.notebookEditor.getCellIndex(cell);
        const splitPoints = cell.focusMode === CellFocusMode.Container ? [{ lineNumber: 1, column: 1 }] : cell.getSelectionsStartPosition();
        if (splitPoints && splitPoints.length > 0) {
            await cell.resolveTextModel();
            if (!cell.hasModel()) {
                return;
            }
            const newLinesContents = computeCellLinesContents(cell, splitPoints);
            if (newLinesContents) {
                const language = cell.language;
                const kind = cell.cellKind;
                const mime = cell.mime;
                const textModel = await cell.resolveTextModel();
                await bulkEditService.apply([
                    new ResourceTextEdit(cell.uri, { range: textModel.getFullModelRange(), text: newLinesContents[0] }),
                    new ResourceNotebookCellEdit(context.notebookEditor.textModel.uri, {
                        editType: 1 /* CellEditType.Replace */,
                        index: index + 1,
                        count: 0,
                        cells: newLinesContents.slice(1).map(line => ({
                            cellKind: kind,
                            language,
                            mime,
                            source: line,
                            outputs: [],
                            metadata: {}
                        }))
                    })
                ], { quotableLabel: 'Split Notebook Cell' });
                context.notebookEditor.cellAt(index + 1)?.updateEditState(cell.getEditState(), 'splitCell');
            }
        }
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: JOIN_CELL_ABOVE_COMMAND_ID,
            title: localize2('notebookActions.joinCellAbove', "Join With Previous Cell"),
            keybinding: {
                when: NOTEBOOK_EDITOR_FOCUSED,
                primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */ | 40 /* KeyCode.KeyJ */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
                order: 10
            }
        });
    }
    async runWithContext(accessor, context) {
        const bulkEditService = accessor.get(IBulkEditService);
        return joinCellsWithSurrounds(bulkEditService, context, 'above');
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: JOIN_CELL_BELOW_COMMAND_ID,
            title: localize2('notebookActions.joinCellBelow', "Join With Next Cell"),
            keybinding: {
                when: NOTEBOOK_EDITOR_FOCUSED,
                primary: 256 /* KeyMod.WinCtrl */ | 512 /* KeyMod.Alt */ | 40 /* KeyCode.KeyJ */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
                order: 11
            }
        });
    }
    async runWithContext(accessor, context) {
        const bulkEditService = accessor.get(IBulkEditService);
        return joinCellsWithSurrounds(bulkEditService, context, 'below');
    }
});
registerAction2(class extends NotebookCellAction {
    constructor() {
        super({
            id: JOIN_SELECTED_CELLS_COMMAND_ID,
            title: localize2('notebookActions.joinSelectedCells', "Join Selected Cells"),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
                order: 12
            }
        });
    }
    async runWithContext(accessor, context) {
        const bulkEditService = accessor.get(IBulkEditService);
        const notificationService = accessor.get(INotificationService);
        return joinSelectedCells(bulkEditService, notificationService, context);
    }
});
//#endregion
//#region Change Cell Type
const CHANGE_CELL_TO_CODE_COMMAND_ID = 'notebook.cell.changeToCode';
const CHANGE_CELL_TO_MARKDOWN_COMMAND_ID = 'notebook.cell.changeToMarkdown';
registerAction2(class ChangeCellToCodeAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: CHANGE_CELL_TO_CODE_COMMAND_ID,
            title: localize2('notebookActions.changeCellToCode', "Change Cell to Code"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_FOCUSED.toNegated()),
                primary: 55 /* KeyCode.KeyY */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
            }
        });
    }
    async runWithContext(accessor, context) {
        await changeCellToKind(CellKind.Code, context);
    }
});
registerAction2(class ChangeCellToMarkdownAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: CHANGE_CELL_TO_MARKDOWN_COMMAND_ID,
            title: localize2('notebookActions.changeCellToMarkdown', "Change Cell to Markdown"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_FOCUSED.toNegated()),
                primary: 43 /* KeyCode.KeyM */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo('code')),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo('code')),
                group: "3_edit" /* CellOverflowToolbarGroups.Edit */,
            }
        });
    }
    async runWithContext(accessor, context) {
        await changeCellToKind(CellKind.Markup, context, 'markdown', Mimes.markdown);
    }
});
//#endregion
//#region Collapse Cell
const COLLAPSE_CELL_INPUT_COMMAND_ID = 'notebook.cell.collapseCellInput';
const COLLAPSE_CELL_OUTPUT_COMMAND_ID = 'notebook.cell.collapseCellOutput';
const COLLAPSE_ALL_CELL_INPUTS_COMMAND_ID = 'notebook.cell.collapseAllCellInputs';
const EXPAND_ALL_CELL_INPUTS_COMMAND_ID = 'notebook.cell.expandAllCellInputs';
const COLLAPSE_ALL_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.collapseAllCellOutputs';
const EXPAND_ALL_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.expandAllCellOutputs';
const TOGGLE_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.toggleOutputs';
const TOGGLE_CELL_OUTPUT_SCROLLING = 'notebook.cell.toggleOutputScrolling';
registerAction2(class CollapseCellInputAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: COLLAPSE_CELL_INPUT_COMMAND_ID,
            title: localize2('notebookActions.collapseCellInput', "Collapse Cell Input"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated()),
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        if (context.ui) {
            context.cell.isInputCollapsed = true;
        }
        else {
            context.selectedCells.forEach(cell => cell.isInputCollapsed = true);
        }
    }
});
registerAction2(class ExpandCellInputAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXPAND_CELL_INPUT_COMMAND_ID,
            title: localize2('notebookActions.expandCellInput', "Expand Cell Input"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED),
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        if (context.ui) {
            context.cell.isInputCollapsed = false;
        }
        else {
            context.selectedCells.forEach(cell => cell.isInputCollapsed = false);
        }
    }
});
registerAction2(class CollapseCellOutputAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: COLLAPSE_CELL_OUTPUT_COMMAND_ID,
            title: localize2('notebookActions.collapseCellOutput', "Collapse Cell Output"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 50 /* KeyCode.KeyT */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        if (context.ui) {
            context.cell.isOutputCollapsed = true;
        }
        else {
            context.selectedCells.forEach(cell => cell.isOutputCollapsed = true);
        }
    }
});
registerAction2(class ExpandCellOuputAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXPAND_CELL_OUTPUT_COMMAND_ID,
            title: localize2('notebookActions.expandCellOutput', "Expand Cell Output"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED),
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 50 /* KeyCode.KeyT */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        if (context.ui) {
            context.cell.isOutputCollapsed = false;
        }
        else {
            context.selectedCells.forEach(cell => cell.isOutputCollapsed = false);
        }
    }
});
registerAction2(class extends NotebookMultiCellAction {
    constructor() {
        super({
            id: TOGGLE_CELL_OUTPUTS_COMMAND_ID,
            precondition: NOTEBOOK_CELL_LIST_FOCUSED,
            title: localize2('notebookActions.toggleOutputs', "Toggle Outputs"),
            metadata: {
                description: localize('notebookActions.toggleOutputs', "Toggle Outputs"),
                args: cellExecutionArgs
            }
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        let cells = [];
        if (context.ui) {
            cells = [context.cell];
        }
        else if (context.selectedCells) {
            cells = context.selectedCells;
        }
        for (const cell of cells) {
            cell.isOutputCollapsed = !cell.isOutputCollapsed;
        }
    }
});
registerAction2(class CollapseAllCellInputsAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: COLLAPSE_ALL_CELL_INPUTS_COMMAND_ID,
            title: localize2('notebookActions.collapseAllCellInput', "Collapse All Cell Inputs"),
            f1: true,
        });
    }
    async runWithContext(accessor, context) {
        forEachCell(context.notebookEditor, cell => cell.isInputCollapsed = true);
    }
});
registerAction2(class ExpandAllCellInputsAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXPAND_ALL_CELL_INPUTS_COMMAND_ID,
            title: localize2('notebookActions.expandAllCellInput', "Expand All Cell Inputs"),
            f1: true
        });
    }
    async runWithContext(accessor, context) {
        forEachCell(context.notebookEditor, cell => cell.isInputCollapsed = false);
    }
});
registerAction2(class CollapseAllCellOutputsAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: COLLAPSE_ALL_CELL_OUTPUTS_COMMAND_ID,
            title: localize2('notebookActions.collapseAllCellOutput', "Collapse All Cell Outputs"),
            f1: true,
        });
    }
    async runWithContext(accessor, context) {
        forEachCell(context.notebookEditor, cell => cell.isOutputCollapsed = true);
    }
});
registerAction2(class ExpandAllCellOutputsAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXPAND_ALL_CELL_OUTPUTS_COMMAND_ID,
            title: localize2('notebookActions.expandAllCellOutput', "Expand All Cell Outputs"),
            f1: true
        });
    }
    async runWithContext(accessor, context) {
        forEachCell(context.notebookEditor, cell => cell.isOutputCollapsed = false);
    }
});
registerAction2(class ToggleCellOutputScrolling extends NotebookMultiCellAction {
    constructor() {
        super({
            id: TOGGLE_CELL_OUTPUT_SCROLLING,
            title: localize2('notebookActions.toggleScrolling', "Toggle Scroll Cell Output"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 55 /* KeyCode.KeyY */),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    toggleOutputScrolling(viewModel, globalScrollSetting, collapsed) {
        const cellMetadata = viewModel.model.metadata;
        // TODO: when is cellMetadata undefined? Is that a case we need to support? It is currently a read-only property.
        if (cellMetadata) {
            const currentlyEnabled = cellMetadata['scrollable'] !== undefined ? cellMetadata['scrollable'] : globalScrollSetting;
            const shouldEnableScrolling = collapsed || !currentlyEnabled;
            cellMetadata['scrollable'] = shouldEnableScrolling;
            viewModel.resetRenderer();
        }
    }
    async runWithContext(accessor, context) {
        const globalScrolling = accessor.get(IConfigurationService).getValue(NotebookSetting.outputScrolling);
        if (context.ui) {
            context.cell.outputsViewModels.forEach((viewModel) => {
                this.toggleOutputScrolling(viewModel, globalScrolling, context.cell.isOutputCollapsed);
            });
            context.cell.isOutputCollapsed = false;
        }
        else {
            context.selectedCells.forEach(cell => {
                cell.outputsViewModels.forEach((viewModel) => {
                    this.toggleOutputScrolling(viewModel, globalScrolling, cell.isOutputCollapsed);
                });
                cell.isOutputCollapsed = false;
            });
        }
    }
});
//#endregion
function forEachCell(editor, callback) {
    for (let i = 0; i < editor.getLength(); i++) {
        const cell = editor.cellAt(i);
        callback(cell, i);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbENvbW1hbmRzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvbm90ZWJvb2svYnJvd3Nlci9jb250cmliL2NlbGxDb21tYW5kcy9jZWxsQ29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSwyQ0FBMkMsQ0FBQztBQUN0RixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDOUQsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDbEgsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUMvRCxPQUFPLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQy9GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUM1RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUcxSCxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUN6RixPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsd0JBQXdCLEVBQUUsYUFBYSxFQUFFLHNCQUFzQixFQUFFLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3pLLE9BQU8sRUFBRSxpQkFBaUIsRUFBK0Msd0JBQXdCLEVBQTBGLGtCQUFrQixFQUFFLHVCQUF1QixFQUFFLDJCQUEyQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDN1MsT0FBTyxFQUFFLGFBQWEsRUFBRSw0QkFBNEIsRUFBRSw2QkFBNkIsRUFBeUQsTUFBTSwwQkFBMEIsQ0FBQztBQUM3SyxPQUFPLEVBQUUsc0JBQXNC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