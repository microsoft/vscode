/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as strings from '../../../../../base/common/strings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DefaultEndOfLine } from '../../../../common/model.js';
import { createTextBufferFactory } from '../../../../common/model/textModel.js';

function testTextBufferFactory(text: string, eol: string, mightContainNonBasicASCII: boolean, mightContainRTL: boolean): void {
	const { disposable, textBuffer } = createTextBufferFactory(text).create(DefaultEndOfLine.LF);

	assert.strictEqual(textBuffer.mightContainNonBasicASCII(), mightContainNonBasicASCII);
	assert.strictEqual(textBuffer.mightContainRTL(), mightContainRTL);
	assert.strictEqual(textBuffer.getEOL(), eol);
	disposable.dispose();
}

suite('ModelBuilder', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('t1', () => {
		testTextBufferFactory('', '\n', false, false);
	});

	test('t2', () => {
		testTextBufferFactory('Hello world', '\n', false, false);
	});

	test('t3', () => {
		testTextBufferFactory('Hello world\nHow are you?', '\n', false, false);
	});

	test('t4', () => {
		testTextBufferFactory('Hello world\nHow are you?\nIs everything good today?\nDo you enjoy the weather?', '\n', false, false);
	});

	test('carriage return detection (1 \\r\\n 2 \\n)', () => {
		testTextBufferFactory('Hello world\r\nHow are you?\nIs everything good today?\nDo you enjoy the weather?', '\n', false, false);
	});

	test('carriage return detection (2 \\r\\n 1 \\n)', () => {
		testTextBufferFactory('Hello world\r\nHow are you?\r\nIs everything good today?\nDo you enjoy the weather?', '\r\n', false, false);
	});

	test('carriage return detection (3 \\r\\n 0 \\n)', () => {
		testTextBufferFactory('Hello world\r\nHow are you?\r\nIs everything good today?\r\nDo you enjoy the weather?', '\r\n', false, false);
	});

	test('BOM handling', () => {
		testTextBufferFactory(strings.UTF8_BOM_CHARACTER + 'Hello world!', '\n', false, false);
	});

	test('RTL handling 2', () => {
		testTextBufferFactory('Hello world!זוהי עובדה מבוססת שדעתו', '\n', true, true);
	});

	test('RTL handling 3', () => {
		testTextBufferFactory('Hello world!זוהי \nעובדה מבוססת שדעתו', '\n', true, true);
	});

	test('ASCII handling 1', () => {
		testTextBufferFactory('Hello world!!\nHow do you do?', '\n', false, false);
	});
	test('ASCII handling 2', () => {
		testTextBufferFactory('Hello world!!\nHow do you do?Züricha📚📚b', '\n', true, false);
	});
});
