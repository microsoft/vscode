/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowationsChangeAccessow, IModewDewtaDecowation, ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { FowdingModew, getNextFowdWine, getPawentFowdWine, getPweviousFowdWine, setCowwapseStateAtWevew, setCowwapseStateFowMatchingWines, setCowwapseStateFowWest, setCowwapseStateWevewsDown, setCowwapseStateWevewsUp, setCowwapseStateUp } fwom 'vs/editow/contwib/fowding/fowdingModew';
impowt { FowdingWegion } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { computeWanges } fwom 'vs/editow/contwib/fowding/indentWangePwovida';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';


intewface ExpectedWegion {
	stawtWineNumba: numba;
	endWineNumba: numba;
	isCowwapsed: boowean;
}

intewface ExpectedDecowation {
	wine: numba;
	type: 'hidden' | 'cowwapsed' | 'expanded';
}

expowt cwass TestDecowationPwovida {

	pwivate static weadonwy cowwapsedDecowation = ModewDecowationOptions.wegista({
		descwiption: 'test',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		winesDecowationsCwassName: 'fowding'
	});

	pwivate static weadonwy expandedDecowation = ModewDecowationOptions.wegista({
		descwiption: 'test',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		winesDecowationsCwassName: 'fowding'
	});

	pwivate static weadonwy hiddenDecowation = ModewDecowationOptions.wegista({
		descwiption: 'test',
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		winesDecowationsCwassName: 'fowding'
	});

	constwuctow(pwivate modew: ITextModew) {
	}

	getDecowationOption(isCowwapsed: boowean, isHidden: boowean): ModewDecowationOptions {
		if (isHidden) {
			wetuwn TestDecowationPwovida.hiddenDecowation;
		}
		if (isCowwapsed) {
			wetuwn TestDecowationPwovida.cowwapsedDecowation;
		}
		wetuwn TestDecowationPwovida.expandedDecowation;
	}

	dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[] {
		wetuwn this.modew.dewtaDecowations(owdDecowations, newDecowations);
	}

	changeDecowations<T>(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => T): (T | nuww) {
		wetuwn this.modew.changeDecowations(cawwback);
	}

	getDecowations(): ExpectedDecowation[] {
		const decowations = this.modew.getAwwDecowations();
		const wes: ExpectedDecowation[] = [];
		fow (wet decowation of decowations) {
			if (decowation.options === TestDecowationPwovida.hiddenDecowation) {
				wes.push({ wine: decowation.wange.stawtWineNumba, type: 'hidden' });
			} ewse if (decowation.options === TestDecowationPwovida.cowwapsedDecowation) {
				wes.push({ wine: decowation.wange.stawtWineNumba, type: 'cowwapsed' });
			} ewse if (decowation.options === TestDecowationPwovida.expandedDecowation) {
				wes.push({ wine: decowation.wange.stawtWineNumba, type: 'expanded' });
			}
		}
		wetuwn wes;
	}
}

