/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { KeyCode, KeyMod, KeyChord, createKeybinding, SimpleKeybinding } from 'vs/base/common/keyCodes';

interface ITestKeybinding {
	ctrlCmd: boolean;
	shift: boolean;
	alt: boolean;
	winCtrl: boolean;
	key: KeyCode;
	chord?: ITestKeybinding;
}

function decodeSimpleKeybinding(kb: SimpleKeybinding): ITestKeybinding {
	return {
		ctrlCmd: kb.hasCtrlCmd(),
		shift: kb.hasShift(),
		alt: kb.hasAlt(),
		winCtrl: kb.hasWinCtrl(),
		key: kb.getKeyCode()
	};
}

function decodeBinaryKeybinding(k: number): ITestKeybinding {
	let kb = createKeybinding(k);
	if (kb.isChord()) {
		let result = decodeSimpleKeybinding(kb.extractFirstPart());
		result.chord = decodeSimpleKeybinding(kb.extractChordPart());
		return result;
	}
	return decodeSimpleKeybinding(kb);
}

suite('keyCodes', () => {
	test('binary encoding', () => {
		function test(keybinding: ITestKeybinding, k: number): void {
			keybinding = keybinding || { ctrlCmd: false, shift: false, alt: false, winCtrl: false, key: KeyCode.Unknown };

			assert.deepEqual(decodeBinaryKeybinding(k), keybinding);
		}

		test(null, 0);
		test({ ctrlCmd: false, shift: false, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt: false, winCtrl: false, key: KeyCode.Enter, chord: { ctrlCmd: false, shift: false, alt: false, winCtrl: false, key: KeyCode.Tab } }, KeyChord(KeyCode.Enter, KeyCode.Tab));
		test({ ctrlCmd: false, shift: false, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt: false, winCtrl: true, key: KeyCode.Enter }, KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt: true, winCtrl: false, key: KeyCode.Enter }, KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd: false, shift: false, alt: true, winCtrl: true, key: KeyCode.Enter }, KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: false, shift: true, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyMod.Shift | KeyCode.Enter);
		test({ ctrlCmd: false, shift: true, alt: false, winCtrl: true, key: KeyCode.Enter }, KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: false, shift: true, alt: true, winCtrl: false, key: KeyCode.Enter }, KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd: false, shift: true, alt: true, winCtrl: true, key: KeyCode.Enter }, KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: true, shift: false, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyCode.Enter);
		test({ ctrlCmd: true, shift: false, alt: false, winCtrl: true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: true, shift: false, alt: true, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd: true, shift: false, alt: true, winCtrl: true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: true, shift: true, alt: false, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter);
		test({ ctrlCmd: true, shift: true, alt: false, winCtrl: true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.Enter);
		test({ ctrlCmd: true, shift: true, alt: true, winCtrl: false, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.Enter);
		test({ ctrlCmd: true, shift: true, alt: true, winCtrl: true, key: KeyCode.Enter }, KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.Enter);

		let encoded = KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_Y, KeyCode.KEY_Z);
		let kb = createKeybinding(encoded);

		assert.equal(kb.isChord(), true, 'isCord');
		if (kb.isChord()) {
			let firstPart = kb.extractFirstPart();
			let chordPart = kb.extractChordPart();
			assert.equal(firstPart.value, KeyMod.CtrlCmd | KeyCode.KEY_Y, 'first part');
			assert.equal(chordPart.value, KeyCode.KEY_Z, 'chord part');
		}
	});
});
