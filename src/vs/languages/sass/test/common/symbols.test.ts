/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import parser = require('vs/languages/sass/common/parser/sassParser');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import symbolsTest = require('vs/languages/css/test/common/symbols.test');

suite('Sass - Symbols', () => {

	test('symbols in scopes', function() {
		var p = new parser.SassParser();
		symbolsTest.assertSymbolsInScope(p, '$var: iable;', 0, { name:'$var', type:nodes.ReferenceType.Variable });
		symbolsTest.assertSymbolsInScope(p, '$var: iable;', 11, { name:'$var', type:nodes.ReferenceType.Variable });
		symbolsTest.assertSymbolsInScope(p, '$var: iable; .class { $color: blue; }', 11, { name:'$var', type:nodes.ReferenceType.Variable }, { name:'.class', type:nodes.ReferenceType.Rule });
		symbolsTest.assertSymbolsInScope(p, '$var: iable; .class { $color: blue; }', 22, { name:'$color', type:nodes.ReferenceType.Variable });
		symbolsTest.assertSymbolsInScope(p, '$var: iable; .class { $color: blue; }', 36, { name:'$color', type:nodes.ReferenceType.Variable });

		symbolsTest.assertSymbolsInScope(p, '@namespace "x"; @mixin mix() {}', 0, { name:'mix', type:nodes.ReferenceType.Mixin });
		symbolsTest.assertSymbolsInScope(p, '@mixin mix { @mixin nested() {} }', 12, { name:'nested', type:nodes.ReferenceType.Mixin });
		symbolsTest.assertSymbolsInScope(p, '@mixin mix () { @mixin nested() {} }', 13);
	});

	test('scopes and symbols', function() {
		var p = new parser.SassParser();
		symbolsTest.assertScopesAndSymbols(p, '$var1: 1; $var2: 2; .foo { $var3: 3; }', '$var1,$var2,.foo,[$var3]');
		symbolsTest.assertScopesAndSymbols(p, '@mixin mixin1 { $var0: 1} @mixin mixin2($var1) { $var3: 3 }', 'mixin1,mixin2,[$var0],[$var1,$var3]');
		symbolsTest.assertScopesAndSymbols(p, 'a b { $var0: 1; c { d { } } }', '[$var0,c,[d,[]]]');
		symbolsTest.assertScopesAndSymbols(p, '@function a($p1: 1, $p2: 2) { $v1: 3; @return $v1; }', 'a,[$p1,$p2,$v1]');
		symbolsTest.assertScopesAndSymbols(p, '$var1: 3; @if $var1 == 2 { $var2: 1; } @else { $var2: 2; $var3: 2;} ', '$var1,[$var2],[$var2,$var3]');
		symbolsTest.assertScopesAndSymbols(p, '@if $var1 == 2 { $var2: 1; } @else if $var1 == 2 { $var3: 2; } @else { $var3: 2; } ', '[$var2],[$var3],[$var3]');
		symbolsTest.assertScopesAndSymbols(p, '$var1: 3; @while $var1 < 2 { #rule { a: b; } }', '$var1,[#rule,[]]');
		symbolsTest.assertScopesAndSymbols(p, '$i:0; @each $name in f1, f2, f3  { $i:$i+1; }', '$i,[$name,$i]');
		symbolsTest.assertScopesAndSymbols(p, '$i:0; @for $x from $i to 5  { }', '$i,[$x]');
	});

	test('mark occurrences', function() {
		var p = new parser.SassParser();
		symbolsTest.assertOccurrences(p, '$var1: 1; $var2: /**/$var1;', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '$var1: 1; p { $var2: /**/$var1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, 'r1 { $var1: 1; p1: $var1;} r2,r3 { $var1: 1; p1: /**/$var1 + $var1;}', '/**/', 3, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '.r1 { r1: 1em; } r2 { r1: 2em; @extend /**/.r1;}', '/**/', 2, 1, nodes.ReferenceType.Rule);
		symbolsTest.assertOccurrences(p, '/**/%r1 { r1: 1em; } r2 { r1: 2em; @extend %r1;}', '/**/', 2, 1, nodes.ReferenceType.Rule);
		symbolsTest.assertOccurrences(p, '@mixin r1 { r1: $p1; } r2 { r2: 2em; @include /**/r1; }', '/**/', 2, 1, nodes.ReferenceType.Mixin);
		symbolsTest.assertOccurrences(p, '@mixin r1($p1) { r1: $p1; } r2 { r2: 2em; @include /**/r1(2px); }', '/**/', 2, 1, nodes.ReferenceType.Mixin);
		symbolsTest.assertOccurrences(p, '$p1: 1; @mixin r1($p1: $p1) { r1: $p1; } r2 { r2: 2em; @include /**/r1; }', '/**/', 2, 1, nodes.ReferenceType.Mixin);
		symbolsTest.assertOccurrences(p, '/**/$p1: 1; @mixin r1($p1: $p1) { r1: $p1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '$p1 : 1; @mixin r1($p1) { r1: /**/$p1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '/**/$p1 : 1; @mixin r1($p1) { r1: $p1; }', '/**/', 1, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '$p1 : 1; @mixin r1(/**/$p1) { r1: $p1; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '$p1 : 1; @function r1($p1, $p2: /**/$p1) { @return $p1 + $p1 + $p2; }', '/**/', 2, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '$p1 : 1; @function r1($p1, /**/$p2: $p1) { @return $p1 + $p2 + $p2; }', '/**/', 3, 1, nodes.ReferenceType.Variable);
		symbolsTest.assertOccurrences(p, '@function r1($p1, $p2) { @return $p1 + $p2; } @function r2() { @return /**/r1(1, 2); }', '/**/', 2, 1, nodes.ReferenceType.Function);
		symbolsTest.assertOccurrences(p, '@function /**/r1($p1, $p2) { @return $p1 + $p2; } @function r2() { @return r1(1, 2); } p { x: r2(); }', '/**/', 2, 1, nodes.ReferenceType.Function);
		symbolsTest.assertOccurrences(p, '@function r1($p1, $p2) { @return $p1 + $p2; } @function r2() { @return r1(/**/$p1 : 1, $p2 : 2); } p { x: r2(); }', '/**/', 3, 1, nodes.ReferenceType.Variable);
	});
});