/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { Selection, SelectionDirection } from '../../../../../../editor/common/core/selection.js';
import { CursorChangeReason } from '../../../../../../editor/common/cursorEvents.js';
import { FindMatch, IModelDeltaDecoration, ITextModel } from '../../../../../../editor/common/model.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IActiveNotebookEditor, ICellViewModel, INotebookEditor, INotebookEditorContribution } from '../../notebookBrowser.js';
import { registerNotebookContribution } from '../../notebookEditorExtensions.js';

class NotebookSelectionHighlighter extends Disposable implements INotebookEditorContribution {

	static readonly id: string = 'notebook.selectionHighlighter';
	private isEnabled: boolean = false;

	private cellDecorationIds = new Map<ICellViewModel, string[]>();
	private anchorCell: [ICellViewModel, ICodeEditor] | undefined;
	private readonly anchorDisposables = new DisposableStore();

	// right now this lets us mimic the more performant cache implementation of the text editor (doesn't need to be a delayer)
	// todo: in the future, implement caching and change to a 250ms delay upon recompute
	// private readonly runDelayer: Delayer<void> = this._register(new Delayer<void>(0));

	constructor(
		private readonly notebookEditor: INotebookEditor,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.isEnabled = this.configurationService.getValue<boolean>('editor.selectionHighlight');
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.selectionHighlight')) {
				this.isEnabled = this.configurationService.getValue<boolean>('editor.selectionHighlight');
			}
		}));

		this._register(this.notebookEditor.onDidChangeActiveCell(async () => {
			if (!this.isEnabled) {
				return;
			}

			this.anchorCell = this.notebookEditor.activeCellAndCodeEditor;
			if (!this.anchorCell) {
				return;
			}

			const activeCell = this.notebookEditor.getActiveCell();
			if (!activeCell) {
				return;
			}

			if (!activeCell.editorAttached) {
				await Event.toPromise(activeCell.onDidChangeEditorAttachState);
			}

			this.clearNotebookSelectionDecorations();

			this.anchorDisposables.clear();
			this.anchorDisposables.add(this.anchorCell[1].onDidChangeCursorPosition((e) => {
				if (e.reason !== CursorChangeReason.Explicit) {
					return;
				}

				if (!this.anchorCell) {
					return;
				}

				if (this.notebookEditor.hasModel()) {
					this.clearNotebookSelectionDecorations();
					this._update(this.notebookEditor);
				}
			}));

			if (this.notebookEditor.getEditorViewState().editorFocused && this.notebookEditor.hasModel()) {
				this._update(this.notebookEditor);
			}
		}));
	}

	private _update(editor: IActiveNotebookEditor) {
		if (!this.anchorCell || !this.isEnabled) {
			return;
		}

		// TODO: isTooLargeForTokenization check, notebook equivalent?
		// unlikely that any one cell's textmodel would be too large

		// get the word
		const textModel = this.anchorCell[0].textModel;
		if (!textModel || textModel.isTooLargeForTokenization()) {
			return;
		}
		const s = this.anchorCell[0].getSelections()[0];
		if (s.startLineNumber !== s.endLineNumber || s.isEmpty()) {
			// empty selections do nothing
			// multiline forbidden for perf reasons
			return;
		}
		const searchText = this.getSearchText(s, textModel);
		if (!searchText) {
			return;
		}

		const results = editor.textModel.findMatches(
			searchText,
			false,
			true,
			null,
		);

		for (const res of results) {
			const cell = editor.getCellByHandle(res.cell.handle);
			if (!cell) {
				continue;
			}

			this.updateCellDecorations(cell, res.matches);
		}
	}

	private updateCellDecorations(cell: ICellViewModel, matches: FindMatch[]) {
		const selections: Selection[] = matches.map(m => {
			return Selection.fromRange(m.range, SelectionDirection.LTR);
		});

		const newDecorations: IModelDeltaDecoration[] = [];
		selections?.map(selection => {
			const isEmpty = selection.isEmpty();

			if (!isEmpty) {
				newDecorations.push({
					range: selection,
					options: {
						description: '',
						className: '.nb-selection-highlight',
					}
				});
			}
		});

		const oldDecorations = this.cellDecorationIds.get(cell) ?? [];
		this.cellDecorationIds.set(cell, cell.deltaModelDecorations(
			oldDecorations,
			newDecorations
		));
	}

	private clearNotebookSelectionDecorations() {
		this.cellDecorationIds.forEach((_, cell) => {
			const cellDecorations = this.cellDecorationIds.get(cell) ?? [];
			if (cellDecorations) {
				cell.deltaModelDecorations(cellDecorations, []);
				this.cellDecorationIds.delete(cell);
			}
		});
	}

	private getSearchText(selection: Selection, model: ITextModel): string {
		return model.getValueInRange(selection).replace(/\r\n/g, '\n');
	}

	override dispose(): void {
		super.dispose();
		this.anchorDisposables.dispose();
	}
}

registerNotebookContribution(NotebookSelectionHighlighter.id, NotebookSelectionHighlighter);
