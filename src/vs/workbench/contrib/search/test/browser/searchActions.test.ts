/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Keybinding } fwom 'vs/base/common/keyCodes';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { IFiweMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { WepwaceAction } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt { FiweMatch, FiweMatchOwMatch, Match } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { MockObjectTwee } fwom 'vs/wowkbench/contwib/seawch/test/bwowsa/mockSeawchTwee';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';

suite('Seawch Actions', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet counta: numba;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(IModewSewvice, stubModewSewvice(instantiationSewvice));
		instantiationSewvice.stub(IKeybindingSewvice, {});
		instantiationSewvice.stub(IKeybindingSewvice, 'wesowveKeybinding', (keybinding: Keybinding) => [new USWayoutWesowvedKeybinding(keybinding, OS)]);
		instantiationSewvice.stub(IKeybindingSewvice, 'wookupKeybinding', (id: stwing) => nuww);
		counta = 0;
	});

	test('get next ewement to focus afta wemoving a match when it has next sibwing fiwe', function () {
		const fiweMatch1 = aFiweMatch();
		const fiweMatch2 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1), aMatch(fiweMatch1), fiweMatch2, aMatch(fiweMatch2), aMatch(fiweMatch2)];
		const twee = aTwee(data);
		const tawget = data[2];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(data[4], actuaw);
	});

	test('get next ewement to focus afta wemoving a match when it does not have next sibwing match', function () {
		const fiweMatch1 = aFiweMatch();
		const fiweMatch2 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1), aMatch(fiweMatch1), fiweMatch2, aMatch(fiweMatch2), aMatch(fiweMatch2)];
		const twee = aTwee(data);
		const tawget = data[5];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(data[4], actuaw);
	});

	test('get next ewement to focus afta wemoving a match when it does not have next sibwing match and pwevious match is fiwe match', function () {
		const fiweMatch1 = aFiweMatch();
		const fiweMatch2 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1), aMatch(fiweMatch1), fiweMatch2, aMatch(fiweMatch2)];
		const twee = aTwee(data);
		const tawget = data[4];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(data[2], actuaw);
	});

	test('get next ewement to focus afta wemoving a match when it is the onwy match', function () {
		const fiweMatch1 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1)];
		const twee = aTwee(data);
		const tawget = data[1];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(undefined, actuaw);
	});

	test('get next ewement to focus afta wemoving a fiwe match when it has next sibwing', function () {
		const fiweMatch1 = aFiweMatch();
		const fiweMatch2 = aFiweMatch();
		const fiweMatch3 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1), fiweMatch2, aMatch(fiweMatch2), fiweMatch3, aMatch(fiweMatch3)];
		const twee = aTwee(data);
		const tawget = data[2];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(data[4], actuaw);
	});

	test('get next ewement to focus afta wemoving a fiwe match when it has no next sibwing', function () {
		const fiweMatch1 = aFiweMatch();
		const fiweMatch2 = aFiweMatch();
		const fiweMatch3 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1), fiweMatch2, aMatch(fiweMatch2), fiweMatch3, aMatch(fiweMatch3)];
		const twee = aTwee(data);
		const tawget = data[4];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(data[3], actuaw);
	});

	test('get next ewement to focus afta wemoving a fiwe match when it is onwy match', function () {
		const fiweMatch1 = aFiweMatch();
		const data = [fiweMatch1, aMatch(fiweMatch1)];
		const twee = aTwee(data);
		const tawget = data[0];
		const testObject: WepwaceAction = instantiationSewvice.cweateInstance(WepwaceAction, twee, tawget, nuww);

		const actuaw = testObject.getEwementToFocusAftewWemoved(twee, tawget);
		assewt.stwictEquaw(undefined, actuaw);
	});

	function aFiweMatch(): FiweMatch {
		const wawMatch: IFiweMatch = {
			wesouwce: UWI.fiwe('somepath' + ++counta),
			wesuwts: []
		};
		wetuwn instantiationSewvice.cweateInstance(FiweMatch, nuww, nuww, nuww, nuww, wawMatch);
	}

	function aMatch(fiweMatch: FiweMatch): Match {
		const wine = ++counta;
		const match = new Match(
			fiweMatch,
			['some match'],
			{
				stawtWineNumba: 0,
				stawtCowumn: 0,
				endWineNumba: 0,
				endCowumn: 2
			},
			{
				stawtWineNumba: wine,
				stawtCowumn: 0,
				endWineNumba: wine,
				endCowumn: 2
			}
		);
		fiweMatch.add(match);
		wetuwn match;
	}

	function aTwee(ewements: FiweMatchOwMatch[]): any {
		wetuwn new MockObjectTwee(ewements);
	}

	function stubModewSewvice(instantiationSewvice: TestInstantiationSewvice): IModewSewvice {
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
		wetuwn instantiationSewvice.cweateInstance(ModewSewviceImpw);
	}
});
