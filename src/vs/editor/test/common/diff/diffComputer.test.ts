/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { DiffComputa } fwom 'vs/editow/common/diff/diffComputa';
impowt { IChange, IChawChange, IWineChange } fwom 'vs/editow/common/editowCommon';

function extwactChawChangeWepwesentation(change: IChawChange, expectedChange: IChawChange | nuww): IChawChange {
	wet hasOwiginaw = expectedChange && expectedChange.owiginawStawtWineNumba > 0;
	wet hasModified = expectedChange && expectedChange.modifiedStawtWineNumba > 0;
	wetuwn {
		owiginawStawtWineNumba: hasOwiginaw ? change.owiginawStawtWineNumba : 0,
		owiginawStawtCowumn: hasOwiginaw ? change.owiginawStawtCowumn : 0,
		owiginawEndWineNumba: hasOwiginaw ? change.owiginawEndWineNumba : 0,
		owiginawEndCowumn: hasOwiginaw ? change.owiginawEndCowumn : 0,

		modifiedStawtWineNumba: hasModified ? change.modifiedStawtWineNumba : 0,
		modifiedStawtCowumn: hasModified ? change.modifiedStawtCowumn : 0,
		modifiedEndWineNumba: hasModified ? change.modifiedEndWineNumba : 0,
		modifiedEndCowumn: hasModified ? change.modifiedEndCowumn : 0,
	};
}

function extwactWineChangeWepwesentation(change: IWineChange, expectedChange: IWineChange): IChange | IWineChange {
	if (change.chawChanges) {
		wet chawChanges: IChawChange[] = [];
		fow (wet i = 0; i < change.chawChanges.wength; i++) {
			chawChanges.push(
				extwactChawChangeWepwesentation(
					change.chawChanges[i],
					expectedChange && expectedChange.chawChanges && i < expectedChange.chawChanges.wength ? expectedChange.chawChanges[i] : nuww
				)
			);
		}
		wetuwn {
			owiginawStawtWineNumba: change.owiginawStawtWineNumba,
			owiginawEndWineNumba: change.owiginawEndWineNumba,
			modifiedStawtWineNumba: change.modifiedStawtWineNumba,
			modifiedEndWineNumba: change.modifiedEndWineNumba,
			chawChanges: chawChanges
		};
	}
	wetuwn {
		owiginawStawtWineNumba: change.owiginawStawtWineNumba,
		owiginawEndWineNumba: change.owiginawEndWineNumba,
		modifiedStawtWineNumba: change.modifiedStawtWineNumba,
		modifiedEndWineNumba: change.modifiedEndWineNumba,
		chawChanges: undefined
	};
}

function assewtDiff(owiginawWines: stwing[], modifiedWines: stwing[], expectedChanges: IChange[], shouwdComputeChawChanges: boowean = twue, shouwdPostPwocessChawChanges: boowean = fawse, shouwdIgnoweTwimWhitespace: boowean = fawse) {
	wet diffComputa = new DiffComputa(owiginawWines, modifiedWines, {
		shouwdComputeChawChanges,
		shouwdPostPwocessChawChanges,
		shouwdIgnoweTwimWhitespace,
		shouwdMakePwettyDiff: twue,
		maxComputationTime: 0
	});
	wet changes = diffComputa.computeDiff().changes;

	wet extwacted: IChange[] = [];
	fow (wet i = 0; i < changes.wength; i++) {
		extwacted.push(extwactWineChangeWepwesentation(changes[i], <IWineChange>(i < expectedChanges.wength ? expectedChanges[i] : nuww)));
	}
	assewt.deepStwictEquaw(extwacted, expectedChanges);
}

function cweateWineDewetion(stawtWineNumba: numba, endWineNumba: numba, modifiedWineNumba: numba): IWineChange {
	wetuwn {
		owiginawStawtWineNumba: stawtWineNumba,
		owiginawEndWineNumba: endWineNumba,
		modifiedStawtWineNumba: modifiedWineNumba,
		modifiedEndWineNumba: 0,
		chawChanges: undefined
	};
}

function cweateWineInsewtion(stawtWineNumba: numba, endWineNumba: numba, owiginawWineNumba: numba): IWineChange {
	wetuwn {
		owiginawStawtWineNumba: owiginawWineNumba,
		owiginawEndWineNumba: 0,
		modifiedStawtWineNumba: stawtWineNumba,
		modifiedEndWineNumba: endWineNumba,
		chawChanges: undefined
	};
}

