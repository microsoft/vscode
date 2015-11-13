/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import _parser = require('vs/languages/less/common/parser/lessParser');
import nodes = require ('vs/languages/css/common/parser/cssNodes');
import errors = require ('vs/languages/css/common/parser/cssErrors');

import cssParserTests = require ('vs/languages/css/test/common/parser.test');


function assertNode(text: string, parser: _parser.LessParser, f: ()=>nodes.Node):void {
	cssParserTests.assertNode(text, parser, f);
}

function assertNoNode(text: string, parser: _parser.LessParser, f: ()=>nodes.Node):void {
	cssParserTests.assertNoNode(text, parser, f);
}

function assertError(text: string, parser: _parser.LessParser, f: ()=>nodes.Node, error: nodes.IRule):void {
	cssParserTests.assertError(text, parser, f, error);
}

suite('LESS - LESS Parser', () => {

	test('LESS Parser - Variable', function() {
		var parser = new _parser.LessParser();
		assertNode('@color', parser, parser._parseVariable.bind(parser));
		assertNode('@co42lor', parser, parser._parseVariable.bind(parser));
		assertNode('@-co42lor', parser, parser._parseVariable.bind(parser));
		assertNode('@@foo', parser, parser._parseVariable.bind(parser));
		assertNode('@@@foo', parser, parser._parseVariable.bind(parser));
		assertNoNode('@ @foo', parser, parser._parseFunction.bind(parser));
		assertNoNode('@-@foo', parser, parser._parseFunction.bind(parser));
	});

	test('LESS Parser - Media', function() {
		var parser = new _parser.LessParser();
		assertNode('@media @phone {}', parser, parser._parseMedia.bind(parser));
	});

	test('LESS Parser - VariableDeclaration', function() {
		var parser = new _parser.LessParser();
		assertNode('@color: #F5F5F5', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 0', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 255', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 25.5', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 25px', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 25.5px', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@primary-font: "wf_SegoeUI","Segoe UI","Segoe","Segoe WP"', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@greeting: `"hello".toUpperCase() + "!";`', parser, parser._parseVariableDeclaration.bind(parser));
	});

	test('LESS Parser - MixinDeclaration', function() {
		var parser = new _parser.LessParser();
		assertNode('.color (@color: 25.5px) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.color(@color: 25.5px) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.color(@color) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.color(@color; @border) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.color() { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.color( ) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.mixin (@a) when (@a > 10), (@a < -10) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.mixin (@a) when (isnumber(@a)) and (@a > 0) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.mixin (@b) when not (@b >= 0) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.mixin (@b) when not (@b > 0) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.mixin (@a, @rest...) { }', parser, parser._tryParseMixinDeclaration.bind(parser));
		assertNode('.mixin (@a) when (lightness(@a) >= 50%) { }', parser, parser._tryParseMixinDeclaration.bind(parser));

	});

	test('LESS Parser - MixinReference', function() {
		var parser = new _parser.LessParser();
		assertNode('.box-shadow(0 0 5px, 30%)', parser, parser._parseMixinReference.bind(parser));
		assertNode('.box-shadow', parser, parser._parseMixinReference.bind(parser));
		assertNode('.mixin(10) !important', parser, parser._parseMixinReference.bind(parser));
	});

	test('LESS Parser - MixinParameter', function() {
		var parser = new _parser.LessParser();
		assertNode('@_', parser, parser._parseMixinParameter.bind(parser));
		assertNode('@var: value', parser, parser._parseMixinParameter.bind(parser));
		assertNode('@var', parser, parser._parseMixinParameter.bind(parser));
		assertNode('@rest...', parser, parser._parseMixinParameter.bind(parser));
		assertNode('...', parser, parser._parseMixinParameter.bind(parser));
		assertNode('value', parser, parser._parseMixinParameter.bind(parser));
		assertNode('"string"', parser, parser._parseMixinParameter.bind(parser));
		assertNode('50%', parser, parser._parseMixinParameter.bind(parser));
	});

	test('Parser - function', function() {
		var parser = new _parser.LessParser();
		assertNode('%()', parser, parser._parseFunction.bind(parser));
		assertNoNode('% ()', parser, parser._parseFunction.bind(parser));

	});

	test('LESS Parser - Expr', function() {
		var parser = new _parser.LessParser();
		assertNode('(@var + 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@var - 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@var * 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@var / 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 - @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 * @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 / @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 / 20 + @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + 20 + @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + 20 + 20 + @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + @var + 20 + 20 + @var)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@var1 + @var2)', parser, parser._parseExpr.bind(parser));
		assertNode('((@var + 5) * 2)', parser, parser._parseExpr.bind(parser));
		assertNode('((@var + (5 + 2)) * 2)', parser, parser._parseExpr.bind(parser));
		assertNode('(@var + ((5 + 2) * 2))', parser, parser._parseExpr.bind(parser));
		assertNode('@color', parser, parser._parseExpr.bind(parser));
		assertNode('@color, @color', parser, parser._parseExpr.bind(parser));
		assertNode('@color, 42%', parser, parser._parseExpr.bind(parser));
		assertNode('@color, 42%, @color', parser, parser._parseExpr.bind(parser));
		assertNode('@color - (@color + 10%)', parser, parser._parseExpr.bind(parser));
		assertNode('(@base + @filler)', parser, parser._parseExpr.bind(parser));
		assertNode('(100% / 2 + @filler)', parser, parser._parseExpr.bind(parser));
		assertNode('100% / 2 + @filler', parser, parser._parseExpr.bind(parser));
	});

	test('LESS Parser - LessOperator', function() {
		var parser = new _parser.LessParser();
		assertNode('>=', parser, parser._parseOperator.bind(parser));
		assertNode('>', parser, parser._parseOperator.bind(parser));
		assertNode('<', parser, parser._parseOperator.bind(parser));
		assertNode('=<', parser, parser._parseOperator.bind(parser));
	});

	test('LESS Parser - Extend', function() {
		var parser = new _parser.LessParser();
		assertNode('nav { &:extend(.inline); }', parser, parser._parseRuleset.bind(parser));
	});

	test('LESS Parser - Declaration', function() {
		var parser = new _parser.LessParser();
		assertNode('border: thin solid 1px', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: @color', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: blue', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: (20 / @var)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: (20 / 20 + @var)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: func(@red)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: desaturate(@red, 10%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: desaturate(16, 10%)', parser, parser._parseDeclaration.bind(parser));

		assertNode('color: @base-color + #111', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: 100% / 2 + @ref', parser, parser._parseDeclaration.bind(parser));
		assertNode('border: (@width * 2) solid black', parser, parser._parseDeclaration.bind(parser));
		assertNode('property: @class', parser, parser._parseDeclaration.bind(parser));
		assertNode('prop-erty: fnc(@t, 10%)', parser, parser._parseDeclaration.bind(parser));
	});

	test('LESS Parser - Stylesheet', function() {
		var parser = new _parser.LessParser();
		assertNode('.color (@radius: 5px){ -border-radius: #F5F5F5 }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.color (@radius: 5px){ -border-radius: @radius }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.color (@radius: 5px){ -border-radius: #F5F5F5 } .color (@radius: 5px) { -border-radius: #F5F5F5 }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.color (@radius: 5px) { -border-radius: #F5F5F5 } .color (@radius: 5px) { -border-radius: #F5F5F5 } .color (@radius: 5px) { -border-radius: #F5F5F5 }', parser, parser._parseStylesheet.bind(parser));
		assertNode('.color (@radius: 5px) { -border-radius: #F5F5F5 } .color (@radius: 5px) { -border-radius: #F5F5F5 } .color (@radius: 5px) { -border-radius: #F5F5F5 }', parser, parser._parseStylesheet.bind(parser));

		assertNode('.mixin (@a, @rest...) {}', parser, parser._parseStylesheet.bind(parser));
		assertNode('.mixin (@a) when (lightness(@a) >= 50%) {  background-color: black;}', parser, parser._parseStylesheet.bind(parser));
		assertNode('.some-mixin { font-weight:bold; } h1 { .some-mixin; font-size:40px; }', parser, parser._parseStylesheet.bind(parser));

		assertNode('@color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('@color: #F5F5F5; @color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('@color: #F5F5F5; @color: #F5F5F5; @color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('@color: #F5F5F5; .color (@radius: 5px)  { -border-radius: #F5F5F5 } @color: #F5F5F5;', parser, parser._parseStylesheet.bind(parser));
		assertNode('@import-once "lib";', parser, parser._parseStylesheet.bind(parser));
		assertNode('@import-once (css) "hello";', parser, parser._parseStylesheet.bind(parser));
		assertError('@import-once () "hello";', parser, parser._parseStylesheet.bind(parser), errors.ParseError.IdentifierExpected);
		assertError('@import-once (less);', parser, parser._parseStylesheet.bind(parser), errors.ParseError.URIOrStringExpected);
	});

	test('LESS Parser - Ruleset', function() {
		var parser = new _parser.LessParser();
		assertNode('.selector { prop: erty @var 1px; }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { .mixin; }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { .mixin(1px); .mixin(blue, 1px, \'farboo\') }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { .mixin(blue; 1px;\'farboo\') }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector:active { property:value; nested:hover {}}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector {}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { property: declaration }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { @variable: declaration }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { nested {}}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { nested, a, b {}}', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { property: value; property: value; }', parser, parser._parseRuleset.bind(parser));
		assertNode('selector { property: value; @keyframes foo {} @-moz-keyframes foo {}}', parser, parser._parseRuleset.bind(parser));
	});

	test('LESS Parser - term', function() {
		var parser = new _parser.LessParser();
		assertNode('%(\'repetitions: %S file: %S\', 1 + 2, "directory/file.less")', parser, parser._parseTerm.bind(parser));
		assertNode('~"ms:alwaysHasItsOwnSyntax.For.Stuff()"', parser, parser._parseTerm.bind(parser)); // less syntax
	});

	test('LESS Parser - Nested Ruleset', function() {
		var parser = new _parser.LessParser();
		assertNode('.class1 { @var: 1; .class { @var: 2; three: @var; var: 3; } one: @var; }', parser, parser._parseRuleset.bind(parser));
		assertNode('.class1 { @var: 1; > .class2 { display: none; } }', parser, parser._parseRuleset.bind(parser));
	});

	test('LESS Parser - Selector Interpolation', function() {
		var parser = new _parser.LessParser();
		assertNode('.@{name} { }', parser, parser._parseRuleset.bind(parser));
		assertNode('~"@{name}" { }', parser, parser._parseRuleset.bind(parser));
		assertError('~{ }', parser, parser._parseStylesheet.bind(parser), errors.ParseError.StringLiteralExpected);
		assertError('@', parser, parser._parseSelectorInterpolation.bind(parser), errors.ParseError.LeftCurlyExpected);
		assertError('@{', parser, parser._parseSelectorInterpolation.bind(parser), errors.ParseError.IdentifierExpected);
		assertError('@{dd', parser, parser._parseSelectorInterpolation.bind(parser), errors.ParseError.RightCurlyExpected);
	});

	test('LESS Parser - Selector Combinator', function() {
		var parser = new _parser.LessParser();
		assertNode('&:hover', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&.float', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&-foo', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&--&', parser, parser._parseSimpleSelector.bind(parser));
	});
});