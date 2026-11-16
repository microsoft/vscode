/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { KeyChord, KeyCode, KeyMod, ScanCode, ScanCodeUtils } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, createSimpleKeybinding, ScanCodeChord, Keybinding, SingleModifierChord } from '../../../../../base/common/keybindings.js';
import { UserSettingsLabelProvider } from '../../../../../base/common/keybindingLabels.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { IKeyboardEvent } from '../../../../../platform/keybinding/common/keybinding.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MacLinuxKeyboardMapper } from '../../common/macLinuxKeyboardMapper.js';
import { IResolvedKeybinding, assertMapping, assertResolveKeyboardEvent, assertResolveKeybinding, readRawMapping } from './keyboardMapperTestUtils.js';
import { IMacLinuxKeyboardMapping } from '../../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

const WRITE_FILE_IF_DIFFERENT = false;

async function createKeyboardMapper(isUSStandard: boolean, file: string, mapAltGrToCtrlAlt: boolean, OS: OperatingSystem): Promise<MacLinuxKeyboardMapper> {
	const rawMappings = await readRawMapping<IMacLinuxKeyboardMapping>(file);
	return new MacLinuxKeyboardMapper(isUSStandard, rawMappings, mapAltGrToCtrlAlt, OS);
}

/**
 * A table-driven test case that resolves either a `keybinding` (encoded as a number, or a user binding) or a keyboard `event`.
 */
type ResolveTestCase<TKeybinding extends number | Keybinding = number | Keybinding> =
	| { name: string; keybinding: TKeybinding; event?: undefined; expected: IResolvedKeybinding[] }
	| { name: string; keybinding?: undefined; event: IKeyboardEvent; expected: IResolvedKeybinding };

/**
 * Creates an expected resolved keybinding. `isMultiChord` is derived from the number of `dispatchParts` and `singleModifierDispatchParts` defaults to one `null` per dispatch part.
 */
function resolved(label: string, ariaLabel: string, electronAccelerator: string | null, userSettingsLabel: string, isWYSIWYG: boolean, dispatchParts: (string | null)[], singleModifierDispatchParts: (SingleModifierChord | null)[] = dispatchParts.map(() => null)): IResolvedKeybinding {
	return { label, ariaLabel, electronAccelerator, userSettingsLabel, isWYSIWYG, isMultiChord: dispatchParts.length > 1, dispatchParts, singleModifierDispatchParts };
}

/**
 * Creates a keyboard event for `code` with the given modifiers pressed (AltGr is never pressed).
 */
function keyboardEvent(modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }, code: string, keyCode: KeyCode = -1): IKeyboardEvent {
	return {
		_standardKeyboardEventBrand: true,
		ctrlKey: modifiers.ctrlKey ?? false,
		shiftKey: modifiers.shiftKey ?? false,
		altKey: modifiers.altKey ?? false,
		metaKey: modifiers.metaKey ?? false,
		altGraphKey: false,
		keyCode,
		code
	};
}

