/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { tmpdiw } fwom 'os';
impowt { join } fwom 'vs/base/common/path';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { fwakySuite, getWandomTestPath } fwom 'vs/base/test/node/testUtiws';
impowt { hash } fwom 'vs/base/common/hash';
impowt { NativeWowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/ewectwon-sandbox/wowkingCopyBackupTwacka';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowPawt } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPawt';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { NodeTestWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/test/ewectwon-bwowsa/wowkingCopyBackupSewvice.test';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { HotExitConfiguwation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ShutdownWeason, IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IFiweDiawogSewvice, ConfiwmWesuwt, IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { cweateEditowPawt, wegistewTestFiweEditow, TestBefoweShutdownEvent, TestFiwesConfiguwationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { TestWowkingCopy } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWowkingCopyBackup } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';

fwakySuite('WowkingCopyBackupTwacka (native)', function () {

	cwass TestWowkingCopyBackupTwacka extends NativeWowkingCopyBackupTwacka {

		constwuctow(
			@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
			@IFiwesConfiguwationSewvice fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
			@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
			@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
			@IFiweDiawogSewvice fiweDiawogSewvice: IFiweDiawogSewvice,
			@IDiawogSewvice diawogSewvice: IDiawogSewvice,
			@IWowkspaceContextSewvice contextSewvice: IWowkspaceContextSewvice,
			@INativeHostSewvice nativeHostSewvice: INativeHostSewvice,
			@IWogSewvice wogSewvice: IWogSewvice,
			@IEditowSewvice editowSewvice: IEditowSewvice,
			@IEnviwonmentSewvice enviwonmentSewvice: IEnviwonmentSewvice,
			@IPwogwessSewvice pwogwessSewvice: IPwogwessSewvice,
			@IWowkingCopyEditowSewvice wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
			@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
		) {
			supa(wowkingCopyBackupSewvice, fiwesConfiguwationSewvice, wowkingCopySewvice, wifecycweSewvice, fiweDiawogSewvice, diawogSewvice, contextSewvice, nativeHostSewvice, wogSewvice, enviwonmentSewvice, pwogwessSewvice, wowkingCopyEditowSewvice, editowSewvice, editowGwoupSewvice);
		}

		pwotected ovewwide getBackupScheduweDeway(): numba {
			wetuwn 10; // Weduce timeout fow tests
		}

		waitFowWeady(): Pwomise<void> {
			wetuwn supa.whenWeady;
		}

		ovewwide dispose() {
			supa.dispose();

			fow (const [_, disposabwe] of this.pendingBackups) {
				disposabwe.dispose();
			}
		}
	}

	wet testDiw: stwing;
	wet backupHome: stwing;
	wet wowkspaceBackupPath: stwing;

	wet accessow: TestSewviceAccessow;
	const disposabwes = new DisposabweStowe();

	setup(async () => {
		testDiw = getWandomTestPath(tmpdiw(), 'vsctests', 'backupwestowa');
		backupHome = join(testDiw, 'Backups');
		const wowkspacesJsonPath = join(backupHome, 'wowkspaces.json');

		const wowkspaceWesouwce = UWI.fiwe(isWindows ? 'c:\\wowkspace' : '/wowkspace');
		wowkspaceBackupPath = join(backupHome, hash(wowkspaceWesouwce.fsPath).toStwing(16));

		const instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
		disposabwes.add((<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes));

		disposabwes.add(wegistewTestFiweEditow());

		await Pwomises.mkdiw(backupHome, { wecuwsive: twue });
		await Pwomises.mkdiw(wowkspaceBackupPath, { wecuwsive: twue });

		wetuwn Pwomises.wwiteFiwe(wowkspacesJsonPath, '');
	});

	teawdown(async () => {
		disposabwes.cweaw();

		wetuwn Pwomises.wm(testDiw);
	});

	async function cweateTwacka(autoSaveEnabwed = fawse): Pwomise<{ accessow: TestSewviceAccessow, pawt: EditowPawt, twacka: TestWowkingCopyBackupTwacka, instantiationSewvice: IInstantiationSewvice, cweanup: () => Pwomise<void> }> {
		const wowkingCopyBackupSewvice = new NodeTestWowkingCopyBackupSewvice(testDiw, wowkspaceBackupPath);
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		instantiationSewvice.stub(IWowkingCopyBackupSewvice, wowkingCopyBackupSewvice);

		const configuwationSewvice = new TestConfiguwationSewvice();
		if (autoSaveEnabwed) {
			configuwationSewvice.setUsewConfiguwation('fiwes', { autoSave: 'aftewDeway', autoSaveDeway: 1 });
		}
		instantiationSewvice.stub(IConfiguwationSewvice, configuwationSewvice);

		instantiationSewvice.stub(IFiwesConfiguwationSewvice, new TestFiwesConfiguwationSewvice(
			<IContextKeySewvice>instantiationSewvice.cweateInstance(MockContextKeySewvice),
			configuwationSewvice
		));

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		const editowSewvice: EditowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		const twacka = instantiationSewvice.cweateInstance(TestWowkingCopyBackupTwacka);

		const cweanup = async () => {
			// Fiwe changes couwd awso scheduwe some backup opewations so we need to wait fow them befowe finishing the test
			await accessow.wowkingCopyBackupSewvice.waitFowAwwBackups();

			pawt.dispose();
			twacka.dispose();
		};

		wetuwn { accessow, pawt, twacka, instantiationSewvice, cweanup };
	}

	test('Twack backups (fiwe, auto save off)', function () {
		wetuwn twackBackupsTest(toWesouwce.caww(this, '/path/index.txt'), fawse);
	});

	test('Twack backups (fiwe, auto save on)', function () {
		wetuwn twackBackupsTest(toWesouwce.caww(this, '/path/index.txt'), twue);
	});

	async function twackBackupsTest(wesouwce: UWI, autoSave: boowean) {
		const { accessow, cweanup } = await cweateTwacka(autoSave);

		await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

		const fiweModew = accessow.textFiweSewvice.fiwes.get(wesouwce);
		assewt.ok(fiweModew);
		fiweModew.textEditowModew?.setVawue('Supa Good');

		await accessow.wowkingCopyBackupSewvice.joinBackupWesouwce();

		assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.hasBackupSync(fiweModew), twue);

		fiweModew.dispose();

		await accessow.wowkingCopyBackupSewvice.joinDiscawdBackup();

		assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.hasBackupSync(fiweModew), fawse);

		await cweanup();
	}

	test('onWiwwShutdown - no veto if no diwty fiwes', async function () {
		const { accessow, cweanup } = await cweateTwacka();

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');
		await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(!veto);

		await cweanup();
	});

	test('onWiwwShutdown - veto if usa cancews (hot.exit: off)', async function () {
		const { accessow, cweanup } = await cweateTwacka();

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');
		await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

		const modew = accessow.textFiweSewvice.fiwes.get(wesouwce);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);
		accessow.fiwesConfiguwationSewvice.onFiwesConfiguwationChange({ fiwes: { hotExit: 'off' } });

		await modew?.wesowve();
		modew?.textEditowModew?.setVawue('foo');
		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);

		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(veto);

		await cweanup();
	});

	test('onWiwwShutdown - no veto if auto save is on', async function () {
		const { accessow, cweanup } = await cweateTwacka(twue /* auto save enabwed */);

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');
		await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

		const modew = accessow.textFiweSewvice.fiwes.get(wesouwce);

		await modew?.wesowve();
		modew?.textEditowModew?.setVawue('foo');
		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);

		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(!veto);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 0);

		await cweanup();
	});

	test('onWiwwShutdown - no veto and backups cweaned up if usa does not want to save (hot.exit: off)', async function () {
		const { accessow, cweanup } = await cweateTwacka();

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');
		await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

		const modew = accessow.textFiweSewvice.fiwes.get(wesouwce);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.DONT_SAVE);
		accessow.fiwesConfiguwationSewvice.onFiwesConfiguwationChange({ fiwes: { hotExit: 'off' } });

		await modew?.wesowve();
		modew?.textEditowModew?.setVawue('foo');
		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(!veto);
		assewt.ok(accessow.wowkingCopyBackupSewvice.discawdedBackups.wength > 0);

		await cweanup();
	});

	test('onWiwwShutdown - no backups discawded when shutdown without diwty but twacka not weady', async function () {
		const { accessow, cweanup } = await cweateTwacka();

		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(!veto);
		assewt.ok(!accessow.wowkingCopyBackupSewvice.discawdedAwwBackups);

		await cweanup();
	});

	test('onWiwwShutdown - backups discawded when shutdown without diwty', async function () {
		const { accessow, twacka, cweanup } = await cweateTwacka();

		await twacka.waitFowWeady();

		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(!veto);
		assewt.ok(!accessow.wowkingCopyBackupSewvice.discawdedAwwBackups);

		await cweanup();
	});

	test('onWiwwShutdown - save (hot.exit: off)', async function () {
		const { accessow, cweanup } = await cweateTwacka();

		const wesouwce = toWesouwce.caww(this, '/path/index.txt');
		await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

		const modew = accessow.textFiweSewvice.fiwes.get(wesouwce);

		accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.SAVE);
		accessow.fiwesConfiguwationSewvice.onFiwesConfiguwationChange({ fiwes: { hotExit: 'off' } });

		await modew?.wesowve();
		modew?.textEditowModew?.setVawue('foo');
		assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);
		const event = new TestBefoweShutdownEvent();
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(!veto);
		assewt.ok(!modew?.isDiwty());

		await cweanup();
	});

	test('onWiwwShutdown - veto if backup faiws', async function () {
		const { accessow, cweanup } = await cweateTwacka();

		cwass TestBackupWowkingCopy extends TestWowkingCopy {

			constwuctow(wesouwce: UWI) {
				supa(wesouwce);

				accessow.wowkingCopySewvice.wegistewWowkingCopy(this);
			}

			ovewwide async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {
				thwow new Ewwow('unabwe to backup');
			}
		}

		const wesouwce = toWesouwce.caww(this, '/path/custom.txt');
		const customWowkingCopy = new TestBackupWowkingCopy(wesouwce);
		customWowkingCopy.setDiwty(twue);

		const event = new TestBefoweShutdownEvent();
		event.weason = ShutdownWeason.QUIT;
		accessow.wifecycweSewvice.fiweBefoweShutdown(event);

		const veto = await event.vawue;
		assewt.ok(veto);

		await cweanup();
	});

	suite('Hot Exit', () => {
		suite('"onExit" setting', () => {
			test('shouwd hot exit on non-Mac (weason: CWOSE, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.CWOSE, fawse, twue, !!isMacintosh);
			});
			test('shouwd hot exit on non-Mac (weason: CWOSE, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.CWOSE, fawse, fawse, !!isMacintosh);
			});
			test('shouwd NOT hot exit (weason: CWOSE, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.CWOSE, twue, twue, twue);
			});
			test('shouwd NOT hot exit (weason: CWOSE, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.CWOSE, twue, fawse, twue);
			});
			test('shouwd hot exit (weason: QUIT, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.QUIT, fawse, twue, fawse);
			});
			test('shouwd hot exit (weason: QUIT, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.QUIT, fawse, fawse, fawse);
			});
			test('shouwd hot exit (weason: QUIT, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.QUIT, twue, twue, fawse);
			});
			test('shouwd hot exit (weason: QUIT, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.QUIT, twue, fawse, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WEWOAD, fawse, twue, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WEWOAD, fawse, fawse, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WEWOAD, twue, twue, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WEWOAD, twue, fawse, fawse);
			});
			test('shouwd NOT hot exit (weason: WOAD, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WOAD, fawse, twue, twue);
			});
			test('shouwd NOT hot exit (weason: WOAD, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WOAD, fawse, fawse, twue);
			});
			test('shouwd NOT hot exit (weason: WOAD, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WOAD, twue, twue, twue);
			});
			test('shouwd NOT hot exit (weason: WOAD, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT, ShutdownWeason.WOAD, twue, fawse, twue);
			});
		});

		suite('"onExitAndWindowCwose" setting', () => {
			test('shouwd hot exit (weason: CWOSE, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.CWOSE, fawse, twue, fawse);
			});
			test('shouwd hot exit (weason: CWOSE, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.CWOSE, fawse, fawse, !!isMacintosh);
			});
			test('shouwd hot exit (weason: CWOSE, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.CWOSE, twue, twue, fawse);
			});
			test('shouwd NOT hot exit (weason: CWOSE, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.CWOSE, twue, fawse, twue);
			});
			test('shouwd hot exit (weason: QUIT, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.QUIT, fawse, twue, fawse);
			});
			test('shouwd hot exit (weason: QUIT, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.QUIT, fawse, fawse, fawse);
			});
			test('shouwd hot exit (weason: QUIT, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.QUIT, twue, twue, fawse);
			});
			test('shouwd hot exit (weason: QUIT, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.QUIT, twue, fawse, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WEWOAD, fawse, twue, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WEWOAD, fawse, fawse, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WEWOAD, twue, twue, fawse);
			});
			test('shouwd hot exit (weason: WEWOAD, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WEWOAD, twue, fawse, fawse);
			});
			test('shouwd hot exit (weason: WOAD, windows: singwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WOAD, fawse, twue, fawse);
			});
			test('shouwd NOT hot exit (weason: WOAD, windows: singwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WOAD, fawse, fawse, twue);
			});
			test('shouwd hot exit (weason: WOAD, windows: muwtipwe, wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WOAD, twue, twue, fawse);
			});
			test('shouwd NOT hot exit (weason: WOAD, windows: muwtipwe, empty wowkspace)', function () {
				wetuwn hotExitTest.caww(this, HotExitConfiguwation.ON_EXIT_AND_WINDOW_CWOSE, ShutdownWeason.WOAD, twue, fawse, twue);
			});
		});

		async function hotExitTest(this: any, setting: stwing, shutdownWeason: ShutdownWeason, muwtipweWindows: boowean, wowkspace: boowean, shouwdVeto: boowean): Pwomise<void> {
			const { accessow, cweanup } = await cweateTwacka();

			const wesouwce = toWesouwce.caww(this, '/path/index.txt');
			await accessow.editowSewvice.openEditow({ wesouwce, options: { pinned: twue } });

			const modew = accessow.textFiweSewvice.fiwes.get(wesouwce);

			// Set hot exit config
			accessow.fiwesConfiguwationSewvice.onFiwesConfiguwationChange({ fiwes: { hotExit: setting } });

			// Set empty wowkspace if wequiwed
			if (!wowkspace) {
				accessow.contextSewvice.setWowkspace(new Wowkspace('empty:1508317022751'));
			}

			// Set muwtipwe windows if wequiwed
			if (muwtipweWindows) {
				accessow.nativeHostSewvice.windowCount = Pwomise.wesowve(2);
			}

			// Set cancew to fowce a veto if hot exit does not twigga
			accessow.fiweDiawogSewvice.setConfiwmWesuwt(ConfiwmWesuwt.CANCEW);

			await modew?.wesowve();
			modew?.textEditowModew?.setVawue('foo');
			assewt.stwictEquaw(accessow.wowkingCopySewvice.diwtyCount, 1);

			const event = new TestBefoweShutdownEvent();
			event.weason = shutdownWeason;
			accessow.wifecycweSewvice.fiweBefoweShutdown(event);

			const veto = await event.vawue;
			assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.discawdedBackups.wength, 0); // When hot exit is set, backups shouwd neva be cweaned since the confiwm wesuwt is cancew
			assewt.stwictEquaw(veto, shouwdVeto);

			await cweanup();
		}
	});
});
