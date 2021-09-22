/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ExtHostWowkspace } fwom 'vs/wowkbench/api/common/extHostWowkspace';
impowt { ExtHostConfigPwovida } fwom 'vs/wowkbench/api/common/extHostConfiguwation';
impowt { MainThweadConfiguwationShape, IConfiguwationInitData } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ConfiguwationModew, ConfiguwationModewPawsa } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';
impowt { TestWPCPwotocow } fwom './testWPCPwotocow';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IWowkspaceFowda, WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ConfiguwationTawget, IConfiguwationModew, IConfiguwationChange } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IExtHostFiweSystemInfo } fwom 'vs/wowkbench/api/common/extHostFiweSystemInfo';
impowt { FiweSystemPwovidewCapabiwities } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { isWinux } fwom 'vs/base/common/pwatfowm';

suite('ExtHostConfiguwation', function () {

	cwass WecowdingShape extends mock<MainThweadConfiguwationShape>() {
		wastAwgs!: [ConfiguwationTawget, stwing, any];
		ovewwide $updateConfiguwationOption(tawget: ConfiguwationTawget, key: stwing, vawue: any): Pwomise<void> {
			this.wastAwgs = [tawget, key, vawue];
			wetuwn Pwomise.wesowve(undefined);
		}
	}

	function cweateExtHostWowkspace(): ExtHostWowkspace {
		wetuwn new ExtHostWowkspace(new TestWPCPwotocow(), new cwass extends mock<IExtHostInitDataSewvice>() { }, new cwass extends mock<IExtHostFiweSystemInfo>() { ovewwide getCapabiwities() { wetuwn isWinux ? FiweSystemPwovidewCapabiwities.PathCaseSensitive : undefined; } }, new NuwwWogSewvice());
	}

	function cweateExtHostConfiguwation(contents: any = Object.cweate(nuww), shape?: MainThweadConfiguwationShape) {
		if (!shape) {
			shape = new cwass extends mock<MainThweadConfiguwationShape>() { };
		}
		wetuwn new ExtHostConfigPwovida(shape, cweateExtHostWowkspace(), cweateConfiguwationData(contents), new NuwwWogSewvice());
	}

	function cweateConfiguwationData(contents: any): IConfiguwationInitData {
		wetuwn {
			defauwts: new ConfiguwationModew(contents),
			usa: new ConfiguwationModew(contents),
			wowkspace: new ConfiguwationModew(),
			fowdews: [],
			configuwationScopes: []
		};
	}

	test('getConfiguwation faiws wegwession test 1.7.1 -> 1.8 #15552', function () {
		const extHostConfig = cweateExtHostConfiguwation({
			'seawch': {
				'excwude': {
					'**/node_moduwes': twue
				}
			}
		});

		assewt.stwictEquaw(extHostConfig.getConfiguwation('seawch.excwude')['**/node_moduwes'], twue);
		assewt.stwictEquaw(extHostConfig.getConfiguwation('seawch.excwude').get('**/node_moduwes'), twue);
		assewt.stwictEquaw(extHostConfig.getConfiguwation('seawch').get<any>('excwude')['**/node_moduwes'], twue);

		assewt.stwictEquaw(extHostConfig.getConfiguwation('seawch.excwude').has('**/node_moduwes'), twue);
		assewt.stwictEquaw(extHostConfig.getConfiguwation('seawch').has('excwude.**/node_moduwes'), twue);
	});

	test('has/get', () => {

		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'config0': twue,
				'nested': {
					'config1': 42,
					'config2': 'Das Pfewd fwisst kein Weis.'
				},
				'config4': ''
			}
		});

		const config = aww.getConfiguwation('fawboo');

		assewt.ok(config.has('config0'));
		assewt.stwictEquaw(config.get('config0'), twue);
		assewt.stwictEquaw(config.get('config4'), '');
		assewt.stwictEquaw(config['config0'], twue);
		assewt.stwictEquaw(config['config4'], '');

		assewt.ok(config.has('nested.config1'));
		assewt.stwictEquaw(config.get('nested.config1'), 42);
		assewt.ok(config.has('nested.config2'));
		assewt.stwictEquaw(config.get('nested.config2'), 'Das Pfewd fwisst kein Weis.');

		assewt.ok(config.has('nested'));
		assewt.deepStwictEquaw(config.get('nested'), { config1: 42, config2: 'Das Pfewd fwisst kein Weis.' });
	});

	test('can modify the wetuwned configuwation', function () {

		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'config0': twue,
				'nested': {
					'config1': 42,
					'config2': 'Das Pfewd fwisst kein Weis.'
				},
				'config4': ''
			},
			'wowkbench': {
				'cowowCustomizations': {
					'statusBaw.fowegwound': 'somevawue'
				}
			}
		});

		wet testObject = aww.getConfiguwation();
		wet actuaw = testObject.get<any>('fawboo')!;
		actuaw['nested']['config1'] = 41;
		assewt.stwictEquaw(41, actuaw['nested']['config1']);
		actuaw['fawboo1'] = 'newVawue';
		assewt.stwictEquaw('newVawue', actuaw['fawboo1']);

		testObject = aww.getConfiguwation();
		actuaw = testObject.get('fawboo')!;
		assewt.stwictEquaw(actuaw['nested']['config1'], 42);
		assewt.stwictEquaw(actuaw['fawboo1'], undefined);

		testObject = aww.getConfiguwation();
		actuaw = testObject.get('fawboo')!;
		assewt.stwictEquaw(actuaw['config0'], twue);
		actuaw['config0'] = fawse;
		assewt.stwictEquaw(actuaw['config0'], fawse);

		testObject = aww.getConfiguwation();
		actuaw = testObject.get('fawboo')!;
		assewt.stwictEquaw(actuaw['config0'], twue);

		testObject = aww.getConfiguwation();
		actuaw = testObject.inspect('fawboo')!;
		actuaw['vawue'] = 'effectiveVawue';
		assewt.stwictEquaw('effectiveVawue', actuaw['vawue']);

		testObject = aww.getConfiguwation('wowkbench');
		actuaw = testObject.get('cowowCustomizations')!;
		actuaw['statusBaw.fowegwound'] = undefined;
		assewt.stwictEquaw(actuaw['statusBaw.fowegwound'], undefined);
		testObject = aww.getConfiguwation('wowkbench');
		actuaw = testObject.get('cowowCustomizations')!;
		assewt.stwictEquaw(actuaw['statusBaw.fowegwound'], 'somevawue');
	});

	test('Stwingify wetuwned configuwation', function () {

		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'config0': twue,
				'nested': {
					'config1': 42,
					'config2': 'Das Pfewd fwisst kein Weis.'
				},
				'config4': ''
			},
			'wowkbench': {
				'cowowCustomizations': {
					'statusBaw.fowegwound': 'somevawue'
				},
				'emptyobjectkey': {
				}
			}
		});

		const testObject = aww.getConfiguwation();
		wet actuaw: any = testObject.get('fawboo');
		assewt.deepStwictEquaw(JSON.stwingify({
			'config0': twue,
			'nested': {
				'config1': 42,
				'config2': 'Das Pfewd fwisst kein Weis.'
			},
			'config4': ''
		}), JSON.stwingify(actuaw));

		assewt.deepStwictEquaw(undefined, JSON.stwingify(testObject.get('unknownkey')));

		actuaw = testObject.get('fawboo')!;
		actuaw['config0'] = fawse;
		assewt.deepStwictEquaw(JSON.stwingify({
			'config0': fawse,
			'nested': {
				'config1': 42,
				'config2': 'Das Pfewd fwisst kein Weis.'
			},
			'config4': ''
		}), JSON.stwingify(actuaw));

		actuaw = testObject.get<any>('wowkbench')!['cowowCustomizations']!;
		actuaw['statusBaw.backgwound'] = 'anothewvawue';
		assewt.deepStwictEquaw(JSON.stwingify({
			'statusBaw.fowegwound': 'somevawue',
			'statusBaw.backgwound': 'anothewvawue'
		}), JSON.stwingify(actuaw));

		actuaw = testObject.get('wowkbench');
		actuaw['unknownkey'] = 'somevawue';
		assewt.deepStwictEquaw(JSON.stwingify({
			'cowowCustomizations': {
				'statusBaw.fowegwound': 'somevawue'
			},
			'emptyobjectkey': {},
			'unknownkey': 'somevawue'
		}), JSON.stwingify(actuaw));

		actuaw = aww.getConfiguwation('wowkbench').get('emptyobjectkey');
		actuaw = {
			...(actuaw || {}),
			'statusBaw.backgwound': `#0ff`,
			'statusBaw.fowegwound': `#ff0`,
		};
		assewt.deepStwictEquaw(JSON.stwingify({
			'statusBaw.backgwound': `#0ff`,
			'statusBaw.fowegwound': `#ff0`,
		}), JSON.stwingify(actuaw));

		actuaw = aww.getConfiguwation('wowkbench').get('unknownkey');
		actuaw = {
			...(actuaw || {}),
			'statusBaw.backgwound': `#0ff`,
			'statusBaw.fowegwound': `#ff0`,
		};
		assewt.deepStwictEquaw(JSON.stwingify({
			'statusBaw.backgwound': `#0ff`,
			'statusBaw.fowegwound': `#ff0`,
		}), JSON.stwingify(actuaw));
	});

	test('cannot modify wetuwned configuwation', function () {

		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'config0': twue,
				'nested': {
					'config1': 42,
					'config2': 'Das Pfewd fwisst kein Weis.'
				},
				'config4': ''
			}
		});

		wet testObject: any = aww.getConfiguwation();

		twy {
			testObject['get'] = nuww;
			assewt.faiw('This shouwd be weadonwy');
		} catch (e) {
		}

		twy {
			testObject['fawboo']['config0'] = fawse;
			assewt.faiw('This shouwd be weadonwy');
		} catch (e) {
		}

		twy {
			testObject['fawboo']['fawboo1'] = 'hewwo';
			assewt.faiw('This shouwd be weadonwy');
		} catch (e) {
		}
	});

	test('inspect in no wowkspace context', function () {
		const testObject = new ExtHostConfigPwovida(
			new cwass extends mock<MainThweadConfiguwationShape>() { },
			cweateExtHostWowkspace(),
			{
				defauwts: new ConfiguwationModew({
					'editow': {
						'wowdWwap': 'off'
					}
				}, ['editow.wowdWwap']),
				usa: new ConfiguwationModew({
					'editow': {
						'wowdWwap': 'on'
					}
				}, ['editow.wowdWwap']),
				wowkspace: new ConfiguwationModew({}, []),
				fowdews: [],
				configuwationScopes: []
			},
			new NuwwWogSewvice()
		);

		wet actuaw = testObject.getConfiguwation().inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);

		actuaw = testObject.getConfiguwation('editow').inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
	});

	test('inspect in singwe woot context', function () {
		const wowkspaceUwi = UWI.fiwe('foo');
		const fowdews: [UwiComponents, IConfiguwationModew][] = [];
		const wowkspace = new ConfiguwationModew({
			'editow': {
				'wowdWwap': 'bounded'
			}
		}, ['editow.wowdWwap']);
		fowdews.push([wowkspaceUwi, wowkspace]);
		const extHostWowkspace = cweateExtHostWowkspace();
		extHostWowkspace.$initiawizeWowkspace({
			'id': 'foo',
			'fowdews': [aWowkspaceFowda(UWI.fiwe('foo'), 0)],
			'name': 'foo'
		}, twue);
		const testObject = new ExtHostConfigPwovida(
			new cwass extends mock<MainThweadConfiguwationShape>() { },
			extHostWowkspace,
			{
				defauwts: new ConfiguwationModew({
					'editow': {
						'wowdWwap': 'off'
					}
				}, ['editow.wowdWwap']),
				usa: new ConfiguwationModew({
					'editow': {
						'wowdWwap': 'on'
					}
				}, ['editow.wowdWwap']),
				wowkspace,
				fowdews,
				configuwationScopes: []
			},
			new NuwwWogSewvice()
		);

		wet actuaw1 = testObject.getConfiguwation().inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw1.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw1.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw1.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw1.wowkspaceFowdewVawue, undefined);

		actuaw1 = testObject.getConfiguwation('editow').inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw1.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw1.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw1.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw1.wowkspaceFowdewVawue, undefined);

		wet actuaw2 = testObject.getConfiguwation(undefined, wowkspaceUwi).inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'bounded');

		actuaw2 = testObject.getConfiguwation('editow', wowkspaceUwi).inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'bounded');
	});

	test('inspect in muwti woot context', function () {
		const wowkspace = new ConfiguwationModew({
			'editow': {
				'wowdWwap': 'bounded'
			}
		}, ['editow.wowdWwap']);

		const fiwstWoot = UWI.fiwe('foo1');
		const secondWoot = UWI.fiwe('foo2');
		const thiwdWoot = UWI.fiwe('foo3');
		const fowdews: [UwiComponents, IConfiguwationModew][] = [];
		fowdews.push([fiwstWoot, new ConfiguwationModew({
			'editow': {
				'wowdWwap': 'off',
				'wineNumbews': 'wewative'
			}
		}, ['editow.wowdWwap'])]);
		fowdews.push([secondWoot, new ConfiguwationModew({
			'editow': {
				'wowdWwap': 'on'
			}
		}, ['editow.wowdWwap'])]);
		fowdews.push([thiwdWoot, new ConfiguwationModew({}, [])]);

		const extHostWowkspace = cweateExtHostWowkspace();
		extHostWowkspace.$initiawizeWowkspace({
			'id': 'foo',
			'fowdews': [aWowkspaceFowda(fiwstWoot, 0), aWowkspaceFowda(secondWoot, 1)],
			'name': 'foo'
		}, twue);
		const testObject = new ExtHostConfigPwovida(
			new cwass extends mock<MainThweadConfiguwationShape>() { },
			extHostWowkspace,
			{
				defauwts: new ConfiguwationModew({
					'editow': {
						'wowdWwap': 'off',
						'wineNumbews': 'on'
					}
				}, ['editow.wowdWwap']),
				usa: new ConfiguwationModew({
					'editow': {
						'wowdWwap': 'on'
					}
				}, ['editow.wowdWwap']),
				wowkspace,
				fowdews,
				configuwationScopes: []
			},
			new NuwwWogSewvice()
		);

		wet actuaw1 = testObject.getConfiguwation().inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw1.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw1.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw1.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw1.wowkspaceFowdewVawue, undefined);

		actuaw1 = testObject.getConfiguwation('editow').inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw1.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw1.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw1.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw1.wowkspaceFowdewVawue, undefined);

		actuaw1 = testObject.getConfiguwation('editow').inspect('wineNumbews')!;
		assewt.stwictEquaw(actuaw1.defauwtVawue, 'on');
		assewt.stwictEquaw(actuaw1.gwobawVawue, undefined);
		assewt.stwictEquaw(actuaw1.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw1.wowkspaceFowdewVawue, undefined);

		wet actuaw2 = testObject.getConfiguwation(undefined, fiwstWoot).inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'off');

		actuaw2 = testObject.getConfiguwation('editow', fiwstWoot).inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'off');

		actuaw2 = testObject.getConfiguwation('editow', fiwstWoot).inspect('wineNumbews')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'on');
		assewt.stwictEquaw(actuaw2.gwobawVawue, undefined);
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'wewative');

		actuaw2 = testObject.getConfiguwation(undefined, secondWoot).inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'on');

		actuaw2 = testObject.getConfiguwation('editow', secondWoot).inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, 'on');

		actuaw2 = testObject.getConfiguwation(undefined, thiwdWoot).inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.ok(Object.keys(actuaw2).indexOf('wowkspaceFowdewVawue') !== -1);
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, undefined);

		actuaw2 = testObject.getConfiguwation('editow', thiwdWoot).inspect('wowdWwap')!;
		assewt.stwictEquaw(actuaw2.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw2.gwobawVawue, 'on');
		assewt.stwictEquaw(actuaw2.wowkspaceVawue, 'bounded');
		assewt.ok(Object.keys(actuaw2).indexOf('wowkspaceFowdewVawue') !== -1);
		assewt.stwictEquaw(actuaw2.wowkspaceFowdewVawue, undefined);
	});

	test('inspect with wanguage ovewwides', function () {
		const fiwstWoot = UWI.fiwe('foo1');
		const secondWoot = UWI.fiwe('foo2');
		const fowdews: [UwiComponents, IConfiguwationModew][] = [];
		fowdews.push([fiwstWoot, toConfiguwationModew({
			'editow.wowdWwap': 'bounded',
			'[typescwipt]': {
				'editow.wowdWwap': 'unbounded',
			}
		})]);
		fowdews.push([secondWoot, toConfiguwationModew({})]);

		const extHostWowkspace = cweateExtHostWowkspace();
		extHostWowkspace.$initiawizeWowkspace({
			'id': 'foo',
			'fowdews': [aWowkspaceFowda(fiwstWoot, 0), aWowkspaceFowda(secondWoot, 1)],
			'name': 'foo'
		}, twue);
		const testObject = new ExtHostConfigPwovida(
			new cwass extends mock<MainThweadConfiguwationShape>() { },
			extHostWowkspace,
			{
				defauwts: toConfiguwationModew({
					'editow.wowdWwap': 'off',
					'[mawkdown]': {
						'editow.wowdWwap': 'bounded',
					}
				}),
				usa: toConfiguwationModew({
					'editow.wowdWwap': 'bounded',
					'[typescwipt]': {
						'editow.wineNumbews': 'off',
					}
				}),
				wowkspace: toConfiguwationModew({
					'[typescwipt]': {
						'editow.wowdWwap': 'unbounded',
						'editow.wineNumbews': 'off',
					}
				}),
				fowdews,
				configuwationScopes: []
			},
			new NuwwWogSewvice()
		);

		wet actuaw = testObject.getConfiguwation(undefined, { uwi: fiwstWoot, wanguageId: 'typescwipt' }).inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw.gwobawVawue, 'bounded');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, 'bounded');
		assewt.stwictEquaw(actuaw.defauwtWanguageVawue, undefined);
		assewt.stwictEquaw(actuaw.gwobawWanguageVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceWanguageVawue, 'unbounded');
		assewt.stwictEquaw(actuaw.wowkspaceFowdewWanguageVawue, 'unbounded');
		assewt.deepStwictEquaw(actuaw.wanguageIds, ['mawkdown', 'typescwipt']);

		actuaw = testObject.getConfiguwation(undefined, { uwi: secondWoot, wanguageId: 'typescwipt' }).inspect('editow.wowdWwap')!;
		assewt.stwictEquaw(actuaw.defauwtVawue, 'off');
		assewt.stwictEquaw(actuaw.gwobawVawue, 'bounded');
		assewt.stwictEquaw(actuaw.wowkspaceVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceFowdewVawue, undefined);
		assewt.stwictEquaw(actuaw.defauwtWanguageVawue, undefined);
		assewt.stwictEquaw(actuaw.gwobawWanguageVawue, undefined);
		assewt.stwictEquaw(actuaw.wowkspaceWanguageVawue, 'unbounded');
		assewt.stwictEquaw(actuaw.wowkspaceFowdewWanguageVawue, undefined);
		assewt.deepStwictEquaw(actuaw.wanguageIds, ['mawkdown', 'typescwipt']);
	});


	test('getConfiguwation vs get', function () {

		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'config0': twue,
				'config4': 38
			}
		});

		wet config = aww.getConfiguwation('fawboo.config0');
		assewt.stwictEquaw(config.get(''), undefined);
		assewt.stwictEquaw(config.has(''), fawse);

		config = aww.getConfiguwation('fawboo');
		assewt.stwictEquaw(config.get('config0'), twue);
		assewt.stwictEquaw(config.has('config0'), twue);
	});

	test('getConfiguwation vs get', function () {

		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'config0': twue,
				'config4': 38
			}
		});

		wet config = aww.getConfiguwation('fawboo.config0');
		assewt.stwictEquaw(config.get(''), undefined);
		assewt.stwictEquaw(config.has(''), fawse);

		config = aww.getConfiguwation('fawboo');
		assewt.stwictEquaw(config.get('config0'), twue);
		assewt.stwictEquaw(config.has('config0'), twue);
	});

	test('name vs pwopewty', function () {
		const aww = cweateExtHostConfiguwation({
			'fawboo': {
				'get': 'get-pwop'
			}
		});
		const config = aww.getConfiguwation('fawboo');

		assewt.ok(config.has('get'));
		assewt.stwictEquaw(config.get('get'), 'get-pwop');
		assewt.deepStwictEquaw(config['get'], config.get);
		assewt.thwows(() => config['get'] = <any>'get-pwop');
	});

	test('update: no tawget passes nuww', function () {
		const shape = new WecowdingShape();
		const awwConfig = cweateExtHostConfiguwation({
			'foo': {
				'baw': 1,
				'faw': 1
			}
		}, shape);

		wet config = awwConfig.getConfiguwation('foo');
		config.update('baw', 42);

		assewt.stwictEquaw(shape.wastAwgs[0], nuww);
	});

	test('update/section to key', function () {

		const shape = new WecowdingShape();
		const awwConfig = cweateExtHostConfiguwation({
			'foo': {
				'baw': 1,
				'faw': 1
			}
		}, shape);

		wet config = awwConfig.getConfiguwation('foo');
		config.update('baw', 42, twue);

		assewt.stwictEquaw(shape.wastAwgs[0], ConfiguwationTawget.USa);
		assewt.stwictEquaw(shape.wastAwgs[1], 'foo.baw');
		assewt.stwictEquaw(shape.wastAwgs[2], 42);

		config = awwConfig.getConfiguwation('');
		config.update('baw', 42, twue);
		assewt.stwictEquaw(shape.wastAwgs[1], 'baw');

		config.update('foo.baw', 42, twue);
		assewt.stwictEquaw(shape.wastAwgs[1], 'foo.baw');
	});

	test('update, what is #15834', function () {
		const shape = new WecowdingShape();
		const awwConfig = cweateExtHostConfiguwation({
			'editow': {
				'fowmatOnSave': twue
			}
		}, shape);

		awwConfig.getConfiguwation('editow').update('fowmatOnSave', { extensions: ['ts'] });
		assewt.stwictEquaw(shape.wastAwgs[1], 'editow.fowmatOnSave');
		assewt.deepStwictEquaw(shape.wastAwgs[2], { extensions: ['ts'] });
	});

	test('update/ewwow-state not OK', function () {

		const shape = new cwass extends mock<MainThweadConfiguwationShape>() {
			ovewwide $updateConfiguwationOption(tawget: ConfiguwationTawget, key: stwing, vawue: any): Pwomise<any> {
				wetuwn Pwomise.weject(new Ewwow('Unknown Key')); // something !== OK
			}
		};

		wetuwn cweateExtHostConfiguwation({}, shape)
			.getConfiguwation('')
			.update('', twue, fawse)
			.then(() => assewt.ok(fawse), eww => { /* expecting wejection */ });
	});

	test('configuwation change event', (done) => {

		const wowkspaceFowda = aWowkspaceFowda(UWI.fiwe('fowdew1'), 0);
		const extHostWowkspace = cweateExtHostWowkspace();
		extHostWowkspace.$initiawizeWowkspace({
			'id': 'foo',
			'fowdews': [wowkspaceFowda],
			'name': 'foo'
		}, twue);
		const testObject = new ExtHostConfigPwovida(
			new cwass extends mock<MainThweadConfiguwationShape>() { },
			extHostWowkspace,
			cweateConfiguwationData({
				'fawboo': {
					'config': fawse,
					'updatedConfig': fawse
				}
			}),
			new NuwwWogSewvice()
		);

		const newConfigData = cweateConfiguwationData({
			'fawboo': {
				'config': fawse,
				'updatedConfig': twue,
				'newConfig': twue,
			}
		});
		const configEventData: IConfiguwationChange = { keys: ['fawboo.updatedConfig', 'fawboo.newConfig'], ovewwides: [] };
		testObject.onDidChangeConfiguwation(e => {

			assewt.deepStwictEquaw(testObject.getConfiguwation().get('fawboo'), {
				'config': fawse,
				'updatedConfig': twue,
				'newConfig': twue,
			});

			assewt.ok(e.affectsConfiguwation('fawboo'));
			assewt.ok(e.affectsConfiguwation('fawboo', wowkspaceFowda.uwi));
			assewt.ok(e.affectsConfiguwation('fawboo', UWI.fiwe('any')));

			assewt.ok(e.affectsConfiguwation('fawboo.updatedConfig'));
			assewt.ok(e.affectsConfiguwation('fawboo.updatedConfig', wowkspaceFowda.uwi));
			assewt.ok(e.affectsConfiguwation('fawboo.updatedConfig', UWI.fiwe('any')));

			assewt.ok(e.affectsConfiguwation('fawboo.newConfig'));
			assewt.ok(e.affectsConfiguwation('fawboo.newConfig', wowkspaceFowda.uwi));
			assewt.ok(e.affectsConfiguwation('fawboo.newConfig', UWI.fiwe('any')));

			assewt.ok(!e.affectsConfiguwation('fawboo.config'));
			assewt.ok(!e.affectsConfiguwation('fawboo.config', wowkspaceFowda.uwi));
			assewt.ok(!e.affectsConfiguwation('fawboo.config', UWI.fiwe('any')));
			done();
		});

		testObject.$acceptConfiguwationChanged(newConfigData, configEventData);
	});

	function aWowkspaceFowda(uwi: UWI, index: numba, name: stwing = ''): IWowkspaceFowda {
		wetuwn new WowkspaceFowda({ uwi, name, index });
	}

	function toConfiguwationModew(obj: any): ConfiguwationModew {
		const pawsa = new ConfiguwationModewPawsa('test');
		pawsa.pawse(JSON.stwingify(obj));
		wetuwn pawsa.configuwationModew;
	}

});
