/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyChord, KeyCode, KeyMod, ScanCode, ScanCodeUtils } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, createSimpleKeybinding, ScanCodeChord, Keybinding } from '../../../../../base/common/keybindings.js';
import { UserSettingsLabelProvider } from '../../../../../base/common/keybindingLabels.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MacLinuxKeyboardMapper } from '../../common/macLinuxKeyboardMapper.js';
import { IResolvedKeybinding, assertMapping, assertResolveKeyboardEvent, assertResolveKeybinding, readRawMapping } from './keyboardMapperTestUtils.js';
import { IMacLinuxKeyboardMapping } from '../../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const WRITE_FILE_IF_DIFFERENT = false;

async function createKeyboardMapper(isUSStandard: boolean, file: string, mapAltGrToCtrlAlt: boolean, OS: OperatingSystem): Promise<MacLinuxKeyboardMapper> {
	const rawMappings = await readRawMapping<IMacLinuxKeyboardMapping>(file);
	return new MacLinuxKeyboardMapper(isUSStandard, rawMappings, mapAltGrToCtrlAlt, OS);
}

suite('keyboardMapper - MAC de_ch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'mac_de_ch', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_de_ch.txt');
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh)!, expected);
	}

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Digit1, 'cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyB, 'cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB, 'shift+cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyB, 'ctrl+shift+alt+cmd+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyZ, 'cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyY, 'cmd+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Slash, 'shift+cmd+Digit7');
	});

	test('resolveKeybinding Cmd+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyA,
			[{
				label: '⌘A',
				ariaLabel: 'Command+A',
				electronAccelerator: 'Cmd+A',
				userSettingsLabel: 'cmd+a',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[KeyA]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+B', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyB,
			[{
				label: '⌘B',
				ariaLabel: 'Command+B',
				electronAccelerator: 'Cmd+B',
				userSettingsLabel: 'cmd+b',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[KeyB]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyZ,
			[{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[KeyY]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Cmd+[KeyY]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'KeyY'
			},
			{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[KeyY]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Cmd+]', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.BracketRight,
			[{
				label: '⌃⌥⌘6',
				ariaLabel: 'Control+Option+Command+6',
				electronAccelerator: 'Ctrl+Alt+Cmd+6',
				userSettingsLabel: 'ctrl+alt+cmd+6',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+meta+[Digit6]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Cmd+[BracketRight]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'BracketRight'
			},
			{
				label: '⌘¨',
				ariaLabel: 'Command+¨',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+[BracketRight]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['meta+[BracketRight]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			KeyMod.Shift | KeyCode.BracketRight,
			[{
				label: '⌃⌥9',
				ariaLabel: 'Control+Option+9',
				electronAccelerator: 'Ctrl+Alt+9',
				userSettingsLabel: 'ctrl+alt+9',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[Digit9]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Slash,
			[{
				label: '⇧⌘7',
				ariaLabel: 'Shift+Command+7',
				electronAccelerator: 'Shift+Cmd+7',
				userSettingsLabel: 'shift+cmd+7',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['shift+meta+[Digit7]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+Shift+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
			[{
				label: '⇧⌘\'',
				ariaLabel: 'Shift+Command+\'',
				electronAccelerator: null,
				userSettingsLabel: 'shift+cmd+[Minus]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['shift+meta+[Minus]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+K Cmd+\\', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
			[{
				label: '⌘K ⌃⇧⌥⌘7',
				ariaLabel: 'Command+K Control+Shift+Option+Command+7',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+k ctrl+shift+alt+cmd+7',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['meta+[KeyK]', 'ctrl+shift+alt+meta+[Digit7]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeybinding Cmd+K Cmd+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			[{
				label: '⌘K ⇧⌘0',
				ariaLabel: 'Command+K Shift+Command+0',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+k shift+cmd+0',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['meta+[KeyK]', 'shift+meta+[Digit0]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeybinding Cmd+DownArrow', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.DownArrow,
			[{
				label: '⌘↓',
				ariaLabel: 'Command+DownArrow',
				electronAccelerator: 'Cmd+Down',
				userSettingsLabel: 'cmd+down',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[ArrowDown]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+NUMPAD_0', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Numpad0,
			[{
				label: '⌘NumPad0',
				ariaLabel: 'Command+NumPad0',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+numpad0',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[Numpad0]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Home,
			[{
				label: '⌘Home',
				ariaLabel: 'Command+Home',
				electronAccelerator: 'Cmd+Home',
				userSettingsLabel: 'cmd+home',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[Home]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[Home]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'Home'
			},
			{
				label: '⌘Home',
				ariaLabel: 'Command+Home',
				electronAccelerator: 'Cmd+Home',
				userSettingsLabel: 'cmd+home',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[Home]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
		assertResolveKeybinding(
			mapper,
			new Keybinding([
				new ScanCodeChord(false, false, false, true, ScanCode.Comma),
				new KeyCodeChord(false, false, false, true, KeyCode.Slash),
			]),
			[{
				label: '⌘, ⇧⌘7',
				ariaLabel: 'Command+, Shift+Command+7',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+[Comma] shift+cmd+7',
				isWYSIWYG: false,
				isMultiChord: true,
				dispatchParts: ['meta+[Comma]', 'shift+meta+[Digit7]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeyboardEvent Single Modifier MetaLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'MetaLeft'
			},
			{
				label: '⌘',
				ariaLabel: 'Command',
				electronAccelerator: null,
				userSettingsLabel: 'cmd',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['meta'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier MetaRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'MetaRight'
			},
			{
				label: '⌘',
				ariaLabel: 'Command',
				electronAccelerator: null,
				userSettingsLabel: 'cmd',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['meta'],
			}
		);
	});
});

suite('keyboardMapper - MAC en_us', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(true, 'mac_en_us', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_en_us.txt');
	});

	test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
		assertResolveKeybinding(
			mapper,
			new Keybinding([
				new ScanCodeChord(false, false, false, true, ScanCode.Comma),
				new KeyCodeChord(false, false, false, true, KeyCode.Slash),
			]),
			[{
				label: '⌘, ⌘/',
				ariaLabel: 'Command+, Command+/',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+, cmd+/',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['meta+[Comma]', 'meta+[Slash]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeyboardEvent Single Modifier MetaLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'MetaLeft'
			},
			{
				label: '⌘',
				ariaLabel: 'Command',
				electronAccelerator: null,
				userSettingsLabel: 'cmd',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['meta'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier MetaRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'MetaRight'
			},
			{
				label: '⌘',
				ariaLabel: 'Command',
				electronAccelerator: null,
				userSettingsLabel: 'cmd',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['meta'],
			}
		);
	});

	test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', async () => {
		const mapper = await createKeyboardMapper(true, 'mac_en_us', true, OperatingSystem.Macintosh);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: true,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				label: '⌃⌥Z',
				ariaLabel: 'Control+Option+Z',
				electronAccelerator: 'Ctrl+Alt+Z',
				userSettingsLabel: 'ctrl+alt+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[KeyZ]'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper - LINUX de_ch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'linux_de_ch', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_de_ch.txt');
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Digit1, 'ctrl+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyB, 'ctrl+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB, 'ctrl+shift+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyB, 'ctrl+shift+alt+meta+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyZ, 'ctrl+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyY, 'ctrl+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Slash, 'ctrl+shift+Digit7');
	});

	test('resolveKeybinding Ctrl+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyA,
			[{
				label: 'Ctrl+A',
				ariaLabel: 'Control+A',
				electronAccelerator: 'Ctrl+A',
				userSettingsLabel: 'ctrl+a',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyA]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyZ,
			[{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyY]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[KeyY]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'KeyY'
			},
			{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyY]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Ctrl+]', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.BracketRight,
			[]
		);
	});

	test('resolveKeyboardEvent Ctrl+[BracketRight]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'BracketRight'
			},
			{
				label: 'Ctrl+¨',
				ariaLabel: 'Control+¨',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+[BracketRight]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['ctrl+[BracketRight]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			KeyMod.Shift | KeyCode.BracketRight,
			[{
				label: 'Ctrl+Alt+0',
				ariaLabel: 'Control+Alt+0',
				electronAccelerator: 'Ctrl+Alt+0',
				userSettingsLabel: 'ctrl+alt+0',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[Digit0]'],
				singleModifierDispatchParts: [null],
			}, {
				label: 'Ctrl+Alt+$',
				ariaLabel: 'Control+Alt+$',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+alt+[Backslash]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[Backslash]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Slash,
			[{
				label: 'Ctrl+Shift+7',
				ariaLabel: 'Control+Shift+7',
				electronAccelerator: 'Ctrl+Shift+7',
				userSettingsLabel: 'ctrl+shift+7',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+shift+[Digit7]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Shift+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
			[{
				label: 'Ctrl+Shift+\'',
				ariaLabel: 'Control+Shift+\'',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+shift+[Minus]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['ctrl+shift+[Minus]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
			[]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			[{
				label: 'Ctrl+K Ctrl+Shift+0',
				ariaLabel: 'Control+K Control+Shift+0',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+shift+0',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['ctrl+[KeyK]', 'ctrl+shift+[Digit0]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+DownArrow', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.DownArrow,
			[{
				label: 'Ctrl+DownArrow',
				ariaLabel: 'Control+DownArrow',
				electronAccelerator: 'Ctrl+Down',
				userSettingsLabel: 'ctrl+down',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[ArrowDown]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+NUMPAD_0', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Numpad0,
			[{
				label: 'Ctrl+NumPad0',
				ariaLabel: 'Control+NumPad0',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+numpad0',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Numpad0]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Home,
			[{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Home]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[Home]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'Home'
			},
			{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Home]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeyboardEvent Ctrl+[KeyX]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'KeyX'
			},
			{
				label: 'Ctrl+X',
				ariaLabel: 'Control+X',
				electronAccelerator: 'Ctrl+X',
				userSettingsLabel: 'ctrl+x',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyX]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
		assertResolveKeybinding(
			mapper, new Keybinding([
				new ScanCodeChord(true, false, false, false, ScanCode.Comma),
				new KeyCodeChord(true, false, false, false, KeyCode.Slash),
			]),
			[{
				label: 'Ctrl+, Ctrl+Shift+7',
				ariaLabel: 'Control+, Control+Shift+7',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+[Comma] ctrl+shift+7',
				isWYSIWYG: false,
				isMultiChord: true,
				dispatchParts: ['ctrl+[Comma]', 'ctrl+shift+[Digit7]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeyboardEvent Single Modifier ControlLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ControlLeft'
			},
			{
				label: 'Ctrl',
				ariaLabel: 'Control',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['ctrl'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier ControlRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ControlRight'
			},
			{
				label: 'Ctrl',
				ariaLabel: 'Control',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['ctrl'],
			}
		);
	});
});

suite('keyboardMapper - LINUX en_us', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(true, 'linux_en_us', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_us.txt');
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

	test('resolveKeybinding Ctrl+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyA,
			[{
				label: 'Ctrl+A',
				ariaLabel: 'Control+A',
				electronAccelerator: 'Ctrl+A',
				userSettingsLabel: 'ctrl+a',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyA]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyZ,
			[{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyZ]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[KeyZ]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyZ]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Ctrl+]', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.BracketRight,
			[{
				label: 'Ctrl+]',
				ariaLabel: 'Control+]',
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[BracketRight]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[BracketRight]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'BracketRight'
			},
			{
				label: 'Ctrl+]',
				ariaLabel: 'Control+]',
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[BracketRight]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			KeyMod.Shift | KeyCode.BracketRight,
			[{
				label: 'Shift+]',
				ariaLabel: 'Shift+]',
				electronAccelerator: 'Shift+]',
				userSettingsLabel: 'shift+]',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['shift+[BracketRight]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Slash,
			[{
				label: 'Ctrl+/',
				ariaLabel: 'Control+/',
				electronAccelerator: 'Ctrl+/',
				userSettingsLabel: 'ctrl+/',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Slash]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Shift+/', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
			[{
				label: 'Ctrl+Shift+/',
				ariaLabel: 'Control+Shift+/',
				electronAccelerator: 'Ctrl+Shift+/',
				userSettingsLabel: 'ctrl+shift+/',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+shift+[Slash]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
			[{
				label: 'Ctrl+K Ctrl+\\',
				ariaLabel: 'Control+K Control+\\',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+\\',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['ctrl+[KeyK]', 'ctrl+[Backslash]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			[{
				label: 'Ctrl+K Ctrl+=',
				ariaLabel: 'Control+K Control+=',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+=',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['ctrl+[KeyK]', 'ctrl+[Equal]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+DownArrow', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.DownArrow,
			[{
				label: 'Ctrl+DownArrow',
				ariaLabel: 'Control+DownArrow',
				electronAccelerator: 'Ctrl+Down',
				userSettingsLabel: 'ctrl+down',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[ArrowDown]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+NUMPAD_0', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Numpad0,
			[{
				label: 'Ctrl+NumPad0',
				ariaLabel: 'Control+NumPad0',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+numpad0',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Numpad0]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Home,
			[{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Home]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+[Home]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'Home'
			},
			{
				label: 'Ctrl+Home',
				ariaLabel: 'Control+Home',
				electronAccelerator: 'Ctrl+Home',
				userSettingsLabel: 'ctrl+home',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Home]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeybinding Ctrl+Shift+,', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Comma,
			[{
				label: 'Ctrl+Shift+,',
				ariaLabel: 'Control+Shift+,',
				electronAccelerator: 'Ctrl+Shift+,',
				userSettingsLabel: 'ctrl+shift+,',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+shift+[Comma]'],
				singleModifierDispatchParts: [null],
			}, {
				label: 'Ctrl+<',
				ariaLabel: 'Control+<',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+[IntlBackslash]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['ctrl+[IntlBackslash]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('issue #23393: resolveKeybinding Ctrl+Enter', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.Enter,
			[{
				label: 'Ctrl+Enter',
				ariaLabel: 'Control+Enter',
				electronAccelerator: 'Ctrl+Enter',
				userSettingsLabel: 'ctrl+enter',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Enter]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('issue #23393: resolveKeyboardEvent Ctrl+[NumpadEnter]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'NumpadEnter'
			},
			{
				label: 'Ctrl+Enter',
				ariaLabel: 'Control+Enter',
				electronAccelerator: 'Ctrl+Enter',
				userSettingsLabel: 'ctrl+enter',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Enter]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
		assertResolveKeybinding(
			mapper, new Keybinding([
				new ScanCodeChord(true, false, false, false, ScanCode.Comma),
				new KeyCodeChord(true, false, false, false, KeyCode.Slash),
			]),
			[{
				label: 'Ctrl+, Ctrl+/',
				ariaLabel: 'Control+, Control+/',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+, ctrl+/',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['ctrl+[Comma]', 'ctrl+[Slash]'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveUserBinding Ctrl+[Comma]', () => {
		assertResolveKeybinding(
			mapper, new Keybinding([
				new ScanCodeChord(true, false, false, false, ScanCode.Comma)
			]),
			[{
				label: 'Ctrl+,',
				ariaLabel: 'Control+,',
				electronAccelerator: 'Ctrl+,',
				userSettingsLabel: 'ctrl+,',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Comma]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Single Modifier ControlLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ControlLeft'
			},
			{
				label: 'Ctrl',
				ariaLabel: 'Control',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['ctrl'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier ControlRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ControlRight'
			},
			{
				label: 'Ctrl',
				ariaLabel: 'Control',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['ctrl'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier ShiftLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: true,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ShiftLeft'
			},
			{
				label: 'Shift',
				ariaLabel: 'Shift',
				electronAccelerator: null,
				userSettingsLabel: 'shift',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['shift'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier ShiftRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: true,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ShiftRight'
			},
			{
				label: 'Shift',
				ariaLabel: 'Shift',
				electronAccelerator: null,
				userSettingsLabel: 'shift',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['shift'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier AltLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: true,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'AltLeft'
			},
			{
				label: 'Alt',
				ariaLabel: 'Alt',
				electronAccelerator: null,
				userSettingsLabel: 'alt',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['alt'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier AltRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: true,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'AltRight'
			},
			{
				label: 'Alt',
				ariaLabel: 'Alt',
				electronAccelerator: null,
				userSettingsLabel: 'alt',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['alt'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier MetaLeft+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'MetaLeft'
			},
			{
				label: 'Super',
				ariaLabel: 'Super',
				electronAccelerator: null,
				userSettingsLabel: 'meta',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['meta'],
			}
		);
	});

	test('resolveKeyboardEvent Single Modifier MetaRight+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: -1,
				code: 'MetaRight'
			},
			{
				label: 'Super',
				ariaLabel: 'Super',
				electronAccelerator: null,
				userSettingsLabel: 'meta',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['meta'],
			}
		);
	});

	test('resolveKeyboardEvent Only Modifiers Ctrl+Shift+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: true,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'ShiftLeft'
			},
			{
				label: 'Ctrl+Shift',
				ariaLabel: 'Control+Shift',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+shift',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', async () => {
		const mapper = await createKeyboardMapper(true, 'linux_en_us', true, OperatingSystem.Linux);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: true,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				label: 'Ctrl+Alt+Z',
				ariaLabel: 'Control+Alt+Z',
				electronAccelerator: 'Ctrl+Alt+Z',
				userSettingsLabel: 'ctrl+alt+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[KeyZ]'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #23706: Linux UK layout: Ctrl + Apostrophe also toggles terminal', () => {
		const mapper = new MacLinuxKeyboardMapper(false, {
			'Backquote': {
				'value': '`',
				'withShift': '¬',
				'withAltGr': '|',
				'withShiftAltGr': '|'
			}
		}, false, OperatingSystem.Linux);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'Backquote'
			},
			{
				label: 'Ctrl+`',
				ariaLabel: 'Control+`',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+`',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Backquote]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('issue #24064: NumLock/NumPad keys stopped working in 1.11 on Linux', () => {
		const mapper = new MacLinuxKeyboardMapper(false, {}, false, OperatingSystem.Linux);

		function assertNumpadKeyboardEvent(keyCode: KeyCode, code: string, label: string, electronAccelerator: string | null, userSettingsLabel: string, dispatch: string): void {
			assertResolveKeyboardEvent(
				mapper,
				{
					_standardKeyboardEventBrand: true,
					ctrlKey: false,
					shiftKey: false,
					altKey: false,
					metaKey: false,
					altGraphKey: false,
					keyCode: keyCode,
					code: code
				},
				{
					label: label,
					ariaLabel: label,
					electronAccelerator: electronAccelerator,
					userSettingsLabel: userSettingsLabel,
					isWYSIWYG: true,
					isMultiChord: false,
					dispatchParts: [dispatch],
					singleModifierDispatchParts: [null],
				}
			);
		}

		assertNumpadKeyboardEvent(KeyCode.End, 'Numpad1', 'End', 'End', 'end', '[End]');
		assertNumpadKeyboardEvent(KeyCode.DownArrow, 'Numpad2', 'DownArrow', 'Down', 'down', '[ArrowDown]');
		assertNumpadKeyboardEvent(KeyCode.PageDown, 'Numpad3', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
		assertNumpadKeyboardEvent(KeyCode.LeftArrow, 'Numpad4', 'LeftArrow', 'Left', 'left', '[ArrowLeft]');
		assertNumpadKeyboardEvent(KeyCode.Unknown, 'Numpad5', 'NumPad5', null, 'numpad5', '[Numpad5]');
		assertNumpadKeyboardEvent(KeyCode.RightArrow, 'Numpad6', 'RightArrow', 'Right', 'right', '[ArrowRight]');
		assertNumpadKeyboardEvent(KeyCode.Home, 'Numpad7', 'Home', 'Home', 'home', '[Home]');
		assertNumpadKeyboardEvent(KeyCode.UpArrow, 'Numpad8', 'UpArrow', 'Up', 'up', '[ArrowUp]');
		assertNumpadKeyboardEvent(KeyCode.PageUp, 'Numpad9', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
		assertNumpadKeyboardEvent(KeyCode.Insert, 'Numpad0', 'Insert', 'Insert', 'insert', '[Insert]');
		assertNumpadKeyboardEvent(KeyCode.Delete, 'NumpadDecimal', 'Delete', 'Delete', 'delete', '[Delete]');
	});

	test('issue #24107: Delete, Insert, Home, End, PgUp, PgDn, and arrow keys no longer work editor in 1.11', () => {
		const mapper = new MacLinuxKeyboardMapper(false, {}, false, OperatingSystem.Linux);

		function assertKeyboardEvent(keyCode: KeyCode, code: string, label: string, electronAccelerator: string, userSettingsLabel: string, dispatch: string): void {
			assertResolveKeyboardEvent(
				mapper,
				{
					_standardKeyboardEventBrand: true,
					ctrlKey: false,
					shiftKey: false,
					altKey: false,
					metaKey: false,
					altGraphKey: false,
					keyCode: keyCode,
					code: code
				},
				{
					label: label,
					ariaLabel: label,
					electronAccelerator: electronAccelerator,
					userSettingsLabel: userSettingsLabel,
					isWYSIWYG: true,
					isMultiChord: false,
					dispatchParts: [dispatch],
					singleModifierDispatchParts: [null],
				}
			);
		}

		// https://github.com/microsoft/vscode/issues/24107#issuecomment-292318497
		assertKeyboardEvent(KeyCode.UpArrow, 'Lang3', 'UpArrow', 'Up', 'up', '[ArrowUp]');
		assertKeyboardEvent(KeyCode.DownArrow, 'NumpadEnter', 'DownArrow', 'Down', 'down', '[ArrowDown]');
		assertKeyboardEvent(KeyCode.LeftArrow, 'Convert', 'LeftArrow', 'Left', 'left', '[ArrowLeft]');
		assertKeyboardEvent(KeyCode.RightArrow, 'NonConvert', 'RightArrow', 'Right', 'right', '[ArrowRight]');
		assertKeyboardEvent(KeyCode.Delete, 'PrintScreen', 'Delete', 'Delete', 'delete', '[Delete]');
		assertKeyboardEvent(KeyCode.Insert, 'NumpadDivide', 'Insert', 'Insert', 'insert', '[Insert]');
		assertKeyboardEvent(KeyCode.End, 'Unknown', 'End', 'End', 'end', '[End]');
		assertKeyboardEvent(KeyCode.Home, 'IntlRo', 'Home', 'Home', 'home', '[Home]');
		assertKeyboardEvent(KeyCode.PageDown, 'ControlRight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
		assertKeyboardEvent(KeyCode.PageUp, 'Lang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]');

		// https://github.com/microsoft/vscode/issues/24107#issuecomment-292323924
		assertKeyboardEvent(KeyCode.PageDown, 'ControlRight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
		assertKeyboardEvent(KeyCode.PageUp, 'Lang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
		assertKeyboardEvent(KeyCode.End, '', 'End', 'End', 'end', '[End]');
		assertKeyboardEvent(KeyCode.Home, 'IntlRo', 'Home', 'Home', 'home', '[Home]');
		assertKeyboardEvent(KeyCode.Delete, 'PrintScreen', 'Delete', 'Delete', 'delete', '[Delete]');
		assertKeyboardEvent(KeyCode.Insert, 'NumpadDivide', 'Insert', 'Insert', 'insert', '[Insert]');
		assertKeyboardEvent(KeyCode.RightArrow, 'NonConvert', 'RightArrow', 'Right', 'right', '[ArrowRight]');
		assertKeyboardEvent(KeyCode.LeftArrow, 'Convert', 'LeftArrow', 'Left', 'left', '[ArrowLeft]');
		assertKeyboardEvent(KeyCode.DownArrow, 'NumpadEnter', 'DownArrow', 'Down', 'down', '[ArrowDown]');
		assertKeyboardEvent(KeyCode.UpArrow, 'Lang3', 'UpArrow', 'Up', 'up', '[ArrowUp]');
	});
});

suite('keyboardMapper - LINUX ru', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'linux_ru', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_ru.txt');
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

	test('resolveKeybinding Ctrl+S', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyS,
			[{
				label: 'Ctrl+S',
				ariaLabel: 'Control+S',
				electronAccelerator: 'Ctrl+S',
				userSettingsLabel: 'ctrl+s',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyS]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});
});

suite('keyboardMapper - LINUX en_uk', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'linux_en_uk', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_uk.txt');
	});

	test('issue #24522: resolveKeyboardEvent Ctrl+Alt+[Minus]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: true,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'Minus'
			},
			{
				label: 'Ctrl+Alt+-',
				ariaLabel: 'Control+Alt+-',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+alt+[Minus]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[Minus]'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper - MAC zh_hant', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'mac_zh_hant', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_zh_hant.txt');
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh)!, expected);
	}

	test('issue #28237 resolveKeybinding Cmd+C', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyC,
			[{
				label: '⌘C',
				ariaLabel: 'Command+C',
				electronAccelerator: 'Cmd+C',
				userSettingsLabel: 'cmd+c',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[KeyC]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});
});

suite('keyboardMapper - MAC zh_hant2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'mac_zh_hant2', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_zh_hant2.txt');
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

	const runtimeKeybinding = createSimpleKeybinding(kb, OS);

	const keybindingLabel = new USLayoutResolvedKeybinding([runtimeKeybinding], OS).getUserSettingsLabel();

	const actualHardwareKeypresses = mapper.keyCodeChordToScanCodeChord(runtimeKeybinding);
	if (actualHardwareKeypresses.length === 0) {
		assert.deepStrictEqual([], expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "[]" -- expected: "${expected}"`);
		return;
	}

	const actual = actualHardwareKeypresses
		.map(k => UserSettingsLabelProvider.toLabel(OS, [k], (keybinding) => ScanCodeUtils.toString(keybinding.scanCode)));
	assert.deepStrictEqual(actual, expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "${actual}" -- expected: "${expected}"`);
}
