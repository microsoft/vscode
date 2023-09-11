/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as uuid from 'vs/base/common/uuid';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { KeyCode } from 'vs/base/common/keyCodes';
import { KeyCodeChord } from 'vs/base/common/keybindings';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsEditorModel } from 'vs/workbench/services/preferences/browser/keybindingsEditorModel';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';

import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IKeybindingItemEntry } from 'vs/workbench/services/preferences/common/preferences';
import { Action2, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

interface Modifiers {
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}

suite('KeybindingsEditorModel', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let testObject: KeybindingsEditorModel;
	let extensions: Partial<IExtensionDescription>[] = [];

	setup(() => {
		extensions = [];
		instantiationService = disposables.add(new TestInstantiationService());

		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(IExtensionService, <Partial<IExtensionService>>{
			whenInstalledExtensionsRegistered: () => Promise.resolve(true),
			get extensions() { return extensions; }
		});
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OS));

		disposables.add(CommandsRegistry.registerCommand('command_without_keybinding', () => { }));
	});

	test('fetch returns default keybindings', async () => {
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } })
		);

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch(''));
		assertKeybindingItems(actuals, expected);
	});

	test('fetch returns distinct keybindings', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape } }),
		);

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch(''));
		assertKeybindingItems(actuals, [expected[0]]);
	});

	test('fetch returns default keybindings at the top', async () => {
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } })
		);

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch('').slice(0, 2), true);
		assertKeybindingItems(actuals, expected);
	});

	test('fetch returns default keybindings sorted by command id', async () => {
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Backspace } })
		);
		const expected = [keybindings[2], keybindings[0], keybindings[1]];

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch(''));
		assertKeybindingItems(actuals, expected);
	});

	test('fetch returns user keybinding first if default and user has same id', async () => {
		const sameId = 'b' + uuid.generateUuid();
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape }, isDefault: false })
		);
		const expected = [keybindings[1], keybindings[0]];

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch(''));
		assertKeybindingItems(actuals, expected);
	});

	test('fetch returns keybinding with titles first', async () => {
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'd' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } })
		);

		registerCommandWithTitle(keybindings[1].command!, 'B Title');
		registerCommandWithTitle(keybindings[3].command!, 'A Title');

		const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];
		instantiationService.stub(IKeybindingService, 'getKeybindings', () => keybindings);
		instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => keybindings);

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch(''));
		assertKeybindingItems(actuals, expected);
	});

	test('fetch returns keybinding with user first if title and id matches', async () => {
		const sameId = 'b' + uuid.generateUuid();
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: sameId, firstChord: { keyCode: KeyCode.Escape }, isDefault: false })
		);

		registerCommandWithTitle(keybindings[1].command!, 'Same Title');
		registerCommandWithTitle(keybindings[3].command!, 'Same Title');
		const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch(''));
		assertKeybindingItems(actuals, expected);
	});

	test('fetch returns default keybindings sorted by precedence', async () => {
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, secondChord: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Backspace } })
		);

		await testObject.resolve(new Map<string, string>());
		const actuals = asResolvedKeybindingItems(testObject.fetch('', true));
		assertKeybindingItems(actuals, expected);
	});

	test('convert keybinding without title to entry', async () => {
		const expected = aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('')[0];
		assert.strictEqual(actual.keybindingItem.command, expected.command);
		assert.strictEqual(actual.keybindingItem.commandLabel, '');
		assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
		assert.strictEqual(actual.keybindingItem.keybinding.getAriaLabel(), expected.resolvedKeybinding!.getAriaLabel());
		assert.strictEqual(actual.keybindingItem.when, expected.when!.serialize());
	});

	test('convert keybinding with title to entry', async () => {
		const expected = aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		prepareKeybindingService(expected);
		registerCommandWithTitle(expected.command!, 'Some Title');

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('')[0];
		assert.strictEqual(actual.keybindingItem.command, expected.command);
		assert.strictEqual(actual.keybindingItem.commandLabel, 'Some Title');
		assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
		assert.strictEqual(actual.keybindingItem.keybinding.getAriaLabel(), expected.resolvedKeybinding!.getAriaLabel());
		assert.strictEqual(actual.keybindingItem.when, expected.when!.serialize());
	});

	test('convert without title and binding to entry', async () => {
		disposables.add(CommandsRegistry.registerCommand('command_without_keybinding', () => { }));
		prepareKeybindingService();

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('').filter(element => element.keybindingItem.command === 'command_without_keybinding')[0];
		assert.strictEqual(actual.keybindingItem.command, 'command_without_keybinding');
		assert.strictEqual(actual.keybindingItem.commandLabel, '');
		assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
		assert.strictEqual(actual.keybindingItem.keybinding, undefined);
		assert.strictEqual(actual.keybindingItem.when, '');
	});

	test('convert with title and without binding to entry', async () => {
		const id = 'a' + uuid.generateUuid();
		registerCommandWithTitle(id, 'some title');
		prepareKeybindingService();

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('').filter(element => element.keybindingItem.command === id)[0];
		assert.strictEqual(actual.keybindingItem.command, id);
		assert.strictEqual(actual.keybindingItem.commandLabel, 'some title');
		assert.strictEqual(actual.keybindingItem.commandDefaultLabel, null);
		assert.strictEqual(actual.keybindingItem.keybinding, undefined);
		assert.strictEqual(actual.keybindingItem.when, '');
	});

	test('filter by command id', async () => {
		const id = 'workbench.action.increaseViewSize';
		registerCommandWithTitle(id, 'some title');
		prepareKeybindingService();

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('workbench action view size').filter(element => element.keybindingItem.command === id)[0];
		assert.ok(actual);
	});

	test('filter by command title', async () => {
		const id = 'a' + uuid.generateUuid();
		registerCommandWithTitle(id, 'Increase view size');
		prepareKeybindingService();

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('increase size').filter(element => element.keybindingItem.command === id)[0];
		assert.ok(actual);
	});

	test('filter by system source', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('system').filter(element => element.keybindingItem.command === command)[0];
		assert.ok(actual);
	});

	test('filter by user source', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefault: false });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('user').filter(element => element.keybindingItem.command === command)[0];
		assert.ok(actual);
	});

	test('filter by default source with "@source: " prefix', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefault: true });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('@source: default').filter(element => element.keybindingItem.command === command)[0];
		assert.ok(actual);
	});

	test('filter by user source with "@source: " prefix', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefault: false });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('@source: user').filter(element => element.keybindingItem.command === command)[0];
		assert.ok(actual);
	});

	test('filter by command prefix with different commands', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefault: true });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command: uuid.generateUuid(), firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: true }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch(`@command:${command}`);
		assert.strictEqual(actual.length, 1);
		assert.deepStrictEqual(actual[0].keybindingItem.command, command);
	});

	test('filter by command prefix with same commands', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefault: true });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: true }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch(`@command:${command}`);
		assert.strictEqual(actual.length, 2);
		assert.deepStrictEqual(actual[0].keybindingItem.command, command);
		assert.deepStrictEqual(actual[1].keybindingItem.command, command);
	});

	test('filter by when context', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('when context').filter(element => element.keybindingItem.command === command)[0];
		assert.ok(actual);
	});

	test('filter by cmd key', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected);

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('cmd').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by meta key', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('meta').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by command key', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('command').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by windows key', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Windows));

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('windows').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by alt key', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('alt').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { altKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by option key', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('option').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { altKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by ctrl key', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('ctrl').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { ctrlKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by control key', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('control').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { ctrlKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by shift key', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('shift').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { shiftKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by arrow', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.RightArrow, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('arrow').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by modifier and key', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.RightArrow, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.RightArrow, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('alt right').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { altKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by key and modifier', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.RightArrow, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.RightArrow, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('right alt').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(0, actual.length);
	});

	test('filter by modifiers and key', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true, metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('alt cmd esc').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { altKey: true, metaKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by modifiers in random order and key', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('cmd shift esc').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true, shiftKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by first part', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.Delete }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('cmd shift esc').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true, shiftKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter matches in chord part', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.Delete }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('cmd del').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { metaKey: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, { keyCode: true });
	});

	test('filter matches first part and in chord part', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.Delete }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.UpArrow }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('cmd shift esc del').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, { keyCode: true });
	});

	test('filter exact matches', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"ctrl c"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { ctrlKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter exact matches with first and chord part', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"shift meta escape ctrl c"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, { ctrlKey: true, keyCode: true });
	});

	test('filter exact matches with first and chord part no results', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.Delete, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.UpArrow }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"cmd shift esc del"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(0, actual.length);
	});

	test('filter matches with + separator', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"control+c"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { ctrlKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter by keybinding prefix', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('@keybinding:control+c').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { ctrlKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter matches with + separator in first and chord parts', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"shift+meta+escape ctrl+c"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, { keyCode: true, ctrlKey: true });
	});

	test('filter by keybinding prefix with chord', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('@keybinding:"shift+meta+escape ctrl+c"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, { keyCode: true, ctrlKey: true });
	});

	test('filter exact matches with space #32993', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Space, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Backspace, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"ctrl+space"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
	});

	test('filter exact matches with user settings label', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.DownArrow } });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'down', firstChord: { keyCode: KeyCode.Escape } }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"down"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { keyCode: true });
	});

	test('filter exact matches also return chords', async () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.KeyK, modifiers: { ctrlKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, secondChord: { keyCode: KeyCode.KeyC, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('"control+k"').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { ctrlKey: true, keyCode: true });
		assert.deepStrictEqual(actual[0].keybindingMatches!.chordPart, {});
	});

	test('filter modifiers are not matched when not completely matched (prefix)', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const term = `alt.${uuid.generateUuid()}`;
		const command = `command.${term}`;
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'some_command', firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch(term);
		assert.strictEqual(1, actual.length);
		assert.strictEqual(command, actual[0].keybindingItem.command);
		assert.strictEqual(1, actual[0].commandIdMatches?.length);
	});

	test('filter modifiers are not matched when not completely matched (includes)', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const term = `abcaltdef.${uuid.generateUuid()}`;
		const command = `command.${term}`;
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape }, isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'some_command', firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch(term);
		assert.strictEqual(1, actual.length);
		assert.strictEqual(command, actual[0].keybindingItem.command);
		assert.strictEqual(1, actual[0].commandIdMatches?.length);
	});

	test('filter modifiers are matched with complete term', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command = `command.${uuid.generateUuid()}`;
		const expected = aResolvedKeybindingItem({ command, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command: 'some_command', firstChord: { keyCode: KeyCode.Escape }, isDefault: false }));

		await testObject.resolve(new Map<string, string>());
		const actual = testObject.fetch('alt').filter(element => element.keybindingItem.command === command);
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingMatches!.firstPart, { altKey: true });
	});

	test('filter by extension', async () => {
		testObject = disposables.add(instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh));
		const command1 = `command.${uuid.generateUuid()}`;
		const command2 = `command.${uuid.generateUuid()}`;
		extensions.push({ identifier: new ExtensionIdentifier('foo'), displayName: 'foo bar' }, { identifier: new ExtensionIdentifier('bar'), displayName: 'bar foo' });
		disposables.add(MenuRegistry.addCommand({ id: command2, title: 'title', category: 'category', source: { id: extensions[1].identifier!.value, title: extensions[1].displayName! } }));
		const expected = aResolvedKeybindingItem({ command: command1, firstChord: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, isDefault: true, extensionId: extensions[0].identifier!.value });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command: command2, isDefault: true }));

		await testObject.resolve(new Map<string, string>());
		let actual = testObject.fetch('@ext:foo');
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingItem.command, command1);

		actual = testObject.fetch('@ext:"bar foo"');
		assert.strictEqual(1, actual.length);
		assert.deepStrictEqual(actual[0].keybindingItem.command, command2);
	});

	function prepareKeybindingService(...keybindingItems: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {
		instantiationService.stub(IKeybindingService, 'getKeybindings', () => keybindingItems);
		instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => keybindingItems);
		return keybindingItems;
	}

	function registerCommandWithTitle(command: string, title: string): void {
		disposables.add(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: command,
					title: { value: title, original: title },
					f1: true
				});
			}
			async run(): Promise<void> { }
		}));
	}

	function assertKeybindingItems(actual: ResolvedKeybindingItem[], expected: ResolvedKeybindingItem[]) {
		assert.strictEqual(actual.length, expected.length);
		for (let i = 0; i < actual.length; i++) {
			assertKeybindingItem(actual[i], expected[i]);
		}
	}

	function assertKeybindingItem(actual: ResolvedKeybindingItem, expected: ResolvedKeybindingItem): void {
		assert.strictEqual(actual.command, expected.command);
		if (actual.when) {
			assert.ok(!!expected.when);
			assert.strictEqual(actual.when.serialize(), expected.when!.serialize());
		} else {
			assert.ok(!expected.when);
		}
		assert.strictEqual(actual.isDefault, expected.isDefault);

		if (actual.resolvedKeybinding) {
			assert.ok(!!expected.resolvedKeybinding);
			assert.strictEqual(actual.resolvedKeybinding.getLabel(), expected.resolvedKeybinding!.getLabel());
		} else {
			assert.ok(!expected.resolvedKeybinding);
		}
	}

	function aResolvedKeybindingItem({ command, when, isDefault, firstChord, secondChord, extensionId }: { command?: string; when?: string; isDefault?: boolean; firstChord?: { keyCode: KeyCode; modifiers?: Modifiers }; secondChord?: { keyCode: KeyCode; modifiers?: Modifiers }; extensionId?: string }): ResolvedKeybindingItem {
		const aSimpleKeybinding = function (chord: { keyCode: KeyCode; modifiers?: Modifiers }): KeyCodeChord {
			const { ctrlKey, shiftKey, altKey, metaKey } = chord.modifiers || { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
			return new KeyCodeChord(ctrlKey!, shiftKey!, altKey!, metaKey!, chord.keyCode);
		};
		const chords: KeyCodeChord[] = [];
		if (firstChord) {
			chords.push(aSimpleKeybinding(firstChord));
			if (secondChord) {
				chords.push(aSimpleKeybinding(secondChord));
			}
		}
		const keybinding = chords.length > 0 ? new USLayoutResolvedKeybinding(chords, OS) : undefined;
		return new ResolvedKeybindingItem(keybinding, command || 'some command', null, when ? ContextKeyExpr.deserialize(when) : undefined, isDefault === undefined ? true : isDefault, extensionId ?? null, false);
	}

	function asResolvedKeybindingItems(keybindingEntries: IKeybindingItemEntry[], keepUnassigned: boolean = false): ResolvedKeybindingItem[] {
		if (!keepUnassigned) {
			keybindingEntries = keybindingEntries.filter(keybindingEntry => !!keybindingEntry.keybindingItem.keybinding);
		}
		return keybindingEntries.map(entry => entry.keybindingItem.keybindingItem);
	}


});
