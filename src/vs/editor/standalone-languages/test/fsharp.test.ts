/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/fsharp';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('fsharp', language, [
	// comments - single line
	[{
	line: '// one line comment',
	tokens: [
		{ startIndex: 0, type: 'comment.fs' }
	]}],

	[{
	line: '//',
	tokens: [
		{ startIndex: 0, type: 'comment.fs' }
	]}],

	[{
	line: '    // a comment',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'comment.fs' }
	]}],

	[{
	line: '// a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.fs' }
	]}],

	[{
	line: '//sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.fs' }
	]}],

	[{
	line: '/almost a comment',
	tokens: [
		{ startIndex: 0, type: 'delimiter.fs' },
		{ startIndex: 1, type: 'identifier.fs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.fs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.fs' }
	]}],

	[{
	line: '(/*almost a comment',
	tokens: [
		{ startIndex: 0, type: 'delimiter.parenthesis.fs' },
		{ startIndex: 1, type: 'delimiter.fs' },
		{ startIndex: 3, type: 'identifier.fs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.fs' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'identifier.fs' }
	]}],

	[{
	line: '1 / 2; (* comment',
	tokens: [
		{ startIndex: 0, type: 'number.fs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.fs' },
		{ startIndex: 5, type: 'delimiter.fs' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'comment.fs' }
	]}],

	[{
	line: 'let x = 1; // my comment // is a nice one',
	tokens: [
		{ startIndex: 0, type: 'keyword.let.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.fs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.fs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'number.fs' },
		{ startIndex: 9, type: 'delimiter.fs' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'comment.fs' }
	]}],

	// Keywords
	[{
	line: 'namespace Application1',
	tokens: [
		{ startIndex: 0, type: 'keyword.namespace.fs' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'identifier.fs' }
	]}],

	[{
	line: 'type MyType',
	tokens: [
		{ startIndex: 0, type: 'keyword.type.fs' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.fs' }
	]}],

	[{
	line: 'module App =',
	tokens: [
		{ startIndex: 0, type: 'keyword.module.fs' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.fs' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'delimiter.fs' }
	]}],

	[{
	line: 'let AppName = "App1"',
	tokens: [
		{ startIndex: 0, type: 'keyword.let.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.fs' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.fs' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'string.fs' }
	]}],

	// Comments - range comment
	[{
	line: '(* a simple comment *)',
	tokens: [
		{ startIndex: 0, type: 'comment.fs' }
	]}],

	[{
	line: 'let x = (* a simple comment *) 1',
	tokens: [
		{ startIndex: 0, type: 'keyword.let.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'identifier.fs' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'delimiter.fs' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'comment.fs' },
		{ startIndex: 30, type: '' },
		{ startIndex: 31, type: 'number.fs' }
	]}],

	[{
	line: 'x = (**)',
	tokens: [
		{ startIndex: 0, type: 'identifier.fs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.fs' }
	]}],

	[{
	line: 'x = (*)',
	tokens: [
		{ startIndex: 0, type: 'identifier.fs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'comment.fs' }
	]}],

	// Numbers
	[{
	line: '0',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '0x123',
	tokens: [
		{ startIndex: 0, type: 'number.hex.fs' }
	]}],

	[{
	line: '23.5',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '23.5e3',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '23.5E3',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '23.5F',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '23.5f',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72E3F',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72E3f',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72e3F',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72e3f',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '23.5M',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '23.5m',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72E3M',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72E3m',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72e3M',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '1.72e3m',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.fs' },
		{ startIndex: 1, type: 'delimiter.fs' },
		{ startIndex: 2, type: 'number.fs' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.fs' },
		{ startIndex: 3, type: 'delimiter.fs' },
		{ startIndex: 4, type: 'number.fs' }
	]}],

	[{
	line: '0 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.fs' },
		{ startIndex: 1, type: '' },
		{ startIndex: 2, type: 'delimiter.fs' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'number.fs' }
	]}],

	[{
	line: '0b00000101',
	tokens: [
		{ startIndex: 0, type: 'number.bin.fs' }
	]}],

	[{
	line: '86y',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '0b00000101y',
	tokens: [
		{ startIndex: 0, type: 'number.bin.fs' }
	]}],

	[{
	line: '86s',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '86us',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '86',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '86l',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '86u',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '86ul',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '0x00002D3Fn',
	tokens: [
		{ startIndex: 0, type: 'number.hex.fs' }
	]}],

	[{
	line: '0x00002D3Fun',
	tokens: [
		{ startIndex: 0, type: 'number.hex.fs' }
	]}],

	[{
	line: '86L',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '86UL',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '9999999999999999999999999999I',
	tokens: [
		{ startIndex: 0, type: 'number.fs' }
	]}],

	[{
	line: '0x00002D3FLF',
	tokens: [
		{ startIndex: 0, type: 'number.float.fs' }
	]}]
]);