suite('keyboardMapper - MAC de_ch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'mac_de_ch', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_de_ch.txt');
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Macintosh, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh)!, expected);
	}

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Digit1, 'cmd+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyB, 'cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB, 'shift+cmd+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyB, 'ctrl+shift+alt+cmd+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyZ, 'cmd+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyY, 'cmd+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Slash, 'shift+cmd+Digit7');
	});

	const cases: ResolveTestCase[] = [
		{ name: 'resolveKeybinding Cmd+A', keybinding: KeyMod.CtrlCmd | KeyCode.KeyA, expected: [resolved('⌘A', 'Command+A', 'Cmd+A', 'cmd+a', true, ['meta+[KeyA]'])] },
		{ name: 'resolveKeybinding Cmd+B', keybinding: KeyMod.CtrlCmd | KeyCode.KeyB, expected: [resolved('⌘B', 'Command+B', 'Cmd+B', 'cmd+b', true, ['meta+[KeyB]'])] },
		{ name: 'resolveKeybinding Cmd+Z', keybinding: KeyMod.CtrlCmd | KeyCode.KeyZ, expected: [resolved('⌘Z', 'Command+Z', 'Cmd+Z', 'cmd+z', true, ['meta+[KeyY]'])] },
		{ name: 'resolveKeyboardEvent Cmd+[KeyY]', event: keyboardEvent({ metaKey: true }, 'KeyY'), expected: resolved('⌘Z', 'Command+Z', 'Cmd+Z', 'cmd+z', true, ['meta+[KeyY]']) },
		{ name: 'resolveKeybinding Cmd+]', keybinding: KeyMod.CtrlCmd | KeyCode.BracketRight, expected: [resolved('⌃⌥⌘6', 'Control+Option+Command+6', 'Ctrl+Alt+Cmd+6', 'ctrl+alt+cmd+6', true, ['ctrl+alt+meta+[Digit6]'])] },
		{ name: 'resolveKeyboardEvent Cmd+[BracketRight]', event: keyboardEvent({ metaKey: true }, 'BracketRight'), expected: resolved('⌘¨', 'Command+¨', null, 'cmd+[BracketRight]', false, ['meta+[BracketRight]']) },
		{ name: 'resolveKeybinding Shift+]', keybinding: KeyMod.Shift | KeyCode.BracketRight, expected: [resolved('⌃⌥9', 'Control+Option+9', 'Ctrl+Alt+9', 'ctrl+alt+9', true, ['ctrl+alt+[Digit9]'])] },
		{ name: 'resolveKeybinding Cmd+/', keybinding: KeyMod.CtrlCmd | KeyCode.Slash, expected: [resolved('⇧⌘7', 'Shift+Command+7', 'Shift+Cmd+7', 'shift+cmd+7', true, ['shift+meta+[Digit7]'])] },
		{ name: 'resolveKeybinding Cmd+Shift+/', keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash, expected: [resolved('⇧⌘\'', 'Shift+Command+\'', null, 'shift+cmd+[Minus]', false, ['shift+meta+[Minus]'])] },
		{
			name: 'resolveKeybinding Cmd+K Cmd+\\',
			keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
			expected: [resolved('⌘K ⌃⇧⌥⌘7', 'Command+K Control+Shift+Option+Command+7', null, 'cmd+k ctrl+shift+alt+cmd+7', true, ['meta+[KeyK]', 'ctrl+shift+alt+meta+[Digit7]'])]
		},
		{
			name: 'resolveKeybinding Cmd+K Cmd+=',
			keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			expected: [resolved('⌘K ⇧⌘0', 'Command+K Shift+Command+0', null, 'cmd+k shift+cmd+0', true, ['meta+[KeyK]', 'shift+meta+[Digit0]'])]
		},
		{ name: 'resolveKeybinding Cmd+DownArrow', keybinding: KeyMod.CtrlCmd | KeyCode.DownArrow, expected: [resolved('⌘↓', 'Command+DownArrow', 'Cmd+Down', 'cmd+down', true, ['meta+[ArrowDown]'])] },
		{ name: 'resolveKeybinding Cmd+NUMPAD_0', keybinding: KeyMod.CtrlCmd | KeyCode.Numpad0, expected: [resolved('⌘NumPad0', 'Command+NumPad0', null, 'cmd+numpad0', true, ['meta+[Numpad0]'])] },
		{ name: 'resolveKeybinding Ctrl+Home', keybinding: KeyMod.CtrlCmd | KeyCode.Home, expected: [resolved('⌘Home', 'Command+Home', 'Cmd+Home', 'cmd+home', true, ['meta+[Home]'])] },
		{ name: 'resolveKeyboardEvent Ctrl+[Home]', event: keyboardEvent({ metaKey: true }, 'Home'), expected: resolved('⌘Home', 'Command+Home', 'Cmd+Home', 'cmd+home', true, ['meta+[Home]']) },
		{
			name: 'resolveUserBinding Cmd+[Comma] Cmd+/',
			keybinding: new Keybinding([new ScanCodeChord(false, false, false, true, ScanCode.Comma), new KeyCodeChord(false, false, false, true, KeyCode.Slash)]),
			expected: [resolved('⌘, ⇧⌘7', 'Command+, Shift+Command+7', null, 'cmd+[Comma] shift+cmd+7', false, ['meta+[Comma]', 'shift+meta+[Digit7]'])]
		},
		{ name: 'resolveKeyboardEvent Single Modifier MetaLeft+', event: keyboardEvent({ metaKey: true }, 'MetaLeft'), expected: resolved('⌘', 'Command', null, 'cmd', true, [null], ['meta']) },
		{ name: 'resolveKeyboardEvent Single Modifier MetaRight+', event: keyboardEvent({ metaKey: true }, 'MetaRight'), expected: resolved('⌘', 'Command', null, 'cmd', true, [null], ['meta']) },
	];

	for (const testCase of cases) {
		test(testCase.name, () => {
			if (testCase.event !== undefined) {
				assertResolveKeyboardEvent(mapper, testCase.event, testCase.expected);
			} else if (typeof testCase.keybinding === 'number') {
				_assertResolveKeybinding(testCase.keybinding, testCase.expected);
			} else {
				assertResolveKeybinding(mapper, testCase.keybinding, testCase.expected);
			}
		});
	}
});

