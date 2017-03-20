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
import { createKeybinding, KeyMod, KeyCode, KeyChord } from 'vs/base/common/keyCodes';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';

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

function _htmlPieces(pieces: string[]): IHTMLContentElement[] {
	let children: IHTMLContentElement[] = [];
	for (let i = 0, len = pieces.length; i < len; i++) {
		if (i !== 0) {
			children.push({ tagName: 'span', text: '+' });
		}
		children.push({ tagName: 'span', className: 'monaco-kbkey', text: pieces[i] });
	}
	return children;
}

function simpleHTMLLabel(pieces: string[]): IHTMLContentElement {
	return {
		tagName: 'span',
		className: 'monaco-kb',
		children: _htmlPieces(pieces)
	};
}

function chordHTMLLabel(firstPart: string[], chordPart: string[]): IHTMLContentElement {
	return {
		tagName: 'span',
		className: 'monaco-kb',
		children: [].concat(
			_htmlPieces(firstPart),
			[{ tagName: 'span', text: ' ' }],
			_htmlPieces(chordPart)
		)
	};
}

interface IResolvedKeybindingExpected {
	label: string;
	ariaLabel: string;
	HTMLLabel: IHTMLContentElement[];
	electronAccelerator: string;
	userSettingsLabel: string;
	isChord: boolean;
	hasCtrlModifier: boolean;
	hasShiftModifier: boolean;
	hasAltModifier: boolean;
	hasMetaModifier: boolean;
	dispatchParts: [string, string];
}

function _assertResolvedKeybinding(mapper: WindowsKeyboardMapper, k: number, expected: IResolvedKeybindingExpected): void {
	let kbs = mapper.resolveKeybinding(createKeybinding(k, OperatingSystem.Windows));
	assert.equal(kbs.length, 1);
	let kb = kbs[0];

	let actual: IResolvedKeybindingExpected = {
		label: kb.getLabel(),
		ariaLabel: kb.getAriaLabel(),
		HTMLLabel: kb.getHTMLLabel(),
		electronAccelerator: kb.getElectronAccelerator(),
		userSettingsLabel: kb.getUserSettingsLabel(),
		isChord: kb.isChord(),
		hasCtrlModifier: kb.hasCtrlModifier(),
		hasShiftModifier: kb.hasShiftModifier(),
		hasAltModifier: kb.hasAltModifier(),
		hasMetaModifier: kb.hasMetaModifier(),
		dispatchParts: kb.getDispatchParts(),
	};
	assert.deepEqual(actual, expected);
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

	function assertResolveKeybinding(kb: number, expected: IResolvedKeybindingExpected): void {
		_assertResolvedKeybinding(mapper, kb, expected);
	}

	test('resolveKeybinding Ctrl+A', () => {
		assertResolveKeybinding(
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
		assertResolveKeybinding(
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
		assertResolveKeybinding(
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
		assertResolveKeybinding(
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
		assertResolveKeybinding(
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
		createKeyboardMapper('win_en_us', OperatingSystem.Macintosh).then((_mapper) => {
			mapper = _mapper;
			done();
		}, done);
	});

	test('mapping', (done) => {
		assertMapping(mapper, 'win_en_us.txt', done);
	});

	function assertResolveKeybinding(kb: number, expected: IResolvedKeybindingExpected): void {
		_assertResolvedKeybinding(mapper, kb, expected);
	}

	test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
		assertResolveKeybinding(
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
