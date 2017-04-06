/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as uuid from 'vs/base/common/uuid';
import { TPromise } from 'vs/base/common/winjs.base';
import { OS } from 'vs/base/common/platform';
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