/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as mime from 'vs/base/common/mime';
import { TPromise } from 'vs/base/common/winjs.base';

import * as stream from 'vs/base/node/stream';
import * as encoding from 'vs/base/node/encoding';

const ZERO_BYTE_DETECTION_BUFFER_MAX_LEN = 512; // number of bytes to look at to decide about a file being binary or not
const NO_GUESS_BUFFER_MAX_LEN = 512; 			// when not auto guessing the encoding, small number of bytes are enough
const AUTO_GUESS_BUFFER_MAX_LEN = 512 * 8; 		// with auto guessing we want a lot more content to be read for guessing

export function maxBufferLen(arg1?: DetectMimesOption | boolean): number {
	let autoGuessEncoding: boolean;
	if (typeof arg1 === 'boolean') {
		autoGuessEncoding = arg1;
	} else {
		autoGuessEncoding = arg1 && arg1.autoGuessEncoding;
	}

	return autoGuessEncoding ? AUTO_GUESS_BUFFER_MAX_LEN : NO_GUESS_BUFFER_MAX_LEN;
}

export interface IMimeAndEncoding {
	encoding: string;
	mimes: string[];
}

export interface DetectMimesOption {
	autoGuessEncoding?: boolean;
}

export function detectMimeAndEncodingFromBuffer(readResult: stream.ReadResult, autoGuessEncoding?: false): IMimeAndEncoding;
export function detectMimeAndEncodingFromBuffer(readResult: stream.ReadResult, autoGuessEncoding?: boolean): TPromise<IMimeAndEncoding>;
export function detectMimeAndEncodingFromBuffer({ buffer, bytesRead }: stream.ReadResult, autoGuessEncoding?: boolean): TPromise<IMimeAndEncoding> | IMimeAndEncoding {

	// Always first check for BOM to find out about encoding
	let enc = encoding.detectEncodingByBOMFromBuffer(buffer, bytesRead);

	// Detect 0 bytes to see if file is binary or UTF-16 LE/BE
	// unless we already know that this file has a UTF-16 encoding
	let isText = true;
	if (enc !== encoding.UTF16be && enc !== encoding.UTF16le) {
		let couldBeUTF16LE = true; // e.g. 0xAA 0x00
		let couldBeUTF16BE = true; // e.g. 0x00 0xAA
		let containsZeroByte = false;

		// This is a simplified guess to detect UTF-16 BE or LE by just checking if
		// the first 512 bytes have the 0-byte at a specific location. For UTF-16 LE
		// this would be the odd byte index and for UTF-16 BE the even one.
		// Note: this can produce false positives (a binary file that uses a 2-byte
		// encoding of the same format as UTF-16) and false negatives (a UTF-16 file
		// that is using 4 bytes to encode a character).
		for (let i = 0; i < bytesRead && i < ZERO_BYTE_DETECTION_BUFFER_MAX_LEN; i++) {
			const isEndian = (i % 2 === 1); // assume 2-byte sequences typical for UTF-16
			const isZeroByte = (buffer.readInt8(i) === 0);

			if (isZeroByte) {
				containsZeroByte = true;
			}

			// UTF-16 LE: expect e.g. 0xAA 0x00
			if (couldBeUTF16LE && (isEndian && !isZeroByte || !isEndian && isZeroByte)) {
				couldBeUTF16LE = false;
			}

			// UTF-16 BE: expect e.g. 0x00 0xAA
			if (couldBeUTF16BE && (isEndian && isZeroByte || !isEndian && !isZeroByte)) {
				couldBeUTF16BE = false;
			}

			// Return if this is neither UTF16-LE nor UTF16-BE and thus treat as binary
			if (isZeroByte && !couldBeUTF16LE && !couldBeUTF16BE) {
				break;
			}
		}

		// Handle case of 0-byte included
		if (containsZeroByte) {
			if (couldBeUTF16LE) {
				enc = encoding.UTF16le;
			} else if (couldBeUTF16BE) {
				enc = encoding.UTF16be;
			} else {
				isText = false;
			}
		}
	}

	// Auto guess encoding if configured
	if (autoGuessEncoding && isText && !enc) {
		return encoding.guessEncodingByBuffer(buffer.slice(0, bytesRead)).then(enc => {
			return {
				mimes: isText ? [mime.MIME_TEXT] : [mime.MIME_BINARY],
				encoding: enc
			};
		});
	}

	return {
		mimes: isText ? [mime.MIME_TEXT] : [mime.MIME_BINARY],
		encoding: enc
	};
}