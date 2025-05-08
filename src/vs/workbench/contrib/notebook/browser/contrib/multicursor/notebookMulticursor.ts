/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../../nls.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { EditorConfiguration } from '../../../../../../editor/browser/config/editorConfiguration.js';
import { CoreEditingCommands } from '../../../../../../editor/browser/coreCommands.js';
import { ICodeEditor, PastePayload } from '../../../../../../editor/browser/editorBrowser.js';
import { RedoCommand, UndoCommand } from '../../../../../../editor/browser/editorExtensions.js';
import { CodeEditorWidget } from '../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorConfiguration } from '../../../../../../editor/common/config/editorConfiguration.js';
import { cursorBlinkingStyleFromString, cursorStyleFromString, TextEditorCursorBlinkingStyle, TextEditorCursorStyle } from '../../../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../../../editor/common/core/position.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { Selection, SelectionDirection } from '../../../../../../editor/common/core/selection.js';
import { IWordAtPosition, USUAL_WORD_SEPARATORS } from '../../../../../../editor/common/core/wordHelper.js';
import { CommandExecutor, CursorsController } from '../../../../../../editor/common/cursor/cursor.js';
import { DeleteOperations } from '../../../../../../editor/common/cursor/cursorDeleteOperations.js';
import { CursorConfiguration, ICursorSimpleModel } from '../../../../../../editor/common/cursorCommon.js';
import { CursorChangeReason } from '../../../../../../editor/common/cursorEvents.js';
import { CompositionTypePayload, Handler, ReplacePreviousCharPayload } from '../../../../../../editor/common/editorCommon.js';
import { ILanguageConfigurationService } from '../../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { IModelDeltaDecoration, ITextModel, PositionAffinity } from '../../../../../../editor/common/model.js';
import { indentOfLine } from '../../../../../../editor/common/model/textModel.js';
import { ITextModelService } from '../../../../../../editor/common/services/resolverService.js';
import { ICoordinatesConverter } from '../../../../../../editor/common/viewModel.js';
import { ViewModelEventsCollector } from '../../../../../../editor/common/viewModelEventDispatcher.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { MenuId, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IPastFutureElements, IUndoRedoElement, IUndoRedoService, UndoRedoElementType } from '../../../../../../platform/undoRedo/common/undoRedo.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from '../../../common/notebookContextKeys.js';
import { INotebookActionContext, NotebookAction } from '../../controller/coreActions.js';
import { CellFindMatchWithIndex, getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';
import { CellEditorOptions } from '../../view/cellParts/cellEditorOptions.js';
import { NotebookFindContrib } from '../find/notebookFindWidget.js';
import { NotebookTextModel } from '../../../common/model/notebookTextModel.js';
import { NotebookCellTextModel } from '../../../common/model/notebookCellTextModel.js';

const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = 'notebook.addFindMatchToSelection';
const NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID = 'notebook.selectAllFindMatches';

export enum NotebookMultiCursorState {
	Idle,
	Selecting,
	Editing,
}

interface NotebookCursorConfig {
	cursorStyle: TextEditorCursorStyle;
	cursorBlinking: TextEditorCursorBlinkingStyle;
	cursorSmoothCaretAnimation: 'off' | 'explicit' | 'on';
}

interface SelectionTranslation {
	deltaStartCol: number;
	deltaStartLine: number;
	deltaEndCol: number;
	deltaEndLine: number;
}

interface TrackedCell {
	cellViewModel: ICellViewModel;
	initialSelection: Selection;
	matchSelections: Selection[];
	editorConfig: IEditorConfiguration;
	cursorConfig: NotebookCursorConfig;
	decorationIds: string[];
	undoRedoHistory: IPastFutureElements;
}

export const NOTEBOOK_MULTI_CURSOR_CONTEXT = {
	IsNotebookMultiCursor: new RawContextKey<boolean>('isNotebookMultiSelect', false),
	NotebookMultiSelectCursorState: new RawContextKey<NotebookMultiCursorState>('notebookMultiSelectCursorState', NotebookMultiCursorState.Idle),
};

export class NotebookMultiCursorController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.multiCursorController';

	private word: string = '';
	private startPosition: {
		cellIndex: number;
		position: Position;
	} | undefined;
	private trackedCells: TrackedCell[] = [];

	private readonly _onDidChangeAnchorCell = this._register(new Emitter<void>());
	readonly onDidChangeAnchorCell: Event<void> = this._onDidChangeAnchorCell.event;
	private anchorCell: [ICellViewModel, ICodeEditor] | undefined;

	private readonly anchorDisposables = this._register(new DisposableStore());
	private readonly cursorsDisposables = this._register(new DisposableStore());
	private cursorsControllers: ResourceMap<CursorsController> = new ResourceMap<CursorsController>();

	private state: NotebookMultiCursorState = NotebookMultiCursorState.Idle;
	public getState(): NotebookMultiCursorState {
		return this.state;
	}

	private _nbIsMultiSelectSession = NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor.bindTo(this.contextKeyService);
	private _nbMultiSelectState = NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.bindTo(this.contextKeyService);

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUndoRedoService private readonly undoRedoService: IUndoRedoService,
	) {
		super();

		this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;

		// anchor cell will catch and relay all type, cut, paste events to the cursors controllers
		// need to create new controllers when the anchor cell changes, then update their listeners
		// ** cursor controllers need to happen first, because anchor listeners relay to them
		this._register(this.onDidChangeAnchorCell(async () => {
			await this.syncCursorsControllers();
			this.syncAnchorListeners();
		}));
	}

	private syncAnchorListeners() {
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

			const anchorController = this.cursorsControllers.get(this.anchorCell![0].uri);
			if (!anchorController) {
				return;
			}
			const activeSelections = this.notebookEditor.activeCodeEditor?.getSelections();
			if (!activeSelections) {
				return;
			}

			// need to keep anchor cursor controller in sync manually (for delete usage), since we don't relay type event to it
			anchorController.setSelections(new ViewModelEventsCollector(), 'keyboard', activeSelections, CursorChangeReason.Explicit);

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
			if (!e.oldSelections || e.reason === CursorChangeReason.NotSet || e.reason === CursorChangeReason.RecoverFromMarkers) {
				return;
			}

			const translation: SelectionTranslation = {
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

				controller.setSelections(new ViewModelEventsCollector(), e.source, newSelections, CursorChangeReason.Explicit);
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

	private async syncCursorsControllers() {
		this.cursorsDisposables.clear(); // TODO: dial this back for perf and just update the relevant controllers
		await Promise.all(this.trackedCells.map(async cell => {
			const controller = await this.createCursorController(cell);
			if (!controller) {
				return;
			}
			this.cursorsControllers.set(cell.cellViewModel.uri, controller);

			const selections = cell.matchSelections;
			controller.setSelections(new ViewModelEventsCollector(), undefined, selections, CursorChangeReason.Explicit);
		}));

		this.updateLazyDecorations();
	}

	private async createCursorController(cell: TrackedCell): Promise<CursorsController | undefined> {
		const textModelRef = await this.textModelService.createModelReference(cell.cellViewModel.uri);
		const textModel = textModelRef.object.textEditorModel;
		if (!textModel) {
			return undefined;
		}

		const cursorSimpleModel = this.constructCursorSimpleModel(cell.cellViewModel);
		const converter = this.constructCoordinatesConverter();
		const editorConfig = cell.editorConfig;

		const controller = this.cursorsDisposables.add(new CursorsController(
			textModel,
			cursorSimpleModel,
			converter,
			new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)
		));

		controller.setSelections(new ViewModelEventsCollector(), undefined, cell.matchSelections, CursorChangeReason.Explicit);
		return controller;
	}

	private constructCoordinatesConverter(): ICoordinatesConverter {
		return {
			convertViewPositionToModelPosition(viewPosition: Position): Position {
				return viewPosition;
			},
			convertViewRangeToModelRange(viewRange: Range): Range {
				return viewRange;
			},
			validateViewPosition(viewPosition: Position, expectedModelPosition: Position): Position {
				return viewPosition;
			},
			validateViewRange(viewRange: Range, expectedModelRange: Range): Range {
				return viewRange;
			},
			convertModelPositionToViewPosition(modelPosition: Position, affinity?: PositionAffinity, allowZeroLineNumber?: boolean, belowHiddenRanges?: boolean): Position {
				return modelPosition;
			},
			convertModelRangeToViewRange(modelRange: Range, affinity?: PositionAffinity): Range {
				return modelRange;
			},
			modelPositionIsVisible(modelPosition: Position): boolean {
				return true;
			},
			getModelLineViewLineCount(modelLineNumber: number): number {
				return 1;
			},
			getViewLineNumberOfModelPosition(modelLineNumber: number, modelColumn: number): number {
				return modelLineNumber;
			}
		};
	}

	private constructCursorSimpleModel(cell: ICellViewModel): ICursorSimpleModel {
		return {
			getLineCount(): number {
				return cell.textBuffer.getLineCount();
			},
			getLineContent(lineNumber: number): string {
				return cell.textBuffer.getLineContent(lineNumber);
			},
			getLineMinColumn(lineNumber: number): number {
				return cell.textBuffer.getLineMinColumn(lineNumber);
			},
			getLineMaxColumn(lineNumber: number): number {
				return cell.textBuffer.getLineMaxColumn(lineNumber);
			},
			getLineFirstNonWhitespaceColumn(lineNumber: number): number {
				return cell.textBuffer.getLineFirstNonWhitespaceColumn(lineNumber);
			},
			getLineLastNonWhitespaceColumn(lineNumber: number): number {
				return cell.textBuffer.getLineLastNonWhitespaceColumn(lineNumber);
			},
			normalizePosition(position: Position, affinity: PositionAffinity): Position {
				return position;
			},
			getLineIndentColumn(lineNumber: number): number {
				return indentOfLine(cell.textBuffer.getLineContent(lineNumber)) + 1;
			}
		};
	}

	private async handleEditorOperationEvent(e: any) {
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

	private executeEditorOperation(controller: CursorsController, eventsCollector: ViewModelEventsCollector, e: any) {
		switch (e.handlerId) {
			case Handler.CompositionStart:
				controller.startComposition(eventsCollector);
				break;
			case Handler.CompositionEnd:
				controller.endComposition(eventsCollector, e.source);
				break;
			case Handler.ReplacePreviousChar: {
				const args = <Partial<ReplacePreviousCharPayload>>e.payload;
				controller.compositionType(eventsCollector, args.text || '', args.replaceCharCnt || 0, 0, 0, e.source);
				break;
			}
			case Handler.CompositionType: {
				const args = <Partial<CompositionTypePayload>>e.payload;
				controller.compositionType(eventsCollector, args.text || '', args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0, e.source);
				break;
			}
			case Handler.Paste: {
				const args = <Partial<PastePayload>>e.payload;
				controller.paste(eventsCollector, args.text || '', args.pasteOnNewLine || false, args.multicursorText || null, e.source);
				break;
			}
			case Handler.Cut:
				controller.cut(eventsCollector, e.source);
				break;
		}
	}

	private updateViewModelSelections() {
		for (const cell of this.trackedCells) {
			const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}

			cell.cellViewModel.setSelections(controller.getSelections());
		}
	}

	private updateFinalUndoRedo() {
		const anchorCellModel = this.anchorCell?.[1].getModel();
		if (!anchorCellModel) {
			// should not happen
			return;
		}

		const newElementsMap: ResourceMap<IUndoRedoElement[]> = new ResourceMap<IUndoRedoElement[]>();
		const resources: URI[] = [];

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
			type: UndoRedoElementType.Workspace,
			resources: resources,
			label: 'Multi Cursor Edit',
			code: 'multiCursorEdit',
			confirmBeforeUndo: false,
			undo: async () => {
				newElementsMap.forEach(async value => {
					value.reverse().forEach(async element => {
						await element.undo();
					});
				});
			},
			redo: async () => {
				newElementsMap.forEach(async value => {
					value.forEach(async element => {
						await element.redo();
					});
				});
			}
		});
	}

	public resetToIdleState() {
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
		this.startPosition = undefined;
		this.word = '';
	}

	public async findAndTrackNextSelection(focusedCell: ICellViewModel): Promise<void> {
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

			const index = this.notebookEditor.getCellIndex(focusedCell);
			if (index === undefined) {
				return;
			}

			this.startPosition = {
				cellIndex: index,
				position: new Position(inputSelection.startLineNumber, word.startColumn),
			};

			const newSelection = new Selection(
				inputSelection.startLineNumber,
				word.startColumn,
				inputSelection.startLineNumber,
				word.endColumn
			);
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

		} else if (this.state === NotebookMultiCursorState.Selecting) { // use the word we stored from idle state transition to find next match, track it
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

			const findResult = notebookTextModel.findNextMatch(
				this.word,
				{ cellIndex: index, position: focusedCell.getSelections()[focusedCell.getSelections().length - 1].getEndPosition() },
				false,
				true,
				USUAL_WORD_SEPARATORS,
				this.startPosition,
			);
			if (!findResult) {
				return;
			}

			const findResultCellViewModel = this.notebookEditor.getCellByHandle(findResult.cell.handle);
			if (!findResultCellViewModel) {
				return;
			}

			if (findResult.cell.handle === focusedCell.handle) { // match is in the same cell, find tracked entry, update and set selections in viewmodel and cursorController
				const selections = [...focusedCell.getSelections(), Selection.fromRange(findResult.match.range, SelectionDirection.LTR)];
				const trackedCell = await this.updateTrackedCell(focusedCell, selections);
				findResultCellViewModel.setSelections(trackedCell.matchSelections);


			} else if (findResult.cell.handle !== focusedCell.handle) {	// result is in a different cell, move focus there and apply selection, then update anchor
				await this.notebookEditor.revealRangeInViewAsync(findResultCellViewModel, findResult.match.range);
				await this.notebookEditor.focusNotebookCell(findResultCellViewModel, 'editor');

				const trackedCell = await this.updateTrackedCell(findResultCellViewModel, [Selection.fromRange(findResult.match.range, SelectionDirection.LTR)]);
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

	public async selectAllMatches(focusedCell: ICellViewModel, matches?: CellFindMatchWithIndex[]): Promise<void> {
		const notebookTextModel = this.notebookEditor.textModel;
		if (!notebookTextModel) {
			return; // should not happen
		}

		if (matches) {
			await this.handleFindWidgetSelectAllMatches(matches);
		} else {
			await this.handleCellEditorSelectAllMatches(notebookTextModel, focusedCell);
		}

		await this.syncCursorsControllers();
		this.syncAnchorListeners();
		this.updateLazyDecorations();
	}

	private async handleFindWidgetSelectAllMatches(matches: CellFindMatchWithIndex[]) {
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
			this.updateTrackedCell(match.cell, match.contentMatches.map(match => Selection.fromRange(match.range, SelectionDirection.LTR)));

			if (this.anchorCell && match.cell.handle === this.anchorCell[0].handle) {
				// only explicitly set the focused cell's selections, the rest are handled by cursor controllers + decorations
				match.cell.setSelections(match.contentMatches.map(match => Selection.fromRange(match.range, SelectionDirection.LTR)));
			}
		}

		this._nbIsMultiSelectSession.set(true);
		this.state = NotebookMultiCursorState.Selecting;
		this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);
	}

	private async handleCellEditorSelectAllMatches(notebookTextModel: NotebookTextModel, focusedCell: ICellViewModel) {
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
				await this.updateTrackedCell(res.cell, res.matches.map(match => Selection.fromRange(match.range, SelectionDirection.LTR)));

				if (res.cell.handle === focusedCell.handle) {
					const cellViewModel = this.notebookEditor.getCellByHandle(res.cell.handle);
					if (cellViewModel) {
						cellViewModel.setSelections(res.matches.map(match => Selection.fromRange(match.range, SelectionDirection.LTR)));
					}
				}
			}

			this._nbIsMultiSelectSession.set(true);
			this.state = NotebookMultiCursorState.Selecting;
			this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);

		} else if (this.state === NotebookMultiCursorState.Selecting) {
			// we will already have a word + some number of tracked matches, need to update them with the rest given findAllMatches result
			const findResults = notebookTextModel.findMatches(this.word, false, true, USUAL_WORD_SEPARATORS);

			// update existing tracked matches with new selections and create new tracked matches for cells that aren't tracked yet
			for (const res of findResults) {
				await this.updateTrackedCell(res.cell, res.matches.map(match => Selection.fromRange(match.range, SelectionDirection.LTR)));
			}
		}
	}

	private async updateTrackedCell(cell: ICellViewModel | NotebookCellTextModel, selections: Selection[]) {
		const cellViewModel = cell instanceof NotebookCellTextModel ? this.notebookEditor.getCellByHandle(cell.handle) : cell;
		if (!cellViewModel) {
			throw new Error('Cell not found');
		}

		let trackedMatch = this.trackedCells.find(trackedCell => trackedCell.cellViewModel.handle === cellViewModel.handle);

		if (trackedMatch) {
			this.clearDecorations(trackedMatch); // need this to avoid leaking decorations -- TODO: just optimize the lazy decorations fn
			trackedMatch.matchSelections = selections;
		} else {
			const initialSelection = cellViewModel.getSelections()[0];
			const textModel = await cellViewModel.resolveTextModel();
			textModel.pushStackElement();

			const editorConfig = this.constructCellEditorOptions(cellViewModel);
			const rawEditorOptions = editorConfig.getRawOptions();
			const cursorConfig: NotebookCursorConfig = {
				cursorStyle: cursorStyleFromString(rawEditorOptions.cursorStyle!),
				cursorBlinking: cursorBlinkingStyleFromString(rawEditorOptions.cursorBlinking!),
				cursorSmoothCaretAnimation: rawEditorOptions.cursorSmoothCaretAnimation!
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

	public async deleteLeft(): Promise<void> {
		this.trackedCells.forEach(cell => {
			const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}

			const [, commands] = DeleteOperations.deleteLeft(
				controller.getPrevEditOperationType(),
				controller.context.cursorConfig,
				controller.context.model,
				controller.getSelections(),
				controller.getAutoClosedCharacters(),
			);

			const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
			if (!delSelections) {
				return;
			}
			controller.setSelections(new ViewModelEventsCollector(), undefined, delSelections, CursorChangeReason.Explicit);
		});
		this.updateLazyDecorations();
	}

	public async deleteRight(): Promise<void> {
		this.trackedCells.forEach(cell => {
			const controller = this.cursorsControllers.get(cell.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}

			const [, commands] = DeleteOperations.deleteRight(
				controller.getPrevEditOperationType(),
				controller.context.cursorConfig,
				controller.context.model,
				controller.getSelections(),
			);

			if (cell.cellViewModel.handle !== this.anchorCell?.[0].handle) {
				const delSelections = CommandExecutor.executeCommands(controller.context.model, controller.getSelections(), commands);
				if (!delSelections) {
					return;
				}
				controller.setSelections(new ViewModelEventsCollector(), undefined, delSelections, CursorChangeReason.Explicit);
			} else {
				// get the selections from the viewmodel since we run the command manually (for cursor decoration reasons)
				controller.setSelections(new ViewModelEventsCollector(), undefined, cell.cellViewModel.getSelections(), CursorChangeReason.Explicit);
			}

		});
		this.updateLazyDecorations();
	}

	async undo() {
		const models: ITextModel[] = [];
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
		const models: ITextModel[] = [];
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

	private constructCellEditorOptions(cell: ICellViewModel): EditorConfiguration {
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
	private initializeMultiSelectDecorations(cell: TrackedCell | undefined) {
		if (!cell) {
			return;
		}

		const decorations: IModelDeltaDecoration[] = [];
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

		cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
			cell.decorationIds,
			decorations
		);
	}

	private updateLazyDecorations() {
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

			const newDecorations: IModelDeltaDecoration[] = [];
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

			cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
				cell.decorationIds,
				newDecorations
			);
		});
	}

	private clearDecorations(cell: TrackedCell) {
		cell.decorationIds = cell.cellViewModel.deltaModelDecorations(
			cell.decorationIds,
			[]
		);
	}

	private getWord(selection: Selection, model: ITextModel): IWordAtPosition | null {
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

	private getClassName(cursorConfig: NotebookCursorConfig, isCursor?: boolean): string {
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
				case TextEditorCursorBlinkingStyle.Blink:
					result += '.nb-blink';
					break;
				case TextEditorCursorBlinkingStyle.Smooth:
					result += '.nb-smooth';
					break;
				case TextEditorCursorBlinkingStyle.Phase:
					result += '.nb-phase';
					break;
				case TextEditorCursorBlinkingStyle.Expand:
					result += '.nb-expand';
					break;
				case TextEditorCursorBlinkingStyle.Solid:
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

	override dispose(): void {
		super.dispose();
		this.anchorDisposables.dispose();
		this.cursorsDisposables.dispose();

		this.trackedCells.forEach(cell => {
			this.clearDecorations(cell);
		});
		this.trackedCells = [];
	}

}

class NotebookSelectAllFindMatches extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_SELECT_ALL_FIND_MATCHES_ID,
			title: localize('selectAllFindMatches', "Select All Occurrences of Find Match"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
			),
			keybinding: {
				when: ContextKeyExpr.or(
					ContextKeyExpr.and(
						ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
						NOTEBOOK_IS_ACTIVE_EDITOR,
						NOTEBOOK_CELL_EDITOR_FOCUSED,
					),
					ContextKeyExpr.and(
						ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
						KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED
					),
				),
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
		if (!editor) {
			return;
		}

		if (!context.cell) {
			return;
		}

		const cursorController = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		const findController = editor.getContribution<NotebookFindContrib>(NotebookFindContrib.id);

		if (findController.widget.isFocused) {
			const findModel = findController.widget.findModel;
			cursorController.selectAllMatches(context.cell, findModel.findMatches);
		} else {
			cursorController.selectAllMatches(context.cell);
		}

	}
}

