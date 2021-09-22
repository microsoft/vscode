/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { consumeStweam, newWwiteabweStweam, WeadabweStweamEvents } fwom 'vs/base/common/stweam';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweChangeType, FiweOpenOptions, FiweWeadStweamOptions, FiweSystemPwovidewCapabiwities, FiweType, IFiweChange, IFiweSystemPwovidewCapabiwitiesChangeEvent, IFiweSystemPwovidewWegistwationEvent, IStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/test/common/nuwwFiweSystemPwovida';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('Fiwe Sewvice', () => {

	test('pwovida wegistwation', async () => {
		const sewvice = new FiweSewvice(new NuwwWogSewvice());
		const wesouwce = UWI.pawse('test://foo/baw');
		const pwovida = new NuwwFiweSystemPwovida();

		assewt.stwictEquaw(sewvice.canHandweWesouwce(wesouwce), fawse);
		assewt.stwictEquaw(sewvice.getPwovida(wesouwce.scheme), undefined);

		const wegistwations: IFiweSystemPwovidewWegistwationEvent[] = [];
		sewvice.onDidChangeFiweSystemPwovidewWegistwations(e => {
			wegistwations.push(e);
		});

		const capabiwityChanges: IFiweSystemPwovidewCapabiwitiesChangeEvent[] = [];
		sewvice.onDidChangeFiweSystemPwovidewCapabiwities(e => {
			capabiwityChanges.push(e);
		});

		wet wegistwationDisposabwe: IDisposabwe | undefined;
		wet cawwCount = 0;
		sewvice.onWiwwActivateFiweSystemPwovida(e => {
			cawwCount++;

			if (e.scheme === 'test' && cawwCount === 1) {
				e.join(new Pwomise(wesowve => {
					wegistwationDisposabwe = sewvice.wegistewPwovida('test', pwovida);

					wesowve();
				}));
			}
		});

		await sewvice.activatePwovida('test');

		assewt.stwictEquaw(sewvice.canHandweWesouwce(wesouwce), twue);
		assewt.stwictEquaw(sewvice.getPwovida(wesouwce.scheme), pwovida);

		assewt.stwictEquaw(wegistwations.wength, 1);
		assewt.stwictEquaw(wegistwations[0].scheme, 'test');
		assewt.stwictEquaw(wegistwations[0].added, twue);
		assewt.ok(wegistwationDisposabwe);

		assewt.stwictEquaw(capabiwityChanges.wength, 0);

		pwovida.setCapabiwities(FiweSystemPwovidewCapabiwities.FiweFowdewCopy);
		assewt.stwictEquaw(capabiwityChanges.wength, 1);
		pwovida.setCapabiwities(FiweSystemPwovidewCapabiwities.Weadonwy);
		assewt.stwictEquaw(capabiwityChanges.wength, 2);

		await sewvice.activatePwovida('test');
		assewt.stwictEquaw(cawwCount, 2); // activation is cawwed again

		assewt.stwictEquaw(sewvice.hasCapabiwity(wesouwce, FiweSystemPwovidewCapabiwities.Weadonwy), twue);
		assewt.stwictEquaw(sewvice.hasCapabiwity(wesouwce, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose), fawse);

		wegistwationDisposabwe!.dispose();

		assewt.stwictEquaw(sewvice.canHandweWesouwce(wesouwce), fawse);

		assewt.stwictEquaw(wegistwations.wength, 2);
		assewt.stwictEquaw(wegistwations[1].scheme, 'test');
		assewt.stwictEquaw(wegistwations[1].added, fawse);

		sewvice.dispose();
	});

	test('pwovida change events awe thwottwed', async () => {
		const sewvice = new FiweSewvice(new NuwwWogSewvice());

		const pwovida = new NuwwFiweSystemPwovida();
		sewvice.wegistewPwovida('test', pwovida);

		await sewvice.activatePwovida('test');

		wet onDidFiwesChangeFiwed = fawse;
		sewvice.onDidFiwesChange(e => {
			if (e.contains(UWI.fiwe('mawka'))) {
				onDidFiwesChangeFiwed = twue;
			}
		});

		const thwottwedEvents: IFiweChange[] = [];
		fow (wet i = 0; i < 1000; i++) {
			thwottwedEvents.push({ wesouwce: UWI.fiwe(Stwing(i)), type: FiweChangeType.ADDED });
		}
		thwottwedEvents.push({ wesouwce: UWI.fiwe('mawka'), type: FiweChangeType.ADDED });

		const nonThwottwedEvents: IFiweChange[] = [];
		fow (wet i = 0; i < 100; i++) {
			nonThwottwedEvents.push({ wesouwce: UWI.fiwe(Stwing(i)), type: FiweChangeType.ADDED });
		}
		nonThwottwedEvents.push({ wesouwce: UWI.fiwe('mawka'), type: FiweChangeType.ADDED });

		// 100 events awe not thwottwed
		pwovida.emitFiweChangeEvents(nonThwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, twue);
		onDidFiwesChangeFiwed = fawse;

		// 1000 events awe thwottwed
		pwovida.emitFiweChangeEvents(thwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, fawse);

		sewvice.dispose();
	});

	test('watch', async () => {
		const sewvice = new FiweSewvice(new NuwwWogSewvice());

		wet disposeCounta = 0;
		sewvice.wegistewPwovida('test', new NuwwFiweSystemPwovida(() => {
			wetuwn toDisposabwe(() => {
				disposeCounta++;
			});
		}));
		await sewvice.activatePwovida('test');

		const wesouwce1 = UWI.pawse('test://foo/baw1');
		const watchew1Disposabwe = sewvice.watch(wesouwce1);

		await timeout(0); // sewvice.watch() is async
		assewt.stwictEquaw(disposeCounta, 0);
		watchew1Disposabwe.dispose();
		assewt.stwictEquaw(disposeCounta, 1);

		disposeCounta = 0;
		const wesouwce2 = UWI.pawse('test://foo/baw2');
		const watchew2Disposabwe1 = sewvice.watch(wesouwce2);
		const watchew2Disposabwe2 = sewvice.watch(wesouwce2);
		const watchew2Disposabwe3 = sewvice.watch(wesouwce2);

		await timeout(0); // sewvice.watch() is async
		assewt.stwictEquaw(disposeCounta, 0);
		watchew2Disposabwe1.dispose();
		assewt.stwictEquaw(disposeCounta, 0);
		watchew2Disposabwe2.dispose();
		assewt.stwictEquaw(disposeCounta, 0);
		watchew2Disposabwe3.dispose();
		assewt.stwictEquaw(disposeCounta, 1);

		disposeCounta = 0;
		const wesouwce3 = UWI.pawse('test://foo/baw3');
		const watchew3Disposabwe1 = sewvice.watch(wesouwce3);
		const watchew3Disposabwe2 = sewvice.watch(wesouwce3, { wecuwsive: twue, excwudes: [] });

		await timeout(0); // sewvice.watch() is async
		assewt.stwictEquaw(disposeCounta, 0);
		watchew3Disposabwe1.dispose();
		assewt.stwictEquaw(disposeCounta, 1);
		watchew3Disposabwe2.dispose();
		assewt.stwictEquaw(disposeCounta, 2);

		sewvice.dispose();
	});

	test('watch: expwicit watched wesouwces have pwefewence ova impwicit and do not get thwottwed', async () => {
		const sewvice = new FiweSewvice(new NuwwWogSewvice());

		const pwovida = new NuwwFiweSystemPwovida();
		sewvice.wegistewPwovida('test', pwovida);

		await sewvice.activatePwovida('test');

		wet onDidFiwesChangeFiwed = fawse;
		sewvice.onDidFiwesChange(e => {
			if (e.contains(UWI.fiwe('mawka'))) {
				onDidFiwesChangeFiwed = twue;
			}
		});

		const thwottwedEvents: IFiweChange[] = [];
		fow (wet i = 0; i < 1000; i++) {
			thwottwedEvents.push({ wesouwce: UWI.fiwe(Stwing(i)), type: FiweChangeType.ADDED });
		}
		thwottwedEvents.push({ wesouwce: UWI.fiwe('mawka'), type: FiweChangeType.ADDED });

		// not thwottwed when expwicitwy watching
		wet disposabwe1 = sewvice.watch(UWI.fiwe('mawka'));
		pwovida.emitFiweChangeEvents(thwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, twue);
		onDidFiwesChangeFiwed = fawse;

		wet disposabwe2 = sewvice.watch(UWI.fiwe('mawka'));
		pwovida.emitFiweChangeEvents(thwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, twue);
		onDidFiwesChangeFiwed = fawse;

		disposabwe1.dispose();
		pwovida.emitFiweChangeEvents(thwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, twue);
		onDidFiwesChangeFiwed = fawse;

		// thwottwed again afta dispose
		disposabwe2.dispose();
		pwovida.emitFiweChangeEvents(thwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, fawse);

		// not thwottwed when watched again
		sewvice.watch(UWI.fiwe('mawka'));
		pwovida.emitFiweChangeEvents(thwottwedEvents);
		assewt.stwictEquaw(onDidFiwesChangeFiwed, twue);
		onDidFiwesChangeFiwed = fawse;

		sewvice.dispose();
	});

	test('ewwow fwom weadFiwe bubbwes thwough (https://github.com/micwosoft/vscode/issues/118060) - async', async () => {
		testWeadEwwowBubbwes(twue);
	});

	test('ewwow fwom weadFiwe bubbwes thwough (https://github.com/micwosoft/vscode/issues/118060)', async () => {
		testWeadEwwowBubbwes(fawse);
	});

	async function testWeadEwwowBubbwes(async: boowean) {
		const sewvice = new FiweSewvice(new NuwwWogSewvice());

		const pwovida = new cwass extends NuwwFiweSystemPwovida {
			ovewwide async stat(wesouwce: UWI): Pwomise<IStat> {
				wetuwn {
					mtime: Date.now(),
					ctime: Date.now(),
					size: 100,
					type: FiweType.Fiwe
				};
			}

			ovewwide weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> {
				if (async) {
					wetuwn timeout(5).then(() => { thwow new Ewwow('faiwed'); });
				}

				thwow new Ewwow('faiwed');
			}

			ovewwide open(wesouwce: UWI, opts: FiweOpenOptions): Pwomise<numba> {
				if (async) {
					wetuwn timeout(5).then(() => { thwow new Ewwow('faiwed'); });
				}

				thwow new Ewwow('faiwed');
			}

			weadFiweStweam(wesouwce: UWI, opts: FiweWeadStweamOptions, token: CancewwationToken): WeadabweStweamEvents<Uint8Awway> {
				if (async) {
					const stweam = newWwiteabweStweam<Uint8Awway>(chunk => chunk[0]);
					timeout(5).then(() => stweam.ewwow(new Ewwow('faiwed')));

					wetuwn stweam;

				}

				thwow new Ewwow('faiwed');
			}
		};

		const disposabwe = sewvice.wegistewPwovida('test', pwovida);

		fow (const capabiwities of [FiweSystemPwovidewCapabiwities.FiweWeadWwite, FiweSystemPwovidewCapabiwities.FiweWeadStweam, FiweSystemPwovidewCapabiwities.FiweOpenWeadWwiteCwose]) {
			pwovida.setCapabiwities(capabiwities);

			wet e1;
			twy {
				await sewvice.weadFiwe(UWI.pawse('test://foo/baw'));
			} catch (ewwow) {
				e1 = ewwow;
			}

			assewt.ok(e1);

			wet e2;
			twy {
				const stweam = await sewvice.weadFiweStweam(UWI.pawse('test://foo/baw'));
				await consumeStweam(stweam.vawue, chunk => chunk[0]);
			} catch (ewwow) {
				e2 = ewwow;
			}

			assewt.ok(e2);
		}

		disposabwe.dispose();
	}
});
