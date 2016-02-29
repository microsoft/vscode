/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/r';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('r', language, [
	// Keywords
	[{
	line: 'function(a) { a }',
	tokens: [
		{ startIndex: 0, type: 'keyword.r' },
		{ startIndex: 8, type: 'delimiter.parenthesis.r' },
		{ startIndex: 9, type: 'identifier.r' },
		{ startIndex: 10, type: 'delimiter.parenthesis.r' },
		{ startIndex: 11, type: 'white.r' },
		{ startIndex: 12, type: 'delimiter.curly.r' },
		{ startIndex: 13, type: 'white.r' },
		{ startIndex: 14, type: 'identifier.r' },
		{ startIndex: 15, type: 'white.r' },
		{ startIndex: 16, type: 'delimiter.curly.r' }
	]}],

	[{
	line: 'while(FALSE) { break }',
	tokens: [
		{ startIndex: 0, type: 'keyword.r' },
		{ startIndex: 5, type: 'delimiter.parenthesis.r' },
		{ startIndex: 6, type: 'constant.r' },
		{ startIndex: 11, type: 'delimiter.parenthesis.r' },
		{ startIndex: 12, type: 'white.r' },
		{ startIndex: 13, type: 'delimiter.curly.r' },
		{ startIndex: 14, type: 'white.r' },
		{ startIndex: 15, type: 'keyword.r' },
		{ startIndex: 20, type: 'white.r' },
		{ startIndex: 21, type: 'delimiter.curly.r' }
	]}],

	[{
	line: 'if (a) { b } else { d }',
	tokens: [
		{ startIndex: 0, type: 'keyword.r' },
		{ startIndex: 2, type: 'white.r' },
		{ startIndex: 3, type: 'delimiter.parenthesis.r' },
		{ startIndex: 4, type: 'identifier.r' },
		{ startIndex: 5, type: 'delimiter.parenthesis.r' },
		{ startIndex: 6, type: 'white.r' },
		{ startIndex: 7, type: 'delimiter.curly.r' },
		{ startIndex: 8, type: 'white.r' },
		{ startIndex: 9, type: 'identifier.r' },
		{ startIndex: 10, type: 'white.r' },
		{ startIndex: 11, type: 'delimiter.curly.r' },
		{ startIndex: 12, type: 'white.r' },
		{ startIndex: 13, type: 'keyword.r' },
		{ startIndex: 17, type: 'white.r' },
		{ startIndex: 18, type: 'delimiter.curly.r' },
		{ startIndex: 19, type: 'white.r' },
		{ startIndex: 20, type: 'identifier.r' },
		{ startIndex: 21, type: 'white.r' },
		{ startIndex: 22, type: 'delimiter.curly.r' }
	]}],

	// Identifiers
	[{
	line: 'a',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' }
	]}],

	// Comments
	[{
	line: ' # comment #',
	tokens: [
		{ startIndex: 0, type: 'white.r' },
		{ startIndex: 1, type: 'comment.r' }
	]}],

	// Roxygen comments
	[{
	line: ' #\' @author: me ',
	tokens: [
		{ startIndex: 0, type: 'white.r' },
		{ startIndex: 1, type: 'comment.doc.r' },
		{ startIndex: 4, type: 'tag.r' },
		{ startIndex: 11, type: 'comment.doc.r' }
	]}],

	// Strings
	[{
	line: '"a\\n"',
	tokens: [
		{ startIndex: 0, type: 'string.escape.r' },
		{ startIndex: 1, type: 'string.r' },
		{ startIndex: 4, type: 'string.escape.r' }
	]}],

	// '\\s' is not a special character
	[{
	line: '"a\\s"',
	tokens: [
		{ startIndex: 0, type: 'string.escape.r' },
		{ startIndex: 1, type: 'string.r' },
		{ startIndex: 2, type: 'error-token.r' },
		{ startIndex: 4, type: 'string.escape.r' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '1',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-1',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '1.1',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-1.1',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '.1',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-.1',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '1e10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '1e-10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-1e10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-1e-10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '1E10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '1E-10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-1E10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	[{
	line: '-1E-10',
	tokens: [
		{ startIndex: 0, type: 'number.r' }
	]}],

	// Operators
	[{
	line: 'a & b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a - b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a * b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a + b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a = b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a | b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a ! b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a < b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a > b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a ^ b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a ~ b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a / b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a : b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a %in% b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 6, type: 'white.r' },
		{ startIndex: 7, type: 'identifier.r' }
	]}],

	[{
	line: 'a %->% b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 6, type: 'white.r' },
		{ startIndex: 7, type: 'identifier.r' }
	]}],

	[{
	line: 'a == b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a != b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a %% b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a && b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a || b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a <- b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a <<- b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 5, type: 'white.r' },
		{ startIndex: 6, type: 'identifier.r' }
	]}],

	[{
	line: 'a -> b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a ->> b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 5, type: 'white.r' },
		{ startIndex: 6, type: 'identifier.r' }
	]}],

	[{
	line: 'a $ b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 3, type: 'white.r' },
		{ startIndex: 4, type: 'identifier.r' }
	]}],

	[{
	line: 'a << b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}],

	[{
	line: 'a >> b',
	tokens: [
		{ startIndex: 0, type: 'identifier.r' },
		{ startIndex: 1, type: 'white.r' },
		{ startIndex: 2, type: 'operator.r' },
		{ startIndex: 4, type: 'white.r' },
		{ startIndex: 5, type: 'identifier.r' }
	]}]
]);
