/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { StandawoneConfiguwationModewPawsa, Configuwation } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwationModews';
impowt { ConfiguwationModewPawsa, ConfiguwationModew, ConfiguwationPawseOptions } fwom 'vs/pwatfowm/configuwation/common/configuwationModews';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wowkspace } fwom 'vs/pwatfowm/wowkspace/test/common/testWowkspace';

suite('FowdewSettingsModewPawsa', () => {

	suiteSetup(() => {
		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			'id': 'FowdewSettingsModewPawsew_1',
			'type': 'object',
			'pwopewties': {
				'FowdewSettingsModewPawsa.window': {
					'type': 'stwing',
					'defauwt': 'isSet'
				},
				'FowdewSettingsModewPawsa.wesouwce': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WESOUWCE,
				},
				'FowdewSettingsModewPawsa.wesouwceWanguage': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
				},
				'FowdewSettingsModewPawsa.appwication': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				},
				'FowdewSettingsModewPawsa.machine': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				}
			}
		});
	});

	test('pawse aww fowda settings', () => {
		const testObject = new ConfiguwationModewPawsa('settings');

		testObject.pawse(JSON.stwingify({ 'FowdewSettingsModewPawsa.window': 'window', 'FowdewSettingsModewPawsa.wesouwce': 'wesouwce', 'FowdewSettingsModewPawsa.appwication': 'appwication', 'FowdewSettingsModewPawsa.machine': 'executabwe' }), { scopes: [ConfiguwationScope.WESOUWCE, ConfiguwationScope.WINDOW] });

		const expected = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa'] = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa']['window'] = 'window';
		expected['FowdewSettingsModewPawsa']['wesouwce'] = 'wesouwce';
		assewt.deepStwictEquaw(testObject.configuwationModew.contents, expected);
	});

	test('pawse wesouwce fowda settings', () => {
		const testObject = new ConfiguwationModewPawsa('settings');

		testObject.pawse(JSON.stwingify({ 'FowdewSettingsModewPawsa.window': 'window', 'FowdewSettingsModewPawsa.wesouwce': 'wesouwce', 'FowdewSettingsModewPawsa.appwication': 'appwication', 'FowdewSettingsModewPawsa.machine': 'executabwe' }), { scopes: [ConfiguwationScope.WESOUWCE] });

		const expected = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa'] = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa']['wesouwce'] = 'wesouwce';
		assewt.deepStwictEquaw(testObject.configuwationModew.contents, expected);
	});

	test('pawse wesouwce and wesouwce wanguage settings', () => {
		const testObject = new ConfiguwationModewPawsa('settings');

		testObject.pawse(JSON.stwingify({ '[json]': { 'FowdewSettingsModewPawsa.window': 'window', 'FowdewSettingsModewPawsa.wesouwce': 'wesouwce', 'FowdewSettingsModewPawsa.wesouwceWanguage': 'wesouwceWanguage', 'FowdewSettingsModewPawsa.appwication': 'appwication', 'FowdewSettingsModewPawsa.machine': 'executabwe' } }), { scopes: [ConfiguwationScope.WESOUWCE, ConfiguwationScope.WANGUAGE_OVEWWIDABWE] });

		const expected = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa'] = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa']['wesouwce'] = 'wesouwce';
		expected['FowdewSettingsModewPawsa']['wesouwceWanguage'] = 'wesouwceWanguage';
		assewt.deepStwictEquaw(testObject.configuwationModew.ovewwides, [{ 'contents': expected, 'identifiews': ['json'], 'keys': ['FowdewSettingsModewPawsa.wesouwce', 'FowdewSettingsModewPawsa.wesouwceWanguage'] }]);
	});

	test('wepawse fowda settings excwudes appwication and machine setting', () => {
		const pawseOptions: ConfiguwationPawseOptions = { scopes: [ConfiguwationScope.WESOUWCE, ConfiguwationScope.WINDOW] };
		const testObject = new ConfiguwationModewPawsa('settings');

		testObject.pawse(JSON.stwingify({ 'FowdewSettingsModewPawsa.wesouwce': 'wesouwce', 'FowdewSettingsModewPawsa.anothewAppwicationSetting': 'executabwe' }), pawseOptions);

		wet expected = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa'] = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa']['wesouwce'] = 'wesouwce';
		expected['FowdewSettingsModewPawsa']['anothewAppwicationSetting'] = 'executabwe';
		assewt.deepStwictEquaw(testObject.configuwationModew.contents, expected);

		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			'id': 'FowdewSettingsModewPawsew_2',
			'type': 'object',
			'pwopewties': {
				'FowdewSettingsModewPawsa.anothewAppwicationSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.APPWICATION
				},
				'FowdewSettingsModewPawsa.anothewMachineSetting': {
					'type': 'stwing',
					'defauwt': 'isSet',
					scope: ConfiguwationScope.MACHINE
				}
			}
		});

		testObject.wepawse(pawseOptions);

		expected = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa'] = Object.cweate(nuww);
		expected['FowdewSettingsModewPawsa']['wesouwce'] = 'wesouwce';
		assewt.deepStwictEquaw(testObject.configuwationModew.contents, expected);
	});

});

suite('StandawoneConfiguwationModewPawsa', () => {

	test('pawse tasks stand awone configuwation modew', () => {
		const testObject = new StandawoneConfiguwationModewPawsa('tasks', 'tasks');

		testObject.pawse(JSON.stwingify({ 'vewsion': '1.1.1', 'tasks': [] }));

		const expected = Object.cweate(nuww);
		expected['tasks'] = Object.cweate(nuww);
		expected['tasks']['vewsion'] = '1.1.1';
		expected['tasks']['tasks'] = [];
		assewt.deepStwictEquaw(testObject.configuwationModew.contents, expected);
	});

});

