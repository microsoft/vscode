/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { KeyMod, KeyCode, createKeybinding, SimpleKeybinding, KeyChord } from 'vs/base/common/keyCodes';
import { MacLinuxKeyboardMapper, IMacLinuxKeyboardMapping } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { ScanCodeUtils, ScanCodeBinding, ScanCode } from 'vs/workbench/services/keybinding/common/scanCode';
import { TPromise } from 'vs/base/common/winjs.base';
import { readRawMapping, assertMapping, IResolvedKeybinding, assertResolveKeybinding, assertResolveKeyboardEvent, assertResolveUserBinding } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';

const WRITE_FILE_IF_DIFFERENT = false;

function createKeyboardMapper(isUSStandard: boolean, file: string, OS: OperatingSystem): TPromise<MacLinuxKeyboardMapper> {
	return readRawMapping<IMacLinuxKeyboardMapping>(file).then((rawMappings) => {
		return new MacLinuxKeyboardMapper(isUSStandard, rawMappings, OS);
	});
}

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper(false, 'mac_de_ch', OperatingSystem.Macintosh).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_de_ch.txt', done);
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Macintosh), expected);
	}

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'shift+cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'ctrl+shift+alt+cmd+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'cmd+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_SLASH, 'shift+cmd+Digit7');
	});

	test('resolveKeybinding Cmd+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_A,
			[{
				label: '⌘A',
				ariaLabel: 'Command+A',
				labelWithoutModifiers: 'A',
				ariaLabelWithoutModifiers: 'A',
				electronAccelerator: 'Cmd+A',
				userSettingsLabel: 'cmd+a',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[KeyA]', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+B', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_B,
			[{
				label: '⌘B',
				ariaLabel: 'Command+B',
				labelWithoutModifiers: 'B',
				ariaLabelWithoutModifiers: 'B',
				electronAccelerator: 'Cmd+B',
				userSettingsLabel: 'cmd+b',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[KeyB]', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_Z,
			[{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[KeyY]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Cmd+[KeyY]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'KeyY'
			},
			{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[KeyY]', null],
			}
		);
	});

	test('resolveKeybinding Cmd+]', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: '⌃⌥⌘6',
				ariaLabel: 'Control+Alt+Command+6',
				labelWithoutModifiers: '6',
				ariaLabelWithoutModifiers: '6',
				electronAccelerator: 'Ctrl+Alt+Cmd+6',
				userSettingsLabel: 'ctrl+alt+cmd+6',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: true,
				hasMetaModifier: true,
				dispatchParts: ['ctrl+alt+meta+[Digit6]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Cmd+[BracketRight]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'BracketRight'
			},
			{
				label: '⌘¨',
				ariaLabel: 'Command+¨',
				labelWithoutModifiers: '¨',
				ariaLabelWithoutModifiers: '¨',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+[BracketRight]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[BracketRight]', null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: '⌃⌥9',
				ariaLabel: 'Control+Alt+9',
				labelWithoutModifiers: '9',
				ariaLabelWithoutModifiers: '9',
				electronAccelerator: 'Ctrl+Alt+9',
				userSettingsLabel: 'ctrl+alt+9',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: true,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+alt+[Digit9]', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.US_SLASH,
			[{
				label: '⇧⌘7',
				ariaLabel: 'Shift+Command+7',
				labelWithoutModifiers: '7',
				ariaLabelWithoutModifiers: '7',
				electronAccelerator: 'Shift+Cmd+7',
				userSettingsLabel: 'shift+cmd+7',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['shift+meta+[Digit7]', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+Shift+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SLASH,
			[{
				label: '⇧⌘\'',
				ariaLabel: 'Shift+Command+\'',
				labelWithoutModifiers: '\'',
				ariaLabelWithoutModifiers: '\'',
				electronAccelerator: null,
				userSettingsLabel: 'shift+cmd+[Minus]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['shift+meta+[Minus]', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+K Cmd+\\', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH),
			[{
				label: '⌘K ⌃⇧⌥⌘7',
				ariaLabel: 'Command+K Control+Shift+Alt+Command+7',
				labelWithoutModifiers: 'K 7',
				ariaLabelWithoutModifiers: 'K 7',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+k ctrl+shift+alt+cmd+7',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['meta+[KeyK]', 'ctrl+shift+alt+meta+[Digit7]'],
			}]
		);
	});

	test('resolveKeybinding Cmd+K Cmd+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[{
				label: '⌘K ⇧⌘0',
				ariaLabel: 'Command+K Shift+Command+0',
				labelWithoutModifiers: 'K 0',
				ariaLabelWithoutModifiers: 'K 0',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+k shift+cmd+0',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['meta+[KeyK]', 'shift+meta+[Digit0]'],
			}]
		);
	});

	test('resolveKeybinding Cmd+DownArrow', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.DownArrow,
			[{
				label: '⌘↓',
				ariaLabel: 'Command+DownArrow',
				labelWithoutModifiers: '↓',
				ariaLabelWithoutModifiers: 'DownArrow',
				electronAccelerator: 'Cmd+Down',
				userSettingsLabel: 'cmd+down',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[ArrowDown]', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+NUMPAD_0', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.NUMPAD_0,
			[{
				label: '⌘NumPad0',
				ariaLabel: 'Command+NumPad0',
				labelWithoutModifiers: 'NumPad0',
				ariaLabelWithoutModifiers: 'NumPad0',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+numpad0',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[Numpad0]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Home,
			[{
				label: '⌘Home',
				ariaLabel: 'Command+Home',
				labelWithoutModifiers: 'Home',
				ariaLabelWithoutModifiers: 'Home',
				electronAccelerator: 'Cmd+Home',
				userSettingsLabel: 'cmd+home',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[Home]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[Home]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'Home'
			},
			{
				label: '⌘Home',
				ariaLabel: 'Command+Home',
				labelWithoutModifiers: 'Home',
				ariaLabelWithoutModifiers: 'Home',
				electronAccelerator: 'Cmd+Home',
				userSettingsLabel: 'cmd+home',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[Home]', null],
			}
		);
	});

	test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(false, false, false, true, ScanCode.Comma),
			new SimpleKeybinding(false, false, false, true, KeyCode.US_SLASH),
			[{
				label: '⌘, ⇧⌘7',
				ariaLabel: 'Command+, Shift+Command+7',
				labelWithoutModifiers: ', 7',
				ariaLabelWithoutModifiers: ', 7',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+[Comma] shift+cmd+7',
				isWYSIWYG: false,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['meta+[Comma]', 'shift+meta+[Digit7]'],
			}]
		);
	});

	test('resolveKeyboardEvent Modifier only MetaLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'MetaLeft'
			},
			{
				label: '⌘',
				ariaLabel: 'Command+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: [null, null],
			}
		);
	});

	test('resolveKeyboardEvent Modifier only MetaRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'MetaRight'
			},
			{
				label: '⌘',
				ariaLabel: 'Command+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: [null, null],
			}
		);
	});
});

