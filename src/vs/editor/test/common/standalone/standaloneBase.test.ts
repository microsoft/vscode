/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { KeyCode as StandaloneKeyCode, Severity as StandaloneSeverity } from 'vs/editor/common/standalone/standaloneBase';
import { KeyCode as RuntimeKeyCode } from 'vs/base/common/keyCodes';
import { KeybindingLabels } from 'vs/base/common/keybinding';
import RuntimeSeverity from 'vs/base/common/severity';

suite('StandaloneBase', () => {
	test('exports enums correctly', () => {
		assert.equal(StandaloneSeverity.Ignore, RuntimeSeverity.Ignore);
		assert.equal(StandaloneSeverity.Info, RuntimeSeverity.Info);
		assert.equal(StandaloneSeverity.Warning, RuntimeSeverity.Warning);
		assert.equal(StandaloneSeverity.Error, RuntimeSeverity.Error);
	});
});

suite('KeyCode', () => {
	test('is exported correctly in standalone editor', () => {

		function assertKeyCode(standalone: StandaloneKeyCode, runtime: RuntimeKeyCode): void {
			assert.equal(standalone, runtime);
		}

		assertKeyCode(StandaloneKeyCode.Unknown, RuntimeKeyCode.Unknown);
		assertKeyCode(StandaloneKeyCode.Backspace, RuntimeKeyCode.Backspace);
		assertKeyCode(StandaloneKeyCode.Tab, RuntimeKeyCode.Tab);
		assertKeyCode(StandaloneKeyCode.Enter, RuntimeKeyCode.Enter);
		assertKeyCode(StandaloneKeyCode.Shift, RuntimeKeyCode.Shift);
		assertKeyCode(StandaloneKeyCode.Ctrl, RuntimeKeyCode.Ctrl);
		assertKeyCode(StandaloneKeyCode.Alt, RuntimeKeyCode.Alt);
		assertKeyCode(StandaloneKeyCode.PauseBreak, RuntimeKeyCode.PauseBreak);
		assertKeyCode(StandaloneKeyCode.CapsLock, RuntimeKeyCode.CapsLock);
		assertKeyCode(StandaloneKeyCode.Escape, RuntimeKeyCode.Escape);
		assertKeyCode(StandaloneKeyCode.Space, RuntimeKeyCode.Space);
		assertKeyCode(StandaloneKeyCode.PageUp, RuntimeKeyCode.PageUp);
		assertKeyCode(StandaloneKeyCode.PageDown, RuntimeKeyCode.PageDown);
		assertKeyCode(StandaloneKeyCode.End, RuntimeKeyCode.End);
		assertKeyCode(StandaloneKeyCode.Home, RuntimeKeyCode.Home);
		assertKeyCode(StandaloneKeyCode.LeftArrow, RuntimeKeyCode.LeftArrow);
		assertKeyCode(StandaloneKeyCode.UpArrow, RuntimeKeyCode.UpArrow);
		assertKeyCode(StandaloneKeyCode.RightArrow, RuntimeKeyCode.RightArrow);
		assertKeyCode(StandaloneKeyCode.DownArrow, RuntimeKeyCode.DownArrow);
		assertKeyCode(StandaloneKeyCode.Insert, RuntimeKeyCode.Insert);
		assertKeyCode(StandaloneKeyCode.Delete, RuntimeKeyCode.Delete);
		assertKeyCode(StandaloneKeyCode.KEY_0, RuntimeKeyCode.KEY_0);
		assertKeyCode(StandaloneKeyCode.KEY_1, RuntimeKeyCode.KEY_1);
		assertKeyCode(StandaloneKeyCode.KEY_2, RuntimeKeyCode.KEY_2);
		assertKeyCode(StandaloneKeyCode.KEY_3, RuntimeKeyCode.KEY_3);
		assertKeyCode(StandaloneKeyCode.KEY_4, RuntimeKeyCode.KEY_4);
		assertKeyCode(StandaloneKeyCode.KEY_5, RuntimeKeyCode.KEY_5);
		assertKeyCode(StandaloneKeyCode.KEY_6, RuntimeKeyCode.KEY_6);
		assertKeyCode(StandaloneKeyCode.KEY_7, RuntimeKeyCode.KEY_7);
		assertKeyCode(StandaloneKeyCode.KEY_8, RuntimeKeyCode.KEY_8);
		assertKeyCode(StandaloneKeyCode.KEY_9, RuntimeKeyCode.KEY_9);
		assertKeyCode(StandaloneKeyCode.KEY_A, RuntimeKeyCode.KEY_A);
		assertKeyCode(StandaloneKeyCode.KEY_B, RuntimeKeyCode.KEY_B);
		assertKeyCode(StandaloneKeyCode.KEY_C, RuntimeKeyCode.KEY_C);
		assertKeyCode(StandaloneKeyCode.KEY_D, RuntimeKeyCode.KEY_D);
		assertKeyCode(StandaloneKeyCode.KEY_E, RuntimeKeyCode.KEY_E);
		assertKeyCode(StandaloneKeyCode.KEY_F, RuntimeKeyCode.KEY_F);
		assertKeyCode(StandaloneKeyCode.KEY_G, RuntimeKeyCode.KEY_G);
		assertKeyCode(StandaloneKeyCode.KEY_H, RuntimeKeyCode.KEY_H);
		assertKeyCode(StandaloneKeyCode.KEY_I, RuntimeKeyCode.KEY_I);
		assertKeyCode(StandaloneKeyCode.KEY_J, RuntimeKeyCode.KEY_J);
		assertKeyCode(StandaloneKeyCode.KEY_K, RuntimeKeyCode.KEY_K);
		assertKeyCode(StandaloneKeyCode.KEY_L, RuntimeKeyCode.KEY_L);
		assertKeyCode(StandaloneKeyCode.KEY_M, RuntimeKeyCode.KEY_M);
		assertKeyCode(StandaloneKeyCode.KEY_N, RuntimeKeyCode.KEY_N);
		assertKeyCode(StandaloneKeyCode.KEY_O, RuntimeKeyCode.KEY_O);
		assertKeyCode(StandaloneKeyCode.KEY_P, RuntimeKeyCode.KEY_P);
		assertKeyCode(StandaloneKeyCode.KEY_Q, RuntimeKeyCode.KEY_Q);
		assertKeyCode(StandaloneKeyCode.KEY_R, RuntimeKeyCode.KEY_R);
		assertKeyCode(StandaloneKeyCode.KEY_S, RuntimeKeyCode.KEY_S);
		assertKeyCode(StandaloneKeyCode.KEY_T, RuntimeKeyCode.KEY_T);
		assertKeyCode(StandaloneKeyCode.KEY_U, RuntimeKeyCode.KEY_U);
		assertKeyCode(StandaloneKeyCode.KEY_V, RuntimeKeyCode.KEY_V);
		assertKeyCode(StandaloneKeyCode.KEY_W, RuntimeKeyCode.KEY_W);
		assertKeyCode(StandaloneKeyCode.KEY_X, RuntimeKeyCode.KEY_X);
		assertKeyCode(StandaloneKeyCode.KEY_Y, RuntimeKeyCode.KEY_Y);
		assertKeyCode(StandaloneKeyCode.KEY_Z, RuntimeKeyCode.KEY_Z);
		assertKeyCode(StandaloneKeyCode.Meta, RuntimeKeyCode.Meta);
		assertKeyCode(StandaloneKeyCode.ContextMenu, RuntimeKeyCode.ContextMenu);
		assertKeyCode(StandaloneKeyCode.F1, RuntimeKeyCode.F1);
		assertKeyCode(StandaloneKeyCode.F2, RuntimeKeyCode.F2);
		assertKeyCode(StandaloneKeyCode.F3, RuntimeKeyCode.F3);
		assertKeyCode(StandaloneKeyCode.F4, RuntimeKeyCode.F4);
		assertKeyCode(StandaloneKeyCode.F5, RuntimeKeyCode.F5);
		assertKeyCode(StandaloneKeyCode.F6, RuntimeKeyCode.F6);
		assertKeyCode(StandaloneKeyCode.F7, RuntimeKeyCode.F7);
		assertKeyCode(StandaloneKeyCode.F8, RuntimeKeyCode.F8);
		assertKeyCode(StandaloneKeyCode.F9, RuntimeKeyCode.F9);
		assertKeyCode(StandaloneKeyCode.F10, RuntimeKeyCode.F10);
		assertKeyCode(StandaloneKeyCode.F11, RuntimeKeyCode.F11);
		assertKeyCode(StandaloneKeyCode.F12, RuntimeKeyCode.F12);
		assertKeyCode(StandaloneKeyCode.F13, RuntimeKeyCode.F13);
		assertKeyCode(StandaloneKeyCode.F14, RuntimeKeyCode.F14);
		assertKeyCode(StandaloneKeyCode.F15, RuntimeKeyCode.F15);
		assertKeyCode(StandaloneKeyCode.F16, RuntimeKeyCode.F16);
		assertKeyCode(StandaloneKeyCode.F17, RuntimeKeyCode.F17);
		assertKeyCode(StandaloneKeyCode.F18, RuntimeKeyCode.F18);
		assertKeyCode(StandaloneKeyCode.F19, RuntimeKeyCode.F19);
		assertKeyCode(StandaloneKeyCode.NumLock, RuntimeKeyCode.NumLock);
		assertKeyCode(StandaloneKeyCode.ScrollLock, RuntimeKeyCode.ScrollLock);
		assertKeyCode(StandaloneKeyCode.US_SEMICOLON, RuntimeKeyCode.US_SEMICOLON);
		assertKeyCode(StandaloneKeyCode.US_EQUAL, RuntimeKeyCode.US_EQUAL);
		assertKeyCode(StandaloneKeyCode.US_COMMA, RuntimeKeyCode.US_COMMA);
		assertKeyCode(StandaloneKeyCode.US_MINUS, RuntimeKeyCode.US_MINUS);
		assertKeyCode(StandaloneKeyCode.US_DOT, RuntimeKeyCode.US_DOT);
		assertKeyCode(StandaloneKeyCode.US_SLASH, RuntimeKeyCode.US_SLASH);
		assertKeyCode(StandaloneKeyCode.US_BACKTICK, RuntimeKeyCode.US_BACKTICK);
		assertKeyCode(StandaloneKeyCode.US_OPEN_SQUARE_BRACKET, RuntimeKeyCode.US_OPEN_SQUARE_BRACKET);
		assertKeyCode(StandaloneKeyCode.US_BACKSLASH, RuntimeKeyCode.US_BACKSLASH);
		assertKeyCode(StandaloneKeyCode.US_CLOSE_SQUARE_BRACKET, RuntimeKeyCode.US_CLOSE_SQUARE_BRACKET);
		assertKeyCode(StandaloneKeyCode.US_QUOTE, RuntimeKeyCode.US_QUOTE);
		assertKeyCode(StandaloneKeyCode.OEM_8, RuntimeKeyCode.OEM_8);
		assertKeyCode(StandaloneKeyCode.OEM_102, RuntimeKeyCode.OEM_102);
		assertKeyCode(StandaloneKeyCode.NUMPAD_0, RuntimeKeyCode.NUMPAD_0);
		assertKeyCode(StandaloneKeyCode.NUMPAD_1, RuntimeKeyCode.NUMPAD_1);
		assertKeyCode(StandaloneKeyCode.NUMPAD_2, RuntimeKeyCode.NUMPAD_2);
		assertKeyCode(StandaloneKeyCode.NUMPAD_3, RuntimeKeyCode.NUMPAD_3);
		assertKeyCode(StandaloneKeyCode.NUMPAD_4, RuntimeKeyCode.NUMPAD_4);
		assertKeyCode(StandaloneKeyCode.NUMPAD_5, RuntimeKeyCode.NUMPAD_5);
		assertKeyCode(StandaloneKeyCode.NUMPAD_6, RuntimeKeyCode.NUMPAD_6);
		assertKeyCode(StandaloneKeyCode.NUMPAD_7, RuntimeKeyCode.NUMPAD_7);
		assertKeyCode(StandaloneKeyCode.NUMPAD_8, RuntimeKeyCode.NUMPAD_8);
		assertKeyCode(StandaloneKeyCode.NUMPAD_9, RuntimeKeyCode.NUMPAD_9);
		assertKeyCode(StandaloneKeyCode.NUMPAD_MULTIPLY, RuntimeKeyCode.NUMPAD_MULTIPLY);
		assertKeyCode(StandaloneKeyCode.NUMPAD_ADD, RuntimeKeyCode.NUMPAD_ADD);
		assertKeyCode(StandaloneKeyCode.NUMPAD_SEPARATOR, RuntimeKeyCode.NUMPAD_SEPARATOR);
		assertKeyCode(StandaloneKeyCode.NUMPAD_SUBTRACT, RuntimeKeyCode.NUMPAD_SUBTRACT);
		assertKeyCode(StandaloneKeyCode.NUMPAD_DECIMAL, RuntimeKeyCode.NUMPAD_DECIMAL);
		assertKeyCode(StandaloneKeyCode.NUMPAD_DIVIDE, RuntimeKeyCode.NUMPAD_DIVIDE);
		assertKeyCode(StandaloneKeyCode.MAX_VALUE, RuntimeKeyCode.MAX_VALUE);
	});

	test('getUserSettingsKeybindingRegex', () => {
		let regex = new RegExp(KeybindingLabels.getUserSettingsKeybindingRegex());

		function testIsGood(userSettingsLabel: string, message: string = userSettingsLabel): void {
			let userSettings = '"' + userSettingsLabel.replace(/\\/g, '\\\\') + '"';
			let isGood = regex.test(userSettings);
			assert.ok(isGood, message);
		}

		// check that all key codes are covered by the regex
		let ignore: boolean[] = [];
		ignore[RuntimeKeyCode.Shift] = true;
		ignore[RuntimeKeyCode.Ctrl] = true;
		ignore[RuntimeKeyCode.Alt] = true;
		ignore[RuntimeKeyCode.Meta] = true;
		for (let keyCode = RuntimeKeyCode.Unknown + 1; keyCode < RuntimeKeyCode.MAX_VALUE; keyCode++) {
			if (ignore[keyCode]) {
				continue;
			}
			let userSettings = KeybindingLabels.toUserSettingsLabel(keyCode);
			testIsGood(userSettings, keyCode + ' - ' + StandaloneKeyCode[keyCode] + ' - ' + userSettings);
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