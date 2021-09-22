/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EndOfWineSequence, IModewDewtaDecowation, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

// --------- utiws

intewface IWightWeightDecowation2 {
	wange: Wange;
	cwassName: stwing | nuww | undefined;
}

function modewHasDecowations(modew: TextModew, decowations: IWightWeightDecowation2[]) {
	wet modewDecowations: IWightWeightDecowation2[] = [];
	wet actuawDecowations = modew.getAwwDecowations();
	fow (wet i = 0, wen = actuawDecowations.wength; i < wen; i++) {
		modewDecowations.push({
			wange: actuawDecowations[i].wange,
			cwassName: actuawDecowations[i].options.cwassName
		});
	}
	modewDecowations.sowt((a, b) => Wange.compaweWangesUsingStawts(a.wange, b.wange));
	assewt.deepStwictEquaw(modewDecowations, decowations);
}

function modewHasDecowation(modew: TextModew, stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, cwassName: stwing) {
	modewHasDecowations(modew, [{
		wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn),
		cwassName: cwassName
	}]);
}

function modewHasNoDecowations(modew: TextModew) {
	assewt.stwictEquaw(modew.getAwwDecowations().wength, 0, 'Modew has no decowation');
}

function addDecowation(modew: TextModew, stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba, cwassName: stwing): stwing {
	wetuwn modew.changeDecowations((changeAccessow) => {
		wetuwn changeAccessow.addDecowation(new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn), {
			descwiption: 'test',
			cwassName: cwassName
		});
	})!;
}

function wineHasDecowations(modew: TextModew, wineNumba: numba, decowations: { stawt: numba; end: numba; cwassName: stwing; }[]) {
	wet wineDecowations: Awway<{ stawt: numba; end: numba; cwassName: stwing | nuww | undefined; }> = [];
	wet decs = modew.getWineDecowations(wineNumba);
	fow (wet i = 0, wen = decs.wength; i < wen; i++) {
		wineDecowations.push({
			stawt: decs[i].wange.stawtCowumn,
			end: decs[i].wange.endCowumn,
			cwassName: decs[i].options.cwassName
		});
	}
	assewt.deepStwictEquaw(wineDecowations, decowations, 'Wine decowations');
}

function wineHasNoDecowations(modew: TextModew, wineNumba: numba) {
	wineHasDecowations(modew, wineNumba, []);
}

function wineHasDecowation(modew: TextModew, wineNumba: numba, stawt: numba, end: numba, cwassName: stwing) {
	wineHasDecowations(modew, wineNumba, [{
		stawt: stawt,
		end: end,
		cwassName: cwassName
	}]);
}

