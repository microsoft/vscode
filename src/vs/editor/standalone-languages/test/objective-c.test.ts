/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/objective-c';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('objective-c', language, [
	// Keywords
	[{
	line: '-(id) initWithParams:(id<anObject>) aHandler withDeviceStateManager:(id<anotherObject>) deviceStateManager',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 1, type: 'delimiter.parenthesis.objective-c' },
		{ startIndex: 2, type: 'keyword.objective-c' },
		{ startIndex: 4, type: 'delimiter.parenthesis.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' },
		{ startIndex: 6, type: 'identifier.objective-c' },
		{ startIndex: 20, type: 'delimiter.objective-c' },
		{ startIndex: 21, type: 'delimiter.parenthesis.objective-c' },
		{ startIndex: 22, type: 'keyword.objective-c' },
		{ startIndex: 24, type: 'delimiter.angle.objective-c' },
		{ startIndex: 25, type: 'identifier.objective-c' },
		{ startIndex: 33, type: 'delimiter.angle.objective-c' },
		{ startIndex: 34, type: 'delimiter.parenthesis.objective-c' },
		{ startIndex: 35, type: 'white.objective-c' },
		{ startIndex: 36, type: 'identifier.objective-c' },
		{ startIndex: 44, type: 'white.objective-c' },
		{ startIndex: 45, type: 'identifier.objective-c' },
		{ startIndex: 67, type: 'delimiter.objective-c' },
		{ startIndex: 68, type: 'delimiter.parenthesis.objective-c' },
		{ startIndex: 69, type: 'keyword.objective-c' },
		{ startIndex: 71, type: 'delimiter.angle.objective-c' },
		{ startIndex: 72, type: 'identifier.objective-c' },
		{ startIndex: 85, type: 'delimiter.angle.objective-c' },
		{ startIndex: 86, type: 'delimiter.parenthesis.objective-c' },
		{ startIndex: 87, type: 'white.objective-c' },
		{ startIndex: 88, type: 'identifier.objective-c' }
	]}],

	// Comments - single line
	[{
	line: '//',
	tokens: [
		{ startIndex: 0, type: 'comment.objective-c' }
	]}],

	[{
	line: '    // a comment',
	tokens: [
		{ startIndex: 0, type: 'white.objective-c' },
		{ startIndex: 4, type: 'comment.objective-c' }
	]}],

	[{
	line: '// a comment',
	tokens: [
		{ startIndex: 0, type: 'comment.objective-c' }
	]}],

	[{
	line: '//sticky comment',
	tokens: [
		{ startIndex: 0, type: 'comment.objective-c' }
	]}],

	[{
	line: '/almost a comment',
	tokens: [
		{ startIndex: 0, type: 'operator.objective-c' },
		{ startIndex: 1, type: 'identifier.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' },
		{ startIndex: 8, type: 'identifier.objective-c' },
		{ startIndex: 9, type: 'white.objective-c' },
		{ startIndex: 10, type: 'identifier.objective-c' }
	]}],

	[{
	line: '1 / 2; /* comment',
	tokens: [
		{ startIndex: 0, type: 'number.objective-c' },
		{ startIndex: 1, type: 'white.objective-c' },
		{ startIndex: 2, type: 'operator.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'number.objective-c' },
		{ startIndex: 5, type: 'delimiter.objective-c' },
		{ startIndex: 6, type: 'white.objective-c' },
		{ startIndex: 7, type: 'comment.objective-c' }
	]}],

	[{
	line: 'int x = 1; // my comment // is a nice one',
	tokens: [
		{ startIndex: 0, type: 'keyword.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'identifier.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' },
		{ startIndex: 6, type: 'operator.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' },
		{ startIndex: 8, type: 'number.objective-c' },
		{ startIndex: 9, type: 'delimiter.objective-c' },
		{ startIndex: 10, type: 'white.objective-c' },
		{ startIndex: 11, type: 'comment.objective-c' }
	]}],

	// Comments - range comment, single line
	[{
	line: '/* a simple comment */',
	tokens: [
		{ startIndex: 0, type: 'comment.objective-c' }
	]}],

	[{
	line: 'int x = /* embedded comment */ 1;',
	tokens: [
		{ startIndex: 0, type: 'keyword.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'identifier.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' },
		{ startIndex: 6, type: 'operator.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' },
		{ startIndex: 8, type: 'comment.objective-c' },
		{ startIndex: 30, type: 'white.objective-c' },
		{ startIndex: 31, type: 'number.objective-c' },
		{ startIndex: 32, type: 'delimiter.objective-c' }
	]}],

	[{
	line: 'int x = /* comment and syntax error*/ 1; */',
	tokens: [
		{ startIndex: 0, type: 'keyword.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'identifier.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' },
		{ startIndex: 6, type: 'operator.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' },
		{ startIndex: 8, type: 'comment.objective-c' },
		{ startIndex: 37, type: 'white.objective-c' },
		{ startIndex: 38, type: 'number.objective-c' },
		{ startIndex: 39, type: 'delimiter.objective-c' },
		{ startIndex: 40, type: 'white.objective-c' },
		{ startIndex: 41, type: 'operator.objective-c' }
	]}],

	[{
	line: 'x = /**/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.objective-c' },
		{ startIndex: 1, type: 'white.objective-c' },
		{ startIndex: 2, type: 'operator.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'comment.objective-c' },
		{ startIndex: 8, type: 'delimiter.objective-c' }
	]}],

	[{
	line: 'x = /*/;',
	tokens: [
		{ startIndex: 0, type: 'identifier.objective-c' },
		{ startIndex: 1, type: 'white.objective-c' },
		{ startIndex: 2, type: 'operator.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'comment.objective-c' }
	]}],

	// Non-Alpha Keywords
	[{
	line: '#import <GTLT.h>',
	tokens: [
		{ startIndex: 0, type: 'keyword.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' },
		{ startIndex: 8, type: 'delimiter.angle.objective-c' },
		{ startIndex: 9, type: 'identifier.objective-c' },
		{ startIndex: 13, type: '' },
		{ startIndex: 14, type: 'identifier.objective-c' },
		{ startIndex: 15, type: 'delimiter.angle.objective-c' }
	]}],

	// Numbers
	[{
	line: '0 ',
	tokens: [
		{ startIndex: 0, type: 'number.objective-c' },
		{ startIndex: 1, type: 'white.objective-c' }
	]}],

	[{
	line: '0x ',
	tokens: [
		{ startIndex: 0, type: 'number.hex.objective-c' },
		{ startIndex: 2, type: 'white.objective-c' }
	]}],

	[{
	line: '0x123 ',
	tokens: [
		{ startIndex: 0, type: 'number.hex.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' }
	]}],

	[{
	line: '23.5 ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 4, type: 'white.objective-c' }
	]}],

	[{
	line: '23.5e3 ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 6, type: 'white.objective-c' }
	]}],

	[{
	line: '23.5E3 ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 6, type: 'white.objective-c' }
	]}],

	[{
	line: '23.5F ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' }
	]}],

	[{
	line: '23.5f ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 5, type: 'white.objective-c' }
	]}],

	[{
	line: '1.72E3F ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' }
	]}],

	[{
	line: '1.72E3f ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' }
	]}],

	[{
	line: '1.72e3F ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' }
	]}],

	[{
	line: '1.72e3f ',
	tokens: [
		{ startIndex: 0, type: 'number.float.objective-c' },
		{ startIndex: 7, type: 'white.objective-c' }
	]}],

	[{
	line: '0+0',
	tokens: [
		{ startIndex: 0, type: 'number.objective-c' },
		{ startIndex: 1, type: 'operator.objective-c' },
		{ startIndex: 2, type: 'number.objective-c' }
	]}],

	[{
	line: '100+10',
	tokens: [
		{ startIndex: 0, type: 'number.objective-c' },
		{ startIndex: 3, type: 'operator.objective-c' },
		{ startIndex: 4, type: 'number.objective-c' }
	]}],

	[{
	line: '0 + 0',
	tokens: [
		{ startIndex: 0, type: 'number.objective-c' },
		{ startIndex: 1, type: 'white.objective-c' },
		{ startIndex: 2, type: 'operator.objective-c' },
		{ startIndex: 3, type: 'white.objective-c' },
		{ startIndex: 4, type: 'number.objective-c' }
	]}]
]);
