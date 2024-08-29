/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { EditorConfiguration } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection } from 'vs/editor/common/core/selection';
import { IWordAtPosition, USUAL_WORD_SEPARATORS } from 'vs/editor/common/core/wordHelper';
import { CommandExecutor, CursorsController } from 'vs/editor/common/cursor/cursor';
import { DeleteOperations } from 'vs/editor/common/cursor/cursorDeleteOperations';
import { CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/cursorCommon';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IModelDeltaDecoration, ITextModel, PositionAffinity } from 'vs/editor/common/model';
import { indentOfLine } from 'vs/editor/common/model/textModel';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ICoordinatesConverter } from 'vs/editor/common/viewModel';
import { ViewModelEventsCollector } from 'vs/editor/common/viewModelEventDispatcher';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IPastFutureElements, IUndoRedoElement, IUndoRedoService, UndoRedoElementType } from 'vs/platform/undoRedo/common/undoRedo';
import { INotebookActionContext, NotebookAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { NOTEBOOK_CELL_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from 'vs/workbench/contrib/notebook/common/notebookContextKeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { RedoCommand, UndoCommand } from 'vs/editor/browser/editorExtensions';
import { registerWorkbenchContribution2, WorkbenchPhase } from 'vs/workbench/common/contributions';

const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = 'notebook.addFindMatchToSelection';

enum NotebookMultiCursorState {
	Idle,
	Selecting,
	Editing,
}

interface TrackedMatch {
	cellViewModel: ICellViewModel;
	initialSelection: Selection;
	wordSelections: Selection[];
	config: IEditorConfiguration;
	decorationIds: string[];
	undoRedoHistory: IPastFutureElements;
}

export const NOTEBOOK_MULTI_SELECTION_CONTEXT = {
	IsNotebookMultiSelect: new RawContextKey<boolean>('isNotebookMultiSelect', false),
	NotebookMultiSelectState: new RawContextKey<NotebookMultiCursorState>('notebookMultiSelectState', NotebookMultiCursorState.Idle),
};

export class NotebookMultiCursorController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.multiCursorController';

	private state: NotebookMultiCursorState = NotebookMultiCursorState.Idle;

	private word: string = '';
	private trackedMatches: TrackedMatch[] = [];

	private readonly _onDidChangeAnchorCell = this._register(new Emitter<void>());
	readonly onDidChangeAnchorCell: Event<void> = this._onDidChangeAnchorCell.event;
	private anchorCell: [ICellViewModel, ICodeEditor] | undefined;

	private readonly anchorDisposables = this._register(new DisposableStore());
	private readonly cursorsDisposables = this._register(new DisposableStore());
	private cursorsControllers: ResourceMap<CursorsController> = new ResourceMap<CursorsController>();

	private _nbIsMultiSelectSession = NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect.bindTo(this.contextKeyService);
	private _nbMultiSelectState = NOTEBOOK_MULTI_SELECTION_CONTEXT.NotebookMultiSelectState.bindTo(this.contextKeyService);


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

		if (!this.configurationService.getValue<boolean>('notebook.multiSelect.enabled')) {
			return;
		}

		this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;

		// anchor cell will catch and relay all type, cut, paste events to the cursors controllers
		// need to create new controllers when the anchor cell changes, then update their listeners
		// ** cursor controllers need to happen first, because anchor listeners relay to them
		this._register(this.onDidChangeAnchorCell(() => {
			this.updateCursorsControllers();
			this.updateAnchorListeners();
		}));
	}

	private updateCursorsControllers() {
		this.cursorsDisposables.clear();
		this.trackedMatches.forEach(async match => {
			const textModelRef = await this.textModelService.createModelReference(match.cellViewModel.uri);
			const textModel = textModelRef.object.textEditorModel;
			if (!textModel) {
				return;
			}

			const cursorSimpleModel = this.constructCursorSimpleModel(match.cellViewModel);
			const converter = this.constructCoordinatesConverter();
			const editorConfig = match.config;

			const controller = this.cursorsDisposables.add(new CursorsController(
				textModel,
				cursorSimpleModel,
				converter,
				new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)
			));
			controller.setSelections(new ViewModelEventsCollector(), undefined, match.wordSelections, CursorChangeReason.Explicit);
			this.cursorsControllers.set(match.cellViewModel.uri, controller);
		});
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

	private updateAnchorListeners() {
		this.anchorDisposables.clear();

		if (!this.anchorCell) {
			throw new Error('Anchor cell is undefined');
		}

		// typing
		this.anchorDisposables.add(this.anchorCell[1].onWillType((input) => {
			const collector = new ViewModelEventsCollector();
			this.trackedMatches.forEach(match => {
				const controller = this.cursorsControllers.get(match.cellViewModel.uri);
				if (!controller) {
					// should not happen
					return;
				}
				if (match.cellViewModel.handle !== this.anchorCell?.[0].handle) { // don't relay to active cell, already has a controller for typing
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

			this.trackedMatches.forEach(match => {
				const controller = this.cursorsControllers.get(match.cellViewModel.uri);
				if (!controller) {
					return;
				}

				// this is used upon exiting the multicursor session to set the selections back to the correct cursor state
				match.initialSelection = controller.getSelection();
				// clear tracked selection data as it is invalid once typing begins
				match.wordSelections = [];
			});

			this.updateLazyDecorations();
		}));

		// exit mode
		this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorSelection((e) => {
			if (e.source === 'mouse' || e.source === 'deleteRight') {
				this.resetToIdleState();
			}
		}));

		this.anchorDisposables.add(this.anchorCell[1].onDidBlurEditorWidget(() => {
			if (this.state === NotebookMultiCursorState.Selecting || this.state === NotebookMultiCursorState.Editing) {
				this.resetToIdleState();
			}
		}));
	}

	private updateFinalUndoRedo() {
		const anchorCellModel = this.anchorCell?.[1].getModel();
		if (!anchorCellModel) {
			// should not happen
			return;
		}

		const newElementsMap: ResourceMap<IUndoRedoElement[]> = new ResourceMap<IUndoRedoElement[]>();
		const resources: URI[] = [];

		this.trackedMatches.forEach(trackedMatch => {
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

		this.trackedMatches.forEach(match => {
			this.clearDecorations(match);
			match.cellViewModel.setSelections([match.initialSelection]); // correct cursor placement upon exiting cmd-d session
		});

		this.anchorDisposables.clear();
		this.cursorsDisposables.clear();
		this.cursorsControllers.clear();
		this.trackedMatches = [];
	}

	public async findAndTrackNextSelection(cell: ICellViewModel): Promise<void> {
		if (this.state === NotebookMultiCursorState.Idle) { // move cursor to end of the symbol + track it, transition to selecting state
			const textModel = cell.textModel;
			if (!textModel) {
				return;
			}

			const inputSelection = cell.getSelections()[0];
			const word = this.getWord(inputSelection, textModel);
			if (!word) {
				return;
			}
			this.word = word.word;

			const newSelection = new Selection(
				inputSelection.startLineNumber,
				word.startColumn,
				inputSelection.startLineNumber,
				word.endColumn
			);
			cell.setSelections([newSelection]);

			this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
			if (!this.anchorCell || this.anchorCell[0].handle !== cell.handle) {
				throw new Error('Active cell is not the same as the cell passed as context');
			}
			if (!(this.anchorCell[1] instanceof CodeEditorWidget)) {
				throw new Error('Active cell is not an instance of CodeEditorWidget');
			}

			textModel.pushStackElement();

			this.trackedMatches = [];
			const editorConfig = this.constructCellEditorOptions(this.anchorCell[0]);
			const newMatch: TrackedMatch = {
				cellViewModel: cell,
				initialSelection: inputSelection,
				wordSelections: [newSelection],
				config: editorConfig, // cache this in the match so we can create new cursors controllers with the correct language config
				decorationIds: [],
				undoRedoHistory: this.undoRedoService.getElements(cell.uri)
			};
			this.trackedMatches.push(newMatch);

			this.initializeMultiSelectDecorations(newMatch);
			this._nbIsMultiSelectSession.set(true);
			this.state = NotebookMultiCursorState.Selecting;
			this._nbMultiSelectState.set(NotebookMultiCursorState.Selecting);
			this._onDidChangeAnchorCell.fire();

		} else if (this.state === NotebookMultiCursorState.Selecting) { // use the word we stored from idle state transition to find next match, track it
			const notebookTextModel = this.notebookEditor.textModel;
			if (!notebookTextModel) {
				return;
			}

			const index = this.notebookEditor.getCellIndex(cell);
			if (index === undefined) {
				return;
			}

			const findResult = notebookTextModel.findNextMatch(
				this.word,
				{ cellIndex: index, position: cell.getSelections()[cell.getSelections().length - 1].getEndPosition() },
				false,
				true,
				USUAL_WORD_SEPARATORS //! might want to get these from the editor config
			);
			if (!findResult) {
				return; //todo: some sort of message to the user alerting them that there are no more matches? editor does not do this
			}

			const resultCellViewModel = this.notebookEditor.getCellByHandle(findResult.cell.handle);
			if (!resultCellViewModel) {
				return;
			}

			let newMatch: TrackedMatch;
			if (findResult.cell.handle !== cell.handle) { // result is in a different cell, move focus there and apply selection, then update anchor
				await this.notebookEditor.revealRangeInViewAsync(resultCellViewModel, findResult.match.range);
				this.notebookEditor.focusNotebookCell(resultCellViewModel, 'editor');

				const initialSelection = resultCellViewModel.getSelections()[0];
				const newSelection = Selection.fromRange(findResult.match.range, SelectionDirection.LTR);
				resultCellViewModel.setSelections([newSelection]);

				this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
				if (!this.anchorCell || !(this.anchorCell[1] instanceof CodeEditorWidget)) {
					throw new Error('Active cell is not an instance of CodeEditorWidget');
				}

				const textModel = await resultCellViewModel.resolveTextModel();
				textModel.pushStackElement();

				newMatch = {
					cellViewModel: resultCellViewModel,
					initialSelection: initialSelection,
					wordSelections: [newSelection],
					config: this.constructCellEditorOptions(this.anchorCell[0]),
					decorationIds: [],
					undoRedoHistory: this.undoRedoService.getElements(resultCellViewModel.uri)
				} satisfies TrackedMatch;
				this.trackedMatches.push(newMatch);

				this._onDidChangeAnchorCell.fire();

			} else { // match is in the same cell, find tracked entry, update and set selections
				newMatch = this.trackedMatches.find(match => match.cellViewModel.handle === findResult.cell.handle)!;
				newMatch.wordSelections.push(Selection.fromRange(findResult.match.range, SelectionDirection.LTR));
				resultCellViewModel.setSelections(newMatch.wordSelections);
			}

			this.initializeMultiSelectDecorations(newMatch);
		}
	}

	public async deleteLeft(): Promise<void> {
		this.trackedMatches.forEach(match => {
			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
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
	}

	async undo() {
		const models: ITextModel[] = [];
		for (const match of this.trackedMatches) {
			const model = await match.cellViewModel.resolveTextModel();
			if (model) {
				models.push(model);
			}
		}

		await Promise.all(models.map(model => model.undo()));
	}

	async redo() {
		const models: ITextModel[] = [];
		for (const match of this.trackedMatches) {
			const model = await match.cellViewModel.resolveTextModel();
			if (model) {
				models.push(model);
			}
		}

		await Promise.all(models.map(model => model.redo()));
	}

	private constructCellEditorOptions(cell: ICellViewModel): EditorConfiguration {
		const cellEditorOptions = new CellEditorOptions(this.notebookEditor.getBaseCellEditorOptions(cell.language), this.notebookEditor.notebookOptions, this.configurationService);
		const options = cellEditorOptions.getUpdatedValue(cell.internalMetadata, cell.uri);
		return new EditorConfiguration(false, MenuId.EditorContent, options, null, this.accessibilityService);
	}

	/**
	 * Updates the multicursor selection decorations for a specific matched cell
	 *
	 * @param match -- match object containing the viewmodel + selections
	 */
	private initializeMultiSelectDecorations(match: TrackedMatch) {
		const decorations: IModelDeltaDecoration[] = [];

		match.wordSelections.forEach(selection => {
			decorations.push({
				range: selection,
				options: {
					description: '',
					className: 'nb-multicursor-selection',
				}
			});
		});

		match.decorationIds = match.cellViewModel.deltaModelDecorations(
			match.decorationIds,
			decorations
		);
	}

	private updateLazyDecorations() {
		// for every tracked match that is not in the visible range, dispose of their decorations and update them based off the cursorcontroller
		this.trackedMatches.forEach(match => {
			const cellIndex = this.notebookEditor.getCellIndex(match.cellViewModel);
			if (cellIndex === undefined) {
				return;
			}

			const controller = this.cursorsControllers.get(match.cellViewModel.uri);
			if (!controller) {
				// should not happen
				return;
			}
			const selections = controller.getSelections();


			const newDecorations = selections?.map(selection => {
				return {
					range: selection,
					options: {
						description: '',
						className: 'nb-multicursor-selection',
					}
				};
			});

			match.decorationIds = match.cellViewModel.deltaModelDecorations(
				match.decorationIds,
				newDecorations ?? []
			);
		});
	}

	private clearDecorations(match: TrackedMatch) {
		match.decorationIds = match.cellViewModel.deltaModelDecorations(
			match.decorationIds,
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

	override dispose(): void {
		super.dispose();
		this.anchorDisposables.dispose();
		this.cursorsDisposables.dispose();

		this.trackedMatches.forEach(match => {
			this.clearDecorations(match);
		});
		this.trackedMatches = [];
	}

}

class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
			title: localize('addFindMatchToSelection', "Add Find Match to Selection"),
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiSelect.enabled', true),
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
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiSelect.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect,
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
			keybinding: {
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('config.notebook.multiSelect.enabled', true),
					NOTEBOOK_IS_ACTIVE_EDITOR,
					NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect,
					ContextKeyExpr.or(
						NOTEBOOK_MULTI_SELECTION_CONTEXT.NotebookMultiSelectState.isEqualTo(NotebookMultiCursorState.Selecting),
						NOTEBOOK_MULTI_SELECTION_CONTEXT.NotebookMultiSelectState.isEqualTo(NotebookMultiCursorState.Editing)
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

class NotebookMultiCursorUndoRedoContribution extends Disposable {

	static readonly ID = 'workbench.contrib.notebook.multiCursorUndoRedo';

	constructor(@IEditorService private readonly _editorService: IEditorService, @IConfigurationService private readonly configurationService: IConfigurationService) {
		super();

		if (!this.configurationService.getValue<boolean>('notebook.multiSelect.enabled')) {
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
			ContextKeyExpr.equals('config.notebook.multiSelect.enabled', true),
			NOTEBOOK_IS_ACTIVE_EDITOR,
			NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect,
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
			ContextKeyExpr.equals('config.notebook.multiSelect.enabled', true),
			NOTEBOOK_IS_ACTIVE_EDITOR,
			NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect,
		)));
	}
}

registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
registerAction2(NotebookDeleteLeftMultiSelectionAction);
registerWorkbenchContribution2(NotebookMultiCursorUndoRedoContribution.ID, NotebookMultiCursorUndoRedoContribution, WorkbenchPhase.BlockRestore);
