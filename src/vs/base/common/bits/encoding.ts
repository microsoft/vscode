/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/* For reference:

	http://en.wikipedia.org/wiki/UTF-8
	http://en.wikipedia.org/wiki/UTF-16
*/

'use strict';

import bits = require('./bits');

export var UTF8 = 'utf8';

function byteSizeInUTF8(codePoint: number): number {
	codePoint = codePoint >>> 0;

	if (codePoint < 0x80) {
		return 1;
	} else if (codePoint < 0x800) {
		return 2;
	} else if (codePoint < 0x10000) {
		return 3;
	} else if (codePoint < 0x200000) {
		return 4;
	} else if (codePoint < 0x4000000) {
		return 5;
	} else if (codePoint < 0x80000000) {
		return 6;
	} else {
		throw new Error('Code point 0x' + bits.toHexString(codePoint) + ' not encodable in UTF8.');
	}
}

function writeUTF8(codePoint: number, buffer: Uint8Array, pos: number): number {
	// How many bits needed for codePoint
	var byteSize = byteSizeInUTF8(codePoint);

	// 0xxxxxxx
	if (byteSize === 1) {
		buffer[pos] = codePoint;
		return 1;
	}

	// 110xxxxx 10xxxxxx
	// 1110xxxx 10xxxxxx 10xxxxxx
	// 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
	// 111110xx 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx
	// 1111110x 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx 10xxxxxx

	// first byte
	buffer[pos] = ((0xfc << (6 - byteSize)) | (codePoint >>> (6 * (byteSize - 1)))) & 0xff;

	// successive bytes
	for (var i = 1; i < byteSize; i++) {
		buffer[pos + i] = (0x80 | (0x3f & (codePoint >>> (6 * (byteSize - i - 1))))) & 0xff;
	}

	return byteSize;
}

export function encodeToUTF8(str: string, withBom?: boolean): ArrayBuffer {
	var i: number, len: number, length = 0, charCode = 0, trailCharCode = 0, codepoint = 0;

	// First pass, for the size
	for (i = 0, len = str.length; i < len; i++) {
		charCode = str.charCodeAt(i);

		// Surrogate pair
		if (charCode >= 0xd800 && charCode < 0xdc00) {
			trailCharCode = str.charCodeAt(++i);

			if (!(trailCharCode >= 0xdc00 && trailCharCode < 0xe000)) {
				throw new Error('Invalid char code');
			}

			// Code point can be obtained by subtracting 0xd800 and 0xdc00 from both char codes respectively
			// and joining the 10 least significant bits from each, finally adding 0x10000.
			codepoint = ((((charCode - 0xd800) & 0x3ff) << 10) | ((trailCharCode - 0xdc00) & 0x3ff)) + 0x10000;

		} else {
			codepoint = charCode;
		}

		length += byteSizeInUTF8(codepoint);
	}

	if (withBom) {
		length+= 3;
	}

	var result = new ArrayBuffer(length);
	var view = new Uint8Array(result);
	var pos = 0;

	if (withBom) {
		view[0] = 0xEF;
		view[1] = 0xBB;
		view[2] = 0xBF;
		pos += 3;
	}

	// Second pass, for the data
	for (i = 0, len = str.length; i < len; i++) {
		charCode = str.charCodeAt(i);

		if (charCode >= 0xd800 && charCode < 0xdc00) {
			trailCharCode = str.charCodeAt(++i);
			codepoint = ((((charCode - 0xd800) & 0x3ff) << 10) | ((trailCharCode - 0xdc00) & 0x3ff)) + 0x10000;
		} else {
			codepoint = charCode;
		}

		pos += writeUTF8(codepoint, view, pos);
	}

	return result;
}

export function encodeToUTF16(str: string, bufferView: DataView, offset: number, count: number): number {
	var bytesToWrite = str.length * 2;
	if (bytesToWrite > count) {
		throw Error('Unable to encode string to UTF16. Need ' + bytesToWrite + ' bytes, but only have ' + count + ' bytes.');
	}

	for (var i = 0; i < str.length; i++) {
		bufferView.setUint16(offset + i * 2, str.charCodeAt(i), false);
	}

	return bytesToWrite;
}

