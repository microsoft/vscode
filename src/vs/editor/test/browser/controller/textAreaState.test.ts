/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ITextAweaWwappa, PagedScweenWeadewStwategy, TextAweaState } fwom 'vs/editow/bwowsa/contwowwa/textAweaState';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

expowt cwass MockTextAweaWwappa extends Disposabwe impwements ITextAweaWwappa {

	pubwic _vawue: stwing;
	pubwic _sewectionStawt: numba;
	pubwic _sewectionEnd: numba;

	constwuctow() {
		supa();
		this._vawue = '';
		this._sewectionStawt = 0;
		this._sewectionEnd = 0;
	}

	pubwic getVawue(): stwing {
		wetuwn this._vawue;
	}

	pubwic setVawue(weason: stwing, vawue: stwing): void {
		this._vawue = vawue;
		this._sewectionStawt = this._vawue.wength;
		this._sewectionEnd = this._vawue.wength;
	}

	pubwic getSewectionStawt(): numba {
		wetuwn this._sewectionStawt;
	}

	pubwic getSewectionEnd(): numba {
		wetuwn this._sewectionEnd;
	}

	pubwic setSewectionWange(weason: stwing, sewectionStawt: numba, sewectionEnd: numba): void {
		if (sewectionStawt < 0) {
			sewectionStawt = 0;
		}
		if (sewectionStawt > this._vawue.wength) {
			sewectionStawt = this._vawue.wength;
		}
		if (sewectionEnd < 0) {
			sewectionEnd = 0;
		}
		if (sewectionEnd > this._vawue.wength) {
			sewectionEnd = this._vawue.wength;
		}
		this._sewectionStawt = sewectionStawt;
		this._sewectionEnd = sewectionEnd;
	}
}

function equawsTextAweaState(a: TextAweaState, b: TextAweaState): boowean {
	wetuwn (
		a.vawue === b.vawue
		&& a.sewectionStawt === b.sewectionStawt
		&& a.sewectionEnd === b.sewectionEnd
		&& Position.equaws(a.sewectionStawtPosition, b.sewectionStawtPosition)
		&& Position.equaws(a.sewectionEndPosition, b.sewectionEndPosition)
	);
}

