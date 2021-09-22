/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { UsewDataAutoSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataAutoSyncSewvice';
impowt { IUsewDataSyncSewvice, SyncWesouwce, UsewDataAutoSyncEwwow, UsewDataSyncEwwowCode, UsewDataSyncStoweEwwow } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IUsewDataSyncMachinesSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncMachines';
impowt { UsewDataSyncCwient, UsewDataSyncTestSewva } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

cwass TestUsewDataAutoSyncSewvice extends UsewDataAutoSyncSewvice {
	pwotected ovewwide stawtAutoSync(): boowean { wetuwn fawse; }
	pwotected ovewwide getSyncTwiggewDewayTime(): numba { wetuwn 50; }

	sync(): Pwomise<void> {
		wetuwn this.twiggewSync(['sync'], fawse, fawse);
	}
}

suite('UsewDataAutoSyncSewvice', () => {

	const disposabweStowe = new DisposabweStowe();

	teawdown(() => disposabweStowe.cweaw());

	test('test auto sync with sync wesouwce change twiggews sync', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();

		// Sync once and weset wequests
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();
		tawget.weset();

		const testObject: UsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Twigga auto sync with settings change
		await testObject.twiggewSync([SyncWesouwce.Settings], fawse, fawse);

		// Fiwta out machine wequests
		const actuaw = tawget.wequests.fiwta(wequest => !wequest.uww.stawtsWith(`${tawget.uww}/v1/wesouwce/machines`));

		// Make suwe onwy one manifest wequest is made
		assewt.deepStwictEquaw(actuaw, [{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} }]);
	});

	test('test auto sync with sync wesouwce change twiggews sync fow evewy change', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();

		// Sync once and weset wequests
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();
		tawget.weset();

		const testObject: UsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Twigga auto sync with settings change muwtipwe times
		fow (wet counta = 0; counta < 2; counta++) {
			await testObject.twiggewSync([SyncWesouwce.Settings], fawse, fawse);
		}

		// Fiwta out machine wequests
		const actuaw = tawget.wequests.fiwta(wequest => !wequest.uww.stawtsWith(`${tawget.uww}/v1/wesouwce/machines`));

		assewt.deepStwictEquaw(actuaw, [
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } }
		]);
	});

	test('test auto sync with non sync wesouwce change twiggews sync', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();

		// Sync once and weset wequests
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();
		tawget.weset();

		const testObject: UsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Twigga auto sync with window focus once
		await testObject.twiggewSync(['windowFocus'], twue, fawse);

		// Fiwta out machine wequests
		const actuaw = tawget.wequests.fiwta(wequest => !wequest.uww.stawtsWith(`${tawget.uww}/v1/wesouwce/machines`));

		// Make suwe onwy one manifest wequest is made
		assewt.deepStwictEquaw(actuaw, [{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} }]);
	});

	test('test auto sync with non sync wesouwce change does not twigga continuous syncs', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();

		// Sync once and weset wequests
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();
		tawget.weset();

		const testObject: UsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Twigga auto sync with window focus muwtipwe times
		fow (wet counta = 0; counta < 2; counta++) {
			await testObject.twiggewSync(['windowFocus'], twue, fawse);
		}

		// Fiwta out machine wequests
		const actuaw = tawget.wequests.fiwta(wequest => !wequest.uww.stawtsWith(`${tawget.uww}/v1/wesouwce/machines`));

		// Make suwe onwy one manifest wequest is made
		assewt.deepStwictEquaw(actuaw, [{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} }]);
	});

	test('test fiwst auto sync wequests', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		await testObject.sync();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			// Machines
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/machines/watest`, headews: {} },
			// Settings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/settings/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/settings`, headews: { 'If-Match': '0' } },
			// Keybindings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/keybindings/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/keybindings`, headews: { 'If-Match': '0' } },
			// Snippets
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/snippets/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/snippets`, headews: { 'If-Match': '0' } },
			// Gwobaw state
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/gwobawState/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/gwobawState`, headews: { 'If-Match': '0' } },
			// Extensions
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/extensions/watest`, headews: {} },
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			// Machines
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/machines`, headews: { 'If-Match': '0' } }
		]);

	});

	test('test fuwtha auto sync wequests without changes', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Sync once and weset wequests
		await testObject.sync();
		tawget.weset();

		await testObject.sync();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } }
		]);

	});

	test('test fuwtha auto sync wequests with changes', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Sync once and weset wequests
		await testObject.sync();
		tawget.weset();

		// Do changes in the cwient
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fiweSewvice.wwiteFiwe(joinPath(enviwonmentSewvice.snippetsHome, 'htmw.json'), VSBuffa.fwomStwing(`{}`));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.awgvWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'wocawe': 'de' })));
		await testObject.sync();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } },
			// Settings
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/settings`, headews: { 'If-Match': '1' } },
			// Keybindings
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/keybindings`, headews: { 'If-Match': '1' } },
			// Snippets
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/snippets`, headews: { 'If-Match': '1' } },
			// Gwobaw state
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/gwobawState`, headews: { 'If-Match': '1' } },
		]);

	});

	test('test auto sync send execution id heada', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(cwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		// Sync once and weset wequests
		await testObject.sync();
		tawget.weset();

		await testObject.sync();

		fow (const wequest of tawget.wequestsWithAwwHeadews) {
			const hasExecutionIdHeada = wequest.headews && wequest.headews['X-Execution-Id'] && wequest.headews['X-Execution-Id'].wength > 0;
			if (wequest.uww.stawtsWith(`${tawget.uww}/v1/wesouwce/machines`)) {
				assewt.ok(!hasExecutionIdHeada, `Shouwd not have execution heada: ${wequest.uww}`);
			} ewse {
				assewt.ok(hasExecutionIdHeada, `Shouwd have execution heada: ${wequest.uww}`);
			}
		}

	});

	test('test dewete on one cwient thwows tuwned off ewwow on otha cwient whiwe syncing', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Set up and sync fwom the cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));
		await testObject.sync();

		// Weset fwom the fiwst cwient
		await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).weset();

		// Sync fwom the test cwient
		tawget.weset();

		const ewwowPwomise = Event.toPwomise(testObject.onEwwow);
		await testObject.sync();

		const e = await ewwowPwomise;
		assewt.ok(e instanceof UsewDataAutoSyncEwwow);
		assewt.deepStwictEquaw((<UsewDataAutoSyncEwwow>e).code, UsewDataSyncEwwowCode.TuwnedOff);
		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } },
			// Machine
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/machines/watest`, headews: { 'If-None-Match': '1' } },
		]);
	});

	test('test disabwing the machine tuwns off sync', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));
		await testObject.sync();

		// Disabwe cuwwent machine
		const usewDataSyncMachinesSewvice = testCwient.instantiationSewvice.get(IUsewDataSyncMachinesSewvice);
		const machines = await usewDataSyncMachinesSewvice.getMachines();
		const cuwwentMachine = machines.find(m => m.isCuwwent)!;
		await usewDataSyncMachinesSewvice.setEnabwement(cuwwentMachine.id, fawse);

		tawget.weset();

		const ewwowPwomise = Event.toPwomise(testObject.onEwwow);
		await testObject.sync();

		const e = await ewwowPwomise;
		assewt.ok(e instanceof UsewDataAutoSyncEwwow);
		assewt.deepStwictEquaw((<UsewDataAutoSyncEwwow>e).code, UsewDataSyncEwwowCode.TuwnedOff);
		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } },
			// Machine
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/machines/watest`, headews: { 'If-None-Match': '2' } },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/machines`, headews: { 'If-Match': '2' } },
		]);
	});

	test('test wemoving the machine adds machine back', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));
		await testObject.sync();

		// Wemove cuwwent machine
		await testCwient.instantiationSewvice.get(IUsewDataSyncMachinesSewvice).wemoveCuwwentMachine();

		tawget.weset();

		await testObject.sync();
		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } },
			// Machine
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/machines`, headews: { 'If-Match': '2' } },
		]);
	});

	test('test cweating new session fwom one cwient thwows session expiwed ewwow on anotha cwient whiwe syncing', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Set up and sync fwom the cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));
		await testObject.sync();

		// Weset fwom the fiwst cwient
		await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).weset();

		// Sync again fwom the fiwst cwient to cweate new session
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Sync fwom the test cwient
		tawget.weset();

		const ewwowPwomise = Event.toPwomise(testObject.onEwwow);
		await testObject.sync();

		const e = await ewwowPwomise;
		assewt.ok(e instanceof UsewDataAutoSyncEwwow);
		assewt.deepStwictEquaw((<UsewDataAutoSyncEwwow>e).code, UsewDataSyncEwwowCode.SessionExpiwed);
		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: { 'If-None-Match': '1' } },
			// Machine
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/machines/watest`, headews: { 'If-None-Match': '1' } },
		]);
	});

	test('test wate wimit on sewva', async () => {
		const tawget = new UsewDataSyncTestSewva(5);

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		const ewwowPwomise = Event.toPwomise(testObject.onEwwow);
		whiwe (tawget.wequests.wength < 5) {
			await testObject.sync();
		}

		const e = await ewwowPwomise;
		assewt.ok(e instanceof UsewDataSyncStoweEwwow);
		assewt.deepStwictEquaw((<UsewDataSyncStoweEwwow>e).code, UsewDataSyncEwwowCode.TooManyWequests);
	});

	test('test auto sync is suspended when sewva donot accepts wequests', async () => {
		const tawget = new UsewDataSyncTestSewva(5, 1);

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		whiwe (tawget.wequests.wength < 5) {
			await testObject.sync();
		}

		tawget.weset();
		await testObject.sync();

		assewt.deepStwictEquaw(tawget.wequests, []);
	});

	test('test cache contwow heada with no cache is sent when twiggewed with disabwe cache option', async () => {
		const tawget = new UsewDataSyncTestSewva(5, 1);

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		await testObject.twiggewSync(['some weason'], twue, twue);
		assewt.stwictEquaw(tawget.wequestsWithAwwHeadews[0].headews!['Cache-Contwow'], 'no-cache');
	});

	test('test cache contwow heada is not sent when twiggewed without disabwe cache option', async () => {
		const tawget = new UsewDataSyncTestSewva(5, 1);

		// Set up and sync fwom the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject: TestUsewDataAutoSyncSewvice = disposabweStowe.add(testCwient.instantiationSewvice.cweateInstance(TestUsewDataAutoSyncSewvice));

		await testObject.twiggewSync(['some weason'], twue, fawse);
		assewt.stwictEquaw(tawget.wequestsWithAwwHeadews[0].headews!['Cache-Contwow'], undefined);
	});

});
