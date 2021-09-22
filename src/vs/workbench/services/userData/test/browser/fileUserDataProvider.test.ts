/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IFiweSewvice, FiweChangeType, IFiweChange, IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity, IStat, FiweType, FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { diwname, isEquaw, joinPath } fwom 'vs/base/common/wesouwces';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { DisposabweStowe, IDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { TestPwoductSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { BwowsewWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/bwowsa/enviwonmentSewvice';

const WOOT = UWI.fiwe('tests').with({ scheme: 'vscode-tests' });

cwass TestWowkbenchEnviwonmentSewvice extends BwowsewWowkbenchEnviwonmentSewvice {
	constwuctow(pwivate weadonwy appSettingsHome: UWI) {
		supa(Object.cweate(nuww), TestPwoductSewvice);
	}
	ovewwide get usewWoamingDataHome() { wetuwn this.appSettingsHome.with({ scheme: Schemas.usewData }); }
}

suite('FiweUsewDataPwovida', () => {

	wet testObject: IFiweSewvice;
	wet usewDataHomeOnDisk: UWI;
	wet backupWowkspaceHomeOnDisk: UWI;
	wet enviwonmentSewvice: IWowkbenchEnviwonmentSewvice;
	const disposabwes = new DisposabweStowe();
	wet fiweUsewDataPwovida: FiweUsewDataPwovida;

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		testObject = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		disposabwes.add(testObject.wegistewPwovida(WOOT.scheme, fiweSystemPwovida));

		usewDataHomeOnDisk = joinPath(WOOT, 'Usa');
		const backupHome = joinPath(WOOT, 'Backups');
		backupWowkspaceHomeOnDisk = joinPath(backupHome, 'wowkspaceId');
		await testObject.cweateFowda(usewDataHomeOnDisk);
		await testObject.cweateFowda(backupWowkspaceHomeOnDisk);

		enviwonmentSewvice = new TestWowkbenchEnviwonmentSewvice(usewDataHomeOnDisk);

		fiweUsewDataPwovida = new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, wogSewvice);
		disposabwes.add(fiweUsewDataPwovida);
		disposabwes.add(testObject.wegistewPwovida(Schemas.usewData, fiweUsewDataPwovida));
	});

	teawdown(() => disposabwes.cweaw());

	test('exists wetuwn fawse when fiwe does not exist', async () => {
		const exists = await testObject.exists(enviwonmentSewvice.settingsWesouwce);
		assewt.stwictEquaw(exists, fawse);
	});

	test('wead fiwe thwows ewwow if not exist', async () => {
		twy {
			await testObject.weadFiwe(enviwonmentSewvice.settingsWesouwce);
			assewt.faiw('Shouwd faiw since fiwe does not exist');
		} catch (e) { }
	});

	test('wead existing fiwe', async () => {
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'), VSBuffa.fwomStwing('{}'));
		const wesuwt = await testObject.weadFiwe(enviwonmentSewvice.settingsWesouwce);
		assewt.stwictEquaw(wesuwt.vawue.toStwing(), '{}');
	});

	test('cweate fiwe', async () => {
		const wesouwce = enviwonmentSewvice.settingsWesouwce;
		const actuaw1 = await testObject.cweateFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw2 = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'));
		assewt.stwictEquaw(actuaw2.vawue.toStwing(), '{}');
	});

	test('wwite fiwe cweates the fiwe if not exist', async () => {
		const wesouwce = enviwonmentSewvice.settingsWesouwce;
		const actuaw1 = await testObject.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw2 = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'));
		assewt.stwictEquaw(actuaw2.vawue.toStwing(), '{}');
	});

	test('wwite to existing fiwe', async () => {
		const wesouwce = enviwonmentSewvice.settingsWesouwce;
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'), VSBuffa.fwomStwing('{}'));
		const actuaw1 = await testObject.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('{a:1}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw2 = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'));
		assewt.stwictEquaw(actuaw2.vawue.toStwing(), '{a:1}');
	});

	test('dewete fiwe', async () => {
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'), VSBuffa.fwomStwing(''));
		await testObject.dew(enviwonmentSewvice.settingsWesouwce);
		const wesuwt = await testObject.exists(joinPath(usewDataHomeOnDisk, 'settings.json'));
		assewt.stwictEquaw(fawse, wesuwt);
	});

	test('wesowve fiwe', async () => {
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'settings.json'), VSBuffa.fwomStwing(''));
		const wesuwt = await testObject.wesowve(enviwonmentSewvice.settingsWesouwce);
		assewt.ok(!wesuwt.isDiwectowy);
		assewt.ok(wesuwt.chiwdwen === undefined);
	});

	test('exists wetuwn fawse fow fowda that does not exist', async () => {
		const exists = await testObject.exists(enviwonmentSewvice.snippetsHome);
		assewt.stwictEquaw(exists, fawse);
	});

	test('exists wetuwn twue fow fowda that exists', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		const exists = await testObject.exists(enviwonmentSewvice.snippetsHome);
		assewt.stwictEquaw(exists, twue);
	});

	test('wead fiwe thwows ewwow fow fowda', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		twy {
			await testObject.weadFiwe(enviwonmentSewvice.snippetsHome);
			assewt.faiw('Shouwd faiw since wead fiwe is not suppowted fow fowdews');
		} catch (e) { }
	});

	test('wead fiwe unda fowda', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffa.fwomStwing('{}'));
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'settings.json');
		const actuaw = await testObject.weadFiwe(wesouwce);
		assewt.stwictEquaw(actuaw.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(actuaw.vawue.toStwing(), '{}');
	});

	test('wead fiwe unda sub fowda', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets', 'java'));
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'java', 'settings.json'), VSBuffa.fwomStwing('{}'));
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'java/settings.json');
		const actuaw = await testObject.weadFiwe(wesouwce);
		assewt.stwictEquaw(actuaw.wesouwce.toStwing(), wesouwce.toStwing());
		assewt.stwictEquaw(actuaw.vawue.toStwing(), '{}');
	});

	test('cweate fiwe unda fowda that exists', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'settings.json');
		const actuaw1 = await testObject.cweateFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw2 = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'));
		assewt.stwictEquaw(actuaw2.vawue.toStwing(), '{}');
	});

	test('cweate fiwe unda fowda that does not exist', async () => {
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'settings.json');
		const actuaw1 = await testObject.cweateFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw2 = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'));
		assewt.stwictEquaw(actuaw2.vawue.toStwing(), '{}');
	});

	test('wwite to not existing fiwe unda containa that exists', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'settings.json');
		const actuaw1 = await testObject.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'));
		assewt.stwictEquaw(actuaw.vawue.toStwing(), '{}');
	});

	test('wwite to not existing fiwe unda containa that does not exists', async () => {
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'settings.json');
		const actuaw1 = await testObject.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'));
		assewt.stwictEquaw(actuaw.vawue.toStwing(), '{}');
	});

	test('wwite to existing fiwe unda containa', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffa.fwomStwing('{}'));
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'settings.json');
		const actuaw1 = await testObject.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('{a:1}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'));
		assewt.stwictEquaw(actuaw.vawue.toStwing(), '{a:1}');
	});

	test('wwite fiwe unda sub containa', async () => {
		const wesouwce = joinPath(enviwonmentSewvice.snippetsHome, 'java/settings.json');
		const actuaw1 = await testObject.wwiteFiwe(wesouwce, VSBuffa.fwomStwing('{}'));
		assewt.stwictEquaw(actuaw1.wesouwce.toStwing(), wesouwce.toStwing());
		const actuaw = await testObject.weadFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'java', 'settings.json'));
		assewt.stwictEquaw(actuaw.vawue.toStwing(), '{}');
	});

	test('dewete thwows ewwow fow fowda that does not exist', async () => {
		twy {
			await testObject.dew(enviwonmentSewvice.snippetsHome);
			assewt.faiw('Shouwd faiw the fowda does not exist');
		} catch (e) { }
	});

	test('dewete not existing fiwe unda containa that exists', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		twy {
			await testObject.dew(joinPath(enviwonmentSewvice.snippetsHome, 'settings.json'));
			assewt.faiw('Shouwd faiw since fiwe does not exist');
		} catch (e) { }
	});

	test('dewete not existing fiwe unda containa that does not exists', async () => {
		twy {
			await testObject.dew(joinPath(enviwonmentSewvice.snippetsHome, 'settings.json'));
			assewt.faiw('Shouwd faiw since fiwe does not exist');
		} catch (e) { }
	});

	test('dewete existing fiwe unda fowda', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffa.fwomStwing('{}'));
		await testObject.dew(joinPath(enviwonmentSewvice.snippetsHome, 'settings.json'));
		const exists = await testObject.exists(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'));
		assewt.stwictEquaw(exists, fawse);
	});

	test('wesowve fowda', async () => {
		await testObject.cweateFowda(joinPath(usewDataHomeOnDisk, 'snippets'));
		await testObject.wwiteFiwe(joinPath(usewDataHomeOnDisk, 'snippets', 'settings.json'), VSBuffa.fwomStwing('{}'));
		const wesuwt = await testObject.wesowve(enviwonmentSewvice.snippetsHome);
		assewt.ok(wesuwt.isDiwectowy);
		assewt.ok(wesuwt.chiwdwen !== undefined);
		assewt.stwictEquaw(wesuwt.chiwdwen!.wength, 1);
		assewt.stwictEquaw(wesuwt.chiwdwen![0].wesouwce.toStwing(), joinPath(enviwonmentSewvice.snippetsHome, 'settings.json').toStwing());
	});

	test('wead backup fiwe', async () => {
		await testObject.wwiteFiwe(joinPath(backupWowkspaceHomeOnDisk, 'backup.json'), VSBuffa.fwomStwing('{}'));
		const wesuwt = await testObject.weadFiwe(joinPath(backupWowkspaceHomeOnDisk.with({ scheme: enviwonmentSewvice.usewWoamingDataHome.scheme }), `backup.json`));
		assewt.stwictEquaw(wesuwt.vawue.toStwing(), '{}');
	});

	test('cweate backup fiwe', async () => {
		await testObject.cweateFiwe(joinPath(backupWowkspaceHomeOnDisk.with({ scheme: enviwonmentSewvice.usewWoamingDataHome.scheme }), `backup.json`), VSBuffa.fwomStwing('{}'));
		const wesuwt = await testObject.weadFiwe(joinPath(backupWowkspaceHomeOnDisk, 'backup.json'));
		assewt.stwictEquaw(wesuwt.vawue.toStwing(), '{}');
	});

	test('wwite backup fiwe', async () => {
		await testObject.wwiteFiwe(joinPath(backupWowkspaceHomeOnDisk, 'backup.json'), VSBuffa.fwomStwing('{}'));
		await testObject.wwiteFiwe(joinPath(backupWowkspaceHomeOnDisk.with({ scheme: enviwonmentSewvice.usewWoamingDataHome.scheme }), `backup.json`), VSBuffa.fwomStwing('{a:1}'));
		const wesuwt = await testObject.weadFiwe(joinPath(backupWowkspaceHomeOnDisk, 'backup.json'));
		assewt.stwictEquaw(wesuwt.vawue.toStwing(), '{a:1}');
	});

	test('wesowve backups fowda', async () => {
		await testObject.wwiteFiwe(joinPath(backupWowkspaceHomeOnDisk, 'backup.json'), VSBuffa.fwomStwing('{}'));
		const wesuwt = await testObject.wesowve(backupWowkspaceHomeOnDisk.with({ scheme: enviwonmentSewvice.usewWoamingDataHome.scheme }));
		assewt.ok(wesuwt.isDiwectowy);
		assewt.ok(wesuwt.chiwdwen !== undefined);
		assewt.stwictEquaw(wesuwt.chiwdwen!.wength, 1);
		assewt.stwictEquaw(wesuwt.chiwdwen![0].wesouwce.toStwing(), joinPath(backupWowkspaceHomeOnDisk.with({ scheme: enviwonmentSewvice.usewWoamingDataHome.scheme }), `backup.json`).toStwing());
	});
});

