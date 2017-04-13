/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { KeyMod, KeyCode, createKeybinding, KeyChord, SimpleKeybinding } from 'vs/base/common/keyCodes';
import { OperatingSystem } from 'vs/base/common/platform';
import { IResolvedKeybinding, assertResolveKeybinding, assertResolveKeyboardEvent, assertResolveUserBinding } from 'vs/workbench/services/keybinding/test/keyboardMapperTestUtils';
import { MacLinuxFallbackKeyboardMapper } from "vs/workbench/services/keybinding/common/macLinuxFallbackKeyboardMapper";
import { ScanCodeBinding, ScanCode } from 'vs/workbench/services/keybinding/common/scanCode';

suite('keyboardMapper - MAC fallback', () => {

	let mapper = new MacLinuxFallbackKeyboardMapper(OperatingSystem.Macintosh);

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Macintosh), expected);
	}

	test('resolveKeybinding Cmd+Z', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KEY_Z,
			[{
				label: '⌘Z',
				ariaLabel: 'Command+Z',
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
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
				labelWithoutModifiers: 'K =',
				ariaLabelWithoutModifiers: 'K =',
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
				labelWithoutModifiers: 'Z',
				ariaLabelWithoutModifiers: 'Z',
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
				labelWithoutModifiers: ', /',
				ariaLabelWithoutModifiers: ', /',
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

	test('resolveKeyboardEvent Modifier only Meta+', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: true,
				keyCode: KeyCode.Meta,
				code: null
			},
			{
				label: '⌘',
				ariaLabel: 'Command+',
				labelWithoutModifiers: '',
				ariaLabelWithoutModifiers: '',
				electronAccelerator: null,
				userSettingsLabel: 'cmd+',
				isWYSIWYG: true,
				isChord: false,
				hasCtrlModifier: false,
				hasShiftModifier: false,
				hasAltModifier: false,
				hasMetaModifier: true,
				dispatchParts: [null, null],
			}
		);
	});
});

suite('keyboardMapper - LINUX fallback', () => {

	let mapper = new MacLinuxFallbackKeyboardMapper(OperatingSystem.Linux);

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, createKeybinding(k, OperatingSystem.Linux), expected);
	}

	test('resolveKeybinding Ctrl+Z', () => {
		_assertResolveKeybinding(
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

	test('resolveKeybinding Ctrl+K Ctrl+=', () => {
		_assertResolveKeybinding(
			KeyChord(KeyMod.CtrlCmd | KeyCode.KEY_K, KeyMod.CtrlCmd | KeyCode.US_EQUAL),
			[{
				label: 'Ctrl+K Ctrl+=',
				ariaLabel: 'Control+K Control+=',
				labelWithoutModifiers: 'K =',
				ariaLabelWithoutModifiers: 'K =',
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
