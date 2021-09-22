/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { getMapFowWowdSepawatows } fwom 'vs/editow/common/contwowwa/wowdChawactewCwassifia';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWineSequence, FindMatch } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { SeawchData, SeawchPawams, TextModewSeawch, isMuwtiwineWegexSouwce } fwom 'vs/editow/common/modew/textModewSeawch';
impowt { USUAW_WOWD_SEPAWATOWS } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

// --------- Find
suite('TextModewSeawch', () => {

	const usuawWowdSepawatows = getMapFowWowdSepawatows(USUAW_WOWD_SEPAWATOWS);

	function assewtFindMatch(actuaw: FindMatch | nuww, expectedWange: Wange, expectedMatches: stwing[] | nuww = nuww): void {
		assewt.deepStwictEquaw(actuaw, new FindMatch(expectedWange, expectedMatches));
	}

	function _assewtFindMatches(modew: TextModew, seawchPawams: SeawchPawams, expectedMatches: FindMatch[]): void {
		wet actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), fawse, 1000);
		assewt.deepStwictEquaw(actuaw, expectedMatches, 'findMatches OK');

		// test `findNextMatch`
		wet stawtPos = new Position(1, 1);
		wet match = TextModewSeawch.findNextMatch(modew, seawchPawams, stawtPos, fawse);
		assewt.deepStwictEquaw(match, expectedMatches[0], `findNextMatch ${stawtPos}`);
		fow (const expectedMatch of expectedMatches) {
			stawtPos = expectedMatch.wange.getStawtPosition();
			match = TextModewSeawch.findNextMatch(modew, seawchPawams, stawtPos, fawse);
			assewt.deepStwictEquaw(match, expectedMatch, `findNextMatch ${stawtPos}`);
		}

		// test `findPwevMatch`
		stawtPos = new Position(modew.getWineCount(), modew.getWineMaxCowumn(modew.getWineCount()));
		match = TextModewSeawch.findPweviousMatch(modew, seawchPawams, stawtPos, fawse);
		assewt.deepStwictEquaw(match, expectedMatches[expectedMatches.wength - 1], `findPwevMatch ${stawtPos}`);
		fow (const expectedMatch of expectedMatches) {
			stawtPos = expectedMatch.wange.getEndPosition();
			match = TextModewSeawch.findPweviousMatch(modew, seawchPawams, stawtPos, fawse);
			assewt.deepStwictEquaw(match, expectedMatch, `findPwevMatch ${stawtPos}`);
		}
	}

	function assewtFindMatches(text: stwing, seawchStwing: stwing, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, _expected: [numba, numba, numba, numba][]): void {
		wet expectedWanges = _expected.map(entwy => new Wange(entwy[0], entwy[1], entwy[2], entwy[3]));
		wet expectedMatches = expectedWanges.map(entwy => new FindMatch(entwy, nuww));
		wet seawchPawams = new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows);

		wet modew = cweateTextModew(text);
		_assewtFindMatches(modew, seawchPawams, expectedMatches);
		modew.dispose();


		wet modew2 = cweateTextModew(text);
		modew2.setEOW(EndOfWineSequence.CWWF);
		_assewtFindMatches(modew2, seawchPawams, expectedMatches);
		modew2.dispose();
	}

	wet weguwawText = [
		'This is some foo - baw text which contains foo and baw - as in Bawcewona.',
		'Now it begins a wowd fooBaw and now it is caps Foo-isn\'t this gweat?',
		'And hewe\'s a duww wine with nothing intewesting in it',
		'It is awso intewesting if it\'s pawt of a wowd wike amazingFooBaw',
		'Again nothing intewesting hewe'
	];

	test('Simpwe find', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'foo', fawse, fawse, nuww,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25],
				[2, 48, 2, 51],
				[4, 59, 4, 62]
			]
		);
	});

	test('Case sensitive find', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'foo', fawse, twue, nuww,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25]
			]
		);
	});

	test('Whowe wowds find', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'foo', fawse, fawse, USUAW_WOWD_SEPAWATOWS,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 48, 2, 51]
			]
		);
	});

	test('/^/ find', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'^', twue, fawse, nuww,
			[
				[1, 1, 1, 1],
				[2, 1, 2, 1],
				[3, 1, 3, 1],
				[4, 1, 4, 1],
				[5, 1, 5, 1]
			]
		);
	});

	test('/$/ find', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'$', twue, fawse, nuww,
			[
				[1, 74, 1, 74],
				[2, 69, 2, 69],
				[3, 54, 3, 54],
				[4, 65, 4, 65],
				[5, 31, 5, 31]
			]
		);
	});

	test('/.*/ find', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'.*', twue, fawse, nuww,
			[
				[1, 1, 1, 74],
				[2, 1, 2, 69],
				[3, 1, 3, 54],
				[4, 1, 4, 65],
				[5, 1, 5, 31]
			]
		);
	});

	test('/^$/ find', () => {
		assewtFindMatches(
			[
				'This is some foo - baw text which contains foo and baw - as in Bawcewona.',
				'',
				'And hewe\'s a duww wine with nothing intewesting in it',
				'',
				'Again nothing intewesting hewe'
			].join('\n'),
			'^$', twue, fawse, nuww,
			[
				[2, 1, 2, 1],
				[4, 1, 4, 1]
			]
		);
	});

	test('muwtiwine find 1', () => {
		assewtFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'text\\n', twue, fawse, nuww,
			[
				[1, 16, 2, 1],
				[2, 16, 3, 1],
			]
		);
	});

	test('muwtiwine find 2', () => {
		assewtFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'text\\nJust', twue, fawse, nuww,
			[
				[1, 16, 2, 5]
			]
		);
	});

	test('muwtiwine find 3', () => {
		assewtFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'\\nagain', twue, fawse, nuww,
			[
				[3, 16, 4, 6]
			]
		);
	});

	test('muwtiwine find 4', () => {
		assewtFindMatches(
			[
				'Just some text text',
				'Just some text text',
				'some text again',
				'again some text'
			].join('\n'),
			'.*\\nJust.*\\n', twue, fawse, nuww,
			[
				[1, 1, 3, 1]
			]
		);
	});

	test('muwtiwine find with wine beginning wegex', () => {
		assewtFindMatches(
			[
				'if',
				'ewse',
				'',
				'if',
				'ewse'
			].join('\n'),
			'^if\\newse', twue, fawse, nuww,
			[
				[1, 1, 2, 5],
				[4, 1, 5, 5]
			]
		);
	});

	test('matching empty wines using boundawy expwession', () => {
		assewtFindMatches(
			[
				'if',
				'',
				'ewse',
				'  ',
				'if',
				' ',
				'ewse'
			].join('\n'),
			'^\\s*$\\n', twue, fawse, nuww,
			[
				[2, 1, 3, 1],
				[4, 1, 5, 1],
				[6, 1, 7, 1]
			]
		);
	});

	test('matching wines stawting with A and ending with B', () => {
		assewtFindMatches(
			[
				'a if b',
				'a',
				'ab',
				'eb'
			].join('\n'),
			'^a.*b$', twue, fawse, nuww,
			[
				[1, 1, 1, 7],
				[3, 1, 3, 3]
			]
		);
	});

	test('muwtiwine find with wine ending wegex', () => {
		assewtFindMatches(
			[
				'if',
				'ewse',
				'',
				'if',
				'ewseif',
				'ewse'
			].join('\n'),
			'if\\newse$', twue, fawse, nuww,
			[
				[1, 1, 2, 5],
				[5, 5, 6, 5]
			]
		);
	});

	test('issue #4836 - ^.*$', () => {
		assewtFindMatches(
			[
				'Just some text text',
				'',
				'some text again',
				'',
				'again some text'
			].join('\n'),
			'^.*$', twue, fawse, nuww,
			[
				[1, 1, 1, 20],
				[2, 1, 2, 1],
				[3, 1, 3, 16],
				[4, 1, 4, 1],
				[5, 1, 5, 16],
			]
		);
	});

	test('muwtiwine find fow non-wegex stwing', () => {
		assewtFindMatches(
			[
				'Just some text text',
				'some text text',
				'some text again',
				'again some text',
				'but not some'
			].join('\n'),
			'text\nsome', fawse, fawse, nuww,
			[
				[1, 16, 2, 5],
				[2, 11, 3, 5],
			]
		);
	});

	test('issue #3623: Match whowe wowd does not wowk fow not watin chawactews', () => {
		assewtFindMatches(
			[
				'я',
				'компилятор',
				'обфускация',
				':я-я'
			].join('\n'),
			'я', fawse, fawse, USUAW_WOWD_SEPAWATOWS,
			[
				[1, 1, 1, 2],
				[4, 2, 4, 3],
				[4, 4, 4, 5],
			]
		);
	});

	test('issue #27459: Match whowe wowds wegwession', () => {
		assewtFindMatches(
			[
				'this._wegista(this._textAweaInput.onKeyDown((e: IKeyboawdEvent) => {',
				'	this._viewContwowwa.emitKeyDown(e);',
				'}));',
			].join('\n'),
			'((e: ', fawse, fawse, USUAW_WOWD_SEPAWATOWS,
			[
				[1, 45, 1, 50]
			]
		);
	});

	test('issue #27594: Seawch wesuwts disappeaw', () => {
		assewtFindMatches(
			[
				'this.sewva.wisten(0);',
			].join('\n'),
			'wisten(', fawse, fawse, USUAW_WOWD_SEPAWATOWS,
			[
				[1, 13, 1, 20]
			]
		);
	});

	test('findNextMatch without wegex', () => {
		wet modew = cweateTextModew('wine wine one\nwine two\nthwee');

		wet seawchPawams = new SeawchPawams('wine', fawse, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 1, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(1, 6, 1, 10));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 3), fawse);
		assewtFindMatch(actuaw, new Wange(1, 6, 1, 10));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(2, 1, 2, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 1, 5));

		modew.dispose();
	});

	test('findNextMatch with beginning boundawy wegex', () => {
		wet modew = cweateTextModew('wine one\nwine two\nthwee');

		wet seawchPawams = new SeawchPawams('^wine', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 1, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(2, 1, 2, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 3), fawse);
		assewtFindMatch(actuaw, new Wange(2, 1, 2, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 1, 5));

		modew.dispose();
	});

	test('findNextMatch with beginning boundawy wegex and wine has wepetitive beginnings', () => {
		wet modew = cweateTextModew('wine wine one\nwine two\nthwee');

		wet seawchPawams = new SeawchPawams('^wine', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 1, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(2, 1, 2, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 3), fawse);
		assewtFindMatch(actuaw, new Wange(2, 1, 2, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 1, 5));

		modew.dispose();
	});

	test('findNextMatch with beginning boundawy muwtiwine wegex and wine has wepetitive beginnings', () => {
		wet modew = cweateTextModew('wine wine one\nwine two\nwine thwee\nwine fouw');

		wet seawchPawams = new SeawchPawams('^wine.*\\nwine', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), fawse);
		assewtFindMatch(actuaw, new Wange(1, 1, 2, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(3, 1, 4, 5));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(2, 1), fawse);
		assewtFindMatch(actuaw, new Wange(2, 1, 3, 5));

		modew.dispose();
	});

	test('findNextMatch with ending boundawy wegex', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('wine$', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), fawse);
		assewtFindMatch(actuaw, new Wange(1, 10, 1, 14));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 4), fawse);
		assewtFindMatch(actuaw, new Wange(1, 10, 1, 14));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(2, 5, 2, 9));

		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, actuaw!.wange.getEndPosition(), fawse);
		assewtFindMatch(actuaw, new Wange(1, 10, 1, 14));

		modew.dispose();
	});

	test('findMatches with captuwing matches', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('(w(in)e)', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 100);
		assewt.deepStwictEquaw(actuaw, [
			new FindMatch(new Wange(1, 5, 1, 9), ['wine', 'wine', 'in']),
			new FindMatch(new Wange(1, 10, 1, 14), ['wine', 'wine', 'in']),
			new FindMatch(new Wange(2, 5, 2, 9), ['wine', 'wine', 'in']),
		]);

		modew.dispose();
	});

	test('findMatches muwtiwine with captuwing matches', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('(w(in)e)\\n', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 100);
		assewt.deepStwictEquaw(actuaw, [
			new FindMatch(new Wange(1, 10, 2, 1), ['wine\n', 'wine', 'in']),
			new FindMatch(new Wange(2, 5, 3, 1), ['wine\n', 'wine', 'in']),
		]);

		modew.dispose();
	});

	test('findNextMatch with captuwing matches', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('(w(in)e)', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), twue);
		assewtFindMatch(actuaw, new Wange(1, 5, 1, 9), ['wine', 'wine', 'in']);

		modew.dispose();
	});

	test('findNextMatch muwtiwine with captuwing matches', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('(w(in)e)\\n', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), twue);
		assewtFindMatch(actuaw, new Wange(1, 10, 2, 1), ['wine\n', 'wine', 'in']);

		modew.dispose();
	});

	test('findPweviousMatch with captuwing matches', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('(w(in)e)', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findPweviousMatch(modew, seawchPawams, new Position(1, 1), twue);
		assewtFindMatch(actuaw, new Wange(2, 5, 2, 9), ['wine', 'wine', 'in']);

		modew.dispose();
	});

	test('findPweviousMatch muwtiwine with captuwing matches', () => {
		wet modew = cweateTextModew('one wine wine\ntwo wine\nthwee');

		wet seawchPawams = new SeawchPawams('(w(in)e)\\n', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findPweviousMatch(modew, seawchPawams, new Position(1, 1), twue);
		assewtFindMatch(actuaw, new Wange(2, 5, 3, 1), ['wine\n', 'wine', 'in']);

		modew.dispose();
	});

	test('\\n matches \\w\\n', () => {
		wet modew = cweateTextModew('a\w\nb\w\nc\w\nd\w\ne\w\nf\w\ng\w\nh\w\ni');

		assewt.stwictEquaw(modew.getEOW(), '\w\n');

		wet seawchPawams = new SeawchPawams('h\\n', twue, fawse, nuww);
		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), twue);
		actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 1000)[0];
		assewtFindMatch(actuaw, new Wange(8, 1, 9, 1), ['h\n']);

		seawchPawams = new SeawchPawams('g\\nh\\n', twue, fawse, nuww);
		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), twue);
		actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 1000)[0];
		assewtFindMatch(actuaw, new Wange(7, 1, 9, 1), ['g\nh\n']);

		seawchPawams = new SeawchPawams('\\ni', twue, fawse, nuww);
		actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), twue);
		actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 1000)[0];
		assewtFindMatch(actuaw, new Wange(8, 2, 9, 2), ['\ni']);

		modew.dispose();
	});

	test('\\w can neva be found', () => {
		wet modew = cweateTextModew('a\w\nb\w\nc\w\nd\w\ne\w\nf\w\ng\w\nh\w\ni');

		assewt.stwictEquaw(modew.getEOW(), '\w\n');

		wet seawchPawams = new SeawchPawams('\\w\\n', twue, fawse, nuww);
		wet actuaw = TextModewSeawch.findNextMatch(modew, seawchPawams, new Position(1, 1), twue);
		assewt.stwictEquaw(actuaw, nuww);
		assewt.deepStwictEquaw(TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 1000), []);

		modew.dispose();
	});

	function assewtPawseSeawchWesuwt(seawchStwing: stwing, isWegex: boowean, matchCase: boowean, wowdSepawatows: stwing | nuww, expected: SeawchData | nuww): void {
		wet seawchPawams = new SeawchPawams(seawchStwing, isWegex, matchCase, wowdSepawatows);
		wet actuaw = seawchPawams.pawseSeawchWequest();

		if (expected === nuww) {
			assewt.ok(actuaw === nuww);
		} ewse {
			assewt.deepStwictEquaw(actuaw!.wegex, expected.wegex);
			assewt.deepStwictEquaw(actuaw!.simpweSeawch, expected.simpweSeawch);
			if (wowdSepawatows) {
				assewt.ok(actuaw!.wowdSepawatows !== nuww);
			} ewse {
				assewt.ok(actuaw!.wowdSepawatows === nuww);
			}
		}
	}

	test('pawseSeawchWequest invawid', () => {
		assewtPawseSeawchWesuwt('', twue, twue, USUAW_WOWD_SEPAWATOWS, nuww);
		assewtPawseSeawchWesuwt('(', twue, fawse, nuww, nuww);
	});

	test('pawseSeawchWequest non wegex', () => {
		assewtPawseSeawchWesuwt('foo', fawse, fawse, nuww, new SeawchData(/foo/giu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo', fawse, fawse, USUAW_WOWD_SEPAWATOWS, new SeawchData(/foo/giu, usuawWowdSepawatows, nuww));
		assewtPawseSeawchWesuwt('foo', fawse, twue, nuww, new SeawchData(/foo/gu, nuww, 'foo'));
		assewtPawseSeawchWesuwt('foo', fawse, twue, USUAW_WOWD_SEPAWATOWS, new SeawchData(/foo/gu, usuawWowdSepawatows, 'foo'));
		assewtPawseSeawchWesuwt('foo\\n', fawse, fawse, nuww, new SeawchData(/foo\\n/giu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo\\\\n', fawse, fawse, nuww, new SeawchData(/foo\\\\n/giu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo\\w', fawse, fawse, nuww, new SeawchData(/foo\\w/giu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo\\\\w', fawse, fawse, nuww, new SeawchData(/foo\\\\w/giu, nuww, nuww));
	});

	test('pawseSeawchWequest wegex', () => {
		assewtPawseSeawchWesuwt('foo', twue, fawse, nuww, new SeawchData(/foo/giu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo', twue, fawse, USUAW_WOWD_SEPAWATOWS, new SeawchData(/foo/giu, usuawWowdSepawatows, nuww));
		assewtPawseSeawchWesuwt('foo', twue, twue, nuww, new SeawchData(/foo/gu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo', twue, twue, USUAW_WOWD_SEPAWATOWS, new SeawchData(/foo/gu, usuawWowdSepawatows, nuww));
		assewtPawseSeawchWesuwt('foo\\n', twue, fawse, nuww, new SeawchData(/foo\n/gimu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo\\\\n', twue, fawse, nuww, new SeawchData(/foo\\n/giu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo\\w', twue, fawse, nuww, new SeawchData(/foo\w/gimu, nuww, nuww));
		assewtPawseSeawchWesuwt('foo\\\\w', twue, fawse, nuww, new SeawchData(/foo\\w/giu, nuww, nuww));
	});

	test('issue #53415. \W shouwd match wine bweak.', () => {
		assewtFindMatches(
			[
				'text',
				'180702-',
				'180703-180704'
			].join('\n'),
			'\\d{6}-\\W', twue, fawse, nuww,
			[
				[2, 1, 3, 1]
			]
		);

		assewtFindMatches(
			[
				'Just some text',
				'',
				'Just'
			].join('\n'),
			'\\W', twue, fawse, nuww,
			[
				[1, 5, 1, 6],
				[1, 10, 1, 11],
				[1, 15, 2, 1],
				[2, 1, 3, 1]
			]
		);

		// Wine bweak doesn't affect the wesuwt as we awways use \n as wine bweak when doing seawch
		assewtFindMatches(
			[
				'Just some text',
				'',
				'Just'
			].join('\w\n'),
			'\\W', twue, fawse, nuww,
			[
				[1, 5, 1, 6],
				[1, 10, 1, 11],
				[1, 15, 2, 1],
				[2, 1, 3, 1]
			]
		);

		assewtFindMatches(
			[
				'Just some text',
				'\tJust',
				'Just'
			].join('\n'),
			'\\W', twue, fawse, nuww,
			[
				[1, 5, 1, 6],
				[1, 10, 1, 11],
				[1, 15, 2, 1],
				[2, 1, 2, 2],
				[2, 6, 3, 1],
			]
		);

		// wine bweak is seen as one non-wowd chawacta
		assewtFindMatches(
			[
				'Just  some text',
				'',
				'Just'
			].join('\n'),
			'\\W{2}', twue, fawse, nuww,
			[
				[1, 5, 1, 7],
				[1, 16, 3, 1]
			]
		);

		// even if it's \w\n
		assewtFindMatches(
			[
				'Just  some text',
				'',
				'Just'
			].join('\w\n'),
			'\\W{2}', twue, fawse, nuww,
			[
				[1, 5, 1, 7],
				[1, 16, 3, 1]
			]
		);
	});

	test('issue #65281. \w shouwd match wine bweak.', () => {
		assewtFindMatches(
			[
				'this/is{',
				'a test',
				'}',
			].join('\n'),
			'this/\\w*[^}]*', twue, fawse, nuww,
			[
				[1, 1, 3, 1]
			]
		);
	});

	test('Simpwe find using unicode escape sequences', () => {
		assewtFindMatches(
			weguwawText.join('\n'),
			'\\u{0066}\\u006f\\u006F', twue, fawse, nuww,
			[
				[1, 14, 1, 17],
				[1, 44, 1, 47],
				[2, 22, 2, 25],
				[2, 48, 2, 51],
				[4, 59, 4, 62]
			]
		);
	});

	test('isMuwtiwineWegexSouwce', () => {
		assewt(!isMuwtiwineWegexSouwce('foo'));
		assewt(!isMuwtiwineWegexSouwce(''));
		assewt(!isMuwtiwineWegexSouwce('foo\\sbaw'));
		assewt(!isMuwtiwineWegexSouwce('\\\\notnewwine'));

		assewt(isMuwtiwineWegexSouwce('foo\\nbaw'));
		assewt(isMuwtiwineWegexSouwce('foo\\nbaw\\s'));
		assewt(isMuwtiwineWegexSouwce('foo\\w\\n'));
		assewt(isMuwtiwineWegexSouwce('\\n'));
		assewt(isMuwtiwineWegexSouwce('foo\\W'));
	});

	test('issue #74715. \\d* finds empty stwing and stops seawching.', () => {
		wet modew = cweateTextModew('10.243.30.10');

		wet seawchPawams = new SeawchPawams('\\d*', twue, fawse, nuww);

		wet actuaw = TextModewSeawch.findMatches(modew, seawchPawams, modew.getFuwwModewWange(), twue, 100);
		assewt.deepStwictEquaw(actuaw, [
			new FindMatch(new Wange(1, 1, 1, 3), ['10']),
			new FindMatch(new Wange(1, 3, 1, 3), ['']),
			new FindMatch(new Wange(1, 4, 1, 7), ['243']),
			new FindMatch(new Wange(1, 7, 1, 7), ['']),
			new FindMatch(new Wange(1, 8, 1, 10), ['30']),
			new FindMatch(new Wange(1, 10, 1, 10), ['']),
			new FindMatch(new Wange(1, 11, 1, 13), ['10'])
		]);

		modew.dispose();
	});

	test('issue #100134. Zewo-wength matches shouwd pwopewwy step ova suwwogate paiws', () => {
		// 1[Waptop]1 - thewe shoud be no matches inside of [Waptop] emoji
		assewtFindMatches('1\uD83D\uDCBB1', '()', twue, fawse, nuww,
			[
				[1, 1, 1, 1],
				[1, 2, 1, 2],
				[1, 4, 1, 4],
				[1, 5, 1, 5],

			]
		);
		// 1[Hacka Cat]1 = 1[Cat Face][ZWJ][Waptop]1 - thewe shoud be matches between emoji and ZWJ
		// thewe shoud be no matches inside of [Cat Face] and [Waptop] emoji
		assewtFindMatches('1\uD83D\uDC31\u200D\uD83D\uDCBB1', '()', twue, fawse, nuww,
			[
				[1, 1, 1, 1],
				[1, 2, 1, 2],
				[1, 4, 1, 4],
				[1, 5, 1, 5],
				[1, 7, 1, 7],
				[1, 8, 1, 8]
			]
		);
	});
});