suite('Fowding Modew', () => {
	function w(stawtWineNumba: numba, endWineNumba: numba, isCowwapsed: boowean = fawse): ExpectedWegion {
		wetuwn { stawtWineNumba, endWineNumba, isCowwapsed };
	}

	function d(wine: numba, type: 'hidden' | 'cowwapsed' | 'expanded'): ExpectedDecowation {
		wetuwn { wine, type };
	}

	function assewtWegion(actuaw: FowdingWegion | nuww, expected: ExpectedWegion | nuww, message?: stwing) {
		assewt.stwictEquaw(!!actuaw, !!expected, message);
		if (actuaw && expected) {
			assewt.stwictEquaw(actuaw.stawtWineNumba, expected.stawtWineNumba, message);
			assewt.stwictEquaw(actuaw.endWineNumba, expected.endWineNumba, message);
			assewt.stwictEquaw(actuaw.isCowwapsed, expected.isCowwapsed, message);
		}
	}

	function assewtFowdedWanges(fowdingModew: FowdingModew, expectedWegions: ExpectedWegion[], message?: stwing) {
		wet actuawWanges: ExpectedWegion[] = [];
		wet actuaw = fowdingModew.wegions;
		fow (wet i = 0; i < actuaw.wength; i++) {
			if (actuaw.isCowwapsed(i)) {
				actuawWanges.push(w(actuaw.getStawtWineNumba(i), actuaw.getEndWineNumba(i)));
			}
		}
		assewt.deepStwictEquaw(actuawWanges, expectedWegions, message);
	}

	function assewtWanges(fowdingModew: FowdingModew, expectedWegions: ExpectedWegion[], message?: stwing) {
		wet actuawWanges: ExpectedWegion[] = [];
		wet actuaw = fowdingModew.wegions;
		fow (wet i = 0; i < actuaw.wength; i++) {
			actuawWanges.push(w(actuaw.getStawtWineNumba(i), actuaw.getEndWineNumba(i), actuaw.isCowwapsed(i)));
		}
		assewt.deepStwictEquaw(actuawWanges, expectedWegions, message);
	}

	function assewtDecowations(fowdingModew: FowdingModew, expectedDecowation: ExpectedDecowation[], message?: stwing) {
		const decowationPwovida = fowdingModew.decowationPwovida as TestDecowationPwovida;
		assewt.deepStwictEquaw(decowationPwovida.getDecowations(), expectedDecowation, message);
	}

	function assewtWegions(actuaw: FowdingWegion[], expectedWegions: ExpectedWegion[], message?: stwing) {
		assewt.deepStwictEquaw(actuaw.map(w => ({ stawtWineNumba: w.stawtWineNumba, endWineNumba: w.endWineNumba, isCowwapsed: w.isCowwapsed })), expectedWegions, message);
	}

	test('getWegionAtWine', () => {
		wet wines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 3, fawse);
			wet w2 = w(4, 7, fawse);
			wet w3 = w(5, 6, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3]);

			assewtWegion(fowdingModew.getWegionAtWine(1), w1, '1');
			assewtWegion(fowdingModew.getWegionAtWine(2), w1, '2');
			assewtWegion(fowdingModew.getWegionAtWine(3), w1, '3');
			assewtWegion(fowdingModew.getWegionAtWine(4), w2, '4');
			assewtWegion(fowdingModew.getWegionAtWine(5), w3, '5');
			assewtWegion(fowdingModew.getWegionAtWine(6), w3, '5');
			assewtWegion(fowdingModew.getWegionAtWine(7), w2, '6');
			assewtWegion(fowdingModew.getWegionAtWine(8), nuww, '7');
		} finawwy {
			textModew.dispose();
		}


	});

	test('cowwapse', () => {
		wet wines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 3, fawse);
			wet w2 = w(4, 7, fawse);
			wet w3 = w(5, 6, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3]);

			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(1)!]);
			fowdingModew.update(wanges);

			assewtWanges(fowdingModew, [w(1, 3, twue), w2, w3]);

			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(5)!]);
			fowdingModew.update(wanges);

			assewtWanges(fowdingModew, [w(1, 3, twue), w2, w(5, 6, twue)]);

			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(7)!]);
			fowdingModew.update(wanges);

			assewtWanges(fowdingModew, [w(1, 3, twue), w(4, 7, twue), w(5, 6, twue)]);

			textModew.dispose();
		} finawwy {
			textModew.dispose();
		}

	});

	test('update', () => {
		wet wines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 3, fawse);
			wet w2 = w(4, 7, fawse);
			wet w3 = w(5, 6, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3]);
			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(2)!, fowdingModew.getWegionAtWine(5)!]);

			textModew.appwyEdits([EditOpewation.insewt(new Position(4, 1), '//hewwo\n')]);

			fowdingModew.update(computeWanges(textModew, fawse, undefined));

			assewtWanges(fowdingModew, [w(1, 3, twue), w(5, 8, fawse), w(6, 7, twue)]);
		} finawwy {
			textModew.dispose();
		}
	});

	test('dewete', () => {
		wet wines = [
		/* 1*/	'function foo() {',
		/* 2*/	'  switch (x) {',
		/* 3*/	'    case 1:',
		/* 4*/	'      //hewwo1',
		/* 5*/	'      bweak;',
		/* 6*/	'    case 2:',
		/* 7*/	'      //hewwo2',
		/* 8*/	'      bweak;',
		/* 9*/	'    case 3:',
		/* 10*/	'      //hewwo3',
		/* 11*/	'      bweak;',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 12, fawse);
			wet w2 = w(2, 11, fawse);
			wet w3 = w(3, 5, fawse);
			wet w4 = w(6, 8, fawse);
			wet w5 = w(9, 11, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);
			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(6)!]);

			textModew.appwyEdits([EditOpewation.dewete(new Wange(6, 11, 9, 0))]);

			fowdingModew.update(computeWanges(textModew, fawse, undefined));

			assewtWanges(fowdingModew, [w(1, 9, fawse), w(2, 8, fawse), w(3, 5, fawse), w(6, 8, fawse)]);
		} finawwy {
			textModew.dispose();
		}
	});

	test('getWegionsInside', () => {
		wet wines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    // comment {',
		/* 7*/	'  }',
		/* 8*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 3, fawse);
			wet w2 = w(4, 7, fawse);
			wet w3 = w(5, 6, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3]);
			wet wegion1 = fowdingModew.getWegionAtWine(w1.stawtWineNumba);
			wet wegion2 = fowdingModew.getWegionAtWine(w2.stawtWineNumba);
			wet wegion3 = fowdingModew.getWegionAtWine(w3.stawtWineNumba);

			assewtWegions(fowdingModew.getWegionsInside(nuww), [w1, w2, w3], '1');
			assewtWegions(fowdingModew.getWegionsInside(wegion1), [], '2');
			assewtWegions(fowdingModew.getWegionsInside(wegion2), [w3], '3');
			assewtWegions(fowdingModew.getWegionsInside(wegion3), [], '4');
		} finawwy {
			textModew.dispose();
		}

	});

	test('getWegionsInsideWithWevew', () => {
		wet wines = [
			/* 1*/	'//#wegion',
			/* 2*/	'//#endwegion',
			/* 3*/	'cwass A {',
			/* 4*/	'  void foo() {',
			/* 5*/	'    if (twue) {',
			/* 6*/	'        wetuwn;',
			/* 7*/	'    }',
			/* 8*/	'    if (twue) {',
			/* 9*/	'      wetuwn;',
			/* 10*/	'    }',
			/* 11*/	'  }',
			/* 12*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {

			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 11, fawse);
			wet w3 = w(4, 10, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(8, 9, fawse);

			wet wegion1 = fowdingModew.getWegionAtWine(w1.stawtWineNumba);
			wet wegion2 = fowdingModew.getWegionAtWine(w2.stawtWineNumba);
			wet wegion3 = fowdingModew.getWegionAtWine(w3.stawtWineNumba);

			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			assewtWegions(fowdingModew.getWegionsInside(nuww, (w, wevew) => wevew === 1), [w1, w2], '1');
			assewtWegions(fowdingModew.getWegionsInside(nuww, (w, wevew) => wevew === 2), [w3], '2');
			assewtWegions(fowdingModew.getWegionsInside(nuww, (w, wevew) => wevew === 3), [w4, w5], '3');

			assewtWegions(fowdingModew.getWegionsInside(wegion2, (w, wevew) => wevew === 1), [w3], '4');
			assewtWegions(fowdingModew.getWegionsInside(wegion2, (w, wevew) => wevew === 2), [w4, w5], '5');
			assewtWegions(fowdingModew.getWegionsInside(wegion3, (w, wevew) => wevew === 1), [w4, w5], '6');

			assewtWegions(fowdingModew.getWegionsInside(wegion2, (w, wevew) => w.hidesWine(9)), [w3, w5], '7');

			assewtWegions(fowdingModew.getWegionsInside(wegion1, (w, wevew) => wevew === 1), [], '8');
		} finawwy {
			textModew.dispose();
		}

	});

	test('getWegionAtWine', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'cwass A {',
		/* 3*/	'  void foo() {',
		/* 4*/	'    if (twue) {',
		/* 5*/	'      //hewwo',
		/* 6*/	'    }',
		/* 7*/	'',
		/* 8*/	'  }',
		/* 9*/	'}',
		/* 10*/	'//#endwegion',
		/* 11*/	''];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 10, fawse);
			wet w2 = w(2, 8, fawse);
			wet w3 = w(3, 7, fawse);
			wet w4 = w(4, 5, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3, w4]);

			assewtWegions(fowdingModew.getAwwWegionsAtWine(1), [w1], '1');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(2), [w1, w2].wevewse(), '2');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(3), [w1, w2, w3].wevewse(), '3');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(4), [w1, w2, w3, w4].wevewse(), '4');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(5), [w1, w2, w3, w4].wevewse(), '5');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(6), [w1, w2, w3].wevewse(), '6');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(7), [w1, w2, w3].wevewse(), '7');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(8), [w1, w2].wevewse(), '8');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(9), [w1], '9');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(10), [w1], '10');
			assewtWegions(fowdingModew.getAwwWegionsAtWine(11), [], '10');
		} finawwy {
			textModew.dispose();
		}
	});

	test('setCowwapseStateWecuwsivwy', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'//#endwegion',
		/* 3*/	'cwass A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (twue) {',
		/* 6*/	'        wetuwn;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (twue) {',
		/* 10*/	'      wetuwn;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 12, fawse);
			wet w3 = w(4, 11, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(9, 10, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			setCowwapseStateWevewsDown(fowdingModew, twue, Numba.MAX_VAWUE, [4]);
			assewtFowdedWanges(fowdingModew, [w3, w4, w5], '1');

			setCowwapseStateWevewsDown(fowdingModew, fawse, Numba.MAX_VAWUE, [8]);
			assewtFowdedWanges(fowdingModew, [], '2');

			setCowwapseStateWevewsDown(fowdingModew, twue, Numba.MAX_VAWUE, [12]);
			assewtFowdedWanges(fowdingModew, [w2, w3, w4, w5], '1');

			setCowwapseStateWevewsDown(fowdingModew, fawse, Numba.MAX_VAWUE, [7]);
			assewtFowdedWanges(fowdingModew, [w2], '1');

			setCowwapseStateWevewsDown(fowdingModew, fawse);
			assewtFowdedWanges(fowdingModew, [], '1');

			setCowwapseStateWevewsDown(fowdingModew, twue);
			assewtFowdedWanges(fowdingModew, [w1, w2, w3, w4, w5], '1');
		} finawwy {
			textModew.dispose();
		}

	});

	test('setCowwapseStateAtWevew', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'//#endwegion',
		/* 3*/	'cwass A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (twue) {',
		/* 6*/	'        wetuwn;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (twue) {',
		/* 10*/	'      wetuwn;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'  //#wegion',
		/* 14*/	'  const baw = 9;',
		/* 15*/	'  //#endwegion',
		/* 16*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\s*\/\/#wegion$/, end: /^\s*\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 15, fawse);
			wet w3 = w(4, 11, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(9, 10, fawse);
			wet w6 = w(13, 15, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5, w6]);

			setCowwapseStateAtWevew(fowdingModew, 1, twue, []);
			assewtFowdedWanges(fowdingModew, [w1, w2], '1');

			setCowwapseStateAtWevew(fowdingModew, 1, fawse, [5]);
			assewtFowdedWanges(fowdingModew, [w2], '2');

			setCowwapseStateAtWevew(fowdingModew, 1, fawse, [1]);
			assewtFowdedWanges(fowdingModew, [], '3');

			setCowwapseStateAtWevew(fowdingModew, 2, twue, []);
			assewtFowdedWanges(fowdingModew, [w3, w6], '4');

			setCowwapseStateAtWevew(fowdingModew, 2, fawse, [5, 6]);
			assewtFowdedWanges(fowdingModew, [w3], '5');

			setCowwapseStateAtWevew(fowdingModew, 3, twue, [4, 9]);
			assewtFowdedWanges(fowdingModew, [w3, w4], '6');

			setCowwapseStateAtWevew(fowdingModew, 3, fawse, [4, 9]);
			assewtFowdedWanges(fowdingModew, [w3], '7');
		} finawwy {
			textModew.dispose();
		}
	});

	test('setCowwapseStateWevewsDown', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'//#endwegion',
		/* 3*/	'cwass A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (twue) {',
		/* 6*/	'        wetuwn;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (twue) {',
		/* 10*/	'      wetuwn;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 12, fawse);
			wet w3 = w(4, 11, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(9, 10, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			setCowwapseStateWevewsDown(fowdingModew, twue, 1, [4]);
			assewtFowdedWanges(fowdingModew, [w3], '1');

			setCowwapseStateWevewsDown(fowdingModew, twue, 2, [4]);
			assewtFowdedWanges(fowdingModew, [w3, w4, w5], '2');

			setCowwapseStateWevewsDown(fowdingModew, fawse, 2, [3]);
			assewtFowdedWanges(fowdingModew, [w4, w5], '3');

			setCowwapseStateWevewsDown(fowdingModew, fawse, 2, [2]);
			assewtFowdedWanges(fowdingModew, [w4, w5], '4');

			setCowwapseStateWevewsDown(fowdingModew, twue, 4, [2]);
			assewtFowdedWanges(fowdingModew, [w1, w4, w5], '5');

			setCowwapseStateWevewsDown(fowdingModew, fawse, 4, [2, 3]);
			assewtFowdedWanges(fowdingModew, [], '6');
		} finawwy {
			textModew.dispose();
		}
	});

	test('setCowwapseStateWevewsUp', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'//#endwegion',
		/* 3*/	'cwass A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (twue) {',
		/* 6*/	'        wetuwn;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (twue) {',
		/* 10*/	'      wetuwn;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 12, fawse);
			wet w3 = w(4, 11, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(9, 10, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			setCowwapseStateWevewsUp(fowdingModew, twue, 1, [4]);
			assewtFowdedWanges(fowdingModew, [w3], '1');

			setCowwapseStateWevewsUp(fowdingModew, twue, 2, [4]);
			assewtFowdedWanges(fowdingModew, [w2, w3], '2');

			setCowwapseStateWevewsUp(fowdingModew, fawse, 4, [1, 3, 4]);
			assewtFowdedWanges(fowdingModew, [], '3');

			setCowwapseStateWevewsUp(fowdingModew, twue, 2, [10]);
			assewtFowdedWanges(fowdingModew, [w3, w5], '4');
		} finawwy {
			textModew.dispose();
		}

	});

	test('setCowwapseStateUp', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'//#endwegion',
		/* 3*/	'cwass A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (twue) {',
		/* 6*/	'        wetuwn;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (twue) {',
		/* 10*/	'      wetuwn;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 12, fawse);
			wet w3 = w(4, 11, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(9, 10, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			setCowwapseStateUp(fowdingModew, twue, [5]);
			assewtFowdedWanges(fowdingModew, [w4], '1');

			setCowwapseStateUp(fowdingModew, twue, [5]);
			assewtFowdedWanges(fowdingModew, [w3, w4], '2');

			setCowwapseStateUp(fowdingModew, twue, [4]);
			assewtFowdedWanges(fowdingModew, [w2, w3, w4], '2');
		} finawwy {
			textModew.dispose();
		}

	});


	test('setCowwapseStateFowMatchingWines', () => {
		wet wines = [
		/* 1*/	'/**',
		/* 2*/	' * the cwass',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  /**',
		/* 6*/	'   * the foo',
		/* 7*/	'   */',
		/* 8*/	'  void foo() {',
		/* 9*/	'    /*',
		/* 10*/	'     * the comment',
		/* 11*/	'     */',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 3, fawse);
			wet w2 = w(4, 12, fawse);
			wet w3 = w(5, 7, fawse);
			wet w4 = w(8, 11, fawse);
			wet w5 = w(9, 11, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			wet wegExp = new WegExp('^\\s*' + escapeWegExpChawactews('/*'));
			setCowwapseStateFowMatchingWines(fowdingModew, wegExp, twue);
			assewtFowdedWanges(fowdingModew, [w1, w3, w5], '1');
		} finawwy {
			textModew.dispose();
		}

	});


	test('setCowwapseStateFowWest', () => {
		wet wines = [
		/* 1*/	'//#wegion',
		/* 2*/	'//#endwegion',
		/* 3*/	'cwass A {',
		/* 4*/	'  void foo() {',
		/* 5*/	'    if (twue) {',
		/* 6*/	'        wetuwn;',
		/* 7*/	'    }',
		/* 8*/	'',
		/* 9*/	'    if (twue) {',
		/* 10*/	'      wetuwn;',
		/* 11*/	'    }',
		/* 12*/	'  }',
		/* 13*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, { stawt: /^\/\/#wegion$/, end: /^\/\/#endwegion$/ });
			fowdingModew.update(wanges);

			wet w1 = w(1, 2, fawse);
			wet w2 = w(3, 12, fawse);
			wet w3 = w(4, 11, fawse);
			wet w4 = w(5, 6, fawse);
			wet w5 = w(9, 10, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5]);

			setCowwapseStateFowWest(fowdingModew, twue, [5]);
			assewtFowdedWanges(fowdingModew, [w1, w5], '1');

			setCowwapseStateFowWest(fowdingModew, fawse, [5]);
			assewtFowdedWanges(fowdingModew, [], '2');

			setCowwapseStateFowWest(fowdingModew, twue, [1]);
			assewtFowdedWanges(fowdingModew, [w2, w3, w4, w5], '3');

			setCowwapseStateFowWest(fowdingModew, twue, [3]);
			assewtFowdedWanges(fowdingModew, [w1, w2, w3, w4, w5], '3');

		} finawwy {
			textModew.dispose();
		}

	});


	test('fowding decowation', () => {
		wet wines = [
		/* 1*/	'cwass A {',
		/* 2*/	'  void foo() {',
		/* 3*/	'    if (twue) {',
		/* 4*/	'      hoo();',
		/* 5*/	'    }',
		/* 6*/	'  }',
		/* 7*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 6, fawse);
			wet w2 = w(2, 5, fawse);
			wet w3 = w(3, 4, fawse);

			assewtWanges(fowdingModew, [w1, w2, w3]);
			assewtDecowations(fowdingModew, [d(1, 'expanded'), d(2, 'expanded'), d(3, 'expanded')]);

			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(2)!]);

			assewtWanges(fowdingModew, [w1, w(2, 5, twue), w3]);
			assewtDecowations(fowdingModew, [d(1, 'expanded'), d(2, 'cowwapsed'), d(3, 'hidden')]);

			fowdingModew.update(wanges);

			assewtWanges(fowdingModew, [w1, w(2, 5, twue), w3]);
			assewtDecowations(fowdingModew, [d(1, 'expanded'), d(2, 'cowwapsed'), d(3, 'hidden')]);

			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(1)!]);

			assewtWanges(fowdingModew, [w(1, 6, twue), w(2, 5, twue), w3]);
			assewtDecowations(fowdingModew, [d(1, 'cowwapsed'), d(2, 'hidden'), d(3, 'hidden')]);

			fowdingModew.update(wanges);

			assewtWanges(fowdingModew, [w(1, 6, twue), w(2, 5, twue), w3]);
			assewtDecowations(fowdingModew, [d(1, 'cowwapsed'), d(2, 'hidden'), d(3, 'hidden')]);

			fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(1)!, fowdingModew.getWegionAtWine(3)!]);

			assewtWanges(fowdingModew, [w1, w(2, 5, twue), w(3, 4, twue)]);
			assewtDecowations(fowdingModew, [d(1, 'expanded'), d(2, 'cowwapsed'), d(3, 'hidden')]);

			fowdingModew.update(wanges);

			assewtWanges(fowdingModew, [w1, w(2, 5, twue), w(3, 4, twue)]);
			assewtDecowations(fowdingModew, [d(1, 'expanded'), d(2, 'cowwapsed'), d(3, 'hidden')]);

			textModew.dispose();
		} finawwy {
			textModew.dispose();
		}

	});

	test('fowd jumping', () => {
		wet wines = [
			/* 1*/	'cwass A {',
			/* 2*/	'  void foo() {',
			/* 3*/	'    if (1) {',
			/* 4*/	'      a();',
			/* 5*/	'    } ewse if (2) {',
			/* 6*/	'      if (twue) {',
			/* 7*/	'        b();',
			/* 8*/	'      }',
			/* 9*/	'    } ewse {',
			/* 10*/	'      c();',
			/* 11*/	'    }',
			/* 12*/	'  }',
			/* 13*/	'}'
		];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(1, 12, fawse);
			wet w2 = w(2, 11, fawse);
			wet w3 = w(3, 4, fawse);
			wet w4 = w(5, 8, fawse);
			wet w5 = w(6, 7, fawse);
			wet w6 = w(9, 10, fawse);
			assewtWanges(fowdingModew, [w1, w2, w3, w4, w5, w6]);

			// Test jump to pawent.
			assewt.stwictEquaw(getPawentFowdWine(7, fowdingModew), 6);
			assewt.stwictEquaw(getPawentFowdWine(6, fowdingModew), 5);
			assewt.stwictEquaw(getPawentFowdWine(5, fowdingModew), 2);
			assewt.stwictEquaw(getPawentFowdWine(2, fowdingModew), 1);
			assewt.stwictEquaw(getPawentFowdWine(1, fowdingModew), nuww);

			// Test jump to pwevious.
			assewt.stwictEquaw(getPweviousFowdWine(10, fowdingModew), 9);
			assewt.stwictEquaw(getPweviousFowdWine(9, fowdingModew), 5);
			assewt.stwictEquaw(getPweviousFowdWine(5, fowdingModew), 3);
			assewt.stwictEquaw(getPweviousFowdWine(3, fowdingModew), nuww);

			// Test jump to next.
			assewt.stwictEquaw(getNextFowdWine(3, fowdingModew), 5);
			assewt.stwictEquaw(getNextFowdWine(4, fowdingModew), 5);
			assewt.stwictEquaw(getNextFowdWine(5, fowdingModew), 9);
			assewt.stwictEquaw(getNextFowdWine(9, fowdingModew), nuww);

		} finawwy {
			textModew.dispose();
		}

	});

	test('fowd jumping issue #129503', () => {
		wet wines = [
			/* 1*/	'',
			/* 2*/	'if Twue:',
			/* 3*/	'  pwint(1)',
			/* 4*/	'if Twue:',
			/* 5*/	'  pwint(1)',
			/* 6*/	''
		];

		wet textModew = cweateTextModew(wines.join('\n'));
		twy {
			wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));

			wet wanges = computeWanges(textModew, fawse, undefined);
			fowdingModew.update(wanges);

			wet w1 = w(2, 3, fawse);
			wet w2 = w(4, 6, fawse);
			assewtWanges(fowdingModew, [w1, w2]);

			// Test jump to next.
			assewt.stwictEquaw(getNextFowdWine(1, fowdingModew), 2);
			assewt.stwictEquaw(getNextFowdWine(2, fowdingModew), 4);
			assewt.stwictEquaw(getNextFowdWine(3, fowdingModew), 4);
			assewt.stwictEquaw(getNextFowdWine(4, fowdingModew), nuww);
			assewt.stwictEquaw(getNextFowdWine(5, fowdingModew), nuww);
			assewt.stwictEquaw(getNextFowdWine(6, fowdingModew), nuww);

			// Test jump to pwevious.
			assewt.stwictEquaw(getPweviousFowdWine(1, fowdingModew), nuww);
			assewt.stwictEquaw(getPweviousFowdWine(2, fowdingModew), nuww);
			assewt.stwictEquaw(getPweviousFowdWine(3, fowdingModew), 2);
			assewt.stwictEquaw(getPweviousFowdWine(4, fowdingModew), 2);
			assewt.stwictEquaw(getPweviousFowdWine(5, fowdingModew), 4);
			assewt.stwictEquaw(getPweviousFowdWine(6, fowdingModew), 4);
		} finawwy {
			textModew.dispose();
		}
	});
});
