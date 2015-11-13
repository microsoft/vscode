/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import plist = require('vs/base/node/plist');

suite('PList Parser', () => {

	var header = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
		'<plist version="1.0">'
	];

	var footer = [
		'</plist>'
	];

	function newContent(...lines: string[]) : string {
		return header.concat(lines, footer).join('\n');
	}

	test('String', function() {
		var value = newContent(
			'<string>foo</string>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: "foo" });

		var value = newContent(
			'<string></string>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: "" });

		var value = newContent(
			'<string>',
			'</string>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: "\n" });

		var value = newContent(
			'<string>&lt;foo&gt;</string>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: "<foo>" });

	});

	test('Numbers', function() {
		var value = newContent(
			'<integer>0</integer>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: 0 });

		var value = newContent(
			'<real>1.123</real>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: 1.123 });

		var value = newContent(
			'<integer>ab</integer>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: ["ab is not a integer"], value: null });
	});


	test('Booleans', function() {
		var value = newContent(
			'<true />'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: true });

		var value = newContent(
			'<false />'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: false });

		var value = newContent(
			'<false></false>'
		);
		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: false });
	});


	test('Dictionaries', function() {

		// empty
		var value = newContent(
			'<dict>',
			'</dict>'
		);

		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: {} });

		// keys and nesting
		var value = newContent(
			'<dict>',
				'<key>name</key>',
				'<string>Variable</string>',
				'<key>scope</key>',
				'<string>variable</string>',
				'<key>settings</key>',
				'<dict>',
					'<key>fontStyle</key>',
					'<string></string>',
				'</dict>',
			'</dict>'
		);

		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: { name: "Variable", scope: "variable", settings: { fontStyle: "" }}});
	});

	test('Arrays', function() {

		// empty
		var value = newContent(
			'<array>',
			'</array>'
		);

		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: {} });

		// multiple elements
		var value = newContent(
			'<array>',
				'<string>1</string>',
				'<string>2</string>',
			'</array>'
		);

		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: [ "1", "2" ]});

		// nesting
		var value = newContent(
			'<array>',
				'<array>',
					'<integer>1</integer>',
					'<integer>2</integer>',
				'</array>',
				'<array>',
					'<true />',
				'</array>',
			'</array>'
		);

		var res = plist.parse(value);
		assert.deepEqual(res, { errors: [], value: [ [ 1, 2 ], [ true ]]});
	});
});