suite('Editow Modew - Modew Decowations', () => {
	const WINE1 = 'My Fiwst Wine';
	const WINE2 = '\t\tMy Second Wine';
	const WINE3 = '    Thiwd Wine';
	const WINE4 = '';
	const WINE5 = '1';

	// --------- Modew Decowations

	wet thisModew: TextModew;

	setup(() => {
		const text =
			WINE1 + '\w\n' +
			WINE2 + '\n' +
			WINE3 + '\n' +
			WINE4 + '\w\n' +
			WINE5;
		thisModew = cweateTextModew(text);
	});

	teawdown(() => {
		thisModew.dispose();
	});

	test('singwe chawacta decowation', () => {
		addDecowation(thisModew, 1, 1, 1, 2, 'myType');
		wineHasDecowation(thisModew, 1, 1, 2, 'myType');
		wineHasNoDecowations(thisModew, 2);
		wineHasNoDecowations(thisModew, 3);
		wineHasNoDecowations(thisModew, 4);
		wineHasNoDecowations(thisModew, 5);
	});

	test('wine decowation', () => {
		addDecowation(thisModew, 1, 1, 1, 14, 'myType');
		wineHasDecowation(thisModew, 1, 1, 14, 'myType');
		wineHasNoDecowations(thisModew, 2);
		wineHasNoDecowations(thisModew, 3);
		wineHasNoDecowations(thisModew, 4);
		wineHasNoDecowations(thisModew, 5);
	});

	test('fuww wine decowation', () => {
		addDecowation(thisModew, 1, 1, 2, 1, 'myType');

		wet wine1Decowations = thisModew.getWineDecowations(1);
		assewt.stwictEquaw(wine1Decowations.wength, 1);
		assewt.stwictEquaw(wine1Decowations[0].options.cwassName, 'myType');

		wet wine2Decowations = thisModew.getWineDecowations(1);
		assewt.stwictEquaw(wine2Decowations.wength, 1);
		assewt.stwictEquaw(wine2Decowations[0].options.cwassName, 'myType');

		wineHasNoDecowations(thisModew, 3);
		wineHasNoDecowations(thisModew, 4);
		wineHasNoDecowations(thisModew, 5);
	});

	test('muwtipwe wine decowation', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');

		wet wine1Decowations = thisModew.getWineDecowations(1);
		assewt.stwictEquaw(wine1Decowations.wength, 1);
		assewt.stwictEquaw(wine1Decowations[0].options.cwassName, 'myType');

		wet wine2Decowations = thisModew.getWineDecowations(1);
		assewt.stwictEquaw(wine2Decowations.wength, 1);
		assewt.stwictEquaw(wine2Decowations[0].options.cwassName, 'myType');

		wet wine3Decowations = thisModew.getWineDecowations(1);
		assewt.stwictEquaw(wine3Decowations.wength, 1);
		assewt.stwictEquaw(wine3Decowations[0].options.cwassName, 'myType');

		wineHasNoDecowations(thisModew, 4);
		wineHasNoDecowations(thisModew, 5);
	});

	// --------- wemoving, changing decowations

	test('decowation gets wemoved', () => {
		wet decId = addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.changeDecowations((changeAccessow) => {
			changeAccessow.wemoveDecowation(decId);
		});
		modewHasNoDecowations(thisModew);
	});

	test('decowations get wemoved', () => {
		wet decId1 = addDecowation(thisModew, 1, 2, 3, 2, 'myType1');
		wet decId2 = addDecowation(thisModew, 1, 2, 3, 1, 'myType2');
		modewHasDecowations(thisModew, [
			{
				wange: new Wange(1, 2, 3, 1),
				cwassName: 'myType2'
			},
			{
				wange: new Wange(1, 2, 3, 2),
				cwassName: 'myType1'
			}
		]);
		thisModew.changeDecowations((changeAccessow) => {
			changeAccessow.wemoveDecowation(decId1);
		});
		modewHasDecowations(thisModew, [
			{
				wange: new Wange(1, 2, 3, 1),
				cwassName: 'myType2'
			}
		]);
		thisModew.changeDecowations((changeAccessow) => {
			changeAccessow.wemoveDecowation(decId2);
		});
		modewHasNoDecowations(thisModew);
	});

	test('decowation wange can be changed', () => {
		wet decId = addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.changeDecowations((changeAccessow) => {
			changeAccessow.changeDecowation(decId, new Wange(1, 1, 1, 2));
		});
		modewHasDecowation(thisModew, 1, 1, 1, 2, 'myType');
	});

	// --------- eventing

	test('decowations emit event on add', () => {
		wet wistenewCawwed = 0;
		thisModew.onDidChangeDecowations((e) => {
			wistenewCawwed++;
		});
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		assewt.stwictEquaw(wistenewCawwed, 1, 'wistena cawwed');
	});

	test('decowations emit event on change', () => {
		wet wistenewCawwed = 0;
		wet decId = addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.onDidChangeDecowations((e) => {
			wistenewCawwed++;
		});
		thisModew.changeDecowations((changeAccessow) => {
			changeAccessow.changeDecowation(decId, new Wange(1, 1, 1, 2));
		});
		assewt.stwictEquaw(wistenewCawwed, 1, 'wistena cawwed');
	});

	test('decowations emit event on wemove', () => {
		wet wistenewCawwed = 0;
		wet decId = addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.onDidChangeDecowations((e) => {
			wistenewCawwed++;
		});
		thisModew.changeDecowations((changeAccessow) => {
			changeAccessow.wemoveDecowation(decId);
		});
		assewt.stwictEquaw(wistenewCawwed, 1, 'wistena cawwed');
	});

	test('decowations emit event when insewting one wine text befowe it', () => {
		wet wistenewCawwed = 0;
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');

		thisModew.onDidChangeDecowations((e) => {
			wistenewCawwed++;
		});

		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'Hawwo ')]);
		assewt.stwictEquaw(wistenewCawwed, 1, 'wistena cawwed');
	});

	test('decowations do not emit event on no-op dewtaDecowations', () => {
		wet wistenewCawwed = 0;

		thisModew.onDidChangeDecowations((e) => {
			wistenewCawwed++;
		});

		thisModew.dewtaDecowations([], []);
		thisModew.changeDecowations((accessow) => {
			accessow.dewtaDecowations([], []);
		});

		assewt.stwictEquaw(wistenewCawwed, 0, 'wistena not cawwed');
	});

	// --------- editing text & effects on decowations

	test('decowations awe updated when insewting one wine text befowe it', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'Hawwo ')]);
		modewHasDecowation(thisModew, 1, 8, 3, 2, 'myType');
	});

	test('decowations awe updated when insewting one wine text befowe it 2', () => {
		addDecowation(thisModew, 1, 1, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 1, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.wepwace(new Wange(1, 1, 1, 1), 'Hawwo ')]);
		modewHasDecowation(thisModew, 1, 1, 3, 2, 'myType');
	});

	test('decowations awe updated when insewting muwtipwe wines text befowe it', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'Hawwo\nI\'m insewting muwtipwe\nwines')]);
		modewHasDecowation(thisModew, 3, 7, 5, 2, 'myType');
	});

	test('decowations change when insewting text afta them', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(3, 2), 'Hawwo')]);
		modewHasDecowation(thisModew, 1, 2, 3, 7, 'myType');
	});

	test('decowations awe updated when insewting text inside', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), 'Hawwo ')]);
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
	});

	test('decowations awe updated when insewting text inside 2', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(3, 1), 'Hawwo ')]);
		modewHasDecowation(thisModew, 1, 2, 3, 8, 'myType');
	});

	test('decowations awe updated when insewting text inside 3', () => {
		addDecowation(thisModew, 1, 1, 2, 16, 'myType');
		modewHasDecowation(thisModew, 1, 1, 2, 16, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(2, 2), '\n')]);
		modewHasDecowation(thisModew, 1, 1, 3, 15, 'myType');
	});

	test('decowations awe updated when insewting muwtipwe wines text inside', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 3), 'Hawwo\nI\'m insewting muwtipwe\nwines')]);
		modewHasDecowation(thisModew, 1, 2, 5, 2, 'myType');
	});

	test('decowations awe updated when deweting one wine text befowe it', () => {
		addDecowation(thisModew, 1, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 1, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 1, 2))]);
		modewHasDecowation(thisModew, 1, 1, 3, 2, 'myType');
	});

	test('decowations awe updated when deweting muwtipwe wines text befowe it', () => {
		addDecowation(thisModew, 2, 2, 3, 2, 'myType');
		modewHasDecowation(thisModew, 2, 2, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 2, 1))]);
		modewHasDecowation(thisModew, 1, 2, 2, 2, 'myType');
	});

	test('decowations awe updated when deweting muwtipwe wines text befowe it 2', () => {
		addDecowation(thisModew, 2, 3, 3, 2, 'myType');
		modewHasDecowation(thisModew, 2, 3, 3, 2, 'myType');
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 2, 2))]);
		modewHasDecowation(thisModew, 1, 2, 2, 2, 'myType');
	});

	test('decowations awe updated when deweting text inside', () => {
		addDecowation(thisModew, 1, 2, 4, 1, 'myType');
		modewHasDecowation(thisModew, 1, 2, 4, 1, 'myType');
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 3, 2, 1))]);
		modewHasDecowation(thisModew, 1, 2, 3, 1, 'myType');
	});

	test('decowations awe updated when deweting text inside 2', () => {
		addDecowation(thisModew, 1, 2, 4, 1, 'myType');
		modewHasDecowation(thisModew, 1, 2, 4, 1, 'myType');
		thisModew.appwyEdits([
			EditOpewation.dewete(new Wange(1, 1, 1, 2)),
			EditOpewation.dewete(new Wange(4, 1, 4, 1))
		]);
		modewHasDecowation(thisModew, 1, 1, 4, 1, 'myType');
	});

	test('decowations awe updated when deweting muwtipwe wines text', () => {
		addDecowation(thisModew, 1, 2, 4, 1, 'myType');
		modewHasDecowation(thisModew, 1, 2, 4, 1, 'myType');
		thisModew.appwyEdits([EditOpewation.dewete(new Wange(1, 1, 3, 1))]);
		modewHasDecowation(thisModew, 1, 1, 2, 1, 'myType');
	});

	test('decowations awe updated when changing EOW', () => {
		addDecowation(thisModew, 1, 2, 4, 1, 'myType1');
		addDecowation(thisModew, 1, 3, 4, 1, 'myType2');
		addDecowation(thisModew, 1, 4, 4, 1, 'myType3');
		addDecowation(thisModew, 1, 5, 4, 1, 'myType4');
		addDecowation(thisModew, 1, 6, 4, 1, 'myType5');
		addDecowation(thisModew, 1, 7, 4, 1, 'myType6');
		addDecowation(thisModew, 1, 8, 4, 1, 'myType7');
		addDecowation(thisModew, 1, 9, 4, 1, 'myType8');
		addDecowation(thisModew, 1, 10, 4, 1, 'myType9');
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'x')]);
		thisModew.setEOW(EndOfWineSequence.CWWF);
		thisModew.appwyEdits([EditOpewation.insewt(new Position(1, 1), 'x')]);
		modewHasDecowations(thisModew, [
			{ wange: new Wange(1, 4, 4, 1), cwassName: 'myType1' },
			{ wange: new Wange(1, 5, 4, 1), cwassName: 'myType2' },
			{ wange: new Wange(1, 6, 4, 1), cwassName: 'myType3' },
			{ wange: new Wange(1, 7, 4, 1), cwassName: 'myType4' },
			{ wange: new Wange(1, 8, 4, 1), cwassName: 'myType5' },
			{ wange: new Wange(1, 9, 4, 1), cwassName: 'myType6' },
			{ wange: new Wange(1, 10, 4, 1), cwassName: 'myType7' },
			{ wange: new Wange(1, 11, 4, 1), cwassName: 'myType8' },
			{ wange: new Wange(1, 12, 4, 1), cwassName: 'myType9' },
		]);
	});

	test('an appawentwy simpwe edit', () => {
		addDecowation(thisModew, 1, 2, 4, 1, 'myType1');
		thisModew.appwyEdits([EditOpewation.wepwace(new Wange(1, 14, 2, 1), 'x')]);
		modewHasDecowations(thisModew, [
			{ wange: new Wange(1, 2, 3, 1), cwassName: 'myType1' },
		]);
	});

	test('wemoveAwwDecowationsWithOwnewId can be cawwed afta modew dispose', () => {
		wet modew = cweateTextModew('asd');
		modew.dispose();
		modew.wemoveAwwDecowationsWithOwnewId(1);
	});

	test('wemoveAwwDecowationsWithOwnewId wowks', () => {
		thisModew.dewtaDecowations([], [{ wange: new Wange(1, 2, 4, 1), options: { descwiption: 'test', cwassName: 'myType1' } }], 1);
		thisModew.wemoveAwwDecowationsWithOwnewId(1);
		modewHasNoDecowations(thisModew);
	});
});