suite('keyboardMapper - MAC en_us', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper(true, 'mac_en_us', OperatingSystem.Macintosh).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_en_us.txt', done);
	});

	test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(false, false, false, true, ScanCode.Comma),
			new SimpleKeybinding(false, false, false, true, KeyCode.US_SLASH),
			[{
				label: '⌘, ⌘/',
				ariaLabel: 'Command+, Command+/',
				labelWithoutModifiers: ', /',
				ariaLabelWithoutModifiers: ', /',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+, cmd+/',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['meta+[Comma]', 'meta+[Slash]'],
			}]
		);
	});

	test('resolveKeyboardEvent Modifier only MetaLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'MetaLeft'
			},
			{
				label: '⌘',
				ariaLabel: 'Command+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: [null, null],
			}
		);
	});

	test('resolveKeyboardEvent Modifier only MetaRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: -1,
				code: 'MetaRight'
			},
			{
				label: '⌘',
				ariaLabel: 'Command+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: [null, null],
			}
		);
	});
});

suite('keyboardMapper - LINUX de_ch', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper(false, 'linux_de_ch', OperatingSystem.Linux).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_de_ch.txt', done);
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Linux), expected);
	}

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'ctrl+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'ctrl+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'ctrl+shift+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'ctrl+shift+alt+meta+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'ctrl+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'ctrl+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_SLASH, 'ctrl+shift+Digit7');
	});

	test('resolveKeybinding Ctrl+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_A,
			[{
				label: 'Ctrl+A',
				ariaLabel: 'Control+A',
				labelWithoutModifiers: 'A',
				ariaLabelWithoutModifiers: 'A',
				electronAccelerator: 'Ctrl+A',
				userSettingsLabel: 'ctrl+a',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyA]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_Z,
			[{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyY]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[KeyY]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'KeyY'
			},
			{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyY]', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+]', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[]
		);
	});

	test('resolveKeyboardEvent Ctrl+[BracketRight]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'BracketRight'
			},
			{
				label: 'Ctrl+¨',
				ariaLabel: 'Control+¨',
				labelWithoutModifiers: '¨',
				ariaLabelWithoutModifiers: '¨',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+[BracketRight]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[BracketRight]', null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: 'Ctrl+Alt+0',
				ariaLabel: 'Control+Alt+0',
				labelWithoutModifiers: '0',
				ariaLabelWithoutModifiers: '0',
				electronAccelerator: 'Ctrl+Alt+0',
				userSettingsLabel: 'ctrl+alt+0',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: true,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+alt+[Digit0]', null],
			}, {
				label: 'Ctrl+Alt+$',
				ariaLabel: 'Control+Alt+$',
				labelWithoutModifiers: '$',
				ariaLabelWithoutModifiers: '$',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+alt+[Backslash]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: true,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+alt+[Backslash]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.US_SLASH,
			[{
				label: 'Ctrl+Shift+7',
				ariaLabel: 'Control+Shift+7',
				labelWithoutModifiers: '7',
				ariaLabelWithoutModifiers: '7',
				electronAccelerator: 'Ctrl+Shift+7',
				userSettingsLabel: 'ctrl+shift+7',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+shift+[Digit7]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Shift+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SLASH,
			[{
				label: 'Ctrl+Shift+\'',
				ariaLabel: 'Control+Shift+\'',
				labelWithoutModifiers: '\'',
				ariaLabelWithoutModifiers: '\'',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+shift+[Minus]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+shift+[Minus]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH),
			[]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[{
				label: 'Ctrl+K Ctrl+Shift+0',
				ariaLabel: 'Control+K Control+Shift+0',
				labelWithoutModifiers: 'K 0',
				ariaLabelWithoutModifiers: 'K 0',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+shift+0',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyK]', 'ctrl+shift+[Digit0]'],
			}]
		);
	});

	test('resolveKeybinding Ctrl+DownArrow', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.DownArrow,
			[{
				label: 'Ctrl+DownArrow',
				ariaLabel: 'Control+DownArrow',
				labelWithoutModifiers: 'DownArrow',
				ariaLabelWithoutModifiers: 'DownArrow',
				electronAccelerator: 'Ctrl+Down',
				userSettingsLabel: 'ctrl+down',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[ArrowDown]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+NUMPAD_0', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.NUMPAD_0,
			[{
				label: 'Ctrl+NumPad0',
				ariaLabel: 'Control+NumPad0',
				labelWithoutModifiers: 'NumPad0',
				ariaLabelWithoutModifiers: 'NumPad0',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+numpad0',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Numpad0]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Home,
			[{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				labelWithoutModifiers: 'Home',
				ariaLabelWithoutModifiers: 'Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Home]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[Home]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'Home'
			},
			{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				labelWithoutModifiers: 'Home',
				ariaLabelWithoutModifiers: 'Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Home]', null],
			}
		);
	});

	test('resolveKeyboardEvent Ctrl+[KeyX]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'KeyX'
			},
			{
				label: 'Ctrl+X',
				ariaLabel: 'Control+X',
				labelWithoutModifiers: 'X',
				ariaLabelWithoutModifiers: 'X',
				electronAccelerator: 'Ctrl+X',
				userSettingsLabel: 'ctrl+x',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyX]', null],
			}
		);
	});

	test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(true, false, false, false, ScanCode.Comma),
			new SimpleKeybinding(true, false, false, false, KeyCode.US_SLASH),
			[{
				label: 'Ctrl+, Ctrl+Shift+7',
				ariaLabel: 'Control+, Control+Shift+7',
				labelWithoutModifiers: ', 7',
				ariaLabelWithoutModifiers: ', 7',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+[Comma] ctrl+shift+7',
				isWYSIWYG: false,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Comma]', 'ctrl+shift+[Digit7]'],
			}]
		);
	});

	test('resolveKeyboardEvent Modifier only ControlLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'ControlLeft'
			},
			{
				label: 'Ctrl+',
				ariaLabel: 'Control+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: [null, null],
			}
		);
	});

	test('resolveKeyboardEvent Modifier only ControlRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'ControlRight'
			},
			{
				label: 'Ctrl+',
				ariaLabel: 'Control+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: [null, null],
			}
		);
	});
});

