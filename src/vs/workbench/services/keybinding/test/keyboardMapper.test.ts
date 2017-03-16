/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { mac_de_ch } from 'vs/workbench/services/keybinding/test/mac_de_ch';
import { linux_de_ch } from 'vs/workbench/services/keybinding/test/linux_de_ch';
import { KeyMod, KeyCode, SimpleKeybinding, createKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { KeyboardMapper, HardwareKeypress } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider, PrintableKeypress } from 'vs/platform/keybinding/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/abstractKeybindingService';
import { KeyboardEventCodeUtils, KeyboardEventCode } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { IHTMLContentElement } from "vs/base/common/htmlContent";

function _assertKeybindingTranslation(mapper: KeyboardMapper, OS: OperatingSystem, kb: number, expected: string[]): void {
	let keybindingLabel = new USLayoutResolvedKeybinding(createKeybinding(kb), OS).getUserSettingsLabel();

	// console.log(`HANDLING ${keybindingLabel}`);

	let actualHardwareKeypresses = mapper.simpleKeybindingToHardwareKeypress(new SimpleKeybinding(kb));
	if (actualHardwareKeypresses.length === 0) {
		assert.deepEqual([], expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "[]" -- expected: "${expected}"`);
		return;
	}

	let actual = actualHardwareKeypresses
		.map(k => new PrintableKeypress(k.ctrlKey, k.shiftKey, k.altKey, k.metaKey, KeyboardEventCodeUtils.toString(k.code)))
		.map(kp => UserSettingsLabelProvider.toLabel2(kp, null, OS));
	assert.deepEqual(actual, expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "${actual}" -- expected: "${expected}"`);

	// Now also check the reverse map ...
	actualHardwareKeypresses.forEach(k => {
		const hardwareKeypressLabel = `${k.ctrlKey ? 'ctrl+' : ''}${k.shiftKey ? 'shift+' : ''}${k.altKey ? 'alt+' : ''}${k.metaKey ? 'meta+' : ''}${KeyboardEventCodeUtils.toString(k.code)}`;
		const reversed = mapper.hardwareKeypressToSimpleKeybinding(k);
		if (!reversed) {
			assert.fail(`${keybindingLabel} -> ${hardwareKeypressLabel} -> null`);
			return;
		}

		const reversedLabel = new USLayoutResolvedKeybinding(reversed, OS).getUserSettingsLabel();
		assert.equal(reversedLabel, keybindingLabel, `${keybindingLabel} -> ${hardwareKeypressLabel} -> ${reversedLabel}`);
	});
}

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: KeyboardMapper;

	suiteSetup(() => {
		mapper = new KeyboardMapper(mac_de_ch, OperatingSystem.Macintosh);
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		if (typeof expected === 'string') {
			_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, [expected]);
		} else if (Array.isArray(expected)) {
			_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, expected);
		} else {
			_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, []);
		}
	}

	test('simpleKeybindingToHardwareKeypress unchanged', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Shift+Cmd+KeyB');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Cmd+KeyB');
	});

	test('simpleKeybindingToHardwareKeypress flips Y and Z', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Cmd+KeyZ');
	});

	test('simpleKeybindingToHardwareKeypress other key codes', () => {
		interface IExpected {
			noModifiers: string | string[];
			cmd: string | string[];
			alt: string | string[];
			ctrl: string | string[];
			cmd_alt: string | string[];
			cmd_ctrl: string | string[];
			alt_ctrl: string | string[];
			cmd_alt_ctrl: string | string[];
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
			alt_ctrl: null,
			cmd_alt_ctrl: null,
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
			noModifiers: ['Ctrl+Alt+Digit5', 'Ctrl+Shift+Alt+Digit5'],
			cmd: ['Ctrl+Alt+Cmd+Digit5', 'Ctrl+Shift+Alt+Cmd+Digit5'],
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
			noModifiers: ['Ctrl+Alt+Digit6', 'Ctrl+Shift+Alt+Digit6'],
			cmd: ['Ctrl+Alt+Cmd+Digit6', 'Ctrl+Shift+Alt+Cmd+Digit6'],
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

	test('resolveKeybinding - all labels', () => {
		function _assertAllLabels(keybinding: Keybinding, labels: string[], ariaLabels: string[], htmlLabel: IHTMLContentElement[][]): void {
			const kb = mapper.resolveKeybinding(keybinding);

			let actualLabels = kb.map(k => k.getLabel());
			assert.deepEqual(actualLabels, labels);

			let actualAriaLabels = kb.map(k => k.getAriaLabel());
			assert.deepEqual(actualAriaLabels, ariaLabels);

			let actualHTMLLabels = kb.map(k => k.getHTMLLabel());
			assert.deepEqual(actualHTMLLabels, htmlLabel);
		}

		function assertAllLabels(keybinding: Keybinding, label: string | string[], ariaLabel: string | string[], htmlLabel: IHTMLContentElement[][]): void {
			let _labels = (typeof label === 'string' ? [label] : label);
			let _ariaLabels = (typeof ariaLabel === 'string' ? [ariaLabel] : ariaLabel);
			_assertAllLabels(keybinding, _labels, _ariaLabels, htmlLabel);
		}


		// TODO: ElectronAccelerator, UserSettings
		assertAllLabels(
			createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_Z),
			'⌘Z',
			'Command+Z',
			[[{
				tagName: 'span',
				className: 'monaco-kb',
				children: [
					{ tagName: 'span', className: 'monaco-kbkey', text: '⌘' },
					{ tagName: 'span', className: 'monaco-kbkey', text: 'Z' },
				]
			}]]
		);
	});

	test('resolveKeybinding - aria labels', () => {
		function assertAriaLabels(keybinding: number, label: string | string[]): void {
			let _labels = (typeof label === 'string' ? [label] : label);
			const kb = mapper.resolveKeybinding(createKeybinding(keybinding));
			let actualLabels = kb.map(k => k.getAriaLabel());
			assert.deepEqual(actualLabels, _labels);
		}

		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Command+1');
		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Command+B');
		assertAriaLabels(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Shift+Command+B');
		assertAriaLabels(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Control+Shift+Alt+Command+B');
		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Command+Z');
		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Command+Y');

		// ;
		assertAriaLabels(KeyCode.US_SEMICOLON, 'Shift+,');
		// :
		assertAriaLabels(KeyMod.Shift | KeyCode.US_SEMICOLON, 'Shift+.');
		// =
		assertAriaLabels(KeyCode.US_EQUAL, 'Shift+0');
		// +
		assertAriaLabels(KeyMod.Shift | KeyCode.US_EQUAL, 'Shift+1');
		// ,
		assertAriaLabels(KeyCode.US_COMMA, ',');
		// <
		assertAriaLabels(KeyMod.Shift | KeyCode.US_COMMA, '<');
		// -
		assertAriaLabels(KeyCode.US_MINUS, '-');
		// _
		assertAriaLabels(KeyMod.Shift | KeyCode.US_MINUS, 'Shift+-');
		// .
		assertAriaLabels(KeyCode.US_DOT, '.');
		// >
		assertAriaLabels(KeyMod.Shift | KeyCode.US_DOT, 'Shift+<');
		// /
		assertAriaLabels(KeyCode.US_SLASH, 'Shift+7');
		// ?
		assertAriaLabels(KeyMod.Shift | KeyCode.US_SLASH, 'Shift+\'');
		// `
		assertAriaLabels(KeyCode.US_BACKTICK, 'Shift+^');
		// ~
		assertAriaLabels(KeyMod.Shift | KeyCode.US_BACKTICK, 'Control+Alt+N');
		// [
		assertAriaLabels(KeyCode.US_OPEN_SQUARE_BRACKET, ['Control+Alt+5', 'Control+Shift+Alt+5']);
		// {
		assertAriaLabels(KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET, 'Control+Alt+8');
		// \
		assertAriaLabels(KeyCode.US_BACKSLASH, 'Control+Shift+Alt+7');
		// |
		assertAriaLabels(KeyMod.Shift | KeyCode.US_BACKSLASH, 'Control+Alt+7');
		// ]
		assertAriaLabels(KeyCode.US_CLOSE_SQUARE_BRACKET, ['Control+Alt+6', 'Control+Shift+Alt+6']);
		// }
		assertAriaLabels(KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET, 'Control+Alt+9');
		// '
		assertAriaLabels(KeyCode.US_QUOTE, '\'');
		// "
		assertAriaLabels(KeyMod.Shift | KeyCode.US_QUOTE, 'Shift+2');
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

	function assertHardwareKeypressTranslation(ctrlKey: boolean, shiftKey: boolean, altKey: boolean, metaKey: boolean, code: KeyboardEventCode, expected: string): void {
		const keypress = new HardwareKeypress(ctrlKey, shiftKey, altKey, metaKey, code);
		const actual = mapper.hardwareKeypressToSimpleKeybinding(keypress);
		const usLayout = actual ? new USLayoutResolvedKeybinding(actual, OperatingSystem.Linux) : null;
		const actualLabel = usLayout ? usLayout.getUserSettingsLabel() : null;
		assert.deepEqual(actualLabel, expected, `${ctrlKey ? 'ctrl+' : ''}${shiftKey ? 'shift+' : ''}${altKey ? 'alt+' : ''}${metaKey ? 'meta+' : ''}${KeyboardEventCodeUtils.toString(code)} -- actual: ${actualLabel} -- expected: ${expected}`);
	}

	test('simpleKeybindingToHardwareKeypress unchanged', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Ctrl+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Ctrl+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Ctrl+Shift+KeyB');

		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Meta+KeyB');
	});

	test('hardwareKeypressToSimpleKeybinding unchanged', () => {
		assertHardwareKeypressTranslation(true, false, false, false, KeyboardEventCode.Digit1, 'ctrl+1');
		assertHardwareKeypressTranslation(true, false, false, false, KeyboardEventCode.KeyB, 'ctrl+b');
		assertHardwareKeypressTranslation(true, true, false, false, KeyboardEventCode.KeyB, 'ctrl+shift+b');
		// ctrl+shift+alt+meta+KeyB => ’
		assertHardwareKeypressTranslation(true, true, true, true, KeyboardEventCode.KeyB, 'ctrl+shift+alt+meta+b');
	});

	test('simpleKeybindingToHardwareKeypress flips Y and Z', () => {
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Ctrl+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Ctrl+KeyZ');
	});

	test('hardwareKeypressToSimpleKeybinding flips Y and Z', () => {
		assertHardwareKeypressTranslation(false, false, false, false, KeyboardEventCode.KeyY, 'z');
		assertHardwareKeypressTranslation(true, false, false, false, KeyboardEventCode.KeyY, 'ctrl+z');
		assertHardwareKeypressTranslation(false, true, false, false, KeyboardEventCode.KeyY, 'shift+z');
		assertHardwareKeypressTranslation(false, false, true, false, KeyboardEventCode.KeyY, 'alt+z');
		assertHardwareKeypressTranslation(false, false, false, true, KeyboardEventCode.KeyY, 'meta+z');

		assertHardwareKeypressTranslation(false, false, false, false, KeyboardEventCode.KeyZ, 'y');
		assertHardwareKeypressTranslation(true, false, false, false, KeyboardEventCode.KeyZ, 'ctrl+y');
		assertHardwareKeypressTranslation(false, true, false, false, KeyboardEventCode.KeyZ, 'shift+y');
		assertHardwareKeypressTranslation(false, false, true, false, KeyboardEventCode.KeyZ, 'alt+y');
		assertHardwareKeypressTranslation(false, false, false, true, KeyboardEventCode.KeyZ, 'meta+y');
	});

	test('simpleKeybindingToHardwareKeypress other key codes', () => {
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
			ctrl_alt: null,
			ctrl_meta: 'Ctrl+Meta+IntlBackslash',
			alt_meta: 'Alt+Meta+IntlBackslash',
			ctrl_alt_meta: null,
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
			ctrl_alt: null,//'Ctrl+Shift+Alt+IntlBackslash',
			ctrl_meta: 'Ctrl+Shift+Meta+IntlBackslash',
			alt_meta: 'Shift+Alt+Meta+IntlBackslash',
			ctrl_alt_meta: null,//'Ctrl+Shift+Alt+Meta+IntlBackslash',
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
			ctrl_alt: 'Ctrl+Shift+Alt+BracketLeft',
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+BracketLeft',
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
			ctrl_alt: 'Ctrl+Shift+Alt+IntlBackslash',
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: 'Ctrl+Shift+Alt+Meta+IntlBackslash',
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
			ctrl_alt: ['Ctrl+Shift+Alt+Digit9', 'Ctrl+Shift+Alt+BracketRight'],
			ctrl_meta: null,
			alt_meta: null,
			ctrl_alt_meta: ['Ctrl+Shift+Alt+Meta+Digit9', 'Ctrl+Shift+Alt+Meta+BracketRight'],
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

	test('hardwareKeypressToSimpleKeybinding other key codes', () => {
		assertHardwareKeypressTranslation(false, false, false, false, KeyboardEventCode.Comma, ',');
		assertHardwareKeypressTranslation(false, false, false, true, KeyboardEventCode.Comma, 'meta+,');
		assertHardwareKeypressTranslation(false, false, true, false, KeyboardEventCode.Comma, 'alt+,');
		assertHardwareKeypressTranslation(false, false, true, true, KeyboardEventCode.Comma, 'alt+meta+,');
		assertHardwareKeypressTranslation(false, true, false, false, KeyboardEventCode.Comma, ';');
		assertHardwareKeypressTranslation(false, true, false, true, KeyboardEventCode.Comma, 'meta+;');
		assertHardwareKeypressTranslation(false, true, true, false, KeyboardEventCode.Comma, 'alt+;');
		assertHardwareKeypressTranslation(false, true, true, true, KeyboardEventCode.Comma, 'alt+meta+;');

		assertHardwareKeypressTranslation(true, false, false, false, KeyboardEventCode.Comma, 'ctrl+,');
		assertHardwareKeypressTranslation(true, false, false, true, KeyboardEventCode.Comma, 'ctrl+meta+,');
		assertHardwareKeypressTranslation(true, false, true, false, KeyboardEventCode.Comma, 'ctrl+alt+,');
		assertHardwareKeypressTranslation(true, false, true, true, KeyboardEventCode.Comma, 'ctrl+alt+meta+,');
		assertHardwareKeypressTranslation(true, true, false, false, KeyboardEventCode.Comma, 'ctrl+;');
		assertHardwareKeypressTranslation(true, true, false, true, KeyboardEventCode.Comma, 'ctrl+meta+;');
		assertHardwareKeypressTranslation(true, true, true, false, KeyboardEventCode.Comma, 'ctrl+alt+;');
		assertHardwareKeypressTranslation(true, true, true, true, KeyboardEventCode.Comma, 'ctrl+alt+meta+;');
	});


	test('resolveKeybinding - aria labels', () => {
		function assertAriaLabels(keybinding: number, label: string | string[]): void {
			let _labels = (typeof label === 'string' ? [label] : label);
			const kb = mapper.resolveKeybinding(createKeybinding(keybinding));
			let actualLabels = kb.map(k => k.getAriaLabel());
			assert.deepEqual(actualLabels, _labels);
		}

		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Control+1');
		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Control+B');
		assertAriaLabels(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Control+Shift+B');
		assertAriaLabels(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Control+Shift+Alt+Windows+B');
		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Control+Z');
		assertAriaLabels(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Control+Y');

		// ;
		assertAriaLabels(KeyCode.US_SEMICOLON, 'Shift+,');
		// :
		assertAriaLabels(KeyMod.Shift | KeyCode.US_SEMICOLON, 'Shift+.');
		// =
		assertAriaLabels(KeyCode.US_EQUAL, 'Shift+0');
		// +
		assertAriaLabels(KeyMod.Shift | KeyCode.US_EQUAL, 'Shift+1');
		// ,
		assertAriaLabels(KeyCode.US_COMMA, ',');
		// <
		assertAriaLabels(KeyMod.Shift | KeyCode.US_COMMA, ['<', 'Control+Shift+Alt+Y']);
		// -
		assertAriaLabels(KeyCode.US_MINUS, '-');
		// _
		assertAriaLabels(KeyMod.Shift | KeyCode.US_MINUS, 'Shift+-');
		// .
		assertAriaLabels(KeyCode.US_DOT, '.');
		// >
		assertAriaLabels(KeyMod.Shift | KeyCode.US_DOT, ['Shift+<', 'Control+Shift+Alt+X']);
		// /
		assertAriaLabels(KeyCode.US_SLASH, 'Shift+7');
		// ?
		assertAriaLabels(KeyMod.Shift | KeyCode.US_SLASH, 'Shift+\'');
		// `
		assertAriaLabels(KeyCode.US_BACKTICK, 'Shift+^');
		// ~
		assertAriaLabels(KeyMod.Shift | KeyCode.US_BACKTICK, []);
		// [
		assertAriaLabels(KeyCode.US_OPEN_SQUARE_BRACKET, 'Control+Alt+ü');
		// {
		assertAriaLabels(KeyMod.Shift | KeyCode.US_OPEN_SQUARE_BRACKET, 'Control+Alt+ä');
		// \
		assertAriaLabels(KeyCode.US_BACKSLASH, 'Control+Alt+<');
		// |
		assertAriaLabels(KeyMod.Shift | KeyCode.US_BACKSLASH, ['Control+Alt+1', 'Control+Alt+7']);
		// ]
		assertAriaLabels(KeyCode.US_CLOSE_SQUARE_BRACKET, ['Control+Alt+9', 'Control+Alt+¨']);
		// }
		assertAriaLabels(KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET, ['Control+Alt+0', 'Control+Alt+$']);
		// '
		assertAriaLabels(KeyCode.US_QUOTE, '\'');
		// "
		assertAriaLabels(KeyMod.Shift | KeyCode.US_QUOTE, 'Shift+2');
	});
});