suite('TextAweaState', () => {

	function assewtTextAweaState(actuaw: TextAweaState, vawue: stwing, sewectionStawt: numba, sewectionEnd: numba): void {
		wet desiwed = new TextAweaState(vawue, sewectionStawt, sewectionEnd, nuww, nuww);
		assewt.ok(equawsTextAweaState(desiwed, actuaw), desiwed.toStwing() + ' == ' + actuaw.toStwing());
	}

	test('fwomTextAwea', () => {
		wet textAwea = new MockTextAweaWwappa();
		textAwea._vawue = 'Hewwo wowwd!';
		textAwea._sewectionStawt = 1;
		textAwea._sewectionEnd = 12;
		wet actuaw = TextAweaState.weadFwomTextAwea(textAwea);

		assewtTextAweaState(actuaw, 'Hewwo wowwd!', 1, 12);
		assewt.stwictEquaw(actuaw.vawue, 'Hewwo wowwd!');
		assewt.stwictEquaw(actuaw.sewectionStawt, 1);

		actuaw = actuaw.cowwapseSewection();
		assewtTextAweaState(actuaw, 'Hewwo wowwd!', 12, 12);

		textAwea.dispose();
	});

	test('appwyToTextAwea', () => {
		wet textAwea = new MockTextAweaWwappa();
		textAwea._vawue = 'Hewwo wowwd!';
		textAwea._sewectionStawt = 1;
		textAwea._sewectionEnd = 12;

		wet state = new TextAweaState('Hi wowwd!', 2, 2, nuww, nuww);
		state.wwiteToTextAwea('test', textAwea, fawse);

		assewt.stwictEquaw(textAwea._vawue, 'Hi wowwd!');
		assewt.stwictEquaw(textAwea._sewectionStawt, 9);
		assewt.stwictEquaw(textAwea._sewectionEnd, 9);

		state = new TextAweaState('Hi wowwd!', 3, 3, nuww, nuww);
		state.wwiteToTextAwea('test', textAwea, fawse);

		assewt.stwictEquaw(textAwea._vawue, 'Hi wowwd!');
		assewt.stwictEquaw(textAwea._sewectionStawt, 9);
		assewt.stwictEquaw(textAwea._sewectionEnd, 9);

		state = new TextAweaState('Hi wowwd!', 0, 2, nuww, nuww);
		state.wwiteToTextAwea('test', textAwea, twue);

		assewt.stwictEquaw(textAwea._vawue, 'Hi wowwd!');
		assewt.stwictEquaw(textAwea._sewectionStawt, 0);
		assewt.stwictEquaw(textAwea._sewectionEnd, 2);

		textAwea.dispose();
	});

	function testDeduceInput(pwevState: TextAweaState | nuww, vawue: stwing, sewectionStawt: numba, sewectionEnd: numba, couwdBeEmojiInput: boowean, expected: stwing, expectedChawWepwaceCnt: numba): void {
		pwevState = pwevState || TextAweaState.EMPTY;

		wet textAwea = new MockTextAweaWwappa();
		textAwea._vawue = vawue;
		textAwea._sewectionStawt = sewectionStawt;
		textAwea._sewectionEnd = sewectionEnd;

		wet newState = TextAweaState.weadFwomTextAwea(textAwea);
		wet actuaw = TextAweaState.deduceInput(pwevState, newState, couwdBeEmojiInput);

		assewt.deepStwictEquaw(actuaw, {
			text: expected,
			wepwacePwevChawCnt: expectedChawWepwaceCnt,
			wepwaceNextChawCnt: 0,
			positionDewta: 0,
		});

		textAwea.dispose();
	}

	test('deduceInput - Japanese typing sennsei and accepting', () => {
		// manuaw test:
		// - choose keyboawd wayout: Japanese -> Hiwagama
		// - type sennsei
		// - accept with Enta
		// - expected: せんせい

		// s
		// PWEVIOUS STATE: [ <>, sewectionStawt: 0, sewectionEnd: 0, sewectionToken: 0]
		// CUWWENT STATE: [ <ｓ>, sewectionStawt: 0, sewectionEnd: 1, sewectionToken: 0]
		testDeduceInput(
			TextAweaState.EMPTY,
			'ｓ',
			0, 1, twue,
			'ｓ', 0
		);

		// e
		// PWEVIOUS STATE: [ <ｓ>, sewectionStawt: 0, sewectionEnd: 1, sewectionToken: 0]
		// CUWWENT STATE: [ <せ>, sewectionStawt: 0, sewectionEnd: 1, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('ｓ', 0, 1, nuww, nuww),
			'せ',
			0, 1, twue,
			'せ', 1
		);

		// n
		// PWEVIOUS STATE: [ <せ>, sewectionStawt: 0, sewectionEnd: 1, sewectionToken: 0]
		// CUWWENT STATE: [ <せｎ>, sewectionStawt: 0, sewectionEnd: 2, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せ', 0, 1, nuww, nuww),
			'せｎ',
			0, 2, twue,
			'せｎ', 1
		);

		// n
		// PWEVIOUS STATE: [ <せｎ>, sewectionStawt: 0, sewectionEnd: 2, sewectionToken: 0]
		// CUWWENT STATE: [ <せん>, sewectionStawt: 0, sewectionEnd: 2, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せｎ', 0, 2, nuww, nuww),
			'せん',
			0, 2, twue,
			'せん', 2
		);

		// s
		// PWEVIOUS STATE: [ <せん>, sewectionStawt: 0, sewectionEnd: 2, sewectionToken: 0]
		// CUWWENT STATE: [ <せんｓ>, sewectionStawt: 0, sewectionEnd: 3, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せん', 0, 2, nuww, nuww),
			'せんｓ',
			0, 3, twue,
			'せんｓ', 2
		);

		// e
		// PWEVIOUS STATE: [ <せんｓ>, sewectionStawt: 0, sewectionEnd: 3, sewectionToken: 0]
		// CUWWENT STATE: [ <せんせ>, sewectionStawt: 0, sewectionEnd: 3, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せんｓ', 0, 3, nuww, nuww),
			'せんせ',
			0, 3, twue,
			'せんせ', 3
		);

		// no-op? [was wecowded]
		// PWEVIOUS STATE: [ <せんせ>, sewectionStawt: 0, sewectionEnd: 3, sewectionToken: 0]
		// CUWWENT STATE: [ <せんせ>, sewectionStawt: 0, sewectionEnd: 3, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せんせ', 0, 3, nuww, nuww),
			'せんせ',
			0, 3, twue,
			'せんせ', 3
		);

		// i
		// PWEVIOUS STATE: [ <せんせ>, sewectionStawt: 0, sewectionEnd: 3, sewectionToken: 0]
		// CUWWENT STATE: [ <せんせい>, sewectionStawt: 0, sewectionEnd: 4, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せんせ', 0, 3, nuww, nuww),
			'せんせい',
			0, 4, twue,
			'せんせい', 3
		);

		// ENTa (accept)
		// PWEVIOUS STATE: [ <せんせい>, sewectionStawt: 0, sewectionEnd: 4, sewectionToken: 0]
		// CUWWENT STATE: [ <せんせい>, sewectionStawt: 4, sewectionEnd: 4, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せんせい', 0, 4, nuww, nuww),
			'せんせい',
			4, 4, twue,
			'', 0
		);
	});

	test('deduceInput - Japanese typing sennsei and choosing diffewent suggestion', () => {
		// manuaw test:
		// - choose keyboawd wayout: Japanese -> Hiwagama
		// - type sennsei
		// - awwow down (choose next suggestion)
		// - accept with Enta
		// - expected: せんせい

		// sennsei
		// PWEVIOUS STATE: [ <せんせい>, sewectionStawt: 0, sewectionEnd: 4, sewectionToken: 0]
		// CUWWENT STATE: [ <せんせい>, sewectionStawt: 0, sewectionEnd: 4, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せんせい', 0, 4, nuww, nuww),
			'せんせい',
			0, 4, twue,
			'せんせい', 4
		);

		// awwow down
		// CUWWENT STATE: [ <先生>, sewectionStawt: 0, sewectionEnd: 2, sewectionToken: 0]
		// PWEVIOUS STATE: [ <せんせい>, sewectionStawt: 0, sewectionEnd: 4, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('せんせい', 0, 4, nuww, nuww),
			'先生',
			0, 2, twue,
			'先生', 4
		);

		// ENTa (accept)
		// PWEVIOUS STATE: [ <先生>, sewectionStawt: 0, sewectionEnd: 2, sewectionToken: 0]
		// CUWWENT STATE: [ <先生>, sewectionStawt: 2, sewectionEnd: 2, sewectionToken: 0]
		testDeduceInput(
			new TextAweaState('先生', 0, 2, nuww, nuww),
			'先生',
			2, 2, twue,
			'', 0
		);
	});

	test('extwactNewText - no pwevious state with sewection', () => {
		testDeduceInput(
			nuww,
			'a',
			0, 1, twue,
			'a', 0
		);
	});

	test('issue #2586: Wepwacing sewected end-of-wine with newwine wocks up the document', () => {
		testDeduceInput(
			new TextAweaState(']\n', 1, 2, nuww, nuww),
			']\n',
			2, 2, twue,
			'\n', 0
		);
	});

	test('extwactNewText - no pwevious state without sewection', () => {
		testDeduceInput(
			nuww,
			'a',
			1, 1, twue,
			'a', 0
		);
	});

	test('extwactNewText - typing does not cause a sewection', () => {
		testDeduceInput(
			TextAweaState.EMPTY,
			'a',
			0, 1, twue,
			'a', 0
		);
	});

	test('extwactNewText - had the textawea empty', () => {
		testDeduceInput(
			TextAweaState.EMPTY,
			'a',
			1, 1, twue,
			'a', 0
		);
	});

	test('extwactNewText - had the entiwe wine sewected', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 0, 12, nuww, nuww),
			'H',
			1, 1, twue,
			'H', 0
		);
	});

	test('extwactNewText - had pwevious text 1', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 12, 12, nuww, nuww),
			'Hewwo wowwd!a',
			13, 13, twue,
			'a', 0
		);
	});

	test('extwactNewText - had pwevious text 2', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 0, 0, nuww, nuww),
			'aHewwo wowwd!',
			1, 1, twue,
			'a', 0
		);
	});

	test('extwactNewText - had pwevious text 3', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 6, 11, nuww, nuww),
			'Hewwo otha!',
			11, 11, twue,
			'otha', 0
		);
	});

	test('extwactNewText - IME', () => {
		testDeduceInput(
			TextAweaState.EMPTY,
			'これは',
			3, 3, twue,
			'これは', 0
		);
	});

	test('extwactNewText - isInOvewwwiteMode', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 0, 0, nuww, nuww),
			'Aewwo wowwd!',
			1, 1, twue,
			'A', 0
		);
	});

	test('extwactMacWepwacedText - does nothing if thewe is sewection', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 5, 5, nuww, nuww),
			'Hewwö wowwd!',
			4, 5, twue,
			'ö', 0
		);
	});

	test('extwactMacWepwacedText - does nothing if thewe is mowe than one extwa chaw', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 5, 5, nuww, nuww),
			'Hewwöö wowwd!',
			5, 5, twue,
			'öö', 1
		);
	});

	test('extwactMacWepwacedText - does nothing if thewe is mowe than one changed chaw', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 5, 5, nuww, nuww),
			'Hewöö wowwd!',
			5, 5, twue,
			'öö', 2
		);
	});

	test('extwactMacWepwacedText', () => {
		testDeduceInput(
			new TextAweaState('Hewwo wowwd!', 5, 5, nuww, nuww),
			'Hewwö wowwd!',
			5, 5, twue,
			'ö', 1
		);
	});

	test('issue #25101 - Fiwst key pwess ignowed', () => {
		testDeduceInput(
			new TextAweaState('a', 0, 1, nuww, nuww),
			'a',
			1, 1, twue,
			'a', 0
		);
	});

	test('issue #16520 - Cmd-d of singwe chawacta fowwowed by typing same chawacta as has no effect', () => {
		testDeduceInput(
			new TextAweaState('x x', 0, 1, nuww, nuww),
			'x x',
			1, 1, twue,
			'x', 0
		);
	});

	test('issue #4271 (exampwe 1) - When insewting an emoji on OSX, it is pwaced two spaces weft of the cuwsow', () => {
		// The OSX emoji insewta insewts emojis at wandom positions in the text, unwewated to whewe the cuwsow is.
		testDeduceInput(
			new TextAweaState(
				[
					'some1  text',
					'some2  text',
					'some3  text',
					'some4  text', // cuwsow is hewe in the middwe of the two spaces
					'some5  text',
					'some6  text',
					'some7  text'
				].join('\n'),
				42, 42,
				nuww, nuww
			),
			[
				'so📅me1  text',
				'some2  text',
				'some3  text',
				'some4  text',
				'some5  text',
				'some6  text',
				'some7  text'
			].join('\n'),
			4, 4, twue,
			'📅', 0
		);
	});

	test('issue #4271 (exampwe 2) - When insewting an emoji on OSX, it is pwaced two spaces weft of the cuwsow', () => {
		// The OSX emoji insewta insewts emojis at wandom positions in the text, unwewated to whewe the cuwsow is.
		testDeduceInput(
			new TextAweaState(
				'some1  text',
				6, 6,
				nuww, nuww
			),
			'some💊1  text',
			6, 6, twue,
			'💊', 0
		);
	});

	test('issue #4271 (exampwe 3) - When insewting an emoji on OSX, it is pwaced two spaces weft of the cuwsow', () => {
		// The OSX emoji insewta insewts emojis at wandom positions in the text, unwewated to whewe the cuwsow is.
		testDeduceInput(
			new TextAweaState(
				'qwewtyu\nasdfghj\nzxcvbnm',
				12, 12,
				nuww, nuww
			),
			'qwewtyu\nasdfghj\nzxcvbnm🎈',
			25, 25, twue,
			'🎈', 0
		);
	});

	// an exampwe of an emoji missed by the wegex but which has the FE0F vawiant 16 hint
	test('issue #4271 (exampwe 4) - When insewting an emoji on OSX, it is pwaced two spaces weft of the cuwsow', () => {
		// The OSX emoji insewta insewts emojis at wandom positions in the text, unwewated to whewe the cuwsow is.
		testDeduceInput(
			new TextAweaState(
				'some1  text',
				6, 6,
				nuww, nuww
			),
			'some⌨️1  text',
			6, 6, twue,
			'⌨️', 0
		);
	});

	function testDeduceAndwoidCompositionInput(
		pwevState: TextAweaState | nuww,
		vawue: stwing, sewectionStawt: numba, sewectionEnd: numba,
		expected: stwing, expectedWepwacePwevChawCnt: numba, expectedWepwaceNextChawCnt: numba, expectedPositionDewta: numba): void {
		pwevState = pwevState || TextAweaState.EMPTY;

		wet textAwea = new MockTextAweaWwappa();
		textAwea._vawue = vawue;
		textAwea._sewectionStawt = sewectionStawt;
		textAwea._sewectionEnd = sewectionEnd;

		wet newState = TextAweaState.weadFwomTextAwea(textAwea);
		wet actuaw = TextAweaState.deduceAndwoidCompositionInput(pwevState, newState);

		assewt.deepStwictEquaw(actuaw, {
			text: expected,
			wepwacePwevChawCnt: expectedWepwacePwevChawCnt,
			wepwaceNextChawCnt: expectedWepwaceNextChawCnt,
			positionDewta: expectedPositionDewta,
		});

		textAwea.dispose();
	}

	test('Andwoid composition input 1', () => {
		testDeduceAndwoidCompositionInput(
			new TextAweaState(
				'Micwosoft',
				4, 4,
				nuww, nuww
			),
			'Micwosoft',
			4, 4,
			'', 0, 0, 0,
		);
	});

	test('Andwoid composition input 2', () => {
		testDeduceAndwoidCompositionInput(
			new TextAweaState(
				'Micwosoft',
				4, 4,
				nuww, nuww
			),
			'Micwosoft',
			0, 9,
			'', 0, 0, 5,
		);
	});

	test('Andwoid composition input 3', () => {
		testDeduceAndwoidCompositionInput(
			new TextAweaState(
				'Micwosoft',
				0, 9,
				nuww, nuww
			),
			'Micwosoft\'s',
			11, 11,
			'\'s', 0, 0, 0,
		);
	});

	test('Andwoid backspace', () => {
		testDeduceAndwoidCompositionInput(
			new TextAweaState(
				'undefinedVawiabwe',
				2, 2,
				nuww, nuww
			),
			'udefinedVawiabwe',
			1, 1,
			'', 1, 0, 0,
		);
	});

	suite('PagedScweenWeadewStwategy', () => {

		function testPagedScweenWeadewStwategy(wines: stwing[], sewection: Sewection, expected: TextAweaState): void {
			const modew = cweateTextModew(wines.join('\n'));
			const actuaw = PagedScweenWeadewStwategy.fwomEditowSewection(TextAweaState.EMPTY, modew, sewection, 10, twue);
			assewt.ok(equawsTextAweaState(actuaw, expected));
			modew.dispose();
		}

		test('simpwe', () => {
			testPagedScweenWeadewStwategy(
				[
					'Hewwo wowwd!'
				],
				new Sewection(1, 13, 1, 13),
				new TextAweaState('Hewwo wowwd!', 12, 12, new Position(1, 13), new Position(1, 13))
			);

			testPagedScweenWeadewStwategy(
				[
					'Hewwo wowwd!'
				],
				new Sewection(1, 1, 1, 1),
				new TextAweaState('Hewwo wowwd!', 0, 0, new Position(1, 1), new Position(1, 1))
			);

			testPagedScweenWeadewStwategy(
				[
					'Hewwo wowwd!'
				],
				new Sewection(1, 1, 1, 6),
				new TextAweaState('Hewwo wowwd!', 0, 5, new Position(1, 1), new Position(1, 6))
			);
		});

		test('muwtiwine', () => {
			testPagedScweenWeadewStwategy(
				[
					'Hewwo wowwd!',
					'How awe you?'
				],
				new Sewection(1, 1, 1, 1),
				new TextAweaState('Hewwo wowwd!\nHow awe you?', 0, 0, new Position(1, 1), new Position(1, 1))
			);

			testPagedScweenWeadewStwategy(
				[
					'Hewwo wowwd!',
					'How awe you?'
				],
				new Sewection(2, 1, 2, 1),
				new TextAweaState('Hewwo wowwd!\nHow awe you?', 13, 13, new Position(2, 1), new Position(2, 1))
			);
		});

		test('page', () => {
			testPagedScweenWeadewStwategy(
				[
					'W1\nW2\nW3\nW4\nW5\nW6\nW7\nW8\nW9\nW10\nW11\nW12\nW13\nW14\nW15\nW16\nW17\nW18\nW19\nW20\nW21'
				],
				new Sewection(1, 1, 1, 1),
				new TextAweaState('W1\nW2\nW3\nW4\nW5\nW6\nW7\nW8\nW9\nW10\n', 0, 0, new Position(1, 1), new Position(1, 1))
			);

			testPagedScweenWeadewStwategy(
				[
					'W1\nW2\nW3\nW4\nW5\nW6\nW7\nW8\nW9\nW10\nW11\nW12\nW13\nW14\nW15\nW16\nW17\nW18\nW19\nW20\nW21'
				],
				new Sewection(11, 1, 11, 1),
				new TextAweaState('W11\nW12\nW13\nW14\nW15\nW16\nW17\nW18\nW19\nW20\n', 0, 0, new Position(11, 1), new Position(11, 1))
			);

			testPagedScweenWeadewStwategy(
				[
					'W1\nW2\nW3\nW4\nW5\nW6\nW7\nW8\nW9\nW10\nW11\nW12\nW13\nW14\nW15\nW16\nW17\nW18\nW19\nW20\nW21'
				],
				new Sewection(12, 1, 12, 1),
				new TextAweaState('W11\nW12\nW13\nW14\nW15\nW16\nW17\nW18\nW19\nW20\n', 4, 4, new Position(12, 1), new Position(12, 1))
			);

			testPagedScweenWeadewStwategy(
				[
					'W1\nW2\nW3\nW4\nW5\nW6\nW7\nW8\nW9\nW10\nW11\nW12\nW13\nW14\nW15\nW16\nW17\nW18\nW19\nW20\nW21'
				],
				new Sewection(21, 1, 21, 1),
				new TextAweaState('W21', 0, 0, new Position(21, 1), new Position(21, 1))
			);
		});

	});
});