suite('keyboardMapper - LINUX en_us', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper(true, 'linux_en_us', OperatingSystem.Linux).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_us.txt', done);
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Linux), expected);
	}

	test('resolveKeybinding Ctrl+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_A,
			[{
				label: 'Ctrl+A',
				ariaLabel: 'Control+A',
				labelWithoutModifiers: 'A',
				ariaLabelWithoutModifiers: 'A',
				electronAccelerator: 'Ctrl+A',
				userSettingsLabel: 'ctrl+a',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyA]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_Z,
			[{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyZ]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[KeyZ]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyZ]', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+]', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: 'Ctrl+]',
				ariaLabel: 'Control+]',
				labelWithoutModifiers: ']',
				ariaLabelWithoutModifiers: ']',
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[BracketRight]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[BracketRight]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'BracketRight'
			},
			{
				label: 'Ctrl+]',
				ariaLabel: 'Control+]',
				labelWithoutModifiers: ']',
				ariaLabelWithoutModifiers: ']',
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[BracketRight]', null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: 'Shift+]',
				ariaLabel: 'Shift+]',
				labelWithoutModifiers: ']',
				ariaLabelWithoutModifiers: ']',
				electronAccelerator: 'Shift+]',
				userSettingsLabel: 'shift+]',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['shift+[BracketRight]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.US_SLASH,
			[{
				label: 'Ctrl+/',
				ariaLabel: 'Control+/',
				labelWithoutModifiers: '/',
				ariaLabelWithoutModifiers: '/',
				electronAccelerator: 'Ctrl+/',
				userSettingsLabel: 'ctrl+/',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Slash]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Shift+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SLASH,
			[{
				label: 'Ctrl+Shift+/',
				ariaLabel: 'Control+Shift+/',
				labelWithoutModifiers: '/',
				ariaLabelWithoutModifiers: '/',
				electronAccelerator: 'Ctrl+Shift+/',
				userSettingsLabel: 'ctrl+shift+/',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+shift+[Slash]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH),
			[{
				label: 'Ctrl+K Ctrl+\\',
				ariaLabel: 'Control+K Control+\\',
				labelWithoutModifiers: 'K \\',
				ariaLabelWithoutModifiers: 'K \\',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+\\',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyK]', 'ctrl+[Backslash]'],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[{
				label: 'Ctrl+K Ctrl+=',
				ariaLabel: 'Control+K Control+=',
				labelWithoutModifiers: 'K =',
				ariaLabelWithoutModifiers: 'K =',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+=',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[KeyK]', 'ctrl+[Equal]'],
			}]
		);
	});

	test('resolveKeybinding Ctrl+DownArrow', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.DownArrow,
			[{
				label: 'Ctrl+DownArrow',
				ariaLabel: 'Control+DownArrow',
				labelWithoutModifiers: 'DownArrow',
				ariaLabelWithoutModifiers: 'DownArrow',
				electronAccelerator: 'Ctrl+Down',
				userSettingsLabel: 'ctrl+down',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[ArrowDown]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+NUMPAD_0', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.NUMPAD_0,
			[{
				label: 'Ctrl+NumPad0',
				ariaLabel: 'Control+NumPad0',
				labelWithoutModifiers: 'NumPad0',
				ariaLabelWithoutModifiers: 'NumPad0',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+numpad0',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Numpad0]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Home,
			[{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				labelWithoutModifiers: 'Home',
				ariaLabelWithoutModifiers: 'Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Home]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[Home]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'Home'
			},
			{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				labelWithoutModifiers: 'Home',
				ariaLabelWithoutModifiers: 'Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Home]', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+Shift+,', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_COMMA,
			[{
				label: 'Ctrl+Shift+,',
				ariaLabel: 'Control+Shift+,',
				labelWithoutModifiers: ',',
				ariaLabelWithoutModifiers: ',',
				electronAccelerator: 'Ctrl+Shift+,',
				userSettingsLabel: 'ctrl+shift+,',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+shift+[Comma]', null],
			}, {
				label: 'Ctrl+<',
				ariaLabel: 'Control+<',
				labelWithoutModifiers: '<',
				ariaLabelWithoutModifiers: '<',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+[IntlBackslash]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[IntlBackslash]', null],
			}]
		);
	});

	test('issue #23393: resolveKeybinding Ctrl+Enter', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Enter,
			[{
				label: 'Ctrl+Enter',
				ariaLabel: 'Control+Enter',
				labelWithoutModifiers: 'Enter',
				ariaLabelWithoutModifiers: 'Enter',
				electronAccelerator: 'Ctrl+Enter',
				userSettingsLabel: 'ctrl+enter',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Enter]', null],
			}]
		);
	});

	test('issue #23393: resolveKeyboardEvent Ctrl+[NumpadEnter]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'NumpadEnter'
			},
			{
				label: 'Ctrl+Enter',
				ariaLabel: 'Control+Enter',
				labelWithoutModifiers: 'Enter',
				ariaLabelWithoutModifiers: 'Enter',
				electronAccelerator: 'Ctrl+Enter',
				userSettingsLabel: 'ctrl+enter',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Enter]', null],
			}
		);
	});

	test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(true, false, false, false, ScanCode.Comma),
			new SimpleKeybinding(true, false, false, false, KeyCode.US_SLASH),
			[{
				label: 'Ctrl+, Ctrl+/',
				ariaLabel: 'Control+, Control+/',
				labelWithoutModifiers: ', /',
				ariaLabelWithoutModifiers: ', /',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+, ctrl+/',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Comma]', 'ctrl+[Slash]'],
			}]
		);
	});

	test('resolveUserBinding Ctrl+[Comma]', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(true, false, false, false, ScanCode.Comma),
			null,
			[{
				label: 'Ctrl+,',
				ariaLabel: 'Control+,',
				labelWithoutModifiers: ',',
				ariaLabelWithoutModifiers: ',',
				electronAccelerator: 'Ctrl+,',
				userSettingsLabel: 'ctrl+,',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Comma]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Modifier only ControlLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'ControlLeft'
			},
			{
				label: 'Ctrl+',
				ariaLabel: 'Control+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: [null, null],
			}
		);
	});

	test('resolveKeyboardEvent Modifier only ControlRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'ControlRight'
			},
			{
				label: 'Ctrl+',
				ariaLabel: 'Control+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: [null, null],
			}
		);
	});
});

