/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { INotebookEditor, CellEditState, CellFindMatchWithIndex, CellWebviewFindMatch, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { Range } from 'vs/editor/common/core/range';
import { FindMatch } from 'vs/editor/common/model';
import { PrefixSumComputer } from 'vs/editor/common/model/prefixSumComputer';
import { FindReplaceState, FindReplaceStateChangedEvent } from 'vs/editor/contrib/find/browser/findState';
import { CellKind, INotebookSearchOptions, NotebookCellsChangeType } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { findFirstInSorted } from 'vs/base/common/arrays';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CancellationToken } from 'vs/base/common/cancellation';
import { NotebookFindFilters } from 'vs/workbench/contrib/notebook/browser/contrib/find/findFilters';
import { FindMatchDecorationModel } from 'vs/workbench/contrib/notebook/browser/contrib/find/findMatchDecorationModel';
import { NotebookViewModel } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl';

export class CellFindMatchModel implements CellFindMatchWithIndex {
	readonly cell: ICellViewModel;
	readonly index: number;
	private _contentMatches: FindMatch[];
	private _webviewMatches: CellWebviewFindMatch[];
	get length() {
		return this._contentMatches.length + this._webviewMatches.length;
	}

	get contentMatches(): FindMatch[] {
		return this._contentMatches;
	}

	get webviewMatches(): CellWebviewFindMatch[] {
		return this._webviewMatches;
	}

	constructor(cell: ICellViewModel, index: number, contentMatches: FindMatch[], webviewMatches: CellWebviewFindMatch[]) {
		this.cell = cell;
		this.index = index;
		this._contentMatches = contentMatches;
		this._webviewMatches = webviewMatches;
	}

	getMatch(index: number) {
		if (index >= this.length) {
			throw new Error('NotebookCellFindMatch: index out of range');
		}

		if (index < this._contentMatches.length) {
			return this._contentMatches[index];
		}

		return this._webviewMatches[index - this._contentMatches.length];
	}
}

export class FindModel extends Disposable {
	private _findMatches: CellFindMatchWithIndex[] = [];
	protected _findMatchesStarts: PrefixSumComputer | null = null;
	private _currentMatch: number = -1;

	private readonly _throttledDelayer: Delayer<void>;
	private _computePromise: CancelablePromise<CellFindMatchWithIndex[] | null> | null = null;
	private readonly _modelDisposable = this._register(new DisposableStore());
	private _findMatchDecorationModel: FindMatchDecorationModel;

	get findMatches() {
		return this._findMatches;
	}

	get currentMatch() {
		return this._currentMatch;
	}

	constructor(
		private readonly _notebookEditor: INotebookEditor,
		private readonly _state: FindReplaceState<NotebookFindFilters>,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();

		this._throttledDelayer = new Delayer(20);
		this._computePromise = null;

		this._register(_state.onFindReplaceStateChange(e => {
			this._updateCellStates(e);

			if (e.searchString || e.isRegex || e.matchCase || e.searchScope || e.wholeWord || (e.isRevealed && this._state.isRevealed) || e.filters || e.isReplaceRevealed) {
				this.research();
			}

			if (e.isRevealed && !this._state.isRevealed) {
				this.clear();
			}
		}));

		this._register(this._notebookEditor.onDidChangeModel(e => {
			this._registerModelListener(e);
		}));

		this._register(this._notebookEditor.onDidChangeCellState(e => {
			if (e.cell.cellKind === CellKind.Markup && e.source.editStateChanged) {
				// research when markdown cell is switching between markdown preview and editing mode.
				this.research();
			}
		}));

		if (this._notebookEditor.hasModel()) {
			this._registerModelListener(this._notebookEditor.textModel);
		}

		this._findMatchDecorationModel = new FindMatchDecorationModel(this._notebookEditor);
	}

