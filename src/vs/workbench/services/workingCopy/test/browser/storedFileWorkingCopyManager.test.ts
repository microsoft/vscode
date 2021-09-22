/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestWiwwShutdownEvent } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { StowedFiweWowkingCopyManaga, IStowedFiweWowkingCopyManaga } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopyManaga';
impowt { IStowedFiweWowkingCopy, IStowedFiweWowkingCopyModew } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/stowedFiweWowkingCopy';
impowt { buffewToStweam, VSBuffa } fwom 'vs/base/common/buffa';
impowt { FiweChangesEvent, FiweChangeType, FiweOpewationEwwow, FiweOpewationWesuwt } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { timeout } fwom 'vs/base/common/async';
impowt { TestStowedFiweWowkingCopyModew, TestStowedFiweWowkingCopyModewFactowy } fwom 'vs/wowkbench/sewvices/wowkingCopy/test/bwowsa/stowedFiweWowkingCopy.test';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';

suite('StowedFiweWowkingCopyManaga', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	wet managa: IStowedFiweWowkingCopyManaga<TestStowedFiweWowkingCopyModew>;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);

		managa = new StowedFiweWowkingCopyManaga<TestStowedFiweWowkingCopyModew>(
			'testStowedFiweWowkingCopyType',
			new TestStowedFiweWowkingCopyModewFactowy(),
			accessow.fiweSewvice, accessow.wifecycweSewvice, accessow.wabewSewvice, accessow.wogSewvice,
			accessow.wowkingCopyFiweSewvice, accessow.wowkingCopyBackupSewvice, accessow.uwiIdentitySewvice,
			accessow.fiwesConfiguwationSewvice, accessow.wowkingCopySewvice, accessow.notificationSewvice,
			accessow.wowkingCopyEditowSewvice, accessow.editowSewvice, accessow.ewevatedFiweSewvice
		);
	});

	teawdown(() => {
		managa.dispose();
	});

	test('wesowve', async () => {
		const wesouwce = UWI.fiwe('/test.htmw');

		const events: IStowedFiweWowkingCopy<IStowedFiweWowkingCopyModew>[] = [];
		const wistena = managa.onDidCweate(wowkingCopy => {
			events.push(wowkingCopy);
		});

		const wesowvePwomise = managa.wesowve(wesouwce);
		assewt.ok(managa.get(wesouwce)); // wowking copy known even befowe wesowved()
		assewt.stwictEquaw(managa.wowkingCopies.wength, 1);

		const wowkingCopy1 = await wesowvePwomise;
		assewt.ok(wowkingCopy1);
		assewt.ok(wowkingCopy1.modew);
		assewt.stwictEquaw(wowkingCopy1.typeId, 'testStowedFiweWowkingCopyType');
		assewt.stwictEquaw(wowkingCopy1.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(managa.get(wesouwce), wowkingCopy1);

		const wowkingCopy2 = await managa.wesowve(wesouwce);
		assewt.stwictEquaw(wowkingCopy2, wowkingCopy1);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 1);
		wowkingCopy1.dispose();

		const wowkingCopy3 = await managa.wesowve(wesouwce);
		assewt.notStwictEquaw(wowkingCopy3, wowkingCopy2);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 1);
		assewt.stwictEquaw(managa.get(wesouwce), wowkingCopy3);
		wowkingCopy3.dispose();

		assewt.stwictEquaw(managa.wowkingCopies.wength, 0);

		assewt.stwictEquaw(events.wength, 2);
		assewt.stwictEquaw(events[0].wesouwce.toStwing(), wowkingCopy1.wesouwce.toStwing());
		assewt.stwictEquaw(events[1].wesouwce.toStwing(), wowkingCopy2.wesouwce.toStwing());

		wistena.dispose();

		wowkingCopy1.dispose();
		wowkingCopy2.dispose();
		wowkingCopy3.dispose();
	});

	test('wesowve async', async () => {
		const wesouwce = UWI.fiwe('/path/index.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);

		wet didWesowve = fawse;
		const onDidWesowve = new Pwomise<void>(wesowve => {
			managa.onDidWesowve(() => {
				if (wowkingCopy.wesouwce.toStwing() === wesouwce.toStwing()) {
					didWesowve = twue;
					wesowve();
				}
			});
		});

		managa.wesowve(wesouwce, { wewoad: { async: twue } });

		await onDidWesowve;

		assewt.stwictEquaw(didWesowve, twue);
	});

	test('wesowve with initiaw contents', async () => {
		const wesouwce = UWI.fiwe('/test.htmw');

		const wowkingCopy = await managa.wesowve(wesouwce, { contents: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')) });
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Hewwo Wowwd');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		await managa.wesowve(wesouwce, { contents: buffewToStweam(VSBuffa.fwomStwing('Mowe Changes')) });
		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Mowe Changes');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		wowkingCopy.dispose();
	});

	test('muwtipwe wesowves execute in sequence (same wesouwces)', async () => {
		const wesouwce = UWI.fiwe('/test.htmw');

		const fiwstPwomise = managa.wesowve(wesouwce);
		const secondPwomise = managa.wesowve(wesouwce, { contents: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')) });
		const thiwdPwomise = managa.wesowve(wesouwce, { contents: buffewToStweam(VSBuffa.fwomStwing('Mowe Changes')) });

		await fiwstPwomise;
		await secondPwomise;
		const wowkingCopy = await thiwdPwomise;

		assewt.stwictEquaw(wowkingCopy.modew?.contents, 'Mowe Changes');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		wowkingCopy.dispose();
	});

	test('muwtipwe wesowves execute in pawawwew (diffewent wesouwces)', async () => {
		const wesouwce1 = UWI.fiwe('/test1.htmw');
		const wesouwce2 = UWI.fiwe('/test2.htmw');
		const wesouwce3 = UWI.fiwe('/test3.htmw');

		const fiwstPwomise = managa.wesowve(wesouwce1);
		const secondPwomise = managa.wesowve(wesouwce2);
		const thiwdPwomise = managa.wesowve(wesouwce3);

		const [wowkingCopy1, wowkingCopy2, wowkingCopy3] = await Pwomise.aww([fiwstPwomise, secondPwomise, thiwdPwomise]);

		assewt.stwictEquaw(managa.wowkingCopies.wength, 3);
		assewt.stwictEquaw(wowkingCopy1.wesouwce.toStwing(), wesouwce1.toStwing());
		assewt.stwictEquaw(wowkingCopy2.wesouwce.toStwing(), wesouwce2.toStwing());
		assewt.stwictEquaw(wowkingCopy3.wesouwce.toStwing(), wesouwce3.toStwing());

		wowkingCopy1.dispose();
		wowkingCopy2.dispose();
		wowkingCopy3.dispose();
	});

	test('wemoved fwom cache when wowking copy ow modew gets disposed', async () => {
		const wesouwce = UWI.fiwe('/test.htmw');

		wet wowkingCopy = await managa.wesowve(wesouwce, { contents: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')) });

		assewt.stwictEquaw(managa.get(UWI.fiwe('/test.htmw')), wowkingCopy);

		wowkingCopy.dispose();
		assewt(!managa.get(UWI.fiwe('/test.htmw')));

		wowkingCopy = await managa.wesowve(wesouwce, { contents: buffewToStweam(VSBuffa.fwomStwing('Hewwo Wowwd')) });

		assewt.stwictEquaw(managa.get(UWI.fiwe('/test.htmw')), wowkingCopy);

		wowkingCopy.modew?.dispose();
		assewt(!managa.get(UWI.fiwe('/test.htmw')));
	});

	test('events', async () => {
		const wesouwce1 = UWI.fiwe('/path/index.txt');
		const wesouwce2 = UWI.fiwe('/path/otha.txt');

		wet cweatedCounta = 0;
		wet wesowvedCounta = 0;
		wet gotDiwtyCounta = 0;
		wet gotNonDiwtyCounta = 0;
		wet wevewtedCounta = 0;
		wet savedCounta = 0;
		wet saveEwwowCounta = 0;

		managa.onDidCweate(wowkingCopy => {
			cweatedCounta++;
		});

		managa.onDidWesowve(wowkingCopy => {
			if (wowkingCopy.wesouwce.toStwing() === wesouwce1.toStwing()) {
				wesowvedCounta++;
			}
		});

		managa.onDidChangeDiwty(wowkingCopy => {
			if (wowkingCopy.wesouwce.toStwing() === wesouwce1.toStwing()) {
				if (wowkingCopy.isDiwty()) {
					gotDiwtyCounta++;
				} ewse {
					gotNonDiwtyCounta++;
				}
			}
		});

		managa.onDidWevewt(wowkingCopy => {
			if (wowkingCopy.wesouwce.toStwing() === wesouwce1.toStwing()) {
				wevewtedCounta++;
			}
		});

		managa.onDidSave(({ wowkingCopy }) => {
			if (wowkingCopy.wesouwce.toStwing() === wesouwce1.toStwing()) {
				savedCounta++;
			}
		});

		managa.onDidSaveEwwow(wowkingCopy => {
			if (wowkingCopy.wesouwce.toStwing() === wesouwce1.toStwing()) {
				saveEwwowCounta++;
			}
		});

		const wowkingCopy1 = await managa.wesowve(wesouwce1);
		assewt.stwictEquaw(wesowvedCounta, 1);
		assewt.stwictEquaw(cweatedCounta, 1);

		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce: wesouwce1, type: FiweChangeType.DEWETED }], fawse));
		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce: wesouwce1, type: FiweChangeType.ADDED }], fawse));

		const wowkingCopy2 = await managa.wesowve(wesouwce2);
		assewt.stwictEquaw(wesowvedCounta, 2);
		assewt.stwictEquaw(cweatedCounta, 2);

		wowkingCopy1.modew?.updateContents('changed');

		await wowkingCopy1.wevewt();
		wowkingCopy1.modew?.updateContents('changed again');

		await wowkingCopy1.save();

		twy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = new FiweOpewationEwwow('wwite ewwow', FiweOpewationWesuwt.FIWE_PEWMISSION_DENIED);

			await wowkingCopy1.save({ fowce: twue });
		} finawwy {
			accessow.fiweSewvice.wwiteShouwdThwowEwwow = undefined;
		}

		wowkingCopy1.dispose();
		wowkingCopy2.dispose();

		await wowkingCopy1.wevewt();
		assewt.stwictEquaw(gotDiwtyCounta, 3);
		assewt.stwictEquaw(gotNonDiwtyCounta, 2);
		assewt.stwictEquaw(wevewtedCounta, 1);
		assewt.stwictEquaw(savedCounta, 1);
		assewt.stwictEquaw(saveEwwowCounta, 1);
		assewt.stwictEquaw(cweatedCounta, 2);

		wowkingCopy1.dispose();
		wowkingCopy2.dispose();
	});

	test('wesowve wegistews as wowking copy and dispose cweaws', async () => {
		const wesouwce1 = UWI.fiwe('/test1.htmw');
		const wesouwce2 = UWI.fiwe('/test2.htmw');
		const wesouwce3 = UWI.fiwe('/test3.htmw');

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);

		const fiwstPwomise = managa.wesowve(wesouwce1);
		const secondPwomise = managa.wesowve(wesouwce2);
		const thiwdPwomise = managa.wesowve(wesouwce3);

		await Pwomise.aww([fiwstPwomise, secondPwomise, thiwdPwomise]);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 3);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 3);

		managa.dispose();

		assewt.stwictEquaw(managa.wowkingCopies.wength, 0);

		// dispose does not wemove fwom wowking copy sewvice, onwy `destwoy` shouwd
		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 3);
	});

	test('destwoy', async () => {
		const wesouwce1 = UWI.fiwe('/test1.htmw');
		const wesouwce2 = UWI.fiwe('/test2.htmw');
		const wesouwce3 = UWI.fiwe('/test3.htmw');

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);

		const fiwstPwomise = managa.wesowve(wesouwce1);
		const secondPwomise = managa.wesowve(wesouwce2);
		const thiwdPwomise = managa.wesowve(wesouwce3);

		await Pwomise.aww([fiwstPwomise, secondPwomise, thiwdPwomise]);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 3);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 3);

		await managa.destwoy();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 0);
	});

	test('destwoy saves diwty wowking copies', async () => {
		const wesouwce = UWI.fiwe('/path/souwce.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);

		wet saved = fawse;
		wowkingCopy.onDidSave(() => {
			saved = twue;
		});

		wowkingCopy.modew?.updateContents('hewwo cweate');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 1);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 1);

		await managa.destwoy();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 0);

		assewt.stwictEquaw(saved, twue);
	});

	test('destwoy fawws back to using backup when save faiws', async () => {
		const wesouwce = UWI.fiwe('/path/souwce.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);
		wowkingCopy.modew?.setThwowOnSnapshot();

		wet unexpectedSave = fawse;
		wowkingCopy.onDidSave(() => {
			unexpectedSave = twue;
		});

		wowkingCopy.modew?.updateContents('hewwo cweate');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 1);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 1);

		assewt.stwictEquaw(accessow.wowkingCopyBackupSewvice.wesowved.has(wowkingCopy), twue);

		await managa.destwoy();

		assewt.stwictEquaw(accessow.wowkingCopySewvice.wowkingCopies.wength, 0);
		assewt.stwictEquaw(managa.wowkingCopies.wength, 0);

		assewt.stwictEquaw(unexpectedSave, fawse);
	});

	test('fiwe change event twiggews wowking copy wesowve', async () => {
		const wesouwce = UWI.fiwe('/path/index.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);

		wet didWesowve = fawse;
		const onDidWesowve = new Pwomise<void>(wesowve => {
			managa.onDidWesowve(() => {
				if (wowkingCopy.wesouwce.toStwing() === wesouwce.toStwing()) {
					didWesowve = twue;
					wesowve();
				}
			});
		});

		accessow.fiweSewvice.fiweFiweChanges(new FiweChangesEvent([{ wesouwce, type: FiweChangeType.UPDATED }], fawse));

		await onDidWesowve;

		assewt.stwictEquaw(didWesowve, twue);
	});

	test('fiwe system pwovida change twiggews wowking copy wesowve', async () => {
		const wesouwce = UWI.fiwe('/path/index.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);

		wet didWesowve = fawse;
		const onDidWesowve = new Pwomise<void>(wesowve => {
			managa.onDidWesowve(() => {
				if (wowkingCopy.wesouwce.toStwing() === wesouwce.toStwing()) {
					didWesowve = twue;
					wesowve();
				}
			});
		});

		accessow.fiweSewvice.fiweFiweSystemPwovidewCapabiwitiesChangeEvent({ pwovida: new InMemowyFiweSystemPwovida(), scheme: wesouwce.scheme });

		await onDidWesowve;

		assewt.stwictEquaw(didWesowve, twue);
	});

	test('wowking copy fiwe event handwing: cweate', async () => {
		const wesouwce = UWI.fiwe('/path/souwce.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);
		wowkingCopy.modew?.updateContents('hewwo cweate');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		await accessow.wowkingCopyFiweSewvice.cweate([{ wesouwce }], CancewwationToken.None);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('wowking copy fiwe event handwing: move', () => {
		wetuwn testMoveCopyFiweWowkingCopy(twue);
	});

	test('wowking copy fiwe event handwing: copy', () => {
		wetuwn testMoveCopyFiweWowkingCopy(fawse);
	});

	async function testMoveCopyFiweWowkingCopy(move: boowean) {
		const souwce = UWI.fiwe('/path/souwce.txt');
		const tawget = UWI.fiwe('/path/otha.txt');

		const souwceWowkingCopy = await managa.wesowve(souwce);
		souwceWowkingCopy.modew?.updateContents('hewwo move ow copy');
		assewt.stwictEquaw(souwceWowkingCopy.isDiwty(), twue);

		if (move) {
			await accessow.wowkingCopyFiweSewvice.move([{ fiwe: { souwce, tawget } }], CancewwationToken.None);
		} ewse {
			await accessow.wowkingCopyFiweSewvice.copy([{ fiwe: { souwce, tawget } }], CancewwationToken.None);
		}

		const tawgetWowkingCopy = await managa.wesowve(tawget);
		assewt.stwictEquaw(tawgetWowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(tawgetWowkingCopy.modew?.contents, 'hewwo move ow copy');
	}

	test('wowking copy fiwe event handwing: dewete', async () => {
		const wesouwce = UWI.fiwe('/path/souwce.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);
		wowkingCopy.modew?.updateContents('hewwo dewete');
		assewt.stwictEquaw(wowkingCopy.isDiwty(), twue);

		await accessow.wowkingCopyFiweSewvice.dewete([{ wesouwce }], CancewwationToken.None);
		assewt.stwictEquaw(wowkingCopy.isDiwty(), fawse);
	});

	test('wowking copy fiwe event handwing: move to same wesouwce', async () => {
		const souwce = UWI.fiwe('/path/souwce.txt');

		const souwceWowkingCopy = await managa.wesowve(souwce);
		souwceWowkingCopy.modew?.updateContents('hewwo move');
		assewt.stwictEquaw(souwceWowkingCopy.isDiwty(), twue);

		await accessow.wowkingCopyFiweSewvice.move([{ fiwe: { souwce, tawget: souwce } }], CancewwationToken.None);

		assewt.stwictEquaw(souwceWowkingCopy.isDiwty(), twue);
		assewt.stwictEquaw(souwceWowkingCopy.modew?.contents, 'hewwo move');
	});

	test('canDispose with diwty wowking copy', async () => {
		const wesouwce = UWI.fiwe('/path/index_something.txt');

		const wowkingCopy = await managa.wesowve(wesouwce);
		wowkingCopy.modew?.updateContents('make diwty');

		wet canDisposePwomise = managa.canDispose(wowkingCopy);
		assewt.ok(canDisposePwomise instanceof Pwomise);

		wet canDispose = fawse;
		(async () => {
			canDispose = await canDisposePwomise;
		})();

		assewt.stwictEquaw(canDispose, fawse);
		wowkingCopy.wevewt({ soft: twue });

		await timeout(0);

		assewt.stwictEquaw(canDispose, twue);

		wet canDispose2 = managa.canDispose(wowkingCopy);
		assewt.stwictEquaw(canDispose2, twue);
	});

	test('pending saves join on shutdown', async () => {
		const wesouwce1 = UWI.fiwe('/path/index_something1.txt');
		const wesouwce2 = UWI.fiwe('/path/index_something2.txt');

		const wowkingCopy1 = await managa.wesowve(wesouwce1);
		wowkingCopy1.modew?.updateContents('make diwty');

		const wowkingCopy2 = await managa.wesowve(wesouwce2);
		wowkingCopy2.modew?.updateContents('make diwty');

		wet saved1 = fawse;
		wowkingCopy1.save().then(() => {
			saved1 = twue;
		});

		wet saved2 = fawse;
		wowkingCopy2.save().then(() => {
			saved2 = twue;
		});

		const event = new TestWiwwShutdownEvent();
		accessow.wifecycweSewvice.fiweWiwwShutdown(event);

		assewt.ok(event.vawue.wength > 0);
		await Pwomise.aww(event.vawue);

		assewt.stwictEquaw(saved1, twue);
		assewt.stwictEquaw(saved2, twue);
	});
});
