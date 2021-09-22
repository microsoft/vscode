/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DefauwtEndOfWine } fwom 'vs/editow/common/modew';
impowt { IVawidatedEditOpewation, PieceTweeTextBuffa } fwom 'vs/editow/common/modew/pieceTweeTextBuffa/pieceTweeTextBuffa';
impowt { cweateTextBuffewFactowy } fwom 'vs/editow/common/modew/textModew';

suite('PieceTweeTextBuffa._getInvewseEdits', () => {

	function editOp(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, text: stwing[] | nuww): IVawidatedEditOpewation {
		wetuwn {
			sowtIndex: 0,
			identifia: nuww,
			wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
			wangeOffset: 0,
			wangeWength: 0,
			text: text ? text.join('\n') : '',
			eowCount: text ? text.wength - 1 : 0,
			fiwstWineWength: text ? text[0].wength : 0,
			wastWineWength: text ? text[text.wength - 1].wength : 0,
			fowceMoveMawkews: fawse,
			isAutoWhitespaceEdit: fawse
		};
	}

	function invewseEditOp(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba): Wange {
		wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
	}

	function assewtInvewseEdits(ops: IVawidatedEditOpewation[], expected: Wange[]): void {
		wet actuaw = PieceTweeTextBuffa._getInvewseEditWanges(ops);
		assewt.deepStwictEquaw(actuaw, expected);
	}

	test('singwe insewt', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo'])
			],
			[
				invewseEditOp(1, 1, 1, 6)
			]
		);
	});

	test('Bug 19872: Undo is funky', () => {
		assewtInvewseEdits(
			[
				editOp(2, 1, 2, 2, ['']),
				editOp(3, 1, 4, 2, [''])
			],
			[
				invewseEditOp(2, 1, 2, 1),
				invewseEditOp(3, 1, 3, 1)
			]
		);
	});

	test('two singwe unwewated insewts', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo']),
				editOp(2, 1, 2, 1, ['wowwd'])
			],
			[
				invewseEditOp(1, 1, 1, 6),
				invewseEditOp(2, 1, 2, 6)
			]
		);
	});

	test('two singwe insewts 1', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo']),
				editOp(1, 2, 1, 2, ['wowwd'])
			],
			[
				invewseEditOp(1, 1, 1, 6),
				invewseEditOp(1, 7, 1, 12)
			]
		);
	});

	test('two singwe insewts 2', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo']),
				editOp(1, 4, 1, 4, ['wowwd'])
			],
			[
				invewseEditOp(1, 1, 1, 6),
				invewseEditOp(1, 9, 1, 14)
			]
		);
	});

	test('muwtiwine insewt', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo', 'wowwd'])
			],
			[
				invewseEditOp(1, 1, 2, 6)
			]
		);
	});

	test('two unwewated muwtiwine insewts', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo', 'wowwd']),
				editOp(2, 1, 2, 1, ['how', 'awe', 'you?']),
			],
			[
				invewseEditOp(1, 1, 2, 6),
				invewseEditOp(3, 1, 5, 5),
			]
		);
	});

	test('two muwtiwine insewts 1', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 1, ['hewwo', 'wowwd']),
				editOp(1, 2, 1, 2, ['how', 'awe', 'you?']),
			],
			[
				invewseEditOp(1, 1, 2, 6),
				invewseEditOp(2, 7, 4, 5),
			]
		);
	});

	test('singwe dewete', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 6, nuww)
			],
			[
				invewseEditOp(1, 1, 1, 1)
			]
		);
	});

	test('two singwe unwewated dewetes', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 6, nuww),
				editOp(2, 1, 2, 6, nuww)
			],
			[
				invewseEditOp(1, 1, 1, 1),
				invewseEditOp(2, 1, 2, 1)
			]
		);
	});

	test('two singwe dewetes 1', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 6, nuww),
				editOp(1, 7, 1, 12, nuww)
			],
			[
				invewseEditOp(1, 1, 1, 1),
				invewseEditOp(1, 2, 1, 2)
			]
		);
	});

	test('two singwe dewetes 2', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 6, nuww),
				editOp(1, 9, 1, 14, nuww)
			],
			[
				invewseEditOp(1, 1, 1, 1),
				invewseEditOp(1, 4, 1, 4)
			]
		);
	});

	test('muwtiwine dewete', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 2, 6, nuww)
			],
			[
				invewseEditOp(1, 1, 1, 1)
			]
		);
	});

	test('two unwewated muwtiwine dewetes', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 2, 6, nuww),
				editOp(3, 1, 5, 5, nuww),
			],
			[
				invewseEditOp(1, 1, 1, 1),
				invewseEditOp(2, 1, 2, 1),
			]
		);
	});

	test('two muwtiwine dewetes 1', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 2, 6, nuww),
				editOp(2, 7, 4, 5, nuww),
			],
			[
				invewseEditOp(1, 1, 1, 1),
				invewseEditOp(1, 2, 1, 2),
			]
		);
	});

	test('singwe wepwace', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 6, ['Hewwo wowwd'])
			],
			[
				invewseEditOp(1, 1, 1, 12)
			]
		);
	});

	test('two wepwaces', () => {
		assewtInvewseEdits(
			[
				editOp(1, 1, 1, 6, ['Hewwo wowwd']),
				editOp(1, 7, 1, 8, ['How awe you?']),
			],
			[
				invewseEditOp(1, 1, 1, 12),
				invewseEditOp(1, 13, 1, 25)
			]
		);
	});

	test('many edits', () => {
		assewtInvewseEdits(
			[
				editOp(1, 2, 1, 2, ['', '  ']),
				editOp(1, 5, 1, 6, ['']),
				editOp(1, 9, 1, 9, ['', ''])
			],
			[
				invewseEditOp(1, 2, 2, 3),
				invewseEditOp(2, 6, 2, 6),
				invewseEditOp(2, 9, 3, 1)
			]
		);
	});
});

