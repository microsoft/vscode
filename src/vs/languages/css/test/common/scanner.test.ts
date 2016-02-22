/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import Scanner = require('vs/languages/css/common/parser/cssScanner');

suite('CSS - Scanner', () => {

	function assertSingleToken(scan: Scanner.Scanner, source: string, len: number, offset: number, text: string, type: Scanner.TokenType):void {
		scan.setSource(source);
		var token = scan.scan();
		assert.equal(token.len, len);
		assert.equal(token.offset, offset);
		assert.equal(token.text, text);
		assert.equal(token.type, type);
	}

	test('Test Whitespace', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, ' @', 1, 1, '@', Scanner.TokenType.Delim);
		assertSingleToken(scanner, ' /* comment*/ \n/*comment*/@', 1, 26, '@', Scanner.TokenType.Delim);

		scanner = new Scanner.Scanner();
		scanner.ignoreWhitespace = false;
		assertSingleToken(scanner, ' @', 1, 0, ' ', Scanner.TokenType.Whitespace);
		assertSingleToken(scanner, '/*comment*/ @', 1, 11, ' ', Scanner.TokenType.Whitespace);

		scanner = new Scanner.Scanner();
		scanner.ignoreComment = false;
		assertSingleToken(scanner, ' /*comment*/@', 11, 1, '/*comment*/', Scanner.TokenType.Comment);
		assertSingleToken(scanner, '/*comment*/ @', 11, 0, '/*comment*/', Scanner.TokenType.Comment);
	});

	test('Test Token Ident', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '\u060frf', 3, 0, '\u060frf', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'über', 4, 0, 'über', Scanner.TokenType.Ident);
		assertSingleToken(scanner, '-bo', 3, 0, '-bo', Scanner.TokenType.Ident);
		assertSingleToken(scanner, '_bo', 3, 0, '_bo', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'boo', 3, 0, 'boo', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'Boo', 3, 0, 'Boo', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'red--', 5, 0, 'red--', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'red-->', 5, 0, 'red--', Scanner.TokenType.Ident);
		assertSingleToken(scanner, '--red', 5, 0, '--red', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'a\\.b', 4, 0, 'a\.b', Scanner.TokenType.Ident);
		assertSingleToken(scanner, '\\E9motion', 9, 0, 'émotion', Scanner.TokenType.Ident);
		assertSingleToken(scanner, '\\E9 dition', 10, 0, 'édition', Scanner.TokenType.Ident);
		assertSingleToken(scanner, '\\0000E9dition', 13, 0, 'édition', Scanner.TokenType.Ident);
		assertSingleToken(scanner, 'S\\0000e9f', 9, 0, 'Séf', Scanner.TokenType.Ident);
	});

	test('Test Token Url', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, 'url(\'http://msft.com\')', 22, 0, 'url(\'http://msft.com\')', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url("http://msft.com")', 22, 0, 'url("http://msft.com")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url( "http://msft.com")', 23, 0, 'url( "http://msft.com")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url(\t"http://msft.com")', 23, 0, 'url(\t"http://msft.com")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url(\n"http://msft.com")', 23, 0, 'url(\n"http://msft.com")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url("http://msft.com"\n)', 23, 0, 'url("http://msft.com"\n)', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url("")', 7, 0, 'url("")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'uRL("")', 7, 0, 'uRL("")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'URL("")', 7, 0, 'URL("")', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url(http://msft.com)', 20, 0, 'url(http://msft.com)', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url()', 5, 0, 'url()', Scanner.TokenType.URI);
		assertSingleToken(scanner, 'url(\'http://msft.com\n)', 22, 0, 'url(\'http://msft.com\n)', Scanner.TokenType.BadUri);
		assertSingleToken(scanner, 'url("http://msft.com"', 21, 0, 'url("http://msft.com"', Scanner.TokenType.BadUri);
		assertSingleToken(scanner, 'url(http://msft.com\')', 21, 0, 'url(http://msft.com\')', Scanner.TokenType.URI);
	});

	test('Test Token AtKeyword', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '@import', 7, 0, '@import', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@importttt', 10, 0, '@importttt', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@imp', 4, 0, '@imp', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@5', 1, 0, '@', Scanner.TokenType.Delim);
		assertSingleToken(scanner, '@media', 6, 0, '@media', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@page', 5, 0, '@page', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@charset', 8, 0, '@charset', Scanner.TokenType.Charset);
		assertSingleToken(scanner, '@-mport', 7, 0, '@-mport', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@\u00f0mport', 7, 0, '@\u00f0mport', Scanner.TokenType.AtKeyword);
		assertSingleToken(scanner, '@', 1, 0, '@', Scanner.TokenType.Delim);
	});

	test('Test Token Number', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '1234', 4, 0, '1234', Scanner.TokenType.Num);
		assertSingleToken(scanner, '1.34', 4, 0, '1.34', Scanner.TokenType.Num);
		assertSingleToken(scanner, '.234', 4, 0, '.234', Scanner.TokenType.Num);
		assertSingleToken(scanner, '.234.', 4, 0, '.234', Scanner.TokenType.Num);
		assertSingleToken(scanner, '..234', 1, 0, '.', Scanner.TokenType.Delim);
	});

	test('Test Token Delim', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '@', 1, 0, '@', Scanner.TokenType.Delim);
		assertSingleToken(scanner, '+', 1, 0, '+', Scanner.TokenType.Delim);
		assertSingleToken(scanner, '>', 1, 0, '>', Scanner.TokenType.Delim);
		assertSingleToken(scanner, '#', 1, 0, '#', Scanner.TokenType.Delim);
		assertSingleToken(scanner, '\'', 1, 0, '\'', Scanner.TokenType.BadString);
		assertSingleToken(scanner, '"', 1, 0, '"', Scanner.TokenType.BadString);
	});

	test('Test Token Hash', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '#import', 7, 0, '#import', Scanner.TokenType.Hash);
		assertSingleToken(scanner, '#-mport', 7, 0, '#-mport', Scanner.TokenType.Hash);
		assertSingleToken(scanner, '#123', 4, 0, '#123', Scanner.TokenType.Hash);
	});

	test('Test Token Dimension/Percentage', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '3em', 3, 0, '3em', Scanner.TokenType.EMS);
		assertSingleToken(scanner, '4.423ex', 7, 0, '4.423ex', Scanner.TokenType.EXS);
		assertSingleToken(scanner, '3423px', 6, 0, '3423px', Scanner.TokenType.Length);
		assertSingleToken(scanner, '4.423cm', 7, 0, '4.423cm', Scanner.TokenType.Length);
		assertSingleToken(scanner, '4.423mm', 7, 0, '4.423mm', Scanner.TokenType.Length);
		assertSingleToken(scanner, '4.423in', 7, 0, '4.423in', Scanner.TokenType.Length);
		assertSingleToken(scanner, '4.423pt', 7, 0, '4.423pt', Scanner.TokenType.Length);
		assertSingleToken(scanner, '4.423pc', 7, 0, '4.423pc', Scanner.TokenType.Length);
		assertSingleToken(scanner, '4.423deg', 8, 0, '4.423deg', Scanner.TokenType.Angle);
		assertSingleToken(scanner, '4.423rad', 8, 0, '4.423rad', Scanner.TokenType.Angle);
		assertSingleToken(scanner, '4.423grad', 9, 0, '4.423grad', Scanner.TokenType.Angle);
		assertSingleToken(scanner, '4.423ms', 7, 0, '4.423ms', Scanner.TokenType.Time);
		assertSingleToken(scanner, '4.423s', 6, 0, '4.423s', Scanner.TokenType.Time);
		assertSingleToken(scanner, '4.423hz', 7, 0, '4.423hz', Scanner.TokenType.Freq);
		assertSingleToken(scanner, '.423khz', 7, 0, '.423khz', Scanner.TokenType.Freq);
		assertSingleToken(scanner, '3.423%', 6, 0, '3.423%', Scanner.TokenType.Percentage);
		assertSingleToken(scanner, '.423%', 5, 0, '.423%', Scanner.TokenType.Percentage);
		assertSingleToken(scanner, '.423ft', 6, 0, '.423ft', Scanner.TokenType.Dimension);
		assertSingleToken(scanner, '200dpi', 6, 0, '200dpi', Scanner.TokenType.Resolution);
		assertSingleToken(scanner, '123dpcm', 7, 0, '123dpcm', Scanner.TokenType.Resolution);
	});

	test('Test Token String', function() {
		var scanner = new Scanner.Scanner();
		assertSingleToken(scanner, '\'farboo\'', 8, 0, '\'farboo\'', Scanner.TokenType.String);
		assertSingleToken(scanner, '"farboo"', 8, 0, '"farboo"', Scanner.TokenType.String);
		assertSingleToken(scanner, '"farbo\u00f0"', 8, 0, '"farbo\u00f0"', Scanner.TokenType.String);
		assertSingleToken(scanner, '"far\\\"oo"', 9, 0, '"far\"oo"', Scanner.TokenType.String);
		assertSingleToken(scanner, '"fa\\\noo"', 8, 0, '"fa\noo"', Scanner.TokenType.String);
		assertSingleToken(scanner, '"fa\\\roo"', 8, 0, '"fa\roo"', Scanner.TokenType.String);
		assertSingleToken(scanner, '"fa\\\foo"', 8, 0, '"fa\foo"', Scanner.TokenType.String);
		assertSingleToken(scanner, '\'farboo"', 8, 0, '\'farboo"', Scanner.TokenType.BadString);
		assertSingleToken(scanner, '\'farboo', 7, 0, '\'farboo', Scanner.TokenType.BadString);
		assertSingleToken(scanner, '\'', 1, 0, '\'', Scanner.TokenType.BadString);
		assertSingleToken(scanner, '"', 1, 0, '"', Scanner.TokenType.BadString);
	});

		//	--- these are disabled because we decided to skip comments totally to keep the AST alive. dk
		//	test('Test Token Comment', function() {
		//		assertSingleToken(scanner, '/**/', 4, 0, '/**/', Scanner.TokenType.Comment);
		//		assertSingleToken(scanner, '/* asds */', 10, 0, '/* asds */', Scanner.TokenType.Comment);
		//		assertSingleToken(scanner, '/*as\nds*/', 9, 0, '/*as\nds*/', Scanner.TokenType.Comment);
		//		assertSingleToken(scanner, '/*a  s\nd  s*/*/', 13, 0, '/*a  s\nd  s*/', Scanner.TokenType.Comment);
		//		assertSingleToken(scanner, '/*a  s\rd  s*/*/', 13, 0, '/*a  s\rd  s*/', Scanner.TokenType.Comment);
		//		assertSingleToken(scanner, '/*a  s\rd  s', 11, 0, '/*a  s\rd  s', Scanner.TokenType.BadComment);
		//	});

		test('Test Token CDO', function() {
			var scanner = new Scanner.Scanner();
			assertSingleToken(scanner, '<!--', 4, 0, '<!--', Scanner.TokenType.CDO);
			assertSingleToken(scanner, '<!-\n-', 1, 0, '<', Scanner.TokenType.Delim);
		});

		test('Test Token CDC', function() {
			var scanner = new Scanner.Scanner();
			assertSingleToken(scanner, '-->', 3, 0, '-->', Scanner.TokenType.CDC);
			assertSingleToken(scanner, '--y>', 3, 0, '--y', Scanner.TokenType.Ident);
			assertSingleToken(scanner, '--<', 1, 0, '-', Scanner.TokenType.Delim);
		});

		test('Test Token singletokens ;:{}[]()', function() {
			var scanner = new Scanner.Scanner();
			assertSingleToken(scanner, ':  ', 1, 0, ':', Scanner.TokenType.Colon);
			assertSingleToken(scanner, ';  ', 1, 0, ';', Scanner.TokenType.SemiColon);
			assertSingleToken(scanner, '{  ', 1, 0, '{', Scanner.TokenType.CurlyL);
			assertSingleToken(scanner, '}  ', 1, 0, '}', Scanner.TokenType.CurlyR);
			assertSingleToken(scanner, '[  ', 1, 0, '[', Scanner.TokenType.BracketL);
			assertSingleToken(scanner, ']  ', 1, 0, ']', Scanner.TokenType.BracketR);
			assertSingleToken(scanner, '(  ', 1, 0, '(', Scanner.TokenType.ParenthesisL);
			assertSingleToken(scanner, ')  ', 1, 0, ')', Scanner.TokenType.ParenthesisR);
		});

		test('Test Token dashmatch & includes', function() {
			var scanner = new Scanner.Scanner();
			assertSingleToken(scanner, '~=', 2, 0, '~=', Scanner.TokenType.Includes);
			assertSingleToken(scanner, '~', 1, 0, '~', Scanner.TokenType.Delim);
			assertSingleToken(scanner, '|=', 2, 0, '|=', Scanner.TokenType.Dashmatch);
			assertSingleToken(scanner, '|', 1, 0, '|', Scanner.TokenType.Delim);
			assertSingleToken(scanner, '^=', 2, 0, '^=', Scanner.TokenType.PrefixOperator);
			assertSingleToken(scanner, '$=', 2, 0, '$=', Scanner.TokenType.SuffixOperator);
			assertSingleToken(scanner, '*=', 2, 0, '*=', Scanner.TokenType.SubstringOperator);
		});

		// deactivated comments test
		test('Test Comments', function() {
			var scanner = new Scanner.Scanner();
			assertSingleToken(scanner, '/*      */', 0, 10, '', Scanner.TokenType.EOF);
			assertSingleToken(scanner, '/*      abcd*/', 0, 14, '', Scanner.TokenType.EOF);
			assertSingleToken(scanner, '/*abcd  */', 0, 10, '', Scanner.TokenType.EOF);
			assertSingleToken(scanner, '/* ab- .-cd  */', 0, 15, '', Scanner.TokenType.EOF);
		});

		//test('Test Token SingleLineComment', function() {
		//	var scanner = new Scanner.Scanner();
		//	assertSingleToken(scanner, '//asds', 6, 0, '//asds', Scanner.TokenType.SingleLineComment);
		//	assertSingleToken(scanner, '// asds', 7, 0, '// asds', Scanner.TokenType.SingleLineComment);
		//	assertSingleToken(scanner, '// as ds', 8, 0, '// as ds', Scanner.TokenType.SingleLineComment);
		//	assertSingleToken(scanner, '// as\n ds', 5, 0, 'ds', Scanner.TokenType.SingleLineComment);
		//});

		// deactivated whitespaces test
		test('Test Whitespaces', function() {
			var scanner = new Scanner.Scanner();
			assertSingleToken(scanner, ' ', 0, 1, '', Scanner.TokenType.EOF);
			assertSingleToken(scanner, '      ', 0, 6, '', Scanner.TokenType.EOF);
		});
});

