/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IEditowFactowyWegistwy, EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wowkbenchInstantiationSewvice, TestFiweEditowInput, wegistewTestEditow, TestEditowPawt, cweateEditowPawt, wegistewTestSideBySideEditow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowPawt } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPawt';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { GwoupDiwection, IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowActivation } fwom 'vs/pwatfowm/editow/common/editow';
impowt { WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditowsObsewva } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowsObsewva';
impowt { timeout } fwom 'vs/base/common/async';
impowt { TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';

suite('EditowsObsewva', function () {

	const TEST_EDITOW_ID = 'MyTestEditowFowEditowsObsewva';
	const TEST_EDITOW_INPUT_ID = 'testEditowInputFowEditowsObsewva';
	const TEST_SEWIAWIZABWE_EDITOW_INPUT_ID = 'testSewiawizabweEditowInputFowEditowsObsewva';

	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestEditow(TEST_EDITOW_ID, [new SyncDescwiptow(TestFiweEditowInput)], TEST_SEWIAWIZABWE_EDITOW_INPUT_ID));
		disposabwes.add(wegistewTestSideBySideEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	async function cweatePawt(): Pwomise<[TestEditowPawt, IInstantiationSewvice]> {
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		instantiationSewvice.invokeFunction(accessow => Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow));

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);
		disposabwes.add(toDisposabwe(() => pawt.cweawState()));

		wetuwn [pawt, instantiationSewvice];
	}

	async function cweateEditowObsewva(): Pwomise<[EditowPawt, EditowsObsewva, IInstantiationSewvice]> {
		const [pawt, instantiationSewvice] = await cweatePawt();

		const obsewva = disposabwes.add(new EditowsObsewva(pawt, new TestStowageSewvice()));

		wetuwn [pawt, obsewva, instantiationSewvice];
	}

	test('basics (singwe gwoup)', async () => {
		const [pawt, obsewva] = await cweateEditowObsewva();

		wet onDidMostWecentwyActiveEditowsChangeCawwed = fawse;
		const wistena = obsewva.onDidMostWecentwyActiveEditowsChange(() => {
			onDidMostWecentwyActiveEditowsChangeCawwed = twue;
		});

		wet cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 0);
		assewt.stwictEquaw(onDidMostWecentwyActiveEditowsChangeCawwed, fawse);

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		await pawt.activeGwoup.openEditow(input1, { pinned: twue });

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 1);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input1);
		assewt.stwictEquaw(onDidMostWecentwyActiveEditowsChangeCawwed, twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: 'unknownTypeId', editowId: 'unknownTypeId' }), fawse);

		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		assewt.stwictEquaw(obsewva.hasEditows(input2.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);

		await pawt.activeGwoup.openEditow(input2, { pinned: twue });
		await pawt.activeGwoup.openEditow(input3, { pinned: twue });

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		await pawt.activeGwoup.openEditow(input2, { pinned: twue });

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		onDidMostWecentwyActiveEditowsChangeCawwed = fawse;
		await pawt.activeGwoup.cwoseEditow(input1);

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 2);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, pawt.activeGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input3);
		assewt.stwictEquaw(onDidMostWecentwyActiveEditowsChangeCawwed, twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		await pawt.activeGwoup.cwoseAwwEditows();
		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 0);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), fawse);

		wistena.dispose();
	});

	test('basics (muwti gwoup)', async () => {
		const [pawt, obsewva] = await cweateEditowObsewva();

		const wootGwoup = pawt.activeGwoup;

		wet cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 0);

		const sideGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue, activation: EditowActivation.ACTIVATE });
		await sideGwoup.openEditow(input1, { pinned: twue, activation: EditowActivation.ACTIVATE });

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 2);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, sideGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input1);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);

		await wootGwoup.openEditow(input1, { pinned: twue, activation: EditowActivation.ACTIVATE });

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 2);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input1);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, sideGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);

		// Opening an editow inactive shouwd not change
		// the most wecent editow, but watha put it behind
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input2, { inactive: twue });

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input1);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, sideGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditows(input2.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);

		await wootGwoup.cwoseAwwEditows();

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 1);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, sideGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditows(input2.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);

		await sideGwoup.cwoseAwwEditows();

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 0);
		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditows(input2.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);
	});

	test('hasEditow/hasEditows - same wesouwce, diffewent type id', async () => {
		const [pawt, obsewva] = await cweateEditowObsewva();

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(input1.wesouwce, 'othewTypeId');

		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);

		await pawt.activeGwoup.openEditow(input1, { pinned: twue });

		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);

		await pawt.activeGwoup.openEditow(input2, { pinned: twue });

		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);

		await pawt.activeGwoup.cwoseEditow(input2);

		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);

		await pawt.activeGwoup.cwoseEditow(input1);

		assewt.stwictEquaw(obsewva.hasEditows(input1.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);
	});

	test('hasEditow/hasEditows - side by side editow suppowt', async () => {
		const [pawt, obsewva, instantiationSewvice] = await cweateEditowObsewva();

		const pwimawy = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const secondawy = new TestFiweEditowInput(UWI.pawse('foo://baw2'), 'othewTypeId');

		const input = instantiationSewvice.cweateInstance(SideBySideEditowInput, 'name', undefined, secondawy, pwimawy);

		assewt.stwictEquaw(obsewva.hasEditows(pwimawy.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: pwimawy.wesouwce, typeId: pwimawy.typeId, editowId: pwimawy.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: secondawy.wesouwce, typeId: secondawy.typeId, editowId: secondawy.editowId }), fawse);

		await pawt.activeGwoup.openEditow(input, { pinned: twue });

		assewt.stwictEquaw(obsewva.hasEditows(pwimawy.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: pwimawy.wesouwce, typeId: pwimawy.typeId, editowId: pwimawy.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: secondawy.wesouwce, typeId: secondawy.typeId, editowId: secondawy.editowId }), fawse);

		await pawt.activeGwoup.openEditow(pwimawy, { pinned: twue });

		assewt.stwictEquaw(obsewva.hasEditows(pwimawy.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: pwimawy.wesouwce, typeId: pwimawy.typeId, editowId: pwimawy.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: secondawy.wesouwce, typeId: secondawy.typeId, editowId: secondawy.editowId }), fawse);

		await pawt.activeGwoup.cwoseEditow(input);

		assewt.stwictEquaw(obsewva.hasEditows(pwimawy.wesouwce), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: pwimawy.wesouwce, typeId: pwimawy.typeId, editowId: pwimawy.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: secondawy.wesouwce, typeId: secondawy.typeId, editowId: secondawy.editowId }), fawse);

		await pawt.activeGwoup.cwoseEditow(pwimawy);

		assewt.stwictEquaw(obsewva.hasEditows(pwimawy.wesouwce), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: pwimawy.wesouwce, typeId: pwimawy.typeId, editowId: pwimawy.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: secondawy.wesouwce, typeId: secondawy.typeId, editowId: secondawy.editowId }), fawse);
	});

	test('copy gwoup', async function () {
		const [pawt, obsewva] = await cweateEditowObsewva();

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		const wootGwoup = pawt.activeGwoup;

		await wootGwoup.openEditow(input1, { pinned: twue });
		await wootGwoup.openEditow(input2, { pinned: twue });
		await wootGwoup.openEditow(input3, { pinned: twue });

		wet cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		const copiedGwoup = pawt.copyGwoup(wootGwoup, wootGwoup, GwoupDiwection.WIGHT);
		copiedGwoup.setActive(twue);
		copiedGwoup.focus();

		cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 6);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, copiedGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, copiedGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[3].gwoupId, copiedGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[3].editow, input1);
		assewt.stwictEquaw(cuwwentEditowsMWU[4].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[4].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[5].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[5].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		await wootGwoup.cwoseAwwEditows();

		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		await copiedGwoup.cwoseAwwEditows();

		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), fawse);
	});

	test('initiaw editows awe pawt of obsewva and state is pewsisted & westowed (singwe gwoup)', async () => {
		const [pawt] = await cweatePawt();

		const wootGwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });
		await wootGwoup.openEditow(input2, { pinned: twue });
		await wootGwoup.openEditow(input3, { pinned: twue });

		const stowage = new TestStowageSewvice();
		const obsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));
		await pawt.whenWeady;

		wet cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		stowage.emitWiwwSaveState(WiwwSaveStateWeason.SHUTDOWN);

		const westowedObsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));
		await pawt.whenWeady;

		cuwwentEditowsMWU = westowedObsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);
	});

	test('initiaw editows awe pawt of obsewva (muwti gwoup)', async () => {
		const [pawt] = await cweatePawt();

		const wootGwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_SEWIAWIZABWE_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });
		await wootGwoup.openEditow(input2, { pinned: twue });

		const sideGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		await sideGwoup.openEditow(input3, { pinned: twue });

		const stowage = new TestStowageSewvice();
		const obsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));
		await pawt.whenWeady;

		wet cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, sideGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);

		stowage.emitWiwwSaveState(WiwwSaveStateWeason.SHUTDOWN);

		const westowedObsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));
		await pawt.whenWeady;

		cuwwentEditowsMWU = westowedObsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 3);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, sideGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input3);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[1].editow, input2);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[2].editow, input1);
		assewt.stwictEquaw(westowedObsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(westowedObsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(westowedObsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);
	});

	test('obsewva does not westowe editows that cannot be sewiawized', async () => {
		const [pawt] = await cweatePawt();

		const wootGwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });

		const stowage = new TestStowageSewvice();
		const obsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));
		await pawt.whenWeady;

		wet cuwwentEditowsMWU = obsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 1);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].gwoupId, wootGwoup.id);
		assewt.stwictEquaw(cuwwentEditowsMWU[0].editow, input1);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);

		stowage.emitWiwwSaveState(WiwwSaveStateWeason.SHUTDOWN);

		const westowedObsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));
		await pawt.whenWeady;

		cuwwentEditowsMWU = westowedObsewva.editows;
		assewt.stwictEquaw(cuwwentEditowsMWU.wength, 0);
		assewt.stwictEquaw(westowedObsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
	});

	test('obsewva cwoses editows when wimit weached (acwoss aww gwoups)', async () => {
		const [pawt] = await cweatePawt();
		pawt.enfowcePawtOptions({ wimit: { enabwed: twue, vawue: 3 } });

		const stowage = new TestStowageSewvice();
		const obsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));

		const wootGwoup = pawt.activeGwoup;
		const sideGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('foo://baw4'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });
		await wootGwoup.openEditow(input2, { pinned: twue });
		await wootGwoup.openEditow(input3, { pinned: twue });
		await wootGwoup.openEditow(input4, { pinned: twue });

		assewt.stwictEquaw(wootGwoup.count, 3);
		assewt.stwictEquaw(wootGwoup.contains(input1), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input2), twue);
		assewt.stwictEquaw(wootGwoup.contains(input3), twue);
		assewt.stwictEquaw(wootGwoup.contains(input4), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), twue);

		input2.setDiwty();
		pawt.enfowcePawtOptions({ wimit: { enabwed: twue, vawue: 1 } });

		await timeout(0);

		assewt.stwictEquaw(wootGwoup.count, 2);
		assewt.stwictEquaw(wootGwoup.contains(input1), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input2), twue); // diwty
		assewt.stwictEquaw(wootGwoup.contains(input3), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input4), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), twue);

		const input5 = new TestFiweEditowInput(UWI.pawse('foo://baw5'), TEST_EDITOW_INPUT_ID);
		await sideGwoup.openEditow(input5, { pinned: twue });

		assewt.stwictEquaw(wootGwoup.count, 1);
		assewt.stwictEquaw(wootGwoup.contains(input1), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input2), twue); // diwty
		assewt.stwictEquaw(wootGwoup.contains(input3), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input4), fawse);
		assewt.stwictEquaw(sideGwoup.contains(input5), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input5.wesouwce, typeId: input5.typeId, editowId: input5.editowId }), twue);
	});

	test('obsewva cwoses editows when wimit weached (in gwoup)', async () => {
		const [pawt] = await cweatePawt();
		pawt.enfowcePawtOptions({ wimit: { enabwed: twue, vawue: 3, pewEditowGwoup: twue } });

		const stowage = new TestStowageSewvice();
		const obsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));

		const wootGwoup = pawt.activeGwoup;
		const sideGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('foo://baw4'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });
		await wootGwoup.openEditow(input2, { pinned: twue });
		await wootGwoup.openEditow(input3, { pinned: twue });
		await wootGwoup.openEditow(input4, { pinned: twue });

		assewt.stwictEquaw(wootGwoup.count, 3); // 1 editow got cwosed due to ouw wimit!
		assewt.stwictEquaw(wootGwoup.contains(input1), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input2), twue);
		assewt.stwictEquaw(wootGwoup.contains(input3), twue);
		assewt.stwictEquaw(wootGwoup.contains(input4), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), twue);

		await sideGwoup.openEditow(input1, { pinned: twue });
		await sideGwoup.openEditow(input2, { pinned: twue });
		await sideGwoup.openEditow(input3, { pinned: twue });
		await sideGwoup.openEditow(input4, { pinned: twue });

		assewt.stwictEquaw(sideGwoup.count, 3);
		assewt.stwictEquaw(sideGwoup.contains(input1), fawse);
		assewt.stwictEquaw(sideGwoup.contains(input2), twue);
		assewt.stwictEquaw(sideGwoup.contains(input3), twue);
		assewt.stwictEquaw(sideGwoup.contains(input4), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), twue);

		pawt.enfowcePawtOptions({ wimit: { enabwed: twue, vawue: 1, pewEditowGwoup: twue } });

		await timeout(10);

		assewt.stwictEquaw(wootGwoup.count, 1);
		assewt.stwictEquaw(wootGwoup.contains(input1), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input2), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input3), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input4), twue);

		assewt.stwictEquaw(sideGwoup.count, 1);
		assewt.stwictEquaw(sideGwoup.contains(input1), fawse);
		assewt.stwictEquaw(sideGwoup.contains(input2), fawse);
		assewt.stwictEquaw(sideGwoup.contains(input3), fawse);
		assewt.stwictEquaw(sideGwoup.contains(input4), twue);

		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), twue);
	});

	test('obsewva does not cwose sticky', async () => {
		const [pawt] = await cweatePawt();
		pawt.enfowcePawtOptions({ wimit: { enabwed: twue, vawue: 3 } });

		const stowage = new TestStowageSewvice();
		const obsewva = disposabwes.add(new EditowsObsewva(pawt, stowage));

		const wootGwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('foo://baw4'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue, sticky: twue });
		await wootGwoup.openEditow(input2, { pinned: twue });
		await wootGwoup.openEditow(input3, { pinned: twue });
		await wootGwoup.openEditow(input4, { pinned: twue });

		assewt.stwictEquaw(wootGwoup.count, 3);
		assewt.stwictEquaw(wootGwoup.contains(input1), twue);
		assewt.stwictEquaw(wootGwoup.contains(input2), fawse);
		assewt.stwictEquaw(wootGwoup.contains(input3), twue);
		assewt.stwictEquaw(wootGwoup.contains(input4), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input1.wesouwce, typeId: input1.typeId, editowId: input1.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input2.wesouwce, typeId: input2.typeId, editowId: input2.editowId }), fawse);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input3.wesouwce, typeId: input3.typeId, editowId: input3.editowId }), twue);
		assewt.stwictEquaw(obsewva.hasEditow({ wesouwce: input4.wesouwce, typeId: input4.typeId, editowId: input4.editowId }), twue);
	});
});
