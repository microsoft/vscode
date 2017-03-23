/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyMod, KeyCode, createKeybinding, KeyChord, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';
import { IHTMLContentElement } from 'vs/base/common/htmlContent';
import { IResolvedKeybinding, assertResolveKeybinding, simpleHTMLLabel, chordHTMLLabel, assertResolveKeyboardEvent, assertResolveUserBinding } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';
import { MacLinuxFallbackKeyboardMapper } from "vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper";
import { ScanCodeBinding, ScanCode } from 'vs/workbench/services/keybinding/common/scanCode';

suite('keyboardMapper - MAC fallback', () => {

	let mapper = new MacLinuxFallbackKeyboardMapper({}, OperatingSystem.Macintosh);

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Macintosh), expected);
	}

	function _simpleHTMLLabel(pieces: string[]): IHTMLContentElement {
		return simpleHTMLLabel(pieces, OperatingSystem.Macintosh);
	}

	function _chordHTMLLabel(firstPart: string[], chordPart: string[]): IHTMLContentElement {
		return chordHTMLLabel(firstPart, chordPart, OperatingSystem.Macintosh);
	}

	test('resolveKeybinding Cmd+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_Z,
			[{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				HTMLLabel: [_simpleHTMLLabel(['⌘', 'Z'])],
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+Z', null],
			}]
		);
	});

	test('resolveKeybinding Cmd+K Cmd+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[{
				label: '⌘K ⌘=',
				ariaLabel: 'Command+K Command+=',
				HTMLLabel: [_chordHTMLLabel(['⌘', 'K'], ['⌘', '='])],
				electronAccelerator: null,
				userSettingsLabel: 'cmd+k cmd+=',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['meta+K', 'meta+='],
			}]
		);
	});

	test('resolveKeyboardEvent Cmd+Z', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: KeyCode.KEY_Z,
				code: null
			},
			{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				HTMLLabel: [_simpleHTMLLabel(['⌘', 'Z'])],
				electronAccelerator: 'Cmd+Z',
				userSettingsLabel: 'cmd+z',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: ['meta+Z', null],
			}
		);
	});

	test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
		assertResolveUserBinding(
			mapper,
			new ScanCodeBinding(false, false, false, true, ScanCode.Comma),
			new SimpleKeybinding(false, false, false, true, KeyCode.US_SLASH),
			[{
				label: '⌘, ⌘/',
				ariaLabel: 'Command+, Command+/',
				HTMLLabel: [_chordHTMLLabel(['⌘', ','], ['⌘', '/'])],
				electronAccelerator: null,
				userSettingsLabel: 'cmd+, cmd+/',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['meta+,', 'meta+/'],
			}]
		);
	});
});

suite('keyboardMapper - MAC fallback', () => {

	let mapper = new MacLinuxFallbackKeyboardMapper({}, OperatingSystem.Linux);

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Linux), expected);
	}

	function _simpleHTMLLabel(pieces: string[]): IHTMLContentElement {
		return simpleHTMLLabel(pieces, OperatingSystem.Linux);
	}

	function _chordHTMLLabel(firstPart: string[], chordPart: string[]): IHTMLContentElement {
		return chordHTMLLabel(firstPart, chordPart, OperatingSystem.Linux);
	}

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
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

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[{
				label: 'Ctrl+K Ctrl+=',
				ariaLabel: 'Control+K Control+=',
				HTMLLabel: [_chordHTMLLabel(['Ctrl', 'K'], ['Ctrl', '='])],
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+k ctrl+=',
				isWYSIWYG: true,
				isChord: true,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: false,
				dispatchParts: ['ctrl+K', 'ctrl+='],
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
});
