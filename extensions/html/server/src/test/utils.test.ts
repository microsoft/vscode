/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { applyEdits } from '../utils/edits';
import { TextDocument, TextEdit, Position, Range } from 'vscode-languageserver-types';

suite('Edits', () => {

	test('inserts', function (): any {
		let input = TextDocument.create('foo://bar/f', 'html', 0, '012345678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.insert(Position.create(0, 0), 'Hello')]), 'Hello012345678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.insert(Position.create(0, 1), 'Hello')]), '0Hello12345678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.insert(Position.create(0, 1), 'Hello'), TextEdit.insert(Position.create(0, 1), 'World')]), '0HelloWorld12345678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.insert(Position.create(0, 2), 'One'), TextEdit.insert(Position.create(0, 1), 'Hello'), TextEdit.insert(Position.create(0, 1), 'World'), TextEdit.insert(Position.create(0, 2), 'Two'), TextEdit.insert(Position.create(0, 2), 'Three')]), '0HelloWorld1OneTwoThree2345678901234567890123456789');
	});

	test('replace', function (): any {
		let input = TextDocument.create('foo://bar/f', 'html', 0, '012345678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello')]), '012Hello678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello'), TextEdit.replace(Range.create(Position.create(0, 6), Position.create(0, 9)), 'World')]), '012HelloWorld901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello'), TextEdit.insert(Position.create(0, 6), 'World')]), '012HelloWorld678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.insert(Position.create(0, 6), 'World'), TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello')]), '012HelloWorld678901234567890123456789');
		assert.equal(applyEdits(input, [TextEdit.insert(Position.create(0, 3), 'World'), TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello')]), '012WorldHello678901234567890123456789');

	});

	test('overlap', function (): any {
		let input = TextDocument.create('foo://bar/f', 'html', 0, '012345678901234567890123456789');
		assert.throws(_ => applyEdits(input, [TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello'), TextEdit.insert(Position.create(0, 3), 'World')]));
		assert.throws(_ => applyEdits(input, [TextEdit.replace(Range.create(Position.create(0, 3), Position.create(0, 6)), 'Hello'), TextEdit.insert(Position.create(0, 4), 'World')]));
	});

});