	private _updateCellStates(e: FindReplaceStateChangedEvent) {
		if (!this._state.filters?.markupInput) {
			return;
		}

		if (!this._state.filters?.markupPreview) {
			return;
		}

		// we only update cell state if users are using the hybrid mode (both input and preview are enabled)
		const updateEditingState = () => {
			const viewModel = this._notebookEditor._getViewModel() as NotebookViewModel | undefined;
			if (!viewModel) {
				return;
			}
			// search markup sources first to decide if a markup cell should be in editing mode
			const wordSeparators = this._configurationService.inspect<string>('editor.wordSeparators').value;
			const options: INotebookSearchOptions = {
				regex: this._state.isRegex,
				wholeWord: this._state.wholeWord,
				caseSensitive: this._state.matchCase,
				wordSeparators: wordSeparators,
				includeMarkupInput: true,
				includeCodeInput: false,
				includeMarkupPreview: false,
				includeOutput: false
			};

			const contentMatches = viewModel.find(this._state.searchString, options);
			for (let i = 0; i < viewModel.length; i++) {
				const cell = viewModel.cellAt(i);
				if (cell && cell.cellKind === CellKind.Markup) {
					const foundContentMatch = contentMatches.find(m => m.cell.handle === cell.handle && m.contentMatches.length > 0);
					const targetState = foundContentMatch ? CellEditState.Editing : CellEditState.Preview;
					const currentEditingState = cell.getEditState();

					if (currentEditingState === CellEditState.Editing && cell.editStateSource !== 'find') {
						// it's already in editing mode, we should not update
						continue;
					}
					if (currentEditingState !== targetState) {
						cell.updateEditState(targetState, 'find');
					}
				}
			}
		};


		if (e.isReplaceRevealed && !this._state.isReplaceRevealed) {
			// replace is hidden, we need to switch all markdown cells to preview mode
			const viewModel = this._notebookEditor._getViewModel() as NotebookViewModel | undefined;
			if (!viewModel) {
				return;
			}

			for (let i = 0; i < viewModel.length; i++) {
				const cell = viewModel.cellAt(i);
				if (cell && cell.cellKind === CellKind.Markup) {
					if (cell.getEditState() === CellEditState.Editing && cell.editStateSource === 'find') {
						cell.updateEditState(CellEditState.Preview, 'find');
					}
				}
			}

			return;
		}

		if (e.isReplaceRevealed) {
			updateEditingState();
		} else if ((e.filters || e.isRevealed || e.searchString || e.replaceString) && this._state.isRevealed && this._state.isReplaceRevealed) {
			updateEditingState();
		}
	}

	ensureFindMatches() {
		if (!this._findMatchesStarts) {
			this.set(this._findMatches, true);
		}
	}

	getCurrentMatch() {
		const nextIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
		const cell = this._findMatches[nextIndex.index].cell;
		const match = this._findMatches[nextIndex.index].getMatch(nextIndex.remainder);

		return {
			cell,
			match,
			isModelMatch: nextIndex.remainder < this._findMatches[nextIndex.index].contentMatches.length
		};
	}

	refreshCurrentMatch(focus: { cell: ICellViewModel; range: Range }) {
		const findMatchIndex = this.findMatches.findIndex(match => match.cell === focus.cell);

		if (findMatchIndex === -1) {
			return;
		}

		const findMatch = this.findMatches[findMatchIndex];
		const index = findMatch.contentMatches.findIndex(match => match.range.intersectRanges(focus.range) !== null);

		if (index === undefined) {
			return;
		}

		const matchesBefore = findMatchIndex === 0 ? 0 : (this._findMatchesStarts?.getPrefixSum(findMatchIndex - 1) ?? 0);
		this._currentMatch = matchesBefore + index;

		this.highlightCurrentFindMatchDecoration(findMatchIndex, index).then(offset => {
			this.revealCellRange(findMatchIndex, index, offset);

			this._state.changeMatchInfo(
				this._currentMatch,
				this._findMatches.reduce((p, c) => p + c.length, 0),
				undefined
			);
		});
	}

