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

const JSCHARDET_SUPPORTED_GUESS_ENCODINGS = [
	'Big5',
	'EUC-JP',
	'EUC-KR',
	'EUC-TW',
	'GB2312',
	'HZ-GB-2312',
	'IBM855',
	'IBM866',
	'ISO-2022-CN',
	'ISO-2022-JP',
	'ISO-2022-KR',
	'ISO-8859-2',
	'ISO-8859-5',
	'ISO-8859-7',
	'KOI8-R',
	'SHIFT_JIS',
	'TIS-620',
	'UTF-16BE',
	'UTF-16LE',
	'UTF-32BE',
	'UTF-32LE',
	'UTF-8',
	'X-ISO-10646-UCS-4-2143',
	'X-ISO-10646-UCS-4-3412',
	'windows-1250',
	'windows-1251',
	'windows-1252',
	'windows-1253',
	'windows-1255',
	'x-mac-cyrillic',
];

export function detectEncoding(buffer: Buffer, candidateGuessEncodings: string[]): string | null {
	const result = detectEncodingByBOM(buffer);

	if (result) {
		return result;
	}

	let encodings: string[] | undefined = normalizedEncodings(candidateGuessEncodings);
	if (encodings.length === 0) {
		encodings = undefined;
	}

	const detected = jschardet.detect(buffer, {
		// Lower the threshold to make sure we have a result
		minimumThreshold: 0,
		detectEncodings: encodings,
	});

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

function normalizedEncodings(encodings: string[]): string[] {
	const normalizedEncodings = encodings.map(encoding => encoding.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
	const validEncodings = JSCHARDET_SUPPORTED_GUESS_ENCODINGS.filter(supportEncoding => {
		const normalizedSupportEncoding = supportEncoding.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
		return normalizedEncodings.indexOf(normalizedSupportEncoding) !== -1;
	});

	return validEncodings;
}
