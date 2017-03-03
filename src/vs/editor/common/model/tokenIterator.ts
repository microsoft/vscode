/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as editorCommon from 'vs/editor/common/editorCommon';
import { LineToken } from 'vs/editor/common/core/lineTokens';
import { Position } from 'vs/editor/common/core/position';
import { StandardTokenType } from 'vs/editor/common/modes';

class TokenInfo implements editorCommon.ITokenInfo {
	_tokenInfoBrand: void;

	readonly _actual: LineToken;
	public readonly lineNumber: number;
	public readonly startColumn: number;
	public readonly endColumn: number;
	public readonly type: StandardTokenType;

	constructor(actual: LineToken, lineNumber: number) {
		this._actual = actual;
		this.lineNumber = lineNumber;
		this.startColumn = this._actual.startOffset + 1;
		this.endColumn = this._actual.endOffset + 1;
		this.type = this._actual.tokenType;
	}
}

function findClosestNonEmptyLine(model: editorCommon.ITokenizedModel, position: Position): Position {
	const lineNumber = position.lineNumber;
	if (model.getLineMaxColumn(lineNumber) !== 1) {
		return position;
	}

	const lineCount = model.getLineCount();

	// we need to go up or down
	let distance = 1;
	while (true) {
		let aboveLineNumber = lineNumber - distance;
		let belowLineNumber = lineNumber + distance;

		if (aboveLineNumber < 1 && belowLineNumber > lineCount) {
			// No more lines above or below
			break;
		}

		if (aboveLineNumber >= 1) {
			let aboveMaxColumn = model.getLineMaxColumn(aboveLineNumber);
			if (aboveMaxColumn !== 1) {
				// bingo!
				return new Position(aboveLineNumber, aboveMaxColumn);
			}
		}

		if (belowLineNumber <= lineCount) {
			let belowMaxColumn = model.getLineMaxColumn(belowLineNumber);
			if (belowMaxColumn !== 1) {
				// bingo!
				return new Position(belowLineNumber, 1);
			}
		}

		distance++;
	}
	return null;
}

export class TokenIterator implements editorCommon.ITokenIterator {

	private _model: editorCommon.ITokenizedModel;
	private _lineCount: number;
	private _prev: TokenInfo;
	private _next: TokenInfo;

	constructor(model: editorCommon.ITokenizedModel, position: Position) {
		this._model = model;
		this._lineCount = this._model.getLineCount();
		this._prev = null;
		this._next = null;

		position = findClosestNonEmptyLine(model, position);
		if (position) {
			this._model.forceTokenization(position.lineNumber);
			let lineTokens = this._model.getLineTokens(position.lineNumber);
			let currentToken = lineTokens.findTokenAtOffset(position.column - 1);
			if (currentToken) {
				this._prev = this._next = new TokenInfo(currentToken, position.lineNumber);
			}
		}
	}

	private _advanceNext(): void {
		if (!this._next) {
			return;
		}

		let lineNumber = this._next.lineNumber;
		let next = this._next._actual.next();
		while (!next && lineNumber < this._lineCount) {
			lineNumber++;
			this._model.forceTokenization(lineNumber);
			let currentLineTokens = this._model.getLineTokens(lineNumber);
			next = currentLineTokens.firstToken();
		}

		this._prev = this._next;
		if (next) {
			this._next = new TokenInfo(next, lineNumber);
		} else {
			this._next = null;
		}
	}

	private _advancePrev(): void {
		if (!this._prev) {
			return;
		}

		let lineNumber = this._prev.lineNumber;
		let prev = this._prev._actual.prev();
		while (!prev && lineNumber > 1) {
			lineNumber--;
			this._model.forceTokenization(lineNumber);
			let currentLineTokens = this._model.getLineTokens(lineNumber);
			prev = currentLineTokens.lastToken();
		}

		this._next = this._prev;
		if (prev) {
			this._prev = new TokenInfo(prev, lineNumber);
		} else {
			this._prev = null;
		}
	}

	public hasNext(): boolean {
		return this._next !== null;
	}

	public next(): editorCommon.ITokenInfo {
		const result = this._next;
		this._advanceNext();
		return result;
	}

	public hasPrev(): boolean {
		return this._prev !== null;
	}

	public prev(): editorCommon.ITokenInfo {
		const result = this._prev;
		this._advancePrev();
		return result;
	}

	public _invalidate() {
		// replace all public functions with errors
		var errorFn = function (): any {
			throw new Error('iteration isn\'t valid anymore');
		};
		this.hasNext = errorFn;
		this.next = errorFn;
		this.hasPrev = errorFn;
		this.prev = errorFn;
	}
}
