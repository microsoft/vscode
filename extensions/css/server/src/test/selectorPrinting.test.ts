/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Parser} from '../parser/cssParser';
import * as nodes from '../parser/cssNodes';
import * as selectorPrinter from '../services/selectorPrinting';
import {TextDocument} from 'vscode-languageserver';

function elementToString(element: selectorPrinter.Element): string {
	let label = element.name || '';
	if (element.attributes) {
		label = label + '[';
		let needsSeparator = false;
		for (let key in element.attributes) {
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
		for (let index = 0; index < element.children.length; index++) {
			if (index > 0) {
				label = label + '|';
			}
			label = label + elementToString(element.children[index]);
		}
		label = label + '}';
	}
	return label;
}

export function parseSelector(p: Parser, input: string, selectorName: string, expected: string): void {
	let document = TextDocument.create('test://test/test.css', 'css', 0, input);
	let styleSheet = p.parseStylesheet(document);

	let node = nodes.getNodeAtOffset(styleSheet, input.indexOf(selectorName));
	let selector = node.findParent(nodes.NodeType.Selector);

	let element = selectorPrinter.selectorToElement(selector);
	assert.equal(elementToString(element), expected);
}

export interface ExpectedElement {
	name?: string;
	attributes?: { [name: string]: string; };
}

export function assertElement(p: Parser, input: string, element: ExpectedElement): void {
	let node = p.internalParse(input, p._parseSimpleSelector);

	let actual = selectorPrinter.toElement(node);

	assert.equal(actual.name, element.name);
	assert.deepEqual(actual.attributes, element.attributes);
}


suite('CSS - Selector Printing', () => {

	test('class/hash/elementname/attr', function () {
		let p = new Parser();
		assertElement(p, 'element', { name: 'element' });
		assertElement(p, '.div', { attributes: { class: 'div' } });
		assertElement(p, '#first', { attributes: { id: 'first' } });
		assertElement(p, 'element.on', { name: 'element', attributes: { class: 'on' } });
		assertElement(p, 'element.on#first', { name: 'element', attributes: { class: 'on', id: 'first' } });
		assertElement(p, '.on#first', { attributes: { class: 'on', id: 'first' } });

		assertElement(p, '[lang=\'de\']', { attributes: { lang: 'de' } });
		assertElement(p, '[enabled]', { attributes: { enabled: undefined } });

	});

	test('simple selector', function () {
		let p = new Parser();
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

	test('selector', function () {
		let p = new Parser();
		parseSelector(p, 'e1 e2 { }', 'e1', '{e1{…{e2}}}');
		parseSelector(p, 'e1 .div { }', 'e1', '{e1{…{[class=div]}}}');
		parseSelector(p, 'e1 > e2 { }', 'e2', '{e1{e2}}');
		parseSelector(p, 'e1, e2 { }', 'e1', '{e1}');
		parseSelector(p, 'e1 + e2 { }', 'e2', '{e1|e2}');
		parseSelector(p, 'e1 ~ e2 { }', 'e2', '{e1|e2|⋮|e2}');
	});
});