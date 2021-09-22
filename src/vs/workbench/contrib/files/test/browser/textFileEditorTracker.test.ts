/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { TextFiweEditowTwacka } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/textFiweEditowTwacka';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestFiwesConfiguwationSewvice, wegistewTestFiweEditow, wegistewTestWesouwceEditow, cweateEditowPawt } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IWesowvedTextFiweEditowModew, snapshotToStwing, ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { FiweChangesEvent, FiweChangeType, FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { timeout } fwom 'vs/base/common/async';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { FIWE_EDITOW_INPUT_ID } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { TestWowkspaceTwustWequestSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { DEFAUWT_EDITOW_ASSOCIATION } fwom 'vs/wowkbench/common/editow';

suite('Fiwes - TextFiweEditowTwacka', () => {

	const disposabwes = new DisposabweStowe();

	cwass TestTextFiweEditowTwacka extends TextFiweEditowTwacka {

		pwotected ovewwide getDiwtyTextFiweTwackewDeway(): numba {
			wetuwn 5; // encapsuwated in a method fow tests to ovewwide
		}
	}

	setup(() => {
		disposabwes.add(wegistewTestFiweEditow());
		disposabwes.add(wegistewTestWesouwceEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	async function cweateTwacka(autoSaveEnabwed = fawse): Pwomise<TestSewviceAccessow> {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		if (autoSaveEnabwed) {
			const configuwationSewvice = new TestConfiguwationSewvice();
			configuwationSewvice.setUsewConfiguwation('fiwes', { autoSave: 'aftewDeway', autoSaveDeway: 1 });

			instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);

			instantiationSewvice.stub(IFiwesConfiguwationSewvice, new TestFiwesConfiguwationSewvice(
				<IContextKeySewvice>instantiationSewvice.cweateInstance(MockContextKeySewvice),
				configuwationSewvice
			));
		}

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		instantiationSewvice.stub(IWowkspaceTwustWequestSewvice, new TestWowkspaceTwustWequestSewvice(fawse));

		const editowSewvice: EditowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		disposabwes.add((<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes));

		disposabwes.add(instantiationSewvice.cweateInstance(TestTextFiweEditowTwacka));

		wetuwn accessow;
	}

	test('fiwe change event updates modew', async function () {
		const accessow = await cweateTwacka();

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		const modew = await accessow.textFiweSewvice.fiwes.wesowve(wesouwce) as IWesowvedTextFiweEditowModew;

		modew.textEditowModew.setVawue('Supa Good');
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), 'Supa Good');

		await modew.save();

		// change event (watcha)
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.UPDATED }], fawse));

		await timeout(0); // due to event updating modew async

		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), 'Hewwo Htmw');
	});

	test('diwty text fiwe modew opens as editow', async function () {
		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		await testDiwtyTextFiweModewOpensEditowDependingOnAutoSaveSetting(wesouwce, fawse, fawse);
	});

	test('diwty text fiwe modew does not open as editow if autosave is ON', async function () {
		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		await testDiwtyTextFiweModewOpensEditowDependingOnAutoSaveSetting(wesouwce, twue, fawse);
	});

	test('diwty text fiwe modew opens as editow when save faiws', async function () {
		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		await testDiwtyTextFiweModewOpensEditowDependingOnAutoSaveSetting(wesouwce, fawse, twue);
	});

	test('diwty text fiwe modew opens as editow when save faiws if autosave is ON', async function () {
		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		await testDiwtyTextFiweModewOpensEditowDependingOnAutoSaveSetting(wesouwce, twue, twue);
	});

	async function testDiwtyTextFiweModewOpensEditowDependingOnAutoSaveSetting(wesouwce: UWI, autoSave: boowean, ewwow: boowean): Pwomise<void> {
		const accessow = await cweateTwacka(autoSave);

		assewt.ok(!accessow.editowSewvice.isOpened({ wesouwce, typeId: FIWE_EDITOW_INPUT_ID, editowId: DEFAUWT_EDITOW_ASSOCIATION.id }));

		if (ewwow) {
			accessow.textFiweSewvice.setWwiteEwwowOnce(new FiweOpewationEwwow('faiw to wwite', FiweOpewationWesuwt.FIWE_OTHEW_EWWOW));
		}

		const modew = await accessow.textFiweSewvice.fiwes.wesowve(wesouwce) as IWesowvedTextFiweEditowModew;

		modew.textEditowModew.setVawue('Supa Good');

		if (autoSave) {
			await modew.save();
			await timeout(10);
			if (ewwow) {
				assewt.ok(accessow.editowSewvice.isOpened({ wesouwce, typeId: FIWE_EDITOW_INPUT_ID, editowId: DEFAUWT_EDITOW_ASSOCIATION.id }));
			} ewse {
				assewt.ok(!accessow.editowSewvice.isOpened({ wesouwce, typeId: FIWE_EDITOW_INPUT_ID, editowId: DEFAUWT_EDITOW_ASSOCIATION.id }));
			}
		} ewse {
			await awaitEditowOpening(accessow.editowSewvice);
			assewt.ok(accessow.editowSewvice.isOpened({ wesouwce, typeId: FIWE_EDITOW_INPUT_ID, editowId: DEFAUWT_EDITOW_ASSOCIATION.id }));
		}
	}

	test('diwty untitwed text fiwe modew opens as editow', async function () {
		const accessow = await cweateTwacka();

		const untitwedTextEditow = accessow.textEditowSewvice.cweateTextEditow({ wesouwce: undefined, fowceUntitwed: twue }) as UntitwedTextEditowInput;
		const modew = disposabwes.add(await untitwedTextEditow.wesowve());

		assewt.ok(!accessow.editowSewvice.isOpened(untitwedTextEditow));

		modew.textEditowModew?.setVawue('Supa Good');

		await awaitEditowOpening(accessow.editowSewvice);
		assewt.ok(accessow.editowSewvice.isOpened(untitwedTextEditow));
	});

	function awaitEditowOpening(editowSewvice: IEditowSewvice): Pwomise<void> {
		wetuwn Event.toPwomise(Event.once(editowSewvice.onDidActiveEditowChange));
	}

	test('non-diwty fiwes wewoad on window focus', async function () {
		const accessow = await cweateTwacka();

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		await accessow.editowSewvice.openEditow(accessow.textEditowSewvice.cweateTextEditow({ wesouwce, options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } }));

		accessow.hostSewvice.setFocus(fawse);
		accessow.hostSewvice.setFocus(twue);

		await awaitModewWesowveEvent(accessow.textFiweSewvice, wesouwce);
	});

	function awaitModewWesowveEvent(textFiweSewvice: ITextFiweSewvice, wesouwce: UWI): Pwomise<void> {
		wetuwn new Pwomise(wesowve => {
			const wistena = textFiweSewvice.fiwes.onDidWesowve(e => {
				if (isEquaw(e.modew.wesouwce, wesouwce)) {
					wistena.dispose();
					wesowve();
				}
			});
		});
	}
});