	find(option: { previous: boolean } | { index: number }) {
		if (!this.findMatches.length) {
			return;
		}

		// let currCell;
		if (!this._findMatchesStarts) {
			this.set(this._findMatches, true);
			if ('index' in option) {
				this._currentMatch = option.index;
			}
		} else {
			// const currIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
			// currCell = this._findMatches[currIndex.index].cell;
			const totalVal = this._findMatchesStarts.getTotalSum();
			if ('index' in option) {
				this._currentMatch = option.index;
			}
			else if (this._currentMatch === -1) {
				this._currentMatch = option.previous ? totalVal - 1 : 0;
			} else {
				const nextVal = (this._currentMatch + (option.previous ? -1 : 1) + totalVal) % totalVal;
				this._currentMatch = nextVal;
			}
		}

		const nextIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
		// const newFocusedCell = this._findMatches[nextIndex.index].cell;
		this.highlightCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder).then(offset => {
			this.revealCellRange(nextIndex.index, nextIndex.remainder, offset);

			this._state.changeMatchInfo(
				this._currentMatch,
				this._findMatches.reduce((p, c) => p + c.length, 0),
				undefined
			);
		});
	}

	private revealCellRange(cellIndex: number, matchIndex: number, outputOffset: number | null) {
		const findMatch = this._findMatches[cellIndex];
		if (matchIndex >= findMatch.contentMatches.length) {
			// reveal output range
			this._notebookEditor.focusElement(findMatch.cell);
			const index = this._notebookEditor.getCellIndex(findMatch.cell);
			if (index !== undefined) {
				// const range: ICellRange = { start: index, end: index + 1 };
				this._notebookEditor.revealCellOffsetInCenterAsync(findMatch.cell, outputOffset ?? 0);
			}
		} else {
			const match = findMatch.getMatch(matchIndex) as FindMatch;
			if (findMatch.cell.getEditState() !== CellEditState.Editing) {
				findMatch.cell.updateEditState(CellEditState.Editing, 'find');
			}
			findMatch.cell.isInputCollapsed = false;
			this._notebookEditor.focusElement(findMatch.cell);
			this._notebookEditor.setCellEditorSelection(findMatch.cell, match.range);
			this._notebookEditor.revealRangeInCenterIfOutsideViewportAsync(findMatch.cell, match.range);
		}
	}

	private _registerModelListener(notebookTextModel?: NotebookTextModel) {
		this._modelDisposable.clear();

		if (notebookTextModel) {
			this._modelDisposable.add(notebookTextModel.onDidChangeContent((e) => {
				if (!e.rawEvents.some(event => event.kind === NotebookCellsChangeType.ChangeCellContent || event.kind === NotebookCellsChangeType.ModelChange)) {
					return;
				}

				this.research();
			}));
		}

		this.research();
	}

	async research() {
		return this._throttledDelayer.trigger(async () => {
			this._state.change({ isSearching: true }, false);
			await this._research();
			this._state.change({ isSearching: false }, false);
		});
	}

	async _research() {
		this._computePromise?.cancel();

		if (!this._state.isRevealed || !this._notebookEditor.hasModel()) {
			this.set([], false);
			return;
		}

		this._computePromise = createCancelablePromise(token => this._compute(token));

		const findMatches = await this._computePromise;
		if (!findMatches) {
			this.set([], false);
			return;
		}

		if (findMatches.length === 0) {
			this.set([], false);
			return;
		}

		const findFirstMatchAfterCellIndex = (cellIndex: number) => {
			const matchAfterSelection = findFirstInSorted(findMatches.map(match => match.index), index => index >= cellIndex);
			this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
		};

		if (this._currentMatch === -1) {
			// no active current match
			if (this._notebookEditor.getLength() === 0) {
				this.set(findMatches, false);
				return;
			} else {
				const focus = this._notebookEditor.getFocus().start;
				findFirstMatchAfterCellIndex(focus);
				this.set(findMatches, false);
				return;
			}
		}

		const oldCurrIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
		const oldCurrCell = this._findMatches[oldCurrIndex.index].cell;
		const oldCurrMatchCellIndex = this._notebookEditor.getCellIndex(oldCurrCell);


		if (oldCurrMatchCellIndex < 0) {
			// the cell containing the active match is deleted
			if (this._notebookEditor.getLength() === 0) {
				this.set(findMatches, false);
				return;
			}

			findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
			return;
		}

		// the cell still exist
		const cell = this._notebookEditor.cellAt(oldCurrMatchCellIndex);
		// we will try restore the active find match in this cell, if it contains any find match

		if (cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Preview) {
			// find first match in this cell or below
			findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
			return;
		}

		// the cell is a markup cell in editing mode or a code cell, both should have monaco editor rendered

		if (!this._findMatchDecorationModel.currentMatchDecorations) {
			// no current highlight decoration
			findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
			return;
		}

		// check if there is monaco editor selection and find the first match, otherwise find the first match above current cell
		// this._findMatches[cellIndex].matches[matchIndex].range
		if (this._findMatchDecorationModel.currentMatchDecorations.kind === 'input') {
			const currentMatchDecorationId = this._findMatchDecorationModel.currentMatchDecorations.decorations.find(decoration => decoration.ownerId === cell.handle);

			if (!currentMatchDecorationId) {
				// current match decoration is no longer valid
				findFirstMatchAfterCellIndex(oldCurrMatchCellIndex);
				return;
			}

			const matchAfterSelection = findFirstInSorted(findMatches, match => match.index >= oldCurrMatchCellIndex) % findMatches.length;
			if (findMatches[matchAfterSelection].index > oldCurrMatchCellIndex) {
				// there is no search result in curr cell anymore, find the nearest one (from top to bottom)
				this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
				return;
			} else {
				// there are still some search results in current cell
				let currMatchRangeInEditor = cell.editorAttached && currentMatchDecorationId.decorations[0] ? cell.getCellDecorationRange(currentMatchDecorationId.decorations[0]) : null;

				if (currMatchRangeInEditor === null && oldCurrIndex.remainder < this._findMatches[oldCurrIndex.index].contentMatches.length) {
					currMatchRangeInEditor = (this._findMatches[oldCurrIndex.index].getMatch(oldCurrIndex.remainder) as FindMatch).range;
				}

				if (currMatchRangeInEditor !== null) {
					// we find a range for the previous current match, let's find the nearest one after it (can overlap)
					const cellMatch = findMatches[matchAfterSelection];
					const matchAfterOldSelection = findFirstInSorted(cellMatch.contentMatches, match => Range.compareRangesUsingStarts((match as FindMatch).range, currMatchRangeInEditor) >= 0);
					this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection) + matchAfterOldSelection);
				} else {
					// no range found, let's fall back to finding the nearest match
					this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
					return;
				}
			}
		} else {
			// output now has the highlight
			const matchAfterSelection = findFirstInSorted(findMatches.map(match => match.index), index => index >= oldCurrMatchCellIndex) % findMatches.length;
			this._updateCurrentMatch(findMatches, this._matchesCountBeforeIndex(findMatches, matchAfterSelection));
		}
	}

	private set(cellFindMatches: CellFindMatchWithIndex[] | null, autoStart: boolean): void {
		if (!cellFindMatches || !cellFindMatches.length) {
			this._findMatches = [];
			this._findMatchDecorationModel.setAllFindMatchesDecorations([]);

			this.constructFindMatchesStarts();
			this._currentMatch = -1;
			this._findMatchDecorationModel.clearCurrentFindMatchDecoration();

			this._state.changeMatchInfo(
				this._currentMatch,
				this._findMatches.reduce((p, c) => p + c.length, 0),
				undefined
			);
			return;
		}

		// all matches
		this._findMatches = cellFindMatches;
		this._findMatchDecorationModel.setAllFindMatchesDecorations(cellFindMatches || []);

		// current match
		this.constructFindMatchesStarts();

		if (autoStart) {
			this._currentMatch = 0;
			this.highlightCurrentFindMatchDecoration(0, 0);
		}

		this._state.changeMatchInfo(
			this._currentMatch,
			this._findMatches.reduce((p, c) => p + c.length, 0),
			undefined
		);
	}

	private async _compute(token: CancellationToken): Promise<CellFindMatchWithIndex[] | null> {
		let ret: CellFindMatchWithIndex[] | null = null;
		const val = this._state.searchString;
		const wordSeparators = this._configurationService.inspect<string>('editor.wordSeparators').value;

		const options: INotebookSearchOptions = {
			regex: this._state.isRegex,
			wholeWord: this._state.wholeWord,
			caseSensitive: this._state.matchCase,
			wordSeparators: wordSeparators,
			includeMarkupInput: this._state.filters?.markupInput ?? true,
			includeCodeInput: this._state.filters?.codeInput ?? true,
			includeMarkupPreview: !!this._state.filters?.markupPreview,
			includeOutput: !!this._state.filters?.codeOutput
		};
		if (!val) {
			ret = null;
		} else if (!this._notebookEditor.hasModel()) {
			ret = null;
		} else {
			ret = await this._notebookEditor.find(val, options, token);
		}

		if (token.isCancellationRequested) {
			return null;
		}

		return ret;
	}

	private _updateCurrentMatch(findMatches: CellFindMatchWithIndex[], currentMatchesPosition: number) {
		this.set(findMatches, false);
		this._currentMatch = currentMatchesPosition % findMatches.length;
		const nextIndex = this._findMatchesStarts!.getIndexOf(this._currentMatch);
		this.highlightCurrentFindMatchDecoration(nextIndex.index, nextIndex.remainder);

		this._state.changeMatchInfo(
			this._currentMatch,
			this._findMatches.reduce((p, c) => p + c.length, 0),
			undefined
		);
	}

	private _matchesCountBeforeIndex(findMatches: CellFindMatchWithIndex[], index: number) {
		let prevMatchesCount = 0;
		for (let i = 0; i < index; i++) {
			prevMatchesCount += findMatches[i].length;
		}

		return prevMatchesCount;
	}

	private constructFindMatchesStarts() {
		if (this._findMatches && this._findMatches.length) {
			const values = new Uint32Array(this._findMatches.length);
			for (let i = 0; i < this._findMatches.length; i++) {
				values[i] = this._findMatches[i].length;
			}

			this._findMatchesStarts = new PrefixSumComputer(values);
		} else {
			this._findMatchesStarts = null;
		}
	}


	private async highlightCurrentFindMatchDecoration(cellIndex: number, matchIndex: number): Promise<number | null> {
		const cell = this._findMatches[cellIndex].cell;
		const match = this._findMatches[cellIndex].getMatch(matchIndex);

		if (matchIndex < this._findMatches[cellIndex].contentMatches.length) {
			return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInCell(cell, (match as FindMatch).range);
		} else {
			return this._findMatchDecorationModel.highlightCurrentFindMatchDecorationInWebview(cell, (match as CellWebviewFindMatch).index);
		}
	}

	clear() {
		this._computePromise?.cancel();
		this._throttledDelayer.cancel();
		this.set([], false);
	}

	override dispose() {
		this._findMatchDecorationModel.dispose();
		super.dispose();
	}
}
