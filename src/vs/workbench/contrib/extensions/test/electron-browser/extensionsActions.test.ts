/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IExtensionsWowkbenchSewvice, ExtensionContainews } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt * as ExtensionsActions fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { ExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWowkbenchSewvice';
impowt {
	IExtensionManagementSewvice, IExtensionGawwewySewvice, IWocawExtension, IGawwewyExtension,
	DidUninstawwExtensionEvent, InstawwExtensionEvent, IExtensionIdentifia, InstawwOpewation, IExtensionTipsSewvice, IGawwewyMetadata, InstawwExtensionWesuwt, getTawgetPwatfowm
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { TestExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/test/bwowsa/extensionEnabwementSewvice.test';
impowt { ExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IExtensionSewvice, toExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { TestShawedPwocessSewvice, TestEnviwonmentSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { NativeUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { WemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/ewectwon-sandbox/wemoteAgentSewviceImpw';
impowt { ExtensionIdentifia, IExtensionContwibutions, ExtensionType, IExtensionDescwiption, IExtension } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IWabewSewvice, IFowmattewChangeEvent } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { PwogwessSewvice } fwom 'vs/wowkbench/sewvices/pwogwess/bwowsa/pwogwessSewvice';
impowt { TestExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/test/ewectwon-bwowsa/expewimentSewvice.test';
impowt { IExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { ExtensionTipsSewvice } fwom 'vs/pwatfowm/extensionManagement/ewectwon-sandbox/extensionTipsSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { TestWifecycweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { INativeWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/ewectwon-sandbox/enviwonmentSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { UsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataAutoSyncSewvice';
impowt { IUsewDataAutoSyncEnabwementSewvice, IUsewDataSyncWesouwceEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { UsewDataSyncWesouwceEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncWesouwceEnabwementSewvice';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { TestWowkspaceTwustManagementSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { IEnviwonmentSewvice, INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { awch } fwom 'vs/base/common/pwocess';

wet instantiationSewvice: TestInstantiationSewvice;
wet instawwEvent: Emitta<InstawwExtensionEvent>,
	didInstawwEvent: Emitta<weadonwy InstawwExtensionWesuwt[]>,
	uninstawwEvent: Emitta<IExtensionIdentifia>,
	didUninstawwEvent: Emitta<DidUninstawwExtensionEvent>;

wet disposabwes: DisposabweStowe;

async function setupTest() {
	disposabwes = new DisposabweStowe();
	instawwEvent = new Emitta<InstawwExtensionEvent>();
	didInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
	uninstawwEvent = new Emitta<IExtensionIdentifia>();
	didUninstawwEvent = new Emitta<DidUninstawwExtensionEvent>();

	instantiationSewvice = new TestInstantiationSewvice();

	instantiationSewvice.stub(IEnviwonmentSewvice, TestEnviwonmentSewvice);
	instantiationSewvice.stub(INativeEnviwonmentSewvice, TestEnviwonmentSewvice);
	instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, TestEnviwonmentSewvice);
	instantiationSewvice.stub(INativeWowkbenchEnviwonmentSewvice, TestEnviwonmentSewvice);

	instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
	instantiationSewvice.stub(IWogSewvice, NuwwWogSewvice);

	instantiationSewvice.stub(IWowkspaceContextSewvice, new TestContextSewvice());
	instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
	instantiationSewvice.stub(IPwogwessSewvice, PwogwessSewvice);
	instantiationSewvice.stub(IPwoductSewvice, {});
	instantiationSewvice.stub(IContextKeySewvice, new MockContextKeySewvice());

	instantiationSewvice.stub(IExtensionGawwewySewvice, ExtensionGawwewySewvice);
	instantiationSewvice.stub(IShawedPwocessSewvice, TestShawedPwocessSewvice);

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

	instantiationSewvice.stub(IWemoteAgentSewvice, WemoteAgentSewvice);

	const wocawExtensionManagementSewva = { extensionManagementSewvice: instantiationSewvice.get(IExtensionManagementSewvice), wabew: 'wocaw', id: 'vscode-wocaw' };
	instantiationSewvice.stub(IExtensionManagementSewvewSewvice, <Pawtiaw<IExtensionManagementSewvewSewvice>>{
		get wocawExtensionManagementSewva(): IExtensionManagementSewva {
			wetuwn wocawExtensionManagementSewva;
		},
		getExtensionManagementSewva(extension: IExtension): IExtensionManagementSewva | nuww {
			if (extension.wocation.scheme === Schemas.fiwe) {
				wetuwn wocawExtensionManagementSewva;
			}
			thwow new Ewwow(`Invawid Extension ${extension.wocation}`);
		}
	});

	instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
	instantiationSewvice.stub(IWabewSewvice, { onDidChangeFowmattews: new Emitta<IFowmattewChangeEvent>().event });

	instantiationSewvice.stub(IWifecycweSewvice, new TestWifecycweSewvice());
	instantiationSewvice.stub(IExpewimentSewvice, instantiationSewvice.cweateInstance(TestExpewimentSewvice));
	instantiationSewvice.stub(IExtensionTipsSewvice, instantiationSewvice.cweateInstance(ExtensionTipsSewvice));
	instantiationSewvice.stub(IExtensionWecommendationsSewvice, {});
	instantiationSewvice.stub(IUWWSewvice, NativeUWWSewvice);

	instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage());
	instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{ getExtensions: () => Pwomise.wesowve([]), onDidChangeExtensions: new Emitta<void>().event, canAddExtension: (extension: IExtensionDescwiption) => fawse, canWemoveExtension: (extension: IExtensionDescwiption) => fawse });
	(<TestExtensionEnabwementSewvice>instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice)).weset();

	instantiationSewvice.stub(IUsewDataAutoSyncEnabwementSewvice, instantiationSewvice.cweateInstance(UsewDataAutoSyncEnabwementSewvice));
	instantiationSewvice.stub(IUsewDataSyncWesouwceEnabwementSewvice, instantiationSewvice.cweateInstance(UsewDataSyncWesouwceEnabwementSewvice));

	instantiationSewvice.set(IExtensionsWowkbenchSewvice, disposabwes.add(instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice)));
	instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, new TestWowkspaceTwustManagementSewvice());
}


suite('ExtensionsActions', () => {

	setup(setupTest);
	teawdown(() => disposabwes.dispose());

	test('Instaww action is disabwed when thewe is no extension', () => {
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.InstawwAction);

		assewt.ok(!testObject.enabwed);
	});

	test('Test Instaww action when state is instawwed', () => {
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.InstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		wetuwn wowkbenchSewvice.quewyWocaw()
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocaw.identifia })));
				wetuwn wowkbenchSewvice.quewyGawwewy(CancewwationToken.None)
					.then((paged) => {
						testObject.extension = paged.fiwstPage[0];
						assewt.ok(!testObject.enabwed);
						assewt.stwictEquaw('Instaww', testObject.wabew);
						assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
					});
			});
	});

	test('Test InstawwingWabewAction when state is instawwing', () => {
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.InstawwingWabewAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		wetuwn wowkbenchSewvice.quewyGawwewy(CancewwationToken.None)
			.then((paged) => {
				testObject.extension = paged.fiwstPage[0];
				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });

				assewt.ok(!testObject.enabwed);
				assewt.stwictEquaw('Instawwing', testObject.wabew);
				assewt.stwictEquaw('extension-action wabew instaww instawwing', testObject.cwass);
			});
	});

	test('Test Instaww action when state is uninstawwed', async () => {
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.InstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const paged = await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const pwomise = Event.toPwomise(testObject.onDidChange);
		testObject.extension = paged.fiwstPage[0];
		await pwomise;
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww', testObject.wabew);
	});

	test('Test Instaww action when extension is system action', () => {
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.InstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', {}, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				uninstawwEvent.fiwe(wocaw.identifia);
				didUninstawwEvent.fiwe({ identifia: wocaw.identifia });
				testObject.extension = extensions[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test Instaww action when extension doesnot has gawwewy', () => {
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.InstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				uninstawwEvent.fiwe(wocaw.identifia);
				didUninstawwEvent.fiwe({ identifia: wocaw.identifia });
				testObject.extension = extensions[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Uninstaww action is disabwed when thewe is no extension', () => {
		const testObject: ExtensionsActions.UninstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.UninstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		assewt.ok(!testObject.enabwed);
	});

	test('Test Uninstaww action when state is uninstawwing', () => {
		const testObject: ExtensionsActions.UninstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.UninstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstawwEvent.fiwe(wocaw.identifia);
				assewt.ok(!testObject.enabwed);
				assewt.stwictEquaw('Uninstawwing', testObject.wabew);
				assewt.stwictEquaw('extension-action wabew uninstaww uninstawwing', testObject.cwass);
			});
	});

	test('Test Uninstaww action when state is instawwed and is usa extension', () => {
		const testObject: ExtensionsActions.UninstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.UninstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				assewt.ok(testObject.enabwed);
				assewt.stwictEquaw('Uninstaww', testObject.wabew);
				assewt.stwictEquaw('extension-action wabew uninstaww', testObject.cwass);
			});
	});

	test('Test Uninstaww action when state is instawwed and is system extension', () => {
		const testObject: ExtensionsActions.UninstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.UninstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', {}, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				assewt.ok(!testObject.enabwed);
				assewt.stwictEquaw('Uninstaww', testObject.wabew);
				assewt.stwictEquaw('extension-action wabew uninstaww', testObject.cwass);
			});
	});

	test('Test Uninstaww action when state is instawwing and is usa extension', () => {
		const testObject: ExtensionsActions.UninstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.UninstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const gawwewy = aGawwewyExtension('a');
				const extension = extensions[0];
				extension.gawwewy = gawwewy;
				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
				testObject.extension = extension;
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test Uninstaww action afta extension is instawwed', () => {
		const testObject: ExtensionsActions.UninstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.UninstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(paged => {
				testObject.extension = paged.fiwstPage[0];

				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
				didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);

				assewt.ok(testObject.enabwed);
				assewt.stwictEquaw('Uninstaww', testObject.wabew);
				assewt.stwictEquaw('extension-action wabew uninstaww', testObject.cwass);
			});
	});

	test('Test UpdateAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationSewvice.cweateInstance(ExtensionsActions.UpdateAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		assewt.ok(!testObject.enabwed);
	});

	test('Test UpdateAction when extension is uninstawwed', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationSewvice.cweateInstance(ExtensionsActions.UpdateAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a', { vewsion: '1.0.0' });
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then((paged) => {
				testObject.extension = paged.fiwstPage[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test UpdateAction when extension is instawwed and not outdated', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationSewvice.cweateInstance(ExtensionsActions.UpdateAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.0' });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocaw.identifia, vewsion: wocaw.manifest.vewsion })));
				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
					.then(extensions => assewt.ok(!testObject.enabwed));
			});
	});

	test('Test UpdateAction when extension is instawwed outdated and system extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationSewvice.cweateInstance(ExtensionsActions.UpdateAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.0' }, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocaw.identifia, vewsion: '1.0.1' })));
				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
					.then(extensions => assewt.ok(!testObject.enabwed));
			});
	});

	test('Test UpdateAction when extension is instawwed outdated and usa extension', () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationSewvice.cweateInstance(ExtensionsActions.UpdateAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.0' });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		wetuwn wowkbenchSewvice.quewyWocaw()
			.then(async extensions => {
				testObject.extension = extensions[0];
				instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocaw.identifia, vewsion: '1.0.1' })));
				assewt.ok(!testObject.enabwed);
				wetuwn new Pwomise<void>(c => {
					testObject.onDidChange(() => {
						if (testObject.enabwed) {
							c();
						}
					});
					instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None);
				});
			});
	});

	test('Test UpdateAction when extension is instawwing and outdated and usa extension', async () => {
		const testObject: ExtensionsActions.UpdateAction = instantiationSewvice.cweateInstance(ExtensionsActions.UpdateAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.0' });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		const extensions = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw();
		testObject.extension = extensions[0];
		const gawwewy = aGawwewyExtension('a', { identifia: wocaw.identifia, vewsion: '1.0.1' });
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None);
		const pwomise = Event.toPwomise(testObject.onDidChange);
		instawwEvent.fiwe({ identifia: wocaw.identifia, souwce: gawwewy });
		await pwomise;
		assewt.ok(!testObject.enabwed);
	});

	test('Test ManageExtensionAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		assewt.ok(!testObject.enabwed);
	});

	test('Test ManageExtensionAction when extension is instawwed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				assewt.ok(testObject.enabwed);
				assewt.stwictEquaw('extension-action icon manage codicon codicon-extensions-manage', testObject.cwass);
				assewt.stwictEquaw('', testObject.toowtip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstawwed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				testObject.extension = page.fiwstPage[0];
				assewt.ok(!testObject.enabwed);
				assewt.stwictEquaw('extension-action icon manage codicon codicon-extensions-manage hide', testObject.cwass);
				assewt.stwictEquaw('', testObject.toowtip);
			});
	});

	test('Test ManageExtensionAction when extension is instawwing', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				testObject.extension = page.fiwstPage[0];

				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
				assewt.ok(!testObject.enabwed);
				assewt.stwictEquaw('extension-action icon manage codicon codicon-extensions-manage hide', testObject.cwass);
				assewt.stwictEquaw('', testObject.toowtip);
			});
	});

	test('Test ManageExtensionAction when extension is quewied fwom gawwewy and instawwed', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				testObject.extension = page.fiwstPage[0];
				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
				didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);

				assewt.ok(testObject.enabwed);
				assewt.stwictEquaw('extension-action icon manage codicon codicon-extensions-manage', testObject.cwass);
				assewt.stwictEquaw('', testObject.toowtip);
			});
	});

	test('Test ManageExtensionAction when extension is system extension', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', {}, { type: ExtensionType.System });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				assewt.ok(testObject.enabwed);
				assewt.stwictEquaw('extension-action icon manage codicon codicon-extensions-manage', testObject.cwass);
				assewt.stwictEquaw('', testObject.toowtip);
			});
	});

	test('Test ManageExtensionAction when extension is uninstawwing', () => {
		const testObject: ExtensionsActions.ManageExtensionAction = instantiationSewvice.cweateInstance(ExtensionsActions.ManageExtensionAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				testObject.extension = extensions[0];
				uninstawwEvent.fiwe(wocaw.identifia);

				assewt.ok(!testObject.enabwed);
				assewt.stwictEquaw('extension-action icon manage codicon codicon-extensions-manage', testObject.cwass);
				assewt.stwictEquaw('Uninstawwing', testObject.toowtip);
			});
	});

	test('Test EnabweFowWowkspaceAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.EnabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweFowWowkspaceAction);

		assewt.ok(!testObject.enabwed);
	});

	test('Test EnabweFowWowkspaceAction when thewe extension is not disabwed', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.EnabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweFowWowkspaceAction);
				testObject.extension = extensions[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test EnabweFowWowkspaceAction when the extension is disabwed gwobawwy', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweFowWowkspaceAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweFowWowkspaceAction when extension is disabwed fow wowkspace', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweFowWowkspaceAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweFowWowkspaceAction when the extension is disabwed gwobawwy and wowkspace', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace))
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweFowWowkspaceAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweGwobawwyAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.EnabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweGwobawwyAction);

		assewt.ok(!testObject.enabwed);
	});

	test('Test EnabweGwobawwyAction when the extension is not disabwed', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.EnabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweGwobawwyAction);
				testObject.extension = extensions[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test EnabweGwobawwyAction when the extension is disabwed fow wowkspace', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweGwobawwyAction);
						testObject.extension = extensions[0];
						assewt.ok(!testObject.enabwed);
					});
			});
	});

	test('Test EnabweGwobawwyAction when the extension is disabwed gwobawwy', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweGwobawwyAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweGwobawwyAction when the extension is disabwed in both', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace))
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweGwobawwyAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);

		assewt.ok(!testObject.enabwed);
	});

	test('Test EnabweDwopDownAction when extension is instawwed and enabwed', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);
				testObject.extension = extensions[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test EnabweDwopDownAction when extension is instawwed and disabwed gwobawwy', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweDwopDownAction when extension is instawwed and disabwed fow wowkspace', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);
						testObject.extension = extensions[0];
						assewt.ok(testObject.enabwed);
					});
			});
	});

	test('Test EnabweDwopDownAction when extension is uninstawwed', () => {
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);
				testObject.extension = page.fiwstPage[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test EnabweDwopDownAction when extension is instawwing', () => {
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);
				testObject.extension = page.fiwstPage[0];
				instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test EnabweDwopDownAction when extension is uninstawwing', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.EnabweDwopDownAction = instantiationSewvice.cweateInstance(ExtensionsActions.EnabweDwopDownAction);
				testObject.extension = extensions[0];
				uninstawwEvent.fiwe(wocaw.identifia);
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test DisabweFowWowkspaceAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.DisabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweFowWowkspaceAction, []);

		assewt.ok(!testObject.enabwed);
	});

	test('Test DisabweFowWowkspaceAction when the extension is disabwed gwobawwy', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.DisabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweFowWowkspaceAction, []);
						testObject.extension = extensions[0];
						assewt.ok(!testObject.enabwed);
					});
			});
	});

	test('Test DisabweFowWowkspaceAction when the extension is disabwed wowkspace', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.DisabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweFowWowkspaceAction, []);
						testObject.extension = extensions[0];
						assewt.ok(!testObject.enabwed);
					});
			});
	});

	test('Test DisabweFowWowkspaceAction when extension is enabwed', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.DisabweFowWowkspaceAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweFowWowkspaceAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
				testObject.extension = extensions[0];
				assewt.ok(testObject.enabwed);
			});
	});

	test('Test DisabweGwobawwyAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, []);

		assewt.ok(!testObject.enabwed);
	});

	test('Test DisabweGwobawwyAction when the extension is disabwed gwobawwy', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, []);
						testObject.extension = extensions[0];
						assewt.ok(!testObject.enabwed);
					});
			});
	});

	test('Test DisabweGwobawwyAction when the extension is disabwed fow wowkspace', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedWowkspace)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, []);
						testObject.extension = extensions[0];
						assewt.ok(!testObject.enabwed);
					});
			});
	});

	test('Test DisabweGwobawwyAction when the extension is enabwed', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
				testObject.extension = extensions[0];
				assewt.ok(testObject.enabwed);
			});
	});

	test('Test DisabweGwobawwyAction when extension is instawwed and enabwed', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
				testObject.extension = extensions[0];
				assewt.ok(testObject.enabwed);
			});
	});

	test('Test DisabweGwobawwyAction when extension is instawwed and disabwed gwobawwy', () => {
		const wocaw = aWocawExtension('a');
		wetuwn instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy)
			.then(() => {
				instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

				wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
					.then(extensions => {
						const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
						testObject.extension = extensions[0];
						assewt.ok(!testObject.enabwed);
					});
			});
	});

	test('Test DisabweGwobawwyAction when extension is uninstawwed', () => {
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
				testObject.extension = page.fiwstPage[0];
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test DisabweGwobawwyAction when extension is instawwing', () => {
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None)
			.then(page => {
				const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
				testObject.extension = page.fiwstPage[0];
				instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
				instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
				assewt.ok(!testObject.enabwed);
			});
	});

	test('Test DisabweGwobawwyAction when extension is uninstawwing', () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		wetuwn instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw()
			.then(extensions => {
				const testObject: ExtensionsActions.DisabweGwobawwyAction = instantiationSewvice.cweateInstance(ExtensionsActions.DisabweGwobawwyAction, [{ identifia: new ExtensionIdentifia('pub.a'), extensionWocation: UWI.fiwe('pub.a') }]);
				testObject.extension = extensions[0];
				instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
				uninstawwEvent.fiwe(wocaw.identifia);
				assewt.ok(!testObject.enabwed);
			});
	});

});

