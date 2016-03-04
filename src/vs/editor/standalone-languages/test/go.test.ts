/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {language} from 'vs/editor/standalone-languages/go';
import {testTokenization} from 'vs/editor/standalone-languages/test/testUtil';

testTokenization('go', language, [
	// Tests
	[{
	line: '/* Block comment. */',
	tokens: [
		{ startIndex: 0, type: 'comment.go' }
	]}],

	[{
	line: '/* //*/ a',
	tokens: [
		{ startIndex: 0, type: 'comment.go' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.go' }
	]}],

	[{
	line: '// Inline comment.',
	tokens: [
		{ startIndex: 0, type: 'comment.go' }
	]}],

	[{
	line: '',
	tokens: [

	]}],

	[{
	line: 'import {',
	tokens: [
		{ startIndex: 0, type: 'keyword.import.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '  "io"',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'string.go' }
	]}],

	[{
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '',
	tokens: [

	]}],

	[{
	line: 'type name struct {',
	tokens: [
		{ startIndex: 0, type: 'keyword.type.go' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.go' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'keyword.struct.go' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '  firstname string',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'keyword.string.go' }
	]}],

	[{
	line: '  lastname string',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.string.go' }
	]}],

	[{
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '',
	tokens: [

	]}],

	[{
	line: 'func testTypes() {',
	tokens: [
		{ startIndex: 0, type: 'keyword.func.go' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.go' },
		{ startIndex: 14, type: 'delimiter.parenthesis.go' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '  a int;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.int.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  b uint;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.uint.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  c uintptr;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.uintptr.go' },
		{ startIndex: 11, type: 'delimiter.go' }
	]}],

	[{
	line: '  d string;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.string.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '  e byte;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.byte.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  f rune;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.rune.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  g uint8;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.uint8.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  h uint16;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.uint16.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '  i uint32;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.uint32.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '  j uint64;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.uint64.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '  k int8;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.int8.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  l int16;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.int16.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  m int32;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.int32.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  n int64;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.int64.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  o float32;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.float32.go' },
		{ startIndex: 11, type: 'delimiter.go' }
	]}],

	[{
	line: '  p float64;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.float64.go' },
		{ startIndex: 11, type: 'delimiter.go' }
	]}],

	[{
	line: '  q complex64;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.complex64.go' },
		{ startIndex: 13, type: 'delimiter.go' }
	]}],

	[{
	line: '  r complex128;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'keyword.complex128.go' },
		{ startIndex: 14, type: 'delimiter.go' }
	]}],

	[{
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '',
	tokens: [

	]}],

	[{
	line: 'func testOperators() {',
	tokens: [
		{ startIndex: 0, type: 'keyword.func.go' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.go' },
		{ startIndex: 18, type: 'delimiter.parenthesis.go' },
		{ startIndex: 20, type: '' },
		{ startIndex: 21, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '  ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '  var a;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.var.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  var b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.var.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '  a + b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a - b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a * b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a / b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a % b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a & b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a | b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a ^ b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a << b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a >> b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a &^ b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a += b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a -= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a *= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a /= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a %= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a &= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a |= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a ^= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a <<= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  a >>= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  a &^= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 7, type: '' },
		{ startIndex: 8, type: 'identifier.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '  a && b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a || b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a <- b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a++;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: 'delimiter.go' }
	]}],

	[{
	line: '  b--;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: 'delimiter.go' }
	]}],

	[{
	line: '  a == b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a < b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.angle.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a > b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.angle.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  a = b; ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' },
		{ startIndex: 8, type: '' }
	]}],

	[{
	line: '  !a;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.go' },
		{ startIndex: 3, type: 'identifier.go' },
		{ startIndex: 4, type: 'delimiter.go' }
	]}],

	[{
	line: '  a != b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a <= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a >= b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a := b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '  a...;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: 'delimiter.go' }
	]}],

	[{
	line: '  (a)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.parenthesis.go' },
		{ startIndex: 3, type: 'identifier.go' },
		{ startIndex: 4, type: 'delimiter.parenthesis.go' }
	]}],

	[{
	line: '  [a]',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.square.go' },
		{ startIndex: 3, type: 'identifier.go' },
		{ startIndex: 4, type: 'delimiter.square.go' }
	]}],

	[{
	line: '  a.b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: 'delimiter.go' },
		{ startIndex: 4, type: 'identifier.go' },
		{ startIndex: 5, type: 'delimiter.go' }
	]}],

	[{
	line: '  a, b;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: 'delimiter.go' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.go' },
		{ startIndex: 6, type: 'delimiter.go' }
	]}],

	[{
	line: '  a : b; ',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'identifier.go' },
		{ startIndex: 3, type: '' },
		{ startIndex: 4, type: 'delimiter.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' },
		{ startIndex: 8, type: '' }
	]}],

	[{
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '',
	tokens: [

	]}],

	[{
	line: 'func keywords() {',
	tokens: [
		{ startIndex: 0, type: 'keyword.func.go' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'identifier.go' },
		{ startIndex: 13, type: 'delimiter.parenthesis.go' },
		{ startIndex: 15, type: '' },
		{ startIndex: 16, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '  ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '  var a;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.var.go' },
		{ startIndex: 5, type: '' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  break;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.break.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  switch(a) {',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.switch.go' },
		{ startIndex: 8, type: 'delimiter.parenthesis.go' },
		{ startIndex: 9, type: 'identifier.go' },
		{ startIndex: 10, type: 'delimiter.parenthesis.go' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '    case 1:',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.case.go' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'number.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '      fallthrough;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'keyword.fallthrough.go' },
		{ startIndex: 17, type: 'delimiter.go' }
	]}],

	[{
	line: '    default:',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.default.go' },
		{ startIndex: 11, type: 'delimiter.go' }
	]}],

	[{
	line: '      break;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 6, type: 'keyword.break.go' },
		{ startIndex: 11, type: 'delimiter.go' }
	]}],

	[{
	line: '  }',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'delimiter.curly.go' }
	]}],

	[{
	line: '  ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '  chan;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.chan.go' },
		{ startIndex: 6, type: 'delimiter.go' }
	]}],

	[{
	line: '  const;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.const.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  continue;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.continue.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '  defer;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.defer.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '  if (a)',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.if.go' },
		{ startIndex: 4, type: '' },
		{ startIndex: 5, type: 'delimiter.parenthesis.go' },
		{ startIndex: 6, type: 'identifier.go' },
		{ startIndex: 7, type: 'delimiter.parenthesis.go' }
	]}],

	[{
	line: '    return;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.return.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '  else',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 2, type: 'keyword.else.go' }
	]}],

	[{
	line: '    return;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 4, type: 'keyword.return.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '   for (i = 0; i < 10; i++);',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.for.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'delimiter.parenthesis.go' },
		{ startIndex: 8, type: 'identifier.go' },
		{ startIndex: 9, type: '' },
		{ startIndex: 10, type: 'delimiter.go' },
		{ startIndex: 11, type: '' },
		{ startIndex: 12, type: 'number.go' },
		{ startIndex: 13, type: 'delimiter.go' },
		{ startIndex: 14, type: '' },
		{ startIndex: 15, type: 'identifier.go' },
		{ startIndex: 16, type: '' },
		{ startIndex: 17, type: 'delimiter.angle.go' },
		{ startIndex: 18, type: '' },
		{ startIndex: 19, type: 'number.go' },
		{ startIndex: 21, type: 'delimiter.go' },
		{ startIndex: 22, type: '' },
		{ startIndex: 23, type: 'identifier.go' },
		{ startIndex: 24, type: 'delimiter.go' },
		{ startIndex: 26, type: 'delimiter.parenthesis.go' },
		{ startIndex: 27, type: 'delimiter.go' }
	]}],

	[{
	line: '   go;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.go.go' },
		{ startIndex: 5, type: 'delimiter.go' }
	]}],

	[{
	line: '   goto;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.goto.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '   interface;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.interface.go' },
		{ startIndex: 12, type: 'delimiter.go' }
	]}],

	[{
	line: '   map;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.map.go' },
		{ startIndex: 6, type: 'delimiter.go' }
	]}],

	[{
	line: '   package;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.package.go' },
		{ startIndex: 10, type: 'delimiter.go' }
	]}],

	[{
	line: '   range;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.range.go' },
		{ startIndex: 8, type: 'delimiter.go' }
	]}],

	[{
	line: '   return;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.return.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '   select;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.select.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '   struct;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.struct.go' },
		{ startIndex: 9, type: 'delimiter.go' }
	]}],

	[{
	line: '   type;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.type.go' },
		{ startIndex: 7, type: 'delimiter.go' }
	]}],

	[{
	line: '   ',
	tokens: [
		{ startIndex: 0, type: '' }
	]}],

	[{
	line: '   var x = true;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.var.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.go' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.true.go' },
		{ startIndex: 15, type: 'delimiter.go' }
	]}],

	[{
	line: '   var y = false;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.var.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.go' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.false.go' },
		{ startIndex: 16, type: 'delimiter.go' }
	]}],

	[{
	line: '   var z = nil;',
	tokens: [
		{ startIndex: 0, type: '' },
		{ startIndex: 3, type: 'keyword.var.go' },
		{ startIndex: 6, type: '' },
		{ startIndex: 7, type: 'identifier.go' },
		{ startIndex: 8, type: '' },
		{ startIndex: 9, type: 'delimiter.go' },
		{ startIndex: 10, type: '' },
		{ startIndex: 11, type: 'keyword.nil.go' },
		{ startIndex: 14, type: 'delimiter.go' }
	]}],

	[{
	line: '}',
	tokens: [
		{ startIndex: 0, type: 'delimiter.curly.go' }
	]}]
]);
