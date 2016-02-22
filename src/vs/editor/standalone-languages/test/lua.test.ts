/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/lua';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('lua', language, [

	// Keywords
	[{
	line: 'local x, y = 1, 10',
	tokens: [
		{ startIndex: 0, type: 'keyword.local.lua' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.lua' },
		{ startIndex: 7, type: 'delimiter.lua' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'identifier.lua' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'delimiter.lua' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'number.lua' },
		{ startIndex: 14, type: 'delimiter.lua' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'number.lua' }
	]}],

	[{
	line: 'foo = "Hello" .. "World"; local foo = foo',
	tokens: [
		{ startIndex: 0, type: 'identifier.lua' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.lua' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'string.lua' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'delimiter.lua' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'string.lua' },
		{ startIndex: 24, type: 'delimiter.lua' },
		{ startIndex: 25, type: '' },
		{ startIndex: 26, type: 'keyword.local.lua' },
		{ startIndex: 31, type: '' },
		{ startIndex: 32, type: 'identifier.lua' },
		{ startIndex: 35, type: '' },
		{ startIndex: 36, type: 'delimiter.lua' },
		{ startIndex: 37, type: '' },
		{ startIndex: 38, type: 'identifier.lua' }
	]}],

	// Comments
	[{
	line: '--[[ text ]] x',
	tokens: [
		{ startIndex: 0, type: 'comment.lua' },
		{ startIndex: 12, type: '' },
		{ startIndex: 13, type: 'identifier.lua' }
	]}],

	[{
	line: '--[===[ text ]===] x',
	tokens: [
		{ startIndex: 0, type: 'comment.lua' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'identifier.lua' }
	]}],

	[{
	line: '--[===[ text ]==] x',
	tokens: [
		{ startIndex: 0, type: 'comment.lua' }
	]}]
]);
