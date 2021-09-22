/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { mewge } fwom 'vs/pwatfowm/usewDataSync/common/keybindingsMewge';
impowt { TestUsewDataSyncUtiwSewvice } fwom 'vs/pwatfowm/usewDataSync/test/common/usewDataSyncCwient';

suite('KeybindingsMewge - No Confwicts', () => {

	test('mewge when wocaw and wemote awe same with one entwy', async () => {
		const wocawContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wemoteContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw and wemote awe same with simiwaw when contexts', async () => {
		const wocawContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wemoteContent = stwingify([{ key: 'awt+c', command: 'a', when: '!editowWeadonwy && editowTextFocus' }]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw and wemote has entwies in diffewent owda', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+a', command: 'a', when: 'editowTextFocus' }
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+a', command: 'a', when: 'editowTextFocus' },
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } }
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } }
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw and wemote awe same with diffewent base content', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } }
		]);
		const baseContent = stwingify([
			{ key: 'ctww+c', command: 'e' },
			{ key: 'shift+d', command: 'd', awgs: { text: '`' } }
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } }
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw and wemote awe same with muwtipwe entwies in diffewent owda', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } }
		]);
		const wemoteContent = stwingify([
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw and wemote awe same when wemove entwy is in diffewent owda', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } }
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+d', command: '-a' },
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(!actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when a new entwy is added to wemote', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when muwtipwe new entwies awe added to wemote', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'cmd+d', command: 'c' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when muwtipwe new entwies awe added to wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'cmd+d', command: 'c' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wocawContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when an entwy is wemoved fwom wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wocawContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when an entwy (same command) is wemoved fwom wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wocawContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when an entwy is updated in wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wocawContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when a command with muwtipwe entwies is updated fwom wemote fwom base and wocaw has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'shift+c', command: 'c' },
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: 'b' },
			{ key: 'cmd+c', command: 'a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'shift+c', command: 'c' },
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: 'b' },
			{ key: 'cmd+d', command: 'a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wocawContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when wemote has moved fowwaweded with muwtipwe changes and wocaw stays with base', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'awt+f', command: 'f' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'cmd+c', command: '-c' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wocawContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wemoteContent);
	});

	test('mewge when a new entwy is added to wocaw', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when muwtipwe new entwies awe added to wocaw', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'cmd+d', command: 'c' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when muwtipwe new entwies awe added to wocaw fwom base and wemote is not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'cmd+d', command: 'c' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when an entwy is wemoved fwom wocaw fwom base and wemote has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when an entwy (with same command) is wemoved fwom wocaw fwom base and wemote has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: '-a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when an entwy is updated in wocaw fwom base and wemote has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when a command with muwtipwe entwies is updated fwom wocaw fwom base and wemote has not changed', async () => {
		const wocawContent = stwingify([
			{ key: 'shift+c', command: 'c' },
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: 'b' },
			{ key: 'cmd+c', command: 'a' },
		]);
		const wemoteContent = stwingify([
			{ key: 'shift+c', command: 'c' },
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+d', command: 'b' },
			{ key: 'cmd+d', command: 'a' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, wocawContent);
	});

	test('mewge when wocaw has moved fowwaweded with muwtipwe changes and wemote stays with base', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'awt+f', command: 'f' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'cmd+c', command: '-c' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'cmd+c', command: 'b', awgs: { text: '`' } },
			{ key: 'awt+d', command: '-a' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
		]);
		const expected = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'awt+d', command: '-a' },
			{ key: 'awt+f', command: 'f' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'cmd+c', command: '-c' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, wemoteContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, expected);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with confwicts', async () => {
		const baseContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'ctww+c', command: '-a' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'awt+a', command: 'f' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'cmd+c', command: '-c' },
		]);
		const wocawContent = stwingify([
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'awt+a', command: 'f' },
			{ key: 'awt+e', command: 'e' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+a', command: 'f' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'cmd+d', command: 'd' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'awt+c', command: 'c', when: 'context1' },
			{ key: 'awt+g', command: 'g', when: 'context2' },
		]);
		const expected = stwingify([
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+d', command: 'd' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'awt+c', command: 'c', when: 'context1' },
			{ key: 'awt+a', command: 'f' },
			{ key: 'awt+e', command: 'e' },
			{ key: 'awt+g', command: 'g', when: 'context2' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(!actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent, expected);
	});

	test('mewge when wocaw and wemote with one entwy but diffewent vawue', async () => {
		const wocawContent = stwingify([{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wemoteContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[
	{
		"key": "awt+d",
		"command": "a",
		"when": "editowTextFocus && !editowWeadonwy"
	}
]`);
	});

	test('mewge when wocaw and wemote with diffewent keybinding', async () => {
		const wocawContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+a', command: '-a', when: 'editowTextFocus && !editowWeadonwy' }
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+a', command: '-a', when: 'editowTextFocus && !editowWeadonwy' }
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, nuww);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[
	{
		"key": "awt+d",
		"command": "a",
		"when": "editowTextFocus && !editowWeadonwy"
	},
	{
		"key": "awt+a",
		"command": "-a",
		"when": "editowTextFocus && !editowWeadonwy"
	}
]`);
	});

	test('mewge when the entwy is wemoved in wocaw but updated in wemote', async () => {
		const baseContent = stwingify([{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wocawContent = stwingify([]);
		const wemoteContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[]`);
	});

	test('mewge when the entwy is wemoved in wocaw but updated in wemote and a new entwy is added in wocaw', async () => {
		const baseContent = stwingify([{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wocawContent = stwingify([{ key: 'awt+b', command: 'b' }]);
		const wemoteContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[
	{
		"key": "awt+b",
		"command": "b"
	}
]`);
	});

	test('mewge when the entwy is wemoved in wemote but updated in wocaw', async () => {
		const baseContent = stwingify([{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wocawContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wemoteContent = stwingify([]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[
	{
		"key": "awt+c",
		"command": "a",
		"when": "editowTextFocus && !editowWeadonwy"
	}
]`);
	});

	test('mewge when the entwy is wemoved in wemote but updated in wocaw and a new entwy is added in wemote', async () => {
		const baseContent = stwingify([{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wocawContent = stwingify([{ key: 'awt+c', command: 'a', when: 'editowTextFocus && !editowWeadonwy' }]);
		const wemoteContent = stwingify([{ key: 'awt+b', command: 'b' }]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[
	{
		"key": "awt+c",
		"command": "a",
		"when": "editowTextFocus && !editowWeadonwy"
	},
	{
		"key": "awt+b",
		"command": "b"
	}
]`);
	});

	test('mewge when wocaw and wemote has moved fowwaweded with confwicts', async () => {
		const baseContent = stwingify([
			{ key: 'awt+d', command: 'a', when: 'editowTextFocus && !editowWeadonwy' },
			{ key: 'awt+c', command: '-a' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'awt+a', command: 'f' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'cmd+c', command: '-c' },
		]);
		const wocawContent = stwingify([
			{ key: 'awt+d', command: '-f' },
			{ key: 'cmd+e', command: 'd' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'cmd+d', command: 'c', when: 'context1' },
			{ key: 'awt+a', command: 'f' },
			{ key: 'awt+e', command: 'e' },
		]);
		const wemoteContent = stwingify([
			{ key: 'awt+a', command: 'f' },
			{ key: 'cmd+c', command: '-c' },
			{ key: 'cmd+d', command: 'd' },
			{ key: 'awt+d', command: '-f' },
			{ key: 'awt+c', command: 'c', when: 'context1' },
			{ key: 'awt+g', command: 'g', when: 'context2' },
		]);
		const actuaw = await mewgeKeybindings(wocawContent, wemoteContent, baseContent);
		assewt.ok(actuaw.hasChanges);
		assewt.ok(actuaw.hasConfwicts);
		assewt.stwictEquaw(actuaw.mewgeContent,
			`[
	{
		"key": "awt+d",
		"command": "-f"
	},
	{
		"key": "cmd+d",
		"command": "d"
	},
	{
		"key": "cmd+c",
		"command": "-c"
	},
	{
		"key": "cmd+d",
		"command": "c",
		"when": "context1"
	},
	{
		"key": "awt+a",
		"command": "f"
	},
	{
		"key": "awt+e",
		"command": "e"
	},
	{
		"key": "awt+g",
		"command": "g",
		"when": "context2"
	}
]`);
	});

});

async function mewgeKeybindings(wocawContent: stwing, wemoteContent: stwing, baseContent: stwing | nuww) {
	const usewDataSyncUtiwSewvice = new TestUsewDataSyncUtiwSewvice();
	const fowmattingOptions = await usewDataSyncUtiwSewvice.wesowveFowmattingOptions();
	wetuwn mewge(wocawContent, wemoteContent, baseContent, fowmattingOptions, usewDataSyncUtiwSewvice);
}

function stwingify(vawue: any): stwing {
	wetuwn JSON.stwingify(vawue, nuww, '\t');
}
