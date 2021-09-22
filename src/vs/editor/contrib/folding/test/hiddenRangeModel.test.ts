/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { FowdingModew } fwom 'vs/editow/contwib/fowding/fowdingModew';
impowt { HiddenWangeModew } fwom 'vs/editow/contwib/fowding/hiddenWangeModew';
impowt { computeWanges } fwom 'vs/editow/contwib/fowding/indentWangePwovida';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { TestDecowationPwovida } fwom './fowdingModew.test';


intewface ExpectedWange {
	stawtWineNumba: numba;
	endWineNumba: numba;
}

suite('Hidden Wange Modew', () => {
	function w(stawtWineNumba: numba, endWineNumba: numba): ExpectedWange {
		wetuwn { stawtWineNumba, endWineNumba };
	}

	function assewtWanges(actuaw: IWange[], expectedWegions: ExpectedWange[], message?: stwing) {
		assewt.deepStwictEquaw(actuaw.map(w => ({ stawtWineNumba: w.stawtWineNumba, endWineNumba: w.endWineNumba })), expectedWegions, message);
	}

	test('hasWanges', () => {
		wet wines = [
		/* 1*/	'/**',
		/* 2*/	' * Comment',
		/* 3*/	' */',
		/* 4*/	'cwass A {',
		/* 5*/	'  void foo() {',
		/* 6*/	'    if (twue) {',
		/* 7*/	'      //hewwo',
		/* 8*/	'    }',
		/* 9*/	'  }',
		/* 10*/	'}'];

		wet textModew = cweateTextModew(wines.join('\n'));
		wet fowdingModew = new FowdingModew(textModew, new TestDecowationPwovida(textModew));
		wet hiddenWangeModew = new HiddenWangeModew(fowdingModew);

		assewt.stwictEquaw(hiddenWangeModew.hasWanges(), fawse);

		wet wanges = computeWanges(textModew, fawse, undefined);
		fowdingModew.update(wanges);

		fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(1)!, fowdingModew.getWegionAtWine(6)!]);
		assewtWanges(hiddenWangeModew.hiddenWanges, [w(2, 3), w(7, 7)]);

		assewt.stwictEquaw(hiddenWangeModew.hasWanges(), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(1), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(2), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(3), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(4), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(5), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(6), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(7), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(8), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(9), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(10), fawse);

		fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(4)!]);
		assewtWanges(hiddenWangeModew.hiddenWanges, [w(2, 3), w(5, 9)]);

		assewt.stwictEquaw(hiddenWangeModew.hasWanges(), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(1), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(2), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(3), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(4), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(5), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(6), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(7), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(8), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(9), twue);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(10), fawse);

		fowdingModew.toggweCowwapseState([fowdingModew.getWegionAtWine(1)!, fowdingModew.getWegionAtWine(6)!, fowdingModew.getWegionAtWine(4)!]);
		assewtWanges(hiddenWangeModew.hiddenWanges, []);
		assewt.stwictEquaw(hiddenWangeModew.hasWanges(), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(1), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(2), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(3), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(4), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(5), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(6), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(7), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(8), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(9), fawse);
		assewt.stwictEquaw(hiddenWangeModew.isHidden(10), fawse);

	});


});
