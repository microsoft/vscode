/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import parser = require('vs/languages/css/common/parser/cssParser');
import nodes = require('vs/languages/css/common/parser/cssNodes');
import objects = require('vs/base/common/objects');
import selectorPrinter = require('vs/languages/css/common/services/selectorPrinting');
import workerTests = require('./css-worker.test');

function elementToString(element: selectorPrinter.IElement) : string {
	var label = element.name || '';
	if (element.attributes) {
		label = label + '[';
		var needsSeparator = false;
		for (var key in element.attributes) {
			if (needsSeparator) {
				label = label + '|';
			}
			needsSeparator = true;
			label = label + key + '=' + element.attributes[key];
		}
		label = label + ']';
	}


	if (element.children) {
		label = label + '{';
		for (var index = 0; index < element.children.length; index++) {
			if (index > 0) {
				label = label + '|';
			}
			label = label +  elementToString(element.children[index]);
		}
		label = label + '}';
	}
	return label;
}

export function parseSelector(p: parser.Parser, input:string, selectorName:string, expected: string):void {
	var styleSheet = p.parseStylesheet(workerTests.mockMirrorModel(input));

	var node = nodes.getNodeAtOffset(styleSheet, input.indexOf(selectorName));
	var selector = node.findParent(nodes.NodeType.Selector);

	var element = selectorPrinter.selectorToElement(selector);
	assert.equal(elementToString(element), expected);
}

export function assertElement(p: parser.Parser, input:string, element:selectorPrinter.IElement):void {
	var node = p.internalParse(input, p._parseSimpleSelector);

	var actual = selectorPrinter.toElement(node);

	assert.ok(actual.name === element.name);
	assert.ok(objects.equals(actual.attributes, element.attributes));
}


suite('CSS - selector printing', () => {

	test('class/hash/elementname/attr', function() {
		var p = new parser.Parser();
		assertElement(p, 'element', { name: 'element' });
		assertElement(p, '.div', { attributes: { class: 'div'} });
		assertElement(p, '#first', { attributes: { id: 'first'} });
		assertElement(p, 'element.on', { name: 'element', attributes: { class: 'on'} });
		assertElement(p, 'element.on#first', { name: 'element', attributes: { class: 'on', id: 'first'} });
		assertElement(p, '.on#first', { attributes: { class: 'on', id: 'first'} });

		assertElement(p, '[lang=\'de\']', { attributes: { lang: 'de' } });
		assertElement(p, '[enabled]', { attributes: { enabled: undefined } });

	});

	test('simple selector', function() {
		var p = new parser.Parser();
		parseSelector(p, 'element { }', 'element', '{element}');
		parseSelector(p, 'element.div { }', 'element', '{element[class=div]}');
		parseSelector(p, 'element.on#first { }', 'element', '{element[class=on|id=first]}');
		parseSelector(p, 'element:hover { }', 'element', '{element[:hover=]}');
		parseSelector(p, 'element[lang=\'de\'] { }', 'element', '{element[lang=de]}');
		parseSelector(p, 'element[enabled] { }', 'element', '{element[enabled=undefined]}');
		parseSelector(p, 'element[foo~="warning"] { }', 'element', '{element[foo= … warning … ]}');
		parseSelector(p, 'element[lang|="en"] { }', 'element', '{element[lang=en-…]}');
		parseSelector(p, '* { }', '*', '{element}');
	});

	test('selector', function() {
		var p = new parser.Parser();
		parseSelector(p, 'e1 e2 { }', 'e1', '{e1{…{e2}}}');
		parseSelector(p, 'e1 .div { }', 'e1', '{e1{…{[class=div]}}}');
		parseSelector(p, 'e1 > e2 { }', 'e2', '{e1{e2}}');
		parseSelector(p, 'e1, e2 { }', 'e1', '{e1}');
		parseSelector(p, 'e1 + e2 { }', 'e2', '{e1|e2}');
		parseSelector(p, 'e1 ~ e2 { }', 'e2', '{e1|e2|⋮|e2}');
	});
});