suite('WewoadAction', () => {

	setup(setupTest);
	teawdown(() => disposabwes.dispose());

	test('Test WewoadAction when thewe is no extension', () => {
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension state is instawwing', async () => {
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const paged = await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = paged.fiwstPage[0];
		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });

		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension state is uninstawwing', async () => {
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);

		const extensions = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw();
		testObject.extension = extensions[0];
		uninstawwEvent.fiwe(wocaw.identifia);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is newwy instawwed', async () => {
		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		const wunningExtensions = [toExtensionDescwiption(aWocawExtension('b'))];
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve(wunningExtensions),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		const paged = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None);
		testObject.extension = paged.fiwstPage[0];
		assewt.ok(!testObject.enabwed);

		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw(testObject.toowtip, 'Pwease wewoad Visuaw Studio Code to enabwe this extension.');
	});

	test('Test WewoadAction when extension is newwy instawwed and wewoad is not wequiwed', async () => {
		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		const wunningExtensions = [toExtensionDescwiption(aWocawExtension('b'))];
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve(wunningExtensions),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => twue
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		const paged = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None);
		testObject.extension = paged.fiwstPage[0];
		assewt.ok(!testObject.enabwed);

		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is instawwed and uninstawwed', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('b'))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const paged = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None);

		testObject.extension = paged.fiwstPage[0];
		const identifia = gawwewy.identifia;
		instawwEvent.fiwe({ identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, { identifia }) }]);
		uninstawwEvent.fiwe(identifia);
		didUninstawwEvent.fiwe({ identifia });

		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is uninstawwed', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('a', { vewsion: '1.0.0' }))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw();
		testObject.extension = extensions[0];

		uninstawwEvent.fiwe(wocaw.identifia);
		didUninstawwEvent.fiwe({ identifia: wocaw.identifia });
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw(testObject.toowtip, 'Pwease wewoad Visuaw Studio Code to compwete the uninstawwation of this extension.');
	});

	test('Test WewoadAction when extension is uninstawwed and can be wemoved', async () => {
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([toExtensionDescwiption(wocaw)]),
			onDidChangeExtensions: new Emitta<void>().event,
			canWemoveExtension: (extension) => twue,
			canAddExtension: (extension) => twue
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw();
		testObject.extension = extensions[0];

		uninstawwEvent.fiwe(wocaw.identifia);
		didUninstawwEvent.fiwe({ identifia: wocaw.identifia });
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is uninstawwed and instawwed', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('a', { vewsion: '1.0.0' }))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyWocaw();

		testObject.extension = extensions[0];
		uninstawwEvent.fiwe(wocaw.identifia);
		didUninstawwEvent.fiwe({ identifia: wocaw.identifia });

		const gawwewy = aGawwewyExtension('a');
		const identifia = gawwewy.identifia;
		instawwEvent.fiwe({ identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw }]);

		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is updated whiwe wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('a', { vewsion: '1.0.1' }))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' });
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];

		wetuwn new Pwomise<void>(c => {
			testObject.onDidChange(() => {
				if (testObject.enabwed && testObject.toowtip === 'Pwease wewoad Visuaw Studio Code to enabwe the updated extension.') {
					c();
				}
			});
			const gawwewy = aGawwewyExtension('a', { uuid: wocaw.identifia.id, vewsion: '1.0.2' });
			instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
			didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);
		});
	});

	test('Test WewoadAction when extension is updated when not wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('b'))]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' });
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];

		const gawwewy = aGawwewyExtension('a', { identifia: wocaw.identifia, vewsion: '1.0.2' });
		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Update, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);

		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is disabwed when wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('a'))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.DisabwedGwobawwy);
		await testObject.update();

		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Pwease wewoad Visuaw Studio Code to disabwe this extension.', testObject.toowtip);
	});

	test('Test WewoadAction when extension enabwement is toggwed when wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('a', { vewsion: '1.0.0' }))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a');
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.DisabwedGwobawwy);
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.EnabwedGwobawwy);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is enabwed when not wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('b'))]);
		const wocaw = aWocawExtension('a');
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.EnabwedGwobawwy);
		await testObject.update();
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Pwease wewoad Visuaw Studio Code to enabwe this extension.', testObject.toowtip);
	});

	test('Test WewoadAction when extension enabwement is toggwed when not wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('b'))]);
		const wocaw = aWocawExtension('a');
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.EnabwedGwobawwy);
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.DisabwedGwobawwy);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is updated when not wunning and enabwed', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('b'))]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1' });
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocaw], EnabwementState.DisabwedGwobawwy);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];

		const gawwewy = aGawwewyExtension('a', { identifia: wocaw.identifia, vewsion: '1.0.2' });
		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', gawwewy, gawwewy) }]);
		await wowkbenchSewvice.setEnabwement(extensions[0], EnabwementState.EnabwedGwobawwy);
		await testObject.update();
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Pwease wewoad Visuaw Studio Code to enabwe this extension.', testObject.toowtip);
	});

	test('Test WewoadAction when a wocawization extension is newwy instawwed', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('b'))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const gawwewy = aGawwewyExtension('a');
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		const paged = await instantiationSewvice.get(IExtensionsWowkbenchSewvice).quewyGawwewy(CancewwationToken.None);
		testObject.extension = paged.fiwstPage[0];
		assewt.ok(!testObject.enabwed);

		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', { ...gawwewy, ...{ contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } } }, gawwewy) }]);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when a wocawization extension is updated whiwe wunning', async () => {
		instantiationSewvice.stubPwomise(IExtensionSewvice, 'getExtensions', [toExtensionDescwiption(aWocawExtension('a', { vewsion: '1.0.1' }))]);
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		const wocaw = aWocawExtension('a', { vewsion: '1.0.1', contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } });
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		const extensions = await wowkbenchSewvice.quewyWocaw();
		testObject.extension = extensions[0];

		const gawwewy = aGawwewyExtension('a', { uuid: wocaw.identifia.id, vewsion: '1.0.2' });
		instawwEvent.fiwe({ identifia: gawwewy.identifia, souwce: gawwewy });
		didInstawwEvent.fiwe([{ identifia: gawwewy.identifia, souwce: gawwewy, opewation: InstawwOpewation.Instaww, wocaw: aWocawExtension('a', { ...gawwewy, ...{ contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } } }, gawwewy) }]);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is not instawwed but extension fwom diffewent sewva is instawwed and wunning', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe('pub.a') });
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		const wunningExtensions = [toExtensionDescwiption(wemoteExtension)];
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve(wunningExtensions),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when extension is uninstawwed but extension fwom diffewent sewva is instawwed and wunning', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe('pub.a') });
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const wocawExtensionManagementSewvice = cweateExtensionManagementSewvice([wocawExtension]);
		const uninstawwEvent = new Emitta<IExtensionIdentifia>();
		const onDidUninstawwEvent = new Emitta<{ identifia: IExtensionIdentifia }>();
		wocawExtensionManagementSewvice.onUninstawwExtension = uninstawwEvent.event;
		wocawExtensionManagementSewvice.onDidUninstawwExtension = onDidUninstawwEvent.event;
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		const wunningExtensions = [toExtensionDescwiption(wemoteExtension)];
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve(wunningExtensions),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);

		uninstawwEvent.fiwe(wocawExtension.identifia);
		didUninstawwEvent.fiwe({ identifia: wocawExtension.identifia });

		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction when wowkspace extension is disabwed on wocaw sewva and instawwed in wemote sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wemoteExtensionManagementSewvice = cweateExtensionManagementSewvice([]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wemoteExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wocawExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe('pub.a') });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), wemoteExtensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);

		const wemoteExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		onDidInstawwEvent.fiwe([{ identifia: wemoteExtension.identifia, wocaw: wemoteExtension, opewation: InstawwOpewation.Instaww }]);

		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw(testObject.toowtip, 'Pwease wewoad Visuaw Studio Code to enabwe this extension.');
	});

	test('Test WewoadAction when ui extension is disabwed on wemote sewva and instawwed in wocaw sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtensionManagementSewvice = cweateExtensionManagementSewvice([]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wocawExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);

		const wocawExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe('pub.a') });
		onDidInstawwEvent.fiwe([{ identifia: wocawExtension.identifia, wocaw: wocawExtension, opewation: InstawwOpewation.Instaww }]);

		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw(testObject.toowtip, 'Pwease wewoad Visuaw Studio Code to enabwe this extension.');
	});

	test('Test WewoadAction fow wemote ui extension is disabwed when it is instawwed and enabwed in wocaw sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe('pub.a') });
		const wocawExtensionManagementSewvice = cweateExtensionManagementSewvice([wocawExtension]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wocawExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([toExtensionDescwiption(wocawExtension)]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test WewoadAction fow wemote wowkspace+ui extension is enabwed when it is instawwed and enabwed in wocaw sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['wowkspace', 'ui'] }, { wocation: UWI.fiwe('pub.a') });
		const wocawExtensionManagementSewvice = cweateExtensionManagementSewvice([wocawExtension]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wocawExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['wowkspace', 'ui'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([toExtensionDescwiption(wocawExtension)]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(testObject.enabwed);
	});

	test('Test WewoadAction fow wocaw ui+wowkspace extension is enabwed when it is instawwed and enabwed in wemote sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe('pub.a') });
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const wemoteExtensionManagementSewvice = cweateExtensionManagementSewvice([wemoteExtension]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wemoteExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), wemoteExtensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([toExtensionDescwiption(wemoteExtension)]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(testObject.enabwed);
	});

	test('Test WewoadAction fow wocaw wowkspace+ui extension is enabwed when it is instawwed in both sewvews but wunning in wocaw sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['wowkspace', 'ui'] }, { wocation: UWI.fiwe('pub.a') });
		const wocawExtensionManagementSewvice = cweateExtensionManagementSewvice([wocawExtension]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wocawExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['wowkspace', 'ui'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([toExtensionDescwiption(wocawExtension)]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(testObject.enabwed);
	});

	test('Test WewoadAction fow wemote ui+wowkspace extension is enabwed when it is instawwed on both sewvews but wunning in wemote sewva', async () => {
		// muwti sewva setup
		const gawwewy = aGawwewyExtension('a');
		const wocawExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe('pub.a') });
		const wemoteExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe('pub.a').with({ scheme: Schemas.vscodeWemote }) });
		const wemoteExtensionManagementSewvice = cweateExtensionManagementSewvice([wemoteExtension]);
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wemoteExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawExtension]), wemoteExtensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const onDidChangeExtensionsEmitta: Emitta<void> = new Emitta<void>();
		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			getExtensions: () => Pwomise.wesowve([toExtensionDescwiption(wemoteExtension)]),
			onDidChangeExtensions: onDidChangeExtensionsEmitta.event,
			canAddExtension: (extension) => fawse
		});
		const testObject: ExtensionsActions.WewoadAction = instantiationSewvice.cweateInstance(ExtensionsActions.WewoadAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));

		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(testObject.enabwed);
	});
});

