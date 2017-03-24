/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IDisposable } from 'vs/base/common/lifecycle';
import { EventEmitter } from 'vs/base/common/eventEmitter';

export interface SimpleFindStateChangedEvent {
	searchString: boolean;
	isRevealed: boolean;
	matchesPosition: boolean;
	matchesCount: boolean;
}

export interface INewSimpleFindState {
	searchString?: string;
	isRevealed?: boolean;
}

export class SimpleFindState implements IDisposable {
	private static _CHANGED_EVENT = 'changed';
	private _searchString: string;
	private _isRevealed: boolean;
	private _matchesCount: number;
	private _matchesPosition: number;
	private _eventEmitter: EventEmitter;

	public get searchString(): string { return this._searchString; }
	public get isRevealed(): boolean { return this._isRevealed; }
	public get matchesPosition(): number { return this._matchesPosition; }
	public get matchesCount(): number { return this._matchesCount; }

	constructor() {
		this._searchString = '';
		this._isRevealed = false;
		this._matchesPosition = 0;
		this._matchesCount = 0;
		this._eventEmitter = new EventEmitter();
	}

	public dispose(): void {
		this._eventEmitter.dispose();
	}

	public addChangeListener(listener: (e: SimpleFindStateChangedEvent) => void): IDisposable {
		return this._eventEmitter.addListener2(SimpleFindState._CHANGED_EVENT, listener);
	}

	public changeMatchInfo(matchesPosition: number, matchesCount: number): void {
		let changeEvent: SimpleFindStateChangedEvent = {
			searchString: false,
			isRevealed: false,
			matchesPosition: false,
			matchesCount: false,
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

		if (somethingChanged) {
			this._eventEmitter.emit(SimpleFindState._CHANGED_EVENT, changeEvent);
		}
	}

	public change(newState: INewSimpleFindState): void {
		let changeEvent: SimpleFindStateChangedEvent = {
			searchString: false,
			isRevealed: false,
			matchesPosition: false,
			matchesCount: false,
		};
		let somethingChanged = false;

		if (typeof newState.searchString !== 'undefined') {
			if (this._searchString !== newState.searchString) {
				this._searchString = newState.searchString;
				changeEvent.searchString = true;
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
		if (somethingChanged) {
			this._eventEmitter.emit(SimpleFindState._CHANGED_EVENT, changeEvent);
		}
	}
}
