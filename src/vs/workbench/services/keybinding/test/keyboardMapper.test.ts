/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { mac_de_ch } from 'vs/workbench/services/keybinding/test/mac_de_ch';
import { linux_de_ch } from 'vs/workbench/services/keybinding/test/linux_de_ch';
import { KeyMod, KeyCode, SimpleKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { KeyboardMapper } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider, PrintableKeypress } from 'vs/platform/keybinding/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { KeyboardEventCodeUtils } from "vs/workbench/services/keybinding/common/keyboardEventCode";

function _assertKeybindingTranslation(mapper: KeyboardMapper, OS: OperatingSystem, kb: number, expected: string[]): void {
	let actualHardwareKeypresses = mapper.mapSimpleKeybinding(new SimpleKeybinding(kb));
	let actualPrintableKeypresses = actualHardwareKeypresses.map(k => new PrintableKeypress(
		k.ctrlKey,
		k.shiftKey,
		k.altKey,
		k.metaKey,
		KeyboardEventCodeUtils.toString(k.code)
	));
	let actual = actualPrintableKeypresses.map(kp => UserSettingsLabelProvider.toLabel2(kp, null, OS));
	let usLayout = new USLayoutResolvedKeybinding(createKeybinding(kb), OS);
	assert.deepEqual(actual, expected, `"${usLayout.getUserSettingsLabel()}" -- actual: "${actual}" -- expected: "${expected}"`);
}

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: KeyboardMapper;

	suiteSetup(() => {
		mapper = new KeyboardMapper(mac_de_ch, OperatingSystem.Macintosh);
	});

	function assertKeybindingTranslation(kb: number, expected: string): void {
		if (expected === null) {
			_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, []);
		} else {
			_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, [expected]);
		}
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


