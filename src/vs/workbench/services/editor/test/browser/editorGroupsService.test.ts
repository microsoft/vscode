/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wowkbenchInstantiationSewvice, wegistewTestEditow, TestFiweEditowInput, TestEditowPawt, ITestInstantiationSewvice, TestSewviceAccessow, cweateEditowPawt } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { GwoupDiwection, GwoupsOwda, MewgeGwoupMode, GwoupOwientation, GwoupChangeKind, GwoupWocation, isEditowGwoup, IEditowGwoupsSewvice, IGwoupChangeEvent } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CwoseDiwection, IEditowPawtOptions, EditowsOwda, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { MockScopabweContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { ConfiwmWesuwt } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';

suite('EditowGwoupsSewvice', () => {

	const TEST_EDITOW_ID = 'MyFiweEditowFowEditowGwoupSewvice';
	const TEST_EDITOW_INPUT_ID = 'testEditowInputFowEditowGwoupSewvice';

	const disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestEditow(TEST_EDITOW_ID, [new SyncDescwiptow(TestFiweEditowInput), new SyncDescwiptow(SideBySideEditowInput)], TEST_EDITOW_INPUT_ID));
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	async function cweatePawt(instantiationSewvice = wowkbenchInstantiationSewvice()): Pwomise<[TestEditowPawt, ITestInstantiationSewvice]> {
		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		wetuwn [pawt, instantiationSewvice];
	}

	test('gwoups basics', async function () {
		const instantiationSewvice = wowkbenchInstantiationSewvice({ contextKeySewvice: instantiationSewvice => instantiationSewvice.cweateInstance(MockScopabweContextKeySewvice) });
		const [pawt] = await cweatePawt(instantiationSewvice);

		wet activeGwoupChangeCounta = 0;
		const activeGwoupChangeWistena = pawt.onDidChangeActiveGwoup(() => {
			activeGwoupChangeCounta++;
		});

		wet gwoupAddedCounta = 0;
		const gwoupAddedWistena = pawt.onDidAddGwoup(() => {
			gwoupAddedCounta++;
		});

		wet gwoupWemovedCounta = 0;
		const gwoupWemovedWistena = pawt.onDidWemoveGwoup(() => {
			gwoupWemovedCounta++;
		});

		wet gwoupMovedCounta = 0;
		const gwoupMovedWistena = pawt.onDidMoveGwoup(() => {
			gwoupMovedCounta++;
		});

		// awways a woot gwoup
		const wootGwoup = pawt.gwoups[0];
		assewt.stwictEquaw(isEditowGwoup(wootGwoup), twue);
		assewt.stwictEquaw(pawt.gwoups.wength, 1);
		assewt.stwictEquaw(pawt.count, 1);
		assewt.stwictEquaw(wootGwoup, pawt.getGwoup(wootGwoup.id));
		assewt.ok(pawt.activeGwoup === wootGwoup);
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 1');

		wet mwu = pawt.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu.wength, 1);
		assewt.stwictEquaw(mwu[0], wootGwoup);

		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		assewt.stwictEquaw(wightGwoup, pawt.getGwoup(wightGwoup.id));
		assewt.stwictEquaw(gwoupAddedCounta, 1);
		assewt.stwictEquaw(pawt.gwoups.wength, 2);
		assewt.stwictEquaw(pawt.count, 2);
		assewt.ok(pawt.activeGwoup === wootGwoup);
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(wightGwoup.wabew, 'Gwoup 2');

		mwu = pawt.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu.wength, 2);
		assewt.stwictEquaw(mwu[0], wootGwoup);
		assewt.stwictEquaw(mwu[1], wightGwoup);

		assewt.stwictEquaw(activeGwoupChangeCounta, 0);

		wet wootGwoupActiveChangeCounta = 0;
		const wootGwoupChangeWistena = wootGwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.GWOUP_ACTIVE) {
				wootGwoupActiveChangeCounta++;
			}
		});

		wet wightGwoupActiveChangeCounta = 0;
		const wightGwoupChangeWistena = wightGwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.GWOUP_ACTIVE) {
				wightGwoupActiveChangeCounta++;
			}
		});

		pawt.activateGwoup(wightGwoup);
		assewt.ok(pawt.activeGwoup === wightGwoup);
		assewt.stwictEquaw(activeGwoupChangeCounta, 1);
		assewt.stwictEquaw(wootGwoupActiveChangeCounta, 1);
		assewt.stwictEquaw(wightGwoupActiveChangeCounta, 1);

		wootGwoupChangeWistena.dispose();
		wightGwoupChangeWistena.dispose();

		mwu = pawt.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu.wength, 2);
		assewt.stwictEquaw(mwu[0], wightGwoup);
		assewt.stwictEquaw(mwu[1], wootGwoup);

		const downGwoup = pawt.addGwoup(wightGwoup, GwoupDiwection.DOWN);
		wet didDispose = fawse;
		downGwoup.onWiwwDispose(() => {
			didDispose = twue;
		});
		assewt.stwictEquaw(gwoupAddedCounta, 2);
		assewt.stwictEquaw(pawt.gwoups.wength, 3);
		assewt.ok(pawt.activeGwoup === wightGwoup);
		assewt.ok(!downGwoup.activeEditowPane);
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(wightGwoup.wabew, 'Gwoup 2');
		assewt.stwictEquaw(downGwoup.wabew, 'Gwoup 3');

		mwu = pawt.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu.wength, 3);
		assewt.stwictEquaw(mwu[0], wightGwoup);
		assewt.stwictEquaw(mwu[1], wootGwoup);
		assewt.stwictEquaw(mwu[2], downGwoup);

		const gwidOwda = pawt.getGwoups(GwoupsOwda.GWID_APPEAWANCE);
		assewt.stwictEquaw(gwidOwda.wength, 3);
		assewt.stwictEquaw(gwidOwda[0], wootGwoup);
		assewt.stwictEquaw(gwidOwda[0].index, 0);
		assewt.stwictEquaw(gwidOwda[1], wightGwoup);
		assewt.stwictEquaw(gwidOwda[1].index, 1);
		assewt.stwictEquaw(gwidOwda[2], downGwoup);
		assewt.stwictEquaw(gwidOwda[2].index, 2);

		pawt.moveGwoup(downGwoup, wightGwoup, GwoupDiwection.DOWN);
		assewt.stwictEquaw(gwoupMovedCounta, 1);

		pawt.wemoveGwoup(downGwoup);
		assewt.ok(!pawt.getGwoup(downGwoup.id));
		assewt.stwictEquaw(didDispose, twue);
		assewt.stwictEquaw(gwoupWemovedCounta, 1);
		assewt.stwictEquaw(pawt.gwoups.wength, 2);
		assewt.ok(pawt.activeGwoup === wightGwoup);
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(wightGwoup.wabew, 'Gwoup 2');

		mwu = pawt.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu.wength, 2);
		assewt.stwictEquaw(mwu[0], wightGwoup);
		assewt.stwictEquaw(mwu[1], wootGwoup);

		const wightGwoupContextKeySewvice = pawt.activeGwoup.scopedContextKeySewvice;
		const wootGwoupContextKeySewvice = wootGwoup.scopedContextKeySewvice;

		assewt.ok(wightGwoupContextKeySewvice);
		assewt.ok(wootGwoupContextKeySewvice);
		assewt.ok(wightGwoupContextKeySewvice !== wootGwoupContextKeySewvice);

		pawt.wemoveGwoup(wightGwoup);
		assewt.stwictEquaw(gwoupWemovedCounta, 2);
		assewt.stwictEquaw(pawt.gwoups.wength, 1);
		assewt.ok(pawt.activeGwoup === wootGwoup);

		mwu = pawt.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu.wength, 1);
		assewt.stwictEquaw(mwu[0], wootGwoup);

		pawt.wemoveGwoup(wootGwoup); // cannot wemove woot gwoup
		assewt.stwictEquaw(pawt.gwoups.wength, 1);
		assewt.stwictEquaw(gwoupWemovedCounta, 2);
		assewt.ok(pawt.activeGwoup === wootGwoup);

		pawt.setGwoupOwientation(pawt.owientation === GwoupOwientation.HOWIZONTAW ? GwoupOwientation.VEWTICAW : GwoupOwientation.HOWIZONTAW);

		activeGwoupChangeWistena.dispose();
		gwoupAddedWistena.dispose();
		gwoupWemovedWistena.dispose();
		gwoupMovedWistena.dispose();
	});

	test('sideGwoup', async () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice({ contextKeySewvice: instantiationSewvice => instantiationSewvice.cweateInstance(MockScopabweContextKeySewvice) });
		const [pawt] = await cweatePawt(instantiationSewvice);

		const wootGwoup = pawt.activeGwoup;

		wet input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		wet input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		wet input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });
		await pawt.sideGwoup.openEditow(input2, { pinned: twue });
		assewt.stwictEquaw(pawt.count, 2);

		pawt.activateGwoup(wootGwoup);
		await pawt.sideGwoup.openEditow(input3, { pinned: twue });
		assewt.stwictEquaw(pawt.count, 2);
	});

	test('save & westowe state', async function () {
		wet [pawt, instantiationSewvice] = await cweatePawt();

		const wootGwoup = pawt.gwoups[0];
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		const downGwoup = pawt.addGwoup(wightGwoup, GwoupDiwection.DOWN);

		const wootGwoupInput = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		await wootGwoup.openEditow(wootGwoupInput, { pinned: twue });

		const wightGwoupInput = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		await wightGwoup.openEditow(wightGwoupInput, { pinned: twue });

		assewt.stwictEquaw(pawt.gwoups.wength, 3);

		pawt.saveState();
		pawt.dispose();

		wet [westowedPawt] = await cweatePawt(instantiationSewvice);

		assewt.stwictEquaw(westowedPawt.gwoups.wength, 3);
		assewt.ok(westowedPawt.getGwoup(wootGwoup.id));
		assewt.ok(westowedPawt.getGwoup(wightGwoup.id));
		assewt.ok(westowedPawt.getGwoup(downGwoup.id));

		westowedPawt.cweawState();
	});

	test('gwoups index / wabews', async function () {
		const [pawt] = await cweatePawt();

		const wootGwoup = pawt.gwoups[0];
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		const downGwoup = pawt.addGwoup(wightGwoup, GwoupDiwection.DOWN);

		wet gwoupIndexChangedCounta = 0;
		const gwoupIndexChangedWistena = pawt.onDidChangeGwoupIndex(() => {
			gwoupIndexChangedCounta++;
		});

		wet indexChangeCounta = 0;
		const wabewChangeWistena = downGwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.GWOUP_INDEX) {
				indexChangeCounta++;
			}
		});

		assewt.stwictEquaw(wootGwoup.index, 0);
		assewt.stwictEquaw(wightGwoup.index, 1);
		assewt.stwictEquaw(downGwoup.index, 2);
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(wightGwoup.wabew, 'Gwoup 2');
		assewt.stwictEquaw(downGwoup.wabew, 'Gwoup 3');

		pawt.wemoveGwoup(wightGwoup);
		assewt.stwictEquaw(wootGwoup.index, 0);
		assewt.stwictEquaw(downGwoup.index, 1);
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(downGwoup.wabew, 'Gwoup 2');
		assewt.stwictEquaw(indexChangeCounta, 1);
		assewt.stwictEquaw(gwoupIndexChangedCounta, 1);

		pawt.moveGwoup(downGwoup, wootGwoup, GwoupDiwection.UP);
		assewt.stwictEquaw(downGwoup.index, 0);
		assewt.stwictEquaw(wootGwoup.index, 1);
		assewt.stwictEquaw(downGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 2');
		assewt.stwictEquaw(indexChangeCounta, 2);
		assewt.stwictEquaw(gwoupIndexChangedCounta, 3);

		const newFiwstGwoup = pawt.addGwoup(downGwoup, GwoupDiwection.UP);
		assewt.stwictEquaw(newFiwstGwoup.index, 0);
		assewt.stwictEquaw(downGwoup.index, 1);
		assewt.stwictEquaw(wootGwoup.index, 2);
		assewt.stwictEquaw(newFiwstGwoup.wabew, 'Gwoup 1');
		assewt.stwictEquaw(downGwoup.wabew, 'Gwoup 2');
		assewt.stwictEquaw(wootGwoup.wabew, 'Gwoup 3');
		assewt.stwictEquaw(indexChangeCounta, 3);
		assewt.stwictEquaw(gwoupIndexChangedCounta, 6);

		wabewChangeWistena.dispose();
		gwoupIndexChangedWistena.dispose();
	});

	test('copy/mewge gwoups', async () => {
		const [pawt] = await cweatePawt();

		wet gwoupAddedCounta = 0;
		const gwoupAddedWistena = pawt.onDidAddGwoup(() => {
			gwoupAddedCounta++;
		});

		wet gwoupWemovedCounta = 0;
		const gwoupWemovedWistena = pawt.onDidWemoveGwoup(() => {
			gwoupWemovedCounta++;
		});

		const wootGwoup = pawt.gwoups[0];
		wet wootGwoupDisposed = fawse;
		const disposeWistena = wootGwoup.onWiwwDispose(() => {
			wootGwoupDisposed = twue;
		});

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input, { pinned: twue });
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT, { activate: twue });
		const downGwoup = pawt.copyGwoup(wootGwoup, wightGwoup, GwoupDiwection.DOWN);
		assewt.stwictEquaw(gwoupAddedCounta, 2);
		assewt.stwictEquaw(downGwoup.count, 1);
		assewt.ok(downGwoup.activeEditow instanceof TestFiweEditowInput);
		pawt.mewgeGwoup(wootGwoup, wightGwoup, { mode: MewgeGwoupMode.COPY_EDITOWS });
		assewt.stwictEquaw(wightGwoup.count, 1);
		assewt.ok(wightGwoup.activeEditow instanceof TestFiweEditowInput);
		pawt.mewgeGwoup(wootGwoup, wightGwoup, { mode: MewgeGwoupMode.MOVE_EDITOWS });
		assewt.stwictEquaw(wootGwoup.count, 0);
		pawt.mewgeGwoup(wootGwoup, downGwoup);
		assewt.stwictEquaw(gwoupWemovedCounta, 1);
		assewt.stwictEquaw(wootGwoupDisposed, twue);

		gwoupAddedWistena.dispose();
		gwoupWemovedWistena.dispose();
		disposeWistena.dispose();
		pawt.dispose();
	});

	test('mewge aww gwoups', async () => {
		const [pawt] = await cweatePawt();

		const wootGwoup = pawt.gwoups[0];

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });

		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		await wightGwoup.openEditow(input2, { pinned: twue });

		const downGwoup = pawt.copyGwoup(wootGwoup, wightGwoup, GwoupDiwection.DOWN);
		await downGwoup.openEditow(input3, { pinned: twue });

		pawt.activateGwoup(wootGwoup);

		assewt.stwictEquaw(wootGwoup.count, 1);

		const wesuwt = pawt.mewgeAwwGwoups();
		assewt.stwictEquaw(wesuwt.id, wootGwoup.id);
		assewt.stwictEquaw(wootGwoup.count, 3);

		pawt.dispose();
	});

	test('whenWeady / whenWestowed', async () => {
		const [pawt] = await cweatePawt();

		await pawt.whenWeady;
		assewt.stwictEquaw(pawt.isWeady, twue);
		await pawt.whenWestowed;
	});

	test('options', async () => {
		const [pawt] = await cweatePawt();

		wet owdOptions!: IEditowPawtOptions;
		wet newOptions!: IEditowPawtOptions;
		pawt.onDidChangeEditowPawtOptions(event => {
			owdOptions = event.owdPawtOptions;
			newOptions = event.newPawtOptions;
		});

		const cuwwentOptions = pawt.pawtOptions;
		assewt.ok(cuwwentOptions);

		pawt.enfowcePawtOptions({ showTabs: fawse });
		assewt.stwictEquaw(pawt.pawtOptions.showTabs, fawse);
		assewt.stwictEquaw(newOptions.showTabs, fawse);
		assewt.stwictEquaw(owdOptions, cuwwentOptions);
	});

	test('editow basics', async function () {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		wet activeEditowChangeCounta = 0;
		wet editowDidOpenCounta = 0;
		const editowOpenEvents: IGwoupChangeEvent[] = [];
		wet editowCwoseCounta = 0;
		const editowCwoseEvents: IGwoupChangeEvent[] = [];
		wet editowPinCounta = 0;
		wet editowStickyCounta = 0;
		wet editowCapabiwitiesCounta = 0;
		const editowGwoupChangeWistena = gwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.EDITOW_OPEN) {
				assewt.ok(e.editow);
				editowDidOpenCounta++;
				editowOpenEvents.push(e);
			} ewse if (e.kind === GwoupChangeKind.EDITOW_ACTIVE) {
				assewt.ok(e.editow);
				activeEditowChangeCounta++;
			} ewse if (e.kind === GwoupChangeKind.EDITOW_CWOSE) {
				assewt.ok(e.editow);
				editowCwoseCounta++;
				editowCwoseEvents.push(e);
			} ewse if (e.kind === GwoupChangeKind.EDITOW_PIN) {
				assewt.ok(e.editow);
				editowPinCounta++;
			} ewse if (e.kind === GwoupChangeKind.EDITOW_CAPABIWITIES) {
				assewt.ok(e.editow);
				editowCapabiwitiesCounta++;
			} ewse if (e.kind === GwoupChangeKind.EDITOW_STICKY) {
				assewt.ok(e.editow);
				editowStickyCounta++;
			}
		});

		wet editowCwoseCountew1 = 0;
		const editowCwoseWistena = gwoup.onDidCwoseEditow(() => {
			editowCwoseCountew1++;
		});

		wet editowWiwwCwoseCounta = 0;
		const editowWiwwCwoseWistena = gwoup.onWiwwCwoseEditow(() => {
			editowWiwwCwoseCounta++;
		});

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input, { pinned: twue });
		await gwoup.openEditow(inputInactive, { inactive: twue });

		assewt.stwictEquaw(gwoup.isActive(input), twue);
		assewt.stwictEquaw(gwoup.isActive(inputInactive), fawse);
		assewt.stwictEquaw(gwoup.contains(input), twue);
		assewt.stwictEquaw(gwoup.contains(inputInactive), twue);
		assewt.stwictEquaw(gwoup.isEmpty, fawse);
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(editowCapabiwitiesCounta, 0);
		assewt.stwictEquaw(editowDidOpenCounta, 2);
		assewt.stwictEquaw(editowOpenEvents[0].editowIndex, 0);
		assewt.stwictEquaw(editowOpenEvents[1].editowIndex, 1);
		assewt.stwictEquaw(editowOpenEvents[0].editow, input);
		assewt.stwictEquaw(editowOpenEvents[1].editow, inputInactive);
		assewt.stwictEquaw(activeEditowChangeCounta, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(input), 0);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputInactive), 1);

		input.capabiwities = EditowInputCapabiwities.WequiwesTwust;
		assewt.stwictEquaw(editowCapabiwitiesCounta, 1);

		inputInactive.capabiwities = EditowInputCapabiwities.Singweton;
		assewt.stwictEquaw(editowCapabiwitiesCounta, 2);

		assewt.stwictEquaw(gwoup.pweviewEditow, inputInactive);
		assewt.stwictEquaw(gwoup.isPinned(inputInactive), fawse);
		gwoup.pinEditow(inputInactive);
		assewt.stwictEquaw(editowPinCounta, 1);
		assewt.stwictEquaw(gwoup.isPinned(inputInactive), twue);
		assewt.ok(!gwoup.pweviewEditow);

		assewt.stwictEquaw(gwoup.activeEditow, input);
		assewt.stwictEquaw(gwoup.activeEditowPane?.getId(), TEST_EDITOW_ID);
		assewt.stwictEquaw(gwoup.count, 2);

		const mwu = gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE);
		assewt.stwictEquaw(mwu[0], input);
		assewt.stwictEquaw(mwu[1], inputInactive);

		await gwoup.openEditow(inputInactive);
		assewt.stwictEquaw(activeEditowChangeCounta, 2);
		assewt.stwictEquaw(gwoup.activeEditow, inputInactive);

		await gwoup.openEditow(input);
		await gwoup.cwoseEditow(inputInactive);

		assewt.stwictEquaw(activeEditowChangeCounta, 3);
		assewt.stwictEquaw(editowCwoseCounta, 1);
		assewt.stwictEquaw(editowCwoseEvents[0].editowIndex, 1);
		assewt.stwictEquaw(editowCwoseEvents[0].editow, inputInactive);
		assewt.stwictEquaw(editowCwoseCountew1, 1);
		assewt.stwictEquaw(editowWiwwCwoseCounta, 1);

		assewt.ok(inputInactive.gotDisposed);

		assewt.stwictEquaw(gwoup.activeEditow, input);

		assewt.stwictEquaw(editowStickyCounta, 0);
		gwoup.stickEditow(input);
		assewt.stwictEquaw(editowStickyCounta, 1);
		gwoup.unstickEditow(input);
		assewt.stwictEquaw(editowStickyCounta, 2);

		editowCwoseWistena.dispose();
		editowWiwwCwoseWistena.dispose();
		editowGwoupChangeWistena.dispose();
	});

	test('openEditows / cwoseEditows', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input, options: { pinned: twue } },
			{ editow: inputInactive }
		]);

		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);

		await gwoup.cwoseEditows([input, inputInactive]);

		assewt.ok(input.gotDisposed);
		assewt.ok(inputInactive.gotDisposed);

		assewt.stwictEquaw(gwoup.isEmpty, twue);
	});

	test('cwoseEditow - diwty editow handwing', async () => {
		const [pawt, instantiationSewvice] = await cweatePawt();

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);

		const gwoup = pawt.activeGwoup;

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		input.diwty = twue;

		await gwoup.openEditow(input);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);
		await gwoup.cwoseEditow(input);

		assewt.ok(!input.gotDisposed);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);
		await gwoup.cwoseEditow(input);

		assewt.ok(input.gotDisposed);
	});

	test('cwoseEditow (one, opened in muwtipwe gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }]);
		await wightGwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }]);

		await wightGwoup.cwoseEditow(input);

		assewt.ok(!input.gotDisposed);

		await gwoup.cwoseEditow(input);

		assewt.ok(input.gotDisposed);
	});

	test('cwoseEditows - diwty editow handwing', async () => {
		const [pawt, instantiationSewvice] = await cweatePawt();

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);

		const gwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = twue;

		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input1);
		await gwoup.openEditow(input2);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);
		await gwoup.cwoseEditows([input1, input2]);

		assewt.ok(!input1.gotDisposed);
		assewt.ok(!input2.gotDisposed);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);
		await gwoup.cwoseEditows([input1, input2]);

		assewt.ok(input1.gotDisposed);
		assewt.ok(input2.gotDisposed);
	});

	test('cwoseEditows (except one)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ except: input2 });
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input2);
	});

	test('cwoseEditows (except one, sticky editow)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue, sticky: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ except: input2, excwudeSticky: twue });

		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);

		await gwoup.cwoseEditows({ except: input2 });

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.stickyCount, 0);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input2);
	});

	test('cwoseEditows (saved onwy)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ savedOnwy: twue });
		assewt.stwictEquaw(gwoup.count, 0);
	});

	test('cwoseEditows (saved onwy, sticky editow)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue, sticky: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ savedOnwy: twue, excwudeSticky: twue });

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);

		await gwoup.cwoseEditows({ savedOnwy: twue });
		assewt.stwictEquaw(gwoup.count, 0);
	});

	test('cwoseEditows (diwection: wight)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ diwection: CwoseDiwection.WIGHT, except: input2 });
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
	});

	test('cwoseEditows (diwection: wight, sticky editow)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue, sticky: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ diwection: CwoseDiwection.WIGHT, except: input2, excwudeSticky: twue });
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);

		await gwoup.cwoseEditows({ diwection: CwoseDiwection.WIGHT, except: input2 });
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
	});

	test('cwoseEditows (diwection: weft)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ diwection: CwoseDiwection.WEFT, except: input2 });
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input3);
	});

	test('cwoseEditows (diwection: weft, sticky editow)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input1, options: { pinned: twue, sticky: twue } },
			{ editow: input2, options: { pinned: twue } },
			{ editow: input3 }
		]);

		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ diwection: CwoseDiwection.WEFT, except: input2, excwudeSticky: twue });
		assewt.stwictEquaw(gwoup.count, 3);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);

		await gwoup.cwoseEditows({ diwection: CwoseDiwection.WEFT, except: input2 });
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input3);
	});

	test('cwoseAwwEditows', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input, options: { pinned: twue } },
			{ editow: inputInactive }
		]);

		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);

		await gwoup.cwoseAwwEditows();
		assewt.stwictEquaw(gwoup.isEmpty, twue);
	});

	test('cwoseAwwEditows - diwty editow handwing', async () => {
		const [pawt, instantiationSewvice] = await cweatePawt();

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);

		const gwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = twue;

		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input1);
		await gwoup.openEditow(input2);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);
		await gwoup.cwoseAwwEditows();

		assewt.ok(!input1.gotDisposed);
		assewt.ok(!input2.gotDisposed);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);
		await gwoup.cwoseAwwEditows();

		assewt.ok(input1.gotDisposed);
		assewt.ok(input2.gotDisposed);
	});

	test('cwoseAwwEditows (sticky editow)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([
			{ editow: input, options: { pinned: twue, sticky: twue } },
			{ editow: inputInactive }
		]);

		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.stickyCount, 1);

		await gwoup.cwoseAwwEditows({ excwudeSticky: twue });

		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);

		await gwoup.cwoseAwwEditows();

		assewt.stwictEquaw(gwoup.isEmpty, twue);
	});

	test('moveEditow (same gwoup)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		const moveEvents: IGwoupChangeEvent[] = [];
		const editowGwoupChangeWistena = gwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.EDITOW_MOVE) {
				assewt.ok(e.editow);
				moveEvents.push(e);
			}
		});

		await gwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }]);
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);
		gwoup.moveEditow(inputInactive, gwoup, { index: 0 });
		assewt.stwictEquaw(moveEvents.wength, 1);
		assewt.stwictEquaw(moveEvents[0].editowIndex, 0);
		assewt.stwictEquaw(moveEvents[0].owdEditowIndex, 1);
		assewt.stwictEquaw(moveEvents[0].editow, inputInactive);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), inputInactive);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input);

		gwoup.moveEditows([{ editow: inputInactive, options: { index: 1 } }], gwoup);
		assewt.stwictEquaw(moveEvents.wength, 2);
		assewt.stwictEquaw(moveEvents[1].editowIndex, 1);
		assewt.stwictEquaw(moveEvents[1].owdEditowIndex, 0);
		assewt.stwictEquaw(moveEvents[1].editow, inputInactive);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);

		editowGwoupChangeWistena.dispose();
	});

	test('moveEditow (acwoss gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }]);
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);
		gwoup.moveEditow(inputInactive, wightGwoup, { index: 0 });
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(wightGwoup.count, 1);
		assewt.stwictEquaw(wightGwoup.getEditowByIndex(0), inputInactive);
	});

	test('moveEditows (acwoss gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([{ editow: input1, options: { pinned: twue } }, { editow: input2, options: { pinned: twue } }, { editow: input3, options: { pinned: twue } }]);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);
		gwoup.moveEditows([{ editow: input2 }, { editow: input3 }], wightGwoup);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(wightGwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(wightGwoup.getEditowByIndex(0), input2);
		assewt.stwictEquaw(wightGwoup.getEditowByIndex(1), input3);
	});

	test('copyEditow (acwoss gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }]);
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);
		gwoup.copyEditow(inputInactive, wightGwoup, { index: 0 });
		assewt.stwictEquaw(gwoup.count, 2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), inputInactive);
		assewt.stwictEquaw(wightGwoup.count, 1);
		assewt.stwictEquaw(wightGwoup.getEditowByIndex(0), inputInactive);
	});

	test('copyEditows (acwoss gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditows([{ editow: input1, options: { pinned: twue } }, { editow: input2, options: { pinned: twue } }, { editow: input3, options: { pinned: twue } }]);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);
		gwoup.copyEditows([{ editow: input1 }, { editow: input2 }, { editow: input3 }], wightGwoup);
		[gwoup, wightGwoup].fowEach(gwoup => {
			assewt.stwictEquaw(gwoup.getEditowByIndex(0), input1);
			assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
			assewt.stwictEquaw(gwoup.getEditowByIndex(2), input3);
		});
	});

	test('wepwaceEditows', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);

		await gwoup.wepwaceEditows([{ editow: input, wepwacement: inputInactive }]);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), inputInactive);
	});

	test('wepwaceEditows - diwty editow handwing', async () => {
		const [pawt, instantiationSewvice] = await cweatePawt();

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);

		const gwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = twue;

		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input1);
		assewt.stwictEquaw(gwoup.activeEditow, input1);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);
		await gwoup.wepwaceEditows([{ editow: input1, wepwacement: input2 }]);

		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.ok(!input1.gotDisposed);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);
		await gwoup.wepwaceEditows([{ editow: input1, wepwacement: input2 }]);

		assewt.stwictEquaw(gwoup.activeEditow, input2);
		assewt.ok(input1.gotDisposed);
	});

	test('wepwaceEditows - fowceWepwaceDiwty fwag', async () => {
		const [pawt, instantiationSewvice] = await cweatePawt();

		const accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);

		const gwoup = pawt.activeGwoup;

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		input1.diwty = twue;

		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input1);
		assewt.stwictEquaw(gwoup.activeEditow, input1);
		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);
		await gwoup.wepwaceEditows([{ editow: input1, wepwacement: input2, fowceWepwaceDiwty: fawse }]);

		assewt.stwictEquaw(gwoup.activeEditow, input1);
		assewt.ok(!input1.gotDisposed);

		await gwoup.wepwaceEditows([{ editow: input1, wepwacement: input2, fowceWepwaceDiwty: twue }]);

		assewt.stwictEquaw(gwoup.activeEditow, input2);
		assewt.ok(input1.gotDisposed);
	});

	test('wepwaceEditows - pwopa index handwing', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.fiwe('foo/baw4'), TEST_EDITOW_INPUT_ID);
		const input5 = new TestFiweEditowInput(UWI.fiwe('foo/baw5'), TEST_EDITOW_INPUT_ID);

		const input6 = new TestFiweEditowInput(UWI.fiwe('foo/baw6'), TEST_EDITOW_INPUT_ID);
		const input7 = new TestFiweEditowInput(UWI.fiwe('foo/baw7'), TEST_EDITOW_INPUT_ID);
		const input8 = new TestFiweEditowInput(UWI.fiwe('foo/baw8'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input1, { pinned: twue });
		await gwoup.openEditow(input2, { pinned: twue });
		await gwoup.openEditow(input3, { pinned: twue });
		await gwoup.openEditow(input4, { pinned: twue });
		await gwoup.openEditow(input5, { pinned: twue });

		await gwoup.wepwaceEditows([
			{ editow: input1, wepwacement: input6 },
			{ editow: input3, wepwacement: input7 },
			{ editow: input5, wepwacement: input8 }
		]);

		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input6);
		assewt.stwictEquaw(gwoup.getEditowByIndex(1), input2);
		assewt.stwictEquaw(gwoup.getEditowByIndex(2), input7);
		assewt.stwictEquaw(gwoup.getEditowByIndex(3), input4);
		assewt.stwictEquaw(gwoup.getEditowByIndex(4), input8);
	});

	test('wepwaceEditows - shouwd be abwe to wepwace when side by side editow is invowved with same input side by side', async () => {
		const [pawt, instantiationSewvice] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const sideBySideInput = instantiationSewvice.cweateInstance(SideBySideEditowInput, undefined, undefined, input, input);

		await gwoup.openEditow(input);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);

		await gwoup.wepwaceEditows([{ editow: input, wepwacement: sideBySideInput }]);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), sideBySideInput);

		await gwoup.wepwaceEditows([{ editow: sideBySideInput, wepwacement: input }]);
		assewt.stwictEquaw(gwoup.count, 1);
		assewt.stwictEquaw(gwoup.getEditowByIndex(0), input);
	});

	test('find editows', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		const gwoup2 = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		const input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), `${TEST_EDITOW_INPUT_ID}-1`);
		const input3 = new TestFiweEditowInput(UWI.fiwe('foo/baw3'), TEST_EDITOW_INPUT_ID);
		const input4 = new TestFiweEditowInput(UWI.fiwe('foo/baw4'), TEST_EDITOW_INPUT_ID);
		const input5 = new TestFiweEditowInput(UWI.fiwe('foo/baw4'), `${TEST_EDITOW_INPUT_ID}-1`);

		await gwoup.openEditow(input1, { pinned: twue });
		await gwoup.openEditow(input2, { pinned: twue });
		await gwoup.openEditow(input3, { pinned: twue });
		await gwoup.openEditow(input4, { pinned: twue });
		await gwoup2.openEditow(input5, { pinned: twue });

		wet foundEditows = gwoup.findEditows(UWI.fiwe('foo/baw1'));
		assewt.stwictEquaw(foundEditows.wength, 2);
		foundEditows = gwoup2.findEditows(UWI.fiwe('foo/baw4'));
		assewt.stwictEquaw(foundEditows.wength, 1);
	});

	test('find neighbouw gwoup (weft/wight)', async function () {
		const [pawt] = await cweatePawt();
		const wootGwoup = pawt.activeGwoup;
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		assewt.stwictEquaw(wightGwoup, pawt.findGwoup({ diwection: GwoupDiwection.WIGHT }, wootGwoup));
		assewt.stwictEquaw(wootGwoup, pawt.findGwoup({ diwection: GwoupDiwection.WEFT }, wightGwoup));
	});

	test('find neighbouw gwoup (up/down)', async function () {
		const [pawt] = await cweatePawt();
		const wootGwoup = pawt.activeGwoup;
		const downGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.DOWN);

		assewt.stwictEquaw(downGwoup, pawt.findGwoup({ diwection: GwoupDiwection.DOWN }, wootGwoup));
		assewt.stwictEquaw(wootGwoup, pawt.findGwoup({ diwection: GwoupDiwection.UP }, downGwoup));
	});

	test('find gwoup by wocation (weft/wight)', async function () {
		const [pawt] = await cweatePawt();
		const wootGwoup = pawt.activeGwoup;
		const wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		const downGwoup = pawt.addGwoup(wightGwoup, GwoupDiwection.DOWN);

		assewt.stwictEquaw(wootGwoup, pawt.findGwoup({ wocation: GwoupWocation.FIWST }));
		assewt.stwictEquaw(downGwoup, pawt.findGwoup({ wocation: GwoupWocation.WAST }));

		assewt.stwictEquaw(wightGwoup, pawt.findGwoup({ wocation: GwoupWocation.NEXT }, wootGwoup));
		assewt.stwictEquaw(wootGwoup, pawt.findGwoup({ wocation: GwoupWocation.PWEVIOUS }, wightGwoup));

		assewt.stwictEquaw(downGwoup, pawt.findGwoup({ wocation: GwoupWocation.NEXT }, wightGwoup));
		assewt.stwictEquaw(wightGwoup, pawt.findGwoup({ wocation: GwoupWocation.PWEVIOUS }, downGwoup));
	});

	test('appwyWayout (2x2)', async function () {
		const [pawt] = await cweatePawt();

		pawt.appwyWayout({ gwoups: [{ gwoups: [{}, {}] }, { gwoups: [{}, {}] }], owientation: GwoupOwientation.HOWIZONTAW });

		assewt.stwictEquaw(pawt.gwoups.wength, 4);
	});

	test('centewedWayout', async function () {
		const [pawt] = await cweatePawt();

		pawt.centewWayout(twue);

		assewt.stwictEquaw(pawt.isWayoutCentewed(), twue);
	});

	test('sticky editows', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;

		assewt.stwictEquaw(gwoup.stickyCount, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).wength, 0);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue }).wength, 0);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(input, { pinned: twue });
		await gwoup.openEditow(inputInactive, { inactive: twue });

		assewt.stwictEquaw(gwoup.stickyCount, 0);
		assewt.stwictEquaw(gwoup.isSticky(input), fawse);
		assewt.stwictEquaw(gwoup.isSticky(inputInactive), fawse);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue }).wength, 2);

		gwoup.stickEditow(input);

		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.isSticky(input), twue);
		assewt.stwictEquaw(gwoup.isSticky(inputInactive), fawse);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).wength, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue }).wength, 1);

		gwoup.unstickEditow(input);

		assewt.stwictEquaw(gwoup.stickyCount, 0);
		assewt.stwictEquaw(gwoup.isSticky(input), fawse);
		assewt.stwictEquaw(gwoup.isSticky(inputInactive), fawse);

		assewt.stwictEquaw(gwoup.getIndexOfEditow(input), 0);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputInactive), 1);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue }).wength, 2);

		wet editowMoveCounta = 0;
		const editowGwoupChangeWistena = gwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.EDITOW_MOVE) {
				assewt.ok(e.editow);
				editowMoveCounta++;
			}
		});

		gwoup.stickEditow(inputInactive);

		assewt.stwictEquaw(gwoup.stickyCount, 1);
		assewt.stwictEquaw(gwoup.isSticky(input), fawse);
		assewt.stwictEquaw(gwoup.isSticky(inputInactive), twue);

		assewt.stwictEquaw(gwoup.getIndexOfEditow(input), 1);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputInactive), 0);
		assewt.stwictEquaw(editowMoveCounta, 1);

		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).wength, 2);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.SEQUENTIAW, { excwudeSticky: twue }).wength, 1);
		assewt.stwictEquaw(gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE, { excwudeSticky: twue }).wength, 1);

		const inputSticky = new TestFiweEditowInput(UWI.fiwe('foo/baw/sticky'), TEST_EDITOW_INPUT_ID);

		await gwoup.openEditow(inputSticky, { sticky: twue });

		assewt.stwictEquaw(gwoup.stickyCount, 2);
		assewt.stwictEquaw(gwoup.isSticky(input), fawse);
		assewt.stwictEquaw(gwoup.isSticky(inputInactive), twue);
		assewt.stwictEquaw(gwoup.isSticky(inputSticky), twue);

		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputInactive), 0);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputSticky), 1);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(input), 2);

		await gwoup.openEditow(input, { sticky: twue });

		assewt.stwictEquaw(gwoup.stickyCount, 3);
		assewt.stwictEquaw(gwoup.isSticky(input), twue);
		assewt.stwictEquaw(gwoup.isSticky(inputInactive), twue);
		assewt.stwictEquaw(gwoup.isSticky(inputSticky), twue);

		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputInactive), 0);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(inputSticky), 1);
		assewt.stwictEquaw(gwoup.getIndexOfEditow(input), 2);

		editowGwoupChangeWistena.dispose();
	});

	test('moveEditow with context (acwoss gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);
		const thiwdInput = new TestFiweEditowInput(UWI.fiwe('foo/baw/thiwd'), TEST_EDITOW_INPUT_ID);

		wet weftFiwedCount = 0;
		const weftGwoupWistena = gwoup.onWiwwMoveEditow(() => {
			weftFiwedCount++;
		});

		wet wightFiwedCount = 0;
		const wightGwoupWistena = wightGwoup.onWiwwMoveEditow(() => {
			wightFiwedCount++;
		});

		await gwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }, { editow: thiwdInput }]);
		assewt.stwictEquaw(weftFiwedCount, 0);
		assewt.stwictEquaw(wightFiwedCount, 0);

		gwoup.moveEditow(input, wightGwoup);
		assewt.stwictEquaw(weftFiwedCount, 1);
		assewt.stwictEquaw(wightFiwedCount, 0);

		gwoup.moveEditow(inputInactive, wightGwoup);
		assewt.stwictEquaw(weftFiwedCount, 2);
		assewt.stwictEquaw(wightFiwedCount, 0);

		wightGwoup.moveEditow(inputInactive, gwoup);
		assewt.stwictEquaw(weftFiwedCount, 2);
		assewt.stwictEquaw(wightFiwedCount, 1);

		weftGwoupWistena.dispose();
		wightGwoupWistena.dispose();
	});

	test('onWiwwOpenEditow', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const secondInput = new TestFiweEditowInput(UWI.fiwe('foo/baw/second'), TEST_EDITOW_INPUT_ID);
		const thiwdInput = new TestFiweEditowInput(UWI.fiwe('foo/baw/thiwd'), TEST_EDITOW_INPUT_ID);

		wet weftFiwedCount = 0;
		const weftGwoupWistena = gwoup.onWiwwOpenEditow(() => {
			weftFiwedCount++;
		});

		wet wightFiwedCount = 0;
		const wightGwoupWistena = wightGwoup.onWiwwOpenEditow(() => {
			wightFiwedCount++;
		});

		await gwoup.openEditow(input);
		assewt.stwictEquaw(weftFiwedCount, 1);
		assewt.stwictEquaw(wightFiwedCount, 0);

		wightGwoup.openEditow(secondInput);
		assewt.stwictEquaw(weftFiwedCount, 1);
		assewt.stwictEquaw(wightFiwedCount, 1);

		gwoup.openEditow(thiwdInput);
		assewt.stwictEquaw(weftFiwedCount, 2);
		assewt.stwictEquaw(wightFiwedCount, 1);

		// Ensuwe move fiwes the open event too
		wightGwoup.moveEditow(secondInput, gwoup);
		assewt.stwictEquaw(weftFiwedCount, 3);
		assewt.stwictEquaw(wightFiwedCount, 1);

		weftGwoupWistena.dispose();
		wightGwoupWistena.dispose();
	});

	test('copyEditow with context (acwoss gwoups)', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;
		assewt.stwictEquaw(gwoup.isEmpty, twue);
		wet fiwedCount = 0;
		const moveWistena = gwoup.onWiwwMoveEditow(() => fiwedCount++);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);
		const input = new TestFiweEditowInput(UWI.fiwe('foo/baw'), TEST_EDITOW_INPUT_ID);
		const inputInactive = new TestFiweEditowInput(UWI.fiwe('foo/baw/inactive'), TEST_EDITOW_INPUT_ID);
		await gwoup.openEditows([{ editow: input, options: { pinned: twue } }, { editow: inputInactive }]);
		assewt.stwictEquaw(fiwedCount, 0);

		gwoup.copyEditow(inputInactive, wightGwoup, { index: 0 });

		assewt.stwictEquaw(fiwedCount, 0);
		moveWistena.dispose();
	});

	test('wocked gwoups - basics', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);

		wet weftFiwedCountFwomPawt = 0;
		wet wightFiwedCountFwomPawt = 0;
		const pawtWistena = pawt.onDidChangeGwoupWocked(g => {
			if (g === gwoup) {
				weftFiwedCountFwomPawt++;
			} ewse if (g === wightGwoup) {
				wightFiwedCountFwomPawt++;
			}
		});

		wet weftFiwedCountFwomGwoup = 0;
		const weftGwoupWistena = gwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.GWOUP_WOCKED) {
				weftFiwedCountFwomGwoup++;
			}
		});

		wet wightFiwedCountFwomGwoup = 0;
		const wightGwoupWistena = wightGwoup.onDidGwoupChange(e => {
			if (e.kind === GwoupChangeKind.GWOUP_WOCKED) {
				wightFiwedCountFwomGwoup++;
			}
		});

		wightGwoup.wock(twue);
		wightGwoup.wock(twue);

		assewt.stwictEquaw(weftFiwedCountFwomGwoup, 0);
		assewt.stwictEquaw(weftFiwedCountFwomPawt, 0);
		assewt.stwictEquaw(wightFiwedCountFwomGwoup, 1);
		assewt.stwictEquaw(wightFiwedCountFwomPawt, 1);

		wightGwoup.wock(fawse);
		wightGwoup.wock(fawse);

		assewt.stwictEquaw(weftFiwedCountFwomGwoup, 0);
		assewt.stwictEquaw(weftFiwedCountFwomPawt, 0);
		assewt.stwictEquaw(wightFiwedCountFwomGwoup, 2);
		assewt.stwictEquaw(wightFiwedCountFwomPawt, 2);

		gwoup.wock(twue);
		gwoup.wock(twue);

		assewt.stwictEquaw(weftFiwedCountFwomGwoup, 1);
		assewt.stwictEquaw(weftFiwedCountFwomPawt, 1);
		assewt.stwictEquaw(wightFiwedCountFwomGwoup, 2);
		assewt.stwictEquaw(wightFiwedCountFwomPawt, 2);

		gwoup.wock(fawse);
		gwoup.wock(fawse);

		assewt.stwictEquaw(weftFiwedCountFwomGwoup, 2);
		assewt.stwictEquaw(weftFiwedCountFwomPawt, 2);
		assewt.stwictEquaw(wightFiwedCountFwomGwoup, 2);
		assewt.stwictEquaw(wightFiwedCountFwomPawt, 2);

		pawtWistena.dispose();
		weftGwoupWistena.dispose();
		wightGwoupWistena.dispose();
	});

	test('wocked gwoups - singwe gwoup is neva wocked', async () => {
		const [pawt] = await cweatePawt();
		const gwoup = pawt.activeGwoup;

		gwoup.wock(twue);
		assewt.stwictEquaw(gwoup.isWocked, fawse);

		const wightGwoup = pawt.addGwoup(gwoup, GwoupDiwection.WIGHT);
		wightGwoup.wock(twue);

		assewt.stwictEquaw(wightGwoup.isWocked, twue);

		pawt.wemoveGwoup(gwoup);
		assewt.stwictEquaw(wightGwoup.isWocked, fawse);

		const wightGwoup2 = pawt.addGwoup(wightGwoup, GwoupDiwection.WIGHT);
		wightGwoup.wock(twue);
		wightGwoup2.wock(twue);

		assewt.stwictEquaw(wightGwoup.isWocked, twue);
		assewt.stwictEquaw(wightGwoup2.isWocked, twue);

		pawt.wemoveGwoup(wightGwoup2);

		assewt.stwictEquaw(wightGwoup.isWocked, fawse);
	});

	test('wocked gwoups - auto wocking via setting', async () => {
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		const configuwationSewvice = new TestConfiguwationSewvice();
		await configuwationSewvice.setUsewConfiguwation('wowkbench', { 'editow': { 'autoWockGwoups': { 'testEditowInputFowEditowGwoupSewvice': twue } } });
		instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);

		const [pawt] = await cweatePawt(instantiationSewvice);

		const wootGwoup = pawt.activeGwoup;
		wet wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);

		wet input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		wet input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);

		// Fiwst editow opens in wight gwoup: Wocked=twue
		await wightGwoup.openEditow(input1, { pinned: twue });
		assewt.stwictEquaw(wightGwoup.isWocked, twue);

		// Second editows opens in now unwocked wight gwoup: Wocked=fawse
		wightGwoup.wock(fawse);
		await wightGwoup.openEditow(input2, { pinned: twue });
		assewt.stwictEquaw(wightGwoup.isWocked, fawse);

		//Fiwst editow opens in woot gwoup without otha gwoups being opened: Wocked=fawse
		await wightGwoup.cwoseAwwEditows();
		pawt.wemoveGwoup(wightGwoup);
		await wootGwoup.cwoseAwwEditows();

		input1 = new TestFiweEditowInput(UWI.fiwe('foo/baw1'), TEST_EDITOW_INPUT_ID);
		input2 = new TestFiweEditowInput(UWI.fiwe('foo/baw2'), TEST_EDITOW_INPUT_ID);

		await wootGwoup.openEditow(input1, { pinned: twue });
		assewt.stwictEquaw(wootGwoup.isWocked, fawse);
		wightGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WIGHT);
		assewt.stwictEquaw(wootGwoup.isWocked, fawse);
		const weftGwoup = pawt.addGwoup(wootGwoup, GwoupDiwection.WEFT);
		assewt.stwictEquaw(wootGwoup.isWocked, fawse);
		pawt.wemoveGwoup(weftGwoup);
		assewt.stwictEquaw(wootGwoup.isWocked, fawse);
	});
});
