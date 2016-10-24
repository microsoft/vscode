/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ModelBuilder, computeHash } from 'vs/editor/node/model/modelBuilder';
import { ITextModelCreationOptions, IRawText } from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import * as strings from 'vs/base/common/strings';

export function testModelBuilder(chunks: string[], opts: ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS): string {
	let expectedRawText = TextModel.toRawText(chunks.join(''), opts);
	let expectedHash = computeHash(expectedRawText);

	let builder = new ModelBuilder();
	for (let i = 0, len = chunks.length; i < len; i++) {
		builder.acceptChunk(chunks[i]);
	}
	let actual = builder.finish(opts);

	assert.deepEqual({
		rawText: expectedRawText,
		hash: expectedHash
	}, actual);

	return expectedHash;
}

function toRawText(lines: string[]): IRawText {
	return {
		BOM: '',
		lines: lines,
		EOL: '\n',
		length: 0,
		containsRTL: false,
		options: null
	};
}

export function testDifferentHash(lines1: string[], lines2: string[]): void {
	let hash1 = computeHash(toRawText(lines1));
	let hash2 = computeHash(toRawText(lines2));
	assert.notEqual(hash1, hash2);
}

suite('ModelBuilder', () => {

	test('uses sha1', () => {
		// These are the sha1s of the string + \n
		assert.equal(computeHash(toRawText([''])), 'adc83b19e793491b1c6ea0fd8b46cd9f32e592fc');
		assert.equal(computeHash(toRawText(['hello world'])), '22596363b3de40b06f981fb85d82312e8c0ed511');
	});

	test('no chunks', () => {
		testModelBuilder([]);
	});

	test('single empty chunk', () => {
		testModelBuilder(['']);
	});

	test('single line in one chunk', () => {
		testModelBuilder(['Hello world']);
	});

	test('single line in multiple chunks', () => {
		testModelBuilder(['Hello', ' ', 'world']);
	});

	test('two lines in single chunk', () => {
		testModelBuilder(['Hello world\nHow are you?']);
	});

	test('two lines in multiple chunks 1', () => {
		testModelBuilder(['Hello worl', 'd\nHow are you?']);
	});

	test('two lines in multiple chunks 2', () => {
		testModelBuilder(['Hello worl', 'd', '\n', 'H', 'ow are you?']);
	});

	test('two lines in multiple chunks 3', () => {
		testModelBuilder(['Hello worl', 'd', '\nHow are you?']);
	});

	test('multiple lines in single chunks', () => {
		testModelBuilder(['Hello world\nHow are you?\nIs everything good today?\nDo you enjoy the weather?']);
	});

	test('multiple lines in multiple chunks 1', () => {
		testModelBuilder(['Hello world\nHow are you', '?\nIs everything good today?\nDo you enjoy the weather?']);
	});

	test('multiple lines in multiple chunks 1', () => {
		testModelBuilder(['Hello world', '\nHow are you', '?\nIs everything good today?', '\nDo you enjoy the weather?']);
	});

	test('multiple lines in multiple chunks 1', () => {
		testModelBuilder(['Hello world\n', 'How are you', '?\nIs everything good today?', '\nDo you enjoy the weather?']);
	});

	test('carriage return detection (1 \\r\\n 2 \\n)', () => {
		testModelBuilder(['Hello world\r\n', 'How are you', '?\nIs everything good today?', '\nDo you enjoy the weather?']);
	});

	test('carriage return detection (2 \\r\\n 1 \\n)', () => {
		testModelBuilder(['Hello world\r\n', 'How are you', '?\r\nIs everything good today?', '\nDo you enjoy the weather?']);
	});

	test('carriage return detection (3 \\r\\n 0 \\n)', () => {
		testModelBuilder(['Hello world\r\n', 'How are you', '?\r\nIs everything good today?', '\r\nDo you enjoy the weather?']);
	});

	test('carriage return detection (isolated \\r)', () => {
		testModelBuilder(['Hello world', '\r', '\n', 'How are you', '?', '\r', '\n', 'Is everything good today?', '\r', '\n', 'Do you enjoy the weather?']);
	});

	test('BOM handling', () => {
		testModelBuilder([strings.UTF8_BOM_CHARACTER + 'Hello world!']);
	});

	test('BOM handling', () => {
		testModelBuilder([strings.UTF8_BOM_CHARACTER, 'Hello world!']);
	});

	test('RTL handling 1', () => {
		testModelBuilder(['Hello world!', 'זוהי עובדה מבוססת שדעתו']);
	});

	test('RTL handling 2', () => {
		testModelBuilder(['Hello world!זוהי עובדה מבוססת שדעתו']);
	});

	test('RTL handling 3', () => {
		testModelBuilder(['Hello world!זוהי \nעובדה מבוססת שדעתו']);
	});
});
