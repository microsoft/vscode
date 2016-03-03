/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/ruby';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('ruby', language, [
	// Keywords
	[{
	line: 'class Klass def init() end',
	tokens: [
		{ startIndex: 0, type: 'keyword.class.ruby' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'constructor.identifier.ruby' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'keyword.def.ruby' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'identifier.ruby' },
		{ startIndex: 20, type: 'delimiter.parenthesis.ruby' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'keyword.def.ruby' }
	]}],

	// Single digit
	[{
	line: 'x == 1 ',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'operator.ruby' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'number.ruby' },
		{ startIndex: 6, type: '' }
	]}],

	// Regex
	[{
	line: 'text =~ /Ruby/',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'operator.ruby' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'regexp.delim.ruby' },
		{ startIndex: 9, type: 'regexp.ruby' },
		{ startIndex: 13, type: 'regexp.delim.ruby' }
	]}],

	[{
	line: 'text.sub!(/Rbuy/, "Ruby")',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.ruby' },
		{ startIndex: 9, type: 'delimiter.parenthesis.ruby' },
		{ startIndex: 10, type: 'regexp.delim.ruby' },
		{ startIndex: 11, type: 'regexp.ruby' },
		{ startIndex: 15, type: 'regexp.delim.ruby' },
		{ startIndex: 16, type: 'delimiter.ruby' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'string.d.delim.ruby' },
		{ startIndex: 19, type: 'string.$S2.ruby' },
		{ startIndex: 23, type: 'string.d.delim.ruby' },
		{ startIndex: 24, type: 'delimiter.parenthesis.ruby' }
	]}],

	// make sure that division does not match regex
	[{
	line: 'a / b',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'operator.ruby' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.ruby' }
	]}],

	// Heredoc
	[{
	line: '<<HERE',
	tokens: [
		{ startIndex: 0, type: 'string.heredoc.delimiter.ruby' }
	]}, {
	line: 'do some string',
	tokens: [
		{ startIndex: 0, type: 'string.heredoc.ruby' }
	]}, {
	line: 'HERE',
	tokens: [
		{ startIndex: 0, type: 'string.heredoc.delimiter.ruby' }
	]}],

	[{
	line: 'x <<HERE',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 1, type: 'string.heredoc.delimiter.ruby' }
	]}, {
	line: 'do some string',
	tokens: [
		{ startIndex: 0, type: 'string.heredoc.ruby' }
	]}, {
	line: 'HERE',
	tokens: [
		{ startIndex: 0, type: 'string.heredoc.delimiter.ruby' }
	]}],

	[{
	line: 'x<<HERE',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 1, type: 'operator.ruby' },
		{ startIndex: 3, type: 'constructor.identifier.ruby' }
	]}],

	[{
	line: 'x<<-HERE',
	tokens: [
		{ startIndex: 0, type: 'identifier.ruby' },
		{ startIndex: 1, type: 'string.heredoc.delimiter.ruby' }
	]}]
]);
