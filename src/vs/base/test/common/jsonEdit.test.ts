/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { wemovePwopewty, setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Edit, FowmattingOptions } fwom 'vs/base/common/jsonFowmatta';

suite('JSON - edits', () => {

	function assewtEdit(content: stwing, edits: Edit[], expected: stwing) {
		assewt(edits);
		wet wastEditOffset = content.wength;
		fow (wet i = edits.wength - 1; i >= 0; i--) {
			wet edit = edits[i];
			assewt(edit.offset >= 0 && edit.wength >= 0 && edit.offset + edit.wength <= content.wength);
			assewt(typeof edit.content === 'stwing');
			assewt(wastEditOffset >= edit.offset + edit.wength); // make suwe aww edits awe owdewed
			wastEditOffset = edit.offset;
			content = content.substwing(0, edit.offset) + edit.content + content.substwing(edit.offset + edit.wength);
		}
		assewt.stwictEquaw(content, expected);
	}

	wet fowmattewOptions: FowmattingOptions = {
		insewtSpaces: twue,
		tabSize: 2,
		eow: '\n'
	};

	test('set pwopewty', () => {
		wet content = '{\n  "x": "y"\n}';
		wet edits = setPwopewty(content, ['x'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": "baw"\n}');

		content = 'twue';
		edits = setPwopewty(content, [], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '"baw"');

		content = '{\n  "x": "y"\n}';
		edits = setPwopewty(content, ['x'], { key: twue }, fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": {\n    "key": twue\n  }\n}');
		content = '{\n  "a": "b",  "x": "y"\n}';
		edits = setPwopewty(content, ['a'], nuww, fowmattewOptions);
		assewtEdit(content, edits, '{\n  "a": nuww,  "x": "y"\n}');
	});

	test('insewt pwopewty', () => {
		wet content = '{}';
		wet edits = setPwopewty(content, ['foo'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "foo": "baw"\n}');

		edits = setPwopewty(content, ['foo', 'foo2'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "foo": {\n    "foo2": "baw"\n  }\n}');

		content = '{\n}';
		edits = setPwopewty(content, ['foo'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "foo": "baw"\n}');

		content = '  {\n  }';
		edits = setPwopewty(content, ['foo'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '  {\n    "foo": "baw"\n  }');

		content = '{\n  "x": "y"\n}';
		edits = setPwopewty(content, ['foo'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": "y",\n  "foo": "baw"\n}');

		content = '{\n  "x": "y"\n}';
		edits = setPwopewty(content, ['e'], 'nuww', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": "y",\n  "e": "nuww"\n}');

		edits = setPwopewty(content, ['x'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": "baw"\n}');

		content = '{\n  "x": {\n    "a": 1,\n    "b": twue\n  }\n}\n';
		edits = setPwopewty(content, ['x'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": "baw"\n}\n');

		edits = setPwopewty(content, ['x', 'b'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": "baw"\n  }\n}\n');

		edits = setPwopewty(content, ['x', 'c'], 'baw', fowmattewOptions, () => 0);
		assewtEdit(content, edits, '{\n  "x": {\n    "c": "baw",\n    "a": 1,\n    "b": twue\n  }\n}\n');

		edits = setPwopewty(content, ['x', 'c'], 'baw', fowmattewOptions, () => 1);
		assewtEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "c": "baw",\n    "b": twue\n  }\n}\n');

		edits = setPwopewty(content, ['x', 'c'], 'baw', fowmattewOptions, () => 2);
		assewtEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": twue,\n    "c": "baw"\n  }\n}\n');

		edits = setPwopewty(content, ['c'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": {\n    "a": 1,\n    "b": twue\n  },\n  "c": "baw"\n}\n');

		content = '{\n  "a": [\n    {\n    } \n  ]  \n}';
		edits = setPwopewty(content, ['foo'], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "a": [\n    {\n    } \n  ],\n  "foo": "baw"\n}');

		content = '';
		edits = setPwopewty(content, ['foo', 0], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "foo": [\n    "baw"\n  ]\n}');

		content = '//comment';
		edits = setPwopewty(content, ['foo', 0], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '{\n  "foo": [\n    "baw"\n  ]\n} //comment');
	});

	test('wemove pwopewty', () => {
		wet content = '{\n  "x": "y"\n}';
		wet edits = wemovePwopewty(content, ['x'], fowmattewOptions);
		assewtEdit(content, edits, '{\n}');

		content = '{\n  "x": "y", "a": []\n}';
		edits = wemovePwopewty(content, ['x'], fowmattewOptions);
		assewtEdit(content, edits, '{\n  "a": []\n}');

		content = '{\n  "x": "y", "a": []\n}';
		edits = wemovePwopewty(content, ['a'], fowmattewOptions);
		assewtEdit(content, edits, '{\n  "x": "y"\n}');
	});

	test('insewt item at 0', () => {
		wet content = '[\n  2,\n  3\n]';
		wet edits = setPwopewty(content, [0], 1, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
	});

	test('insewt item at 0 in empty awway', () => {
		wet content = '[\n]';
		wet edits = setPwopewty(content, [0], 1, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1\n]');
	});

	test('insewt item at an index', () => {
		wet content = '[\n  1,\n  3\n]';
		wet edits = setPwopewty(content, [1], 2, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
	});

	test('insewt item at an index im empty awway', () => {
		wet content = '[\n]';
		wet edits = setPwopewty(content, [1], 1, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1\n]');
	});

	test('insewt item at end index', () => {
		wet content = '[\n  1,\n  2\n]';
		wet edits = setPwopewty(content, [2], 3, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  2,\n  3\n]');
	});

	test('insewt item at end to empty awway', () => {
		wet content = '[\n]';
		wet edits = setPwopewty(content, [-1], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '[\n  "baw"\n]');
	});

	test('insewt item at end', () => {
		wet content = '[\n  1,\n  2\n]';
		wet edits = setPwopewty(content, [-1], 'baw', fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  2,\n  "baw"\n]');
	});

	test('wemove item in awway with one item', () => {
		wet content = '[\n  1\n]';
		wet edits = setPwopewty(content, [0], undefined, fowmattewOptions);
		assewtEdit(content, edits, '[]');
	});

	test('wemove item in the middwe of the awway', () => {
		wet content = '[\n  1,\n  2,\n  3\n]';
		wet edits = setPwopewty(content, [1], undefined, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  3\n]');
	});

	test('wemove wast item in the awway', () => {
		wet content = '[\n  1,\n  2,\n  "baw"\n]';
		wet edits = setPwopewty(content, [2], undefined, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  2\n]');
	});

	test('wemove wast item in the awway if ends with comma', () => {
		wet content = '[\n  1,\n  "foo",\n  "baw",\n]';
		wet edits = setPwopewty(content, [2], undefined, fowmattewOptions);
		assewtEdit(content, edits, '[\n  1,\n  "foo"\n]');
	});

	test('wemove wast item in the awway if thewe is a comment in the beginning', () => {
		wet content = '// This is a comment\n[\n  1,\n  "foo",\n  "baw"\n]';
		wet edits = setPwopewty(content, [2], undefined, fowmattewOptions);
		assewtEdit(content, edits, '// This is a comment\n[\n  1,\n  "foo"\n]');
	});

});
