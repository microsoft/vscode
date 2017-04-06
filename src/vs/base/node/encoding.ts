/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import stream = require('vs/base/node/stream');
import iconv = require('iconv-lite');
import { TPromise } from 'vs/base/common/winjs.base';
import jschardet = require('jschardet');

export const UTF8 = 'utf8';
export const UTF8_with_bom = 'utf8bom';
export const UTF16be = 'utf16be';
export const UTF16le = 'utf16le';

export function bomLength(encoding: string): number {
	switch (encoding) {
		case UTF8:
			return 3;
		case UTF16be:
		case UTF16le:
			return 2;
	}

	return 0;
}

export function decode(buffer: NodeBuffer, encoding: string, options?: any): string {
	return iconv.decode(buffer, toNodeEncoding(encoding), options);
}

export function encode(content: string, encoding: string, options?: any): NodeBuffer {
	return iconv.encode(content, toNodeEncoding(encoding), options);
}

export function encodingExists(encoding: string): boolean {
	return iconv.encodingExists(toNodeEncoding(encoding));
}

export function decodeStream(encoding: string): NodeJS.ReadWriteStream {
	return iconv.decodeStream(toNodeEncoding(encoding));
}

export function encodeStream(encoding: string): NodeJS.ReadWriteStream {
	return iconv.encodeStream(toNodeEncoding(encoding));
}

function toNodeEncoding(enc: string): string {
	if (enc === UTF8_with_bom) {
		return UTF8; // iconv does not distinguish UTF 8 with or without BOM, so we need to help it
	}

	return enc;
}

export function detectEncodingByBOMFromBuffer(buffer: NodeBuffer, bytesRead: number): string {
	if (!buffer || bytesRead < 2) {
		return null;
	}

	const b0 = buffer.readUInt8(0);
	const b1 = buffer.readUInt8(1);

	// UTF-16 BE
	if (b0 === 0xFE && b1 === 0xFF) {
		return UTF16be;
	}

	// UTF-16 LE
	if (b0 === 0xFF && b1 === 0xFE) {
		return UTF16le;
	}

	if (bytesRead < 3) {
		return null;
	}

	const b2 = buffer.readUInt8(2);

	// UTF-8
	if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
		return UTF8;
	}

	return null;
}

/**
 * Detects the Byte Order Mark in a given file.
 * If no BOM is detected, null will be passed to callback.
 */
export function detectEncodingByBOM(file: string): TPromise<string> {
	return stream.readExactlyByFile(file, 3).then(({ buffer, bytesRead }) => detectEncodingByBOMFromBuffer(buffer, bytesRead));
}

const MINIMUM_THRESHOLD = 0.2; // TODO@Ben Decide how much this should be.
jschardet.Constants.MINIMUM_THRESHOLD = MINIMUM_THRESHOLD;

const IGNORE_ENCODINGS = ['ascii', 'utf-8', 'utf-16', 'utf-32'];
const MAPPED_ENCODINGS = {
	'ibm866': 'cp866'
};

/**
 * Guesses the encoding from buffer.
 */
export function guessEncodingByBuffer(buffer: NodeBuffer): string {
	const guessed = jschardet.detect(buffer);
	if (!guessed || !guessed.encoding) {
		return null;
	}

	const enc = guessed.encoding.toLowerCase();

	// Ignore encodings that cannot guess correctly
	// (http://chardet.readthedocs.io/en/latest/supported-encodings.html)
	if (0 <= IGNORE_ENCODINGS.indexOf(enc)) {
		return null;
	}

	return toIconvLiteEncoding(guessed.encoding);
}

function toIconvLiteEncoding(encodingName: string): string {
	const normalizedEncodingName = encodingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
	const mapped = MAPPED_ENCODINGS[normalizedEncodingName];

	return mapped || normalizedEncodingName;
}

/**
 * The encodings that are allowed in a settings file don't match the canonical encoding labels specified by WHATWG.
 * See https://encoding.spec.whatwg.org/#names-and-labels
 * Iconv-lite strips all non-alphanumeric characters, but ripgrep doesn't. For backcompat, allow these labels.
 */
export function toCanonicalName(enc: string): string {
	switch (enc) {
		case 'shiftjis':
			return 'shift-jis';
		case 'utf16le':
			return 'utf-16le';
		case 'utf16be':
			return 'utf-16be';
		case 'big5hkcs':
			return 'big5-hkcs';
		case 'eucjp':
			return 'euc-jp';
		case 'euckr':
			return 'euc-kr';
		case 'koi8r':
			return 'koi8-r';
		case 'koi8u':
			return 'koi8-u';
		case 'macroman':
			return 'x-mac-roman';
		case 'utf8bom':
			return 'utf8';
		default:
			const m = enc.match(/windows(\d+)/);
			if (m) {
				return 'windows-' + m[1];
			}

			return enc;
	}
}