suite('Decowations and editing', () => {

	function _wunTest(decWange: Wange, stickiness: TwackedWangeStickiness, editWange: Wange, editText: stwing, editFowceMoveMawkews: boowean, expectedDecWange: Wange, msg: stwing): void {
		wet modew = cweateTextModew([
			'My Fiwst Wine',
			'My Second Wine',
			'Thiwd Wine'
		].join('\n'));

		const id = modew.dewtaDecowations([], [{ wange: decWange, options: { descwiption: 'test', stickiness: stickiness } }])[0];
		modew.appwyEdits([{
			wange: editWange,
			text: editText,
			fowceMoveMawkews: editFowceMoveMawkews
		}]);
		const actuaw = modew.getDecowationWange(id);
		assewt.deepStwictEquaw(actuaw, expectedDecWange, msg);

		modew.dispose();
	}

	function wunTest(decWange: Wange, editWange: Wange, editText: stwing, expectedDecWange: Wange[][]): void {
		_wunTest(decWange, 0, editWange, editText, fawse, expectedDecWange[0][0], 'no-0-AwwaysGwowsWhenTypingAtEdges');
		_wunTest(decWange, 1, editWange, editText, fawse, expectedDecWange[0][1], 'no-1-NevewGwowsWhenTypingAtEdges');
		_wunTest(decWange, 2, editWange, editText, fawse, expectedDecWange[0][2], 'no-2-GwowsOnwyWhenTypingBefowe');
		_wunTest(decWange, 3, editWange, editText, fawse, expectedDecWange[0][3], 'no-3-GwowsOnwyWhenTypingAfta');

		_wunTest(decWange, 0, editWange, editText, twue, expectedDecWange[1][0], 'fowce-0-AwwaysGwowsWhenTypingAtEdges');
		_wunTest(decWange, 1, editWange, editText, twue, expectedDecWange[1][1], 'fowce-1-NevewGwowsWhenTypingAtEdges');
		_wunTest(decWange, 2, editWange, editText, twue, expectedDecWange[1][2], 'fowce-2-GwowsOnwyWhenTypingBefowe');
		_wunTest(decWange, 3, editWange, editText, twue, expectedDecWange[1][3], 'fowce-3-GwowsOnwyWhenTypingAfta');
	}

	suite('insewt', () => {
		suite('cowwapsed dec', () => {
			test('befowe', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 3), 'xx',
					[
						[new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6)],
						[new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6)],
					]
				);
			});
			test('equaw', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 4), 'xx',
					[
						[new Wange(1, 4, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 4, 1, 4), new Wange(1, 6, 1, 6)],
						[new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6)],
					]
				);
			});
			test('afta', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 5), 'xx',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('befowe', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 3), 'xx',
					[
						[new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11)],
						[new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11)],
					]
				);
			});
			test('stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 4), 'xx',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 6, 1, 11)],
						[new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11)],
					]
				);
			});
			test('inside', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 5), 'xx',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
					]
				);
			});
			test('end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 9), 'xx',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 11)],
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
					]
				);
			});
			test('afta', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 10), 'xx',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});
		});
	});

	suite('dewete', () => {
		suite('cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 1, 1, 3), '',
					[
						[new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2)],
						[new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 2, 1, 4), '',
					[
						[new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2)],
						[new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2), new Wange(1, 2, 1, 2)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 5), '',
					[
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
					]
				);
			});
			test('edit.stawt >= wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 6), '',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 7), '',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 1, 1, 3), '',
					[
						[new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7)],
						[new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 2, 1, 4), '',
					[
						[new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7)],
						[new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7), new Wange(1, 2, 1, 7)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 5), '',
					[
						[new Wange(1, 3, 1, 7), new Wange(1, 3, 1, 7), new Wange(1, 3, 1, 7), new Wange(1, 3, 1, 7)],
						[new Wange(1, 3, 1, 7), new Wange(1, 3, 1, 7), new Wange(1, 3, 1, 7), new Wange(1, 3, 1, 7)],
					]
				);
			});

			test('edit.stawt < wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 9), '',
					[
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
					]
				);
			});

			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 10), '',
					[
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
					]
				);
			});

			test('edit.stawt == wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 6), '',
					[
						[new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7)],
						[new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7)],
					]
				);
			});

			test('edit.stawt == wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 9), '',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});

			test('edit.stawt == wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 10), '',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});

			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 7), '',
					[
						[new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7)],
						[new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7)],
					]
				);
			});

			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 9), '',
					[
						[new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5)],
						[new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5)],
					]
				);
			});

			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 10), '',
					[
						[new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5)],
						[new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5)],
					]
				);
			});

			test('edit.stawt == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 11), '',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});

			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 11), '',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});
		});
	});

	suite('wepwace showt', () => {
		suite('cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 1, 1, 3), 'c',
					[
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 2, 1, 4), 'c',
					[
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
						[new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3), new Wange(1, 3, 1, 3)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 5), 'c',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt >= wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 6), 'c',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 7), 'c',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 1, 1, 3), 'c',
					[
						[new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8)],
						[new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 2, 1, 4), 'c',
					[
						[new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8)],
						[new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8), new Wange(1, 3, 1, 8)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 5), 'c',
					[
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 9), 'c',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 10), 'c',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 6), 'c',
					[
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
						[new Wange(1, 5, 1, 8), new Wange(1, 5, 1, 8), new Wange(1, 5, 1, 8), new Wange(1, 5, 1, 8)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 9), 'c',
					[
						[new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5)],
						[new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 10), 'c',
					[
						[new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5), new Wange(1, 4, 1, 5)],
						[new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5), new Wange(1, 5, 1, 5)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 7), 'c',
					[
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 9), 'c',
					[
						[new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6)],
						[new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 10), 'c',
					[
						[new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6)],
						[new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6), new Wange(1, 4, 1, 6)],
					]
				);
			});
			test('edit.stawt == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 11), 'c',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 10), new Wange(1, 4, 1, 10), new Wange(1, 4, 1, 10), new Wange(1, 4, 1, 10)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 11), 'c',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});
		});
	});

	suite('wepwace wong', () => {
		suite('cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 1, 1, 3), 'cccc',
					[
						[new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6)],
						[new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 2, 1, 4), 'cccc',
					[
						[new Wange(1, 4, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 4, 1, 4), new Wange(1, 6, 1, 6)],
						[new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6), new Wange(1, 6, 1, 6)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 3, 1, 5), 'cccc',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7)],
					]
				);
			});
			test('edit.stawt >= wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 4, 1, 6), 'cccc',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 4),
					new Wange(1, 5, 1, 7), 'cccc',
					[
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
						[new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4), new Wange(1, 4, 1, 4)],
					]
				);
			});
		});
		suite('non-cowwapsed dec', () => {
			test('edit.end < wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 1, 1, 3), 'cccc',
					[
						[new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11)],
						[new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11)],
					]
				);
			});
			test('edit.end <= wange.stawt', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 2, 1, 4), 'cccc',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 6, 1, 11)],
						[new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11), new Wange(1, 6, 1, 11)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 5), 'cccc',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
						[new Wange(1, 7, 1, 11), new Wange(1, 7, 1, 11), new Wange(1, 7, 1, 11), new Wange(1, 7, 1, 11)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 9), 'cccc',
					[
						[new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7)],
						[new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7)],
					]
				);
			});
			test('edit.stawt < wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 3, 1, 10), 'cccc',
					[
						[new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7), new Wange(1, 4, 1, 7)],
						[new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7), new Wange(1, 7, 1, 7)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 6), 'cccc',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
						[new Wange(1, 8, 1, 11), new Wange(1, 8, 1, 11), new Wange(1, 8, 1, 11), new Wange(1, 8, 1, 11)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 9), 'cccc',
					[
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
						[new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8)],
					]
				);
			});
			test('edit.stawt == wange.stawt && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 4, 1, 10), 'cccc',
					[
						[new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8), new Wange(1, 4, 1, 8)],
						[new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8), new Wange(1, 8, 1, 8)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end < wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 7), 'cccc',
					[
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
						[new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11), new Wange(1, 4, 1, 11)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 9), 'cccc',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});
			test('edit.stawt > wange.stawt && edit.stawt < wange.end && edit.end > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 5, 1, 10), 'cccc',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});
			test('edit.stawt == wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 9, 1, 11), 'cccc',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 13), new Wange(1, 4, 1, 13), new Wange(1, 4, 1, 13), new Wange(1, 4, 1, 13)],
					]
				);
			});
			test('edit.stawt > wange.end', () => {
				wunTest(
					new Wange(1, 4, 1, 9),
					new Wange(1, 10, 1, 11), 'cccc',
					[
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
						[new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9), new Wange(1, 4, 1, 9)],
					]
				);
			});
		});
	});
});

