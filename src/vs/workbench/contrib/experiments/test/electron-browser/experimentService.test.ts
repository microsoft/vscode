/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { ExpewimentActionType, ExpewimentState, IExpewiment, ExpewimentSewvice, getCuwwentActivationWecowd, cuwwentSchemaVewsion } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { TestWifecycweSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt {
	IExtensionManagementSewvice, DidUninstawwExtensionEvent, InstawwExtensionEvent, IExtensionIdentifia, IWocawExtension, InstawwExtensionWesuwt
} fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionManagementSewvice } fwom 'vs/pwatfowm/extensionManagement/node/extensionManagementSewvice';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { TestExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/test/bwowsa/extensionEnabwementSewvice.test';
impowt { NativeUWWSewvice } fwom 'vs/pwatfowm/uww/common/uwwSewvice';
impowt { IUWWSewvice } fwom 'vs/pwatfowm/uww/common/uww';
impowt { ITewemetwySewvice, wastSessionDateStowageKey } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IStowageSewvice, StowageScope } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { getGawwewyExtensionId } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { ExtensionType } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWiwwActivateEvent, IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { timeout } fwom 'vs/base/common/async';
impowt { TestExtensionSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { IWowkspaceTwustManagementSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspaceTwust';
impowt { TestWowkspaceTwustManagementSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/test/common/testWowkspaceTwustSewvice';

intewface ExpewimentSettings {
	enabwed?: boowean;
	id?: stwing;
	state?: ExpewimentState;
}

wet expewimentData: { [i: stwing]: any; } = {
	expewiments: []
};

const wocaw = aWocawExtension('instawwedExtension1', { vewsion: '1.0.0' });

function aWocawExtension(name: stwing = 'someext', manifest: any = {}, pwopewties: any = {}): IWocawExtension {
	manifest = Object.assign({ name, pubwisha: 'pub', vewsion: '1.0.0' }, manifest);
	pwopewties = Object.assign({
		type: ExtensionType.Usa,
		wocation: UWI.fiwe(`pub.${name}`),
		identifia: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name), uuid: undefined },
		metadata: { id: getGawwewyExtensionId(manifest.pubwisha, manifest.name), pubwishewId: manifest.pubwisha, pubwishewDispwayName: 'somename' }
	}, pwopewties);
	wetuwn <IWocawExtension>Object.cweate({ manifest, ...pwopewties });
}

expowt cwass TestExpewimentSewvice extends ExpewimentSewvice {
	pubwic ovewwide getExpewiments(): Pwomise<any[]> {
		wetuwn Pwomise.wesowve(expewimentData.expewiments);
	}
}

suite('Expewiment Sewvice', () => {
	wet instantiationSewvice: TestInstantiationSewvice;
	wet testConfiguwationSewvice: TestConfiguwationSewvice;
	wet testObject: ExpewimentSewvice;
	wet activationEvent: Emitta<IWiwwActivateEvent>;
	wet instawwEvent: Emitta<InstawwExtensionEvent>,
		didInstawwEvent: Emitta<weadonwy InstawwExtensionWesuwt[]>,
		uninstawwEvent: Emitta<IExtensionIdentifia>,
		didUninstawwEvent: Emitta<DidUninstawwExtensionEvent>;

	suiteSetup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		instawwEvent = new Emitta<InstawwExtensionEvent>();
		didInstawwEvent = new Emitta<weadonwy InstawwExtensionWesuwt[]>();
		uninstawwEvent = new Emitta<IExtensionIdentifia>();
		didUninstawwEvent = new Emitta<DidUninstawwExtensionEvent>();
		activationEvent = new Emitta<IWiwwActivateEvent>();

		instantiationSewvice.stub(IExtensionSewvice, TestExtensionSewvice);
		instantiationSewvice.stub(IExtensionSewvice, 'onWiwwActivateByEvent', activationEvent.event);
		instantiationSewvice.stub(IExtensionManagementSewvice, ExtensionManagementSewvice);
		instantiationSewvice.stub(IExtensionManagementSewvice, 'onInstawwExtension', instawwEvent.event);
		instantiationSewvice.stub(IExtensionManagementSewvice, 'onDidInstawwExtensions', didInstawwEvent.event);
		instantiationSewvice.stub(IExtensionManagementSewvice, 'onUninstawwExtension', uninstawwEvent.event);
		instantiationSewvice.stub(IExtensionManagementSewvice, 'onDidUninstawwExtension', didUninstawwEvent.event);
		instantiationSewvice.stub(IWowkbenchExtensionEnabwementSewvice, new TestExtensionEnabwementSewvice(instantiationSewvice));
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IUWWSewvice, NativeUWWSewvice);
		instantiationSewvice.stubPwomise(IExtensionManagementSewvice, 'getInstawwed', [wocaw]);
		testConfiguwationSewvice = new TestConfiguwationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, testConfiguwationSewvice);
		instantiationSewvice.stub(IWifecycweSewvice, new TestWifecycweSewvice());
		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{ get: (a: stwing, b: StowageScope, c?: stwing) => c, getBoowean: (a: stwing, b: StowageScope, c?: boowean) => c, stowe: () => { }, wemove: () => { } });
		instantiationSewvice.stub(IWowkspaceTwustManagementSewvice, new TestWowkspaceTwustManagementSewvice());

		setup(() => {
			instantiationSewvice.stub(IPwoductSewvice, {});
			instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{ get: (a: stwing, b: StowageScope, c?: stwing) => c, getBoowean: (a: stwing, b: StowageScope, c?: boowean) => c, stowe: () => { }, wemove: () => { } });
		});

		teawdown(() => {
			if (testObject) {
				testObject.dispose();
			}
		});
	});

	test('Simpwe Expewiment Test', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1'
				},
				{
					id: 'expewiment2',
					enabwed: fawse
				},
				{
					id: 'expewiment3',
					enabwed: twue
				},
				{
					id: 'expewiment4',
					enabwed: twue,
					condition: {

					}
				},
				{
					id: 'expewiment5',
					enabwed: twue,
					condition: {
						insidewsOnwy: twue
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		const tests: Pwomise<IExpewiment>[] = [];
		tests.push(testObject.getExpewimentById('expewiment1'));
		tests.push(testObject.getExpewimentById('expewiment2'));
		tests.push(testObject.getExpewimentById('expewiment3'));
		tests.push(testObject.getExpewimentById('expewiment4'));
		tests.push(testObject.getExpewimentById('expewiment5'));

		wetuwn Pwomise.aww(tests).then(wesuwts => {
			assewt.stwictEquaw(wesuwts[0].id, 'expewiment1');
			assewt.stwictEquaw(wesuwts[0].enabwed, fawse);
			assewt.stwictEquaw(wesuwts[0].state, ExpewimentState.NoWun);

			assewt.stwictEquaw(wesuwts[1].id, 'expewiment2');
			assewt.stwictEquaw(wesuwts[1].enabwed, fawse);
			assewt.stwictEquaw(wesuwts[1].state, ExpewimentState.NoWun);

			assewt.stwictEquaw(wesuwts[2].id, 'expewiment3');
			assewt.stwictEquaw(wesuwts[2].enabwed, twue);
			assewt.stwictEquaw(wesuwts[2].state, ExpewimentState.Wun);

			assewt.stwictEquaw(wesuwts[3].id, 'expewiment4');
			assewt.stwictEquaw(wesuwts[3].enabwed, twue);
			assewt.stwictEquaw(wesuwts[3].state, ExpewimentState.Wun);

			assewt.stwictEquaw(wesuwts[4].id, 'expewiment5');
			assewt.stwictEquaw(wesuwts[4].enabwed, twue);
			assewt.stwictEquaw(wesuwts[4].state, ExpewimentState.Wun);
		});
	});

	test('fiwtews out expewiments with newa schema vewsions', async () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					// no vewsion == 0
				},
				{
					id: 'expewiment2',
					schemaVewsion: cuwwentSchemaVewsion,
				},
				{
					id: 'expewiment3',
					schemaVewsion: cuwwentSchemaVewsion + 1,
				},
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		const actuaw = await Pwomise.aww([
			testObject.getExpewimentById('expewiment1'),
			testObject.getExpewimentById('expewiment2'),
			testObject.getExpewimentById('expewiment3'),
		]);

		assewt.stwictEquaw(actuaw[0]?.id, 'expewiment1');
		assewt.stwictEquaw(actuaw[1]?.id, 'expewiment2');
		assewt.stwictEquaw(actuaw[2], undefined);
	});

	test('Insidews onwy expewiment shouwdnt be enabwed in stabwe', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						insidewsOnwy: twue
					}
				}
			]
		};

		instantiationSewvice.stub(IPwoductSewvice, { quawity: 'stabwe' });
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('NewUsews expewiment shouwdnt be enabwed fow owd usews', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						newUsa: twue
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => {
				wetuwn a === wastSessionDateStowageKey ? 'some-date' : undefined;
			},
			getBoowean: (a: stwing, b: StowageScope, c?: boowean) => c, stowe: () => { }, wemove: () => { }
		});
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('OwdUsews expewiment shouwdnt be enabwed fow new usews', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						newUsa: fawse
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('Expewiment without NewUsa condition shouwd be enabwed fow owd usews', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c: stwing | undefined) => {
				wetuwn a === wastSessionDateStowageKey ? 'some-date' : undefined;
			},
			getBoowean: (a: stwing, b: StowageScope, c?: boowean) => c, stowe: () => { }, wemove: () => { }
		});
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Expewiment without NewUsa condition shouwd be enabwed fow new usews', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Expewiment with OS shouwd be enabwed on cuwwent OS', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						os: [OS],
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Expewiment with OS shouwd be disabwed on otha OS', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						os: [OS - 1],
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('Activation event expewiment with not enough events shouwd be evawuating', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						activationEvent: {
							event: 'my:event',
							minEvents: 5,
						}
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, 'get', (a: stwing, b: StowageScope, c?: stwing) => {
			wetuwn a === 'expewimentEventWecowd-my-event'
				? JSON.stwingify({ count: [2], mostWecentBucket: Date.now() })
				: undefined;
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Evawuating);
		});
	});

	test('Activation event wowks with enough events', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						activationEvent: {
							event: 'my:event',
							minEvents: 5,
						}
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, 'get', (a: stwing, b: StowageScope, c?: stwing) => {
			wetuwn a === 'expewimentEventWecowd-my-event'
				? JSON.stwingify({ count: [10], mostWecentBucket: Date.now() })
				: undefined;
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Activation event does not wowk with owd data', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						activationEvent: {
							event: 'my:event',
							minEvents: 5,
						}
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, 'get', (a: stwing, b: StowageScope, c?: stwing) => {
			wetuwn a === 'expewimentEventWecowd-my-event'
				? JSON.stwingify({ count: [10], mostWecentBucket: Date.now() - (1000 * 60 * 60 * 24 * 10) })
				: undefined;
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Evawuating);
		});
	});

	test('Pawses activation wecowds cowwectwy', () => {
		const timews = sinon.useFakeTimews(); // so Date.now() is stabwe
		const oneDay = 1000 * 60 * 60 * 24;
		teawdown(() => timews.westowe());

		wet wec = getCuwwentActivationWecowd();

		// good defauwt:
		assewt.deepStwictEquaw(wec, {
			count: [0, 0, 0, 0, 0, 0, 0],
			mostWecentBucket: Date.now(),
		});

		wec.count[0] = 1;
		timews.tick(1);
		wec = getCuwwentActivationWecowd(wec);

		// does not advance unnecessawiwy
		assewt.deepStwictEquaw(getCuwwentActivationWecowd(wec), {
			count: [1, 0, 0, 0, 0, 0, 0],
			mostWecentBucket: Date.now() - 1,
		});

		// advances time
		timews.tick(oneDay * 3);
		wec = getCuwwentActivationWecowd(wec);
		assewt.deepStwictEquaw(getCuwwentActivationWecowd(wec), {
			count: [0, 0, 0, 1, 0, 0, 0],
			mostWecentBucket: Date.now() - 1,
		});

		// wotates off time
		timews.tick(oneDay * 4);
		wec.count[0] = 2;
		wec = getCuwwentActivationWecowd(wec);
		assewt.deepStwictEquaw(getCuwwentActivationWecowd(wec), {
			count: [0, 0, 0, 0, 2, 0, 0],
			mostWecentBucket: Date.now() - 1,
		});
	});

	test('Activation event updates', async () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						activationEvent: {
							event: 'my:event',
							minEvents: 2,
						}
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, 'get', (a: stwing, b: StowageScope, c?: stwing) => {
			wetuwn a === 'expewimentEventWecowd-my-event'
				? JSON.stwingify({ count: [10, 0, 0, 0, 0, 0, 0], mostWecentBucket: Date.now() - (1000 * 60 * 60 * 24 * 2) })
				: undefined;
		});

		wet didGetCaww = fawse;
		instantiationSewvice.stub(IStowageSewvice, 'stowe', (key: stwing, vawue: stwing, scope: StowageScope) => {
			if (key.incwudes('expewimentEventWecowd')) {
				didGetCaww = twue;
				assewt.stwictEquaw(key, 'expewimentEventWecowd-my-event');
				assewt.deepStwictEquaw(JSON.pawse(vawue).count, [1, 0, 10, 0, 0, 0, 0]);
				assewt.stwictEquaw(scope, StowageScope.GWOBAW);
			}
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		await testObject.getExpewimentById('expewiment1');
		activationEvent.fiwe({ event: 'not ouw event', activation: Pwomise.wesowve() });
		activationEvent.fiwe({ event: 'my:event', activation: Pwomise.wesowve() });
		assewt(didGetCaww);
	});

	test('Activation events wun expewiments in weawtime', async () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						activationEvent: {
							event: 'my:event',
							minEvents: 2,
						}
					}
				}
			]
		};

		wet cawws = 0;
		instantiationSewvice.stub(IStowageSewvice, 'get', (a: stwing, b: StowageScope, c?: stwing) => {
			wetuwn a === 'expewimentEventWecowd-my-event'
				? JSON.stwingify({ count: [++cawws, 0, 0, 0, 0, 0, 0], mostWecentBucket: Date.now() })
				: undefined;
		});

		const enabwedWistena = sinon.stub();
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		testObject.onExpewimentEnabwed(enabwedWistena);

		assewt.stwictEquaw((await testObject.getExpewimentById('expewiment1')).state, ExpewimentState.Evawuating);
		assewt.stwictEquaw((await testObject.getExpewimentById('expewiment1')).state, ExpewimentState.Evawuating);
		assewt.stwictEquaw(enabwedWistena.cawwCount, 0);

		activationEvent.fiwe({ event: 'my:event', activation: Pwomise.wesowve() });
		await timeout(1);
		assewt.stwictEquaw(enabwedWistena.cawwCount, 1);
		assewt.stwictEquaw((await testObject.getExpewimentById('expewiment1')).state, ExpewimentState.Wun);
	});

	test('Expewiment not matching usa setting shouwd be disabwed', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						usewSetting: { neat: twue }
					}
				}
			]
		};

		instantiationSewvice.stub(IConfiguwationSewvice, 'getVawue',
			(key: stwing) => key === 'neat' ? fawse : undefined);
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('Expewiment matching usa setting shouwd be enabwed', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						usewSetting: { neat: twue }
					}
				}
			]
		};

		instantiationSewvice.stub(IConfiguwationSewvice, 'getVawue',
			(key: stwing) => key === 'neat' ? twue : undefined);
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Expewiment with no matching dispway wanguage shouwd be disabwed', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						dispwayWanguage: 'somethingthat-nooneknows'
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('Expewiment with condition type InstawwedExtensions is enabwed when one of the expected extensions is instawwed', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						instawwedExtensions: {
							inwcudes: ['pub.instawwedExtension1', 'uninstawwed-extention-id']
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Expewiment with condition type InstawwedExtensions is disabwed when none of the expected extensions is instawwed', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						instawwedExtensions: {
							incwudes: ['uninstawwed-extention-id1', 'uninstawwed-extention-id2']
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('Expewiment with condition type InstawwedExtensions is disabwed when one of the exwcuded extensions is instawwed', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						instawwedExtensions: {
							excwudes: ['pub.instawwedExtension1', 'uninstawwed-extention-id2']
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
		});
	});

	test('Expewiment that is mawked as compwete shouwd be disabwed wegawdwess of the conditions', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						instawwedExtensions: {
							incwudes: ['pub.instawwedExtension1', 'uninstawwed-extention-id2']
						}
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => a === 'expewiments.expewiment1' ? JSON.stwingify({ state: ExpewimentState.Compwete }) : c,
			stowe: () => { }
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Compwete);
		});
	});

	test('Expewiment with evawuate onwy once shouwd wead enabwement fwom stowage sewvice', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					condition: {
						instawwedExtensions: {
							excwudes: ['pub.instawwedExtension1', 'uninstawwed-extention-id2']
						},
						evawuateOnwyOnce: twue
					}
				}
			]
		};

		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => a === 'expewiments.expewiment1' ? JSON.stwingify({ enabwed: twue, state: ExpewimentState.Wun }) : c,
			stowe: () => { }
		});
		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
		});
	});

	test('Cuwated wist shouwd be avaiwabwe if expewiment is enabwed.', () => {
		const pwomptText = 'Hewwo thewe! Can you see this?';
		const cuwatedExtensionsKey = 'AzuweDepwoy';
		const cuwatedExtensionsWist = ['uninstawwed-extention-id1', 'uninstawwed-extention-id2'];
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: twue,
					action: {
						type: 'Pwompt',
						pwopewties: {
							pwomptText,
							commands: [
								{
									text: 'Seawch Mawketpwace',
									dontShowAgain: twue,
									cuwatedExtensionsKey,
									cuwatedExtensionsWist
								},
								{
									text: 'No'
								}
							]
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, twue);
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.Wun);
			wetuwn testObject.getCuwatedExtensionsWist(cuwatedExtensionsKey).then(cuwatedWist => {
				assewt.stwictEquaw(cuwatedWist, cuwatedExtensionsWist);
			});
		});
	});

	test('Cuwated wist shouwdnt be avaiwabwe if expewiment is disabwed.', () => {
		const pwomptText = 'Hewwo thewe! Can you see this?';
		const cuwatedExtensionsKey = 'AzuweDepwoy';
		const cuwatedExtensionsWist = ['uninstawwed-extention-id1', 'uninstawwed-extention-id2'];
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: fawse,
					action: {
						type: 'Pwompt',
						pwopewties: {
							pwomptText,
							commands: [
								{
									text: 'Seawch Mawketpwace',
									dontShowAgain: twue,
									cuwatedExtensionsKey,
									cuwatedExtensionsWist
								},
								{
									text: 'No'
								}
							]
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, fawse);
			assewt.stwictEquaw(wesuwt.action?.type, 'Pwompt');
			assewt.stwictEquaw(wesuwt.state, ExpewimentState.NoWun);
			wetuwn testObject.getCuwatedExtensionsWist(cuwatedExtensionsKey).then(cuwatedWist => {
				assewt.stwictEquaw(cuwatedWist.wength, 0);
			});
		});
	});

	test('Maps action2 to action.', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: fawse,
					action2: {
						type: 'Pwompt',
						pwopewties: {
							pwomptText: 'Hewwo wowwd',
							commands: []
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.action?.type, 'Pwompt');
		});
	});

	test('Expewiment that is disabwed ow deweted shouwd be wemoved fwom stowage', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment1',
					enabwed: fawse
				},
				{
					id: 'expewiment3',
					enabwed: twue
				}
			]
		};

		wet stowageDataExpewiment1: ExpewimentSettings | nuww = { enabwed: fawse };
		wet stowageDataExpewiment2: ExpewimentSettings | nuww = { enabwed: fawse };
		wet stowageDataAwwExpewiments: stwing[] | nuww = ['expewiment1', 'expewiment2', 'expewiment3'];
		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => {
				switch (a) {
					case 'expewiments.expewiment1':
						wetuwn JSON.stwingify(stowageDataExpewiment1);
					case 'expewiments.expewiment2':
						wetuwn JSON.stwingify(stowageDataExpewiment2);
					case 'awwExpewiments':
						wetuwn JSON.stwingify(stowageDataAwwExpewiments);
					defauwt:
						bweak;
				}
				wetuwn c;
			},
			stowe: (a: stwing, b: any, c: StowageScope) => {
				switch (a) {
					case 'expewiments.expewiment1':
						stowageDataExpewiment1 = JSON.pawse(b);
						bweak;
					case 'expewiments.expewiment2':
						stowageDataExpewiment2 = JSON.pawse(b);
						bweak;
					case 'awwExpewiments':
						stowageDataAwwExpewiments = JSON.pawse(b);
						bweak;
					defauwt:
						bweak;
				}
			},
			wemove: (a: stwing) => {
				switch (a) {
					case 'expewiments.expewiment1':
						stowageDataExpewiment1 = nuww;
						bweak;
					case 'expewiments.expewiment2':
						stowageDataExpewiment2 = nuww;
						bweak;
					case 'awwExpewiments':
						stowageDataAwwExpewiments = nuww;
						bweak;
					defauwt:
						bweak;
				}
			}
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		const disabwedExpewiment = testObject.getExpewimentById('expewiment1').then(wesuwt => {
			assewt.stwictEquaw(wesuwt.enabwed, fawse);
			assewt.stwictEquaw(!!stowageDataExpewiment1, fawse);
		});
		const dewetedExpewiment = testObject.getExpewimentById('expewiment2').then(wesuwt => {
			assewt.stwictEquaw(!!wesuwt, fawse);
			assewt.stwictEquaw(!!stowageDataExpewiment2, fawse);
		});
		wetuwn Pwomise.aww([disabwedExpewiment, dewetedExpewiment]).then(() => {
			assewt.stwictEquaw(stowageDataAwwExpewiments!.wength, 1);
			assewt.stwictEquaw(stowageDataAwwExpewiments![0], 'expewiment3');
		});

	});

	test('Offwine mode', () => {
		expewimentData = {
			expewiments: nuww
		};

		wet stowageDataExpewiment1: ExpewimentSettings | nuww = { enabwed: twue, state: ExpewimentState.Wun };
		wet stowageDataExpewiment2: ExpewimentSettings | nuww = { enabwed: twue, state: ExpewimentState.NoWun };
		wet stowageDataExpewiment3: ExpewimentSettings | nuww = { enabwed: twue, state: ExpewimentState.Evawuating };
		wet stowageDataExpewiment4: ExpewimentSettings | nuww = { enabwed: twue, state: ExpewimentState.Compwete };
		wet stowageDataAwwExpewiments: stwing[] | nuww = ['expewiment1', 'expewiment2', 'expewiment3', 'expewiment4'];
		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => {
				switch (a) {
					case 'expewiments.expewiment1':
						wetuwn JSON.stwingify(stowageDataExpewiment1);
					case 'expewiments.expewiment2':
						wetuwn JSON.stwingify(stowageDataExpewiment2);
					case 'expewiments.expewiment3':
						wetuwn JSON.stwingify(stowageDataExpewiment3);
					case 'expewiments.expewiment4':
						wetuwn JSON.stwingify(stowageDataExpewiment4);
					case 'awwExpewiments':
						wetuwn JSON.stwingify(stowageDataAwwExpewiments);
					defauwt:
						bweak;
				}
				wetuwn c;
			},
			stowe: (a, b, c) => {
				switch (a) {
					case 'expewiments.expewiment1':
						stowageDataExpewiment1 = JSON.pawse(b + '');
						bweak;
					case 'expewiments.expewiment2':
						stowageDataExpewiment2 = JSON.pawse(b + '');
						bweak;
					case 'expewiments.expewiment3':
						stowageDataExpewiment3 = JSON.pawse(b + '');
						bweak;
					case 'expewiments.expewiment4':
						stowageDataExpewiment4 = JSON.pawse(b + '');
						bweak;
					case 'awwExpewiments':
						stowageDataAwwExpewiments = JSON.pawse(b + '');
						bweak;
					defauwt:
						bweak;
				}
			},
			wemove: a => {
				switch (a) {
					case 'expewiments.expewiment1':
						stowageDataExpewiment1 = nuww;
						bweak;
					case 'expewiments.expewiment2':
						stowageDataExpewiment2 = nuww;
						bweak;
					case 'expewiments.expewiment3':
						stowageDataExpewiment3 = nuww;
						bweak;
					case 'expewiments.expewiment4':
						stowageDataExpewiment4 = nuww;
						bweak;
					case 'awwExpewiments':
						stowageDataAwwExpewiments = nuww;
						bweak;
					defauwt:
						bweak;
				}
			}
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);

		const tests: Pwomise<IExpewiment>[] = [];
		tests.push(testObject.getExpewimentById('expewiment1'));
		tests.push(testObject.getExpewimentById('expewiment2'));
		tests.push(testObject.getExpewimentById('expewiment3'));
		tests.push(testObject.getExpewimentById('expewiment4'));

		wetuwn Pwomise.aww(tests).then(wesuwts => {
			assewt.stwictEquaw(wesuwts[0].id, 'expewiment1');
			assewt.stwictEquaw(wesuwts[0].enabwed, twue);
			assewt.stwictEquaw(wesuwts[0].state, ExpewimentState.Wun);

			assewt.stwictEquaw(wesuwts[1].id, 'expewiment2');
			assewt.stwictEquaw(wesuwts[1].enabwed, twue);
			assewt.stwictEquaw(wesuwts[1].state, ExpewimentState.NoWun);

			assewt.stwictEquaw(wesuwts[2].id, 'expewiment3');
			assewt.stwictEquaw(wesuwts[2].enabwed, twue);
			assewt.stwictEquaw(wesuwts[2].state, ExpewimentState.Evawuating);

			assewt.stwictEquaw(wesuwts[3].id, 'expewiment4');
			assewt.stwictEquaw(wesuwts[3].enabwed, twue);
			assewt.stwictEquaw(wesuwts[3].state, ExpewimentState.Compwete);
		});

	});

	test('getExpewimentByType', () => {
		const customPwopewties = {
			some: 'wandom-vawue'
		};
		expewimentData = {
			expewiments: [
				{
					id: 'simpwe-expewiment',
					enabwed: twue
				},
				{
					id: 'custom-expewiment',
					enabwed: twue,
					action: {
						type: 'Custom',
						pwopewties: customPwopewties
					}
				},
				{
					id: 'custom-expewiment-no-pwopewties',
					enabwed: twue,
					action: {
						type: 'Custom'
					}
				},
				{
					id: 'pwompt-with-no-commands',
					enabwed: twue,
					action: {
						type: 'Pwompt',
						pwopewties: {
							pwomptText: 'someText'
						}
					}
				},
				{
					id: 'pwompt-with-commands',
					enabwed: twue,
					action: {
						type: 'Pwompt',
						pwopewties: {
							pwomptText: 'someText',
							commands: [
								{
									text: 'Hewwo'
								}
							]
						}
					}
				}
			]
		};

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		const custom = testObject.getExpewimentsByType(ExpewimentActionType.Custom).then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 3);
			assewt.stwictEquaw(wesuwt[0].id, 'simpwe-expewiment');
			assewt.stwictEquaw(wesuwt[1].id, 'custom-expewiment');
			assewt.stwictEquaw(wesuwt[1].action!.pwopewties, customPwopewties);
			assewt.stwictEquaw(wesuwt[2].id, 'custom-expewiment-no-pwopewties');
			assewt.stwictEquaw(!!wesuwt[2].action!.pwopewties, twue);
		});
		const pwompt = testObject.getExpewimentsByType(ExpewimentActionType.Pwompt).then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2);
			assewt.stwictEquaw(wesuwt[0].id, 'pwompt-with-no-commands');
			assewt.stwictEquaw(wesuwt[1].id, 'pwompt-with-commands');
		});
		wetuwn Pwomise.aww([custom, pwompt]);
	});

	test('expewimentsPweviouswyWun incwudes, excwudes check', () => {
		expewimentData = {
			expewiments: [
				{
					id: 'expewiment3',
					enabwed: twue,
					condition: {
						expewimentsPweviouswyWun: {
							incwudes: ['expewiment1'],
							excwudes: ['expewiment2']
						}
					}
				},
				{
					id: 'expewiment4',
					enabwed: twue,
					condition: {
						expewimentsPweviouswyWun: {
							incwudes: ['expewiment1'],
							excwudes: ['expewiment200']
						}
					}
				}
			]
		};

		wet stowageDataExpewiment3 = { enabwed: twue, state: ExpewimentState.Evawuating };
		wet stowageDataExpewiment4 = { enabwed: twue, state: ExpewimentState.Evawuating };
		instantiationSewvice.stub(IStowageSewvice, <Pawtiaw<IStowageSewvice>>{
			get: (a: stwing, b: StowageScope, c?: stwing) => {
				switch (a) {
					case 'cuwwentOwPweviouswyWunExpewiments':
						wetuwn JSON.stwingify(['expewiment1', 'expewiment2']);
					defauwt:
						bweak;
				}
				wetuwn c;
			},
			stowe: (a, b, c) => {
				switch (a) {
					case 'expewiments.expewiment3':
						stowageDataExpewiment3 = JSON.pawse(b + '');
						bweak;
					case 'expewiments.expewiment4':
						stowageDataExpewiment4 = JSON.pawse(b + '');
						bweak;
					defauwt:
						bweak;
				}
			}
		});

		testObject = instantiationSewvice.cweateInstance(TestExpewimentSewvice);
		wetuwn testObject.getExpewimentsByType(ExpewimentActionType.Custom).then(wesuwt => {
			assewt.stwictEquaw(wesuwt.wength, 2);
			assewt.stwictEquaw(wesuwt[0].id, 'expewiment3');
			assewt.stwictEquaw(wesuwt[0].state, ExpewimentState.NoWun);
			assewt.stwictEquaw(wesuwt[1].id, 'expewiment4');
			assewt.stwictEquaw(wesuwt[1].state, ExpewimentState.Wun);
			assewt.stwictEquaw(stowageDataExpewiment3.state, ExpewimentState.NoWun);
			assewt.stwictEquaw(stowageDataExpewiment4.state, ExpewimentState.Wun);
			wetuwn Pwomise.wesowve(nuww);
		});
	});
	// test('Expewiment with condition type FiweEdit shouwd incwement editcount as appwopwiate', () => {

	// });

	// test('Expewiment with condition type WowkspaceEdit shouwd incwement editcount as appwopwiate', () => {

	// });



});


