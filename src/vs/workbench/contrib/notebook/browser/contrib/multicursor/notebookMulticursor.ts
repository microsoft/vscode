/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IWordAtPosition, USUAL_WORD_SEPARATORS } from 'vs/editor/common/core/wordHelper';
import { ITextModel } from 'vs/editor/common/model';
import { SearchParams } from 'vs/editor/common/model/textModelSearch';
import { localize } from 'vs/nls';
import { registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { FindModel } from 'vs/workbench/contrib/notebook/browser/contrib/find/findModel';
import { INotebookActionContext, NotebookAction } from 'vs/workbench/contrib/notebook/browser/controller/coreActions';
import { getNotebookEditorFromEditorPane, ICellViewModel, INotebookEditor, INotebookEditorContribution } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { registerNotebookContribution } from 'vs/workbench/contrib/notebook/browser/notebookEditorExtensions';
import { ICell, INotebookTextModel } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const NOTEBOOK_ADD_FIND_MATCH_TO_SELECTION_ID = 'notebook.addFindMatchToSelection';

enum NotebookMultiCursorState {
	Idle,
	Selecting,
	Editing
}

export class NotebookMultiCursorController extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.multiCursor';

	// private findModel: FindModel;
	private notebookTextModel: INotebookTextModel | undefined; //! not sure about this one... do I even need it

	private state: NotebookMultiCursorState = NotebookMultiCursorState.Idle;

	private word: string = '';
	private trackedSelections: [ICellViewModel, Selection[]][] = [];

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		// this.findModel = this._register(new FindModel(this.notebookEditor, this._state, configurationService));
		this.notebookTextModel = this.notebookEditor.textModel;

		//! need something to listen for typing here to switch to editing mode (maybe)
	}

	public findAndTrackNextSelection(cell: ICellViewModel): Promise<void> {
		if (this.state === NotebookMultiCursorState.Idle) { // move cursor to end of the symbol + track it, transition to selecting state
			const textModel = cell.textModel;
			if (!textModel) {
				return Promise.resolve();
			}

			const word = this.getWord(cell.getSelections()[0], textModel)?.word || '';
			if (!word) {
				return Promise.resolve();
			}

			// set selection via the viewmodel here

			this.state = NotebookMultiCursorState.Selecting;
		} else if (this.state === NotebookMultiCursorState.Selecting) { // use the word we stored from idle state transition to find next match, track it
			const textSelection = cell.getSelections()[0];
			const lineCount = cell.textBuffer.getLineCount();

			const searchParams = new SearchParams(this.word, false, true, USUAL_WORD_SEPARATORS);
			const searchData = searchParams.parseSearchRequest();
			if (!searchData) {
				return Promise.resolve();
			}


			const matches = cell.textBuffer.findMatchesLineByLine(
				new Range(textSelection.startLineNumber, textSelection.startColumn, lineCount, cell.textBuffer.getLineLength(lineCount)),
				searchData,
				true, //! what does this do
				1000, //! may need to limit this later? unsure of perf implications here. many cells w matches in each could be costly
			);



			return Promise.resolve();
		} else if (this.state === NotebookMultiCursorState.Editing) {
			// bad for now, need to handle this case when they hit ctrlD while in editing state
		}
	}

	private applyEditsAcrossSeletions() {
		// use tracked selections -> text models
		// apply edits to each text model
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
	}

}

class NotebookAddFindMatchToSelectionAction extends NotebookAction {
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

	override runWithContext(accessor: ServicesAccessor, context: INotebookActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);

		if (!editor) {
			return Promise.resolve();
		}

		if (!context.cell) {
			return Promise.resolve();
		}

		const controller = editor.getContribution<NotebookMultiCursorController>(NotebookMultiCursorController.id);
		controller.findAndTrackNextSelection(context.cell);
		return Promise.resolve(); //! this isn't right i dont think. but don't want errors rn
	}

}

registerNotebookContribution(NotebookMultiCursorController.id, NotebookMultiCursorController);
registerAction2(NotebookAddFindMatchToSelectionAction);
