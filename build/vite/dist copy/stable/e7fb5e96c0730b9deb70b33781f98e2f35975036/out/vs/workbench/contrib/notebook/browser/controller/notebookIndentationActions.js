/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../../nls.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { INotebookEditorService } from '../services/notebookEditorService.js';
import { NotebookSetting } from '../../common/notebookCommon.js';
import { isNotebookEditorInput } from '../../common/notebookEditorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
export class NotebookIndentUsingTabs extends Action2 {
    static { this.ID = 'notebook.action.indentUsingTabs'; }
    constructor() {
        super({
            id: NotebookIndentUsingTabs.ID,
            title: nls.localize('indentUsingTabs', "Indent Using Tabs"),
            precondition: undefined,
        });
    }
    run(accessor, ...args) {
        changeNotebookIndentation(accessor, false, false);
    }
}
export class NotebookIndentUsingSpaces extends Action2 {
    static { this.ID = 'notebook.action.indentUsingSpaces'; }
    constructor() {
        super({
            id: NotebookIndentUsingSpaces.ID,
            title: nls.localize('indentUsingSpaces', "Indent Using Spaces"),
            precondition: undefined,
        });
    }
    run(accessor, ...args) {
        changeNotebookIndentation(accessor, true, false);
    }
}
export class NotebookChangeTabDisplaySize extends Action2 {
    static { this.ID = 'notebook.action.changeTabDisplaySize'; }
    constructor() {
        super({
            id: NotebookChangeTabDisplaySize.ID,
            title: nls.localize('changeTabDisplaySize', "Change Tab Display Size"),
            precondition: undefined,
        });
    }
    run(accessor, ...args) {
        changeNotebookIndentation(accessor, true, true);
    }
}
export class NotebookIndentationToSpacesAction extends Action2 {
    static { this.ID = 'notebook.action.convertIndentationToSpaces'; }
    constructor() {
        super({
            id: NotebookIndentationToSpacesAction.ID,
            title: nls.localize('convertIndentationToSpaces', "Convert Indentation to Spaces"),
            precondition: undefined,
        });
    }
    run(accessor, ...args) {
        convertNotebookIndentation(accessor, true);
    }
}
export class NotebookIndentationToTabsAction extends Action2 {
    static { this.ID = 'notebook.action.convertIndentationToTabs'; }
    constructor() {
        super({
            id: NotebookIndentationToTabsAction.ID,
            title: nls.localize('convertIndentationToTabs', "Convert Indentation to Tabs"),
            precondition: undefined,
        });
    }
    run(accessor, ...args) {
        convertNotebookIndentation(accessor, false);
    }
}
function changeNotebookIndentation(accessor, insertSpaces, displaySizeOnly) {
    const editorService = accessor.get(IEditorService);
    const configurationService = accessor.get(IConfigurationService);
    const notebookEditorService = accessor.get(INotebookEditorService);
    const quickInputService = accessor.get(IQuickInputService);
    // keep this check here to pop on non-notebook actions
    const activeInput = editorService.activeEditorPane?.input;
    const isNotebook = isNotebookEditorInput(activeInput);
    if (!isNotebook) {
        return;
    }
    // get notebook editor to access all codeEditors
    const notebookEditor = notebookEditorService.retrieveExistingWidgetFromURI(activeInput.resource)?.value;
    if (!notebookEditor) {
        return;
    }
    const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
        id: n.toString(),
        label: n.toString(),
    }));
    // store the initial values of the configuration
    const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations);
    const initialInsertSpaces = initialConfig['editor.insertSpaces'];
    // remove the initial values from the configuration
    delete initialConfig['editor.indentSize'];
    delete initialConfig['editor.tabSize'];
    delete initialConfig['editor.insertSpaces'];
    setTimeout(() => {
        quickInputService.pick(picks, { placeHolder: nls.localize({ key: 'selectTabWidth', comment: ['Tab corresponds to the tab key'] }, "Select Tab Size for Current File") }).then(pick => {
            if (pick) {
                const pickedVal = parseInt(pick.label, 10);
                if (displaySizeOnly) {
                    configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
                        ...initialConfig,
                        'editor.tabSize': pickedVal,
                        'editor.indentSize': pickedVal,
                        'editor.insertSpaces': initialInsertSpaces
                    });
                }
                else {
                    configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
                        ...initialConfig,
                        'editor.tabSize': pickedVal,
                        'editor.indentSize': pickedVal,
                        'editor.insertSpaces': insertSpaces
                    });
                }
            }
        });
    }, 50 /* quick input is sensitive to being opened so soon after another */);
}
function convertNotebookIndentation(accessor, tabsToSpaces) {
    const editorService = accessor.get(IEditorService);
    const configurationService = accessor.get(IConfigurationService);
    const logService = accessor.get(ILogService);
    const textModelService = accessor.get(ITextModelService);
    const notebookEditorService = accessor.get(INotebookEditorService);
    const bulkEditService = accessor.get(IBulkEditService);
    // keep this check here to pop on non-notebook
    const activeInput = editorService.activeEditorPane?.input;
    const isNotebook = isNotebookEditorInput(activeInput);
    if (!isNotebook) {
        return;
    }
    // get notebook editor to access all codeEditors
    const notebookTextModel = notebookEditorService.retrieveExistingWidgetFromURI(activeInput.resource)?.value?.textModel;
    if (!notebookTextModel) {
        return;
    }
    const disposable = new DisposableStore();
    try {
        Promise.all(notebookTextModel.cells.map(async (cell) => {
            const ref = await textModelService.createModelReference(cell.uri);
            disposable.add(ref);
            const textEditorModel = ref.object.textEditorModel;
            const modelOpts = cell.textModel?.getOptions();
            if (!modelOpts) {
                return;
            }
            const edits = getIndentationEditOperations(textEditorModel, modelOpts.tabSize, tabsToSpaces);
            bulkEditService.apply(edits, { label: nls.localize('convertIndentation', "Convert Indentation"), code: 'undoredo.convertIndentation', });
        })).then(() => {
            // store the initial values of the configuration
            const initialConfig = configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations);
            const initialIndentSize = initialConfig['editor.indentSize'];
            const initialTabSize = initialConfig['editor.tabSize'];
            // remove the initial values from the configuration
            delete initialConfig['editor.indentSize'];
            delete initialConfig['editor.tabSize'];
            delete initialConfig['editor.insertSpaces'];
            configurationService.updateValue(NotebookSetting.cellEditorOptionsCustomizations, {
                ...initialConfig,
                'editor.tabSize': initialTabSize,
                'editor.indentSize': initialIndentSize,
                'editor.insertSpaces': tabsToSpaces
            });
            disposable.dispose();
        });
    }
    catch {
        logService.error('Failed to convert indentation to spaces for notebook cells.');
    }
}
function getIndentationEditOperations(model, tabSize, tabsToSpaces) {
    if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
        // Model is empty
        return [];
    }
    let spaces = '';
    for (let i = 0; i < tabSize; i++) {
        spaces += ' ';
    }
    const spacesRegExp = new RegExp(spaces, 'gi');
    const edits = [];
    for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
        let lastIndentationColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
        if (lastIndentationColumn === 0) {
            lastIndentationColumn = model.getLineMaxColumn(lineNumber);
        }
        if (lastIndentationColumn === 1) {
            continue;
        }
        const originalIndentationRange = new Range(lineNumber, 1, lineNumber, lastIndentationColumn);
        const originalIndentation = model.getValueInRange(originalIndentationRange);
        const newIndentation = (tabsToSpaces
            ? originalIndentation.replace(/\t/ig, spaces)
            : originalIndentation.replace(spacesRegExp, '\t'));
        edits.push(new ResourceTextEdit(model.uri, { range: originalIndentationRange, text: newIndentation }));
    }
    return edits;
}
registerAction2(NotebookIndentUsingSpaces);
registerAction2(NotebookIndentUsingTabs);
registerAction2(NotebookChangeTabDisplaySize);
registerAction2(NotebookIndentationToSpacesAction);
registerAction2(NotebookIndentationToTabsAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tJbmRlbnRhdGlvbkFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL2NvbnRyb2xsZXIvbm90ZWJvb2tJbmRlbnRhdGlvbkFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUM3QyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFMUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLGdCQUFnQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFDL0csT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRW5FLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDN0YsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFDdEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHlEQUF5RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNqRSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0scURBQXFELENBQUM7QUFFckYsTUFBTSxPQUFPLHVCQUF3QixTQUFRLE9BQU87YUFDNUIsT0FBRSxHQUFHLGlDQUFpQyxDQUFDO0lBRTlEO1FBQ0MsS0FB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