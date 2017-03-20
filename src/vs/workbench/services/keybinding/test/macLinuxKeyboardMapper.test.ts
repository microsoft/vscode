/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { KeyMod, KeyCode, createKeybinding, SimpleKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { MacLinuxKeyboardMapper, IKeyboardMapping } from 'vs/workbench/services/keybinding/common/macLinuxKeyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider } from 'vs/platform/keybinding/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { KeyboardEventCodeUtils } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { TPromise } from 'vs/base/common/winjs.base';
import { readRawMapping, assertMapping, IResolvedKeybinding, assertResolveKeybinding, simpleHTMLLabel } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';

function createKeyboardMapper(file: string, OS: OperatingSystem): TPromise<MacLinuxKeyboardMapper> {
	return readRawMapping<IKeyboardMapping>(file).then((rawMappings) => {
		return new MacLinuxKeyboardMapper(rawMappings, OS);
	});
}

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('mac_de_ch', OperatingSystem.Macintosh).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(mapper, 'mac_de_ch.txt', done);
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Macintosh), expected);
	}

	function _simpleHTMLLabel(pieces: string[]): IHTMLContentElement {
		return simpleHTMLLabel(pieces, OperatingSystem.Macintosh);
	}

	// function _chordHTMLLabel(firstPart: string[], chordPart: string[]): IHTMLContentElement {
	// 	return chordHTMLLabel(firstPart, chordPart, OperatingSystem.Macintosh);
	// }

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

	test('resolveKeybinding', () => {
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
			createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_Z, OperatingSystem.Macintosh),
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

	// TODO: missing
	test('resolveKeybinding Cmd+A', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_A,
			[]
		);
	});

	test('resolveKeybinding Cmd+B', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_B,
			[{
				label: '⌘B',
				ariaLabel: 'Command+B',
				HTMLLabel: [_simpleHTMLLabel(['⌘', 'B'])],
				electronAccelerator: 'Cmd+B',
				userSettingsLabel: 'cmd+b',
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+[KeyB]', null],
			}]
		);
	});

});

suite('keyboardMapper - LINUX de_ch', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('linux_de_ch', OperatingSystem.Linux).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(mapper, 'linux_de_ch.txt', done);
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, expected);
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
});

suite('keyboardMapper - LINUX de_ch', () => {

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('linux_en_us', OperatingSystem.Linux).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(mapper, 'linux_en_us.txt', done);
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

	const actualHardwareKeypresses = mapper.simpleKeybindingToHardwareKeypress(<SimpleKeybinding>runtimeKeybinding);
	if (actualHardwareKeypresses.length === 0) {
		assert.deepEqual([], expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "[]" -- expected: "${expected}"`);
		return;
	}

	const actual = actualHardwareKeypresses
		.map(k => UserSettingsLabelProvider.toLabel(k, KeyboardEventCodeUtils.toString(k.code), null, null, OS));
	assert.deepEqual(actual, expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "${actual}" -- expected: "${expected}"`);
}
