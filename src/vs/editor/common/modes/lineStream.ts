/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

/**
 * A LineStream is a character & token stream abstraction over a line of text. It
 *  is never multi-line. The stream can be navigated character by character, or
 *  token by token, given some token rules.
 * @internal
 */
export class LineStream {

	private _source:string;
	private _sourceLength:number;
	private _pos:number;

	constructor(source:string) {
		this._source = source;
		this._sourceLength = source.length;
		this._pos = 0;
	}

	/**
	 * Returns the current character position of the stream on the line.
	 */
	public pos():number {
		return this._pos;
	}

	/**
	 * Returns true iff the stream is at the end of the line.
	 */
	public eos() {
		return this._pos >= this._sourceLength;
	}

	/**
	 * Returns the next character in the stream.
	 */
	public peek():string {
		// Check EOS
		if (this._pos >= this._sourceLength) {
			throw new Error('Stream is at the end');
		}
		return this._source[this._pos];
	}

	/**
	 * Advances the stream by `n` characters.
	 */
	public advance(n: number): number {
		if (n === 0) {
			return n;
		}
		this._pos += n;
		return n;
	}

	/**
	 * Advances the stream until the end of the line.
	 */
	public advanceToEOS():string {
		const oldPos = this._pos;
		this._pos = this._sourceLength;
		return this._source.substring(oldPos, this._pos);
	}

	/**
	 * Brings the stream back `n` characters.
	 */
	public goBack(n:number) {
		this._pos -= n;
	}
}