suite('keyboardMapper', () => {

	test('issue #23706: Linux UK layout: Ctrl + Apostrophe also toggles terminal', () => {
		let mapper = new MacLinuxKeyboardMapper(false, {
			'Backquote': {
				'value': '`',
				'withShift': '¬',
				'withAltGr': '|',
				'withShiftAltGr': '|'
			}
		}, OperatingSystem.Linux);

		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: -1,
				code: 'Backquote'
			},
			{
				label: 'Ctrl+`',
				ariaLabel: 'Control+`',
				labelWithoutModifiers: '`',
				ariaLabelWithoutModifiers: '`',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+`',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+[Backquote]', null],
			}
		);
	});

});

function _assertKeybindingTranslation(mapper: MacLinuxKeyboardMapper, OS: OperatingSystem, kb: number, _expected: string | string[]): void {
	let expected: string[];
	if (typeof _expected === 'string') {
		expected = [_expected];
	} else if (Array.isArray(_expected)) {
		expected = _expected;
	} else {
		expected = [];
	}

	const runtimeKeybinding = createKeybinding(kb, OS);

	const keybindingLabel = new USLayoutResolvedKeybinding(runtimeKeybinding, OS).getUserSettingsLabel();

	const actualHardwareKeypresses = mapper.simpleKeybindingToScanCodeBinding(<SimpleKeybinding>runtimeKeybinding);
	if (actualHardwareKeypresses.length === 0) {
		assert.deepEqual([], expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "[]" -- expected: "${expected}"`);
		return;
	}

	const actual = actualHardwareKeypresses
		.map(k => UserSettingsLabelProvider.toLabel(k, ScanCodeUtils.toString(k.scanCode), null, null, OS));
	assert.deepEqual(actual, expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "${actual}" -- expected: "${expected}"`);
}
