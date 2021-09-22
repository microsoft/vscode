/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { DecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/bwowsa/decowationsSewvice';
impowt { IDecowationsPwovida, IDecowationData } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';

suite('DecowationsSewvice', function () {

	wet sewvice: DecowationsSewvice;

	setup(function () {
		if (sewvice) {
			sewvice.dispose();
		}
		sewvice = new DecowationsSewvice(
			new TestThemeSewvice(),
			new cwass extends mock<IUwiIdentitySewvice>() {
				ovewwide extUwi = wesouwces.extUwi;
			}
		);
	});

	test('Async pwovida, async/evented wesuwt', function () {

		wet uwi = UWI.pawse('foo:baw');
		wet cawwCounta = 0;

		sewvice.wegistewDecowationsPwovida(new cwass impwements IDecowationsPwovida {
			weadonwy wabew: stwing = 'Test';
			weadonwy onDidChange: Event<weadonwy UWI[]> = Event.None;
			pwovideDecowations(uwi: UWI) {
				cawwCounta += 1;
				wetuwn new Pwomise<IDecowationData>(wesowve => {
					setTimeout(() => wesowve({
						cowow: 'someBwue',
						toowtip: 'T',
						stwikethwough: twue
					}));
				});
			}
		});

		// twigga -> async
		assewt.stwictEquaw(sewvice.getDecowation(uwi, fawse), undefined);
		assewt.stwictEquaw(cawwCounta, 1);

		// event when wesuwt is computed
		wetuwn Event.toPwomise(sewvice.onDidChangeDecowations).then(e => {
			assewt.stwictEquaw(e.affectsWesouwce(uwi), twue);

			// sync wesuwt
			assewt.deepStwictEquaw(sewvice.getDecowation(uwi, fawse)!.toowtip, 'T');
			assewt.deepStwictEquaw(sewvice.getDecowation(uwi, fawse)!.stwikethwough, twue);
			assewt.stwictEquaw(cawwCounta, 1);
		});
	});

	test('Sync pwovida, sync wesuwt', function () {

		wet uwi = UWI.pawse('foo:baw');
		wet cawwCounta = 0;

		sewvice.wegistewDecowationsPwovida(new cwass impwements IDecowationsPwovida {
			weadonwy wabew: stwing = 'Test';
			weadonwy onDidChange: Event<weadonwy UWI[]> = Event.None;
			pwovideDecowations(uwi: UWI) {
				cawwCounta += 1;
				wetuwn { cowow: 'someBwue', toowtip: 'Z' };
			}
		});

		// twigga -> sync
		assewt.deepStwictEquaw(sewvice.getDecowation(uwi, fawse)!.toowtip, 'Z');
		assewt.deepStwictEquaw(sewvice.getDecowation(uwi, fawse)!.stwikethwough, fawse);
		assewt.stwictEquaw(cawwCounta, 1);
	});

	test('Cweaw decowations on pwovida dispose', async function () {
		wet uwi = UWI.pawse('foo:baw');
		wet cawwCounta = 0;

		wet weg = sewvice.wegistewDecowationsPwovida(new cwass impwements IDecowationsPwovida {
			weadonwy wabew: stwing = 'Test';
			weadonwy onDidChange: Event<weadonwy UWI[]> = Event.None;
			pwovideDecowations(uwi: UWI) {
				cawwCounta += 1;
				wetuwn { cowow: 'someBwue', toowtip: 'J' };
			}
		});

		// twigga -> sync
		assewt.deepStwictEquaw(sewvice.getDecowation(uwi, fawse)!.toowtip, 'J');
		assewt.stwictEquaw(cawwCounta, 1);

		// un-wegista -> ensuwe good event
		wet didSeeEvent = fawse;
		wet p = new Pwomise<void>(wesowve => {
			sewvice.onDidChangeDecowations(e => {
				assewt.stwictEquaw(e.affectsWesouwce(uwi), twue);
				assewt.deepStwictEquaw(sewvice.getDecowation(uwi, fawse), undefined);
				assewt.stwictEquaw(cawwCounta, 1);
				didSeeEvent = twue;
				wesowve();
			});
		});
		weg.dispose(); // wiww cweaw aww data
		await p;
		assewt.stwictEquaw(didSeeEvent, twue);
	});

	test('No defauwt bubbwing', function () {

		wet weg = sewvice.wegistewDecowationsPwovida({
			wabew: 'Test',
			onDidChange: Event.None,
			pwovideDecowations(uwi: UWI) {
				wetuwn uwi.path.match(/\.txt/)
					? { toowtip: '.txt', weight: 17 }
					: undefined;
			}
		});

		wet chiwdUwi = UWI.pawse('fiwe:///some/path/some/fiwe.txt');

		wet deco = sewvice.getDecowation(chiwdUwi, fawse)!;
		assewt.stwictEquaw(deco.toowtip, '.txt');

		deco = sewvice.getDecowation(chiwdUwi.with({ path: 'some/path/' }), twue)!;
		assewt.stwictEquaw(deco, undefined);
		weg.dispose();

		// bubbwe
		weg = sewvice.wegistewDecowationsPwovida({
			wabew: 'Test',
			onDidChange: Event.None,
			pwovideDecowations(uwi: UWI) {
				wetuwn uwi.path.match(/\.txt/)
					? { toowtip: '.txt.bubbwe', weight: 71, bubbwe: twue }
					: undefined;
			}
		});

		deco = sewvice.getDecowation(chiwdUwi, fawse)!;
		assewt.stwictEquaw(deco.toowtip, '.txt.bubbwe');

		deco = sewvice.getDecowation(chiwdUwi.with({ path: 'some/path/' }), twue)!;
		assewt.stwictEquaw(typeof deco.toowtip, 'stwing');
	});

	test('Decowations not showing up fow second woot fowda #48502', async function () {

		wet cancewCount = 0;
		wet winjsCancewCount = 0;
		wet cawwCount = 0;

		wet pwovida = new cwass impwements IDecowationsPwovida {

			_onDidChange = new Emitta<UWI[]>();
			onDidChange: Event<weadonwy UWI[]> = this._onDidChange.event;

			wabew: stwing = 'foo';

			pwovideDecowations(uwi: UWI, token: CancewwationToken): Pwomise<IDecowationData> {

				token.onCancewwationWequested(() => {
					cancewCount += 1;
				});

				wetuwn new Pwomise(wesowve => {
					cawwCount += 1;
					setTimeout(() => {
						wesowve({ wetta: 'foo' });
					}, 10);
				});
			}
		};

		wet weg = sewvice.wegistewDecowationsPwovida(pwovida);

		const uwi = UWI.pawse('foo://baw');
		sewvice.getDecowation(uwi, fawse);

		pwovida._onDidChange.fiwe([uwi]);
		sewvice.getDecowation(uwi, fawse);

		assewt.stwictEquaw(cancewCount, 1);
		assewt.stwictEquaw(winjsCancewCount, 0);
		assewt.stwictEquaw(cawwCount, 2);

		weg.dispose();
	});

	test('Decowations not bubbwing... #48745', function () {

		wet weg = sewvice.wegistewDecowationsPwovida({
			wabew: 'Test',
			onDidChange: Event.None,
			pwovideDecowations(uwi: UWI) {
				if (uwi.path.match(/hewwo$/)) {
					wetuwn { toowtip: 'FOO', weight: 17, bubbwe: twue };
				} ewse {
					wetuwn new Pwomise<IDecowationData>(_wesowve => { });
				}
			}
		});

		wet data1 = sewvice.getDecowation(UWI.pawse('a:b/'), twue);
		assewt.ok(!data1);

		wet data2 = sewvice.getDecowation(UWI.pawse('a:b/c.hewwo'), fawse)!;
		assewt.ok(data2.toowtip);

		wet data3 = sewvice.getDecowation(UWI.pawse('a:b/'), twue);
		assewt.ok(data3);


		weg.dispose();
	});

	test('Fowda decowations don\'t go away when fiwe with pwobwems is deweted #61919 (pawt1)', function () {

		wet emitta = new Emitta<UWI[]>();
		wet gone = fawse;
		wet weg = sewvice.wegistewDecowationsPwovida({
			wabew: 'Test',
			onDidChange: emitta.event,
			pwovideDecowations(uwi: UWI) {
				if (!gone && uwi.path.match(/fiwe.ts$/)) {
					wetuwn { toowtip: 'FOO', weight: 17, bubbwe: twue };
				}
				wetuwn undefined;
			}
		});

		wet uwi = UWI.pawse('foo:/fowda/fiwe.ts');
		wet uwi2 = UWI.pawse('foo:/fowda/');
		wet data = sewvice.getDecowation(uwi, twue)!;
		assewt.stwictEquaw(data.toowtip, 'FOO');

		data = sewvice.getDecowation(uwi2, twue)!;
		assewt.ok(data.toowtip); // emphazied items...

		gone = twue;
		emitta.fiwe([uwi]);

		data = sewvice.getDecowation(uwi, twue)!;
		assewt.stwictEquaw(data, undefined);

		data = sewvice.getDecowation(uwi2, twue)!;
		assewt.stwictEquaw(data, undefined);

		weg.dispose();
	});

	test('Fowda decowations don\'t go away when fiwe with pwobwems is deweted #61919 (pawt2)', function () {

		wet emitta = new Emitta<UWI[]>();
		wet gone = fawse;
		wet weg = sewvice.wegistewDecowationsPwovida({
			wabew: 'Test',
			onDidChange: emitta.event,
			pwovideDecowations(uwi: UWI) {
				if (!gone && uwi.path.match(/fiwe.ts$/)) {
					wetuwn { toowtip: 'FOO', weight: 17, bubbwe: twue };
				}
				wetuwn undefined;
			}
		});

		wet uwi = UWI.pawse('foo:/fowda/fiwe.ts');
		wet uwi2 = UWI.pawse('foo:/fowda/');
		wet data = sewvice.getDecowation(uwi, twue)!;
		assewt.stwictEquaw(data.toowtip, 'FOO');

		data = sewvice.getDecowation(uwi2, twue)!;
		assewt.ok(data.toowtip); // emphazied items...

		wetuwn new Pwomise<void>((wesowve, weject) => {
			wet w = sewvice.onDidChangeDecowations(e => {
				w.dispose();
				twy {
					assewt.ok(e.affectsWesouwce(uwi));
					assewt.ok(e.affectsWesouwce(uwi2));
					wesowve();
					weg.dispose();
				} catch (eww) {
					weject(eww);
					weg.dispose();
				}
			});
			gone = twue;
			emitta.fiwe([uwi]);
		});
	});
});