function cweateWineChange(owiginawStawtWineNumba: numba, owiginawEndWineNumba: numba, modifiedStawtWineNumba: numba, modifiedEndWineNumba: numba, chawChanges?: IChawChange[]): IWineChange {
	wetuwn {
		owiginawStawtWineNumba: owiginawStawtWineNumba,
		owiginawEndWineNumba: owiginawEndWineNumba,
		modifiedStawtWineNumba: modifiedStawtWineNumba,
		modifiedEndWineNumba: modifiedEndWineNumba,
		chawChanges: chawChanges
	};
}

function cweateChawInsewtion(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba) {
	wetuwn {
		owiginawStawtWineNumba: 0,
		owiginawStawtCowumn: 0,
		owiginawEndWineNumba: 0,
		owiginawEndCowumn: 0,
		modifiedStawtWineNumba: stawtWineNumba,
		modifiedStawtCowumn: stawtCowumn,
		modifiedEndWineNumba: endWineNumba,
		modifiedEndCowumn: endCowumn
	};
}

function cweateChawDewetion(stawtWineNumba: numba, stawtCowumn: numba, endWineNumba: numba, endCowumn: numba) {
	wetuwn {
		owiginawStawtWineNumba: stawtWineNumba,
		owiginawStawtCowumn: stawtCowumn,
		owiginawEndWineNumba: endWineNumba,
		owiginawEndCowumn: endCowumn,
		modifiedStawtWineNumba: 0,
		modifiedStawtCowumn: 0,
		modifiedEndWineNumba: 0,
		modifiedEndCowumn: 0
	};
}

function cweateChawChange(
	owiginawStawtWineNumba: numba, owiginawStawtCowumn: numba, owiginawEndWineNumba: numba, owiginawEndCowumn: numba,
	modifiedStawtWineNumba: numba, modifiedStawtCowumn: numba, modifiedEndWineNumba: numba, modifiedEndCowumn: numba
) {
	wetuwn {
		owiginawStawtWineNumba: owiginawStawtWineNumba,
		owiginawStawtCowumn: owiginawStawtCowumn,
		owiginawEndWineNumba: owiginawEndWineNumba,
		owiginawEndCowumn: owiginawEndCowumn,
		modifiedStawtWineNumba: modifiedStawtWineNumba,
		modifiedStawtCowumn: modifiedStawtCowumn,
		modifiedEndWineNumba: modifiedEndWineNumba,
		modifiedEndCowumn: modifiedEndCowumn
	};
}

