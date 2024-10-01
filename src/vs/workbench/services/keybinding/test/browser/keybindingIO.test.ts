/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { KeyChord, KeyCode, KeyMod, ScanCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, ScanCodeChord, Keybinding } from '../../../../../base/common/keybindings.js';
import { KeybindingParser } from '../../../../../base/common/keybindingParser.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { KeybindingIO } from '../../common/keybindingIO.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('keybindingIO', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('serialize/deserialize', () => {

		function testOneSerialization(keybinding: number, expected: string, msg: string, OS: OperatingSystem): void {
			const usLayoutResolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS)!;
			const actualSerialized = usLayoutResolvedKeybinding.getUserSettingsLabel();
			assert.strictEqual(actualSerialized, expected, expected + ' - ' + msg);
		}
		function testSerialization(keybinding: number, expectedWin: string, expectedMac: string, expectedLinux: string): void {
			testOneSerialization(keybinding, expectedWin, 'win', OperatingSystem.Windows);
			testOneSerialization(keybinding, expectedMac, 'mac', OperatingSystem.Macintosh);
			testOneSerialization(keybinding, expectedLinux, 'linux', OperatingSystem.Linux);
		}

		function testOneDeserialization(keybinding: string, _expected: number, msg: string, OS: OperatingSystem): void {
			const actualDeserialized = KeybindingParser.parseKeybinding(keybinding);
			const expected = decodeKeybinding(_expected, OS);
			assert.deepStrictEqual(actualDeserialized, expected, keybinding + ' - ' + msg);
		}
		function testDeserialization(inWin: string, inMac: string, inLinux: string, expected: number): void {
			testOneDeserialization(inWin, expected, 'win', OperatingSystem.Windows);
			testOneDeserialization(inMac, expected, 'mac', OperatingSystem.Macintosh);
			testOneDeserialization(inLinux, expected, 'linux', OperatingSystem.Linux);
		}

		function testRoundtrip(keybinding: number, expectedWin: string, expectedMac: string, expectedLinux: string): void {
			testSerialization(keybinding, expectedWin, expectedMac, expectedLinux);
			testDeserialization(expectedWin, expectedMac, expectedLinux, keybinding);
		}

		testRoundtrip(KeyCode.Digit0, '0', '0', '0');
		testRoundtrip(KeyCode.KeyA, 'a', 'a', 'a');
		testRoundtrip(KeyCode.UpArrow, 'up', 'up', 'up');
		testRoundtrip(KeyCode.RightArrow, 'right', 'right', 'right');
		testRoundtrip(KeyCode.DownArrow, 'down', 'down', 'down');
		testRoundtrip(KeyCode.LeftArrow, 'left', 'left', 'left');

		// one modifier
		testRoundtrip(KeyMod.Alt | KeyCode.KeyA, 'alt+a', 'alt+a', 'alt+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyCode.KeyA, 'ctrl+a', 'cmd+a', 'ctrl+a');
		testRoundtrip(KeyMod.Shift | KeyCode.KeyA, 'shift+a', 'shift+a', 'shift+a');
		testRoundtrip(KeyMod.WinCtrl | KeyCode.KeyA, 'win+a', 'ctrl+a', 'meta+a');

		// two modifiers
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyA, 'ctrl+alt+a', 'alt+cmd+a', 'ctrl+alt+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA, 'ctrl+shift+a', 'shift+cmd+a', 'ctrl+shift+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyA, 'ctrl+win+a', 'ctrl+cmd+a', 'ctrl+meta+a');
		testRoundtrip(KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA, 'shift+alt+a', 'shift+alt+a', 'shift+alt+a');
		testRoundtrip(KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KeyA, 'shift+win+a', 'ctrl+shift+a', 'shift+meta+a');
		testRoundtrip(KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyA, 'alt+win+a', 'ctrl+alt+a', 'alt+meta+a');

		// three modifiers
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA, 'ctrl+shift+alt+a', 'shift+alt+cmd+a', 'ctrl+shift+alt+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KeyA, 'ctrl+shift+win+a', 'ctrl+shift+cmd+a', 'ctrl+shift+meta+a');
		testRoundtrip(KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyA, 'shift+alt+win+a', 'ctrl+shift+alt+a', 'shift+alt+meta+a');

		// all modifiers
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyA, 'ctrl+shift+alt+win+a', 'ctrl+shift+alt+cmd+a', 'ctrl+shift+alt+meta+a');

		// chords
		testRoundtrip(KeyChord(KeyMod.CtrlCmd | KeyCode.KeyA, KeyMod.CtrlCmd | KeyCode.KeyA), 'ctrl+a ctrl+a', 'cmd+a cmd+a', 'ctrl+a ctrl+a');
		testRoundtrip(KeyChord(KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.CtrlCmd | KeyCode.UpArrow), 'ctrl+up ctrl+up', 'cmd+up cmd+up', 'ctrl+up ctrl+up');

		// OEM keys
		testRoundtrip(KeyCode.Semicolon, ';', ';', ';');
		testRoundtrip(KeyCode.Equal, '=', '=', '=');
		testRoundtrip(KeyCode.Comma, ',', ',', ',');
		testRoundtrip(KeyCode.Minus, '-', '-', '-');
		testRoundtrip(KeyCode.Period, '.', '.', '.');
		testRoundtrip(KeyCode.Slash, '/', '/', '/');
		testRoundtrip(KeyCode.Backquote, '`', '`', '`');
		testRoundtrip(KeyCode.ABNT_C1, 'abnt_c1', 'abnt_c1', 'abnt_c1');
		testRoundtrip(KeyCode.ABNT_C2, 'abnt_c2', 'abnt_c2', 'abnt_c2');
		testRoundtrip(KeyCode.BracketLeft, '[', '[', '[');
		testRoundtrip(KeyCode.Backslash, '\\', '\\', '\\');
		testRoundtrip(KeyCode.BracketRight, ']', ']', ']');
		testRoundtrip(KeyCode.Quote, '\'', '\'', '\'');
		testRoundtrip(KeyCode.OEM_8, 'oem_8', 'oem_8', 'oem_8');
		testRoundtrip(KeyCode.IntlBackslash, 'oem_102', 'oem_102', 'oem_102');

		// OEM aliases
		testDeserialization('OEM_1', 'OEM_1', 'OEM_1', KeyCode.Semicolon);
		testDeserialization('OEM_PLUS', 'OEM_PLUS', 'OEM_PLUS', KeyCode.Equal);
		testDeserialization('OEM_COMMA', 'OEM_COMMA', 'OEM_COMMA', KeyCode.Comma);
		testDeserialization('OEM_MINUS', 'OEM_MINUS', 'OEM_MINUS', KeyCode.Minus);
		testDeserialization('OEM_PERIOD', 'OEM_PERIOD', 'OEM_PERIOD', KeyCode.Period);
		testDeserialization('OEM_2', 'OEM_2', 'OEM_2', KeyCode.Slash);
		testDeserialization('OEM_3', 'OEM_3', 'OEM_3', KeyCode.Backquote);
		testDeserialization('ABNT_C1', 'ABNT_C1', 'ABNT_C1', KeyCode.ABNT_C1);
		testDeserialization('ABNT_C2', 'ABNT_C2', 'ABNT_C2', KeyCode.ABNT_C2);
		testDeserialization('OEM_4', 'OEM_4', 'OEM_4', KeyCode.BracketLeft);
		testDeserialization('OEM_5', 'OEM_5', 'OEM_5', KeyCode.Backslash);
		testDeserialization('OEM_6', 'OEM_6', 'OEM_6', KeyCode.BracketRight);
		testDeserialization('OEM_7', 'OEM_7', 'OEM_7', KeyCode.Quote);
		testDeserialization('OEM_8', 'OEM_8', 'OEM_8', KeyCode.OEM_8);
		testDeserialization('OEM_102', 'OEM_102', 'OEM_102', KeyCode.IntlBackslash);

		// accepts '-' as separator
		testDeserialization('ctrl-shift-alt-win-a', 'ctrl-shift-alt-cmd-a', 'ctrl-shift-alt-meta-a', KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyA);

		// various input mistakes
		testDeserialization(' ctrl-shift-alt-win-A ', ' shift-alt-cmd-Ctrl-A ', ' ctrl-shift-alt-META-A ', KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyA);
	});

	test('deserialize scan codes', () => {
		assert.deepStrictEqual(
			KeybindingParser.parseKeybinding('ctrl+shift+[comma] ctrl+/'),
			new Keybinding([new ScanCodeChord(true, true, false, false, ScanCode.Comma), new KeyCodeChord(true, false, false, false, KeyCode.Slash)])
		);
	});

	test('issue #10452 - invalid command', () => {
		const strJSON = `[{ "key": "ctrl+k ctrl+f", "command": ["firstcommand", "seccondcommand"] }]`;
		const userKeybinding = <Object>JSON.parse(strJSON)[0];
		const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
		assert.strictEqual(keybindingItem.command, null);
	});

	test('issue #10452 - invalid when', () => {
		const strJSON = `[{ "key": "ctrl+k ctrl+f", "command": "firstcommand", "when": [] }]`;
		const userKeybinding = <Object>JSON.parse(strJSON)[0];
		const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
		assert.strictEqual(keybindingItem.when, undefined);
	});

	test('issue #10452 - invalid key', () => {
		const strJSON = `[{ "key": [], "command": "firstcommand" }]`;
		const userKeybinding = <Object>JSON.parse(strJSON)[0];
		const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
		assert.deepStrictEqual(keybindingItem.keybinding, null);
	});

	test('issue #10452 - invalid key 2', () => {
		const strJSON = `[{ "key": "", "command": "firstcommand" }]`;
		const userKeybinding = <Object>JSON.parse(strJSON)[0];
		const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
		assert.deepStrictEqual(keybindingItem.keybinding, null);
	});

	test('test commands args', () => {
		const strJSON = `[{ "key": "ctrl+k ctrl+f", "command": "firstcommand", "when": [], "args": { "text": "theText" } }]`;
		const userKeybinding = <Object>JSON.parse(strJSON)[0];
		const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
		assert.strictEqual(keybindingItem.commandArgs.text, 'theText');
	});
});