suite('keyboardMapper - MAC en_us', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(true, 'mac_en_us', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_en_us.txt');
	});

	const cases: ResolveTestCase<Keybinding>[] = [
		{
			name: 'resolveUserBinding Cmd+[Comma] Cmd+/',
			keybinding: new Keybinding([new ScanCodeChord(false, false, false, true, ScanCode.Comma), new KeyCodeChord(false, false, false, true, KeyCode.Slash)]),
			expected: [resolved('⌘, ⌘/', 'Command+, Command+/', null, 'cmd+, cmd+/', true, ['meta+[Comma]', 'meta+[Slash]'])]
		},
		{ name: 'resolveKeyboardEvent Single Modifier MetaLeft+', event: keyboardEvent({ metaKey: true }, 'MetaLeft'), expected: resolved('⌘', 'Command', null, 'cmd', true, [null], ['meta']) },
		{ name: 'resolveKeyboardEvent Single Modifier MetaRight+', event: keyboardEvent({ metaKey: true }, 'MetaRight'), expected: resolved('⌘', 'Command', null, 'cmd', true, [null], ['meta']) },
	];

	for (const testCase of cases) {
		test(testCase.name, () => {
			if (testCase.event !== undefined) {
				assertResolveKeyboardEvent(mapper, testCase.event, testCase.expected);
			} else {
				assertResolveKeybinding(mapper, testCase.keybinding, testCase.expected);
			}
		});
	}

	test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', async () => {
		const mapper = await createKeyboardMapper(true, 'mac_en_us', true, OperatingSystem.Macintosh);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: true,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				label: '⌃⌥Z',
				ariaLabel: 'Control+Option+Z',
				electronAccelerator: 'Ctrl+Alt+Z',
				userSettingsLabel: 'ctrl+alt+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[KeyZ]'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper - LINUX de_ch', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'linux_de_ch', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_de_ch.txt');
	});

	function assertKeybindingTranslation(kb: number, expected: string | string[]): void {
		_assertKeybindingTranslation(mapper, OperatingSystem.Linux, kb, expected);
	}

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

	test('kb => hw', () => {
		// unchanged
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Digit1, 'ctrl+Digit1');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyB, 'ctrl+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB, 'ctrl+shift+KeyB');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyMod.WinCtrl | KeyCode.KeyB, 'ctrl+shift+alt+meta+KeyB');

		// flips Y and Z
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyZ, 'ctrl+KeyY');
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.KeyY, 'ctrl+KeyZ');

		// Ctrl+/
		assertKeybindingTranslation(KeyMod.CtrlCmd | KeyCode.Slash, 'ctrl+shift+Digit7');
	});

	const cases: ResolveTestCase[] = [
		{ name: 'resolveKeybinding Ctrl+A', keybinding: KeyMod.CtrlCmd | KeyCode.KeyA, expected: [resolved('Ctrl+A', 'Control+A', 'Ctrl+A', 'ctrl+a', true, ['ctrl+[KeyA]'])] },
		{ name: 'resolveKeybinding Ctrl+Z', keybinding: KeyMod.CtrlCmd | KeyCode.KeyZ, expected: [resolved('Ctrl+Z', 'Control+Z', 'Ctrl+Z', 'ctrl+z', true, ['ctrl+[KeyY]'])] },
		{ name: 'resolveKeyboardEvent Ctrl+[KeyY]', event: keyboardEvent({ ctrlKey: true }, 'KeyY'), expected: resolved('Ctrl+Z', 'Control+Z', 'Ctrl+Z', 'ctrl+z', true, ['ctrl+[KeyY]']) },
		{ name: 'resolveKeybinding Ctrl+]', keybinding: KeyMod.CtrlCmd | KeyCode.BracketRight, expected: [] },
		{ name: 'resolveKeyboardEvent Ctrl+[BracketRight]', event: keyboardEvent({ ctrlKey: true }, 'BracketRight'), expected: resolved('Ctrl+¨', 'Control+¨', null, 'ctrl+[BracketRight]', false, ['ctrl+[BracketRight]']) },
		{
			name: 'resolveKeybinding Shift+]',
			keybinding: KeyMod.Shift | KeyCode.BracketRight,
			expected: [
				resolved('Ctrl+Alt+0', 'Control+Alt+0', 'Ctrl+Alt+0', 'ctrl+alt+0', true, ['ctrl+alt+[Digit0]']),
				resolved('Ctrl+Alt+$', 'Control+Alt+$', null, 'ctrl+alt+[Backslash]', false, ['ctrl+alt+[Backslash]']),
			]
		},
		{ name: 'resolveKeybinding Ctrl+/', keybinding: KeyMod.CtrlCmd | KeyCode.Slash, expected: [resolved('Ctrl+Shift+7', 'Control+Shift+7', 'Ctrl+Shift+7', 'ctrl+shift+7', true, ['ctrl+shift+[Digit7]'])] },
		{ name: 'resolveKeybinding Ctrl+Shift+/', keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash, expected: [resolved('Ctrl+Shift+\'', 'Control+Shift+\'', null, 'ctrl+shift+[Minus]', false, ['ctrl+shift+[Minus]'])] },
		{ name: 'resolveKeybinding Ctrl+K Ctrl+\\', keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash), expected: [] },
		{
			name: 'resolveKeybinding Ctrl+K Ctrl+=',
			keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			expected: [resolved('Ctrl+K Ctrl+Shift+0', 'Control+K Control+Shift+0', null, 'ctrl+k ctrl+shift+0', true, ['ctrl+[KeyK]', 'ctrl+shift+[Digit0]'])]
		},
		{ name: 'resolveKeybinding Ctrl+DownArrow', keybinding: KeyMod.CtrlCmd | KeyCode.DownArrow, expected: [resolved('Ctrl+DownArrow', 'Control+DownArrow', 'Ctrl+Down', 'ctrl+down', true, ['ctrl+[ArrowDown]'])] },
		{ name: 'resolveKeybinding Ctrl+NUMPAD_0', keybinding: KeyMod.CtrlCmd | KeyCode.Numpad0, expected: [resolved('Ctrl+NumPad0', 'Control+NumPad0', null, 'ctrl+numpad0', true, ['ctrl+[Numpad0]'])] },
		{ name: 'resolveKeybinding Ctrl+Home', keybinding: KeyMod.CtrlCmd | KeyCode.Home, expected: [resolved('Ctrl+Home', 'Control+Home', 'Ctrl+Home', 'ctrl+home', true, ['ctrl+[Home]'])] },
		{ name: 'resolveKeyboardEvent Ctrl+[Home]', event: keyboardEvent({ ctrlKey: true }, 'Home'), expected: resolved('Ctrl+Home', 'Control+Home', 'Ctrl+Home', 'ctrl+home', true, ['ctrl+[Home]']) },
		{ name: 'resolveKeyboardEvent Ctrl+[KeyX]', event: keyboardEvent({ ctrlKey: true }, 'KeyX'), expected: resolved('Ctrl+X', 'Control+X', 'Ctrl+X', 'ctrl+x', true, ['ctrl+[KeyX]']) },
		{
			name: 'resolveUserBinding Ctrl+[Comma] Ctrl+/',
			keybinding: new Keybinding([new ScanCodeChord(true, false, false, false, ScanCode.Comma), new KeyCodeChord(true, false, false, false, KeyCode.Slash)]),
			expected: [resolved('Ctrl+, Ctrl+Shift+7', 'Control+, Control+Shift+7', null, 'ctrl+[Comma] ctrl+shift+7', false, ['ctrl+[Comma]', 'ctrl+shift+[Digit7]'])]
		},
		{ name: 'resolveKeyboardEvent Single Modifier ControlLeft+', event: keyboardEvent({ ctrlKey: true }, 'ControlLeft'), expected: resolved('Ctrl', 'Control', null, 'ctrl', true, [null], ['ctrl']) },
		{ name: 'resolveKeyboardEvent Single Modifier ControlRight+', event: keyboardEvent({ ctrlKey: true }, 'ControlRight'), expected: resolved('Ctrl', 'Control', null, 'ctrl', true, [null], ['ctrl']) },
	];

	for (const testCase of cases) {
		test(testCase.name, () => {
			if (testCase.event !== undefined) {
				assertResolveKeyboardEvent(mapper, testCase.event, testCase.expected);
			} else if (typeof testCase.keybinding === 'number') {
				_assertResolveKeybinding(testCase.keybinding, testCase.expected);
			} else {
				assertResolveKeybinding(mapper, testCase.keybinding, testCase.expected);
			}
		});
	}
});

