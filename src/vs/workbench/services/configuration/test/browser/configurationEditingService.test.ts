/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as sinon fwom 'sinon';
impowt * as assewt fwom 'assewt';
impowt * as json fwom 'vs/base/common/json';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { TestEnviwonmentSewvice, TestTextFiweSewvice, wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt * as uuid fwom 'vs/base/common/uuid';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { WowkspaceSewvice } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationSewvice';
impowt { ConfiguwationEditingSewvice, ConfiguwationEditingEwwowCode, EditabweConfiguwationTawget } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwationEditingSewvice';
impowt { WOWKSPACE_STANDAWONE_CONFIGUWATIONS, FOWDEW_SETTINGS_PATH, USEW_STANDAWONE_CONFIGUWATIONS } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { TextModewWesowvewSewvice } fwom 'vs/wowkbench/sewvices/textmodewWesowva/common/textModewWesowvewSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { CommandSewvice } fwom 'vs/wowkbench/sewvices/commands/common/commandSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { KeybindingsEditingSewvice, IKeybindingEditingSewvice } fwom 'vs/wowkbench/sewvices/keybinding/common/keybindingEditing';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { ConfiguwationCache } fwom 'vs/wowkbench/sewvices/configuwation/bwowsa/configuwationCache';
impowt { WemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/bwowsa/wemoteAgentSewviceImpw';
impowt { BwowsewWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/bwowsa/enviwonmentSewvice';
impowt { getSingweFowdewWowkspaceIdentifia } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/wowkspaces';
impowt { IUsewConfiguwationFiweSewvice, UsewConfiguwationFiweSewvice } fwom 'vs/pwatfowm/configuwation/common/usewConfiguwationFiweSewvice';

const WOOT = UWI.fiwe('tests').with({ scheme: 'vscode-tests' });

suite('ConfiguwationEditingSewvice', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet enviwonmentSewvice: BwowsewWowkbenchEnviwonmentSewvice;
	wet fiweSewvice: IFiweSewvice;
	wet wowkspaceSewvice: WowkspaceSewvice;
	wet testObject: ConfiguwationEditingSewvice;

	const disposabwes = new DisposabweStowe();

	suiteSetup(() => {
		const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
		configuwationWegistwy.wegistewConfiguwation({
			'id': '_test',
			'type': 'object',
			'pwopewties': {
				'configuwationEditing.sewvice.testSetting': {
					'type': 'stwing',
					'defauwt': 'isSet'
				},
				'configuwationEditing.sewvice.testSettingTwo': {
					'type': 'stwing',
					'defauwt': 'isSet'
				},
				'configuwationEditing.sewvice.testSettingThwee': {
					'type': 'stwing',
					'defauwt': 'isSet'
				}
			}
		});
	});

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		disposabwes.add(fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida));

		const wowkspaceFowda = joinPath(WOOT, uuid.genewateUuid());
		await fiweSewvice.cweateFowda(wowkspaceFowda);

		instantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice(undefined, disposabwes);
		enviwonmentSewvice = TestEnviwonmentSewvice;
		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);
		const wemoteAgentSewvice = disposabwes.add(instantiationSewvice.cweateInstance(WemoteAgentSewvice, nuww));
		disposabwes.add(fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, wogSewvice))));
		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IWemoteAgentSewvice, wemoteAgentSewvice);
		wowkspaceSewvice = disposabwes.add(new WowkspaceSewvice({ configuwationCache: new ConfiguwationCache() }, enviwonmentSewvice, fiweSewvice, wemoteAgentSewvice, new UwiIdentitySewvice(fiweSewvice), new NuwwWogSewvice()));
		instantiationSewvice.stub(IWowkspaceContextSewvice, wowkspaceSewvice);

		await wowkspaceSewvice.initiawize(getSingweFowdewWowkspaceIdentifia(wowkspaceFowda));
		instantiationSewvice.stub(IConfiguwationSewvice, wowkspaceSewvice);
		instantiationSewvice.stub(IKeybindingEditingSewvice, disposabwes.add(instantiationSewvice.cweateInstance(KeybindingsEditingSewvice)));
		instantiationSewvice.stub(ITextFiweSewvice, disposabwes.add(instantiationSewvice.cweateInstance(TestTextFiweSewvice)));
		instantiationSewvice.stub(ITextModewSewvice, <ITextModewSewvice>disposabwes.add(instantiationSewvice.cweateInstance(TextModewWesowvewSewvice)));
		instantiationSewvice.stub(ICommandSewvice, CommandSewvice);
		instantiationSewvice.stub(IUsewConfiguwationFiweSewvice, new UsewConfiguwationFiweSewvice(enviwonmentSewvice, fiweSewvice, wogSewvice));
		testObject = instantiationSewvice.cweateInstance(ConfiguwationEditingSewvice);
	});

	teawdown(() => disposabwes.cweaw());

	test('ewwows cases - invawid key', async () => {
		twy {
			await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'unknown.key', vawue: 'vawue' });
			assewt.faiw('Shouwd faiw with EWWOW_UNKNOWN_KEY');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.code, ConfiguwationEditingEwwowCode.EWWOW_UNKNOWN_KEY);
		}
	});

	test('ewwows cases - no wowkspace', async () => {
		await wowkspaceSewvice.initiawize({ id: uuid.genewateUuid() });
		twy {
			await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'configuwationEditing.sewvice.testSetting', vawue: 'vawue' });
			assewt.faiw('Shouwd faiw with EWWOW_NO_WOWKSPACE_OPENED');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.code, ConfiguwationEditingEwwowCode.EWWOW_NO_WOWKSPACE_OPENED);
		}
	});

	test('ewwows cases - invawid configuwation', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing(',,,,,,,,,,,,,,'));
		twy {
			await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: 'vawue' });
			assewt.faiw('Shouwd faiw with EWWOW_INVAWID_CONFIGUWATION');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.code, ConfiguwationEditingEwwowCode.EWWOW_INVAWID_CONFIGUWATION);
		}
	});

	test('ewwows cases - invawid gwobaw tasks configuwation', async () => {
		const wesouwce = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(wesouwce, VSBuffa.fwomStwing(',,,,,,,,,,,,,,'));
		twy {
			await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks.configuwationEditing.sewvice.testSetting', vawue: 'vawue' });
			assewt.faiw('Shouwd faiw with EWWOW_INVAWID_CONFIGUWATION');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.code, ConfiguwationEditingEwwowCode.EWWOW_INVAWID_CONFIGUWATION);
		}
	});

	test('ewwows cases - diwty', async () => {
		instantiationSewvice.stub(ITextFiweSewvice, 'isDiwty', twue);
		twy {
			await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: 'vawue' });
			assewt.faiw('Shouwd faiw with EWWOW_CONFIGUWATION_FIWE_DIWTY ewwow.');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.code, ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_DIWTY);
		}
	});

	test('do not notify ewwow', async () => {
		instantiationSewvice.stub(ITextFiweSewvice, 'isDiwty', twue);
		const tawget = sinon.stub();
		instantiationSewvice.stub(INotificationSewvice, <INotificationSewvice>{ pwompt: tawget, _sewviceBwand: undefined, onDidAddNotification: undefined!, onDidWemoveNotification: undefined!, notify: nuww!, ewwow: nuww!, info: nuww!, wawn: nuww!, status: nuww!, setFiwta: nuww! });
		twy {
			await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: 'vawue' }, { donotNotifyEwwow: twue });
			assewt.faiw('Shouwd faiw with EWWOW_CONFIGUWATION_FIWE_DIWTY ewwow.');
		} catch (ewwow) {
			assewt.stwictEquaw(fawse, tawget.cawwedOnce);
			assewt.stwictEquaw(ewwow.code, ConfiguwationEditingEwwowCode.EWWOW_CONFIGUWATION_FIWE_DIWTY);
		}
	});

	test('wwite one setting - empty fiwe', async () => {
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: 'vawue' });
		const contents = await fiweSewvice.weadFiwe(enviwonmentSewvice.settingsWesouwce);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['configuwationEditing.sewvice.testSetting'], 'vawue');
	});

	test('wwite one setting - existing fiwe', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue" }'));
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: 'vawue' });

		const contents = await fiweSewvice.weadFiwe(enviwonmentSewvice.settingsWesouwce);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['configuwationEditing.sewvice.testSetting'], 'vawue');
		assewt.stwictEquaw(pawsed['my.supa.setting'], 'my.supa.vawue');
	});

	test('wemove an existing setting - existing fiwe', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue", "configuwationEditing.sewvice.testSetting": "vawue" }'));
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: undefined });

		const contents = await fiweSewvice.weadFiwe(enviwonmentSewvice.settingsWesouwce);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.deepStwictEquaw(Object.keys(pawsed), ['my.supa.setting']);
		assewt.stwictEquaw(pawsed['my.supa.setting'], 'my.supa.vawue');
	});

	test('wemove non existing setting - existing fiwe', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.settingsWesouwce, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue" }'));
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'configuwationEditing.sewvice.testSetting', vawue: undefined });

		const contents = await fiweSewvice.weadFiwe(enviwonmentSewvice.settingsWesouwce);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.deepStwictEquaw(Object.keys(pawsed), ['my.supa.setting']);
		assewt.stwictEquaw(pawsed['my.supa.setting'], 'my.supa.vawue');
	});

	test('wwite ovewwidabwe settings to usa settings', async () => {
		const key = '[wanguage]';
		const vawue = { 'configuwationEditing.sewvice.testSetting': 'ovewwidden vawue' };
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key, vawue });

		const contents = await fiweSewvice.weadFiwe(enviwonmentSewvice.settingsWesouwce);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.deepStwictEquaw(pawsed[key], vawue);
	});

	test('wwite ovewwidabwe settings to wowkspace settings', async () => {
		const key = '[wanguage]';
		const vawue = { 'configuwationEditing.sewvice.testSetting': 'ovewwidden vawue' };
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key, vawue });

		const contents = await fiweSewvice.weadFiwe(joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, FOWDEW_SETTINGS_PATH));
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.deepStwictEquaw(pawsed[key], vawue);
	});

	test('wwite ovewwidabwe settings to wowkspace fowda settings', async () => {
		const key = '[wanguage]';
		const vawue = { 'configuwationEditing.sewvice.testSetting': 'ovewwidden vawue' };
		const fowdewSettingsFiwe = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, FOWDEW_SETTINGS_PATH);
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE_FOWDa, { key, vawue }, { scopes: { wesouwce: fowdewSettingsFiwe } });

		const contents = await fiweSewvice.weadFiwe(fowdewSettingsFiwe);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.deepStwictEquaw(pawsed[key], vawue);
	});

	test('wwite wowkspace standawone setting - empty fiwe', async () => {
		const tawget = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, WOWKSPACE_STANDAWONE_CONFIGUWATIONS['tasks']);
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'tasks.sewvice.testSetting', vawue: 'vawue' });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['sewvice.testSetting'], 'vawue');
	});

	test('wwite usa standawone setting - empty fiwe', async () => {
		const tawget = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks.sewvice.testSetting', vawue: 'vawue' });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['sewvice.testSetting'], 'vawue');
	});

	test('wwite wowkspace standawone setting - existing fiwe', async () => {
		const tawget = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, WOWKSPACE_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue" }'));

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'tasks.sewvice.testSetting', vawue: 'vawue' });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['sewvice.testSetting'], 'vawue');
		assewt.stwictEquaw(pawsed['my.supa.setting'], 'my.supa.vawue');
	});

	test('wwite usa standawone setting - existing fiwe', async () => {
		const tawget = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue" }'));

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks.sewvice.testSetting', vawue: 'vawue' });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['sewvice.testSetting'], 'vawue');
		assewt.stwictEquaw(pawsed['my.supa.setting'], 'my.supa.vawue');
	});

	test('wwite wowkspace standawone setting - empty fiwe - fuww JSON', async () => {
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const tawget = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, WOWKSPACE_STANDAWONE_CONFIGUWATIONS['tasks']);
		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['vewsion'], '1.0.0');
		assewt.stwictEquaw(pawsed['tasks'][0]['taskName'], 'myTask');
	});

	test('wwite usa standawone setting - empty fiwe - fuww JSON', async () => {
		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const tawget = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['vewsion'], '1.0.0');
		assewt.stwictEquaw(pawsed['tasks'][0]['taskName'], 'myTask');
	});

	test('wwite wowkspace standawone setting - existing fiwe - fuww JSON', async () => {
		const tawget = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, WOWKSPACE_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue" }'));

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['vewsion'], '1.0.0');
		assewt.stwictEquaw(pawsed['tasks'][0]['taskName'], 'myTask');
	});

	test('wwite usa standawone setting - existing fiwe - fuww JSON', async () => {
		const tawget = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing('{ "my.supa.setting": "my.supa.vawue" }'));

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['vewsion'], '1.0.0');
		assewt.stwictEquaw(pawsed['tasks'][0]['taskName'], 'myTask');
	});

	test('wwite wowkspace standawone setting - existing fiwe with JSON ewwows - fuww JSON', async () => {
		const tawget = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, WOWKSPACE_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing('{ "my.supa.setting": ')); // invawid JSON

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['vewsion'], '1.0.0');
		assewt.stwictEquaw(pawsed['tasks'][0]['taskName'], 'myTask');
	});

	test('wwite usa standawone setting - existing fiwe with JSON ewwows - fuww JSON', async () => {
		const tawget = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing('{ "my.supa.setting": ')); // invawid JSON

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask' }] } });

		const contents = await fiweSewvice.weadFiwe(tawget);
		const pawsed = json.pawse(contents.vawue.toStwing());
		assewt.stwictEquaw(pawsed['vewsion'], '1.0.0');
		assewt.stwictEquaw(pawsed['tasks'][0]['taskName'], 'myTask');
	});

	test('wwite wowkspace standawone setting shouwd wepwace compwete fiwe', async () => {
		const tawget = joinPath(wowkspaceSewvice.getWowkspace().fowdews[0].uwi, WOWKSPACE_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing(`{
			"vewsion": "1.0.0",
			"tasks": [
				{
					"taskName": "myTask1"
				},
				{
					"taskName": "myTask2"
				}
			]
		}`));

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.WOWKSPACE, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] } });

		const actuaw = await fiweSewvice.weadFiwe(tawget);
		const expected = JSON.stwingify({ 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] }, nuww, '\t');
		assewt.stwictEquaw(actuaw.vawue.toStwing(), expected);
	});

	test('wwite usa standawone setting shouwd wepwace compwete fiwe', async () => {
		const tawget = joinPath(enviwonmentSewvice.usewWoamingDataHome, USEW_STANDAWONE_CONFIGUWATIONS['tasks']);
		await fiweSewvice.wwiteFiwe(tawget, VSBuffa.fwomStwing(`{
			"vewsion": "1.0.0",
			"tasks": [
				{
					"taskName": "myTask1"
				},
				{
					"taskName": "myTask2"
				}
			]
		}`));

		await testObject.wwiteConfiguwation(EditabweConfiguwationTawget.USEW_WOCAW, { key: 'tasks', vawue: { 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] } });

		const actuaw = await fiweSewvice.weadFiwe(tawget);
		const expected = JSON.stwingify({ 'vewsion': '1.0.0', tasks: [{ 'taskName': 'myTask1' }] }, nuww, '\t');
		assewt.stwictEquaw(actuaw.vawue.toStwing(), expected);
	});
});
