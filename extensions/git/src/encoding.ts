/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as jschardet from 'jschardet';

function detectEncodingByBOM(buffer: Buffer): string | null {
	if (!buffer || buffer.length < 2) {
		return null;
	}

	const b0 = buffer.readUInt8(0);
	const b1 = buffer.readUInt8(1);

	// UTF-16 BE
	if (b0 === 0xFE && b1 === 0xFF) {
		return 'utf16be';
	}

	// UTF-16 LE
	if (b0 === 0xFF && b1 === 0xFE) {
		return 'utf16le';
	}

	if (buffer.length < 3) {
		return null;
	}

	const b2 = buffer.readUInt8(2);

	// UTF-8
	if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
		return 'utf8';
	}

	return null;
}

const IGNORE_ENCODINGS = [
	'ascii',
	'utf-8',
	'utf-16',
	'utf-32'
];

const JSCHARDET_TO_ICONV_ENCODINGS: { [name: string]: string } = {
	'ibm866': 'cp866',
	'big5': 'cp950'
};

const MAP_CANDIDATE_GUESS_ENCODING_TO_JSCHARDET: { [key: string]: string } = {
	utf8: 'UTF-8',
	utf16le: 'UTF-16LE',
	utf16be: 'UTF-16BE',
	windows1252: 'windows-1252',
	windows1250: 'windows-1250',
	iso88592: 'ISO-8859-2',
	windows1251: 'windows-1251',
	cp866: 'IBM866',
	iso88595: 'ISO-8859-5',
	koi8r: 'KOI8-R',
	windows1253: 'windows-1253',
	iso88597: 'ISO-8859-7',
	windows1255: 'windows-1255',
	iso88598: 'ISO-8859-8',
	cp950: 'Big5',
	shiftjis: 'SHIFT_JIS',
	eucjp: 'EUC-JP',
	euckr: 'EUC-KR',
	gb2312: 'GB2312'
};

export function detectEncoding(buffer: Buffer, candidateGuessEncodings: string[]): string | null {
	const result = detectEncodingByBOM(buffer);

	if (result) {
		return result;
	}

	candidateGuessEncodings = candidateGuessEncodings.map(e => MAP_CANDIDATE_GUESS_ENCODING_TO_JSCHARDET[e]).filter(e => !!e);

	const detected = jschardet.detect(buffer, candidateGuessEncodings.length > 0 ? { detectEncodings: candidateGuessEncodings } : undefined);
	if (!detected || !detected.encoding) {
		return null;
	}

	const encoding = detected.encoding;

	// Ignore encodings that cannot guess correctly
	// (http://chardet.readthedocs.io/en/latest/supported-encodings.html)
	if (0 <= IGNORE_ENCODINGS.indexOf(encoding.toLowerCase())) {
		return null;
	}

	const normalizedEncodingName = encoding.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
	const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];

	return mapped || normalizedEncodingName;
}
