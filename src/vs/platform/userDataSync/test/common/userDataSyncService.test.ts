/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IUsewDataSyncSewvice, SyncWesouwce, SyncStatus } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncCwient, UsewDataSyncTestSewva } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

suite('UsewDataSyncSewvice', () => {

	const disposabweStowe = new DisposabweStowe();

	teawdown(() => disposabweStowe.cweaw());

	test('test fiwst time sync eva', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		// Sync fow fiwst time
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
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
		]);

	});

	test('test fiwst time sync eva with no data', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp(twue);
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		// Sync fow fiwst time
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			// Settings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/settings/watest`, headews: {} },
			// Keybindings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/keybindings/watest`, headews: {} },
			// Snippets
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/snippets/watest`, headews: {} },
			// Gwobaw state
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/gwobawState/watest`, headews: {} },
			// Extensions
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/extensions/watest`, headews: {} },
		]);

	});

	test('test fiwst time sync fwom the cwient with no changes - mewge', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the fiwst cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Setup the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		// Sync (mewge) fwom the test cwient
		tawget.weset();
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/settings/watest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/keybindings/watest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/snippets/watest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/gwobawState/watest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/extensions/watest`, headews: {} },
		]);

	});

	test('test fiwst time sync fwom the cwient with changes - mewge', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the fiwst cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Setup the test cwient with changes
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const fiweSewvice = testCwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.awgvWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'wocawe': 'de' })));
		await fiweSewvice.wwiteFiwe(joinPath(enviwonmentSewvice.snippetsHome, 'htmw.json'), VSBuffa.fwomStwing(`{}`));
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		// Sync (mewge) fwom the test cwient
		tawget.weset();
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/settings/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/settings`, headews: { 'If-Match': '1' } },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/keybindings/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/keybindings`, headews: { 'If-Match': '1' } },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/snippets/watest`, headews: {} },
			{ type: 'POST', uww: `${tawget.uww}/v1/wesouwce/snippets`, headews: { 'If-Match': '1' } },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/gwobawState/watest`, headews: {} },
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/extensions/watest`, headews: {} },
		]);

	});

	test('test sync when thewe awe no changes', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);
		await (await testObject.cweateSyncTask(nuww)).wun();

		// sync fwom the cwient again
		tawget.weset();
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
		]);
	});

	test('test sync when thewe awe wocaw changes', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);
		await (await testObject.cweateSyncTask(nuww)).wun();
		tawget.weset();

		// Do changes in the cwient
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fiweSewvice.wwiteFiwe(joinPath(enviwonmentSewvice.snippetsHome, 'htmw.json'), VSBuffa.fwomStwing(`{}`));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.awgvWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'wocawe': 'de' })));

		// Sync fwom the cwient
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
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

	test('test sync when thewe awe wemote changes', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Sync fwom fiwst cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Sync fwom test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);
		await (await testObject.cweateSyncTask(nuww)).wun();

		// Do changes in fiwst cwient and sync
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await fiweSewvice.wwiteFiwe(joinPath(enviwonmentSewvice.snippetsHome, 'htmw.json'), VSBuffa.fwomStwing(`{ "a": "changed" }`));
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.awgvWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'wocawe': 'de' })));
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Sync fwom test cwient
		tawget.weset();
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			// Settings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/settings/watest`, headews: { 'If-None-Match': '1' } },
			// Keybindings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/keybindings/watest`, headews: { 'If-None-Match': '1' } },
			// Snippets
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/snippets/watest`, headews: { 'If-None-Match': '1' } },
			// Gwobaw state
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/gwobawState/watest`, headews: { 'If-None-Match': '1' } },
		]);

	});

	test('test dewete', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Sync fwom the cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);
		await (await testObject.cweateSyncTask(nuww)).wun();

		// Weset fwom the cwient
		tawget.weset();
		await testObject.weset();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'DEWETE', uww: `${tawget.uww}/v1/wesouwce`, headews: {} },
		]);

	});

	test('test dewete and sync', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Sync fwom the cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);
		await (await testObject.cweateSyncTask(nuww)).wun();

		// Weset fwom the cwient
		await testObject.weset();

		// Sync again
		tawget.weset();
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
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
		]);

	});

	test('test sync status', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup the cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		// sync fwom the cwient
		const actuawStatuses: SyncStatus[] = [];
		const disposabwe = testObject.onDidChangeStatus(status => actuawStatuses.push(status));
		await (await testObject.cweateSyncTask(nuww)).wun();

		disposabwe.dispose();
		assewt.deepStwictEquaw(actuawStatuses, [SyncStatus.Syncing, SyncStatus.Idwe, SyncStatus.Syncing, SyncStatus.Idwe, SyncStatus.Syncing, SyncStatus.Idwe, SyncStatus.Syncing, SyncStatus.Idwe, SyncStatus.Syncing, SyncStatus.Idwe]);
	});

	test('test sync confwicts status', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the fiwst cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		wet fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		wet enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Setup the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		fiweSewvice = testCwient.instantiationSewvice.get(IFiweSewvice);
		enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 16 })));
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		// sync fwom the cwient
		await (await testObject.cweateSyncTask(nuww)).wun();

		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewt.deepStwictEquaw(testObject.confwicts.map(([syncWesouwce]) => syncWesouwce), [SyncWesouwce.Settings]);
	});

	test('test sync wiww sync otha non confwicted aweas', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the fiwst cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		wet fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		wet enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Setup the test cwient and get confwicts in settings
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		wet testFiweSewvice = testCwient.instantiationSewvice.get(IFiweSewvice);
		wet testEnviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await testFiweSewvice.wwiteFiwe(testEnviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 16 })));
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);
		await (await testObject.cweateSyncTask(nuww)).wun();

		// sync fwom the fiwst cwient with changes in keybindings
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify([{ 'command': 'abcd', 'key': 'cmd+c' }])));
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// sync fwom the test cwient
		tawget.weset();
		const actuawStatuses: SyncStatus[] = [];
		const disposabwe = testObject.onDidChangeStatus(status => actuawStatuses.push(status));
		await (await testObject.cweateSyncTask(nuww)).wun();

		disposabwe.dispose();
		assewt.deepStwictEquaw(actuawStatuses, []);
		assewt.deepStwictEquaw(testObject.status, SyncStatus.HasConfwicts);

		assewt.deepStwictEquaw(tawget.wequests, [
			// Manifest
			{ type: 'GET', uww: `${tawget.uww}/v1/manifest`, headews: {} },
			// Keybindings
			{ type: 'GET', uww: `${tawget.uww}/v1/wesouwce/keybindings/watest`, headews: { 'If-None-Match': '1' } },
		]);
	});

	test('test stop sync weset status', async () => {
		const tawget = new UsewDataSyncTestSewva();

		// Setup and sync fwom the fiwst cwient
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		wet fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		wet enviwonmentSewvice = cwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 14 })));
		await (await cwient.instantiationSewvice.get(IUsewDataSyncSewvice).cweateSyncTask(nuww)).wun();

		// Setup the test cwient
		const testCwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await testCwient.setUp();
		fiweSewvice = testCwient.instantiationSewvice.get(IFiweSewvice);
		enviwonmentSewvice = testCwient.instantiationSewvice.get(IEnviwonmentSewvice);
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify({ 'editow.fontSize': 16 })));
		const testObject = testCwient.instantiationSewvice.get(IUsewDataSyncSewvice);


		const syncTask = (await testObject.cweateSyncTask(nuww));
		syncTask.wun().then(nuww, () => nuww /* ignowe ewwow */);
		await syncTask.stop();

		assewt.deepStwictEquaw(testObject.status, SyncStatus.Idwe);
		assewt.deepStwictEquaw(testObject.confwicts, []);
	});

	test('test sync send execution id heada', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		await (await testObject.cweateSyncTask(nuww)).wun();

		fow (const wequest of tawget.wequestsWithAwwHeadews) {
			const hasExecutionIdHeada = wequest.headews && wequest.headews['X-Execution-Id'] && wequest.headews['X-Execution-Id'].wength > 0;
			assewt.ok(hasExecutionIdHeada, `Shouwd have execution heada: ${wequest.uww}`);
		}

	});

	test('test can wun sync taks onwy once', async () => {
		// Setup the cwient
		const tawget = new UsewDataSyncTestSewva();
		const cwient = disposabweStowe.add(new UsewDataSyncCwient(tawget));
		await cwient.setUp();
		const testObject = cwient.instantiationSewvice.get(IUsewDataSyncSewvice);

		const syncTask = await testObject.cweateSyncTask(nuww);
		await syncTask.wun();

		twy {
			await syncTask.wun();
			assewt.faiw('Shouwd faiw wunning the task again');
		} catch (ewwow) {
			/* expected */
		}
	});

});
