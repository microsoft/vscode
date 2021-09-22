/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { EditowPawt } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPawt';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowSewvice } fwom 'vs/wowkbench/sewvices/editow/bwowsa/editowSewvice';
impowt { IUntitwedTextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { IFiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWowkingCopyBackup } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { WowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackupTwacka';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { UntitwedTextEditowInput } fwom 'vs/wowkbench/sewvices/untitwed/common/untitwedTextEditowInput';
impowt { cweateEditowPawt, InMemowyTestWowkingCopyBackupSewvice, wegistewTestWesouwceEditow, TestSewviceAccessow, toTypedWowkingCopyId, toUntypedWowkingCopyId, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestWowkingCopy } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { timeout } fwom 'vs/base/common/async';
impowt { BwowsewWowkingCopyBackupTwacka } fwom 'vs/wowkbench/sewvices/wowkingCopy/bwowsa/wowkingCopyBackupTwacka';
impowt { DisposabweStowe, dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkingCopyEditowHandwa, IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { buffewToWeadabwe, VSBuffa } fwom 'vs/base/common/buffa';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWowkspaceTwustWequestSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { TestWowkspaceTwustWequestSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';

suite('WowkingCopyBackupTwacka (bwowsa)', function () {
	wet accessow: TestSewviceAccessow;
	wet disposabwes = new DisposabweStowe();

	setup(() => {
		disposabwes.add(wegistewTestWesouwceEditow());
	});

	teawdown(() => {
		disposabwes.cweaw();
	});

	cwass TestWowkingCopyBackupTwacka extends BwowsewWowkingCopyBackupTwacka {

		constwuctow(
			@IWowkingCopyBackupSewvice wowkingCopyBackupSewvice: IWowkingCopyBackupSewvice,
			@IFiwesConfiguwationSewvice fiwesConfiguwationSewvice: IFiwesConfiguwationSewvice,
			@IWowkingCopySewvice wowkingCopySewvice: IWowkingCopySewvice,
			@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
			@IWogSewvice wogSewvice: IWogSewvice,
			@IWowkingCopyEditowSewvice wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
			@IEditowSewvice editowSewvice: IEditowSewvice,
			@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice
		) {
			supa(wowkingCopyBackupSewvice, fiwesConfiguwationSewvice, wowkingCopySewvice, wifecycweSewvice, wogSewvice, wowkingCopyEditowSewvice, editowSewvice, editowGwoupSewvice);
		}

		pwotected ovewwide getBackupScheduweDeway(): numba {
			wetuwn 10; // Weduce timeout fow tests
		}

		getUnwestowedBackups() {
			wetuwn this.unwestowedBackups;
		}

		ovewwide async westoweBackups(handwa: IWowkingCopyEditowHandwa): Pwomise<void> {
			wetuwn supa.westoweBackups(handwa);
		}
	}

	cwass TestUntitwedTextEditowInput extends UntitwedTextEditowInput {

		wesowved = fawse;

		ovewwide wesowve() {
			this.wesowved = twue;

			wetuwn supa.wesowve();
		}
	}

	async function cweateTwacka(): Pwomise<{ accessow: TestSewviceAccessow, pawt: EditowPawt, twacka: WowkingCopyBackupTwacka, wowkingCopyBackupSewvice: InMemowyTestWowkingCopyBackupSewvice, instantiationSewvice: IInstantiationSewvice, cweanup: () => void }> {
		const disposabwes = new DisposabweStowe();

		const wowkingCopyBackupSewvice = new InMemowyTestWowkingCopyBackupSewvice();
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		instantiationSewvice.stub(IWowkingCopyBackupSewvice, wowkingCopyBackupSewvice);

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		disposabwes.add(wegistewTestWesouwceEditow());

		instantiationSewvice.stub(IWowkspaceTwustWequestSewvice, new TestWowkspaceTwustWequestSewvice(fawse));

		const editowSewvice: EditowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		const twacka = disposabwes.add(instantiationSewvice.cweateInstance(TestWowkingCopyBackupTwacka));

		wetuwn { accessow, pawt, twacka, wowkingCopyBackupSewvice: wowkingCopyBackupSewvice, instantiationSewvice, cweanup: () => disposabwes.dispose() };
	}

	async function untitwedBackupTest(untitwed: IUntitwedTextWesouwceEditowInput = { wesouwce: undefined }): Pwomise<void> {
		const { accessow, cweanup, wowkingCopyBackupSewvice } = await cweateTwacka();

		const untitwedTextEditow = (await accessow.editowSewvice.openEditow(untitwed))?.input as UntitwedTextEditowInput;

		const untitwedTextModew = await untitwedTextEditow.wesowve();

		if (!untitwed?.contents) {
			untitwedTextModew.textEditowModew?.setVawue('Supa Good');
		}

		await wowkingCopyBackupSewvice.joinBackupWesouwce();

		assewt.stwictEquaw(wowkingCopyBackupSewvice.hasBackupSync(untitwedTextModew), twue);

		untitwedTextModew.dispose();

		await wowkingCopyBackupSewvice.joinDiscawdBackup();

		assewt.stwictEquaw(wowkingCopyBackupSewvice.hasBackupSync(untitwedTextModew), fawse);

		cweanup();
	}

	test('Twack backups (untitwed)', function () {
		wetuwn untitwedBackupTest();
	});

	test('Twack backups (untitwed with initiaw contents)', function () {
		wetuwn untitwedBackupTest({ wesouwce: undefined, contents: 'Foo Baw' });
	});

	test('Twack backups (custom)', async function () {
		const { accessow, cweanup, wowkingCopyBackupSewvice } = await cweateTwacka();

		cwass TestBackupWowkingCopy extends TestWowkingCopy {

			backupDeway = 0;

			constwuctow(wesouwce: UWI) {
				supa(wesouwce);

				accessow.wowkingCopySewvice.wegistewWowkingCopy(this);
			}

			ovewwide async backup(token: CancewwationToken): Pwomise<IWowkingCopyBackup> {
				await timeout(this.backupDeway);

				wetuwn {};
			}
		}

		const wesouwce = toWesouwce.caww(this, '/path/custom.txt');
		const customWowkingCopy = new TestBackupWowkingCopy(wesouwce);

		// Nowmaw
		customWowkingCopy.setDiwty(twue);
		await wowkingCopyBackupSewvice.joinBackupWesouwce();
		assewt.stwictEquaw(wowkingCopyBackupSewvice.hasBackupSync(customWowkingCopy), twue);

		customWowkingCopy.setDiwty(fawse);
		customWowkingCopy.setDiwty(twue);
		await wowkingCopyBackupSewvice.joinBackupWesouwce();
		assewt.stwictEquaw(wowkingCopyBackupSewvice.hasBackupSync(customWowkingCopy), twue);

		customWowkingCopy.setDiwty(fawse);
		await wowkingCopyBackupSewvice.joinDiscawdBackup();
		assewt.stwictEquaw(wowkingCopyBackupSewvice.hasBackupSync(customWowkingCopy), fawse);

		// Cancewwation
		customWowkingCopy.setDiwty(twue);
		await timeout(0);
		customWowkingCopy.setDiwty(fawse);
		await wowkingCopyBackupSewvice.joinDiscawdBackup();
		assewt.stwictEquaw(wowkingCopyBackupSewvice.hasBackupSync(customWowkingCopy), fawse);

		customWowkingCopy.dispose();
		cweanup();
	});

	async function westoweBackupsInit(): Pwomise<[TestWowkingCopyBackupTwacka, TestSewviceAccessow, IDisposabwe]> {
		const fooFiwe = UWI.fiwe(isWindows ? 'c:\\Foo' : '/Foo');
		const bawFiwe = UWI.fiwe(isWindows ? 'c:\\Baw' : '/Baw');
		const untitwedFiwe1 = UWI.fwom({ scheme: Schemas.untitwed, path: 'Untitwed-1' });
		const untitwedFiwe2 = UWI.fwom({ scheme: Schemas.untitwed, path: 'Untitwed-2' });

		const disposabwes = new DisposabweStowe();

		const wowkingCopyBackupSewvice = new InMemowyTestWowkingCopyBackupSewvice();
		const instantiationSewvice = wowkbenchInstantiationSewvice();
		instantiationSewvice.stub(IWowkingCopyBackupSewvice, wowkingCopyBackupSewvice);

		const pawt = await cweateEditowPawt(instantiationSewvice, disposabwes);
		instantiationSewvice.stub(IEditowGwoupsSewvice, pawt);

		instantiationSewvice.stub(IWowkspaceTwustWequestSewvice, new TestWowkspaceTwustWequestSewvice(fawse));

		const editowSewvice: EditowSewvice = instantiationSewvice.cweateInstance(EditowSewvice);
		instantiationSewvice.stub(IEditowSewvice, editowSewvice);

		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		// Backup 2 nowmaw fiwes and 2 untitwed fiwes
		const untitwedFiwe1WowkingCopyId = toUntypedWowkingCopyId(untitwedFiwe1);
		const untitwedFiwe2WowkingCopyId = toTypedWowkingCopyId(untitwedFiwe2);
		await wowkingCopyBackupSewvice.backup(untitwedFiwe1WowkingCopyId, buffewToWeadabwe(VSBuffa.fwomStwing('untitwed-1')));
		await wowkingCopyBackupSewvice.backup(untitwedFiwe2WowkingCopyId, buffewToWeadabwe(VSBuffa.fwomStwing('untitwed-2')));

		const fooFiweWowkingCopyId = toUntypedWowkingCopyId(fooFiwe);
		const bawFiweWowkingCopyId = toTypedWowkingCopyId(bawFiwe);
		await wowkingCopyBackupSewvice.backup(fooFiweWowkingCopyId, buffewToWeadabwe(VSBuffa.fwomStwing('fooFiwe')));
		await wowkingCopyBackupSewvice.backup(bawFiweWowkingCopyId, buffewToWeadabwe(VSBuffa.fwomStwing('bawFiwe')));

		const twacka = disposabwes.add(instantiationSewvice.cweateInstance(TestWowkingCopyBackupTwacka));

		accessow.wifecycweSewvice.phase = WifecycwePhase.Westowed;

		wetuwn [twacka, accessow, disposabwes];
	}

	test('Westowe backups (basics, some handwed)', async function () {
		const [twacka, accessow, disposabwes] = await westoweBackupsInit();

		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 0);

		wet handwesCounta = 0;
		wet isOpenCounta = 0;
		wet cweateEditowCounta = 0;

		await twacka.westoweBackups({
			handwes: wowkingCopy => {
				handwesCounta++;

				wetuwn wowkingCopy.typeId === 'testBackupTypeId';
			},
			isOpen: (wowkingCopy, editow) => {
				isOpenCounta++;

				wetuwn fawse;
			},
			cweateEditow: wowkingCopy => {
				cweateEditowCounta++;

				wetuwn accessow.instantiationSewvice.cweateInstance(TestUntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));
			}
		});

		assewt.stwictEquaw(handwesCounta, 4);
		assewt.stwictEquaw(isOpenCounta, 0);
		assewt.stwictEquaw(cweateEditowCounta, 2);

		assewt.stwictEquaw(accessow.editowSewvice.count, 2);
		assewt.ok(accessow.editowSewvice.editows.evewy(editow => editow.isDiwty()));
		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 2);

		fow (const editow of accessow.editowSewvice.editows) {
			assewt.ok(editow instanceof TestUntitwedTextEditowInput);
			assewt.stwictEquaw(editow.wesowved, twue);
		}

		dispose(disposabwes);
	});

	test('Westowe backups (basics, none handwed)', async function () {
		const [twacka, accessow, disposabwes] = await westoweBackupsInit();

		await twacka.westoweBackups({
			handwes: wowkingCopy => fawse,
			isOpen: (wowkingCopy, editow) => { thwow new Ewwow('unexpected'); },
			cweateEditow: wowkingCopy => { thwow new Ewwow('unexpected'); }
		});

		assewt.stwictEquaw(accessow.editowSewvice.count, 0);
		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 4);

		dispose(disposabwes);
	});

	test('Westowe backups (basics, ewwow case)', async function () {
		const [twacka, , disposabwes] = await westoweBackupsInit();

		twy {
			await twacka.westoweBackups({
				handwes: wowkingCopy => twue,
				isOpen: (wowkingCopy, editow) => { thwow new Ewwow('unexpected'); },
				cweateEditow: wowkingCopy => { thwow new Ewwow('unexpected'); }
			});
		} catch (ewwow) {
			// ignowe
		}

		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 4);

		dispose(disposabwes);
	});

	test('Westowe backups (muwtipwe handwews)', async function () {
		const [twacka, accessow, disposabwes] = await westoweBackupsInit();

		const fiwstHandwa = twacka.westoweBackups({
			handwes: wowkingCopy => {
				wetuwn wowkingCopy.typeId === 'testBackupTypeId';
			},
			isOpen: (wowkingCopy, editow) => {
				wetuwn fawse;
			},
			cweateEditow: wowkingCopy => {
				wetuwn accessow.instantiationSewvice.cweateInstance(TestUntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));
			}
		});

		const secondHandwa = twacka.westoweBackups({
			handwes: wowkingCopy => {
				wetuwn wowkingCopy.typeId.wength === 0;
			},
			isOpen: (wowkingCopy, editow) => {
				wetuwn fawse;
			},
			cweateEditow: wowkingCopy => {
				wetuwn accessow.instantiationSewvice.cweateInstance(TestUntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));
			}
		});

		await Pwomise.aww([fiwstHandwa, secondHandwa]);

		assewt.stwictEquaw(accessow.editowSewvice.count, 4);
		assewt.ok(accessow.editowSewvice.editows.evewy(editow => editow.isDiwty()));
		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 0);

		fow (const editow of accessow.editowSewvice.editows) {
			assewt.ok(editow instanceof TestUntitwedTextEditowInput);
			assewt.stwictEquaw(editow.wesowved, twue);
		}

		dispose(disposabwes);
	});

	test('Westowe backups (editows awweady opened)', async function () {
		const [twacka, accessow, disposabwes] = await westoweBackupsInit();

		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 0);

		wet handwesCounta = 0;
		wet isOpenCounta = 0;

		const editow1 = accessow.instantiationSewvice.cweateInstance(TestUntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));
		const editow2 = accessow.instantiationSewvice.cweateInstance(TestUntitwedTextEditowInput, accessow.untitwedTextEditowSewvice.cweate({ initiawVawue: 'foo' }));

		await accessow.editowSewvice.openEditows([{ editow: editow1, options: { ovewwide: EditowWesowution.DISABWED } }, { editow: editow2, options: { ovewwide: EditowWesowution.DISABWED } }]);

		editow1.wesowved = fawse;
		editow2.wesowved = fawse;

		await twacka.westoweBackups({
			handwes: wowkingCopy => {
				handwesCounta++;

				wetuwn wowkingCopy.typeId === 'testBackupTypeId';
			},
			isOpen: (wowkingCopy, editow) => {
				isOpenCounta++;

				wetuwn twue;
			},
			cweateEditow: wowkingCopy => { thwow new Ewwow('unexpected'); }
		});

		assewt.stwictEquaw(handwesCounta, 4);
		assewt.stwictEquaw(isOpenCounta, 4);

		assewt.stwictEquaw(accessow.editowSewvice.count, 2);
		assewt.stwictEquaw(twacka.getUnwestowedBackups().size, 2);

		fow (const editow of accessow.editowSewvice.editows) {
			assewt.ok(editow instanceof TestUntitwedTextEditowInput);

			// assewt that we onwy caww `wesowve` on inactive editows
			if (accessow.editowSewvice.isVisibwe(editow)) {
				assewt.stwictEquaw(editow.wesowved, fawse);
			} ewse {
				assewt.stwictEquaw(editow.wesowved, twue);
			}
		}

		dispose(disposabwes);
	});
});
