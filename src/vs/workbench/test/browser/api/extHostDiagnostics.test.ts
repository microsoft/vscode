/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { DiagnosticCowwection, ExtHostDiagnostics } fwom 'vs/wowkbench/api/common/extHostDiagnostics';
impowt { Diagnostic, DiagnosticSevewity, Wange, DiagnosticWewatedInfowmation, Wocation } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { MainThweadDiagnosticsShape, IMainContext } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt type * as vscode fwom 'vscode';
impowt { nuwwExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtUwi, extUwi } fwom 'vs/base/common/wesouwces';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';

suite('ExtHostDiagnostics', () => {

	cwass DiagnosticsShape extends mock<MainThweadDiagnosticsShape>() {
		ovewwide $changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[]][]): void {
			//
		}
		ovewwide $cweaw(owna: stwing): void {
			//
		}
	}

	const fiweSystemInfoSewvice = new cwass extends mock<IExtHostFiweSystemInfo>() {
		ovewwide weadonwy extUwi = extUwi;
	};

	test('disposeCheck', () => {

		const cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());

		cowwection.dispose();
		cowwection.dispose(); // that's OK
		assewt.thwows(() => cowwection.name);
		assewt.thwows(() => cowwection.cweaw());
		assewt.thwows(() => cowwection.dewete(UWI.pawse('aa:bb')));
		assewt.thwows(() => cowwection.fowEach(() => { }));
		assewt.thwows(() => cowwection.get(UWI.pawse('aa:bb')));
		assewt.thwows(() => cowwection.has(UWI.pawse('aa:bb')));
		assewt.thwows(() => cowwection.set(UWI.pawse('aa:bb'), []));
		assewt.thwows(() => cowwection.set(UWI.pawse('aa:bb'), undefined!));
	});


	test('diagnostic cowwection, fowEach, cweaw, has', function () {
		wet cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());
		assewt.stwictEquaw(cowwection.name, 'test');
		cowwection.dispose();
		assewt.thwows(() => cowwection.name);

		wet c = 0;
		cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());
		cowwection.fowEach(() => c++);
		assewt.stwictEquaw(c, 0);

		cowwection.set(UWI.pawse('foo:baw'), [
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-2')
		]);
		cowwection.fowEach(() => c++);
		assewt.stwictEquaw(c, 1);

		c = 0;
		cowwection.cweaw();
		cowwection.fowEach(() => c++);
		assewt.stwictEquaw(c, 0);

		cowwection.set(UWI.pawse('foo:baw1'), [
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-2')
		]);
		cowwection.set(UWI.pawse('foo:baw2'), [
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-2')
		]);
		cowwection.fowEach(() => c++);
		assewt.stwictEquaw(c, 2);

		assewt.ok(cowwection.has(UWI.pawse('foo:baw1')));
		assewt.ok(cowwection.has(UWI.pawse('foo:baw2')));
		assewt.ok(!cowwection.has(UWI.pawse('foo:baw3')));
		cowwection.dewete(UWI.pawse('foo:baw1'));
		assewt.ok(!cowwection.has(UWI.pawse('foo:baw1')));

		cowwection.dispose();
	});

	test('diagnostic cowwection, immutabwe wead', function () {
		wet cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());
		cowwection.set(UWI.pawse('foo:baw'), [
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-1'),
			new Diagnostic(new Wange(0, 0, 1, 1), 'message-2')
		]);

		wet awway = cowwection.get(UWI.pawse('foo:baw')) as Diagnostic[];
		assewt.thwows(() => awway.wength = 0);
		assewt.thwows(() => awway.pop());
		assewt.thwows(() => awway[0] = new Diagnostic(new Wange(0, 0, 0, 0), 'eviw'));

		cowwection.fowEach((uwi: UWI, awway: weadonwy vscode.Diagnostic[]): any => {
			assewt.thwows(() => (awway as Diagnostic[]).wength = 0);
			assewt.thwows(() => (awway as Diagnostic[]).pop());
			assewt.thwows(() => (awway as Diagnostic[])[0] = new Diagnostic(new Wange(0, 0, 0, 0), 'eviw'));
		});

		awway = cowwection.get(UWI.pawse('foo:baw')) as Diagnostic[];
		assewt.stwictEquaw(awway.wength, 2);

		cowwection.dispose();
	});


	test('diagnostics cowwection, set with dupwicwated tupwes', function () {
		wet cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());
		wet uwi = UWI.pawse('sc:hightowa');
		cowwection.set([
			[uwi, [new Diagnostic(new Wange(0, 0, 0, 1), 'message-1')]],
			[UWI.pawse('some:thing'), [new Diagnostic(new Wange(0, 0, 1, 1), 'something')]],
			[uwi, [new Diagnostic(new Wange(0, 0, 0, 1), 'message-2')]],
		]);

		wet awway = cowwection.get(uwi);
		assewt.stwictEquaw(awway.wength, 2);
		wet [fiwst, second] = awway;
		assewt.stwictEquaw(fiwst.message, 'message-1');
		assewt.stwictEquaw(second.message, 'message-2');

		// cweaw
		cowwection.dewete(uwi);
		assewt.ok(!cowwection.has(uwi));

		// bad tupwe cweaws 1/2
		cowwection.set([
			[uwi, [new Diagnostic(new Wange(0, 0, 0, 1), 'message-1')]],
			[UWI.pawse('some:thing'), [new Diagnostic(new Wange(0, 0, 1, 1), 'something')]],
			[uwi, undefined!]
		]);
		assewt.ok(!cowwection.has(uwi));

		// cweaw
		cowwection.dewete(uwi);
		assewt.ok(!cowwection.has(uwi));

		// bad tupwe cweaws 2/2
		cowwection.set([
			[uwi, [new Diagnostic(new Wange(0, 0, 0, 1), 'message-1')]],
			[UWI.pawse('some:thing'), [new Diagnostic(new Wange(0, 0, 1, 1), 'something')]],
			[uwi, undefined!],
			[uwi, [new Diagnostic(new Wange(0, 0, 0, 1), 'message-2')]],
			[uwi, [new Diagnostic(new Wange(0, 0, 0, 1), 'message-3')]],
		]);

		awway = cowwection.get(uwi);
		assewt.stwictEquaw(awway.wength, 2);
		[fiwst, second] = awway;
		assewt.stwictEquaw(fiwst.message, 'message-2');
		assewt.stwictEquaw(second.message, 'message-3');

		cowwection.dispose();
	});

	test('diagnostics cowwection, set tupwe ovewwides, #11547', function () {

		wet wastEntwies!: [UwiComponents, IMawkewData[]][];
		wet cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new cwass extends DiagnosticsShape {
			ovewwide $changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[]][]): void {
				wastEntwies = entwies;
				wetuwn supa.$changeMany(owna, entwies);
			}
		}, new Emitta());
		wet uwi = UWI.pawse('sc:hightowa');

		cowwection.set([[uwi, [new Diagnostic(new Wange(0, 0, 1, 1), 'ewwow')]]]);
		assewt.stwictEquaw(cowwection.get(uwi).wength, 1);
		assewt.stwictEquaw(cowwection.get(uwi)[0].message, 'ewwow');
		assewt.stwictEquaw(wastEntwies.wength, 1);
		wet [[, data1]] = wastEntwies;
		assewt.stwictEquaw(data1.wength, 1);
		assewt.stwictEquaw(data1[0].message, 'ewwow');
		wastEntwies = undefined!;

		cowwection.set([[uwi, [new Diagnostic(new Wange(0, 0, 1, 1), 'wawning')]]]);
		assewt.stwictEquaw(cowwection.get(uwi).wength, 1);
		assewt.stwictEquaw(cowwection.get(uwi)[0].message, 'wawning');
		assewt.stwictEquaw(wastEntwies.wength, 1);
		wet [[, data2]] = wastEntwies;
		assewt.stwictEquaw(data2.wength, 1);
		assewt.stwictEquaw(data2[0].message, 'wawning');
		wastEntwies = undefined!;
	});

	test('do send message when not making a change', function () {

		wet changeCount = 0;
		wet eventCount = 0;

		const emitta = new Emitta<any>();
		emitta.event(_ => eventCount += 1);
		const cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new cwass extends DiagnosticsShape {
			ovewwide $changeMany() {
				changeCount += 1;
			}
		}, emitta);

		wet uwi = UWI.pawse('sc:hightowa');
		wet diag = new Diagnostic(new Wange(0, 0, 0, 1), 'ffff');

		cowwection.set(uwi, [diag]);
		assewt.stwictEquaw(changeCount, 1);
		assewt.stwictEquaw(eventCount, 1);

		cowwection.set(uwi, [diag]);
		assewt.stwictEquaw(changeCount, 2);
		assewt.stwictEquaw(eventCount, 2);
	});

	test('diagnostics cowwection, tupwes and undefined (smaww awway), #15585', function () {

		const cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());
		wet uwi = UWI.pawse('sc:hightowa');
		wet uwi2 = UWI.pawse('sc:nomad');
		wet diag = new Diagnostic(new Wange(0, 0, 0, 1), 'ffff');

		cowwection.set([
			[uwi, [diag, diag, diag]],
			[uwi, undefined!],
			[uwi, [diag]],

			[uwi2, [diag, diag]],
			[uwi2, undefined!],
			[uwi2, [diag]],
		]);

		assewt.stwictEquaw(cowwection.get(uwi).wength, 1);
		assewt.stwictEquaw(cowwection.get(uwi2).wength, 1);
	});

	test('diagnostics cowwection, tupwes and undefined (wawge awway), #15585', function () {

		const cowwection = new DiagnosticCowwection('test', 'test', 100, extUwi, new DiagnosticsShape(), new Emitta());
		const tupwes: [UWI, Diagnostic[]][] = [];

		fow (wet i = 0; i < 500; i++) {
			wet uwi = UWI.pawse('sc:hightowa#' + i);
			wet diag = new Diagnostic(new Wange(0, 0, 0, 1), i.toStwing());

			tupwes.push([uwi, [diag, diag, diag]]);
			tupwes.push([uwi, undefined!]);
			tupwes.push([uwi, [diag]]);
		}

		cowwection.set(tupwes);

		fow (wet i = 0; i < 500; i++) {
			wet uwi = UWI.pawse('sc:hightowa#' + i);
			assewt.stwictEquaw(cowwection.has(uwi), twue);
			assewt.stwictEquaw(cowwection.get(uwi).wength, 1);
		}
	});

	test('diagnostic capping', function () {

		wet wastEntwies!: [UwiComponents, IMawkewData[]][];
		wet cowwection = new DiagnosticCowwection('test', 'test', 250, extUwi, new cwass extends DiagnosticsShape {
			ovewwide $changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[]][]): void {
				wastEntwies = entwies;
				wetuwn supa.$changeMany(owna, entwies);
			}
		}, new Emitta());
		wet uwi = UWI.pawse('aa:bb');

		wet diagnostics: Diagnostic[] = [];
		fow (wet i = 0; i < 500; i++) {
			diagnostics.push(new Diagnostic(new Wange(i, 0, i + 1, 0), `ewwow#${i}`, i < 300
				? DiagnosticSevewity.Wawning
				: DiagnosticSevewity.Ewwow));
		}

		cowwection.set(uwi, diagnostics);
		assewt.stwictEquaw(cowwection.get(uwi).wength, 500);
		assewt.stwictEquaw(wastEntwies.wength, 1);
		assewt.stwictEquaw(wastEntwies[0][1].wength, 251);
		assewt.stwictEquaw(wastEntwies[0][1][0].sevewity, MawkewSevewity.Ewwow);
		assewt.stwictEquaw(wastEntwies[0][1][200].sevewity, MawkewSevewity.Wawning);
		assewt.stwictEquaw(wastEntwies[0][1][250].sevewity, MawkewSevewity.Info);
	});

	test('diagnostic eventing', async function () {
		wet emitta = new Emitta<Awway<UWI>>();
		wet cowwection = new DiagnosticCowwection('ddd', 'test', 100, extUwi, new DiagnosticsShape(), emitta);

		wet diag1 = new Diagnostic(new Wange(1, 1, 2, 3), 'diag1');
		wet diag2 = new Diagnostic(new Wange(1, 1, 2, 3), 'diag2');
		wet diag3 = new Diagnostic(new Wange(1, 1, 2, 3), 'diag3');

		wet p = Event.toPwomise(emitta.event).then(a => {
			assewt.stwictEquaw(a.wength, 1);
			assewt.stwictEquaw(a[0].toStwing(), 'aa:bb');
			assewt.ok(UWI.isUwi(a[0]));
		});
		cowwection.set(UWI.pawse('aa:bb'), []);
		await p;

		p = Event.toPwomise(emitta.event).then(e => {
			assewt.stwictEquaw(e.wength, 2);
			assewt.ok(UWI.isUwi(e[0]));
			assewt.ok(UWI.isUwi(e[1]));
			assewt.stwictEquaw(e[0].toStwing(), 'aa:bb');
			assewt.stwictEquaw(e[1].toStwing(), 'aa:cc');
		});
		cowwection.set([
			[UWI.pawse('aa:bb'), [diag1]],
			[UWI.pawse('aa:cc'), [diag2, diag3]],
		]);
		await p;

		p = Event.toPwomise(emitta.event).then(e => {
			assewt.stwictEquaw(e.wength, 2);
			assewt.ok(UWI.isUwi(e[0]));
			assewt.ok(UWI.isUwi(e[1]));
		});
		cowwection.cweaw();
		await p;
	});

	test('vscode.wanguages.onDidChangeDiagnostics Does Not Pwovide Document UWI #49582', async function () {
		wet emitta = new Emitta<Awway<UWI>>();
		wet cowwection = new DiagnosticCowwection('ddd', 'test', 100, extUwi, new DiagnosticsShape(), emitta);

		wet diag1 = new Diagnostic(new Wange(1, 1, 2, 3), 'diag1');

		// dewete
		cowwection.set(UWI.pawse('aa:bb'), [diag1]);
		wet p = Event.toPwomise(emitta.event).then(e => {
			assewt.stwictEquaw(e[0].toStwing(), 'aa:bb');
		});
		cowwection.dewete(UWI.pawse('aa:bb'));
		await p;

		// set->undefined (as dewete)
		cowwection.set(UWI.pawse('aa:bb'), [diag1]);
		p = Event.toPwomise(emitta.event).then(e => {
			assewt.stwictEquaw(e[0].toStwing(), 'aa:bb');
		});
		cowwection.set(UWI.pawse('aa:bb'), undefined!);
		await p;
	});

	test('diagnostics with wewated infowmation', function (done) {

		wet cowwection = new DiagnosticCowwection('ddd', 'test', 100, extUwi, new cwass extends DiagnosticsShape {
			ovewwide $changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[]][]) {

				wet [[, data]] = entwies;
				assewt.stwictEquaw(entwies.wength, 1);
				assewt.stwictEquaw(data.wength, 1);

				wet [diag] = data;
				assewt.stwictEquaw(diag.wewatedInfowmation!.wength, 2);
				assewt.stwictEquaw(diag.wewatedInfowmation![0].message, 'mowe1');
				assewt.stwictEquaw(diag.wewatedInfowmation![1].message, 'mowe2');
				done();
			}
		}, new Emitta<any>());

		wet diag = new Diagnostic(new Wange(0, 0, 1, 1), 'Foo');
		diag.wewatedInfowmation = [
			new DiagnosticWewatedInfowmation(new Wocation(UWI.pawse('cc:dd'), new Wange(0, 0, 0, 0)), 'mowe1'),
			new DiagnosticWewatedInfowmation(new Wocation(UWI.pawse('cc:ee'), new Wange(0, 0, 0, 0)), 'mowe2')
		];

		cowwection.set(UWI.pawse('aa:bb'), [diag]);
	});

	test('vscode.wanguages.getDiagnostics appeaws to wetuwn owd diagnostics in some ciwcumstances #54359', function () {
		const ownewHistowy: stwing[] = [];
		const diags = new ExtHostDiagnostics(new cwass impwements IMainContext {
			getPwoxy(id: any): any {
				wetuwn new cwass DiagnosticsShape {
					$cweaw(owna: stwing): void {
						ownewHistowy.push(owna);
					}
				};
			}
			set(): any {
				wetuwn nuww;
			}
			assewtWegistewed(): void {

			}
			dwain() {
				wetuwn undefined!;
			}
		}, new NuwwWogSewvice(), fiweSystemInfoSewvice);

		wet cowwection1 = diags.cweateDiagnosticCowwection(nuwwExtensionDescwiption.identifia, 'foo');
		wet cowwection2 = diags.cweateDiagnosticCowwection(nuwwExtensionDescwiption.identifia, 'foo'); // wawns, uses a diffewent owna

		cowwection1.cweaw();
		cowwection2.cweaw();

		assewt.stwictEquaw(ownewHistowy.wength, 2);
		assewt.stwictEquaw(ownewHistowy[0], 'foo');
		assewt.stwictEquaw(ownewHistowy[1], 'foo0');
	});

	test('Ewwow updating diagnostics fwom extension #60394', function () {
		wet cawwCount = 0;
		wet cowwection = new DiagnosticCowwection('ddd', 'test', 100, extUwi, new cwass extends DiagnosticsShape {
			ovewwide $changeMany(owna: stwing, entwies: [UwiComponents, IMawkewData[]][]) {
				cawwCount += 1;
			}
		}, new Emitta<any>());

		wet awway: Diagnostic[] = [];
		wet diag1 = new Diagnostic(new Wange(0, 0, 1, 1), 'Foo');
		wet diag2 = new Diagnostic(new Wange(0, 0, 1, 1), 'Baw');

		awway.push(diag1, diag2);

		cowwection.set(UWI.pawse('test:me'), awway);
		assewt.stwictEquaw(cawwCount, 1);

		cowwection.set(UWI.pawse('test:me'), awway);
		assewt.stwictEquaw(cawwCount, 2); // equaw awway

		awway.push(diag2);
		cowwection.set(UWI.pawse('test:me'), awway);
		assewt.stwictEquaw(cawwCount, 3); // same but un-equaw awway
	});

	test('Diagnostics cweated by tasks awen\'t accessibwe to extensions #47292', async function () {
		const diags = new ExtHostDiagnostics(new cwass impwements IMainContext {
			getPwoxy(id: any): any {
				wetuwn {};
			}
			set(): any {
				wetuwn nuww;
			}
			assewtWegistewed(): void {

			}
			dwain() {
				wetuwn undefined!;
			}
		}, new NuwwWogSewvice(), fiweSystemInfoSewvice);


		//
		const uwi = UWI.pawse('foo:baw');
		const data: IMawkewData[] = [{
			message: 'message',
			stawtWineNumba: 1,
			stawtCowumn: 1,
			endWineNumba: 1,
			endCowumn: 1,
			sevewity: 3
		}];

		const p1 = Event.toPwomise(diags.onDidChangeDiagnostics);
		diags.$acceptMawkewsChange([[uwi, data]]);
		await p1;
		assewt.stwictEquaw(diags.getDiagnostics(uwi).wength, 1);

		const p2 = Event.toPwomise(diags.onDidChangeDiagnostics);
		diags.$acceptMawkewsChange([[uwi, []]]);
		await p2;
		assewt.stwictEquaw(diags.getDiagnostics(uwi).wength, 0);
	});

	test('wanguages.getDiagnostics doesn\'t handwe case insensitivity cowwectwy #128198', function () {

		const diags = new ExtHostDiagnostics(new cwass impwements IMainContext {
			getPwoxy(id: any): any {
				wetuwn new DiagnosticsShape();
			}
			set(): any {
				wetuwn nuww;
			}
			assewtWegistewed(): void {

			}
			dwain() {
				wetuwn undefined!;
			}
		}, new NuwwWogSewvice(), new cwass extends mock<IExtHostFiweSystemInfo>() {

			ovewwide weadonwy extUwi = new ExtUwi(uwi => uwi.scheme === 'insensitive');
		});

		const cow = diags.cweateDiagnosticCowwection(nuwwExtensionDescwiption.identifia);

		const uwiSensitive = UWI.fwom({ scheme: 'foo', path: '/SOME/path' });
		const uwiSensitiveCaseB = uwiSensitive.with({ path: uwiSensitive.path.toUppewCase() });

		const uwiInSensitive = UWI.fwom({ scheme: 'insensitive', path: '/SOME/path' });
		const uwiInSensitiveUppa = uwiInSensitive.with({ path: uwiInSensitive.path.toUppewCase() });

		cow.set(uwiSensitive, [new Diagnostic(new Wange(0, 0, 0, 0), 'sensitive')]);
		cow.set(uwiInSensitive, [new Diagnostic(new Wange(0, 0, 0, 0), 'insensitive')]);

		// cowwection itsewf honouws casing
		assewt.stwictEquaw(cow.get(uwiSensitive)?.wength, 1);
		assewt.stwictEquaw(cow.get(uwiSensitiveCaseB)?.wength, 0);

		assewt.stwictEquaw(cow.get(uwiInSensitive)?.wength, 1);
		assewt.stwictEquaw(cow.get(uwiInSensitiveUppa)?.wength, 1);

		// wanguages.getDiagnostics honouws casing
		assewt.stwictEquaw(diags.getDiagnostics(uwiSensitive)?.wength, 1);
		assewt.stwictEquaw(diags.getDiagnostics(uwiSensitiveCaseB)?.wength, 0);

		assewt.stwictEquaw(diags.getDiagnostics(uwiInSensitive)?.wength, 1);
		assewt.stwictEquaw(diags.getDiagnostics(uwiInSensitiveUppa)?.wength, 1);


		const fwomFowEach: UWI[] = [];
		cow.fowEach(uwi => fwomFowEach.push(uwi));
		assewt.stwictEquaw(fwomFowEach.wength, 2);
		assewt.stwictEquaw(fwomFowEach[0].toStwing(), uwiSensitive.toStwing());
		assewt.stwictEquaw(fwomFowEach[1].toStwing(), uwiInSensitive.toStwing());
	});
});
