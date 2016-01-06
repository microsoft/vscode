/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IOSupport} from 'vs/platform/keybinding/common/keybindingResolver';
import {KeyMod, KeyCode, ISimplifiedPlatform} from 'vs/base/common/keyCodes';

suite('Keybinding IO', () => {

	test('serialize/deserialize', function() {
		let Platform = {
			isMacintosh: false,
			isWindows: true
		};

		function testOneSerialization(keybinding:number, expected:string, msg:string, Platform:ISimplifiedPlatform): void {
			let actualSerialized = IOSupport.writeKeybinding(keybinding, Platform);
			assert.equal(actualSerialized, expected, expected + ' - ' + msg);
		}
		function testSerialization(keybinding:number, expectedWin:string, expectedMac:string, expectedLinux:string): void {
			testOneSerialization(keybinding, expectedWin, 'win', { isMacintosh: false, isWindows: true });
			testOneSerialization(keybinding, expectedMac, 'mac', { isMacintosh: true, isWindows: false });
			testOneSerialization(keybinding, expectedLinux, 'linux', { isMacintosh: false, isWindows: false });
		}

		function testOneDeserialization(keybinding:string, expected:number, msg:string, Platform:ISimplifiedPlatform): void {
			let actualDeserialized = IOSupport.readKeybinding(keybinding, Platform);
			assert.equal(actualDeserialized, expected, keybinding + ' - ' + msg);
		}
		function testDeserialization(inWin:string, inMac:string, inLinux:string, expected:number): void {
			testOneDeserialization(inWin, expected, 'win', { isMacintosh: false, isWindows: true });
			testOneDeserialization(inMac, expected, 'mac', { isMacintosh: true, isWindows: false });
			testOneDeserialization(inLinux, expected, 'linux', { isMacintosh: false, isWindows: false });
		}

		function testRoundtrip(keybinding:number, expectedWin:string, expectedMac:string, expectedLinux:string): void {
			testSerialization(keybinding, expectedWin, expectedMac, expectedLinux);
			testDeserialization(expectedWin, expectedMac, expectedLinux, keybinding);
		}

		testRoundtrip(KeyCode.KEY_0, '0', '0', '0');
		testRoundtrip(KeyCode.KEY_A, 'a', 'a', 'a');
		testRoundtrip(KeyCode.UpArrow, 'up', 'up', 'up');
		testRoundtrip(KeyCode.RightArrow, 'right', 'right', 'right');
		testRoundtrip(KeyCode.DownArrow, 'down', 'down', 'down');
		testRoundtrip(KeyCode.LeftArrow, 'left', 'left', 'left');

		// one modifier
		testRoundtrip(KeyMod.Alt | KeyCode.KEY_A, 'alt+a', 'alt+a', 'alt+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyCode.KEY_A, 'ctrl+a', 'cmd+a', 'ctrl+a');
		testRoundtrip(KeyMod.Shift | KeyCode.KEY_A, 'shift+a', 'shift+a', 'shift+a');
		testRoundtrip(KeyMod.WinCtrl | KeyCode.KEY_A, 'win+a', 'ctrl+a', 'meta+a');

		// two modifiers
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_A, 'ctrl+alt+a', 'alt+cmd+a', 'ctrl+alt+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_A, 'ctrl+shift+a', 'shift+cmd+a', 'ctrl+shift+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KEY_A, 'ctrl+win+a', 'ctrl+cmd+a', 'ctrl+meta+a');
		testRoundtrip(KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, 'shift+alt+a', 'shift+alt+a', 'shift+alt+a');
		testRoundtrip(KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, 'shift+win+a', 'ctrl+shift+a', 'shift+meta+a');
		testRoundtrip(KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'alt+win+a', 'ctrl+alt+a', 'alt+meta+a');

		// three modifiers
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KEY_A, 'ctrl+shift+alt+a', 'shift+alt+cmd+a', 'ctrl+shift+alt+a');
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.WinCtrl | KeyCode.KEY_A, 'ctrl+shift+win+a', 'ctrl+shift+cmd+a', 'ctrl+shift+meta+a');
		testRoundtrip(KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'shift+alt+win+a', 'ctrl+shift+alt+a', 'shift+alt+meta+a');

		// all modifiers
		testRoundtrip(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_A, 'ctrl+shift+alt+win+a', 'ctrl+shift+alt+cmd+a', 'ctrl+shift+alt+meta+a');

		// OEM keys
		testRoundtrip(KeyCode.US_SEMICOLON, ';', ';', ';');
		testRoundtrip(KeyCode.US_EQUAL, '=', '=', '=');
		testRoundtrip(KeyCode.US_COMMA, ',', ',', ',');
		testRoundtrip(KeyCode.US_MINUS, '-', '-', '-');
		testRoundtrip(KeyCode.US_DOT, '.', '.', '.');
		testRoundtrip(KeyCode.US_SLASH, '/', '/', '/');
		testRoundtrip(KeyCode.US_BACKTICK, '`', '`', '`');
		testRoundtrip(KeyCode.US_OPEN_SQUARE_BRACKET, '[', '[', '[');
		testRoundtrip(KeyCode.US_BACKSLASH, '\\', '\\', '\\');
		testRoundtrip(KeyCode.US_CLOSE_SQUARE_BRACKET, ']', ']', ']');
		testRoundtrip(KeyCode.US_QUOTE, '\'', '\'', '\'');
	});

});