/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from '../../../base/common/strings.js';
import * as platform from '../../../base/common/platform.js';
import * as buffer from '../../../base/common/buffer.js';

let _utf16LE_TextDecoder: TextDecoder | null;
function getUTF16LE_TextDecoder(): TextDecoder {
	if (!_utf16LE_TextDecoder) {
		_utf16LE_TextDecoder = new TextDecoder('UTF-16LE');
	}
	return _utf16LE_TextDecoder;
}

let _utf16BE_TextDecoder: TextDecoder | null;
function getUTF16BE_TextDecoder(): TextDecoder {
	if (!_utf16BE_TextDecoder) {
		_utf16BE_TextDecoder = new TextDecoder('UTF-16BE');
	}
	return _utf16BE_TextDecoder;
}

let _platformTextDecoder: TextDecoder | null;
export function getPlatformTextDecoder(): TextDecoder {
	if (!_platformTextDecoder) {
		_platformTextDecoder = platform.isLittleEndian() ? getUTF16LE_TextDecoder() : getUTF16BE_TextDecoder();
	}
	return _platformTextDecoder;
}

export function decodeUTF16LE(source: Uint8Array, offset: number, len: number): string {
	const view = new Uint16Array(source.buffer, offset, len);
	if (len > 0 && (view[0] === 0xFEFF || view[0] === 0xFFFE)) {
		// UTF16 sometimes starts with a BOM https://de.wikipedia.org/wiki/Byte_Order_Mark
		// It looks like TextDecoder.decode will eat up a leading BOM (0xFEFF or 0xFFFE)
		// We don't want that behavior because we know the string is UTF16LE and the BOM should be maintained
		// So we use the manual decoder
		return compatDecodeUTF16LE(source, offset, len);
	}
	return getUTF16LE_TextDecoder().decode(view);
}

function compatDecodeUTF16LE(source: Uint8Array, offset: number, len: number): string {
	const result: string[] = [];
	let resultLen = 0;
	for (let i = 0; i < len; i++) {
		const charCode = buffer.readUInt16LE(source, offset); offset += 2;
		result[resultLen++] = String.fromCharCode(charCode);
	}
	return result.join('');
}

export class StringBuilder {

	private readonly _capacity: number;
	private readonly _buffer: Uint16Array;

	private _completedStrings: string[] | null;
	private _bufferLength: number;

	constructor(capacity: number) {
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
		return getPlatformTextDecoder().decode(view);
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

	/**
	 * Append a char code (<2^16)
	 */
	public appendCharCode(charCode: number): void {
		const remainingSpace = this._capacity - this._bufferLength;

		if (remainingSpace <= 1) {
			if (remainingSpace === 0 || strings.isHighSurrogate(charCode)) {
				this._flushBuffer();
			}
		}

		this._buffer[this._bufferLength++] = charCode;
	}

	/**
	 * Append an ASCII char code (<2^8)
	 */
	public appendASCIICharCode(charCode: number): void {
		if (this._bufferLength === this._capacity) {
			// buffer is full
			this._flushBuffer();
		}
		this._buffer[this._bufferLength++] = charCode;
	}

	public appendString(str: string): void {
		const strLen = str.length;

		if (this._bufferLength + strLen >= this._capacity) {
			// This string does not fit in the remaining buffer space

			this._flushBuffer();
			this._completedStrings![this._completedStrings!.length] = str;
			return;
		}

		for (let i = 0; i < strLen; i++) {
			this._buffer[this._bufferLength++] = str.charCodeAt(i);
		}
	}
}
