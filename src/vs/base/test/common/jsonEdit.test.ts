/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { FormattingOptions, Edit } from 'vs/base/common/jsonFormatter';
import { setProperty, removeProperty } from 'vs/base/common/jsonEdit';
import assert = require('assert');

suite('JSON - edits', () => {

	function assertEdit(content: string, edits: Edit[], expected: string) {
		assert(edits);
		let lastEditOffset = content.length;
		for (let i = edits.length - 1; i >= 0; i--) {
			let edit = edits[i];
			assert(edit.offset >= 0 && edit.length >= 0 && edit.offset + edit.length <= content.length);
			assert(typeof edit.content === 'string');
			assert(lastEditOffset >= edit.offset + edit.length); // make sure all edits are ordered
			lastEditOffset = edit.offset;
			content = content.substring(0, edit.offset) + edit.content + content.substring(edit.offset + edit.length);
		}
		assert.equal(content, expected);
	}

	let formatterOptions: FormattingOptions = {
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
		assertEdit(content, edits, '{\n  "foo": [\n    "bar"\n  ]\n} //comment\n');
	});

	test('remove property', () => {
		let content = '{\n  "x": "y"\n}';
		let edits = removeProperty(content, ['x'], formatterOptions);
		assertEdit(content, edits, '{}');

		content = '{\n  "x": "y", "a": []\n}';
		edits = removeProperty(content, ['x'], formatterOptions);
		assertEdit(content, edits, '{\n  "a": []\n}');

		content = '{\n  "x": "y", "a": []\n}';
		edits = removeProperty(content, ['a'], formatterOptions);
		assertEdit(content, edits, '{\n  "x": "y"\n}');
	});
});