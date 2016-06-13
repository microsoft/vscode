/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as languageFacts from '../../services/languageFacts';
import {Parser} from '../../parser/cssParser';
import * as nodes from '../../parser/cssNodes';
import {TextDocument} from 'vscode-languageserver';

export function assertColor(parser: Parser, text: string, selection: string, isColor: boolean): void {
	let document = TextDocument.create('test://test/test.css', 'css', 0, text);
	let stylesheet = parser.parseStylesheet(document);
	assert.equal(0, nodes.ParseErrorCollector.entries(stylesheet).length, 'compile errors');

	let node = nodes.getNodeAtOffset(stylesheet, text.indexOf(selection));

	assert.equal(isColor, languageFacts.isColorValue(node));
}

suite('CSS - Language Facts', () => {

	test('properties', function () {
		let properties = languageFacts.getProperties();
		let alignLast = properties['text-align-last'];

		assert.ok(alignLast !== null);
		assert.equal(alignLast.name, 'text-align-last');
		let b = alignLast.browsers;
		assert.equal(b['FF'], '12');
		assert.equal(b['IE'], '5');
		assert.equal(b['E'], '');
		assert.equal(b['C'], void 0);
		assert.equal(b['count'], 3);

		assert.equal(languageFacts.getBrowserLabel(alignLast.browsers), 'Edge, Firefox 12, IE 5');

		let r = alignLast.restrictions;

		assert.equal(r.length, 1);
		assert.equal(r[0], 'enum');

		let v = alignLast.values;
		assert.equal(v.length, 5);
		assert.equal(v[0].name, 'auto');
		assert.equal(v[0].browsers.all, true);
		assert.equal(v[0].browsers.count, Number.MAX_VALUE);
	});

	test('is color', function () {
		let parser = new Parser();
		assertColor(parser, '#main { color: red }', 'red', true);
		assertColor(parser, '#main { color: #231 }', '#231', true);
		assertColor(parser, '#main { red: 1 }', 'red', false);
		assertColor(parser, '#red { foo: 1 }', 'red', false);
	});
});

