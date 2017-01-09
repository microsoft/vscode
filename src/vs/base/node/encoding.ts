/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import stream = require('vs/base/node/stream');
import iconv = require('iconv-lite');

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

	let b0 = buffer.readUInt8(0);
	let b1 = buffer.readUInt8(1);

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

	let b2 = buffer.readUInt8(2);

	// UTF-8
	if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
		return UTF8;
	}

	return null;
}

/**
 * Detects the Byte Order Mark in a given file.
 * If no BOM is detected, `encoding` will be null.
 */
export function detectEncodingByBOM(file: string, callback: (error: Error, encoding: string) => void): void {
	stream.readExactlyByFile(file, 3, (err: Error, buffer: NodeBuffer, bytesRead: number) => {
		if (err) {
			return callback(err, null);
		}

		return callback(null, detectEncodingByBOMFromBuffer(buffer, bytesRead));
	});
}