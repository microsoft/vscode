/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IDataGridFindTarget, IDataGridFindController } from './dataGridFindTypes.js';
import { DataGridFindState } from './dataGridFindState.js';
import { DataGridFindModel } from './dataGridFindModel.js';
import { IDataExplorerService } from '../../../../../services/dataExplorer/browser/interfaces/IDataExplorerService.js';

export class DataGridFindController extends Disposable implements IDataGridFindController {

	private _target: IDataGridFindTarget;
	private _state: DataGridFindState;
	private _model: DataGridFindModel;
	private _dataExplorerService: IDataExplorerService | undefined;
	private _searchTimeoutId: number | null = null;
	private _isPerformingSearch: boolean = false;
	private _isNavigating: boolean = false;

	constructor(target: IDataGridFindTarget, dataExplorerService?: IDataExplorerService) {
		super();
		this._target = target;
		this._dataExplorerService = dataExplorerService;
		this._state = this._register(new DataGridFindState());
		this._model = this._register(new DataGridFindModel(target));

		this._register(this._state.onFindReplaceStateChange(() => this._onStateChanged()));
	}

	public override dispose(): void {
		this._cancelScheduledSearch();
		super.dispose();
	}

	public getState(): DataGridFindState {
		return this._state;
	}



	public start(searchString?: string): void {

		if (searchString) {
			this._state.changeSearchString(searchString);
		}
		this._state.changeIsRevealed(true);
		
		// If we have a search string, trigger search manually
		if (this._state.searchString) {
			this._scheduleSearch();
		}
	}

	public close(): void {
		this._state.changeIsRevealed(false);
		this._target.clearHighlights();
	}

	public replace(): void {
		const currentMatch = this._state.currentMatch;
		const searchResults = this._state.searchResults;
		if (!currentMatch || !searchResults) {
			return;
		}

		const replacedRow = currentMatch.row;
		const replacedCol = currentMatch.column;

		const success = this._model.replace(currentMatch, this._state.replaceString);
		if (!success) {
			return;
		}
		
		this._performSearchAndNavigateToNext(replacedRow, replacedCol);
	}

	public replaceAll(): void {
		const params = {
			searchString: this._state.searchString,
			replaceString: this._state.replaceString,
			isRegex: this._state.isRegex,
			matchCase: this._state.matchCase,
			wholeWord: this._state.wholeWord
		};

		// Use the batch history operation if service is available
		if (this._dataExplorerService) {
			const replacements = this._model.collectReplacements(params);
			if (replacements.length === 0) {
				return;
			}

			const replaceCount = this._dataExplorerService.replaceAllWithHistory(replacements);
			if (replaceCount > 0) {
				this._performSearch();
			}
		} else {
			// Fallback to individual replacements (for cases where service isn't available)
			const replaceCount = this._model.replaceAll(params);
			if (replaceCount === 0) {
				return;
			}

			this._performSearch();
		}
	}

	public findNext(): void {
		const searchResults = this._state.searchResults;
		if (!searchResults || searchResults.matches.length === 0) {
			return;
		}

		const currentIndex = searchResults.currentMatchIndex;
		const nextIndex = currentIndex < searchResults.matches.length - 1 ? currentIndex + 1 : 0;
		
		this._selectMatch(nextIndex);
	}

	public findPrevious(): void {
		const searchResults = this._state.searchResults;
		if (!searchResults || searchResults.matches.length === 0) {
				return;
			}

		const currentIndex = searchResults.currentMatchIndex;
		const prevIndex = currentIndex > 0 ? currentIndex - 1 : searchResults.matches.length - 1;
		
		this._selectMatch(prevIndex);
	}

	private _onStateChanged(): void {
		if (this._isPerformingSearch || this._isNavigating) {
			return;
		}
		
		if (!this._state.isRevealed) {
			this._cancelScheduledSearch();
			this._target.clearHighlights();
		} else if (this._state.searchString) {
			this._scheduleSearch();
		}
	}

	private _scheduleSearch(): void {
		this._cancelScheduledSearch();

		this._searchTimeoutId = window.setTimeout(() => {
			this._performSearch();
		}, 300);
	}

	private _cancelScheduledSearch(): void {
		if (this._searchTimeoutId !== null) {

			window.clearTimeout(this._searchTimeoutId);
			this._searchTimeoutId = null;
		}
	}

	private _performSearch(): void {
		this._isPerformingSearch = true;
		
		const params = {
			searchString: this._state.searchString,
			isRegex: this._state.isRegex,
			matchCase: this._state.matchCase,
			wholeWord: this._state.wholeWord
		};

		const searchResults = this._model.find(params);
		
		// Only update state if search results actually changed
		const currentResults = this._state.searchResults;
		const hasChanged = !currentResults || 
			currentResults.totalMatches !== searchResults.totalMatches ||
			currentResults.currentMatchIndex !== searchResults.currentMatchIndex;
		
		if (hasChanged) {
			this._state.changeSearchResults(searchResults);
		}

		if (searchResults.matches.length > 0) {
			this._target.highlightMatches(searchResults.matches);
			this._selectMatch(0);
		} else {
			this._target.clearHighlights();
			if (this._state.currentMatch !== null) {
				this._state.changeCurrentMatch(null);
			}
		}

		this._isPerformingSearch = false;
	}

	private _performSearchAndNavigateToNext(afterRow: number, afterCol: number): void {
		this._isPerformingSearch = true;
		
		const params = {
			searchString: this._state.searchString,
			isRegex: this._state.isRegex,
			matchCase: this._state.matchCase,
			wholeWord: this._state.wholeWord
		};

		const searchResults = this._model.find(params);
		
		this._state.changeSearchResults(searchResults);

		if (searchResults.matches.length > 0) {
			this._target.highlightMatches(searchResults.matches);
			
			let nextIndex = -1;
			for (let i = 0; i < searchResults.matches.length; i++) {
				const match = searchResults.matches[i];
				if (match.row > afterRow || (match.row === afterRow && match.column > afterCol)) {
					nextIndex = i;
					break;
				}
			}
			
			if (nextIndex === -1) {
				nextIndex = 0;
			}
			
			this._selectMatch(nextIndex);
		} else {
			this._target.clearHighlights();
			if (this._state.currentMatch !== null) {
				this._state.changeCurrentMatch(null);
			}
		}
		
		this._isPerformingSearch = false;
	}

	private _selectMatch(index: number): void {
		const searchResults = this._state.searchResults;
		if (!searchResults || index < 0 || index >= searchResults.matches.length) {
			return;
		}

		// Set navigation flag to prevent triggering search
		this._isNavigating = true;

		const match = searchResults.matches[index];
		this._state.changeCurrentMatch(match);
		this._state.changeSearchResults({
			...searchResults,
			currentMatchIndex: index
		});

		this._target.scrollToCell(match.row, match.column);
		this._target.selectCell(match.row, match.column);

		// Clear navigation flag
		this._isNavigating = false;
	}
}