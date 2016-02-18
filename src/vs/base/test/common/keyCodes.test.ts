/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {KeyCode, KeyMod, BinaryKeybindings, Keybinding} from 'vs/base/common/keyCodes';

interface ITestKeybinding {
	ctrlCmd?: boolean;
	shift?: boolean;
	alt?: boolean;
	winCtrl?: boolean;
	key: KeyCode;
	chord?: ITestKeybinding;
}

suite('keyCodes', () => {
	test('binary encoding', () => {
		function test(keybinding:ITestKeybinding, k:number): void {
			keybinding = keybinding || { key: KeyCode.Unknown };
			assert.equal(BinaryKeybindings.hasCtrlCmd(k), !!keybinding.ctrlCmd);
			assert.equal(BinaryKeybindings.hasShift(k), !!keybinding.shift);
			assert.equal(BinaryKeybindings.hasAlt(k), !!keybinding.alt);
			assert.equal(BinaryKeybindings.hasWinCtrl(k), !!keybinding.winCtrl);
			assert.equal(BinaryKeybindings.extractKeyCode(k), keybinding.key);

			let chord = BinaryKeybindings.extractChordPart(k);
			assert.equal(BinaryKeybindings.hasChord(k), !!keybinding.chord);
			if (keybinding.chord) {
				assert.equal(BinaryKeybindings.hasCtrlCmd(chord), !!keybinding.chord.ctrlCmd);
				assert.equal(BinaryKeybindings.hasShift(chord), !!keybinding.chord.shift);
				assert.equal(BinaryKeybindings.hasAlt(chord), !!keybinding.chord.alt);
				assert.equal(BinaryKeybindings.hasWinCtrl(chord), !!keybinding.chord.winCtrl);
				assert.equal(BinaryKeybindings.extractKeyCode(chord), keybinding.chord.key);
			}
		}

		test(null, 0);
		test({ key: KeyCode.Enter }, KeyCode.Enter);
		test({ key: KeyCode.Enter, chord: { key: KeyCode.Tab } }, KeyMod.chord(KeyCode.Enter, KeyCode.Tab));
		test({ ctrlCmd: false, shift: false, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt: false, winCtrl:  true, key: KeyCode.Enter }, KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt:  true, winCtrl: false, key: KeyCode.Enter }, KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt:  true, winCtrl:  true, key: KeyCode.Enter }, KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: false, shift:  true, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyMod.Shift | KeyCode.Enter);
		test({ ctrlCmd: false, shift:  true, alt: false, winCtrl:  true, key: KeyCode.Enter }, KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: false, shift:  true, alt:  true, winCtrl: false, key: KeyCode.Enter }, KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd: false, shift:  true, alt:  true, winCtrl:  true, key: KeyCode.Enter }, KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd:  true, shift: false, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyCode.Enter);
		test({ ctrlCmd:  true, shift: false, alt: false, winCtrl:  true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd:  true, shift: false, alt:  true, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd:  true, shift: false, alt:  true, winCtrl:  true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd:  true, shift:  true, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter);
		test({ ctrlCmd:  true, shift:  true, alt: false, winCtrl:  true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd:  true, shift:  true, alt:  true, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd:  true, shift:  true, alt:  true, winCtrl:  true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);

		let encoded = KeyMod.chord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z);
		let encodedFirstPart = BinaryKeybindings.extractFirstPart(encoded);
		let encodedSecondPart = BinaryKeybindings.extractChordPart(encoded);

		assert.equal(BinaryKeybindings.hasChord(encoded), true, 'hasChord');
		assert.equal(encodedFirstPart, KeyMod.CtrlCmd | KeyCode.KEY_Y, 'first part');
		assert.equal(encodedSecondPart, encodedSecondPart, 'chord part');
	});

	test('getUserSettingsKeybindingRegex', () => {
		let regex = new RegExp(Keybinding.getUserSettingsKeybindingRegex());

		function testIsGood(userSettingsLabel:string, message:string = userSettingsLabel): void {
			let userSettings = '"' + userSettingsLabel.replace(/\\/g, '\\\\') + '"';
			let isGood = regex.test(userSettings);
			assert.ok(isGood, message);
		}

		// check that all key codes are covered by the regex
		let ignore: boolean[] = [];
		ignore[KeyCode.Shift] = true;
		ignore[KeyCode.Ctrl] = true;
		ignore[KeyCode.Alt] = true;
		ignore[KeyCode.Meta] = true;
		for (let keyCode = KeyCode.Unknown + 1; keyCode < KeyCode.MAX_VALUE; keyCode++) {
			if (ignore[keyCode]) {
				continue;
			}
			let userSettings = Keybinding.toUserSettingsLabel(keyCode);
			testIsGood(userSettings, keyCode + ' - ' + KeyCode[keyCode] + ' - ' + userSettings);
		}

		// one modifier
		testIsGood('ctrl+a');
		testIsGood('shift+a');
		testIsGood('alt+a');
		testIsGood('cmd+a');
		testIsGood('meta+a');
		testIsGood('win+a');

		// more modifiers
		testIsGood('ctrl+shift+a');
		testIsGood('shift+alt+a');
		testIsGood('ctrl+shift+alt+a');

		// chords
		testIsGood('ctrl+a ctrl+a');
	});
});
