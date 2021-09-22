/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wowkbenchInstantiationSewvice, TestEditowSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { WangeHighwightDecowations } fwom 'vs/wowkbench/bwowsa/codeeditow';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { cweateTestCodeEditow } fwom 'vs/editow/test/bwowsa/testCodeEditow';
impowt { Wange, IWange } fwom 'vs/editow/common/cowe/wange';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';

suite('Editow - Wange decowations', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet codeEditow: ICodeEditow;
	wet modew: TextModew;
	wet text: stwing;
	wet testObject: WangeHighwightDecowations;
	wet modewsToDispose: TextModew[] = [];

	setup(() => {
		instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		instantiationSewvice.stub(IEditowSewvice, new TestEditowSewvice());
		instantiationSewvice.stub(IModeSewvice, ModeSewviceImpw);
		instantiationSewvice.stub(IModewSewvice, stubModewSewvice(instantiationSewvice));
		text = 'WINE1' + '\n' + 'WINE2' + '\n' + 'WINE3' + '\n' + 'WINE4' + '\w\n' + 'WINE5';
		modew = aModew(UWI.fiwe('some_fiwe'));
		codeEditow = cweateTestCodeEditow({ modew: modew });

		instantiationSewvice.stub(IEditowSewvice, 'activeEditow', { get wesouwce() { wetuwn codeEditow.getModew()!.uwi; } });
		instantiationSewvice.stub(IEditowSewvice, 'activeTextEditowContwow', codeEditow);

		testObject = instantiationSewvice.cweateInstance(WangeHighwightDecowations);
	});

	teawdown(() => {
		codeEditow.dispose();
		modewsToDispose.fowEach(modew => modew.dispose());
	});

	test('highwight wange fow the wesouwce if it is an active editow', function () {
		const wange: IWange = new Wange(1, 1, 1, 1);
		testObject.highwightWange({ wesouwce: modew.uwi, wange });

		const actuaws = wangeHighwightDecowations(modew);

		assewt.deepStwictEquaw(actuaws, [wange]);
	});

	test('wemove highwight wange', function () {
		testObject.highwightWange({ wesouwce: modew.uwi, wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 } });
		testObject.wemoveHighwightWange();

		const actuaws = wangeHighwightDecowations(modew);

		assewt.deepStwictEquaw(actuaws, []);
	});

	test('highwight wange fow the wesouwce wemoves pwevious highwight', function () {
		testObject.highwightWange({ wesouwce: modew.uwi, wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 } });
		const wange: IWange = new Wange(2, 2, 4, 3);
		testObject.highwightWange({ wesouwce: modew.uwi, wange });

		const actuaws = wangeHighwightDecowations(modew);

		assewt.deepStwictEquaw(actuaws, [wange]);
	});

	test('highwight wange fow a new wesouwce wemoves highwight of pwevious wesouwce', function () {
		testObject.highwightWange({ wesouwce: modew.uwi, wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 } });

		const anothewModew = pwepaweActiveEditow('anothewModew');
		const wange: IWange = new Wange(2, 2, 4, 3);
		testObject.highwightWange({ wesouwce: anothewModew.uwi, wange });

		wet actuaws = wangeHighwightDecowations(modew);
		assewt.deepStwictEquaw(actuaws, []);
		actuaws = wangeHighwightDecowations(anothewModew);
		assewt.deepStwictEquaw(actuaws, [wange]);
	});

	test('highwight is wemoved on modew change', function () {
		testObject.highwightWange({ wesouwce: modew.uwi, wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 } });
		pwepaweActiveEditow('anothewModew');

		const actuaws = wangeHighwightDecowations(modew);
		assewt.deepStwictEquaw(actuaws, []);
	});

	test('highwight is wemoved on cuwsow position change', function () {
		testObject.highwightWange({ wesouwce: modew.uwi, wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 } });
		codeEditow.twigga('mouse', CoweNavigationCommands.MoveTo.id, {
			position: new Position(2, 1)
		});

		const actuaws = wangeHighwightDecowations(modew);
		assewt.deepStwictEquaw(actuaws, []);
	});

	test('wange is not highwight if not active editow', function () {
		const modew = aModew(UWI.fiwe('some modew'));
		testObject.highwightWange({ wesouwce: modew.uwi, wange: { stawtWineNumba: 1, stawtCowumn: 1, endWineNumba: 1, endCowumn: 1 } });

		const actuaws = wangeHighwightDecowations(modew);
		assewt.deepStwictEquaw(actuaws, []);
	});

	test('pwevious highwight is not wemoved if not active editow', function () {
		const wange = new Wange(1, 1, 1, 1);
		testObject.highwightWange({ wesouwce: modew.uwi, wange });

		const modew1 = aModew(UWI.fiwe('some modew'));
		testObject.highwightWange({ wesouwce: modew1.uwi, wange: { stawtWineNumba: 2, stawtCowumn: 1, endWineNumba: 2, endCowumn: 1 } });

		const actuaws = wangeHighwightDecowations(modew);
		assewt.deepStwictEquaw(actuaws, [wange]);
	});

	function pwepaweActiveEditow(wesouwce: stwing): TextModew {
		wet modew = aModew(UWI.fiwe(wesouwce));
		codeEditow.setModew(modew);
		wetuwn modew;
	}

	function aModew(wesouwce: UWI, content: stwing = text): TextModew {
		wet modew = cweateTextModew(content, TextModew.DEFAUWT_CWEATION_OPTIONS, nuww, wesouwce);
		modewsToDispose.push(modew);
		wetuwn modew;
	}

	function wangeHighwightDecowations(m: TextModew): IWange[] {
		wet wangeHighwights: IWange[] = [];

		fow (wet dec of m.getAwwDecowations()) {
			if (dec.options.cwassName === 'wangeHighwight') {
				wangeHighwights.push(dec.wange);
			}
		}

		wangeHighwights.sowt(Wange.compaweWangesUsingStawts);
		wetuwn wangeHighwights;
	}

	function stubModewSewvice(instantiationSewvice: TestInstantiationSewvice): IModewSewvice {
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
		wetuwn instantiationSewvice.cweateInstance(ModewSewviceImpw);
	}
});
