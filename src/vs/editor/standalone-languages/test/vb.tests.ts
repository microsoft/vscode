/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';
import {language} from 'vs/editor/standalone-languages/vb';

testTokenization('vb', language, [

	// Comments - single line
	[{
	line: '\'',
	tokens: [
		{ startIndex: 0, type: 'comment.vb' }
	]}],

	[{
	line: '    \' a comment',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.vb' }
	]}],

	[{
	line: '\' a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.vb' }
	]}],

	[{
	line: '\'sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.vb' }
	]}],

	[{
	line: '1 \' 2; \' comment',
	tokens: [
		{ startIndex: 0, type: 'number.vb' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'comment.vb' }
	]}],

	[{
	line: 'Dim x = 1; \' my comment \'\' is a nice one',
	tokens: [
		{ startIndex: 0, type: 'keyword.dim.vb' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.vb' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.vb' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.vb' },
		{ startIndex: 9, type: 'delimiter.vb' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'comment.vb' }
	]}],

	[{
	line: 'REM this is a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.vb' }
	]}],

	[{
	line: '2 + 5 REM comment starts',
	tokens: [
		{ startIndex: 0, type: 'number.vb' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.vb' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.vb' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'comment.vb' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.vb' }
	]}],

	[{
	line: '0.0',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '&h123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.vb' }
	]}],

	[{
	line: '23.5',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '23.5e3',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '23.5E3',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '23.5r',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '23.5f',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72E3r',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72E3r',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72e3f',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72e3r',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '23.5R',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '23.5r',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72E3#',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72E3F',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72e3!',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72e3f',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '1.72e-3',
	tokens: [
		{ startIndex: 0, type: 'number.float.vb' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.vb' },
		{ startIndex: 1, type: 'delimiter.vb' },
		{ startIndex: 2, type: 'number.vb' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.vb' },
		{ startIndex: 3, type: 'delimiter.vb' },
		{ startIndex: 4, type: 'number.vb' }
	]}],

	[{
	line: '0 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.vb' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.vb' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.vb' }
	]}],

	// Keywords
	[{
	line: 'Imports Microsoft.VisualBasic',
	tokens: [
		{ startIndex: 0, type: 'keyword.imports.vb' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.vb' },
		{ startIndex: 17, type: 'delimiter.vb' },
		{ startIndex: 18, type: 'identifier.vb' }
	]}],

	[{
	line: 'Private Sub Foo(ByVal sender As String)',
	tokens: [
		{ startIndex: 0, type: 'keyword.private.vb' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'keyword.tag-sub.vb' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'identifier.vb' },
		{ startIndex: 15, type: 'delimiter.parenthesis.vb' },
		{ startIndex: 16, type: 'keyword.byval.vb' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'identifier.vb' },
		{ startIndex: 28, type: '' },
		{ startIndex: 29, type: 'keyword.as.vb' },
		{ startIndex: 31, type: '' },
		{ startIndex: 32, type: 'keyword.string.vb' },
		{ startIndex: 38, type: 'delimiter.parenthesis.vb' }
	]}],

	// Strings
	[{
	line: 'String s = "string"',
	tokens: [
		{ startIndex: 0, type: 'keyword.string.vb' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.vb' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.vb' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'string.vb' }
	]}],

	[{
	line: '"use strict";',
	tokens: [
		{ startIndex: 0, type: 'string.vb' },
		{ startIndex: 12, type: 'delimiter.vb' }
	]}],

	// Tags
	[{
	line: 'Public Sub ToString()',
	tokens: [
		{ startIndex: 0, type: 'keyword.public.vb' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'keyword.tag-sub.vb' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'identifier.vb' },
		{ startIndex: 19, type: 'delimiter.parenthesis.vb' },
		{ startIndex: 20, type: 'delimiter.parenthesis.vb' }
	]}],

	[{
	line: 'public sub ToString()',
	tokens: [
		{ startIndex: 0, type: 'keyword.public.vb' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'keyword.tag-sub.vb' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'identifier.vb' },
		{ startIndex: 19, type: 'delimiter.parenthesis.vb' },
		{ startIndex: 20, type: 'delimiter.parenthesis.vb' }
	]}],

	[{
	line: 'While Do Continue While End While',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-while.vb' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'keyword.tag-do.vb' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'keyword.tag-continue.vb' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'keyword.tag-while.vb' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'keyword.tag-while.vb' }
	]}],

	[{
	line: 'While while WHILE WHile whiLe',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-while.vb' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'keyword.tag-while.vb' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'keyword.tag-while.vb' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'keyword.tag-while.vb' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'keyword.tag-while.vb' }
	]}],

	[{
	line: 'If b(i) = col Then',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-if.vb' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'identifier.vb' },
		{ startIndex: 4, type: 'delimiter.parenthesis.vb' },
		{ startIndex: 5, type: 'identifier.vb' },
		{ startIndex: 6, type: 'delimiter.parenthesis.vb' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.vb' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.vb' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'keyword.then.vb' }
	]}],

	[{
	line: 'Do stuff While True Loop',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-do.vb' },
		{ startIndex: 2, type: '' },
		{ startIndex: 3, type: 'identifier.vb' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'keyword.tag-while.vb' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'keyword.true.vb' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'keyword.tag-do.vb' }
	]}],

	[{
	line: 'For i = 0 To 10 DoStuff Next',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-for.vb' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.vb' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.vb' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.vb' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'keyword.to.vb' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'number.vb' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'identifier.vb' },
		{ startIndex: 23, type: '' },
		{ startIndex: 24, type: 'keyword.tag-for.vb' }
	]}],

	[{
	line: 'For stuff End For',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-for.vb' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.vb' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'keyword.end.vb' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'keyword.tag-for.vb' }
	]}],

	[{
	line: 'For stuff end for',
	tokens: [
		{ startIndex: 0, type: 'keyword.tag-for.vb' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.vb' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'keyword.end.vb' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'keyword.tag-for.vb' }
	]}]
]);