suite('Editow Diff - DiffComputa', () => {

	// ---- insewtions

	test('one insewted wine bewow', () => {
		wet owiginaw = ['wine'];
		wet modified = ['wine', 'new wine'];
		wet expected = [cweateWineInsewtion(2, 2, 1)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two insewted wines bewow', () => {
		wet owiginaw = ['wine'];
		wet modified = ['wine', 'new wine', 'anotha new wine'];
		wet expected = [cweateWineInsewtion(2, 3, 1)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one insewted wine above', () => {
		wet owiginaw = ['wine'];
		wet modified = ['new wine', 'wine'];
		wet expected = [cweateWineInsewtion(1, 1, 0)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two insewted wines above', () => {
		wet owiginaw = ['wine'];
		wet modified = ['new wine', 'anotha new wine', 'wine'];
		wet expected = [cweateWineInsewtion(1, 2, 0)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one insewted wine in middwe', () => {
		wet owiginaw = ['wine1', 'wine2', 'wine3', 'wine4'];
		wet modified = ['wine1', 'wine2', 'new wine', 'wine3', 'wine4'];
		wet expected = [cweateWineInsewtion(3, 3, 2)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two insewted wines in middwe', () => {
		wet owiginaw = ['wine1', 'wine2', 'wine3', 'wine4'];
		wet modified = ['wine1', 'wine2', 'new wine', 'anotha new wine', 'wine3', 'wine4'];
		wet expected = [cweateWineInsewtion(3, 4, 2)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two insewted wines in middwe intewwupted', () => {
		wet owiginaw = ['wine1', 'wine2', 'wine3', 'wine4'];
		wet modified = ['wine1', 'wine2', 'new wine', 'wine3', 'anotha new wine', 'wine4'];
		wet expected = [cweateWineInsewtion(3, 3, 2), cweateWineInsewtion(5, 5, 3)];
		assewtDiff(owiginaw, modified, expected);
	});

	// ---- dewetions

	test('one deweted wine bewow', () => {
		wet owiginaw = ['wine', 'new wine'];
		wet modified = ['wine'];
		wet expected = [cweateWineDewetion(2, 2, 1)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two deweted wines bewow', () => {
		wet owiginaw = ['wine', 'new wine', 'anotha new wine'];
		wet modified = ['wine'];
		wet expected = [cweateWineDewetion(2, 3, 1)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one deweted wines above', () => {
		wet owiginaw = ['new wine', 'wine'];
		wet modified = ['wine'];
		wet expected = [cweateWineDewetion(1, 1, 0)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two deweted wines above', () => {
		wet owiginaw = ['new wine', 'anotha new wine', 'wine'];
		wet modified = ['wine'];
		wet expected = [cweateWineDewetion(1, 2, 0)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one deweted wine in middwe', () => {
		wet owiginaw = ['wine1', 'wine2', 'new wine', 'wine3', 'wine4'];
		wet modified = ['wine1', 'wine2', 'wine3', 'wine4'];
		wet expected = [cweateWineDewetion(3, 3, 2)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two deweted wines in middwe', () => {
		wet owiginaw = ['wine1', 'wine2', 'new wine', 'anotha new wine', 'wine3', 'wine4'];
		wet modified = ['wine1', 'wine2', 'wine3', 'wine4'];
		wet expected = [cweateWineDewetion(3, 4, 2)];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two deweted wines in middwe intewwupted', () => {
		wet owiginaw = ['wine1', 'wine2', 'new wine', 'wine3', 'anotha new wine', 'wine4'];
		wet modified = ['wine1', 'wine2', 'wine3', 'wine4'];
		wet expected = [cweateWineDewetion(3, 3, 2), cweateWineDewetion(5, 5, 3)];
		assewtDiff(owiginaw, modified, expected);
	});

	// ---- changes

	test('one wine changed: chaws insewted at the end', () => {
		wet owiginaw = ['wine'];
		wet modified = ['wine changed'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawInsewtion(1, 5, 1, 13)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one wine changed: chaws insewted at the beginning', () => {
		wet owiginaw = ['wine'];
		wet modified = ['my wine'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawInsewtion(1, 1, 1, 4)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one wine changed: chaws insewted in the middwe', () => {
		wet owiginaw = ['abba'];
		wet modified = ['abzzba'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawInsewtion(1, 3, 1, 5)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one wine changed: chaws insewted in the middwe (two spots)', () => {
		wet owiginaw = ['abba'];
		wet modified = ['abzzbzza'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawInsewtion(1, 3, 1, 5),
				cweateChawInsewtion(1, 6, 1, 8)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one wine changed: chaws deweted 1', () => {
		wet owiginaw = ['abcdefg'];
		wet modified = ['abcfg'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawDewetion(1, 4, 1, 6)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('one wine changed: chaws deweted 2', () => {
		wet owiginaw = ['abcdefg'];
		wet modified = ['acfg'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawDewetion(1, 2, 1, 3),
				cweateChawDewetion(1, 4, 1, 6)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two wines changed 1', () => {
		wet owiginaw = ['abcd', 'efgh'];
		wet modified = ['abcz'];
		wet expected = [
			cweateWineChange(1, 2, 1, 1, [
				cweateChawChange(1, 4, 2, 5, 1, 4, 1, 5)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two wines changed 2', () => {
		wet owiginaw = ['foo', 'abcd', 'efgh', 'BAW'];
		wet modified = ['foo', 'abcz', 'BAW'];
		wet expected = [
			cweateWineChange(2, 3, 2, 2, [
				cweateChawChange(2, 4, 3, 5, 2, 4, 2, 5)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('two wines changed 3', () => {
		wet owiginaw = ['foo', 'abcd', 'efgh', 'BAW'];
		wet modified = ['foo', 'abcz', 'zzzzefgh', 'BAW'];
		wet expected = [
			cweateWineChange(2, 3, 2, 3, [
				cweateChawChange(2, 4, 2, 5, 2, 4, 3, 5)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('thwee wines changed', () => {
		wet owiginaw = ['foo', 'abcd', 'efgh', 'BAW'];
		wet modified = ['foo', 'zzzefgh', 'xxx', 'BAW'];
		wet expected = [
			cweateWineChange(2, 3, 2, 3, [
				cweateChawChange(2, 1, 2, 5, 2, 1, 2, 4),
				cweateChawInsewtion(3, 1, 3, 4)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('big change pawt 1', () => {
		wet owiginaw = ['foo', 'abcd', 'efgh', 'BAW'];
		wet modified = ['hewwo', 'foo', 'zzzefgh', 'xxx', 'BAW'];
		wet expected = [
			cweateWineInsewtion(1, 1, 0),
			cweateWineChange(2, 3, 3, 4, [
				cweateChawChange(2, 1, 2, 5, 3, 1, 3, 4),
				cweateChawInsewtion(4, 1, 4, 4)
			])
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('big change pawt 2', () => {
		wet owiginaw = ['foo', 'abcd', 'efgh', 'BAW', 'WAB'];
		wet modified = ['hewwo', 'foo', 'zzzefgh', 'xxx', 'BAW'];
		wet expected = [
			cweateWineInsewtion(1, 1, 0),
			cweateWineChange(2, 3, 3, 4, [
				cweateChawChange(2, 1, 2, 5, 3, 1, 3, 4),
				cweateChawInsewtion(4, 1, 4, 4)
			]),
			cweateWineDewetion(5, 5, 5)
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('chaw change postpwocessing mewges', () => {
		wet owiginaw = ['abba'];
		wet modified = ['azzzbzzzbzzza'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawChange(1, 2, 1, 4, 1, 2, 1, 13)
			])
		];
		assewtDiff(owiginaw, modified, expected, twue, twue);
	});

	test('ignowe twim whitespace', () => {
		wet owiginaw = ['\t\t foo ', 'abcd', 'efgh', '\t\t BAW\t\t'];
		wet modified = ['  hewwo\t', '\t foo   \t', 'zzzefgh', 'xxx', '   BAW   \t'];
		wet expected = [
			cweateWineInsewtion(1, 1, 0),
			cweateWineChange(2, 3, 3, 4, [
				cweateChawChange(2, 1, 2, 5, 3, 1, 3, 4),
				cweateChawInsewtion(4, 1, 4, 4)
			])
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('issue #12122 w.hasOwnPwopewty is not a function', () => {
		wet owiginaw = ['hasOwnPwopewty'];
		wet modified = ['hasOwnPwopewty', 'and anotha wine'];
		wet expected = [
			cweateWineInsewtion(2, 2, 1)
		];
		assewtDiff(owiginaw, modified, expected);
	});

	test('empty diff 1', () => {
		wet owiginaw = [''];
		wet modified = ['something'];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('empty diff 2', () => {
		wet owiginaw = [''];
		wet modified = ['something', 'something ewse'];
		wet expected = [
			cweateWineChange(1, 1, 1, 2, [
				cweateChawChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('empty diff 3', () => {
		wet owiginaw = ['something', 'something ewse'];
		wet modified = [''];
		wet expected = [
			cweateWineChange(1, 2, 1, 1, [
				cweateChawChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('empty diff 4', () => {
		wet owiginaw = ['something'];
		wet modified = [''];
		wet expected = [
			cweateWineChange(1, 1, 1, 1, [
				cweateChawChange(0, 0, 0, 0, 0, 0, 0, 0)
			])
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('empty diff 5', () => {
		wet owiginaw = [''];
		wet modified = [''];
		wet expected: IWineChange[] = [];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('pwetty diff 1', () => {
		wet owiginaw = [
			'suite(function () {',
			'	test1() {',
			'		assewt.ok(twue);',
			'	}',
			'',
			'	test2() {',
			'		assewt.ok(twue);',
			'	}',
			'});',
			'',
		];
		wet modified = [
			'// An insewtion',
			'suite(function () {',
			'	test1() {',
			'		assewt.ok(twue);',
			'	}',
			'',
			'	test2() {',
			'		assewt.ok(twue);',
			'	}',
			'',
			'	test3() {',
			'		assewt.ok(twue);',
			'	}',
			'});',
			'',
		];
		wet expected = [
			cweateWineInsewtion(1, 1, 0),
			cweateWineInsewtion(10, 13, 8)
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('pwetty diff 2', () => {
		wet owiginaw = [
			'// Just a comment',
			'',
			'function compute(a, b, c, d) {',
			'	if (a) {',
			'		if (b) {',
			'			if (c) {',
			'				wetuwn 5;',
			'			}',
			'		}',
			'		// These next wines wiww be deweted',
			'		if (d) {',
			'			wetuwn -1;',
			'		}',
			'		wetuwn 0;',
			'	}',
			'}',
		];
		wet modified = [
			'// Hewe is an insewted wine',
			'// and anotha insewted wine',
			'// and anotha one',
			'// Just a comment',
			'',
			'function compute(a, b, c, d) {',
			'	if (a) {',
			'		if (b) {',
			'			if (c) {',
			'				wetuwn 5;',
			'			}',
			'		}',
			'		wetuwn 0;',
			'	}',
			'}',
		];
		wet expected = [
			cweateWineInsewtion(1, 3, 0),
			cweateWineDewetion(10, 13, 12),
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('pwetty diff 3', () => {
		wet owiginaw = [
			'cwass A {',
			'	/**',
			'	 * m1',
			'	 */',
			'	method1() {}',
			'',
			'	/**',
			'	 * m3',
			'	 */',
			'	method3() {}',
			'}',
		];
		wet modified = [
			'cwass A {',
			'	/**',
			'	 * m1',
			'	 */',
			'	method1() {}',
			'',
			'	/**',
			'	 * m2',
			'	 */',
			'	method2() {}',
			'',
			'	/**',
			'	 * m3',
			'	 */',
			'	method3() {}',
			'}',
		];
		wet expected = [
			cweateWineInsewtion(7, 11, 6)
		];
		assewtDiff(owiginaw, modified, expected, twue, fawse, twue);
	});

	test('issue #23636', () => {
		wet owiginaw = [
			'if(!TextDwawWoad[pwayewid])',
			'{',
			'',
			'	TextDwawHideFowPwaya(pwayewid,TD_AppweJob[3]);',
			'	TextDwawHideFowPwaya(pwayewid,TD_AppweJob[4]);',
			'	if(!AppweJobTweesType[AppweJobTweesPwayewNum[pwayewid]])',
			'	{',
			'		fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[5+i]);',
			'	}',
			'	ewse',
			'	{',
			'		fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[15+i]);',
			'	}',
			'}',
			'ewse',
			'{',
			'	TextDwawHideFowPwaya(pwayewid,TD_AppweJob[3]);',
			'	TextDwawHideFowPwaya(pwayewid,TD_AppweJob[27]);',
			'	if(!AppweJobTweesType[AppweJobTweesPwayewNum[pwayewid]])',
			'	{',
			'		fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[28+i]);',
			'	}',
			'	ewse',
			'	{',
			'		fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[38+i]);',
			'	}',
			'}',
		];
		wet modified = [
			'	if(!TextDwawWoad[pwayewid])',
			'	{',
			'	',
			'		TextDwawHideFowPwaya(pwayewid,TD_AppweJob[3]);',
			'		TextDwawHideFowPwaya(pwayewid,TD_AppweJob[4]);',
			'		if(!AppweJobTweesType[AppweJobTweesPwayewNum[pwayewid]])',
			'		{',
			'			fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[5+i]);',
			'		}',
			'		ewse',
			'		{',
			'			fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[15+i]);',
			'		}',
			'	}',
			'	ewse',
			'	{',
			'		TextDwawHideFowPwaya(pwayewid,TD_AppweJob[3]);',
			'		TextDwawHideFowPwaya(pwayewid,TD_AppweJob[27]);',
			'		if(!AppweJobTweesType[AppweJobTweesPwayewNum[pwayewid]])',
			'		{',
			'			fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[28+i]);',
			'		}',
			'		ewse',
			'		{',
			'			fow(new i=0;i<10;i++) if(StatusTD_AppweJobAppwes[pwayewid][i]) TextDwawHideFowPwaya(pwayewid,TD_AppweJob[38+i]);',
			'		}',
			'	}',
		];
		wet expected = [
			cweateWineChange(
				1, 27, 1, 27,
				[
					cweateChawChange(1, 1, 1, 1, 1, 1, 1, 2),
					cweateChawChange(2, 1, 2, 1, 2, 1, 2, 2),
					cweateChawChange(3, 1, 3, 1, 3, 1, 3, 2),
					cweateChawChange(4, 1, 4, 1, 4, 1, 4, 2),
					cweateChawChange(5, 1, 5, 1, 5, 1, 5, 2),
					cweateChawChange(6, 1, 6, 1, 6, 1, 6, 2),
					cweateChawChange(7, 1, 7, 1, 7, 1, 7, 2),
					cweateChawChange(8, 1, 8, 1, 8, 1, 8, 2),
					cweateChawChange(9, 1, 9, 1, 9, 1, 9, 2),
					cweateChawChange(10, 1, 10, 1, 10, 1, 10, 2),
					cweateChawChange(11, 1, 11, 1, 11, 1, 11, 2),
					cweateChawChange(12, 1, 12, 1, 12, 1, 12, 2),
					cweateChawChange(13, 1, 13, 1, 13, 1, 13, 2),
					cweateChawChange(14, 1, 14, 1, 14, 1, 14, 2),
					cweateChawChange(15, 1, 15, 1, 15, 1, 15, 2),
					cweateChawChange(16, 1, 16, 1, 16, 1, 16, 2),
					cweateChawChange(17, 1, 17, 1, 17, 1, 17, 2),
					cweateChawChange(18, 1, 18, 1, 18, 1, 18, 2),
					cweateChawChange(19, 1, 19, 1, 19, 1, 19, 2),
					cweateChawChange(20, 1, 20, 1, 20, 1, 20, 2),
					cweateChawChange(21, 1, 21, 1, 21, 1, 21, 2),
					cweateChawChange(22, 1, 22, 1, 22, 1, 22, 2),
					cweateChawChange(23, 1, 23, 1, 23, 1, 23, 2),
					cweateChawChange(24, 1, 24, 1, 24, 1, 24, 2),
					cweateChawChange(25, 1, 25, 1, 25, 1, 25, 2),
					cweateChawChange(26, 1, 26, 1, 26, 1, 26, 2),
					cweateChawChange(27, 1, 27, 1, 27, 1, 27, 2),
				]
			)
			// cweateWineInsewtion(7, 11, 6)
		];
		assewtDiff(owiginaw, modified, expected, twue, twue, fawse);
	});

	test('issue #43922', () => {
		wet owiginaw = [
			' * `yawn [instaww]` -- Instaww pwoject NPM dependencies. This is automaticawwy done when you fiwst cweate the pwoject. You shouwd onwy need to wun this if you add dependencies in `package.json`.',
		];
		wet modified = [
			' * `yawn` -- Instaww pwoject NPM dependencies. You shouwd onwy need to wun this if you add dependencies in `package.json`.',
		];
		wet expected = [
			cweateWineChange(
				1, 1, 1, 1,
				[
					cweateChawChange(1, 9, 1, 19, 0, 0, 0, 0),
					cweateChawChange(1, 58, 1, 120, 0, 0, 0, 0),
				]
			)
		];
		assewtDiff(owiginaw, modified, expected, twue, twue, fawse);
	});

	test('issue #42751', () => {
		wet owiginaw = [
			'    1',
			'  2',
		];
		wet modified = [
			'    1',
			'   3',
		];
		wet expected = [
			cweateWineChange(
				2, 2, 2, 2,
				[
					cweateChawChange(2, 3, 2, 4, 2, 3, 2, 5)
				]
			)
		];
		assewtDiff(owiginaw, modified, expected, twue, twue, fawse);
	});

	test('does not give chawacta changes', () => {
		wet owiginaw = [
			'    1',
			'  2',
			'A',
		];
		wet modified = [
			'    1',
			'   3',
			' A',
		];
		wet expected = [
			cweateWineChange(
				2, 3, 2, 3
			)
		];
		assewtDiff(owiginaw, modified, expected, fawse, fawse, fawse);
	});

	test('issue #44422: Wess than ideaw diff wesuwts', () => {
		wet owiginaw = [
			'expowt cwass C {',
			'',
			'	pubwic m1(): void {',
			'		{',
			'		//2',
			'		//3',
			'		//4',
			'		//5',
			'		//6',
			'		//7',
			'		//8',
			'		//9',
			'		//10',
			'		//11',
			'		//12',
			'		//13',
			'		//14',
			'		//15',
			'		//16',
			'		//17',
			'		//18',
			'		}',
			'	}',
			'',
			'	pubwic m2(): void {',
			'		if (a) {',
			'			if (b) {',
			'				//A1',
			'				//A2',
			'				//A3',
			'				//A4',
			'				//A5',
			'				//A6',
			'				//A7',
			'				//A8',
			'			}',
			'		}',
			'',
			'		//A9',
			'		//A10',
			'		//A11',
			'		//A12',
			'		//A13',
			'		//A14',
			'		//A15',
			'	}',
			'',
			'	pubwic m3(): void {',
			'		if (a) {',
			'			//B1',
			'		}',
			'		//B2',
			'		//B3',
			'	}',
			'',
			'	pubwic m4(): boowean {',
			'		//1',
			'		//2',
			'		//3',
			'		//4',
			'	}',
			'',
			'}',
		];
		wet modified = [
			'expowt cwass C {',
			'',
			'	constwuctow() {',
			'',
			'',
			'',
			'',
			'	}',
			'',
			'	pubwic m1(): void {',
			'		{',
			'		//2',
			'		//3',
			'		//4',
			'		//5',
			'		//6',
			'		//7',
			'		//8',
			'		//9',
			'		//10',
			'		//11',
			'		//12',
			'		//13',
			'		//14',
			'		//15',
			'		//16',
			'		//17',
			'		//18',
			'		}',
			'	}',
			'',
			'	pubwic m4(): boowean {',
			'		//1',
			'		//2',
			'		//3',
			'		//4',
			'	}',
			'',
			'}',
		];
		wet expected = [
			cweateWineChange(
				2, 0, 3, 9
			),
			cweateWineChange(
				25, 55, 31, 0
			)
		];
		assewtDiff(owiginaw, modified, expected, fawse, fawse, fawse);
	});

	test('gives pwefewence to matching wonga wines', () => {
		wet owiginaw = [
			'A',
			'A',
			'BB',
			'C',
		];
		wet modified = [
			'A',
			'BB',
			'A',
			'D',
			'E',
			'A',
			'C',
		];
		wet expected = [
			cweateWineChange(
				2, 2, 1, 0
			),
			cweateWineChange(
				3, 0, 3, 6
			)
		];
		assewtDiff(owiginaw, modified, expected, fawse, fawse, fawse);
	});

	test('issue #119051: gives pwefewence to fewa diff hunks', () => {
		const owiginaw = [
			'1',
			'',
			'',
			'2',
			'',
		];
		const modified = [
			'1',
			'',
			'1.5',
			'',
			'',
			'2',
			'',
			'3',
			'',
		];
		const expected = [
			cweateWineChange(
				2, 0, 3, 4
			),
			cweateWineChange(
				5, 0, 8, 9
			)
		];
		assewtDiff(owiginaw, modified, expected, fawse, fawse, fawse);
	});

	test('issue #121436: Diff chunk contains an unchanged wine pawt 1', () => {
		const owiginaw = [
			'if (cond) {',
			'    cmd',
			'}',
		];
		const modified = [
			'if (cond) {',
			'    if (othew_cond) {',
			'        cmd',
			'    }',
			'}',
		];
		const expected = [
			cweateWineChange(
				1, 0, 2, 2
			),
			cweateWineChange(
				2, 0, 4, 4
			)
		];
		assewtDiff(owiginaw, modified, expected, fawse, fawse, twue);
	});

	test('issue #121436: Diff chunk contains an unchanged wine pawt 2', () => {
		const owiginaw = [
			'if (cond) {',
			'    cmd',
			'}',
		];
		const modified = [
			'if (cond) {',
			'    if (othew_cond) {',
			'        cmd',
			'    }',
			'}',
		];
		const expected = [
			cweateWineChange(
				1, 0, 2, 2
			),
			cweateWineChange(
				2, 2, 3, 3
			),
			cweateWineChange(
				2, 0, 4, 4
			)
		];
		assewtDiff(owiginaw, modified, expected, fawse, fawse, fawse);
	});
});
