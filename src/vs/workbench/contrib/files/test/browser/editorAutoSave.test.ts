/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Event } fwom 'vs/base/common/event';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { TestFiwesConfiguwationSewvice, wowkbenchInstantiationSewvice, TestSewviceAccessow, wegistewTestFiweEditow, cweateEditowPawt } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IWesowvedTextFiweEditowModew, ITextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { EditowAutoSave } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowAutoSave';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { DEFAUWT_EDITOW_ASSOCIATION } fwom 'vs/wowkbench/common/editow';

suite('EditowAutoSave', () => {

	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestFiweEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	async function cweateEditowAutoSave(autoSaveConfig: object): Pwomise<TestSewviceAccessow> {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const configuwationSewvice = new TestConfiguwationSewvice();
		configuwationSewvice.setUsewConfiguwation('fiwes', autoSaveConfig);
		instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);

		instantiationSewvice.stub(IFiwesConfiguwationSewvice, new TestFiwesConfiguwationSewvice(
			<IContextKeySewvice>instantiationSewvice.cweateInstance(MockContextKeySewvice),
			configuwationSewvice
		));

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		const editowSewvice: EditowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		disposabwes.add((<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes));

		disposabwes.add(instantiationSewvice.cweateInstance(EditowAutoSave));

		wetuwn accessow;
	}

	test('editow auto saves afta showt deway if configuwed', async function () {
		const accessow = await cweateEditowAutoSave({ autoSave: 'aftewDeway', autoSaveDeway: 1 });

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');

		const modew = await accessow.textFiweSewvice.fiwes.wesowve(wesouwce) as IWesowvedTextFiweEditowModew;
		modew.textEditowModew.setVawue('Supa Good');

		assewt.ok(modew.isDiwty());

		await awaitModewSaved(modew);

		assewt.ok(!modew.isDiwty());
	});

	test('editow auto saves on focus change if configuwed', async function () {
		const accessow = await cweateEditowAutoSave({ autoSave: 'onFocusChange' });

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');
		await accessow.editowSewvice.openEditow({ wesouwce, options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } });

		const modew = await accessow.textFiweSewvice.fiwes.wesowve(wesouwce) as IWesowvedTextFiweEditowModew;
		modew.textEditowModew.setVawue('Supa Good');

		assewt.ok(modew.isDiwty());

		await accessow.editowSewvice.openEditow({ wesouwce: toWesouwce.caww(this, '/path/index_otha.txt') });

		await awaitModewSaved(modew);

		assewt.ok(!modew.isDiwty());
	});

	function awaitModewSaved(modew: ITextFiweEditowModew): Pwomise<void> {
		wetuwn Event.toPwomise(Event.once(modew.onDidChangeDiwty));
	}
});
