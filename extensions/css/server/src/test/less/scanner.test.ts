/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import {Scanner, TokenType} from '../../parser/cssScanner';
import {LESSScanner} from '../../parser/lessScanner';

function assertSingleToken(source: string, len: number, offset: number, text: string, type: TokenType): void {
	let scan = new LESSScanner();
	scan.setSource(source);
	let token = scan.scan();
	assert.equal(token.len, len);
	assert.equal(token.offset, offset);
	assert.equal(token.text, text);
	assert.equal(token.type, type);
}

suite('LESS - Scanner', () => {

	test('Test Escaped JavaScript', function () {
		assertSingleToken('`', 1, 0, '`', TokenType.BadEscapedJavaScript);
		assertSingleToken('`a', 2, 0, '`a', TokenType.BadEscapedJavaScript);
		assertSingleToken('`let a = "ssss"`', 16, 0, '`let a = "ssss"`', TokenType.EscapedJavaScript);
		assertSingleToken('`let a = "ss\ns"`', 16, 0, '`let a = "ss\ns"`', TokenType.EscapedJavaScript);
	});

	// less deactivated comments
	test('Test Token SingleLineComment', function () {
		assertSingleToken('//', 0, 2, '', TokenType.EOF);
		assertSingleToken('//this is a comment test', 0, 24, '', TokenType.EOF);
		assertSingleToken('// this is a comment test', 0, 25, '', TokenType.EOF);
		assertSingleToken('// this is a\na', 1, 13, 'a', TokenType.Ident);
		assertSingleToken('// this is a\n// more\n   \n/* comment */a', 1, 38, 'a', TokenType.Ident);
	});
});
