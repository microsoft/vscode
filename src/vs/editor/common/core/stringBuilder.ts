/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';

declare var TextDecoder: any; // TODO@TypeScript
interface TextDecoder {
	decode(view: Uint16Array): string;
}

export interface IStringBuilder {
	build(): string;
	reset(): void;
	write1(charCode: number): void;
	appendASCII(charCode: number): void;
	appendASCIIString(str: string): void;
}

export let createStringBuilder: (capacity: number) => IStringBuilder;

if ((<any>self).TextDecoder) {
	createStringBuilder = (capacity) => new StringBuilder(capacity);
} else {
	createStringBuilder = (capacity) => new CompatStringBuilder();
}

class StringBuilder implements IStringBuilder {

	private readonly _decoder: TextDecoder;
	private readonly _capacity: number;
	private readonly _buffer: Uint16Array;

	private _completedStrings: string[];
	private _bufferLength: number;

	constructor(capacity: number) {
		this._decoder = new TextDecoder('UTF-16LE');
		this._capacity = capacity | 0;
		this._buffer = new Uint16Array(this._capacity);

		this._completedStrings = null;
		this._bufferLength = 0;
	}

	public reset(): void {
		this._completedStrings = null;
		this._bufferLength = 0;
	}

	public build(): string {
		if (this._completedStrings !== null) {
			this._flushBuffer();
			return this._completedStrings.join('');
		}
		return this._buildBuffer();
	}

	private _buildBuffer(): string {
		if (this._bufferLength === 0) {
			return '';
		}

		const view = new Uint16Array(this._buffer.buffer, 0, this._bufferLength);
		return this._decoder.decode(view);
	}

	private _flushBuffer(): void {
		const bufferString = this._buildBuffer();
		this._bufferLength = 0;

		if (this._completedStrings === null) {
			this._completedStrings = [bufferString];
		} else {
			this._completedStrings[this._completedStrings.length] = bufferString;
		}
	}

	public write1(charCode: number): void {
		const remainingSpace = this._capacity - this._bufferLength;

		if (remainingSpace <= 1) {
			if (remainingSpace === 0 || strings.isHighSurrogate(charCode)) {
				this._flushBuffer();
			}
		}

		this._buffer[this._bufferLength++] = charCode;
	}

	public appendASCII(charCode: number): void {
		if (this._bufferLength === this._capacity) {
			// buffer is full
			this._flushBuffer();
		}
		this._buffer[this._bufferLength++] = charCode;
	}

	public appendASCIIString(str: string): void {
		const strLen = str.length;

		if (this._bufferLength + strLen >= this._capacity) {
			// This string does not fit in the remaining buffer space

			this._flushBuffer();
			this._completedStrings[this._completedStrings.length] = str;
			return;
		}

		for (let i = 0; i < strLen; i++) {
			this._buffer[this._bufferLength++] = str.charCodeAt(i);
		}
	}
}

class CompatStringBuilder implements IStringBuilder {

	private _pieces: string[];
	private _piecesLen: number;

	constructor() {
		this._pieces = [];
		this._piecesLen = 0;
	}

	public reset(): void {
		this._pieces = [];
		this._piecesLen = 0;
	}

	public build(): string {
		return this._pieces.join('');
	}

	public write1(charCode: number): void {
		this._pieces[this._piecesLen++] = String.fromCharCode(charCode);
	}

	public appendASCII(charCode: number): void {
		this._pieces[this._piecesLen++] = String.fromCharCode(charCode);
	}

	public appendASCIIString(str: string): void {
		this._pieces[this._piecesLen++] = str;
	}
}
