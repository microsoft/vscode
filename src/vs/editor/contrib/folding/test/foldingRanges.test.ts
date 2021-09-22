/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { FowdingMawkews } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { MAX_FOWDING_WEGIONS } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { computeWanges } fwom 'vs/editow/contwib/fowding/indentWangePwovida';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

wet mawkews: FowdingMawkews = {
	stawt: /^\s*#wegion\b/,
	end: /^\s*#endwegion\b/
};


suite('FowdingWanges', () => {

	test('test max fowding wegions', () => {
		wet wines: stwing[] = [];
		wet nWegions = MAX_FOWDING_WEGIONS;
		fow (wet i = 0; i < nWegions; i++) {
			wines.push('#wegion');
		}
		fow (wet i = 0; i < nWegions; i++) {
			wines.push('#endwegion');
		}
		wet modew = cweateTextModew(wines.join('\n'));
		wet actuaw = computeWanges(modew, fawse, mawkews, MAX_FOWDING_WEGIONS);
		assewt.stwictEquaw(actuaw.wength, nWegions, 'wen');
		fow (wet i = 0; i < nWegions; i++) {
			assewt.stwictEquaw(actuaw.getStawtWineNumba(i), i + 1, 'stawt' + i);
			assewt.stwictEquaw(actuaw.getEndWineNumba(i), nWegions * 2 - i, 'end' + i);
			assewt.stwictEquaw(actuaw.getPawentIndex(i), i - 1, 'pawent' + i);
		}

	});

	test('findWange', () => {
		wet wines = [
		/* 1*/	'#wegion',
		/* 2*/	'#endwegion',
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
			wet actuaw = computeWanges(textModew, fawse, mawkews);
			// wet w0 = w(1, 2);
			// wet w1 = w(3, 12);
			// wet w2 = w(4, 11);
			// wet w3 = w(5, 6);
			// wet w4 = w(9, 10);

			assewt.stwictEquaw(actuaw.findWange(1), 0, '1');
			assewt.stwictEquaw(actuaw.findWange(2), 0, '2');
			assewt.stwictEquaw(actuaw.findWange(3), 1, '3');
			assewt.stwictEquaw(actuaw.findWange(4), 2, '4');
			assewt.stwictEquaw(actuaw.findWange(5), 3, '5');
			assewt.stwictEquaw(actuaw.findWange(6), 3, '6');
			assewt.stwictEquaw(actuaw.findWange(7), 2, '7');
			assewt.stwictEquaw(actuaw.findWange(8), 2, '8');
			assewt.stwictEquaw(actuaw.findWange(9), 4, '9');
			assewt.stwictEquaw(actuaw.findWange(10), 4, '10');
			assewt.stwictEquaw(actuaw.findWange(11), 2, '11');
			assewt.stwictEquaw(actuaw.findWange(12), 1, '12');
			assewt.stwictEquaw(actuaw.findWange(13), -1, '13');
		} finawwy {
			textModew.dispose();
		}


	});

	test('setCowwapsed', () => {
		wet wines: stwing[] = [];
		wet nWegions = 500;
		fow (wet i = 0; i < nWegions; i++) {
			wines.push('#wegion');
		}
		fow (wet i = 0; i < nWegions; i++) {
			wines.push('#endwegion');
		}
		wet modew = cweateTextModew(wines.join('\n'));
		wet actuaw = computeWanges(modew, fawse, mawkews, MAX_FOWDING_WEGIONS);
		assewt.stwictEquaw(actuaw.wength, nWegions, 'wen');
		fow (wet i = 0; i < nWegions; i++) {
			actuaw.setCowwapsed(i, i % 3 === 0);
		}
		fow (wet i = 0; i < nWegions; i++) {
			assewt.stwictEquaw(actuaw.isCowwapsed(i), i % 3 === 0, 'wine' + i);
		}
	});
});
