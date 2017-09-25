/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { EventEmitter } from 'vs/base/common/eventEmitter';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Range } from 'vs/editor/common/core/range';

export interface FindReplaceStateChangedEvent {
	moveCursor: boolean;
	updateHistory: boolean;

	searchString: boolean;
	replaceString: boolean;
	isRevealed: boolean;
	isReplaceRevealed: boolean;
	isRegex: boolean;
	wholeWord: boolean;
	matchCase: boolean;
	searchScope: boolean;
	matchesPosition: boolean;
	matchesCount: boolean;
	currentMatch: boolean;
}

export interface INewFindReplaceState {
	searchString?: string;
	replaceString?: string;
	isRevealed?: boolean;
	isReplaceRevealed?: boolean;
	isRegex?: boolean;
	wholeWord?: boolean;
	matchCase?: boolean;
	searchScope?: Range;
}

export class FindReplaceState implements IDisposable {

	private static _CHANGED_EVENT = 'changed';

	private _searchString: string;
	private _replaceString: string;
	private _isRevealed: boolean;
	private _isReplaceRevealed: boolean;
	private _isRegex: boolean;
	private _wholeWord: boolean;
	private _matchCase: boolean;
	private _searchScope: Range;
	private _matchesPosition: number;
	private _matchesCount: number;
	private _currentMatch: Range;
	private _eventEmitter: EventEmitter;

	public get searchString(): string { return this._searchString; }
	public get replaceString(): string { return this._replaceString; }
	public get isRevealed(): boolean { return this._isRevealed; }
	public get isReplaceRevealed(): boolean { return this._isReplaceRevealed; }
	public get isRegex(): boolean { return this._isRegex; }
	public get wholeWord(): boolean { return this._wholeWord; }
	public get matchCase(): boolean { return this._matchCase; }
	public get searchScope(): Range { return this._searchScope; }
	public get matchesPosition(): number { return this._matchesPosition; }
	public get matchesCount(): number { return this._matchesCount; }
	public get currentMatch(): Range { return this._currentMatch; }

	constructor() {
		this._searchString = '';
		this._replaceString = '';
		this._isRevealed = false;
		this._isReplaceRevealed = false;
		this._isRegex = false;
		this._wholeWord = false;
		this._matchCase = false;
		this._searchScope = null;
		this._matchesPosition = 0;
		this._matchesCount = 0;
		this._currentMatch = null;
		this._eventEmitter = new EventEmitter();
	}

	public dispose(): void {
		this._eventEmitter.dispose();
	}

	public addChangeListener(listener: (e: FindReplaceStateChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener(FindReplaceState._CHANGED_EVENT, listener);
	}

	public changeMatchInfo(matchesPosition: number, matchesCount: number, currentMatch: Range): void {
		let changeEvent: FindReplaceStateChangedEvent = {
			moveCursor: false,
			updateHistory: false,
			searchString: false,
			replaceString: false,
			isRevealed: false,
			isReplaceRevealed: false,
			isRegex: false,
			wholeWord: false,
			matchCase: false,
			searchScope: false,
			matchesPosition: false,
			matchesCount: false,
			currentMatch: false
		};
		let somethingChanged = false;

		if (matchesCount === 0) {
			matchesPosition = 0;
		}
		if (matchesPosition > matchesCount) {
			matchesPosition = matchesCount;
		}

		if (this._matchesPosition !== matchesPosition) {
			this._matchesPosition = matchesPosition;
			changeEvent.matchesPosition = true;
			somethingChanged = true;
		}
		if (this._matchesCount !== matchesCount) {
			this._matchesCount = matchesCount;
			changeEvent.matchesCount = true;
			somethingChanged = true;
		}

		if (typeof currentMatch !== 'undefined') {
			if (!Range.equalsRange(this._currentMatch, currentMatch)) {
				this._currentMatch = currentMatch;
				changeEvent.currentMatch = true;
				somethingChanged = true;
			}
		}

		if (somethingChanged) {
			this._eventEmitter.emit(FindReplaceState._CHANGED_EVENT, changeEvent);
		}
	}

	public change(newState: INewFindReplaceState, moveCursor: boolean, updateHistory: boolean = true): void {
		let changeEvent: FindReplaceStateChangedEvent = {
			moveCursor: moveCursor,
			updateHistory: updateHistory,
			searchString: false,
			replaceString: false,
			isRevealed: false,
			isReplaceRevealed: false,
			isRegex: false,
			wholeWord: false,
			matchCase: false,
			searchScope: false,
			matchesPosition: false,
			matchesCount: false,
			currentMatch: false
		};
		let somethingChanged = false;

		if (typeof newState.searchString !== 'undefined') {
			if (this._searchString !== newState.searchString) {
				this._searchString = newState.searchString;
				changeEvent.searchString = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.replaceString !== 'undefined') {
			if (this._replaceString !== newState.replaceString) {
				this._replaceString = newState.replaceString;
				changeEvent.replaceString = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.isRevealed !== 'undefined') {
			if (this._isRevealed !== newState.isRevealed) {
				this._isRevealed = newState.isRevealed;
				changeEvent.isRevealed = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.isReplaceRevealed !== 'undefined') {
			if (this._isReplaceRevealed !== newState.isReplaceRevealed) {
				this._isReplaceRevealed = newState.isReplaceRevealed;
				changeEvent.isReplaceRevealed = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.isRegex !== 'undefined') {
			if (this._isRegex !== newState.isRegex) {
				this._isRegex = newState.isRegex;
				changeEvent.isRegex = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.wholeWord !== 'undefined') {
			if (this._wholeWord !== newState.wholeWord) {
				this._wholeWord = newState.wholeWord;
				changeEvent.wholeWord = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.matchCase !== 'undefined') {
			if (this._matchCase !== newState.matchCase) {
				this._matchCase = newState.matchCase;
				changeEvent.matchCase = true;
				somethingChanged = true;
			}
		}
		if (typeof newState.searchScope !== 'undefined') {
			if (!Range.equalsRange(this._searchScope, newState.searchScope)) {
				this._searchScope = newState.searchScope;
				changeEvent.searchScope = true;
				somethingChanged = true;
			}
		}

		if (somethingChanged) {
			this._eventEmitter.emit(FindReplaceState._CHANGED_EVENT, changeEvent);
		}
	}
}
