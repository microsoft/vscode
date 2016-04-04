/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');
import {Range} from 'vs/editor/common/core/range';
import {Model} from 'vs/editor/common/model/model';
import ModesTestUtils = require('vs/editor/test/common/modesTestUtils');
import Formatter = require('vs/languages/json/common/features/jsonFormatter');
import MirrorModel = require('vs/editor/common/model/mirrorModel');
import assert = require('assert');

suite('JSON - formatter', () => {

	function format(unformatted: string, expected: string, insertSpaces = true) {
		var range : EditorCommon.IRange = null;

		var mirrorModel = MirrorModel.createTestMirrorModelFromString(unformatted);

		var rangeStart = unformatted.indexOf('|');
		var rangeEnd = unformatted.lastIndexOf('|');
		if (rangeStart !== -1 && rangeEnd !== -1) {
			unformatted = unformatted.substring(0, rangeStart) + unformatted.substring(rangeStart + 1, rangeEnd) + unformatted.substring(rangeEnd + 1);

			var startPos = mirrorModel.getPositionFromOffset(rangeStart);
			var endPos = mirrorModel.getPositionFromOffset(rangeEnd);
			range = { startLineNumber: startPos.lineNumber, startColumn: startPos.column, endLineNumber: endPos.lineNumber, endColumn: endPos.column };
			mirrorModel = MirrorModel.createTestMirrorModelFromString(unformatted);
		}

		var operations = Formatter.format(mirrorModel, range, { tabSize: 2, insertSpaces: insertSpaces });

		var model = new Model(unformatted, Model.DEFAULT_CREATION_OPTIONS, null);
		model.pushEditOperations([], operations.map(o => {
			return {
				range: Range.lift(o.range),
				text: o.text,
				identifier: null,
				forceMoveMarkers: false
			};
		}), () => []);
		var newContent = model.getValue(EditorCommon.EndOfLinePreference.LF);
		assert.equal(newContent, expected);
		model.dispose();
	}

	test('object - single property', () => {
		var content = [
			'{"x" : 1}'
		].join('\n');

		var expected = [
			'{',
			'  "x": 1',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('object - multiple properties', () => {
		var content = [
			'{"x" : 1,  "y" : "foo", "z"  : true}'
		].join('\n');

		var expected = [
			'{',
			'  "x": 1,',
			'  "y": "foo",',
			'  "z": true',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('object - no properties ', () => {
		var content = [
			'{"x" : {    },  "y" : {}}'
		].join('\n');

		var expected = [
			'{',
			'  "x": {},',
			'  "y": {}',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('object - nesting', () => {
		var content = [
			'{"x" : {  "y" : { "z"  : { }}, "a": true}}'
		].join('\n');

		var expected = [
			'{',
			'  "x": {',
			'    "y": {',
			'      "z": {}',
			'    },',
			'    "a": true',
			'  }',
			'}'
		].join('\n');

		format(content, expected);
	});

	test('array - single items', () => {
		var content = [
			'["[]"]'
		].join('\n');

		var expected = [
			'[',
			'  "[]"',
			']'
		].join('\n');

		format(content, expected);
	});

	test('array - multiple items', () => {
		var content = [
			'[true,null,1.2]'
		].join('\n');

		var expected = [
			'[',
			'  true,',
			'  null,',
			'  1.2',
			']'
		].join('\n');

		format(content, expected);
	});

	test('array - no items', () => {
		var content = [
			'[      ]'
		].join('\n');

		var expected = [
			'[]'
		].join('\n');

		format(content, expected);
	});

	test('array - nesting', () => {
		var content = [
			'[ [], [ [ {} ], "a" ]  ]'
		].join('\n');

		var expected = [
			'[',
			'  [],',
			'  [',
			'    [',
			'      {}',
			'    ],',
			'    "a"',
			'  ]',
			']',
		].join('\n');

		format(content, expected);
	});

	test('syntax errors', () => {
		var content = [
			'[ null 1.2 ]'
		].join('\n');

		var expected = [
			'[',
			'  null 1.2',
			']',
		].join('\n');

		format(content, expected);
	});

	test('empty lines', () => {
		var content = [
			'{',
			'"a": true,',
			'',
			'"b": true',
			'}',
		].join('\n');

		var expected = [
			'{',
			'\t"a": true,',
			'\t"b": true',
			'}',
		].join('\n');

		format(content, expected, false);
	});
	test('single line comment', () => {
		var content = [
			'[ ',
			'//comment',
			'"foo", "bar"',
			'] '
		].join('\n');

		var expected = [
			'[',
			'  //comment',
			'  "foo",',
			'  "bar"',
			']',
		].join('\n');

		format(content, expected);
	});
	test('block line comment', () => {
		var content = [
			'[{',
			'        /*comment*/     ',
			'"foo" : true',
			'}] '
		].join('\n');

		var expected = [
			'[',
			'  {',
			'    /*comment*/',
			'    "foo": true',
			'  }',
			']',
		].join('\n');

		format(content, expected);
	});
	test('single line comment on same line', () => {
		var content = [
			' {  ',
			'        "a": {}// comment    ',
			' } '
		].join('\n');

		var expected = [
			'{',
			'  "a": {} // comment    ',
			'}',
		].join('\n');

		format(content, expected);
	});
	test('block comment on same line', () => {
		var content = [
			'{      "a": {}, /*comment*/    ',
			'        /*comment*/ "b": {},    ',
			'        "c": {/*comment*/}    } ',
		].join('\n');

		var expected = [
			'{',
			'  "a": {}, /*comment*/',
			'  /*comment*/ "b": {},',
			'  "c": { /*comment*/}',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('block comment on same line advanced', () => {
		var content = [
			' {       "d": [',
			'             null',
			'        ] /*comment*/',
			'        ,"e": /*comment*/ [null] }',
		].join('\n');

		var expected = [
			'{',
			'  "d": [',
			'    null',
			'  ] /*comment*/,',
			'  "e": /*comment*/ [',
			'    null',
			'  ]',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('multiple block comments on same line', () => {
		var content = [
			'{      "a": {} /*comment*/, /*comment*/   ',
			'        /*comment*/ "b": {}  /*comment*/  } '
		].join('\n');

		var expected = [
			'{',
			'  "a": {} /*comment*/, /*comment*/',
			'  /*comment*/ "b": {} /*comment*/',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('range', () => {
		var content = [
			'{ "a": {},',
			'|"b": [null, null]|',
			'} '
		].join('\n');

		var expected = [
			'{ "a": {},',
			'"b": [',
			'  null,',
			'  null',
			']',
			'} ',
		].join('\n');

		format(content, expected);
	});

	test('range with existing indent', () => {
		var content = [
			'{ "a": {},',
			'   |"b": [null],',
			'"c": {}',
			'} |'
		].join('\n');

		var expected = [
			'{ "a": {},',
			'  "b": [',
			'    null',
			'  ],',
			'  "c": {}',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('range with existing indent - tabs', () => {
		var content = [
			'{ "a": {},',
			'|  "b": [null],   ',
			'"c": {}',
			'} |    '
		].join('\n');

		var expected = [
			'{ "a": {},',
			'\t"b": [',
			'\t\tnull',
			'\t],',
			'\t"c": {}',
			'}',
		].join('\n');

		format(content, expected, false);
	});


	test('block comment none-line breaking symbols', () => {
		var content = [
			'{ "a": [ 1',
			'/* comment */',
			', 2',
			'/* comment */',
			']',
			'/* comment */',
			',',
			' "b": true',
			'/* comment */',
			'}'
		].join('\n');

		var expected = [
			'{',
			'  "a": [',
			'    1',
			'    /* comment */',
			'    ,',
			'    2',
			'    /* comment */',
			'  ]',
			'  /* comment */',
			'  ,',
			'  "b": true',
			'  /* comment */',
			'}',
		].join('\n');

		format(content, expected);
	});
	test('line comment after none-line breaking symbols', () => {
		var content = [
			'{ "a":',
			'// comment',
			'null,',
			' "b"',
			'// comment',
			': null',
			'// comment',
			'}'
		].join('\n');

		var expected = [
			'{',
			'  "a":',
			'  // comment',
			'  null,',
			'  "b"',
			'  // comment',
			'  : null',
			'  // comment',
			'}',
		].join('\n');

		format(content, expected);
	});
});