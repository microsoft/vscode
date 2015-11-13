/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import _parser = require('vs/languages/sass/common/parser/sassParser');
import languageFactsTest = require('vs/languages/css/test/common/languageFacts.test');

suite('Sass language facts', () => {

	test('is color', function() {
		var parser = new _parser.SassParser();
		languageFactsTest.assertColor(parser, '#main { color: foo(red) }', 'red', true);
		languageFactsTest.assertColor(parser, '#main { color: red() }', 'red', false);
		languageFactsTest.assertColor(parser, '#main { red { nested: 1px } }', 'red', false);
		languageFactsTest.assertColor(parser, '#main { @include red; }', 'red', false);
		languageFactsTest.assertColor(parser, '#main { @include foo($f: red); }', 'red', true);
		languageFactsTest.assertColor(parser, '@function red($p) { @return 1px; }', 'red', false);
		languageFactsTest.assertColor(parser, '@function foo($p) { @return red; }', 'red', true);
		languageFactsTest.assertColor(parser, '@function foo($r: red) { @return $r; }', 'red', true);
	});
});

