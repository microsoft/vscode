/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {language} from 'vs/editor/standalone-languages/java';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('java', language, [
	// Comments - single line
	[{
	line: '//',
	tokens: null}],

	[{
	line: '    // a comment',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.java' }
	]}],

	// Broken nested tokens due to invalid comment tokenization
	[{
	line: '/* //*/ a',
	tokens: [
		{ startIndex: 0, type: 'comment.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.java' }
	]}],

	[{
	line: '// a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}],

	[{
	line: '//sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}],

	[{
	line: '/almost a comment',
	tokens: [
		{ startIndex: 0, type: 'delimiter.java' },
		{ startIndex: 1, type: 'identifier.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.java' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.java' }
	]}],

	[{
	line: '1 / 2; /* comment',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.java' },
		{ startIndex: 5, type: 'delimiter.java' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'comment.java' }
	]}],

	[{
	line: 'int x = 1; // my comment // is a nice one',
	tokens: [
		{ startIndex: 0, type: 'keyword.int.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.java' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.java' },
		{ startIndex: 9, type: 'delimiter.java' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'comment.java' }
	]}],

	// Comments - range comment, single line
	[{
	line: '/* a simple comment */',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}],

	[{
	line: 'int x = /* a simple comment */ 1;',
	tokens: [
		{ startIndex: 0, type: 'keyword.int.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.java' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.java' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'number.java' },
		{ startIndex: 32, type: 'delimiter.java' }
	]}],

	[{
	line: 'int x = /* comment */ 1; */',
	tokens: [
		{ startIndex: 0, type: 'keyword.int.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.java' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.java' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'number.java' },
		{ startIndex: 23, type: 'delimiter.java' },
		{ startIndex: 24, type: '' }
	]}],

	[{
	line: 'x = /**/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.java' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.java' },
		{ startIndex: 8, type: 'delimiter.java' }
	]}],

	[{
	line: 'x = /*/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.java' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.java' }
	]}],

	// Comments - range comment, multiple lines
	[{
	line: '/* start of multiline comment',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}, {
	line: 'a comment between without a star',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}, {
	line: 'end of multiline comment*/',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}],

	[{
	line: 'int x = /* start a comment',
	tokens: [
		{ startIndex: 0, type: 'keyword.int.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.java' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.java' }
	]}, {
	line: ' a ',
	tokens: [
		{ startIndex: 0, type: 'comment.java' }
	]}, {
	line: 'and end it */ 2;',
	tokens: [
		{ startIndex: 0, type: 'comment.java' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'number.java' },
		{ startIndex: 15, type: 'delimiter.java' }
	]}],

	// Java Doc, multiple lines
	[{
	line: '/** start of Java Doc',
	tokens: [
		{ startIndex: 0, type: 'comment.doc.java' }
	]}, {
	line: 'a comment between without a star',
	tokens: [
		{ startIndex: 0, type: 'comment.doc.java' }
	]}, {
	line: 'end of multiline comment*/',
	tokens: [
		{ startIndex: 0, type: 'comment.doc.java' }
	]}],

	// Keywords
	[{
	line: 'package test; class Program { static void main(String[] args) {} } }',
	tokens: [
		{ startIndex: 0, type: 'keyword.package.java' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.java' },
		{ startIndex: 12, type: 'delimiter.java' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'keyword.class.java' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'identifier.java' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'delimiter.curly.java' },
		{ startIndex: 29, type: '' },
		{ startIndex: 30, type: 'keyword.static.java' },
		{ startIndex: 36, type: '' },
		{ startIndex: 37, type: 'keyword.void.java' },
		{ startIndex: 41, type: '' },
		{ startIndex: 42, type: 'identifier.java' },
		{ startIndex: 46, type: 'delimiter.parenthesis.java' },
		{ startIndex: 47, type: 'identifier.java' },
		{ startIndex: 53, type: 'delimiter.square.java' },
		{ startIndex: 55, type: '' },
		{ startIndex: 56, type: 'identifier.java' },
		{ startIndex: 60, type: 'delimiter.parenthesis.java' },
		{ startIndex: 61, type: '' },
		{ startIndex: 62, type: 'delimiter.curly.java' },
		{ startIndex: 64, type: '' },
		{ startIndex: 65, type: 'delimiter.curly.java' },
		{ startIndex: 66, type: '' },
		{ startIndex: 67, type: 'delimiter.curly.java' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.java' }
	]}],

	[{
	line: '0.10',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '0x',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: 'identifier.java' }
	]}],

	[{
	line: '0x123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.java' }
	]}],

	[{
	line: '0x5_2',
	tokens: [
		{ startIndex: 0, type: 'number.hex.java' }
	]}],

	[{
	line: '023L',
	tokens: [
		{ startIndex: 0, type: 'number.octal.java' }
	]}],

	[{
	line: '0123l',
	tokens: [
		{ startIndex: 0, type: 'number.octal.java' }
	]}],

	[{
	line: '05_2',
	tokens: [
		{ startIndex: 0, type: 'number.octal.java' }
	]}],

	[{
	line: '0b1010_0101',
	tokens: [
		{ startIndex: 0, type: 'number.binary.java' }
	]}],

	[{
	line: '0B001',
	tokens: [
		{ startIndex: 0, type: 'number.binary.java' }
	]}],

	[{
	line: '10e3',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '10f',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5e3',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5e-3',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5E3',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5E-3',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5F',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5f',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5D',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23.5d',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '1.72E3D',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '1.72E3d',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '1.72E-3d',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '1.72e3D',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '1.72e3d',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '1.72e-3d',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' }
	]}],

	[{
	line: '23L',
	tokens: [
		{ startIndex: 0, type: 'number.java' }
	]}],

	[{
	line: '23l',
	tokens: [
		{ startIndex: 0, type: 'number.java' }
	]}],

	[{
	line: '0_52',
	tokens: [
		{ startIndex: 0, type: 'number.java' }
	]}],

	[{
	line: '5_2',
	tokens: [
		{ startIndex: 0, type: 'number.java' }
	]}],

	[{
	line: '5_______2',
	tokens: [
		{ startIndex: 0, type: 'number.java' }
	]}],

	[{
	line: '3_.1415F',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: 'identifier.java' },
		{ startIndex: 2, type: 'delimiter.java' },
		{ startIndex: 3, type: 'number.float.java' }
	]}],

	[{
	line: '3._1415F',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: 'delimiter.java' },
		{ startIndex: 2, type: 'identifier.java' }
	]}],

	[{
	line: '999_99_9999_L',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 11, type: 'identifier.java' }
	]}],

	[{
	line: '52_',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 2, type: 'identifier.java' }
	]}],

	[{
	line: '0_x52',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: 'identifier.java' }
	]}],

	[{
	line: '0x_52',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: 'identifier.java' }
	]}],

	[{
	line: '0x52_',
	tokens: [
		{ startIndex: 0, type: 'number.hex.java' },
		{ startIndex: 4, type: 'identifier.java' }
	]}],

	[{
	line: '052_',
	tokens: [
		{ startIndex: 0, type: 'number.octal.java' },
		{ startIndex: 3, type: 'identifier.java' }
	]}],

	[{
	line: '23.5L',
	tokens: [
		{ startIndex: 0, type: 'number.float.java' },
		{ startIndex: 4, type: 'identifier.java' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: 'delimiter.java' },
		{ startIndex: 2, type: 'number.java' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 3, type: 'delimiter.java' },
		{ startIndex: 4, type: 'number.java' }
	]}],

	[{
	line: '0 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.java' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.java' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.java' }
	]}],

	// single line Strings
	[{
	line: 'String s = "I\'m a Java String";',
	tokens: [
		{ startIndex: 0, type: 'identifier.java' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.java' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.java' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'string.java' },
		{ startIndex: 30, type: 'delimiter.java' }
	]}],

	[{
	line: 'String s = "concatenated" + " String" ;',
	tokens: [
		{ startIndex: 0, type: 'identifier.java' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.java' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.java' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'string.java' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'delimiter.java' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'string.java' },
		{ startIndex: 37, type: '' },
		{ startIndex: 38, type: 'delimiter.java' }
	]}],

	[{
	line: '"quote in a string"',
	tokens: [
		{ startIndex: 0, type: 'string.java' }
	]}],

	[{
	line: '"escaping \\"quotes\\" is cool"',
	tokens: [
		{ startIndex: 0, type: 'string.java' },
		{ startIndex: 10, type: 'string.escape.java' },
		{ startIndex: 12, type: 'string.java' },
		{ startIndex: 18, type: 'string.escape.java' },
		{ startIndex: 20, type: 'string.java' }
	]}],

	[{
	line: '"\\"',
	tokens: [
		{ startIndex: 0, type: 'string.invalid.java' }
	]}],

	// Annotations
	[{
	line: '@',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '@Override',
	tokens: [
		{ startIndex: 0, type: 'annotation.java' }
	]}],

	[{
	line: '@SuppressWarnings(value = "aString")',
	tokens: [
		{ startIndex: 0, type: 'annotation.java' },
		{ startIndex: 17, type: 'delimiter.parenthesis.java' },
		{ startIndex: 18, type: 'identifier.java' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'delimiter.java' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'string.java' },
		{ startIndex: 35, type: 'delimiter.parenthesis.java' }
	]}],

	[{
	line: '@ AnnotationWithKeywordAfter private',
	tokens: [
		{ startIndex: 0, type: 'annotation.java' },
		{ startIndex: 28, type: '' },
		{ startIndex: 29, type: 'keyword.private.java' }
	]}]
]);

suite('java', () => {
	test('word definition', () => {
		var wordDefinition = language.wordDefinition;
		assert.deepEqual('a b cde'.match(wordDefinition), ['a', 'b', 'cde']);

		assert.deepEqual('public static void main(String[] args) {'.match(wordDefinition),
			['public', 'static', 'void', 'main', 'String', 'args']);

		assert.deepEqual('g.drawOval(10,10, 330, 100); @SuppressWarnings("unchecked")'.match(wordDefinition),
			['g', 'drawOval', '10', '10', '330', '100', '@SuppressWarnings', 'unchecked']);

		assert.deepEqual('Socket client_socket = listen_socket.accept();'.match(wordDefinition),
			['Socket', 'client_socket', 'listen_socket', 'accept']);
	});
});