suite('keyboardMapper - LINUX en_us', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(true, 'linux_en_us', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_us.txt');
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

	const cases: ResolveTestCase[] = [
		{ name: 'resolveKeybinding Ctrl+A', keybinding: KeyMod.CtrlCmd | KeyCode.KeyA, expected: [resolved('Ctrl+A', 'Control+A', 'Ctrl+A', 'ctrl+a', true, ['ctrl+[KeyA]'])] },
		{ name: 'resolveKeybinding Ctrl+Z', keybinding: KeyMod.CtrlCmd | KeyCode.KeyZ, expected: [resolved('Ctrl+Z', 'Control+Z', 'Ctrl+Z', 'ctrl+z', true, ['ctrl+[KeyZ]'])] },
		{ name: 'resolveKeyboardEvent Ctrl+[KeyZ]', event: keyboardEvent({ ctrlKey: true }, 'KeyZ'), expected: resolved('Ctrl+Z', 'Control+Z', 'Ctrl+Z', 'ctrl+z', true, ['ctrl+[KeyZ]']) },
		{ name: 'resolveKeybinding Ctrl+]', keybinding: KeyMod.CtrlCmd | KeyCode.BracketRight, expected: [resolved('Ctrl+]', 'Control+]', 'Ctrl+]', 'ctrl+]', true, ['ctrl+[BracketRight]'])] },
		{ name: 'resolveKeyboardEvent Ctrl+[BracketRight]', event: keyboardEvent({ ctrlKey: true }, 'BracketRight'), expected: resolved('Ctrl+]', 'Control+]', 'Ctrl+]', 'ctrl+]', true, ['ctrl+[BracketRight]']) },
		{ name: 'resolveKeybinding Shift+]', keybinding: KeyMod.Shift | KeyCode.BracketRight, expected: [resolved('Shift+]', 'Shift+]', 'Shift+]', 'shift+]', true, ['shift+[BracketRight]'])] },
		{ name: 'resolveKeybinding Ctrl+/', keybinding: KeyMod.CtrlCmd | KeyCode.Slash, expected: [resolved('Ctrl+/', 'Control+/', 'Ctrl+/', 'ctrl+/', true, ['ctrl+[Slash]'])] },
		{ name: 'resolveKeybinding Ctrl+Shift+/', keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash, expected: [resolved('Ctrl+Shift+/', 'Control+Shift+/', 'Ctrl+Shift+/', 'ctrl+shift+/', true, ['ctrl+shift+[Slash]'])] },
		{
			name: 'resolveKeybinding Ctrl+K Ctrl+\\',
			keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Backslash),
			expected: [resolved('Ctrl+K Ctrl+\\', 'Control+K Control+\\', null, 'ctrl+k ctrl+\\', true, ['ctrl+[KeyK]', 'ctrl+[Backslash]'])]
		},
		{
			name: 'resolveKeybinding Ctrl+K Ctrl+=',
			keybinding: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
			expected: [resolved('Ctrl+K Ctrl+=', 'Control+K Control+=', null, 'ctrl+k ctrl+=', true, ['ctrl+[KeyK]', 'ctrl+[Equal]'])]
		},
		{ name: 'resolveKeybinding Ctrl+DownArrow', keybinding: KeyMod.CtrlCmd | KeyCode.DownArrow, expected: [resolved('Ctrl+DownArrow', 'Control+DownArrow', 'Ctrl+Down', 'ctrl+down', true, ['ctrl+[ArrowDown]'])] },
		{ name: 'resolveKeybinding Ctrl+NUMPAD_0', keybinding: KeyMod.CtrlCmd | KeyCode.Numpad0, expected: [resolved('Ctrl+NumPad0', 'Control+NumPad0', null, 'ctrl+numpad0', true, ['ctrl+[Numpad0]'])] },
		{ name: 'resolveKeybinding Ctrl+Home', keybinding: KeyMod.CtrlCmd | KeyCode.Home, expected: [resolved('Ctrl+Home', 'Control+Home', 'Ctrl+Home', 'ctrl+home', true, ['ctrl+[Home]'])] },
		{ name: 'resolveKeyboardEvent Ctrl+[Home]', event: keyboardEvent({ ctrlKey: true }, 'Home'), expected: resolved('Ctrl+Home', 'Control+Home', 'Ctrl+Home', 'ctrl+home', true, ['ctrl+[Home]']) },
		{
			name: 'resolveKeybinding Ctrl+Shift+,',
			keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Comma,
			expected: [
				resolved('Ctrl+Shift+,', 'Control+Shift+,', 'Ctrl+Shift+,', 'ctrl+shift+,', true, ['ctrl+shift+[Comma]']),
				resolved('Ctrl+<', 'Control+<', null, 'ctrl+[IntlBackslash]', false, ['ctrl+[IntlBackslash]']),
			]
		},
		{ name: 'issue #23393: resolveKeybinding Ctrl+Enter', keybinding: KeyMod.CtrlCmd | KeyCode.Enter, expected: [resolved('Ctrl+Enter', 'Control+Enter', 'Ctrl+Enter', 'ctrl+enter', true, ['ctrl+[Enter]'])] },
		{ name: 'issue #23393: resolveKeyboardEvent Ctrl+[NumpadEnter]', event: keyboardEvent({ ctrlKey: true }, 'NumpadEnter'), expected: resolved('Ctrl+Enter', 'Control+Enter', 'Ctrl+Enter', 'ctrl+enter', true, ['ctrl+[Enter]']) },
		{
			name: 'resolveUserBinding Ctrl+[Comma] Ctrl+/',
			keybinding: new Keybinding([new ScanCodeChord(true, false, false, false, ScanCode.Comma), new KeyCodeChord(true, false, false, false, KeyCode.Slash)]),
			expected: [resolved('Ctrl+, Ctrl+/', 'Control+, Control+/', null, 'ctrl+, ctrl+/', true, ['ctrl+[Comma]', 'ctrl+[Slash]'])]
		},
		{
			name: 'resolveUserBinding Ctrl+[Comma]',
			keybinding: new Keybinding([new ScanCodeChord(true, false, false, false, ScanCode.Comma)]),
			expected: [resolved('Ctrl+,', 'Control+,', 'Ctrl+,', 'ctrl+,', true, ['ctrl+[Comma]'])]
		},
		{ name: 'resolveKeyboardEvent Single Modifier ControlLeft+', event: keyboardEvent({ ctrlKey: true }, 'ControlLeft'), expected: resolved('Ctrl', 'Control', null, 'ctrl', true, [null], ['ctrl']) },
		{ name: 'resolveKeyboardEvent Single Modifier ControlRight+', event: keyboardEvent({ ctrlKey: true }, 'ControlRight'), expected: resolved('Ctrl', 'Control', null, 'ctrl', true, [null], ['ctrl']) },
		{ name: 'resolveKeyboardEvent Single Modifier ShiftLeft+', event: keyboardEvent({ shiftKey: true }, 'ShiftLeft'), expected: resolved('Shift', 'Shift', null, 'shift', true, [null], ['shift']) },
		{ name: 'resolveKeyboardEvent Single Modifier ShiftRight+', event: keyboardEvent({ shiftKey: true }, 'ShiftRight'), expected: resolved('Shift', 'Shift', null, 'shift', true, [null], ['shift']) },
		{ name: 'resolveKeyboardEvent Single Modifier AltLeft+', event: keyboardEvent({ altKey: true }, 'AltLeft'), expected: resolved('Alt', 'Alt', null, 'alt', true, [null], ['alt']) },
		{ name: 'resolveKeyboardEvent Single Modifier AltRight+', event: keyboardEvent({ altKey: true }, 'AltRight'), expected: resolved('Alt', 'Alt', null, 'alt', true, [null], ['alt']) },
		{ name: 'resolveKeyboardEvent Single Modifier MetaLeft+', event: keyboardEvent({ metaKey: true }, 'MetaLeft'), expected: resolved('Super', 'Super', null, 'meta', true, [null], ['meta']) },
		{ name: 'resolveKeyboardEvent Single Modifier MetaRight+', event: keyboardEvent({ metaKey: true }, 'MetaRight'), expected: resolved('Super', 'Super', null, 'meta', true, [null], ['meta']) },
		{ name: 'resolveKeyboardEvent Only Modifiers Ctrl+Shift+', event: keyboardEvent({ ctrlKey: true, shiftKey: true }, 'ShiftLeft'), expected: resolved('Ctrl+Shift', 'Control+Shift', null, 'ctrl+shift', true, [null]) },
	];

	for (const testCase of cases) {
		test(testCase.name, () => {
			if (testCase.event !== undefined) {
				assertResolveKeyboardEvent(mapper, testCase.event, testCase.expected);
			} else if (typeof testCase.keybinding === 'number') {
				_assertResolveKeybinding(testCase.keybinding, testCase.expected);
			} else {
				assertResolveKeybinding(mapper, testCase.keybinding, testCase.expected);
			}
		});
	}

	test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', async () => {
		const mapper = await createKeyboardMapper(true, 'linux_en_us', true, OperatingSystem.Linux);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: false,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: true,
				keyCode: -1,
				code: 'KeyZ'
			},
			{
				label: 'Ctrl+Alt+Z',
				ariaLabel: 'Control+Alt+Z',
				electronAccelerator: 'Ctrl+Alt+Z',
				userSettingsLabel: 'ctrl+alt+z',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[KeyZ]'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('issue #23706: Linux UK layout: Ctrl + Apostrophe also toggles terminal', () => {
		const mapper = new MacLinuxKeyboardMapper(false, {
			'Backquote': {
				'value': '`',
				'withShift': '¬',
				'withAltGr': '|',
				'withShiftAltGr': '|'
			}
		}, false, OperatingSystem.Linux);

		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: false,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'Backquote'
			},
			{
				label: 'Ctrl+`',
				ariaLabel: 'Control+`',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+`',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[Backquote]'],
				singleModifierDispatchParts: [null],
			}
		);
	});

	const keyboardEventCases: [name: string, events: [keyCode: KeyCode, code: string, label: string, electronAccelerator: string | null, userSettingsLabel: string, dispatch: string][]][] = [
		['issue #24064: NumLock/NumPad keys stopped working in 1.11 on Linux', [
			[KeyCode.End, 'Numpad1', 'End', 'End', 'end', '[End]'],
			[KeyCode.DownArrow, 'Numpad2', 'DownArrow', 'Down', 'down', '[ArrowDown]'],
			[KeyCode.PageDown, 'Numpad3', 'PageDown', 'PageDown', 'pagedown', '[PageDown]'],
			[KeyCode.LeftArrow, 'Numpad4', 'LeftArrow', 'Left', 'left', '[ArrowLeft]'],
			[KeyCode.Unknown, 'Numpad5', 'NumPad5', null, 'numpad5', '[Numpad5]'],
			[KeyCode.RightArrow, 'Numpad6', 'RightArrow', 'Right', 'right', '[ArrowRight]'],
			[KeyCode.Home, 'Numpad7', 'Home', 'Home', 'home', '[Home]'],
			[KeyCode.UpArrow, 'Numpad8', 'UpArrow', 'Up', 'up', '[ArrowUp]'],
			[KeyCode.PageUp, 'Numpad9', 'PageUp', 'PageUp', 'pageup', '[PageUp]'],
			[KeyCode.Insert, 'Numpad0', 'Insert', 'Insert', 'insert', '[Insert]'],
			[KeyCode.Delete, 'NumpadDecimal', 'Del', 'Delete', 'delete', '[Delete]'],
		]],
		['issue #24107: Delete, Insert, Home, End, PgUp, PgDn, and arrow keys no longer work editor in 1.11', [
			// https://github.com/microsoft/vscode/issues/24107#issuecomment-292318497
			[KeyCode.UpArrow, 'Lang3', 'UpArrow', 'Up', 'up', '[ArrowUp]'],
			[KeyCode.DownArrow, 'NumpadEnter', 'DownArrow', 'Down', 'down', '[ArrowDown]'],
			[KeyCode.LeftArrow, 'Convert', 'LeftArrow', 'Left', 'left', '[ArrowLeft]'],
			[KeyCode.RightArrow, 'NonConvert', 'RightArrow', 'Right', 'right', '[ArrowRight]'],
			[KeyCode.Delete, 'PrintScreen', 'Del', 'Delete', 'delete', '[Delete]'],
			[KeyCode.Insert, 'NumpadDivide', 'Insert', 'Insert', 'insert', '[Insert]'],
			[KeyCode.End, 'Unknown', 'End', 'End', 'end', '[End]'],
			[KeyCode.Home, 'IntlRo', 'Home', 'Home', 'home', '[Home]'],
			[KeyCode.PageDown, 'ControlRight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]'],
			[KeyCode.PageUp, 'Lang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]'],

			// https://github.com/microsoft/vscode/issues/24107#issuecomment-292323924
			[KeyCode.PageDown, 'ControlRight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]'],
			[KeyCode.PageUp, 'Lang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]'],
			[KeyCode.End, '', 'End', 'End', 'end', '[End]'],
			[KeyCode.Home, 'IntlRo', 'Home', 'Home', 'home', '[Home]'],
			[KeyCode.Delete, 'PrintScreen', 'Del', 'Delete', 'delete', '[Delete]'],
			[KeyCode.Insert, 'NumpadDivide', 'Insert', 'Insert', 'insert', '[Insert]'],
			[KeyCode.RightArrow, 'NonConvert', 'RightArrow', 'Right', 'right', '[ArrowRight]'],
			[KeyCode.LeftArrow, 'Convert', 'LeftArrow', 'Left', 'left', '[ArrowLeft]'],
			[KeyCode.DownArrow, 'NumpadEnter', 'DownArrow', 'Down', 'down', '[ArrowDown]'],
			[KeyCode.UpArrow, 'Lang3', 'UpArrow', 'Up', 'up', '[ArrowUp]'],
		]],
	];

	for (const [name, events] of keyboardEventCases) {
		test(name, () => {
			const mapper = new MacLinuxKeyboardMapper(false, {}, false, OperatingSystem.Linux);
			for (const [keyCode, code, label, electronAccelerator, userSettingsLabel, dispatch] of events) {
				assertResolveKeyboardEvent(mapper, keyboardEvent({}, code, keyCode), resolved(label, label, electronAccelerator, userSettingsLabel, true, [dispatch]));
			}
		});
	}
});

suite('keyboardMapper - LINUX ru', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'linux_ru', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_ru.txt');
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Linux)!, expected);
	}

	test('resolveKeybinding Ctrl+S', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyS,
			[{
				label: 'Ctrl+S',
				ariaLabel: 'Control+S',
				electronAccelerator: 'Ctrl+S',
				userSettingsLabel: 'ctrl+s',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['ctrl+[KeyS]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});
});

suite('keyboardMapper - LINUX en_uk', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'linux_en_uk', false, OperatingSystem.Linux);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_uk.txt');
	});

	test('issue #24522: resolveKeyboardEvent Ctrl+Alt+[Minus]', () => {
		assertResolveKeyboardEvent(
			mapper,
			{
				_standardKeyboardEventBrand: true,
				ctrlKey: true,
				shiftKey: false,
				altKey: true,
				metaKey: false,
				altGraphKey: false,
				keyCode: -1,
				code: 'Minus'
			},
			{
				label: 'Ctrl+Alt+-',
				ariaLabel: 'Control+Alt+-',
				electronAccelerator: null,
				userSettingsLabel: 'ctrl+alt+[Minus]',
				isWYSIWYG: false,
				isMultiChord: false,
				dispatchParts: ['ctrl+alt+[Minus]'],
				singleModifierDispatchParts: [null],
			}
		);
	});
});

suite('keyboardMapper - MAC zh_hant', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'mac_zh_hant', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_zh_hant.txt');
	});

	function _assertResolveKeybinding(k: number, expected: IResolvedKeybinding[]): void {
		assertResolveKeybinding(mapper, decodeKeybinding(k, OperatingSystem.Macintosh)!, expected);
	}

	test('issue #28237 resolveKeybinding Cmd+C', () => {
		_assertResolveKeybinding(
			KeyMod.CtrlCmd | KeyCode.KeyC,
			[{
				label: '⌘C',
				ariaLabel: 'Command+C',
				electronAccelerator: 'Cmd+C',
				userSettingsLabel: 'cmd+c',
				isWYSIWYG: true,
				isMultiChord: false,
				dispatchParts: ['meta+[KeyC]'],
				singleModifierDispatchParts: [null],
			}]
		);
	});
});

suite('keyboardMapper - MAC zh_hant2', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	let mapper: MacLinuxKeyboardMapper;

	suiteSetup(async () => {
		const _mapper = await createKeyboardMapper(false, 'mac_zh_hant2', false, OperatingSystem.Macintosh);
		mapper = _mapper;
	});

	test('mapping', () => {
		return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_zh_hant2.txt');
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

	const runtimeKeybinding = createSimpleKeybinding(kb, OS);

	const keybindingLabel = new USLayoutResolvedKeybinding([runtimeKeybinding], OS).getUserSettingsLabel();

	const actualHardwareKeypresses = mapper.keyCodeChordToScanCodeChord(runtimeKeybinding);
	if (actualHardwareKeypresses.length === 0) {
		assert.deepStrictEqual([], expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "[]" -- expected: "${expected}"`);
		return;
	}

	const actual = actualHardwareKeypresses
		.map(k => UserSettingsLabelProvider.toLabel(OS, [k], (keybinding) => ScanCodeUtils.toString(keybinding.scanCode)));
	assert.deepStrictEqual(actual, expected, `simpleKeybindingToHardwareKeypress -- "${keybindingLabel}" -- actual: "${actual}" -- expected: "${expected}"`);
}
