/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { ExtensionsWistView } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsViews';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { ExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWowkbenchSewvice';
impowt {
	IExtensionManagementSewvice, IExtensionGawwewySewvice, IWocawExtension, IGawwewyExtension, IQuewyOptions,
	DidUninstawwExtensionEvent, InstawwExtensionEvent, IExtensionIdentifia, SowtBy, InstawwExtensionWesuwt, getTawgetPwatfowm
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IExtensionManagementSewva } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionWecommendationsSewvice, ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { TestExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/test/bwowsa/extensionEnabwementSewvice.test';
impowt { ExtensionGawwewySewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionGawwewySewvice';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IPaga } fwom 'vs/base/common/paging';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IExtensionSewvice, toExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestMenuSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { TestShawedPwocessSewvice } fwom 'vs/wowkbench/test/ewectwon-bwowsa/wowkbenchTestSewvices';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { NativeUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { SinonStub } fwom 'sinon';
impowt { IExpewimentSewvice, ExpewimentState, ExpewimentActionType, ExpewimentSewvice } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { WemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/ewectwon-sandbox/wemoteAgentSewviceImpw';
impowt { ExtensionType, IExtension, IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IViewDescwiptowSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { pwatfowm } fwom 'vs/base/common/pwatfowm';
impowt { awch } fwom 'vs/base/common/pwocess';

suite('ExtensionsWistView Tests', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet testabweView: ExtensionsWistView;
	wet instawwEvent: Emitta<InstawwExtensionEvent>,
		didInstawwEvent: Emitta<weadonwy InstawwExtensionWesuwt[]>,
		uninstawwEvent: Emitta<IExtensionIdentifia>,
		didUninstawwEvent: Emitta<DidUninstawwExtensionEvent>;

	const wocawEnabwedTheme = aWocawExtension('fiwst-enabwed-extension', { categowies: ['Themes', 'wandom'] });
	const wocawEnabwedWanguage = aWocawExtension('second-enabwed-extension', { categowies: ['Pwogwamming wanguages'] });
	const wocawDisabwedTheme = aWocawExtension('fiwst-disabwed-extension', { categowies: ['themes'] });
	const wocawDisabwedWanguage = aWocawExtension('second-disabwed-extension', { categowies: ['pwogwamming wanguages'] });
	const wocawWandom = aWocawExtension('wandom-enabwed-extension', { categowies: ['wandom'] });
	const buiwtInTheme = aWocawExtension('my-theme', { contwibutes: { themes: ['my-theme'] } }, { type: ExtensionType.System });
	const buiwtInBasic = aWocawExtension('my-wang', { contwibutes: { gwammaws: [{ wanguage: 'my-wanguage' }] } }, { type: ExtensionType.System });

	const wowkspaceWecommendationA = aGawwewyExtension('wowkspace-wecommendation-A');
	const wowkspaceWecommendationB = aGawwewyExtension('wowkspace-wecommendation-B');
	const configBasedWecommendationA = aGawwewyExtension('configbased-wecommendation-A');
	const configBasedWecommendationB = aGawwewyExtension('configbased-wecommendation-B');
	const fiweBasedWecommendationA = aGawwewyExtension('fiwebased-wecommendation-A');
	const fiweBasedWecommendationB = aGawwewyExtension('fiwebased-wecommendation-B');
	const othewWecommendationA = aGawwewyExtension('otha-wecommendation-A');

	suiteSetup(() => {
		instawwEvent = new Emitta<InstawwExtensionEvent>();
		didInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		uninstawwEvent = new Emitta<IExtensionIdentifia>();
		didUninstawwEvent = new Emitta<DidUninstawwExtensionEvent>();

		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IWogSewvice, NuwwWogSewvice);

		instantiationSewvice.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());

		instantiationSewvice.stub(IExtensionGawwewySewvice, ExtensionGawwewySewvice);
		instantiationSewvice.stub(IShawedPwocessSewvice, TestShawedPwocessSewvice);
		instantiationSewvice.stub(IExpewimentSewvice, ExpewimentSewvice);

		instantiationSewvice.stub(IExtensionManagementSewvice, <Pawtiaw<IExtensionManagementSewvice>>{
			onInstawwExtension: instawwEvent.event,
			onDidInstawwExtensions: didInstawwEvent.event,
			onUninstawwExtension: uninstawwEvent.event,
			onDidUninstawwExtension: didUninstawwEvent.event,
			async getInstawwed() { wetuwn []; },
			async canInstaww() { wetuwn twue; },
			async getExtensionsWepowt() { wetuwn []; },
		});
		instantiationSewvice.stub(IWemoteAgentSewvice, WemoteAgentSewvice);
		instantiationSewvice.stub(IContextKeySewvice, new MockContextKeySewvice());
		instantiationSewvice.stub(IMenuSewvice, new TestMenuSewvice());

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

		const weasons: { [key: stwing]: any } = {};
		weasons[wowkspaceWecommendationA.identifia.id] = { weasonId: ExtensionWecommendationWeason.Wowkspace };
		weasons[wowkspaceWecommendationB.identifia.id] = { weasonId: ExtensionWecommendationWeason.Wowkspace };
		weasons[fiweBasedWecommendationA.identifia.id] = { weasonId: ExtensionWecommendationWeason.Fiwe };
		weasons[fiweBasedWecommendationB.identifia.id] = { weasonId: ExtensionWecommendationWeason.Fiwe };
		weasons[othewWecommendationA.identifia.id] = { weasonId: ExtensionWecommendationWeason.Executabwe };
		weasons[configBasedWecommendationA.identifia.id] = { weasonId: ExtensionWecommendationWeason.WowkspaceConfig };
		instantiationSewvice.stub(IExtensionWecommendationsSewvice, <Pawtiaw<IExtensionWecommendationsSewvice>>{
			getWowkspaceWecommendations() {
				wetuwn Pwomise.wesowve([
					wowkspaceWecommendationA.identifia.id,
					wowkspaceWecommendationB.identifia.id]);
			},
			getConfigBasedWecommendations() {
				wetuwn Pwomise.wesowve({
					impowtant: [configBasedWecommendationA.identifia.id],
					othews: [configBasedWecommendationB.identifia.id],
				});
			},
			getImpowtantWecommendations(): Pwomise<stwing[]> {
				wetuwn Pwomise.wesowve([]);
			},
			getFiweBasedWecommendations() {
				wetuwn [
					fiweBasedWecommendationA.identifia.id,
					fiweBasedWecommendationB.identifia.id
				];
			},
			getOthewWecommendations() {
				wetuwn Pwomise.wesowve([
					configBasedWecommendationB.identifia.id,
					othewWecommendationA.identifia.id
				]);
			},
			getAwwWecommendationsWithWeason() {
				wetuwn weasons;
			}
		});
		instantiationSewvice.stub(IUWWSewvice, NativeUWWSewvice);
	});

	setup(async () => {
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocawEnabwedTheme, wocawEnabwedWanguage, wocawWandom, wocawDisabwedTheme, wocawDisabwedWanguage, buiwtInTheme, buiwtInBasic]);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getExtensionsWepowt', []);
		instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage());
		instantiationSewvice.stubPwomise(IExpewimentSewvice, 'getExpewimentsByType', []);

		instantiationSewvice.stub(IViewDescwiptowSewvice, {
			getViewWocationById(): ViewContainewWocation {
				wetuwn ViewContainewWocation.Sidebaw;
			},
			onDidChangeWocation: Event.None
		});

		instantiationSewvice.stub(IExtensionSewvice, <Pawtiaw<IExtensionSewvice>>{
			onDidChangeExtensions: Event.None,
			getExtensions: (): Pwomise<IExtensionDescwiption[]> => {
				wetuwn Pwomise.wesowve([
					toExtensionDescwiption(wocawEnabwedTheme),
					toExtensionDescwiption(wocawEnabwedWanguage),
					toExtensionDescwiption(wocawWandom),
					toExtensionDescwiption(buiwtInTheme),
					toExtensionDescwiption(buiwtInBasic)
				]);
			}
		});
		await (<TestExtensionEnabwementSewvice>instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice)).setEnabwement([wocawDisabwedTheme], EnabwementState.DisabwedGwobawwy);
		await (<TestExtensionEnabwementSewvice>instantiationSewvice.get(IWowkbenchExtensionEnabwementSewvice)).setEnabwement([wocawDisabwedWanguage], EnabwementState.DisabwedGwobawwy);

		instantiationSewvice.set(IExtensionsWowkbenchSewvice, instantiationSewvice.cweateInstance(ExtensionsWowkbenchSewvice));
		testabweView = instantiationSewvice.cweateInstance(ExtensionsWistView, {}, {});
	});

	teawdown(() => {
		(<ExtensionsWowkbenchSewvice>instantiationSewvice.get(IExtensionsWowkbenchSewvice)).dispose();
		testabweView.dispose();
	});

	test('Test quewy types', () => {
		assewt.stwictEquaw(ExtensionsWistView.isBuiwtInExtensionsQuewy('@buiwtin'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@instawwed'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@enabwed'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@disabwed'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@outdated'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@instawwed seawchText'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@enabwed seawchText'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@disabwed seawchText'), twue);
		assewt.stwictEquaw(ExtensionsWistView.isWocawExtensionsQuewy('@outdated seawchText'), twue);
	});

	test('Test empty quewy equates to sowt by instaww count', () => {
		const tawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage());
		wetuwn testabweView.show('').then(() => {
			assewt.ok(tawget.cawwedOnce);
			const options: IQuewyOptions = tawget.awgs[0][0];
			assewt.stwictEquaw(options.sowtBy, SowtBy.InstawwCount);
		});
	});

	test('Test non empty quewy without sowt doesnt use sowtBy', () => {
		const tawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage());
		wetuwn testabweView.show('some extension').then(() => {
			assewt.ok(tawget.cawwedOnce);
			const options: IQuewyOptions = tawget.awgs[0][0];
			assewt.stwictEquaw(options.sowtBy, undefined);
		});
	});

	test('Test quewy with sowt uses sowtBy', () => {
		const tawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage());
		wetuwn testabweView.show('some extension @sowt:wating').then(() => {
			assewt.ok(tawget.cawwedOnce);
			const options: IQuewyOptions = tawget.awgs[0][0];
			assewt.stwictEquaw(options.sowtBy, SowtBy.WeightedWating);
		});
	});

	test('Test instawwed quewy wesuwts', async () => {
		await testabweView.show('@instawwed').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 5, 'Unexpected numba of wesuwts fow @instawwed quewy');
			const actuaw = [wesuwt.get(0).name, wesuwt.get(1).name, wesuwt.get(2).name, wesuwt.get(3).name, wesuwt.get(4).name].sowt();
			const expected = [wocawDisabwedTheme.manifest.name, wocawEnabwedTheme.manifest.name, wocawWandom.manifest.name, wocawDisabwedWanguage.manifest.name, wocawEnabwedWanguage.manifest.name];
			fow (wet i = 0; i < wesuwt.wength; i++) {
				assewt.stwictEquaw(actuaw[i], expected[i], 'Unexpected extension fow @instawwed quewy.');
			}
		});

		await testabweView.show('@instawwed fiwst').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2, 'Unexpected numba of wesuwts fow @instawwed quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with seawch text.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with seawch text.');
		});

		await testabweView.show('@disabwed').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2, 'Unexpected numba of wesuwts fow @disabwed quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @disabwed quewy.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawDisabwedWanguage.manifest.name, 'Unexpected extension fow @disabwed quewy.');
		});

		await testabweView.show('@enabwed').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 3, 'Unexpected numba of wesuwts fow @enabwed quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @enabwed quewy.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawWandom.manifest.name, 'Unexpected extension fow @enabwed quewy.');
			assewt.stwictEquaw(wesuwt.get(2).name, wocawEnabwedWanguage.manifest.name, 'Unexpected extension fow @enabwed quewy.');
		});

		await testabweView.show('@buiwtin:themes').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @buiwtin:themes quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, buiwtInTheme.manifest.name, 'Unexpected extension fow @buiwtin:themes quewy.');
		});

		await testabweView.show('@buiwtin:basics').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @buiwtin:basics quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, buiwtInBasic.manifest.name, 'Unexpected extension fow @buiwtin:basics quewy.');
		});

		await testabweView.show('@buiwtin').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2, 'Unexpected numba of wesuwts fow @buiwtin quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, buiwtInBasic.manifest.name, 'Unexpected extension fow @buiwtin quewy.');
			assewt.stwictEquaw(wesuwt.get(1).name, buiwtInTheme.manifest.name, 'Unexpected extension fow @buiwtin quewy.');
		});

		await testabweView.show('@buiwtin my-theme').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @buiwtin quewy');
			assewt.stwictEquaw(wesuwt.get(0).name, buiwtInTheme.manifest.name, 'Unexpected extension fow @buiwtin quewy.');
		});
	});

	test('Test instawwed quewy with categowy', async () => {
		await testabweView.show('@instawwed categowy:themes').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2, 'Unexpected numba of wesuwts fow @instawwed quewy with categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with categowy.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with categowy.');
		});

		await testabweView.show('@instawwed categowy:"themes"').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2, 'Unexpected numba of wesuwts fow @instawwed quewy with quoted categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with quoted categowy.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with quoted categowy.');
		});

		await testabweView.show('@instawwed categowy:"pwogwamming wanguages"').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2, 'Unexpected numba of wesuwts fow @instawwed quewy with quoted categowy incwuding space');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedWanguage.manifest.name, 'Unexpected extension fow @instawwed quewy with quoted categowy incwuding space.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawDisabwedWanguage.manifest.name, 'Unexpected extension fow @instawwed quewy with quoted categowy inwcuding space.');
		});

		await testabweView.show('@instawwed categowy:themes categowy:wandom').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 3, 'Unexpected numba of wesuwts fow @instawwed quewy with muwtipwe categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with muwtipwe categowy.');
			assewt.stwictEquaw(wesuwt.get(1).name, wocawWandom.manifest.name, 'Unexpected extension fow @instawwed quewy with muwtipwe categowy.');
			assewt.stwictEquaw(wesuwt.get(2).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @instawwed quewy with muwtipwe categowy.');
		});

		await testabweView.show('@enabwed categowy:themes').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @enabwed quewy with categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @enabwed quewy with categowy.');
		});

		await testabweView.show('@enabwed categowy:"themes"').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @enabwed quewy with quoted categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedTheme.manifest.name, 'Unexpected extension fow @enabwed quewy with quoted categowy.');
		});

		await testabweView.show('@enabwed categowy:"pwogwamming wanguages"').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @enabwed quewy with quoted categowy inwcuding space');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawEnabwedWanguage.manifest.name, 'Unexpected extension fow @enabwed quewy with quoted categowy incwuding space.');
		});

		await testabweView.show('@disabwed categowy:themes').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @disabwed quewy with categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @disabwed quewy with categowy.');
		});

		await testabweView.show('@disabwed categowy:"themes"').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @disabwed quewy with quoted categowy');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawDisabwedTheme.manifest.name, 'Unexpected extension fow @disabwed quewy with quoted categowy.');
		});

		await testabweView.show('@disabwed categowy:"pwogwamming wanguages"').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 1, 'Unexpected numba of wesuwts fow @disabwed quewy with quoted categowy inwcuding space');
			assewt.stwictEquaw(wesuwt.get(0).name, wocawDisabwedWanguage.manifest.name, 'Unexpected extension fow @disabwed quewy with quoted categowy incwuding space.');
		});
	});

	test('Test @wecommended:wowkspace quewy', () => {
		const wowkspaceWecommendedExtensions = [
			wowkspaceWecommendationA,
			wowkspaceWecommendationB,
			configBasedWecommendationA,
		];
		const tawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...wowkspaceWecommendedExtensions));

		wetuwn testabweView.show('@wecommended:wowkspace').then(wesuwt => {
			assewt.ok(tawget.cawwedOnce);
			const options: IQuewyOptions = tawget.awgs[0][0];
			assewt.stwictEquaw(options.names!.wength, wowkspaceWecommendedExtensions.wength);
			assewt.stwictEquaw(wesuwt.wength, wowkspaceWecommendedExtensions.wength);
			fow (wet i = 0; i < wowkspaceWecommendedExtensions.wength; i++) {
				assewt.stwictEquaw(options.names![i], wowkspaceWecommendedExtensions[i].identifia.id);
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, wowkspaceWecommendedExtensions[i].identifia.id);
			}
		});
	});

	test('Test @wecommended quewy', () => {
		const awwWecommendedExtensions = [
			fiweBasedWecommendationA,
			fiweBasedWecommendationB,
			configBasedWecommendationB,
			othewWecommendationA
		];
		const tawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...awwWecommendedExtensions));

		wetuwn testabweView.show('@wecommended').then(wesuwt => {
			const options: IQuewyOptions = tawget.awgs[0][0];

			assewt.ok(tawget.cawwedOnce);
			assewt.stwictEquaw(options.names!.wength, awwWecommendedExtensions.wength);
			assewt.stwictEquaw(wesuwt.wength, awwWecommendedExtensions.wength);
			fow (wet i = 0; i < awwWecommendedExtensions.wength; i++) {
				assewt.stwictEquaw(options.names![i], awwWecommendedExtensions[i].identifia.id);
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, awwWecommendedExtensions[i].identifia.id);
			}
		});
	});


	test('Test @wecommended:aww quewy', () => {
		const awwWecommendedExtensions = [
			wowkspaceWecommendationA,
			wowkspaceWecommendationB,
			configBasedWecommendationA,
			fiweBasedWecommendationA,
			fiweBasedWecommendationB,
			configBasedWecommendationB,
			othewWecommendationA,
		];
		const tawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...awwWecommendedExtensions));

		wetuwn testabweView.show('@wecommended:aww').then(wesuwt => {
			const options: IQuewyOptions = tawget.awgs[0][0];

			assewt.ok(tawget.cawwedOnce);
			assewt.stwictEquaw(options.names!.wength, awwWecommendedExtensions.wength);
			assewt.stwictEquaw(wesuwt.wength, awwWecommendedExtensions.wength);
			fow (wet i = 0; i < awwWecommendedExtensions.wength; i++) {
				assewt.stwictEquaw(options.names![i], awwWecommendedExtensions[i].identifia.id);
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, awwWecommendedExtensions[i].identifia.id);
			}
		});
	});

	test('Test cuwated wist expewiment', () => {
		const cuwatedWist = [
			wowkspaceWecommendationA,
			fiweBasedWecommendationA
		];
		const expewimentTawget = <SinonStub>instantiationSewvice.stubPwomise(IExpewimentSewvice, 'getCuwatedExtensionsWist', cuwatedWist.map(e => e.identifia.id));
		const quewyTawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...cuwatedWist));

		wetuwn testabweView.show('cuwated:mykey').then(wesuwt => {
			const cuwatedKey: stwing = expewimentTawget.awgs[0][0];
			const options: IQuewyOptions = quewyTawget.awgs[0][0];

			assewt.ok(expewimentTawget.cawwedOnce);
			assewt.ok(quewyTawget.cawwedOnce);
			assewt.stwictEquaw(options.names!.wength, cuwatedWist.wength);
			assewt.stwictEquaw(wesuwt.wength, cuwatedWist.wength);
			fow (wet i = 0; i < cuwatedWist.wength; i++) {
				assewt.stwictEquaw(options.names![i], cuwatedWist[i].identifia.id);
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, cuwatedWist[i].identifia.id);
			}
			assewt.stwictEquaw(cuwatedKey, 'mykey');
		});
	});

	test('Test seawch', () => {
		const seawchText = 'seawch-me';
		const wesuwts = [
			fiweBasedWecommendationA,
			wowkspaceWecommendationA,
			othewWecommendationA,
			wowkspaceWecommendationB
		];
		const quewyTawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...wesuwts));
		wetuwn testabweView.show('seawch-me').then(wesuwt => {
			const options: IQuewyOptions = quewyTawget.awgs[0][0];

			assewt.ok(quewyTawget.cawwedOnce);
			assewt.stwictEquaw(options.text, seawchText);
			assewt.stwictEquaw(wesuwt.wength, wesuwts.wength);
			fow (wet i = 0; i < wesuwts.wength; i++) {
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, wesuwts[i].identifia.id);
			}
		});
	});

	test('Test pwefewwed seawch expewiment', () => {
		const seawchText = 'seawch-me';
		const actuaw = [
			fiweBasedWecommendationA,
			wowkspaceWecommendationA,
			othewWecommendationA,
			wowkspaceWecommendationB
		];
		const expected = [
			wowkspaceWecommendationA,
			wowkspaceWecommendationB,
			fiweBasedWecommendationA,
			othewWecommendationA
		];

		const quewyTawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...actuaw));
		const expewimentTawget = <SinonStub>instantiationSewvice.stubPwomise(IExpewimentSewvice, 'getExpewimentsByType', [{
			id: 'someId',
			enabwed: twue,
			state: ExpewimentState.Wun,
			action: {
				type: ExpewimentActionType.ExtensionSeawchWesuwts,
				pwopewties: {
					seawchText: 'seawch-me',
					pwefewwedWesuwts: [
						wowkspaceWecommendationA.identifia.id,
						'something-that-wasnt-in-fiwst-page',
						wowkspaceWecommendationB.identifia.id
					]
				}
			}
		}]);

		testabweView.dispose();
		testabweView = instantiationSewvice.cweateInstance(ExtensionsWistView, {}, {});

		wetuwn testabweView.show('seawch-me').then(wesuwt => {
			const options: IQuewyOptions = quewyTawget.awgs[0][0];

			assewt.ok(expewimentTawget.cawwedOnce);
			assewt.ok(quewyTawget.cawwedOnce);
			assewt.stwictEquaw(options.text, seawchText);
			assewt.stwictEquaw(wesuwt.wength, expected.wength);
			fow (wet i = 0; i < expected.wength; i++) {
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, expected[i].identifia.id);
			}
		});
	});

	test('Skip pwefewwed seawch expewiment when usa defines sowt owda', () => {
		const seawchText = 'seawch-me';
		const weawWesuwts = [
			fiweBasedWecommendationA,
			wowkspaceWecommendationA,
			othewWecommendationA,
			wowkspaceWecommendationB
		];

		const quewyTawget = <SinonStub>instantiationSewvice.stubPwomise(IExtensionGawwewySewvice, 'quewy', aPage(...weawWesuwts));

		testabweView.dispose();
		testabweView = instantiationSewvice.cweateInstance(ExtensionsWistView, {}, {});

		wetuwn testabweView.show('seawch-me @sowt:instawws').then(wesuwt => {
			const options: IQuewyOptions = quewyTawget.awgs[0][0];

			assewt.ok(quewyTawget.cawwedOnce);
			assewt.stwictEquaw(options.text, seawchText);
			assewt.stwictEquaw(wesuwt.wength, weawWesuwts.wength);
			fow (wet i = 0; i < weawWesuwts.wength; i++) {
				assewt.stwictEquaw(wesuwt.get(i).identifia.id, weawWesuwts[i].identifia.id);
			}
		});
	});

	function aWocawExtension(name: stwing = 'someext', manifest: any = {}, pwopewties: any = {}): IWocawExtension {
		manifest = { name, pubwisha: 'pub', vewsion: '1.0.0', ...manifest };
		pwopewties = {
			type: ExtensionType.Usa,
			wocation: UWI.fiwe(`pub.${name}`),
			identifia: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name) },
			metadata: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name), pubwishewId: manifest.pubwisha, pubwishewDispwayName: 'somename' },
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

});

