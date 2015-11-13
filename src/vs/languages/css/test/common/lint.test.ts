/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import parser = require('vs/languages/css/common/parser/cssParser');
import lint = require('vs/languages/css/common/services/lint');
import lintRules = require('vs/languages/css/common/services/lintRules');
import _level = require('vs/languages/css/common/level');
import workerTests = require('./css-worker.test');

export function assertEntries(node:nodes.Node, rules:nodes.IRule[]) : void {

	var visitor = new lint.LintVisitor();
	node.accept(visitor);

	var entries = visitor.getEntries(_level.Level.Error | _level.Level.Warning | _level.Level.Ignore);
	assert.equal(entries.length, rules.length);

	for (var i = 0; i < entries.length; i++) {
		var entry = entries[i],
			idx:number = rules.indexOf(entry.getRule());

		rules.splice(idx, 1);
	}
	assert.equal(rules.length, 0);
}

function assertStyleSheet(input:string, ...rules:lintRules.Rule[]) : void {
	var p = new parser.Parser();
	var node = p.parseStylesheet(workerTests.mockMirrorModel(input));

	assertEntries(node, rules);
}

function assertRuleSet(input:string, ...rules:lintRules.Rule[]) : void {
	var p = new parser.Parser();
	var node = p.internalParse(input, p._parseRuleset);
	assertEntries(node, rules);
}


function assertFontFace(input:string, ...rules:lintRules.Rule[]) : void {
	var p = new parser.Parser();
	var node = p.internalParse(input, p._parseFontFace);
	assertEntries(node, rules);
}

suite('CSS - Lint', () => {

	test('universal selector, empty rule', function() {
		assertRuleSet('* { color: perty }', lintRules.Rules.UniversalSelector);
		assertRuleSet('*, div { color: perty }', lintRules.Rules.UniversalSelector);
		assertRuleSet('div, * { color: perty }', lintRules.Rules.UniversalSelector);
		assertRuleSet('div > * { color: perty }', lintRules.Rules.UniversalSelector);
		assertRuleSet('div + * { color: perty }', lintRules.Rules.UniversalSelector);
	});

	test('empty ruleset', function() {
		assertRuleSet('selector {}', lintRules.Rules.EmptyRuleSet);
	});

	test('properies ignored due to inline ', function() {
		assertRuleSet('selector { display: inline; height: 100px; }', lintRules.Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; width: 100px; }', lintRules.Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; margin-top: 1em; }', lintRules.Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; margin-bottom: 1em; }', lintRules.Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; float: right; }', lintRules.Rules.PropertyIgnoredDueToDisplay, lintRules.Rules.AvoidFloat);
		assertRuleSet('selector { display: inline-block; float: right; }', lintRules.Rules.PropertyIgnoredDueToDisplay, lintRules.Rules.AvoidFloat);
		assertRuleSet('selector { display: block; vertical-align: center; }', lintRules.Rules.PropertyIgnoredDueToDisplay);
	});

	test('avoid !important', function() {
		assertRuleSet('selector { display: inline !important; }', lintRules.Rules.AvoidImportant);
	});

	test('avoid float', function() {
		assertRuleSet('selector { float: right; }', lintRules.Rules.AvoidFloat);
	});

	test('avoid id selectors', function() {
		assertRuleSet('#selector {  display: inline; }', lintRules.Rules.AvoidIdSelector);
	});

	test('zero with unit', function() {
	//	assertRuleSet('selector { width: 0px }', lint.Rules.ZeroWithUnit);
		assertRuleSet('selector { width: 0% }');
	});

	test('duplicate declarations', function() {
		assertRuleSet('selector { color: perty; color: perty }', lintRules.Rules.DuplicateDeclarations, lintRules.Rules.DuplicateDeclarations);
		assertRuleSet('selector { color: -o-perty; color: perty }');
	});

	test('unknown properties', function() {
		assertRuleSet('selector { -ms-property: "rest is missing" }', lintRules.Rules.UnknownVendorSpecificProperty);
		assertRuleSet('selector { -moz-box-shadow: "rest is missing" }', lintRules.Rules.UnknownVendorSpecificProperty, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
		assertRuleSet('selector { box-shadow: none }'); // no error
		assertRuleSet('selector { box-property: "rest is missing" }', lintRules.Rules.UnknownProperty);

	});

	test('IE hacks', function() {
		assertRuleSet('selector { display: inline-block; *display: inline; }', lintRules.Rules.IEStarHack);
		assertRuleSet('selector { background: #00f; /* all browsers including Mac IE */ *background: #f00; /* IE 7 and below */ _background: #f60; /* IE 6 and below */  }', lintRules.Rules.IEStarHack, lintRules.Rules.IEStarHack);
	});

	test('vendor specific prefixes', function() {
		assertRuleSet('selector { -moz-animation: none }', lintRules.Rules.AllVendorPrefixes, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
		assertRuleSet('selector { -moz-transform: none; transform: none }', lintRules.Rules.AllVendorPrefixes);
		assertRuleSet('selector { transform: none; }');
		assertRuleSet('selector { -moz-transform: none; transform: none; -o-transform: none; -webkit-transform: none; -ms-transform: none; }');
		assertRuleSet('selector { --transform: none; }');
	});

	test('font-face required properties', function() {
		assertFontFace('@font-face {  }', lintRules.Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { src: url(test.tff) }', lintRules.Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { font-family: \'name\' }', lintRules.Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { src: url(test.tff); font-family: \'name\' }'); // no error
	});

	test('keyframes', function() {
		assertStyleSheet('@keyframes foo { }');
		assertStyleSheet('@keyframes foo { } @-moz-keyframes foo { }', lintRules.Rules.AllVendorPrefixes);
		assertStyleSheet('@-moz-keyframes foo { }', lintRules.Rules.AllVendorPrefixes, lintRules.Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
	});
});
