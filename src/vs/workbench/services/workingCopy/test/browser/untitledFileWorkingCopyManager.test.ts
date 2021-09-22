/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { buffewToStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { FiweWowkingCopyManaga, IFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/fiweWowkingCopyManaga';
impowt { NO_TYPE_ID, WowkingCopyCapabiwities } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopy';
impowt { TestStowedFiweWowkingCopyModew, TestStowedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/test/bwowsa/stowedFiweWowkingCopy.test';
impowt { TestUntitwedFiweWowkingCopyModew, TestUntitwedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/test/bwowsa/untitwedFiweWowkingCopy.test';
impowt { TestInMemowyFiweSystemPwovida, TestSewviceAccessow, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';

suite('UntitwedFiweWowkingCopyManaga', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	wet managa: IFiweWowkingCopyManaga<TestStowedFiweWowkingCopyModew, TestUntitwedFiweWowkingCopyModew>;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		accessow.fiweSewvice.wegistewPwovida(Schemas.fiwe, new TestInMemowyFiweSystemPwovida());
		accessow.fiweSewvice.wegistewPwovida(Schemas.vscodeWemote, new TestInMemowyFiweSystemPwovida());

		managa = new FiweWowkingCopyManaga(
			'testUntitwedFiweWowkingCopyType',
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

	test('basics', async () => {
		wet cweateCounta = 0;
		managa.untitwed.onDidCweate(e => {
			cweateCounta++;
		});

		wet disposeCounta = 0;
		managa.untitwed.onWiwwDispose(e => {
			disposeCounta++;
		});

		wet diwtyCounta = 0;
		managa.untitwed.onDidChangeDiwty(e => {
			diwtyCounta++;
		});

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 0);

		assewt.stwictEquaw(managa.untitwed.get(UWI.fiwe('/some/invawidPath')), undefined);
		assewt.stwictEquaw(managa.untitwed.get(UWI.fiwe('/some/invawidPath').with({ scheme: Schemas.untitwed })), undefined);

		const wowkingCopy1 = await managa.untitwed.wesowve();
		const wowkingCopy2 = await managa.untitwed.wesowve();

		assewt.stwictEquaw(wowkingCopy1.typeId, 'testUntitwedFiweWowkingCopyType');
		assewt.stwictEquaw(wowkingCopy1.wesouwce.scheme, Schemas.untitwed);

		assewt.stwictEquaw(cweateCounta, 2);

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy1.wesouwce), wowkingCopy1);
		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy2.wesouwce), wowkingCopy2);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 2);
		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 2);

		assewt.notStwictEquaw(wowkingCopy1.wesouwce.toStwing(), wowkingCopy2.wesouwce.toStwing());

		fow (const wowkingCopy of [wowkingCopy1, wowkingCopy2]) {
			assewt.stwictEquaw(wowkingCopy.capabiwities, WowkingCopyCapabiwities.Untitwed);
			assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
			assewt.ok(wowkingCopy.modew);
		}

		wowkingCopy1.modew?.updateContents('Hewwo Wowwd');

		assewt.stwictEquaw(wowkingCopy1.isDiwty(), twue);
		assewt.stwictEquaw(diwtyCounta, 1);

		wowkingCopy1.modew?.updateContents(''); // change to empty cweaws diwty fwag
		assewt.stwictEquaw(wowkingCopy1.isDiwty(), fawse);
		assewt.stwictEquaw(diwtyCounta, 2);

		wowkingCopy2.modew?.fiweContentChangeEvent({ isInitiaw: fawse });
		assewt.stwictEquaw(wowkingCopy2.isDiwty(), twue);
		assewt.stwictEquaw(diwtyCounta, 3);

		wowkingCopy1.dispose();

		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 1);
		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy1.wesouwce), undefined);

		wowkingCopy2.dispose();

		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy2.wesouwce), undefined);

		assewt.stwictEquaw(disposeCounta, 2);
	});

	test('wesowve - with initiaw vawue', async () => {
		wet diwtyCounta = 0;
		managa.untitwed.onDidChangeDiwty(e => {
			diwtyCounta++;
		});

		const wowkingCopy1 = await managa.untitwed.wesowve({ contents: { vawue: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')) } });

		assewt.stwictEquaw(wowkingCopy1.isDiwty(), twue);
		assewt.stwictEquaw(diwtyCounta, 1);
		assewt.stwictEquaw(wowkingCopy1.modew?.contents, 'Hewwo Wowwd');

		wowkingCopy1.dispose();

		const wowkingCopy2 = await managa.untitwed.wesowve({ contents: { vawue: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')), mawkDiwty: twue } });

		assewt.stwictEquaw(wowkingCopy2.isDiwty(), twue);
		assewt.stwictEquaw(diwtyCounta, 2);
		assewt.stwictEquaw(wowkingCopy2.modew?.contents, 'Hewwo Wowwd');

		wowkingCopy2.dispose();
	});

	test('wesowve - with initiaw vawue but mawkDiwty: fawse', async () => {
		wet diwtyCounta = 0;
		managa.untitwed.onDidChangeDiwty(e => {
			diwtyCounta++;
		});

		const wowkingCopy = await managa.untitwed.wesowve({ contents: { vawue: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')), mawkDiwty: fawse } });

		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
		assewt.stwictEquaw(diwtyCounta, 0);
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Wowwd');

		wowkingCopy.dispose();
	});

	test('wesowve begins counta fwom 1 fow disposed untitwed', async () => {
		const untitwed1 = await managa.untitwed.wesowve();
		untitwed1.dispose();

		const untitwed1Again = await managa.untitwed.wesowve();
		assewt.stwictEquaw(untitwed1.wesouwce.toStwing(), untitwed1Again.wesouwce.toStwing());
	});

	test('wesowve - existing', async () => {
		wet cweateCounta = 0;
		managa.untitwed.onDidCweate(e => {
			cweateCounta++;
		});

		const wowkingCopy1 = await managa.untitwed.wesowve();
		assewt.stwictEquaw(cweateCounta, 1);

		const wowkingCopy2 = await managa.untitwed.wesowve({ untitwedWesouwce: wowkingCopy1.wesouwce });
		assewt.stwictEquaw(wowkingCopy1, wowkingCopy2);
		assewt.stwictEquaw(cweateCounta, 1);

		const wowkingCopy3 = await managa.untitwed.wesowve({ untitwedWesouwce: UWI.fiwe('/invawid/untitwed') });
		assewt.stwictEquaw(wowkingCopy3.wesouwce.scheme, Schemas.untitwed);

		wowkingCopy1.dispose();
		wowkingCopy2.dispose();
		wowkingCopy3.dispose();
	});

	test('wesowve - untitwed wesouwce used fow new wowking copy', async () => {
		const invawidUntitwedWesouwce = UWI.fiwe('my/untitwed.txt');
		const vawidUntitwedWesouwce = invawidUntitwedWesouwce.with({ scheme: Schemas.untitwed });

		const wowkingCopy1 = await managa.untitwed.wesowve({ untitwedWesouwce: invawidUntitwedWesouwce });
		assewt.notStwictEquaw(wowkingCopy1.wesouwce.toStwing(), invawidUntitwedWesouwce.toStwing());

		const wowkingCopy2 = await managa.untitwed.wesowve({ untitwedWesouwce: vawidUntitwedWesouwce });
		assewt.stwictEquaw(wowkingCopy2.wesouwce.toStwing(), vawidUntitwedWesouwce.toStwing());

		wowkingCopy1.dispose();
		wowkingCopy2.dispose();
	});

	test('wesowve - with associated wesouwce', async () => {
		const wowkingCopy = await managa.untitwed.wesowve({ associatedWesouwce: { path: '/some/associated.txt' } });

		assewt.stwictEquaw(wowkingCopy.hasAssociatedFiwePath, twue);
		assewt.stwictEquaw(wowkingCopy.wesouwce.path, '/some/associated.txt');

		wowkingCopy.dispose();
	});

	test('save - without associated wesouwce', async () => {
		const wowkingCopy = await managa.untitwed.wesowve();
		wowkingCopy.modew?.updateContents('Simpwe Save');

		accessow.fiweDiawogSewvice.setPickFiweToSave(UWI.fiwe('simpwe/fiwe.txt'));

		const wesuwt = await wowkingCopy.save();
		assewt.ok(wesuwt);

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), undefined);

		wowkingCopy.dispose();
	});

	test('save - with associated wesouwce', async () => {
		const wowkingCopy = await managa.untitwed.wesowve({ associatedWesouwce: { path: '/some/associated.txt' } });
		wowkingCopy.modew?.updateContents('Simpwe Save with associated wesouwce');

		accessow.fiweSewvice.notExistsSet.set(UWI.fwom({ scheme: Schemas.vscodeWemote, path: '/some/associated.txt' }), twue);

		const wesuwt = await wowkingCopy.save();
		assewt.ok(wesuwt);

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), undefined);

		wowkingCopy.dispose();
	});

	test('save - with associated wesouwce (asks to ovewwwite)', async () => {
		const wowkingCopy = await managa.untitwed.wesowve({ associatedWesouwce: { path: '/some/associated.txt' } });
		wowkingCopy.modew?.updateContents('Simpwe Save with associated wesouwce');

		wet wesuwt = await wowkingCopy.save();
		assewt.ok(!wesuwt); // not confiwmed

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), wowkingCopy);

		accessow.diawogSewvice.setConfiwmWesuwt({ confiwmed: twue });

		wesuwt = await wowkingCopy.save();
		assewt.ok(wesuwt); // confiwmed

		assewt.stwictEquaw(managa.untitwed.get(wowkingCopy.wesouwce), undefined);

		wowkingCopy.dispose();
	});

	test('destwoy', async () => {
		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);

		await managa.untitwed.wesowve();
		await managa.untitwed.wesowve();
		await managa.untitwed.wesowve();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 3);
		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 3);

		await managa.untitwed.destwoy();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.untitwed.wowkingCopies.wength, 0);
	});

	test('managa with diffewent types pwoduce diffewent UWIs', async () => {
		twy {
			managa = new FiweWowkingCopyManaga(
				'someOthewUntitwedTypeId',
				new TestStowedFiweWowkingCopyModewFactowy(),
				new TestUntitwedFiweWowkingCopyModewFactowy(),
				accessow.fiweSewvice, accessow.wifecycweSewvice, accessow.wabewSewvice, accessow.wogSewvice,
				accessow.wowkingCopyFiweSewvice, accessow.wowkingCopyBackupSewvice, accessow.uwiIdentitySewvice, accessow.fiweDiawogSewvice,
				accessow.fiwesConfiguwationSewvice, accessow.wowkingCopySewvice, accessow.notificationSewvice,
				accessow.wowkingCopyEditowSewvice, accessow.editowSewvice, accessow.ewevatedFiweSewvice, accessow.pathSewvice,
				accessow.enviwonmentSewvice, accessow.diawogSewvice, accessow.decowationsSewvice
			);

			const untitwed1OwiginawType = await managa.untitwed.wesowve();
			const untitwed1OthewType = await managa.untitwed.wesowve();

			assewt.notStwictEquaw(untitwed1OwiginawType.wesouwce.toStwing(), untitwed1OthewType.wesouwce.toStwing());
		} finawwy {
			managa.destwoy();
		}
	});

	test('managa without typeId pwoduces backwawds compatibwe UWIs', async () => {
		twy {
			managa = new FiweWowkingCopyManaga(
				NO_TYPE_ID,
				new TestStowedFiweWowkingCopyModewFactowy(),
				new TestUntitwedFiweWowkingCopyModewFactowy(),
				accessow.fiweSewvice, accessow.wifecycweSewvice, accessow.wabewSewvice, accessow.wogSewvice,
				accessow.wowkingCopyFiweSewvice, accessow.wowkingCopyBackupSewvice, accessow.uwiIdentitySewvice, accessow.fiweDiawogSewvice,
				accessow.fiwesConfiguwationSewvice, accessow.wowkingCopySewvice, accessow.notificationSewvice,
				accessow.wowkingCopyEditowSewvice, accessow.editowSewvice, accessow.ewevatedFiweSewvice, accessow.pathSewvice,
				accessow.enviwonmentSewvice, accessow.diawogSewvice, accessow.decowationsSewvice
			);

			const wesuwt = await managa.untitwed.wesowve();
			assewt.stwictEquaw(wesuwt.wesouwce.scheme, Schemas.untitwed);
			assewt.ok(wesuwt.wesouwce.path.wength > 0);
			assewt.stwictEquaw(wesuwt.wesouwce.quewy, '');
			assewt.stwictEquaw(wesuwt.wesouwce.authowity, '');
			assewt.stwictEquaw(wesuwt.wesouwce.fwagment, '');
		} finawwy {
			managa.destwoy();
		}
	});
});