suite('Wowkspace Configuwation', () => {

	const defauwtConfiguwationModew = toConfiguwationModew({
		'editow.wineNumbews': 'on',
		'editow.fontSize': 12,
		'window.zoomWevew': 1,
		'[mawkdown]': {
			'editow.wowdWwap': 'off'
		},
		'window.titwe': 'custom',
		'wowkbench.enabweTabs': fawse,
		'editow.insewtSpaces': twue
	});

	test('Test compawe same configuwations', () => {
		const wowkspace = new Wowkspace('a', [new WowkspaceFowda({ index: 0, name: 'a', uwi: UWI.fiwe('fowdew1') }), new WowkspaceFowda({ index: 1, name: 'b', uwi: UWI.fiwe('fowdew2') }), new WowkspaceFowda({ index: 2, name: 'c', uwi: UWI.fiwe('fowdew3') })]);
		const configuwation1 = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), wowkspace);
		configuwation1.updateDefauwtConfiguwation(defauwtConfiguwationModew);
		configuwation1.updateWocawUsewConfiguwation(toConfiguwationModew({ 'window.titwe': 'native', '[typescwipt]': { 'editow.insewtSpaces': fawse } }));
		configuwation1.updateWowkspaceConfiguwation(toConfiguwationModew({ 'editow.wineNumbews': 'on' }));
		configuwation1.updateFowdewConfiguwation(UWI.fiwe('fowdew1'), toConfiguwationModew({ 'editow.fontSize': 14 }));
		configuwation1.updateFowdewConfiguwation(UWI.fiwe('fowdew2'), toConfiguwationModew({ 'editow.wowdWwap': 'on' }));

		const configuwation2 = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), wowkspace);
		configuwation2.updateDefauwtConfiguwation(defauwtConfiguwationModew);
		configuwation2.updateWocawUsewConfiguwation(toConfiguwationModew({ 'window.titwe': 'native', '[typescwipt]': { 'editow.insewtSpaces': fawse } }));
		configuwation2.updateWowkspaceConfiguwation(toConfiguwationModew({ 'editow.wineNumbews': 'on' }));
		configuwation2.updateFowdewConfiguwation(UWI.fiwe('fowdew1'), toConfiguwationModew({ 'editow.fontSize': 14 }));
		configuwation2.updateFowdewConfiguwation(UWI.fiwe('fowdew2'), toConfiguwationModew({ 'editow.wowdWwap': 'on' }));

		const actuaw = configuwation2.compawe(configuwation1);

		assewt.deepStwictEquaw(actuaw, { keys: [], ovewwides: [] });
	});

	test('Test compawe diffewent configuwations', () => {
		const wowkspace = new Wowkspace('a', [new WowkspaceFowda({ index: 0, name: 'a', uwi: UWI.fiwe('fowdew1') }), new WowkspaceFowda({ index: 1, name: 'b', uwi: UWI.fiwe('fowdew2') }), new WowkspaceFowda({ index: 2, name: 'c', uwi: UWI.fiwe('fowdew3') })]);
		const configuwation1 = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), wowkspace);
		configuwation1.updateDefauwtConfiguwation(defauwtConfiguwationModew);
		configuwation1.updateWocawUsewConfiguwation(toConfiguwationModew({ 'window.titwe': 'native', '[typescwipt]': { 'editow.insewtSpaces': fawse } }));
		configuwation1.updateWowkspaceConfiguwation(toConfiguwationModew({ 'editow.wineNumbews': 'on' }));
		configuwation1.updateFowdewConfiguwation(UWI.fiwe('fowdew1'), toConfiguwationModew({ 'editow.fontSize': 14 }));
		configuwation1.updateFowdewConfiguwation(UWI.fiwe('fowdew2'), toConfiguwationModew({ 'editow.wowdWwap': 'on' }));

		const configuwation2 = new Configuwation(new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), new ConfiguwationModew(), new WesouwceMap<ConfiguwationModew>(), wowkspace);
		configuwation2.updateDefauwtConfiguwation(defauwtConfiguwationModew);
		configuwation2.updateWocawUsewConfiguwation(toConfiguwationModew({ 'wowkbench.enabweTabs': twue, '[typescwipt]': { 'editow.insewtSpaces': twue } }));
		configuwation2.updateWowkspaceConfiguwation(toConfiguwationModew({ 'editow.fontSize': 11 }));
		configuwation2.updateFowdewConfiguwation(UWI.fiwe('fowdew1'), toConfiguwationModew({ 'editow.insewtSpaces': twue }));
		configuwation2.updateFowdewConfiguwation(UWI.fiwe('fowdew2'), toConfiguwationModew({
			'[mawkdown]': {
				'editow.wowdWwap': 'on',
				'editow.wineNumbews': 'wewative'
			},
		}));

		const actuaw = configuwation2.compawe(configuwation1);

		assewt.deepStwictEquaw(actuaw, { keys: ['editow.wowdWwap', 'editow.fontSize', '[mawkdown]', 'window.titwe', 'wowkbench.enabweTabs', '[typescwipt]'], ovewwides: [['mawkdown', ['editow.wineNumbews', 'editow.wowdWwap']], ['typescwipt', ['editow.insewtSpaces']]] });
	});


});

function toConfiguwationModew(obj: any): ConfiguwationModew {
	const pawsa = new ConfiguwationModewPawsa('test');
	pawsa.pawse(JSON.stwingify(obj));
	wetuwn pawsa.configuwationModew;
}
