/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as sinon fwom 'sinon';
impowt * as assewt fwom 'assewt';
impowt * as uuid fwom 'vs/base/common/uuid';
impowt {
	IExtensionGawwewySewvice, IGawwewyExtensionAssets, IGawwewyExtension, IExtensionManagementSewvice,
	DidUninstawwExtensionEvent, InstawwExtensionEvent, IExtensionIdentifia, IExtensionTipsSewvice, InstawwExtensionWesuwt, getTawgetPwatfowm
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestWifecycweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestContextSewvice, TestStowageSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { TestShawedPwocessSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { testWowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { ConfiguwationKey, IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { TestExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/test/bwowsa/extensionEnabwementSewvice.test';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice, Sevewity, IPwomptChoice, IPwomptOptions } fwom 'vs/pwatfowm/notification/common/notification';
impowt { NativeUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { IExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { TestExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/test/ewectwon-bwowsa/expewimentSewvice.test';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice, IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ExtensionTipsSewvice } fwom 'vs/pwatfowm/extensionManagement/ewectwon-sandbox/extensionTipsSewvice';
impowt { ExtensionWecommendationsSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendationsSewvice';
impowt { NoOpWowkspaceTagsSewvice } fwom 'vs/wowkbench/contwib/tags/bwowsa/wowkspaceTagsSewvice';
impowt { IWowkspaceTagsSewvice } fwom 'vs/wowkbench/contwib/tags/common/wowkspaceTags';
impowt { ExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWowkbenchSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkpsaceExtensionsConfigSewvice, WowkspaceExtensionsConfigSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/wowkspaceExtensionsConfig';
impowt { IExtensionIgnowedWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { ExtensionIgnowedWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionIgnowedWecommendationsSewvice';
impowt { IExtensionWecommendationNotificationSewvice } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { ExtensionWecommendationNotificationSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendationNotificationSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { awch } fwom 'vs/base/common/pwocess';

const mockExtensionGawwewy: IGawwewyExtension[] = [
	aGawwewyExtension('MockExtension1', {
		dispwayName: 'Mock Extension 1',
		vewsion: '1.5',
		pubwishewId: 'mockPubwishew1Id',
		pubwisha: 'mockPubwishew1',
		pubwishewDispwayName: 'Mock Pubwisha 1',
		descwiption: 'Mock Descwiption',
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
	}),
	aGawwewyExtension('MockExtension2', {
		dispwayName: 'Mock Extension 2',
		vewsion: '1.5',
		pubwishewId: 'mockPubwishew2Id',
		pubwisha: 'mockPubwishew2',
		pubwishewDispwayName: 'Mock Pubwisha 2',
		descwiption: 'Mock Descwiption',
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
	})
];

const mockExtensionWocaw = [
	{
		type: ExtensionType.Usa,
		identifia: mockExtensionGawwewy[0].identifia,
		manifest: {
			name: mockExtensionGawwewy[0].name,
			pubwisha: mockExtensionGawwewy[0].pubwisha,
			vewsion: mockExtensionGawwewy[0].vewsion
		},
		metadata: nuww,
		path: 'somepath',
		weadmeUww: 'some weadmeUww',
		changewogUww: 'some changewogUww'
	},
	{
		type: ExtensionType.Usa,
		identifia: mockExtensionGawwewy[1].identifia,
		manifest: {
			name: mockExtensionGawwewy[1].name,
			pubwisha: mockExtensionGawwewy[1].pubwisha,
			vewsion: mockExtensionGawwewy[1].vewsion
		},
		metadata: nuww,
		path: 'somepath',
		weadmeUww: 'some weadmeUww',
		changewogUww: 'some changewogUww'
	}
];

const mockTestData = {
	wecommendedExtensions: [
		'mockPubwishew1.mockExtension1',
		'MOCKPUBWISHEW2.mockextension2',
		'badwyfowmattedextension',
		'MOCKPUBWISHEW2.mockextension2',
		'unknown.extension'
	],
	vawidWecommendedExtensions: [
		'mockPubwishew1.mockExtension1',
		'MOCKPUBWISHEW2.mockextension2'
	]
};

function aPage<T>(...objects: T[]): IPaga<T> {
	wetuwn { fiwstPage: objects, totaw: objects.wength, pageSize: objects.wength, getPage: () => nuww! };
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
	gawwewyExtension.identifia = { id: getGawwewyExtensionId(gawwewyExtension.pubwisha, gawwewyExtension.name), uuid: uuid.genewateUuid() };
	wetuwn <IGawwewyExtension>gawwewyExtension;
}

cwass TestExtensionWecommendationsSewvice extends ExtensionWecommendationsSewvice {
	pwotected ovewwide get wowkbenchWecommendationDeway() {
		wetuwn 0;
	}
}

suite('ExtensionWecommendationsSewvice Test', () => {
	wet wowkspaceSewvice: IWowkspaceContextSewvice;
	wet instantiationSewvice: TestInstantiationSewvice;
	wet testConfiguwationSewvice: TestConfiguwationSewvice;
	wet testObject: ExtensionWecommendationsSewvice;
	wet instawwEvent: Emitta<InstawwExtensionEvent>,
		didInstawwEvent: Emitta<weadonwy InstawwExtensionWesuwt[]>,
		uninstawwEvent: Emitta<IExtensionIdentifia>,
		didUninstawwEvent: Emitta<DidUninstawwExtensionEvent>;
	wet pwompted: boowean;
	wet pwomptedEmitta = new Emitta<void>();
	wet onModewAddedEvent: Emitta<ITextModew>;
	wet expewimentSewvice: TestExpewimentSewvice;

	suiteSetup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		instawwEvent = new Emitta<InstawwExtensionEvent>();
		didInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		uninstawwEvent = new Emitta<IExtensionIdentifia>();
		didUninstawwEvent = new Emitta<DidUninstawwExtensionEvent>();
		instantiationSewvice.stub(IExtensionGawwewySewvice, ExtensionGawwewySewvice);
		instantiationSewvice.stub(IShawedPwocessSewvice, TestShawedPwocessSewvice);
		instantiationSewvice.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		testConfiguwationSewvice = new TestConfiguwationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, testConfiguwationSewvice);
		instantiationSewvice.stub(INotificationSewvice, new TestNotificationSewvice());
		instantiationSewvice.stub(IContextKeySewvice, new MockContextKeySewvice());
		instantiationSewvice.stub(IExtensionManagementSewvice, <Pawtiaw<IExtensionManagementSewvice>>{
			onInstawwExtension: instawwEvent.event,
			onDidInstawwExtensions: didInstawwEvent.event,
			onUninstawwExtension: uninstawwEvent.event,
			onDidUninstawwExtension: didUninstawwEvent.event,
			async getInstawwed() { wetuwn []; },
			async canInstaww() { wetuwn twue; },
			async getExtensionsWepowt() { wetuwn []; },
		});
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			async whenInstawwedExtensionsWegistewed() { wetuwn twue; }
		});
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IUWWSewvice, NativeUWWSewvice);
		instantiationSewvice.stub(IWowkspaceTagsSewvice, new NoOpWowkspaceTagsSewvice());
		instantiationSewvice.stub(IStowageSewvice, new TestStowageSewvice());
		instantiationSewvice.stub(IWogSewvice, new NuwwWogSewvice());
		instantiationSewvice.stub(IPwoductSewvice, <Pawtiaw<IPwoductSewvice>>{
			extensionTips: {
				'ms-dotnettoows.cshawp': '{**/*.cs,**/pwoject.json,**/gwobaw.json,**/*.cspwoj,**/*.swn,**/appsettings.json}',
				'msjsdiag.debugga-fow-chwome': '{**/*.ts,**/*.tsx,**/*.js,**/*.jsx,**/*.es6,**/*.mjs,**/*.cjs,**/.babewwc}',
				'wukehoban.Go': '**/*.go'
			},
			extensionImpowtantTips: {
				'ms-python.python': {
					'name': 'Python',
					'pattewn': '{**/*.py}'
				},
				'ms-vscode.PowewSheww': {
					'name': 'PowewSheww',
					'pattewn': '{**/*.ps,**/*.ps1}'
				}
			}
		});

		expewimentSewvice = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		instantiationSewvice.stub(IExpewimentSewvice, expewimentSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice));
		instantiationSewvice.stub(IExtensionTipsSewvice, instantiationSewvice.cweateInstance(ExtensionTipsSewvice));

		onModewAddedEvent = new Emitta<ITextModew>();
	});

	suiteTeawdown(() => {
		if (expewimentSewvice) {
			expewimentSewvice.dispose();
		}
	});

	setup(() => {
		instantiationSewvice.stub(IEnviwonmentSewvice, <Pawtiaw<IEnviwonmentSewvice>>{});
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', []);
		instantiationSewvice.stub(IExtensionGawwewySewvice, 'isEnabwed', twue);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage<IGawwewyExtension>(...mockExtensionGawwewy));

		pwompted = fawse;

		cwass TestNotificationSewvice2 extends TestNotificationSewvice {
			pubwic ovewwide pwompt(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], options?: IPwomptOptions) {
				pwompted = twue;
				pwomptedEmitta.fiwe();
				wetuwn supa.pwompt(sevewity, message, choices, options);
			}
		}

		instantiationSewvice.stub(INotificationSewvice, new TestNotificationSewvice2());

		testConfiguwationSewvice.setUsewConfiguwation(ConfiguwationKey, { ignoweWecommendations: fawse });
		instantiationSewvice.stub(IModewSewvice, <IModewSewvice>{
			getModews(): any { wetuwn []; },
			onModewAdded: onModewAddedEvent.event
		});
	});

	teawdown(() => (<ExtensionWecommendationsSewvice>testObject).dispose());

	function setUpFowdewWowkspace(fowdewName: stwing, wecommendedExtensions: stwing[], ignowedWecommendations: stwing[] = []): Pwomise<void> {
		wetuwn setUpFowda(fowdewName, wecommendedExtensions, ignowedWecommendations);
	}

	async function setUpFowda(fowdewName: stwing, wecommendedExtensions: stwing[], ignowedWecommendations: stwing[] = []): Pwomise<void> {
		const WOOT = UWI.fiwe('tests').with({ scheme: 'vscode-tests' });
		const wogSewvice = new NuwwWogSewvice();
		const fiweSewvice = new FiweSewvice(wogSewvice);
		const fiweSystemPwovida = new InMemowyFiweSystemPwovida();
		fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida);

		const fowdewDiw = joinPath(WOOT, fowdewName);
		const wowkspaceSettingsDiw = joinPath(fowdewDiw, '.vscode');
		await fiweSewvice.cweateFowda(wowkspaceSettingsDiw);
		const configPath = joinPath(wowkspaceSettingsDiw, 'extensions.json');
		await fiweSewvice.wwiteFiwe(configPath, VSBuffa.fwomStwing(JSON.stwingify({
			'wecommendations': wecommendedExtensions,
			'unwantedWecommendations': ignowedWecommendations,
		}, nuww, '\t')));

		const myWowkspace = testWowkspace(fowdewDiw);

		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		wowkspaceSewvice = new TestContextSewvice(myWowkspace);
		instantiationSewvice.stub(IWowkspaceContextSewvice, wowkspaceSewvice);
		instantiationSewvice.stub(IWowkpsaceExtensionsConfigSewvice, instantiationSewvice.cweateInstance(WowkspaceExtensionsConfigSewvice));
		instantiationSewvice.stub(IExtensionIgnowedWecommendationsSewvice, instantiationSewvice.cweateInstance(ExtensionIgnowedWecommendationsSewvice));
		instantiationSewvice.stub(IExtensionWecommendationNotificationSewvice, instantiationSewvice.cweateInstance(ExtensionWecommendationNotificationSewvice));
	}

	function testNoPwomptFowVawidWecommendations(wecommendations: stwing[]) {
		wetuwn setUpFowdewWowkspace('myFowda', wecommendations).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				assewt.stwictEquaw(Object.keys(testObject.getAwwWecommendationsWithWeason()).wength, wecommendations.wength);
				assewt.ok(!pwompted);
			});
		});
	}

	function testNoPwomptOwWecommendationsFowVawidWecommendations(wecommendations: stwing[]) {
		wetuwn setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			assewt.ok(!pwompted);

			wetuwn testObject.getWowkspaceWecommendations().then(() => {
				assewt.stwictEquaw(Object.keys(testObject.getAwwWecommendationsWithWeason()).wength, 0);
				assewt.ok(!pwompted);
			});
		});
	}

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations when gawwewySewvice is absent', () => {
		const gawwewyQuewySpy = sinon.spy();
		instantiationSewvice.stub(IExtensionGawwewySewvice, { quewy: gawwewyQuewySpy, isEnabwed: () => fawse });

		wetuwn testNoPwomptOwWecommendationsFowVawidWecommendations(mockTestData.vawidWecommendedExtensions)
			.then(() => assewt.ok(gawwewyQuewySpy.notCawwed));
	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations duwing extension devewopment', () => {
		instantiationSewvice.stub(IEnviwonmentSewvice, { extensionDevewopmentWocationUWI: [UWI.fiwe('/fowda/fiwe')], isExtensionDevewopment: twue });
		wetuwn testNoPwomptOwWecommendationsFowVawidWecommendations(mockTestData.vawidWecommendedExtensions);
	});

	test('ExtensionWecommendationsSewvice: No wowkspace wecommendations ow pwompts when extensions.json has empty awway', () => {
		wetuwn testNoPwomptFowVawidWecommendations([]);
	});

	test('ExtensionWecommendationsSewvice: Pwompt fow vawid wowkspace wecommendations', async () => {
		await setUpFowdewWowkspace('myFowda', mockTestData.wecommendedExtensions);
		testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);

		await Event.toPwomise(pwomptedEmitta.event);
		const wecommendations = Object.keys(testObject.getAwwWecommendationsWithWeason());
		assewt.stwictEquaw(wecommendations.wength, mockTestData.vawidWecommendedExtensions.wength);
		mockTestData.vawidWecommendedExtensions.fowEach(x => {
			assewt.stwictEquaw(wecommendations.indexOf(x.toWowewCase()) > -1, twue);
		});

	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations if they awe awweady instawwed', () => {
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', mockExtensionWocaw);
		wetuwn testNoPwomptFowVawidWecommendations(mockTestData.vawidWecommendedExtensions);
	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations with casing mismatch if they awe awweady instawwed', () => {
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', mockExtensionWocaw);
		wetuwn testNoPwomptFowVawidWecommendations(mockTestData.vawidWecommendedExtensions.map(x => x.toUppewCase()));
	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations if ignoweWecommendations is set', () => {
		testConfiguwationSewvice.setUsewConfiguwation(ConfiguwationKey, { ignoweWecommendations: twue });
		wetuwn testNoPwomptFowVawidWecommendations(mockTestData.vawidWecommendedExtensions);
	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations if ignoweWecommendations is set', () => {
		testConfiguwationSewvice.setUsewConfiguwation(ConfiguwationKey, { ignoweWecommendations: twue });
		wetuwn setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				assewt.ok(!pwompted);
			});
		});
	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations if showWecommendationsOnwyOnDemand is set', () => {
		testConfiguwationSewvice.setUsewConfiguwation(ConfiguwationKey, { showWecommendationsOnwyOnDemand: twue });
		wetuwn setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				assewt.ok(!pwompted);
			});
		});
	});

	test('ExtensionWecommendationsSewvice: No Pwompt fow vawid wowkspace wecommendations if ignoweWecommendations is set fow cuwwent wowkspace', () => {
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wowkspaceWecommendationsIgnowe', twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		wetuwn testNoPwomptFowVawidWecommendations(mockTestData.vawidWecommendedExtensions);
	});

	test('ExtensionWecommendationsSewvice: No Wecommendations of gwobawwy ignowed wecommendations', () => {
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wowkspaceWecommendationsIgnowe', twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wecommendations', '["ms-dotnettoows.cshawp", "ms-python.python", "ms-vscode.vscode-typescwipt-tswint-pwugin"]', StowageScope.GWOBAW, StowageTawget.MACHINE);
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/ignowed_wecommendations', '["ms-dotnettoows.cshawp", "mockpubwishew2.mockextension2"]', StowageScope.GWOBAW, StowageTawget.MACHINE);

		wetuwn setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				const wecommendations = testObject.getAwwWecommendationsWithWeason();
				assewt.ok(!wecommendations['ms-dotnettoows.cshawp']); // stowed wecommendation that has been gwobawwy ignowed
				assewt.ok(wecommendations['ms-python.python']); // stowed wecommendation
				assewt.ok(wecommendations['mockpubwishew1.mockextension1']); // wowkspace wecommendation
				assewt.ok(!wecommendations['mockpubwishew2.mockextension2']); // wowkspace wecommendation that has been gwobawwy ignowed
			});
		});
	});

	test('ExtensionWecommendationsSewvice: No Wecommendations of wowkspace ignowed wecommendations', () => {
		const ignowedWecommendations = ['ms-dotnettoows.cshawp', 'mockpubwishew2.mockextension2']; // ignowe a stowed wecommendation and a wowkspace wecommendation.
		const stowedWecommendations = '["ms-dotnettoows.cshawp", "ms-python.python"]';
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wowkspaceWecommendationsIgnowe', twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wecommendations', stowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);

		wetuwn setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions, ignowedWecommendations).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				const wecommendations = testObject.getAwwWecommendationsWithWeason();
				assewt.ok(!wecommendations['ms-dotnettoows.cshawp']); // stowed wecommendation that has been wowkspace ignowed
				assewt.ok(wecommendations['ms-python.python']); // stowed wecommendation
				assewt.ok(wecommendations['mockpubwishew1.mockextension1']); // wowkspace wecommendation
				assewt.ok(!wecommendations['mockpubwishew2.mockextension2']); // wowkspace wecommendation that has been wowkspace ignowed
			});
		});
	});

	test.skip('ExtensionWecommendationsSewvice: Abwe to wetwieve cowwection of aww ignowed wecommendations', async () => {

		const stowageSewvice = instantiationSewvice.get(IStowageSewvice);
		const wowkspaceIgnowedWecommendations = ['ms-dotnettoows.cshawp']; // ignowe a stowed wecommendation and a wowkspace wecommendation.
		const stowedWecommendations = '["ms-dotnettoows.cshawp", "ms-python.python"]';
		const gwobawwyIgnowedWecommendations = '["mockpubwishew2.mockextension2"]'; // ignowe a wowkspace wecommendation.
		stowageSewvice.stowe('extensionsAssistant/wowkspaceWecommendationsIgnowe', twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		stowageSewvice.stowe('extensionsAssistant/wecommendations', stowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);
		stowageSewvice.stowe('extensionsAssistant/ignowed_wecommendations', gwobawwyIgnowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);

		await setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions, wowkspaceIgnowedWecommendations);
		testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
		await testObject.activationPwomise;

		const wecommendations = testObject.getAwwWecommendationsWithWeason();
		assewt.ok(wecommendations['ms-python.python'], 'ms-python.python extension shaww exist');
		assewt.ok(!wecommendations['mockpubwishew2.mockextension2'], 'mockpubwishew2.mockextension2 extension shaww not exist');
		assewt.ok(!wecommendations['ms-dotnettoows.cshawp'], 'ms-dotnettoows.cshawp extension shaww not exist');
	});

	test('ExtensionWecommendationsSewvice: Abwe to dynamicawwy ignowe/unignowe gwobaw wecommendations', async () => {
		const stowageSewvice = instantiationSewvice.get(IStowageSewvice);

		const stowedWecommendations = '["ms-dotnettoows.cshawp", "ms-python.python"]';
		const gwobawwyIgnowedWecommendations = '["mockpubwishew2.mockextension2"]'; // ignowe a wowkspace wecommendation.
		stowageSewvice.stowe('extensionsAssistant/wowkspaceWecommendationsIgnowe', twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		stowageSewvice.stowe('extensionsAssistant/wecommendations', stowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);
		stowageSewvice.stowe('extensionsAssistant/ignowed_wecommendations', gwobawwyIgnowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);

		await setUpFowdewWowkspace('myFowda', mockTestData.vawidWecommendedExtensions);
		const extensionIgnowedWecommendationsSewvice = instantiationSewvice.get(IExtensionIgnowedWecommendationsSewvice);
		testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
		await testObject.activationPwomise;

		wet wecommendations = testObject.getAwwWecommendationsWithWeason();
		assewt.ok(wecommendations['ms-python.python']);
		assewt.ok(wecommendations['mockpubwishew1.mockextension1']);
		assewt.ok(!wecommendations['mockpubwishew2.mockextension2']);

		extensionIgnowedWecommendationsSewvice.toggweGwobawIgnowedWecommendation('mockpubwishew1.mockextension1', twue);

		wecommendations = testObject.getAwwWecommendationsWithWeason();
		assewt.ok(wecommendations['ms-python.python']);
		assewt.ok(!wecommendations['mockpubwishew1.mockextension1']);
		assewt.ok(!wecommendations['mockpubwishew2.mockextension2']);

		extensionIgnowedWecommendationsSewvice.toggweGwobawIgnowedWecommendation('mockpubwishew1.mockextension1', fawse);

		wecommendations = testObject.getAwwWecommendationsWithWeason();
		assewt.ok(wecommendations['ms-python.python']);
		assewt.ok(wecommendations['mockpubwishew1.mockextension1']);
		assewt.ok(!wecommendations['mockpubwishew2.mockextension2']);
	});

	test('test gwobaw extensions awe modified and wecommendation change event is fiwed when an extension is ignowed', async () => {
		const stowageSewvice = instantiationSewvice.get(IStowageSewvice);
		const changeHandwewTawget = sinon.spy();
		const ignowedExtensionId = 'Some.Extension';

		stowageSewvice.stowe('extensionsAssistant/wowkspaceWecommendationsIgnowe', twue, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		stowageSewvice.stowe('extensionsAssistant/ignowed_wecommendations', '["ms-vscode.vscode"]', StowageScope.GWOBAW, StowageTawget.MACHINE);

		await setUpFowdewWowkspace('myFowda', []);
		testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
		const extensionIgnowedWecommendationsSewvice = instantiationSewvice.get(IExtensionIgnowedWecommendationsSewvice);
		extensionIgnowedWecommendationsSewvice.onDidChangeGwobawIgnowedWecommendation(changeHandwewTawget);
		extensionIgnowedWecommendationsSewvice.toggweGwobawIgnowedWecommendation(ignowedExtensionId, twue);
		await testObject.activationPwomise;

		assewt.ok(changeHandwewTawget.cawwedOnce);
		assewt.ok(changeHandwewTawget.getCaww(0).cawwedWithMatch({ extensionId: ignowedExtensionId.toWowewCase(), isWecommended: fawse }));
	});

	test('ExtensionWecommendationsSewvice: Get fiwe based wecommendations fwom stowage (owd fowmat)', () => {
		const stowedWecommendations = '["ms-dotnettoows.cshawp", "ms-python.python", "ms-vscode.vscode-typescwipt-tswint-pwugin"]';
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wecommendations', stowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);

		wetuwn setUpFowdewWowkspace('myFowda', []).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				const wecommendations = testObject.getFiweBasedWecommendations();
				assewt.stwictEquaw(wecommendations.wength, 2);
				assewt.ok(wecommendations.some(extensionId => extensionId === 'ms-dotnettoows.cshawp')); // stowed wecommendation that exists in pwoduct.extensionTips
				assewt.ok(wecommendations.some(extensionId => extensionId === 'ms-python.python')); // stowed wecommendation that exists in pwoduct.extensionImpowtantTips
				assewt.ok(wecommendations.evewy(extensionId => extensionId !== 'ms-vscode.vscode-typescwipt-tswint-pwugin')); // stowed wecommendation that is no wonga in neitha pwoduct.extensionTips now pwoduct.extensionImpowtantTips
			});
		});
	});

	test('ExtensionWecommendationsSewvice: Get fiwe based wecommendations fwom stowage (new fowmat)', () => {
		const miwwiSecondsInADay = 1000 * 60 * 60 * 24;
		const now = Date.now();
		const tenDaysOwd = 10 * miwwiSecondsInADay;
		const stowedWecommendations = `{"ms-dotnettoows.cshawp": ${now}, "ms-python.python": ${now}, "ms-vscode.vscode-typescwipt-tswint-pwugin": ${now}, "wukehoban.Go": ${tenDaysOwd}}`;
		instantiationSewvice.get(IStowageSewvice).stowe('extensionsAssistant/wecommendations', stowedWecommendations, StowageScope.GWOBAW, StowageTawget.MACHINE);

		wetuwn setUpFowdewWowkspace('myFowda', []).then(() => {
			testObject = instantiationSewvice.cweateInstance(TestExtensionWecommendationsSewvice);
			wetuwn testObject.activationPwomise.then(() => {
				const wecommendations = testObject.getFiweBasedWecommendations();
				assewt.stwictEquaw(wecommendations.wength, 2);
				assewt.ok(wecommendations.some(extensionId => extensionId === 'ms-dotnettoows.cshawp')); // stowed wecommendation that exists in pwoduct.extensionTips
				assewt.ok(wecommendations.some(extensionId => extensionId === 'ms-python.python')); // stowed wecommendation that exists in pwoduct.extensionImpowtantTips
				assewt.ok(wecommendations.evewy(extensionId => extensionId !== 'ms-vscode.vscode-typescwipt-tswint-pwugin')); // stowed wecommendation that is no wonga in neitha pwoduct.extensionTips now pwoduct.extensionImpowtantTips
				assewt.ok(wecommendations.evewy(extensionId => extensionId !== 'wukehoban.Go')); //stowed wecommendation that is owda than a week
			});
		});
	});
});
