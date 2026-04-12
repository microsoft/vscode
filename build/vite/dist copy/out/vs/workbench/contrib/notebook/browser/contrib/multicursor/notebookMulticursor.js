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
import { localize } from '../../../../../../nls.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { EditorConfiguration } from '../../../../../../editor/browser/config/editorConfiguration.js';
import { CoreEditingCommands } from '../../../../../../editor/browser/coreCommands.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { cursorBlinkingStyleFromString, cursorStyleFromString, TextEditorCursorStyle } from '../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Selection } from '../../../../../../editor/common/core/selection.js';
import { USUAL_WORD_SEPARATORS } from '../../../../../../editor/common/core/wordHelper.js';
import { CommandExecutor, CursorsController } from '../../../../../../editor/common/cursor/cursor.js';
import { DeleteOperations } from '../../../../../../editor/common/cursor/cursorDeleteOperations.js';
import { CursorConfiguration } from '../../../../../../editor/common/cursorCommon.js';
import { ILanguageConfigurationService } from '../../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { indentOfLine } from '../../../../../../editor/common/model/textModel.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ViewModelEventsCollector } from '../../../../../../editor/common/viewModelEventDispatcher.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IUndoRedoService } from '../../../../../../platform/undoRedo/common/undoRedo.js';
import { registerWorkbenchContribution2 } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { NotebookAction } from '../../controller/coreActions.js';
import { getNotebookEditorFromEditorPane } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CellEditorOptions } from '../../view/cellParts/cellEditorOptions.js';
import { NotebookFindContrib } from '../find/notebookFindWidget.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';
const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = 'notebook.addFindMatchToSelection';
const NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID = 'notebook.selectAllFindMatches';
export var NotebookMultiCursorState;
(function (NotebookMultiCursorState) {
    NotebookMultiCursorState[NotebookMultiCursorState["Idle"] = 0] = "Idle";
    NotebookMultiCursorState[NotebookMultiCursorState["Selecting"] = 1] = "Selecting";
    NotebookMultiCursorState[NotebookMultiCursorState["Editing"] = 2] = "Editing";
})(NotebookMultiCursorState || (NotebookMultiCursorState = {}));
export const NOTEBOOK_MULTI_CURSOR_CONTEXT = {
    IsNotebookMultiCursor: new RawContextKey('isNotebookMultiSelect', false),
    NotebookMultiSelectCursorState: new RawContextKey('notebookMultiSelectCursorState', NotebookMultiCursorState.Idle),
};
let NotebookMultiCursorController = class NotebookMultiCursorController extends Disposable {
    static { this.id = 'notebook.multiCursorController'; }
    getState() {
        return this.state;
    }
    constructor(notebookEditor, contextKeyService, textModelService, languageConfigurationService, accessibilityService, configurationService, undoRedoService) {
        super();
        this.notebookEditor = notebookEditor;
        this.contextKeyService = contextKeyService;
        this.textModelService = textModelService;
        this.languageConfigurationService = languageConfigurationService;
        this.accessibilityService = accessibilityService;
        this.configurationService = configurationService;
        this.undoRedoService = undoRedoService;
        this.word = '';
        this.trackedCells = [];
        this.totalMatchesCount = 0;
        this._onDidChangeAnchorCell = this._register(new Emitter());
        this.onDidChangeAnchorCell = this._onDidChangeAnchorCell.event;
        this.anchorDisposables = this._register(new DisposableStore());
        this.cursorsDisposables = this._register(new DisposableStore());
        this.cursorsControllers = new ResourceMap();
        this.state = NotebookMultiCursorState.Idle;
        this._nbIsMultiSelectSession = NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor.bindTo(this.contextKeyService);
        this._nbMultiSelectState = NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.bindTo(this.contextKeyService);
        this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
        // anchor cell will catch and relay all type, cut, paste events to the cursors controllers
        // need to create new controllers when the anchor cell changes, then update their listeners
        // ** cursor controllers need to happen first, because anchor listeners relay to them
        this._register(this.onDidChangeAnchorCell(async () => {
            await this.syncCursorsControllers();
            this.syncAnchorListeners();
        }));
    }
    syncAnchorListeners() {
        this.anchorDisposables.clear();
        if (!this.anchorCell) {
            throw new Error('Anchor cell is undefined');
        }
        // typing
        this.anchorDisposables.add(this.anchorCell[1].onWillType((input) => {
            const collector = new ViewModelEventsCollector();
            this.trackedCells.forEach(cell => {
                const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
                if (!controller) {
                    // should not happen
                    return;
                }
                if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) { // don't relay to active cell, already has a controller for typing
                    controller.type(collector, input, 'keyboard');
                }
            });
        }));
        this.anchorDisposables.add(this.anchorCell[1].onDidType(() => {
            this.state = NotebookMultiCursorState.Editing; // typing will continue to work as normal across ranges, just preps for another cmd+d
            this._nbMultiSelectState.set(NotebookMultiCursorState.Editing);
            const anchorController = this.cursorsControllers.get(this.anchorCell[0].uri);
            if (!anchorController) {
                return;
            }
            const activeSelections = this.notebookEditor.activeCodeEditor?.getSelections();
            if (!activeSelections) {
                return;
            }
            // need to keep anchor cursor controller in sync manually (for delete usage), since we don't relay type event to it
            anchorController.setSelections(new ViewModelEventsCollector(), 'keyboard', activeSelections, 3 /* CursorChangeReason.Explicit */);
            this.trackedCells.forEach(cell => {
                const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
                if (!controller) {
                    return;
                }
                // this is used upon exiting the multicursor session to set the selections back to the correct cursor state
                cell.initialSelection = controller.getSelection();
                // clear tracked selection data as it is invalid once typing begins
                cell.matchSelections = [];
            });
            this.updateLazyDecorations();
        }));
        // arrow key navigation
        this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorSelection((e) => {
            if (e.source === 'mouse') {
                this.resetToIdleState();
                return;
            }
            // ignore this event if it was caused by a typing event or a delete (NotSet and RecoverFromMarkers respectively)
            if (!e.oldSelections || e.reason === 0 /* CursorChangeReason.NotSet */ || e.reason === 2 /* CursorChangeReason.RecoverFromMarkers */) {
                return;
            }
            const translation = {
                deltaStartCol: e.selection.startColumn - e.oldSelections[0].startColumn,
                deltaStartLine: e.selection.startLineNumber - e.oldSelections[0].startLineNumber,
                deltaEndCol: e.selection.endColumn - e.oldSelections[0].endColumn,
                deltaEndLine: e.selection.endLineNumber - e.oldSelections[0].endLineNumber,
            };
            const translationDir = e.selection.getDirection();
            this.trackedCells.forEach(cell => {
                const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
                if (!controller) {
                    return;
                }
                const newSelections = controller.getSelections().map(selection => {
                    const newStartCol = selection.startColumn + translation.deltaStartCol;
                    const newStartLine = selection.startLineNumber + translation.deltaStartLine;
                    const newEndCol = selection.endColumn + translation.deltaEndCol;
                    const newEndLine = selection.endLineNumber + translation.deltaEndLine;
                    return Selection.createWithDirection(newStartLine, newStartCol, newEndLine, newEndCol, translationDir);
                });
                controller.setSelections(new ViewModelEventsCollector(), e.source, newSelections, 3 /* CursorChangeReason.Explicit */);
            });
            this.updateLazyDecorations();
        }));
        // core actions
        this.anchorDisposables.add(this.anchorCell[1].onWillTriggerEditorOperationEvent((e) => {
            this.handleEditorOperationEvent(e);
        }));
        // exit mode
        this.anchorDisposables.add(this.anchorCell[1].onDidBlurEditorWidget(() => {
            if (this.state === NotebookMultiCursorState.Selecting || this.state === NotebookMultiCursorState.Editing) {
                this.resetToIdleState();
            }
        }));
    }
    async syncCursorsControllers() {
        this.cursorsDisposables.clear(); // TODO: dial this back for perf and just update the relevant controllers
        await Promise.all(this.trackedCells.map(async (cell) => {
            const controller = await this.createCursorController(cell);
            if (!controller) {
                return;
            }
            this.cursorsControllers.set(cell.cellViewModel.uri, controller);
            const selections = cell.matchSelections;
            controller.setSelections(new ViewModelEventsCollector(), undefined, selections, 3 /* CursorChangeReason.Explicit */);
        }));
        this.updateLazyDecorations();
    }
    async createCursorController(cell) {
        const textModelRef = await this.textModelService.createModelReference(cell.cellViewModel.uri);
        const textModel = textModelRef.object.textEditorModel;
        if (!textModel) {
            textModelRef.dispose();
            return undefined;
        }
        this.cursorsDisposables.add(textModelRef);
        const cursorSimpleModel = this.constructCursorSimpleModel(cell.cellViewModel);
        const converter = this.constructCoordinatesConverter();
        const editorConfig = cell.editorConfig;
        const controller = this.cursorsDisposables.add(new CursorsController(textModel, cursorSimpleModel, converter, new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)));
        controller.setSelections(new ViewModelEventsCollector(), undefined, cell.matchSelections, 3 /* CursorChangeReason.Explicit */);
        return controller;
    }
    constructCoordinatesConverter() {
        return {
            convertViewPositionToModelPosition(viewPosition) {
                return viewPosition;
            },
            convertViewRangeToModelRange(viewRange) {
                return viewRange;
            },
            validateViewPosition(viewPosition, expectedModelPosition) {
                return viewPosition;
            },
            validateViewRange(viewRange, expectedModelRange) {
                return viewRange;
            },
            convertModelPositionToViewPosition(modelPosition, affinity, allowZeroLineNumber, belowHiddenRanges) {
                return modelPosition;
            },
            convertModelRangeToViewRange(modelRange, affinity) {
                return modelRange;
            },
            modelPositionIsVisible(modelPosition) {
                return true;
            },
            getModelLineViewLineCount(modelLineNumber) {
                return 1;
            },
            getViewLineNumberOfModelPosition(modelLineNumber, modelColumn) {
                return modelLineNumber;
            }
        };
    }
    constructCursorSimpleModel(cell) {
        return {
            getLineCount() {
                return cell.textBuffer.getLineCount();
            },
            getLineContent(lineNumber) {
                return cell.textBuffer.getLineContent(lineNumber);
            },
            getLineMinColumn(lineNumber) {
                return cell.textBuffer.getLineMinColumn(lineNumber);
            },
            getLineMaxColumn(lineNumber) {
                return cell.textBuffer.getLineMaxColumn(lineNumber);
            },
            getLineFirstNonWhitespaceColumn(lineNumber) {
                return cell.textBuffer.getLineFirstNonWhitespaceColumn(lineNumber);
            },
            getLineLastNonWhitespaceColumn(lineNumber) {
                return cell.textBuffer.getLineLastNonWhitespaceColumn(lineNumber);
            },
            normalizePosition(position, affinity) {
                return position;
            },
            getLineIndentColumn(lineNumber) {
                return indentOfLine(cell.textBuffer.getLineContent(lineNumber)) + 1;
            }
        };
    }
    handleEditorOperationEvent(e) {
        this.trackedCells.forEach(cell => {
            if (cell.cellViewModel.handle === this.anchorCell?.[0].handle) {
                return;
            }
            const eventsCollector = new ViewModelEventsCollector();
            const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
            if (!controller) {
                return;
            }
            this.executeEditorOperation(controller, eventsCollector, e);
        });
    }
    executeEditorOperation(controller, eventsCollector, e) {
        switch (e.handlerId) {
            case "compositionStart" /* Handler.CompositionStart */:
                controller.startComposition(eventsCollector);
                break;
            case "compositionEnd" /* Handler.CompositionEnd */:
                controller.endComposition(eventsCollector, e.source);
                break;
            case "replacePreviousChar" /* Handler.ReplacePreviousChar */: {
                const args = e.payload;
                controller.compositionType(eventsCollector, args.text || '', args.replaceCharCnt || 0, 0, 0, e.source);
                break;
            }
            case "compositionType" /* Handler.CompositionType */: {
                const args = e.payload;
                controller.compositionType(eventsCollector, args.text || '', args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0, e.source);
                break;
            }
            case "paste" /* Handler.Paste */: {
                const args = e.payload;
                controller.paste(eventsCollector, args.text || '', args.pasteOnNewLine || false, args.multicursorText || null, e.source);
                break;
            }
            case "cut" /* Handler.Cut */:
                controller.cut(eventsCollector, e.source);
                break;
        }
    }
    updateViewModelSelections() {
        for (const cell of this.trackedCells) {
            const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
            if (!controller) {
                // should not happen
                return;
            }
            cell.cellViewModel.setSelections(controller.getSelections());
        }
    }
    updateFinalUndoRedo() {
        const anchorCellModel = this.anchorCell?.[1].getModel();
        if (!anchorCellModel) {
            // should not happen
            return;
        }
        const newElementsMap = new ResourceMap();
        const resources = [];
        this.trackedCells.forEach(trackedMatch => {
            const undoRedoState = trackedMatch.undoRedoHistory;
            if (!undoRedoState) {
                return;
            }
            resources.push(trackedMatch.cellViewModel.uri);
            const currentPastElements = this.undoRedoService.getElements(trackedMatch.cellViewModel.uri).past.slice();
            const oldPastElements = trackedMatch.undoRedoHistory.past.slice();
            const newElements = currentPastElements.slice(oldPastElements.length);
            if (newElements.length === 0) {
                return;
            }
            newElementsMap.set(trackedMatch.cellViewModel.uri, newElements);
            this.undoRedoService.removeElements(trackedMatch.cellViewModel.uri);
            oldPastElements.forEach(element => {
                this.undoRedoService.pushElement(element);
            });
        });
        this.undoRedoService.pushElement({
            type: 1 /* UndoRedoElementType.Workspace */,
            resources: resources,
            label: 'Multi Cursor Edit',
            code: 'multiCursorEdit',
            confirmBeforeUndo: false,
            undo: async () => {
                newElementsMap.forEach(async (value) => {
                    value.reverse().forEach(async (element) => {
                        await element.undo();
                    });
                });
            },
            redo: async () => {
                newElementsMap.forEach(async (value) => {
                    value.forEach(async (element) => {
                        await element.redo();
                    });
                });
            }
        });
    }
    resetToIdleState() {
        this.state = NotebookMultiCursorState.Idle;
        this._nbMultiSelectState.set(NotebookMultiCursorState.Idle);
        this._nbIsMultiSelectSession.set(false);
        this.updateFinalUndoRedo();
        this.trackedCells.forEach(cell => {
            this.clearDecorations(cell);
            cell.cellViewModel.setSelections([cell.initialSelection]); // correct cursor placement upon exiting cmd-d session
        });
        this.anchorDisposables.clear();
        this.anchorCell = undefined;
        this.cursorsDisposables.clear();
        this.cursorsControllers.clear();
        this.trackedCells = [];
        this.totalMatchesCount = 0;
        this.startPosition = undefined;
        this.word = '';
    }
    async findAndTrackNextSelection(focusedCell) {
        if (this.state === NotebookMultiCursorState.Idle) { // move cursor to end of the symbol + track it, transition to selecting state
            const textModel = focusedCell.textModel;
            if (!textModel) {
                return;
            }
            const inputSelection = focusedCell.getSelections()[0];
            const word = this.getWord(inputSelection, textModel);
            if (!word) {
                return;
            }
            this.word = word.word;
            // Record the total number of matches at the beginning of the selection process for performance
            const notebookTextModel = this.notebookEditor.textModel;
            if (notebookTextModel) {
                const allMatches = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
                this.totalMatchesCount = allMatches.reduce((sum, cellMatch) => sum + cellMatch.matches.length, 0);
            }
            const index = this.notebookEditor.getCellIndex(focusedCell);
            if (index === undefined) {
                return;
            }
            this.startPosition = {
                cellIndex: index,
                position: new Position(inputSelection.startLineNumber, word.startColumn),
            };
            const newSelection = new Selection(inputSelection.startLineNumber, word.startColumn, inputSelection.startLineNumber, word.endColumn);
            focusedCell.setSelections([newSelection]);
            this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
            if (!this.anchorCell || this.anchorCell[0].handle !== focusedCell.handle) {
                throw new Error('Active cell is not the same as the cell passed as context');
            }
            if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
                throw new Error('Active cell is not an instance of CodeEditorWidget');
            }
            await this.updateTrackedCell(focusedCell, [newSelection]);
            this._nbIsMultiSelectSession.set(true);
            this.state = NotebookMultiCursorState.Selecting;
            this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);
            this._onDidChangeAnchorCell.fire();
        }
        else if (this.state === NotebookMultiCursorState.Selecting) { // use the word we stored from idle state transition to find next match, track it
            const notebookTextModel = this.notebookEditor.textModel;
            if (!notebookTextModel) {
                return; // should not happen
            }
            const index = this.notebookEditor.getCellIndex(focusedCell);
            if (index === undefined) {
                return; // should not happen
            }
            if (!this.startPosition) {
                return; // should not happen
            }
            // Check if all matches are already covered by selections to avoid infinite looping
            const totalSelections = this.trackedCells.reduce((sum, trackedCell) => sum + trackedCell.matchSelections.length, 0);
            if (totalSelections >= this.totalMatchesCount) {
                // All matches are already selected, make this a no-op like in regular editors
                return;
            }
            const findResult = notebookTextModel.findNextMatch(this.word, { cellIndex: index, position: focusedCell.getSelections()[focusedCell.getSelections().length - 1].getEndPosition() }, false, true, USUAL_WORD_SEPARATORS, this.startPosition);
            if (!findResult) {
                return;
            }
            const findResultCellViewModel = this.notebookEditor.getCellByHandle(findResult.cell.handle);
            if (!findResultCellViewModel) {
                return;
            }
            if (findResult.cell.handle === focusedCell.handle) { // match is in the same cell, find tracked entry, update and set selections in viewmodel and cursorController
                const selections = [...focusedCell.getSelections(), Selection.fromRange(findResult.match.range, 0 /* SelectionDirection.LTR */)];
                const trackedCell = await this.updateTrackedCell(focusedCell, selections);
                findResultCellViewModel.setSelections(trackedCell.matchSelections);
            }
            else if (findResult.cell.handle !== focusedCell.handle) { // result is in a different cell, move focus there and apply selection, then update anchor
                await this.notebookEditor.revealRangeInViewAsync(findResultCellViewModel, findResult.match.range);
                await this.notebookEditor.focusNotebookCell(findResultCellViewModel, 'editor');
                const trackedCell = await this.updateTrackedCell(findResultCellViewModel, [Selection.fromRange(findResult.match.range, 0 /* SelectionDirection.LTR */)]);
                findResultCellViewModel.setSelections(trackedCell.matchSelections);
                this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
                if (!this.anchorCell || !(this.anchorCell[1] instanceof CodeEditorWidget)) {
                    throw new Error('Active cell is not an instance of CodeEditorWidget');
                }
                this._onDidChangeAnchorCell.fire();
                // we set the decorations manually for the cell we have just departed, since it blurs
                // we can find the match with the handle that the find and track request originated
                this.initializeMultiSelectDecorations(this.trackedCells.find(trackedCell => trackedCell.cellViewModel.handle === focusedCell.handle));
            }
        }
    }
    async selectAllMatches(focusedCell, matches) {
        const notebookTextModel = this.notebookEditor.textModel;
        if (!notebookTextModel) {
            return; // should not happen
        }
        if (matches) {
            await this.handleFindWidgetSelectAllMatches(matches);
        }
        else {
            await this.handleCellEditorSelectAllMatches(notebookTextModel, focusedCell);
        }
        await this.syncCursorsControllers();
        this.syncAnchorListeners();
        this.updateLazyDecorations();
    }
    async handleFindWidgetSelectAllMatches(matches) {
        // TODO: support selecting state maybe. UX could get confusing since selecting state could be hit via ctrl+d which would have different filters (case sensetive + whole word)
        if (this.state !== NotebookMultiCursorState.Idle) {
            return;
        }
        if (!matches.length) {
            return;
        }
        await this.notebookEditor.focusNotebookCell(matches[0].cell, 'editor');
        this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
        this.trackedCells = [];
        for (const match of matches) {
            this.updateTrackedCell(match.cell, match.contentMatches.map(match => Selection.fromRange(match.range, 0 /* SelectionDirection.LTR */)));
            if (this.anchorCell && match.cell.handle === this.anchorCell[0].handle) {
                // only explicitly set the focused cell's selections, the rest are handled by cursor controllers + decorations
                match.cell.setSelections(match.contentMatches.map(match => Selection.fromRange(match.range, 0 /* SelectionDirection.LTR */)));
            }
        }
        this._nbIsMultiSelectSession.set(true);
        this.state = NotebookMultiCursorState.Selecting;
        this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);
    }
    async handleCellEditorSelectAllMatches(notebookTextModel, focusedCell) {
        // can be triggered mid multiselect session, or from idle state
        if (this.state === NotebookMultiCursorState.Idle) {
            // get word from current selection + rest of notebook objects
            const textModel = focusedCell.textModel;
            if (!textModel) {
                return;
            }
            const inputSelection = focusedCell.getSelections()[0];
            const word = this.getWord(inputSelection, textModel);
            if (!word) {
                return;
            }
            this.word = word.word;
            const index = this.notebookEditor.getCellIndex(focusedCell);
            if (index === undefined) {
                return;
            }
            this.startPosition = {
                cellIndex: index,
                position: new Position(inputSelection.startLineNumber, word.startColumn),
            };
            this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
            if (!this.anchorCell || this.anchorCell[0].handle !== focusedCell.handle) {
                throw new Error('Active cell is not the same as the cell passed as context');
            }
            if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
                throw new Error('Active cell is not an instance of CodeEditorWidget');
            }
            // get all matches in the notebook
            const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
            // create the tracked matches for every result, needed for cursor controllers
            this.trackedCells = [];
            for (const res of findResults) {
                await this.updateTrackedCell(res.cell, res.matches.map(match => Selection.fromRange(match.range, 0 /* SelectionDirection.LTR */)));
                if (res.cell.handle === focusedCell.handle) {
                    const cellViewModel = this.notebookEditor.getCellByHandle(res.cell.handle);
                    if (cellViewModel) {
                        cellViewModel.setSelections(res.matches.map(match => Selection.fromRange(match.range, 0 /* SelectionDirection.LTR */)));
                    }
                }
            }
            this._nbIsMultiSelectSession.set(true);
            this.state = NotebookMultiCursorState.Selecting;
            this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);
        }
        else if (this.state === NotebookMultiCursorState.Selecting) {
            // we will already have a word + some number of tracked matches, need to update them with the rest given findAllMatches result
            const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);
            // update existing tracked matches with new selections and create new tracked matches for cells that aren't tracked yet
            for (const res of findResults) {
                await this.updateTrackedCell(res.cell, res.matches.map(match => Selection.fromRange(match.range, 0 /* SelectionDirection.LTR */)));
            }
        }
    }
    async updateTrackedCell(cell, selections) {
        const cellViewModel = cell instanceof NotebookCellTextModel ? this.notebookEditor.getCellByHandle(cell.handle) : cell;
        if (!cellViewModel) {
            throw new Error('Cell not found');
        }
        let trackedMatch = this.trackedCells.find(trackedCell => trackedCell.cellViewModel.handle === cellViewModel.handle);
        if (trackedMatch) {
            this.clearDecorations(trackedMatch); // need this to avoid leaking decorations -- TODO: just optimize the lazy decorations fn
            trackedMatch.matchSelections = selections;
        }
        else {
            const initialSelection = cellViewModel.getSelections()[0];
            const textModel = await cellViewModel.resolveTextModel();
            textModel.pushStackElement();
            const editorConfig = this.constructCellEditorOptions(cellViewModel);
            const rawEditorOptions = editorConfig.getRawOptions();
            const cursorConfig = {
                cursorStyle: cursorStyleFromString(rawEditorOptions.cursorStyle),
                cursorBlinking: cursorBlinkingStyleFromString(rawEditorOptions.cursorBlinking),
                cursorSmoothCaretAnimation: rawEditorOptions.cursorSmoothCaretAnimation
            };
            trackedMatch = {
                cellViewModel: cellViewModel,
                initialSelection: initialSelection,
                matchSelections: selections,
                editorConfig: editorConfig,
                cursorConfig: cursorConfig,
                decorationIds: [],
                undoRedoHistory: this.undoRedoService.getElements(cellViewModel.uri)
            };
            this.trackedCells.push(trackedMatch);
        }
        return trackedMatch;
    }
    async deleteLeft() {
        this.trackedCells.forEach(cell => {
            const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
            if (!controller) {
                // should not happen
                return;
            }
            const [, commands] = DeleteOperations.deleteLeft(controller.getPrevEditOperationType(), controller.context.cursorConfig, controller.context.model, controller.getSelections(), controller.getAutoClosedCharacters());
            const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
            if (!delSelections) {
                return;
            }
            controller.setSelections(new ViewModelEventsCollector(), undefined, delSelections, 3 /* CursorChangeReason.Explicit */);
        });
        this.updateLazyDecorations();
    }
    async deleteRight() {
        this.trackedCells.forEach(cell => {
            const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
            if (!controller) {
                // should not happen
                return;
            }
            const [, commands] = DeleteOperations.deleteRight(controller.getPrevEditOperationType(), controller.context.cursorConfig, controller.context.model, controller.getSelections());
            if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) {
                const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
                if (!delSelections) {
                    return;
                }
                controller.setSelections(new ViewModelEventsCollector(), undefined, delSelections, 3 /* CursorChangeReason.Explicit */);
            }
            else {
                // get the selections from the viewmodel since we run the command manually (for cursor decoration reasons)
                controller.setSelections(new ViewModelEventsCollector(), undefined, cell.cellViewModel.getSelections(), 3 /* CursorChangeReason.Explicit */);
            }
        });
        this.updateLazyDecorations();
    }
    async undo() {
        const models = [];
        for (const cell of this.trackedCells) {
            const model = await cell.cellViewModel.resolveTextModel();
            if (model) {
                models.push(model);
            }
        }
        await Promise.all(models.map(model => model.undo()));
        this.updateViewModelSelections();
        this.updateLazyDecorations();
    }
    async redo() {
        const models = [];
        for (const cell of this.trackedCells) {
            const model = await cell.cellViewModel.resolveTextModel();
            if (model) {
                models.push(model);
            }
        }
        await Promise.all(models.map(model => model.redo()));
        this.updateViewModelSelections();
        this.updateLazyDecorations();
    }
    constructCellEditorOptions(cell) {
        const cellEditorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(cell.language), this.notebookEditor.notebookOptions, this.configurationService);
        const options = cellEditorOptions.getUpdatedValue(cell.internalMetadata, cell.uri);
        cellEditorOptions.dispose();
        return new EditorConfiguration(false, MenuId.EditorContent, options, null, this.accessibilityService);
    }
    /**
     * Updates the multicursor selection decorations for a specific matched cell
     *
     * @param cell -- match object containing the viewmodel + selections
     */
    initializeMultiSelectDecorations(cell) {
        if (!cell) {
            return;
        }
        const decorations = [];
        cell.matchSelections.forEach(selection => {
            // mock cursor at the end of the selection
            decorations.push({
                range: Selection.fromPositions(selection.getEndPosition()),
                options: {
                    description: '',
                    className: this.getClassName(cell.cursorConfig, true),
                }
            });
        });
        cell.decorationIds = cell.cellViewModel.deltaModelDecorations(cell.decorationIds, decorations);
    }
    updateLazyDecorations() {
        this.trackedCells.forEach(cell => {
            if (cell.cellViewModel.handle === this.anchorCell?.[0].handle) {
                return;
            }
            const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
            if (!controller) {
                // should not happen
                return;
            }
            const selections = controller.getSelections();
            const newDecorations = [];
            selections?.map(selection => {
                const isEmpty = selection.isEmpty();
                if (!isEmpty) {
                    // selection decoration (shift+arrow, etc)
                    newDecorations.push({
                        range: selection,
                        options: {
                            description: '',
                            className: this.getClassName(cell.cursorConfig, false),
                        }
                    });
                }
                // mock cursor at the end of the selection
                newDecorations.push({
                    range: Selection.fromPositions(selection.getPosition()),
                    options: {
                        description: '',
                        zIndex: 10000,
                        className: this.getClassName(cell.cursorConfig, true),
                    }
                });
            });
            cell.decorationIds = cell.cellViewModel.deltaModelDecorations(cell.decorationIds, newDecorations);
        });
    }
    clearDecorations(cell) {
        cell.decorationIds = cell.cellViewModel.deltaModelDecorations(cell.decorationIds, []);
    }
    getWord(selection, model) {
        const lineNumber = selection.startLineNumber;
        const startColumn = selection.startColumn;
        if (model.isDisposed()) {
            return null;
        }
        return model.getWordAtPosition({
            lineNumber: lineNumber,
            column: startColumn
        });
    }
    getClassName(cursorConfig, isCursor) {
        let result = isCursor ? '.nb-multicursor-cursor' : '.nb-multicursor-selection';
        if (isCursor) {
            // handle base style
            switch (cursorConfig.cursorStyle) {
                case TextEditorCursorStyle.Line:
                    break; // default style, no additional class needed (handled by base css style)
                case TextEditorCursorStyle.Block:
                    result += '.nb-cursor-block-style';
                    break;
                case TextEditorCursorStyle.Underline:
                    result += '.nb-cursor-underline-style';
                    break;
                case TextEditorCursorStyle.LineThin:
                    result += '.nb-cursor-line-thin-style';
                    break;
                case TextEditorCursorStyle.BlockOutline:
                    result += '.nb-cursor-block-outline-style';
                    break;
                case TextEditorCursorStyle.UnderlineThin:
                    result += '.nb-cursor-underline-thin-style';
                    break;
                default:
                    break;
            }
            // handle animation style
            switch (cursorConfig.cursorBlinking) {
                case 1 /* TextEditorCursorBlinkingStyle.Blink */:
                    result += '.nb-blink';
                    break;
                case 2 /* TextEditorCursorBlinkingStyle.Smooth */:
                    result += '.nb-smooth';
                    break;
                case 3 /* TextEditorCursorBlinkingStyle.Phase */:
                    result += '.nb-phase';
                    break;
                case 4 /* TextEditorCursorBlinkingStyle.Expand */:
                    result += '.nb-expand';
                    break;
                case 5 /* TextEditorCursorBlinkingStyle.Solid */:
                    result += '.nb-solid';
                    break;
                default:
                    result += '.nb-solid';
                    break;
            }
            // handle caret animation style
            if (cursorConfig.cursorSmoothCaretAnimation === 'on' || cursorConfig.cursorSmoothCaretAnimation === 'explicit') {
                result += '.nb-smooth-caret-animation';
            }
        }
        return result;
    }
    dispose() {
        super.dispose();
        this.anchorDisposables.dispose();
        this.cursorsDisposables.dispose();
        this.trackedCells.forEach(cell => {
            this.clearDecorations(cell);
        });
        this.trackedCells = [];
    }
};
NotebookMultiCursorController = __decorate([
    __param(1, IContextKeyService),
    __param(2, ITextModelService),
    __param(3, ILanguageConfigurationService),
    __param(4, IAccessibilityService),
    __param(5, IConfigurationService),
    __param(6, IUndoRedoService)
], NotebookMultiCursorController);
export { NotebookMultiCursorController };
class NotebookSelectAllFindMatches extends NotebookAction {
    constructor() {
        super({
            id: NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID,
            title: localize('selectAllFindMatches', "Select All Occurrences of Find Match"),
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true)),
            keybinding: {
                when: ContextKeyExpr.or(ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_EDITOR_FOCUSED), ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED)),
                primary: 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 42 /* KeyCode.KeyL */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        if (!context.cell) {
            return;
        }
        const cursorController = editor.getContribution(NotebookMultiCursorController.id);
        const findController = editor.getContribution(NotebookFindContrib.id);
        if (findController.widget.isFocused) {
            const findModel = findController.widget.findModel;
            cursorController.selectAllMatches(context.cell, findModel.findMatches);
        }
        else {
            cursorController.selectAllMatches(context.cell);
        }
    }
}
class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
    constructor() {
        super({
            id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
            title: localize('addFindMatchToSelection', "Add Selection to Next Find Match"),
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_EDITOR_FOCUSED),
            keybinding: {
                when: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_EDITOR_FOCUSED),
                primary: 2048 /* KeyMod.CtrlCmd */ | 34 /* KeyCode.KeyD */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        if (!context.cell) {
            return;
        }
        const controller = editor.getContribution(NotebookMultiCursorController.id);
        controller.findAndTrackNextSelection(context.cell);
    }
}
class NotebookExitMultiSelectionAction extends NotebookAction {
    constructor() {
        super({
            id: 'noteMultiCursor.exit',
            title: localize('exitMultiSelection', "Exit Multi Cursor Mode"),
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor),
            keybinding: {
                when: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor),
                primary: 9 /* KeyCode.Escape */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        const controller = editor.getContribution(NotebookMultiCursorController.id);
        controller.resetToIdleState();
    }
}
class NotebookDeleteLeftMultiSelectionAction extends NotebookAction {
    constructor() {
        super({
            id: 'noteMultiCursor.deleteLeft',
            title: localize('deleteLeftMultiSelection', "Delete Left"),
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor, ContextKeyExpr.or(NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting), NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing))),
            keybinding: {
                when: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor, ContextKeyExpr.or(NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting), NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing))),
                primary: 1 /* KeyCode.Backspace */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!editor) {
            return;
        }
        const controller = editor.getContribution(NotebookMultiCursorController.id);
        controller.deleteLeft();
    }
}
class NotebookDeleteRightMultiSelectionAction extends NotebookAction {
    constructor() {
        super({
            id: 'noteMultiCursor.deleteRight',
            title: localize('deleteRightMultiSelection', "Delete Right"),
            precondition: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor, ContextKeyExpr.or(NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting), NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing))),
            keybinding: {
                when: ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor, ContextKeyExpr.or(NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting), NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing))),
                primary: 20 /* KeyCode.Delete */,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */
            }
        });
    }
    async runWithContext(accessor, context) {
        const editorService = accessor.get(IEditorService);
        const nbEditor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
        if (!nbEditor) {
            return;
        }
        const cellEditor = nbEditor.activeCodeEditor;
        if (!cellEditor) {
            return;
        }
        // need to run the command manually since we are overriding the command, this ensures proper cursor animation behavior
        CoreEditingCommands.DeleteRight.runEditorCommand(accessor, cellEditor, null);
        const controller = nbEditor.getContribution(NotebookMultiCursorController.id);
        controller.deleteRight();
    }
}
let NotebookMultiCursorUndoRedoContribution = class NotebookMultiCursorUndoRedoContribution extends Disposable {
    static { this.ID = 'workbench.contrib.notebook.multiCursorUndoRedo'; }
    constructor(_editorService, configurationService) {
        super();
        this._editorService = _editorService;
        this.configurationService = configurationService;
        if (!this.configurationService.getValue('notebook.multiCursor.enabled')) {
            return;
        }
        const PRIORITY = 10005;
        this._register(UndoCommand.addImplementation(PRIORITY, 'notebook-multicursor-undo-redo', () => {
            const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
            if (!editor) {
                return false;
            }
            if (!editor.hasModel()) {
                return false;
            }
            const controller = editor.getContribution(NotebookMultiCursorController.id);
            return controller.undo();
        }, ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor)));
        this._register(RedoCommand.addImplementation(PRIORITY, 'notebook-multicursor-undo-redo', () => {
            const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
            if (!editor) {
                return false;
            }
            if (!editor.hasModel()) {
                return false;
            }
            const controller = editor.getContribution(NotebookMultiCursorController.id);
            return controller.redo();
        }, ContextKeyExpr.and(ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true), NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor)));
    }
};
NotebookMultiCursorUndoRedoContribution = __decorate([
    __param(0, IEditorService),
    __param(1, IConfigurationService)
], NotebookMultiCursorUndoRedoContribution);
registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerWorkbenchContribution2(NotebookMultiCursorUndoRedoContribution.ID, NotebookMultiCursorUndoRedoContribution, 2 /* WorkbenchPhase.BlockRestore */);
registerAction2(NotebookSelectAllFindMatches);
registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
registerAction2(NotebookDeleteLeftMultiSelectionAction);
registerAction2(NotebookDeleteRightMultiSelectionAction);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm90ZWJvb2tNdWx0aWN1cnNvci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9tdWx0aWN1cnNvci9ub3RlYm9va011bHRpY3Vyc29yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSwwQkFBMEIsQ0FBQztBQUNwRCxPQUFPLEVBQUUsT0FBTyxFQUFTLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUN6RixPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFbkUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDckcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFFdkYsT0FBTyxFQUFFLFdBQVcsRUFBRSxXQUFXLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUUxRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUscUJBQXFCLEVBQWlDLHFCQUFxQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDckwsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSxTQUFTLEVBQXNCLE1BQU0sbURBQW1ELENBQUM7QUFDbEcsT0FBTyxFQUFtQixxQkFBcUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzVHLE9BQU8sRUFBRSxlQUFlLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUN0RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFB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