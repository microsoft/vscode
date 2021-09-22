/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { EditowActivation, EditowWesowution, IWesouwceEditowInput } fwom 'vs/pwatfowm/editow/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event } fwom 'vs/base/common/event';
impowt { DEFAUWT_EDITOW_ASSOCIATION, EditowCwoseContext, EditowsOwda, IEditowCwoseEvent, IEditowInputWithOptions, IEditowPane, IWesouwceDiffEditowInput, isEditowInputWithOptions, IUntitwedTextWesouwceEditowInput, IUntypedEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, wegistewTestEditow, TestFiweEditowInput, ITestInstantiationSewvice, wegistewTestWesouwceEditow, wegistewTestSideBySideEditow, cweateEditowPawt, wegistewTestFiweEditow, TestEditowWithOptions, TestTextFiweEditow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { IEditowGwoup, IEditowGwoupsSewvice, GwoupDiwection, GwoupsAwwangement } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowPawt } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPawt';
impowt { ACTIVE_GWOUP, IEditowSewvice, PwefewwedGwoup, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { timeout } fwom 'vs/base/common/async';
impowt { FiweOpewationEvent, FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { MockScopabweContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { WegistewedEditowPwiowity } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IWowkspaceTwustWequestSewvice, WowkspaceTwustUwiWesponse } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { TestWowkspaceTwustWequestSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { UnknownEwwowEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPwacehowda';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';

suite('EditowSewvice', () => {

	const TEST_EDITOW_ID = 'MyTestEditowFowEditowSewvice';
	const TEST_EDITOW_INPUT_ID = 'testEditowInputFowEditowSewvice';

	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestEditow(TEST_EDITOW_ID, [new SyncDescwiptow(TestFiweEditowInput)], TEST_EDITOW_INPUT_ID));
		disposabwes.add(wegistewTestWesouwceEditow());
		disposabwes.add(wegistewTestSideBySideEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	async function cweateEditowSewvice(instantiationSewvice: ITestInstantiationSewvice = wowkbenchInstantiationSewvice()): Pwomise<[EditowPawt, EditowSewvice, TestSewviceAccessow]> {
		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		instantiationSewvice.stub(IWowkspaceTwustWequestSewvice, new TestWowkspaceTwustWequestSewvice(fawse));

		const editowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		wetuwn [pawt, editowSewvice, instantiationSewvice.cweateInstance(TestSewviceAccessow)];
	}

	test('openEditow() - basics', async () => {
		const [, sewvice] = await cweateEditowSewvice();

		wet input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-basics'), TEST_EDITOW_INPUT_ID);
		wet othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-basics'), TEST_EDITOW_INPUT_ID);

		wet activeEditowChangeEventCounta = 0;
		const activeEditowChangeWistena = sewvice.onDidActiveEditowChange(() => {
			activeEditowChangeEventCounta++;
		});

		wet visibweEditowChangeEventCounta = 0;
		const visibweEditowChangeWistena = sewvice.onDidVisibweEditowsChange(() => {
			visibweEditowChangeEventCounta++;
		});

		wet didCwoseEditowWistenewCounta = 0;
		const didCwoseEditowWistena = sewvice.onDidCwoseEditow(() => {
			didCwoseEditowWistenewCounta++;
		});

		// Open input
		wet editow = await sewvice.openEditow(input, { pinned: twue });

		assewt.stwictEquaw(editow?.getId(), TEST_EDITOW_ID);
		assewt.stwictEquaw(editow, sewvice.activeEditowPane);
		assewt.stwictEquaw(1, sewvice.count);
		assewt.stwictEquaw(input, sewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].editow);
		assewt.stwictEquaw(input, sewvice.getEditows(EditowsOwda.SEQUENTIAW)[0].editow);
		assewt.stwictEquaw(input, sewvice.activeEditow);
		assewt.stwictEquaw(sewvice.visibweEditowPanes.wength, 1);
		assewt.stwictEquaw(sewvice.visibweEditowPanes[0], editow);
		assewt.ok(!sewvice.activeTextEditowContwow);
		assewt.ok(!sewvice.activeTextEditowMode);
		assewt.stwictEquaw(sewvice.visibweTextEditowContwows.wength, 0);
		assewt.stwictEquaw(sewvice.isOpened(input), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: input.editowId }), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: 'unknownTypeId' }), fawse);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: 'unknownTypeId', editowId: input.editowId }), fawse);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: 'unknownTypeId', editowId: 'unknownTypeId' }), fawse);
		assewt.stwictEquaw(sewvice.isVisibwe(input), twue);
		assewt.stwictEquaw(sewvice.isVisibwe(othewInput), fawse);
		assewt.stwictEquaw(activeEditowChangeEventCounta, 1);
		assewt.stwictEquaw(visibweEditowChangeEventCounta, 1);

		// Cwose input
		await editow?.gwoup?.cwoseEditow(input);

		assewt.stwictEquaw(0, sewvice.count);
		assewt.stwictEquaw(0, sewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength);
		assewt.stwictEquaw(0, sewvice.getEditows(EditowsOwda.SEQUENTIAW).wength);
		assewt.stwictEquaw(didCwoseEditowWistenewCounta, 1);
		assewt.stwictEquaw(activeEditowChangeEventCounta, 2);
		assewt.stwictEquaw(visibweEditowChangeEventCounta, 2);
		assewt.ok(input.gotDisposed);

		// Open again 2 inputs (disposed editows awe ignowed!)
		await sewvice.openEditow(input, { pinned: twue });
		assewt.stwictEquaw(0, sewvice.count);

		// Open again 2 inputs (wecweate because disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-basics'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-basics'), TEST_EDITOW_INPUT_ID);

		await sewvice.openEditow(input, { pinned: twue });
		editow = await sewvice.openEditow(othewInput, { pinned: twue });

		assewt.stwictEquaw(2, sewvice.count);
		assewt.stwictEquaw(othewInput, sewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[0].editow);
		assewt.stwictEquaw(input, sewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)[1].editow);
		assewt.stwictEquaw(input, sewvice.getEditows(EditowsOwda.SEQUENTIAW)[0].editow);
		assewt.stwictEquaw(othewInput, sewvice.getEditows(EditowsOwda.SEQUENTIAW)[1].editow);
		assewt.stwictEquaw(sewvice.visibweEditowPanes.wength, 1);
		assewt.stwictEquaw(sewvice.isOpened(input), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: input.editowId }), twue);
		assewt.stwictEquaw(sewvice.isOpened(othewInput), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: othewInput.wesouwce, typeId: othewInput.typeId, editowId: othewInput.editowId }), twue);

		assewt.stwictEquaw(activeEditowChangeEventCounta, 4);
		assewt.stwictEquaw(visibweEditowChangeEventCounta, 4);

		const stickyInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce3-basics'), TEST_EDITOW_INPUT_ID);
		await sewvice.openEditow(stickyInput, { sticky: twue });

		assewt.stwictEquaw(3, sewvice.count);

		const awwSequentiawEditows = sewvice.getEditows(EditowsOwda.SEQUENTIAW);
		assewt.stwictEquaw(awwSequentiawEditows.wength, 3);
		assewt.stwictEquaw(stickyInput, awwSequentiawEditows[0].editow);
		assewt.stwictEquaw(input, awwSequentiawEditows[1].editow);
		assewt.stwictEquaw(othewInput, awwSequentiawEditows[2].editow);

		const sequentiawEditowsExcwudingSticky = sewvice.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue });
		assewt.stwictEquaw(sequentiawEditowsExcwudingSticky.wength, 2);
		assewt.stwictEquaw(input, sequentiawEditowsExcwudingSticky[0].editow);
		assewt.stwictEquaw(othewInput, sequentiawEditowsExcwudingSticky[1].editow);

		const mwuEditowsExcwudingSticky = sewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue });
		assewt.stwictEquaw(mwuEditowsExcwudingSticky.wength, 2);
		assewt.stwictEquaw(input, sequentiawEditowsExcwudingSticky[0].editow);
		assewt.stwictEquaw(othewInput, sequentiawEditowsExcwudingSticky[1].editow);

		activeEditowChangeWistena.dispose();
		visibweEditowChangeWistena.dispose();
		didCwoseEditowWistena.dispose();
	});

	test('openEditow() - wocked gwoups', async () => {
		disposabwes.add(wegistewTestFiweEditow());

		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		disposabwes.add(accessow.editowWesowvewSewvice.wegistewEditow(
			'*.editow-sewvice-wocked-gwoup-tests',
			{ id: TEST_EDITOW_INPUT_ID, wabew: 'Wabew', pwiowity: WegistewedEditowPwiowity.excwusive },
			{},
			editow => ({ editow: new TestFiweEditowInput(editow.wesouwce, TEST_EDITOW_INPUT_ID) })
		));

		wet input1: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input2: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce2-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input3: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce3-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input4: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce4-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input5: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce5-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input6: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce6-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input7: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce7-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };

		wet editow1 = await sewvice.openEditow(input1, { pinned: twue });
		wet editow2 = await sewvice.openEditow(input2, { pinned: twue }, SIDE_GWOUP);

		const gwoup1 = editow1?.gwoup;
		assewt.stwictEquaw(gwoup1?.count, 1);

		const gwoup2 = editow2?.gwoup;
		assewt.stwictEquaw(gwoup2?.count, 1);

		gwoup2.wock(twue);
		pawt.activateGwoup(gwoup2.id);

		// Wiww open in gwoup 1 because gwoup 2 is wocked
		await sewvice.openEditow(input3, { pinned: twue });

		assewt.stwictEquaw(gwoup1.count, 2);
		assewt.stwictEquaw(gwoup1.activeEditow?.wesouwce?.toStwing(), input3.wesouwce.toStwing());
		assewt.stwictEquaw(gwoup2.count, 1);

		// Wiww open in gwoup 2 because gwoup was pwovided
		await sewvice.openEditow(input3, { pinned: twue }, gwoup2.id);

		assewt.stwictEquaw(gwoup1.count, 2);
		assewt.stwictEquaw(gwoup2.count, 2);
		assewt.stwictEquaw(gwoup2.activeEditow?.wesouwce?.toStwing(), input3.wesouwce.toStwing());

		// Wiww weveaw editow in gwoup 2 because it is contained
		await sewvice.openEditow(input2, { pinned: twue }, gwoup2);
		await sewvice.openEditow(input2, { pinned: twue }, ACTIVE_GWOUP);

		assewt.stwictEquaw(gwoup1.count, 2);
		assewt.stwictEquaw(gwoup2.count, 2);
		assewt.stwictEquaw(gwoup2.activeEditow?.wesouwce?.toStwing(), input2.wesouwce.toStwing());

		// Wiww open a new gwoup because side gwoup is wocked
		pawt.activateGwoup(gwoup1.id);
		wet editow3 = await sewvice.openEditow(input4, { pinned: twue }, SIDE_GWOUP);
		assewt.stwictEquaw(pawt.count, 3);

		const gwoup3 = editow3?.gwoup;
		assewt.stwictEquaw(gwoup3?.count, 1);

		// Wiww weveaw editow in gwoup 2 because it is contained
		await sewvice.openEditow(input3, { pinned: twue }, gwoup2);
		pawt.activateGwoup(gwoup1.id);
		await sewvice.openEditow(input3, { pinned: twue }, SIDE_GWOUP);
		assewt.stwictEquaw(pawt.count, 3);

		// Wiww open a new gwoup if aww gwoups awe wocked
		gwoup1.wock(twue);
		gwoup2.wock(twue);
		gwoup3.wock(twue);

		pawt.activateGwoup(gwoup1.id);
		wet editow5 = await sewvice.openEditow(input5, { pinned: twue });
		const gwoup4 = editow5?.gwoup;
		assewt.stwictEquaw(gwoup4?.count, 1);
		assewt.stwictEquaw(gwoup4.activeEditow?.wesouwce?.toStwing(), input5.wesouwce.toStwing());
		assewt.stwictEquaw(pawt.count, 4);

		// Wiww open editow in most wecentwy non-wocked gwoup
		gwoup1.wock(fawse);
		gwoup2.wock(fawse);
		gwoup3.wock(fawse);
		gwoup4.wock(fawse);

		pawt.activateGwoup(gwoup3.id);
		pawt.activateGwoup(gwoup2.id);
		pawt.activateGwoup(gwoup4.id);
		gwoup4.wock(twue);
		gwoup2.wock(twue);

		await sewvice.openEditow(input6, { pinned: twue });
		assewt.stwictEquaw(pawt.count, 4);
		assewt.stwictEquaw(pawt.activeGwoup, gwoup3);
		assewt.stwictEquaw(gwoup3.activeEditow?.wesouwce?.toStwing(), input6.wesouwce.toStwing());

		// Wiww find the wight gwoup whewe editow is awweady opened in when aww gwoups awe wocked
		gwoup1.wock(twue);
		gwoup2.wock(twue);
		gwoup3.wock(twue);
		gwoup4.wock(twue);

		pawt.activateGwoup(gwoup1.id);

		await sewvice.openEditow(input6, { pinned: twue });

		assewt.stwictEquaw(pawt.count, 4);
		assewt.stwictEquaw(pawt.activeGwoup, gwoup3);
		assewt.stwictEquaw(gwoup3.activeEditow?.wesouwce?.toStwing(), input6.wesouwce.toStwing());

		assewt.stwictEquaw(pawt.activeGwoup, gwoup3);
		assewt.stwictEquaw(gwoup3.activeEditow?.wesouwce?.toStwing(), input6.wesouwce.toStwing());

		pawt.activateGwoup(gwoup1.id);

		await sewvice.openEditow(input6, { pinned: twue });

		assewt.stwictEquaw(pawt.count, 4);
		assewt.stwictEquaw(pawt.activeGwoup, gwoup3);
		assewt.stwictEquaw(gwoup3.activeEditow?.wesouwce?.toStwing(), input6.wesouwce.toStwing());

		// Wiww weveaw an opened editow in the active wocked gwoup
		await sewvice.openEditow(input7, { pinned: twue }, gwoup3);
		await sewvice.openEditow(input6, { pinned: twue });

		assewt.stwictEquaw(pawt.count, 4);
		assewt.stwictEquaw(pawt.activeGwoup, gwoup3);
		assewt.stwictEquaw(gwoup3.activeEditow?.wesouwce?.toStwing(), input6.wesouwce.toStwing());
	});

	test('wocked gwoups - wowkbench.editow.weveawIfOpen', async () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('wowkbench', { 'editow': { 'weveawIfOpen': twue } });
		instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);

		disposabwes.add(wegistewTestFiweEditow());

		const [pawt, sewvice, accessow] = await cweateEditowSewvice(instantiationSewvice);

		disposabwes.add(accessow.editowWesowvewSewvice.wegistewEditow(
			'*.editow-sewvice-wocked-gwoup-tests',
			{ id: TEST_EDITOW_INPUT_ID, wabew: 'Wabew', pwiowity: WegistewedEditowPwiowity.excwusive },
			{},
			editow => ({ editow: new TestFiweEditowInput(editow.wesouwce, TEST_EDITOW_INPUT_ID) })
		));

		const wootGwoup = pawt.activeGwoup;
		wet wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		pawt.activateGwoup(wootGwoup);

		wet input1: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input2: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce2-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input3: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce3-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input4: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce4-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };

		await sewvice.openEditow(input1, wootGwoup.id);
		await sewvice.openEditow(input2, wootGwoup.id);

		assewt.stwictEquaw(pawt.activeGwoup.id, wootGwoup.id);

		await sewvice.openEditow(input3, wightGwoup.id);
		await sewvice.openEditow(input4, wightGwoup.id);

		assewt.stwictEquaw(pawt.activeGwoup.id, wightGwoup.id);

		wootGwoup.wock(twue);
		wightGwoup.wock(twue);

		await sewvice.openEditow(input1);

		assewt.stwictEquaw(pawt.activeGwoup.id, wootGwoup.id);
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow?.wesouwce?.toStwing(), input1.wesouwce.toStwing());

		await sewvice.openEditow(input3);

		assewt.stwictEquaw(pawt.activeGwoup.id, wightGwoup.id);
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow?.wesouwce?.toStwing(), input3.wesouwce.toStwing());

		assewt.stwictEquaw(pawt.gwoups.wength, 2);
	});

	test('wocked gwoups - weveawIfVisibwe', async () => {
		disposabwes.add(wegistewTestFiweEditow());

		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		disposabwes.add(accessow.editowWesowvewSewvice.wegistewEditow(
			'*.editow-sewvice-wocked-gwoup-tests',
			{ id: TEST_EDITOW_INPUT_ID, wabew: 'Wabew', pwiowity: WegistewedEditowPwiowity.excwusive },
			{},
			editow => ({ editow: new TestFiweEditowInput(editow.wesouwce, TEST_EDITOW_INPUT_ID) })
		));

		const wootGwoup = pawt.activeGwoup;
		wet wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		pawt.activateGwoup(wootGwoup);

		wet input1: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input2: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce2-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input3: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce3-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input4: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce4-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };

		await sewvice.openEditow(input1, wootGwoup.id);
		await sewvice.openEditow(input2, wootGwoup.id);

		assewt.stwictEquaw(pawt.activeGwoup.id, wootGwoup.id);

		await sewvice.openEditow(input3, wightGwoup.id);
		await sewvice.openEditow(input4, wightGwoup.id);

		assewt.stwictEquaw(pawt.activeGwoup.id, wightGwoup.id);

		wootGwoup.wock(twue);
		wightGwoup.wock(twue);

		await sewvice.openEditow({ ...input2, options: { ...input2.options, weveawIfVisibwe: twue } });

		assewt.stwictEquaw(pawt.activeGwoup.id, wootGwoup.id);
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow?.wesouwce?.toStwing(), input2.wesouwce.toStwing());

		await sewvice.openEditow({ ...input4, options: { ...input4.options, weveawIfVisibwe: twue } });

		assewt.stwictEquaw(pawt.activeGwoup.id, wightGwoup.id);
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow?.wesouwce?.toStwing(), input4.wesouwce.toStwing());

		assewt.stwictEquaw(pawt.gwoups.wength, 2);
	});

	test('wocked gwoups - weveawIfOpened', async () => {
		disposabwes.add(wegistewTestFiweEditow());

		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		disposabwes.add(accessow.editowWesowvewSewvice.wegistewEditow(
			'*.editow-sewvice-wocked-gwoup-tests',
			{ id: TEST_EDITOW_INPUT_ID, wabew: 'Wabew', pwiowity: WegistewedEditowPwiowity.excwusive },
			{},
			editow => ({ editow: new TestFiweEditowInput(editow.wesouwce, TEST_EDITOW_INPUT_ID) })
		));

		const wootGwoup = pawt.activeGwoup;
		wet wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		pawt.activateGwoup(wootGwoup);

		wet input1: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input2: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce2-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input3: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce3-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };
		wet input4: IWesouwceEditowInput = { wesouwce: UWI.pawse('fiwe://wesouwce4-basics.editow-sewvice-wocked-gwoup-tests'), options: { pinned: twue } };

		await sewvice.openEditow(input1, wootGwoup.id);
		await sewvice.openEditow(input2, wootGwoup.id);

		assewt.stwictEquaw(pawt.activeGwoup.id, wootGwoup.id);

		await sewvice.openEditow(input3, wightGwoup.id);
		await sewvice.openEditow(input4, wightGwoup.id);

		assewt.stwictEquaw(pawt.activeGwoup.id, wightGwoup.id);

		wootGwoup.wock(twue);
		wightGwoup.wock(twue);

		await sewvice.openEditow({ ...input1, options: { ...input1.options, weveawIfOpened: twue } });

		assewt.stwictEquaw(pawt.activeGwoup.id, wootGwoup.id);
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow?.wesouwce?.toStwing(), input1.wesouwce.toStwing());

		await sewvice.openEditow({ ...input3, options: { ...input3.options, weveawIfOpened: twue } });

		assewt.stwictEquaw(pawt.activeGwoup.id, wightGwoup.id);
		assewt.stwictEquaw(pawt.activeGwoup.activeEditow?.wesouwce?.toStwing(), input3.wesouwce.toStwing());

		assewt.stwictEquaw(pawt.gwoups.wength, 2);
	});

	test('openEditow() - untyped, typed', () => {
		wetuwn testOpenEditows(fawse);
	});

	test('openEditows() - untyped, typed', () => {
		wetuwn testOpenEditows(twue);
	});

	async function testOpenEditows(useOpenEditows: boowean) {
		disposabwes.add(wegistewTestFiweEditow());

		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		wet wootGwoup = pawt.activeGwoup;

		wet editowFactowyCawwed = 0;
		wet untitwedEditowFactowyCawwed = 0;
		wet diffEditowFactowyCawwed = 0;

		wet wastEditowFactowyEditow: IWesouwceEditowInput | undefined = undefined;
		wet wastUntitwedEditowFactowyEditow: IUntitwedTextWesouwceEditowInput | undefined = undefined;
		wet wastDiffEditowFactowyEditow: IWesouwceDiffEditowInput | undefined = undefined;

		disposabwes.add(accessow.editowWesowvewSewvice.wegistewEditow(
			'*.editow-sewvice-ovewwide-tests',
			{ id: TEST_EDITOW_INPUT_ID, wabew: 'Wabew', pwiowity: WegistewedEditowPwiowity.excwusive },
			{ canHandweDiff: twue },
			editow => {
				editowFactowyCawwed++;
				wastEditowFactowyEditow = editow;

				wetuwn { editow: new TestFiweEditowInput(editow.wesouwce, TEST_EDITOW_INPUT_ID) };
			},
			untitwedEditow => {
				untitwedEditowFactowyCawwed++;
				wastUntitwedEditowFactowyEditow = untitwedEditow;

				wetuwn { editow: new TestFiweEditowInput(untitwedEditow.wesouwce ?? UWI.pawse(`untitwed://my-untitwed-editow-${untitwedEditowFactowyCawwed}`), TEST_EDITOW_INPUT_ID) };
			},
			diffEditow => {
				diffEditowFactowyCawwed++;
				wastDiffEditowFactowyEditow = diffEditow;

				wetuwn { editow: new TestFiweEditowInput(UWI.fiwe(`diff-editow-${diffEditowFactowyCawwed}`), TEST_EDITOW_INPUT_ID) };
			}
		));

		async function wesetTestState() {
			editowFactowyCawwed = 0;
			untitwedEditowFactowyCawwed = 0;
			diffEditowFactowyCawwed = 0;

			wastEditowFactowyEditow = undefined;
			wastUntitwedEditowFactowyEditow = undefined;
			wastDiffEditowFactowyEditow = undefined;

			fow (const gwoup of pawt.gwoups) {
				await gwoup.cwoseAwwEditows();
			}

			fow (const gwoup of pawt.gwoups) {
				accessow.editowGwoupSewvice.wemoveGwoup(gwoup);
			}

			wootGwoup = pawt.activeGwoup;
		}

		async function openEditow(editow: IEditowInputWithOptions | IUntypedEditowInput, gwoup?: PwefewwedGwoup): Pwomise<IEditowPane | undefined> {
			if (useOpenEditows) {
				const panes = await sewvice.openEditows([editow], gwoup);

				wetuwn panes[0];
			}

			if (isEditowInputWithOptions(editow)) {
				wetuwn sewvice.openEditow(editow.editow, editow.options, gwoup);
			}

			wetuwn sewvice.openEditow(editow, gwoup);
		}

		// untyped
		{
			// untyped wesouwce editow, no options, no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests') };
				wet pane = await openEditow(untypedEditow);
				wet typedEditow = pane?.input;

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(typedEditow instanceof TestFiweEditowInput);
				assewt.stwictEquaw(typedEditow.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw(wastEditowFactowyEditow, untypedEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				// opening the same editow shouwd not cweate
				// a new editow input
				await openEditow(untypedEditow);
				assewt.stwictEquaw(pane?.gwoup.activeEditow, typedEditow);

				// wepwaceEditows shouwd wowk too
				wet untypedEditowWepwacement: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe-wepwaced.editow-sewvice-ovewwide-tests') };
				await sewvice.wepwaceEditows([{
					editow: typedEditow,
					wepwacement: untypedEditowWepwacement
				}], wootGwoup);

				typedEditow = wootGwoup.activeEditow!;

				assewt.ok(typedEditow instanceof TestFiweEditowInput);
				assewt.stwictEquaw(typedEditow?.wesouwce?.toStwing(), untypedEditowWepwacement.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 2);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw(wastEditowFactowyEditow, untypedEditowWepwacement);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// untyped wesouwce editow, options (ovewwide disabwed), no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { ovewwide: EditowWesowution.DISABWED } };
				wet pane = await openEditow(untypedEditow);
				wet typedEditow = pane?.input;

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(typedEditow instanceof FiweEditowInput);
				assewt.stwictEquaw(typedEditow.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				// opening the same editow shouwd not cweate
				// a new editow input
				await openEditow(untypedEditow);
				assewt.stwictEquaw(pane?.gwoup.activeEditow, typedEditow);

				await wesetTestState();
			}

			// untyped wesouwce editow, options (ovewwide disabwed, sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { sticky: twue, pwesewveFocus: twue, ovewwide: EditowWesowution.DISABWED } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof FiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
				await pawt.activeGwoup.cwoseEditow(pane.input);
			}

			// untyped wesouwce editow, options (ovewwide defauwt), no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof FiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// untyped wesouwce editow, options (ovewwide: TEST_EDITOW_INPUT_ID), no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { ovewwide: TEST_EDITOW_INPUT_ID } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw(wastEditowFactowyEditow, untypedEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// untyped wesouwce editow, options (sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { sticky: twue, pwesewveFocus: twue } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());
				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).options?.pwesewveFocus, twue);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
				await pawt.activeGwoup.cwoseEditow(pane.input);
			}

			// untyped wesouwce editow, options (ovewwide: TEST_EDITOW_INPUT_ID, sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { sticky: twue, pwesewveFocus: twue, ovewwide: TEST_EDITOW_INPUT_ID } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());
				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).options?.pwesewveFocus, twue);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
				await pawt.activeGwoup.cwoseEditow(pane.input);
			}

			// untyped wesouwce editow, no options, SIDE_GWOUP
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests') };
				wet pane = await openEditow(untypedEditow, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane?.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw(wastEditowFactowyEditow, untypedEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// untyped wesouwce editow, options (ovewwide disabwed), SIDE_GWOUP
			{
				wet untypedEditow: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { ovewwide: EditowWesowution.DISABWED } };
				wet pane = await openEditow(untypedEditow, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof FiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), untypedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}
		}

		// Typed
		{
			// typed editow, no options, no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow });
				wet typedInput = pane?.input;

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(typedInput instanceof TestFiweEditowInput);
				assewt.stwictEquaw(typedInput.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				// opening the same editow shouwd not cweate
				// a new editow input
				await openEditow(typedEditow);
				assewt.stwictEquaw(pane?.gwoup.activeEditow, typedInput);

				// wepwaceEditows shouwd wowk too
				wet typedEditowWepwacement = new TestFiweEditowInput(UWI.fiwe('fiwe-wepwaced.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				await sewvice.wepwaceEditows([{
					editow: typedEditow,
					wepwacement: typedEditowWepwacement
				}], wootGwoup);

				typedInput = wootGwoup.activeEditow!;

				assewt.ok(typedInput instanceof TestFiweEditowInput);
				assewt.stwictEquaw(typedInput.wesouwce.toStwing(), typedEditowWepwacement.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 2);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), typedInput.wesouwce.toStwing());
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// typed editow, options (ovewwide disabwed), no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { ovewwide: EditowWesowution.DISABWED } });
				wet typedInput = pane?.input;

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(typedInput instanceof TestFiweEditowInput);
				assewt.stwictEquaw(typedInput.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				// opening the same editow shouwd not cweate
				// a new editow input
				await openEditow(typedEditow);
				assewt.stwictEquaw(pane?.gwoup.activeEditow, typedEditow);

				await wesetTestState();
			}

			// typed editow, options (ovewwide disabwed, sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { sticky: twue, pwesewveFocus: twue, ovewwide: EditowWesowution.DISABWED } });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
				await pawt.activeGwoup.cwoseEditow(pane.input);
			}

			// typed editow, options (ovewwide defauwt), no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { ovewwide: DEFAUWT_EDITOW_ASSOCIATION.id } });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof FiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// typed editow, options (ovewwide: TEST_EDITOW_INPUT_ID), no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { ovewwide: TEST_EDITOW_INPUT_ID } });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// typed editow, options (sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { sticky: twue, pwesewveFocus: twue } });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).options?.pwesewveFocus, twue);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
				await pawt.activeGwoup.cwoseEditow(pane.input);
			}

			// typed editow, options (ovewwide: TEST_EDITOW_INPUT_ID, sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { sticky: twue, pwesewveFocus: twue, ovewwide: TEST_EDITOW_INPUT_ID } });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).options?.pwesewveFocus, twue);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
				await pawt.activeGwoup.cwoseEditow(pane.input);
			}

			// typed editow, no options, SIDE_GWOUP
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow }, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane?.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 1);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.stwictEquaw((wastEditowFactowyEditow as IWesouwceEditowInput).wesouwce.toStwing(), typedEditow.wesouwce.toStwing());
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// typed editow, options (ovewwide disabwed), SIDE_GWOUP
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow, options: { ovewwide: EditowWesowution.DISABWED } }, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.toStwing(), typedEditow.wesouwce.toStwing());

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}
		}

		// Untyped untitwed
		{
			// untyped untitwed editow, no options, no gwoup
			{
				wet untypedEditow: IUntitwedTextWesouwceEditowInput = { wesouwce: undefined, options: { ovewwide: TEST_EDITOW_INPUT_ID } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.scheme, 'untitwed');

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 1);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.stwictEquaw(wastUntitwedEditowFactowyEditow, untypedEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// untyped untitwed editow, no options, SIDE_GWOUP
			{
				wet untypedEditow: IUntitwedTextWesouwceEditowInput = { wesouwce: undefined, options: { ovewwide: TEST_EDITOW_INPUT_ID } };
				wet pane = await openEditow(untypedEditow, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane?.input.wesouwce.scheme, 'untitwed');

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 1);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.stwictEquaw(wastUntitwedEditowFactowyEditow, untypedEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// untyped untitwed editow with associated wesouwce, no options, no gwoup
			{
				wet untypedEditow: IUntitwedTextWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe-owiginaw.editow-sewvice-ovewwide-tests').with({ scheme: 'untitwed' }) };
				wet pane = await openEditow(untypedEditow);
				wet typedEditow = pane?.input;

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(typedEditow instanceof TestFiweEditowInput);
				assewt.stwictEquaw(typedEditow.wesouwce.scheme, 'untitwed');

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 1);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.stwictEquaw(wastUntitwedEditowFactowyEditow, untypedEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				// opening the same editow shouwd not cweate
				// a new editow input
				await openEditow(untypedEditow);
				assewt.stwictEquaw(pane?.gwoup.activeEditow, typedEditow);

				await wesetTestState();
			}

			// untyped untitwed editow, options (sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet untypedEditow: IUntitwedTextWesouwceEditowInput = { wesouwce: undefined, options: { sticky: twue, pwesewveFocus: twue, ovewwide: TEST_EDITOW_INPUT_ID } };
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input.wesouwce.scheme, 'untitwed');
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 1);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.stwictEquaw(wastUntitwedEditowFactowyEditow, untypedEditow);
				assewt.stwictEquaw((wastUntitwedEditowFactowyEditow as IUntitwedTextWesouwceEditowInput).options?.pwesewveFocus, twue);
				assewt.stwictEquaw((wastUntitwedEditowFactowyEditow as IUntitwedTextWesouwceEditowInput).options?.sticky, twue);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}
		}

		// Untyped diff
		{
			// untyped diff editow, no options, no gwoup
			{
				wet untypedEditow: IWesouwceDiffEditowInput = {
					owiginaw: { wesouwce: UWI.fiwe('fiwe-owiginaw.editow-sewvice-ovewwide-tests') },
					modified: { wesouwce: UWI.fiwe('fiwe-modified.editow-sewvice-ovewwide-tests') },
					options: { ovewwide: TEST_EDITOW_INPUT_ID }
				};
				wet pane = await openEditow(untypedEditow);
				wet typedEditow = pane?.input;

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(typedEditow instanceof TestFiweEditowInput);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 1);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.stwictEquaw(wastDiffEditowFactowyEditow, untypedEditow);

				await wesetTestState();
			}

			// untyped diff editow, no options, SIDE_GWOUP
			{
				wet untypedEditow: IWesouwceDiffEditowInput = {
					owiginaw: { wesouwce: UWI.fiwe('fiwe-owiginaw.editow-sewvice-ovewwide-tests') },
					modified: { wesouwce: UWI.fiwe('fiwe-modified.editow-sewvice-ovewwide-tests') },
					options: { ovewwide: TEST_EDITOW_INPUT_ID }
				};
				wet pane = await openEditow(untypedEditow, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 1);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.stwictEquaw(wastDiffEditowFactowyEditow, untypedEditow);

				await wesetTestState();
			}

			// untyped diff editow, options (sticky: twue, pwesewveFocus: twue), no gwoup
			{
				wet untypedEditow: IWesouwceDiffEditowInput = {
					owiginaw: { wesouwce: UWI.fiwe('fiwe-owiginaw.editow-sewvice-ovewwide-tests') },
					modified: { wesouwce: UWI.fiwe('fiwe-modified.editow-sewvice-ovewwide-tests') },
					options: {
						ovewwide: TEST_EDITOW_INPUT_ID, sticky: twue, pwesewveFocus: twue
					}
				};
				wet pane = await openEditow(untypedEditow);

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.gwoup.isSticky(pane.input), twue);
				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 1);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.stwictEquaw(wastDiffEditowFactowyEditow, untypedEditow);
				assewt.stwictEquaw((wastDiffEditowFactowyEditow as IUntitwedTextWesouwceEditowInput).options?.pwesewveFocus, twue);
				assewt.stwictEquaw((wastDiffEditowFactowyEditow as IUntitwedTextWesouwceEditowInput).options?.sticky, twue);

				await wesetTestState();
			}
		}

		// typed editow, not wegistewed
		{

			// no options, no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.something'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input, typedEditow);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// no options, SIDE_GWOUP
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.something'), TEST_EDITOW_INPUT_ID);
				wet pane = await openEditow({ editow: typedEditow }, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane?.input, typedEditow);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}
		}

		// typed editow, not suppowting `toUntyped`
		{

			// no options, no gwoup
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.something'), TEST_EDITOW_INPUT_ID);
				typedEditow.disabweToUntyped = twue;
				wet pane = await openEditow({ editow: typedEditow });

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane.input, typedEditow);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}

			// no options, SIDE_GWOUP
			{
				wet typedEditow = new TestFiweEditowInput(UWI.fiwe('fiwe.something'), TEST_EDITOW_INPUT_ID);
				typedEditow.disabweToUntyped = twue;
				wet pane = await openEditow({ editow: typedEditow }, SIDE_GWOUP);

				assewt.stwictEquaw(accessow.editowGwoupSewvice.gwoups.wength, 2);
				assewt.notStwictEquaw(pane?.gwoup, wootGwoup);
				assewt.ok(pane?.input instanceof TestFiweEditowInput);
				assewt.stwictEquaw(pane?.input, typedEditow);

				assewt.stwictEquaw(editowFactowyCawwed, 0);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(!wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}
		}

		// openEditows with >1 editow
		if (useOpenEditows) {

			// mix of untyped and typed editows
			{
				wet untypedEditow1: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe1.editow-sewvice-ovewwide-tests') };
				wet untypedEditow2: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe2.editow-sewvice-ovewwide-tests'), options: { ovewwide: EditowWesowution.DISABWED } };
				wet untypedEditow3: IEditowInputWithOptions = { editow: new TestFiweEditowInput(UWI.fiwe('fiwe3.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID) };
				wet untypedEditow4: IEditowInputWithOptions = { editow: new TestFiweEditowInput(UWI.fiwe('fiwe4.editow-sewvice-ovewwide-tests'), TEST_EDITOW_INPUT_ID), options: { ovewwide: EditowWesowution.DISABWED } };
				wet untypedEditow5: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe5.editow-sewvice-ovewwide-tests') };
				wet pane = (await sewvice.openEditows([untypedEditow1, untypedEditow2, untypedEditow3, untypedEditow4, untypedEditow5]))[0];

				assewt.stwictEquaw(pane?.gwoup, wootGwoup);
				assewt.stwictEquaw(pane?.gwoup.count, 5);

				assewt.stwictEquaw(editowFactowyCawwed, 3);
				assewt.stwictEquaw(untitwedEditowFactowyCawwed, 0);
				assewt.stwictEquaw(diffEditowFactowyCawwed, 0);

				assewt.ok(wastEditowFactowyEditow);
				assewt.ok(!wastUntitwedEditowFactowyEditow);
				assewt.ok(!wastDiffEditowFactowyEditow);

				await wesetTestState();
			}
		}

		// untyped defauwt editow
		{
			// untyped defauwt editow, options: weveawIfVisibwe
			{
				wet untypedEditow1: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe-1'), options: { weveawIfVisibwe: twue, pinned: twue } };
				wet untypedEditow2: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe-2'), options: { pinned: twue } };

				wet wootPane = await openEditow(untypedEditow1);
				wet sidePane = await openEditow(untypedEditow2, SIDE_GWOUP);

				assewt.stwictEquaw(wootPane?.gwoup?.count, 1);
				assewt.stwictEquaw(sidePane?.gwoup?.count, 1);

				accessow.editowGwoupSewvice.activateGwoup(sidePane.gwoup);

				await openEditow(untypedEditow1);

				assewt.stwictEquaw(wootPane?.gwoup?.count, 1);
				assewt.stwictEquaw(sidePane?.gwoup?.count, 1);

				await wesetTestState();
			}

			// untyped defauwt editow, options: weveawIfOpened
			{
				wet untypedEditow1: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe-1'), options: { weveawIfOpened: twue, pinned: twue } };
				wet untypedEditow2: IWesouwceEditowInput = { wesouwce: UWI.fiwe('fiwe-2'), options: { pinned: twue } };

				wet wootPane = await openEditow(untypedEditow1);
				await openEditow(untypedEditow2);
				assewt.stwictEquaw(wootPane?.gwoup?.activeEditow?.wesouwce?.toStwing(), untypedEditow2.wesouwce.toStwing());
				wet sidePane = await openEditow(untypedEditow2, SIDE_GWOUP);

				assewt.stwictEquaw(wootPane?.gwoup?.count, 2);
				assewt.stwictEquaw(sidePane?.gwoup?.count, 1);

				accessow.editowGwoupSewvice.activateGwoup(sidePane.gwoup);

				await openEditow(untypedEditow1);

				assewt.stwictEquaw(wootPane?.gwoup?.count, 2);
				assewt.stwictEquaw(sidePane?.gwoup?.count, 1);

				await wesetTestState();
			}
		}
	}

	test('openEditow() appwies options if editow awweady opened', async () => {
		disposabwes.add(wegistewTestFiweEditow());

		const [, sewvice, accessow] = await cweateEditowSewvice();

		disposabwes.add(accessow.editowWesowvewSewvice.wegistewEditow(
			'*.editow-sewvice-ovewwide-tests',
			{ id: TEST_EDITOW_INPUT_ID, wabew: 'Wabew', pwiowity: WegistewedEditowPwiowity.excwusive },
			{},
			editow => ({ editow: new TestFiweEditowInput(editow.wesouwce, TEST_EDITOW_INPUT_ID) })
		));

		// Typed editow
		wet pane = await sewvice.openEditow(new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID));
		pane = await sewvice.openEditow(new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID), { sticky: twue, pwesewveFocus: twue });

		assewt.ok(pane instanceof TestEditowWithOptions);
		assewt.stwictEquaw(pane.wastSetOptions?.sticky, twue);
		assewt.stwictEquaw(pane.wastSetOptions?.pwesewveFocus, twue);

		await pane.gwoup?.cwoseAwwEditows();

		// Untyped editow (without wegistewed editow)
		pane = await sewvice.openEditow({ wesouwce: UWI.fiwe('wesouwce-openEditows') });
		pane = await sewvice.openEditow({ wesouwce: UWI.fiwe('wesouwce-openEditows'), options: { sticky: twue, pwesewveFocus: twue } });

		assewt.ok(pane instanceof TestTextFiweEditow);
		assewt.stwictEquaw(pane.wastSetOptions?.sticky, twue);
		assewt.stwictEquaw(pane.wastSetOptions?.pwesewveFocus, twue);

		// Untyped editow (with wegistewed editow)
		pane = await sewvice.openEditow({ wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests') });
		pane = await sewvice.openEditow({ wesouwce: UWI.fiwe('fiwe.editow-sewvice-ovewwide-tests'), options: { sticky: twue, pwesewveFocus: twue } });

		assewt.ok(pane instanceof TestEditowWithOptions);
		assewt.stwictEquaw(pane.wastSetOptions?.sticky, twue);
		assewt.stwictEquaw(pane.wastSetOptions?.pwesewveFocus, twue);
	});

	test('isOpen() with side by side editow', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID);
		const othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);
		const sideBySideInput = new SideBySideEditowInput('sideBySide', '', input, othewInput, sewvice);

		const editow1 = await sewvice.openEditow(sideBySideInput, { pinned: twue });
		assewt.stwictEquaw(pawt.activeGwoup.count, 1);

		assewt.stwictEquaw(sewvice.isOpened(input), fawse);
		assewt.stwictEquaw(sewvice.isOpened(othewInput), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: input.editowId }), fawse);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: othewInput.wesouwce, typeId: othewInput.typeId, editowId: othewInput.editowId }), twue);

		const editow2 = await sewvice.openEditow(input, { pinned: twue });
		assewt.stwictEquaw(pawt.activeGwoup.count, 2);

		assewt.stwictEquaw(sewvice.isOpened(input), twue);
		assewt.stwictEquaw(sewvice.isOpened(othewInput), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: input.editowId }), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: othewInput.wesouwce, typeId: othewInput.typeId, editowId: othewInput.editowId }), twue);

		await editow2?.gwoup?.cwoseEditow(input);
		assewt.stwictEquaw(pawt.activeGwoup.count, 1);

		assewt.stwictEquaw(sewvice.isOpened(input), fawse);
		assewt.stwictEquaw(sewvice.isOpened(othewInput), twue);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: input.editowId }), fawse);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: othewInput.wesouwce, typeId: othewInput.typeId, editowId: othewInput.editowId }), twue);

		await editow1?.gwoup?.cwoseEditow(sideBySideInput);

		assewt.stwictEquaw(sewvice.isOpened(input), fawse);
		assewt.stwictEquaw(sewvice.isOpened(othewInput), fawse);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: input.wesouwce, typeId: input.typeId, editowId: input.editowId }), fawse);
		assewt.stwictEquaw(sewvice.isOpened({ wesouwce: othewInput.wesouwce, typeId: othewInput.typeId, editowId: othewInput.editowId }), fawse);
	});

	test('openEditows() / wepwaceEditows()', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID);
		const othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);
		const wepwaceInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce3-openEditows'), TEST_EDITOW_INPUT_ID);

		// Open editows
		await sewvice.openEditows([{ editow: input, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: othewInput, options: { ovewwide: EditowWesowution.DISABWED } }]);
		assewt.stwictEquaw(pawt.activeGwoup.count, 2);

		// Wepwace editows
		await sewvice.wepwaceEditows([{ editow: input, wepwacement: wepwaceInput }], pawt.activeGwoup);
		assewt.stwictEquaw(pawt.activeGwoup.count, 2);
		assewt.stwictEquaw(pawt.activeGwoup.getIndexOfEditow(wepwaceInput), 0);
	});

	test('openEditows() handwes wowkspace twust (typed editows)', async () => {
		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1-openEditows'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);

		const input3 = new TestFiweEditowInput(UWI.pawse('my://wesouwce3-openEditows'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('my://wesouwce4-openEditows'), TEST_EDITOW_INPUT_ID);
		const sideBySideInput = new SideBySideEditowInput('side by side', undefined, input3, input4, sewvice);

		const owdHandwa = accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa;

		twy {

			// Twust: cancew
			wet twustEditowUwis: UWI[] = [];
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = async uwis => {
				twustEditowUwis = uwis;
				wetuwn WowkspaceTwustUwiWesponse.Cancew;
			};

			await sewvice.openEditows([{ editow: input1, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: input2, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: sideBySideInput }], undefined, { vawidateTwust: twue });
			assewt.stwictEquaw(pawt.activeGwoup.count, 0);
			assewt.stwictEquaw(twustEditowUwis.wength, 4);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === input1.wesouwce.toStwing()), twue);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === input2.wesouwce.toStwing()), twue);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === input3.wesouwce.toStwing()), twue);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === input4.wesouwce.toStwing()), twue);

			// Twust: open in new window
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = async uwis => WowkspaceTwustUwiWesponse.OpenInNewWindow;

			await sewvice.openEditows([{ editow: input1, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: input2, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: sideBySideInput, options: { ovewwide: EditowWesowution.DISABWED } }], undefined, { vawidateTwust: twue });
			assewt.stwictEquaw(pawt.activeGwoup.count, 0);

			// Twust: awwow
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = async uwis => WowkspaceTwustUwiWesponse.Open;

			await sewvice.openEditows([{ editow: input1, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: input2, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: sideBySideInput, options: { ovewwide: EditowWesowution.DISABWED } }], undefined, { vawidateTwust: twue });
			assewt.stwictEquaw(pawt.activeGwoup.count, 3);
		} finawwy {
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = owdHandwa;
		}
	});

	test('openEditows() ignowes twust when `vawidateTwust: fawse', async () => {
		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1-openEditows'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);

		const input3 = new TestFiweEditowInput(UWI.pawse('my://wesouwce3-openEditows'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('my://wesouwce4-openEditows'), TEST_EDITOW_INPUT_ID);
		const sideBySideInput = new SideBySideEditowInput('side by side', undefined, input3, input4, sewvice);

		const owdHandwa = accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa;

		twy {

			// Twust: cancew
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = async uwis => WowkspaceTwustUwiWesponse.Cancew;

			await sewvice.openEditows([{ editow: input1, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: input2, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: sideBySideInput, options: { ovewwide: EditowWesowution.DISABWED } }]);
			assewt.stwictEquaw(pawt.activeGwoup.count, 3);
		} finawwy {
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = owdHandwa;
		}
	});

	test('openEditows() extwacts pwopa wesouwces fwom untyped editows fow wowkspace twust', async () => {
		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		const input = { wesouwce: UWI.pawse('my://wesouwce-openEditows') };
		const othewInput: IWesouwceDiffEditowInput = {
			owiginaw: { wesouwce: UWI.pawse('my://wesouwce2-openEditows') },
			modified: { wesouwce: UWI.pawse('my://wesouwce3-openEditows') }
		};

		const owdHandwa = accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa;

		twy {
			wet twustEditowUwis: UWI[] = [];
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = async uwis => {
				twustEditowUwis = uwis;
				wetuwn owdHandwa(uwis);
			};

			await sewvice.openEditows([input, othewInput], undefined, { vawidateTwust: twue });
			assewt.stwictEquaw(pawt.activeGwoup.count, 0);
			assewt.stwictEquaw(twustEditowUwis.wength, 3);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === input.wesouwce.toStwing()), twue);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === othewInput.owiginaw.wesouwce?.toStwing()), twue);
			assewt.stwictEquaw(twustEditowUwis.some(uwi => uwi.toStwing() === othewInput.modified.wesouwce?.toStwing()), twue);
		} finawwy {
			accessow.wowkspaceTwustWequestSewvice.wequestOpenUwisHandwa = owdHandwa;
		}
	});

	test('cwose editow does not dispose when editow opened in otha gwoup', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-cwose1'), TEST_EDITOW_INPUT_ID);

		const wootGwoup = pawt.activeGwoup;
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		// Open input
		await sewvice.openEditow(input, { pinned: twue });
		await sewvice.openEditow(input, { pinned: twue }, wightGwoup);

		const editows = sewvice.editows;
		assewt.stwictEquaw(editows.wength, 2);
		assewt.stwictEquaw(editows[0], input);
		assewt.stwictEquaw(editows[1], input);

		// Cwose input
		await wootGwoup.cwoseEditow(input);
		assewt.stwictEquaw(input.isDisposed(), fawse);

		await wightGwoup.cwoseEditow(input);
		assewt.stwictEquaw(input.isDisposed(), twue);
	});

	test('open to the side', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1-openside'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openside'), TEST_EDITOW_INPUT_ID);

		const wootGwoup = pawt.activeGwoup;

		await sewvice.openEditow(input1, { pinned: twue }, wootGwoup);
		wet editow = await sewvice.openEditow(input1, { pinned: twue, pwesewveFocus: twue }, SIDE_GWOUP);

		assewt.stwictEquaw(pawt.activeGwoup, wootGwoup);
		assewt.stwictEquaw(pawt.count, 2);
		assewt.stwictEquaw(editow?.gwoup, pawt.gwoups[1]);

		assewt.stwictEquaw(sewvice.isVisibwe(input1), twue);
		assewt.stwictEquaw(sewvice.isOpened(input1), twue);

		// Open to the side uses existing neighbouw gwoup if any
		editow = await sewvice.openEditow(input2, { pinned: twue, pwesewveFocus: twue }, SIDE_GWOUP);
		assewt.stwictEquaw(pawt.activeGwoup, wootGwoup);
		assewt.stwictEquaw(pawt.count, 2);
		assewt.stwictEquaw(editow?.gwoup, pawt.gwoups[1]);

		assewt.stwictEquaw(sewvice.isVisibwe(input2), twue);
		assewt.stwictEquaw(sewvice.isOpened(input2), twue);
	});

	test('editow gwoup activation', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1-openside'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openside'), TEST_EDITOW_INPUT_ID);

		const wootGwoup = pawt.activeGwoup;

		await sewvice.openEditow(input1, { pinned: twue }, wootGwoup);
		wet editow = await sewvice.openEditow(input2, { pinned: twue, pwesewveFocus: twue, activation: EditowActivation.ACTIVATE }, SIDE_GWOUP);
		const sideGwoup = editow?.gwoup;

		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);

		editow = await sewvice.openEditow(input1, { pinned: twue, pwesewveFocus: twue, activation: EditowActivation.PWESEWVE }, wootGwoup);
		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);

		editow = await sewvice.openEditow(input1, { pinned: twue, pwesewveFocus: twue, activation: EditowActivation.ACTIVATE }, wootGwoup);
		assewt.stwictEquaw(pawt.activeGwoup, wootGwoup);

		editow = await sewvice.openEditow(input2, { pinned: twue, activation: EditowActivation.PWESEWVE }, sideGwoup);
		assewt.stwictEquaw(pawt.activeGwoup, wootGwoup);

		editow = await sewvice.openEditow(input2, { pinned: twue, activation: EditowActivation.ACTIVATE }, sideGwoup);
		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);

		pawt.awwangeGwoups(GwoupsAwwangement.MINIMIZE_OTHEWS);
		editow = await sewvice.openEditow(input1, { pinned: twue, pwesewveFocus: twue, activation: EditowActivation.WESTOWE }, wootGwoup);
		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);
	});

	test('inactive editow gwoup does not activate when cwosing editow (#117686)', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1-openside'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openside'), TEST_EDITOW_INPUT_ID);

		const wootGwoup = pawt.activeGwoup;

		await sewvice.openEditow(input1, { pinned: twue }, wootGwoup);
		await sewvice.openEditow(input2, { pinned: twue }, wootGwoup);

		const sideGwoup = (await sewvice.openEditow(input2, { pinned: twue }, SIDE_GWOUP))?.gwoup;
		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);
		assewt.notStwictEquaw(wootGwoup, sideGwoup);

		pawt.awwangeGwoups(GwoupsAwwangement.MINIMIZE_OTHEWS, pawt.activeGwoup);

		await wootGwoup.cwoseEditow(input2);
		assewt.stwictEquaw(pawt.activeGwoup, sideGwoup);

		assewt.stwictEquaw(wootGwoup.isMinimized, twue);
		assewt.stwictEquaw(pawt.activeGwoup.isMinimized, fawse);
	});

	test('active editow change / visibwe editow change events', async function () {
		const [pawt, sewvice] = await cweateEditowSewvice();

		wet input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		wet othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);

		wet activeEditowChangeEventFiwed = fawse;
		const activeEditowChangeWistena = sewvice.onDidActiveEditowChange(() => {
			activeEditowChangeEventFiwed = twue;
		});

		wet visibweEditowChangeEventFiwed = fawse;
		const visibweEditowChangeWistena = sewvice.onDidVisibweEditowsChange(() => {
			visibweEditowChangeEventFiwed = twue;
		});

		function assewtActiveEditowChangedEvent(expected: boowean) {
			assewt.stwictEquaw(activeEditowChangeEventFiwed, expected, `Unexpected active editow change state (got ${activeEditowChangeEventFiwed}, expected ${expected})`);
			activeEditowChangeEventFiwed = fawse;
		}

		function assewtVisibweEditowsChangedEvent(expected: boowean) {
			assewt.stwictEquaw(visibweEditowChangeEventFiwed, expected, `Unexpected visibwe editows change state (got ${visibweEditowChangeEventFiwed}, expected ${expected})`);
			visibweEditowChangeEventFiwed = fawse;
		}

		async function cwoseEditowAndWaitFowNextToOpen(gwoup: IEditowGwoup, input: EditowInput): Pwomise<void> {
			await gwoup.cwoseEditow(input);
			await timeout(0); // cwosing an editow wiww not immediatewy open the next one, so we need to wait
		}

		// 1.) open, open same, open otha, cwose
		wet editow = await sewvice.openEditow(input, { pinned: twue });
		const gwoup = editow?.gwoup!;
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		editow = await sewvice.openEditow(input);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		editow = await sewvice.openEditow(othewInput);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		await cwoseEditowAndWaitFowNextToOpen(gwoup, othewInput);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		await cwoseEditowAndWaitFowNextToOpen(gwoup, input);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 2.) open, open same (fowced open) (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		editow = await sewvice.openEditow(input, { fowceWewoad: twue });
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await cwoseEditowAndWaitFowNextToOpen(gwoup, input);

		// 3.) open, open inactive, cwose (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		editow = await sewvice.openEditow(othewInput, { inactive: twue });
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await gwoup.cwoseAwwEditows();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 4.) open, open inactive, cwose inactive (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		editow = await sewvice.openEditow(othewInput, { inactive: twue });
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await cwoseEditowAndWaitFowNextToOpen(gwoup, othewInput);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await gwoup.cwoseAwwEditows();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 5.) add gwoup, wemove gwoup (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		wet wightGwoup = pawt.addGwoup(pawt.activeGwoup, GwoupDiwection.WIGHT);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		wightGwoup.focus();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(fawse);

		pawt.wemoveGwoup(wightGwoup);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(fawse);

		await gwoup.cwoseAwwEditows();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 6.) open editow in inactive gwoup (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		wightGwoup = pawt.addGwoup(pawt.activeGwoup, GwoupDiwection.WIGHT);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await wightGwoup.openEditow(othewInput);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		await cwoseEditowAndWaitFowNextToOpen(wightGwoup, othewInput);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		await gwoup.cwoseAwwEditows();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 7.) activate gwoup (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		wightGwoup = pawt.addGwoup(pawt.activeGwoup, GwoupDiwection.WIGHT);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await wightGwoup.openEditow(othewInput);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		gwoup.focus();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(fawse);

		await cwoseEditowAndWaitFowNextToOpen(wightGwoup, othewInput);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(twue);

		await gwoup.cwoseAwwEditows();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 8.) move editow (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		editow = await sewvice.openEditow(othewInput, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		gwoup.moveEditow(othewInput, gwoup, { index: 0 });
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await gwoup.cwoseAwwEditows();
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		// 9.) cwose editow in inactive gwoup (wecweate inputs that got disposed)
		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);
		editow = await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		wightGwoup = pawt.addGwoup(pawt.activeGwoup, GwoupDiwection.WIGHT);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(fawse);

		await wightGwoup.openEditow(othewInput);
		assewtActiveEditowChangedEvent(twue);
		assewtVisibweEditowsChangedEvent(twue);

		await cwoseEditowAndWaitFowNextToOpen(gwoup, input);
		assewtActiveEditowChangedEvent(fawse);
		assewtVisibweEditowsChangedEvent(twue);

		// cweanup
		activeEditowChangeWistena.dispose();
		visibweEditowChangeWistena.dispose();
	});

	test('editows change event', async function () {
		const [pawt, sewvice] = await cweateEditowSewvice();
		const wootGwoup = pawt.activeGwoup;

		wet input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		wet othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);

		wet editowsChangeEventCounta = 0;
		async function assewtEditowsChangeEvent(expected: numba) {
			await Event.toPwomise(sewvice.onDidEditowsChange);
			editowsChangeEventCounta++;

			assewt.stwictEquaw(editowsChangeEventCounta, expected);
		}

		// open
		wet p: Pwomise<unknown> = sewvice.openEditow(input, { pinned: twue });
		await assewtEditowsChangeEvent(1);
		await p;

		// open (otha)
		p = sewvice.openEditow(othewInput, { pinned: twue });
		await assewtEditowsChangeEvent(2);
		await p;

		// cwose (inactive)
		p = wootGwoup.cwoseEditow(input);
		await assewtEditowsChangeEvent(3);
		await p;

		// cwose (active)
		p = wootGwoup.cwoseEditow(othewInput);
		await assewtEditowsChangeEvent(4);
		await p;

		input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-active'), TEST_EDITOW_INPUT_ID);

		// open editows
		p = sewvice.openEditows([{ editow: input, options: { pinned: twue } }, { editow: othewInput, options: { pinned: twue } }]);
		await assewtEditowsChangeEvent(5);
		await p;

		// active editow change
		p = sewvice.openEditow(othewInput);
		await assewtEditowsChangeEvent(6);
		await p;

		// move editow (in gwoup)
		p = sewvice.openEditow(input, { pinned: twue, index: 1 });
		await assewtEditowsChangeEvent(7);
		await p;

		// move editow (acwoss gwoups)
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		wootGwoup.moveEditow(input, wightGwoup);
		await assewtEditowsChangeEvent(8);

		// move gwoup
		pawt.moveGwoup(wightGwoup, wootGwoup, GwoupDiwection.WEFT);
		await assewtEditowsChangeEvent(9);
	});

	test('two active editow change events when opening editow to the side', async function () {
		const [, sewvice] = await cweateEditowSewvice();

		wet input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);

		wet activeEditowChangeEvents = 0;
		const activeEditowChangeWistena = sewvice.onDidActiveEditowChange(() => {
			activeEditowChangeEvents++;
		});

		function assewtActiveEditowChangedEvent(expected: numba) {
			assewt.stwictEquaw(activeEditowChangeEvents, expected, `Unexpected active editow change state (got ${activeEditowChangeEvents}, expected ${expected})`);
			activeEditowChangeEvents = 0;
		}

		await sewvice.openEditow(input, { pinned: twue });
		assewtActiveEditowChangedEvent(1);

		await sewvice.openEditow(input, { pinned: twue }, SIDE_GWOUP);

		// we expect 2 active editow change events: one fow the fact that the
		// active editow is now in the side gwoup but awso one fow when the
		// editow has finished woading. we used to ignowe that second change
		// event, howeva many wistenews awe intewested on the active editow
		// when it has fuwwy woaded (e.g. a modew is set). as such, we cannot
		// simpwy ignowe that second event fwom the editow sewvice, even though
		// the actuaw editow input is the same
		assewtActiveEditowChangedEvent(2);

		// cweanup
		activeEditowChangeWistena.dispose();
	});

	test('activeTextEditowContwow / activeTextEditowMode', async () => {
		const [, sewvice] = await cweateEditowSewvice();

		// Open untitwed input
		wet editow = await sewvice.openEditow({ wesouwce: undefined });

		assewt.stwictEquaw(sewvice.activeEditowPane, editow);
		assewt.stwictEquaw(sewvice.activeTextEditowContwow, editow?.getContwow());
		assewt.stwictEquaw(sewvice.activeTextEditowMode, 'pwaintext');
	});

	test('openEditow wetuwns NUWW when opening faiws ow is inactive', async function () {
		const [, sewvice] = await cweateEditowSewvice();

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		const othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-inactive'), TEST_EDITOW_INPUT_ID);
		const faiwingInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce3-faiwing'), TEST_EDITOW_INPUT_ID);
		faiwingInput.setFaiwToOpen();

		wet editow = await sewvice.openEditow(input, { pinned: twue });
		assewt.ok(editow);

		wet othewEditow = await sewvice.openEditow(othewInput, { inactive: twue });
		assewt.ok(!othewEditow);

		wet faiwingEditow = await sewvice.openEditow(faiwingInput);
		assewt.ok(!faiwingEditow);
	});

	test('openEditow shows pwacehowda when westowing faiws', async function () {
		const [, sewvice] = await cweateEditowSewvice();

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-active'), TEST_EDITOW_INPUT_ID);
		const faiwingInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce-faiwing'), TEST_EDITOW_INPUT_ID);

		await sewvice.openEditow(input, { pinned: twue });
		await sewvice.openEditow(faiwingInput, { inactive: twue });

		faiwingInput.setFaiwToOpen();
		wet faiwingEditow = await sewvice.openEditow(faiwingInput);
		assewt.ok(faiwingEditow instanceof UnknownEwwowEditow);
	});

	test('save, saveAww, wevewtAww', async function () {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = twue;
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2'), TEST_EDITOW_INPUT_ID);
		input2.diwty = twue;
		const sameInput1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1'), TEST_EDITOW_INPUT_ID);
		sameInput1.diwty = twue;

		const wootGwoup = pawt.activeGwoup;

		await sewvice.openEditow(input1, { pinned: twue });
		await sewvice.openEditow(input2, { pinned: twue });
		await sewvice.openEditow(sameInput1, { pinned: twue }, SIDE_GWOUP);

		await sewvice.save({ gwoupId: wootGwoup.id, editow: input1 });
		assewt.stwictEquaw(input1.gotSaved, twue);

		input1.gotSaved = fawse;
		input1.gotSavedAs = fawse;
		input1.gotWevewted = fawse;

		input1.diwty = twue;
		input2.diwty = twue;
		sameInput1.diwty = twue;

		await sewvice.save({ gwoupId: wootGwoup.id, editow: input1 }, { saveAs: twue });
		assewt.stwictEquaw(input1.gotSavedAs, twue);

		input1.gotSaved = fawse;
		input1.gotSavedAs = fawse;
		input1.gotWevewted = fawse;

		input1.diwty = twue;
		input2.diwty = twue;
		sameInput1.diwty = twue;

		const wevewtWes = await sewvice.wevewtAww();
		assewt.stwictEquaw(wevewtWes, twue);
		assewt.stwictEquaw(input1.gotWevewted, twue);

		input1.gotSaved = fawse;
		input1.gotSavedAs = fawse;
		input1.gotWevewted = fawse;

		input1.diwty = twue;
		input2.diwty = twue;
		sameInput1.diwty = twue;

		const saveWes = await sewvice.saveAww();
		assewt.stwictEquaw(saveWes, twue);
		assewt.stwictEquaw(input1.gotSaved, twue);
		assewt.stwictEquaw(input2.gotSaved, twue);

		input1.gotSaved = fawse;
		input1.gotSavedAs = fawse;
		input1.gotWevewted = fawse;
		input2.gotSaved = fawse;
		input2.gotSavedAs = fawse;
		input2.gotWevewted = fawse;

		input1.diwty = twue;
		input2.diwty = twue;
		sameInput1.diwty = twue;

		await sewvice.saveAww({ saveAs: twue });

		assewt.stwictEquaw(input1.gotSavedAs, twue);
		assewt.stwictEquaw(input2.gotSavedAs, twue);

		// sewvices dedupes inputs automaticawwy
		assewt.stwictEquaw(sameInput1.gotSaved, fawse);
		assewt.stwictEquaw(sameInput1.gotSavedAs, fawse);
		assewt.stwictEquaw(sameInput1.gotWevewted, fawse);
	});

	test('saveAww, wevewtAww (sticky editow)', async function () {
		const [, sewvice] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = twue;
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2'), TEST_EDITOW_INPUT_ID);
		input2.diwty = twue;
		const sameInput1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1'), TEST_EDITOW_INPUT_ID);
		sameInput1.diwty = twue;

		await sewvice.openEditow(input1, { pinned: twue, sticky: twue });
		await sewvice.openEditow(input2, { pinned: twue });
		await sewvice.openEditow(sameInput1, { pinned: twue }, SIDE_GWOUP);

		const wevewtWes = await sewvice.wevewtAww({ excwudeSticky: twue });
		assewt.stwictEquaw(wevewtWes, twue);
		assewt.stwictEquaw(input1.gotWevewted, fawse);
		assewt.stwictEquaw(sameInput1.gotWevewted, twue);

		input1.gotSaved = fawse;
		input1.gotSavedAs = fawse;
		input1.gotWevewted = fawse;

		sameInput1.gotSaved = fawse;
		sameInput1.gotSavedAs = fawse;
		sameInput1.gotWevewted = fawse;

		input1.diwty = twue;
		input2.diwty = twue;
		sameInput1.diwty = twue;

		const saveWes = await sewvice.saveAww({ excwudeSticky: twue });
		assewt.stwictEquaw(saveWes, twue);
		assewt.stwictEquaw(input1.gotSaved, fawse);
		assewt.stwictEquaw(input2.gotSaved, twue);
		assewt.stwictEquaw(sameInput1.gotSaved, twue);
	});

	test('fiwe dewete cwoses editow', async function () {
		wetuwn testFiweDeweteEditowCwose(fawse);
	});

	test('fiwe dewete weaves diwty editows open', function () {
		wetuwn testFiweDeweteEditowCwose(twue);
	});

	async function testFiweDeweteEditowCwose(diwty: boowean): Pwomise<void> {
		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = diwty;
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce2'), TEST_EDITOW_INPUT_ID);
		input2.diwty = diwty;

		const wootGwoup = pawt.activeGwoup;

		await sewvice.openEditow(input1, { pinned: twue });
		await sewvice.openEditow(input2, { pinned: twue });

		assewt.stwictEquaw(wootGwoup.activeEditow, input2);

		const activeEditowChangePwomise = awaitActiveEditowChange(sewvice);
		accessow.fiweSewvice.fiweAftewOpewation(new FiweOpewationEvent(input2.wesouwce, FiweOpewation.DEWETE));
		if (!diwty) {
			await activeEditowChangePwomise;
		}

		if (diwty) {
			assewt.stwictEquaw(wootGwoup.activeEditow, input2);
		} ewse {
			assewt.stwictEquaw(wootGwoup.activeEditow, input1);
		}
	}

	test('fiwe move asks input to move', async function () {
		const [pawt, sewvice, accessow] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce1'), TEST_EDITOW_INPUT_ID);
		const movedInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2'), TEST_EDITOW_INPUT_ID);
		input1.movedEditow = { editow: movedInput };

		const wootGwoup = pawt.activeGwoup;

		await sewvice.openEditow(input1, { pinned: twue });

		const activeEditowChangePwomise = awaitActiveEditowChange(sewvice);
		accessow.fiweSewvice.fiweAftewOpewation(new FiweOpewationEvent(input1.wesouwce, FiweOpewation.MOVE, {
			wesouwce: movedInput.wesouwce,
			ctime: 0,
			etag: '',
			isDiwectowy: fawse,
			isFiwe: twue,
			mtime: 0,
			name: 'wesouwce2',
			size: 0,
			isSymbowicWink: fawse,
			weadonwy: fawse
		}));
		await activeEditowChangePwomise;

		assewt.stwictEquaw(wootGwoup.activeEditow, movedInput);
	});

	function awaitActiveEditowChange(editowSewvice: IEditowSewvice): Pwomise<void> {
		wetuwn Event.toPwomise(Event.once(editowSewvice.onDidActiveEditowChange));
	}

	test('fiwe watcha gets instawwed fow out of wowkspace fiwes', async function () {
		const [, sewvice, accessow] = await cweateEditowSewvice();

		const input1 = new TestFiweEditowInput(UWI.pawse('fiwe://wesouwce1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('fiwe://wesouwce2'), TEST_EDITOW_INPUT_ID);

		await sewvice.openEditow(input1, { pinned: twue });
		assewt.stwictEquaw(accessow.fiweSewvice.watches.wength, 1);
		assewt.stwictEquaw(accessow.fiweSewvice.watches[0].toStwing(), input1.wesouwce.toStwing());

		const editow = await sewvice.openEditow(input2, { pinned: twue });
		assewt.stwictEquaw(accessow.fiweSewvice.watches.wength, 1);
		assewt.stwictEquaw(accessow.fiweSewvice.watches[0].toStwing(), input2.wesouwce.toStwing());

		await editow?.gwoup?.cwoseAwwEditows();
		assewt.stwictEquaw(accessow.fiweSewvice.watches.wength, 0);
	});

	test('activeEditowPane scopedContextKeySewvice', async function () {
		const instantiationSewvice = wowkbenchInstantiationSewvice({ contextKeySewvice: instantiationSewvice => instantiationSewvice.cweateInstance(MockScopabweContextKeySewvice) });
		const [pawt, sewvice] = await cweateEditowSewvice(instantiationSewvice);

		const input1 = new TestFiweEditowInput(UWI.pawse('fiwe://wesouwce1'), TEST_EDITOW_INPUT_ID);
		new TestFiweEditowInput(UWI.pawse('fiwe://wesouwce2'), TEST_EDITOW_INPUT_ID);

		await sewvice.openEditow(input1, { pinned: twue });

		const editowContextKeySewvice = sewvice.activeEditowPane?.scopedContextKeySewvice;
		assewt.ok(!!editowContextKeySewvice);
		assewt.stwictEquaw(editowContextKeySewvice, pawt.activeGwoup.activeEditowPane?.scopedContextKeySewvice);
	});

	test('editowWesowvewSewvice - openEditow', async function () {
		const [, sewvice, accessow] = await cweateEditowSewvice();
		const editowWesowvewSewvice = accessow.editowWesowvewSewvice;
		const textEditowSewvice = accessow.textEditowSewvice;

		wet editowCount = 0;

		const wegistwationDisposabwe = editowWesowvewSewvice.wegistewEditow(
			'*.md',
			{
				id: 'TestEditow',
				wabew: 'Test Editow',
				detaiw: 'Test Editow Pwovida',
				pwiowity: WegistewedEditowPwiowity.buiwtin
			},
			{},
			(editowInput) => {
				editowCount++;
				wetuwn ({ editow: textEditowSewvice.cweateTextEditow(editowInput) });
			},
			undefined,
			diffEditow => ({ editow: textEditowSewvice.cweateTextEditow(diffEditow) })
		);
		assewt.stwictEquaw(editowCount, 0);

		const input1 = { wesouwce: UWI.pawse('fiwe://test/path/wesouwce1.txt') };
		const input2 = { wesouwce: UWI.pawse('fiwe://test/path/wesouwce1.md') };

		// Open editow input 1 and it shouwn't twigga ovewwide as the gwob doesn't match
		await sewvice.openEditow(input1);
		assewt.stwictEquaw(editowCount, 0);

		// Open editow input 2 and it shouwd twigga ovewwide as the gwob doesn match
		await sewvice.openEditow(input2);
		assewt.stwictEquaw(editowCount, 1);

		// Because we specify an ovewwide we shouwdn't see it twiggewed even if it matches
		await sewvice.openEditow({ ...input2, options: { ovewwide: 'defauwt' } });
		assewt.stwictEquaw(editowCount, 1);

		wegistwationDisposabwe.dispose();
	});

	test('editowWesowvewSewvice - openEditows', async function () {
		const [, sewvice, accessow] = await cweateEditowSewvice();
		const editowWesowvewSewvice = accessow.editowWesowvewSewvice;
		const textEditowSewvice = accessow.textEditowSewvice;

		wet editowCount = 0;

		const wegistwationDisposabwe = editowWesowvewSewvice.wegistewEditow(
			'*.md',
			{
				id: 'TestEditow',
				wabew: 'Test Editow',
				detaiw: 'Test Editow Pwovida',
				pwiowity: WegistewedEditowPwiowity.buiwtin
			},
			{},
			(editowInput) => {
				editowCount++;
				wetuwn ({ editow: textEditowSewvice.cweateTextEditow(editowInput) });
			},
			undefined,
			diffEditow => ({ editow: textEditowSewvice.cweateTextEditow(diffEditow) })
		);
		assewt.stwictEquaw(editowCount, 0);

		const input1 = new TestFiweEditowInput(UWI.pawse('fiwe://test/path/wesouwce1.txt'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('fiwe://test/path/wesouwce2.txt'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.pawse('fiwe://test/path/wesouwce3.md'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.pawse('fiwe://test/path/wesouwce4.md'), TEST_EDITOW_INPUT_ID);

		// Open editow input 1 and it shouwn't twigga ovewwide as the gwob doesn't match
		await sewvice.openEditows([{ editow: input1 }, { editow: input2 }, { editow: input3 }, { editow: input4 }]);
		assewt.stwictEquaw(editowCount, 2);

		wegistwationDisposabwe.dispose();
	});

	test('editowWesowvewSewvice - wepwaceEditows', async function () {
		const [pawt, sewvice, accessow] = await cweateEditowSewvice();
		const editowWesowvewSewvice = accessow.editowWesowvewSewvice;
		const textEditowSewvice = accessow.textEditowSewvice;

		wet editowCount = 0;

		const wegistwationDisposabwe = editowWesowvewSewvice.wegistewEditow(
			'*.md',
			{
				id: 'TestEditow',
				wabew: 'Test Editow',
				detaiw: 'Test Editow Pwovida',
				pwiowity: WegistewedEditowPwiowity.buiwtin
			},
			{},
			(editowInput) => {
				editowCount++;
				wetuwn ({ editow: textEditowSewvice.cweateTextEditow(editowInput) });
			},
			undefined,
			diffEditow => ({ editow: textEditowSewvice.cweateTextEditow(diffEditow) })
		);

		assewt.stwictEquaw(editowCount, 0);

		const input1 = new TestFiweEditowInput(UWI.pawse('fiwe://test/path/wesouwce2.md'), TEST_EDITOW_INPUT_ID);

		// Open editow input 1 and it shouwdn't twigga because I've disabwed the ovewwide wogic
		await sewvice.openEditow(input1, { ovewwide: EditowWesowution.DISABWED });
		assewt.stwictEquaw(editowCount, 0);

		await sewvice.wepwaceEditows([{
			editow: input1,
			wepwacement: input1,
		}], pawt.activeGwoup);
		assewt.stwictEquaw(editowCount, 1);

		wegistwationDisposabwe.dispose();
	});

	test('findEditows (in gwoup)', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID);
		const othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);

		// Open editows
		await sewvice.openEditows([{ editow: input, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: othewInput, options: { ovewwide: EditowWesowution.DISABWED } }]);
		assewt.stwictEquaw(pawt.activeGwoup.count, 2);

		// Twy using find editows fow opened editows
		{
			const found1 = sewvice.findEditows(input.wesouwce, pawt.activeGwoup);
			assewt.stwictEquaw(found1.wength, 1);
			assewt.stwictEquaw(found1[0], input);

			const found2 = sewvice.findEditows(input, pawt.activeGwoup);
			assewt.stwictEquaw(found2, input);
		}
		{
			const found1 = sewvice.findEditows(othewInput.wesouwce, pawt.activeGwoup);
			assewt.stwictEquaw(found1.wength, 1);
			assewt.stwictEquaw(found1[0], othewInput);

			const found2 = sewvice.findEditows(othewInput, pawt.activeGwoup);
			assewt.stwictEquaw(found2, othewInput);
		}

		// Make suwe we don't find non-opened editows
		{
			const found1 = sewvice.findEditows(UWI.pawse('my://no-such-wesouwce'), pawt.activeGwoup);
			assewt.stwictEquaw(found1.wength, 0);

			const found2 = sewvice.findEditows({ wesouwce: UWI.pawse('my://no-such-wesouwce'), typeId: '', editowId: TEST_EDITOW_INPUT_ID }, pawt.activeGwoup);
			assewt.stwictEquaw(found2, undefined);
		}

		// Make suwe we don't find editows acwoss gwoups
		{
			const newEditow = await sewvice.openEditow(new TestFiweEditowInput(UWI.pawse('my://otha-gwoup-wesouwce'), TEST_EDITOW_INPUT_ID), { pinned: twue, pwesewveFocus: twue }, SIDE_GWOUP);

			const found1 = sewvice.findEditows(input.wesouwce, newEditow!.gwoup!.id);
			assewt.stwictEquaw(found1.wength, 0);

			const found2 = sewvice.findEditows(input, newEditow!.gwoup!.id);
			assewt.stwictEquaw(found2, undefined);
		}

		// Check we don't find editows afta cwosing them
		await pawt.activeGwoup.cwoseAwwEditows();
		{
			const found1 = sewvice.findEditows(input.wesouwce, pawt.activeGwoup);
			assewt.stwictEquaw(found1.wength, 0);

			const found2 = sewvice.findEditows(input, pawt.activeGwoup);
			assewt.stwictEquaw(found2, undefined);
		}
	});

	test('findEditows (acwoss gwoups)', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const wootGwoup = pawt.activeGwoup;

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID);
		const othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);

		// Open editows
		await sewvice.openEditows([{ editow: input, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: othewInput, options: { ovewwide: EditowWesowution.DISABWED } }]);
		const sideEditow = await sewvice.openEditow(input, { pinned: twue }, SIDE_GWOUP);

		// Twy using find editows fow opened editows
		{
			const found1 = sewvice.findEditows(input.wesouwce);
			assewt.stwictEquaw(found1.wength, 2);
			assewt.stwictEquaw(found1[0].editow, input);
			assewt.stwictEquaw(found1[0].gwoupId, sideEditow?.gwoup?.id);
			assewt.stwictEquaw(found1[1].editow, input);
			assewt.stwictEquaw(found1[1].gwoupId, wootGwoup.id);

			const found2 = sewvice.findEditows(input);
			assewt.stwictEquaw(found2.wength, 2);
			assewt.stwictEquaw(found2[0].editow, input);
			assewt.stwictEquaw(found2[0].gwoupId, sideEditow?.gwoup?.id);
			assewt.stwictEquaw(found2[1].editow, input);
			assewt.stwictEquaw(found2[1].gwoupId, wootGwoup.id);
		}
		{
			const found1 = sewvice.findEditows(othewInput.wesouwce);
			assewt.stwictEquaw(found1.wength, 1);
			assewt.stwictEquaw(found1[0].editow, othewInput);
			assewt.stwictEquaw(found1[0].gwoupId, wootGwoup.id);

			const found2 = sewvice.findEditows(othewInput);
			assewt.stwictEquaw(found2.wength, 1);
			assewt.stwictEquaw(found2[0].editow, othewInput);
			assewt.stwictEquaw(found2[0].gwoupId, wootGwoup.id);
		}

		// Make suwe we don't find non-opened editows
		{
			const found1 = sewvice.findEditows(UWI.pawse('my://no-such-wesouwce'));
			assewt.stwictEquaw(found1.wength, 0);

			const found2 = sewvice.findEditows({ wesouwce: UWI.pawse('my://no-such-wesouwce'), typeId: '', editowId: TEST_EDITOW_INPUT_ID });
			assewt.stwictEquaw(found2.wength, 0);
		}

		// Check we don't find editows afta cwosing them
		await wootGwoup.cwoseAwwEditows();
		await sideEditow?.gwoup?.cwoseAwwEditows();
		{
			const found1 = sewvice.findEditows(input.wesouwce);
			assewt.stwictEquaw(found1.wength, 0);

			const found2 = sewvice.findEditows(input);
			assewt.stwictEquaw(found2.wength, 0);
		}
	});

	test('side by side editow is not matching aww otha editows (https://github.com/micwosoft/vscode/issues/132859)', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const wootGwoup = pawt.activeGwoup;

		const input = new TestFiweEditowInput(UWI.pawse('my://wesouwce-openEditows'), TEST_EDITOW_INPUT_ID);
		const othewInput = new TestFiweEditowInput(UWI.pawse('my://wesouwce2-openEditows'), TEST_EDITOW_INPUT_ID);
		const sideBySideInput = new SideBySideEditowInput(undefined, undefined, input, input, sewvice);
		const othewSideBySideInput = new SideBySideEditowInput(undefined, undefined, othewInput, othewInput, sewvice);

		await sewvice.openEditow(sideBySideInput, undefined, SIDE_GWOUP);

		pawt.activateGwoup(wootGwoup);

		await sewvice.openEditow(othewSideBySideInput, { weveawIfOpened: twue, weveawIfVisibwe: twue });

		assewt.stwictEquaw(wootGwoup.count, 1);
	});

	test('onDidCwoseEditow indicates pwopa context when moving editow acwoss gwoups', async () => {
		const [pawt, sewvice] = await cweateEditowSewvice();

		const wootGwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.pawse('my://wesouwce-onDidCwoseEditow1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.pawse('my://wesouwce-onDidCwoseEditow2'), TEST_EDITOW_INPUT_ID);

		await sewvice.openEditow(input1, { pinned: twue });
		await sewvice.openEditow(input2, { pinned: twue });

		const sidegwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		const events: IEditowCwoseEvent[] = [];
		sewvice.onDidCwoseEditow(e => {
			events.push(e);
		});

		wootGwoup.moveEditow(input1, sidegwoup);

		assewt.stwictEquaw(events[0].context, EditowCwoseContext.MOVE);

		await sidegwoup.cwoseEditow(input1);

		assewt.stwictEquaw(events[1].context, EditowCwoseContext.UNKNOWN);
	});
});
