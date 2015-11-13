/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import parser = require('vs/languages/sass/common/parser/sassParser');
import selectorPrinterTest = require('vs/languages/css/test/common/selectorPrinting.test');

suite('Sass - selector printing', () => {

	test('nested selector', function() {
		var p = new parser.SassParser();
		selectorPrinterTest.parseSelector(p, 'o1 { e1 { } }', 'e1', '{o1{…{e1}}}');
		selectorPrinterTest.parseSelector(p, 'o1 { e1.div { } }', 'e1', '{o1{…{e1[class=div]}}}');
		selectorPrinterTest.parseSelector(p, 'o1 o2 { e1 { } }', 'e1', '{o1{…{o2{…{e1}}}}}');
		selectorPrinterTest.parseSelector(p, 'o1, o2 { e1 { } }', 'e1', '{o1{…{e1}}}');
		selectorPrinterTest.parseSelector(p, 'o1 { @if $a { e1 { } } }', 'e1', '{o1{…{e1}}}');
		selectorPrinterTest.parseSelector(p, 'o1 { @mixin a { e1 { } } }', 'e1', '{e1}');
		selectorPrinterTest.parseSelector(p, 'o1 { @mixin a { e1 { } } }', 'e1', '{e1}');
	});

	test('referencing selector', function() {
		var p = new parser.SassParser();
		selectorPrinterTest.parseSelector(p, 'o1 { &:hover { }}', '&', '{o1[:hover=]}');
		selectorPrinterTest.parseSelector(p, 'o1 { &:hover & { }}', '&', '{o1[:hover=]{…{o1}}}');
	});

	test('placeholders', function() {
		var p = new parser.SassParser();
		selectorPrinterTest.parseSelector(p, '%o1 { e1 { } }', 'e1', '{%o1{…{e1}}}');
	});
});