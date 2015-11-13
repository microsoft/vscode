/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import parser = require('vs/languages/less/common/parser/lessParser');
import symbols = require('vs/languages/css/common/parser/cssSymbols');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import symbolsTest = require('vs/languages/css/test/common/symbols.test');

suite('LESS - Symbols', () => {

	test('scope building', function() {
		var p = new parser.LessParser();
		symbolsTest.assertScopeBuilding(p, '@var: blue');
		symbolsTest.assertScopeBuilding(p, '.class { .nested {} }', { offset: 7, length: 14 }, { offset: 17, length: 2 });
	});

	test('symbols in scopes', function() {
		var p = new parser.LessParser();
		symbolsTest.assertSymbolsInScope(p, '@var: iable;', 0, { name:'@var', type:nodes.ReferenceType.Variable });
		symbolsTest.assertSymbolsInScope(p, '@var: iable;', 11, { name:'@var', type:nodes.ReferenceType.Variable });
		symbolsTest.assertSymbolsInScope(p, '@var: iable; .class { @color: blue; }', 11, { name:'@var', type:nodes.ReferenceType.Variable }, { name:'.class', type:nodes.ReferenceType.Rule });
		symbolsTest.assertSymbolsInScope(p, '@var: iable; .class { @color: blue; }', 21, { name:'@color', type:nodes.ReferenceType.Variable });
		symbolsTest.assertSymbolsInScope(p, '@var: iable; .class { @color: blue; }', 36, { name:'@color', type:nodes.ReferenceType.Variable });

		symbolsTest.assertSymbolsInScope(p, '@namespace "x"; .mixin() {}', 0, { name:'.mixin', type:nodes.ReferenceType.Mixin });
		symbolsTest.assertSymbolsInScope(p, '.mixin() { .nested() {} }', 10, { name:'.nested', type:nodes.ReferenceType.Mixin });
		symbolsTest.assertSymbolsInScope(p, '.mixin() { .nested() {} }', 11);

		symbolsTest.assertSymbolsInScope(p, '@keyframes animation {};', 0, { name:'animation', type:nodes.ReferenceType.Keyframe });
	});

	test('scopes and symbols', function() {
		var p = new parser.LessParser();
		symbolsTest.assertScopesAndSymbols(p, '@var1: 1; @var2: 2; .foo { @var3: 3; }', '@var1,@var2,.foo,[@var3]');
		symbolsTest.assertScopesAndSymbols(p, '.mixin1 { @var0: 1} .mixin2(@var1) { @var3: 3 }', '.mixin1,.mixin2,[@var0],[@var1,@var3]');
		symbolsTest.assertScopesAndSymbols(p, 'a b { @var0: 1; c { d { } } }', '[@var0,c,[d,[]]]');
	});

	test('mark occurrences', function() {
		var p = new parser.LessParser();
		symbolsTest.assertOccurrences(p, '@var1: 1; @var2: /**/@var1;', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '@var1: 1; p { @var2: /**/@var1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, 'r1 { @var1: 1; p1: @var1;} r2,r3 { @var1: 1; p1: /**/@var1 + @var1;}', '/**/', 3, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '.r1 { r1: 1em; } r2 { r1: 2em; /**/.r1;}', '/**/', 2, 1, nodes.ReferenceType.Rule);
		symbolsTest.assertOccurrences(p, '.r1(@p1) { r1: @p1; } r2 { r1: 2em; /**/.r1(2px); }', '/**/', 2, 1, nodes.ReferenceType.Mixin);
		symbolsTest.assertOccurrences(p, '/**/.r1(@p1) { r1: @p1; } r2 { r1: 2em; .r1(2px); }', '/**/', 2, 1, nodes.ReferenceType.Mixin);
		symbolsTest.assertOccurrences(p, '@p1 : 1; .r1(@p1) { r1: /**/@p1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '/**/@p1 : 1; .r1(@p1) { r1: @p1; }', '/**/', 1, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '@p1 : 1; .r1(/**/@p1) { r1: @p1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
	});
});