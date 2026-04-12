/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { HierarchicalKind } from '../../../../../../base/common/hierarchicalKind.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../../../editor/browser/services/bulkEditService.js';
import { trimTrailingWhitespace } from '../../../../../../editor/common/commands/trimTrailingWhitespaceCommand.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IEditorWorkerService } from '../../../../../../editor/common/services/editorWorker.js';
import { ILanguageFeaturesService } from '../../../../../../editor/common/services/languageFeatures.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from '../../../../../../editor/contrib/codeAction/browser/codeAction.js';
import { CodeActionKind, CodeActionTriggerSource } from '../../../../../../editor/contrib/codeAction/common/types.js';
import { getDocumentFormattingEditsWithSelectedProvider } from '../../../../../../editor/contrib/format/browser/format.js';
import { SnippetController2 } from '../../../../../../editor/contrib/snippet/browser/snippetController2.js';
import { localize } from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { Extensions as WorkbenchContributionsExtensions } from '../../../../../common/contributions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { CellKind, NotebookSetting } from '../../../common/notebookCommon.js';
import { NotebookFileWorkingCopyModel } from '../../../common/notebookEditorModel.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkingCopyFileService } from '../../../../../services/workingCopy/common/workingCopyFileService.js';
import { NotebookMultiCursorController, NotebookMultiCursorState } from '../multicursor/notebookMulticursor.js';
export class NotebookSaveParticipant {
    constructor(_editorService) {
        this._editorService = _editorService;
    }
    canParticipate() {
        const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
        const controller = editor?.getContribution(NotebookMultiCursorController.id);
        if (!controller) {
            return true;
        }
        return controller.getState() !== NotebookMultiCursorState.Editing;
    }
}
let FormatOnSaveParticipant = class FormatOnSaveParticipant {
    constructor(editorWorkerService, languageFeaturesService, instantiationService, textModelService, bulkEditService, configurationService) {
        this.editorWorkerService = editorWorkerService;
        this.languageFeaturesService = languageFeaturesService;
        this.instantiationService = instantiationService;
        this.textModelService = textModelService;
        this.bulkEditService = bulkEditService;
        this.configurationService = configurationService;
    }
    async participate(workingCopy, context, progress, token) {
        if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
            return;
        }
        if (context.reason === 2 /* SaveReason.AUTO */) {
            return undefined;
        }
        const enabled = this.configurationService.getValue(NotebookSetting.formatOnSave);
        if (!enabled) {
            return undefined;
        }
        progress.report({ message: localize('notebookFormatSave.formatting', "Formatting") });
        const notebook = workingCopy.model.notebookModel;
        const formatApplied = await this.instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, progress, token);
        const disposable = new DisposableStore();
        try {
            if (!formatApplied) {
                const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
                    const ref = await this.textModelService.createModelReference(cell.uri);
                    disposable.add(ref);
                    const model = ref.object.textEditorModel;
                    const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(this.editorWorkerService, this.languageFeaturesService, model, 2 /* FormattingMode.Silent */, token);
                    const edits = [];
                    if (formatEdits) {
                        edits.push(...formatEdits.map(edit => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
                        return edits;
                    }
                    return [];
                }));
                await this.bulkEditService.apply(/* edit */ allCellEdits.flat(), { label: localize('formatNotebook', "Format Notebook"), code: 'undoredo.formatNotebook', });
            }
        }
        finally {
            progress.report({ increment: 100 });
            disposable.dispose();
        }
    }
};
FormatOnSaveParticipant = __decorate([
    __param(0, IEditorWorkerService),
    __param(1, ILanguageFeaturesService),
    __param(2, IInstantiationService),
    __param(3, ITextModelService),
    __param(4, IBulkEditService),
    __param(5, IConfigurationService)
], FormatOnSaveParticipant);
let TrimWhitespaceParticipant = class TrimWhitespaceParticipant extends NotebookSaveParticipant {
    constructor(configurationService, editorService, textModelService, bulkEditService) {
        super(editorService);
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.textModelService = textModelService;
        this.bulkEditService = bulkEditService;
    }
    async participate(workingCopy, context, progress, _token) {
        const trimTrailingWhitespaceOption = this.configurationService.getValue('files.trimTrailingWhitespace');
        const trimInRegexAndStrings = this.configurationService.getValue('files.trimTrailingWhitespaceInRegexAndStrings');
        if (trimTrailingWhitespaceOption && this.canParticipate()) {
            await this.doTrimTrailingWhitespace(workingCopy, context.reason === 2 /* SaveReason.AUTO */, trimInRegexAndStrings, progress);
        }
    }
    async doTrimTrailingWhitespace(workingCopy, isAutoSaved, trimInRegexesAndStrings, progress) {
        if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
            return;
        }
        const disposable = new DisposableStore();
        const notebook = workingCopy.model.notebookModel;
        const activeCellEditor = getActiveCellCodeEditor(this.editorService);
        let cursors = [];
        let prevSelection = [];
        try {
            const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
                if (cell.cellKind !== CellKind.Code) {
                    return [];
                }
                const ref = await this.textModelService.createModelReference(cell.uri);
                disposable.add(ref);
                const model = ref.object.textEditorModel;
                const isActiveCell = (activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString());
                if (isActiveCell) {
                    prevSelection = activeCellEditor.getSelections() ?? [];
                    if (isAutoSaved) {
                        cursors = prevSelection.map(s => s.getPosition()); // get initial cursor positions
                        const snippetsRange = SnippetController2.get(activeCellEditor)?.getSessionEnclosingRange();
                        if (snippetsRange) {
                            for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
                                cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
                            }
                        }
                    }
                }
                const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
                if (!ops.length) {
                    return []; // Nothing to do
                }
                return ops.map(op => new ResourceTextEdit(model.uri, { ...op, text: op.text || '' }, model.getVersionId()));
            }));
            const filteredEdits = allCellEdits.flat().filter(edit => edit !== undefined);
            await this.bulkEditService.apply(filteredEdits, { label: localize('trimNotebookWhitespace', "Notebook Trim Trailing Whitespace"), code: 'undoredo.notebookTrimTrailingWhitespace' });
        }
        finally {
            progress.report({ increment: 100 });
            disposable.dispose();
        }
    }
};
TrimWhitespaceParticipant = __decorate([
    __param(0, IConfigurationService),
    __param(1, IEditorService),
    __param(2, ITextModelService),
    __param(3, IBulkEditService)
], TrimWhitespaceParticipant);
let TrimFinalNewLinesParticipant = class TrimFinalNewLinesParticipant extends NotebookSaveParticipant {
    constructor(configurationService, editorService, bulkEditService) {
        super(editorService);
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.bulkEditService = bulkEditService;
    }
    async participate(workingCopy, context, progress, _token) {
        if (this.configurationService.getValue('files.trimFinalNewlines') && this.canParticipate()) {
            await this.doTrimFinalNewLines(workingCopy, context.reason === 2 /* SaveReason.AUTO */, progress);
        }
    }
    /**
     * returns 0 if the entire file is empty
     */
    findLastNonEmptyLine(textBuffer) {
        for (let lineNumber = textBuffer.getLineCount(); lineNumber >= 1; lineNumber--) {
            const lineLength = textBuffer.getLineLength(lineNumber);
            if (lineLength) {
                // this line has content
                return lineNumber;
            }
        }
        // no line has content
        return 0;
    }
    async doTrimFinalNewLines(workingCopy, isAutoSaved, progress) {
        if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
            return;
        }
        const disposable = new DisposableStore();
        const notebook = workingCopy.model.notebookModel;
        const activeCellEditor = getActiveCellCodeEditor(this.editorService);
        try {
            const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
                if (cell.cellKind !== CellKind.Code) {
                    return;
                }
                // autosave -- don't trim every trailing line, just up to the cursor line
                let cannotTouchLineNumber = 0;
                const isActiveCell = (activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString());
                if (isAutoSaved && isActiveCell) {
                    const selections = activeCellEditor.getSelections() ?? [];
                    for (const sel of selections) {
                        cannotTouchLineNumber = Math.max(cannotTouchLineNumber, sel.selectionStartLineNumber);
                    }
                }
                const textBuffer = cell.textBuffer;
                const lastNonEmptyLine = this.findLastNonEmptyLine(textBuffer);
                const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
                if (deleteFromLineNumber > textBuffer.getLineCount()) {
                    return;
                }
                const deletionRange = new Range(deleteFromLineNumber, 1, textBuffer.getLineCount(), textBuffer.getLineLastNonWhitespaceColumn(textBuffer.getLineCount()));
                if (deletionRange.isEmpty()) {
                    return;
                }
                // create the edit to delete all lines in deletionRange
                return new ResourceTextEdit(cell.uri, { range: deletionRange, text: '' }, cell.textModel?.getVersionId());
            }));
            const filteredEdits = allCellEdits.flat().filter(edit => edit !== undefined);
            await this.bulkEditService.apply(filteredEdits, { label: localize('trimNotebookNewlines', "Trim Final New Lines"), code: 'undoredo.trimFinalNewLines' });
        }
        finally {
            progress.report({ increment: 100 });
            disposable.dispose();
        }
    }
};
TrimFinalNewLinesParticipant = __decorate([
    __param(0, IConfigurationService),
    __param(1, IEditorService),
    __param(2, IBulkEditService)
], TrimFinalNewLinesParticipant);
let InsertFinalNewLineParticipant = class InsertFinalNewLineParticipant extends NotebookSaveParticipant {
    constructor(configurationService, bulkEditService, editorService) {
        super(editorService);
        this.configurationService = configurationService;
        this.bulkEditService = bulkEditService;
        this.editorService = editorService;
    }
    async participate(workingCopy, context, progress, _token) {
        // waiting on notebook-specific override before this feature can sync with 'files.insertFinalNewline'
        // if (this.configurationService.getValue('files.insertFinalNewline')) {
        if (this.configurationService.getValue(NotebookSetting.insertFinalNewline) && this.canParticipate()) {
            await this.doInsertFinalNewLine(workingCopy, context.reason === 2 /* SaveReason.AUTO */, progress);
        }
    }
    async doInsertFinalNewLine(workingCopy, isAutoSaved, progress) {
        if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
            return;
        }
        const disposable = new DisposableStore();
        const notebook = workingCopy.model.notebookModel;
        // get initial cursor positions
        const activeCellEditor = getActiveCellCodeEditor(this.editorService);
        let selections;
        if (activeCellEditor) {
            selections = activeCellEditor.getSelections() ?? [];
        }
        try {
            const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
                if (cell.cellKind !== CellKind.Code) {
                    return;
                }
                const lineCount = cell.textBuffer.getLineCount();
                const lastLineIsEmptyOrWhitespace = cell.textBuffer.getLineFirstNonWhitespaceColumn(lineCount) === 0;
                if (!lineCount || lastLineIsEmptyOrWhitespace) {
                    return;
                }
                return new ResourceTextEdit(cell.uri, { range: new Range(lineCount + 1, cell.textBuffer.getLineLength(lineCount), lineCount + 1, cell.textBuffer.getLineLength(lineCount)), text: cell.textBuffer.getEOL() }, cell.textModel?.getVersionId());
            }));
            const filteredEdits = allCellEdits.filter(edit => edit !== undefined);
            await this.bulkEditService.apply(filteredEdits, { label: localize('insertFinalNewLine', "Insert Final New Line"), code: 'undoredo.insertFinalNewLine' });
            // set cursor back to initial position after inserting final new line
            if (activeCellEditor && selections) {
                activeCellEditor.setSelections(selections);
            }
        }
        finally {
            progress.report({ increment: 100 });
            disposable.dispose();
        }
    }
};
InsertFinalNewLineParticipant = __decorate([
    __param(0, IConfigurationService),
    __param(1, IBulkEditService),
    __param(2, IEditorService)
], InsertFinalNewLineParticipant);
let CodeActionOnSaveParticipant = class CodeActionOnSaveParticipant {
    constructor(configurationService, logService, workspaceTrustManagementService, textModelService, instantiationService) {
        this.configurationService = configurationService;
        this.logService = logService;
        this.workspaceTrustManagementService = workspaceTrustManagementService;
        this.textModelService = textModelService;
        this.instantiationService = instantiationService;
    }
    async participate(workingCopy, context, progress, token) {
        const isTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
        if (!isTrusted) {
            return;
        }
        if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
            return;
        }
        let saveTrigger = '';
        if (context.reason === 2 /* SaveReason.AUTO */) {
            // currently this won't happen, as vs/editor/contrib/codeAction/browser/codeAction.ts L#104 filters out codeactions on autosave. Just future-proofing
            // ? notebook CodeActions on autosave seems dangerous (perf-wise)
            // saveTrigger = 'always'; // TODO@Yoyokrazy, support during debt
            return undefined;
        }
        else if (context.reason === 1 /* SaveReason.EXPLICIT */) {
            saveTrigger = 'explicit';
        }
        else {
            // 	SaveReason.FOCUS_CHANGE, WINDOW_CHANGE need to be addressed when autosaves are enabled
            return undefined;
        }
        const notebookModel = workingCopy.model.notebookModel;
        const setting = this.configurationService.getValue(NotebookSetting.codeActionsOnSave);
        const settingItems = Array.isArray(setting)
            ? setting
            : Object.keys(setting).filter(x => setting[x]);
        const allCodeActions = this.createCodeActionsOnSave(settingItems);
        const excludedActions = allCodeActions
            .filter(x => setting[x.value] === 'never' || setting[x.value] === false);
        const includedActions = allCodeActions
            .filter(x => setting[x.value] === saveTrigger || setting[x.value] === true);
        const editorCodeActionsOnSave = includedActions.filter(x => !CodeActionKind.Notebook.contains(x));
        const notebookCodeActionsOnSave = includedActions.filter(x => CodeActionKind.Notebook.contains(x));
        // run notebook code actions
        if (notebookCodeActionsOnSave.length) {
            const nbDisposable = new DisposableStore();
            progress.report({ message: localize('notebookSaveParticipants.notebookCodeActions', "Running 'Notebook' code actions") });
            try {
                const cell = notebookModel.cells[0];
                const ref = await this.textModelService.createModelReference(cell.uri);
                nbDisposable.add(ref);
                const textEditorModel = ref.object.textEditorModel;
                await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, notebookCodeActionsOnSave, excludedActions, progress, token);
            }
            catch {
                this.logService.error('Failed to apply notebook code action on save');
            }
            finally {
                progress.report({ increment: 100 });
                nbDisposable.dispose();
            }
        }
        // run cell level code actions
        if (editorCodeActionsOnSave.length) {
            // prioritize `source.fixAll` code actions
            if (!Array.isArray(setting)) {
                editorCodeActionsOnSave.sort((a, b) => {
                    if (CodeActionKind.SourceFixAll.contains(a)) {
                        if (CodeActionKind.SourceFixAll.contains(b)) {
                            return 0;
                        }
                        return -1;
                    }
                    if (CodeActionKind.SourceFixAll.contains(b)) {
                        return 1;
                    }
                    return 0;
                });
            }
            const cellDisposable = new DisposableStore();
            progress.report({ message: localize('notebookSaveParticipants.cellCodeActions', "Running 'Cell' code actions") });
            try {
                await Promise.all(notebookModel.cells.map(async (cell) => {
                    const ref = await this.textModelService.createModelReference(cell.uri);
                    cellDisposable.add(ref);
                    const textEditorModel = ref.object.textEditorModel;
                    await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, editorCodeActionsOnSave, excludedActions, progress, token);
                }));
            }
            catch {
                this.logService.error('Failed to apply code action on save');
            }
            finally {
                progress.report({ increment: 100 });
                cellDisposable.dispose();
            }
        }
    }
    createCodeActionsOnSave(settingItems) {
        const kinds = settingItems.map(x => new HierarchicalKind(x));
        // Remove subsets
        return kinds.filter(kind => {
            return kinds.every(otherKind => otherKind.equals(kind) || !otherKind.contains(kind));
        });
    }
};
CodeActionOnSaveParticipant = __decorate([
    __param(0, IConfigurationService),
    __param(1, ILogService),
    __param(2, IWorkspaceTrustManagementService),
    __param(3, ITextModelService),
    __param(4, IInstantiationService)
], CodeActionOnSaveParticipant);
export class CodeActionParticipantUtils {
    static async checkAndRunFormatCodeAction(accessor, notebookModel, progress, token) {
        const instantiationService = accessor.get(IInstantiationService);
        const textModelService = accessor.get(ITextModelService);
        const logService = accessor.get(ILogService);
        const configurationService = accessor.get(IConfigurationService);
        const formatDisposable = new DisposableStore();
        let formatResult = false;
        progress.report({ message: localize('notebookSaveParticipants.formatCodeActions', "Running 'Format' code actions") });
        try {
            const cell = notebookModel.cells[0];
            const ref = await textModelService.createModelReference(cell.uri);
            formatDisposable.add(ref);
            const textEditorModel = ref.object.textEditorModel;
            const defaultFormatterExtId = configurationService.getValue(NotebookSetting.defaultFormatter);
            formatResult = await instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveFormatCodeAction, textEditorModel, new HierarchicalKind('notebook.format'), [], defaultFormatterExtId, progress, token);
        }
        catch {
            logService.error('Failed to apply notebook format action on save');
        }
        finally {
            progress.report({ increment: 100 });
            formatDisposable.dispose();
        }
        return formatResult;
    }
    static async applyOnSaveGenericCodeActions(accessor, model, codeActionsOnSave, excludes, progress, token) {
        const instantiationService = accessor.get(IInstantiationService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const logService = accessor.get(ILogService);
        const getActionProgress = new class {
            constructor() {
                this._names = new Set();
            }
            _report() {
                progress.report({
                    message: localize({ key: 'codeaction.get2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] }, "Getting code actions from '{0}' ([configure]({1})).", [...this._names].map(name => `'${name}'`).join(', '), 'command:workbench.action.openSettings?%5B%22notebook.codeActionsOnSave%22%5D')
                });
            }
            report(provider) {
                if (provider.displayName && !this._names.has(provider.displayName)) {
                    this._names.add(provider.displayName);
                    this._report();
                }
            }
        };
        for (const codeActionKind of codeActionsOnSave) {
            const actionsToRun = await CodeActionParticipantUtils.getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, getActionProgress, token);
            if (token.isCancellationRequested) {
                actionsToRun.dispose();
                return;
            }
            try {
                for (const action of actionsToRun.validActions) {
                    const codeActionEdits = action.action.edit?.edits;
                    let breakFlag = false;
                    if (!action.action.kind?.startsWith('notebook')) {
                        for (const edit of codeActionEdits ?? []) {
                            const workspaceTextEdit = edit;
                            if (workspaceTextEdit.resource && isEqual(workspaceTextEdit.resource, model.uri)) {
                                continue;
                            }
                            else {
                                // error -> applied to multiple resources
                                breakFlag = true;
                                break;
                            }
                        }
                    }
                    if (breakFlag) {
                        logService.warn('Failed to apply code action on save, applied to multiple resources.');
                        continue;
                    }
                    progress.report({ message: localize('codeAction.apply', "Applying code action '{0}'.", action.action.title) });
                    await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
                    if (token.isCancellationRequested) {
                        return;
                    }
                }
            }
            catch {
                // Failure to apply a code action should not block other on save actions
            }
            finally {
                actionsToRun.dispose();
            }
        }
    }
    static async applyOnSaveFormatCodeAction(accessor, model, formatCodeActionOnSave, excludes, extensionId, progress, token) {
        const instantiationService = accessor.get(IInstantiationService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const logService = accessor.get(ILogService);
        const getActionProgress = new class {
            constructor() {
                this._names = new Set();
            }
            _report() {
                progress.report({
                    message: localize({ key: 'codeaction.get2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] }, "Getting code actions from '{0}' ([configure]({1})).", [...this._names].map(name => `'${name}'`).join(', '), 'command:workbench.action.openSettings?%5B%22notebook.defaultFormatter%22%5D')
                });
            }
            report(provider) {
                if (provider.displayName && !this._names.has(provider.displayName)) {
                    this._names.add(provider.displayName);
                    this._report();
                }
            }
        };
        const providedActions = await CodeActionParticipantUtils.getActionsToRun(model, formatCodeActionOnSave, excludes, languageFeaturesService, getActionProgress, token);
        // warn the user if there are more than one provided format action, and there is no specified defaultFormatter
        if (providedActions.validActions.length > 1 && !extensionId) {
            logService.warn('More than one format code action is provided, the 0th one will be used. A default can be specified via `notebook.defaultFormatter` in your settings.');
        }
        if (token.isCancellationRequested) {
            providedActions.dispose();
            return false;
        }
        try {
            const action = extensionId ? providedActions.validActions.find(action => action.provider?.extensionId === extensionId) : providedActions.validActions[0];
            if (!action) {
                return false;
            }
            progress.report({ message: localize('codeAction.apply', "Applying code action '{0}'.", action.action.title) });
            await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
            if (token.isCancellationRequested) {
                return false;
            }
        }
        catch {
            logService.error('Failed to apply notebook format code action on save');
            return false;
        }
        finally {
            providedActions.dispose();
        }
        return true;
    }
    // @Yoyokrazy this could likely be modified to leverage the extensionID, therefore not getting actions from providers unnecessarily -- future work
    static getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, progress, token) {
        return getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
            type: 1 /* CodeActionTriggerType.Invoke */,
            triggerAction: CodeActionTriggerSource.OnSave,
            filter: { include: codeActionKind, excludes: excludes, includeSourceActions: true },
        }, progress, token);
    }
}
function getActiveCellCodeEditor(editorService) {
    const activePane = editorService.activeEditorPane;
    const notebookEditor = getNotebookEditorFromEditorPane(activePane);
    const activeCodeEditor = notebookEditor?.activeCodeEditor;
    return activeCodeEditor;
}
let SaveParticipantsContribution = class SaveParticipantsContribution extends Disposable {
    constructor(instantiationService, workingCopyFileService) {
        super();
        this.instantiationService = instantiationService;
        this.workingCopyFileService = workingCopyFileService;
        this.registerSaveParticipants();
    }
    registerSaveParticipants() {
        this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
        this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
        this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
        this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(InsertFinalNewLineParticipant)));
        this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
    }
};
SaveParticipantsContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkingCopyFileService)
], SaveParticipantsContribution);
export { SaveParticipantsContribution };
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2F2ZVBhcnRpY2lwYW50cy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9zYXZlUGFydGljaXBhbnRzL3NhdmVQYXJ0aWNpcGFudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDckYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFFckUsT0FBTyxFQUFFLGdCQUFnQixFQUFnQixnQkFBZ0IsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBQ25ILE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUM1RSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFJdEUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDeEcsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkRBQTZELENBQUM7QUFDaEcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLGVBQWUsRUFBRSxjQUFjLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUMzSSxPQUFPLEVBQWtCLGNBQWMsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3RJLE9BQU8sRUFBa0IsOENBQThDLEVBQUUsTUFBTSwyREFBMkQsQ0FBQztBQUMzSSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUs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