/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { ModelBuilder } from 'vs/workbench/services/textfile/electron-browser/modelBuilder';
import { ITextModelCreationOptions } from 'vs/editor/common/model';
import { TextModel } from 'vs/editor/common/model/textModel';
import * as strings from 'vs/base/common/strings';
import { RawTextSource } from 'vs/editor/common/model/textSource';

export function testModelBuilder(chunks: string[], opts: ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS): void {
	let expectedTextSource = RawTextSource.fromString(chunks.join(''));

	let builder = new ModelBuilder();
	for (let i = 0, len = chunks.length; i < len; i++) {
		builder.acceptChunk(chunks[i]);
	}
	let actual = builder.finish();

	let actualTextSource = actual.value;

	assert.deepEqual(actualTextSource, expectedTextSource);
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
