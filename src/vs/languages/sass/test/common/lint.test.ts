/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import lintRules = require('vs/languages/css/common/services/lintRules');
import cssLintTest = require('vs/languages/css/test/common/lint.test');
import parser = require('vs/languages/sass/common/parser/sassParser');

function assertFontFace(input:string, ...rules:lintRules.Rule[]) : void {
	var p = new parser.SassParser();
	var node = p.internalParse(input, p._parseFontFace);

	cssLintTest.assertEntries(node, rules);
}

function assertRuleSet(input:string, ...rules:lintRules.Rule[]) : void {
	var p = new parser.SassParser();
	var node = p.internalParse(input, p._parseRuleset);
	cssLintTest.assertEntries(node, rules);
}

suite('Sass - Lint', () => {

	test('empty ruleset', function() {
		assertRuleSet('selector { color: red; nested {} }', lintRules.Rules.EmptyRuleSet);
	});

	test('font-face required properties', function() {
		assertFontFace('@font-face {  }', lintRules.Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { src: url(test.tff) }', lintRules.Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { font-family: \'name\' }', lintRules.Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { font-#{family}: foo }'); // no error, ignore all unknown properties
		assertFontFace('@font-face { font: {family: foo } }'); // no error, ignore all nested properties
		assertFontFace('@font-face { @if true { } }'); // no error, ignore all nested properties
	});

	test('unknown properties', function() {
		assertRuleSet('selector { -ms-property: "rest is missing" }', lintRules.Rules.UnknownProperty);
		assertRuleSet('selector { -moz-box-shadow: "rest is missing" }', lintRules.Rules.UnknownProperty, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
		assertRuleSet('selector { box-shadow: none }'); // no error
		assertRuleSet('selector { -moz-#{box}-shadow: none }'); // no error if theres an interpolation
		assertRuleSet('selector { outer: { nested : blue }'); // no error for nested
	});

	test('vendor specific prefixes', function() {
		assertRuleSet('selector { -moz-animation: none }', lintRules.Rules.AllVendorPrefixes, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
		assertRuleSet('selector { -moz-transform: none; transform: none }', lintRules.Rules.AllVendorPrefixes);
		assertRuleSet('selector { -moz-transform: none; transform: none; -o-transform: none; -webkit-transform: none; -ms-transform: none; }');
	});
});
