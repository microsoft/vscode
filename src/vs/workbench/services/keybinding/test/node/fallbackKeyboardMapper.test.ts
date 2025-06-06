/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyChord, KeyCode, KeyMod, ScanCode } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, ScanCodeChord, Keybinding } from '../../../../../base/common/keybindings.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FallbackKeyboardMapper } from '../../common/fallbackKeyboardMapper.js';
import { IResolvedKeybinding, assertResolveKeyboardEvent, assertResolveKeybinding } from './keyboardMapperTestUtils.js';

suite('keyboardMapper - MAC fallback', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mapper = new FallbackKeyboardMapper(false, OperatingSystem.Macintosh);

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh)!, expected);
	}

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
				dispatchParts: ['meta+Z'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeybinding Cmd+K Cmd+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			[{
				label: '⌘K ⌘=',
				ariaLabel: 'Command+K Command+=',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+k cmd+=',
				isWYSIWYG: true,
				isMultiChord: true,
				dispatchParts: ['meta+K', 'meta+='],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeyboardEvent Cmd+Z', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: KeyCode.KeyZ,
				code: null!
			},
			{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+Z'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
		assertResolveKeybinding(
			mapper, new Keybinding([
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
				dispatchParts: ['meta+,', 'meta+/'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeyboardEvent Single Modifier Meta+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				altGraphKey: false,
				keyCode: KeyCode.Meta,
				code: null!
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

	test('resolveKeyboardEvent Single Modifier Shift+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: true,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: KeyCode.Shift,
				code: null!
			},
			{
				label: '⇧',
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

	test('resolveKeyboardEvent Single Modifier Alt+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: true,
				metaKey: false,
				altGraphKey: false,
				keyCode: KeyCode.Alt,
				code: null!
			},
			{
				label: '⌥',
				ariaLabel: 'Option',
				electronAccelerator: null,
				userSettingsLabel: 'alt',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: [null],
				singleModifierDispatchParts: ['alt'],
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
				keyCode: KeyCode.Shift,
				code: null!
			},
			{
				label: '⌃⇧',
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

	test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', () => {
		const mapper = new FallbackKeyboardMapper(true, OperatingSystem.Macintosh);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: true,
				keyCode: KeyCode.KeyZ,
				code: null!
			},
			{
				label: '⌃⌥Z',
				ariaLabel: 'Control+Option+Z',
				electronAccelerator: 'Ctrl+Alt+Z',
				userSettingsLabel: 'ctrl+alt+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+Z'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper - LINUX fallback', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const mapper = new FallbackKeyboardMapper(false, OperatingSystem.Linux);

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

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
				dispatchParts: ['ctrl+Z'],
				singleModifierDispatchParts: [null],
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
				dispatchParts: ['ctrl+K', 'ctrl+='],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+Z', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: KeyCode.KeyZ,
				code: null!
			},
			{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+Z'],
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
				dispatchParts: ['ctrl+,', 'ctrl+/'],
				singleModifierDispatchParts: [null, null],
			}]
		);
	});

	test('resolveUserBinding Ctrl+[Comma]', () => {
		assertResolveKeybinding(
			mapper, new Keybinding([
				new ScanCodeChord(true, false, false, false, ScanCode.Comma),
			]),
			[{
				label: 'Ctrl+,',
				ariaLabel: 'Control+,',
				electronAccelerator: 'Ctrl+,',
				userSettingsLabel: 'ctrl+,',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+,'],
				singleModifierDispatchParts: [null],
			}]
		);
	});

	test('resolveKeyboardEvent Single Modifier Ctrl+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: KeyCode.Ctrl,
				code: null!
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

	test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', () => {
		const mapper = new FallbackKeyboardMapper(true, OperatingSystem.Linux);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: true,
				keyCode: KeyCode.KeyZ,
				code: null!
			},
			{
				label: 'Ctrl+Alt+Z',
				ariaLabel: 'Control+Alt+Z',
				electronAccelerator: 'Ctrl+Alt+Z',
				userSettingsLabel: 'ctrl+alt+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+Z'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});