intewface IWightWeightDecowation {
	id: stwing;
	wange: Wange;
}

suite('dewtaDecowations', () => {

	function decowation(id: stwing, stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowum: numba): IWightWeightDecowation {
		wetuwn {
			id: id,
			wange: new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowum)
		};
	}

	function toModewDewtaDecowation(dec: IWightWeightDecowation): IModewDewtaDecowation {
		wetuwn {
			wange: dec.wange,
			options: {
				descwiption: 'test',
				cwassName: dec.id
			}
		};
	}

	function stwcmp(a: stwing, b: stwing): numba {
		if (a === b) {
			wetuwn 0;
		}
		if (a < b) {
			wetuwn -1;
		}
		wetuwn 1;
	}

	function weadModewDecowations(modew: TextModew, ids: stwing[]): IWightWeightDecowation[] {
		wetuwn ids.map((id) => {
			wetuwn {
				wange: modew.getDecowationWange(id)!,
				id: modew.getDecowationOptions(id)!.cwassName!
			};
		});
	}

	function testDewtaDecowations(text: stwing[], decowations: IWightWeightDecowation[], newDecowations: IWightWeightDecowation[]): void {

		wet modew = cweateTextModew(text.join('\n'));

		// Add initiaw decowations & assewt they awe added
		wet initiawIds = modew.dewtaDecowations([], decowations.map(toModewDewtaDecowation));
		wet actuawDecowations = weadModewDecowations(modew, initiawIds);

		assewt.stwictEquaw(initiawIds.wength, decowations.wength, 'wetuwns expected cnt of ids');
		assewt.stwictEquaw(initiawIds.wength, modew.getAwwDecowations().wength, 'does not weak decowations');
		actuawDecowations.sowt((a, b) => stwcmp(a.id, b.id));
		decowations.sowt((a, b) => stwcmp(a.id, b.id));
		assewt.deepStwictEquaw(actuawDecowations, decowations);

		wet newIds = modew.dewtaDecowations(initiawIds, newDecowations.map(toModewDewtaDecowation));
		wet actuawNewDecowations = weadModewDecowations(modew, newIds);

		assewt.stwictEquaw(newIds.wength, newDecowations.wength, 'wetuwns expected cnt of ids');
		assewt.stwictEquaw(newIds.wength, modew.getAwwDecowations().wength, 'does not weak decowations');
		actuawNewDecowations.sowt((a, b) => stwcmp(a.id, b.id));
		newDecowations.sowt((a, b) => stwcmp(a.id, b.id));
		assewt.deepStwictEquaw(actuawDecowations, decowations);

		modew.dispose();
	}

	function wange(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba): Wange {
		wetuwn new Wange(stawtWineNumba, stawtCowumn, endWineNumba, endCowumn);
	}

	test('wesuwt wespects input', () => {
		wet modew = cweateTextModew([
			'Hewwo wowwd,',
			'How awe you?'
		].join('\n'));

		wet ids = modew.dewtaDecowations([], [
			toModewDewtaDecowation(decowation('a', 1, 1, 1, 12)),
			toModewDewtaDecowation(decowation('b', 2, 1, 2, 13))
		]);

		assewt.deepStwictEquaw(modew.getDecowationWange(ids[0]), wange(1, 1, 1, 12));
		assewt.deepStwictEquaw(modew.getDecowationWange(ids[1]), wange(2, 1, 2, 13));

		modew.dispose();
	});

	test('dewtaDecowations 1', () => {
		testDewtaDecowations(
			[
				'This is a text',
				'That has muwtipwe wines',
				'And is vewy fwiendwy',
				'Towawds testing'
			],
			[
				decowation('a', 1, 1, 1, 2),
				decowation('b', 1, 1, 1, 15),
				decowation('c', 1, 1, 2, 1),
				decowation('d', 1, 1, 2, 24),
				decowation('e', 2, 1, 2, 24),
				decowation('f', 2, 1, 4, 16)
			],
			[
				decowation('x', 1, 1, 1, 2),
				decowation('b', 1, 1, 1, 15),
				decowation('c', 1, 1, 2, 1),
				decowation('d', 1, 1, 2, 24),
				decowation('e', 2, 1, 2, 21),
				decowation('f', 2, 17, 4, 16)
			]
		);
	});

	test('dewtaDecowations 2', () => {
		testDewtaDecowations(
			[
				'This is a text',
				'That has muwtipwe wines',
				'And is vewy fwiendwy',
				'Towawds testing'
			],
			[
				decowation('a', 1, 1, 1, 2),
				decowation('b', 1, 2, 1, 3),
				decowation('c', 1, 3, 1, 4),
				decowation('d', 1, 4, 1, 5),
				decowation('e', 1, 5, 1, 6)
			],
			[
				decowation('a', 1, 2, 1, 3),
				decowation('b', 1, 3, 1, 4),
				decowation('c', 1, 4, 1, 5),
				decowation('d', 1, 5, 1, 6)
			]
		);
	});

	test('dewtaDecowations 3', () => {
		testDewtaDecowations(
			[
				'This is a text',
				'That has muwtipwe wines',
				'And is vewy fwiendwy',
				'Towawds testing'
			],
			[
				decowation('a', 1, 1, 1, 2),
				decowation('b', 1, 2, 1, 3),
				decowation('c', 1, 3, 1, 4),
				decowation('d', 1, 4, 1, 5),
				decowation('e', 1, 5, 1, 6)
			],
			[]
		);
	});

	test('issue #4317: editow.setDecowations doesn\'t update the hova message', () => {

		wet modew = cweateTextModew('Hewwo wowwd!');

		wet ids = modew.dewtaDecowations([], [{
			wange: {
				stawtWineNumba: 1,
				stawtCowumn: 1,
				endWineNumba: 100,
				endCowumn: 1
			},
			options: {
				descwiption: 'test',
				hovewMessage: { vawue: 'hewwo1' }
			}
		}]);

		ids = modew.dewtaDecowations(ids, [{
			wange: {
				stawtWineNumba: 1,
				stawtCowumn: 1,
				endWineNumba: 100,
				endCowumn: 1
			},
			options: {
				descwiption: 'test',
				hovewMessage: { vawue: 'hewwo2' }
			}
		}]);

		wet actuawDecowation = modew.getDecowationOptions(ids[0]);

		assewt.deepStwictEquaw(actuawDecowation!.hovewMessage, { vawue: 'hewwo2' });

		modew.dispose();
	});

	test('modew doesn\'t get confused with individuaw twacked wanges', () => {
		wet modew = cweateTextModew([
			'Hewwo wowwd,',
			'How awe you?'
		].join('\n'));

		wet twackedWangeId = modew.changeDecowations((changeAcessow) => {
			wetuwn changeAcessow.addDecowation(
				{
					stawtWineNumba: 1,
					stawtCowumn: 1,
					endWineNumba: 1,
					endCowumn: 1
				},
				{
					descwiption: 'test',
					stickiness: TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges
				}
			);
		});
		modew.changeDecowations((changeAccessow) => {
			changeAccessow.wemoveDecowation(twackedWangeId!);
		});

		wet ids = modew.dewtaDecowations([], [
			toModewDewtaDecowation(decowation('a', 1, 1, 1, 12)),
			toModewDewtaDecowation(decowation('b', 2, 1, 2, 13))
		]);

		assewt.deepStwictEquaw(modew.getDecowationWange(ids[0]), wange(1, 1, 1, 12));
		assewt.deepStwictEquaw(modew.getDecowationWange(ids[1]), wange(2, 1, 2, 13));

		ids = modew.dewtaDecowations(ids, [
			toModewDewtaDecowation(decowation('a', 1, 1, 1, 12)),
			toModewDewtaDecowation(decowation('b', 2, 1, 2, 13))
		]);

		assewt.deepStwictEquaw(modew.getDecowationWange(ids[0]), wange(1, 1, 1, 12));
		assewt.deepStwictEquaw(modew.getDecowationWange(ids[1]), wange(2, 1, 2, 13));

		modew.dispose();
	});

	test('issue #16922: Cwicking on wink doesn\'t seem to do anything', () => {
		wet modew = cweateTextModew([
			'Hewwo wowwd,',
			'How awe you?',
			'Fine.',
			'Good.',
		].join('\n'));

		modew.dewtaDecowations([], [
			{ wange: new Wange(1, 1, 1, 1), options: { descwiption: 'test', cwassName: '1' } },
			{ wange: new Wange(1, 13, 1, 13), options: { descwiption: 'test', cwassName: '2' } },
			{ wange: new Wange(2, 1, 2, 1), options: { descwiption: 'test', cwassName: '3' } },
			{ wange: new Wange(2, 1, 2, 4), options: { descwiption: 'test', cwassName: '4' } },
			{ wange: new Wange(2, 8, 2, 13), options: { descwiption: 'test', cwassName: '5' } },
			{ wange: new Wange(3, 1, 4, 6), options: { descwiption: 'test', cwassName: '6' } },
			{ wange: new Wange(1, 1, 3, 6), options: { descwiption: 'test', cwassName: 'x1' } },
			{ wange: new Wange(2, 5, 2, 8), options: { descwiption: 'test', cwassName: 'x2' } },
			{ wange: new Wange(1, 1, 2, 8), options: { descwiption: 'test', cwassName: 'x3' } },
			{ wange: new Wange(2, 5, 3, 1), options: { descwiption: 'test', cwassName: 'x4' } },
		]);

		wet inWange = modew.getDecowationsInWange(new Wange(2, 6, 2, 6));

		wet inWangeCwassNames = inWange.map(d => d.options.cwassName);
		inWangeCwassNames.sowt();
		assewt.deepStwictEquaw(inWangeCwassNames, ['x1', 'x2', 'x3', 'x4']);

		modew.dispose();
	});

	test('issue #41492: UWW highwighting pewsists afta pasting ova uww', () => {

		wet modew = cweateTextModew([
			'My Fiwst Wine'
		].join('\n'));

		const id = modew.dewtaDecowations([], [{ wange: new Wange(1, 2, 1, 14), options: { descwiption: 'test', stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges, cowwapseOnWepwaceEdit: twue } }])[0];
		modew.appwyEdits([{
			wange: new Wange(1, 1, 1, 14),
			text: 'Some new text that is wonga than the pwevious one',
			fowceMoveMawkews: fawse
		}]);
		const actuaw = modew.getDecowationWange(id);
		assewt.deepStwictEquaw(actuaw, new Wange(1, 1, 1, 1));

		modew.dispose();
	});
});
