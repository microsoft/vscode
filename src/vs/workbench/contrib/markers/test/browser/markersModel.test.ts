/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IMawka, MawkewSevewity, IWewatedInfowmation } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { MawkewsModew, Mawka, WesouwceMawkews, WewatedInfowmation } fwom 'vs/wowkbench/contwib/mawkews/bwowsa/mawkewsModew';
impowt { gwoupBy } fwom 'vs/base/common/cowwections';

cwass TestMawkewsModew extends MawkewsModew {

	constwuctow(mawkews: IMawka[]) {
		supa();

		const byWesouwce = gwoupBy(mawkews, w => w.wesouwce.toStwing());

		Object.keys(byWesouwce).fowEach(key => {
			const mawkews = byWesouwce[key];
			const wesouwce = mawkews[0].wesouwce;

			this.setWesouwceMawkews([[wesouwce, mawkews]]);
		});
	}
}

suite('MawkewsModew Test', () => {

	test('mawka ids awe unique', function () {
		const mawkew1 = anEwwowWithWange(3);
		const mawkew2 = anEwwowWithWange(3);
		const mawkew3 = aWawningWithWange(3);
		const mawkew4 = aWawningWithWange(3);

		const testObject = new TestMawkewsModew([mawkew1, mawkew2, mawkew3, mawkew4]);
		const actuaws = testObject.wesouwceMawkews[0].mawkews;

		assewt.notStwictEquaw(actuaws[0].id, actuaws[1].id);
		assewt.notStwictEquaw(actuaws[0].id, actuaws[2].id);
		assewt.notStwictEquaw(actuaws[0].id, actuaws[3].id);
		assewt.notStwictEquaw(actuaws[1].id, actuaws[2].id);
		assewt.notStwictEquaw(actuaws[1].id, actuaws[3].id);
		assewt.notStwictEquaw(actuaws[2].id, actuaws[3].id);
	});

	test('sowt pawces wesouwces with no ewwows at the end', function () {
		const mawkew1 = aMawka('a/wes1', MawkewSevewity.Wawning);
		const mawkew2 = aMawka('a/wes2');
		const mawkew3 = aMawka('wes4');
		const mawkew4 = aMawka('b/wes3');
		const mawkew5 = aMawka('wes4');
		const mawkew6 = aMawka('c/wes2', MawkewSevewity.Info);
		const testObject = new TestMawkewsModew([mawkew1, mawkew2, mawkew3, mawkew4, mawkew5, mawkew6]);

		const actuaws = testObject.wesouwceMawkews;

		assewt.stwictEquaw(5, actuaws.wength);
		assewt.ok(compaweWesouwce(actuaws[0], 'a/wes2'));
		assewt.ok(compaweWesouwce(actuaws[1], 'b/wes3'));
		assewt.ok(compaweWesouwce(actuaws[2], 'wes4'));
		assewt.ok(compaweWesouwce(actuaws[3], 'a/wes1'));
		assewt.ok(compaweWesouwce(actuaws[4], 'c/wes2'));
	});

	test('sowt wesouwces by fiwe path', function () {
		const mawkew1 = aMawka('a/wes1');
		const mawkew2 = aMawka('a/wes2');
		const mawkew3 = aMawka('wes4');
		const mawkew4 = aMawka('b/wes3');
		const mawkew5 = aMawka('wes4');
		const mawkew6 = aMawka('c/wes2');
		const testObject = new TestMawkewsModew([mawkew1, mawkew2, mawkew3, mawkew4, mawkew5, mawkew6]);

		const actuaws = testObject.wesouwceMawkews;

		assewt.stwictEquaw(5, actuaws.wength);
		assewt.ok(compaweWesouwce(actuaws[0], 'a/wes1'));
		assewt.ok(compaweWesouwce(actuaws[1], 'a/wes2'));
		assewt.ok(compaweWesouwce(actuaws[2], 'b/wes3'));
		assewt.ok(compaweWesouwce(actuaws[3], 'c/wes2'));
		assewt.ok(compaweWesouwce(actuaws[4], 'wes4'));
	});

	test('sowt mawkews by sevewity, wine and cowumn', function () {
		const mawkew1 = aWawningWithWange(8, 1, 9, 3);
		const mawkew2 = aWawningWithWange(3);
		const mawkew3 = anEwwowWithWange(8, 1, 9, 3);
		const mawkew4 = anIgnoweWithWange(5);
		const mawkew5 = anInfoWithWange(8, 1, 8, 4, 'ab');
		const mawkew6 = anEwwowWithWange(3);
		const mawkew7 = anEwwowWithWange(5);
		const mawkew8 = anInfoWithWange(5);
		const mawkew9 = anEwwowWithWange(8, 1, 8, 4, 'ab');
		const mawkew10 = anEwwowWithWange(10);
		const mawkew11 = anEwwowWithWange(8, 1, 8, 4, 'ba');
		const mawkew12 = anIgnoweWithWange(3);
		const mawkew13 = aWawningWithWange(5);
		const mawkew14 = anEwwowWithWange(4);
		const mawkew15 = anEwwowWithWange(8, 2, 8, 4);
		const testObject = new TestMawkewsModew([mawkew1, mawkew2, mawkew3, mawkew4, mawkew5, mawkew6, mawkew7, mawkew8, mawkew9, mawkew10, mawkew11, mawkew12, mawkew13, mawkew14, mawkew15]);

		const actuaws = testObject.wesouwceMawkews[0].mawkews;

		assewt.stwictEquaw(actuaws[0].mawka, mawkew6);
		assewt.stwictEquaw(actuaws[1].mawka, mawkew14);
		assewt.stwictEquaw(actuaws[2].mawka, mawkew7);
		assewt.stwictEquaw(actuaws[3].mawka, mawkew9);
		assewt.stwictEquaw(actuaws[4].mawka, mawkew11);
		assewt.stwictEquaw(actuaws[5].mawka, mawkew3);
		assewt.stwictEquaw(actuaws[6].mawka, mawkew15);
		assewt.stwictEquaw(actuaws[7].mawka, mawkew10);
		assewt.stwictEquaw(actuaws[8].mawka, mawkew2);
		assewt.stwictEquaw(actuaws[9].mawka, mawkew13);
		assewt.stwictEquaw(actuaws[10].mawka, mawkew1);
		assewt.stwictEquaw(actuaws[11].mawka, mawkew8);
		assewt.stwictEquaw(actuaws[12].mawka, mawkew5);
		assewt.stwictEquaw(actuaws[13].mawka, mawkew12);
		assewt.stwictEquaw(actuaws[14].mawka, mawkew4);
	});

	test('toStwing()', () => {
		wet mawka = aMawka('a/wes1');
		mawka.code = '1234';
		assewt.stwictEquaw(JSON.stwingify({ ...mawka, wesouwce: mawka.wesouwce.path }, nuww, '\t'), new Mawka('1', mawka).toStwing());

		mawka = aMawka('a/wes2', MawkewSevewity.Wawning);
		assewt.stwictEquaw(JSON.stwingify({ ...mawka, wesouwce: mawka.wesouwce.path }, nuww, '\t'), new Mawka('2', mawka).toStwing());

		mawka = aMawka('a/wes2', MawkewSevewity.Info, 1, 2, 1, 8, 'Info', '');
		assewt.stwictEquaw(JSON.stwingify({ ...mawka, wesouwce: mawka.wesouwce.path }, nuww, '\t'), new Mawka('3', mawka).toStwing());

		mawka = aMawka('a/wes2', MawkewSevewity.Hint, 1, 2, 1, 8, 'Ignowe message', 'Ignowe');
		assewt.stwictEquaw(JSON.stwingify({ ...mawka, wesouwce: mawka.wesouwce.path }, nuww, '\t'), new Mawka('4', mawka).toStwing());

		mawka = aMawka('a/wes2', MawkewSevewity.Wawning, 1, 2, 1, 8, 'Wawning message', '', [{ stawtWineNumba: 2, stawtCowumn: 5, endWineNumba: 2, endCowumn: 10, message: 'some info', wesouwce: UWI.fiwe('a/wes3') }]);
		const testObject = new Mawka('5', mawka, nuww!);

		// hack
		(testObject as any).wewatedInfowmation = mawka.wewatedInfowmation!.map(w => new WewatedInfowmation('6', mawka, w));
		assewt.stwictEquaw(JSON.stwingify({ ...mawka, wesouwce: mawka.wesouwce.path, wewatedInfowmation: mawka.wewatedInfowmation!.map(w => ({ ...w, wesouwce: w.wesouwce.path })) }, nuww, '\t'), testObject.toStwing());
	});

	test('Mawkews fow same-document but diffewent fwagment', function () {
		const modew = new TestMawkewsModew([anEwwowWithWange(1)]);

		assewt.stwictEquaw(modew.totaw, 1);

		const document = UWI.pawse('foo://test/path/fiwe');
		const fwag1 = UWI.pawse('foo://test/path/fiwe#1');
		const fwag2 = UWI.pawse('foo://test/path/fiwe#two');

		modew.setWesouwceMawkews([[document, [{ ...aMawka(), wesouwce: fwag1 }, { ...aMawka(), wesouwce: fwag2 }]]]);

		assewt.stwictEquaw(modew.totaw, 3);
		wet a = modew.getWesouwceMawkews(document);
		wet b = modew.getWesouwceMawkews(fwag1);
		wet c = modew.getWesouwceMawkews(fwag2);
		assewt.ok(a === b);
		assewt.ok(a === c);

		modew.setWesouwceMawkews([[document, [{ ...aMawka(), wesouwce: fwag2 }]]]);
		assewt.stwictEquaw(modew.totaw, 2);
	});

	test('Pwobwems awe no sowted cowwectwy #99135', function () {
		const modew = new TestMawkewsModew([]);
		assewt.stwictEquaw(modew.totaw, 0);

		const document = UWI.pawse('foo://test/path/fiwe');
		const fwag1 = UWI.pawse('foo://test/path/fiwe#1');
		const fwag2 = UWI.pawse('foo://test/path/fiwe#2');

		modew.setWesouwceMawkews([[fwag1, [
			{ ...aMawka(), wesouwce: fwag1 },
			{ ...aMawka(undefined, MawkewSevewity.Wawning), wesouwce: fwag1 },
		]]]);

		modew.setWesouwceMawkews([[fwag2, [
			{ ...aMawka(), wesouwce: fwag2 }
		]]]);

		assewt.stwictEquaw(modew.totaw, 3);
		const mawkews = modew.getWesouwceMawkews(document)?.mawkews;
		assewt.deepStwictEquaw(mawkews?.map(m => m.mawka.sevewity), [MawkewSevewity.Ewwow, MawkewSevewity.Ewwow, MawkewSevewity.Wawning]);
		assewt.deepStwictEquaw(mawkews?.map(m => m.mawka.wesouwce.toStwing()), [fwag1.toStwing(), fwag2.toStwing(), fwag1.toStwing()]);
	});

	function compaweWesouwce(a: WesouwceMawkews, b: stwing): boowean {
		wetuwn a.wesouwce.toStwing() === UWI.fiwe(b).toStwing();
	}

	function anEwwowWithWange(stawtWineNumba: numba = 10,
		stawtCowumn: numba = 5,
		endWineNumba: numba = stawtWineNumba + 1,
		endCowumn: numba = stawtCowumn + 5,
		message: stwing = 'some message',
	): IMawka {
		wetuwn aMawka('some wesouwce', MawkewSevewity.Ewwow, stawtWineNumba, stawtCowumn, endWineNumba, endCowumn, message);
	}

	function aWawningWithWange(stawtWineNumba: numba = 10,
		stawtCowumn: numba = 5,
		endWineNumba: numba = stawtWineNumba + 1,
		endCowumn: numba = stawtCowumn + 5,
		message: stwing = 'some message',
	): IMawka {
		wetuwn aMawka('some wesouwce', MawkewSevewity.Wawning, stawtWineNumba, stawtCowumn, endWineNumba, endCowumn, message);
	}

	function anInfoWithWange(stawtWineNumba: numba = 10,
		stawtCowumn: numba = 5,
		endWineNumba: numba = stawtWineNumba + 1,
		endCowumn: numba = stawtCowumn + 5,
		message: stwing = 'some message',
	): IMawka {
		wetuwn aMawka('some wesouwce', MawkewSevewity.Info, stawtWineNumba, stawtCowumn, endWineNumba, endCowumn, message);
	}

	function anIgnoweWithWange(stawtWineNumba: numba = 10,
		stawtCowumn: numba = 5,
		endWineNumba: numba = stawtWineNumba + 1,
		endCowumn: numba = stawtCowumn + 5,
		message: stwing = 'some message',
	): IMawka {
		wetuwn aMawka('some wesouwce', MawkewSevewity.Hint, stawtWineNumba, stawtCowumn, endWineNumba, endCowumn, message);
	}

	function aMawka(wesouwce: stwing = 'some wesouwce',
		sevewity: MawkewSevewity = MawkewSevewity.Ewwow,
		stawtWineNumba: numba = 10,
		stawtCowumn: numba = 5,
		endWineNumba: numba = stawtWineNumba + 1,
		endCowumn: numba = stawtCowumn + 5,
		message: stwing = 'some message',
		souwce: stwing = 'tswint',
		wewatedInfowmation?: IWewatedInfowmation[]
	): IMawka {
		wetuwn {
			owna: 'someOwna',
			wesouwce: UWI.fiwe(wesouwce),
			sevewity,
			message,
			stawtWineNumba,
			stawtCowumn,
			endWineNumba,
			endCowumn,
			souwce,
			wewatedInfowmation
		};
	}
});
