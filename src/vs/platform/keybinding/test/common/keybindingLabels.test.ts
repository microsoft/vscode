/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { createKeybinding, KeyCode, KeyMod, KeyChord } from 'vs/base/common/keyCodes';
import { ISimplifiedPlatform, KeybindingLabels } from 'vs/platform/keybinding/common/keybindingLabels';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';

suite('KeybindingLabels', () => {

	const WINDOWS: ISimplifiedPlatform = { isMacintosh: false, isWindows: true };
	const LINUX: ISimplifiedPlatform = { isMacintosh: false, isWindows: false };
	const MAC: ISimplifiedPlatform = { isMacintosh: true, isWindows: false };

	function assertUSLabel(Platform: ISimplifiedPlatform, keybinding: number, expected: string): void {
		assert.equal(KeybindingLabels._toUSLabel(createKeybinding(keybinding), Platform), expected);
	}

	test('Windows US label', () => {
		// no modifier
		assertUSLabel(WINDOWS, KeyCode.KEY_A, 'A');

		// one modifier
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyCode.KEY_A, 'Ctrl+A');
		assertUSLabel(WINDOWS, KeyMod.Shift | KeyCode.KEY_A, 'Shift+A');
		assertUSLabel(WINDOWS, KeyMod.Alt | KeyCode.KEY_A, 'Alt+A');
		assertUSLabel(WINDOWS, KeyMod.WinCtrl | KeyCode.KEY_A, 'Windows+A');

		// two modifiers
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A, 'Ctrl+Shift+A');
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_A, 'Ctrl+Alt+A');
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Windows+A');
		assertUSLabel(WINDOWS, KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, 'Shift+Alt+A');
		assertUSLabel(WINDOWS, KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, 'Shift+Windows+A');
		assertUSLabel(WINDOWS, KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Alt+Windows+A');

		// three modifiers
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, 'Ctrl+Shift+Alt+A');
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Windows+A');
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Alt+Windows+A');
		assertUSLabel(WINDOWS, KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Shift+Alt+Windows+A');

		// four modifiers
		assertUSLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Alt+Windows+A');

		// chord
		assertUSLabel(WINDOWS, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), 'Ctrl+A Ctrl+B');
	});

	test('Linux US label', () => {
		// no modifier
		assertUSLabel(LINUX, KeyCode.KEY_A, 'A');

		// one modifier
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyCode.KEY_A, 'Ctrl+A');
		assertUSLabel(LINUX, KeyMod.Shift | KeyCode.KEY_A, 'Shift+A');
		assertUSLabel(LINUX, KeyMod.Alt | KeyCode.KEY_A, 'Alt+A');
		assertUSLabel(LINUX, KeyMod.WinCtrl | KeyCode.KEY_A, 'Windows+A');

		// two modifiers
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A, 'Ctrl+Shift+A');
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_A, 'Ctrl+Alt+A');
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Windows+A');
		assertUSLabel(LINUX, KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, 'Shift+Alt+A');
		assertUSLabel(LINUX, KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, 'Shift+Windows+A');
		assertUSLabel(LINUX, KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Alt+Windows+A');

		// three modifiers
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, 'Ctrl+Shift+Alt+A');
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Windows+A');
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Alt+Windows+A');
		assertUSLabel(LINUX, KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Shift+Alt+Windows+A');

		// four modifiers
		assertUSLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Alt+Windows+A');

		// chord
		assertUSLabel(LINUX, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), 'Ctrl+A Ctrl+B');
	});

	test('Mac US label', () => {
		// no modifier
		assertUSLabel(MAC, KeyCode.KEY_A, 'A');

		// one modifier
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyCode.KEY_A, '⌘A');
		assertUSLabel(MAC, KeyMod.Shift | KeyCode.KEY_A, '⇧A');
		assertUSLabel(MAC, KeyMod.Alt | KeyCode.KEY_A, '⌥A');
		assertUSLabel(MAC, KeyMod.WinCtrl | KeyCode.KEY_A, '⌃A');

		// two modifiers
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A, '⇧⌘A');
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_A, '⌥⌘A');
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⌘A');
		assertUSLabel(MAC, KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, '⇧⌥A');
		assertUSLabel(MAC, KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⇧A');
		assertUSLabel(MAC, KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⌥A');

		// three modifiers
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, '⇧⌥⌘A');
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⇧⌘A');
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⌥⌘A');
		assertUSLabel(MAC, KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⇧⌥A');

		// four modifiers
		assertUSLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, '⌃⇧⌥⌘A');

		// chord
		assertUSLabel(MAC, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), '⌘A ⌘B');

		// special keys
		assertUSLabel(MAC, KeyCode.LeftArrow, '←');
		assertUSLabel(MAC, KeyCode.UpArrow, '↑');
		assertUSLabel(MAC, KeyCode.RightArrow, '→');
		assertUSLabel(MAC, KeyCode.DownArrow, '↓');
	});

	test('Aria label', () => {
		function assertAriaLabel(Platform: ISimplifiedPlatform, keybinding: number, expected: string): void {
			assert.equal(KeybindingLabels._toUSAriaLabel(createKeybinding(keybinding), Platform), expected);
		}

		assertAriaLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Control+Shift+Alt+Windows+A');
		assertAriaLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Control+Shift+Alt+Windows+A');
		assertAriaLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Control+Shift+Alt+Command+A');
	});

	test('Electron Accelerator label', () => {
		function assertElectronAcceleratorLabel(Platform: ISimplifiedPlatform, keybinding: number, expected: string): void {
			assert.equal(KeybindingLabels._toElectronAccelerator(createKeybinding(keybinding), Platform), expected);
		}

		assertElectronAcceleratorLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Alt+Super+A');
		assertElectronAcceleratorLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Alt+Super+A');
		assertElectronAcceleratorLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'Ctrl+Shift+Alt+Cmd+A');

		// electron cannot handle chords
		assertElectronAcceleratorLabel(WINDOWS, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), null);
		assertElectronAcceleratorLabel(LINUX, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), null);
		assertElectronAcceleratorLabel(MAC, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), null);

		// electron cannot handle numpad keys
		assertElectronAcceleratorLabel(WINDOWS, KeyCode.NUMPAD_1, null);
		assertElectronAcceleratorLabel(LINUX, KeyCode.NUMPAD_1, null);
		assertElectronAcceleratorLabel(MAC, KeyCode.NUMPAD_1, null);

		// special
		assertElectronAcceleratorLabel(MAC, KeyCode.LeftArrow, 'Left');
		assertElectronAcceleratorLabel(MAC, KeyCode.UpArrow, 'Up');
		assertElectronAcceleratorLabel(MAC, KeyCode.RightArrow, 'Right');
		assertElectronAcceleratorLabel(MAC, KeyCode.DownArrow, 'Down');
	});

	test('User Settings label', () => {
		function assertElectronAcceleratorLabel(Platform: ISimplifiedPlatform, keybinding: number, expected: string): void {
			assert.equal(KeybindingLabels.toUserSettingsLabel(createKeybinding(keybinding), Platform), expected);
		}

		assertElectronAcceleratorLabel(WINDOWS, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'ctrl+shift+alt+win+a');
		assertElectronAcceleratorLabel(LINUX, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'ctrl+shift+alt+meta+a');
		assertElectronAcceleratorLabel(MAC, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'ctrl+shift+alt+cmd+a');

		// electron cannot handle chords
		assertElectronAcceleratorLabel(WINDOWS, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), 'ctrl+a ctrl+b');
		assertElectronAcceleratorLabel(LINUX, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), 'ctrl+a ctrl+b');
		assertElectronAcceleratorLabel(MAC, KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_A, KeyMod.CtrlCmd | KeyCode.KEY_B), 'cmd+a cmd+b');
	});

	test('US HTML label', () => {
		function assertHTMLLabel(Platform: ISimplifiedPlatform, keybinding: number, expected: IHTMLContentElement[]): void {
			assert.deepEqual(KeybindingLabels._toUSHTMLLabel(createKeybinding(keybinding), Platform), expected);
		}

		assertHTMLLabel(WINDOWS, KeyChord(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, KeyCode.KEY_B), [{
			tagName: 'span',
			className: 'monaco-kb',
			children: [
				{ tagName: 'span', className: 'monaco-kbkey', text: 'Ctrl' },
				{ tagName: 'span', text: '+' },
				{ tagName: 'span', className: 'monaco-kbkey', text: 'Shift' },
				{ tagName: 'span', text: '+' },
				{ tagName: 'span', className: 'monaco-kbkey', text: 'Alt' },
				{ tagName: 'span', text: '+' },
				{ tagName: 'span', className: 'monaco-kbkey', text: 'Windows' },
				{ tagName: 'span', text: '+' },
				{ tagName: 'span', className: 'monaco-kbkey', text: 'A' },
				{ tagName: 'span', text: ' ' },
				{ tagName: 'span', className: 'monaco-kbkey', text: 'B' },
			]
		}]);
	});

});