suite('keyboardMapper - LINUX de_ch', () => {

	let mapper: KeyboardMapper;

	suiteSetup(() => {
		mapper = new KeyboardMapper(linux_de_ch, OperatingSystem.Linux);
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		if (typeof expected === 'string') {
			_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, [expected]);
		} else if (Array.isArray(expected)) {
			_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, expected);
		} else {
			_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, []);
		}
	}

	test('mapSimpleKeybinding unchanged', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Ctrl+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Ctrl+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Ctrl+Shift+KeyB');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Meta+KeyB');
	});

	test('mapSimpleKeybinding flips Y and Z', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Ctrl+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Ctrl+KeyZ');
	});

	test('mapSimpleKeybinding other key codes', () => {
		interface IExpected {
			noModifiers: string | string[];
			ctrl: string | string[];
			alt: string | string[];
			meta: string | string[];
			ctrl_alt: string | string[];
			ctrl_meta: string | string[];
			alt_meta: string | string[];
			ctrl_alt_meta: string | string[];
		}
		function assertForAllModifiers(base: number, expected: IExpected): void {
			assertKeybindingTranslation(base, expected.noModifiers);
			assertKeybindingTranslation(KeyMod.CtrlCmd | base, expected.ctrl);
			assertKeybindingTranslation(KeyMod.Alt | base, expected.alt);
			assertKeybindingTranslation(KeyMod.WinCtrl | base, expected.meta);
			assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Alt | base, expected.ctrl_alt);
			assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.WinCtrl | base, expected.ctrl_meta);
			assertKeybindingTranslation(KeyMod.Alt | KeyMod.WinCtrl | base, expected.alt_meta);
			assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.WinCtrl | base, expected.ctrl_alt_meta);
		}

		// ;
		assertForAllModifiers(KeyCode.US_SEMICOLON, {
			noModifiers: 'Shift+Comma',
			ctrl: 'Ctrl+Shift+Comma',
			alt: 'Shift+Alt+Comma',
			meta: 'Shift+Meta+Comma',
			ctrl_alt: 'Ctrl+Shift+Alt+Comma',
			ctrl_meta: 'Ctrl+Shift+Meta+Comma',
			alt_meta: 'Shift+Alt+Meta+Comma',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Comma',
		});
		// :
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_SEMICOLON, {
			noModifiers: 'Shift+Period',
			ctrl: 'Ctrl+Shift+Period',
			alt: 'Shift+Alt+Period',
			meta: 'Shift+Meta+Period',
			ctrl_alt: 'Ctrl+Shift+Alt+Period',
			ctrl_meta: 'Ctrl+Shift+Meta+Period',
			alt_meta: 'Shift+Alt+Meta+Period',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Period',
		});
		// =
		assertForAllModifiers(KeyCode.US_EQUAL, {
			noModifiers: 'Shift+Digit0',
			ctrl: 'Ctrl+Shift+Digit0',
			alt: 'Shift+Alt+Digit0',
			meta: 'Shift+Meta+Digit0',
			ctrl_alt: 'Ctrl+Shift+Alt+Digit0',
			ctrl_meta: 'Ctrl+Shift+Meta+Digit0',
			alt_meta: 'Shift+Alt+Meta+Digit0',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Digit0',
		});
		// +
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_EQUAL, {
			noModifiers: 'Shift+Digit1',
			ctrl: 'Ctrl+Shift+Digit1',
			alt: 'Shift+Alt+Digit1',
			meta: 'Shift+Meta+Digit1',
			ctrl_alt: 'Ctrl+Shift+Alt+Digit1',
			ctrl_meta: 'Ctrl+Shift+Meta+Digit1',
			alt_meta: 'Shift+Alt+Meta+Digit1',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Digit1',
		});
		// ,
		assertForAllModifiers(KeyCode.US_COMMA, {
			noModifiers: 'Comma',
			ctrl: 'Ctrl+Comma',
			alt: 'Alt+Comma',
			meta: 'Meta+Comma',
			ctrl_alt: 'Ctrl+Alt+Comma',
			ctrl_meta: 'Ctrl+Meta+Comma',
			alt_meta: 'Alt+Meta+Comma',
			ctrl_alt_meta: 'Ctrl+Alt+Meta+Comma',
		});
		// <
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_COMMA, {
			noModifiers: ['IntlBackslash', 'Ctrl+Shift+Alt+KeyZ'],
			ctrl: 'Ctrl+IntlBackslash',
			alt: 'Alt+IntlBackslash',
			meta: ['Meta+IntlBackslash', 'Ctrl+Shift+Alt+Meta+KeyZ'],
			ctrl_alt: 'Ctrl+Alt+IntlBackslash',
			ctrl_meta: 'Ctrl+Meta+IntlBackslash',
			alt_meta: 'Alt+Meta+IntlBackslash',
			ctrl_alt_meta: 'Ctrl+Alt+Meta+IntlBackslash',
		});
		// -
		assertForAllModifiers(KeyCode.US_MINUS, {
			noModifiers: 'Slash',
			ctrl: 'Ctrl+Slash',
			alt: 'Alt+Slash',
			meta: 'Meta+Slash',
			ctrl_alt: 'Ctrl+Alt+Slash',
			ctrl_meta: 'Ctrl+Meta+Slash',
			alt_meta: 'Alt+Meta+Slash',
			ctrl_alt_meta: 'Ctrl+Alt+Meta+Slash',
		});
		// _
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_MINUS, {
			noModifiers: 'Shift+Slash',
			ctrl: 'Ctrl+Shift+Slash',
			alt: 'Shift+Alt+Slash',
			meta: 'Shift+Meta+Slash',
			ctrl_alt: 'Ctrl+Shift+Alt+Slash',
			ctrl_meta: 'Ctrl+Shift+Meta+Slash',
			alt_meta: 'Shift+Alt+Meta+Slash',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Slash',
		});
		// .
		assertForAllModifiers(KeyCode.US_DOT, {
			noModifiers: 'Period',
			ctrl: 'Ctrl+Period',
			alt: 'Alt+Period',
			meta: 'Meta+Period',
			ctrl_alt: 'Ctrl+Alt+Period',
			ctrl_meta: 'Ctrl+Meta+Period',
			alt_meta: 'Alt+Meta+Period',
			ctrl_alt_meta: 'Ctrl+Alt+Meta+Period',
		});
		// >
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_DOT, {
			noModifiers: ['Shift+IntlBackslash', 'Ctrl+Shift+Alt+KeyX'],
			ctrl: 'Ctrl+Shift+IntlBackslash',
			alt: 'Shift+Alt+IntlBackslash',
			meta: ['Shift+Meta+IntlBackslash', 'Ctrl+Shift+Alt+Meta+KeyX'],
			ctrl_alt: 'Ctrl+Shift+Alt+IntlBackslash',
			ctrl_meta: 'Ctrl+Shift+Meta+IntlBackslash',
			alt_meta: 'Shift+Alt+Meta+IntlBackslash',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+IntlBackslash',
		});
		// /
		assertForAllModifiers(KeyCode.US_SLASH, {
			noModifiers: 'Shift+Digit7',
			ctrl: 'Ctrl+Shift+Digit7',
			alt: 'Shift+Alt+Digit7',
			meta: 'Shift+Meta+Digit7',
			ctrl_alt: 'Ctrl+Shift+Alt+Digit7',
			ctrl_meta: 'Ctrl+Shift+Meta+Digit7',
			alt_meta: 'Shift+Alt+Meta+Digit7',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Digit7',
		});
		// ?
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_SLASH, {
			noModifiers: 'Shift+Minus',
			ctrl: 'Ctrl+Shift+Minus',
			alt: 'Shift+Alt+Minus',
			meta: 'Shift+Meta+Minus',
			ctrl_alt: 'Ctrl+Shift+Alt+Minus',
			ctrl_meta: 'Ctrl+Shift+Meta+Minus',
			alt_meta: 'Shift+Alt+Meta+Minus',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Minus',
		});
		// `
		assertForAllModifiers(KeyCode.US_BACKTICK, {
			noModifiers: 'Shift+Equal',
			ctrl: 'Ctrl+Shift+Equal',
			alt: 'Shift+Alt+Equal',
			meta: 'Shift+Meta+Equal',
			ctrl_alt: 'Ctrl+Shift+Alt+Equal',
			ctrl_meta: 'Ctrl+Shift+Meta+Equal',
			alt_meta: 'Shift+Alt+Meta+Equal',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Equal',
		});
		// ~
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_BACKTICK, {
			noModifiers: null,
			ctrl: null,
			alt: null,
			meta: null,
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// [
		assertForAllModifiers(KeyCode.US_OPEN_SQUARE_BRACKET, {
			noModifiers: 'Ctrl+Alt+BracketLeft',
			ctrl: null,
			alt: null,
			meta: 'Ctrl+Alt+Meta+BracketLeft',
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// {
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET, {
			noModifiers: 'Ctrl+Alt+Quote',
			ctrl: null,
			alt: null,
			meta: 'Ctrl+Alt+Meta+Quote',
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// \
		assertForAllModifiers(KeyCode.US_BACKSLASH, {
			noModifiers: 'Ctrl+Alt+IntlBackslash',
			ctrl: null,
			alt: null,
			meta: 'Ctrl+Alt+Meta+IntlBackslash',
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// |
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_BACKSLASH, {
			noModifiers: ['Ctrl+Alt+Digit1', 'Ctrl+Alt+Digit7'],
			ctrl: null,
			alt: null,
			meta: ['Ctrl+Alt+Meta+Digit1', 'Ctrl+Alt+Meta+Digit7'],
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// ]
		assertForAllModifiers(KeyCode.US_CLOSE_SQUARE_BRACKET, {
			noModifiers: ['Ctrl+Alt+Digit9', 'Ctrl+Alt+BracketRight'],
			ctrl: null,
			alt: null,
			meta: ['Ctrl+Alt+Meta+Digit9', 'Ctrl+Alt+Meta+BracketRight'],
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// }
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET, {
			noModifiers: ['Ctrl+Alt+Digit0', 'Ctrl+Alt+Backslash'],
			ctrl: null,
			alt: null,
			meta: ['Ctrl+Alt+Meta+Digit0', 'Ctrl+Alt+Meta+Backslash'],
			ctrl_alt: null,
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: null,
		});
		// '
		assertForAllModifiers(KeyCode.US_QUOTE, {
			noModifiers: 'Minus',
			ctrl: 'Ctrl+Minus',
			alt: 'Alt+Minus',
			meta: 'Meta+Minus',
			ctrl_alt: 'Ctrl+Alt+Minus',
			ctrl_meta: 'Ctrl+Meta+Minus',
			alt_meta: 'Alt+Meta+Minus',
			ctrl_alt_meta: 'Ctrl+Alt+Meta+Minus',
		});
		// "
		assertForAllModifiers(KeyMod.Shift | KeyCode.US_QUOTE, {
			noModifiers: 'Shift+Digit2',
			ctrl: 'Ctrl+Shift+Digit2',
			alt: 'Shift+Alt+Digit2',
			meta: 'Shift+Meta+Digit2',
			ctrl_alt: 'Ctrl+Shift+Alt+Digit2',
			ctrl_meta: 'Ctrl+Shift+Meta+Digit2',
			alt_meta: 'Shift+Alt+Meta+Digit2',
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+Digit2',
		});
		// OEM_8
		// OEM_102
	});
});
