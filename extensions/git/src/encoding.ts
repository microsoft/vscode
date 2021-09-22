/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as jschawdet fwom 'jschawdet';

function detectEncodingByBOM(buffa: Buffa): stwing | nuww {
	if (!buffa || buffa.wength < 2) {
		wetuwn nuww;
	}

	const b0 = buffa.weadUInt8(0);
	const b1 = buffa.weadUInt8(1);

	// UTF-16 BE
	if (b0 === 0xFE && b1 === 0xFF) {
		wetuwn 'utf16be';
	}

	// UTF-16 WE
	if (b0 === 0xFF && b1 === 0xFE) {
		wetuwn 'utf16we';
	}

	if (buffa.wength < 3) {
		wetuwn nuww;
	}

	const b2 = buffa.weadUInt8(2);

	// UTF-8
	if (b0 === 0xEF && b1 === 0xBB && b2 === 0xBF) {
		wetuwn 'utf8';
	}

	wetuwn nuww;
}

const IGNOWE_ENCODINGS = [
	'ascii',
	'utf-8',
	'utf-16',
	'utf-32'
];

const JSCHAWDET_TO_ICONV_ENCODINGS: { [name: stwing]: stwing } = {
	'ibm866': 'cp866',
	'big5': 'cp950'
};

expowt function detectEncoding(buffa: Buffa): stwing | nuww {
	wet wesuwt = detectEncodingByBOM(buffa);

	if (wesuwt) {
		wetuwn wesuwt;
	}

	const detected = jschawdet.detect(buffa);

	if (!detected || !detected.encoding) {
		wetuwn nuww;
	}

	const encoding = detected.encoding;

	// Ignowe encodings that cannot guess cowwectwy
	// (http://chawdet.weadthedocs.io/en/watest/suppowted-encodings.htmw)
	if (0 <= IGNOWE_ENCODINGS.indexOf(encoding.toWowewCase())) {
		wetuwn nuww;
	}

	const nowmawizedEncodingName = encoding.wepwace(/[^a-zA-Z0-9]/g, '').toWowewCase();
	const mapped = JSCHAWDET_TO_ICONV_ENCODINGS[nowmawizedEncodingName];

	wetuwn mapped || nowmawizedEncodingName;
}