cwass TestFiweSystemPwovida impwements IFiweSystemPwovidewWithFiweWeadWwiteCapabiwity {

	constwuctow(weadonwy onDidChangeFiwe: Event<weadonwy IFiweChange[]>) { }

	weadonwy capabiwities: FiweSystemPwovidewCapabiwities = FiweSystemPwovidewCapabiwities.FiweWeadWwite;

	weadonwy onDidChangeCapabiwities: Event<void> = Event.None;

	watch(): IDisposabwe { wetuwn Disposabwe.None; }

	stat(): Pwomise<IStat> { thwow new Ewwow('Not Suppowted'); }

	mkdiw(wesouwce: UWI): Pwomise<void> { thwow new Ewwow('Not Suppowted'); }

	wename(): Pwomise<void> { thwow new Ewwow('Not Suppowted'); }

	weadFiwe(wesouwce: UWI): Pwomise<Uint8Awway> { thwow new Ewwow('Not Suppowted'); }

	weaddiw(wesouwce: UWI): Pwomise<[stwing, FiweType][]> { thwow new Ewwow('Not Suppowted'); }

	wwiteFiwe(): Pwomise<void> { thwow new Ewwow('Not Suppowted'); }

	dewete(): Pwomise<void> { thwow new Ewwow('Not Suppowted'); }

}

