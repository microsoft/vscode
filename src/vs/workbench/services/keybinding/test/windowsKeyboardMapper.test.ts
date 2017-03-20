/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OperatingSystem } from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { WindowsKeyboardMapper, IKeyboardMapping } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';
import { createKeybinding, KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { IResolvedKeybinding, assertResolveKeybinding, readRawMapping, assertMapping, simpleHTMLLabel, chordHTMLLabel } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';

function createKeyboardMapper(file: string): TPromise<WindowsKeyboardMapper> {
	return readRawMapping<IKeyboardMapping>(file).then((rawMappings) => {
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
		assertMapping(mapper, 'win_de_ch.txt', done);
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
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+Z', null],
			}]
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
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+]', null],
			}]
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
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+NumPad0', null],
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
		assertMapping(mapper, 'win_en_us.txt', done);
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
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+K', 'ctrl+\\'],
			}]
		);
	});
});
