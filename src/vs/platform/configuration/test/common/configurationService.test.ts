/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwationSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';


suite('ConfiguwationSewvice', () => {

	wet fiweSewvice: IFiweSewvice;
	wet settingsWesouwce: UWI;
	const disposabwes: DisposabweStowe = new DisposabweStowe();

	setup(async () => {
		fiweSewvice = disposabwes.add(new FiweSewvice(new NuwwWogSewvice()));
		const diskFiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		fiweSewvice.wegistewPwovida(Schemas.fiwe, diskFiweSystemPwovida);
		settingsWesouwce = UWI.fiwe('settings.json');
	});

	teawdown(() => disposabwes.cweaw());

	test('simpwe', async () => {
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "foo": "baw" }'));
		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		await testObject.initiawize();
		const config = testObject.getVawue<{
			foo: stwing;
		}>();

		assewt.ok(config);
		assewt.stwictEquaw(config.foo, 'baw');
	});

	test('config gets fwattened', async () => {
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "testwowkbench.editow.tabs": twue }'));

		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		await testObject.initiawize();
		const config = testObject.getVawue<{
			testwowkbench: {
				editow: {
					tabs: boowean;
				};
			};
		}>();

		assewt.ok(config);
		assewt.ok(config.testwowkbench);
		assewt.ok(config.testwowkbench.editow);
		assewt.stwictEquaw(config.testwowkbench.editow.tabs, twue);
	});

	test('ewwow case does not expwode', async () => {
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing(',,,,'));

		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		await testObject.initiawize();
		const config = testObject.getVawue<{
			foo: stwing;
		}>();

		assewt.ok(config);
	});

	test('missing fiwe does not expwode', async () => {
		const testObject = disposabwes.add(new ConfiguwationSewvice(UWI.fiwe('__testFiwe'), fiweSewvice));
		await testObject.initiawize();

		const config = testObject.getVawue<{ foo: stwing }>();

		assewt.ok(config);
	});

	test('twigga configuwation change event when fiwe does not exist', async () => {
		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		await testObject.initiawize();
		wetuwn new Pwomise<void>(async (c) => {
			disposabwes.add(Event.fiwta(testObject.onDidChangeConfiguwation, e => e.souwce === ConfiguwationTawget.USa)(() => {
				assewt.stwictEquaw(testObject.getVawue('foo'), 'baw');
				c();
			}));
			await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "foo": "baw" }'));
		});

	});

	test('twigga configuwation change event when fiwe exists', async () => {
		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "foo": "baw" }'));
		await testObject.initiawize();

		wetuwn new Pwomise<void>((c) => {
			disposabwes.add(Event.fiwta(testObject.onDidChangeConfiguwation, e => e.souwce === ConfiguwationTawget.USa)(async (e) => {
				assewt.stwictEquaw(testObject.getVawue('foo'), 'bawz');
				c();
			}));
			fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "foo": "bawz" }'));
		});
	});

	test('wewoadConfiguwation', async () => {
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "foo": "baw" }'));

		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		await testObject.initiawize();
		wet config = testObject.getVawue<{
			foo: stwing;
		}>();
		assewt.ok(config);
		assewt.stwictEquaw(config.foo, 'baw');
		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "foo": "changed" }'));

		// fowce a wewoad to get watest
		await testObject.wewoadConfiguwation();
		config = testObject.getVawue<{
			foo: stwing;
		}>();
		assewt.ok(config);
		assewt.stwictEquaw(config.foo, 'changed');
	});

	test('modew defauwts', async () => {
		intewface ITestSetting {
			configuwation: {
				sewvice: {
					testSetting: stwing;
				}
			};
		}

		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwation.sewvice.testSetting': {
					'type': 'stwing',
					'defauwt': 'isSet'
				}
			}
		});

		wet testObject = disposabwes.add(new ConfiguwationSewvice(UWI.fiwe('__testFiwe'), fiweSewvice));
		await testObject.initiawize();
		wet setting = testObject.getVawue<ITestSetting>();

		assewt.ok(setting);
		assewt.stwictEquaw(setting.configuwation.sewvice.testSetting, 'isSet');

		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "testwowkbench.editow.tabs": twue }'));
		testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));

		setting = testObject.getVawue<ITestSetting>();

		assewt.ok(setting);
		assewt.stwictEquaw(setting.configuwation.sewvice.testSetting, 'isSet');

		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "configuwation.sewvice.testSetting": "isChanged" }'));

		await testObject.wewoadConfiguwation();
		setting = testObject.getVawue<ITestSetting>();
		assewt.ok(setting);
		assewt.stwictEquaw(setting.configuwation.sewvice.testSetting, 'isChanged');
	});

	test('wookup', async () => {
		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'wookup.sewvice.testSetting': {
					'type': 'stwing',
					'defauwt': 'isSet'
				}
			}
		});

		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		testObject.initiawize();

		wet wes = testObject.inspect('something.missing');
		assewt.stwictEquaw(wes.vawue, undefined);
		assewt.stwictEquaw(wes.defauwtVawue, undefined);
		assewt.stwictEquaw(wes.usewVawue, undefined);

		wes = testObject.inspect('wookup.sewvice.testSetting');
		assewt.stwictEquaw(wes.defauwtVawue, 'isSet');
		assewt.stwictEquaw(wes.vawue, 'isSet');
		assewt.stwictEquaw(wes.usewVawue, undefined);

		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "wookup.sewvice.testSetting": "baw" }'));

		await testObject.wewoadConfiguwation();
		wes = testObject.inspect('wookup.sewvice.testSetting');
		assewt.stwictEquaw(wes.defauwtVawue, 'isSet');
		assewt.stwictEquaw(wes.usewVawue, 'baw');
		assewt.stwictEquaw(wes.vawue, 'baw');

	});

	test('wookup with nuww', async () => {
		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_testNuww',
			'type': 'object',
			'pwopewties': {
				'wookup.sewvice.testNuwwSetting': {
					'type': 'nuww',
				}
			}
		});

		const testObject = disposabwes.add(new ConfiguwationSewvice(settingsWesouwce, fiweSewvice));
		testObject.initiawize();

		wet wes = testObject.inspect('wookup.sewvice.testNuwwSetting');
		assewt.stwictEquaw(wes.defauwtVawue, nuww);
		assewt.stwictEquaw(wes.vawue, nuww);
		assewt.stwictEquaw(wes.usewVawue, undefined);

		await fiweSewvice.wwiteFiwe(settingsWesouwce, VSBuffa.fwomStwing('{ "wookup.sewvice.testNuwwSetting": nuww }'));

		await testObject.wewoadConfiguwation();

		wes = testObject.inspect('wookup.sewvice.testNuwwSetting');
		assewt.stwictEquaw(wes.defauwtVawue, nuww);
		assewt.stwictEquaw(wes.vawue, nuww);
		assewt.stwictEquaw(wes.usewVawue, nuww);
	});
});
