/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/coffee';
import {testOnEnter, testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testOnEnter('coffeescript', language, (assertOnEnter) => {
	assertOnEnter.nothing('', ' a', '');
	assertOnEnter.indents('', ' {', '');
	assertOnEnter.indents('', '( ', '');
	assertOnEnter.indents('', ' [ ', '');
	assertOnEnter.indentsOutdents('', ' { ', ' } ');
});

testTokenization('coffeescript', language, [
	// Comments
	[{
	line: '#',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	[{
	line: '    # a comment',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.coffee' }
	]}],

	[{
	line: '# a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	[{
	line: '#sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	[{
	line: 'x = 1 # my comment # is a nice one',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'comment.coffee' }
	]}],

	[{
	line: 'x = 1e #is a exponent number',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.float.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'comment.coffee' }
	]}],

	[{
	line: 'x = 0x1F #is a hex number',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.hex.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'comment.coffee' }
	]}],

	// Keywords
	[{
	line: 'new x = switch()',
	tokens: [
		{ startIndex: 0, type: 'keyword.new.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'keyword.switch.coffee' },
		{ startIndex: 14, type: 'delimiter.parenthesis.coffee' }
	]}],

	[{
	line: '@test [do]',
	tokens: [
		{ startIndex: 0, type: 'variable.predefined.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.square.coffee' },
		{ startIndex: 7, type: 'keyword.do.coffee' },
		{ startIndex: 9, type: 'delimiter.square.coffee' }
	]}],

	[{
	line: 'this do',
	tokens: [
		{ startIndex: 0, type: 'variable.predefined.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'keyword.do.coffee' }
	]}],

	[{
	line: '    new    ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.new.coffee' },
		{ startIndex: 7, type: '' }
	]}],

	// Comments - range comment, single line
	[{
	line: '### a simple comment ###',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	[{
	line: 'new x = ### a simple comment ### 1',
	tokens: [
		{ startIndex: 0, type: 'keyword.new.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.coffee' },
		{ startIndex: 32, type: '' },
		{ startIndex: 33, type: 'number.coffee' }
	]}],

	[{
	line: 'new x = ### comment ### 1 ###',
	tokens: [
		{ startIndex: 0, type: 'keyword.new.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.coffee' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'number.coffee' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'comment.coffee' }
	]}],

	[{
	line: 'x = ######s',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.coffee' },
		{ startIndex: 10, type: '' }
	]}],

	[{
	line: 'x = ###/',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.coffee' }
	]}],

	// Comments - range comment, multi lines
	[{
	line: '### a multiline comment',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'can actually span',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'multiple lines ###',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	[{
	line: 'new x = ### start a comment',
	tokens: [
		{ startIndex: 0, type: 'keyword.new.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.coffee' }
	]}, {
	line: ' a ',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'and end it ### new a = 2;',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'keyword.new.coffee' },
		{ startIndex: 18, type: '' },
		{ startIndex: 21, type: 'delimiter.coffee' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'number.coffee' },
		{ startIndex: 24, type: '' }
	]}],

	// Block Strings
	[{
	line: 'b(\'\'\'asdads\'\'\')',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 2, type: 'string.coffee' },
		{ startIndex: 14, type: 'delimiter.parenthesis.coffee' }
	]}],

	[{
	line: 'foo(""" var i = \'foo\'; """)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 4, type: 'string.coffee' },
		{ startIndex: 26, type: 'delimiter.parenthesis.coffee' }
	]}],

	// Strings
	[{
	line: 'for a = \'a\';',
	tokens: [
		{ startIndex: 0, type: 'keyword.for.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'string.coffee' },
		{ startIndex: 11, type: '' }
	]}],

	[{
	line: '"use strict";',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 12, type: '' }
	]}],

	[{
	line: 'b = a + " \'cool\'  "',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'string.coffee' }
	]}],

	[{
	line: '"escaping \\"quotes\\" is cool"',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 10, type: 'string.escape.coffee' },
		{ startIndex: 12, type: 'string.coffee' },
		{ startIndex: 18, type: 'string.escape.coffee' },
		{ startIndex: 20, type: 'string.coffee' }
	]}],

	[{
	line: '\'\'\'',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}],

	[{
	line: '\'\\\'\'',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 1, type: 'string.escape.coffee' },
		{ startIndex: 3, type: 'string.coffee' }
	]}],

	[{
	line: '\'be careful \\not to escape\'',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 12, type: 'string.escape.coffee' },
		{ startIndex: 14, type: 'string.coffee' }
	]}],

	// Strings - multiline
	[{
	line: '\'a multiline string',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: 'second line',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}],

	// Strings - with nested code
	[{
	line: '"for a = \'a\'; #{ new } works"',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'keyword.new.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'string.coffee' }
	]}],

	[{
	line: '"a comment with nested code #{ 2 / 3 } works"',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'number.coffee' },
		{ startIndex: 32, type: '' },
		{ startIndex: 33, type: 'delimiter.coffee' },
		{ startIndex: 34, type: '' },
		{ startIndex: 35, type: 'number.coffee' },
		{ startIndex: 36, type: '' },
		{ startIndex: 37, type: 'string.coffee' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' }
	]}],

	[{
	line: ' 0',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'number.coffee' }
	]}],

	[{
	line: ' 0 ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'number.coffee' },
		{ startIndex: 2, type: '' }
	]}],

	[{
	line: '0 ',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: '' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: 'delimiter.coffee' },
		{ startIndex: 2, type: 'number.coffee' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 3, type: 'delimiter.coffee' },
		{ startIndex: 4, type: 'number.coffee' }
	]}],

	[{
	line: '0 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.coffee' }
	]}],

	[{
	line: '0123',
	tokens: [
		{ startIndex: 0, type: 'number.octal.coffee' }
	]}],

	[{
	line: '01239',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' }
	]}],

	[{
	line: '0x123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.coffee' }
	]}],

	[{
	line: '[1,2,3]',
	tokens: [
		{ startIndex: 0, type: 'delimiter.square.coffee' },
		{ startIndex: 1, type: 'number.coffee' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: 'number.coffee' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: 'number.coffee' },
		{ startIndex: 6, type: 'delimiter.square.coffee' }
	]}],

	[{
	line: 'foo(123);',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 7, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 8, type: '' }
	]}],

	[{
	line: '(a:(b:[]))',
	tokens: [
		{ startIndex: 0, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: 'delimiter.square.coffee' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' }
	]}],

	[{
	line: 'x = \'[{()}]\'',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.coffee' }
	]}],

	// Regular Expressions
	[{
	line: '#',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	[{
	line: '/ /',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}],

	[{
	line: '/abc\\/asd/',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}],

	[{
	line: 'new r = /sweet"regular exp" \\/ cool/;',
	tokens: [
		{ startIndex: 0, type: 'keyword.new.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'regexp.coffee' },
		{ startIndex: 36, type: '' }
	]}],

	[{
	line: '5 / 3;',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 5, type: '' }
	]}],

	// Regex - range regex, multi lines
	[{
	line: '/// a multiline regex',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}, {
	line: 'can actually span',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}, {
	line: 'multiplelines with # comments',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 19, type: 'comment.coffee' }
	]}, {
	line: 'multiple lines ///',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}],

	// Regex - multi lines followed by #comment
	[{
	line: '///',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}, {
	line: '#comment',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}],

	// Advanced regular expressions
	[{
	line: '1 / 2; # comment',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 7, type: 'comment.coffee' }
	]}],

	[{
	line: '1 / 2 / x / b;',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 10, type: 'delimiter.coffee' },
		{ startIndex: 11, type: '' }
	]}],

	[{
	line: 'a /ads/ b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' }
	]}],

	[{
	line: 'x = /foo/.test(\'\')',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'regexp.coffee' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 14, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 15, type: 'string.coffee' },
		{ startIndex: 17, type: 'delimiter.parenthesis.coffee' }
	]}],

	[{
	line: 'x = 1 + f(2 / 3, /foo/)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 9, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 10, type: 'number.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.coffee' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'number.coffee' },
		{ startIndex: 15, type: 'delimiter.coffee' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'regexp.coffee' },
		{ startIndex: 22, type: 'delimiter.parenthesis.coffee' }
	]}],

	[{
	line: '1/(2/3)/2/3;',
	tokens: [
		{ startIndex: 0, type: 'number.coffee' },
		{ startIndex: 1, type: 'delimiter.coffee' },
		{ startIndex: 2, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 3, type: 'number.coffee' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: 'number.coffee' },
		{ startIndex: 6, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: 'number.coffee' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: 'number.coffee' },
		{ startIndex: 11, type: '' }
	]}],

	[{
	line: '{ key: 123 }',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'number.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'delimiter.curly.coffee' }
	]}],

	[{
	line: '[1,2,3]',
	tokens: [
		{ startIndex: 0, type: 'delimiter.square.coffee' },
		{ startIndex: 1, type: 'number.coffee' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: 'number.coffee' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: 'number.coffee' },
		{ startIndex: 6, type: 'delimiter.square.coffee' }
	]}],

	[{
	line: 'foo(123);',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 4, type: 'number.coffee' },
		{ startIndex: 7, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 8, type: '' }
	]}],

	[{
	line: '{a:{b:[]}}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.coffee' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: 'delimiter.curly.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: 'delimiter.square.coffee' },
		{ startIndex: 8, type: 'delimiter.curly.coffee' }
	]}],

	[{
	line: 'x = \'[{()}]\'',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.coffee' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.coffee' }
	]}],

	// syntax highligting issue with {} - bug 16176
	[{
	line: '"/api/v2/course/#{ $stateParams.courseId }/grading/student/#{$stateParams.studentId}",',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' },
		{ startIndex: 18, type: '' },
		{ startIndex: 31, type: 'delimiter.coffee' },
		{ startIndex: 32, type: '' },
		{ startIndex: 41, type: 'string.coffee' },
		{ startIndex: 61, type: '' },
		{ startIndex: 73, type: 'delimiter.coffee' },
		{ startIndex: 74, type: '' },
		{ startIndex: 83, type: 'string.coffee' },
		{ startIndex: 85, type: 'delimiter.coffee' }
	]}],

	// Generated from sample
	[{
	line: '# Assignment:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'number   = 42',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'number.coffee' }
	]}, {
	line: 'opposite = true',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.true.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Conditions:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'number = -42 if opposite',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: 'number.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'keyword.if.coffee' },
		{ startIndex: 15, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Functions:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'square = (x) -> x * x',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' },
		{ startIndex: 18, type: 'delimiter.coffee' },
		{ startIndex: 19, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Arrays:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'list = [1, 2, 3, 4, 5]',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.square.coffee' },
		{ startIndex: 8, type: 'number.coffee' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'number.coffee' },
		{ startIndex: 12, type: 'delimiter.coffee' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'number.coffee' },
		{ startIndex: 15, type: 'delimiter.coffee' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'number.coffee' },
		{ startIndex: 18, type: 'delimiter.coffee' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'number.coffee' },
		{ startIndex: 21, type: 'delimiter.square.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Objects:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'math =',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' }
	]}, {
	line: '  root:   Math.sqrt',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' }
	]}, {
	line: '  square: square',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' }
	]}, {
	line: '  cube:   (x) -> x * square x',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 10, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 16, type: '' },
		{ startIndex: 19, type: 'delimiter.coffee' },
		{ startIndex: 20, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Splats:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'race = (winner, runners...) ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' },
		{ startIndex: 23, type: 'delimiter.coffee' },
		{ startIndex: 26, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'delimiter.coffee' }
	]}, {
	line: '  print winner, runners',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Existence:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'alert "I knew it!" if elvis?',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'string.coffee' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'keyword.if.coffee' },
		{ startIndex: 21, type: '' },
		{ startIndex: 27, type: 'delimiter.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Array comprehensions:',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'cubes = (math.cube num for num in list)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 13, type: 'delimiter.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 23, type: 'keyword.for.coffee' },
		{ startIndex: 26, type: '' },
		{ startIndex: 31, type: 'keyword.in.coffee' },
		{ startIndex: 33, type: '' },
		{ startIndex: 38, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'fill = (container, liquid = "coffee") ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 17, type: 'delimiter.coffee' },
		{ startIndex: 18, type: '' },
		{ startIndex: 26, type: 'delimiter.coffee' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'string.coffee' },
		{ startIndex: 36, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 37, type: '' },
		{ startIndex: 38, type: 'delimiter.coffee' }
	]}, {
	line: '  "Filling the #{container} with #{liquid}..."',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'string.coffee' },
		{ startIndex: 17, type: '' },
		{ startIndex: 26, type: 'string.coffee' },
		{ startIndex: 35, type: '' },
		{ startIndex: 41, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'ong = ["do", "re", "mi", "fa", "so"]',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.square.coffee' },
		{ startIndex: 7, type: 'string.coffee' },
		{ startIndex: 11, type: 'delimiter.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'string.coffee' },
		{ startIndex: 17, type: 'delimiter.coffee' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'string.coffee' },
		{ startIndex: 23, type: 'delimiter.coffee' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'string.coffee' },
		{ startIndex: 29, type: 'delimiter.coffee' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'string.coffee' },
		{ startIndex: 35, type: 'delimiter.square.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'singers = {Jagger: "Rock", Elvis: "Roll"}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'delimiter.curly.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 17, type: 'delimiter.coffee' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'string.coffee' },
		{ startIndex: 25, type: 'delimiter.coffee' },
		{ startIndex: 26, type: '' },
		{ startIndex: 32, type: 'delimiter.coffee' },
		{ startIndex: 33, type: '' },
		{ startIndex: 34, type: 'string.coffee' },
		{ startIndex: 40, type: 'delimiter.curly.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'bitlist = [',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'delimiter.square.coffee' }
	]}, {
	line: '  1, 0, 1',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'number.coffee' },
		{ startIndex: 3, type: 'delimiter.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'number.coffee' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.coffee' }
	]}, {
	line: '  0, 0, 1',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'number.coffee' },
		{ startIndex: 3, type: 'delimiter.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'number.coffee' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.coffee' }
	]}, {
	line: '  1, 1, 0',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'number.coffee' },
		{ startIndex: 3, type: 'delimiter.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'number.coffee' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.coffee' }
	]}, {
	line: ']',
	tokens: [
		{ startIndex: 0, type: 'delimiter.square.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'kids =',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' }
	]}, {
	line: '  brother:',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' }
	]}, {
	line: '    name: "Max"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'string.coffee' }
	]}, {
	line: '    age:  11',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 10, type: 'number.coffee' }
	]}, {
	line: '  sister:',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' }
	]}, {
	line: '    name: "Ida"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'string.coffee' }
	]}, {
	line: '    age:  9',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 10, type: 'number.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '$(\'.account\').attr class: \'active\'',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 2, type: 'string.coffee' },
		{ startIndex: 12, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 13, type: 'delimiter.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 19, type: 'keyword.class.coffee' },
		{ startIndex: 24, type: 'delimiter.coffee' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'string.coffee' }
	]}, {
	line: 'log object.class',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'delimiter.coffee' },
		{ startIndex: 11, type: 'keyword.class.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'outer = 1',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.coffee' }
	]}, {
	line: 'changeNumbers = ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'delimiter.coffee' }
	]}, {
	line: 'inner = -1',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: 'number.coffee' }
	]}, {
	line: 'outer = 10',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.coffee' }
	]}, {
	line: 'inner = changeNumbers()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 21, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'mood = greatlyImproved if singing',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 23, type: 'keyword.if.coffee' },
		{ startIndex: 25, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'if happy and knowsIt',
	tokens: [
		{ startIndex: 0, type: 'keyword.if.coffee' },
		{ startIndex: 2, type: '' },
		{ startIndex: 9, type: 'keyword.and.coffee' },
		{ startIndex: 12, type: '' }
	]}, {
	line: '  clapsHands()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 12, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '  chaChaCha()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 11, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: 'else',
	tokens: [
		{ startIndex: 0, type: 'keyword.else.coffee' }
	]}, {
	line: '  showIt()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'date = if friday then sue else jill',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'keyword.if.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 17, type: 'keyword.then.coffee' },
		{ startIndex: 21, type: '' },
		{ startIndex: 26, type: 'keyword.else.coffee' },
		{ startIndex: 30, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'options or= defaults',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'keyword.or.coffee' },
		{ startIndex: 10, type: 'delimiter.coffee' },
		{ startIndex: 11, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Eat lunch.',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'eat food for food in [\'toast\', \'cheese\', \'wine\']',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'keyword.for.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 18, type: 'keyword.in.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'delimiter.square.coffee' },
		{ startIndex: 22, type: 'string.coffee' },
		{ startIndex: 29, type: 'delimiter.coffee' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'string.coffee' },
		{ startIndex: 39, type: 'delimiter.coffee' },
		{ startIndex: 40, type: '' },
		{ startIndex: 41, type: 'string.coffee' },
		{ startIndex: 47, type: 'delimiter.square.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Fine five course dining.',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'courses = [\'greens\', \'caviar\', \'truffles\', \'roast\', \'cake\']',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'delimiter.square.coffee' },
		{ startIndex: 11, type: 'string.coffee' },
		{ startIndex: 19, type: 'delimiter.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'string.coffee' },
		{ startIndex: 29, type: 'delimiter.coffee' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'string.coffee' },
		{ startIndex: 41, type: 'delimiter.coffee' },
		{ startIndex: 42, type: '' },
		{ startIndex: 43, type: 'string.coffee' },
		{ startIndex: 50, type: 'delimiter.coffee' },
		{ startIndex: 51, type: '' },
		{ startIndex: 52, type: 'string.coffee' },
		{ startIndex: 58, type: 'delimiter.square.coffee' }
	]}, {
	line: 'menu i + 1, dish for dish, i in courses',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'number.coffee' },
		{ startIndex: 10, type: 'delimiter.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 17, type: 'keyword.for.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 25, type: 'delimiter.coffee' },
		{ startIndex: 26, type: '' },
		{ startIndex: 29, type: 'keyword.in.coffee' },
		{ startIndex: 31, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Health conscious meal.',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'foods = [\'broccoli\', \'spinach\', \'chocolate\']',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.square.coffee' },
		{ startIndex: 9, type: 'string.coffee' },
		{ startIndex: 19, type: 'delimiter.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'string.coffee' },
		{ startIndex: 30, type: 'delimiter.coffee' },
		{ startIndex: 31, type: '' },
		{ startIndex: 32, type: 'string.coffee' },
		{ startIndex: 43, type: 'delimiter.square.coffee' }
	]}, {
	line: 'eat food for food in foods when food isnt \'chocolate\'',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'keyword.for.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 18, type: 'keyword.in.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 27, type: 'keyword.when.coffee' },
		{ startIndex: 31, type: '' },
		{ startIndex: 37, type: 'keyword.isnt.coffee' },
		{ startIndex: 41, type: '' },
		{ startIndex: 42, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'countdown = (num for num in [10..1])',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'delimiter.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 13, type: '' },
		{ startIndex: 17, type: 'keyword.for.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 25, type: 'keyword.in.coffee' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'delimiter.square.coffee' },
		{ startIndex: 29, type: 'number.coffee' },
		{ startIndex: 31, type: 'delimiter.coffee' },
		{ startIndex: 33, type: 'number.coffee' },
		{ startIndex: 34, type: 'delimiter.square.coffee' },
		{ startIndex: 35, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'yearsOld = max: 10, ida: 9, tim: 11',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'number.coffee' },
		{ startIndex: 18, type: 'delimiter.coffee' },
		{ startIndex: 19, type: '' },
		{ startIndex: 23, type: 'delimiter.coffee' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'number.coffee' },
		{ startIndex: 26, type: 'delimiter.coffee' },
		{ startIndex: 27, type: '' },
		{ startIndex: 31, type: 'delimiter.coffee' },
		{ startIndex: 32, type: '' },
		{ startIndex: 33, type: 'number.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'ages = for child, age of yearsOld',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'keyword.for.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 16, type: 'delimiter.coffee' },
		{ startIndex: 17, type: '' },
		{ startIndex: 22, type: 'keyword.of.coffee' },
		{ startIndex: 24, type: '' }
	]}, {
	line: '  "#{child} is #{age}"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'string.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 10, type: 'string.coffee' },
		{ startIndex: 17, type: '' },
		{ startIndex: 20, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Econ 101',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'if this.studyingEconomics',
	tokens: [
		{ startIndex: 0, type: 'keyword.if.coffee' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'variable.predefined.coffee' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' }
	]}, {
	line: '  buy()  while supply > demand',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 9, type: 'keyword.while.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 22, type: 'delimiter.coffee' },
		{ startIndex: 23, type: '' }
	]}, {
	line: '  sell() until supply > demand',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'keyword.until.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 22, type: 'delimiter.coffee' },
		{ startIndex: 23, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '# Nursery Rhyme',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'num = 6',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'number.coffee' }
	]}, {
	line: 'lyrics = while num -= 1',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'keyword.while.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 19, type: 'delimiter.coffee' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'number.coffee' }
	]}, {
	line: '  "#{num} little monkeys, jumping on the bed.',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'string.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 8, type: 'string.coffee' }
	]}, {
	line: '    One fell out and bumped his head."',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: '	',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '# Everything is an Expression (at least, as much as possible)',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'grade = (student) ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 16, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'delimiter.coffee' }
	]}, {
	line: '  if student.excellentWork',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.if.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 12, type: 'delimiter.coffee' },
		{ startIndex: 13, type: '' }
	]}, {
	line: '    "A+"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'string.coffee' }
	]}, {
	line: '  else if student.okayStuff',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.else.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'keyword.if.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 17, type: 'delimiter.coffee' },
		{ startIndex: 18, type: '' }
	]}, {
	line: '    if student.triedHard then "B" else "B-"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.if.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 14, type: 'delimiter.coffee' },
		{ startIndex: 15, type: '' },
		{ startIndex: 25, type: 'keyword.then.coffee' },
		{ startIndex: 29, type: '' },
		{ startIndex: 30, type: 'string.coffee' },
		{ startIndex: 33, type: '' },
		{ startIndex: 34, type: 'keyword.else.coffee' },
		{ startIndex: 38, type: '' },
		{ startIndex: 39, type: 'string.coffee' }
	]}, {
	line: '  else',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.else.coffee' }
	]}, {
	line: '    "C"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'eldest = if 24 > 21 then "Liz" else "Ike"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'keyword.if.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'number.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'delimiter.coffee' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'number.coffee' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'keyword.then.coffee' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'string.coffee' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'keyword.else.coffee' },
		{ startIndex: 35, type: '' },
		{ startIndex: 36, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '#Classes, Inheritance and Super',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'class Animal',
	tokens: [
		{ startIndex: 0, type: 'keyword.class.coffee' },
		{ startIndex: 5, type: '' }
	]}, {
	line: '  constructor: (@name) ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 13, type: 'delimiter.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 16, type: 'variable.predefined.coffee' },
		{ startIndex: 21, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'delimiter.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '  move: (meters) ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 15, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'delimiter.coffee' }
	]}, {
	line: '    alert @name + " moved #{meters}m."',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'variable.predefined.coffee' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'delimiter.coffee' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'string.coffee' },
		{ startIndex: 28, type: '' },
		{ startIndex: 34, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'class Snake extends Animal',
	tokens: [
		{ startIndex: 0, type: 'keyword.class.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 12, type: 'keyword.extends.coffee' },
		{ startIndex: 19, type: '' }
	]}, {
	line: '  move: ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' }
	]}, {
	line: '    alert "Slithering..."',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'string.coffee' }
	]}, {
	line: '    super 5',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.super.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'number.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'class Horse extends Animal',
	tokens: [
		{ startIndex: 0, type: 'keyword.class.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 12, type: 'keyword.extends.coffee' },
		{ startIndex: 19, type: '' }
	]}, {
	line: '  move: ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'delimiter.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' }
	]}, {
	line: '    alert "Galloping..."',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 10, type: 'string.coffee' }
	]}, {
	line: '    super 45',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.super.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'number.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'sam = new Snake "Sammy the Python"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'keyword.new.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 16, type: 'string.coffee' }
	]}, {
	line: 'tom = new Horse "Tommy the Palomino"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.coffee' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'keyword.new.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 16, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'sam.move()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: 'tom.move()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.coffee' },
		{ startIndex: 4, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '#Function binding',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'Account = (customer, cart) ->',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 19, type: 'delimiter.coffee' },
		{ startIndex: 20, type: '' },
		{ startIndex: 25, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 26, type: '' },
		{ startIndex: 27, type: 'delimiter.coffee' }
	]}, {
	line: '  @customer = customer',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.predefined.coffee' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.coffee' },
		{ startIndex: 13, type: '' }
	]}, {
	line: '  @cart = cart',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'variable.predefined.coffee' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.coffee' },
		{ startIndex: 9, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '  $(\'.shopping_cart\').bind \'click\', (event) =>',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 4, type: 'string.coffee' },
		{ startIndex: 20, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 21, type: 'delimiter.coffee' },
		{ startIndex: 22, type: '' },
		{ startIndex: 27, type: 'string.coffee' },
		{ startIndex: 34, type: 'delimiter.coffee' },
		{ startIndex: 35, type: '' },
		{ startIndex: 36, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 37, type: '' },
		{ startIndex: 42, type: 'delimiter.parenthesis.coffee' },
		{ startIndex: 43, type: '' },
		{ startIndex: 44, type: 'delimiter.coffee' }
	]}, {
	line: '    @customer.purchase @cart',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'variable.predefined.coffee' },
		{ startIndex: 13, type: 'delimiter.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 23, type: 'variable.predefined.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '#Switch/When/Else	',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'switch day',
	tokens: [
		{ startIndex: 0, type: 'keyword.switch.coffee' },
		{ startIndex: 6, type: '' }
	]}, {
	line: '  when "Mon" then go work',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.when.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'string.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'keyword.then.coffee' },
		{ startIndex: 17, type: '' }
	]}, {
	line: '  when "Tue" then go relax',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.when.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'string.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'keyword.then.coffee' },
		{ startIndex: 17, type: '' }
	]}, {
	line: '  when "Thu" then go iceFishing',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.when.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'string.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'keyword.then.coffee' },
		{ startIndex: 17, type: '' }
	]}, {
	line: '  when "Fri", "Sat"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.when.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'string.coffee' },
		{ startIndex: 12, type: 'delimiter.coffee' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'string.coffee' }
	]}, {
	line: '    if day is bingoDay',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.if.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 11, type: 'keyword.is.coffee' },
		{ startIndex: 13, type: '' }
	]}, {
	line: '      go bingo',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '      go dancing',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '  when "Sun" then go church',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.when.coffee' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'string.coffee' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'keyword.then.coffee' },
		{ startIndex: 17, type: '' }
	]}, {
	line: '  else go work',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.else.coffee' },
		{ startIndex: 6, type: '' }
	]}, {
	line: ' ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '#Try/Catch/Finally',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'try',
	tokens: [
		{ startIndex: 0, type: 'keyword.try.coffee' }
	]}, {
	line: '  allHellBreaksLoose()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 20, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '  catsAndDogsLivingTogether()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 27, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: 'catch error',
	tokens: [
		{ startIndex: 0, type: 'keyword.catch.coffee' },
		{ startIndex: 5, type: '' }
	]}, {
	line: '  print error',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: 'finally',
	tokens: [
		{ startIndex: 0, type: 'keyword.finally.coffee' }
	]}, {
	line: '  cleanUp()',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.parenthesis.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '#String Interpolation and Block Comments',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'author = "Wittgenstein"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'string.coffee' }
	]}, {
	line: 'quote  = "A picture is a fact. -- #{ author }"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 7, type: 'delimiter.coffee' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'string.coffee' },
		{ startIndex: 36, type: '' },
		{ startIndex: 44, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'sentence = "#{ 22 / 7 } is a decent approximation of p"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'string.coffee' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'number.coffee' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'delimiter.coffee' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'number.coffee' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'mobyDick = "Call me Ishmael. Some years ago --',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'string.coffee' }
	]}, {
	line: ' never mind how long precisely -- having little',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: ' or no money in my purse, and nothing particular',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: ' to interest me on shore, I thought I would sail',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: ' about a little and see the watery part of the',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: ' world..."',
	tokens: [
		{ startIndex: 0, type: 'string.coffee' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '#Extended Regular Expressions',
	tokens: [
		{ startIndex: 0, type: 'comment.coffee' }
	]}, {
	line: 'OPERATOR = /// ^ (',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 9, type: 'delimiter.coffee' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'regexp.coffee' }
	]}, {
	line: '  ?: [-=]>             # function',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: '   | [-+*/%<>&|^!?=]=  # compound assign / compare',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: '   | >>>=?             # zero-fill right shift',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: '   | ([-+:])\\1         # doubles',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: '   | ([&|<>])\\2=?      # logic / shift',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: '   | \\?\\.              # soak access',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: '   | \\.{2,3}           # range or splat',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' },
		{ startIndex: 23, type: 'comment.coffee' }
	]}, {
	line: ') ///',
	tokens: [
		{ startIndex: 0, type: 'regexp.coffee' }
	]}, {
	line: '',
	tokens: [

	]}]
]);
