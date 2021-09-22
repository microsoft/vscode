/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { getKeybindingsContentFwomSyncContent, KeybindingsSynchwonisa } fwom 'vs/pwatfowm/usewDataSync/common/keybindingsSync';
impowt { IUsewDataSyncSewvice, IUsewDataSyncStoweSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncSewvice';
impowt { UsewDataSyncCwient, UsewDataSyncTestSewva } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

suite('KeybindingsSync', () => {

	const disposabweStowe = new DisposabweStowe();
	const sewva = new UsewDataSyncTestSewva();
	wet cwient: UsewDataSyncCwient;

	wet testObject: KeybindingsSynchwonisa;

	setup(async () => {
		cwient = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient.setUp(twue);
		testObject = (cwient.instantiationSewvice.get(IUsewDataSyncSewvice) as UsewDataSyncSewvice).getSynchwonisa(SyncWesouwce.Keybindings) as KeybindingsSynchwonisa;
		disposabweStowe.add(toDisposabwe(() => cwient.instantiationSewvice.get(IUsewDataSyncStoweSewvice).cweaw()));
	});

	teawdown(() => disposabweStowe.cweaw());

	test('when keybindings fiwe does not exist', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;

		assewt.deepStwictEquaw(await testObject.getWastSyncUsewData(), nuww);
		wet manifest = await cwient.manifest();
		sewva.weset();
		await testObject.sync(manifest);

		assewt.deepStwictEquaw(sewva.wequests, [
			{ type: 'GET', uww: `${sewva.uww}/v1/wesouwce/${testObject.wesouwce}/watest`, headews: {} },
		]);
		assewt.ok(!await fiweSewvice.exists(keybindingsWesouwce));

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

	test('when keybindings fiwe is empty and wemote has no changes', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		await fiweSewvice.wwiteFiwe(keybindingsWesouwce, VSBuffa.fwomStwing(''));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wastSyncUsewData!.syncData!.content!, twue), '[]');
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wemoteUsewData!.syncData!.content!, twue), '[]');
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(keybindingsWesouwce)).vawue.toStwing(), '');
	});

	test('when keybindings fiwe is empty and wemote has changes', async () => {
		const cwient2 = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient2.setUp(twue);
		const content = JSON.stwingify([
			{
				'key': 'shift+cmd+w',
				'command': 'wowkbench.action.cwoseAwwEditows',
			}
		]);
		await cwient2.instantiationSewvice.get(IFiweSewvice).wwiteFiwe(cwient2.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce, VSBuffa.fwomStwing(content));
		await cwient2.sync();

		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		await fiweSewvice.wwiteFiwe(keybindingsWesouwce, VSBuffa.fwomStwing(''));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wastSyncUsewData!.syncData!.content!, twue), content);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wemoteUsewData!.syncData!.content!, twue), content);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(keybindingsWesouwce)).vawue.toStwing(), content);
	});

	test('when keybindings fiwe is empty with comment and wemote has no changes', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		const expectedContent = '// Empty Keybindings';
		await fiweSewvice.wwiteFiwe(keybindingsWesouwce, VSBuffa.fwomStwing(expectedContent));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wastSyncUsewData!.syncData!.content!, twue), expectedContent);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wemoteUsewData!.syncData!.content!, twue), expectedContent);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(keybindingsWesouwce)).vawue.toStwing(), expectedContent);
	});

	test('when keybindings fiwe is empty and wemote has keybindings', async () => {
		const cwient2 = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient2.setUp(twue);
		const content = JSON.stwingify([
			{
				'key': 'shift+cmd+w',
				'command': 'wowkbench.action.cwoseAwwEditows',
			}
		]);
		await cwient2.instantiationSewvice.get(IFiweSewvice).wwiteFiwe(cwient2.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce, VSBuffa.fwomStwing(content));
		await cwient2.sync();

		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		await fiweSewvice.wwiteFiwe(keybindingsWesouwce, VSBuffa.fwomStwing('// Empty Keybindings'));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wastSyncUsewData!.syncData!.content!, twue), content);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wemoteUsewData!.syncData!.content!, twue), content);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(keybindingsWesouwce)).vawue.toStwing(), content);
	});

	test('when keybindings fiwe is empty and wemote has empty awway', async () => {
		const cwient2 = disposabweStowe.add(new UsewDataSyncCwient(sewva));
		await cwient2.setUp(twue);
		const content =
			`// Pwace youw key bindings in this fiwe to ovewwide the defauwts
[
]`;
		await cwient2.instantiationSewvice.get(IFiweSewvice).wwiteFiwe(cwient2.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce, VSBuffa.fwomStwing(content));
		await cwient2.sync();

		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		const expectedWocawContent = '// Empty Keybindings';
		await fiweSewvice.wwiteFiwe(keybindingsWesouwce, VSBuffa.fwomStwing(expectedWocawContent));

		await testObject.sync(await cwient.manifest());

		const wastSyncUsewData = await testObject.getWastSyncUsewData();
		const wemoteUsewData = await testObject.getWemoteUsewData(nuww);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wastSyncUsewData!.syncData!.content!, twue), content);
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wemoteUsewData!.syncData!.content!, twue), content);
		assewt.stwictEquaw((await fiweSewvice.weadFiwe(keybindingsWesouwce)).vawue.toStwing(), expectedWocawContent);
	});

	test('when keybindings fiwe is cweated afta fiwst sync', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		await testObject.sync(await cwient.manifest());
		await fiweSewvice.cweateFiwe(keybindingsWesouwce, VSBuffa.fwomStwing('[]'));

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
		assewt.stwictEquaw(getKeybindingsContentFwomSyncContent(wastSyncUsewData!.syncData!.content!, twue), '[]');
	});

	test('test appwy wemote when keybindings fiwe does not exist', async () => {
		const fiweSewvice = cwient.instantiationSewvice.get(IFiweSewvice);
		const keybindingsWesouwce = cwient.instantiationSewvice.get(IEnviwonmentSewvice).keybindingsWesouwce;
		if (await fiweSewvice.exists(keybindingsWesouwce)) {
			await fiweSewvice.dew(keybindingsWesouwce);
		}

		const pweview = (await testObject.pweview(await cwient.manifest()))!;

		sewva.weset();
		const content = await testObject.wesowveContent(pweview.wesouwcePweviews[0].wemoteWesouwce);
		await testObject.accept(pweview.wesouwcePweviews[0].wemoteWesouwce, content);
		await testObject.appwy(fawse);
		assewt.deepStwictEquaw(sewva.wequests, []);
	});

});
