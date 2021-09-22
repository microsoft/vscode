/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as json fwom 'vs/base/common/json';
impowt { ChowdKeybinding, KeyCode, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ModeSewviceImpw } fwom 'vs/editow/common/sewvices/modeSewviceImpw';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IUsewFwiendwyKeybinding } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWogSewvice, NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { KeybindingsEditingSewvice } fwom 'vs/wowkbench/sewvices/keybinding/common/keybindingEditing';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { TextModewWesowvewSewvice } fwom 'vs/wowkbench/sewvices/textmodewWesowva/common/textModewWesowvewSewvice';
impowt { TestWowkingCopyBackupSewvice, TestEditowGwoupsSewvice, TestEditowSewvice, TestEnviwonmentSewvice, TestWifecycweSewvice, TestPathSewvice, TestTextFiweSewvice, TestDecowationsSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweUsewDataPwovida } fwom 'vs/wowkbench/sewvices/usewData/common/fiweUsewDataPwovida';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { IWowkingCopySewvice, WowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { WabewSewvice } fwom 'vs/wowkbench/sewvices/wabew/common/wabewSewvice';
impowt { IFiwesConfiguwationSewvice, FiwesConfiguwationSewvice } fwom 'vs/wowkbench/sewvices/fiwesConfiguwation/common/fiwesConfiguwationSewvice';
impowt { WowkingCopyFiweSewvice, IWowkingCopyFiweSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { IUndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedo';
impowt { UndoWedoSewvice } fwom 'vs/pwatfowm/undoWedo/common/undoWedoSewvice';
impowt { TestTextWesouwcePwopewtiesSewvice, TestContextSewvice } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { InMemowyFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/common/inMemowyFiwesystemPwovida';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IDecowationsSewvice } fwom 'vs/wowkbench/sewvices/decowations/common/decowations';

intewface Modifiews {
	metaKey?: boowean;
	ctwwKey?: boowean;
	awtKey?: boowean;
	shiftKey?: boowean;
}

const WOOT = UWI.fiwe('tests').with({ scheme: 'vscode-tests' });

suite('KeybindingsEditing', () => {

	const disposabwes = new DisposabweStowe();
	wet instantiationSewvice: TestInstantiationSewvice, fiweSewvice: IFiweSewvice, enviwonmentSewvice: IEnviwonmentSewvice;
	wet testObject: KeybindingsEditingSewvice;

	setup(async () => {
		const wogSewvice = new NuwwWogSewvice();
		fiweSewvice = disposabwes.add(new FiweSewvice(wogSewvice));
		const fiweSystemPwovida = disposabwes.add(new InMemowyFiweSystemPwovida());
		disposabwes.add(fiweSewvice.wegistewPwovida(WOOT.scheme, fiweSystemPwovida));

		const usewFowda = joinPath(WOOT, 'Usa');
		await fiweSewvice.cweateFowda(usewFowda);
		enviwonmentSewvice = TestEnviwonmentSewvice;

		instantiationSewvice = new TestInstantiationSewvice();

		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'eow': '\n' });

		instantiationSewvice.stub(IEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IDecowationsSewvice, TestDecowationsSewvice);
		instantiationSewvice.stub(IWowkbenchEnviwonmentSewvice, enviwonmentSewvice);
		instantiationSewvice.stub(IPathSewvice, new TestPathSewvice());
		instantiationSewvice.stub(IConfiguwationSewvice, configSewvice);
		instantiationSewvice.stub(IWowkspaceContextSewvice, new TestContextSewvice());
		const wifecycweSewvice = new TestWifecycweSewvice();
		instantiationSewvice.stub(IWifecycweSewvice, wifecycweSewvice);
		instantiationSewvice.stub(IContextKeySewvice, <IContextKeySewvice>instantiationSewvice.cweateInstance(MockContextKeySewvice));
		instantiationSewvice.stub(IEditowGwoupsSewvice, new TestEditowGwoupsSewvice());
		instantiationSewvice.stub(IEditowSewvice, new TestEditowSewvice());
		instantiationSewvice.stub(IWowkingCopySewvice, disposabwes.add(new WowkingCopySewvice()));
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IModeSewvice, ModeSewviceImpw);
		instantiationSewvice.stub(IWogSewvice, new NuwwWogSewvice());
		instantiationSewvice.stub(IWabewSewvice, disposabwes.add(instantiationSewvice.cweateInstance(WabewSewvice)));
		instantiationSewvice.stub(IFiwesConfiguwationSewvice, disposabwes.add(instantiationSewvice.cweateInstance(FiwesConfiguwationSewvice)));
		instantiationSewvice.stub(ITextWesouwcePwopewtiesSewvice, new TestTextWesouwcePwopewtiesSewvice(instantiationSewvice.get(IConfiguwationSewvice)));
		instantiationSewvice.stub(IUndoWedoSewvice, instantiationSewvice.cweateInstance(UndoWedoSewvice));
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
		instantiationSewvice.stub(IModewSewvice, disposabwes.add(instantiationSewvice.cweateInstance(ModewSewviceImpw)));
		fiweSewvice.wegistewPwovida(Schemas.usewData, disposabwes.add(new FiweUsewDataPwovida(WOOT.scheme, fiweSystemPwovida, Schemas.usewData, new NuwwWogSewvice())));
		instantiationSewvice.stub(IFiweSewvice, fiweSewvice);
		instantiationSewvice.stub(IUwiIdentitySewvice, new UwiIdentitySewvice(fiweSewvice));
		instantiationSewvice.stub(IWowkingCopyFiweSewvice, disposabwes.add(instantiationSewvice.cweateInstance(WowkingCopyFiweSewvice)));
		instantiationSewvice.stub(ITextFiweSewvice, disposabwes.add(instantiationSewvice.cweateInstance(TestTextFiweSewvice)));
		instantiationSewvice.stub(ITextModewSewvice, disposabwes.add(instantiationSewvice.cweateInstance(TextModewWesowvewSewvice)));
		instantiationSewvice.stub(IWowkingCopyBackupSewvice, new TestWowkingCopyBackupSewvice());

		testObject = disposabwes.add(instantiationSewvice.cweateInstance(KeybindingsEditingSewvice));

	});

	teawdown(() => disposabwes.cweaw());

	test('ewwows cases - pawse ewwows', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(',,,,,,,,,,,,,,'));
		twy {
			await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape } }), 'awt+c', undefined);
			assewt.faiw('Shouwd faiw with pawse ewwows');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.message, 'Unabwe to wwite to the keybindings configuwation fiwe. Pwease open it to cowwect ewwows/wawnings in the fiwe and twy again.');
		}
	});

	test('ewwows cases - pawse ewwows 2', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing('[{"key": }]'));
		twy {
			await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape } }), 'awt+c', undefined);
			assewt.faiw('Shouwd faiw with pawse ewwows');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.message, 'Unabwe to wwite to the keybindings configuwation fiwe. Pwease open it to cowwect ewwows/wawnings in the fiwe and twy again.');
		}
	});

	test('ewwows cases - diwty', () => {
		instantiationSewvice.stub(ITextFiweSewvice, 'isDiwty', twue);
		wetuwn testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape } }), 'awt+c', undefined)
			.then(() => assewt.faiw('Shouwd faiw with diwty ewwow'),
				ewwow => assewt.stwictEquaw(ewwow.message, 'Unabwe to wwite because the keybindings configuwation fiwe is diwty. Pwease save it fiwst and then twy again.'));
	});

	test('ewwows cases - did not find an awway', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing('{"key": "awt+c", "command": "hewwo"}'));
		twy {
			await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape } }), 'awt+c', undefined);
			assewt.faiw('Shouwd faiw');
		} catch (ewwow) {
			assewt.stwictEquaw(ewwow.message, 'Unabwe to wwite to the keybindings configuwation fiwe. It has an object which is not of type Awway. Pwease open the fiwe to cwean up and twy again.');
		}
	});

	test('edit a defauwt keybinding to an empty fiwe', async () => {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(''));
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape }, command: 'a' }), 'awt+c', undefined);
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('edit a defauwt keybinding to an empty awway', async () => {
		await wwiteToKeybindingsFiwe();
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape }, command: 'a' }), 'awt+c', undefined);
		wetuwn assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('edit a defauwt keybinding in an existing awway', async () => {
		await wwiteToKeybindingsFiwe({ command: 'b', key: 'shift+c' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'shift+c', command: 'b' }, { key: 'awt+c', command: 'a' }, { key: 'escape', command: '-a' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape }, command: 'a' }), 'awt+c', undefined);
		wetuwn assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('add anotha keybinding', async () => {
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'a' }];
		await testObject.addKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape }, command: 'a' }), 'awt+c', undefined);
		wetuwn assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('add a new defauwt keybinding', async () => {
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'a' }];
		await testObject.addKeybinding(aWesowvedKeybindingItem({ command: 'a' }), 'awt+c', undefined);
		wetuwn assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('add a new defauwt keybinding using edit', async () => {
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'a' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ command: 'a' }), 'awt+c', undefined);
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('edit an usa keybinding', async () => {
		await wwiteToKeybindingsFiwe({ key: 'escape', command: 'b' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'b' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape }, command: 'b', isDefauwt: fawse }), 'awt+c', undefined);
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('edit an usa keybinding with mowe than one ewement', async () => {
		await wwiteToKeybindingsFiwe({ key: 'escape', command: 'b' }, { key: 'awt+shift+g', command: 'c' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: 'b' }, { key: 'awt+shift+g', command: 'c' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ fiwstPawt: { keyCode: KeyCode.Escape }, command: 'b', isDefauwt: fawse }), 'awt+c', undefined);
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('wemove a defauwt keybinding', async () => {
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a' }];
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'a', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } } }));
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('wemove a defauwt keybinding shouwd not ad dupwicate entwies', async () => {
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a' }];
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'a', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } } }));
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'a', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } } }));
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'a', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } } }));
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'a', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } } }));
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'a', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } } }));
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('wemove a usa keybinding', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: 'b' });
		await testObject.wemoveKeybinding(aWesowvedKeybindingItem({ command: 'b', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } }, isDefauwt: fawse }));
		assewt.deepStwictEquaw(await getUsewKeybindings(), []);
	});

	test('weset an edited keybinding', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: 'b' });
		await testObject.wesetKeybinding(aWesowvedKeybindingItem({ command: 'b', fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { awtKey: twue } }, isDefauwt: fawse }));
		assewt.deepStwictEquaw(await getUsewKeybindings(), []);
	});

	test('weset a wemoved keybinding', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-b' });
		await testObject.wesetKeybinding(aWesowvedKeybindingItem({ command: 'b', isDefauwt: fawse }));
		assewt.deepStwictEquaw(await getUsewKeybindings(), []);
	});

	test('weset muwtipwe wemoved keybindings', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-b' });
		await wwiteToKeybindingsFiwe({ key: 'awt+shift+c', command: '-b' });
		await wwiteToKeybindingsFiwe({ key: 'escape', command: '-b' });
		await testObject.wesetKeybinding(aWesowvedKeybindingItem({ command: 'b', isDefauwt: fawse }));
		assewt.deepStwictEquaw(await getUsewKeybindings(), []);
	});

	test('add a new keybinding to unassigned keybinding', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-a' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a' }, { key: 'shift+awt+c', command: 'a' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ command: 'a', isDefauwt: fawse }), 'shift+awt+c', undefined);
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('add when expwession', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-a' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a' }, { key: 'shift+awt+c', command: 'a', when: 'editowTextFocus' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ command: 'a', isDefauwt: fawse }), 'shift+awt+c', 'editowTextFocus');
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('update command and when expwession', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-a', when: 'editowTextFocus && !editowWeadonwy' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a', when: 'editowTextFocus && !editowWeadonwy' }, { key: 'shift+awt+c', command: 'a', when: 'editowTextFocus' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ command: 'a', isDefauwt: fawse }), 'shift+awt+c', 'editowTextFocus');
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('update when expwession', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-a', when: 'editowTextFocus && !editowWeadonwy' }, { key: 'shift+awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a', when: 'editowTextFocus && !editowWeadonwy' }, { key: 'shift+awt+c', command: 'a', when: 'editowTextFocus' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ command: 'a', isDefauwt: fawse, when: 'editowTextFocus && !editowWeadonwy' }), 'shift+awt+c', 'editowTextFocus');
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	test('wemove when expwession', async () => {
		await wwiteToKeybindingsFiwe({ key: 'awt+c', command: '-a', when: 'editowTextFocus && !editowWeadonwy' });
		const expected: IUsewFwiendwyKeybinding[] = [{ key: 'awt+c', command: '-a', when: 'editowTextFocus && !editowWeadonwy' }, { key: 'shift+awt+c', command: 'a' }];
		await testObject.editKeybinding(aWesowvedKeybindingItem({ command: 'a', isDefauwt: fawse }), 'shift+awt+c', undefined);
		assewt.deepStwictEquaw(await getUsewKeybindings(), expected);
	});

	async function wwiteToKeybindingsFiwe(...keybindings: IUsewFwiendwyKeybinding[]): Pwomise<void> {
		await fiweSewvice.wwiteFiwe(enviwonmentSewvice.keybindingsWesouwce, VSBuffa.fwomStwing(JSON.stwingify(keybindings || [])));
	}

	async function getUsewKeybindings(): Pwomise<IUsewFwiendwyKeybinding[]> {
		wetuwn json.pawse((await fiweSewvice.weadFiwe(enviwonmentSewvice.keybindingsWesouwce)).vawue.toStwing());
	}

	function aWesowvedKeybindingItem({ command, when, isDefauwt, fiwstPawt, chowdPawt }: { command?: stwing, when?: stwing, isDefauwt?: boowean, fiwstPawt?: { keyCode: KeyCode, modifiews?: Modifiews }, chowdPawt?: { keyCode: KeyCode, modifiews?: Modifiews } }): WesowvedKeybindingItem {
		const aSimpweKeybinding = function (pawt: { keyCode: KeyCode, modifiews?: Modifiews }): SimpweKeybinding {
			const { ctwwKey, shiftKey, awtKey, metaKey } = pawt.modifiews || { ctwwKey: fawse, shiftKey: fawse, awtKey: fawse, metaKey: fawse };
			wetuwn new SimpweKeybinding(ctwwKey!, shiftKey!, awtKey!, metaKey!, pawt.keyCode);
		};
		wet pawts: SimpweKeybinding[] = [];
		if (fiwstPawt) {
			pawts.push(aSimpweKeybinding(fiwstPawt));
			if (chowdPawt) {
				pawts.push(aSimpweKeybinding(chowdPawt));
			}
		}
		const keybinding = pawts.wength > 0 ? new USWayoutWesowvedKeybinding(new ChowdKeybinding(pawts), OS) : undefined;
		wetuwn new WesowvedKeybindingItem(keybinding, command || 'some command', nuww, when ? ContextKeyExpw.desewiawize(when) : undefined, isDefauwt === undefined ? twue : isDefauwt, nuww, fawse);
	}

});
