/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { EditorConfiguration } from 'vs/editor/browser/config/editorConfiguration';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { IEditorConfiguration } from 'vs/editor/common/config/editorConfiguration';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection, SelectionDirection } from 'vs/editor/common/core/selection';
import { IWordAtPosition, USUAL_WORD_SEPARATORS } from 'vs/editor/common/core/wordHelper';
import { CursorsController } from 'vs/editor/common/cursor/cursor';
import { CursorConfiguration } from 'vs/editor/common/cursorCommon';
import { CursorChangeReason } from 'vs/editor/common/cursorEvents';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IModelDeltaDecoration, ITextModel, PositionAffinity } from 'vs/editor/common/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ICoordinatesConverter } from 'vs/editor/common/viewModel';
import { ViewModelEventsCollector } from 'vs/editor/common/viewModelEventDispatcher';
import { localize } from 'vs/nls';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { INotebookActionContext, NotebookAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = 'notebook.addFindMatchToSelection';

export const NOTEBOOK_MULTI_SELECTION_CONTEXT = {
	IsNotebookMultiSelect: new RawContextKey<boolean>('isNotebookMultiSelect', false),
};

enum NotebookMultiCursorState {
	Idle,
	Selecting,
}

interface TrackedMatch {
	cellViewModel: ICellViewModel;
	selections: Selection[];
	config: IEditorConfiguration;
}

export class NotebookMultiCursorController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.multiCursorController';

	private state: NotebookMultiCursorState = NotebookMultiCursorState.Idle;

	private word: string = '';
	private trackedMatches: TrackedMatch[] = [];

	private readonly _onDidChangeAnchorCell = this._register(new Emitter<void>());
	readonly onDidChangeAnchorCell: Event<void> = this._onDidChangeAnchorCell.event;
	private anchorCell: [ICellViewModel, ICodeEditor] | undefined;

	private readonly decorationDisposables = new DisposableStore();
	private readonly anchorDisposables = new DisposableStore();
	private readonly cursorsDisposables = new DisposableStore();
	private cursorsControllers: CursorsController[] = [];

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@ILanguageConfigurationService private readonly languageConfigurationService: ILanguageConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

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
			// skip this for the anchor cell, there is already a controller for it since it's the focused editor
			if (match.cellViewModel.handle === this.anchorCell?.[0].handle) {
				return;
			}

			const textModelRef = await this.textModelService.createModelReference(match.cellViewModel.uri);
			const textModel = textModelRef.object.textEditorModel;
			if (!textModel) {
				return;
			}

			const editorConfig = match.config;

			const converter: ICoordinatesConverter = {
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

			const controller = this.cursorsDisposables.add(new CursorsController(
				textModel,
				match.cellViewModel,
				converter,
				new CursorConfiguration(textModel.getLanguageId(), textModel.getOptions(), editorConfig, this.languageConfigurationService)
			));
			controller.setSelections(new ViewModelEventsCollector(), undefined, match.selections, CursorChangeReason.Explicit);
			this.cursorsControllers.push(controller);
		});
	}

	private updateAnchorListeners() {
		this.anchorDisposables.clear();

		if (!this.anchorCell) {
			throw new Error('Anchor cell is undefined');
		}

		// typing
		this.anchorDisposables.add(this.anchorCell[1].onWillType((input) => {
			this.state = NotebookMultiCursorState.Idle; // typing will continue to work as normal across ranges, just preps for another cmd+d
			this.cursorsControllers.forEach(cursorController => {
				cursorController.type(new ViewModelEventsCollector(), input, 'keyboard');
			});
		}));

		// composition
		this.anchorDisposables.add(this.anchorCell[1].onDidCompositionStart(() => {
			this.state = NotebookMultiCursorState.Idle;
			this.cursorsControllers.forEach(cursorController => {
				cursorController.startComposition(new ViewModelEventsCollector());
			});
		}));

		// cut
		// this.anchorDisposables.add(this.anchorCell[1].asdfasdfasdf(() => {
		// 	this.cursorsControllers.forEach(cursorController => {
		// 		cursorController.cut(new ViewModelEventsCollector());
		// 	});
		// }));
	}

	public exitEditingState() {
		this.state = NotebookMultiCursorState.Idle;
		NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect.bindTo(this.contextKeyService).set(false);

		this.decorationDisposables.clear();
		this.anchorDisposables.clear();
		this.cursorsDisposables.clear();
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

			this.trackedMatches = [];
			const editorConfig = this.constructCellEditorOptions(this.anchorCell[0]);
			const newMatch: TrackedMatch = {
				cellViewModel: cell,
				selections: [newSelection],
				config: editorConfig, // cache this in the match so we can create new cursors controllers with the correct language config
			};
			this.trackedMatches.push(newMatch);

			this.updateMultiSelectDecorations(newMatch);
			NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect.bindTo(this.contextKeyService).set(true);
			this.state = NotebookMultiCursorState.Selecting;

		} else if (this.state === NotebookMultiCursorState.Selecting) { // use the word we stored from idle state transition to find next match, track it
			const notebookTextModel = this.notebookEditor.textModel;
			if (!notebookTextModel) {
				return;
			}

			const index = notebookTextModel._getCellIndexByHandle(cell.handle);
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

			const resultCellViewModel = this.notebookEditor.getViewModel()?.viewCells.find(cell => cell.handle === findResult.cell.handle);
			if (!resultCellViewModel) {
				return;
			}

			let newMatch: TrackedMatch;
			if (findResult.cell.handle !== cell.handle) { // result is in a different cell, move focus there and apply selection, then update anchor
				this.notebookEditor.focusNotebookCell(resultCellViewModel, 'editor');

				const newSelection = Selection.fromRange(findResult.match.range, SelectionDirection.LTR);
				resultCellViewModel.setSelections([newSelection]);

				this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
				if (!this.anchorCell || !(this.anchorCell[1] instanceof CodeEditorWidget)) {
					throw new Error('Active cell is not an instance of CodeEditorWidget');
				}

				newMatch = {
					cellViewModel: resultCellViewModel,
					selections: [newSelection],
					config: this.constructCellEditorOptions(this.anchorCell[0]),
				} satisfies TrackedMatch;
				this.trackedMatches.push(newMatch);

				this._onDidChangeAnchorCell.fire();

			} else { // match is in the same cell, find tracked entry, update and set selections
				newMatch = this.trackedMatches.find(match => match.cellViewModel.handle === findResult.cell.handle)!;
				newMatch.selections.push(Selection.fromRange(findResult.match.range, SelectionDirection.LTR));
				resultCellViewModel.setSelections(newMatch.selections);
			}

			this.updateMultiSelectDecorations(newMatch);
		}
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
	private updateMultiSelectDecorations(match: TrackedMatch) {
		const decorations: IModelDeltaDecoration[] = [];

		match.selections.forEach(selection => {
			decorations.push({
				range: selection,
				options: {
					description: '',
					className: 'nb-multicursor-selection',
				}
			});
		});

		const ids = match.cellViewModel.deltaModelDecorations(
			[],
			decorations
		);

		this.decorationDisposables.add({
			dispose: () => {
				match.cellViewModel.deltaModelDecorations(
					ids,
					[]
				);
			}
		});
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
		this.decorationDisposables.dispose();
		this.anchorDisposables.dispose();
		this.cursorsDisposables.dispose();
		this.trackedMatches = [];
	}

}

class NotebookAddMatchToMultiSelectionAction extends NotebookAction {
	constructor() {
		super({
			id: NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID,
			title: localize('addFindMatchToSelection', "Add Find Match to Selection"),
			keybinding: {
				when: undefined,
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
				when: NOTEBOOK_MULTI_SELECTION_CONTEXT.IsNotebookMultiSelect,
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
		controller.exitEditingState();
	}
}

registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerAction2(NotebookAddMatchToMultiSelectionAction);
registerAction2(NotebookExitMultiSelectionAction);
