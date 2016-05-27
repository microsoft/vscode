/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import modesUtil = require('vs/editor/test/common/modesUtil');
import {createTokenizationSupport2, Language} from 'vs/languages/typescript/common/tokenization';
import {createRichEditSupport} from 'vs/languages/typescript/common/mode';

suite('TS/JS - syntax highlighting', () => {

	var tokenizationSupport = createTokenizationSupport2(Language.EcmaScript5);
	var assertOnEnter = modesUtil.createOnEnterAsserter('javascript', createRichEditSupport('javascript'));

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
		modesUtil.executeTests2(tokenizationSupport, [

			// Keywords
			[{
			line: 'var x = function() { };',
			tokens: [
				{ startIndex: 0, scopes: 'keyword.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'keyword.js' },
				{ startIndex: 16, scopes: 'delimiter.parenthesis.js' },
				{ startIndex: 18, scopes: '' },
				{ startIndex: 19, scopes: 'delimiter.bracket.js' },
				{ startIndex: 20, scopes: '' },
				{ startIndex: 21, scopes: 'delimiter.bracket.js' },
				{ startIndex: 22, scopes: 'delimiter.js' }
			]}],

			[{
			line: '    var    ',
			tokens: [
				{ startIndex: 0, scopes: '' },
				{ startIndex: 4, scopes: 'keyword.js' },
				{ startIndex: 7, scopes: '' }
			]}],

			// Comments - single line
			[{
			line: '//',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: '    // a comment',
			tokens: [
				{ startIndex: 0, scopes: '' },
				{ startIndex: 4, scopes: 'comment.js' }
			]}],

			[{
			line: '// a comment',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: '// a comment /*',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: '// a comment /**',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: '//sticky comment',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: 'var x = 1; // my comment // is a nice one',
			tokens: [
				{ startIndex: 0, scopes: 'keyword.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'number.js' },
				{ startIndex: 9, scopes: 'delimiter.js' },
				{ startIndex: 10, scopes: '' },
				{ startIndex: 11, scopes: 'comment.js' }
			]}],

			// Comments - range comment, single line
			[{
			line: '/* a simple comment */',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: 'var x = /* a simple comment */ 1;',
			tokens: [
				{ startIndex: 0, scopes: 'keyword.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'comment.js' },
				{ startIndex: 30, scopes: '' },
				{ startIndex: 31, scopes: 'number.js' },
				{ startIndex: 32, scopes: 'delimiter.js' }
			]}],

			[{
			line: 'x = /**/;',
			tokens: [
				{ startIndex: 0, scopes: 'identifier.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'comment.js' },
				{ startIndex: 8, scopes: 'delimiter.js' }
			]}],

			[{
			line: 'x = /*/;',
			tokens: [
				{ startIndex: 0, scopes: 'identifier.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'comment.js' }
			]}],

			// Comments - range comment, multi lines
			[{
			line: '/* a multiline comment',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}, {
			line: 'can actually span',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}, {
			line: 'multiple lines */',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: 'var x = /* start a comment',
			tokens: [
				{ startIndex: 0, scopes: 'keyword.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'comment.js' }
			]}, {
			line: ' a ',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}, {
			line: 'and end it */ var a = 2;',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' },
				{ startIndex: 13, scopes: '' },
				{ startIndex: 14, scopes: 'keyword.js' },
				{ startIndex: 17, scopes: '' },
				{ startIndex: 18, scopes: 'identifier.js' },
				{ startIndex: 19, scopes: '' },
				{ startIndex: 20, scopes: 'delimiter.js' },
				{ startIndex: 21, scopes: '' },
				{ startIndex: 22, scopes: 'number.js' },
				{ startIndex: 23, scopes: 'delimiter.js' }
			]}],

			// Strings
			[{
			line: 'var a = \'a\';',
			tokens: [
				{ startIndex: 0, scopes: 'keyword.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'string.js' },
				{ startIndex: 11, scopes: 'delimiter.js' }
			]}],

			[{
			line: '"use strict";',
			tokens: [
				{ startIndex: 0, scopes: 'string.js' },
				{ startIndex: 12, scopes: 'delimiter.js' }
			]}],

			[{
			line: 'b = a + " \'cool\'  "',
			tokens: [
				{ startIndex: 0, scopes: 'identifier.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'string.js' }
			]}],

			[{
			line: '"escaping \\"quotes\\" is cool"',
			tokens: [
				{ startIndex: 0, scopes: 'string.js' }
			]}],

			[{
			line: '\'\'\'',
			tokens: [
				{ startIndex: 0, scopes: 'string.js' }
			]}],

			[{
			line: '\'\\\'\'',
			tokens: [
				{ startIndex: 0, scopes: 'string.js' }
			]}],

			[{
			line: '\'be careful \\not to escape\'',
			tokens: [
				{ startIndex: 0, scopes: 'string.js' }
			]}],

			// Numbers
			[{
			line: '0',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' }
			]}],

			[{
			line: ' 0',
			tokens: [
				{ startIndex: 0, scopes: '' },
				{ startIndex: 1, scopes: 'number.js' }
			]}],

			[{
			line: ' 0 ',
			tokens: [
				{ startIndex: 0, scopes: '' },
				{ startIndex: 1, scopes: 'number.js' },
				{ startIndex: 2, scopes: '' }
			]}],

			[{
			line: '0 ',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: '' }
			]}],

			[{
			line: '0+0',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: 'delimiter.js' },
				{ startIndex: 2, scopes: 'number.js' }
			]}],

			[{
			line: '100+10',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 3, scopes: 'delimiter.js' },
				{ startIndex: 4, scopes: 'number.js' }
			]}],

			[{
			line: '0 + 0',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'number.js' }
			]}],

			[{
			line: '0123',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' }
			]}],

			[{
			line: '01239',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' }
			]}],

			[{
			line: '0x',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: 'identifier.js' }
			]}],

			[{
			line: '0x123',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' }
			]}],

			// Regular Expressions
			[{
			line: '//',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: '/**/',
			tokens: [
				{ startIndex: 0, scopes: 'comment.js' }
			]}],

			[{
			line: '/***/',
			tokens: [
				{ startIndex: 0, scopes: 'comment.doc.js' }
			]}],

			[{
			line: '5 / 3;',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'number.js' },
				{ startIndex: 5, scopes: 'delimiter.js' }
			]}],

			// Advanced regular expressions
			[{
			line: '1 / 2; /* comment',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'number.js' },
				{ startIndex: 5, scopes: 'delimiter.js' },
				{ startIndex: 6, scopes: '' },
				{ startIndex: 7, scopes: 'comment.js' }
			]}],

			[{
			line: '1 / 2 / x / b;',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'number.js' },
				{ startIndex: 5, scopes: '' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'identifier.js' },
				{ startIndex: 9, scopes: '' },
				{ startIndex: 10, scopes: 'delimiter.js' },
				{ startIndex: 11, scopes: '' },
				{ startIndex: 12, scopes: 'identifier.js' },
				{ startIndex: 13, scopes: 'delimiter.js' }
			]}],

			[{
			line: 'a /ads/ b;',
			tokens: [
				{ startIndex: 0, scopes: 'identifier.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: 'identifier.js' },
				{ startIndex: 6, scopes: 'delimiter.js' },
				{ startIndex: 7, scopes: '' },
				{ startIndex: 8, scopes: 'identifier.js' },
				{ startIndex: 9, scopes: 'delimiter.js' }
			]}],

			[{
			line: '1/(2/3)/2/3;',
			tokens: [
				{ startIndex: 0, scopes: 'number.js' },
				{ startIndex: 1, scopes: 'delimiter.js' },
				{ startIndex: 2, scopes: 'delimiter.parenthesis.js' },
				{ startIndex: 3, scopes: 'number.js' },
				{ startIndex: 4, scopes: 'delimiter.js' },
				{ startIndex: 5, scopes: 'number.js' },
				{ startIndex: 6, scopes: 'delimiter.parenthesis.js' },
				{ startIndex: 7, scopes: 'delimiter.js' },
				{ startIndex: 8, scopes: 'number.js' },
				{ startIndex: 9, scopes: 'delimiter.js' },
				{ startIndex: 10, scopes: 'number.js' },
				{ startIndex: 11, scopes: 'delimiter.js' }
			]}],

			[{
			line: '{ key: 123 }',
			tokens: [
				{ startIndex: 0, scopes: 'delimiter.bracket.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: 'delimiter.js' },
				{ startIndex: 6, scopes: '' },
				{ startIndex: 7, scopes: 'number.js' },
				{ startIndex: 10, scopes: '' },
				{ startIndex: 11, scopes: 'delimiter.bracket.js' }
			]}],

			[{
			line: '[1,2,3]',
			tokens: [
				{ startIndex: 0, scopes: 'delimiter.array.js' },
				{ startIndex: 1, scopes: 'number.js' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: 'number.js' },
				{ startIndex: 4, scopes: 'delimiter.js' },
				{ startIndex: 5, scopes: 'number.js' },
				{ startIndex: 6, scopes: 'delimiter.array.js' }
			]}],

			[{
			line: 'foo(123);',
			tokens: [
				{ startIndex: 0, scopes: 'identifier.js' },
				{ startIndex: 3, scopes: 'delimiter.parenthesis.js' },
				{ startIndex: 4, scopes: 'number.js' },
				{ startIndex: 7, scopes: 'delimiter.parenthesis.js' },
				{ startIndex: 8, scopes: 'delimiter.js' }
			]}],

			[{
			line: '{a:{b:[]}}',
			tokens: [
				{ startIndex: 0, scopes: 'delimiter.bracket.js' },
				{ startIndex: 1, scopes: 'identifier.js' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: 'delimiter.bracket.js' },
				{ startIndex: 4, scopes: 'identifier.js' },
				{ startIndex: 5, scopes: 'delimiter.js' },
				{ startIndex: 6, scopes: 'delimiter.array.js' },
				{ startIndex: 8, scopes: 'delimiter.bracket.js' }
			]}],

			[{
			line: 'x = "[{()}]"',
			tokens: [
				{ startIndex: 0, scopes: 'identifier.js' },
				{ startIndex: 1, scopes: '' },
				{ startIndex: 2, scopes: 'delimiter.js' },
				{ startIndex: 3, scopes: '' },
				{ startIndex: 4, scopes: 'string.js' }
			]}]
		]);
	});
});