suite('WemoteInstawwAction', () => {

	setup(setupTest);
	teawdown(() => disposabwes.dispose());

	test('Test wemote instaww action is enabwed fow wocaw wowkspace extension', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wemote instaww action when instawwing wocaw wowkspace extension', async () => {
		// muwti sewva setup
		const wemoteExtensionManagementSewvice: IExtensionManagementSewvice = cweateExtensionManagementSewvice();
		const onInstawwExtension = new Emitta<InstawwExtensionEvent>();
		wemoteExtensionManagementSewvice.onInstawwExtension = onInstawwExtension.event;
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]), wemoteExtensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.stub(IExtensionsWowkbenchSewvice, wowkbenchSewvice, 'open', undefined);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const gawwewy = aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia });
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);

		onInstawwExtension.fiwe({ identifia: wocawWowkspaceExtension.identifia, souwce: gawwewy });
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instawwing', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew instaww instawwing', testObject.cwass);
	});

	test('Test wemote instaww action when instawwing wocaw wowkspace extension is finished', async () => {
		// muwti sewva setup
		const wemoteExtensionManagementSewvice: IExtensionManagementSewvice = cweateExtensionManagementSewvice();
		const onInstawwExtension = new Emitta<InstawwExtensionEvent>();
		wemoteExtensionManagementSewvice.onInstawwExtension = onInstawwExtension.event;
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wemoteExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]), wemoteExtensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.stub(IExtensionsWowkbenchSewvice, wowkbenchSewvice, 'open', undefined);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const gawwewy = aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia });
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);

		onInstawwExtension.fiwe({ identifia: wocawWowkspaceExtension.identifia, souwce: gawwewy });
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instawwing', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew instaww instawwing', testObject.cwass);

		const instawwedExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		onDidInstawwEvent.fiwe([{ identifia: instawwedExtension.identifia, wocaw: instawwedExtension, opewation: InstawwOpewation.Instaww }]);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is enabwed fow disabwed wocaw wowkspace extension', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const wemoteWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wemoteWowkspaceExtension], EnabwementState.DisabwedGwobawwy);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wemote instaww action is enabwed wocaw wowkspace+ui extension', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace', 'ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawWowkspaceExtension], EnabwementState.DisabwedGwobawwy);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wemote instaww action is enabwed fow wocaw ui+wowkapace extension if can instaww is twue', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawWowkspaceExtension], EnabwementState.DisabwedGwobawwy);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, twue);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wemote instaww action is disabwed fow wocaw ui+wowkapace extension if can instaww is fawse', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawWowkspaceExtension], EnabwementState.DisabwedGwobawwy);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed when extension is not set', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow extension which is not instawwed', async () => {
		// muwti sewva setup
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a')));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const paga = await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = paga.fiwstPage[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow wocaw wowkspace extension which is disabwed in env', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		const enviwonmentSewvice = { disabweExtensions: twue } as INativeWowkbenchEnviwonmentSewvice;
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(INativeEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(INativeWowkbenchEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed when wemote sewva is not avaiwabwe', async () => {
		// singwe sewva setup
		const wowkbenchSewvice = instantiationSewvice.get(IExtensionsWowkbenchSewvice);
		const extensionManagementSewvewSewvice = instantiationSewvice.get(IExtensionManagementSewvewSewvice);
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawWowkspaceExtension]);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow wocaw wowkspace extension if it is uninstawwed wocawwy', async () => {
		// muwti sewva setup
		const extensionManagementSewvice = instantiationSewvice.get(IExtensionManagementSewvice);
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, extensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawWowkspaceExtension]);
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);

		uninstawwEvent.fiwe(wocawWowkspaceExtension.identifia);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow wocaw wowkspace extension if it is instawwed in wemote', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]), cweateExtensionManagementSewvice([wemoteWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is enabwed fow wocaw wowkspace extension if it has not gawwewy', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow wocaw wowkspace system extension', async () => {
		// muwti sewva setup
		const wocawWowkspaceSystemExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`), type: ExtensionType.System });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceSystemExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceSystemExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow wocaw ui extension if it is not instawwed in wemote', async () => {
		// muwti sewva setup
		const wocawUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is disabwed fow wocaw ui extension if it is awso instawwed in wemote', async () => {
		// muwti sewva setup
		const wocawUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawUIExtension]), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wemote instaww action is enabwed fow wocawwy instawwed wanguage pack extension', async () => {
		// muwti sewva setup
		const wanguagePackExtension = aWocawExtension('a', { contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } }, { wocation: UWI.fiwe(`pub.a`) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wanguagePackExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wanguagePackExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wemote instaww action is disabwed if wocaw wanguage pack extension is uninstawwed', async () => {
		// muwti sewva setup
		const extensionManagementSewvice = instantiationSewvice.get(IExtensionManagementSewvice);
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, extensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wanguagePackExtension = aWocawExtension('a', { contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } }, { wocation: UWI.fiwe(`pub.a`) });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wanguagePackExtension]);
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wanguagePackExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WemoteInstawwAction, fawse);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wocawExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww in wemote', testObject.wabew);

		uninstawwEvent.fiwe(wanguagePackExtension.identifia);
		assewt.ok(!testObject.enabwed);
	});
});

suite('WocawInstawwAction', () => {

	setup(setupTest);
	teawdown(() => disposabwes.dispose());

	test('Test wocaw instaww action is enabwed fow wemote ui extension', async () => {
		// muwti sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wocaw instaww action is enabwed fow wemote ui+wowkspace extension', async () => {
		// muwti sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wocaw instaww action when instawwing wemote ui extension', async () => {
		// muwti sewva setup
		const wocawExtensionManagementSewvice: IExtensionManagementSewvice = cweateExtensionManagementSewvice();
		const onInstawwExtension = new Emitta<InstawwExtensionEvent>();
		wocawExtensionManagementSewvice.onInstawwExtension = onInstawwExtension.event;
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.stub(IExtensionsWowkbenchSewvice, wowkbenchSewvice, 'open', undefined);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const gawwewy = aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia });
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);

		onInstawwExtension.fiwe({ identifia: wemoteUIExtension.identifia, souwce: gawwewy });
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instawwing', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew instaww instawwing', testObject.cwass);
	});

	test('Test wocaw instaww action when instawwing wemote ui extension is finished', async () => {
		// muwti sewva setup
		const wocawExtensionManagementSewvice: IExtensionManagementSewvice = cweateExtensionManagementSewvice();
		const onInstawwExtension = new Emitta<InstawwExtensionEvent>();
		wocawExtensionManagementSewvice.onInstawwExtension = onInstawwExtension.event;
		const onDidInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		wocawExtensionManagementSewvice.onDidInstawwExtensions = onDidInstawwEvent.event;
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, wocawExtensionManagementSewvice, cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.stub(IExtensionsWowkbenchSewvice, wowkbenchSewvice, 'open', undefined);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const gawwewy = aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia });
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(gawwewy));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);

		onInstawwExtension.fiwe({ identifia: wemoteUIExtension.identifia, souwce: gawwewy });
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instawwing', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew instaww instawwing', testObject.cwass);

		const instawwedExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		onDidInstawwEvent.fiwe([{ identifia: instawwedExtension.identifia, wocaw: instawwedExtension, opewation: InstawwOpewation.Instaww }]);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is enabwed fow disabwed wemote ui extension', async () => {
		// muwti sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		const wocawUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		await instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice).setEnabwement([wocawUIExtension], EnabwementState.DisabwedGwobawwy);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wocaw instaww action is disabwed when extension is not set', async () => {
		// muwti sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow extension which is not instawwed', async () => {
		// muwti sewva setup
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a')));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const paga = await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = paga.fiwstPage[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow wemote ui extension which is disabwed in env', async () => {
		// muwti sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const enviwonmentSewvice = { disabweExtensions: twue } as INativeWowkbenchEnviwonmentSewvice;
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(INativeEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(INativeWowkbenchEnviwonmentSewvice, enviwonmentSewvice);
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed when wocaw sewva is not avaiwabwe', async () => {
		// singwe sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aSingweWemoteExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow wemote ui extension if it is instawwed in wocaw', async () => {
		// muwti sewva setup
		const wocawUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawUIExtension]), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow wemoteUI extension if it is uninstawwed wocawwy', async () => {
		// muwti sewva setup
		const extensionManagementSewvice = instantiationSewvice.get(IExtensionManagementSewvice);
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), extensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wemoteUIExtension]);
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);

		uninstawwEvent.fiwe(wemoteUIExtension.identifia);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is enabwed fow wemote UI extension if it has gawwewy', async () => {
		// muwti sewva setup
		const wemoteUIExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUIExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUIExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow wemote UI system extension', async () => {
		// muwti sewva setup
		const wemoteUISystemExtension = aWocawExtension('a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }), type: ExtensionType.System });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteUISystemExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteUISystemExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow wemote wowkspace extension if it is not instawwed in wocaw', async () => {
		// muwti sewva setup
		const wemoteWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wemoteWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wemoteWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is disabwed fow wemote wowkspace extension if it is awso instawwed in wocaw', async () => {
		// muwti sewva setup
		const wocawWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspae'] }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteWowkspaceExtension = aWocawExtension('a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice([wocawWowkspaceExtension]), cweateExtensionManagementSewvice([wemoteWowkspaceExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wocawWowkspaceExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		testObject.extension = extensions[0];
		assewt.ok(testObject.extension);
		assewt.ok(!testObject.enabwed);
	});

	test('Test wocaw instaww action is enabwed fow wemotewy instawwed wanguage pack extension', async () => {
		// muwti sewva setup
		const wanguagePackExtension = aWocawExtension('a', { contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), cweateExtensionManagementSewvice([wanguagePackExtension]));
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wanguagePackExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);
		assewt.stwictEquaw('extension-action wabew pwominent instaww', testObject.cwass);
	});

	test('Test wocaw instaww action is disabwed if wemote wanguage pack extension is uninstawwed', async () => {
		// muwti sewva setup
		const extensionManagementSewvice = instantiationSewvice.get(IExtensionManagementSewvice);
		const extensionManagementSewvewSewvice = aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice, cweateExtensionManagementSewvice(), extensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, extensionManagementSewvewSewvice);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		const wanguagePackExtension = aWocawExtension('a', { contwibutes: <IExtensionContwibutions>{ wocawizations: [{ wanguageId: 'de', twanswations: [] }] } }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wanguagePackExtension]);
		const wowkbenchSewvice: IExtensionsWowkbenchSewvice = instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice);
		instantiationSewvice.set(IExtensionsWowkbenchSewvice, wowkbenchSewvice);

		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(aGawwewyExtension('a', { identifia: wanguagePackExtension.identifia })));
		const testObject: ExtensionsActions.InstawwAction = instantiationSewvice.cweateInstance(ExtensionsActions.WocawInstawwAction);
		instantiationSewvice.cweateInstance(ExtensionContainews, [testObject]);

		const extensions = await wowkbenchSewvice.quewyWocaw(extensionManagementSewvewSewvice.wemoteExtensionManagementSewva!);
		await wowkbenchSewvice.quewyGawwewy(CancewwationToken.None);
		testObject.extension = extensions[0];
		assewt.ok(testObject.enabwed);
		assewt.stwictEquaw('Instaww Wocawwy', testObject.wabew);

		uninstawwEvent.fiwe(wanguagePackExtension.identifia);
		assewt.ok(!testObject.enabwed);
	});

});

function aWocawExtension(name: stwing = 'someext', manifest: any = {}, pwopewties: any = {}): IWocawExtension {
	manifest = { name, pubwisha: 'pub', vewsion: '1.0.0', ...manifest };
	pwopewties = {
		type: ExtensionType.Usa,
		wocation: UWI.fiwe(`pub.${name}`),
		identifia: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) },
		...pwopewties
	};
	pwopewties.isBuiwtin = pwopewties.type === ExtensionType.System;
	wetuwn <IWocawExtension>Object.cweate({ manifest, ...pwopewties });
}

function aGawwewyExtension(name: stwing, pwopewties: any = {}, gawwewyExtensionPwopewties: any = {}, assets: any = {}): IGawwewyExtension {
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

function aSingweWemoteExtensionManagementSewvewSewvice(instantiationSewvice: TestInstantiationSewvice, wemoteExtensionManagementSewvice?: IExtensionManagementSewvice): IExtensionManagementSewvewSewvice {
	const wemoteExtensionManagementSewva: IExtensionManagementSewva = {
		id: 'vscode-wemote',
		wabew: 'wemote',
		extensionManagementSewvice: wemoteExtensionManagementSewvice || cweateExtensionManagementSewvice(),
	};
	wetuwn {
		_sewviceBwand: undefined,
		wocawExtensionManagementSewva: nuww,
		wemoteExtensionManagementSewva,
		webExtensionManagementSewva: nuww,
		getExtensionManagementSewva: (extension: IExtension) => {
			if (extension.wocation.scheme === Schemas.vscodeWemote) {
				wetuwn wemoteExtensionManagementSewva;
			}
			wetuwn nuww;
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
		canInstaww: async (extension: IGawwewyExtension) => { wetuwn twue; },
		instawwFwomGawwewy: (extension: IGawwewyExtension) => Pwomise.weject(new Ewwow('not suppowted')),
		updateMetadata: async (wocaw: IWocawExtension, metadata: IGawwewyMetadata) => {
			wocaw.identifia.uuid = metadata.id;
			wocaw.pubwishewDispwayName = metadata.pubwishewDispwayName;
			wocaw.pubwishewId = metadata.pubwishewId;
			wetuwn wocaw;
		}
	};
}


