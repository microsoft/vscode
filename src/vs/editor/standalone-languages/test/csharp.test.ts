/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/csharp';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('csharp', language, [

	// Generated from sample
	[{
	line: 'using System;',
	tokens: [
		{ startIndex: 0, type: 'keyword.using.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'namespace.cs' },
		{ startIndex: 12, type: 'delimiter.cs' }
	]}, {
	line: 'using System.Collections.Generic;',
	tokens: [
		{ startIndex: 0, type: 'keyword.using.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'namespace.cs' },
		{ startIndex: 12, type: 'delimiter.cs' },
		{ startIndex: 13, type: 'namespace.cs' },
		{ startIndex: 24, type: 'delimiter.cs' },
		{ startIndex: 25, type: 'namespace.cs' },
		{ startIndex: 32, type: 'delimiter.cs' }
	]}, {
	line: 'using System.Diagnostics;',
	tokens: [
		{ startIndex: 0, type: 'keyword.using.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'namespace.cs' },
		{ startIndex: 12, type: 'delimiter.cs' },
		{ startIndex: 13, type: 'namespace.cs' },
		{ startIndex: 24, type: 'delimiter.cs' }
	]}, {
	line: 'using System.Linq;',
	tokens: [
		{ startIndex: 0, type: 'keyword.using.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'namespace.cs' },
		{ startIndex: 12, type: 'delimiter.cs' },
		{ startIndex: 13, type: 'namespace.cs' },
		{ startIndex: 17, type: 'delimiter.cs' }
	]}, {
	line: 'using System.Text;',
	tokens: [
		{ startIndex: 0, type: 'keyword.using.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'namespace.cs' },
		{ startIndex: 12, type: 'delimiter.cs' },
		{ startIndex: 13, type: 'namespace.cs' },
		{ startIndex: 17, type: 'delimiter.cs' }
	]}, {
	line: 'using System.Threading.Tasks;',
	tokens: [
		{ startIndex: 0, type: 'keyword.using.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'namespace.cs' },
		{ startIndex: 12, type: 'delimiter.cs' },
		{ startIndex: 13, type: 'namespace.cs' },
		{ startIndex: 22, type: 'delimiter.cs' },
		{ startIndex: 23, type: 'namespace.cs' },
		{ startIndex: 28, type: 'delimiter.cs' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: 'namespace VS',
	tokens: [
		{ startIndex: 0, type: 'keyword.namespace.cs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'namespace.cs' }
	]}, {
	line: '{',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.cs' }
	]}, {
	line: '	class Program',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'keyword.class.cs' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.cs' }
	]}, {
	line: '	{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.cs' }
	]}, {
	line: '		static void Main(string[] args)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.static.cs' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'keyword.void.cs' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'identifier.cs' },
		{ startIndex: 18, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 19, type: 'keyword.string.cs' },
		{ startIndex: 25, type: 'delimiter.square.cs' },
		{ startIndex: 27, type: '' },
		{ startIndex: 28, type: 'identifier.cs' },
		{ startIndex: 32, type: 'delimiter.parenthesis.cs' }
	]}, {
	line: '		{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.curly.cs' }
	]}, {
	line: '			ProcessStartInfo si = new ProcessStartInfo();',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'identifier.cs' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'identifier.cs' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'delimiter.cs' },
		{ startIndex: 24, type: '' },
		{ startIndex: 25, type: 'keyword.new.cs' },
		{ startIndex: 28, type: '' },
		{ startIndex: 29, type: 'identifier.cs' },
		{ startIndex: 45, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 47, type: 'delimiter.cs' }
	]}, {
	line: '			float load= 3.2e02f;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.float.cs' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'identifier.cs' },
		{ startIndex: 13, type: 'delimiter.cs' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'number.float.cs' },
		{ startIndex: 22, type: 'delimiter.cs' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '			si.FileName = @"tools\\\\node.exe";',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'identifier.cs' },
		{ startIndex: 5, type: 'delimiter.cs' },
		{ startIndex: 6, type: 'identifier.cs' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'delimiter.cs' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'string.quote.cs' },
		{ startIndex: 19, type: 'string.cs' },
		{ startIndex: 34, type: 'string.quote.cs' },
		{ startIndex: 35, type: 'delimiter.cs' }
	]}, {
	line: '			si.Arguments = "tools\\\\simpl3server.js";',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'identifier.cs' },
		{ startIndex: 5, type: 'delimiter.cs' },
		{ startIndex: 6, type: 'identifier.cs' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'delimiter.cs' },
		{ startIndex: 17, type: '' },
		{ startIndex: 18, type: 'string.quote.cs' },
		{ startIndex: 19, type: 'string.cs' },
		{ startIndex: 24, type: 'string.escape.cs' },
		{ startIndex: 26, type: 'string.cs' },
		{ startIndex: 41, type: 'string.quote.cs' },
		{ startIndex: 42, type: 'delimiter.cs' }
	]}, {
	line: '			',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '			string someString = $"hello{outside+variable}the string again {{ escaped";',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.string.cs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.cs' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'delimiter.cs' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'string.quote.cs' },
		{ startIndex: 25, type: 'string.cs' },
		{ startIndex: 30, type: 'string.quote.cs' },
		{ startIndex: 31, type: 'identifier.cs' },
		{ startIndex: 38, type: 'delimiter.cs' },
		{ startIndex: 39, type: 'identifier.cs' },
		{ startIndex: 47, type: 'string.quote.cs' },
		{ startIndex: 48, type: 'string.cs' },
		{ startIndex: 65, type: 'string.escape.cs' },
		{ startIndex: 67, type: 'string.cs' },
		{ startIndex: 75, type: 'string.quote.cs' },
		{ startIndex: 76, type: 'delimiter.cs' }
	]}, {
	line: '			var @string = 5;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.var.cs' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.cs' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'delimiter.cs' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'number.cs' },
		{ startIndex: 18, type: 'delimiter.cs' }
	]}, {
	line: '			',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '			if (x == 4)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.if.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 7, type: 'identifier.cs' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.cs' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'number.cs' },
		{ startIndex: 13, type: 'delimiter.parenthesis.cs' }
	]}, {
	line: '			{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.curly.cs' }
	]}, {
	line: '				for (int i = 4; i<10; i++)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.for.cs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 9, type: 'keyword.int.cs' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'identifier.cs' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'delimiter.cs' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'number.cs' },
		{ startIndex: 18, type: 'delimiter.cs' },
		{ startIndex: 19, type: '' },
		{ startIndex: 20, type: 'identifier.cs' },
		{ startIndex: 21, type: 'delimiter.angle.cs' },
		{ startIndex: 22, type: 'number.cs' },
		{ startIndex: 24, type: 'delimiter.cs' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'identifier.cs' },
		{ startIndex: 27, type: 'delimiter.cs' },
		{ startIndex: 29, type: 'delimiter.parenthesis.cs' }
	]}, {
	line: '				{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.curly.cs' }
	]}, {
	line: '					var d = i;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 5, type: 'keyword.var.cs' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'identifier.cs' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'delimiter.cs' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'identifier.cs' },
		{ startIndex: 14, type: 'delimiter.cs' }
	]}, {
	line: '				}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'delimiter.curly.cs' }
	]}, {
	line: '			}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.curly.cs' }
	]}, {
	line: '			else',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.else.cs' }
	]}, {
	line: '			{',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.curly.cs' }
	]}, {
	line: '				return;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.return.cs' },
		{ startIndex: 10, type: 'delimiter.cs' }
	]}, {
	line: '			}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'delimiter.curly.cs' }
	]}, {
	line: '			',
	tokens: [
		{ startIndex: 0, type: '' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '			Process.Start(si);',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'identifier.cs' },
		{ startIndex: 10, type: 'delimiter.cs' },
		{ startIndex: 11, type: 'identifier.cs' },
		{ startIndex: 16, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 17, type: 'identifier.cs' },
		{ startIndex: 19, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 20, type: 'delimiter.cs' }
	]}, {
	line: '		}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.curly.cs' }
	]}, {
	line: '	}',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.curly.cs' }
	]}, {
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.cs' }
	]}, {
	line: '',
	tokens: [

	]}, {
	line: '#pragma region /MapLayer/*Image* /// ',
	tokens: [
		{ startIndex: 0, type: 'namespace.cpp.cs' }
	]}, {
	line: 'namespace ShouldNotBeAComment {}',
	tokens: [
		{ startIndex: 0, type: 'keyword.namespace.cs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'namespace.cs' },
		{ startIndex: 29, type: '' },
		{ startIndex: 30, type: 'delimiter.curly.cs' }
	]}, {
	line: '#pragma endregion Region_1',
	tokens: [
		{ startIndex: 0, type: 'namespace.cpp.cs' }
	]}],

	// Keywords
	[{
	line: 'namespace VS { class Program { static void Main(string[] args) {} } }',
	tokens: [
		{ startIndex: 0, type: 'keyword.namespace.cs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'namespace.cs' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'delimiter.curly.cs' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'keyword.class.cs' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'identifier.cs' },
		{ startIndex: 28, type: '' },
		{ startIndex: 29, type: 'delimiter.curly.cs' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'keyword.static.cs' },
		{ startIndex: 37, type: '' },
		{ startIndex: 38, type: 'keyword.void.cs' },
		{ startIndex: 42, type: '' },
		{ startIndex: 43, type: 'identifier.cs' },
		{ startIndex: 47, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 48, type: 'keyword.string.cs' },
		{ startIndex: 54, type: 'delimiter.square.cs' },
		{ startIndex: 56, type: '' },
		{ startIndex: 57, type: 'identifier.cs' },
		{ startIndex: 61, type: 'delimiter.parenthesis.cs' },
		{ startIndex: 62, type: '' },
		{ startIndex: 63, type: 'delimiter.curly.cs' },
		{ startIndex: 65, type: '' },
		{ startIndex: 66, type: 'delimiter.curly.cs' },
		{ startIndex: 67, type: '' },
		{ startIndex: 68, type: 'delimiter.curly.cs' }
	]}],

	// Comments - single line
	[{
	line: '//',
	tokens: [
		{ startIndex: 0, type: 'comment.cs' }
	]}],

	[{
	line: '    // a comment',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.cs' }
	]}],

	[{
	line: '// a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.cs' }
	]}],

	[{
	line: '//sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.cs' }
	]}],

	[{
	line: '/almost a comment',
	tokens: [
		{ startIndex: 0, type: 'delimiter.cs' },
		{ startIndex: 1, type: 'identifier.cs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.cs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.cs' }
	]}],

	[{
	line: '1 / 2; /* comment',
	tokens: [
		{ startIndex: 0, type: 'number.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.cs' },
		{ startIndex: 5, type: 'delimiter.cs' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'comment.cs' }
	]}],

	[{
	line: 'var x = 1; // my comment // is a nice one',
	tokens: [
		{ startIndex: 0, type: 'keyword.var.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.cs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.cs' },
		{ startIndex: 9, type: 'delimiter.cs' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'comment.cs' }
	]}],

	// Comments - range comment, single line
	[{
	line: '/* a simple comment */',
	tokens: [
		{ startIndex: 0, type: 'comment.cs' }
	]}],

	[{
	line: 'var x = /* a simple comment */ 1;',
	tokens: [
		{ startIndex: 0, type: 'keyword.var.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.cs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.cs' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'number.cs' },
		{ startIndex: 32, type: 'delimiter.cs' }
	]}],

	[{
	line: 'var x = /* comment */ 1; */',
	tokens: [
		{ startIndex: 0, type: 'keyword.var.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.cs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.cs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.cs' },
		{ startIndex: 21, type: '' },
		{ startIndex: 22, type: 'number.cs' },
		{ startIndex: 23, type: 'delimiter.cs' },
		{ startIndex: 24, type: '' }
	]}],

	[{
	line: 'x = /**/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.cs' },
		{ startIndex: 8, type: 'delimiter.cs' }
	]}],

	[{
	line: 'x = /*/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.cs' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.cs' }
	]}],

	[{
	line: '0x',
	tokens: [
		{ startIndex: 0, type: 'number.cs' },
		{ startIndex: 1, type: 'identifier.cs' }
	]}],

	[{
	line: '0x123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.cs' }
	]}],

	[{
	line: '23.5',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '23.5e3',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '23.5E3',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '23.5F',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '23.5f',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72E3F',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72E3f',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72e3F',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72e3f',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '23.5D',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '23.5d',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72E3D',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72E3d',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72e3D',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '1.72e3d',
	tokens: [
		{ startIndex: 0, type: 'number.float.cs' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.cs' },
		{ startIndex: 1, type: 'delimiter.cs' },
		{ startIndex: 2, type: 'number.cs' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.cs' },
		{ startIndex: 3, type: 'delimiter.cs' },
		{ startIndex: 4, type: 'number.cs' }
	]}],

	[{
	line: '0 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.cs' }
	]}],

	// Strings
	[{
	line: 'x = "string";',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.quote.cs' },
		{ startIndex: 5, type: 'string.cs' },
		{ startIndex: 11, type: 'string.quote.cs' },
		{ startIndex: 12, type: 'delimiter.cs' }
	]}],

	[{
	line: 'x = "stri\\"ng";',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.quote.cs' },
		{ startIndex: 5, type: 'string.cs' },
		{ startIndex: 9, type: 'string.escape.cs' },
		{ startIndex: 11, type: 'string.cs' },
		{ startIndex: 13, type: 'string.quote.cs' },
		{ startIndex: 14, type: 'delimiter.cs' }
	]}],

	// Verbatim Strings
	[{
	line: 'x = @"verbatimstring";',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.quote.cs' },
		{ startIndex: 6, type: 'string.cs' },
		{ startIndex: 20, type: 'string.quote.cs' },
		{ startIndex: 21, type: 'delimiter.cs' }
	]}],

	[{
	line: 'x = @"verbatim""string";',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.quote.cs' },
		{ startIndex: 6, type: 'string.cs' },
		{ startIndex: 14, type: 'string.escape.cs' },
		{ startIndex: 16, type: 'string.cs' },
		{ startIndex: 22, type: 'string.quote.cs' },
		{ startIndex: 23, type: 'delimiter.cs' }
	]}],

	[{
	line: 'x = @"verbatim\\string\\";',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.quote.cs' },
		{ startIndex: 6, type: 'string.cs' },
		{ startIndex: 22, type: 'string.quote.cs' },
		{ startIndex: 23, type: 'delimiter.cs' }
	]}],

	[{
	line: 'x = @"verbatim\nstring";',
	tokens: [
		{ startIndex: 0, type: 'identifier.cs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.cs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'string.quote.cs' },
		{ startIndex: 6, type: 'string.cs' },
		{ startIndex: 21, type: 'string.quote.cs' },
		{ startIndex: 22, type: 'delimiter.cs' }
	]}]
]);
