/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Based on @sergeche's work in his emmet plugin */

'use strict';

import { TextDocument, Position, Range, EndOfLine } from 'vscode';

/**
 * A stream reader for VSCode's `TextDocument`
 * Based on @emmetio/stream-reader and @emmetio/atom-plugin
 */
export class DocumentStreamReader {
	private document: TextDocument;
	private start: Position;
	private _eof: Position;
	public pos: Position;
	private _eol: string;

	/**
	 * @param  {TextDocument} buffer
	 * @param  {Position}      pos
	 * @param  {Range}        limit
	 */
	constructor(document: TextDocument, pos?: Position, limit?: Range) {

		this.document = document;
		this.start = this.pos = pos ? pos : new Position(0, 0);
		this._eof = limit ? limit.end : new Position(this.document.lineCount - 1, this._lineLength(this.document.lineCount - 1));
		this._eol = this.document.eol === EndOfLine.LF ? '\n' : '\r\n';
	}

	/**
	 * Returns true only if the stream is at the end of the file.
	 * @returns {Boolean}
	 */
	eof() {
		return this.pos.isAfterOrEqual(this._eof);
	}

	/**
	 * Creates a new stream instance which is limited to given range for given document
	 * @param  {Position} start
	 * @param  {Position} end
	 * @return {DocumentStreamReader}
	 */
	limit(start, end) {
		return new DocumentStreamReader(this.document, start, new Range(start, end));
	}

	/**
	 * Returns the next character code in the stream without advancing it.
	 * Will return NaN at the end of the file.
	 * @returns {Number}
	 */
	peek() {
		if (this.eof()) {
			return NaN;
		}
		const line = this.document.lineAt(this.pos.line).text;
		return this.pos.character < line.length ? line.charCodeAt(this.pos.character) : this._eol.charCodeAt(this.pos.character - line.length);
	}

	/**
	 * Returns the next character in the stream and advances it.
	 * Also returns NaN when no more characters are available.
	 * @returns {Number}
	 */
	next() {
		if (this.eof()) {
			return NaN;
		}

		const line = this.document.lineAt(this.pos.line).text;
		let code: number;
		if (this.pos.character < line.length) {
			code = line.charCodeAt(this.pos.character);
			this.pos = this.pos.translate(0, 1);
		} else {
			code = this._eol.charCodeAt(this.pos.character - line.length);
			this.pos = new Position(this.pos.line + 1, 0);
		}

		if (this.eof()) {
			// restrict pos to eof, if in case it got moved beyond eof
			this.pos = new Position(this._eof.line, this._eof.character);
		}

		return code;
	}

	/**
	 * Backs up the stream n characters. Backing it up further than the
	 * start of the current token will cause things to break, so be careful.
	 * @param {Number} n
	 */
	backUp(n) {
		let row = this.pos.line;
		let column = this.pos.character;
		column -= (n || 1);

		while (row >= 0 && column < 0) {
			row--;
			column += this._lineLength(row);
		}

		this.pos = row < 0 || column < 0
			? new Position(0, 0)
			: new Position(row, column);

		return this.peek();
	}

	/**
	 * Get the string between the start of the current token and the
	 * current stream position.
	 * @returns {String}
	 */
	current() {
		return this.substring(this.start, this.pos);
	}

	/**
	 * Returns contents for given range
	 * @param  {Position} from
	 * @param  {Position} to
	 * @return {String}
	 */
	substring(from, to) {
		return this.document.getText(new Range(from, to));
	}

	/**
	 * Creates error object with current stream state
	 * @param {String} message
	 * @return {Error}
	 */
	error(message) {
		const err = new Error(`${message} at row ${this.pos.line}, column ${this.pos.character}`);

		return err;
	}

	/**
	 * Returns line length of given row, including line ending
	 * @param  {Number} row
	 * @return {Number}
	 */
	_lineLength(row) {
		if (row === this.document.lineCount - 1) {
			return this.document.lineAt(row).text.length;
		}
		return this.document.lineAt(row).text.length + this._eol.length;
	}

	/**
	 * `match` can be a character code or a function that takes a character code
	 * and returns a boolean. If the next character in the stream 'matches'
	 * the given argument, it is consumed and returned.
	 * Otherwise, `false` is returned.
	 * @param {Number|Function} match
	 * @returns {Boolean}
	 */
	eat(match) {
		const ch = this.peek();
		const ok = typeof match === 'function' ? match(ch) : ch === match;

		if (ok) {
			this.next();
		}

		return ok;
	}

	/**
	 * Repeatedly calls <code>eat</code> with the given argument, until it
	 * fails. Returns <code>true</code> if any characters were eaten.
	 * @param {Object} match
	 * @returns {Boolean}
	 */
	eatWhile(match) {
		const start = this.pos;
		while (!this.eof() && this.eat(match)) { }
		return !this.pos.isEqual(start);
	}
}
