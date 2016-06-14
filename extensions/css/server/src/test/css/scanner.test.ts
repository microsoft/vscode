/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Scanner, TokenType} from '../../parser/cssScanner';

suite('CSS - Scanner', () => {

	function assertSingleToken(scan: Scanner, source: string, len: number, offset: number, text: string, type: TokenType): void {
		scan.setSource(source);
		let token = scan.scan();
		assert.equal(token.len, len);
		assert.equal(token.offset, offset);
		assert.equal(token.text, text);
		assert.equal(token.type, type);
	}

	test('Whitespace', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, ' @', 1, 1, '@', TokenType.Delim);
		assertSingleToken(scanner, ' /* comment*/ \n/*comment*/@', 1, 26, '@', TokenType.Delim);

		scanner = new Scanner();
		scanner.ignoreWhitespace = false;
		assertSingleToken(scanner, ' @', 1, 0, ' ', TokenType.Whitespace);
		assertSingleToken(scanner, '/*comment*/ @', 1, 11, ' ', TokenType.Whitespace);

		scanner = new Scanner();
		scanner.ignoreComment = false;
		assertSingleToken(scanner, ' /*comment*/@', 11, 1, '/*comment*/', TokenType.Comment);
		assertSingleToken(scanner, '/*comment*/ @', 11, 0, '/*comment*/', TokenType.Comment);
	});

	test('Token Ident', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '\u060frf', 3, 0, '\u060frf', TokenType.Ident);
		assertSingleToken(scanner, 'über', 4, 0, 'über', TokenType.Ident);
		assertSingleToken(scanner, '-bo', 3, 0, '-bo', TokenType.Ident);
		assertSingleToken(scanner, '_bo', 3, 0, '_bo', TokenType.Ident);
		assertSingleToken(scanner, 'boo', 3, 0, 'boo', TokenType.Ident);
		assertSingleToken(scanner, 'Boo', 3, 0, 'Boo', TokenType.Ident);
		assertSingleToken(scanner, 'red--', 5, 0, 'red--', TokenType.Ident);
		assertSingleToken(scanner, 'red-->', 5, 0, 'red--', TokenType.Ident);
		assertSingleToken(scanner, '--red', 5, 0, '--red', TokenType.Ident);
		assertSingleToken(scanner, 'a\\.b', 4, 0, 'a\.b', TokenType.Ident);
		assertSingleToken(scanner, '\\E9motion', 9, 0, 'émotion', TokenType.Ident);
		assertSingleToken(scanner, '\\E9 dition', 10, 0, 'édition', TokenType.Ident);
		assertSingleToken(scanner, '\\0000E9dition', 13, 0, 'édition', TokenType.Ident);
		assertSingleToken(scanner, 'S\\0000e9f', 9, 0, 'Séf', TokenType.Ident);
	});

	test('Token Url', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, 'url(\'http://msft.com\')', 22, 0, 'url(\'http://msft.com\')', TokenType.URI);
		assertSingleToken(scanner, 'url("http://msft.com")', 22, 0, 'url("http://msft.com")', TokenType.URI);
		assertSingleToken(scanner, 'url( "http://msft.com")', 23, 0, 'url( "http://msft.com")', TokenType.URI);
		assertSingleToken(scanner, 'url(\t"http://msft.com")', 23, 0, 'url(\t"http://msft.com")', TokenType.URI);
		assertSingleToken(scanner, 'url(\n"http://msft.com")', 23, 0, 'url(\n"http://msft.com")', TokenType.URI);
		assertSingleToken(scanner, 'url("http://msft.com"\n)', 23, 0, 'url("http://msft.com"\n)', TokenType.URI);
		assertSingleToken(scanner, 'url("")', 7, 0, 'url("")', TokenType.URI);
		assertSingleToken(scanner, 'uRL("")', 7, 0, 'uRL("")', TokenType.URI);
		assertSingleToken(scanner, 'URL("")', 7, 0, 'URL("")', TokenType.URI);
		assertSingleToken(scanner, 'url(http://msft.com)', 20, 0, 'url(http://msft.com)', TokenType.URI);
		assertSingleToken(scanner, 'url()', 5, 0, 'url()', TokenType.URI);
		assertSingleToken(scanner, 'url(\'http://msft.com\n)', 22, 0, 'url(\'http://msft.com\n)', TokenType.BadUri);
		assertSingleToken(scanner, 'url("http://msft.com"', 21, 0, 'url("http://msft.com"', TokenType.BadUri);
		assertSingleToken(scanner, 'url(http://msft.com\')', 21, 0, 'url(http://msft.com\')', TokenType.URI);
	});

	test('Token AtKeyword', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '@import', 7, 0, '@import', TokenType.AtKeyword);
		assertSingleToken(scanner, '@importttt', 10, 0, '@importttt', TokenType.AtKeyword);
		assertSingleToken(scanner, '@imp', 4, 0, '@imp', TokenType.AtKeyword);
		assertSingleToken(scanner, '@5', 2, 0, '@5', TokenType.AtKeyword);
		assertSingleToken(scanner, '@media', 6, 0, '@media', TokenType.AtKeyword);
		assertSingleToken(scanner, '@page', 5, 0, '@page', TokenType.AtKeyword);
		assertSingleToken(scanner, '@charset', 8, 0, '@charset', TokenType.Charset);
		assertSingleToken(scanner, '@-mport', 7, 0, '@-mport', TokenType.AtKeyword);
		assertSingleToken(scanner, '@\u00f0mport', 7, 0, '@\u00f0mport', TokenType.AtKeyword);
		assertSingleToken(scanner, '@', 1, 0, '@', TokenType.Delim);
	});

	test('Token Number', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '1234', 4, 0, '1234', TokenType.Num);
		assertSingleToken(scanner, '1.34', 4, 0, '1.34', TokenType.Num);
		assertSingleToken(scanner, '.234', 4, 0, '.234', TokenType.Num);
		assertSingleToken(scanner, '.234.', 4, 0, '.234', TokenType.Num);
		assertSingleToken(scanner, '..234', 1, 0, '.', TokenType.Delim);
	});

	test('Token Delim', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '@', 1, 0, '@', TokenType.Delim);
		assertSingleToken(scanner, '+', 1, 0, '+', TokenType.Delim);
		assertSingleToken(scanner, '>', 1, 0, '>', TokenType.Delim);
		assertSingleToken(scanner, '#', 1, 0, '#', TokenType.Delim);
		assertSingleToken(scanner, '\'', 1, 0, '\'', TokenType.BadString);
		assertSingleToken(scanner, '"', 1, 0, '"', TokenType.BadString);
	});

	test('Token Hash', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '#import', 7, 0, '#import', TokenType.Hash);
		assertSingleToken(scanner, '#-mport', 7, 0, '#-mport', TokenType.Hash);
		assertSingleToken(scanner, '#123', 4, 0, '#123', TokenType.Hash);
	});

	test('Token Dimension/Percentage', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '3em', 3, 0, '3em', TokenType.EMS);
		assertSingleToken(scanner, '4.423ex', 7, 0, '4.423ex', TokenType.EXS);
		assertSingleToken(scanner, '3423px', 6, 0, '3423px', TokenType.Length);
		assertSingleToken(scanner, '4.423cm', 7, 0, '4.423cm', TokenType.Length);
		assertSingleToken(scanner, '4.423mm', 7, 0, '4.423mm', TokenType.Length);
		assertSingleToken(scanner, '4.423in', 7, 0, '4.423in', TokenType.Length);
		assertSingleToken(scanner, '4.423pt', 7, 0, '4.423pt', TokenType.Length);
		assertSingleToken(scanner, '4.423pc', 7, 0, '4.423pc', TokenType.Length);
		assertSingleToken(scanner, '4.423deg', 8, 0, '4.423deg', TokenType.Angle);
		assertSingleToken(scanner, '4.423rad', 8, 0, '4.423rad', TokenType.Angle);
		assertSingleToken(scanner, '4.423grad', 9, 0, '4.423grad', TokenType.Angle);
		assertSingleToken(scanner, '4.423ms', 7, 0, '4.423ms', TokenType.Time);
		assertSingleToken(scanner, '4.423s', 6, 0, '4.423s', TokenType.Time);
		assertSingleToken(scanner, '4.423hz', 7, 0, '4.423hz', TokenType.Freq);
		assertSingleToken(scanner, '.423khz', 7, 0, '.423khz', TokenType.Freq);
		assertSingleToken(scanner, '3.423%', 6, 0, '3.423%', TokenType.Percentage);
		assertSingleToken(scanner, '.423%', 5, 0, '.423%', TokenType.Percentage);
		assertSingleToken(scanner, '.423ft', 6, 0, '.423ft', TokenType.Dimension);
		assertSingleToken(scanner, '200dpi', 6, 0, '200dpi', TokenType.Resolution);
		assertSingleToken(scanner, '123dpcm', 7, 0, '123dpcm', TokenType.Resolution);
	});

	test('Token String', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '\'farboo\'', 8, 0, '\'farboo\'', TokenType.String);
		assertSingleToken(scanner, '"farboo"', 8, 0, '"farboo"', TokenType.String);
		assertSingleToken(scanner, '"farbo\u00f0"', 8, 0, '"farbo\u00f0"', TokenType.String);
		assertSingleToken(scanner, '"far\\\"oo"', 9, 0, '"far\"oo"', TokenType.String);
		assertSingleToken(scanner, '"fa\\\noo"', 8, 0, '"fa\noo"', TokenType.String);
		assertSingleToken(scanner, '"fa\\\roo"', 8, 0, '"fa\roo"', TokenType.String);
		assertSingleToken(scanner, '"fa\\\foo"', 8, 0, '"fa\foo"', TokenType.String);
		assertSingleToken(scanner, '\'farboo"', 8, 0, '\'farboo"', TokenType.BadString);
		assertSingleToken(scanner, '\'farboo', 7, 0, '\'farboo', TokenType.BadString);
		assertSingleToken(scanner, '\'', 1, 0, '\'', TokenType.BadString);
		assertSingleToken(scanner, '"', 1, 0, '"', TokenType.BadString);
	});

	test('Token CDO', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '<!--', 4, 0, '<!--', TokenType.CDO);
		assertSingleToken(scanner, '<!-\n-', 1, 0, '<', TokenType.Delim);
	});

	test('Token CDC', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '-->', 3, 0, '-->', TokenType.CDC);
		assertSingleToken(scanner, '--y>', 3, 0, '--y', TokenType.Ident);
		assertSingleToken(scanner, '--<', 1, 0, '-', TokenType.Delim);
	});

	test('Token singletokens ;:{}[]()', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, ':  ', 1, 0, ':', TokenType.Colon);
		assertSingleToken(scanner, ';  ', 1, 0, ';', TokenType.SemiColon);
		assertSingleToken(scanner, '{  ', 1, 0, '{', TokenType.CurlyL);
		assertSingleToken(scanner, '}  ', 1, 0, '}', TokenType.CurlyR);
		assertSingleToken(scanner, '[  ', 1, 0, '[', TokenType.BracketL);
		assertSingleToken(scanner, ']  ', 1, 0, ']', TokenType.BracketR);
		assertSingleToken(scanner, '(  ', 1, 0, '(', TokenType.ParenthesisL);
		assertSingleToken(scanner, ')  ', 1, 0, ')', TokenType.ParenthesisR);
	});

	test('Token dashmatch & includes', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '~=', 2, 0, '~=', TokenType.Includes);
		assertSingleToken(scanner, '~', 1, 0, '~', TokenType.Delim);
		assertSingleToken(scanner, '|=', 2, 0, '|=', TokenType.Dashmatch);
		assertSingleToken(scanner, '|', 1, 0, '|', TokenType.Delim);
		assertSingleToken(scanner, '^=', 2, 0, '^=', TokenType.PrefixOperator);
		assertSingleToken(scanner, '$=', 2, 0, '$=', TokenType.SuffixOperator);
		assertSingleToken(scanner, '*=', 2, 0, '*=', TokenType.SubstringOperator);
	});

	test('Comments', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, '/*      */', 0, 10, '', TokenType.EOF);
		assertSingleToken(scanner, '/*      abcd*/', 0, 14, '', TokenType.EOF);
		assertSingleToken(scanner, '/*abcd  */', 0, 10, '', TokenType.EOF);
		assertSingleToken(scanner, '/* ab- .-cd  */', 0, 15, '', TokenType.EOF);
	});

	test('Whitespaces', function () {
		let scanner = new Scanner();
		assertSingleToken(scanner, ' ', 0, 1, '', TokenType.EOF);
		assertSingleToken(scanner, '      ', 0, 6, '', TokenType.EOF);
	});
});

suite('CSS - Token Sequences', () => {

	function assertTokenSequence(scan: Scanner, source: string, ...tokens: TokenType[]): void {
		scan.setSource(source);
		let token = scan.scan();
		let i = 0;
		while (tokens.length > i) {
			assert.equal(token.type, tokens[i]);
			token = scan.scan();
			i++;
		}
	}

	// tests with skipping comments
	test('Token Sequence', function () {
		let scanner = new Scanner();
		assertTokenSequence(scanner, '5 5 5 5', TokenType.Num, TokenType.Num, TokenType.Num, TokenType.Num);
		assertTokenSequence(scanner, '/* 5 4 */-->', TokenType.CDC);
		assertTokenSequence(scanner, '/* 5 4 */ -->', TokenType.CDC);
		assertTokenSequence(scanner, '/* "adaasd" */ -->', TokenType.CDC);
		assertTokenSequence(scanner, '/* <!-- */ -->', TokenType.CDC);
		assertTokenSequence(scanner, 'red-->', TokenType.Ident, TokenType.Delim);
		assertTokenSequence(scanner, '@ import', TokenType.Delim, TokenType.Ident);
	});

});
