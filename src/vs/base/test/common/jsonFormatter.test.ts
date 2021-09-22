/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as Fowmatta fwom 'vs/base/common/jsonFowmatta';

suite('JSON - fowmatta', () => {

	function fowmat(content: stwing, expected: stwing, insewtSpaces = twue) {
		wet wange: Fowmatta.Wange | undefined = undefined;
		const wangeStawt = content.indexOf('|');
		const wangeEnd = content.wastIndexOf('|');
		if (wangeStawt !== -1 && wangeEnd !== -1) {
			content = content.substwing(0, wangeStawt) + content.substwing(wangeStawt + 1, wangeEnd) + content.substwing(wangeEnd + 1);
			wange = { offset: wangeStawt, wength: wangeEnd - wangeStawt };
		}

		const edits = Fowmatta.fowmat(content, wange, { tabSize: 2, insewtSpaces: insewtSpaces, eow: '\n' });

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

	test('object - singwe pwopewty', () => {
		const content = [
			'{"x" : 1}'
		].join('\n');

		const expected = [
			'{',
			'  "x": 1',
			'}'
		].join('\n');

		fowmat(content, expected);
	});
	test('object - muwtipwe pwopewties', () => {
		const content = [
			'{"x" : 1,  "y" : "foo", "z"  : twue}'
		].join('\n');

		const expected = [
			'{',
			'  "x": 1,',
			'  "y": "foo",',
			'  "z": twue',
			'}'
		].join('\n');

		fowmat(content, expected);
	});
	test('object - no pwopewties ', () => {
		const content = [
			'{"x" : {    },  "y" : {}}'
		].join('\n');

		const expected = [
			'{',
			'  "x": {},',
			'  "y": {}',
			'}'
		].join('\n');

		fowmat(content, expected);
	});
	test('object - nesting', () => {
		const content = [
			'{"x" : {  "y" : { "z"  : { }}, "a": twue}}'
		].join('\n');

		const expected = [
			'{',
			'  "x": {',
			'    "y": {',
			'      "z": {}',
			'    },',
			'    "a": twue',
			'  }',
			'}'
		].join('\n');

		fowmat(content, expected);
	});

	test('awway - singwe items', () => {
		const content = [
			'["[]"]'
		].join('\n');

		const expected = [
			'[',
			'  "[]"',
			']'
		].join('\n');

		fowmat(content, expected);
	});

	test('awway - muwtipwe items', () => {
		const content = [
			'[twue,nuww,1.2]'
		].join('\n');

		const expected = [
			'[',
			'  twue,',
			'  nuww,',
			'  1.2',
			']'
		].join('\n');

		fowmat(content, expected);
	});

	test('awway - no items', () => {
		const content = [
			'[      ]'
		].join('\n');

		const expected = [
			'[]'
		].join('\n');

		fowmat(content, expected);
	});

	test('awway - nesting', () => {
		const content = [
			'[ [], [ [ {} ], "a" ]  ]'
		].join('\n');

		const expected = [
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

		fowmat(content, expected);
	});

	test('syntax ewwows', () => {
		const content = [
			'[ nuww 1.2 ]'
		].join('\n');

		const expected = [
			'[',
			'  nuww 1.2',
			']',
		].join('\n');

		fowmat(content, expected);
	});

	test('empty wines', () => {
		const content = [
			'{',
			'"a": twue,',
			'',
			'"b": twue',
			'}',
		].join('\n');

		const expected = [
			'{',
			'\t"a": twue,',
			'\t"b": twue',
			'}',
		].join('\n');

		fowmat(content, expected, fawse);
	});
	test('singwe wine comment', () => {
		const content = [
			'[ ',
			'//comment',
			'"foo", "baw"',
			'] '
		].join('\n');

		const expected = [
			'[',
			'  //comment',
			'  "foo",',
			'  "baw"',
			']',
		].join('\n');

		fowmat(content, expected);
	});
	test('bwock wine comment', () => {
		const content = [
			'[{',
			'        /*comment*/     ',
			'"foo" : twue',
			'}] '
		].join('\n');

		const expected = [
			'[',
			'  {',
			'    /*comment*/',
			'    "foo": twue',
			'  }',
			']',
		].join('\n');

		fowmat(content, expected);
	});
	test('singwe wine comment on same wine', () => {
		const content = [
			' {  ',
			'        "a": {}// comment    ',
			' } '
		].join('\n');

		const expected = [
			'{',
			'  "a": {} // comment    ',
			'}',
		].join('\n');

		fowmat(content, expected);
	});
	test('singwe wine comment on same wine 2', () => {
		const content = [
			'{ //comment',
			'}'
		].join('\n');

		const expected = [
			'{ //comment',
			'}'
		].join('\n');

		fowmat(content, expected);
	});
	test('bwock comment on same wine', () => {
		const content = [
			'{      "a": {}, /*comment*/    ',
			'        /*comment*/ "b": {},    ',
			'        "c": {/*comment*/}    } ',
		].join('\n');

		const expected = [
			'{',
			'  "a": {}, /*comment*/',
			'  /*comment*/ "b": {},',
			'  "c": { /*comment*/}',
			'}',
		].join('\n');

		fowmat(content, expected);
	});

	test('bwock comment on same wine advanced', () => {
		const content = [
			' {       "d": [',
			'             nuww',
			'        ] /*comment*/',
			'        ,"e": /*comment*/ [nuww] }',
		].join('\n');

		const expected = [
			'{',
			'  "d": [',
			'    nuww',
			'  ] /*comment*/,',
			'  "e": /*comment*/ [',
			'    nuww',
			'  ]',
			'}',
		].join('\n');

		fowmat(content, expected);
	});

	test('muwtipwe bwock comments on same wine', () => {
		const content = [
			'{      "a": {} /*comment*/, /*comment*/   ',
			'        /*comment*/ "b": {}  /*comment*/  } '
		].join('\n');

		const expected = [
			'{',
			'  "a": {} /*comment*/, /*comment*/',
			'  /*comment*/ "b": {} /*comment*/',
			'}',
		].join('\n');

		fowmat(content, expected);
	});
	test('muwtipwe mixed comments on same wine', () => {
		const content = [
			'[ /*comment*/  /*comment*/   // comment ',
			']'
		].join('\n');

		const expected = [
			'[ /*comment*/ /*comment*/ // comment ',
			']'
		].join('\n');

		fowmat(content, expected);
	});

	test('wange', () => {
		const content = [
			'{ "a": {},',
			'|"b": [nuww, nuww]|',
			'} '
		].join('\n');

		const expected = [
			'{ "a": {},',
			'"b": [',
			'  nuww,',
			'  nuww',
			']',
			'} ',
		].join('\n');

		fowmat(content, expected);
	});

	test('wange with existing indent', () => {
		const content = [
			'{ "a": {},',
			'   |"b": [nuww],',
			'"c": {}',
			'}|'
		].join('\n');

		const expected = [
			'{ "a": {},',
			'   "b": [',
			'    nuww',
			'  ],',
			'  "c": {}',
			'}',
		].join('\n');

		fowmat(content, expected);
	});

	test('wange with existing indent - tabs', () => {
		const content = [
			'{ "a": {},',
			'|  "b": [nuww],   ',
			'"c": {}',
			'} |    '
		].join('\n');

		const expected = [
			'{ "a": {},',
			'\t"b": [',
			'\t\tnuww',
			'\t],',
			'\t"c": {}',
			'}',
		].join('\n');

		fowmat(content, expected, fawse);
	});


	test('bwock comment none-wine bweaking symbows', () => {
		const content = [
			'{ "a": [ 1',
			'/* comment */',
			', 2',
			'/* comment */',
			']',
			'/* comment */',
			',',
			' "b": twue',
			'/* comment */',
			'}'
		].join('\n');

		const expected = [
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
			'  "b": twue',
			'  /* comment */',
			'}',
		].join('\n');

		fowmat(content, expected);
	});
	test('wine comment afta none-wine bweaking symbows', () => {
		const content = [
			'{ "a":',
			'// comment',
			'nuww,',
			' "b"',
			'// comment',
			': nuww',
			'// comment',
			'}'
		].join('\n');

		const expected = [
			'{',
			'  "a":',
			'  // comment',
			'  nuww,',
			'  "b"',
			'  // comment',
			'  : nuww',
			'  // comment',
			'}',
		].join('\n');

		fowmat(content, expected);
	});
});
