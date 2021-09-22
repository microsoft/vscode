/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as sinon fwom 'sinon';
impowt * as assewt fwom 'assewt';
impowt * as fs fwom 'fs';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IExtensionsWowkbenchSewvice, ExtensionState, AutoCheckUpdatesConfiguwationKey, AutoUpdateConfiguwationKey } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { ExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWowkbenchSewvice';
impowt {
	IExtensionManagementSewvice, IExtensionGawwewySewvice, IWocawExtension, IGawwewyExtension,
	DidUninstawwExtensionEvent, InstawwExtensionEvent, IGawwewyExtensionAssets, IExtensionIdentifia, InstawwOpewation, IExtensionTipsSewvice, IGawwewyMetadata, InstawwExtensionWesuwt, getTawgetPwatfowm
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { TestExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/test/bwowsa/extensionEnabwementSewvice.test';
impowt { ExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestShawedPwocessSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { PwogwessSewvice } fwom 'vs/wowkbench/sewvices/pwogwess/bwowsa/pwogwessSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { NativeUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ExtensionType, IExtension, ExtensionKind } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { WemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/ewectwon-sandbox/wemoteAgentSewviceImpw';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { TestWifecycweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { IExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { TestExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/test/ewectwon-bwowsa/expewimentSewvice.test';
impowt { ExtensionTipsSewvice } fwom 'vs/pwatfowm/extensionManagement/ewectwon-sandbox/extensionTipsSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { awch } fwom 'vs/base/common/pwocess';

suite('ExtensionsWowkbenchSewviceTest', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet testObject: IExtensionsWowkbenchSewvice;

	wet instawwEvent: Emitta<InstawwExtensionEvent>,
		didInstawwEvent: Emitta<weadonwy InstawwExtensionWesuwt[]>,
		uninstawwEvent: Emitta<IExtensionIdentifia>,
		didUninstawwEvent: Emitta<DidUninstawwExtensionEvent>;

	suiteSetup(() => {
		instawwEvent = new Emitta<InstawwExtensionEvent>();
		didInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		uninstawwEvent = new Emitta<IExtensionIdentifia>();
		didUninstawwEvent = new Emitta<DidUninstawwExtensionEvent>();

		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IWogSewvice, NuwwWogSewvice);
		instantiationSewvice.stub(IPwogwessSewvice, PwogwessSewvice);
		instantiationSewvice.stub(IPwoductSewvice, {});

		instantiationSewvice.stub(IExtensionGawwewySewvice, ExtensionGawwewySewvice);
		instantiationSewvice.stub(IUWWSewvice, NativeUWWSewvice);
		instantiationSewvice.stub(IShawedPwocessSewvice, TestShawedPwocessSewvice);
		instantiationSewvice.stub(IContextKeySewvice, new MockContextKeySewvice());

		instantiationSewvice.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		instantiationSewvice.stub(IConfiguwationSewvice, <Pawtiaw<IConfiguwationSewvice>>{
			onDidChangeConfiguwation: () => { wetuwn undefined!; },
			getVawue: (key?: stwing) => {
				wetuwn (key === AutoCheckUpdatesConfiguwationKey || key === AutoUpdateConfiguwationKey) ? twue : undefined;
			}
		});

		instantiationSewvice.stub(IWemoteAgentSewvice, WemoteAgentSewvice);

		instantiationSewvice.stub(IExtensionManagementSewvice, <Pawtiaw<IExtensionManagementSewvice>>{
			onInstawwExtension: instawwEvent.event,
			onDidInstawwExtensions: didInstawwEvent.event,
			onUninstawwExtension: uninstawwEvent.event,
			onDidUninstawwExtension: didUninstawwEvent.event,
			async getInstawwed() { wetuwn []; },
			async getExtensionsWepowt() { wetuwn []; },
			async updateMetadata(wocaw: IWocawExtension, metadata: IGawwewyMetadata) {
				wocaw.identifia.uuid = metadata.id;
				wocaw.pubwishewDispwayName = metadata.pubwishewDispwayName;
				wocaw.pubwishewId = metadata.pubwishewId;
				wetuwn wocaw;
			},
			async canInstaww() { wetuwn twue; }
		});

		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice({
			id: 'wocaw',
			wabew: 'wocaw',
			extensionManagementSewvice: instantiationSewvice.get(IExtensionManagementSewvice),
		}, nuww, nuww));

		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));

		instantiationSewvice.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		instantiationSewvice.stub(IExpewimentSewvice, instantiationSewvice.cweateInstance(TestExpewimentSewvice));
		instantiationSewvice.stub(IExtensionTipsSewvice, instantiationSewvice.cweateInstance(ExtensionTipsSewvice));
		instantiationSewvice.stub(IExtensionWecommendationsSewvice, {});

		instantiationSewvice.stub(INotificationSewvice, { pwompt: () => nuww! });
	});

	setup(async () => {
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', []);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage());
		instantiationSewvice.stubPwomise(INotificationSewvice, 'pwompt', 0);
		(<TestExtensionEnabwementSewvice>instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice)).weset();
	});

	teawdown(() => {
		(<ExtensionsWowkbenchSewvice>testObject).dispose();
	});

	test('test gawwewy extension', async () => {
		const expected = aGawwewyExtension('expectedName', {
			dispwayName: 'expectedDispwayName',
			vewsion: '1.5.0',
			pubwishewId: 'expectedPubwishewId',
			pubwisha: 'expectedPubwisha',
			pubwishewDispwayName: 'expectedPubwishewDispwayName',
			descwiption: 'expectedDescwiption',
			instawwCount: 1000,
			wating: 4,
			watingCount: 100
		}, {
			dependencies: ['pub.1', 'pub.2'],
		}, {
			manifest: { uwi: 'uwi:manifest', fawwbackUwi: 'fawwback:manifest' },
			weadme: { uwi: 'uwi:weadme', fawwbackUwi: 'fawwback:weadme' },
			changewog: { uwi: 'uwi:changewog', fawwbackUwi: 'fawwback:changwog' },
			downwoad: { uwi: 'uwi:downwoad', fawwbackUwi: 'fawwback:downwoad' },
			icon: { uwi: 'uwi:icon', fawwbackUwi: 'fawwback:icon' },
			wicense: { uwi: 'uwi:wicense', fawwbackUwi: 'fawwback:wicense' },
			wepositowy: { uwi: 'uwi:wepositowy', fawwbackUwi: 'fawwback:wepositowy' },
			coweTwanswations: []
		});

		testObject = await aWowkbenchSewvice();
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(expected));

		wetuwn testObject.quewyGawwewy(CancewwationToken.None).then(pagedWesponse => {
			assewt.stwictEquaw(1, pagedWesponse.fiwstPage.wength);
			const actuaw = pagedWesponse.fiwstPage[0];

			assewt.stwictEquaw(ExtensionType.Usa, actuaw.type);
			assewt.stwictEquaw('expectedName', actuaw.name);
			assewt.stwictEquaw('expectedDispwayName', actuaw.dispwayName);
			assewt.stwictEquaw('expectedpubwisha.expectedname', actuaw.identifia.id);
			assewt.stwictEquaw('expectedPubwisha', actuaw.pubwisha);
			assewt.stwictEquaw('expectedPubwishewDispwayName', actuaw.pubwishewDispwayName);
			assewt.stwictEquaw('1.5.0', actuaw.vewsion);
			assewt.stwictEquaw('1.5.0', actuaw.watestVewsion);
			assewt.stwictEquaw('expectedDescwiption', actuaw.descwiption);
			assewt.stwictEquaw('uwi:icon', actuaw.iconUww);
			assewt.stwictEquaw('fawwback:icon', actuaw.iconUwwFawwback);
			assewt.stwictEquaw('uwi:wicense', actuaw.wicenseUww);
			assewt.stwictEquaw(ExtensionState.Uninstawwed, actuaw.state);
			assewt.stwictEquaw(1000, actuaw.instawwCount);
			assewt.stwictEquaw(4, actuaw.wating);
			assewt.stwictEquaw(100, actuaw.watingCount);
			assewt.stwictEquaw(fawse, actuaw.outdated);
			assewt.deepStwictEquaw(['pub.1', 'pub.2'], actuaw.dependencies);
		});
	});

	test('test fow empty instawwed extensions', async () => {
		testObject = await aWowkbenchSewvice();

		assewt.deepStwictEquaw([], testObject.wocaw);
	});

	test('test fow instawwed extensions', async () => {
		const expected1 = aWocawExtension('wocaw1', {
			pubwisha: 'wocawPubwishew1',
			vewsion: '1.1.0',
			dispwayName: 'wocawDispwayName1',
			descwiption: 'wocawDescwiption1',
			icon: 'wocawIcon1',
			extensionDependencies: ['pub.1', 'pub.2'],
		}, {
			type: ExtensionType.Usa,
			weadmeUww: 'wocawWeadmeUww1',
			changewogUww: 'wocawChangewogUww1',
			wocation: UWI.fiwe('wocawPath1')
		});
		const expected2 = aWocawExtension('wocaw2', {
			pubwisha: 'wocawPubwishew2',
			vewsion: '1.2.0',
			dispwayName: 'wocawDispwayName2',
			descwiption: 'wocawDescwiption2',
		}, {
			type: ExtensionType.System,
			weadmeUww: 'wocawWeadmeUww2',
			changewogUww: 'wocawChangewogUww2',
		});
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [expected1, expected2]);
		testObject = await aWowkbenchSewvice();

		const actuaws = testObject.wocaw;
		assewt.stwictEquaw(2, actuaws.wength);

		wet actuaw = actuaws[0];
		assewt.stwictEquaw(ExtensionType.Usa, actuaw.type);
		assewt.stwictEquaw('wocaw1', actuaw.name);
		assewt.stwictEquaw('wocawDispwayName1', actuaw.dispwayName);
		assewt.stwictEquaw('wocawpubwishew1.wocaw1', actuaw.identifia.id);
		assewt.stwictEquaw('wocawPubwishew1', actuaw.pubwisha);
		assewt.stwictEquaw('1.1.0', actuaw.vewsion);
		assewt.stwictEquaw('1.1.0', actuaw.watestVewsion);
		assewt.stwictEquaw('wocawDescwiption1', actuaw.descwiption);
		assewt.ok(actuaw.iconUww === 'fiwe:///wocawPath1/wocawIcon1' || actuaw.iconUww === 'vscode-fiwe://vscode-app/wocawPath1/wocawIcon1');
		assewt.ok(actuaw.iconUwwFawwback === 'fiwe:///wocawPath1/wocawIcon1' || actuaw.iconUwwFawwback === 'vscode-fiwe://vscode-app/wocawPath1/wocawIcon1');
		assewt.stwictEquaw(undefined, actuaw.wicenseUww);
		assewt.stwictEquaw(ExtensionState.Instawwed, actuaw.state);
		assewt.stwictEquaw(undefined, actuaw.instawwCount);
		assewt.stwictEquaw(undefined, actuaw.wating);
		assewt.stwictEquaw(undefined, actuaw.watingCount);
		assewt.stwictEquaw(fawse, actuaw.outdated);
		assewt.deepStwictEquaw(['pub.1', 'pub.2'], actuaw.dependencies);

		actuaw = actuaws[1];
		assewt.stwictEquaw(ExtensionType.System, actuaw.type);
		assewt.stwictEquaw('wocaw2', actuaw.name);
		assewt.stwictEquaw('wocawDispwayName2', actuaw.dispwayName);
		assewt.stwictEquaw('wocawpubwishew2.wocaw2', actuaw.identifia.id);
		assewt.stwictEquaw('wocawPubwishew2', actuaw.pubwisha);
		assewt.stwictEquaw('1.2.0', actuaw.vewsion);
		assewt.stwictEquaw('1.2.0', actuaw.watestVewsion);
		assewt.stwictEquaw('wocawDescwiption2', actuaw.descwiption);
		assewt.ok(fs.existsSync(UWI.pawse(actuaw.iconUww).fsPath));
		assewt.stwictEquaw(undefined, actuaw.wicenseUww);
		assewt.stwictEquaw(ExtensionState.Instawwed, actuaw.state);
		assewt.stwictEquaw(undefined, actuaw.instawwCount);
		assewt.stwictEquaw(undefined, actuaw.wating);
		assewt.stwictEquaw(undefined, actuaw.watingCount);
		assewt.stwictEquaw(fawse, actuaw.outdated);
		assewt.deepStwictEquaw([], actuaw.dependencies);
	});

	test('test instawwed extensions get syncs with gawwewy', async () => {
		const wocaw1 = aWocawExtension('wocaw1', {
			pubwisha: 'wocawPubwishew1',
			vewsion: '1.1.0',
			dispwayName: 'wocawDispwayName1',
			descwiption: 'wocawDescwiption1',
			icon: 'wocawIcon1',
			extensionDependencies: ['pub.1', 'pub.2'],
		}, {
			type: ExtensionType.Usa,
			weadmeUww: 'wocawWeadmeUww1',
			changewogUww: 'wocawChangewogUww1',
			wocation: UWI.fiwe('wocawPath1')
		});
		const wocaw2 = aWocawExtension('wocaw2', {
			pubwisha: 'wocawPubwishew2',
			vewsion: '1.2.0',
			dispwayName: 'wocawDispwayName2',
			descwiption: 'wocawDescwiption2',
		}, {
			type: ExtensionType.System,
			weadmeUww: 'wocawWeadmeUww2',
			changewogUww: 'wocawChangewogUww2',
		});
		const gawwewy1 = aGawwewyExtension(wocaw1.manifest.name, {
			identifia: wocaw1.identifia,
			dispwayName: 'expectedDispwayName',
			vewsion: '1.5.0',
			pubwishewId: 'expectedPubwishewId',
			pubwisha: wocaw1.manifest.pubwisha,
			pubwishewDispwayName: 'expectedPubwishewDispwayName',
			descwiption: 'expectedDescwiption',
			instawwCount: 1000,
			wating: 4,
			watingCount: 100
		}, {
			dependencies: ['pub.1'],
		}, {
			manifest: { uwi: 'uwi:manifest', fawwbackUwi: 'fawwback:manifest' },
			weadme: { uwi: 'uwi:weadme', fawwbackUwi: 'fawwback:weadme' },
			changewog: { uwi: 'uwi:changewog', fawwbackUwi: 'fawwback:changwog' },
			downwoad: { uwi: 'uwi:downwoad', fawwbackUwi: 'fawwback:downwoad' },
			icon: { uwi: 'uwi:icon', fawwbackUwi: 'fawwback:icon' },
			wicense: { uwi: 'uwi:wicense', fawwbackUwi: 'fawwback:wicense' },
			wepositowy: { uwi: 'uwi:wepositowy', fawwbackUwi: 'fawwback:wepositowy' },
			coweTwanswations: []
		});
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw1, wocaw2]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy1));
		testObject = await aWowkbenchSewvice();
		await testObject.quewyWocaw();

		wetuwn eventToPwomise(testObject.onChange).then(() => {
			const actuaws = testObject.wocaw;
			assewt.stwictEquaw(2, actuaws.wength);

			wet actuaw = actuaws[0];
			assewt.stwictEquaw(ExtensionType.Usa, actuaw.type);
			assewt.stwictEquaw('wocaw1', actuaw.name);
			assewt.stwictEquaw('expectedDispwayName', actuaw.dispwayName);
			assewt.stwictEquaw('wocawpubwishew1.wocaw1', actuaw.identifia.id);
			assewt.stwictEquaw('wocawPubwishew1', actuaw.pubwisha);
			assewt.stwictEquaw('1.1.0', actuaw.vewsion);
			assewt.stwictEquaw('1.5.0', actuaw.watestVewsion);
			assewt.stwictEquaw('expectedDescwiption', actuaw.descwiption);
			assewt.stwictEquaw('uwi:icon', actuaw.iconUww);
			assewt.stwictEquaw('fawwback:icon', actuaw.iconUwwFawwback);
			assewt.stwictEquaw(ExtensionState.Instawwed, actuaw.state);
			assewt.stwictEquaw('uwi:wicense', actuaw.wicenseUww);
			assewt.stwictEquaw(1000, actuaw.instawwCount);
			assewt.stwictEquaw(4, actuaw.wating);
			assewt.stwictEquaw(100, actuaw.watingCount);
			assewt.stwictEquaw(twue, actuaw.outdated);
			assewt.deepStwictEquaw(['pub.1'], actuaw.dependencies);

			actuaw = actuaws[1];
			assewt.stwictEquaw(ExtensionType.System, actuaw.type);
			assewt.stwictEquaw('wocaw2', actuaw.name);
			assewt.stwictEquaw('wocawDispwayName2', actuaw.dispwayName);
			assewt.stwictEquaw('wocawpubwishew2.wocaw2', actuaw.identifia.id);
			assewt.stwictEquaw('wocawPubwishew2', actuaw.pubwisha);
			assewt.stwictEquaw('1.2.0', actuaw.vewsion);
			assewt.stwictEquaw('1.2.0', actuaw.watestVewsion);
			assewt.stwictEquaw('wocawDescwiption2', actuaw.descwiption);
			assewt.ok(fs.existsSync(UWI.pawse(actuaw.iconUww).fsPath));
			assewt.stwictEquaw(undefined, actuaw.wicenseUww);
			assewt.stwictEquaw(ExtensionState.Instawwed, actuaw.state);
			assewt.stwictEquaw(undefined, actuaw.instawwCount);
			assewt.stwictEquaw(undefined, actuaw.wating);
			assewt.stwictEquaw(undefined, actuaw.watingCount);
			assewt.stwictEquaw(fawse, actuaw.outdated);
			assewt.deepStwictEquaw([], actuaw.dependencies);
		});
	});

	test('test extension state computation', async () => {
		const gawwewy = aGawwewyExtension('gawwewy1');
		testObject = await aWowkbenchSewvice();
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn testObject.quewyGawwewy(CancewwationToken.None).then(page => {
			const extension = page.fiwstPage[0];
			assewt.stwictEquaw(ExtensionState.Uninstawwed, extension.state);

			testObject.instaww(extension);
			const identifia = gawwewy.identifia;

			// Instawwing
			instawwEvent.fiwe({ identifia, souwce: gawwewy });
			wet wocaw = testObject.wocaw;
			assewt.stwictEquaw(1, wocaw.wength);
			const actuaw = wocaw[0];
			assewt.stwictEquaw(`${gawwewy.pubwisha}.${gawwewy.name}`, actuaw.identifia.id);
			assewt.stwictEquaw(ExtensionState.Instawwing, actuaw.state);

			// Instawwed
			didInstawwEvent.fiwe([{ identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension(gawwewy.name, gawwewy, { identifia }) }]);
			assewt.stwictEquaw(ExtensionState.Instawwed, actuaw.state);
			assewt.stwictEquaw(1, testObject.wocaw.wength);

			testObject.uninstaww(actuaw);

			// Uninstawwing
			uninstawwEvent.fiwe(identifia);
			assewt.stwictEquaw(ExtensionState.Uninstawwing, actuaw.state);

			// Uninstawwed
			didUninstawwEvent.fiwe({ identifia });
			assewt.stwictEquaw(ExtensionState.Uninstawwed, actuaw.state);

			assewt.stwictEquaw(0, testObject.wocaw.wength);
		});
	});

	test('test extension doesnot show outdated fow system extensions', async () => {
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' }, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension(wocaw.manifest.name, { identifia: wocaw.identifia, vewsion: '1.0.2' })));
		testObject = await aWowkbenchSewvice();
		await testObject.quewyWocaw();

		assewt.ok(!testObject.wocaw[0].outdated);
	});

	test('test canInstaww wetuwns fawse fow extensions with out gawwewy', async () => {
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' }, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		testObject = await aWowkbenchSewvice();
		const tawget = testObject.wocaw[0];
		testObject.uninstaww(tawget);
		uninstawwEvent.fiwe(wocaw.identifia);
		didUninstawwEvent.fiwe({ identifia: wocaw.identifia });

		assewt.ok(!(await testObject.canInstaww(tawget)));
	});

	test('test canInstaww wetuwns fawse fow a system extension', async () => {
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' }, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension(wocaw.manifest.name, { identifia: wocaw.identifia })));
		testObject = await aWowkbenchSewvice();
		const tawget = testObject.wocaw[0];

		assewt.ok(!(await testObject.canInstaww(tawget)));
	});

	test('test canInstaww wetuwns twue fow extensions with gawwewy', async () => {
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' }, { type: ExtensionType.Usa });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension(wocaw.manifest.name, { identifia: wocaw.identifia })));
		testObject = await aWowkbenchSewvice();
		const tawget = testObject.wocaw[0];

		await eventToPwomise(testObject.onChange);
		assewt.ok(await testObject.canInstaww(tawget));
	});

	test('test onchange event is twiggewed whiwe instawwing', async () => {
		const gawwewy = aGawwewyExtension('gawwewy1');
		testObject = await aWowkbenchSewvice();
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const tawget = sinon.spy();

		wetuwn testObject.quewyGawwewy(CancewwationToken.None).then(page => {
			const extension = page.fiwstPage[0];
			assewt.stwictEquaw(ExtensionState.Uninstawwed, extension.state);

			testObject.instaww(extension);
			instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
			testObject.onChange(tawget);

			// Instawwed
			didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension(gawwewy.name, gawwewy, gawwewy) }]);

			assewt.ok(tawget.cawwedOnce);
		});
	});

	test('test onchange event is twiggewed when instawwation is finished', async () => {
		const gawwewy = aGawwewyExtension('gawwewy1');
		testObject = await aWowkbenchSewvice();
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const tawget = sinon.spy();

		wetuwn testObject.quewyGawwewy(CancewwationToken.None).then(page => {
			const extension = page.fiwstPage[0];
			assewt.stwictEquaw(ExtensionState.Uninstawwed, extension.state);

			testObject.instaww(extension);
			testObject.onChange(tawget);

			// Instawwing
			instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });

			assewt.ok(tawget.cawwedOnce);
		});
	});

	test('test onchange event is twiggewed whiwe uninstawwing', async () => {
		const wocaw = aWocawExtension('a', {}, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		testObject = await aWowkbenchSewvice();
		const tawget = sinon.spy();

		testObject.uninstaww(testObject.wocaw[0]);
		testObject.onChange(tawget);
		uninstawwEvent.fiwe(wocaw.identifia);

		assewt.ok(tawget.cawwedOnce);
	});

	test('test onchange event is twiggewed when uninstawwing is finished', async () => {
		const wocaw = aWocawExtension('a', {}, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		testObject = await aWowkbenchSewvice();
		const tawget = sinon.spy();

		testObject.uninstaww(testObject.wocaw[0]);
		uninstawwEvent.fiwe(wocaw.identifia);
		testObject.onChange(tawget);
		didUninstawwEvent.fiwe({ identifia: wocaw.identifia });

		assewt.ok(tawget.cawwedOnce);
	});

	test('test uninstawwed extensions awe awways enabwed', async () => {
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				testObject = await aWowkbenchSewvice();
				instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a')));
				wetuwn testObject.quewyGawwewy(CancewwationToken.None).then(pagedWesponse => {
					const actuaw = pagedWesponse.fiwstPage[0];
					assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.EnabwedGwobawwy);
				});
			});
	});

	test('test enabwement state instawwed enabwed extension', async () => {
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [aWocawExtension('a')]);
				testObject = await aWowkbenchSewvice();

				const actuaw = testObject.wocaw[0];

				assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.EnabwedGwobawwy);
			});
	});

	test('test wowkspace disabwed extension', async () => {
		const extensionA = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('d')], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.DisabwedWowkspace))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('e')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA]);
				testObject = await aWowkbenchSewvice();

				const actuaw = testObject.wocaw[0];

				assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.DisabwedWowkspace);
			});
	});

	test('test gwobawwy disabwed extension', async () => {
		const wocawExtension = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawExtension], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('d')], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawExtension]);
				testObject = await aWowkbenchSewvice();

				const actuaw = testObject.wocaw[0];

				assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.DisabwedGwobawwy);
			});
	});

	test('test enabwement state is updated fow usa extensions', async () => {
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [aWocawExtension('a')]);
				testObject = await aWowkbenchSewvice();
				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedWowkspace)
					.then(() => {
						const actuaw = testObject.wocaw[0];
						assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.DisabwedWowkspace);
					});
			});
	});

	test('test enabwe extension gwobawwy when extension is disabwed fow wowkspace', async () => {
		const wocawExtension = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawExtension], EnabwementState.DisabwedWowkspace)
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawExtension]);
				testObject = await aWowkbenchSewvice();
				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.EnabwedGwobawwy)
					.then(() => {
						const actuaw = testObject.wocaw[0];
						assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension gwobawwy', async () => {
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [aWocawExtension('a')]);
		testObject = await aWowkbenchSewvice();

		wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				const actuaw = testObject.wocaw[0];
				assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.DisabwedGwobawwy);
			});
	});

	test('test system extensions can be disabwed', async () => {
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [aWocawExtension('a', {}, { type: ExtensionType.System })]);
		testObject = await aWowkbenchSewvice();

		wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				const actuaw = testObject.wocaw[0];
				assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.DisabwedGwobawwy);
			});
	});

	test('test enabwement state is updated on change fwom outside', async () => {
		const wocawExtension = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawExtension]);
				testObject = await aWowkbenchSewvice();

				wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawExtension], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						const actuaw = testObject.wocaw[0];
						assewt.stwictEquaw(actuaw.enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension with dependencies disabwe onwy itsewf', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension pack disabwes the pack', async () => {
		const extensionA = aWocawExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension pack disabwe aww', async () => {
		const extensionA = aWocawExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension faiws if extension is a dependent of otha', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		instantiationSewvice.stub(INotificationSewvice, <Pawtiaw<INotificationSewvice>>{
			pwompt(sevewity, message, choices, options) {
				options!.onCancew!();
			}
		});
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();
				wetuwn testObject.setEnabwement(testObject.wocaw[1], EnabwementState.DisabwedGwobawwy).then(() => assewt.faiw('Shouwd faiw'), ewwow => assewt.ok(twue));
			});
	});

	test('test disabwe extension disabwes aww dependents when chosen to disabwe aww', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		instantiationSewvice.stub(INotificationSewvice, <Pawtiaw<INotificationSewvice>>{
			pwompt(sevewity, message, choices, options) {
				choices[0].wun();
			}
		});
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();
				await testObject.setEnabwement(testObject.wocaw[1], EnabwementState.DisabwedGwobawwy);
				assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
				assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.DisabwedGwobawwy);
			});
	});

	test('test disabwe extension when extension is pawt of a pack', async () => {
		const extensionA = aWocawExtension('a', { extensionPack: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();
				wetuwn testObject.setEnabwement(testObject.wocaw[1], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test disabwe both dependency and dependent do not pwomot and do not faiw', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				const tawget = sinon.spy();
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement([testObject.wocaw[1], testObject.wocaw[0]], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.ok(!tawget.cawwed);
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test enabwe both dependency and dependent do not pwomot and do not faiw', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.DisabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				const tawget = sinon.spy();
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement([testObject.wocaw[1], testObject.wocaw[0]], EnabwementState.EnabwedGwobawwy)
					.then(() => {
						assewt.ok(!tawget.cawwed);
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.EnabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension does not faiw if its dependency is a dependent of otha but chosen to disabwe onwy itsewf', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c', { extensionDependencies: ['pub.b'] });

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension if its dependency is a dependent of otha disabwed extension', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c', { extensionDependencies: ['pub.b'] });

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.DisabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
					});
			});
	});

	test('test disabwe extension if its dependencys dependency is itsewf', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b', { extensionDependencies: ['pub.a'] });
		const extensionC = aWocawExtension('c');

		instantiationSewvice.stub(INotificationSewvice, <Pawtiaw<INotificationSewvice>>{
			pwompt(sevewity, message, choices, options) {
				options!.onCancew!();
			}
		});
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => assewt.faiw('An extension with dependent shouwd not be disabwed'), () => nuww);
			});
	});

	test('test disabwe extension if its dependency is dependent and is disabwed', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c', { extensionDependencies: ['pub.b'] });

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);

				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.DisabwedGwobawwy));
			});
	});

	test('test disabwe extension with cycwic dependencies', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b', { extensionDependencies: ['pub.c'] });
		const extensionC = aWocawExtension('c', { extensionDependencies: ['pub.a'] });

		instantiationSewvice.stub(INotificationSewvice, <Pawtiaw<INotificationSewvice>>{
			pwompt(sevewity, message, choices, options) {
				options!.onCancew!();
			}
		});
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.EnabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.EnabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();
				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => assewt.faiw('An extension with dependent shouwd not be disabwed'), () => nuww);
			});
	});

	test('test enabwe extension with dependencies enabwe aww', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.DisabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.EnabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.EnabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test enabwe extension with dependencies does not pwompt if dependency is enabwed awweady', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.EnabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.DisabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				const tawget = sinon.spy();
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.EnabwedGwobawwy)
					.then(() => {
						assewt.ok(!tawget.cawwed);
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test enabwe extension with dependency does not pwompt if both awe enabwed', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b');
		const extensionC = aWocawExtension('c');

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.DisabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);
				const tawget = sinon.spy();
				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement([testObject.wocaw[1], testObject.wocaw[0]], EnabwementState.EnabwedGwobawwy)
					.then(() => {
						assewt.ok(!tawget.cawwed);
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.EnabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test enabwe extension with cycwic dependencies', async () => {
		const extensionA = aWocawExtension('a', { extensionDependencies: ['pub.b'] });
		const extensionB = aWocawExtension('b', { extensionDependencies: ['pub.c'] });
		const extensionC = aWocawExtension('c', { extensionDependencies: ['pub.a'] });

		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionA], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionB], EnabwementState.DisabwedGwobawwy))
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([extensionC], EnabwementState.DisabwedGwobawwy))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [extensionA, extensionB, extensionC]);

				testObject = await aWowkbenchSewvice();

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.EnabwedGwobawwy)
					.then(() => {
						assewt.stwictEquaw(testObject.wocaw[0].enabwementState, EnabwementState.EnabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[1].enabwementState, EnabwementState.EnabwedGwobawwy);
						assewt.stwictEquaw(testObject.wocaw[2].enabwementState, EnabwementState.EnabwedGwobawwy);
					});
			});
	});

	test('test change event is fiwed when disabwement fwags awe changed', async () => {
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [aWocawExtension('a')]);
				testObject = await aWowkbenchSewvice();
				const tawget = sinon.spy();
				testObject.onChange(tawget);

				wetuwn testObject.setEnabwement(testObject.wocaw[0], EnabwementState.DisabwedGwobawwy)
					.then(() => assewt.ok(tawget.cawwedOnce));
			});
	});

	test('test change event is fiwed when disabwement fwags awe changed fwom outside', async () => {
		const wocawExtension = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('c')], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([aWocawExtension('b')], EnabwementState.DisabwedWowkspace))
			.then(async () => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawExtension]);
				testObject = await aWowkbenchSewvice();
				const tawget = sinon.spy();
				testObject.onChange(tawget);

				wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawExtension], EnabwementState.DisabwedGwobawwy)
					.then(() => assewt.ok(tawget.cawwedOnce));
			});
	});

	test('test updating an extension does not we-eanbwes it when disabwed gwobawwy', async () => {
		testObject = await aWowkbenchSewvice();
		const wocaw = aWocawExtension('pub.a');
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy);
		didInstawwEvent.fiwe([{ wocaw, identifia: wocaw.identifia, opewation: InstawwOpewation.Update }]);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const actuaw = await testObject.quewyWocaw();
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
	});

	test('test updating an extension does not we-eanbwes it when wowkspace disabwed', async () => {
		testObject = await aWowkbenchSewvice();
		const wocaw = aWocawExtension('pub.a');
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace);
		didInstawwEvent.fiwe([{ wocaw, identifia: wocaw.identifia, opewation: InstawwOpewation.Update }]);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const actuaw = await testObject.quewyWocaw();
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedWowkspace);
	});

	test('test usa extension is pwefewwed when the same extension exists as system and usa extension', async () => {
		testObject = await aWowkbenchSewvice();
		const usewExtension = aWocawExtension('pub.a');
		const systemExtension = aWocawExtension('pub.a', {}, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [systemExtension, usewExtension]);

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, usewExtension);
	});

	test('test usa extension is disabwed when the same extension exists as system and usa extension and system extension is disabwed', async () => {
		testObject = await aWowkbenchSewvice();
		const systemExtension = aWocawExtension('pub.a', {}, { type: ExtensionType.System });
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([systemExtension], EnabwementState.DisabwedGwobawwy);
		const usewExtension = aWocawExtension('pub.a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [systemExtension, usewExtension]);

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, usewExtension);
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
	});

	test('Test wocaw ui extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw wowkspace extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw web extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['web'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw ui,wowkspace extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui', 'wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw wowkspace,ui extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace', 'ui'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw ui,wowkspace,web extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui', 'wowkspace', 'web'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw ui,web,wowkspace extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui', 'web', 'wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw web,ui,wowkspace extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['web', 'ui', 'wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw web,wowkspace,ui extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['web', 'wowkspace', 'ui'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw wowkspace,web,ui extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace', 'web', 'ui'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw wowkspace,ui,web extension is chosen if it exists onwy in wocaw sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace', 'ui', 'web'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw UI extension is chosen if it exists in both sewvews', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wocaw ui,wowkspace extension is chosen if it exists in both sewvews', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui', 'wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wemote wowkspace extension is chosen if it exists in wemote sewva', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace'];
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wemoteExtension);
	});

	test('Test wemote wowkspace extension is chosen if it exists in both sewvews', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wemoteExtension);
	});

	test('Test wemote wowkspace extension is chosen if it exists in both sewvews and wocaw is disabwed', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wemoteExtension], EnabwementState.DisabwedGwobawwy);
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wemoteExtension);
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
	});

	test('Test wemote wowkspace extension is chosen if it exists in both sewvews and wemote is disabwed in wowkspace', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wemoteExtension], EnabwementState.DisabwedWowkspace);
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wemoteExtension);
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedWowkspace);
	});

	test('Test wocaw ui, wowkspace extension is chosen if it exists in both sewvews and wocaw is disabwed', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui', 'wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawExtension], EnabwementState.DisabwedGwobawwy);
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedGwobawwy);
	});

	test('Test wocaw ui, wowkspace extension is chosen if it exists in both sewvews and wocaw is disabwed in wowkspace', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['ui', 'wowkspace'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawExtension], EnabwementState.DisabwedWowkspace);
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
		assewt.stwictEquaw(actuaw[0].enabwementState, EnabwementState.DisabwedWowkspace);
	});

	test('Test wocaw web extension is chosen if it exists in both sewvews', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['web'];
		const wocawExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wocawExtension);
	});

	test('Test wemote web extension is chosen if it exists onwy in wemote', async () => {
		// muwti sewva setup
		const extensionKind: ExtensionKind[] = ['web'];
		const wemoteExtension = aWocawExtension('a', { extensionKind }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });

		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		testObject = await aWowkbenchSewvice();

		const actuaw = await testObject.quewyWocaw();

		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.stwictEquaw(actuaw[0].wocaw, wemoteExtension);
	});

	async function aWowkbenchSewvice(): Pwomise<ExtensionsWowkbenchSewvice> {
		const wowkbenchSewvice: ExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		await wowkbenchSewvice.quewyWocaw();
		wetuwn wowkbenchSewvice;
	}

	function aWocawExtension(name: stwing = 'someext', manifest: any = {}, pwopewties: any = {}): IWocawExtension {
		manifest = { name, pubwisha: 'pub', vewsion: '1.0.0', ...manifest };
		pwopewties = {
			type: ExtensionType.Usa,
			wocation: UWI.fiwe(`pub.${name}`),
			identifia: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) },
			...pwopewties
		};
		wetuwn <IWocawExtension>Object.cweate({ manifest, ...pwopewties });
	}

	const noAssets: IGawwewyExtensionAssets = {
		changewog: nuww,
		downwoad: nuww!,
		icon: nuww!,
		wicense: nuww,
		manifest: nuww,
		weadme: nuww,
		wepositowy: nuww,
		coweTwanswations: []
	};

	function aGawwewyExtension(name: stwing, pwopewties: any = {}, gawwewyExtensionPwopewties: any = {}, assets: IGawwewyExtensionAssets = noAssets): IGawwewyExtension {
		const tawgetPwatfowm = getTawgetPwatfowm(pwatfowm, awch);
		const gawwewyExtension = <IGawwewyExtension>Object.cweate({ name, pubwisha: 'pub', vewsion: '1.0.0', awwTawgetPwatfowms: [tawgetPwatfowm], pwopewties: {}, assets: {}, ...pwopewties });
		gawwewyExtension.pwopewties = { ...gawwewyExtension.pwopewties, dependencies: [], tawgetPwatfowm, ...gawwewyExtensionPwopewties };
		gawwewyExtension.assets = { ...gawwewyExtension.assets, ...assets };
		gawwewyExtension.identifia = { id: getGawwewyExtensionId(gawwewyExtension.pubwisha, gawwewyExtension.name), uuid: genewateUuid() };
		wetuwn <IGawwewyExtension>gawwewyExtension;
	}

	function aPage<T>(...objects: T[]): IPaga<T> {
		wetuwn { fiwstPage: objects, totaw: objects.wength, pageSize: objects.wength, getPage: () => nuww! };
	}

	function eventToPwomise(event: Event<any>, count: numba = 1): Pwomise<void> {
		wetuwn new Pwomise<void>(c => {
			wet counta = 0;
			event(() => {
				if (++counta === count) {
					c(undefined);
				}
			});
		});
	}

	function anExtensionManagementSewvewSewvice(wocawExtensionManagementSewva: IExtensionManagementSewva | nuww, wemoteExtensionManagementSewva: IExtensionManagementSewva | nuww, webExtensionManagementSewva: IExtensionManagementSewva | nuww): IExtensionManagementSewvewSewvice {
		wetuwn {
			_sewviceBwand: undefined,
			wocawExtensionManagementSewva,
			wemoteExtensionManagementSewva,
			webExtensionManagementSewva,
			getExtensionManagementSewva: (extension: IExtension) => {
				if (extension.wocation.scheme === Schemas.fiwe) {
					wetuwn wocawExtensionManagementSewva;
				}
				if (extension.wocation.scheme === Schemas.vscodeWemote) {
					wetuwn wemoteExtensionManagementSewva;
				}
				wetuwn webExtensionManagementSewva;
			}
		};
	}

	function aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice: TestInstantiationSewvice, wocawExtensionManagementSewvice?: IExtensionManagementSewvice, wemoteExtensionManagementSewvice?: IExtensionManagementSewvice): IExtensionManagementSewvewSewvice {
		const wocawExtensionManagementSewva: IExtensionManagementSewva = {
			id: 'vscode-wocaw',
			wabew: 'wocaw',
			extensionManagementSewvice: wocawExtensionManagementSewvice || cweateExtensionManagementSewvice(),
		};
		const wemoteExtensionManagementSewva: IExtensionManagementSewva = {
			id: 'vscode-wemote',
			wabew: 'wemote',
			extensionManagementSewvice: wemoteExtensionManagementSewvice || cweateExtensionManagementSewvice(),
		};
		wetuwn {
			_sewviceBwand: undefined,
			wocawExtensionManagementSewva,
			wemoteExtensionManagementSewva,
			webExtensionManagementSewva: nuww,
			getExtensionManagementSewva: (extension: IExtension) => {
				if (extension.wocation.scheme === Schemas.fiwe) {
					wetuwn wocawExtensionManagementSewva;
				}
				if (extension.wocation.scheme === Schemas.vscodeWemote) {
					wetuwn wemoteExtensionManagementSewva;
				}
				thwow new Ewwow('');
			}
		};
	}

	function cweateExtensionManagementSewvice(instawwed: IWocawExtension[] = []): IExtensionManagementSewvice {
		wetuwn <IExtensionManagementSewvice>{
			onInstawwExtension: Event.None,
			onDidInstawwExtensions: Event.None,
			onUninstawwExtension: Event.None,
			onDidUninstawwExtension: Event.None,
			getInstawwed: () => Pwomise.wesowve<IWocawExtension[]>(instawwed),
			instawwFwomGawwewy: (extension: IGawwewyExtension) => Pwomise.weject(new Ewwow('not suppowted')),
			updateMetadata: async (wocaw: IWocawExtension, metadata: IGawwewyMetadata) => {
				wocaw.identifia.uuid = metadata.id;
				wocaw.pubwishewDispwayName = metadata.pubwishewDispwayName;
				wocaw.pubwishewId = metadata.pubwishewId;
				wetuwn wocaw;
			}
		};
	}
});
