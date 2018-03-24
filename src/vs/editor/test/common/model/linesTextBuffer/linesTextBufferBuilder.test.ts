/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { LinesTextBufferBuilder } from 'vs/editor/common/model/linesTextBuffer/linesTextBufferBuilder';
import { ITextModelCreationOptions } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import * as strings from 'vs/base/common/strings';
import { IRawTextSource } from 'vs/editor/common/model/linesTextBuffer/textSource';

class RawTextSource {
	public static fromString(rawText: string): IRawTextSource {
		// Count the number of lines that end with \r\n
		let carriageReturnCnt = 0;
		let lastCarriageReturnIndex = -1;
		while ((lastCarriageReturnIndex = rawText.indexOf('\r', lastCarriageReturnIndex + 1)) !== -1) {
			carriageReturnCnt++;
		}

		const containsRTL = strings.containsRTL(rawText);
		const isBasicASCII = (containsRTL ? false : strings.isBasicASCII(rawText));

		// Split the text into lines
		const lines = rawText.split(/\r\n|\r|\n/);

		// Remove the BOM (if present)
		let BOM = '';
		if (strings.startsWithUTF8BOM(lines[0])) {
			BOM = strings.UTF8_BOM_CHARACTER;
			lines[0] = lines[0].substr(1);
		}

		return {
			BOM: BOM,
			lines: lines,
			containsRTL: containsRTL,
			isBasicASCII: isBasicASCII,
			totalCRCount: carriageReturnCnt
		};
	}
}

export function testModelBuilder(chunks: string[], opts: ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS): void {
	let expectedTextSource = RawTextSource.fromString(chunks.join(''));

	let builder = new LinesTextBufferBuilder();
	for (let i = 0, len = chunks.length; i < len; i++) {
		builder.acceptChunk(chunks[i]);
	}
	let actual = builder.finish();

	assert.deepEqual(actual.rawTextSource, expectedTextSource);
}

suite('ModelBuilder', () => {

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

	test('ASCII handling 1', () => {
		testModelBuilder(['Hello world!!\nHow do you do?']);
	});
	test('ASCII handling 1', () => {
		testModelBuilder(['Hello world!!\nHow do you do?Züricha📚📚b']);
	});

	test('issue #32819: some special string cannot be displayed completely', () => {
		testModelBuilder(['ＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡＡ123']);
	});
});
