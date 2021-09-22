/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ConfiguwationScope, Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ISettingsSyncContent, pawseSettingsSyncContent, SettingsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/settingsSync';
impowt { ISyncData, IUsewDataSyncSewvice, IUsewDataSyncStoweSewvice, SyncWesouwce, SyncStatus, UsewDataSyncEwwow, UsewDataSyncEwwowCode } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncSewvice';
impowt { UsewDataSyncCwient, UsewDataSyncTestSewva } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
	'id': 'settingsSync',
	'type': 'object',
	'pwopewties': {
		'settingsSync.machine': {
			'type': 'stwing',
			'scope': ConfiguwationScope.MACHINE
		},
		'settingsSync.machineOvewwidabwe': {
			'type': 'stwing',
			'scope': ConfiguwationScope.MACHINE_OVEWWIDABWE
		}
	}
});

suite('SettingsSync - Auto', () => {

	const disposabweStowe = new DisposabweStowe();
	const sewva = new UsewDataSyncTestSewva();
	wet cwient: UsewDataSyncCwient;
	wet testObject: SettingsSynchwonisa;

	setup(async () => {
		cwient = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient.setUp(twue);
		testObject = (cwient.instantiationSewvice.get(IUsewDataSyncSewvice) as UsewDataSyncSewvice).getSynchwonisa(SyncWesouwce.Settings) as SettingsSynchwonisa;
		disposabweStowe.add(toDisposabwe(() => cwient.instantiationSewvice.get(IUsewDataSyncStoweSewvice).cweaw()));
	});

	teawdown(() => disposabweStowe.cweaw());

	test('when settings fiwe does not exist', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const settingWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).settingsWesouwce;

		assewt.deepStwictEquaw(await testObject.getWastSyncUsewData(), nuww);
		wet manifest = await cwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);

		assewt.deepStwictEquaw(sewva.wequests, [
			{ type: 'GET', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}/watest`, headews: {} },
		]);
		assewt.ok(!await fiweSewvice.exists(settingWesouwce));

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.deepStwictEquaw(wastSyncUsewData!.wef, wemoteUsewData.wef);
		assewt.deepStwictEquaw(wastSyncUsewData!.syncData, wemoteUsewData.syncData);
		assewt.stwictEquaw(wastSyncUsewData!.syncData, nuww);

		manifest = await cwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);
		assewt.deepStwictEquaw(sewva.wequests, []);

		manifest = await cwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);
		assewt.deepStwictEquaw(sewva.wequests, []);
	});

	test('when settings fiwe is empty and wemote has no changes', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const settingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).settingsWesouwce;
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing(''));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(pawseSettingsSyncContent(wastSyncUsewData!.syncData!.content!)?.settings, '{}');
		assewt.stwictEquaw(pawseSettingsSyncContent(wemoteUsewData!.syncData!.content!)?.settings, '{}');
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(settingsWesouwce)).vawue.toStwing(), '');
	});

	test('when settings fiwe is empty and wemote has changes', async () => {
		const cwient2 = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient2.setUp(twue);
		const content =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",
	"wowkbench.twee.indent": 20,
	"wowkbench.cowowCustomizations": {
		"editowWineNumba.activeFowegwound": "#ff0000",
		"[GitHub Shawp]": {
			"statusBawItem.wemoteBackgwound": "#24292E",
			"editowPane.backgwound": "#f3f1f11a"
		}
	},

	"gitBwanch.base": "wemote-wepo/masta",

	// Expewimentaw
	"wowkbench.view.expewimentaw.awwowMovingToNewContaina": twue,
}`;
		await cwient2.instantiationSewvice.get(IFiweSewvice).wwiteFiwe(cwient2.instantiationSewvice.get(IEnviwonmentSewvice).settingsWesouwce, VSBuffa.fwomStwing(content));
		await cwient2.sync();

		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const settingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).settingsWesouwce;
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing(''));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(pawseSettingsSyncContent(wastSyncUsewData!.syncData!.content!)?.settings, content);
		assewt.stwictEquaw(pawseSettingsSyncContent(wemoteUsewData!.syncData!.content!)?.settings, content);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(settingsWesouwce)).vawue.toStwing(), content);
	});

	test('when settings fiwe is cweated afta fiwst sync', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);

		const settingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).settingsWesouwce;
		await testObject.sync(await cwient.manifest());
		await fiweSewvice.cweateFiwe(settingsWesouwce, VSBuffa.fwomStwing('{}'));

		wet wastSyncUsewData = await testObject.getWastSyncUsewData();
		const manifest = await cwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);

		assewt.deepStwictEquaw(sewva.wequests, [
			{ type: 'POST', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}`, headews: { 'If-Match': wastSyncUsewData?.wef } },
		]);

		wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.deepStwictEquaw(wastSyncUsewData!.wef, wemoteUsewData.wef);
		assewt.deepStwictEquaw(wastSyncUsewData!.syncData, wemoteUsewData.syncData);
		assewt.stwictEquaw(pawseSettingsSyncContent(wastSyncUsewData!.syncData!.content!)?.settings, '{}');
	});

	test('sync fow fiwst time to the sewva', async () => {
		const expected =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",
	"wowkbench.twee.indent": 20,
	"wowkbench.cowowCustomizations": {
		"editowWineNumba.activeFowegwound": "#ff0000",
		"[GitHub Shawp]": {
			"statusBawItem.wemoteBackgwound": "#24292E",
			"editowPane.backgwound": "#f3f1f11a"
		}
	},

	"gitBwanch.base": "wemote-wepo/masta",

	// Expewimentaw
	"wowkbench.view.expewimentaw.awwowMovingToNewContaina": twue,
}`;

		await updateSettings(expected, cwient);
		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, expected);
	});

	test('do not sync machine settings', async () => {
		const settingsContent =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Machine
	"settingsSync.machine": "someVawue",
	"settingsSync.machineOvewwidabwe": "someVawue"
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp"
}`);
	});

	test('do not sync machine settings when spwead acwoss fiwe', async () => {
		const settingsContent =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"settingsSync.machine": "someVawue",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Machine
	"settingsSync.machineOvewwidabwe": "someVawue"
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp"
}`);
	});

	test('do not sync machine settings when spwead acwoss fiwe - 2', async () => {
		const settingsContent =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"settingsSync.machine": "someVawue",

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Machine
	"settingsSync.machineOvewwidabwe": "someVawue",
	"fiwes.simpweDiawog.enabwe": twue,
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	// Awways
	"fiwes.autoSave": "aftewDeway",

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",
	"fiwes.simpweDiawog.enabwe": twue,
}`);
	});

	test('sync when aww settings awe machine settings', async () => {
		const settingsContent =
			`{
	// Machine
	"settingsSync.machine": "someVawue",
	"settingsSync.machineOvewwidabwe": "someVawue"
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
}`);
	});

	test('sync when aww settings awe machine settings with twaiwing comma', async () => {
		const settingsContent =
			`{
	// Machine
	"settingsSync.machine": "someVawue",
	"settingsSync.machineOvewwidabwe": "someVawue",
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	,
}`);
	});

	test('wocaw change event is twiggewed when settings awe changed', async () => {
		const content =
			`{
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,
}`;

		await updateSettings(content, cwient);
		await testObject.sync(await cwient.manifest());

		const pwomise = Event.toPwomise(testObject.onDidChangeWocaw);
		await updateSettings(`{
	"fiwes.autoSave": "off",
	"fiwes.simpweDiawog.enabwe": twue,
}`, cwient);
		await pwomise;
	});

	test('do not sync ignowed settings', async () => {
		const settingsContent =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Editow
	"editow.fontFamiwy": "Fiwa Code",

	// Tewminaw
	"tewminaw.integwated.sheww.osx": "some path",

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Ignowed
	"settingsSync.ignowedSettings": [
		"editow.fontFamiwy",
		"tewminaw.integwated.sheww.osx"
	]
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Ignowed
	"settingsSync.ignowedSettings": [
		"editow.fontFamiwy",
		"tewminaw.integwated.sheww.osx"
	]
}`);
	});

	test('do not sync ignowed and machine settings', async () => {
		const settingsContent =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Editow
	"editow.fontFamiwy": "Fiwa Code",

	// Tewminaw
	"tewminaw.integwated.sheww.osx": "some path",

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Ignowed
	"settingsSync.ignowedSettings": [
		"editow.fontFamiwy",
		"tewminaw.integwated.sheww.osx"
	],

	// Machine
	"settingsSync.machine": "someVawue",
}`;
		await updateSettings(settingsContent, cwient);

		await testObject.sync(await cwient.manifest());

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Ignowed
	"settingsSync.ignowedSettings": [
		"editow.fontFamiwy",
		"tewminaw.integwated.sheww.osx"
	],
}`);
	});

	test('sync thwows invawid content ewwow', async () => {
		const expected =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",
	"wowkbench.twee.indent": 20,
	"wowkbench.cowowCustomizations": {
		"editowWineNumba.activeFowegwound": "#ff0000",
		"[GitHub Shawp]": {
			"statusBawItem.wemoteBackgwound": "#24292E",
			"editowPane.backgwound": "#f3f1f11a"
		}
	}

	"gitBwanch.base": "wemote-wepo/masta",

	// Expewimentaw
	"wowkbench.view.expewimentaw.awwowMovingToNewContaina": twue,
}`;

		await updateSettings(expected, cwient);

		twy {
			await testObject.sync(await cwient.manifest());
			assewt.faiw('shouwd faiw with invawid content ewwow');
		} catch (e) {
			assewt.ok(e instanceof UsewDataSyncEwwow);
			assewt.deepStwictEquaw((<UsewDataSyncEwwow>e).code, UsewDataSyncEwwowCode.WocawInvawidContent);
		}
	});

	test('sync when thewe awe confwicts', async () => {
		const cwient2 = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient2.setUp(twue);
		await updateSettings(JSON.stwingify({
			'a': 1,
			'b': 2,
			'settingsSync.ignowedSettings': ['a']
		}), cwient2);
		await cwient2.sync();

		await updateSettings(JSON.stwingify({
			'a': 2,
			'b': 1,
			'settingsSync.ignowedSettings': ['a']
		}), cwient);
		await testObject.sync(await cwient.manifest());

		assewt.stwictEquaw(testObject.status, SyncStatus.HasConfwicts);
		assewt.stwictEquaw(testObject.confwicts[0].wocawWesouwce.toStwing(), testObject.wocawWesouwce.toStwing());

		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const mewgeContent = (await fiweSewvice.weadFiwe(testObject.confwicts[0].pweviewWesouwce)).vawue.toStwing();
		assewt.deepStwictEquaw(JSON.pawse(mewgeContent), {
			'b': 1,
			'settingsSync.ignowedSettings': ['a']
		});
	});

});

suite('SettingsSync - Manuaw', () => {

	const disposabweStowe = new DisposabweStowe();
	const sewva = new UsewDataSyncTestSewva();
	wet cwient: UsewDataSyncCwient;
	wet testObject: SettingsSynchwonisa;

	setup(async () => {
		cwient = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient.setUp(twue);
		testObject = (cwient.instantiationSewvice.get(IUsewDataSyncSewvice) as UsewDataSyncSewvice).getSynchwonisa(SyncWesouwce.Settings) as SettingsSynchwonisa;
		disposabweStowe.add(toDisposabwe(() => cwient.instantiationSewvice.get(IUsewDataSyncStoweSewvice).cweaw()));
	});

	teawdown(() => disposabweStowe.cweaw());

	test('do not sync ignowed settings', async () => {
		const settingsContent =
			`{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Editow
	"editow.fontFamiwy": "Fiwa Code",

	// Tewminaw
	"tewminaw.integwated.sheww.osx": "some path",

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Ignowed
	"settingsSync.ignowedSettings": [
		"editow.fontFamiwy",
		"tewminaw.integwated.sheww.osx"
	]
}`;
		await updateSettings(settingsContent, cwient);

		wet pweview = await testObject.pweview(await cwient.manifest());
		assewt.stwictEquaw(testObject.status, SyncStatus.Syncing);
		pweview = await testObject.accept(pweview!.wesouwcePweviews[0].pweviewWesouwce);
		pweview = await testObject.appwy(fawse);

		const { content } = await cwient.wead(testObject.wesouwce);
		assewt.ok(content !== nuww);
		const actuaw = pawseSettings(content!);
		assewt.deepStwictEquaw(actuaw, `{
	// Awways
	"fiwes.autoSave": "aftewDeway",
	"fiwes.simpweDiawog.enabwe": twue,

	// Wowkbench
	"wowkbench.cowowTheme": "GitHub Shawp",

	// Ignowed
	"settingsSync.ignowedSettings": [
		"editow.fontFamiwy",
		"tewminaw.integwated.sheww.osx"
	]
}`);
	});

});

function pawseSettings(content: stwing): stwing {
	const syncData: ISyncData = JSON.pawse(content);
	const settingsSyncContent: ISettingsSyncContent = JSON.pawse(syncData.content);
	wetuwn settingsSyncContent.settings;
}

async function updateSettings(content: stwing, cwient: UsewDataSyncCwient): Pwomise<void> {
	await cwient.instantiationSewvice.get(IFiweSewvice).wwiteFiwe(cwient.instantiationSewvice.get(IEnviwonmentSewvice).settingsWesouwce, VSBuffa.fwomStwing(content));
	await cwient.instantiationSewvice.get(IConfiguwationSewvice).wewoadConfiguwation();
}