class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
			title: localize('addFindMatchToSelection', "Add Selection to Next Find Match"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_CELL_EDITOR_FOCUSED,
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_CELL_EDITOR_FOCUSED,
				),
				primary: KeyMod.CtrlCmd | KeyCode.KeyD,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		if (!context.cell) {
			return;
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.findAndTrackNextSelection(context.cell);
	}
}

class NotebookExitMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: 'noteMultiCursor.exit',
			title: localize('exitMultiSelection', "Exit Multi Cursor Mode"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
				),
				primary: KeyCode.Escape,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.resetToIdleState();
	}
}

class NotebookDeleteLeftMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: 'noteMultiCursor.deleteLeft',
			title: localize('deleteLeftMultiSelection', "Delete Left"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
				ContextKeyExpr.or(
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
				)
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
					ContextKeyExpr.or(
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
					)
				),
				primary: KeyCode.Backspace,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return;
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.deleteLeft();
	}
}

class NotebookDeleteRightMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: 'noteMultiCursor.deleteRight',
			title: localize('deleteRightMultiSelection', "Delete Right"),
			precondition: ContextKeyExpr.and(
				ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
				NOTEBOOK_IS_ACTIVE_EDITOR,
				NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
				ContextKeyExpr.or(
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
					NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
				)
			),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
					ContextKeyExpr.or(
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Selecting),
						NOTEBOOK_MULTI_CURSOR_CONTEXT.NotebookMultiSelectCursorState.isEqualTo(NotebookMultiCursorState.Editing)
					)
				),
				primary: KeyCode.Delete,
				weight: KeybindingWeight.WorkbenchContrib
			}
		});
	}

	override async runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
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

		const controller = nbEditor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.deleteRight();
	}
}

