/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { mac_de_ch } from 'vs/workbench/services/keybinding/test/mac_de_ch';
import { KeyMod, KeyCode, SimpleKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { KeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider, PrintableKeypress } from 'vs/platform/keybinding/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { KeyboardEventCodeUtils } from "vs/workbench/services/keybinding/common/keyboardEventCode";

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: KeyboardMapper;

	suiteSetup(() => {
		mapper = new KeyboardMapper(mac_de_ch, OperatingSystem.Macintosh);
	});

	function assertKeybindingTranslation(kb: number, expected: string): void {
		let actualHardwareKeypress = mapper.mapSimpleKeybinding(new SimpleKeybinding(kb));
		let actualPrintableKeypress = actualHardwareKeypress ? new PrintableKeypress(
			actualHardwareKeypress.ctrlKey,
			actualHardwareKeypress.shiftKey,
			actualHardwareKeypress.altKey,
			actualHardwareKeypress.metaKey,
			KeyboardEventCodeUtils.toString(actualHardwareKeypress.code)
		) : null;
		let actual = actualPrintableKeypress ? UserSettingsLabelProvider.toLabel2(actualPrintableKeypress, null, OperatingSystem.Macintosh) : null;
		let usLayout = new USLayoutResolvedKeybinding(createKeybinding(kb), OperatingSystem.Macintosh);
		assert.deepEqual(actual, expected, `"${usLayout.getUserSettingsLabel()}" -- actual: "${actual}" -- expected: "${expected}"`);
	}

	test('mapSimpleKeybinding unchanged', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Shift+Cmd+KeyB');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Cmd+KeyB');
	});

	test('mapSimpleKeybinding flips Y and Z', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Cmd+KeyZ');
	});

	test('mapSimpleKeybinding other key codes', () => {
		interface IExpected {
			noModifiers: string;
			cmd: string;
			alt: string;
			ctrl: string;
			cmd_alt: string;
			cmd_ctrl: string;
			alt_ctrl: string;
			cmd_alt_ctrl: string;
		}
		function assertForAllModifiers(base: number, expected: IExpected): void {
			assertKeybindingTranslation(base, expected.noModifiers);
			assertKeybindingTranslation(KeyMod.CtrlCmd | base, expected.cmd);
			assertKeybindingTranslation(KeyMod.Alt | base, expected.alt);
			assertKeybindingTranslation(KeyMod.WinCtrl | base, expected.ctrl);
			assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Alt | base, expected.cmd_alt);
			assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.WinCtrl | base, expected.cmd_ctrl);
			assertKeybindingTranslation(KeyMod.Alt | KeyMod.WinCtrl | base, expected.alt_ctrl);
			assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | base, expected.cmd_alt_ctrl);
		}

		// ;
		assertForAllModifiers(KeyCode.US_SEMICOLON, {
			noModifiers: 'Shift+Comma',
			cmd: 'Shift+Cmd+Comma',
			alt: 'Shift+Alt+Comma',
			ctrl: 'Ctrl+Shift+Comma',
			cmd_alt: 'Shift+Alt+Cmd+Comma',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Comma',
			alt_ctrl: 'Ctrl+Shift+Alt+Comma',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Comma',
		});
		// :
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_SEMICOLON, {
			noModifiers: 'Shift+Period',
			cmd: 'Shift+Cmd+Period',
			alt: 'Shift+Alt+Period',
			ctrl: 'Ctrl+Shift+Period',
			cmd_alt: 'Shift+Alt+Cmd+Period',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Period',
			alt_ctrl: 'Ctrl+Shift+Alt+Period',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Period',
		});
		// =
		assertForAllModifiers(KeyCode.US_EQUAL, {
			noModifiers: 'Shift+Digit0',
			cmd: 'Shift+Cmd+Digit0',
			alt: 'Shift+Alt+Digit0',
			ctrl: 'Ctrl+Shift+Digit0',
			cmd_alt: 'Shift+Alt+Cmd+Digit0',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Digit0',
			alt_ctrl: 'Ctrl+Shift+Alt+Digit0',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Digit0',
		});
		// +
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_EQUAL, {
			noModifiers: 'Shift+Digit1',
			cmd: 'Shift+Cmd+Digit1',
			alt: 'Shift+Alt+Digit1',
			ctrl: 'Ctrl+Shift+Digit1',
			cmd_alt: 'Shift+Alt+Cmd+Digit1',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Digit1',
			alt_ctrl: 'Ctrl+Shift+Alt+Digit1',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Digit1',
		});
		// ,
		assertForAllModifiers(KeyCode.US_COMMA, {
			noModifiers: 'Comma',
			cmd: 'Cmd+Comma',
			alt: 'Alt+Comma',
			ctrl: 'Ctrl+Comma',
			cmd_alt: 'Alt+Cmd+Comma',
			cmd_ctrl: 'Ctrl+Cmd+Comma',
			alt_ctrl: 'Ctrl+Alt+Comma',
			cmd_alt_ctrl: 'Ctrl+Alt+Cmd+Comma',
		});
		// <
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_COMMA, {
			noModifiers: 'Backquote',
			cmd: 'Cmd+Backquote',
			alt: 'Alt+Backquote',
			ctrl: 'Ctrl+Backquote',
			cmd_alt: 'Alt+Cmd+Backquote',
			cmd_ctrl: 'Ctrl+Cmd+Backquote',
			alt_ctrl: 'Ctrl+Alt+Backquote',
			cmd_alt_ctrl: 'Ctrl+Alt+Cmd+Backquote',
		});
		// -
		assertForAllModifiers(KeyCode.US_MINUS, {
			noModifiers: 'Slash',
			cmd: 'Cmd+Slash',
			alt: 'Alt+Slash',
			ctrl: 'Ctrl+Slash',
			cmd_alt: 'Alt+Cmd+Slash',
			cmd_ctrl: 'Ctrl+Cmd+Slash',
			alt_ctrl: 'Ctrl+Alt+Slash',
			cmd_alt_ctrl: 'Ctrl+Alt+Cmd+Slash',
		});
		// _
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_MINUS, {
			noModifiers: 'Shift+Slash',
			cmd: 'Shift+Cmd+Slash',
			alt: 'Shift+Alt+Slash',
			ctrl: 'Ctrl+Shift+Slash',
			cmd_alt: 'Shift+Alt+Cmd+Slash',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Slash',
			alt_ctrl: 'Ctrl+Shift+Alt+Slash',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Slash',
		});
		// .
		assertForAllModifiers(KeyCode.US_DOT, {
			noModifiers: 'Period',
			cmd: 'Cmd+Period',
			alt: 'Alt+Period',
			ctrl: 'Ctrl+Period',
			cmd_alt: 'Alt+Cmd+Period',
			cmd_ctrl: 'Ctrl+Cmd+Period',
			alt_ctrl: 'Ctrl+Alt+Period',
			cmd_alt_ctrl: 'Ctrl+Alt+Cmd+Period',
		});
		// >
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_DOT, {
			noModifiers: 'Shift+Backquote',
			cmd: 'Shift+Cmd+Backquote',
			alt: 'Shift+Alt+Backquote',
			ctrl: 'Ctrl+Shift+Backquote',
			cmd_alt: 'Shift+Alt+Cmd+Backquote',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Backquote',
			alt_ctrl: 'Ctrl+Shift+Alt+Backquote',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Backquote',
		});
		// /
		assertForAllModifiers(KeyCode.US_SLASH, {
			noModifiers: 'Shift+Digit7',
			cmd: 'Shift+Cmd+Digit7',
			alt: 'Shift+Alt+Digit7',
			ctrl: 'Ctrl+Shift+Digit7',
			cmd_alt: 'Shift+Alt+Cmd+Digit7',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Digit7',
			alt_ctrl: 'Ctrl+Shift+Alt+Digit7',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Digit7',
		});
		// ?
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_SLASH, {
			noModifiers: 'Shift+Minus',
			cmd: 'Shift+Cmd+Minus',
			alt: 'Shift+Alt+Minus',
			ctrl: 'Ctrl+Shift+Minus',
			cmd_alt: 'Shift+Alt+Cmd+Minus',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Minus',
			alt_ctrl: 'Ctrl+Shift+Alt+Minus',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Minus',
		});
		// `
		assertForAllModifiers(KeyCode.US_BACKTICK, {
			noModifiers: 'Shift+Equal',
			cmd: 'Shift+Cmd+Equal',
			alt: 'Shift+Alt+Equal',
			ctrl: 'Ctrl+Shift+Equal',
			cmd_alt: 'Shift+Alt+Cmd+Equal',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Equal',
			alt_ctrl: 'Ctrl+Shift+Alt+Equal',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Equal',
		});
		// ~
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_BACKTICK, {
			noModifiers: 'Ctrl+Alt+KeyN',
			cmd: 'Ctrl+Alt+Cmd+KeyN',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// [
		assertForAllModifiers(KeyCode.US_OPEN_SQUARE_BRACKET, {
			noModifiers: 'Ctrl+Alt+Digit5',
			cmd: 'Ctrl+Alt+Cmd+Digit5',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// {
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET, {
			noModifiers: 'Ctrl+Alt+Digit8',
			cmd: 'Ctrl+Alt+Cmd+Digit8',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// \
		assertForAllModifiers(KeyCode.US_BACKSLASH, {
			noModifiers: 'Ctrl+Shift+Alt+Digit7',
			cmd: 'Ctrl+Shift+Alt+Cmd+Digit7',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// |
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_BACKSLASH, {
			noModifiers: 'Ctrl+Alt+Digit7',
			cmd: 'Ctrl+Alt+Cmd+Digit7',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// ]
		assertForAllModifiers(KeyCode.US_CLOSE_SQUARE_BRACKET, {
			noModifiers: 'Ctrl+Alt+Digit6',
			cmd: 'Ctrl+Alt+Cmd+Digit6',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// }
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET, {
			noModifiers: 'Ctrl+Alt+Digit9',
			cmd: 'Ctrl+Alt+Cmd+Digit9',
			alt: null,
			ctrl: null,
			cmd_alt: null,
			cmd_ctrl: null,
			alt_ctrl: null,
			cmd_alt_ctrl: null,
		});
		// '
		assertForAllModifiers(KeyCode.US_QUOTE, {
			noModifiers: 'Minus',
			cmd: 'Cmd+Minus',
			alt: 'Alt+Minus',
			ctrl: 'Ctrl+Minus',
			cmd_alt: 'Alt+Cmd+Minus',
			cmd_ctrl: 'Ctrl+Cmd+Minus',
			alt_ctrl: 'Ctrl+Alt+Minus',
			cmd_alt_ctrl: 'Ctrl+Alt+Cmd+Minus',
		});
		// "
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_QUOTE, {
			noModifiers: 'Shift+Digit2',
			cmd: 'Shift+Cmd+Digit2',
			alt: 'Shift+Alt+Digit2',
			ctrl: 'Ctrl+Shift+Digit2',
			cmd_alt: 'Shift+Alt+Cmd+Digit2',
			cmd_ctrl: 'Ctrl+Shift+Cmd+Digit2',
			alt_ctrl: 'Ctrl+Shift+Alt+Digit2',
			cmd_alt_ctrl: 'Ctrl+Shift+Alt+Cmd+Digit2',
		});
		// OEM_8
		// OEM_102
	});
});
