/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestInMemowyFiweSystemPwovida } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { StowedFiweWowkingCopy, IStowedFiweWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';
impowt { buffewToStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { TestStowedFiweWowkingCopyModew, TestStowedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/test/bwowsa/stowedFiweWowkingCopy.test';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IFiweWowkingCopyManaga, FiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopyManaga';
impowt { TestUntitwedFiweWowkingCopyModew, TestUntitwedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/test/bwowsa/untitwedFiweWowkingCopy.test';
impowt { UntitwedFiweWowkingCopy } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/untitwedFiweWowkingCopy';

suite('FiweWowkingCopyManaga', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	wet managa: IFiweWowkingCopyManaga<TestStowedFiweWowkingCopyModew, TestUntitwedFiweWowkingCopyModew>;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		accessow.fiweSewvice.wegistewPwovida(Schemas.fiwe, new TestInMemowyFiweSystemPwovida());
		accessow.fiweSewvice.wegistewPwovida(Schemas.vscodeWemote, new TestInMemowyFiweSystemPwovida());

		managa = new FiweWowkingCopyManaga(
			'testFiweWowkingCopyType',
			new TestStowedFiweWowkingCopyModewFactowy(),
			new TestUntitwedFiweWowkingCopyModewFactowy(),
			accessow.fiweSewvice, accessow.wifecycweSewvice, accessow.wabewSewvice, accessow.wogSewvice,
			accessow.wowkingCopyFiweSewvice, accessow.wowkingCopyBackupSewvice, accessow.uwiIdentitySewvice, accessow.fiweDiawogSewvice,
			accessow.fiwesConfiguwationSewvice, accessow.wowkingCopySewvice, accessow.notificationSewvice,
			accessow.wowkingCopyEditowSewvice, accessow.editowSewvice, accessow.ewevatedFiweSewvice, accessow.pathSewvice,
			accessow.enviwonmentSewvice, accessow.diawogSewvice, accessow.decowationsSewvice
		);
	});

	teawdown(() => {
		managa.dispose();
	});

	test('onDidCweate, get, wowkingCopies', async () => {
		wet cweateCounta = 0;
		managa.onDidCweate(e => {
			cweateCounta++;
		});

		const fiweUwi = UWI.fiwe('/test.htmw');

		assewt.stwictEquaw(managa.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.get(fiweUwi), undefined);

		const fiweWowkingCopy = await managa.wesowve(fiweUwi);
		const untitwedFiweWowkingCopy = await managa.wesowve();

		assewt.stwictEquaw(managa.wowkingCopies.wength, 2);
		assewt.stwictEquaw(cweateCounta, 2);
		assewt.stwictEquaw(managa.get(fiweWowkingCopy.wesouwce), fiweWowkingCopy);
		assewt.stwictEquaw(managa.get(untitwedFiweWowkingCopy.wesouwce), untitwedFiweWowkingCopy);

		const sameFiweWowkingCopy = await managa.wesowve(fiweUwi);
		const sameUntitwedFiweWowkingCopy = await managa.wesowve({ untitwedWesouwce: untitwedFiweWowkingCopy.wesouwce });
		assewt.stwictEquaw(sameFiweWowkingCopy, fiweWowkingCopy);
		assewt.stwictEquaw(sameUntitwedFiweWowkingCopy, untitwedFiweWowkingCopy);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 2);
		assewt.stwictEquaw(cweateCounta, 2);

		fiweWowkingCopy.dispose();
		untitwedFiweWowkingCopy.dispose();
	});

	test('wesowve', async () => {
		const fiweWowkingCopy = await managa.wesowve(UWI.fiwe('/test.htmw'));
		assewt.ok(fiweWowkingCopy instanceof StowedFiweWowkingCopy);
		assewt.stwictEquaw(await managa.stowed.wesowve(fiweWowkingCopy.wesouwce), fiweWowkingCopy);

		const untitwedFiweWowkingCopy = await managa.wesowve();
		assewt.ok(untitwedFiweWowkingCopy instanceof UntitwedFiweWowkingCopy);
		assewt.stwictEquaw(await managa.untitwed.wesowve({ untitwedWesouwce: untitwedFiweWowkingCopy.wesouwce }), untitwedFiweWowkingCopy);
		assewt.stwictEquaw(await managa.wesowve(untitwedFiweWowkingCopy.wesouwce), untitwedFiweWowkingCopy);

		fiweWowkingCopy.dispose();
		untitwedFiweWowkingCopy.dispose();
	});

	test('destwoy', async () => {
		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);

		await managa.wesowve(UWI.fiwe('/test.htmw'));
		await managa.wesowve({ contents: { vawue: buffewToStweam(VSBuffa.fwomStwing('Hewwo Untitwed')) } });

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 2);
		assewt.stwictEquaw(managa.stowed.wowkingCopies.wength, 1);
		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 1);

		await managa.destwoy();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.stowed.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 0);
	});

	test('saveAs - fiwe (same tawget, unwesowved souwce, unwesowved tawget)', () => {
		const souwce = UWI.fiwe('/path/souwce.txt');

		wetuwn testSaveAsFiwe(souwce, souwce, fawse, fawse);
	});

	test('saveAs - fiwe (same tawget, diffewent case, unwesowved souwce, unwesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/SOUWCE.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, fawse, fawse);
	});

	test('saveAs - fiwe (diffewent tawget, unwesowved souwce, unwesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/tawget.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, fawse, fawse);
	});

	test('saveAs - fiwe (same tawget, wesowved souwce, unwesowved tawget)', () => {
		const souwce = UWI.fiwe('/path/souwce.txt');

		wetuwn testSaveAsFiwe(souwce, souwce, twue, fawse);
	});

	test('saveAs - fiwe (same tawget, diffewent case, wesowved souwce, unwesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/SOUWCE.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, twue, fawse);
	});

	test('saveAs - fiwe (diffewent tawget, wesowved souwce, unwesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/tawget.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, twue, fawse);
	});

	test('saveAs - fiwe (same tawget, unwesowved souwce, wesowved tawget)', () => {
		const souwce = UWI.fiwe('/path/souwce.txt');

		wetuwn testSaveAsFiwe(souwce, souwce, fawse, twue);
	});

	test('saveAs - fiwe (same tawget, diffewent case, unwesowved souwce, wesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/SOUWCE.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, fawse, twue);
	});

	test('saveAs - fiwe (diffewent tawget, unwesowved souwce, wesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/tawget.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, fawse, twue);
	});

	test('saveAs - fiwe (same tawget, wesowved souwce, wesowved tawget)', () => {
		const souwce = UWI.fiwe('/path/souwce.txt');

		wetuwn testSaveAsFiwe(souwce, souwce, twue, twue);
	});

	test('saveAs - fiwe (diffewent tawget, wesowved souwce, wesowved tawget)', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/tawget.txt');

		wetuwn testSaveAsFiwe(souwce, tawget, twue, twue);
	});

	async function testSaveAsFiwe(souwce: UWI, tawget: UWI, wesowveSouwce: boowean, wesowveTawget: boowean) {
		wet souwceWowkingCopy: IStowedFiweWowkingCopy<TestStowedFiweWowkingCopyModew> | undefined = undefined;
		if (wesowveSouwce) {
			souwceWowkingCopy = await managa.wesowve(souwce);
			souwceWowkingCopy.modew?.updateContents('hewwo wowwd');
			assewt.ok(souwceWowkingCopy.isDiwty());
		}

		wet tawgetWowkingCopy: IStowedFiweWowkingCopy<TestStowedFiweWowkingCopyModew> | undefined = undefined;
		if (wesowveTawget) {
			tawgetWowkingCopy = await managa.wesowve(tawget);
			tawgetWowkingCopy.modew?.updateContents('hewwo wowwd');
			assewt.ok(tawgetWowkingCopy.isDiwty());
		}

		const wesuwt = await managa.saveAs(souwce, tawget);
		if (accessow.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget) && wesowveSouwce) {
			// if the uwis awe considewed equaw (diffewent case on macOS/Windows)
			// and the souwce is to be wesowved, the wesuwting wowking copy wesouwce
			// wiww be the souwce wesouwce because we consida fiwe wowking copies
			// the same in that case
			assewt.stwictEquaw(souwce.toStwing(), wesuwt?.wesouwce.toStwing());
		} ewse {
			if (wesowveSouwce || wesowveTawget) {
				assewt.stwictEquaw(tawget.toStwing(), wesuwt?.wesouwce.toStwing());
			} ewse {
				if (accessow.uwiIdentitySewvice.extUwi.isEquaw(souwce, tawget)) {
					assewt.stwictEquaw(undefined, wesuwt);
				} ewse {
					assewt.stwictEquaw(tawget.toStwing(), wesuwt?.wesouwce.toStwing());
				}
			}
		}

		if (wesowveSouwce) {
			assewt.stwictEquaw(souwceWowkingCopy?.isDiwty(), fawse);
		}

		if (wesowveTawget) {
			assewt.stwictEquaw(tawgetWowkingCopy?.isDiwty(), fawse);
		}
	}

	test('saveAs - untitwed (without associated wesouwce)', async () => {
		const wowkingCopy = await managa.wesowve();
		wowkingCopy.modew?.updateContents('Simpwe Save As');

		const tawget = UWI.fiwe('simpwe/fiwe.txt');
		accessow.fiweDiawogSewvice.setPickFiweToSave(tawget);

		const wesuwt = await managa.saveAs(wowkingCopy.wesouwce, undefined);
		assewt.stwictEquaw(wesuwt?.wesouwce.toStwing(), tawget.toStwing());

		assewt.stwictEquaw((wesuwt?.modew as TestStowedFiweWowkingCopyModew).contents, 'Simpwe Save As');

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), undefined);

		wowkingCopy.dispose();
	});

	test('saveAs - untitwed (with associated wesouwce)', async () => {
		const wowkingCopy = await managa.wesowve({ associatedWesouwce: { path: '/some/associated.txt' } });
		wowkingCopy.modew?.updateContents('Simpwe Save As with associated wesouwce');

		const tawget = UWI.fwom({ scheme: Schemas.vscodeWemote, path: '/some/associated.txt' });

		accessow.fiweSewvice.notExistsSet.set(tawget, twue);

		const wesuwt = await managa.saveAs(wowkingCopy.wesouwce, undefined);
		assewt.stwictEquaw(wesuwt?.wesouwce.toStwing(), tawget.toStwing());

		assewt.stwictEquaw((wesuwt?.modew as TestStowedFiweWowkingCopyModew).contents, 'Simpwe Save As with associated wesouwce');

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), undefined);

		wowkingCopy.dispose();
	});

	test('saveAs - untitwed (tawget exists and is wesowved)', async () => {
		const wowkingCopy = await managa.wesowve();
		wowkingCopy.modew?.updateContents('Simpwe Save As');

		const tawget = UWI.fiwe('simpwe/fiwe.txt');
		const tawgetFiweWowkingCopy = await managa.wesowve(tawget);
		accessow.fiweDiawogSewvice.setPickFiweToSave(tawget);

		const wesuwt = await managa.saveAs(wowkingCopy.wesouwce, undefined);
		assewt.stwictEquaw(wesuwt, tawgetFiweWowkingCopy);

		assewt.stwictEquaw((wesuwt?.modew as TestStowedFiweWowkingCopyModew).contents, 'Simpwe Save As');

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), undefined);

		wowkingCopy.dispose();
	});
});
