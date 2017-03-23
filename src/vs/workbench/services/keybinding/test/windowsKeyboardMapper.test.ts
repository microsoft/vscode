/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { WindowsKeyboardMapper, IWindowsKeyboardMapping } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { createKeybinding, KeyMod, KeyCode, KeyChord, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { IResolvedKeybinding, assertResolveKeybinding, readRawMapping, assertMapping, simpleHTMLLabel, chordHTMLLabel, assertResolveKeyboardEvent, assertResolveUserBinding } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
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

function _simpleHTMLLabel(pieces: string[]): IHTMLContentElement {
	return simpleHTMLLabel(pieces, OperatingSystem.Windows);
}

function _chordHTMLLabel(firstPart: string[], chordPart: string[]): IHTMLContentElement {
	return chordHTMLLabel(firstPart, chordPart, OperatingSystem.Windows);
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'A'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'Z'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'Z'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', '^'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', '^'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Shift', '^'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', '§'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'Shift', '§'])],
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
				HTMLLabel: [_chordHTMLLabel(['Ctrl', 'K'], ['Ctrl', 'ä'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'DownArrow'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'NumPad0'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'Home'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', 'Home'])],
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
				HTMLLabel: [_chordHTMLLabel(['Ctrl', ','], ['Ctrl', '§'])],
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
				HTMLLabel: [_chordHTMLLabel(['Ctrl', 'K'], ['Ctrl', '\\'])],
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
				HTMLLabel: [_chordHTMLLabel(['Ctrl', ','], ['Ctrl', '/'])],
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
				HTMLLabel: [_simpleHTMLLabel(['Ctrl', ','])],
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
});
