/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {SCSSParser} from '../../parser/scssParser';
import {parseSelector} from '../css/selectorPrinting.test';

suite('SCSS - Selector Printing', () => {

	test('nested selector', function () {
		let p = new SCSSParser();
		parseSelector(p, 'o1 { e1 { } }', 'e1', '{o1{…{e1}}}');
		parseSelector(p, 'o1 { e1.div { } }', 'e1', '{o1{…{e1[class=div]}}}');
		parseSelector(p, 'o1 o2 { e1 { } }', 'e1', '{o1{…{o2{…{e1}}}}}');
		parseSelector(p, 'o1, o2 { e1 { } }', 'e1', '{o1{…{e1}}}');
		parseSelector(p, 'o1 { @if $a { e1 { } } }', 'e1', '{o1{…{e1}}}');
		parseSelector(p, 'o1 { @mixin a { e1 { } } }', 'e1', '{e1}');
		parseSelector(p, 'o1 { @mixin a { e1 { } } }', 'e1', '{e1}');
	});

	test('referencing selector', function () {
		let p = new SCSSParser();
		parseSelector(p, 'o1 { &:hover { }}', '&', '{o1[:hover=]}');
		parseSelector(p, 'o1 { &:hover & { }}', '&', '{o1[:hover=]{…{o1}}}');
	});

	test('placeholders', function () {
		let p = new SCSSParser();
		parseSelector(p, '%o1 { e1 { } }', 'e1', '{%o1{…{e1}}}');
	});
});