class NotebookMultiCursorUndoRedoContribution extends Disposable {

	static readonly ID = 'workbench.contrib.notebook.multiCursorUndoRedo';

	constructor(@IEditorService private readonly _editorService: IEditorService, @IConfigurationService private readonly configurationService: IConfigurationService) {
		super();

		if (!this.configurationService.getValue<boolean>('notebook.multiCursor.enabled')) {
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

			const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);

			return controller.undo();
		}, ContextKeyExpr.and(
			ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
			NOTEBOOK_IS_ACTIVE_EDITOR,
			NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
		)));

		this._register(RedoCommand.addImplementation(PRIORITY, 'notebook-multicursor-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			if (!editor) {
				return false;
			}

			if (!editor.hasModel()) {
				return false;
			}

			const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
			return controller.redo();
		}, ContextKeyExpr.and(
			ContextKeyExpr.equals('config.notebook.multiCursor.enabled', true),
			NOTEBOOK_IS_ACTIVE_EDITOR,
			NOTEBOOK_MULTI_CURSOR_CONTEXT.IsNotebookMultiCursor,
		)));
	}
}

registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerWorkbenchContribution2(NotebookMultiCursorUndoRedoContribution.ID, NotebookMultiCursorUndoRedoContribution, WorkbenchPhase.BlockRestore);

registerAction2(NotebookSelectAllFindMatches);
registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
registerAction2(NotebookDeleteLeftMultiSelectionAction);
registerAction2(NotebookDeleteRightMultiSelectionAction);
