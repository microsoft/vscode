/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as DOM from '../../../../../base/browser/dom.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../../base/common/keybindings.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb, OS } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResolvedKeybindingItem } from '../../../../../platform/keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IKeybindingEditingService } from '../../../../services/keybinding/common/keybindingEditing.js';
import { KeybindingsEditorModel } from '../../../../services/preferences/browser/keybindingsEditorModel.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { KeybindingsEditor } from '../../browser/keybindingsEditor.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';

suite('KeybindingsEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function binding(command: string, keyCode: KeyCode | undefined, isDefault = false, systemWide = false, chord = false): ResolvedKeybindingItem {
		const keybinding = keyCode === undefined ? undefined : new USLayoutResolvedKeybinding([
			new KeyCodeChord(true, false, false, false, keyCode),
			...(chord ? [new KeyCodeChord(true, false, false, false, KeyCode.KeyC)] : []),
		], OS);
		return new ResolvedKeybindingItem(keybinding, command, undefined, ContextKeyExpr.has('editorTextFocus'), isDefault, null, false, systemWide);
	}

	/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Exercise the production table without constructing unrelated search and recording widgets. */
	async function createEditor(items: ResolvedKeybindingItem[], verbose = true) {
		const configuration = new TestConfigurationService({ accessibility: { verbosity: { keybindingsEditor: verbose } } });
		const instantiationService = workbenchInstantiationService({ configurationService: () => configuration }, store);
		let clipboard = '';
		const removed: ResolvedKeybindingItem[] = [];
		instantiationService.stub(IClipboardService, {
			writeText: async (value: string) => { clipboard = value; },
		});
		instantiationService.stub(IKeybindingEditingService, {
			removeKeybinding: async (item: ResolvedKeybindingItem) => { removed.push(item); },
		});
		instantiationService.stub(IKeybindingService, 'getKeybindings', () => items);
		instantiationService.stub(IKeybindingService, 'getDefaultKeybindings', () => items.filter(item => item.isDefault));
		instantiationService.stub(IExtensionsWorkbenchService, {});
		const model = store.add(instantiationService.createInstance(KeybindingsEditorModel, OS));
		await model.resolve(new Map(items.map(item => [item.command!, item.command!])));
		const entries = model.fetch('').filter(entry => items.some(item => item.command === entry.keybindingItem.command));
		const editor = store.add(instantiationService.createInstance(KeybindingsEditor, instantiationService.get(IEditorGroupsService).activeGroup));
		const root = DOM.append(document.body, DOM.$('.keybindings-editor'));
		root.style.width = '1000px';
		root.style.height = '400px';
		store.add(toDisposable(() => root.remove()));
		editor['createBody'](root);
		editor['tableEntries'] = entries;
		editor['keybindingsTable'].splice(0, 0, entries);
		editor['keybindingsTable'].layout(400, 1000);
		return { editor, root, entries, removed, readClipboard: () => JSON.parse(clipboard) };
	}

	test('copy preserves global scope only for user bindings', async () => {
		const { editor, entries, readClipboard } = await createEditor([
			binding('review.default', KeyCode.KeyA, true, true),
			binding('review.user', KeyCode.KeyB, false, true),
			binding('review.local', KeyCode.KeyC),
		]);
		const copied: { command: string; when: string; systemWide?: boolean }[] = [];
		for (const entry of entries) {
			await editor.copyKeybinding(entry);
			const { command, when, systemWide } = readClipboard();
			copied.push({ command, when, systemWide });
		}
		assert.deepStrictEqual(copied, [
			{ command: 'review.default', when: 'editorTextFocus', systemWide: undefined },
			{ command: 'review.local', when: 'editorTextFocus', systemWide: undefined },
			{ command: 'review.user', when: 'editorTextFocus', systemWide: true },
		]);
	});

	test('checkbox focus synchronizes the active binding without moving DOM focus', async () => {
		const items = [binding('review.a', KeyCode.KeyA), binding('review.b', KeyCode.KeyB)];
		const { editor, root, entries, removed } = await createEditor(items);
		const checkboxes = root.querySelectorAll<HTMLElement>('.system-wide [role="checkbox"]');
		if (isWeb) {
			assert.deepStrictEqual(Array.from(checkboxes, checkbox => checkbox.tabIndex), [-1, -1]);
			return;
		}
		editor.selectKeybinding(entries[0]);
		const checkbox = root.querySelector<HTMLElement>('.system-wide [aria-label^="System-wide: review.b"]')!;
		checkbox.focus();
		checkbox.dispatchEvent(new FocusEvent('focus'));
		const focused = document.activeElement;
		const active = editor.activeKeybindingEntry;
		await editor.removeKeybinding(editor.activeKeybindingEntry!);
		assert.deepStrictEqual({ focusedCheckbox: focused === checkbox, active: active?.keybindingItem.command, removed }, {
			focusedCheckbox: true,
			active: 'review.b',
			removed: [items[1]],
		});
	});

	for (const verbose of [true, false]) {
		test(`row descriptions explain disabled system-wide controls (verbosity=${verbose})`, async () => {
			const { root } = await createEditor([
				binding('review.chord', KeyCode.KeyK, false, false, true),
				binding('review.single', KeyCode.KeyA),
				binding('review.unassigned', undefined),
			], verbose);
			const descriptions = Array.from(root.querySelectorAll('.monaco-list-row'), row => {
				const label = row.getAttribute('aria-label')!;
				return {
					command: label.split(', ')[0],
					unavailable: ['only available in the desktop', 'Assign a keybinding', 'Chords are not supported.'].some(reason => label.includes(reason)),
					navigation: label.includes('Use Tab to reach the System-wide checkbox'),
				};
			});
			assert.deepStrictEqual(descriptions, [
				{ command: 'review.chord', unavailable: true, navigation: false },
				{ command: 'review.single', unavailable: isWeb, navigation: verbose && !isWeb },
				{ command: 'review.unassigned', unavailable: true, navigation: false },
			]);
		});
	}
});
