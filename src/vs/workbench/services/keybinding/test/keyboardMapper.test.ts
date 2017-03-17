/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { KeyMod, KeyCode, createKeybinding, SimpleKeybinding, Keybinding } from 'vs/base/common/keyCodes';
import { KeyboardMapper, IKeyboardMapping } from 'vs/workbench/services/keybinding/common/keyboardMapper';
import { OperatingSystem } from 'vs/base/common/platform';
import { UserSettingsLabelProvider, PrintableKeypress } from 'vs/platform/keybinding/common/keybindingLabels';
import { USLayoutResolvedKeybinding } from 'vs/platform/keybinding/common/usLayoutResolvedKeybinding';
import { KeyboardEventCodeUtils } from 'vs/workbench/services/keybinding/common/keyboardEventCode';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { readFile, writeFile } from 'vs/base/node/pfs';
import { TPromise } from 'vs/base/common/winjs.base';

function createKeyboardMapper(file: string, OS: OperatingSystem): TPromise<KeyboardMapper> {
	return readFile(require.toUrl(`vs/workbench/services/keybinding/test/${file}.js`)).then((buff) => {
		let contents = buff.toString();
		let func = new Function('define', contents);
		let rawMappings: IKeyboardMapping = null;
		func(function (value) {
			rawMappings = value;
		});
		return new KeyboardMapper(rawMappings, OS);
	});
}

function assertMapping(mapper: KeyboardMapper, file: string, done: (err?: any) => void): void {
	const filePath = require.toUrl(`vs/workbench/services/keybinding/test/${file}`);

	readFile(filePath).then((buff) => {
		let expected = buff.toString();
		const actual = mapper.dumpDebugInfo();
		if (actual !== expected) {
			writeFile(filePath, actual);
		}
		try {
			assert.deepEqual(actual, expected);
		} catch (err) {
			return done(err);
		}
		done();
	}, done);
}

suite('keyboardMapper - MAC de_ch', () => {

	let mapper: KeyboardMapper;

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

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Shift+Cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Cmd+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Cmd+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_SLASH, 'Shift+Cmd+Digit7');
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

});

suite('keyboardMapper - LINUX de_ch', () => {

	let mapper: KeyboardMapper;

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
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_1, 'Ctrl+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_B, 'Ctrl+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_B, 'Ctrl+Shift+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KEY_B, 'Ctrl+Shift+Alt+Meta+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Z, 'Ctrl+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KEY_Y, 'Ctrl+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.US_SLASH, 'Ctrl+Shift+Digit7');
	});
});

suite('keyboardMapper - LINUX de_ch', () => {

	let mapper: KeyboardMapper;

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

function _assertKeybindingTranslation(mapper: KeyboardMapper, OS: OperatingSystem, kb: number, _expected: string | string[]): void {
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
