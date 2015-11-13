/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import _parser = require('vs/languages/sass/common/parser/sassParser');
import nodes = require ('vs/languages/css/common/parser/cssNodes');
import errors = require ('vs/languages/css/common/parser/cssErrors');
import sassErrors = require('vs/languages/sass/common/parser/sassErrors');

import cssParserTests = require('vs/languages/css/test/common/parser.test');


function assertNode(text: string, parser: _parser.SassParser, f: ()=>nodes.Node):void {
	cssParserTests.assertNode(text, parser, f);
}

function assertError(text: string, parser: _parser.SassParser, f: ()=>nodes.Node, error: nodes.IRule):void {
	cssParserTests.assertError(text, parser, f, error);
}

suite('Sass - Sass Parser', () => {

	test('Sass Parser - comments', function() {
		var parser = new _parser.SassParser();
		assertNode(' a { b:  /* comment */ c }', parser, parser._parseStylesheet.bind(parser));
		assertNode(' a { b: /* comment \n * is several\n * lines long\n */ c }', parser, parser._parseStylesheet.bind(parser));
		assertNode(' a { b: // single line comment\n  c }', parser, parser._parseStylesheet.bind(parser));
	});

	test('Sass Parser - Variable', function() {
		var parser = new _parser.SassParser();
		assertNode('$color', parser, parser._parseVariable.bind(parser));
		assertNode('$co42lor', parser, parser._parseVariable.bind(parser));
		assertNode('$-co42lor', parser, parser._parseVariable.bind(parser));
	});

	test('Sass Parser - VariableDeclaration', function() {
		var parser = new _parser.SassParser();
		assertNode('$color: #F5F5F5', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('$color: 0', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('$color: 255', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('$color: 25.5', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('$color: 25px', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('$color: 25.5px !default', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('$primary-font: "wf_SegoeUI","Segoe UI","Segoe","Segoe WP"', parser, parser._parseVariableDeclaration.bind(parser));
		assertError('$color: red !def', parser, parser._parseVariableDeclaration.bind(parser), errors.ParseError.UnknownKeyword);
		assertError('$color : !default', parser, parser._parseVariableDeclaration.bind(parser), errors.ParseError.VariableValueExpected);
		assertError('$color !default', parser, parser._parseVariableDeclaration.bind(parser), errors.ParseError.ColonExpected);
	});

	test('Sass Parser - Expr', function() {
		var parser = new _parser.SassParser();
		assertNode('($var + 20)', parser, parser._parseExpr.bind(parser));
		assertNode('($var - 20)', parser, parser._parseExpr.bind(parser));
		assertNode('($var * 20)', parser, parser._parseExpr.bind(parser));
		assertNode('($var / 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 - $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 * $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 / $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 / 20 + $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + 20 + $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + 20 + 20 + $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + $var + 20 + 20 + $var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20)', parser, parser._parseExpr.bind(parser));
		assertNode('($var1 + $var2)', parser, parser._parseExpr.bind(parser));
		assertNode('(($var + 5) * 2)', parser, parser._parseExpr.bind(parser));
		assertNode('(($var + (5 + 2)) * 2)', parser, parser._parseExpr.bind(parser));
		assertNode('($var + ((5 + 2) * 2))', parser, parser._parseExpr.bind(parser));
		assertNode('$color', parser, parser._parseExpr.bind(parser));
		assertNode('$color, $color', parser, parser._parseExpr.bind(parser));
		assertNode('$color, 42%', parser, parser._parseExpr.bind(parser));
		assertNode('$color, 42%, $color', parser, parser._parseExpr.bind(parser));
		assertNode('$color - ($color + 10%)', parser, parser._parseExpr.bind(parser));
		assertNode('($base + $filler)', parser, parser._parseExpr.bind(parser));
		assertNode('(100% / 2 + $filler)', parser, parser._parseExpr.bind(parser));
		assertNode('100% / 2 + $filler', parser, parser._parseExpr.bind(parser));
		assertNode('not ($v and $b) or $c', parser, parser._parseExpr.bind(parser));

		assertError('(20 + 20', parser, parser._parseExpr.bind(parser), errors.ParseError.RightParenthesisExpected);
	});

	test('Sass Parser - SassOperator', function() {
		var parser = new _parser.SassParser();
	    assertNode('>=', parser, parser._parseOperator.bind(parser));
	    assertNode('>', parser, parser._parseOperator.bind(parser));
	    assertNode('<', parser, parser._parseOperator.bind(parser));
	    assertNode('<=', parser, parser._parseOperator.bind(parser));
	    assertNode('==', parser, parser._parseOperator.bind(parser));
	    assertNode('!=', parser, parser._parseOperator.bind(parser));
		assertNode('and', parser, parser._parseOperator.bind(parser));
		assertNode('+', parser, parser._parseOperator.bind(parser));
		assertNode('-', parser, parser._parseOperator.bind(parser));
		assertNode('*', parser, parser._parseOperator.bind(parser));
		assertNode('/', parser, parser._parseOperator.bind(parser));
		assertNode('%', parser, parser._parseOperator.bind(parser));
		assertNode('not', parser, parser._parseUnaryOperator.bind(parser));
	});

	test('Sass Parser - Interpolation', function() {
		var parser = new _parser.SassParser();
		assertNode('#{red}', parser, parser._parseIdent.bind(parser));
		assertNode('#{$color}', parser, parser._parseIdent.bind(parser));
		assertNode('#{3 + 4}', parser, parser._parseIdent.bind(parser));
		assertNode('#{3 + #{3 + 4}}', parser, parser._parseIdent.bind(parser));
		assertNode('#{$d}-style: 0', parser, parser._parseDeclaration.bind(parser));
		assertNode('foo-#{$d}: 1', parser, parser._parseDeclaration.bind(parser));
		assertNode('#{$d}-bar-#{$d}: 2', parser, parser._parseDeclaration.bind(parser));
		assertNode('foo-#{$d}-bar: 1', parser, parser._parseDeclaration.bind(parser));
		assertNode('#{$d}-#{$d}: 2', parser, parser._parseDeclaration.bind(parser));
		assertNode('&:nth-child(#{$query}+1) { clear: $opposite-direction; }', parser, parser._parseRuleset.bind(parser));
		assertError('#{}', parser, parser._parseIdent.bind(parser), errors.ParseError.ExpressionExpected);
		assertError('#{1 + 2', parser, parser._parseIdent.bind(parser), errors.ParseError.RightCurlyExpected);
	});

	test('Sass Parser - Declaration', function() {
		var parser = new _parser.SassParser();
		assertNode('border: thin solid 1px', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: $color', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: blue', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: (20 / $var)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: (20 / 20 + $var)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: func($red)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: desaturate($red, 10%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: desaturate(16, 10%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: $base-color + #111', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: 100% / 2 + $ref', parser, parser._parseDeclaration.bind(parser));
		assertNode('border: ($width * 2) solid black', parser, parser._parseDeclaration.bind(parser));
		assertNode('property: $class', parser, parser._parseDeclaration.bind(parser));
		assertNode('prop-erty: fnc($t, 10%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('width: (1em + 2em) * 3', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: #010203 + #040506', parser, parser._parseDeclaration.bind(parser));
		assertNode('font-family: sans- + "serif"', parser, parser._parseDeclaration.bind(parser));
		assertNode('margin: 3px + 4px auto', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: hsl(0, 100%, 50%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: hsl($hue: 0, $saturation: 100%, $lightness: 50%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('foo: if($value == \'default\', flex-gutter(), $value)', parser, parser._parseDeclaration.bind(parser));

		assertError('fo = 8', parser, parser._parseDeclaration.bind(parser), errors.ParseError.ColonExpected);
		assertError('fo:', parser, parser._parseDeclaration.bind(parser), errors.ParseError.PropertyValueExpected);
		assertError('color: hsl($hue: 0,', parser, parser._parseDeclaration.bind(parser), errors.ParseError.ExpressionExpected);
		assertError('color: hsl($hue: 0', parser, parser._parseDeclaration.bind(parser), errors.ParseError.RightParenthesisExpected);
	});

	test('Sass Parser - Stylesheet', function() {
		var parser = new _parser.SassParser();
		assertNode('$color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('$color: #F5F5F5; $color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('$color: #F5F5F5; $color: #F5F5F5; $color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('#main { width: 97%; p, div { a { font-weight: bold; } } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('a { &:hover { color: red; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('fo { font: 2px/3px { family: fantasy; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.foo { bar: { yoo: fantasy; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('selector { propsuffix: { nested: 1px; } rule: 1px; nested.selector { foo: 1; } nested:selector { foo: 2 }}', parser, parser._parseStylesheet.bind(parser));
		assertNode('legend {foo{a:s}margin-top:0;margin-bottom:#123;margin-top:s(1)}', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin keyframe { @keyframes name { @content; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@include keyframe { 10% { top: 3px; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.class{&--sub-class-with-ampersand{color: red;}}', parser, parser._parseStylesheet.bind(parser));
		assertError('fo { font: 2px/3px { family } }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.ColonExpected);
	});

	test('Sass Parser - @import', function() {
		var parser = new _parser.SassParser();
		assertNode('@import "test.css"', parser, parser._parseImport.bind(parser));
		assertNode('@import url("test.css")', parser, parser._parseImport.bind(parser));
		assertNode('@import "test.css", "bar.css"', parser, parser._parseImport.bind(parser));
		assertNode('@import "test.css", "bar.css" screen, projection', parser, parser._parseImport.bind(parser));
		assertNode('foo { @import "test.css"; }', parser, parser._parseStylesheet.bind(parser));

		assertError('@import "test.css" "bar.css"', parser, parser._parseStylesheet.bind(parser), errors.ParseError.SemiColonExpected);
		assertError('@import "test.css", screen', parser, parser._parseImport.bind(parser), errors.ParseError.URIOrStringExpected);
		assertError('@import', parser, parser._parseImport.bind(parser), errors.ParseError.URIOrStringExpected);
	});

	test('Sass Parser - @media', function() {
		var parser = new _parser.SassParser();
		assertNode('@media screen { .sidebar { @media (orientation: landscape) { width: 500px; } } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@media #{$media} and ($feature: $value)  {}', parser, parser._parseStylesheet.bind(parser));
		assertNode('foo { bar { @media screen and (orientation: landscape) {}} }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@media screen and (nth($query, 1): nth($query, 2)) { }', parser, parser._parseMedia.bind(parser));
	});

	test('Sass Parser - @keyframe', function() {
		var parser = new _parser.SassParser();
		assertNode('@keyframes name { @content; }', parser, parser._parseKeyframe.bind(parser));
	});

	test('Sass Parser - @extend', function() {
		var parser = new _parser.SassParser();
		assertNode('foo { @extend .error; border-width: 3px; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('a.important { @extend .notice !optional; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.hoverlink { @extend a:hover; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.seriousError {  @extend .error; @extend .attention; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('#context a%extreme { color: blue; }  .notice { @extend %extreme }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@media print { .error {  } .seriousError { @extend .error; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin error($a: false) { @extend .#{$a}; @extend ##{$a}; }', parser, parser._parseStylesheet.bind(parser));

		assertError('.hoverlink { @extend }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.SelectorExpected);
		assertError('.hoverlink { @extend %extreme !default }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.UnknownKeyword);
	});

	test('Sass Parser - @debug', function() {
		var parser = new _parser.SassParser();
		assertNode('@debug test;', parser, parser._parseStylesheet.bind(parser));
		assertNode('foo { @debug 1 + 4; nested { @warn 1 4; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@if $foo == 1 { @debug 1 + 4 }', parser, parser._parseStylesheet.bind(parser));
	});

	test('Sass Parser - @if', function() {
		var parser = new _parser.SassParser();
		assertNode('@if 1 + 1 == 2 { border: 1px solid;  }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('@if 5 < 3      { border: 2px dotted; }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('@if null       { border: 3px double; }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('@if 1 <= $var { border: 3px; } @else { border: 4px; }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('@if 1 >= (1 + $foo) { border: 3px; } @else if 1 + 1 == 2 { border: 4px; }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('p { @if $i == 1 { x: 3px; } @else if $i == 1 { x: 4px; } @else { x: 4px; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@if $i == 1 { p { x: 3px; } }', parser, parser._parseStylesheet.bind(parser));
		assertError('@if { border: 1px solid;  }', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.ExpressionExpected);
		assertError('@if 1 }', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.LeftCurlyExpected);
	});

	test('Sass Parser - @for', function() {
		var parser = new _parser.SassParser();
		assertNode('@for $i from 1 to 5 { .item-#{$i} { width: 2em * $i; }  }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('@for $k from 1 + $x through 5 + $x {  }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertError('@for i from 0 to 4 {}', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.VariableNameExpected);
		assertError('@for $i to 4 {}', parser, parser._parseRuleSetDeclaration.bind(parser), sassErrors.ParseError.FromExpected);
		assertError('@for $i from 0 by 4 {}', parser, parser._parseRuleSetDeclaration.bind(parser), sassErrors.ParseError.ThroughOrToExpected);
		assertError('@for $i from {}', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.ExpressionExpected);
		assertError('@for $i from 0 to {}', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.ExpressionExpected);
	});

	test('Sass Parser - @each', function() {
		var parser = new _parser.SassParser();
		assertNode('@each $i in 1, 2, 3 { }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertNode('@each $i in 1 2 3 { }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertError('@each i in 4 {}', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.VariableNameExpected);
		assertError('@each $i from 4 {}', parser, parser._parseRuleSetDeclaration.bind(parser), sassErrors.ParseError.InExpected);
		assertError('@each $i in {}', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.ExpressionExpected);
	});

	test('Sass Parser - @while', function() {
		var parser = new _parser.SassParser();
		assertNode('@while $i < 0 { .item-#{$i} { width: 2em * $i; } $i: $i - 2; }', parser, parser._parseRuleSetDeclaration.bind(parser));
		assertError('@while {}', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.ExpressionExpected);
		assertError('@while $i != 4', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.LeftCurlyExpected);
		assertError('@while ($i >= 4) {', parser, parser._parseRuleSetDeclaration.bind(parser), errors.ParseError.RightCurlyExpected);
	});

	test('Sass Parser - @mixin', function() {
		var parser = new _parser.SassParser();
		assertNode('@mixin large-text { font: { family: Arial; size: 20px; } color: #ff0000; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin sexy-border($color, $width: 1in) { color: black; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin box-shadow($shadows...) { -moz-box-shadow: $shadows; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin apply-to-ie6-only {  * html { @content; } }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin #{foo}($color){}', parser, parser._parseStylesheet.bind(parser));
		assertNode('@mixin foo ($i:4) { size: $i; @include wee ($i - 1); }', parser, parser._parseStylesheet.bind(parser));
		assertError('@mixin $1 {}', parser, parser._parseStylesheet.bind(parser), errors.ParseError.IdentifierExpected);
		assertError('@mixin foo() i {}', parser, parser._parseStylesheet.bind(parser), errors.ParseError.LeftCurlyExpected);
		assertError('@mixin foo(1) {}', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightParenthesisExpected);
		assertError('@mixin foo($color = 9) {}', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightParenthesisExpected);
		assertError('@mixin foo($color)', parser, parser._parseStylesheet.bind(parser), errors.ParseError.LeftCurlyExpected);
		assertError('@mixin foo($color){', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightCurlyExpected);
		assertError('@mixin foo($color,){', parser, parser._parseStylesheet.bind(parser), errors.ParseError.VariableNameExpected);
	});

	test('Sass Parser - @include', function() {
		var parser = new _parser.SassParser();
		assertNode('p { @include sexy-border(blue); }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.shadows { @include box-shadow(0px 4px 5px #666, 2px 6px 10px #999); }', parser, parser._parseStylesheet.bind(parser));
		assertNode('$values: #ff0000, #00ff00, #0000ff; .primary { @include colors($values...); }', parser, parser._parseStylesheet.bind(parser));
		assertNode('p {  @include apply-to-ie6-only { #logo { background-image: url(/logo.gif); } } }', parser, parser._parseStylesheet.bind(parser));
		assertError('p { @include sexy-border blue', parser, parser._parseStylesheet.bind(parser), errors.ParseError.SemiColonExpected);
		assertError('p { @include sexy-border($values blue', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightParenthesisExpected);
		assertError('p { @include }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.IdentifierExpected);
		assertError('p { @include foo($values }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightParenthesisExpected);
		assertError('p { @include foo($values, }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.ExpressionExpected);

	});

	test('Sass Parser - @function', function() {
		var parser = new _parser.SassParser();
		assertNode('@function grid-width($n) { @return $n * $grid-width + ($n - 1) * $gutter-width; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@function grid-width($n: 1, $e) { @return 0; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@function foo($total, $a) { @for $i from 0 to $total { } @return $grid; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@function foo() { @if (unit($a) == "%") and ($i == ($total - 1)) { @return 0; } @return 1; }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@function is-even($int) { @if $int%2 == 0 { @return true; } @return false }', parser, parser._parseStylesheet.bind(parser));
		assertNode('@function bar ($i) { @if $i > 0 { @return $i * bar($i - 1); } @return 1; }', parser, parser._parseStylesheet.bind(parser));
		assertError('@function foo {} ', parser, parser._parseStylesheet.bind(parser), errors.ParseError.LeftParenthesisExpected);
		assertError('@function {} ', parser, parser._parseStylesheet.bind(parser), errors.ParseError.IdentifierExpected);
		assertError('@function foo($a $b) {} ', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightParenthesisExpected);
		assertError('@function foo($a {} ', parser, parser._parseStylesheet.bind(parser), errors.ParseError.RightParenthesisExpected);
		assertError('@function foo($a...) { @return; }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.ExpressionExpected);
		assertError('@function foo($a,) {} ', parser, parser._parseStylesheet.bind(parser), errors.ParseError.VariableNameExpected);
		assertError('@function foo($a:) {} ', parser, parser._parseStylesheet.bind(parser), errors.ParseError.VariableValueExpected);

	});

	test('Sass Parser - Ruleset', function() {
		var parser = new _parser.SassParser();
		assertNode('.selector { prop: erty $var 1px; }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector:active { property:value; nested:hover {}}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector {}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { property: declaration }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { $variable: declaration }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { nested {}}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { nested, a, b {}}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { property: value; property: $value; }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { property: value; @keyframes foo {} @-moz-keyframes foo {}}', parser, parser._parseRuleset.bind(parser));
	});

	test('Sass Parser - Nested Ruleset', function() {
		var parser = new _parser.SassParser();
		assertNode('.class1 { $var: 1; .class { $var: 2; three: $var; var: 3; } one: $var; }', parser, parser._parseRuleset.bind(parser));
		assertNode('.class1 { > .class2 { & > .class4 { rule1: v1; } } }', parser, parser._parseRuleset.bind(parser));
	});

	test('Sass Parser - Selector Interpolation', function() {
		var parser = new _parser.SassParser();
		assertNode('.#{$name} { }', parser, parser._parseRuleset.bind(parser));
		assertNode('p.#{$name} { #{$attr}-color: blue; }', parser, parser._parseRuleset.bind(parser));
		assertNode('sans-#{serif} { a-#{1 + 2}-color-#{$attr}: blue; }', parser, parser._parseRuleset.bind(parser));
		assertNode('##{f} .#{f} #{f}:#{f} { }', parser, parser._parseRuleset.bind(parser));
	});

	test('Sass Parser - Parent Selector', function() {
		var parser = new _parser.SassParser();
		assertNode('&:hover', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&.float', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&-bar', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&&', parser, parser._parseSimpleSelector.bind(parser));
	});

	test('Sass Parser - Selector Placeholder', function() {
		var parser = new _parser.SassParser();
		assertNode('%hover', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('a%float', parser, parser._parseSimpleSelector.bind(parser));
	});
});