suite('CSS - Token Sequences', () => {

	function assertTokenSequence(scan: Scanner.Scanner, source: string, ...tokens:Scanner.TokenType[]):void {
		scan.setSource(source);
		var token = scan.scan();
		var i = 0;
		while(tokens.length > i) {
			assert.equal(token.type, tokens[i]);
			token = scan.scan();
			i++;
		}
	}

	// tests with skipping comments
	test('Test Token Sequence', function() {
		var scanner = new Scanner.Scanner();
		assertTokenSequence(scanner, '5 5 5 5', Scanner.TokenType.Num, Scanner.TokenType.Num, Scanner.TokenType.Num, Scanner.TokenType.Num);
		assertTokenSequence(scanner, '/* 5 4 */-->', Scanner.TokenType.CDC);
		assertTokenSequence(scanner, '/* 5 4 */ -->', Scanner.TokenType.CDC);
		assertTokenSequence(scanner, '/* "adaasd" */ -->', Scanner.TokenType.CDC);
		assertTokenSequence(scanner, '/* <!-- */ -->', Scanner.TokenType.CDC);
		assertTokenSequence(scanner, 'red-->', Scanner.TokenType.Ident, Scanner.TokenType.Delim);
		assertTokenSequence(scanner, '@ import', Scanner.TokenType.Delim, Scanner.TokenType.Ident);
	});

	//	// Sequence Test with activated comments
	//	test('Test Token Sequence', function() {
	//		assertTokenSequence('5 5 5 5', Scanner.TokenType.Num, Scanner.TokenType.Num, Scanner.TokenType.Num, Scanner.TokenType.Num);
	//		assertTokenSequence('/* 5 4 */ -->', Scanner.TokenType.Comment, Scanner.TokenType.CDC);
	//		assertTokenSequence('/* "adaasd" */ -->', Scanner.TokenType.Comment, Scanner.TokenType.CDC);
	//		assertTokenSequence('/* <!-- */ -->', Scanner.TokenType.Comment, Scanner.TokenType.CDC);
	//		assertTokenSequence('red-->', Scanner.TokenType.Ident, Scanner.TokenType.Delim);
	//		assertTokenSequence('@ import', Scanner.TokenType.Delim, Scanner.TokenType.Ident);
	//	});


	//	test('[perf] Test Token l o n g Sequence', function() {
	//
	//		var tokens = [ '5', '8px', 'boo', 'far', '@import', ':', '{', '}', '<!--', '-->', 'background-color',
	//			'/**/', '!important', 'url(test.png)', 'url("test.png")',
	//			';', '#332244', 'calc(', '"string1"', '\'string2\'', '"badstring1\n', '\'badstring2\n', '~=', '|='],
	//			input:string[] = [];
	//
	//		for (var i = 0; i < 100000; i++) {
	//			var idx = Math.floor(Math.random() * tokens.length);
	//			input.push(tokens[idx]);
	//		}
	//		var inputText = input.join(' ');
	//		var now = new Date().getTime();
	//		var scan = new Scanner.Scanner(), tok:Scanner.IToken, tokCount = 0;
	//		scan.setSource(inputText);
	//
	//		while((tok = scan.scan()).type !== Scanner.TokenType.EOF) {
	//			tokCount += 1;
	//		}
	//		var d = new  Date().getTime() - now;
	//		assert.equal(tokCount, input.length);
	//		assert.ok(d < 500, 'scanner fast? took ms' + d + ', token count ' + tokCount + ', input length: ' + inputText.length);
	//	});
});
