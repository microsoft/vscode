/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { WindowsKeyboardMapper, IWindowsKeyboardMapping } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { createKeybinding, KeyMod, KeyCode, KeyChord, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { IResolvedKeybinding, assertResolveKeybinding, readRawMapping, assertMapping, assertResolveKeyboardEvent, assertResolveUserBinding } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';
import { ScanCodeBinding, ScanCode } from 'vs/workbench/services/keybinding/common/scanCode';

const WRITE_FILE_IF_DIFFERENT = false;

function createKeyboardMapper(file: string): TPromise<WindowsKeyboardMapper> {
	return readRawMapping<IWindowsKeyboardMapping>(file).then((rawMappings) => {
		return new WindowsKeyboardMapper(rawMappings);
	});
}

function _assertResolveKeybinding(mapper: WindowsKeyboardMapper, k: number, expected: IResolvedKeybinding[]): void {
	assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Windows), expected);
}

suite('keyboardMapper - WINDOWS de_ch', () => {

	let mapper: WindowsKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('win_de_ch').then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'win_de_ch.txt', done);
	});

	test('resolveKeybinding Ctrl+A', () => {
		_assertResolveKeybinding(
			mapper,
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
				dispatchParts: ['ctrl+A', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
			mapper,
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
				dispatchParts: ['ctrl+Z', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+Z', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: KeyCode.KEY_Z,
				code: null
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
				dispatchParts: ['ctrl+Z', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+]', () => {
		_assertResolveKeybinding(
			mapper,
			KeyMod.CtrlCmd | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: 'Ctrl+^',
				ariaLabel: 'Control+^',
				labelWithoutModifiers: '^',
				ariaLabelWithoutModifiers: '^',
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+]', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: KeyCode.US_CLOSE_SQUARE_BRACKET,
				code: null
			},
			{
				label: 'Ctrl+^',
				ariaLabel: 'Control+^',
				labelWithoutModifiers: '^',
				ariaLabelWithoutModifiers: '^',
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+]', null],
			}
		);
	});

	test('resolveKeybinding Shift+]', () => {
		_assertResolveKeybinding(
			mapper,
			KeyMod.Shift | KeyCode.US_CLOSE_SQUARE_BRACKET,
			[{
				label: 'Shift+^',
				ariaLabel: 'Shift+^',
				labelWithoutModifiers: '^',
				ariaLabelWithoutModifiers: '^',
				electronAccelerator: 'Shift+]',
				userSettingsLabel: 'shift+]',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['shift+]', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+/', () => {
		_assertResolveKeybinding(
			mapper,
			KeyMod.CtrlCmd | KeyCode.US_SLASH,
			[{
				label: 'Ctrl+§',
				ariaLabel: 'Control+§',
				labelWithoutModifiers: '§',
				ariaLabelWithoutModifiers: '§',
				electronAccelerator: 'Ctrl+/',
				userSettingsLabel: 'ctrl+/',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+/', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Shift+/', () => {
		_assertResolveKeybinding(
			mapper,
			KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.US_SLASH,
			[{
				label: 'Ctrl+Shift+§',
				ariaLabel: 'Control+Shift+§',
				labelWithoutModifiers: '§',
				ariaLabelWithoutModifiers: '§',
				electronAccelerator: 'Ctrl+Shift+/',
				userSettingsLabel: 'ctrl+shift+/',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: true,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+shift+/', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			mapper,
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH),
			[{
				label: 'Ctrl+K Ctrl+ä',
				ariaLabel: 'Control+K Control+ä',
				labelWithoutModifiers: 'K ä',
				ariaLabelWithoutModifiers: 'K ä',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+\\',
				isWYSIWYG: false,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+K', 'ctrl+\\'],
			}]
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			mapper,
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[]
		);
	});

	test('resolveKeybinding Ctrl+DownArrow', () => {
		_assertResolveKeybinding(
			mapper,
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
				dispatchParts: ['ctrl+DownArrow', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+NUMPAD_0', () => {
		_assertResolveKeybinding(
			mapper,
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
				dispatchParts: ['ctrl+NumPad0', null],
			}]
		);
	});

	test('resolveKeybinding Ctrl+Home', () => {
		_assertResolveKeybinding(
			mapper,
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
				dispatchParts: ['ctrl+Home', null],
			}]
		);
	});

	test('resolveKeyboardEvent Ctrl+Home', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: KeyCode.Home,
				code: null
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
				dispatchParts: ['ctrl+Home', null],
			}
		);
	});

	test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(true, false, false, false, ScanCode.Comma),
			new SimpleKeybinding(true, false, false, false, KeyCode.US_SLASH),
			[{
				label: 'Ctrl+, Ctrl+§',
				ariaLabel: 'Control+, Control+§',
				labelWithoutModifiers: ', §',
				ariaLabelWithoutModifiers: ', §',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+, ctrl+/',
				isWYSIWYG: false,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+,', 'ctrl+/'],
			}]
		);
	});

	test('resolveKeyboardEvent Modifier only Ctrl+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: KeyCode.Ctrl,
				code: null
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

suite('keyboardMapper - WINDOWS en_us', () => {

	let mapper: WindowsKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('win_en_us').then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'win_en_us.txt', done);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			mapper,
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
				dispatchParts: ['ctrl+K', 'ctrl+\\'],
			}]
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
				dispatchParts: ['ctrl+,', 'ctrl+/'],
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
				dispatchParts: ['ctrl+,', null],
			}]
		);
	});

	test('resolveKeyboardEvent Modifier only Ctrl+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				keyCode: KeyCode.Ctrl,
				code: null
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

suite('misc', () => {
	test('issue #23513: Toggle Sidebar Visibility and Go to Line display same key mapping in Arabic keyboard', () => {
		const mapper = new WindowsKeyboardMapper({
			'KeyB': {
				'vkey': 'VK_B',
				'value': 'لا',
				'withShift': 'لآ',
				'withAltGr': '',
				'withShiftAltGr': ''
			},
			'KeyG': {
				'vkey': 'VK_G',
				'value': 'ل',
				'withShift': 'لأ',
				'withAltGr': '',
				'withShiftAltGr': ''
			}
		});

		_assertResolveKeybinding(
			mapper,
			KeyMod.CtrlCmd | KeyCode.KEY_B,
			[{
				label: 'Ctrl+لا',
				ariaLabel: 'Control+لا',
				labelWithoutModifiers: 'لا',
				ariaLabelWithoutModifiers: 'لا',
				electronAccelerator: 'Ctrl+B',
				userSettingsLabel: 'ctrl+b',
				isWYSIWYG: false,
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+B', null],
			}]
		);
	});
});
