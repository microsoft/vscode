/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Iterable } from '../../../../../base/common/iterator.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { localize, localize2 } from '../../../../../nls.js';
import { MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDebugService } from '../../../debug/common/debug.js';
import { CTX_INLINE_CHAT_FOCUSED } from '../../../inlineChat/common/inlineChat.js';
import { insertCell } from './cellOperations.js';
import { CELL_TITLE_CELL_GROUP_ID, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NotebookAction, NotebookCellAction, NotebookMultiCellAction, cellExecutionArgs, getContextFromActiveEditor, getContextFromUri, parseMultiCellExecutionArgs } from './coreActions.js';
import { CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, ScrollToRevealBehavior } from '../notebookBrowser.js';
import * as icons from '../notebookIcons.js';
import { CellKind, CellUri, NotebookSetting } from '../../common/notebookCommon.js';
import { NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_MISSING_KERNEL_EXTENSION } from '../../common/notebookContextKeys.js';
import { NotebookEditorInput } from '../../common/notebookEditorInput.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { CodeCellViewModel } from '../viewModel/codeCellViewModel.js';
const EXECUTE_NOTEBOOK_COMMAND_ID = 'notebook.execute';
const CANCEL_NOTEBOOK_COMMAND_ID = 'notebook.cancelExecution';
const INTERRUPT_NOTEBOOK_COMMAND_ID = 'notebook.interruptExecution';
const CANCEL_CELL_COMMAND_ID = 'notebook.cell.cancelExecution';
const EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID = 'notebook.cell.executeAndFocusContainer';
const EXECUTE_CELL_SELECT_BELOW = 'notebook.cell.executeAndSelectBelow';
const EXECUTE_CELL_INSERT_BELOW = 'notebook.cell.executeAndInsertBelow';
const EXECUTE_CELL_AND_BELOW = 'notebook.cell.executeCellAndBelow';
const EXECUTE_CELLS_ABOVE = 'notebook.cell.executeCellsAbove';
const RENDER_ALL_MARKDOWN_CELLS = 'notebook.renderAllMarkdownCells';
const REVEAL_RUNNING_CELL = 'notebook.revealRunningCell';
const REVEAL_LAST_FAILED_CELL = 'notebook.revealLastFailedCell';
// If this changes, update getCodeCellExecutionContextKeyService to match
export const executeCondition = ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('code'), ContextKeyExpr.or(ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0), ContextKeyExpr.greater(NOTEBOOK_KERNEL_SOURCE_COUNT.key, 0), NOTEBOOK_MISSING_KERNEL_EXTENSION));
export const executeThisCellCondition = ContextKeyExpr.and(executeCondition, NOTEBOOK_CELL_EXECUTING.toNegated());
export const executeSectionCondition = ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('markup'));
function renderAllMarkdownCells(context) {
    for (let i = 0; i < context.notebookEditor.getLength(); i++) {
        const cell = context.notebookEditor.cellAt(i);
        if (cell.cellKind === CellKind.Markup) {
            cell.updateEditState(CellEditState.Preview, 'renderAllMarkdownCells');
        }
    }
}
async function runCell(editorGroupsService, context, editorService) {
    const group = editorGroupsService.activeGroup;
    if (group) {
        if (group.activeEditor) {
            group.pinEditor(group.activeEditor);
        }
    }
    // If auto-reveal is enabled, ensure the notebook editor is visible before revealing cells
    if (context.autoReveal && (context.cell || context.selectedCells?.length) && editorService) {
        editorService.openEditor({ resource: context.notebookEditor.textModel.uri, options: { revealIfOpened: true } });
    }
    if (context.ui && context.cell) {
        if (context.autoReveal) {
            handleAutoReveal(context.cell, context.notebookEditor);
        }
        await context.notebookEditor.executeNotebookCells(Iterable.single(context.cell));
    }
    else if (context.selectedCells?.length || context.cell) {
        const selectedCells = context.selectedCells?.length ? context.selectedCells : [context.cell];
        const firstCell = selectedCells[0];
        if (firstCell && context.autoReveal) {
            handleAutoReveal(firstCell, context.notebookEditor);
        }
        await context.notebookEditor.executeNotebookCells(selectedCells);
    }
    let foundEditor = undefined;
    for (const [, codeEditor] of context.notebookEditor.codeEditors) {
        if (isEqual(codeEditor.getModel()?.uri, (context.cell ?? context.selectedCells?.[0])?.uri)) {
            foundEditor = codeEditor;
            break;
        }
    }
    if (!foundEditor) {
        return;
    }
}
const SMART_VIEWPORT_TOP_REVEAL_PADDING = 20; // enough to not cut off top of cell toolbar
const SMART_VIEWPORT_BOTTOM_REVEAL_PADDING = 60; // enough to show full bottom of output element + tiny buffer below that vertical bar
function handleAutoReveal(cell, notebookEditor) {
    // always focus the container, blue bar is a good visual aid in tracking what's happening
    notebookEditor.focusNotebookCell(cell, 'container', { skipReveal: true });
    // Handle markup cells with simple reveal
    if (cell.cellKind === CellKind.Markup) {
        const cellIndex = notebookEditor.getCellIndex(cell);
        notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
        return;
    }
    // Ensure we're working with a code cell - we need the CodeCellViewModel type for accessing layout properties like outputTotalHeight
    if (!(cell instanceof CodeCellViewModel)) {
        return;
    }
    // Get all dimensions
    const cellEditorScrollTop = notebookEditor.getAbsoluteTopOfElement(cell);
    const cellEditorScrollBottom = cellEditorScrollTop + cell.layoutInfo.outputContainerOffset;
    const cellOutputHeight = cell.layoutInfo.outputTotalHeight;
    const cellOutputScrollBottom = notebookEditor.getAbsoluteBottomOfElement(cell);
    const viewportHeight = notebookEditor.getLayoutInfo().height;
    const viewportHeight34 = viewportHeight * 0.34;
    const viewportHeight66 = viewportHeight * 0.66;
    const totalHeight = cell.layoutInfo.totalHeight;
    const isFullyVisible = cellEditorScrollTop >= notebookEditor.scrollTop && cellOutputScrollBottom <= notebookEditor.scrollBottom;
    const isEditorBottomVisible = ((cellEditorScrollBottom - 25 /* padding for the cell status bar */) >= notebookEditor.scrollTop) &&
        ((cellEditorScrollBottom + 25 /* padding to see a sliver of the beginning of outputs */) <= notebookEditor.scrollBottom);
    // Common scrolling functions
    const revealWithTopPadding = (position) => { notebookEditor.setScrollTop(position - SMART_VIEWPORT_TOP_REVEAL_PADDING); };
    const revealWithNoPadding = (position) => { notebookEditor.setScrollTop(position); };
    const revealWithBottomPadding = (position) => { notebookEditor.setScrollTop(position + SMART_VIEWPORT_BOTTOM_REVEAL_PADDING); };
    // CASE 0: Total is already visible
    if (isFullyVisible) {
        return;
    }
    // CASE 1: Total fits within viewport
    if (totalHeight <= viewportHeight && !isEditorBottomVisible) {
        revealWithTopPadding(cellEditorScrollTop);
        return;
    }
    // CASE 2: Total doesn't fit in the viewport
    if (totalHeight > viewportHeight && !isEditorBottomVisible) {
        if (cellOutputHeight > 0 && cellOutputHeight >= viewportHeight66) {
            // has large outputs -- Show 34% editor, 66% output
            revealWithNoPadding(cellEditorScrollBottom - viewportHeight34);
        }
        else if (cellOutputHeight > 0) {
            // has small outputs -- Show output at viewport bottom
            revealWithBottomPadding(cellOutputScrollBottom - viewportHeight);
        }
        else {
            // No outputs, just big cell -- put editor bottom @ 2/3 of viewport height
            revealWithNoPadding(cellEditorScrollBottom - viewportHeight66);
        }
    }
}
registerAction2(class RenderAllMarkdownCellsAction extends NotebookAction {
    constructor() {
        super({
            id: RENDER_ALL_MARKDOWN_CELLS,
            title: localize('notebookActions.renderMarkdown', "Render All Markdown Cells"),
        });
    }
    async runWithContext(accessor, context) {
        renderAllMarkdownCells(context);
    }
});
registerAction2(class ExecuteNotebookAction extends NotebookAction {
    constructor() {
        super({
            id: EXECUTE_NOTEBOOK_COMMAND_ID,
            title: localize('notebookActions.executeNotebook', "Run All"),
            icon: icons.executeAllIcon,
            metadata: {
                description: localize('notebookActions.executeNotebook', "Run All"),
                args: [
                    {
                        name: 'uri',
                        description: 'The document uri'
                    }
                ]
            },
            menu: [
                {
                    id: MenuId.EditorTitle,
                    order: -1,
                    group: 'navigation',
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated()), ContextKeyExpr.notEquals('config.notebook.globalToolbar', true))
                },
                {
                    id: MenuId.NotebookToolbar,
                    order: -1,
                    group: 'navigation/execute',
                    when: ContextKeyExpr.and(ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated()), ContextKeyExpr.and(NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated())?.negate(), ContextKeyExpr.equals('config.notebook.globalToolbar', true))
                }
            ]
        });
    }
    getEditorContextFromArgsOrActive(accessor, context) {
        return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
    }
    async runWithContext(accessor, context) {
        renderAllMarkdownCells(context);
        const editorService = accessor.get(IEditorService);
        const editor = editorService.findEditors({
            resource: context.notebookEditor.textModel.uri,
            typeId: NotebookEditorInput.ID,
            editorId: context.notebookEditor.textModel.viewType
        }).at(0);
        const editorGroupService = accessor.get(IEditorGroupsService);
        if (editor) {
            const group = editorGroupService.getGroup(editor.groupId);
            group?.pinEditor(editor.editor);
        }
        return context.notebookEditor.executeNotebookCells();
    }
});
registerAction2(class ExecuteCell extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXECUTE_CELL_COMMAND_ID,
            precondition: executeThisCellCondition,
            title: localize('notebookActions.execute', "Execute Cell"),
            keybinding: {
                when: NOTEBOOK_CELL_LIST_FOCUSED,
                primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */,
                win: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */
                },
                weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
            },
            menu: {
                id: MenuId.NotebookCellExecutePrimary,
                when: executeThisCellCondition,
                group: 'inline'
            },
            metadata: {
                description: localize('notebookActions.execute', "Execute Cell"),
                args: cellExecutionArgs
            },
            icon: icons.executeIcon
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        if (context.ui) {
            await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
        }
        await runCell(editorGroupsService, context, editorService);
    }
});
registerAction2(class ExecuteAboveCells extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXECUTE_CELLS_ABOVE,
            precondition: executeCondition,
            title: localize('notebookActions.executeAbove', "Execute Above Cells"),
            menu: [
                {
                    id: MenuId.NotebookCellExecute,
                    when: ContextKeyExpr.and(executeCondition, ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, true))
                },
                {
                    id: MenuId.NotebookCellTitle,
                    order: 2 /* CellToolbarOrder.ExecuteAboveCells */,
                    group: CELL_TITLE_CELL_GROUP_ID,
                    when: ContextKeyExpr.and(executeCondition, ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, false))
                }
            ],
            icon: icons.executeAboveIcon
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        let endCellIdx = undefined;
        if (context.ui) {
            endCellIdx = context.notebookEditor.getCellIndex(context.cell);
            await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
        }
        else {
            endCellIdx = Math.min(...context.selectedCells.map(cell => context.notebookEditor.getCellIndex(cell)));
        }
        if (typeof endCellIdx === 'number') {
            const range = { start: 0, end: endCellIdx };
            const cells = context.notebookEditor.getCellsInRange(range);
            context.notebookEditor.executeNotebookCells(cells);
        }
    }
});
registerAction2(class ExecuteCellAndBelow extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXECUTE_CELL_AND_BELOW,
            precondition: executeCondition,
            title: localize('notebookActions.executeBelow', "Execute Cell and Below"),
            menu: [
                {
                    id: MenuId.NotebookCellExecute,
                    when: ContextKeyExpr.and(executeCondition, ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, true))
                },
                {
                    id: MenuId.NotebookCellTitle,
                    order: 3 /* CellToolbarOrder.ExecuteCellAndBelow */,
                    group: CELL_TITLE_CELL_GROUP_ID,
                    when: ContextKeyExpr.and(executeCondition, ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, false))
                }
            ],
            icon: icons.executeBelowIcon
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        let startCellIdx = undefined;
        if (context.ui) {
            startCellIdx = context.notebookEditor.getCellIndex(context.cell);
            await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
        }
        else {
            startCellIdx = Math.min(...context.selectedCells.map(cell => context.notebookEditor.getCellIndex(cell)));
        }
        if (typeof startCellIdx === 'number') {
            const range = { start: startCellIdx, end: context.notebookEditor.getLength() };
            const cells = context.notebookEditor.getCellsInRange(range);
            context.notebookEditor.executeNotebookCells(cells);
        }
    }
});
registerAction2(class ExecuteCellFocusContainer extends NotebookMultiCellAction {
    constructor() {
        super({
            id: EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID,
            precondition: executeThisCellCondition,
            title: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
            metadata: {
                description: localize('notebookActions.executeAndFocusContainer', "Execute Cell and Focus Container"),
                args: cellExecutionArgs
            },
            icon: icons.executeIcon
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        if (context.ui) {
            await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
        }
        else {
            const firstCell = context.selectedCells[0];
            if (firstCell) {
                await context.notebookEditor.focusNotebookCell(firstCell, 'container', { skipReveal: true });
            }
        }
        await runCell(editorGroupsService, context, editorService);
    }
});
const cellCancelCondition = ContextKeyExpr.or(ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'executing'), ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, 'pending'));
registerAction2(class CancelExecuteCell extends NotebookMultiCellAction {
    constructor() {
        super({
            id: CANCEL_CELL_COMMAND_ID,
            precondition: cellCancelCondition,
            title: localize('notebookActions.cancel', "Stop Cell Execution"),
            icon: icons.stopIcon,
            menu: {
                id: MenuId.NotebookCellExecutePrimary,
                when: cellCancelCondition,
                group: 'inline'
            },
            metadata: {
                description: localize('notebookActions.cancel', "Stop Cell Execution"),
                args: [
                    {
                        name: 'options',
                        description: 'The cell range options',
                        schema: {
                            'type': 'object',
                            'required': ['ranges'],
                            'properties': {
                                'ranges': {
                                    'type': 'array',
                                    items: [
                                        {
                                            'type': 'object',
                                            'required': ['start', 'end'],
                                            'properties': {
                                                'start': {
                                                    'type': 'number'
                                                },
                                                'end': {
                                                    'type': 'number'
                                                }
                                            }
                                        }
                                    ]
                                },
                                'document': {
                                    'type': 'object',
                                    'description': 'The document uri',
                                }
                            }
                        }
                    }
                ]
            },
        });
    }
    parseArgs(accessor, ...args) {
        return parseMultiCellExecutionArgs(accessor, ...args);
    }
    async runWithContext(accessor, context) {
        if (context.ui) {
            await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
            return context.notebookEditor.cancelNotebookCells(Iterable.single(context.cell));
        }
        else {
            return context.notebookEditor.cancelNotebookCells(context.selectedCells);
        }
    }
});
registerAction2(class ExecuteCellSelectBelow extends NotebookCellAction {
    constructor() {
        super({
            id: EXECUTE_CELL_SELECT_BELOW,
            precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
            title: localize('notebookActions.executeAndSelectBelow', "Execute Notebook Cell and Select Below"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, CTX_INLINE_CHAT_FOCUSED.negate()),
                primary: 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */,
                weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
            },
        });
    }
    async runWithContext(accessor, context) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        const idx = context.notebookEditor.getCellIndex(context.cell);
        if (typeof idx !== 'number') {
            return;
        }
        const languageService = accessor.get(ILanguageService);
        const config = accessor.get(IConfigurationService);
        const scrollBehavior = config.getValue(NotebookSetting.scrollToRevealCell);
        let focusOptions;
        if (scrollBehavior === 'none') {
            focusOptions = { skipReveal: true };
        }
        else {
            focusOptions = {
                revealBehavior: scrollBehavior === 'fullCell' ? ScrollToRevealBehavior.fullCell : ScrollToRevealBehavior.firstLine
            };
        }
        if (context.cell.cellKind === CellKind.Markup) {
            const nextCell = context.notebookEditor.cellAt(idx + 1);
            context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_SELECT_BELOW);
            if (nextCell) {
                await context.notebookEditor.focusNotebookCell(nextCell, 'container', focusOptions);
            }
            else {
                const newCell = insertCell(languageService, context.notebookEditor, idx, CellKind.Markup, 'below');
                if (newCell) {
                    await context.notebookEditor.focusNotebookCell(newCell, 'editor', focusOptions);
                }
            }
            return;
        }
        else {
            const nextCell = context.notebookEditor.cellAt(idx + 1);
            if (nextCell) {
                await context.notebookEditor.focusNotebookCell(nextCell, 'container', focusOptions);
            }
            else {
                const newCell = insertCell(languageService, context.notebookEditor, idx, CellKind.Code, 'below');
                if (newCell) {
                    await context.notebookEditor.focusNotebookCell(newCell, 'editor', focusOptions);
                }
            }
            return runCell(editorGroupsService, context, editorService);
        }
    }
});
registerAction2(class ExecuteCellInsertBelow extends NotebookCellAction {
    constructor() {
        super({
            id: EXECUTE_CELL_INSERT_BELOW,
            precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
            title: localize('notebookActions.executeAndInsertBelow', "Execute Notebook Cell and Insert Below"),
            keybinding: {
                when: NOTEBOOK_CELL_LIST_FOCUSED,
                primary: 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */,
                weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
            },
        });
    }
    async runWithContext(accessor, context) {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const editorService = accessor.get(IEditorService);
        const idx = context.notebookEditor.getCellIndex(context.cell);
        const languageService = accessor.get(ILanguageService);
        const newFocusMode = context.cell.focusMode === CellFocusMode.Editor ? 'editor' : 'container';
        const newCell = insertCell(languageService, context.notebookEditor, idx, context.cell.cellKind, 'below');
        if (newCell) {
            await context.notebookEditor.focusNotebookCell(newCell, newFocusMode);
        }
        if (context.cell.cellKind === CellKind.Markup) {
            context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_INSERT_BELOW);
        }
        else {
            runCell(editorGroupsService, context, editorService);
        }
    }
});
class CancelNotebook extends NotebookAction {
    getEditorContextFromArgsOrActive(accessor, context) {
        return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
    }
    async runWithContext(accessor, context) {
        return context.notebookEditor.cancelNotebookCells();
    }
}
registerAction2(class CancelAllNotebook extends CancelNotebook {
    constructor() {
        super({
            id: CANCEL_NOTEBOOK_COMMAND_ID,
            title: localize2('notebookActions.cancelNotebook', "Stop Execution"),
            icon: icons.stopIcon,
            menu: [
                {
                    id: MenuId.EditorTitle,
                    order: -1,
                    group: 'navigation',
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), ContextKeyExpr.notEquals('config.notebook.globalToolbar', true))
                },
                {
                    id: MenuId.NotebookToolbar,
                    order: -1,
                    group: 'navigation/execute',
                    when: ContextKeyExpr.and(NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), ContextKeyExpr.equals('config.notebook.globalToolbar', true))
                }
            ]
        });
    }
});
registerAction2(class InterruptNotebook extends CancelNotebook {
    constructor() {
        super({
            id: INTERRUPT_NOTEBOOK_COMMAND_ID,
            title: localize2('notebookActions.interruptNotebook', "Interrupt"),
            precondition: ContextKeyExpr.and(NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL),
            icon: icons.stopIcon,
            menu: [
                {
                    id: MenuId.EditorTitle,
                    order: -1,
                    group: 'navigation',
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, ContextKeyExpr.notEquals('config.notebook.globalToolbar', true))
                },
                {
                    id: MenuId.NotebookToolbar,
                    order: -1,
                    group: 'navigation/execute',
                    when: ContextKeyExpr.and(NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, ContextKeyExpr.equals('config.notebook.globalToolbar', true))
                },
                {
                    id: MenuId.InteractiveToolbar,
                    group: 'navigation/execute'
                }
            ]
        });
    }
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
    title: localize('revealRunningCellShort', "Go To"),
    submenu: MenuId.NotebookCellExecuteGoTo,
    group: 'navigation/execute',
    order: 20,
    icon: ThemeIcon.modify(icons.executingStateIcon, 'spin')
});
registerAction2(class RevealRunningCellAction extends NotebookAction {
    constructor() {
        super({
            id: REVEAL_RUNNING_CELL,
            title: localize('revealRunningCell', "Go to Running Cell"),
            tooltip: localize('revealRunningCell', "Go to Running Cell"),
            shortTitle: localize('revealRunningCell', "Go to Running Cell"),
            precondition: NOTEBOOK_HAS_RUNNING_CELL,
            menu: [
                {
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_HAS_RUNNING_CELL, ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)),
                    group: 'navigation',
                    order: 0
                },
                {
                    id: MenuId.NotebookCellExecuteGoTo,
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_HAS_RUNNING_CELL, ContextKeyExpr.equals('config.notebook.globalToolbar', true)),
                    group: 'navigation/execute',
                    order: 20
                },
                {
                    id: MenuId.InteractiveToolbar,
                    when: ContextKeyExpr.and(NOTEBOOK_HAS_RUNNING_CELL, ContextKeyExpr.equals('activeEditor', 'workbench.editor.interactive')),
                    group: 'navigation',
                    order: 10
                }
            ],
            icon: ThemeIcon.modify(icons.executingStateIcon, 'spin')
        });
    }
    async runWithContext(accessor, context) {
        const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
        const notebook = context.notebookEditor.textModel.uri;
        const executingCells = notebookExecutionStateService.getCellExecutionsForNotebook(notebook);
        if (executingCells[0]) {
            const topStackFrameCell = this.findCellAtTopFrame(accessor, notebook);
            const focusHandle = topStackFrameCell ?? executingCells[0].cellHandle;
            const cell = context.notebookEditor.getCellByHandle(focusHandle);
            if (cell) {
                context.notebookEditor.focusNotebookCell(cell, 'container');
            }
        }
    }
    findCellAtTopFrame(accessor, notebook) {
        const debugService = accessor.get(IDebugService);
        for (const session of debugService.getModel().getSessions()) {
            for (const thread of session.getAllThreads()) {
                const sf = thread.getTopStackFrame();
                if (sf) {
                    const parsed = CellUri.parse(sf.source.uri);
                    if (parsed && parsed.notebook.toString() === notebook.toString()) {
                        return parsed.handle;
                    }
                }
            }
        }
        return undefined;
    }
});
registerAction2(class RevealLastFailedCellAction extends NotebookAction {
    constructor() {
        super({
            id: REVEAL_LAST_FAILED_CELL,
            title: localize('revealLastFailedCell', "Go to Most Recently Failed Cell"),
            tooltip: localize('revealLastFailedCell', "Go to Most Recently Failed Cell"),
            shortTitle: localize('revealLastFailedCellShort', "Go to Most Recently Failed Cell"),
            precondition: NOTEBOOK_LAST_CELL_FAILED,
            menu: [
                {
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_HAS_RUNNING_CELL.toNegated(), ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)),
                    group: 'navigation',
                    order: 0
                },
                {
                    id: MenuId.NotebookCellExecuteGoTo,
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_HAS_RUNNING_CELL.toNegated(), ContextKeyExpr.equals('config.notebook.globalToolbar', true)),
                    group: 'navigation/execute',
                    order: 20
                },
            ],
            icon: icons.errorStateIcon,
        });
    }
    async runWithContext(accessor, context) {
        const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
        const notebook = context.notebookEditor.textModel.uri;
        const lastFailedCellHandle = notebookExecutionStateService.getLastFailedCellForNotebook(notebook);
        if (lastFailedCellHandle !== undefined) {
            const lastFailedCell = context.notebookEditor.getCellByHandle(lastFailedCellHandle);
            if (lastFailedCell) {
                context.notebookEditor.focusNotebookCell(lastFailedCell, 'container');
            }
        }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlY3V0ZUFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvZXhlY3V0ZUFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRWxFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFHcEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUM1RCxPQUFPLEVBQUUsTUFBTSxFQUFFLFlBQVksRUFBRSxlQUFlLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMxRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFekYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsd0JBQXdCLEVBQW9JLG9DQUFvQyxFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSx1QkFBdUIsRUFBRSxpQkFBaUIsRUFBRSwwQkFBMEIsRUFBRSxpQkFBaUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ2hZLE9BQU8sRUFBRSxhQUFhLEVBQUUsYUFBYSxFQUFFLHVC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