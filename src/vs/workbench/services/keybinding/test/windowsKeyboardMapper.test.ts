/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { OperatingSystem } from 'vs/base/common/platform';
import { readFile, writeFile } from 'vs/base/node/pfs';
import { TPromise } from 'vs/base/common/winjs.base';
import { WindowsKeyboardMapper, IKeyboardMapping } from 'vs/workbench/services/keybinding/common/windowsKeyboardMapper';

function createKeyboardMapper(file: string, OS: OperatingSystem): TPromise<WindowsKeyboardMapper> {
	return readFile(require.toUrl(`vs/workbench/services/keybinding/test/${file}.js`)).then((buff) => {
		let contents = buff.toString();
		let func = new Function('define', contents);
		let rawMappings: IKeyboardMapping = null;
		func(function (value) {
			rawMappings = value;
		});
		return new WindowsKeyboardMapper(rawMappings);
	});
}

function assertMapping(mapper: WindowsKeyboardMapper, file: string, done: (err?: any) => void): void {
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

suite('keyboardMapper - WINDOWS de_ch', () => {

	let mapper: WindowsKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('win_de_ch', OperatingSystem.Macintosh).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(mapper, 'win_de_ch.txt', done);
	});

	// test('resolveKeybinding', () => {
	// 	function _assertAllLabels(keybinding: Keybinding, labels: string[], ariaLabels: string[], htmlLabel: IHTMLContentElement[][]): void {
	// 		const kb = mapper.resolveKeybinding(keybinding);

	// 		let actualLabels = kb.map(k => k.getLabel());
	// 		assert.deepEqual(actualLabels, labels);

	// 		let actualAriaLabels = kb.map(k => k.getAriaLabel());
	// 		assert.deepEqual(actualAriaLabels, ariaLabels);

	// 		let actualHTMLLabels = kb.map(k => k.getHTMLLabel());
	// 		assert.deepEqual(actualHTMLLabels, htmlLabel);
	// 	}

	// 	function assertAllLabels(keybinding: Keybinding, label: string | string[], ariaLabel: string | string[], htmlLabel: IHTMLContentElement[][]): void {
	// 		let _labels = (typeof label === 'string' ? [label] : label);
	// 		let _ariaLabels = (typeof ariaLabel === 'string' ? [ariaLabel] : ariaLabel);
	// 		_assertAllLabels(keybinding, _labels, _ariaLabels, htmlLabel);
	// 	}


	// 	// TODO: ElectronAccelerator, UserSettings
	// 	assertAllLabels(
	// 		createKeybinding(KeyMod.CtrlCmd | KeyCode.KEY_Z),
	// 		'⌘Z',
	// 		'Command+Z',
	// 		[[{
	// 			tagName: 'span',
	// 			className: 'monaco-kb',
	// 			children: [
	// 				{ tagName: 'span', className: 'monaco-kbkey', text: '⌘' },
	// 				{ tagName: 'span', className: 'monaco-kbkey', text: 'Z' },
	// 			]
	// 		}]]
	// 	);
	// });

});


suite('keyboardMapper - WINDOWS en_us', () => {

	let mapper: WindowsKeyboardMapper;

	suiteSetup((done) => {
		createKeyboardMapper('win_en_us', OperatingSystem.Macintosh).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(mapper, 'win_en_us.txt', done);
	});
});