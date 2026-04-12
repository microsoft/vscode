/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../../base/common/keyCodes.js';
import { Mimes } from '../../../../../base/common/mime.js';
import { URI } from '../../../../../base/common/uri.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { CommandExecutor } from '../../../../../editor/common/cursor/cursor.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { getIconClasses } from '../../../../../editor/common/services/getIconClasses.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { LineCommentCommand } from '../../../../../editor/contrib/comment/browser/lineCommentCommand.js';
import { localize, localize2 } from '../../../../../nls.js';
import { MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext, InputFocusedContextKey } from '../../../../../platform/contextkey/common/contextkeys.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InlineChatController } from '../../../inlineChat/browser/inlineChatController.js';
import { CTX_INLINE_CHAT_FOCUSED } from '../../../inlineChat/common/inlineChat.js';
import { changeCellToKind, runDeleteAction } from './cellOperations.js';
import { CELL_TITLE_CELL_GROUP_ID, CELL_TITLE_OUTPUT_GROUP_ID, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NotebookAction, NotebookCellAction, NotebookMultiCellAction, executeNotebookCondition, findTargetCellEditor } from './coreActions.js';
import { NotebookChangeTabDisplaySize, NotebookIndentUsingSpaces, NotebookIndentUsingTabs, NotebookIndentationToSpacesAction, NotebookIndentationToTabsAction } from './notebookIndentationActions.js';
import { CHANGE_CELL_LANGUAGE, CellEditState, DETECT_CELL_LANGUAGE, QUIT_EDIT_CELL_COMMAND_ID, getNotebookEditorFromEditorPane } from '../notebookBrowser.js';
import * as icons from '../notebookIcons.js';
import { CellKind, NotebookCellExecutionState, NotebookSetting } from '../../common/notebookCommon.js';
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_IS_FIRST_OUTPUT, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON } from '../../common/notebookContextKeys.js';
import { INotebookExecutionStateService } from '../../common/notebookExecutionStateService.js';
import { INotebookKernelService } from '../../common/notebookKernelService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ILanguageDetectionService } from '../../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { NotebookInlineVariablesController } from '../contrib/notebookVariables/notebookInlineVariables.js';
const CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID = 'notebook.clearAllCellsOutputs';
const EDIT_CELL_COMMAND_ID = 'notebook.cell.edit';
const DELETE_CELL_COMMAND_ID = 'notebook.cell.delete';
const QUIT_EDIT_ALL_CELLS_COMMAND_ID = 'notebook.quitEditAllCells';
export const CLEAR_CELL_OUTPUTS_COMMAND_ID = 'notebook.cell.clearOutputs';
export const SELECT_NOTEBOOK_INDENTATION_ID = 'notebook.selectIndentation';
export const COMMENT_SELECTED_CELLS_ID = 'notebook.commentSelectedCells';
registerAction2(class EditCellAction extends NotebookCellAction {
    constructor() {
        super({
            id: EDIT_CELL_COMMAND_ID,
            title: localize('notebookActions.editCell', "Edit Cell"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), EditorContextKeys.hoverFocused.toNegated(), NOTEBOOK_OUTPUT_INPUT_FOCUSED.toNegated()),
                primary: 3 /* KeyCode.Enter */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true), NOTEBOOK_CELL_TYPE.isEqualTo('markup'), NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.toNegated(), NOTEBOOK_CELL_EDITABLE),
                order: 1 /* CellToolbarOrder.EditCell */,
                group: CELL_TITLE_CELL_GROUP_ID
            },
            icon: icons.editIcon,
        });
    }
    async runWithContext(accessor, context) {
        if (!context.notebookEditor.hasModel()) {
            return;
        }
        await context.notebookEditor.focusNotebookCell(context.cell, 'editor');
        const foundEditor = context.cell ? findTargetCellEditor(context, context.cell) : undefined;
        if (foundEditor && foundEditor.hasTextFocus() && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === foundEditor.getPosition()?.lineNumber) {
            InlineChatController.get(foundEditor)?.focus();
        }
    }
});
const quitEditCondition = ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext, CTX_INLINE_CHAT_FOCUSED.toNegated());
registerAction2(class QuitEditCellAction extends NotebookCellAction {
    constructor() {
        super({
            id: QUIT_EDIT_CELL_COMMAND_ID,
            title: localize('notebookActions.quitEdit', "Stop Editing Cell"),
            menu: {
                id: MenuId.NotebookCellTitle,
                when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('markup'), NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_EDITABLE),
                order: 4 /* CellToolbarOrder.SaveCell */,
                group: CELL_TITLE_CELL_GROUP_ID
            },
            icon: icons.stopEditIcon,
            keybinding: [
                {
                    when: ContextKeyExpr.and(quitEditCondition, EditorContextKeys.hoverVisible.toNegated(), EditorContextKeys.hasNonEmptySelection.toNegated(), EditorContextKeys.hasMultipleSelections.toNegated()),
                    primary: 9 /* KeyCode.Escape */,
                    weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
                },
                {
                    when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
                    primary: 9 /* KeyCode.Escape */,
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 5
                },
                {
                    when: ContextKeyExpr.and(quitEditCondition, NOTEBOOK_CELL_TYPE.isEqualTo('markup')),
                    primary: 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */,
                    win: {
                        primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */
                    },
                    weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
                },
            ]
        });
    }
    async runWithContext(accessor, context) {
        if (context.cell.cellKind === CellKind.Markup) {
            context.cell.updateEditState(CellEditState.Preview, QUIT_EDIT_CELL_COMMAND_ID);
        }
        await context.notebookEditor.focusNotebookCell(context.cell, 'container', { skipReveal: true });
    }
});
registerAction2(class QuitEditAllCellsAction extends NotebookAction {
    constructor() {
        super({
            id: QUIT_EDIT_ALL_CELLS_COMMAND_ID,
            title: localize('notebookActions.quitEditAllCells', "Stop Editing All Cells")
        });
    }
    async runWithContext(accessor, context) {
        if (!context.notebookEditor.hasModel()) {
            return;
        }
        const viewModel = context.notebookEditor.getViewModel();
        if (!viewModel) {
            return;
        }
        const activeCell = context.notebookEditor.getActiveCell();
        const editingCells = viewModel.viewCells.filter(cell => cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Editing);
        editingCells.forEach(cell => {
            cell.updateEditState(CellEditState.Preview, QUIT_EDIT_ALL_CELLS_COMMAND_ID);
        });
        if (activeCell) {
            await context.notebookEditor.focusNotebookCell(activeCell, 'container', { skipReveal: true });
        }
    }
});
registerAction2(class DeleteCellAction extends NotebookCellAction {
    constructor() {
        super({
            id: DELETE_CELL_COMMAND_ID,
            title: localize('notebookActions.deleteCell', "Delete Cell"),
            keybinding: {
                primary: 20 /* KeyCode.Delete */,
                mac: {
                    primary: 2048 /* KeyMod.CtrlCmd */ | 1 /* KeyCode.Backspace */
                },
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_INPUT_FOCUSED.toNegated()),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            menu: [
                {
                    id: MenuId.NotebookCellDelete,
                    when: NOTEBOOK_EDITOR_EDITABLE,
                    group: CELL_TITLE_CELL_GROUP_ID
                },
                {
                    id: MenuId.InteractiveCellDelete,
                    group: CELL_TITLE_CELL_GROUP_ID
                }
            ],
            icon: icons.deleteCellIcon
        });
    }
    async runWithContext(accessor, context) {
        if (!context.notebookEditor.hasModel()) {
            return;
        }
        let confirmation;
        const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
        const runState = notebookExecutionStateService.getCellExecution(context.cell.uri)?.state;
        const configService = accessor.get(IConfigurationService);
        if (runState === NotebookCellExecutionState.Executing && configService.getValue(NotebookSetting.confirmDeleteRunningCell)) {
            const dialogService = accessor.get(IDialogService);
            const primaryButton = localize('confirmDeleteButton', "Delete");
            confirmation = await dialogService.confirm({
                type: 'question',
                message: localize('confirmDeleteButtonMessage', "This cell is running, are you sure you want to delete it?"),
                primaryButton: primaryButton,
                checkbox: {
                    label: localize('doNotAskAgain', "Do not ask me again")
                }
            });
        }
        else {
            confirmation = { confirmed: true };
        }
        if (!confirmation.confirmed) {
            return;
        }
        if (confirmation.checkboxChecked === true) {
            await configService.updateValue(NotebookSetting.confirmDeleteRunningCell, false);
        }
        runDeleteAction(context.notebookEditor, context.cell);
    }
});
registerAction2(class ClearCellOutputsAction extends NotebookCellAction {
    constructor() {
        super({
            id: CLEAR_CELL_OUTPUTS_COMMAND_ID,
            title: localize('clearCellOutputs', 'Clear Cell Outputs'),
            menu: [
                {
                    id: MenuId.NotebookCellTitle,
                    when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo('code'), executeNotebookCondition, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON.toNegated()),
                    order: 6 /* CellToolbarOrder.ClearCellOutput */,
                    group: CELL_TITLE_OUTPUT_GROUP_ID
                },
                {
                    id: MenuId.NotebookOutputToolbar,
                    when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_IS_FIRST_OUTPUT, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON)
                },
            ],
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
                primary: 512 /* KeyMod.Alt */ | 20 /* KeyCode.Delete */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            },
            icon: icons.clearIcon
        });
    }
    async runWithContext(accessor, context) {
        const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
        const editor = context.notebookEditor;
        if (!editor.hasModel() || !editor.textModel.length) {
            return;
        }
        const cell = context.cell;
        const index = editor.textModel.cells.indexOf(cell.model);
        if (index < 0) {
            return;
        }
        const computeUndoRedo = !editor.isReadOnly;
        editor.textModel.applyEdits([{ editType: 2 /* CellEditType.Output */, index, outputs: [] }], true, undefined, () => undefined, undefined, computeUndoRedo);
        const runState = notebookExecutionStateService.getCellExecution(context.cell.uri)?.state;
        if (runState !== NotebookCellExecutionState.Executing) {
            context.notebookEditor.textModel.applyEdits([{
                    editType: 9 /* CellEditType.PartialInternalMetadata */, index, internalMetadata: {
                        runStartTime: null,
                        runStartTimeAdjustment: null,
                        runEndTime: null,
                        executionOrder: null,
                        lastRunSuccess: null
                    }
                }], true, undefined, () => undefined, undefined, computeUndoRedo);
        }
    }
});
registerAction2(class ClearAllCellOutputsAction extends NotebookAction {
    constructor() {
        super({
            id: CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID,
            title: localize('clearAllCellsOutputs', 'Clear All Outputs'),
            precondition: NOTEBOOK_HAS_OUTPUTS,
            menu: [
                {
                    id: MenuId.EditorTitle,
                    when: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, ContextKeyExpr.notEquals('config.notebook.globalToolbar', true)),
                    group: 'navigation',
                    order: 0
                },
                {
                    id: MenuId.NotebookToolbar,
                    when: ContextKeyExpr.and(executeNotebookCondition, ContextKeyExpr.equals('config.notebook.globalToolbar', true)),
                    group: 'navigation/execute',
                    order: 10
                }
            ],
            icon: icons.clearIcon
        });
    }
    async runWithContext(accessor, context) {
        const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
        const editor = context.notebookEditor;
        if (!editor.hasModel() || !editor.textModel.length) {
            return;
        }
        const computeUndoRedo = !editor.isReadOnly;
        editor.textModel.applyEdits(editor.textModel.cells.map((cell, index) => ({
            editType: 2 /* CellEditType.Output */, index, outputs: []
        })), true, undefined, () => undefined, undefined, computeUndoRedo);
        const clearExecutionMetadataEdits = editor.textModel.cells.map((cell, index) => {
            const runState = notebookExecutionStateService.getCellExecution(cell.uri)?.state;
            if (runState !== NotebookCellExecutionState.Executing) {
                return {
                    editType: 9 /* CellEditType.PartialInternalMetadata */, index, internalMetadata: {
                        runStartTime: null,
                        runStartTimeAdjustment: null,
                        runEndTime: null,
                        executionOrder: null,
                        lastRunSuccess: null
                    }
                };
            }
            else {
                return undefined;
            }
        }).filter(edit => !!edit);
        if (clearExecutionMetadataEdits.length) {
            context.notebookEditor.textModel.applyEdits(clearExecutionMetadataEdits, true, undefined, () => undefined, undefined, computeUndoRedo);
        }
        const controller = editor.getContribution(NotebookInlineVariablesController.id);
        controller.clearNotebookInlineDecorations();
    }
});
registerAction2(class ChangeCellLanguageAction extends NotebookCellAction {
    constructor() {
        super({
            id: CHANGE_CELL_LANGUAGE,
            title: localize('changeLanguage', 'Change Cell Language'),
            keybinding: {
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 43 /* KeyCode.KeyM */),
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE)
            },
            metadata: {
                description: localize('changeLanguage', 'Change Cell Language'),
                args: [
                    {
                        name: 'range',
                        description: 'The cell range',
                        schema: {
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
                    },
                    {
                        name: 'language',
                        description: 'The target cell language',
                        schema: {
                            'type': 'string'
                        }
                    }
                ]
            }
        });
    }
    getCellContextFromArgs(accessor, context, ...additionalArgs) {
        if (!context || typeof context.start !== 'number' || typeof context.end !== 'number' || context.start >= context.end) {
            return;
        }
        const language = additionalArgs.length && typeof additionalArgs[0] === 'string' ? additionalArgs[0] : undefined;
        const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);
        if (!activeEditorContext || !activeEditorContext.notebookEditor.hasModel() || context.start >= activeEditorContext.notebookEditor.getLength()) {
            return;
        }
        // TODO@rebornix, support multiple cells
        return {
            notebookEditor: activeEditorContext.notebookEditor,
            cell: activeEditorContext.notebookEditor.cellAt(context.start),
            language
        };
    }
    async runWithContext(accessor, context) {
        if (context.language) {
            await this.setLanguage(context, context.language);
        }
        else {
            await this.showLanguagePicker(accessor, context);
        }
    }
    async showLanguagePicker(accessor, context) {
        const topItems = [];
        const mainItems = [];
        const languageService = accessor.get(ILanguageService);
        const modelService = accessor.get(IModelService);
        const quickInputService = accessor.get(IQuickInputService);
        const languageDetectionService = accessor.get(ILanguageDetectionService);
        const kernelService = accessor.get(INotebookKernelService);
        let languages = context.notebookEditor.activeKernel?.supportedLanguages;
        if (!languages) {
            const matchResult = kernelService.getMatchingKernel(context.notebookEditor.textModel);
            const allSupportedLanguages = matchResult.all.flatMap(kernel => kernel.supportedLanguages);
            languages = allSupportedLanguages.length > 0 ? allSupportedLanguages : languageService.getRegisteredLanguageIds();
        }
        const providerLanguages = new Set([
            ...languages,
            'markdown'
        ]);
        providerLanguages.forEach(languageId => {
            let description;
            if (context.cell.cellKind === CellKind.Markup ? (languageId === 'markdown') : (languageId === context.cell.language)) {
                description = localize('languageDescription', "({0}) - Current Language", languageId);
            }
            else {
                description = localize('languageDescriptionConfigured', "({0})", languageId);
            }
            const languageName = languageService.getLanguageName(languageId);
            if (!languageName) {
                // Notebook has unrecognized language
                return;
            }
            const item = {
                label: languageName,
                iconClasses: getIconClasses(modelService, languageService, this.getFakeResource(languageName, languageService)),
                description,
                languageId
            };
            if (languageId === 'markdown' || languageId === context.cell.language) {
                topItems.push(item);
            }
            else {
                mainItems.push(item);
            }
        });
        mainItems.sort((a, b) => {
            return a.description.localeCompare(b.description);
        });
        // Offer to "Auto Detect"
        const autoDetectMode = {
            label: localize('autoDetect', "Auto Detect")
        };
        const picks = [
            autoDetectMode,
            { type: 'separator', label: localize('languagesPicks', "languages (identifier)") },
            ...topItems,
            { type: 'separator' },
            ...mainItems
        ];
        const selection = await quickInputService.pick(picks, { placeHolder: localize('pickLanguageToConfigure', "Select Language Mode") });
        const languageId = selection === autoDetectMode
            ? await languageDetectionService.detectLanguage(context.cell.uri)
            : selection?.languageId;
        if (languageId) {
            await this.setLanguage(context, languageId);
        }
    }
    async setLanguage(context, languageId) {
        await setCellToLanguage(languageId, context);
    }
    /**
     * Copied from editorStatus.ts
     */
    getFakeResource(lang, languageService) {
        let fakeResource;
        const languageId = languageService.getLanguageIdByLanguageName(lang);
        if (languageId) {
            const extensions = languageService.getExtensions(languageId);
            if (extensions.length) {
                fakeResource = URI.file(extensions[0]);
            }
            else {
                const filenames = languageService.getFilenames(languageId);
                if (filenames.length) {
                    fakeResource = URI.file(filenames[0]);
                }
            }
        }
        return fakeResource;
    }
});
registerAction2(class DetectCellLanguageAction extends NotebookCellAction {
    constructor() {
        super({
            id: DETECT_CELL_LANGUAGE,
            title: localize2('detectLanguage', "Accept Detected Language for Cell"),
            f1: true,
            precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
            keybinding: { primary: 34 /* KeyCode.KeyD */ | 512 /* KeyMod.Alt */ | 1024 /* KeyMod.Shift */, weight: 200 /* KeybindingWeight.WorkbenchContrib */ }
        });
    }
    async runWithContext(accessor, context) {
        const languageDetectionService = accessor.get(ILanguageDetectionService);
        const notificationService = accessor.get(INotificationService);
        const kernelService = accessor.get(INotebookKernelService);
        const kernel = kernelService.getSelectedOrSuggestedKernel(context.notebookEditor.textModel);
        const providerLanguages = [...kernel?.supportedLanguages ?? []];
        providerLanguages.push('markdown');
        const detection = await languageDetectionService.detectLanguage(context.cell.uri, providerLanguages);
        if (detection) {
            setCellToLanguage(detection, context);
        }
        else {
            notificationService.warn(localize('noDetection', "Unable to detect cell language"));
        }
    }
});
async function setCellToLanguage(languageId, context) {
    if (languageId === 'markdown' && context.cell?.language !== 'markdown') {
        const idx = context.notebookEditor.getCellIndex(context.cell);
        await changeCellToKind(CellKind.Markup, { cell: context.cell, notebookEditor: context.notebookEditor, ui: true }, 'markdown', Mimes.markdown);
        const newCell = context.notebookEditor.cellAt(idx);
        if (newCell) {
            await context.notebookEditor.focusNotebookCell(newCell, 'editor');
        }
    }
    else if (languageId !== 'markdown' && context.cell?.cellKind === CellKind.Markup) {
        await changeCellToKind(CellKind.Code, { cell: context.cell, notebookEditor: context.notebookEditor, ui: true }, languageId);
    }
    else {
        const index = context.notebookEditor.textModel.cells.indexOf(context.cell.model);
        context.notebookEditor.textModel.applyEdits([{ editType: 4 /* CellEditType.CellLanguage */, index, language: languageId }], true, undefined, () => undefined, undefined, !context.notebookEditor.isReadOnly);
    }
}
registerAction2(class SelectNotebookIndentation extends NotebookAction {
    constructor() {
        super({
            id: SELECT_NOTEBOOK_INDENTATION_ID,
            title: localize2('selectNotebookIndentation', 'Select Indentation'),
            f1: true,
            precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
        });
    }
    async runWithContext(accessor, context) {
        await this.showNotebookIndentationPicker(accessor, context);
    }
    async showNotebookIndentationPicker(accessor, context) {
        const quickInputService = accessor.get(IQuickInputService);
        const editorService = accessor.get(IEditorService);
        const instantiationService = accessor.get(IInstantiationService);
        const activeNotebook = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!activeNotebook || activeNotebook.isDisposed) {
            return quickInputService.pick([{ label: localize('noNotebookEditor', "No notebook editor active at this time") }]);
        }
        if (activeNotebook.isReadOnly) {
            return quickInputService.pick([{ label: localize('noWritableCodeEditor', "The active notebook editor is read-only.") }]);
        }
        const picks = [
            new NotebookIndentUsingTabs(), // indent using tabs
            new NotebookIndentUsingSpaces(), // indent using spaces
            new NotebookChangeTabDisplaySize(), // change tab size
            new NotebookIndentationToTabsAction(), // convert indentation to tabs
            new NotebookIndentationToSpacesAction() // convert indentation to spaces
        ].map(item => {
            return {
                id: item.desc.id,
                label: item.desc.title.toString(),
                run: () => {
                    instantiationService.invokeFunction(item.run);
                }
            };
        });
        picks.splice(3, 0, { type: 'separator', label: localize('indentConvert', "convert file") });
        picks.unshift({ type: 'separator', label: localize('indentView', "change view") });
        const action = await quickInputService.pick(picks, { placeHolder: localize('pickAction', "Select Action"), matchOnDetail: true });
        if (!action) {
            return;
        }
        action.run();
        context.notebookEditor.focus();
        return;
    }
});
registerAction2(class CommentSelectedCellsAction extends NotebookMultiCellAction {
    constructor() {
        super({
            id: COMMENT_SELECTED_CELLS_ID,
            title: localize('commentSelectedCells', "Comment Selected Cells"),
            keybinding: {
                when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, ContextKeyExpr.not(InputFocusedContextKey)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const languageConfigurationService = accessor.get(ILanguageConfigurationService);
        context.selectedCells.forEach(async (cellViewModel) => {
            const textModel = await cellViewModel.resolveTextModel();
            const commentsOptions = cellViewModel.commentOptions;
            const cellCommentCommand = new LineCommentCommand(languageConfigurationService, new Selection(1, 1, textModel.getLineCount(), textModel.getLineMaxColumn(textModel.getLineCount())), // comment the entire cell
            textModel.getOptions().tabSize, 0 /* Type.Toggle */, commentsOptions.insertSpace ?? true, commentsOptions.ignoreEmptyLines ?? true, false);
            // store any selections that are in the cell, allows them to be shifted by comments and preserved
            const cellEditorSelections = cellViewModel.getSelections();
            const initialTrackedRangesIDs = cellEditorSelections.map(selection => {
                return textModel._setTrackedRange(null, selection, 1 /* TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges */);
            });
            CommandExecutor.executeCommands(textModel, cellEditorSelections, [cellCommentCommand]);
            const newTrackedSelections = initialTrackedRangesIDs.map(i => {
                return textModel._getTrackedRange(i);
            }).filter(r => !!r).map((range) => {
                return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
            });
            cellViewModel.setSelections(newTrackedSelections ?? []);
        }); // end of cells forEach
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvZWRpdEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBbUIsTUFBTSx3Q0FBd0MsQ0FBQztBQUNuRixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDM0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRXhELE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMzRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDdEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdEYsT0FBTyxFQUFFLDZCQUE2QixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFFeEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMvRSxPQUFPLEVBQUUsa0JBQWtCLEVBQVEsTUFBTSxxRUFBcUUsQ0FBQztBQUMvRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVELE9BQU8sRUFBRSxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDNUYsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxt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