/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { removeProperty, setProperty } from '../../common/jsonEdit.js';
import { Edit, FormattingOptions } from '../../common/jsonFormatter.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('JSON - edits', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function assertEdit(content: string, edits: Edit[], expected: string) {
		assert(edits);
		let lastEditOffset = content.length;
		for (let i = edits.length - 1; i >= 0; i--) {
			const edit = edits[i];
			assert(edit.offset >= 0 && edit.length >= 0 && edit.offset + edit.length <= content.length);
			assert(typeof edit.content === 'string');
			assert(lastEditOffset >= edit.offset + edit.length); // make sure all edits are ordered
			lastEditOffset = edit.offset;
			content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
		}
		assert.strictEqual(content, expected);
	}

	const formatterOptions: FormattingOptions = {
		insertSpaces: true,
		tabSize: 2,
		eol: '\n'
	};

	test('set property', () => {
		let content = '{\n  "x": "y"\n}';
		let edits = setProperty(content, ['x'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "x": "bar"\n}');

		content = 'true';
		edits = setProperty(content, [], 'bar', formatterOptions);
		assertEdit(content, edits, '"bar"');

		content = '{\n  "x": "y"\n}';
		edits = setProperty(content, ['x'], { key: true }, formatterOptions);
		assertEdit(content, edits, '{\n  "x": {\n    "key": true\n  }\n}');
		content = '{\n  "a": "b",  "x": "y"\n}';
		edits = setProperty(content, ['a'], null, formatterOptions);
		assertEdit(content, edits, '{\n  "a": null,  "x": "y"\n}');
	});

	test('insert property', () => {
		let content = '{}';
		let edits = setProperty(content, ['foo'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "foo": "bar"\n}');

		edits = setProperty(content, ['foo', 'foo2'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "foo": {\n    "foo2": "bar"\n  }\n}');

		content = '{\n}';
		edits = setProperty(content, ['foo'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "foo": "bar"\n}');

		content = '  {\n  }';
		edits = setProperty(content, ['foo'], 'bar', formatterOptions);
		assertEdit(content, edits, '  {\n    "foo": "bar"\n  }');

		content = '{\n  "x": "y"\n}';
		edits = setProperty(content, ['foo'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "x": "y",\n  "foo": "bar"\n}');

		content = '{\n  "x": "y"\n}';
		edits = setProperty(content, ['e'], 'null', formatterOptions);
		assertEdit(content, edits, '{\n  "x": "y",\n  "e": "null"\n}');

		edits = setProperty(content, ['x'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "x": "bar"\n}');

		content = '{\n  "x": {\n    "a": 1,\n    "b": true\n  }\n}\n';
		edits = setProperty(content, ['x'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "x": "bar"\n}\n');

		edits = setProperty(content, ['x', 'b'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": "bar"\n  }\n}\n');

		edits = setProperty(content, ['x', 'c'], 'bar', formatterOptions, () => 0);
		assertEdit(content, edits, '{\n  "x": {\n    "c": "bar",\n    "a": 1,\n    "b": true\n  }\n}\n');

		edits = setProperty(content, ['x', 'c'], 'bar', formatterOptions, () => 1);
		assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "c": "bar",\n    "b": true\n  }\n}\n');

		edits = setProperty(content, ['x', 'c'], 'bar', formatterOptions, () => 2);
		assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true,\n    "c": "bar"\n  }\n}\n');

		edits = setProperty(content, ['c'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": true\n  },\n  "c": "bar"\n}\n');

		content = '{\n  "a": [\n    {\n    } \n  ]  \n}';
		edits = setProperty(content, ['foo'], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "a": [\n    {\n    } \n  ],\n  "foo": "bar"\n}');

		content = '';
		edits = setProperty(content, ['foo', 0], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n}');

		content = '//comment';
		edits = setProperty(content, ['foo', 0], 'bar', formatterOptions);
		assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n} //comment');
	});

	test('remove property', () => {
		let content = '{\n  "x": "y"\n}';
		let edits = removeProperty(content, ['x'], formatterOptions);
		assertEdit(content, edits, '{\n}');

		content = '{\n  "x": "y", "a": []\n}';
		edits = removeProperty(content, ['x'], formatterOptions);
		assertEdit(content, edits, '{\n  "a": []\n}');

		content = '{\n  "x": "y", "a": []\n}';
		edits = removeProperty(content, ['a'], formatterOptions);
		assertEdit(content, edits, '{\n  "x": "y"\n}');
	});

	test('insert item at 0', () => {
		const content = '[\n  2,\n  3\n]';
		const edits = setProperty(content, [0], 1, formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
	});

	test('insert item at 0 in empty array', () => {
		const content = '[\n]';
		const edits = setProperty(content, [0], 1, formatterOptions);
		assertEdit(content, edits, '[\n  1\n]');
	});

	test('insert item at an index', () => {
		const content = '[\n  1,\n  3\n]';
		const edits = setProperty(content, [1], 2, formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
	});

	test('insert item at an index im empty array', () => {
		const content = '[\n]';
		const edits = setProperty(content, [1], 1, formatterOptions);
		assertEdit(content, edits, '[\n  1\n]');
	});

	test('insert item at end index', () => {
		const content = '[\n  1,\n  2\n]';
		const edits = setProperty(content, [2], 3, formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
	});

	test('insert item at end to empty array', () => {
		const content = '[\n]';
		const edits = setProperty(content, [-1], 'bar', formatterOptions);
		assertEdit(content, edits, '[\n  "bar"\n]');
	});

	test('insert item at end', () => {
		const content = '[\n  1,\n  2\n]';
		const edits = setProperty(content, [-1], 'bar', formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  2,\n  "bar"\n]');
	});

	test('remove item in array with one item', () => {
		const content = '[\n  1\n]';
		const edits = setProperty(content, [0], undefined, formatterOptions);
		assertEdit(content, edits, '[]');
	});

	test('remove item in the middle of the array', () => {
		const content = '[\n  1,\n  2,\n  3\n]';
		const edits = setProperty(content, [1], undefined, formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  3\n]');
	});

	test('remove last item in the array', () => {
		const content = '[\n  1,\n  2,\n  "bar"\n]';
		const edits = setProperty(content, [2], undefined, formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  2\n]');
	});

	test('remove last item in the array if ends with comma', () => {
		const content = '[\n  1,\n  "foo",\n  "bar",\n]';
		const edits = setProperty(content, [2], undefined, formatterOptions);
		assertEdit(content, edits, '[\n  1,\n  "foo"\n]');
	});

	test('remove last item in the array if there is a comment in the beginning', () => {
		const content = '// This is a comment\n[\n  1,\n  "foo",\n  "bar"\n]';
		const edits = setProperty(content, [2], undefined, formatterOptions);
		assertEdit(content, edits, '// This is a comment\n[\n  1,\n  "foo"\n]');
	});

});