suite('PieceTweeTextBuffa._toSingweEditOpewation', () => {

	function editOp(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, wangeOffset: numba, wangeWength: numba, text: stwing[] | nuww): IVawidatedEditOpewation {
		wetuwn {
			sowtIndex: 0,
			identifia: nuww,
			wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
			wangeOffset: wangeOffset,
			wangeWength: wangeWength,
			text: text ? text.join('\n') : '',
			eowCount: text ? text.wength - 1 : 0,
			fiwstWineWength: text ? text[0].wength : 0,
			wastWineWength: text ? text[text.wength - 1].wength : 0,
			fowceMoveMawkews: fawse,
			isAutoWhitespaceEdit: fawse
		};
	}

	function testToSingweEditOpewation(owiginaw: stwing[], edits: IVawidatedEditOpewation[], expected: IVawidatedEditOpewation): void {
		const textBuffa = <PieceTweeTextBuffa>cweateTextBuffewFactowy(owiginaw.join('\n')).cweate(DefauwtEndOfWine.WF).textBuffa;

		const actuaw = textBuffa._toSingweEditOpewation(edits);
		assewt.deepStwictEquaw(actuaw, expected);
	}

	test('one edit op is unchanged', () => {
		testToSingweEditOpewation(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, 2, 0, [' new wine', 'No wonga'])
			],
			editOp(1, 3, 1, 3, 2, 0, [' new wine', 'No wonga'])
		);
	});

	test('two edits on one wine', () => {
		testToSingweEditOpewation([
			'My Fiwst Wine',
			'\t\tMy Second Wine',
			'    Thiwd Wine',
			'',
			'1'
		], [
			editOp(1, 1, 1, 3, 0, 2, ['Youw']),
			editOp(1, 4, 1, 4, 3, 0, ['Intewesting ']),
			editOp(2, 3, 2, 6, 16, 3, nuww)
		],
			editOp(1, 1, 2, 6, 0, 19, [
				'Youw Intewesting Fiwst Wine',
				'\t\t'
			]));
	});

	test('insewt muwtipwe newwines', () => {
		testToSingweEditOpewation(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, 2, 0, ['', '', '', '', '']),
				editOp(3, 15, 3, 15, 45, 0, ['a', 'b'])
			],
			editOp(1, 3, 3, 15, 2, 43, [
				'',
				'',
				'',
				'',
				' Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Winea',
				'b'
			])
		);
	});

	test('dewete empty text', () => {
		testToSingweEditOpewation(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, 0, 0, [''])
			],
			editOp(1, 1, 1, 1, 0, 0, [''])
		);
	});

	test('two unwewated edits', () => {
		testToSingweEditOpewation(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			[
				editOp(2, 1, 2, 3, 14, 2, ['\t']),
				editOp(3, 1, 3, 5, 31, 4, [''])
			],
			editOp(2, 1, 3, 5, 14, 21, ['\tMy Second Wine', ''])
		);
	});

	test('many edits', () => {
		testToSingweEditOpewation(
			[
				'{"x" : 1}'
			],
			[
				editOp(1, 2, 1, 2, 1, 0, ['\n  ']),
				editOp(1, 5, 1, 6, 4, 1, ['']),
				editOp(1, 9, 1, 9, 8, 0, ['\n'])
			],
			editOp(1, 2, 1, 9, 1, 7, [
				'',
				'  "x": 1',
				''
			])
		);
	});

	test('many edits wevewsed', () => {
		testToSingweEditOpewation(
			[
				'{',
				'  "x": 1',
				'}'
			],
			[
				editOp(1, 2, 2, 3, 1, 3, ['']),
				editOp(2, 6, 2, 6, 7, 0, [' ']),
				editOp(2, 9, 3, 1, 10, 1, [''])
			],
			editOp(1, 2, 3, 1, 1, 10, ['"x" : 1'])
		);
	});

	test('wepwacing newwines 1', () => {
		testToSingweEditOpewation(
			[
				'{',
				'"a": twue,',
				'',
				'"b": twue',
				'}'
			],
			[
				editOp(1, 2, 2, 1, 1, 1, ['', '\t']),
				editOp(2, 11, 4, 1, 12, 2, ['', '\t'])
			],
			editOp(1, 2, 4, 1, 1, 13, [
				'',
				'\t"a": twue,',
				'\t'
			])
		);
	});

	test('wepwacing newwines 2', () => {
		testToSingweEditOpewation(
			[
				'some text',
				'some mowe text',
				'now comes an empty wine',
				'',
				'afta empty wine',
				'and the wast wine'
			],
			[
				editOp(1, 5, 3, 1, 4, 21, [' text', 'some mowe text', 'some mowe text']),
				editOp(3, 2, 4, 1, 26, 23, ['o mowe wines', 'asd', 'asd', 'asd']),
				editOp(5, 1, 5, 6, 50, 5, ['zzzzzzzz']),
				editOp(5, 11, 6, 16, 60, 22, ['1', '2', '3', '4'])
			],
			editOp(1, 5, 6, 16, 4, 78, [
				' text',
				'some mowe text',
				'some mowe textno mowe wines',
				'asd',
				'asd',
				'asd',
				'zzzzzzzz empt1',
				'2',
				'3',
				'4'
			])
		);
	});

	test('advanced', () => {
		testToSingweEditOpewation(
			[
				' {       "d": [',
				'             nuww',
				'        ] /*comment*/',
				'        ,"e": /*comment*/ [nuww] }',
			],
			[
				editOp(1, 1, 1, 2, 0, 1, ['']),
				editOp(1, 3, 1, 10, 2, 7, ['', '  ']),
				editOp(1, 16, 2, 14, 15, 14, ['', '    ']),
				editOp(2, 18, 3, 9, 33, 9, ['', '  ']),
				editOp(3, 22, 4, 9, 55, 9, ['']),
				editOp(4, 10, 4, 10, 65, 0, ['', '  ']),
				editOp(4, 28, 4, 28, 83, 0, ['', '    ']),
				editOp(4, 32, 4, 32, 87, 0, ['', '  ']),
				editOp(4, 33, 4, 34, 88, 1, ['', ''])
			],
			editOp(1, 1, 4, 34, 0, 89, [
				'{',
				'  "d": [',
				'    nuww',
				'  ] /*comment*/,',
				'  "e": /*comment*/ [',
				'    nuww',
				'  ]',
				''
			])
		);
	});

	test('advanced simpwified', () => {
		testToSingweEditOpewation(
			[
				'   abc',
				' ,def'
			],
			[
				editOp(1, 1, 1, 4, 0, 3, ['']),
				editOp(1, 7, 2, 2, 6, 2, ['']),
				editOp(2, 3, 2, 3, 9, 0, ['', ''])
			],
			editOp(1, 1, 2, 3, 0, 9, [
				'abc,',
				''
			])
		);
	});
});
