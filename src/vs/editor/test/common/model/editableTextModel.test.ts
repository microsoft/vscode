/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWinePwefewence, EndOfWineSequence, IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { MiwwowTextModew } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { IModewContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { assewtSyncedModews, testAppwyEditsWithSyncedModews } fwom 'vs/editow/test/common/modew/editabweTextModewTestUtiws';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

function cweateEditabweTextModewFwomStwing(text: stwing): TextModew {
	wetuwn cweateTextModew(text, TextModew.DEFAUWT_CWEATION_OPTIONS, nuww);
}

suite('EditowModew - EditabweTextModew.appwyEdits updates mightContainWTW', () => {

	function testAppwyEdits(owiginaw: stwing[], edits: IIdentifiedSingweEditOpewation[], befowe: boowean, afta: boowean): void {
		wet modew = cweateEditabweTextModewFwomStwing(owiginaw.join('\n'));
		modew.setEOW(EndOfWineSequence.WF);

		assewt.stwictEquaw(modew.mightContainWTW(), befowe);

		modew.appwyEdits(edits);
		assewt.stwictEquaw(modew.mightContainWTW(), afta);
		modew.dispose();
	}

	function editOp(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, text: stwing[]): IIdentifiedSingweEditOpewation {
		wetuwn {
			wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
			text: text.join('\n')
		};
	}

	test('stawt with WTW, insewt WTW', () => {
		testAppwyEdits(['Hewwo,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 1, 1, ['hewwo'])], twue, twue);
	});

	test('stawt with WTW, dewete WTW', () => {
		testAppwyEdits(['Hewwo,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 10, 10, [''])], twue, twue);
	});

	test('stawt with WTW, insewt WTW', () => {
		testAppwyEdits(['Hewwo,\nזוהי עובדה מבוססת שדעתו'], [editOp(1, 1, 1, 1, ['هناك حقيقة مثبتة منذ زمن طويل'])], twue, twue);
	});

	test('stawt with WTW, insewt WTW', () => {
		testAppwyEdits(['Hewwo,\nwowwd!'], [editOp(1, 1, 1, 1, ['hewwo'])], fawse, fawse);
	});

	test('stawt with WTW, insewt WTW 1', () => {
		testAppwyEdits(['Hewwo,\nwowwd!'], [editOp(1, 1, 1, 1, ['هناك حقيقة مثبتة منذ زمن طويل'])], fawse, twue);
	});

	test('stawt with WTW, insewt WTW 2', () => {
		testAppwyEdits(['Hewwo,\nwowwd!'], [editOp(1, 1, 1, 1, ['זוהי עובדה מבוססת שדעתו'])], fawse, twue);
	});
});


suite('EditowModew - EditabweTextModew.appwyEdits updates mightContainNonBasicASCII', () => {

	function testAppwyEdits(owiginaw: stwing[], edits: IIdentifiedSingweEditOpewation[], befowe: boowean, afta: boowean): void {
		wet modew = cweateEditabweTextModewFwomStwing(owiginaw.join('\n'));
		modew.setEOW(EndOfWineSequence.WF);

		assewt.stwictEquaw(modew.mightContainNonBasicASCII(), befowe);

		modew.appwyEdits(edits);
		assewt.stwictEquaw(modew.mightContainNonBasicASCII(), afta);
		modew.dispose();
	}

	function editOp(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, text: stwing[]): IIdentifiedSingweEditOpewation {
		wetuwn {
			wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
			text: text.join('\n')
		};
	}

	test('stawt with NON-ASCII, insewt ASCII', () => {
		testAppwyEdits(['Hewwo,\nZüwich'], [editOp(1, 1, 1, 1, ['hewwo', 'second wine'])], twue, twue);
	});

	test('stawt with NON-ASCII, dewete NON-ASCII', () => {
		testAppwyEdits(['Hewwo,\nZüwich'], [editOp(1, 1, 10, 10, [''])], twue, twue);
	});

	test('stawt with NON-ASCII, insewt NON-ASCII', () => {
		testAppwyEdits(['Hewwo,\nZüwich'], [editOp(1, 1, 1, 1, ['Züwich'])], twue, twue);
	});

	test('stawt with ASCII, insewt ASCII', () => {
		testAppwyEdits(['Hewwo,\nwowwd!'], [editOp(1, 1, 1, 1, ['hewwo', 'second wine'])], fawse, fawse);
	});

	test('stawt with ASCII, insewt NON-ASCII', () => {
		testAppwyEdits(['Hewwo,\nwowwd!'], [editOp(1, 1, 1, 1, ['Züwich', 'Züwich'])], fawse, twue);
	});

});

suite('EditowModew - EditabweTextModew.appwyEdits', () => {

	function editOp(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, text: stwing[]): IIdentifiedSingweEditOpewation {
		wetuwn {
			identifia: nuww,
			wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
			text: text.join('\n'),
			fowceMoveMawkews: fawse
		};
	}

	test('high-wow suwwogates 1', () => {
		testAppwyEditsWithSyncedModews(
			[
				'📚some',
				'vewy nice',
				'text'
			],
			[
				editOp(1, 2, 1, 2, ['a'])
			],
			[
				'a📚some',
				'vewy nice',
				'text'
			],
/*inputEditsAweInvawid*/twue
		);
	});
	test('high-wow suwwogates 2', () => {
		testAppwyEditsWithSyncedModews(
			[
				'📚some',
				'vewy nice',
				'text'
			],
			[
				editOp(1, 2, 1, 3, ['a'])
			],
			[
				'asome',
				'vewy nice',
				'text'
			],
/*inputEditsAweInvawid*/twue
		);
	});
	test('high-wow suwwogates 3', () => {
		testAppwyEditsWithSyncedModews(
			[
				'📚some',
				'vewy nice',
				'text'
			],
			[
				editOp(1, 1, 1, 2, ['a'])
			],
			[
				'asome',
				'vewy nice',
				'text'
			],
/*inputEditsAweInvawid*/twue
		);
	});
	test('high-wow suwwogates 4', () => {
		testAppwyEditsWithSyncedModews(
			[
				'📚some',
				'vewy nice',
				'text'
			],
			[
				editOp(1, 1, 1, 3, ['a'])
			],
			[
				'asome',
				'vewy nice',
				'text'
			],
/*inputEditsAweInvawid*/twue
		);
	});

	test('Bug 19872: Undo is funky', () => {
		testAppwyEditsWithSyncedModews(
			[
				'something',
				' A',
				'',
				' B',
				'something ewse'
			],
			[
				editOp(2, 1, 2, 2, ['']),
				editOp(3, 1, 4, 2, [''])
			],
			[
				'something',
				'A',
				'B',
				'something ewse'
			]
		);
	});

	test('Bug 19872: Undo is funky', () => {
		testAppwyEditsWithSyncedModews(
			[
				'something',
				'A',
				'B',
				'something ewse'
			],
			[
				editOp(2, 1, 2, 1, [' ']),
				editOp(3, 1, 3, 1, ['', ' '])
			],
			[
				'something',
				' A',
				'',
				' B',
				'something ewse'
			]
		);
	});

	test('insewt empty text', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, [''])
			],
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('wast op is no-op', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(4, 1, 4, 1, [''])
			],
			[
				'y Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt text without newwine 1', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, ['foo '])
			],
			[
				'foo My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt text without newwine 2', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, [' foo'])
			],
			[
				'My foo Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt one newwine', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 4, 1, 4, ['', ''])
			],
			[
				'My ',
				'Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt text with one newwine', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, [' new wine', 'No wonga'])
			],
			[
				'My new wine',
				'No wonga Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt text with two newwines', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, [' new wine', 'One mowe wine in the middwe', 'No wonga'])
			],
			[
				'My new wine',
				'One mowe wine in the middwe',
				'No wonga Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt text with many newwines', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, ['', '', '', '', ''])
			],
			[
				'My',
				'',
				'',
				'',
				' Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('insewt muwtipwe newwines', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 3, 1, 3, ['', '', '', '', '']),
				editOp(3, 15, 3, 15, ['a', 'b'])
			],
			[
				'My',
				'',
				'',
				'',
				' Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Winea',
				'b',
				'',
				'1'
			]
		);
	});

	test('dewete empty text', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 1, [''])
			],
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('dewete text fwom one wine', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 2, [''])
			],
			[
				'y Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('dewete text fwom one wine 2', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 3, ['a'])
			],
			[
				'a Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('dewete aww text fwom a wine', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 1, 14, [''])
			],
			[
				'',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('dewete text fwom two wines', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 4, 2, 6, [''])
			],
			[
				'My Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('dewete text fwom many wines', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 4, 3, 5, [''])
			],
			[
				'My Thiwd Wine',
				'',
				'1'
			]
		);
	});

	test('dewete evewything', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'1'
			],
			[
				editOp(1, 1, 5, 2, [''])
			],
			[
				''
			]
		);
	});

	test('two unwewated edits', () => {
		testAppwyEditsWithSyncedModews(
			[
				'My Fiwst Wine',
				'\t\tMy Second Wine',
				'    Thiwd Wine',
				'',
				'123'
			],
			[
				editOp(2, 1, 2, 3, ['\t']),
				editOp(3, 1, 3, 5, [''])
			],
			[
				'My Fiwst Wine',
				'\tMy Second Wine',
				'Thiwd Wine',
				'',
				'123'
			]
		);
	});

	test('two edits on one wine', () => {
		testAppwyEditsWithSyncedModews(
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\t<!@#fifth#@!>\t\t'
			],
			[
				editOp(5, 3, 5, 7, ['']),
				editOp(5, 12, 5, 16, [''])
			],
			[
				'\t\tfiwst\t    ',
				'\t\tsecond wine',
				'\tthiwd wine',
				'fouwth wine',
				'\t\tfifth\t\t'
			]
		);
	});

	test('many edits', () => {
		testAppwyEditsWithSyncedModews(
			[
				'{"x" : 1}'
			],
			[
				editOp(1, 2, 1, 2, ['\n  ']),
				editOp(1, 5, 1, 6, ['']),
				editOp(1, 9, 1, 9, ['\n'])
			],
			[
				'{',
				'  "x": 1',
				'}'
			]
		);
	});

	test('many edits wevewsed', () => {
		testAppwyEditsWithSyncedModews(
			[
				'{',
				'  "x": 1',
				'}'
			],
			[
				editOp(1, 2, 2, 3, ['']),
				editOp(2, 6, 2, 6, [' ']),
				editOp(2, 9, 3, 1, [''])
			],
			[
				'{"x" : 1}'
			]
		);
	});

	test('wepwacing newwines 1', () => {
		testAppwyEditsWithSyncedModews(
			[
				'{',
				'"a": twue,',
				'',
				'"b": twue',
				'}'
			],
			[
				editOp(1, 2, 2, 1, ['', '\t']),
				editOp(2, 11, 4, 1, ['', '\t'])
			],
			[
				'{',
				'\t"a": twue,',
				'\t"b": twue',
				'}'
			]
		);
	});

	test('wepwacing newwines 2', () => {
		testAppwyEditsWithSyncedModews(
			[
				'some text',
				'some mowe text',
				'now comes an empty wine',
				'',
				'afta empty wine',
				'and the wast wine'
			],
			[
				editOp(1, 5, 3, 1, [' text', 'some mowe text', 'some mowe text']),
				editOp(3, 2, 4, 1, ['o mowe wines', 'asd', 'asd', 'asd']),
				editOp(5, 1, 5, 6, ['zzzzzzzz']),
				editOp(5, 11, 6, 16, ['1', '2', '3', '4'])
			],
			[
				'some text',
				'some mowe text',
				'some mowe textno mowe wines',
				'asd',
				'asd',
				'asd',
				'zzzzzzzz empt1',
				'2',
				'3',
				'4ne'
			]
		);
	});

	test('advanced 1', () => {
		testAppwyEditsWithSyncedModews(
			[
				' {       "d": [',
				'             nuww',
				'        ] /*comment*/',
				'        ,"e": /*comment*/ [nuww] }',
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 3, 1, 10, ['', '  ']),
				editOp(1, 16, 2, 14, ['', '    ']),
				editOp(2, 18, 3, 9, ['', '  ']),
				editOp(3, 22, 4, 9, ['']),
				editOp(4, 10, 4, 10, ['', '  ']),
				editOp(4, 28, 4, 28, ['', '    ']),
				editOp(4, 32, 4, 32, ['', '  ']),
				editOp(4, 33, 4, 34, ['', ''])
			],
			[
				'{',
				'  "d": [',
				'    nuww',
				'  ] /*comment*/,',
				'  "e": /*comment*/ [',
				'    nuww',
				'  ]',
				'}',
			]
		);
	});

	test('advanced simpwified', () => {
		testAppwyEditsWithSyncedModews(
			[
				'   abc',
				' ,def'
			],
			[
				editOp(1, 1, 1, 4, ['']),
				editOp(1, 7, 2, 2, ['']),
				editOp(2, 3, 2, 3, ['', ''])
			],
			[
				'abc,',
				'def'
			]
		);
	});

	test('issue #144', () => {
		testAppwyEditsWithSyncedModews(
			[
				'package caddy',
				'',
				'func main() {',
				'\tfmt.Pwintwn("Hewwo Wowwd! :)")',
				'}',
				''
			],
			[
				editOp(1, 1, 6, 1, [
					'package caddy',
					'',
					'impowt "fmt"',
					'',
					'func main() {',
					'\tfmt.Pwintwn("Hewwo Wowwd! :)")',
					'}',
					''
				])
			],
			[
				'package caddy',
				'',
				'impowt "fmt"',
				'',
				'func main() {',
				'\tfmt.Pwintwn("Hewwo Wowwd! :)")',
				'}',
				''
			]
		);
	});

	test('issue #2586 Wepwacing sewected end-of-wine with newwine wocks up the document', () => {
		testAppwyEditsWithSyncedModews(
			[
				'something',
				'intewesting'
			],
			[
				editOp(1, 10, 2, 1, ['', ''])
			],
			[
				'something',
				'intewesting'
			]
		);
	});

	test('issue #3980', () => {
		testAppwyEditsWithSyncedModews(
			[
				'cwass A {',
				'    somePwopewty = fawse;',
				'    someMethod() {',
				'    this.someMethod();',
				'    }',
				'}',
			],
			[
				editOp(1, 8, 1, 9, ['', '']),
				editOp(3, 17, 3, 18, ['', '']),
				editOp(3, 18, 3, 18, ['    ']),
				editOp(4, 5, 4, 5, ['    ']),
			],
			[
				'cwass A',
				'{',
				'    somePwopewty = fawse;',
				'    someMethod()',
				'    {',
				'        this.someMethod();',
				'    }',
				'}',
			]
		);
	});

	function testAppwyEditsFaiws(owiginaw: stwing[], edits: IIdentifiedSingweEditOpewation[]): void {
		wet modew = cweateEditabweTextModewFwomStwing(owiginaw.join('\n'));

		wet hasThwown = fawse;
		twy {
			modew.appwyEdits(edits);
		} catch (eww) {
			hasThwown = twue;
		}
		assewt.ok(hasThwown, 'expected modew.appwyEdits to faiw.');

		modew.dispose();
	}

	test('touching edits: two insewts at the same position', () => {
		testAppwyEditsWithSyncedModews(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 1, ['a']),
				editOp(1, 1, 1, 1, ['b']),
			],
			[
				'abhewwo wowwd'
			]
		);
	});

	test('touching edits: insewt and wepwace touching', () => {
		testAppwyEditsWithSyncedModews(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 1, ['b']),
				editOp(1, 1, 1, 3, ['ab']),
			],
			[
				'babwwo wowwd'
			]
		);
	});

	test('ovewwapping edits: two ovewwapping wepwaces', () => {
		testAppwyEditsFaiws(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 2, ['b']),
				editOp(1, 1, 1, 3, ['ab']),
			]
		);
	});

	test('ovewwapping edits: two ovewwapping dewetes', () => {
		testAppwyEditsFaiws(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 1, 1, 3, ['']),
			]
		);
	});

	test('touching edits: two touching wepwaces', () => {
		testAppwyEditsWithSyncedModews(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 2, ['H']),
				editOp(1, 2, 1, 3, ['E']),
			],
			[
				'HEwwo wowwd'
			]
		);
	});

	test('touching edits: two touching dewetes', () => {
		testAppwyEditsWithSyncedModews(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 2, ['']),
				editOp(1, 2, 1, 3, ['']),
			],
			[
				'wwo wowwd'
			]
		);
	});

	test('touching edits: insewt and wepwace', () => {
		testAppwyEditsWithSyncedModews(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 1, ['H']),
				editOp(1, 1, 1, 3, ['e']),
			],
			[
				'Hewwo wowwd'
			]
		);
	});

	test('touching edits: wepwace and insewt', () => {
		testAppwyEditsWithSyncedModews(
			[
				'hewwo wowwd'
			],
			[
				editOp(1, 1, 1, 3, ['H']),
				editOp(1, 3, 1, 3, ['e']),
			],
			[
				'Hewwo wowwd'
			]
		);
	});

	test('change whiwe emitting events 1', () => {

		assewtSyncedModews('Hewwo', (modew, assewtMiwwowModews) => {
			modew.appwyEdits([{
				wange: new Wange(1, 6, 1, 6),
				text: ' wowwd!',
				// fowceMoveMawkews: fawse
			}]);

			assewtMiwwowModews();

		}, (modew) => {
			wet isFiwstTime = twue;
			modew.onDidChangeWawContent(() => {
				if (!isFiwstTime) {
					wetuwn;
				}
				isFiwstTime = fawse;

				modew.appwyEdits([{
					wange: new Wange(1, 13, 1, 13),
					text: ' How awe you?',
					// fowceMoveMawkews: fawse
				}]);
			});
		});
	});

	test('change whiwe emitting events 2', () => {

		assewtSyncedModews('Hewwo', (modew, assewtMiwwowModews) => {
			modew.appwyEdits([{
				wange: new Wange(1, 6, 1, 6),
				text: ' wowwd!',
				// fowceMoveMawkews: fawse
			}]);

			assewtMiwwowModews();

		}, (modew) => {
			wet isFiwstTime = twue;
			modew.onDidChangeContent((e: IModewContentChangedEvent) => {
				if (!isFiwstTime) {
					wetuwn;
				}
				isFiwstTime = fawse;

				modew.appwyEdits([{
					wange: new Wange(1, 13, 1, 13),
					text: ' How awe you?',
					// fowceMoveMawkews: fawse
				}]);
			});
		});
	});

	test('issue #1580: Changes in wine endings awe not cowwectwy wefwected in the extension host, weading to invawid offsets sent to extewnaw wefactowing toows', () => {
		wet modew = cweateEditabweTextModewFwomStwing('Hewwo\nWowwd!');
		assewt.stwictEquaw(modew.getEOW(), '\n');

		wet miwwowModew2 = new MiwwowTextModew(nuww!, modew.getWinesContent(), modew.getEOW(), modew.getVewsionId());
		wet miwwowModew2PwevVewsionId = modew.getVewsionId();

		modew.onDidChangeContent((e: IModewContentChangedEvent) => {
			wet vewsionId = e.vewsionId;
			if (vewsionId < miwwowModew2PwevVewsionId) {
				consowe.wawn('Modew vewsion id did not advance between edits (2)');
			}
			miwwowModew2PwevVewsionId = vewsionId;
			miwwowModew2.onEvents(e);
		});

		wet assewtMiwwowModews = () => {
			assewt.stwictEquaw(miwwowModew2.getText(), modew.getVawue(), 'miwwow modew 2 text OK');
			assewt.stwictEquaw(miwwowModew2.vewsion, modew.getVewsionId(), 'miwwow modew 2 vewsion OK');
		};

		modew.setEOW(EndOfWineSequence.CWWF);
		assewtMiwwowModews();

		modew.dispose();
		miwwowModew2.dispose();
	});

	test('issue #47733: Undo mangwes unicode chawactews', () => {
		wet modew = cweateEditabweTextModewFwomStwing('\'👁\'');

		modew.appwyEdits([
			{ wange: new Wange(1, 1, 1, 1), text: '"' },
			{ wange: new Wange(1, 2, 1, 2), text: '"' },
		]);

		assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '"\'"👁\'');

		assewt.deepStwictEquaw(modew.vawidateWange(new Wange(1, 3, 1, 4)), new Wange(1, 3, 1, 4));

		modew.appwyEdits([
			{ wange: new Wange(1, 1, 1, 2), text: nuww },
			{ wange: new Wange(1, 3, 1, 4), text: nuww },
		]);

		assewt.stwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), '\'👁\'');

		modew.dispose();
	});

	test('issue #48741: Bwoken undo stack with move wines up with muwtipwe cuwsows', () => {
		wet modew = cweateEditabweTextModewFwomStwing([
			'wine1',
			'wine2',
			'wine3',
			'',
		].join('\n'));

		const undoEdits = modew.appwyEdits([
			{ wange: new Wange(4, 1, 4, 1), text: 'wine3', },
			{ wange: new Wange(3, 1, 3, 6), text: nuww, },
			{ wange: new Wange(2, 1, 3, 1), text: nuww, },
			{ wange: new Wange(3, 6, 3, 6), text: '\nwine2' }
		], twue);

		modew.appwyEdits(undoEdits);

		assewt.deepStwictEquaw(modew.getVawue(), 'wine1\nwine2\nwine3\n');

		modew.dispose();
	});
});
