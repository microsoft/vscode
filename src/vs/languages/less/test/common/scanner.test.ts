/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import scanner = require('vs/languages/css/common/parser/cssScanner');
import lessScanner = require('vs/languages/less/common/parser/lessScanner');

function assertSingleToken(source: string, len: number, offset: number, text: string, type: scanner.TokenType):void {
	var scan = new lessScanner.LessScanner();
	scan.setSource(source);
	var token = scan.scan();
	assert.equal(token.len, len);
	assert.equal(token.offset, offset);
	assert.equal(token.text, text);
	assert.equal(token.type, type);
}


suite('LESS - Scanner', () => {

	test('Test Escaped JavaScript', function() {
		assertSingleToken('`', 1, 0, '`', scanner.TokenType.BadEscapedJavaScript);
		assertSingleToken('`a', 2, 0, '`a', scanner.TokenType.BadEscapedJavaScript);
		assertSingleToken('`var a = "ssss"`', 16, 0, '`var a = "ssss"`', scanner.TokenType.EscapedJavaScript);
		assertSingleToken('`var a = "ss\ns"`', 16, 0, '`var a = "ss\ns"`', scanner.TokenType.EscapedJavaScript);
	});

	// less deactivated comments
	test('Test Token SingleLineComment', function() {
		assertSingleToken('//', 0, 2, '', scanner.TokenType.EOF);
		assertSingleToken('//this is a comment test', 0, 24, '', scanner.TokenType.EOF);
		assertSingleToken('// this is a comment test', 0, 25, '', scanner.TokenType.EOF);
		assertSingleToken('// this is a\na', 1, 13, 'a', scanner.TokenType.Ident);
		assertSingleToken('// this is a\n// more\n   \n/* comment */a', 1, 38, 'a', scanner.TokenType.Ident);
	});
});
