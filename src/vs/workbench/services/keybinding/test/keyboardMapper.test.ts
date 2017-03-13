/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { mac_de_ch } from 'vs/workbench/services/keybinding/test/mac_de_ch';
import { KeyMod, KeyCode, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { KeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: KeyboardMapper;

	suiteSetup(() => {
		mapper = new KeyboardMapper(mac_de_ch, OperatingSystem.Macintosh);
	});

	function assertKeybindingTranslation(kb: number, expected: string): void {
		let actualPrintableKeypress = mapper.mapSimpleKeybinding(new SimpleKeybinding(kb));
		let actual = UserSettingsLabelProvider.toLabel2(actualPrintableKeypress, null, OperatingSystem.Macintosh);
		assert.deepEqual(actual, expected);
	}

	test('unchanged', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Shift+Cmd+KeyB');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Cmd+KeyB');
	});

	test('flips Y and Z', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Cmd+KeyZ');
	});

	test('other key codes', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_SEMICOLON, 'Shift+Cmd+Comma');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SEMICOLON, 'Shift+Cmd+Period');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_SEMICOLON, 'Shift+Alt+Cmd+Period');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_EQUAL, 'Shift+Cmd+Digit0');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_EQUAL, 'Shift+Cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_EQUAL, 'Shift+Alt+Cmd+Digit1');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_COMMA, 'Cmd+Comma');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_COMMA, 'Cmd+Backquote');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_COMMA, 'Alt+Cmd+Backquote');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_MINUS, 'Cmd+Slash');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_MINUS, 'Shift+Cmd+Slash');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_MINUS, 'Shift+Alt+Cmd+Slash');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_DOT, 'Cmd+Period');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_DOT, 'Shift+Cmd+Backquote');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_DOT, 'Shift+Alt+Cmd+Backquote');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_SLASH, 'Shift+Cmd+Digit7');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SLASH, 'Shift+Cmd+Minus');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_SLASH, 'Shift+Alt+Cmd+Minus');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_BACKTICK, 'Shift+Cmd+Equal');

		// assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_BACKTICK, 'Shift+Cmd+Minus');
		// assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.US_BACKTICK, 'Shift+Alt+Cmd+Minus');
		// /**
		//  * Used for miscellaneous characters; it can vary by keyboard.
		//  * For the US standard keyboard, the '`~' key
		//  */
		// US_BACKTICK = 86,

		// /**
		//  * Used for miscellaneous characters; it can vary by keyboard.
		//  * For the US standard keyboard, the '[{' key
		//  */
		// US_OPEN_SQUARE_BRACKET = 87,
		// /**
		//  * Used for miscellaneous characters; it can vary by keyboard.
		//  * For the US standard keyboard, the '\|' key
		//  */
		// US_BACKSLASH = 88,
		// /**
		//  * Used for miscellaneous characters; it can vary by keyboard.
		//  * For the US standard keyboard, the ']}' key
		//  */
		// US_CLOSE_SQUARE_BRACKET = 89,
		// /**
		//  * Used for miscellaneous characters; it can vary by keyboard.
		//  * For the US standard keyboard, the ''"' key
		//  */
		// US_QUOTE = 90,
		// /**
		//  * Used for miscellaneous characters; it can vary by keyboard.
		//  */
		// OEM_8 = 91,
		// /**
		//  * Either the angle bracket key or the backslash key on the RT 102-key keyboard.
		//  */
		// OEM_102 = 92,

	});
});