export var SUPPORTED_ENCODINGS:{[encoding:string]:{ labelLong:string; labelShort:string; order:number; }} = {
	utf8: {
		labelLong: 'UTF-8',
		labelShort: 'UTF-8',
		order: 1
	},
	utf16le: {
		labelLong: 'UTF-16 LE',
		labelShort: 'UTF-16 LE',
		order: 2
	},
	utf16be: {
		labelLong: 'UTF-16 BE',
		labelShort: 'UTF-16 BE',
		order: 3
	},
	windows1252: {
		labelLong: 'Western (Windows 1252)',
		labelShort: 'Windows 1252',
		order: 4
	},
	iso88591: {
		labelLong: 'Western (ISO 8859-1)',
		labelShort: 'ISO 8859-1',
		order: 5
	},
	iso88593: {
		labelLong: 'Western (ISO 8859-3)',
		labelShort: 'ISO 8859-3',
		order: 6
	},
	iso885915: {
		labelLong: 'Western (ISO 8859-15)',
		labelShort: 'ISO 8859-15',
		order: 7
	},
	macroman: {
		labelLong: 'Western (Mac Roman)',
		labelShort: 'Mac Roman',
		order: 8
	},
	cp437: {
		labelLong: 'DOS (CP 437)',
		labelShort: 'CP437',
		order: 9
	},
	windows1256: {
		labelLong: 'Arabic (Windows 1256)',
		labelShort: 'Windows 1256',
		order: 10
	},
	iso88596: {
		labelLong: 'Arabic (ISO 8859-6)',
		labelShort: 'ISO 8859-6',
		order: 11
	},
	windows1257: {
		labelLong: 'Baltic (Windows 1257)',
		labelShort: 'Windows 1257',
		order: 12
	},
	iso88594: {
		labelLong: 'Baltic (ISO 8859-4)',
		labelShort: 'ISO 8859-4',
		order: 13
	},
	iso885914: {
		labelLong: 'Celtic (ISO 8859-14)',
		labelShort: 'ISO 8859-14',
		order: 14
	},
	windows1250: {
		labelLong: 'Central European (Windows 1250)',
		labelShort: 'Windows 1250',
		order: 15
	},
	iso88592: {
		labelLong: 'Central European (ISO 8859-2)',
		labelShort: 'ISO 8859-2',
		order: 16
	},
	windows1251: {
		labelLong: 'Cyrillic (Windows 1251)',
		labelShort: 'Windows 1251',
		order: 17
	},
	cp866: {
		labelLong: 'Cyrillic (CP 866)',
		labelShort: 'CP 866',
		order: 18
	},
	iso88595: {
		labelLong: 'Cyrillic (ISO 8859-5)',
		labelShort: 'ISO 8859-5',
		order: 19
	},
	koi8r: {
		labelLong: 'Cyrillic (KOI8-R)',
		labelShort: 'KOI8-R',
		order: 20
	},
	koi8u: {
		labelLong: 'Cyrillic (KOI8-U)',
		labelShort: 'KOI8-U',
		order: 21
	},
	iso885913: {
		labelLong: 'Estonian (ISO 8859-13)',
		labelShort: 'ISO 8859-13',
		order: 22
	},
	windows1253: {
		labelLong: 'Greek (Windows 1253)',
		labelShort: 'Windows 1253',
		order: 23
	},
	iso88597: {
		labelLong: 'Greek (ISO 8859-7)',
		labelShort: 'ISO 8859-7',
		order: 24
	},
	windows1255: {
		labelLong: 'Hebrew (Windows 1255)',
		labelShort: 'Windows 1255',
		order: 25
	},
	iso88598: {
		labelLong: 'Hebrew (ISO 8859-8)',
		labelShort: 'ISO 8859-8',
		order: 26
	},
	iso885910: {
		labelLong: 'Nordic (ISO 8859-10)',
		labelShort: 'ISO 8859-10',
		order: 27
	},
	iso885916: {
		labelLong: 'Romanian (ISO 8859-16)',
		labelShort: 'ISO 8859-16',
		order: 28
	},
	windows1254: {
		labelLong: 'Turkish (Windows 1254)',
		labelShort: 'Windows 1254',
		order: 29
	},
	iso88599: {
		labelLong: 'Turkish (ISO 8859-9)',
		labelShort: 'ISO 8859-9',
		order: 30
	},
	windows1258: {
		labelLong: 'Vietnamese (Windows 1258)',
		labelShort: 'Windows 1258',
		order: 31
	},
	gbk: {
		labelLong: 'Chinese (GBK)',
		labelShort: 'GBK',
		order: 32
	},
	gb18030: {
		labelLong: 'Chinese (GB18030)',
		labelShort: 'GB18030',
		order: 33
	},
	cp950: {
		labelLong: 'Traditional Chinese (Big5)',
		labelShort: 'Big5',
		order: 34
	},
	big5hkscs: {
		labelLong: 'Traditional Chinese (Big5-HKSCS)',
		labelShort: 'Big5-HKSCS',
		order: 35
	},
	shiftjis: {
		labelLong: 'Japanese (Shift JIS)',
		labelShort: 'Shift JIS',
		order: 36
	},
	eucjp: {
		labelLong: 'Japanese (EUC-JP)',
		labelShort: 'EUC-JP',
		order: 37
	},
	euckr: {
		labelLong: 'Korean (EUC-KR)',
		labelShort: 'EUC-KR',
		order: 38
	},
	windows874: {
		labelLong: 'Thai (Windows 874)',
		labelShort: 'Windows 874',
		order: 39
	}
	,iso885911: {
		labelLong: 'Latin/Thai (ISO 8859-11)',
		labelShort: 'ISO 8859-11',
		order: 40
	},
	'koi8-ru': {
		labelLong: 'Cyrillic (KOI8-RU)',
		labelShort: 'KOI8-RU',
		order: 41
	},
	'koi8-t': {
		labelLong: 'Tajik (KOI8-T)',
		labelShort: 'KOI8-T',
		order: 42
	},
	GB2312: {
		labelLong: 'Simplified Chinese (GB 2312)',
		labelShort: 'GB 2312',
		order: 43
	}
};