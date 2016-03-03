/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/languages/javascript/common/javascript.contribution';

import Modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesUtil');


suite('TS/JS - syntax highlighting', () => {

	var tokenizationSupport: Modes.ITokenizationSupport;
	var assertOnEnter: modesUtil.IOnEnterAsserter;

	setup((done) => {
		modesUtil.load('javascript').then(mode => {
			tokenizationSupport = mode.tokenizationSupport;
			assertOnEnter = modesUtil.createOnEnterAsserter(mode.getId(), mode.richEditSupport);
			done();
		});
	});

	test('onEnter', function() {
		assertOnEnter.nothing('', '', 'var f = function() {');
		assertOnEnter.nothing('', 'var', ' f = function() {');
		assertOnEnter.nothing('', 'var ', 'f = function() {');
		assertOnEnter.indents('', 'var f = function() {', '');
		assertOnEnter.indents('', 'var f = function() {', ' //');
		assertOnEnter.indents('', 'var f = function() { ', '//');
		assertOnEnter.indentsOutdents('', 'var f = function() {', '}');
		assertOnEnter.indents('', '(function() {', '');
		assertOnEnter.indentsOutdents('', '(function() {','}');
		assertOnEnter.indentsOutdents('', '(function() {','})');
		assertOnEnter.indentsOutdents('', '(function() {','});');

		assertOnEnter.nothing('', 'var l = ', '[');
		assertOnEnter.indents('', 'var l = [', '');
		assertOnEnter.indentsOutdents('', 'var l = [', ']');
		assertOnEnter.indentsOutdents('', 'var l = [', '];');

		assertOnEnter.nothing('', 'func', '(');
		assertOnEnter.indents('', 'func(', '');
		assertOnEnter.indentsOutdents('', 'func(' ,')');
		assertOnEnter.indentsOutdents('', 'func(', ');');

		assertOnEnter.indents('', '{', '');
		assertOnEnter.indents('', '{ ', '');
		assertOnEnter.indentsOutdents('', '{', '}');
		assertOnEnter.indentsOutdents('', '{ ', '}');
		assertOnEnter.indentsOutdents('', '{ ', ' }');
	});

	test('', () => {
		modesUtil.executeTests(tokenizationSupport, [

			// Keywords
			[{
			line: 'var x = function() { };',
			tokens: [
				{ startIndex: 0, type: 'keyword.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'keyword.js' },
				{ startIndex: 16, type: 'delimiter.parenthesis.js' },
				{ startIndex: 18, type: '' },
				{ startIndex: 19, type: 'delimiter.bracket.js' },
				{ startIndex: 20, type: '' },
				{ startIndex: 21, type: 'delimiter.bracket.js' },
				{ startIndex: 22, type: 'delimiter.js' }
			]}],

			[{
			line: '    var    ',
			tokens: [
				{ startIndex: 0, type: '' },
				{ startIndex: 4, type: 'keyword.js' },
				{ startIndex: 7, type: '' }
			]}],

			// Comments - single line
			[{
			line: '//',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: '    // a comment',
			tokens: [
				{ startIndex: 0, type: '' },
				{ startIndex: 4, type: 'comment.js' }
			]}],

			[{
			line: '// a comment',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: '// a comment /*',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: '// a comment /**',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: '//sticky comment',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: 'var x = 1; // my comment // is a nice one',
			tokens: [
				{ startIndex: 0, type: 'keyword.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'number.js' },
				{ startIndex: 9, type: 'delimiter.js' },
				{ startIndex: 10, type: '' },
				{ startIndex: 11, type: 'comment.js' }
			]}],

			// Comments - range comment, single line
			[{
			line: '/* a simple comment */',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: 'var x = /* a simple comment */ 1;',
			tokens: [
				{ startIndex: 0, type: 'keyword.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'comment.js' },
				{ startIndex: 30, type: '' },
				{ startIndex: 31, type: 'number.js' },
				{ startIndex: 32, type: 'delimiter.js' }
			]}],

			[{
			line: 'x = /**/;',
			tokens: [
				{ startIndex: 0, type: 'identifier.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'comment.js' },
				{ startIndex: 8, type: 'delimiter.js' }
			]}],

			[{
			line: 'x = /*/;',
			tokens: [
				{ startIndex: 0, type: 'identifier.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'comment.js' }
			]}],

			// Comments - range comment, multi lines
			[{
			line: '/* a multiline comment',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}, {
			line: 'can actually span',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}, {
			line: 'multiple lines */',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: 'var x = /* start a comment',
			tokens: [
				{ startIndex: 0, type: 'keyword.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'comment.js' }
			]}, {
			line: ' a ',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}, {
			line: 'and end it */ var a = 2;',
			tokens: [
				{ startIndex: 0, type: 'comment.js' },
				{ startIndex: 13, type: '' },
				{ startIndex: 14, type: 'keyword.js' },
				{ startIndex: 17, type: '' },
				{ startIndex: 18, type: 'identifier.js' },
				{ startIndex: 19, type: '' },
				{ startIndex: 20, type: 'delimiter.js' },
				{ startIndex: 21, type: '' },
				{ startIndex: 22, type: 'number.js' },
				{ startIndex: 23, type: 'delimiter.js' }
			]}],

			// Strings
			[{
			line: 'var a = \'a\';',
			tokens: [
				{ startIndex: 0, type: 'keyword.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'string.js' },
				{ startIndex: 11, type: 'delimiter.js' }
			]}],

			[{
			line: '"use strict";',
			tokens: [
				{ startIndex: 0, type: 'string.js' },
				{ startIndex: 12, type: 'delimiter.js' }
			]}],

			[{
			line: 'b = a + " \'cool\'  "',
			tokens: [
				{ startIndex: 0, type: 'identifier.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'string.js' }
			]}],

			[{
			line: '"escaping \\"quotes\\" is cool"',
			tokens: [
				{ startIndex: 0, type: 'string.js' }
			]}],

			[{
			line: '\'\'\'',
			tokens: [
				{ startIndex: 0, type: 'string.js' }
			]}],

			[{
			line: '\'\\\'\'',
			tokens: [
				{ startIndex: 0, type: 'string.js' }
			]}],

			[{
			line: '\'be careful \\not to escape\'',
			tokens: [
				{ startIndex: 0, type: 'string.js' }
			]}],

			// Numbers
			[{
			line: '0',
			tokens: [
				{ startIndex: 0, type: 'number.js' }
			]}],

			[{
			line: ' 0',
			tokens: [
				{ startIndex: 0, type: '' },
				{ startIndex: 1, type: 'number.js' }
			]}],

			[{
			line: ' 0 ',
			tokens: [
				{ startIndex: 0, type: '' },
				{ startIndex: 1, type: 'number.js' },
				{ startIndex: 2, type: '' }
			]}],

			[{
			line: '0 ',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: '' }
			]}],

			[{
			line: '0+0',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: 'delimiter.js' },
				{ startIndex: 2, type: 'number.js' }
			]}],

			[{
			line: '100+10',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 3, type: 'delimiter.js' },
				{ startIndex: 4, type: 'number.js' }
			]}],

			[{
			line: '0 + 0',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'number.js' }
			]}],

			[{
			line: '0123',
			tokens: [
				{ startIndex: 0, type: 'number.js' }
			]}],

			[{
			line: '01239',
			tokens: [
				{ startIndex: 0, type: 'number.js' }
			]}],

			[{
			line: '0x',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: 'identifier.js' }
			]}],

			[{
			line: '0x123',
			tokens: [
				{ startIndex: 0, type: 'number.js' }
			]}],

			// Regular Expressions
			[{
			line: '//',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: '/**/',
			tokens: [
				{ startIndex: 0, type: 'comment.js' }
			]}],

			[{
			line: '/***/',
			tokens: [
				{ startIndex: 0, type: 'comment.doc.js' }
			]}],

			[{
			line: '5 / 3;',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'number.js' },
				{ startIndex: 5, type: 'delimiter.js' }
			]}],

			// Advanced regular expressions
			[{
			line: '1 / 2; /* comment',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'number.js' },
				{ startIndex: 5, type: 'delimiter.js' },
				{ startIndex: 6, type: '' },
				{ startIndex: 7, type: 'comment.js' }
			]}],

			[{
			line: '1 / 2 / x / b;',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'number.js' },
				{ startIndex: 5, type: '' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'identifier.js' },
				{ startIndex: 9, type: '' },
				{ startIndex: 10, type: 'delimiter.js' },
				{ startIndex: 11, type: '' },
				{ startIndex: 12, type: 'identifier.js' },
				{ startIndex: 13, type: 'delimiter.js' }
			]}],

			[{
			line: 'a /ads/ b;',
			tokens: [
				{ startIndex: 0, type: 'identifier.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: 'identifier.js' },
				{ startIndex: 6, type: 'delimiter.js' },
				{ startIndex: 7, type: '' },
				{ startIndex: 8, type: 'identifier.js' },
				{ startIndex: 9, type: 'delimiter.js' }
			]}],

			[{
			line: '1/(2/3)/2/3;',
			tokens: [
				{ startIndex: 0, type: 'number.js' },
				{ startIndex: 1, type: 'delimiter.js' },
				{ startIndex: 2, type: 'delimiter.parenthesis.js' },
				{ startIndex: 3, type: 'number.js' },
				{ startIndex: 4, type: 'delimiter.js' },
				{ startIndex: 5, type: 'number.js' },
				{ startIndex: 6, type: 'delimiter.parenthesis.js' },
				{ startIndex: 7, type: 'delimiter.js' },
				{ startIndex: 8, type: 'number.js' },
				{ startIndex: 9, type: 'delimiter.js' },
				{ startIndex: 10, type: 'number.js' },
				{ startIndex: 11, type: 'delimiter.js' }
			]}],

			[{
			line: '{ key: 123 }',
			tokens: [
				{ startIndex: 0, type: 'delimiter.bracket.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'identifier.js' },
				{ startIndex: 5, type: 'delimiter.js' },
				{ startIndex: 6, type: '' },
				{ startIndex: 7, type: 'number.js' },
				{ startIndex: 10, type: '' },
				{ startIndex: 11, type: 'delimiter.bracket.js' }
			]}],

			[{
			line: '[1,2,3]',
			tokens: [
				{ startIndex: 0, type: 'delimiter.array.js' },
				{ startIndex: 1, type: 'number.js' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: 'number.js' },
				{ startIndex: 4, type: 'delimiter.js' },
				{ startIndex: 5, type: 'number.js' },
				{ startIndex: 6, type: 'delimiter.array.js' }
			]}],

			[{
			line: 'foo(123);',
			tokens: [
				{ startIndex: 0, type: 'identifier.js' },
				{ startIndex: 3, type: 'delimiter.parenthesis.js' },
				{ startIndex: 4, type: 'number.js' },
				{ startIndex: 7, type: 'delimiter.parenthesis.js' },
				{ startIndex: 8, type: 'delimiter.js' }
			]}],

			[{
			line: '{a:{b:[]}}',
			tokens: [
				{ startIndex: 0, type: 'delimiter.bracket.js' },
				{ startIndex: 1, type: 'identifier.js' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: 'delimiter.bracket.js' },
				{ startIndex: 4, type: 'identifier.js' },
				{ startIndex: 5, type: 'delimiter.js' },
				{ startIndex: 6, type: 'delimiter.array.js' },
				{ startIndex: 8, type: 'delimiter.bracket.js' }
			]}],

			[{
			line: 'x = "[{()}]"',
			tokens: [
				{ startIndex: 0, type: 'identifier.js' },
				{ startIndex: 1, type: '' },
				{ startIndex: 2, type: 'delimiter.js' },
				{ startIndex: 3, type: '' },
				{ startIndex: 4, type: 'string.js' }
			]}]
		]);
	});
});
