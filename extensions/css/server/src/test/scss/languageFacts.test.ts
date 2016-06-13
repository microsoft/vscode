/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {SCSSParser} from '../../parser/scssParser';
import {assertColor} from '../css/languageFacts.test';

suite('SCSS - Language facts', () => {

	test('is color', function () {
		let parser = new SCSSParser();
		assertColor(parser, '#main { color: foo(red) }', 'red', true);
		assertColor(parser, '#main { color: red() }', 'red', false);
		assertColor(parser, '#main { red { nested: 1px } }', 'red', false);
		assertColor(parser, '#main { @include red; }', 'red', false);
		assertColor(parser, '#main { @include foo($f: red); }', 'red', true);
		assertColor(parser, '@function red($p) { @return 1px; }', 'red', false);
		assertColor(parser, '@function foo($p) { @return red; }', 'red', true);
		assertColor(parser, '@function foo($r: red) { @return $r; }', 'red', true);
	});
});

