/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED, INotebookEditor, CellFindMatch, CellEditState } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { FindDecorations } from 'vs/editor/contrib/find/findDecorations';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelDeltaDecoration } from 'vs/editor/common/model';
import { ICellModelDeltaDecorations, ICellModelDecorations } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModel';
import { PrefixSumComputer } from 'vs/editor/common/viewModel/prefixSumComputer';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { SimpleFindReplaceWidget } from 'vs/workbench/contrib/codeEditor/browser/find/simpleFindReplaceWidget';
import { IThemeService } from 'vs/platform/theme/common/themeService';

export class NotebookFindWidget extends SimpleFindReplaceWidget {
	protected _findWidgetFocused: IContextKey<boolean>;
	private _findMatches: CellFindMatch[] = [];
	protected _findMatchesStarts: PrefixSumComputer | null = null;
	private _currentMatch: number = -1;
	private _allMatchesDecorations: ICellModelDecorations[] = [];
	private _currentMatchDecorations: ICellModelDecorations[] = [];

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		@IContextViewService contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService themeService: IThemeService,

	) {
		super(contextViewService, contextKeyService, themeService);
		this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
		this._register(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
	}

	private _onFindInputKeyDown(e: IKeyboardEvent): void {
		if (e.equals(KeyCode.Enter)) {
			if (this._findMatches.length) {
				this.find(false);
			} else {
				this.set(null);
			}
			e.preventDefault();
			return;
		} else if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
			if (this._findMatches.length) {
				this.find(true);
			} else {
				this.set(null);
			}
			e.preventDefault();
			return;
		}
	}

	protected onInputChanged(): boolean {
		const val = this.inputValue;
		if (val) {
			this._findMatches = this._notebookEditor.viewModel!.find(val).filter(match => match.matches.length > 0);
			if (this._findMatches.length) {
				return true;
			} else {
				return false;
			}
		}

		return false;
	}

	protected find(previous: boolean): void {
		if (!this._findMatches.length) {
			return;
		}

		if (!this._findMatchesStarts) {
			this.set(this._findMatches);
		} else {
			const totalVal = this._findMatchesStarts!.getTotalValue();
			const nextVal = (this._currentMatch + (previous ? -1 : 1) + totalVal) % totalVal;
			this._currentMatch = nextVal;
		}


		const nextIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
		this.setCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder);
		this.revealCellRange(nextIndex.index, nextIndex.remainder);
	}

	protected replaceOne() {
		if (!this._findMatches.length) {
			return;
		}

		if (!this._findMatchesStarts) {
			this.set(this._findMatches);
		}

		const nextIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
		const cell = this._findMatches[nextIndex.index].cell;
		const match = this._findMatches[nextIndex.index].matches[nextIndex.remainder];

		this._progressBar.infinite().show();

		this._notebookEditor.viewModel!.replaceOne(cell, match.range, this.replaceValue).then(() => {
			this._progressBar.stop();
		});
	}

	protected replaceAll() {
		this._progressBar.infinite().show();

		this._notebookEditor.viewModel!.replaceAll(this._findMatches, this.replaceValue).then(() => {
			this._progressBar.stop();
		});
	}

	private revealCellRange(cellIndex: number, matchIndex: number) {
		this._findMatches[cellIndex].cell.editState = CellEditState.Editing;
		this._notebookEditor.selectElement(this._findMatches[cellIndex].cell);
		this._notebookEditor.setCellSelection(this._findMatches[cellIndex].cell, this._findMatches[cellIndex].matches[matchIndex].range);
		this._notebookEditor.revealRangeInCenterIfOutsideViewport(this._findMatches[cellIndex].cell, this._findMatches[cellIndex].matches[matchIndex].range);
	}

	hide() {
		super.hide();
		this.set([]);
	}

	protected findFirst(): void { }

	protected onFocusTrackerFocus() {
		this._findWidgetFocused.set(true);
	}

	protected onFocusTrackerBlur() {
		this._findWidgetFocused.reset();
	}

	protected onReplaceInputFocusTrackerFocus(): void {
		// throw new Error('Method not implemented.');
	}
	protected onReplaceInputFocusTrackerBlur(): void {
		// throw new Error('Method not implemented.');
	}

	protected onFindInputFocusTrackerFocus(): void { }
	protected onFindInputFocusTrackerBlur(): void { }

	private constructFindMatchesStarts() {
		if (this._findMatches && this._findMatches.length) {
			const values = new Uint32Array(this._findMatches.length);
			for (let i = 0; i < this._findMatches.length; i++) {
				values[i] = this._findMatches[i].matches.length;
			}

			this._findMatchesStarts = new PrefixSumComputer(values);
		} else {
			this._findMatchesStarts = null;
		}
	}

	private set(cellFindMatches: CellFindMatch[] | null): void {
		if (!cellFindMatches || !cellFindMatches.length) {
			this._findMatches = [];
			this.setAllFindMatchesDecorations([]);

			this.constructFindMatchesStarts();
			this._currentMatch = -1;
			this.clearCurrentFindMatchDecoration();
			return;
		}

		// all matches
		this._findMatches = cellFindMatches;
		this.setAllFindMatchesDecorations(cellFindMatches || []);

		// current match
		this.constructFindMatchesStarts();
		this._currentMatch = 0;
		this.setCurrentFindMatchDecoration(0, 0);
	}

	private setCurrentFindMatchDecoration(cellIndex: number, matchIndex: number) {
		this._notebookEditor.changeDecorations(accessor => {
			const findMatchesOptions: ModelDecorationOptions = FindDecorations._CURRENT_FIND_MATCH_DECORATION;

			const cell = this._findMatches[cellIndex].cell;
			const match = this._findMatches[cellIndex].matches[matchIndex];
			const decorations: IModelDeltaDecoration[] = [
				{ range: match.range, options: findMatchesOptions }
			];
			const deltaDecoration: ICellModelDeltaDecorations = {
				ownerId: cell.handle,
				decorations: decorations
			};

			this._currentMatchDecorations = accessor.deltaDecorations(this._currentMatchDecorations, [deltaDecoration]);
		});
	}

	private clearCurrentFindMatchDecoration() {
		this._notebookEditor.changeDecorations(accessor => {
			this._currentMatchDecorations = accessor.deltaDecorations(this._currentMatchDecorations, []);
		});
	}

	private setAllFindMatchesDecorations(cellFindMatches: CellFindMatch[]) {
		this._notebookEditor.changeDecorations((accessor) => {

			let findMatchesOptions: ModelDecorationOptions = FindDecorations._FIND_MATCH_DECORATION;

			let deltaDecorations: ICellModelDeltaDecorations[] = cellFindMatches.map(cellFindMatch => {
				const findMatches = cellFindMatch.matches;

				// Find matches
				let newFindMatchesDecorations: IModelDeltaDecoration[] = new Array<IModelDeltaDecoration>(findMatches.length);
				for (let i = 0, len = findMatches.length; i < len; i++) {
					newFindMatchesDecorations[i] = {
						range: findMatches[i].range,
						options: findMatchesOptions
					};
				}

				return { ownerId: cellFindMatch.cell.handle, decorations: newFindMatchesDecorations };
			});

			this._allMatchesDecorations = accessor.deltaDecorations(this._allMatchesDecorations, deltaDecorations);
		});
	}

	clear() {
		this._currentMatch = -1;
		this._findMatches = [];
	}
}
