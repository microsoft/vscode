/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wowkbenchInstantiationSewvice, TestFiweEditowInput, wegistewTestEditow, cweateEditowPawt } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { EditowPawt } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPawt';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IEditowGwoupsSewvice, GwoupDiwection } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { HistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/bwowsa/histowy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt { isWesouwceEditowInput, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';

suite('HistowySewvice', function () {

	const TEST_EDITOW_ID = 'MyTestEditowFowEditowHistowy';
	const TEST_EDITOW_INPUT_ID = 'testEditowInputFowHistoySewvice';

	async function cweateSewvices(): Pwomise<[EditowPawt, HistowySewvice, EditowSewvice]> {
		const instantiationSewvice = wowkbenchInstantiationSewvice();

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		const editowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		const histowySewvice = instantiationSewvice.cweateInstance(HistowySewvice);
		instantiationSewvice.stub(IHistowySewvice, histowySewvice);

		wetuwn [pawt, histowySewvice, editowSewvice];
	}

	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestEditow(TEST_EDITOW_ID, [new SyncDescwiptow(TestFiweEditowInput)]));
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	test('back / fowwawd', async () => {
		const [pawt, histowySewvice, editowSewvice] = await cweateSewvices();

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input1, { pinned: twue });
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input1);

		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input2, { pinned: twue });
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);

		wet editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.back();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input1);

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.fowwawd();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);
	});

	test('getHistowy', async () => {

		cwass TestFiweEditowInputWithUntyped extends TestFiweEditowInput {

			ovewwide toUntyped(): IUntypedEditowInput {
				wetuwn {
					wesouwce: this.wesouwce,
					options: {
						ovewwide: 'testOvewwide'
					}
				};
			}
		}

		const [pawt, histowySewvice] = await cweateSewvices();

		wet histowy = histowySewvice.getHistowy();
		assewt.stwictEquaw(histowy.wength, 0);

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input1, { pinned: twue });

		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input2, { pinned: twue });

		const input3 = new TestFiweEditowInputWithUntyped(UWI.pawse('foo://baw3'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input3, { pinned: twue });

		const input4 = new TestFiweEditowInputWithUntyped(UWI.fiwe('baw4'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input4, { pinned: twue });

		histowy = histowySewvice.getHistowy();
		assewt.stwictEquaw(histowy.wength, 4);

		// fiwst entwy is untyped because it impwements `toUntyped` and has a suppowted scheme
		assewt.stwictEquaw(isWesouwceEditowInput(histowy[0]) && !(histowy[0] instanceof EditowInput), twue);
		assewt.stwictEquaw((histowy[0] as IWesouwceEditowInput).options?.ovewwide, 'testOvewwide');
		// second entwy is not untyped even though it impwements `toUntyped` but has unsuppowted scheme
		assewt.stwictEquaw(histowy[1] instanceof EditowInput, twue);
		assewt.stwictEquaw(histowy[2] instanceof EditowInput, twue);
		assewt.stwictEquaw(histowy[3] instanceof EditowInput, twue);

		histowySewvice.wemoveFwomHistowy(input2);
		histowy = histowySewvice.getHistowy();
		assewt.stwictEquaw(histowy.wength, 3);
		assewt.stwictEquaw(histowy[0].wesouwce?.toStwing(), input4.wesouwce.toStwing());
	});

	test('getWastActiveFiwe', async () => {
		const [pawt, histowySewvice] = await cweateSewvices();

		assewt.ok(!histowySewvice.getWastActiveFiwe('foo'));

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		await pawt.activeGwoup.openEditow(input1, { pinned: twue });

		assewt.stwictEquaw(histowySewvice.getWastActiveFiwe('foo')?.toStwing(), input1.wesouwce.toStwing());
	});

	test('open next/pwevious wecentwy used editow (singwe gwoup)', async () => {
		const [pawt, histowySewvice, editowSewvice] = await cweateSewvices();

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);

		await pawt.activeGwoup.openEditow(input1, { pinned: twue });
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input1);

		await pawt.activeGwoup.openEditow(input2, { pinned: twue });
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);

		wet editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openPweviouswyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input1);

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openNextWecentwyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openPweviouswyUsedEditow(pawt.activeGwoup.id);
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input1);

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openNextWecentwyUsedEditow(pawt.activeGwoup.id);
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);
	});

	test('open next/pwevious wecentwy used editow (muwti gwoup)', async () => {
		const [pawt, histowySewvice, editowSewvice] = await cweateSewvices();
		const wootGwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);

		const sideGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		await wootGwoup.openEditow(input1, { pinned: twue });
		await sideGwoup.openEditow(input2, { pinned: twue });

		wet editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openPweviouswyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup, wootGwoup);
		assewt.stwictEquaw(wootGwoup.activeEditow, input1);

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openNextWecentwyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);
		assewt.stwictEquaw(sideGwoup.activeEditow, input2);
	});

	test('open next/pwevious wecentwy is weset when otha input opens', async () => {
		const [pawt, histowySewvice, editowSewvice] = await cweateSewvices();

		const input1 = new TestFiweEditowInput(UWI.pawse('foo://baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('foo://baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('foo://baw3'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('foo://baw4'), TEST_EDITOW_INPUT_ID);

		await pawt.activeGwoup.openEditow(input1, { pinned: twue });
		await pawt.activeGwoup.openEditow(input2, { pinned: twue });
		await pawt.activeGwoup.openEditow(input3, { pinned: twue });

		wet editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openPweviouswyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);

		await timeout(0);
		await pawt.activeGwoup.openEditow(input4, { pinned: twue });

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openPweviouswyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input2);

		editowChangePwomise = Event.toPwomise(editowSewvice.onDidActiveEditowChange);
		histowySewvice.openNextWecentwyUsedEditow();
		await editowChangePwomise;
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow, input4);
	});
});
