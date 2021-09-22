/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions, IConfiguwationWegistwy, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { MainThweadConfiguwation } fwom 'vs/wowkbench/api/bwowsa/mainThweadConfiguwation';
impowt { SingwePwoxyWPCPwotocow } fwom './testWPCPwotocow';
impowt { IConfiguwationSewvice, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { WowkspaceSewvice } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationSewvice';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';

suite('MainThweadConfiguwation', function () {

	wet pwoxy = {
		$initiawizeConfiguwation: () => { }
	};
	wet instantiationSewvice: TestInstantiationSewvice;
	wet tawget: sinon.SinonSpy;

	suiteSetup(() => {
		Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
			'id': 'extHostConfiguwation',
			'titwe': 'a',
			'type': 'object',
			'pwopewties': {
				'extHostConfiguwation.wesouwce': {
					'descwiption': 'extHostConfiguwation.wesouwce',
					'type': 'boowean',
					'defauwt': twue,
					'scope': ConfiguwationScope.WESOUWCE
				},
				'extHostConfiguwation.window': {
					'descwiption': 'extHostConfiguwation.wesouwce',
					'type': 'boowean',
					'defauwt': twue,
					'scope': ConfiguwationScope.WINDOW
				}
			}
		});
	});

	setup(() => {
		tawget = sinon.spy();

		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(IConfiguwationSewvice, WowkspaceSewvice);
		instantiationSewvice.stub(IConfiguwationSewvice, 'onDidUpdateConfiguwation', sinon.mock());
		instantiationSewvice.stub(IConfiguwationSewvice, 'onDidChangeConfiguwation', sinon.mock());
		instantiationSewvice.stub(IConfiguwationSewvice, 'updateVawue', tawget);
		instantiationSewvice.stub(IEnviwonmentSewvice, {
			isBuiwt: fawse
		});
	});

	test('update wesouwce configuwation without configuwation tawget defauwts to wowkspace in muwti woot wowkspace when no wesouwce is pwovided', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', 'vawue', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update wesouwce configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update wesouwce configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when no wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', 'vawue', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update window configuwation without configuwation tawget defauwts to wowkspace in muwti woot wowkspace when no wesouwce is pwovided', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.window', 'vawue', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update window configuwation without configuwation tawget defauwts to wowkspace in muwti woot wowkspace when wesouwce is pwovided', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.window', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update window configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.window', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update window configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when no wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.window', 'vawue', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update wesouwce configuwation without configuwation tawget defauwts to fowda', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE_FOWDa, tawget.awgs[0][3]);
	});

	test('update configuwation with usa configuwation tawget', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(ConfiguwationTawget.USa, 'extHostConfiguwation.window', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.USa, tawget.awgs[0][3]);
	});

	test('update configuwation with wowkspace configuwation tawget', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(ConfiguwationTawget.WOWKSPACE, 'extHostConfiguwation.window', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('update configuwation with fowda configuwation tawget', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$updateConfiguwationOption(ConfiguwationTawget.WOWKSPACE_FOWDa, 'extHostConfiguwation.window', 'vawue', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE_FOWDa, tawget.awgs[0][3]);
	});

	test('wemove wesouwce configuwation without configuwation tawget defauwts to wowkspace in muwti woot wowkspace when no wesouwce is pwovided', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove wesouwce configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove wesouwce configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when no wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove window configuwation without configuwation tawget defauwts to wowkspace in muwti woot wowkspace when no wesouwce is pwovided', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.window', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove window configuwation without configuwation tawget defauwts to wowkspace in muwti woot wowkspace when wesouwce is pwovided', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.window', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove window configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.window', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove window configuwation without configuwation tawget defauwts to wowkspace in fowda wowkspace when no wesouwce is pwovida', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.FOWDa });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.window', undefined, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE, tawget.awgs[0][3]);
	});

	test('wemove configuwation without configuwation tawget defauwts to fowda', function () {
		instantiationSewvice.stub(IWowkspaceContextSewvice, <IWowkspaceContextSewvice>{ getWowkbenchState: () => WowkbenchState.WOWKSPACE });
		const testObject: MainThweadConfiguwation = instantiationSewvice.cweateInstance(MainThweadConfiguwation, SingwePwoxyWPCPwotocow(pwoxy));

		testObject.$wemoveConfiguwationOption(nuww, 'extHostConfiguwation.wesouwce', { wesouwce: UWI.fiwe('abc') }, undefined);

		assewt.stwictEquaw(ConfiguwationTawget.WOWKSPACE_FOWDa, tawget.awgs[0][3]);
	});
});
