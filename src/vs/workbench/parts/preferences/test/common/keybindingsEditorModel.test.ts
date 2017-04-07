/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as uuid from 'vs/base/common/uuid';
import { TPromise } from 'vs/base/common/winjs.base';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { Registry } from 'vs/platform/platform';
import { Action } from 'vs/base/common/actions';
import { KeyCode, SimpleKeybinding, ChordKeybinding } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsEditorModel, IKeybindingItemEntry } from 'vs/workbench/parts/preferences/common/keybindingsEditorModel';
import { ResolvedKeybindingItem } from 'vs/platform/keybinding/common/resolvedKeybindingItem';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';

import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';

interface Modifiers {
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}

class AnAction extends Action {
	constructor(id: string) {
		super(id);
	}
}

suite('Keybindings Editor Model test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: KeybindingsEditorModel;

	setup(() => {
		instantiationService = new TestInstantiationService();

		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(IExtensionService, {}, 'onReady', () => TPromise.as(null));

		testObject = instantiationService.createInstance(KeybindingsEditorModel, OS);

		CommandsRegistry.registerCommand('command_without_keybinding', () => { });
	});

	test('fetch returns default keybindings', () => {
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } })
		);

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch(''));
			assertKeybindingItems(actuals, expected);
		});
	});

	test('fetch returns default keybindings at the top', () => {
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } })
		);

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch('').slice(0, 2), true);
			assertKeybindingItems(actuals, expected);
		});
	});

	test('fetch returns default keybindings sorted by command id', () => {
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Backspace } })
		);
		const expected = [keybindings[2], keybindings[0], keybindings[1]];

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch(''));
			assertKeybindingItems(actuals, expected);
		});
	});

	test('fetch returns user keybinding first if default and user has same id', () => {
		const sameId = 'b' + uuid.generateUuid();
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: sameId, firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: sameId, firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape }, isDefault: false })
		);
		const expected = [keybindings[1], keybindings[0]];

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch(''));
			assertKeybindingItems(actuals, expected);
		});
	});

	test('fetch returns keybinding with titles first', () => {
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'd' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } })
		);

		registerCommandWithTitle(keybindings[1].command, 'B Title');
		registerCommandWithTitle(keybindings[3].command, 'A Title');

		const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];
		instantiationService.stub(IKeybindingService, 'getKeybindings', () => keybindings);
		instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => keybindings);

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch(''));
			assertKeybindingItems(actuals, expected);
		});
	});

	test('fetch returns keybinding with user first if title and id matches', () => {
		const sameId = 'b' + uuid.generateUuid();
		const keybindings = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: sameId, firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: sameId, firstPart: { keyCode: KeyCode.Escape }, isDefault: false })
		);

		registerCommandWithTitle(keybindings[1].command, 'Same Title');
		registerCommandWithTitle(keybindings[3].command, 'Same Title');
		const expected = [keybindings[3], keybindings[1], keybindings[0], keybindings[2]];

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch(''));
			assertKeybindingItems(actuals, expected);
		});
	});

	test('fetch returns default keybindings sorted by precedence', () => {
		const expected = prepareKeybindingService(
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'c' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Backspace } })
		);

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch('', true));
			assertKeybindingItems(actuals, expected);
		});
	});

	test('convert keybinding without title to entry', () => {
		const expected = aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		prepareKeybindingService(expected);

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('')[0];
			assert.equal(actual.keybindingItem.command, expected.command);
			assert.equal(actual.keybindingItem.commandLabel, '');
			assert.equal(actual.keybindingItem.commandDefaultLabel, null);
			assert.equal(actual.keybindingItem.keybinding.getAriaLabel(), expected.resolvedKeybinding.getAriaLabel());
			assert.equal(actual.keybindingItem.when, expected.when.serialize());
		});
	});

	test('convert keybinding with title to entry', () => {
		const expected = aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		prepareKeybindingService(expected);
		registerCommandWithTitle(expected.command, 'Some Title');

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('')[0];
			assert.equal(actual.keybindingItem.command, expected.command);
			assert.equal(actual.keybindingItem.commandLabel, 'Some Title');
			assert.equal(actual.keybindingItem.commandDefaultLabel, null);
			assert.equal(actual.keybindingItem.keybinding.getAriaLabel(), expected.resolvedKeybinding.getAriaLabel());
			assert.equal(actual.keybindingItem.when, expected.when.serialize());
		});
	});

	test('convert without title and binding to entry', () => {
		CommandsRegistry.registerCommand('command_without_keybinding', () => { });
		prepareKeybindingService();

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('').filter(element => element.keybindingItem.command === 'command_without_keybinding')[0];
			assert.equal(actual.keybindingItem.command, 'command_without_keybinding');
			assert.equal(actual.keybindingItem.commandLabel, '');
			assert.equal(actual.keybindingItem.commandDefaultLabel, null);
			assert.equal(actual.keybindingItem.keybinding, null);
			assert.equal(actual.keybindingItem.when, '');
		});
	});

	test('convert with title and wihtout binding to entry', () => {
		const id = 'a' + uuid.generateUuid();
		registerCommandWithTitle(id, 'some title');
		prepareKeybindingService();

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('').filter(element => element.keybindingItem.command === id)[0];
			assert.equal(actual.keybindingItem.command, id);
			assert.equal(actual.keybindingItem.commandLabel, 'some title');
			assert.equal(actual.keybindingItem.commandDefaultLabel, null);
			assert.equal(actual.keybindingItem.keybinding, null);
			assert.equal(actual.keybindingItem.when, '');
		});
	});

	test('filter by command id', () => {
		const id = 'workbench.action.increaseViewSize';
		registerCommandWithTitle(id, 'some title');
		prepareKeybindingService();

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('workbench action view size').filter(element => element.keybindingItem.command === id)[0];
			assert.ok(actual);
		});
	});

	test('filter by command title', () => {
		const id = 'a' + uuid.generateUuid();
		registerCommandWithTitle(id, 'Increase view size');
		prepareKeybindingService();

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('increase size').filter(element => element.keybindingItem.command === id)[0];
			assert.ok(actual);
		});
	});

	test('filter by default source', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape }, when: 'context1 && context2' });
		prepareKeybindingService(expected);

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('default').filter(element => element.keybindingItem.command === command)[0];
			assert.ok(actual);
		});
	});

	test('filter by user source', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape }, when: 'context1 && context2', isDefault: false });
		prepareKeybindingService(expected);

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('user').filter(element => element.keybindingItem.command === command)[0];
			assert.ok(actual);
		});
	});

	test('filter by when context', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected);

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('when context').filter(element => element.keybindingItem.command === command)[0];
			assert.ok(actual);
		});
	});

	test('filter by cmd key', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh);

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected);

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('cmd').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by meta key', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh);

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('meta').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by command key', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh);

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('command').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by windows key', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Windows);

		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('windows').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by alt key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('alt').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { altKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by option key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('option').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { altKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by ctrl key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('ctrl').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by control key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('control').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by shift key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('shift').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by arrow', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.RightArrow, modifiers: { shiftKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('arrow').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by modifier and key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.RightArrow, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.RightArrow, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('alt right').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { altKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by key and modifier', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.RightArrow, modifiers: { altKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.RightArrow, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('right alt').filter(element => element.keybindingItem.command === command);
			assert.equal(0, actual.length);
		});
	});

	test('filter by modifiers and key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { altKey: true, metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('alt cmd esc').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { altKey: true, metaKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by modifiers in random order and key', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('cmd shift esc').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true, shiftKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter by first part', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.Delete }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('cmd shift esc').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true, shiftKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter matches in chord part', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh);
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.Delete }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('cmd del').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { metaKey: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, { keyCode: true });
		});
	});

	test('filter matches first part and in chord part', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh);
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.Delete }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.UpArrow }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('cmd shift esc del').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, { keyCode: true });
		});
	});

	test('filter exact matches', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('"ctrl c"').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter exact matches with first and chord part', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('"shift meta esc ctrl c"').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, { ctrlKey: true, keyCode: true });
		});
	});

	test('filter exact matches with first and chord part no results', () => {
		testObject = instantiationService.createInstance(KeybindingsEditorModel, OperatingSystem.Macintosh);
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.Delete, modifiers: { metaKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.UpArrow }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('"cmd shift esc del"').filter(element => element.keybindingItem.command === command);
			assert.equal(0, actual.length);
		});
	});

	test('filter matches with + separator', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('"ctrl+c"').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { ctrlKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, {});
		});
	});

	test('filter matches with + separator in first and chord parts', () => {
		const command = 'a' + uuid.generateUuid();
		const expected = aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.Escape, modifiers: { shiftKey: true, metaKey: true } }, chordPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false });
		prepareKeybindingService(expected, aResolvedKeybindingItem({ command, firstPart: { keyCode: KeyCode.KEY_C, modifiers: { ctrlKey: true } }, when: 'whenContext1 && whenContext2', isDefault: false }));

		return testObject.resolve().then(() => {
			const actual = testObject.fetch('"shift+meta+esc ctrl+c"').filter(element => element.keybindingItem.command === command);
			assert.equal(1, actual.length);
			assert.deepEqual(actual[0].keybindingMatches.firstPart, { shiftKey: true, metaKey: true, keyCode: true });
			assert.deepEqual(actual[0].keybindingMatches.chordPart, { keyCode: true, ctrlKey: true });
		});
	});

	function prepareKeybindingService(...keybindingItems: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {
		instantiationService.stub(IKeybindingService, 'getKeybindings', () => keybindingItems);
		instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => keybindingItems);
		return keybindingItems;

	}

	function registerCommandWithTitle(command: string, title: string): void {
		const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
		registry.registerWorkbenchAction(new SyncActionDescriptor(AnAction, command, title, { primary: null }), '');
	}

	function assertKeybindingItems(actual: ResolvedKeybindingItem[], expected: ResolvedKeybindingItem[]) {
		assert.equal(actual.length, expected.length);
		for (let i = 0; i < actual.length; i++) {
			assertKeybindingItem(actual[i], expected[i]);
		}
	}

	function assertKeybindingItem(actual: ResolvedKeybindingItem, expected: ResolvedKeybindingItem): void {
		assert.equal(actual.command, expected.command);
		if (actual.when) {
			assert.ok(!!expected.when);
			assert.equal(actual.when.serialize(), expected.when.serialize());
		} else {
			assert.ok(!expected.when);
		}
		assert.equal(actual.isDefault, expected.isDefault);

		if (actual.resolvedKeybinding) {
			assert.ok(!!expected.resolvedKeybinding);
			assert.equal(actual.resolvedKeybinding.getLabel(), expected.resolvedKeybinding.getLabel());
		} else {
			assert.ok(!expected.resolvedKeybinding);
		}
	}

	function aResolvedKeybindingItem({command, when, isDefault, firstPart, chordPart}: { command?: string, when?: string, isDefault?: boolean, firstPart?: { keyCode: KeyCode, modifiers?: Modifiers }, chordPart?: { keyCode: KeyCode, modifiers?: Modifiers } }): ResolvedKeybindingItem {
		const aSimpleKeybinding = function (part: { keyCode: KeyCode, modifiers?: Modifiers }): SimpleKeybinding {
			const {ctrlKey, shiftKey, altKey, metaKey} = part.modifiers || { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
			return new SimpleKeybinding(ctrlKey, shiftKey, altKey, metaKey, part.keyCode);
		};
		const keybinding = firstPart ? chordPart ? new ChordKeybinding(aSimpleKeybinding(firstPart), aSimpleKeybinding(chordPart)) : aSimpleKeybinding(firstPart) : null;
		return new ResolvedKeybindingItem(keybinding ? new USLayoutResolvedKeybinding(keybinding, OS) : null, command || 'some command', null, when ? ContextKeyExpr.deserialize(when) : null, isDefault === void 0 ? true : isDefault);
	}

	function asResolvedKeybindingItems(keybindingEntries: IKeybindingItemEntry[], keepUnassigned: boolean = false): ResolvedKeybindingItem[] {
		if (!keepUnassigned) {
			keybindingEntries = keybindingEntries.filter(keybindingEntry => !!keybindingEntry.keybindingItem.keybinding);
		}
		return keybindingEntries.map(entry => entry.keybindingItem.keybindingItem);
	}


});