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

function createKeyboardMapper(file: string): TPromise<WindowsKeyboardMapper> {
	return readRawMapping<IKeyboardMapping>(file).then((rawMappings) => {
		return new WindowsKeyboardMapper(rawMappings);
	});
}

function _assertResolveKeybinding(mapper: WindowsKeyboardMapper, k: number, expected: IResolvedKeybinding): void {
	assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Windows), [expected]);
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
			{
				label: 'Ctrl+A',
				ariaLabel: 'Control+A',
				HTMLLabel: [simpleHTMLLabel(['Ctrl', 'A'])],
				electronAccelerator: 'Ctrl+A',
				userSettingsLabel: 'ctrl+a',
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+A', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
			mapper,
			KeyMod.CtrlCmd | KeyCode.KEY_Z,
			{
				label: 'Ctrl+Z',
				ariaLabel: 'Control+Z',
				HTMLLabel: [simpleHTMLLabel(['Ctrl', 'Z'])],
				electronAccelerator: 'Ctrl+Z',
				userSettingsLabel: 'ctrl+z',
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
			{
				label: 'Ctrl+^',
				ariaLabel: 'Control+^',
				HTMLLabel: [simpleHTMLLabel(['Ctrl', '^'])],
				electronAccelerator: 'Ctrl+]',
				userSettingsLabel: 'ctrl+]',
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+]', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+/', () => {
		_assertResolveKeybinding(
			mapper,
			KeyMod.CtrlCmd | KeyCode.US_SLASH,
			{
				label: 'Ctrl+§',
				ariaLabel: 'Control+§',
				HTMLLabel: [simpleHTMLLabel(['Ctrl', '§'])],
				electronAccelerator: 'Ctrl+/',
				userSettingsLabel: 'ctrl+/',
				isChord: false,
				hasCtrlModifier: true,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+/', null],
			}
		);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			mapper,
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH),
			{
				label: 'Ctrl+K Ctrl+ä',
				ariaLabel: 'Control+K Control+ä',
				HTMLLabel: [chordHTMLLabel(['Ctrl', 'K'], ['Ctrl', 'ä'])],
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+\\',
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+K', 'ctrl+\\'],
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
		assertMapping(mapper, 'win_en_us.txt', done);
	});

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		_assertResolveKeybinding(
			mapper,
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_BACKSLASH),
			{
				label: 'Ctrl+K Ctrl+\\',
				ariaLabel: 'Control+K Control+\\',
				HTMLLabel: [chordHTMLLabel(['Ctrl', 'K'], ['Ctrl', '\\'])],
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+\\',
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+K', 'ctrl+\\'],
			}
		);
	});
});
