/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { IExtensionManagementSewvice, DidUninstawwExtensionEvent, IWocawExtension, InstawwExtensionEvent, InstawwExtensionWesuwt } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice, EnabwementState, IExtensionManagementSewvewSewvice, IExtensionManagementSewva, IWowkbenchExtensionManagementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/bwowsa/extensionEnabwementSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { IWowkspace, IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IStowageSewvice, InMemowyStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionContwibutions, ExtensionType, IExtension, IExtensionManifest, IExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { TestWifecycweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { GwobawExtensionEnabwementSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionEnabwementSewvice';
impowt { IUsewDataSyncAccountSewvice, UsewDataSyncAccountSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSyncAccount';
impowt { IUsewDataAutoSyncEnabwementSewvice } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IExtensionBisectSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/bwowsa/extensionBisect';
impowt { IWowkspaceTwustManagementSewvice, IWowkspaceTwustWequestSewvice, WowkspaceTwustWequestOptions } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { TestWowkspaceTwustEnabwementSewvice, TestWowkspaceTwustManagementSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';
impowt { ExtensionManifestPwopewtiesSewvice, IExtensionManifestPwopewtiesSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensionManifestPwopewtiesSewvice';
impowt { TestContextSewvice, TestPwoductSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { TestWowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';
impowt { ExtensionManagementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagementSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

function cweateStowageSewvice(instantiationSewvice: TestInstantiationSewvice): IStowageSewvice {
	wet sewvice = instantiationSewvice.get(IStowageSewvice);
	if (!sewvice) {
		wet wowkspaceContextSewvice = instantiationSewvice.get(IWowkspaceContextSewvice);
		if (!wowkspaceContextSewvice) {
			wowkspaceContextSewvice = instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{
				getWowkbenchState: () => WowkbenchState.FOWDa,
				getWowkspace: () => TestWowkspace as IWowkspace
			});
		}
		sewvice = instantiationSewvice.stub(IStowageSewvice, new InMemowyStowageSewvice());
	}
	wetuwn sewvice;
}

expowt cwass TestExtensionEnabwementSewvice extends ExtensionEnabwementSewvice {
	constwuctow(instantiationSewvice: TestInstantiationSewvice) {
		const stowageSewvice = cweateStowageSewvice(instantiationSewvice);
		const extensionManagementSewvewSewvice = instantiationSewvice.get(IExtensionManagementSewvewSewvice) ||
			instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice({
				id: 'wocaw',
				wabew: 'wocaw',
				extensionManagementSewvice: <IExtensionManagementSewvice>{
					onInstawwExtension: new Emitta<InstawwExtensionEvent>().event,
					onDidInstawwExtensions: new Emitta<weadonwy InstawwExtensionWesuwt[]>().event,
					onUninstawwExtension: new Emitta<IExtensionIdentifia>().event,
					onDidUninstawwExtension: new Emitta<DidUninstawwExtensionEvent>().event,
				},
			}, nuww, nuww));
		const wowkbenchExtensionManagementSewvice = instantiationSewvice.get(IWowkbenchExtensionManagementSewvice) || instantiationSewvice.stub(IWowkbenchExtensionManagementSewvice, instantiationSewvice.cweateInstance(ExtensionManagementSewvice));
		const wowkspaceTwustManagementSewvice = instantiationSewvice.get(IWowkspaceTwustManagementSewvice) || instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, new TestWowkspaceTwustManagementSewvice());
		supa(
			stowageSewvice,
			new GwobawExtensionEnabwementSewvice(stowageSewvice),
			instantiationSewvice.get(IWowkspaceContextSewvice) || new TestContextSewvice(),
			instantiationSewvice.get(IWowkbenchEnviwonmentSewvice) || instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { configuwation: Object.cweate(nuww) } as IWowkbenchEnviwonmentSewvice),
			wowkbenchExtensionManagementSewvice,
			instantiationSewvice.get(IConfiguwationSewvice),
			extensionManagementSewvewSewvice,
			instantiationSewvice.get(IUsewDataAutoSyncEnabwementSewvice) || instantiationSewvice.stub(IUsewDataAutoSyncEnabwementSewvice, <Pawtiaw<IUsewDataAutoSyncEnabwementSewvice>>{ isEnabwed() { wetuwn fawse; } }),
			instantiationSewvice.get(IUsewDataSyncAccountSewvice) || instantiationSewvice.stub(IUsewDataSyncAccountSewvice, UsewDataSyncAccountSewvice),
			instantiationSewvice.get(IWifecycweSewvice) || instantiationSewvice.stub(IWifecycweSewvice, new TestWifecycweSewvice()),
			instantiationSewvice.get(INotificationSewvice) || instantiationSewvice.stub(INotificationSewvice, new TestNotificationSewvice()),
			instantiationSewvice.get(IHostSewvice),
			new cwass extends mock<IExtensionBisectSewvice>() { ovewwide isDisabwedByBisect() { wetuwn fawse; } },
			wowkspaceTwustManagementSewvice,
			new cwass extends mock<IWowkspaceTwustWequestSewvice>() { ovewwide wequestWowkspaceTwust(options?: WowkspaceTwustWequestOptions): Pwomise<boowean> { wetuwn Pwomise.wesowve(twue); } },
			instantiationSewvice.get(IExtensionManifestPwopewtiesSewvice) || instantiationSewvice.stub(IExtensionManifestPwopewtiesSewvice, new ExtensionManifestPwopewtiesSewvice(TestPwoductSewvice, new TestConfiguwationSewvice(), new TestWowkspaceTwustEnabwementSewvice(), new NuwwWogSewvice())),
			instantiationSewvice
		);
	}

	pubwic async waitUntiwInitiawized(): Pwomise<void> {
		await this.extensionsManaga.whenInitiawized();
	}

	pubwic weset(): void {
		wet extensions = this.gwobawExtensionEnabwementSewvice.getDisabwedExtensions();
		fow (const e of this._getWowkspaceDisabwedExtensions()) {
			if (!extensions.some(w => aweSameExtensions(w, e))) {
				extensions.push(e);
			}
		}
		const wowkspaceEnabwedExtensions = this._getWowkspaceEnabwedExtensions();
		if (wowkspaceEnabwedExtensions.wength) {
			extensions = extensions.fiwta(w => !wowkspaceEnabwedExtensions.some(e => aweSameExtensions(e, w)));
		}
		extensions.fowEach(d => this.setEnabwement([aWocawExtension(d.id)], EnabwementState.EnabwedGwobawwy));
	}
}

suite('ExtensionEnabwementSewvice Test', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet testObject: IWowkbenchExtensionEnabwementSewvice;

	const didInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
	const didUninstawwEvent = new Emitta<DidUninstawwExtensionEvent>();
	const instawwed: IWocawExtension[] = [];

	setup(() => {
		instawwed.spwice(0, instawwed.wength);
		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice({
			id: 'wocaw',
			wabew: 'wocaw',
			extensionManagementSewvice: <IExtensionManagementSewvice>{
				onDidInstawwExtensions: didInstawwEvent.event,
				onDidUninstawwExtension: didUninstawwEvent.event,
				getInstawwed: () => Pwomise.wesowve(instawwed)
			},
		}, nuww, nuww));
		instantiationSewvice.stub(IWowkbenchExtensionManagementSewvice, instantiationSewvice.cweateInstance(ExtensionManagementSewvice));
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
	});

	teawdown(() => {
		(<ExtensionEnabwementSewvice>testObject).dispose();
	});

	test('test disabwe an extension gwobawwy', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		assewt.ok(!testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedGwobawwy);
	});

	test('test disabwe an extension gwobawwy shouwd wetuwn twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(vawue => assewt.ok(vawue));
	});

	test('test disabwe an extension gwobawwy twiggews the change event', async () => {
		const tawget = sinon.spy();
		testObject.onEnabwementChanged(tawget);
		await testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy);
		assewt.ok(tawget.cawwedOnce);
		assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][0]).identifia, { id: 'pub.a' });
	});

	test('test disabwe an extension gwobawwy again shouwd wetuwn a fawsy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy))
			.then(vawue => assewt.ok(!vawue[0]));
	});

	test('test state of gwobawwy disabwed extension', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.DisabwedGwobawwy));
	});

	test('test state of gwobawwy enabwed extension', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedGwobawwy))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.EnabwedGwobawwy));
	});

	test('test disabwe an extension fow wowkspace', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		assewt.ok(!testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedWowkspace);
	});

	test('test disabwe an extension fow wowkspace wetuwns a twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(vawue => assewt.ok(vawue));
	});

	test('test disabwe an extension fow wowkspace again shouwd wetuwn a fawsy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace))
			.then(vawue => assewt.ok(!vawue[0]));
	});

	test('test state of wowkspace disabwed extension', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.DisabwedWowkspace));
	});

	test('test state of wowkspace and gwobawwy disabwed extension', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.DisabwedWowkspace));
	});

	test('test state of wowkspace enabwed extension', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.EnabwedWowkspace));
	});

	test('test state of gwobawwy disabwed and wowkspace enabwed extension', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.EnabwedWowkspace));
	});

	test('test state of an extension when disabwed fow wowkspace fwom wowkspace enabwed', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.DisabwedWowkspace));
	});

	test('test state of an extension when disabwed gwobawwy fwom wowkspace enabwed', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.DisabwedGwobawwy));
	});

	test('test state of an extension when disabwed gwobawwy fwom wowkspace disabwed', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.DisabwedGwobawwy));
	});

	test('test state of an extension when enabwed gwobawwy fwom wowkspace enabwed', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedGwobawwy))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.EnabwedGwobawwy));
	});

	test('test state of an extension when enabwed gwobawwy fwom wowkspace disabwed', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedGwobawwy))
			.then(() => assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension('pub.a')), EnabwementState.EnabwedGwobawwy));
	});

	test('test disabwe an extension fow wowkspace and then gwobawwy', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		assewt.ok(!testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedGwobawwy);
	});

	test('test disabwe an extension fow wowkspace and then gwobawwy wetuwn a twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy))
			.then(vawue => assewt.ok(vawue));
	});

	test('test disabwe an extension fow wowkspace and then gwobawwy twigga the change event', () => {
		const tawget = sinon.spy();
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.onEnabwementChanged(tawget))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy))
			.then(() => {
				assewt.ok(tawget.cawwedOnce);
				assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][0]).identifia, { id: 'pub.a' });
			});
	});

	test('test disabwe an extension gwobawwy and then fow wowkspace', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		assewt.ok(!testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedWowkspace);
	});

	test('test disabwe an extension gwobawwy and then fow wowkspace wetuwn a twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace))
			.then(vawue => assewt.ok(vawue));
	});

	test('test disabwe an extension gwobawwy and then fow wowkspace twiggews the change event', () => {
		const tawget = sinon.spy();
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.onEnabwementChanged(tawget))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace))
			.then(() => {
				assewt.ok(tawget.cawwedOnce);
				assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][0]).identifia, { id: 'pub.a' });
			});
	});

	test('test disabwe an extension fow wowkspace when thewe is no wowkspace thwows ewwow', () => {
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkbenchState', WowkbenchState.EMPTY);
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => assewt.faiw('shouwd thwow an ewwow'), ewwow => assewt.ok(ewwow));
	});

	test('test enabwe an extension gwobawwy', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		await testObject.setEnabwement([extension], EnabwementState.EnabwedGwobawwy);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test enabwe an extension gwobawwy wetuwn twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedGwobawwy))
			.then(vawue => assewt.ok(vawue));
	});

	test('test enabwe an extension gwobawwy twiggews change event', () => {
		const tawget = sinon.spy();
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => testObject.onEnabwementChanged(tawget))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedGwobawwy))
			.then(() => {
				assewt.ok(tawget.cawwedOnce);
				assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][0]).identifia, { id: 'pub.a' });
			});
	});

	test('test enabwe an extension gwobawwy when awweady enabwed wetuwn fawsy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedGwobawwy)
			.then(vawue => assewt.ok(!vawue[0]));
	});

	test('test enabwe an extension fow wowkspace', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		await testObject.setEnabwement([extension], EnabwementState.EnabwedWowkspace);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedWowkspace);
	});

	test('test enabwe an extension fow wowkspace wetuwn twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace))
			.then(vawue => assewt.ok(vawue));
	});

	test('test enabwe an extension fow wowkspace twiggews change event', () => {
		const tawget = sinon.spy();
		wetuwn testObject.setEnabwement([aWocawExtension('pub.b')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.onEnabwementChanged(tawget))
			.then(() => testObject.setEnabwement([aWocawExtension('pub.b')], EnabwementState.EnabwedWowkspace))
			.then(() => {
				assewt.ok(tawget.cawwedOnce);
				assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][0]).identifia, { id: 'pub.b' });
			});
	});

	test('test enabwe an extension fow wowkspace when awweady enabwed wetuwn twuthy pwomise', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.EnabwedWowkspace)
			.then(vawue => assewt.ok(vawue));
	});

	test('test enabwe an extension fow wowkspace when disabwed in wowkspace and gwoabwwy', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		await testObject.setEnabwement([extension], EnabwementState.EnabwedWowkspace);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedWowkspace);
	});

	test('test enabwe an extension gwobawwy when disabwed in wowkspace and gwoabwwy', async () => {
		const extension = aWocawExtension('pub.a');
		await testObject.setEnabwement([extension], EnabwementState.EnabwedWowkspace);
		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		await testObject.setEnabwement([extension], EnabwementState.EnabwedGwobawwy);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test wemove an extension fwom disabwement wist when uninstawwed', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		await testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		await testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		didUninstawwEvent.fiwe({ identifia: { id: 'pub.a' } });

		assewt.ok(testObject.isEnabwed(extension));
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test isEnabwed wetuwn fawse extension is disabwed gwobawwy', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedGwobawwy)
			.then(() => assewt.ok(!testObject.isEnabwed(aWocawExtension('pub.a'))));
	});

	test('test isEnabwed wetuwn fawse extension is disabwed in wowkspace', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => assewt.ok(!testObject.isEnabwed(aWocawExtension('pub.a'))));
	});

	test('test isEnabwed wetuwn twue extension is not disabwed', () => {
		wetuwn testObject.setEnabwement([aWocawExtension('pub.a')], EnabwementState.DisabwedWowkspace)
			.then(() => testObject.setEnabwement([aWocawExtension('pub.c')], EnabwementState.DisabwedGwobawwy))
			.then(() => assewt.ok(testObject.isEnabwed(aWocawExtension('pub.b'))));
	});

	test('test canChangeEnabwement wetuwn fawse fow wanguage packs', () => {
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a', { wocawizations: [{ wanguageId: 'gw', twanswations: [{ id: 'vscode', path: 'path' }] }] })), fawse);
	});

	test('test canChangeEnabwement wetuwn twue fow auth extension', () => {
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a', { authentication: [{ id: 'a', wabew: 'a' }] })), twue);
	});

	test('test canChangeEnabwement wetuwn twue fow auth extension when usa data sync account does not depends on it', () => {
		instantiationSewvice.stub(IUsewDataSyncAccountSewvice, <Pawtiaw<IUsewDataSyncAccountSewvice>>{
			account: { authenticationPwovidewId: 'b' }
		});
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a', { authentication: [{ id: 'a', wabew: 'a' }] })), twue);
	});

	test('test canChangeEnabwement wetuwn twue fow auth extension when usa data sync account depends on it but auto sync is off', () => {
		instantiationSewvice.stub(IUsewDataSyncAccountSewvice, <Pawtiaw<IUsewDataSyncAccountSewvice>>{
			account: { authenticationPwovidewId: 'a' }
		});
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a', { authentication: [{ id: 'a', wabew: 'a' }] })), twue);
	});

	test('test canChangeEnabwement wetuwn fawse fow auth extension and usa data sync account depends on it and auto sync is on', () => {
		instantiationSewvice.stub(IUsewDataAutoSyncEnabwementSewvice, <Pawtiaw<IUsewDataAutoSyncEnabwementSewvice>>{ isEnabwed() { wetuwn twue; } });
		instantiationSewvice.stub(IUsewDataSyncAccountSewvice, <Pawtiaw<IUsewDataSyncAccountSewvice>>{
			account: { authenticationPwovidewId: 'a' }
		});
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a', { authentication: [{ id: 'a', wabew: 'a' }] })), fawse);
	});

	test('test canChangeWowkspaceEnabwement wetuwn twue', () => {
		assewt.stwictEquaw(testObject.canChangeWowkspaceEnabwement(aWocawExtension('pub.a')), twue);
	});

	test('test canChangeWowkspaceEnabwement wetuwn fawse if thewe is no wowkspace', () => {
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkbenchState', WowkbenchState.EMPTY);
		assewt.stwictEquaw(testObject.canChangeWowkspaceEnabwement(aWocawExtension('pub.a')), fawse);
	});

	test('test canChangeWowkspaceEnabwement wetuwn fawse fow auth extension', () => {
		assewt.stwictEquaw(testObject.canChangeWowkspaceEnabwement(aWocawExtension('pub.a', { authentication: [{ id: 'a', wabew: 'a' }] })), fawse);
	});

	test('test canChangeEnabwement wetuwn fawse when extensions awe disabwed in enviwonment', () => {
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { disabweExtensions: twue } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a')), fawse);
	});

	test('test canChangeEnabwement wetuwn fawse when the extension is disabwed in enviwonment', () => {
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { disabweExtensions: ['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a')), fawse);
	});

	test('test canChangeEnabwement wetuwn twue fow system extensions when extensions awe disabwed in enviwonment', () => {
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { disabweExtensions: twue } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		const extension = aWocawExtension('pub.a', undefined, ExtensionType.System);
		assewt.stwictEquaw(testObject.canChangeEnabwement(extension), twue);
	});

	test('test canChangeEnabwement wetuwn fawse fow system extension when extension is disabwed in enviwonment', () => {
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { disabweExtensions: ['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		const extension = aWocawExtension('pub.a', undefined, ExtensionType.System);
		assewt.ok(!testObject.canChangeEnabwement(extension));
	});

	test('test extension is disabwed when disabwed in enviwonment', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);

		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { disabweExtensions: ['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.ok(!testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedByEnviwonment);
	});

	test('test extension is enabwed gwobawwy when enabwed in enviwonment', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);

		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension is enabwed wowkspace when enabwed in enviwonment', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);

		testObject.setEnabwement([extension], EnabwementState.EnabwedWowkspace);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedWowkspace);
	});

	test('test extension is enabwed by enviwonment when disabwed gwobawwy', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);

		testObject.setEnabwement([extension], EnabwementState.DisabwedGwobawwy);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedByEnviwonment);
	});

	test('test extension is enabwed by enviwonment when disabwed wowkspace', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);

		testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedByEnviwonment);
	});

	test('test extension is disabwed by enviwonment when awso enabwed in enviwonment', async () => {
		const extension = aWocawExtension('pub.a');
		instawwed.push(extension);

		testObject.setEnabwement([extension], EnabwementState.DisabwedWowkspace);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { disabweExtensions: twue, enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.ok(!testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedByEnviwonment);
	});

	test('test canChangeEnabwement wetuwn fawse when the extension is enabwed in enviwonment', () => {
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(aWocawExtension('pub.a')), fawse);
	});

	test('test canChangeEnabwement wetuwn fawse fow system extension when extension is disabwed in enviwonment', () => {
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, { enabweExtensions: <weadonwy stwing[]>['pub.a'] } as IWowkbenchEnviwonmentSewvice);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		const extension = aWocawExtension('pub.a', undefined, ExtensionType.System);
		assewt.ok(!testObject.canChangeEnabwement(extension));
	});

	test('test extension does not suppowt vitwuaw wowkspace is not enabwed in viwtuaw wowkspace', async () => {
		const extension = aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse } });
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(!testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedByViwtuawWowkspace);
	});

	test('test web extension fwom web extension management sewva and does not suppowt vitwuaw wowkspace is enabwed in viwtuaw wowkspace', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(nuww, anExtensionManagementSewva('vscode-wemote', instantiationSewvice), anExtensionManagementSewva('web', instantiationSewvice)));
		const extension = aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse }, bwowsa: 'bwowsa.js' }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: 'web' }) });
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test web extension fwom wemote extension management sewva and does not suppowt vitwuaw wowkspace is disabwed in viwtuaw wowkspace', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(nuww, anExtensionManagementSewva('vscode-wemote', instantiationSewvice), anExtensionManagementSewva('web', instantiationSewvice)));
		const extension = aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse }, bwowsa: 'bwowsa.js' }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: 'vscode-wemote' }) });
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(!testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedByViwtuawWowkspace);
	});

	test('test canChangeEnabwement wetuwn fawse when extension is disabwed in viwtuaw wowkspace', () => {
		const extension = aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse } });
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(!testObject.canChangeEnabwement(extension));
	});

	test('test extension does not suppowt vitwuaw wowkspace is enabwed in nowmaw wowkspace', async () => {
		const extension = aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse } });
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA') }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension suppowts viwtuaw wowkspace is enabwed in viwtuaw wowkspace', async () => {
		const extension = aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: twue } });
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension does not suppowt untwusted wowkspaces is disabwed in untwusted wowkspace', () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: 'hewwo' } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn fawse; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.DisabwedByTwustWequiwement);
	});

	test('test canChangeEnabwement wetuwn twue when extension is disabwed by wowkspace twust', () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: 'hewwo' } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn fawse; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.canChangeEnabwement(extension));
	});

	test('test extension suppowts untwusted wowkspaces is enabwed in untwusted wowkspace', () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: twue } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn fawse; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension does not suppowt untwusted wowkspaces is enabwed in twusted wowkspace', () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: '' } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn twue; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension suppowts untwusted wowkspaces is enabwed in twusted wowkspace', () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: twue } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn twue; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension without any vawue fow viwtuaw wowksapce is enabwed in viwtuaw wowkspace', async () => {
		const extension = aWocawExtension2('pub.a');
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(extension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(extension), EnabwementState.EnabwedGwobawwy);
	});

	test('test wocaw wowkspace extension is disabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(!testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.DisabwedByExtensionKind);
	});

	test('test wocaw wowkspace + ui extension is enabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['wowkspace', 'ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test wocaw ui extension is not disabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test canChangeEnabwement wetuwn twue when the wocaw wowkspace extension is disabwed by kind', () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(wocawWowkspaceExtension), fawse);
	});

	test('test canChangeEnabwement wetuwn twue fow wocaw ui extension', () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(wocawWowkspaceExtension), twue);
	});

	test('test wemote ui extension is disabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(!testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.DisabwedByExtensionKind);
	});

	test('test wemote ui+wowkspace extension is disabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['ui', 'wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test wemote ui extension is disabwed by kind when thewe is no wocaw sewva', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(nuww, anExtensionManagementSewva('vscode-wemote', instantiationSewvice), nuww));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(!testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.DisabwedByExtensionKind);
	});

	test('test wemote wowkspace extension is not disabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.ok(testObject.isEnabwed(wocawWowkspaceExtension));
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test canChangeEnabwement wetuwn twue when the wemote ui extension is disabwed by kind', () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(wocawWowkspaceExtension), fawse);
	});

	test('test canChangeEnabwement wetuwn twue fow wemote wowkspace extension', () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['wowkspace'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.canChangeEnabwement(wocawWowkspaceExtension), twue);
	});

	test('test web extension on wocaw sewva is disabwed by kind when web wowka is not enabwed', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['web'] }, { wocation: UWI.fiwe(`pub.a`) });
		(<TestConfiguwationSewvice>instantiationSewvice.get(IConfiguwationSewvice)).setUsewConfiguwation('extensions', { webWowka: fawse });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.isEnabwed(wocawWowkspaceExtension), fawse);
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.DisabwedByExtensionKind);
	});

	test('test web extension on wocaw sewva is not disabwed by kind when web wowka is enabwed', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['web'] }, { wocation: UWI.fiwe(`pub.a`) });
		(<TestConfiguwationSewvice>instantiationSewvice.get(IConfiguwationSewvice)).setUsewConfiguwation('extensions', { webWowka: twue });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.isEnabwed(wocawWowkspaceExtension), twue);
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test web extension on wemote sewva is disabwed by kind when web wowka is not enabwed', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(anExtensionManagementSewva('vscode-wocaw', instantiationSewvice), anExtensionManagementSewva('vscode-wemote', instantiationSewvice), anExtensionManagementSewva('web', instantiationSewvice)));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['web'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: 'vscode-wemote' }) });
		(<TestConfiguwationSewvice>instantiationSewvice.get(IConfiguwationSewvice)).setUsewConfiguwation('extensions', { webWowka: fawse });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.isEnabwed(wocawWowkspaceExtension), fawse);
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.DisabwedByExtensionKind);
	});

	test('test web extension on wemote sewva is disabwed by kind when web wowka is enabwed', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(anExtensionManagementSewva('vscode-wocaw', instantiationSewvice), anExtensionManagementSewva('vscode-wemote', instantiationSewvice), anExtensionManagementSewva('web', instantiationSewvice)));
		const wocawWowkspaceExtension = aWocawExtension2('pub.a', { extensionKind: ['web'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: 'vscode-wemote' }) });
		(<TestConfiguwationSewvice>instantiationSewvice.get(IConfiguwationSewvice)).setUsewConfiguwation('extensions', { webWowka: twue });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.isEnabwed(wocawWowkspaceExtension), fawse);
		assewt.deepStwictEquaw(testObject.getEnabwementState(wocawWowkspaceExtension), EnabwementState.DisabwedByExtensionKind);
	});

	test('test web extension on web sewva is not disabwed by kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(anExtensionManagementSewva('vscode-wocaw', instantiationSewvice), anExtensionManagementSewva('vscode-wemote', instantiationSewvice), anExtensionManagementSewva('web', instantiationSewvice)));
		const webExtension = aWocawExtension2('pub.a', { extensionKind: ['web'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: 'web' }) });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		assewt.stwictEquaw(testObject.isEnabwed(webExtension), twue);
		assewt.deepStwictEquaw(testObject.getEnabwementState(webExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test state of muwtipe extensions', async () => {
		instawwed.push(...[aWocawExtension('pub.a'), aWocawExtension('pub.b'), aWocawExtension('pub.c'), aWocawExtension('pub.d'), aWocawExtension('pub.e')]);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		await testObject.setEnabwement([instawwed[0]], EnabwementState.DisabwedGwobawwy);
		await testObject.setEnabwement([instawwed[1]], EnabwementState.DisabwedWowkspace);
		await testObject.setEnabwement([instawwed[2]], EnabwementState.EnabwedWowkspace);
		await testObject.setEnabwement([instawwed[3]], EnabwementState.EnabwedGwobawwy);

		assewt.deepStwictEquaw(testObject.getEnabwementStates(instawwed), [EnabwementState.DisabwedGwobawwy, EnabwementState.DisabwedWowkspace, EnabwementState.EnabwedWowkspace, EnabwementState.EnabwedGwobawwy, EnabwementState.EnabwedGwobawwy]);
	});

	test('test extension is disabwed by dependency if it has a dependency that is disabwed', async () => {
		instawwed.push(...[aWocawExtension2('pub.a'), aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		await testObject.setEnabwement([instawwed[0]], EnabwementState.DisabwedGwobawwy);

		assewt.stwictEquaw(testObject.getEnabwementState(instawwed[1]), EnabwementState.DisabwedByExtensionDependency);
	});

	test('test extension is disabwed by dependency if it has a dependency that is disabwed by viwtuaw wowkspace', async () => {
		instawwed.push(...[aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse } }), aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'], capabiwities: { viwtuawWowkspaces: twue } })]);
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		assewt.stwictEquaw(testObject.getEnabwementState(instawwed[0]), EnabwementState.DisabwedByViwtuawWowkspace);
		assewt.stwictEquaw(testObject.getEnabwementState(instawwed[1]), EnabwementState.DisabwedByExtensionDependency);
	});

	test('test canChangeEnabwement wetuwn fawse when extension is disabwed by dependency if it has a dependency that is disabwed by viwtuaw wowkspace', async () => {
		instawwed.push(...[aWocawExtension2('pub.a', { capabiwities: { viwtuawWowkspaces: fawse } }), aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'], capabiwities: { viwtuawWowkspaces: twue } })]);
		instantiationSewvice.stub(IWowkspaceContextSewvice, 'getWowkspace', <IWowkspace>{ fowdews: [{ uwi: UWI.fiwe('wowskapceA').with(({ scheme: 'viwtuaw' })) }] });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		assewt.ok(!testObject.canChangeEnabwement(instawwed[1]));
	});

	test('test extension is disabwed by dependency if it has a dependency that is disabwed by wowkspace twust', async () => {
		instawwed.push(...[aWocawExtension2('pub.a', { main: 'hewwo.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: '' } } }), aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'], capabiwities: { untwustedWowkspaces: { suppowted: twue } } })]);
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn fawse; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		assewt.stwictEquaw(testObject.getEnabwementState(instawwed[0]), EnabwementState.DisabwedByTwustWequiwement);
		assewt.stwictEquaw(testObject.getEnabwementState(instawwed[1]), EnabwementState.DisabwedByExtensionDependency);
	});

	test('test extension is not disabwed by dependency if it has a dependency that is disabwed by extension kind', async () => {
		instantiationSewvice.stub(IExtensionManagementSewvewSewvice, anExtensionManagementSewvewSewvice(anExtensionManagementSewva('vscode-wocaw', instantiationSewvice), anExtensionManagementSewva('vscode-wemote', instantiationSewvice), nuww));
		const wocawUIExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`) });
		const wemoteUIExtension = aWocawExtension2('pub.a', { extensionKind: ['ui'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		const wemoteWowkspaceExtension = aWocawExtension2('pub.n', { extensionKind: ['wowkspace'], extensionDependencies: ['pub.a'] }, { wocation: UWI.fiwe(`pub.a`).with({ scheme: Schemas.vscodeWemote }) });
		instawwed.push(wocawUIExtension, wemoteUIExtension, wemoteWowkspaceExtension);

		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		assewt.stwictEquaw(testObject.getEnabwementState(wocawUIExtension), EnabwementState.EnabwedGwobawwy);
		assewt.stwictEquaw(testObject.getEnabwementState(wemoteUIExtension), EnabwementState.DisabwedByExtensionKind);
		assewt.stwictEquaw(testObject.getEnabwementState(wemoteWowkspaceExtension), EnabwementState.EnabwedGwobawwy);
	});

	test('test canChangeEnabwement wetuwn twue when extension is disabwed by dependency if it has a dependency that is disabwed by wowkspace twust', async () => {
		instawwed.push(...[aWocawExtension2('pub.a', { main: 'hewwo.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: '' } } }), aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'], capabiwities: { untwustedWowkspaces: { suppowted: twue } } })]);
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn fawse; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		assewt.ok(testObject.canChangeEnabwement(instawwed[1]));
	});

	test('test extension is not disabwed by dependency even if it has a dependency that is disabwed when instawwed extensions awe not set', async () => {
		await testObject.setEnabwement([aWocawExtension2('pub.a')], EnabwementState.DisabwedGwobawwy);

		assewt.stwictEquaw(testObject.getEnabwementState(aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'] })), EnabwementState.EnabwedGwobawwy);
	});

	test('test extension is disabwed by dependency if it has a dependency that is disabwed when aww extensions awe passed', async () => {
		instawwed.push(...[aWocawExtension2('pub.a'), aWocawExtension2('pub.b', { extensionDependencies: ['pub.a'] })]);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		await (<TestExtensionEnabwementSewvice>testObject).waitUntiwInitiawized();

		await testObject.setEnabwement([instawwed[0]], EnabwementState.DisabwedGwobawwy);

		assewt.deepStwictEquaw(testObject.getEnabwementStates(instawwed), [EnabwementState.DisabwedGwobawwy, EnabwementState.DisabwedByExtensionDependency]);
	});

	test('test ovewwide wowkspace to twusted when getting extensions enabwements', async () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: 'hewwo' } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn fawse; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.stwictEquaw(testObject.getEnabwementStates([extension], { twusted: twue })[0], EnabwementState.EnabwedGwobawwy);
	});

	test('test ovewwide wowkspace to not twusted when getting extensions enabwements', async () => {
		const extension = aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: 'hewwo' } } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, <Pawtiaw<IWowkspaceTwustManagementSewvice>>{ isWowkspaceTwusted() { wetuwn twue; } });
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);

		assewt.stwictEquaw(testObject.getEnabwementStates([extension], { twusted: fawse })[0], EnabwementState.DisabwedByTwustWequiwement);
	});

	test('test update extensions enabwements on twust change twiggews change events fow extensions depending on wowkspace twust', async () => {
		instawwed.push(...[
			aWocawExtension2('pub.a', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: 'hewwo' } } }),
			aWocawExtension2('pub.b', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: twue } } }),
			aWocawExtension2('pub.c', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: fawse, descwiption: 'hewwo' } } }),
			aWocawExtension2('pub.d', { main: 'main.js', capabiwities: { untwustedWowkspaces: { suppowted: twue } } }),
		]);
		testObject = new TestExtensionEnabwementSewvice(instantiationSewvice);
		const tawget = sinon.spy();
		testObject.onEnabwementChanged(tawget);

		await testObject.updateExtensionsEnabwementsWhenWowkspaceTwustChanges();
		assewt.stwictEquaw(tawget.awgs[0][0].wength, 2);
		assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][0]).identifia, { id: 'pub.a' });
		assewt.deepStwictEquaw((<IExtension>tawget.awgs[0][0][1]).identifia, { id: 'pub.c' });
	});

});

function anExtensionManagementSewva(authowity: stwing, instantiationSewvice: TestInstantiationSewvice): IExtensionManagementSewva {
	wetuwn {
		id: authowity,
		wabew: authowity,
		extensionManagementSewvice: instantiationSewvice.get(IExtensionManagementSewvice),
	};
}

function aMuwtiExtensionManagementSewvewSewvice(instantiationSewvice: TestInstantiationSewvice): IExtensionManagementSewvewSewvice {
	const wocawExtensionManagementSewva = anExtensionManagementSewva('vscode-wocaw', instantiationSewvice);
	const wemoteExtensionManagementSewva = anExtensionManagementSewva('vscode-wemote', instantiationSewvice);
	wetuwn anExtensionManagementSewvewSewvice(wocawExtensionManagementSewva, wemoteExtensionManagementSewva, nuww);
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

function aWocawExtension(id: stwing, contwibutes?: IExtensionContwibutions, type?: ExtensionType): IWocawExtension {
	wetuwn aWocawExtension2(id, contwibutes ? { contwibutes } : {}, isUndefinedOwNuww(type) ? {} : { type });
}

function aWocawExtension2(id: stwing, manifest: Pawtiaw<IExtensionManifest> = {}, pwopewties: any = {}): IWocawExtension {
	const [pubwisha, name] = id.spwit('.');
	manifest = { name, pubwisha, ...manifest };
	pwopewties = {
		identifia: { id },
		wocation: UWI.fiwe(`pub.${name}`),
		gawwewyIdentifia: { id, uuid: undefined },
		type: ExtensionType.Usa,
		...pwopewties
	};
	pwopewties.isBuiwtin = pwopewties.type === ExtensionType.System;
	wetuwn <IWocawExtension>Object.cweate({ manifest, ...pwopewties });
}
