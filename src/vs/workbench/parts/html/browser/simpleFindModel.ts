/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import WebView, { FoundInPageResults } from './webview';
import { SimpleFindState, SimpleFindStateChangedEvent } from './simpleFindState';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

export class FindModelBoundToWebview {
	private _webview: WebView;
	private _state: SimpleFindState;
	private _toDispose: IDisposable[];
	private _isDisposed: boolean;

	constructor(webview: WebView, state: SimpleFindState) {
		this._webview = webview;
		this._state = state;
		this._toDispose = [];
		this._isDisposed = false;

		this._toDispose.push(this._state.addChangeListener((e) => this._onStateChanged(e)));
		this._toDispose.push(this._webview.onFindResults((e) => this._onResults(e)));
	}

	public dispose(): void {
		this._isDisposed = true;
		this._toDispose = dispose(this._toDispose);
	}

	private _onStateChanged(e: SimpleFindStateChangedEvent): void {
		if (this._isDisposed) {
			return;
		}
		if (e.searchString) {
			if (this._state.searchString) {
				this.startFind();
			} else {
				this.stopFind(false);
			}
		}

		if (e.isRevealed) {
			if (!this._state.isRevealed) {
				this.stopFind(true);
			}
		}
	}

	private _onResults(e: FoundInPageResults): void {
		if (this._isDisposed) {
			return;
		}
		this._state.changeMatchInfo(e.activeMatchOrdinal, e.matches);
	}

	public startFind(): void {
		if (this._isDisposed) {
			return;
		}
		this._webview.find(this._state.searchString);
	}

	public moveToNextMatch(): void {
		if (this._isDisposed) {
			return;
		}
		this._webview.find(this._state.searchString, { findNext: true, forward: true });
	}

	public moveToPrevMatch(): void {
		if (this._isDisposed) {
			return;
		}
		this._webview.find(this._state.searchString, { findNext: true, forward: false });
	}

	public stopFind(keepSelection?: boolean): void {
		if (this._isDisposed) {
			return;
		}
		this._webview.stopFind(keepSelection);
	}
}