/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';
import assert = require('assert');
import languageFacts = require('vs/languages/css/common/services/languageFacts');
import _parser = require('vs/languages/css/common/parser/cssParser');
import nodes = require ('vs/languages/css/common/parser/cssNodes');
import workerTests = require('./css-worker.test');

export function assertColor(parser: _parser.Parser, text: string, selection: string, isColor: boolean):void {
	var stylesheet = parser.parseStylesheet(workerTests.mockMirrorModel(text));
	assert.equal(0, nodes.ParseErrorCollector.entries(stylesheet).length, 'compile errors');

	var node = nodes.getNodeAtOffset(stylesheet, text.indexOf(selection));

	assert.equal(isColor, languageFacts.isColorValue(node));
}

suite('CSS language facts', () => {

	test('properties', function() {
		var properties = languageFacts.getProperties();
		var alignLast = properties['text-align-last'];

		assert.ok(alignLast !== null);
		assert.equal(alignLast.name, 'text-align-last');
		var b = alignLast.browsers;
		assert.equal(b['FF'], '12');
		assert.equal(b['IE'], '5');
		assert.equal(b['E'], '');
		assert.equal(b['count'], 3);

		assert.equal(languageFacts.getBrowserLabel(alignLast.browsers) , 'Firefox 12, IE 5');

		var r = alignLast.restrictions;

		assert.equal(r.length, 1);
		assert.equal(r[0], 'enum');

		var v = alignLast.values;
		assert.equal(v.length, 5);
		assert.equal(v[0].name, 'auto');
		assert.equal(v[0].browsers.all, true);
		assert.equal(v[0].browsers.count, Number.MAX_VALUE);
	});

	test('is color', function() {
		var parser = new _parser.Parser();
		assertColor(parser, '#main { color: red }', 'red', true);
		assertColor(parser, '#main { color: #231 }', '#231', true);
		assertColor(parser, '#main { red: 1 }', 'red', false);
		assertColor(parser, '#red { foo: 1 }', 'red', false);
	});
});

