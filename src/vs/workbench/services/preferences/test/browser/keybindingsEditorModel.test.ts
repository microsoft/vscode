/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as uuid fwom 'vs/base/common/uuid';
impowt { OS, OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Action } fwom 'vs/base/common/actions';
impowt { KeyCode, SimpweKeybinding, ChowdKeybinding } fwom 'vs/base/common/keyCodes';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWowkbenchActionWegistwy, Extensions as ActionExtensions } fwom 'vs/wowkbench/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingsEditowModew } fwom 'vs/wowkbench/sewvices/pwefewences/bwowsa/keybindingsEditowModew';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';

impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { IKeybindingItemEntwy } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';

intewface Modifiews {
	metaKey?: boowean;
	ctwwKey?: boowean;
	awtKey?: boowean;
	shiftKey?: boowean;
}

cwass AnAction extends Action {
	constwuctow(id: stwing) {
		supa(id);
	}
}

suite('KeybindingsEditowModew', () => {

	wet instantiationSewvice: TestInstantiationSewvice;
	wet testObject: KeybindingsEditowModew;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();

		instantiationSewvice.stub(IKeybindingSewvice, {});
		instantiationSewvice.stub(IExtensionSewvice, {}, 'whenInstawwedExtensionsWegistewed', () => Pwomise.wesowve(nuww));

		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OS);

		CommandsWegistwy.wegistewCommand('command_without_keybinding', () => { });
	});

	test('fetch wetuwns defauwt keybindings', async () => {
		const expected = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'b' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } })
		);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch(''));
		assewtKeybindingItems(actuaws, expected);
	});

	test('fetch wetuwns defauwt keybindings at the top', async () => {
		const expected = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'b' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } })
		);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch('').swice(0, 2), twue);
		assewtKeybindingItems(actuaws, expected);
	});

	test('fetch wetuwns defauwt keybindings sowted by command id', async () => {
		const keybindings = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: 'b' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'c' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Backspace } })
		);
		const expected = [keybindings[2], keybindings[0], keybindings[1]];

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch(''));
		assewtKeybindingItems(actuaws, expected);
	});

	test('fetch wetuwns usa keybinding fiwst if defauwt and usa has same id', async () => {
		const sameId = 'b' + uuid.genewateUuid();
		const keybindings = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: sameId, fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: sameId, fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape }, isDefauwt: fawse })
		);
		const expected = [keybindings[1], keybindings[0]];

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch(''));
		assewtKeybindingItems(actuaws, expected);
	});

	test('fetch wetuwns keybinding with titwes fiwst', async () => {
		const keybindings = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'b' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'c' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'd' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } })
		);

		wegistewCommandWithTitwe(keybindings[1].command!, 'B Titwe');
		wegistewCommandWithTitwe(keybindings[3].command!, 'A Titwe');

		const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];
		instantiationSewvice.stub(IKeybindingSewvice, 'getKeybindings', () => keybindings);
		instantiationSewvice.stub(IKeybindingSewvice, 'getDefauwtKeybindings', () => keybindings);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch(''));
		assewtKeybindingItems(actuaws, expected);
	});

	test('fetch wetuwns keybinding with usa fiwst if titwe and id matches', async () => {
		const sameId = 'b' + uuid.genewateUuid();
		const keybindings = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: sameId, fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'c' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: sameId, fiwstPawt: { keyCode: KeyCode.Escape }, isDefauwt: fawse })
		);

		wegistewCommandWithTitwe(keybindings[1].command!, 'Same Titwe');
		wegistewCommandWithTitwe(keybindings[3].command!, 'Same Titwe');
		const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch(''));
		assewtKeybindingItems(actuaws, expected);
	});

	test('fetch wetuwns defauwt keybindings sowted by pwecedence', async () => {
		const expected = pwepaweKeybindingSewvice(
			aWesowvedKeybindingItem({ command: 'b' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'c' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, chowdPawt: { keyCode: KeyCode.Escape } }),
			aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Backspace } })
		);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaws = asWesowvedKeybindingItems(testObject.fetch('', twue));
		assewtKeybindingItems(actuaws, expected);
	});

	test('convewt keybinding without titwe to entwy', async () => {
		const expected = aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('')[0];
		assewt.stwictEquaw(actuaw.keybindingItem.command, expected.command);
		assewt.stwictEquaw(actuaw.keybindingItem.commandWabew, '');
		assewt.stwictEquaw(actuaw.keybindingItem.commandDefauwtWabew, nuww);
		assewt.stwictEquaw(actuaw.keybindingItem.keybinding.getAwiaWabew(), expected.wesowvedKeybinding!.getAwiaWabew());
		assewt.stwictEquaw(actuaw.keybindingItem.when, expected.when!.sewiawize());
	});

	test('convewt keybinding with titwe to entwy', async () => {
		const expected = aWesowvedKeybindingItem({ command: 'a' + uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		pwepaweKeybindingSewvice(expected);
		wegistewCommandWithTitwe(expected.command!, 'Some Titwe');

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('')[0];
		assewt.stwictEquaw(actuaw.keybindingItem.command, expected.command);
		assewt.stwictEquaw(actuaw.keybindingItem.commandWabew, 'Some Titwe');
		assewt.stwictEquaw(actuaw.keybindingItem.commandDefauwtWabew, nuww);
		assewt.stwictEquaw(actuaw.keybindingItem.keybinding.getAwiaWabew(), expected.wesowvedKeybinding!.getAwiaWabew());
		assewt.stwictEquaw(actuaw.keybindingItem.when, expected.when!.sewiawize());
	});

	test('convewt without titwe and binding to entwy', async () => {
		CommandsWegistwy.wegistewCommand('command_without_keybinding', () => { });
		pwepaweKeybindingSewvice();

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('').fiwta(ewement => ewement.keybindingItem.command === 'command_without_keybinding')[0];
		assewt.stwictEquaw(actuaw.keybindingItem.command, 'command_without_keybinding');
		assewt.stwictEquaw(actuaw.keybindingItem.commandWabew, '');
		assewt.stwictEquaw(actuaw.keybindingItem.commandDefauwtWabew, nuww);
		assewt.stwictEquaw(actuaw.keybindingItem.keybinding, undefined);
		assewt.stwictEquaw(actuaw.keybindingItem.when, '');
	});

	test('convewt with titwe and without binding to entwy', async () => {
		const id = 'a' + uuid.genewateUuid();
		wegistewCommandWithTitwe(id, 'some titwe');
		pwepaweKeybindingSewvice();

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('').fiwta(ewement => ewement.keybindingItem.command === id)[0];
		assewt.stwictEquaw(actuaw.keybindingItem.command, id);
		assewt.stwictEquaw(actuaw.keybindingItem.commandWabew, 'some titwe');
		assewt.stwictEquaw(actuaw.keybindingItem.commandDefauwtWabew, nuww);
		assewt.stwictEquaw(actuaw.keybindingItem.keybinding, undefined);
		assewt.stwictEquaw(actuaw.keybindingItem.when, '');
	});

	test('fiwta by command id', async () => {
		const id = 'wowkbench.action.incweaseViewSize';
		wegistewCommandWithTitwe(id, 'some titwe');
		pwepaweKeybindingSewvice();

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('wowkbench action view size').fiwta(ewement => ewement.keybindingItem.command === id)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by command titwe', async () => {
		const id = 'a' + uuid.genewateUuid();
		wegistewCommandWithTitwe(id, 'Incwease view size');
		pwepaweKeybindingSewvice();

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('incwease size').fiwta(ewement => ewement.keybindingItem.command === id)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by defauwt souwce', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('defauwt').fiwta(ewement => ewement.keybindingItem.command === command)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by usa souwce', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('usa').fiwta(ewement => ewement.keybindingItem.command === command)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by defauwt souwce with "@souwce: " pwefix', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefauwt: twue });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('@souwce: defauwt').fiwta(ewement => ewement.keybindingItem.command === command)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by usa souwce with "@souwce: " pwefix', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('@souwce: usa').fiwta(ewement => ewement.keybindingItem.command === command)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by command pwefix with diffewent commands', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefauwt: twue });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command: uuid.genewateUuid(), fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: twue }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch(`@command:${command}`);
		assewt.stwictEquaw(actuaw.wength, 1);
		assewt.deepStwictEquaw(actuaw[0].keybindingItem.command, command);
	});

	test('fiwta by command pwefix with same commands', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefauwt: twue });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: twue }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch(`@command:${command}`);
		assewt.stwictEquaw(actuaw.wength, 2);
		assewt.deepStwictEquaw(actuaw[0].keybindingItem.command, command);
		assewt.deepStwictEquaw(actuaw[1].keybindingItem.command, command);
	});

	test('fiwta by when context', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('when context').fiwta(ewement => ewement.keybindingItem.command === command)[0];
		assewt.ok(actuaw);
	});

	test('fiwta by cmd key', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);

		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected);

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('cmd').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by meta key', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);

		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('meta').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by command key', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);

		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('command').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by windows key', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Windows);

		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('windows').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by awt key', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('awt').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { awtKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by option key', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('option').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { awtKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by ctww key', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('ctww').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { ctwwKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by contwow key', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('contwow').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { ctwwKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by shift key', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('shift').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { shiftKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by awwow', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.WightAwwow, modifiews: { shiftKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('awwow').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by modifia and key', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.WightAwwow, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.WightAwwow, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('awt wight').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { awtKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by key and modifia', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.WightAwwow, modifiews: { awtKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.WightAwwow, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('wight awt').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(0, actuaw.wength);
	});

	test('fiwta by modifiews and key', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue, metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('awt cmd esc').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { awtKey: twue, metaKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by modifiews in wandom owda and key', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('cmd shift esc').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue, shiftKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by fiwst pawt', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.Dewete }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('cmd shift esc').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue, shiftKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta matches in chowd pawt', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.Dewete }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('cmd dew').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { metaKey: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, { keyCode: twue });
	});

	test('fiwta matches fiwst pawt and in chowd pawt', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.Dewete }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.UpAwwow }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('cmd shift esc dew').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { shiftKey: twue, metaKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, { keyCode: twue });
	});

	test('fiwta exact matches', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"ctww c"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { ctwwKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta exact matches with fiwst and chowd pawt', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"shift meta escape ctww c"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { shiftKey: twue, metaKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, { ctwwKey: twue, keyCode: twue });
	});

	test('fiwta exact matches with fiwst and chowd pawt no wesuwts', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.Dewete, modifiews: { metaKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.UpAwwow }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"cmd shift esc dew"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(0, actuaw.wength);
	});

	test('fiwta matches with + sepawatow', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"contwow+c"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { ctwwKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta by keybinding pwefix', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('@keybinding:contwow+c').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { ctwwKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, {});
	});

	test('fiwta matches with + sepawatow in fiwst and chowd pawts', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"shift+meta+escape ctww+c"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { shiftKey: twue, metaKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, { keyCode: twue, ctwwKey: twue });
	});

	test('fiwta by keybinding pwefix with chowd', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { shiftKey: twue, metaKey: twue } }, chowdPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.KEY_C, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('@keybinding:"shift+meta+escape ctww+c"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { shiftKey: twue, metaKey: twue, keyCode: twue });
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.chowdPawt, { keyCode: twue, ctwwKey: twue });
	});

	test('fiwta exact matches with space #32993', async () => {
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Space, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Backspace, modifiews: { ctwwKey: twue } }, when: 'whenContext1 && whenContext2', isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"ctww+space"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
	});

	test('fiwta exact matches with usa settings wabew', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = 'a' + uuid.genewateUuid();
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.DownAwwow } });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command: 'down', fiwstPawt: { keyCode: KeyCode.Escape } }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('"down"').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { keyCode: twue });
	});

	test('fiwta modifiews awe not matched when not compwetewy matched (pwefix)', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const tewm = `awt.${uuid.genewateUuid()}`;
		const command = `command.${tewm}`;
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command: 'some_command', fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch(tewm);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.stwictEquaw(command, actuaw[0].keybindingItem.command);
		assewt.stwictEquaw(1, actuaw[0].commandIdMatches?.wength);
	});

	test('fiwta modifiews awe not matched when not compwetewy matched (incwudes)', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const tewm = `abcawtdef.${uuid.genewateUuid()}`;
		const command = `command.${tewm}`;
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape }, isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command: 'some_command', fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch(tewm);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.stwictEquaw(command, actuaw[0].keybindingItem.command);
		assewt.stwictEquaw(1, actuaw[0].commandIdMatches?.wength);
	});

	test('fiwta modifiews awe matched with compwete tewm', async () => {
		testObject = instantiationSewvice.cweateInstance(KeybindingsEditowModew, OpewatingSystem.Macintosh);
		const command = `command.${uuid.genewateUuid()}`;
		const expected = aWesowvedKeybindingItem({ command, fiwstPawt: { keyCode: KeyCode.Escape, modifiews: { awtKey: twue } }, isDefauwt: fawse });
		pwepaweKeybindingSewvice(expected, aWesowvedKeybindingItem({ command: 'some_command', fiwstPawt: { keyCode: KeyCode.Escape }, isDefauwt: fawse }));

		await testObject.wesowve(new Map<stwing, stwing>());
		const actuaw = testObject.fetch('awt').fiwta(ewement => ewement.keybindingItem.command === command);
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.deepStwictEquaw(actuaw[0].keybindingMatches!.fiwstPawt, { awtKey: twue });
	});

	function pwepaweKeybindingSewvice(...keybindingItems: WesowvedKeybindingItem[]): WesowvedKeybindingItem[] {
		instantiationSewvice.stub(IKeybindingSewvice, 'getKeybindings', () => keybindingItems);
		instantiationSewvice.stub(IKeybindingSewvice, 'getDefauwtKeybindings', () => keybindingItems);
		wetuwn keybindingItems;

	}

	function wegistewCommandWithTitwe(command: stwing, titwe: stwing): void {
		const wegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(ActionExtensions.WowkbenchActions);
		wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.cweate(AnAction, command, titwe, { pwimawy: 0 }), '');
	}

	function assewtKeybindingItems(actuaw: WesowvedKeybindingItem[], expected: WesowvedKeybindingItem[]) {
		assewt.stwictEquaw(actuaw.wength, expected.wength);
		fow (wet i = 0; i < actuaw.wength; i++) {
			assewtKeybindingItem(actuaw[i], expected[i]);
		}
	}

	function assewtKeybindingItem(actuaw: WesowvedKeybindingItem, expected: WesowvedKeybindingItem): void {
		assewt.stwictEquaw(actuaw.command, expected.command);
		if (actuaw.when) {
			assewt.ok(!!expected.when);
			assewt.stwictEquaw(actuaw.when.sewiawize(), expected.when!.sewiawize());
		} ewse {
			assewt.ok(!expected.when);
		}
		assewt.stwictEquaw(actuaw.isDefauwt, expected.isDefauwt);

		if (actuaw.wesowvedKeybinding) {
			assewt.ok(!!expected.wesowvedKeybinding);
			assewt.stwictEquaw(actuaw.wesowvedKeybinding.getWabew(), expected.wesowvedKeybinding!.getWabew());
		} ewse {
			assewt.ok(!expected.wesowvedKeybinding);
		}
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

	function asWesowvedKeybindingItems(keybindingEntwies: IKeybindingItemEntwy[], keepUnassigned: boowean = fawse): WesowvedKeybindingItem[] {
		if (!keepUnassigned) {
			keybindingEntwies = keybindingEntwies.fiwta(keybindingEntwy => !!keybindingEntwy.keybindingItem.keybinding);
		}
		wetuwn keybindingEntwies.map(entwy => entwy.keybindingItem.keybindingItem);
	}


});
