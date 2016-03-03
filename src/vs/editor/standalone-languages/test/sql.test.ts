/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/sql';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('sql', language, [
	// Comments
	[{
	line: '-- a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.sql' }
	]}],

	[{
	line: '---sticky -- comment',
	tokens: [
		{ startIndex: 0, type: 'comment.sql' }
	]}],

	[{
	line: '-almost a comment',
	tokens: [
		{ startIndex: 0, type: 'operator.sql' },
		{ startIndex: 1, type: 'identifier.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'identifier.sql' },
		{ startIndex: 9, type: 'white.sql' },
		{ startIndex: 10, type: 'identifier.sql' }
	]}],

	[{
	line: '/* a full line comment */',
	tokens: [
		{ startIndex: 0, type: 'comment.quote.sql' },
		{ startIndex: 2, type: 'comment.sql' },
		{ startIndex: 23, type: 'comment.quote.sql' }
	]}],

	[{
	line: '/* /// *** /// */',
	tokens: [
		{ startIndex: 0, type: 'comment.quote.sql' },
		{ startIndex: 2, type: 'comment.sql' },
		{ startIndex: 15, type: 'comment.quote.sql' }
	]}],

	[{
	line: 'declare @x int = /* a simple comment */ 1;',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'identifier.sql' },
		{ startIndex: 10, type: 'white.sql' },
		{ startIndex: 11, type: 'keyword.sql' },
		{ startIndex: 14, type: 'white.sql' },
		{ startIndex: 15, type: 'operator.sql' },
		{ startIndex: 16, type: 'white.sql' },
		{ startIndex: 17, type: 'comment.quote.sql' },
		{ startIndex: 19, type: 'comment.sql' },
		{ startIndex: 37, type: 'comment.quote.sql' },
		{ startIndex: 39, type: 'white.sql' },
		{ startIndex: 40, type: 'number.sql' },
		{ startIndex: 41, type: 'delimiter.sql' }
	]}],

	// Not supporting nested comments, as nested comments seem to not be standard?
	// i.e. http://stackoverflow.com/questions/728172/are-there-multiline-comment-delimiters-in-sql-that-are-vendor-agnostic
	[{
	line: '@x=/* a /* nested comment  1*/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' },
		{ startIndex: 2, type: 'operator.sql' },
		{ startIndex: 3, type: 'comment.quote.sql' },
		{ startIndex: 5, type: 'comment.sql' },
		{ startIndex: 28, type: 'comment.quote.sql' },
		{ startIndex: 30, type: 'delimiter.sql' }
	]}],

	[{
	line: '@x=/* another comment */ 1*/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' },
		{ startIndex: 2, type: 'operator.sql' },
		{ startIndex: 3, type: 'comment.quote.sql' },
		{ startIndex: 5, type: 'comment.sql' },
		{ startIndex: 22, type: 'comment.quote.sql' },
		{ startIndex: 24, type: 'white.sql' },
		{ startIndex: 25, type: 'number.sql' },
		{ startIndex: 26, type: 'operator.sql' },
		{ startIndex: 28, type: 'delimiter.sql' }
	]}],

	[{
	line: '@x=/*/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' },
		{ startIndex: 2, type: 'operator.sql' },
		{ startIndex: 3, type: 'comment.quote.sql' },
		{ startIndex: 5, type: 'comment.sql' }
	]}],

	// Numbers
	[{
	line: '123',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '-123',
	tokens: [
		{ startIndex: 0, type: 'operator.sql' },
		{ startIndex: 1, type: 'number.sql' }
	]}],

	[{
	line: '0xaBc123',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0XaBc123',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0x',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0x0',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0xAB_CD',
	tokens: [
		{ startIndex: 0, type: 'number.sql' },
		{ startIndex: 4, type: 'identifier.sql' }
	]}],

	[{
	line: '$',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$-123',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$-+-123',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$123.5678',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$0.99',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$.99',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$99.',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$0.',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '$.0',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '.',
	tokens: [
		{ startIndex: 0, type: 'delimiter.sql' }
	]}],

	[{
	line: '123',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '123.5678',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0.99',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '.99',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '99.',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0.',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '.0',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '1E-2',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '1E+2',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '1E2',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '0.1E2',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '1.E2',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	[{
	line: '.1E2',
	tokens: [
		{ startIndex: 0, type: 'number.sql' }
	]}],

	// Identifiers
	[{
	line: '_abc$01',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '#abc$01',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '##abc$01',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '@abc$01',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '@@abc$01',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '$abc',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '$action',
	tokens: [
		{ startIndex: 0, type: 'predefined.sql' }
	]}],

	[{
	line: '$nonexistent',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: '@@DBTS',
	tokens: [
		{ startIndex: 0, type: 'predefined.sql' }
	]}],

	[{
	line: '@@nonexistent',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' }
	]}],

	[{
	line: 'declare [abc 321];',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'identifier.quote.sql' },
		{ startIndex: 9, type: 'identifier.sql' },
		{ startIndex: 16, type: 'identifier.quote.sql' },
		{ startIndex: 17, type: 'delimiter.sql' }
	]}],

	[{
	line: '[abc[[ 321 ]] xyz]',
	tokens: [
		{ startIndex: 0, type: 'identifier.quote.sql' },
		{ startIndex: 1, type: 'identifier.sql' },
		{ startIndex: 17, type: 'identifier.quote.sql' }
	]}],

	[{
	line: '[abc',
	tokens: [
		{ startIndex: 0, type: 'identifier.quote.sql' },
		{ startIndex: 1, type: 'identifier.sql' }
	]}],

	[{
	line: 'declare "abc 321";',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'identifier.quote.sql' },
		{ startIndex: 9, type: 'identifier.sql' },
		{ startIndex: 16, type: 'identifier.quote.sql' },
		{ startIndex: 17, type: 'delimiter.sql' }
	]}],

	[{
	line: '"abc"" 321 "" xyz"',
	tokens: [
		{ startIndex: 0, type: 'identifier.quote.sql' },
		{ startIndex: 1, type: 'identifier.sql' },
		{ startIndex: 17, type: 'identifier.quote.sql' }
	]}],

	[{
	line: '"abc',
	tokens: [
		{ startIndex: 0, type: 'identifier.quote.sql' },
		{ startIndex: 1, type: 'identifier.sql' }
	]}],

	[{
	line: 'int',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' }
	]}],

	[{
	line: '[int]',
	tokens: [
		{ startIndex: 0, type: 'identifier.quote.sql' },
		{ startIndex: 1, type: 'identifier.sql' },
		{ startIndex: 4, type: 'identifier.quote.sql' }
	]}],

	// Strings
	[{
	line: 'declare @x=\'a string\';',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'identifier.sql' },
		{ startIndex: 10, type: 'operator.sql' },
		{ startIndex: 11, type: 'string.quote.sql' },
		{ startIndex: 12, type: 'string.sql' },
		{ startIndex: 20, type: 'string.quote.sql' },
		{ startIndex: 21, type: 'delimiter.sql' }
	]}],

	[{
	line: '\'a \'\' string with quotes\'',
	tokens: [
		{ startIndex: 0, type: 'string.quote.sql' },
		{ startIndex: 1, type: 'string.sql' },
		{ startIndex: 24, type: 'string.quote.sql' }
	]}],

	[{
	line: '\'a " string with quotes\'',
	tokens: [
		{ startIndex: 0, type: 'string.quote.sql' },
		{ startIndex: 1, type: 'string.sql' },
		{ startIndex: 23, type: 'string.quote.sql' }
	]}],

	[{
	line: '\'a -- string with comment\'',
	tokens: [
		{ startIndex: 0, type: 'string.quote.sql' },
		{ startIndex: 1, type: 'string.sql' },
		{ startIndex: 25, type: 'string.quote.sql' }
	]}],

	[{
	line: 'N\'a unicode string\'',
	tokens: [
		{ startIndex: 0, type: 'string.quote.sql' },
		{ startIndex: 2, type: 'string.sql' },
		{ startIndex: 18, type: 'string.quote.sql' }
	]}],

	[{
	line: '\'a endless string',
	tokens: [
		{ startIndex: 0, type: 'string.quote.sql' },
		{ startIndex: 1, type: 'string.sql' }
	]}],

	// Operators
	[{
	line: 'SET @x=@x+1',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 3, type: 'white.sql' },
		{ startIndex: 4, type: 'identifier.sql' },
		{ startIndex: 6, type: 'operator.sql' },
		{ startIndex: 7, type: 'identifier.sql' },
		{ startIndex: 9, type: 'operator.sql' },
		{ startIndex: 10, type: 'number.sql' }
	]}],

	[{
	line: '@x^=@x',
	tokens: [
		{ startIndex: 0, type: 'identifier.sql' },
		{ startIndex: 2, type: 'operator.sql' },
		{ startIndex: 4, type: 'identifier.sql' }
	]}],

	[{
	line: 'WHERE x IS NOT NULL',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 5, type: 'white.sql' },
		{ startIndex: 6, type: 'identifier.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'operator.sql' },
		{ startIndex: 10, type: 'white.sql' },
		{ startIndex: 11, type: 'operator.sql' },
		{ startIndex: 14, type: 'white.sql' },
		{ startIndex: 15, type: 'operator.sql' }
	]}],

	[{
	line: 'SELECT * FROM dbo.MyTable WHERE MyColumn IN (1,2)',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 6, type: 'white.sql' },
		{ startIndex: 7, type: 'operator.sql' },
		{ startIndex: 8, type: 'white.sql' },
		{ startIndex: 9, type: 'keyword.sql' },
		{ startIndex: 13, type: 'white.sql' },
		{ startIndex: 14, type: 'identifier.sql' },
		{ startIndex: 17, type: 'delimiter.sql' },
		{ startIndex: 18, type: 'identifier.sql' },
		{ startIndex: 25, type: 'white.sql' },
		{ startIndex: 26, type: 'keyword.sql' },
		{ startIndex: 31, type: 'white.sql' },
		{ startIndex: 32, type: 'identifier.sql' },
		{ startIndex: 40, type: 'white.sql' },
		{ startIndex: 41, type: 'operator.sql' },
		{ startIndex: 43, type: 'white.sql' },
		{ startIndex: 44, type: 'delimiter.parenthesis.sql' },
		{ startIndex: 45, type: 'number.sql' },
		{ startIndex: 46, type: 'delimiter.sql' },
		{ startIndex: 47, type: 'number.sql' },
		{ startIndex: 48, type: 'delimiter.parenthesis.sql' }
	]}],

	// Scopes
	[{
	line: 'WHILE() BEGIN END',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 5, type: 'delimiter.parenthesis.sql' },
		{ startIndex: 7, type: 'white.sql' },
		{ startIndex: 8, type: 'keyword.block.sql' },
		{ startIndex: 13, type: 'white.sql' },
		{ startIndex: 14, type: 'keyword.block.sql' }
	]}],

	[{
	line: 'BEGIN TRAN BEGIN TRY SELECT $ COMMIT END TRY BEGIN CATCH ROLLBACK END CATCH',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 10, type: 'white.sql' },
		{ startIndex: 11, type: 'keyword.try.sql' },
		{ startIndex: 20, type: 'white.sql' },
		{ startIndex: 21, type: 'keyword.sql' },
		{ startIndex: 27, type: 'white.sql' },
		{ startIndex: 28, type: 'number.sql' },
		{ startIndex: 29, type: 'white.sql' },
		{ startIndex: 30, type: 'keyword.sql' },
		{ startIndex: 36, type: 'white.sql' },
		{ startIndex: 37, type: 'keyword.try.sql' },
		{ startIndex: 44, type: 'white.sql' },
		{ startIndex: 45, type: 'keyword.catch.sql' },
		{ startIndex: 56, type: 'white.sql' },
		{ startIndex: 57, type: 'keyword.sql' },
		{ startIndex: 65, type: 'white.sql' },
		{ startIndex: 66, type: 'keyword.catch.sql' }
	]}],

	[{
	line: 'SELECT CASE $ WHEN 3 THEN 4 ELSE 5 END',
	tokens: [
		{ startIndex: 0, type: 'keyword.sql' },
		{ startIndex: 6, type: 'white.sql' },
		{ startIndex: 7, type: 'keyword.block.sql' },
		{ startIndex: 11, type: 'white.sql' },
		{ startIndex: 12, type: 'number.sql' },
		{ startIndex: 13, type: 'white.sql' },
		{ startIndex: 14, type: 'keyword.choice.sql' },
		{ startIndex: 18, type: 'white.sql' },
		{ startIndex: 19, type: 'number.sql' },
		{ startIndex: 20, type: 'white.sql' },
		{ startIndex: 21, type: 'keyword.choice.sql' },
		{ startIndex: 25, type: 'white.sql' },
		{ startIndex: 26, type: 'number.sql' },
		{ startIndex: 27, type: 'white.sql' },
		{ startIndex: 28, type: 'keyword.sql' },
		{ startIndex: 32, type: 'white.sql' },
		{ startIndex: 33, type: 'number.sql' },
		{ startIndex: 34, type: 'white.sql' },
		{ startIndex: 35, type: 'keyword.block.sql' }
	]}]
]);