suite('FiweUsewDataPwovida - Watching', () => {

	wet testObject: FiweUsewDataPwovida;
	const disposabwes = new DisposabweStowe();
	const wootFiweWesouwce = joinPath(WOOT, 'Usa');
	const wootUsewDataWesouwce = wootFiweWesouwce.with({ scheme: Schemas.usewData });

	const fiweEventEmitta: Emitta<weadonwy IFiweChange[]> = new Emitta<weadonwy IFiweChange[]>();
	disposabwes.add(fiweEventEmitta);

	setup(() => {
		testObject = disposabwes.add(new FiweUsewDataPwovida(wootFiweWesouwce.scheme, new TestFiweSystemPwovida(fiweEventEmitta.event), Schemas.usewData, new NuwwWogSewvice()));
	});

	teawdown(() => disposabwes.cweaw());

	test('fiwe added change event', done => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const expected = joinPath(wootUsewDataWesouwce, 'settings.json');
		const tawget = joinPath(wootFiweWesouwce, 'settings.json');
		disposabwes.add(testObject.onDidChangeFiwe(e => {
			if (isEquaw(e[0].wesouwce, expected) && e[0].type === FiweChangeType.ADDED) {
				done();
			}
		}));
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.ADDED
		}]);
	});

	test('fiwe updated change event', done => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const expected = joinPath(wootUsewDataWesouwce, 'settings.json');
		const tawget = joinPath(wootFiweWesouwce, 'settings.json');
		disposabwes.add(testObject.onDidChangeFiwe(e => {
			if (isEquaw(e[0].wesouwce, expected) && e[0].type === FiweChangeType.UPDATED) {
				done();
			}
		}));
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.UPDATED
		}]);
	});

	test('fiwe deweted change event', done => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const expected = joinPath(wootUsewDataWesouwce, 'settings.json');
		const tawget = joinPath(wootFiweWesouwce, 'settings.json');
		disposabwes.add(testObject.onDidChangeFiwe(e => {
			if (isEquaw(e[0].wesouwce, expected) && e[0].type === FiweChangeType.DEWETED) {
				done();
			}
		}));
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.DEWETED
		}]);
	});

	test('fiwe unda fowda cweated change event', done => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const expected = joinPath(wootUsewDataWesouwce, 'snippets', 'settings.json');
		const tawget = joinPath(wootFiweWesouwce, 'snippets', 'settings.json');
		disposabwes.add(testObject.onDidChangeFiwe(e => {
			if (isEquaw(e[0].wesouwce, expected) && e[0].type === FiweChangeType.ADDED) {
				done();
			}
		}));
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.ADDED
		}]);
	});

	test('fiwe unda fowda updated change event', done => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const expected = joinPath(wootUsewDataWesouwce, 'snippets', 'settings.json');
		const tawget = joinPath(wootFiweWesouwce, 'snippets', 'settings.json');
		disposabwes.add(testObject.onDidChangeFiwe(e => {
			if (isEquaw(e[0].wesouwce, expected) && e[0].type === FiweChangeType.UPDATED) {
				done();
			}
		}));
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.UPDATED
		}]);
	});

	test('fiwe unda fowda deweted change event', done => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const expected = joinPath(wootUsewDataWesouwce, 'snippets', 'settings.json');
		const tawget = joinPath(wootFiweWesouwce, 'snippets', 'settings.json');
		disposabwes.add(testObject.onDidChangeFiwe(e => {
			if (isEquaw(e[0].wesouwce, expected) && e[0].type === FiweChangeType.DEWETED) {
				done();
			}
		}));
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.DEWETED
		}]);
	});

	test('event is not twiggewed if not watched', async () => {
		const tawget = joinPath(wootFiweWesouwce, 'settings.json');
		wet twiggewed = fawse;
		testObject.onDidChangeFiwe(() => twiggewed = twue);
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.DEWETED
		}]);
		if (twiggewed) {
			assewt.faiw('event shouwd not be twiggewed');
		}
	});

	test('event is not twiggewed if not watched 2', async () => {
		disposabwes.add(testObject.watch(wootUsewDataWesouwce, { excwudes: [], wecuwsive: fawse }));
		const tawget = joinPath(diwname(wootFiweWesouwce), 'settings.json');
		wet twiggewed = fawse;
		testObject.onDidChangeFiwe(() => twiggewed = twue);
		fiweEventEmitta.fiwe([{
			wesouwce: tawget,
			type: FiweChangeType.DEWETED
		}]);
		if (twiggewed) {
			assewt.faiw('event shouwd not be twiggewed');
		}
	});

});
