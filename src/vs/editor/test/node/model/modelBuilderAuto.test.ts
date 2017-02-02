/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { testModelBuilder, testDifferentHash } from 'vs/editor/test/node/model/modelBuilder.test';
import { CharCode } from 'vs/base/common/charCode';

const GENERATE_TESTS = false;

suite('ModelBuilder Auto Tests', () => {

	test('auto1', () => {
		testModelBuilder(['sarjniow', '\r', '\nbpb', 'ofb', '\njzldgxx', '\r\nkzwfjysng']);
	});

	test('auto2', () => {
		testModelBuilder(['i', 'yyernubi\r\niimgn\n', 'ut\r']);
	});

	test('auto3', () => {
		testDifferentHash([''], ['', '', '']);
	});
});

function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomEOLSequence(): string {
	let rnd = getRandomInt(1, 3);
	if (rnd === 1) {
		return '\n';
	}
	if (rnd === 2) {
		return '\r';
	}
	return '\r\n';
}

function getRandomString(minLength: number, maxLength: number): string {
	let length = getRandomInt(minLength, maxLength);
	let r = '';
	for (let i = 0; i < length; i++) {
		r += String.fromCharCode(getRandomInt(CharCode.a, CharCode.z));
	}
	return r;
}

function generateRandomFile(): string {
	let lineCount = getRandomInt(1, 10);
	let mixedEOLSequence = getRandomInt(1, 2) === 1 ? true : false;
	let fixedEOL = getRandomEOLSequence();
	let lines: string[] = [];
	for (let i = 0; i < lineCount; i++) {
		if (i !== 0) {
			if (mixedEOLSequence) {
				lines.push(getRandomEOLSequence());
			} else {
				lines.push(fixedEOL);
			}
		}
		lines.push(getRandomString(0, 10));

	}
	return lines.join('');
}

function generateRandomChunks(file: string): string[] {
	let result: string[] = [];
	let cnt = getRandomInt(1, 20);

	let maxOffset = file.length;

	while (cnt > 0 && maxOffset > 0) {

		let offset = getRandomInt(0, maxOffset);
		result.unshift(file.substring(offset, maxOffset));
		// let length = getRandomInt(0, maxOffset - offset);
		// let text = generateFile(true);

		// result.push({
		// 	offset: offset,
		// 	length: length,
		// 	text: text
		// });

		maxOffset = offset;
		cnt--;
	}
	if (maxOffset !== 0) {
		result.unshift(file.substring(0, maxOffset));
	}
	return result;
}

let HASH_TO_CONTENT: { [hash: string]: string; } = {};

function testRandomFile(file: string): boolean {
	let tests = getRandomInt(5, 10);
	for (let i = 0; i < tests; i++) {
		let chunks = generateRandomChunks(file);
		try {
			let hash = testModelBuilder(chunks);
			let logicalContent = JSON.stringify(file.split(/\r\n|\r|\n/));
			if (HASH_TO_CONTENT.hasOwnProperty(hash)) {
				let prevLogicalContent = HASH_TO_CONTENT[hash];
				if (prevLogicalContent !== logicalContent) {
					console.log('HASH COLLISION: ');
					console.log(prevLogicalContent);
					console.log(logicalContent);
					return false;
				}
			} else {
				HASH_TO_CONTENT[hash] = logicalContent;
			}
		} catch (err) {
			console.log(err);
			console.log(JSON.stringify(chunks));
			return false;
		}
	}
	return true;
}

if (GENERATE_TESTS) {
	let number = 1;
	while (true) {
		console.log('------BEGIN NEW TEST: ' + number);

		if (!testRandomFile(generateRandomFile())) {
			break;
		}

		console.log('------END NEW TEST: ' + (number++));
	}
}
