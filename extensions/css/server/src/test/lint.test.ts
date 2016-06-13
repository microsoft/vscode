/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as nodes from '../parser/cssNodes';
import {Parser} from '../parser/cssParser';
import {LintVisitor} from '../services/lint';
import {Rule, Rules} from '../services/lintRules';
import {TextDocument} from 'vscode-languageserver';

export function assertEntries(node: nodes.Node, rules: nodes.IRule[]): void {

	let visitor = new LintVisitor();
	node.accept(visitor);

	let entries = visitor.getEntries(nodes.Level.Error | nodes.Level.Warning | nodes.Level.Ignore);
	assert.equal(entries.length, rules.length);

	for (let entry of entries) {
		let idx = rules.indexOf(entry.getRule());
		rules.splice(idx, 1);
	}
	assert.equal(rules.length, 0);
}

function assertStyleSheet(input: string, ...rules: Rule[]): void {
	let p = new Parser();
	let document = TextDocument.create('test://test/test.css', 'css', 0, input);
	let node = p.parseStylesheet(document);

	assertEntries(node, rules);
}

function assertRuleSet(input: string, ...rules: Rule[]): void {
	let p = new Parser();
	let node = p.internalParse(input, p._parseRuleset);
	assertEntries(node, rules);
}


function assertFontFace(input: string, ...rules: Rule[]): void {
	let p = new Parser();
	let node = p.internalParse(input, p._parseFontFace);
	assertEntries(node, rules);
}

suite('CSS - Lint', () => {

	test('universal selector, empty rule', function () {
		assertRuleSet('* { color: perty }', Rules.UniversalSelector);
		assertRuleSet('*, div { color: perty }', Rules.UniversalSelector);
		assertRuleSet('div, * { color: perty }', Rules.UniversalSelector);
		assertRuleSet('div > * { color: perty }', Rules.UniversalSelector);
		assertRuleSet('div + * { color: perty }', Rules.UniversalSelector);
	});

	test('empty ruleset', function () {
		assertRuleSet('selector {}', Rules.EmptyRuleSet);
	});

	test('properies ignored due to inline ', function () {
		assertRuleSet('selector { display: inline; height: 100px; }', Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; width: 100px; }', Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; margin-top: 1em; }', Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; margin-bottom: 1em; }', Rules.PropertyIgnoredDueToDisplay);
		assertRuleSet('selector { display: inline; float: right; }', Rules.PropertyIgnoredDueToDisplay, Rules.AvoidFloat);
		assertRuleSet('selector { display: inline-block; float: right; }', Rules.PropertyIgnoredDueToDisplay, Rules.AvoidFloat);
		assertRuleSet('selector { display: block; vertical-align: center; }', Rules.PropertyIgnoredDueToDisplay);
	});

	test('avoid !important', function () {
		assertRuleSet('selector { display: inline !important; }', Rules.AvoidImportant);
	});

	test('avoid float', function () {
		assertRuleSet('selector { float: right; }', Rules.AvoidFloat);
	});

	test('avoid id selectors', function () {
		assertRuleSet('#selector {  display: inline; }', Rules.AvoidIdSelector);
	});

	test('zero with unit', function () {
		//	assertRuleSet('selector { width: 0px }', lint.Rules.ZeroWithUnit);
		assertRuleSet('selector { width: 0% }');
	});

	test('duplicate declarations', function () {
		assertRuleSet('selector { color: perty; color: perty }', Rules.DuplicateDeclarations, Rules.DuplicateDeclarations);
		assertRuleSet('selector { color: -o-perty; color: perty }');
	});

	test('unknown properties', function () {
		assertRuleSet('selector { -ms-property: "rest is missing" }', Rules.UnknownVendorSpecificProperty);
		assertRuleSet('selector { -moz-box-shadow: "rest is missing" }', Rules.UnknownVendorSpecificProperty, Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
		assertRuleSet('selector { box-shadow: none }'); // no error
		assertRuleSet('selector { box-property: "rest is missing" }', Rules.UnknownProperty);

	});

	test('IE hacks', function () {
		assertRuleSet('selector { display: inline-block; *display: inline; }', Rules.IEStarHack);
		assertRuleSet('selector { background: #00f; /* all browsers including Mac IE */ *background: #f00; /* IE 7 and below */ _background: #f60; /* IE 6 and below */  }', Rules.IEStarHack, Rules.IEStarHack);
	});

	test('vendor specific prefixes', function () {
		assertRuleSet('selector { -moz-animation: none }', Rules.AllVendorPrefixes, Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
		assertRuleSet('selector { -moz-transform: none; transform: none }', Rules.AllVendorPrefixes);
		assertRuleSet('selector { transform: none; }');
		assertRuleSet('selector { -moz-transform: none; transform: none; -o-transform: none; -webkit-transform: none; -ms-transform: none; }');
		assertRuleSet('selector { --transform: none; }');
	});

	test('font-face required properties', function () {
		assertFontFace('@font-face {  }', Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { src: url(test.tff) }', Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { font-family: \'name\' }', Rules.RequiredPropertiesForFontFace);
		assertFontFace('@font-face { src: url(test.tff); font-family: \'name\' }'); // no error
	});

	test('keyframes', function () {
		assertStyleSheet('@keyframes foo { }');
		assertStyleSheet('@keyframes foo { } @-moz-keyframes foo { }', Rules.AllVendorPrefixes);
		assertStyleSheet('@-moz-keyframes foo { }', Rules.AllVendorPrefixes, Rules.IncludeStandardPropertyWhenUsingVendorPrefix);
	});
});
