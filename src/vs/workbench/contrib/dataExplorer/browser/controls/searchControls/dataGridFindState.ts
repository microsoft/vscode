/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { DataGridMatch, DataGridSearchResult, IDataGridFindState } from './dataGridFindTypes.js';

export class DataGridFindState extends Disposable implements IDataGridFindState {

	private _searchString: string = '';
	private _replaceString: string = '';
	private _isRevealed: boolean = false;
	private _isReplaceRevealed: boolean = false;
	private _isRegex: boolean = false;
	private _matchCase: boolean = false;
	private _wholeWord: boolean = false;
	private _currentMatch: DataGridMatch | null = null;
	private _searchResults: DataGridSearchResult | null = null;

	private readonly _onFindReplaceStateChange = this._register(new Emitter<void>());
	public readonly onFindReplaceStateChange: Event<void> = this._onFindReplaceStateChange.event;

	public get searchString(): string {
		return this._searchString;
	}

	public get replaceString(): string {
		return this._replaceString;
	}

	public get isRevealed(): boolean {
		return this._isRevealed;
	}

	public get isReplaceRevealed(): boolean {
		return this._isReplaceRevealed;
	}

	public get isRegex(): boolean {
		return this._isRegex;
	}

	public get matchCase(): boolean {
		return this._matchCase;
	}

	public get wholeWord(): boolean {
		return this._wholeWord;
	}

	public get currentMatch(): DataGridMatch | null {
		return this._currentMatch;
	}

	public get searchResults(): DataGridSearchResult | null {
		return this._searchResults;
	}

	public changeSearchString(searchString: string): void {
		if (this._searchString === searchString) {
			return;
		}
		this._searchString = searchString;
		this._currentMatch = null;
		this._searchResults = null;
		this._onFindReplaceStateChange.fire();
	}

	public changeReplaceString(replaceString: string): void {
		if (this._replaceString === replaceString) {
			return;
		}
		this._replaceString = replaceString;
		this._onFindReplaceStateChange.fire();
	}

	public changeIsRevealed(isRevealed: boolean): void {
		if (this._isRevealed === isRevealed) {
			return;
		}
		this._isRevealed = isRevealed;
		this._onFindReplaceStateChange.fire();
	}

	public changeIsReplaceRevealed(isReplaceRevealed: boolean): void {
		if (this._isReplaceRevealed === isReplaceRevealed) {
			return;
		}
		this._isReplaceRevealed = isReplaceRevealed;
		this._onFindReplaceStateChange.fire();
	}

	public changeIsRegex(isRegex: boolean): void {
		if (this._isRegex === isRegex) {
			return;
		}
		this._isRegex = isRegex;
		this._currentMatch = null;
		this._searchResults = null;
		this._onFindReplaceStateChange.fire();
	}

	public changeMatchCase(matchCase: boolean): void {
		if (this._matchCase === matchCase) {
			return;
		}
		this._matchCase = matchCase;
		this._currentMatch = null;
		this._searchResults = null;
		this._onFindReplaceStateChange.fire();
	}

	public changeWholeWord(wholeWord: boolean): void {
		if (this._wholeWord === wholeWord) {
			return;
		}
		this._wholeWord = wholeWord;
		this._currentMatch = null;
		this._searchResults = null;
		this._onFindReplaceStateChange.fire();
	}

	public changeCurrentMatch(currentMatch: DataGridMatch | null): void {
		this._currentMatch = currentMatch;
		this._onFindReplaceStateChange.fire();
	}

	public changeSearchResults(searchResults: DataGridSearchResult | null): void {
		this._searchResults = searchResults;
		this._onFindReplaceStateChange.fire();
	}

	public changeAll(params: {
		searchString?: string;
		replaceString?: string;
		isRevealed?: boolean;
		isReplaceRevealed?: boolean;
		isRegex?: boolean;
		matchCase?: boolean;
		wholeWord?: boolean;
	}): void {
		let somethingChanged = false;

		if (params.searchString !== undefined && this._searchString !== params.searchString) {
			this._searchString = params.searchString;
			this._currentMatch = null;
			this._searchResults = null;
				somethingChanged = true;
		}

		if (params.replaceString !== undefined && this._replaceString !== params.replaceString) {
			this._replaceString = params.replaceString;
				somethingChanged = true;
		}

		if (params.isRevealed !== undefined && this._isRevealed !== params.isRevealed) {
			this._isRevealed = params.isRevealed;
			somethingChanged = true;
		}

		if (params.isReplaceRevealed !== undefined && this._isReplaceRevealed !== params.isReplaceRevealed) {
			this._isReplaceRevealed = params.isReplaceRevealed;
			somethingChanged = true;
		}

		if (params.isRegex !== undefined && this._isRegex !== params.isRegex) {
			this._isRegex = params.isRegex;
			this._currentMatch = null;
			this._searchResults = null;
			somethingChanged = true;
		}

		if (params.matchCase !== undefined && this._matchCase !== params.matchCase) {
			this._matchCase = params.matchCase;
			this._currentMatch = null;
			this._searchResults = null;
			somethingChanged = true;
		}

		if (params.wholeWord !== undefined && this._wholeWord !== params.wholeWord) {
			this._wholeWord = params.wholeWord;
			this._currentMatch = null;
			this._searchResults = null;
			somethingChanged = true;
		}

		if (somethingChanged) {
			this._onFindReplaceStateChange.fire();
		}
	}
}