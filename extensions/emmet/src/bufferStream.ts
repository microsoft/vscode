/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* Based on @sergeche's work in his emmet plugin */

import { TextDocument } from 'vscode';

/**
 * A stream reader for VSCode's `TextDocument`
 * Based on @emmetio/stream-reader and @emmetio/atom-plugin
 */
export class DocumentStreamReader {
	private document: TextDocument;
	private start: number;
	private _eof: number;
	private _sof: number;
	public pos: number;

	constructor(document: TextDocument, pos?: number, limit?: [number, number]) {
		this.document = document;
		this.start = this.pos = pos ? pos : 0;
		this._sof = limit ? limit[0] : 0;
		this._eof = limit ? limit[1] : document.getText().length;
	}

	/**
	 * Returns true only if the stream is at the start of the file.
	 */
	sof(): boolean {
		return this.pos <= this._sof;
	}

	/**
	 * Returns true only if the stream is at the end of the file.
	 */
	eof(): boolean {
		return this.pos >= this._eof;
	}

	/**
	 * Creates a new stream instance which is limited to given range for given document
	 */
	limit(start: number, end: number): DocumentStreamReader {
		return new DocumentStreamReader(this.document, start, [start, end]);
	}

	/**
	 * Returns the next character code in the stream without advancing it.
	 * Will return NaN at the end of the file.
	 */
	peek(): number {
		if (this.eof()) {
			return NaN;
		}
		return this.document.getText().charCodeAt(this.pos);
	}

	/**
	 * Returns the next character in the stream and advances it.
	 * Also returns NaN when no more characters are available.
	 */
	next(): number {
		if (this.eof()) {
			return NaN;
		}

		const code = this.document.getText().charCodeAt(this.pos);
		this.pos++;

		if (this.eof()) {
			// restrict pos to eof, if in case it got moved beyond eof
			this.pos = this._eof;
		}

		return code;
	}

	/**
	 * Backs up the stream n characters. Backing it up further than the
	 * start of the current token will cause things to break, so be careful.
	 */
	backUp(n: number): number {
		this.pos -= n;
		if (this.pos < 0) {
			this.pos = 0;
		}
		return this.peek();
	}

	/**
	 * Get the string between the start of the current token and the
	 * current stream position.
	 */
	current(): string {
		return this.substring(this.start, this.pos);
	}

	/**
	 * Returns contents for given range
	 */
	substring(from: number, to: number): string {
		return this.document.getText().substring(from, to);
	}

	/**
	 * Creates error object with current stream state
	 */
	error(message: string): Error {
		const err = new Error(`${message} at offset ${this.pos}`);
		return err;
	}

	/**
	 * `match` can be a character code or a function that takes a character code
	 * and returns a boolean. If the next character in the stream 'matches'
	 * the given argument, it is consumed and returned.
	 * Otherwise, `false` is returned.
	 */
	eat(match: number | Function): boolean {
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
	 */
	eatWhile(match: number | Function): boolean {
		const start = this.pos;
		while (!this.eof() && this.eat(match)) { }
		return this.pos !== start;
	}
}
