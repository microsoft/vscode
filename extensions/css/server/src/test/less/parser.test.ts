/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Parser} from '../../parser/cssParser';
import {TokenType} from '../../parser/cssScanner';
import * as nodes from '../../parser/cssNodes';
import {ParseError} from '../../parser/cssErrors';
import {LESSParser} from '../../parser/lessParser';

import {assertNode, assertNoNode, assertError} from '../css/parser.test';

suite('LESS - Parser', () => {

	test('Variable', function() {
		let parser = new LESSParser();
		assertNode('@color', parser, parser._parseVariable.bind(parser));
		assertNode('@co42lor', parser, parser._parseVariable.bind(parser));
		assertNode('@-co42lor', parser, parser._parseVariable.bind(parser));
		assertNode('@@foo', parser, parser._parseVariable.bind(parser));
		assertNode('@@@foo', parser, parser._parseVariable.bind(parser));
		assertNode('@12ooo', parser, parser._parseVariable.bind(parser));
		assertNoNode('@ @foo', parser, parser._parseFunction.bind(parser));
		assertNoNode('@-@foo', parser, parser._parseFunction.bind(parser));
	});

	test('Media', function() {
		let parser = new LESSParser();
		assertNode('@media @phone {}', parser, parser._parseMedia.bind(parser));
	});

	test('VariableDeclaration', function() {
		let parser = new LESSParser();
		assertNode('@color: #F5F5F5', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 0', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 255', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 25.5', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 25px', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@color: 25.5px', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@primary-font: "wf_SegoeUI","Segoe UI","Segoe","Segoe WP"', parser, parser._parseVariableDeclaration.bind(parser));
		assertNode('@greeting: `"hello".toUpperCase() + "!";`', parser, parser._parseVariableDeclaration.bind(parser));
	});

	test('MixinDeclaration', function() {
		let parser = new LESSParser();
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

	test('MixinReference', function() {
		let parser = new LESSParser();
		assertNode('.box-shadow(0 0 5px, 30%)', parser, parser._parseMixinReference.bind(parser));
		assertNode('.box-shadow', parser, parser._parseMixinReference.bind(parser));
		assertNode('.mixin(10) !important', parser, parser._parseMixinReference.bind(parser));
	});

	test('MixinParameter', function() {
		let parser = new LESSParser();
		assertNode('@_', parser, parser._parseMixinParameter.bind(parser));
		assertNode('@let: value', parser, parser._parseMixinParameter.bind(parser));
		assertNode('@let', parser, parser._parseMixinParameter.bind(parser));
		assertNode('@rest...', parser, parser._parseMixinParameter.bind(parser));
		assertNode('...', parser, parser._parseMixinParameter.bind(parser));
		assertNode('value', parser, parser._parseMixinParameter.bind(parser));
		assertNode('"string"', parser, parser._parseMixinParameter.bind(parser));
		assertNode('50%', parser, parser._parseMixinParameter.bind(parser));
	});

	test('Parser - function', function() {
		let parser = new LESSParser();
		assertNode('%()', parser, parser._parseFunction.bind(parser));
		assertNoNode('% ()', parser, parser._parseFunction.bind(parser));

	});

	test('Expr', function() {
		let parser = new LESSParser();
		assertNode('(@let + 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@let - 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@let * 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@let / 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 - @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 * @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 / @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 / 20 + @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + 20 + @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + 20 + 20 + @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20 + @let + 20 + 20 + @let)', parser, parser._parseExpr.bind(parser));
		assertNode('(20 + 20)', parser, parser._parseExpr.bind(parser));
		assertNode('(@var1 + @var2)', parser, parser._parseExpr.bind(parser));
		assertNode('((@let + 5) * 2)', parser, parser._parseExpr.bind(parser));
		assertNode('((@let + (5 + 2)) * 2)', parser, parser._parseExpr.bind(parser));
		assertNode('(@let + ((5 + 2) * 2))', parser, parser._parseExpr.bind(parser));
		assertNode('@color', parser, parser._parseExpr.bind(parser));
		assertNode('@color, @color', parser, parser._parseExpr.bind(parser));
		assertNode('@color, 42%', parser, parser._parseExpr.bind(parser));
		assertNode('@color, 42%, @color', parser, parser._parseExpr.bind(parser));
		assertNode('@color - (@color + 10%)', parser, parser._parseExpr.bind(parser));
		assertNode('(@base + @filler)', parser, parser._parseExpr.bind(parser));
		assertNode('(100% / 2 + @filler)', parser, parser._parseExpr.bind(parser));
		assertNode('100% / 2 + @filler', parser, parser._parseExpr.bind(parser));
	});

	test('LessOperator', function() {
		let parser = new LESSParser();
		assertNode('>=', parser, parser._parseOperator.bind(parser));
		assertNode('>', parser, parser._parseOperator.bind(parser));
		assertNode('<', parser, parser._parseOperator.bind(parser));
		assertNode('=<', parser, parser._parseOperator.bind(parser));
	});

	test('Extend', function() {
		let parser = new LESSParser();
		assertNode('nav { &:extend(.inline); }', parser, parser._parseRuleset.bind(parser));
	});

	test('Declaration', function() {
		let parser = new LESSParser();
		assertNode('border: thin solid 1px', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: @color', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: blue', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: (20 / @let)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: (20 / 20 + @let)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: func(@red)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: desaturate(@red, 10%)', parser, parser._parseDeclaration.bind(parser));
		assertNode('dummy: desaturate(16, 10%)', parser, parser._parseDeclaration.bind(parser));

		assertNode('color: @base-color + #111', parser, parser._parseDeclaration.bind(parser));
		assertNode('color: 100% / 2 + @ref', parser, parser._parseDeclaration.bind(parser));
		assertNode('border: (@width * 2) solid black', parser, parser._parseDeclaration.bind(parser));
		assertNode('property: @class', parser, parser._parseDeclaration.bind(parser));
		assertNode('prop-erty: fnc(@t, 10%)', parser, parser._parseDeclaration.bind(parser));
	});

	test('Stylesheet', function() {
		let parser = new LESSParser();
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
		assertError('@import-once () "hello";', parser, parser._parseStylesheet.bind(parser), ParseError.IdentifierExpected);
		assertError('@import-once (less);', parser, parser._parseStylesheet.bind(parser), ParseError.URIOrStringExpected);
	});

	test('Ruleset', function() {
		let parser = new LESSParser();
		assertNode('.selector { prop: erty @let 1px; }', parser, parser._parseRuleset.bind(parser));
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

	test('term', function() {
		let parser = new LESSParser();
		assertNode('%(\'repetitions: %S file: %S\', 1 + 2, "directory/file.less")', parser, parser._parseTerm.bind(parser));
		assertNode('~"ms:alwaysHasItsOwnSyntax.For.Stuff()"', parser, parser._parseTerm.bind(parser)); // less syntax
	});

	test('Nested Ruleset', function() {
		let parser = new LESSParser();
		assertNode('.class1 { @let: 1; .class { @let: 2; three: @let; let: 3; } one: @let; }', parser, parser._parseRuleset.bind(parser));
		assertNode('.class1 { @let: 1; > .class2 { display: none; } }', parser, parser._parseRuleset.bind(parser));
	});

	test('Selector Interpolation', function() {
		let parser = new LESSParser();
		assertNode('.@{name} { }', parser, parser._parseRuleset.bind(parser));
		assertNode('~"@{name}" { }', parser, parser._parseRuleset.bind(parser));
		assertError('~{ }', parser, parser._parseStylesheet.bind(parser), ParseError.StringLiteralExpected);
		assertError('@', parser, parser._parseSelectorInterpolation.bind(parser), ParseError.LeftCurlyExpected);
		assertError('@{', parser, parser._parseSelectorInterpolation.bind(parser), ParseError.IdentifierExpected);
		assertError('@{dd', parser, parser._parseSelectorInterpolation.bind(parser), ParseError.RightCurlyExpected);
	});

	test('Selector Combinator', function() {
		let parser = new LESSParser();
		assertNode('&:hover', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&.float', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&-foo', parser, parser._parseSimpleSelector.bind(parser));
		assertNode('&--&', parser, parser._parseSimpleSelector.bind(parser));
	});
});