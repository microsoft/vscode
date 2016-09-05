/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import {Token} from 'vs/editor/common/core/token';

export class TokenIterator implements editorCommon.ITokenIterator {

	private _model:editorCommon.ITokenizedModel;
	private _currentLineNumber:number;
	private _currentTokenIndex:number;
	private _currentLineTokens:editorCommon.ILineTokens;
	private _next:editorCommon.ITokenInfo;
	private _prev:editorCommon.ITokenInfo;

	constructor(model:editorCommon.ITokenizedModel, position:editorCommon.IPosition) {
		this._model = model;
		this._currentLineNumber = position.lineNumber;
		this._currentTokenIndex = 0;
		this._readLineTokens(this._currentLineNumber);
		this._next = null;
		this._prev = null;

		// start with a position to next/prev run
		var columnIndex = position.column - 1, tokenEndIndex = Number.MAX_VALUE;

		for (var i = this._currentLineTokens.getTokenCount() - 1; i >= 0; i--) {
			let tokenStartIndex = this._currentLineTokens.getTokenStartIndex(i);

			if (tokenStartIndex <= columnIndex && columnIndex <= tokenEndIndex) {

				this._currentTokenIndex = i;
				this._next = this._current();
				this._prev = this._current();
				break;
			}
			tokenEndIndex = tokenStartIndex;
		}
	}

	private _readLineTokens(lineNumber:number): void {
		this._currentLineTokens = this._model.getLineTokens(lineNumber, false);
	}

	private _advanceNext() {
		this._prev = this._next;
		this._next = null;
		if (this._currentTokenIndex + 1 < this._currentLineTokens.getTokenCount()) {
			// There are still tokens on current line
			this._currentTokenIndex++;
			this._next = this._current();

		} else {
			// find the next line with tokens
			while (this._currentLineNumber + 1 <= this._model.getLineCount()) {
				this._currentLineNumber++;
				this._readLineTokens(this._currentLineNumber);
				if (this._currentLineTokens.getTokenCount() > 0) {
					this._currentTokenIndex = 0;
					this._next = this._current();
					break;
				}
			}
			if (this._next === null) {
				// prepare of a previous run
				this._readLineTokens(this._currentLineNumber);
				this._currentTokenIndex = this._currentLineTokens.getTokenCount();
				this._advancePrev();
				this._next = null;
			}
		}
	}

	private _advancePrev() {
		this._next = this._prev;
		this._prev = null;
		if (this._currentTokenIndex > 0) {
			// There are still tokens on current line
			this._currentTokenIndex--;
			this._prev = this._current();

		} else {
			// find previous line with tokens
			while (this._currentLineNumber > 1) {
				this._currentLineNumber--;
				this._readLineTokens(this._currentLineNumber);
				if (this._currentLineTokens.getTokenCount() > 0) {
					this._currentTokenIndex = this._currentLineTokens.getTokenCount() - 1;
					this._prev = this._current();
					break;
				}
			}
		}
	}

	private _current(): editorCommon.ITokenInfo {
		let startIndex = this._currentLineTokens.getTokenStartIndex(this._currentTokenIndex);
		let type = this._currentLineTokens.getTokenType(this._currentTokenIndex);
		let endIndex = this._currentLineTokens.getTokenEndIndex(this._currentTokenIndex, this._model.getLineContent(this._currentLineNumber).length);

		return {
			token: new Token(startIndex, type),
			lineNumber: this._currentLineNumber,
			startColumn: startIndex + 1,
			endColumn: endIndex + 1
		};
	}

	public hasNext(): boolean {
		return this._next !== null;
	}

	public next(): editorCommon.ITokenInfo {
		var result = this._next;
		this._advanceNext();
		return result;
	}

	public hasPrev(): boolean {
		return this._prev !== null;
	}

	public prev(): editorCommon.ITokenInfo {
		var result = this._prev;
		this._advancePrev();
		return result;
	}

	public _invalidate() {
		// replace all public functions with errors
		var errorFn = function(): any {
			throw new Error('iteration isn\'t valid anymore');
		};
		this.hasNext = errorFn;
		this.next = errorFn;
		this.hasPrev = errorFn;
		this.prev = errorFn;
	}
}
