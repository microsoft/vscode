/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as uuid from 'vs/base/common/uuid';
import { TPromise } from 'vs/base/common/winjs.base';
import { OS } from 'vs/base/common/platform';
import { KeyCode, SimpleKeybinding, ChordKeybinding } from 'vs/base/common/keyCodes';
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

suite('Keybindings Editor Model test', () => {

	let instantiationService: TestInstantiationService;
	let testObject: KeybindingsEditorModel;

	setup(() => {
		instantiationService = new TestInstantiationService();

		instantiationService.stub(IKeybindingService, {});
		instantiationService.stub(IExtensionService, {}, 'onReady', () => TPromise.as(null));

		testObject = instantiationService.createInstance(KeybindingsEditorModel, OS);
	});

	test('fetch returns default keybindings', () => {
		const expected = [
			aResolvedKeybindingItem({ command: 'a' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape } }),
			aResolvedKeybindingItem({ command: 'b' + uuid.generateUuid(), firstPart: { keyCode: KeyCode.Escape }, chordPart: { keyCode: KeyCode.Escape } })
		];
		instantiationService.stub(IKeybindingService, 'getKeybindings', () => expected);
		instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => expected);

		return testObject.resolve().then(() => {
			const actuals = asResolvedKeybindingItems(testObject.fetch(''));
			assertKeybindingItems(actuals, expected);
		});
	});

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