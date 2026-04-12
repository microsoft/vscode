/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { KeyChord, ScanCodeUtils } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, createSimpleKeybinding, ScanCodeChord, Keybinding } from '../../../../../base/common/keybindings.js';
import { UserSettingsLabelProvider } from '../../../../../base/common/keybindingLabels.js';
import { USLayoutResolvedKeybinding } from '../../../../../platform/keybinding/common/usLayoutResolvedKeybinding.js';
import { MacLinuxKeyboardMapper } from '../../common/macLinuxKeyboardMapper.js';
import { assertMapping, assertResolveKeyboardEvent, assertResolveKeybinding, readRawMapping } from './keyboardMapperTestUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const WRITE_FILE_IF_DIFFERENT = false;
async function createKeyboardMapper(isUSStandard, file, mapAltGrToCtrlAlt, OS) {
    const rawMappings = await readRawMapping(file);
    return new MacLinuxKeyboardMapper(isUSStandard, rawMappings, mapAltGrToCtrlAlt, OS);
}
suite('keyboardMapper - MAC de_ch', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(false, 'mac_de_ch', false, 2 /* OperatingSystem.Macintosh */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_de_ch.txt');
    });
    function assertKeybindingTranslation(kb, expected) {
        _assertKeybindingTranslation(mapper, 2 /* OperatingSystem.Macintosh */, kb, expected);
    }
    function _assertResolveKeybinding(k, expected) {
        assertResolveKeybinding(mapper, decodeKeybinding(k, 2 /* OperatingSystem.Macintosh */), expected);
    }
    test('kb => hw', () => {
        // unchanged
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 22 /* KeyCode.Digit1 */, 'cmd+Digit1');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, 'cmd+KeyB');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 32 /* KeyCode.KeyB */, 'shift+cmd+KeyB');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 32 /* KeyCode.KeyB */, 'ctrl+shift+alt+cmd+KeyB');
        // flips Y and Z
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */, 'cmd+KeyY');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 'cmd+KeyZ');
        // Ctrl+/
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */, 'shift+cmd+Digit7');
    });
    test('resolveKeybinding Cmd+A', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, [{
                label: '⌘A',
                ariaLabel: 'Command+A',
                electronAccelerator: 'Cmd+A',
                userSettingsLabel: 'cmd+a',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[KeyA]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Cmd+B', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, [{
                label: '⌘B',
                ariaLabel: 'Command+B',
                electronAccelerator: 'Cmd+B',
                userSettingsLabel: 'cmd+b',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[KeyB]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Cmd+Z', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */, [{
                label: '⌘Z',
                ariaLabel: 'Command+Z',
                electronAccelerator: 'Cmd+Z',
                userSettingsLabel: 'cmd+z',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[KeyY]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Cmd+[KeyY]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'KeyY'
        }, {
            label: '⌘Z',
            ariaLabel: 'Command+Z',
            electronAccelerator: 'Cmd+Z',
            userSettingsLabel: 'cmd+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['meta+[KeyY]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Cmd+]', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */, [{
                label: '⌃⌥⌘6',
                ariaLabel: 'Control+Option+Command+6',
                electronAccelerator: 'Ctrl+Alt+Cmd+6',
                userSettingsLabel: 'ctrl+alt+cmd+6',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+alt+meta+[Digit6]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Cmd+[BracketRight]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'BracketRight'
        }, {
            label: '⌘¨',
            ariaLabel: 'Command+¨',
            electronAccelerator: null,
            userSettingsLabel: 'cmd+[BracketRight]',
            isWYSIWYG: false,
            isMultiChord: false,
            dispatchParts: ['meta+[BracketRight]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Shift+]', () => {
        _assertResolveKeybinding(1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */, [{
                label: '⌃⌥9',
                ariaLabel: 'Control+Option+9',
                electronAccelerator: 'Ctrl+Alt+9',
                userSettingsLabel: 'ctrl+alt+9',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+alt+[Digit9]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Cmd+/', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */, [{
                label: '⇧⌘7',
                ariaLabel: 'Shift+Command+7',
                electronAccelerator: 'Shift+Cmd+7',
                userSettingsLabel: 'shift+cmd+7',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['shift+meta+[Digit7]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Cmd+Shift+/', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 90 /* KeyCode.Slash */, [{
                label: '⇧⌘\'',
                ariaLabel: 'Shift+Command+\'',
                electronAccelerator: null,
                userSettingsLabel: 'shift+cmd+[Minus]',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['shift+meta+[Minus]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Cmd+K Cmd+\\', () => {
        _assertResolveKeybinding(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */), [{
                label: '⌘K ⌃⇧⌥⌘7',
                ariaLabel: 'Command+K Control+Shift+Option+Command+7',
                electronAccelerator: null,
                userSettingsLabel: 'cmd+k ctrl+shift+alt+cmd+7',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['meta+[KeyK]', 'ctrl+shift+alt+meta+[Digit7]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeybinding Cmd+K Cmd+=', () => {
        _assertResolveKeybinding(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */), [{
                label: '⌘K ⇧⌘0',
                ariaLabel: 'Command+K Shift+Command+0',
                electronAccelerator: null,
                userSettingsLabel: 'cmd+k shift+cmd+0',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['meta+[KeyK]', 'shift+meta+[Digit0]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeybinding Cmd+DownArrow', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */, [{
                label: '⌘↓',
                ariaLabel: 'Command+DownArrow',
                electronAccelerator: 'Cmd+Down',
                userSettingsLabel: 'cmd+down',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[ArrowDown]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Cmd+NUMPAD_0', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 98 /* KeyCode.Numpad0 */, [{
                label: '⌘NumPad0',
                ariaLabel: 'Command+NumPad0',
                electronAccelerator: null,
                userSettingsLabel: 'cmd+numpad0',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[Numpad0]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Home', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 14 /* KeyCode.Home */, [{
                label: '⌘Home',
                ariaLabel: 'Command+Home',
                electronAccelerator: 'Cmd+Home',
                userSettingsLabel: 'cmd+home',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[Home]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+[Home]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'Home'
        }, {
            label: '⌘Home',
            ariaLabel: 'Command+Home',
            electronAccelerator: 'Cmd+Home',
            userSettingsLabel: 'cmd+home',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['meta+[Home]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(false, false, false, true, 60 /* ScanCode.Comma */),
            new KeyCodeChord(false, false, false, true, 90 /* KeyCode.Slash */),
        ]), [{
                label: '⌘, ⇧⌘7',
                ariaLabel: 'Command+, Shift+Command+7',
                electronAccelerator: null,
                userSettingsLabel: 'cmd+[Comma] shift+cmd+7',
                isWYSIWYG: false,
                isMultiChord: true,
                dispatchParts: ['meta+[Comma]', 'shift+meta+[Digit7]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeyboardEvent Single Modifier MetaLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'MetaLeft'
        }, {
            label: '⌘',
            ariaLabel: 'Command',
            electronAccelerator: null,
            userSettingsLabel: 'cmd',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['meta'],
        });
    });
    test('resolveKeyboardEvent Single Modifier MetaRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'MetaRight'
        }, {
            label: '⌘',
            ariaLabel: 'Command',
            electronAccelerator: null,
            userSettingsLabel: 'cmd',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['meta'],
        });
    });
});
suite('keyboardMapper - MAC en_us', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(true, 'mac_en_us', false, 2 /* OperatingSystem.Macintosh */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_en_us.txt');
    });
    test('resolveUserBinding Cmd+[Comma] Cmd+/', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(false, false, false, true, 60 /* ScanCode.Comma */),
            new KeyCodeChord(false, false, false, true, 90 /* KeyCode.Slash */),
        ]), [{
                label: '⌘, ⌘/',
                ariaLabel: 'Command+, Command+/',
                electronAccelerator: null,
                userSettingsLabel: 'cmd+, cmd+/',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['meta+[Comma]', 'meta+[Slash]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeyboardEvent Single Modifier MetaLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'MetaLeft'
        }, {
            label: '⌘',
            ariaLabel: 'Command',
            electronAccelerator: null,
            userSettingsLabel: 'cmd',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['meta'],
        });
    });
    test('resolveKeyboardEvent Single Modifier MetaRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'MetaRight'
        }, {
            label: '⌘',
            ariaLabel: 'Command',
            electronAccelerator: null,
            userSettingsLabel: 'cmd',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['meta'],
        });
    });
    test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', async () => {
        const mapper = await createKeyboardMapper(true, 'mac_en_us', true, 2 /* OperatingSystem.Macintosh */);
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: true,
            keyCode: -1,
            code: 'KeyZ'
        }, {
            label: '⌃⌥Z',
            ariaLabel: 'Control+Option+Z',
            electronAccelerator: 'Ctrl+Alt+Z',
            userSettingsLabel: 'ctrl+alt+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+alt+[KeyZ]'],
            singleModifierDispatchParts: [null],
        });
    });
});
suite('keyboardMapper - LINUX de_ch', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(false, 'linux_de_ch', false, 3 /* OperatingSystem.Linux */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_de_ch.txt');
    });
    function assertKeybindingTranslation(kb, expected) {
        _assertKeybindingTranslation(mapper, 3 /* OperatingSystem.Linux */, kb, expected);
    }
    function _assertResolveKeybinding(k, expected) {
        assertResolveKeybinding(mapper, decodeKeybinding(k, 3 /* OperatingSystem.Linux */), expected);
    }
    test('kb => hw', () => {
        // unchanged
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 22 /* KeyCode.Digit1 */, 'ctrl+Digit1');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, 'ctrl+KeyB');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 32 /* KeyCode.KeyB */, 'ctrl+shift+KeyB');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 32 /* KeyCode.KeyB */, 'ctrl+shift+alt+meta+KeyB');
        // flips Y and Z
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */, 'ctrl+KeyY');
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 'ctrl+KeyZ');
        // Ctrl+/
        assertKeybindingTranslation(2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */, 'ctrl+shift+Digit7');
    });
    test('resolveKeybinding Ctrl+A', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, [{
                label: 'Ctrl+A',
                ariaLabel: 'Control+A',
                electronAccelerator: 'Ctrl+A',
                userSettingsLabel: 'ctrl+a',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[KeyA]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Z', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */, [{
                label: 'Ctrl+Z',
                ariaLabel: 'Control+Z',
                electronAccelerator: 'Ctrl+Z',
                userSettingsLabel: 'ctrl+z',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[KeyY]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+[KeyY]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'KeyY'
        }, {
            label: 'Ctrl+Z',
            ariaLabel: 'Control+Z',
            electronAccelerator: 'Ctrl+Z',
            userSettingsLabel: 'ctrl+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[KeyY]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Ctrl+]', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */, []);
    });
    test('resolveKeyboardEvent Ctrl+[BracketRight]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'BracketRight'
        }, {
            label: 'Ctrl+¨',
            ariaLabel: 'Control+¨',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl+[BracketRight]',
            isWYSIWYG: false,
            isMultiChord: false,
            dispatchParts: ['ctrl+[BracketRight]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Shift+]', () => {
        _assertResolveKeybinding(1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */, [{
                label: 'Ctrl+Alt+0',
                ariaLabel: 'Control+Alt+0',
                electronAccelerator: 'Ctrl+Alt+0',
                userSettingsLabel: 'ctrl+alt+0',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+alt+[Digit0]'],
                singleModifierDispatchParts: [null],
            }, {
                label: 'Ctrl+Alt+$',
                ariaLabel: 'Control+Alt+$',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+alt+[Backslash]',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['ctrl+alt+[Backslash]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+/', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */, [{
                label: 'Ctrl+Shift+7',
                ariaLabel: 'Control+Shift+7',
                electronAccelerator: 'Ctrl+Shift+7',
                userSettingsLabel: 'ctrl+shift+7',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+shift+[Digit7]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Shift+/', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 90 /* KeyCode.Slash */, [{
                label: 'Ctrl+Shift+\'',
                ariaLabel: 'Control+Shift+\'',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+shift+[Minus]',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['ctrl+shift+[Minus]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
        _assertResolveKeybinding(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */), []);
    });
    test('resolveKeybinding Ctrl+K Ctrl+=', () => {
        _assertResolveKeybinding(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */), [{
                label: 'Ctrl+K Ctrl+Shift+0',
                ariaLabel: 'Control+K Control+Shift+0',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+k ctrl+shift+0',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['ctrl+[KeyK]', 'ctrl+shift+[Digit0]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeybinding Ctrl+DownArrow', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */, [{
                label: 'Ctrl+DownArrow',
                ariaLabel: 'Control+DownArrow',
                electronAccelerator: 'Ctrl+Down',
                userSettingsLabel: 'ctrl+down',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[ArrowDown]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+NUMPAD_0', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 98 /* KeyCode.Numpad0 */, [{
                label: 'Ctrl+NumPad0',
                ariaLabel: 'Control+NumPad0',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+numpad0',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Numpad0]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Home', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 14 /* KeyCode.Home */, [{
                label: 'Ctrl+Home',
                ariaLabel: 'Control+Home',
                electronAccelerator: 'Ctrl+Home',
                userSettingsLabel: 'ctrl+home',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Home]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+[Home]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'Home'
        }, {
            label: 'Ctrl+Home',
            ariaLabel: 'Control+Home',
            electronAccelerator: 'Ctrl+Home',
            userSettingsLabel: 'ctrl+home',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[Home]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeyboardEvent Ctrl+[KeyX]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'KeyX'
        }, {
            label: 'Ctrl+X',
            ariaLabel: 'Control+X',
            electronAccelerator: 'Ctrl+X',
            userSettingsLabel: 'ctrl+x',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[KeyX]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(true, false, false, false, 60 /* ScanCode.Comma */),
            new KeyCodeChord(true, false, false, false, 90 /* KeyCode.Slash */),
        ]), [{
                label: 'Ctrl+, Ctrl+Shift+7',
                ariaLabel: 'Control+, Control+Shift+7',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+[Comma] ctrl+shift+7',
                isWYSIWYG: false,
                isMultiChord: true,
                dispatchParts: ['ctrl+[Comma]', 'ctrl+shift+[Digit7]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeyboardEvent Single Modifier ControlLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ControlLeft'
        }, {
            label: 'Ctrl',
            ariaLabel: 'Control',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['ctrl'],
        });
    });
    test('resolveKeyboardEvent Single Modifier ControlRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ControlRight'
        }, {
            label: 'Ctrl',
            ariaLabel: 'Control',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['ctrl'],
        });
    });
});
suite('keyboardMapper - LINUX en_us', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(true, 'linux_en_us', false, 3 /* OperatingSystem.Linux */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_us.txt');
    });
    function _assertResolveKeybinding(k, expected) {
        assertResolveKeybinding(mapper, decodeKeybinding(k, 3 /* OperatingSystem.Linux */), expected);
    }
    test('resolveKeybinding Ctrl+A', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, [{
                label: 'Ctrl+A',
                ariaLabel: 'Control+A',
                electronAccelerator: 'Ctrl+A',
                userSettingsLabel: 'ctrl+a',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[KeyA]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Z', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */, [{
                label: 'Ctrl+Z',
                ariaLabel: 'Control+Z',
                electronAccelerator: 'Ctrl+Z',
                userSettingsLabel: 'ctrl+z',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[KeyZ]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+[KeyZ]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'KeyZ'
        }, {
            label: 'Ctrl+Z',
            ariaLabel: 'Control+Z',
            electronAccelerator: 'Ctrl+Z',
            userSettingsLabel: 'ctrl+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[KeyZ]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Ctrl+]', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */, [{
                label: 'Ctrl+]',
                ariaLabel: 'Control+]',
                electronAccelerator: 'Ctrl+]',
                userSettingsLabel: 'ctrl+]',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[BracketRight]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+[BracketRight]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'BracketRight'
        }, {
            label: 'Ctrl+]',
            ariaLabel: 'Control+]',
            electronAccelerator: 'Ctrl+]',
            userSettingsLabel: 'ctrl+]',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[BracketRight]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Shift+]', () => {
        _assertResolveKeybinding(1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */, [{
                label: 'Shift+]',
                ariaLabel: 'Shift+]',
                electronAccelerator: 'Shift+]',
                userSettingsLabel: 'shift+]',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['shift+[BracketRight]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+/', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */, [{
                label: 'Ctrl+/',
                ariaLabel: 'Control+/',
                electronAccelerator: 'Ctrl+/',
                userSettingsLabel: 'ctrl+/',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Slash]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Shift+/', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 90 /* KeyCode.Slash */, [{
                label: 'Ctrl+Shift+/',
                ariaLabel: 'Control+Shift+/',
                electronAccelerator: 'Ctrl+Shift+/',
                userSettingsLabel: 'ctrl+shift+/',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+shift+[Slash]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
        _assertResolveKeybinding(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */), [{
                label: 'Ctrl+K Ctrl+\\',
                ariaLabel: 'Control+K Control+\\',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+k ctrl+\\',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['ctrl+[KeyK]', 'ctrl+[Backslash]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeybinding Ctrl+K Ctrl+=', () => {
        _assertResolveKeybinding(KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */), [{
                label: 'Ctrl+K Ctrl+=',
                ariaLabel: 'Control+K Control+=',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+k ctrl+=',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['ctrl+[KeyK]', 'ctrl+[Equal]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeybinding Ctrl+DownArrow', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */, [{
                label: 'Ctrl+DownArrow',
                ariaLabel: 'Control+DownArrow',
                electronAccelerator: 'Ctrl+Down',
                userSettingsLabel: 'ctrl+down',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[ArrowDown]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+NUMPAD_0', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 98 /* KeyCode.Numpad0 */, [{
                label: 'Ctrl+NumPad0',
                ariaLabel: 'Control+NumPad0',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+numpad0',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Numpad0]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Home', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 14 /* KeyCode.Home */, [{
                label: 'Ctrl+Home',
                ariaLabel: 'Control+Home',
                electronAccelerator: 'Ctrl+Home',
                userSettingsLabel: 'ctrl+home',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Home]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+[Home]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'Home'
        }, {
            label: 'Ctrl+Home',
            ariaLabel: 'Control+Home',
            electronAccelerator: 'Ctrl+Home',
            userSettingsLabel: 'ctrl+home',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[Home]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Ctrl+Shift+,', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 87 /* KeyCode.Comma */, [{
                label: 'Ctrl+Shift+,',
                ariaLabel: 'Control+Shift+,',
                electronAccelerator: 'Ctrl+Shift+,',
                userSettingsLabel: 'ctrl+shift+,',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+shift+[Comma]'],
                singleModifierDispatchParts: [null],
            }, {
                label: 'Ctrl+<',
                ariaLabel: 'Control+<',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+[IntlBackslash]',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['ctrl+[IntlBackslash]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('issue #23393: resolveKeybinding Ctrl+Enter', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */, [{
                label: 'Ctrl+Enter',
                ariaLabel: 'Control+Enter',
                electronAccelerator: 'Ctrl+Enter',
                userSettingsLabel: 'ctrl+enter',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Enter]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('issue #23393: resolveKeyboardEvent Ctrl+[NumpadEnter]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'NumpadEnter'
        }, {
            label: 'Ctrl+Enter',
            ariaLabel: 'Control+Enter',
            electronAccelerator: 'Ctrl+Enter',
            userSettingsLabel: 'ctrl+enter',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[Enter]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(true, false, false, false, 60 /* ScanCode.Comma */),
            new KeyCodeChord(true, false, false, false, 90 /* KeyCode.Slash */),
        ]), [{
                label: 'Ctrl+, Ctrl+/',
                ariaLabel: 'Control+, Control+/',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+, ctrl+/',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['ctrl+[Comma]', 'ctrl+[Slash]'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveUserBinding Ctrl+[Comma]', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(true, false, false, false, 60 /* ScanCode.Comma */)
        ]), [{
                label: 'Ctrl+,',
                ariaLabel: 'Control+,',
                electronAccelerator: 'Ctrl+,',
                userSettingsLabel: 'ctrl+,',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[Comma]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Single Modifier ControlLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ControlLeft'
        }, {
            label: 'Ctrl',
            ariaLabel: 'Control',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['ctrl'],
        });
    });
    test('resolveKeyboardEvent Single Modifier ControlRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ControlRight'
        }, {
            label: 'Ctrl',
            ariaLabel: 'Control',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['ctrl'],
        });
    });
    test('resolveKeyboardEvent Single Modifier ShiftLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: true,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ShiftLeft'
        }, {
            label: 'Shift',
            ariaLabel: 'Shift',
            electronAccelerator: null,
            userSettingsLabel: 'shift',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['shift'],
        });
    });
    test('resolveKeyboardEvent Single Modifier ShiftRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: true,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ShiftRight'
        }, {
            label: 'Shift',
            ariaLabel: 'Shift',
            electronAccelerator: null,
            userSettingsLabel: 'shift',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['shift'],
        });
    });
    test('resolveKeyboardEvent Single Modifier AltLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: true,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'AltLeft'
        }, {
            label: 'Alt',
            ariaLabel: 'Alt',
            electronAccelerator: null,
            userSettingsLabel: 'alt',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['alt'],
        });
    });
    test('resolveKeyboardEvent Single Modifier AltRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: true,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'AltRight'
        }, {
            label: 'Alt',
            ariaLabel: 'Alt',
            electronAccelerator: null,
            userSettingsLabel: 'alt',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['alt'],
        });
    });
    test('resolveKeyboardEvent Single Modifier MetaLeft+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'MetaLeft'
        }, {
            label: 'Super',
            ariaLabel: 'Super',
            electronAccelerator: null,
            userSettingsLabel: 'meta',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['meta'],
        });
    });
    test('resolveKeyboardEvent Single Modifier MetaRight+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: -1,
            code: 'MetaRight'
        }, {
            label: 'Super',
            ariaLabel: 'Super',
            electronAccelerator: null,
            userSettingsLabel: 'meta',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: ['meta'],
        });
    });
    test('resolveKeyboardEvent Only Modifiers Ctrl+Shift+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: true,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'ShiftLeft'
        }, {
            label: 'Ctrl+Shift',
            ariaLabel: 'Control+Shift',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl+shift',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: [null],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeyboardEvent mapAltGrToCtrlAlt AltGr+Z', async () => {
        const mapper = await createKeyboardMapper(true, 'linux_en_us', true, 3 /* OperatingSystem.Linux */);
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: true,
            keyCode: -1,
            code: 'KeyZ'
        }, {
            label: 'Ctrl+Alt+Z',
            ariaLabel: 'Control+Alt+Z',
            electronAccelerator: 'Ctrl+Alt+Z',
            userSettingsLabel: 'ctrl+alt+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+alt+[KeyZ]'],
            singleModifierDispatchParts: [null],
        });
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
        }, false, 3 /* OperatingSystem.Linux */);
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'Backquote'
        }, {
            label: 'Ctrl+`',
            ariaLabel: 'Control+`',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl+`',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+[Backquote]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('issue #24064: NumLock/NumPad keys stopped working in 1.11 on Linux', () => {
        const mapper = new MacLinuxKeyboardMapper(false, {}, false, 3 /* OperatingSystem.Linux */);
        function assertNumpadKeyboardEvent(keyCode, code, label, electronAccelerator, userSettingsLabel, dispatch) {
            assertResolveKeyboardEvent(mapper, {
                _standardKeyboardEventBrand: true,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
                altGraphKey: false,
                keyCode: keyCode,
                code: code
            }, {
                label: label,
                ariaLabel: label,
                electronAccelerator: electronAccelerator,
                userSettingsLabel: userSettingsLabel,
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: [dispatch],
                singleModifierDispatchParts: [null],
            });
        }
        assertNumpadKeyboardEvent(13 /* KeyCode.End */, 'Numpad1', 'End', 'End', 'end', '[End]');
        assertNumpadKeyboardEvent(18 /* KeyCode.DownArrow */, 'Numpad2', 'DownArrow', 'Down', 'down', '[ArrowDown]');
        assertNumpadKeyboardEvent(12 /* KeyCode.PageDown */, 'Numpad3', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
        assertNumpadKeyboardEvent(15 /* KeyCode.LeftArrow */, 'Numpad4', 'LeftArrow', 'Left', 'left', '[ArrowLeft]');
        assertNumpadKeyboardEvent(0 /* KeyCode.Unknown */, 'Numpad5', 'NumPad5', null, 'numpad5', '[Numpad5]');
        assertNumpadKeyboardEvent(17 /* KeyCode.RightArrow */, 'Numpad6', 'RightArrow', 'Right', 'right', '[ArrowRight]');
        assertNumpadKeyboardEvent(14 /* KeyCode.Home */, 'Numpad7', 'Home', 'Home', 'home', '[Home]');
        assertNumpadKeyboardEvent(16 /* KeyCode.UpArrow */, 'Numpad8', 'UpArrow', 'Up', 'up', '[ArrowUp]');
        assertNumpadKeyboardEvent(11 /* KeyCode.PageUp */, 'Numpad9', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
        assertNumpadKeyboardEvent(19 /* KeyCode.Insert */, 'Numpad0', 'Insert', 'Insert', 'insert', '[Insert]');
        assertNumpadKeyboardEvent(20 /* KeyCode.Delete */, 'NumpadDecimal', 'Del', 'Delete', 'delete', '[Delete]');
    });
    test('issue #24107: Delete, Insert, Home, End, PgUp, PgDn, and arrow keys no longer work editor in 1.11', () => {
        const mapper = new MacLinuxKeyboardMapper(false, {}, false, 3 /* OperatingSystem.Linux */);
        function assertKeyboardEvent(keyCode, code, label, electronAccelerator, userSettingsLabel, dispatch) {
            assertResolveKeyboardEvent(mapper, {
                _standardKeyboardEventBrand: true,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
                altGraphKey: false,
                keyCode: keyCode,
                code: code
            }, {
                label: label,
                ariaLabel: label,
                electronAccelerator: electronAccelerator,
                userSettingsLabel: userSettingsLabel,
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: [dispatch],
                singleModifierDispatchParts: [null],
            });
        }
        // https://github.com/microsoft/vscode/issues/24107#issuecomment-292318497
        assertKeyboardEvent(16 /* KeyCode.UpArrow */, 'Lang3', 'UpArrow', 'Up', 'up', '[ArrowUp]');
        assertKeyboardEvent(18 /* KeyCode.DownArrow */, 'NumpadEnter', 'DownArrow', 'Down', 'down', '[ArrowDown]');
        assertKeyboardEvent(15 /* KeyCode.LeftArrow */, 'Convert', 'LeftArrow', 'Left', 'left', '[ArrowLeft]');
        assertKeyboardEvent(17 /* KeyCode.RightArrow */, 'NonConvert', 'RightArrow', 'Right', 'right', '[ArrowRight]');
        assertKeyboardEvent(20 /* KeyCode.Delete */, 'PrintScreen', 'Del', 'Delete', 'delete', '[Delete]');
        assertKeyboardEvent(19 /* KeyCode.Insert */, 'NumpadDivide', 'Insert', 'Insert', 'insert', '[Insert]');
        assertKeyboardEvent(13 /* KeyCode.End */, 'Unknown', 'End', 'End', 'end', '[End]');
        assertKeyboardEvent(14 /* KeyCode.Home */, 'IntlRo', 'Home', 'Home', 'home', '[Home]');
        assertKeyboardEvent(12 /* KeyCode.PageDown */, 'ControlRight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
        assertKeyboardEvent(11 /* KeyCode.PageUp */, 'Lang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
        // https://github.com/microsoft/vscode/issues/24107#issuecomment-292323924
        assertKeyboardEvent(12 /* KeyCode.PageDown */, 'ControlRight', 'PageDown', 'PageDown', 'pagedown', '[PageDown]');
        assertKeyboardEvent(11 /* KeyCode.PageUp */, 'Lang4', 'PageUp', 'PageUp', 'pageup', '[PageUp]');
        assertKeyboardEvent(13 /* KeyCode.End */, '', 'End', 'End', 'end', '[End]');
        assertKeyboardEvent(14 /* KeyCode.Home */, 'IntlRo', 'Home', 'Home', 'home', '[Home]');
        assertKeyboardEvent(20 /* KeyCode.Delete */, 'PrintScreen', 'Del', 'Delete', 'delete', '[Delete]');
        assertKeyboardEvent(19 /* KeyCode.Insert */, 'NumpadDivide', 'Insert', 'Insert', 'insert', '[Insert]');
        assertKeyboardEvent(17 /* KeyCode.RightArrow */, 'NonConvert', 'RightArrow', 'Right', 'right', '[ArrowRight]');
        assertKeyboardEvent(15 /* KeyCode.LeftArrow */, 'Convert', 'LeftArrow', 'Left', 'left', '[ArrowLeft]');
        assertKeyboardEvent(18 /* KeyCode.DownArrow */, 'NumpadEnter', 'DownArrow', 'Down', 'down', '[ArrowDown]');
        assertKeyboardEvent(16 /* KeyCode.UpArrow */, 'Lang3', 'UpArrow', 'Up', 'up', '[ArrowUp]');
    });
});
suite('keyboardMapper - LINUX ru', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(false, 'linux_ru', false, 3 /* OperatingSystem.Linux */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_ru.txt');
    });
    function _assertResolveKeybinding(k, expected) {
        assertResolveKeybinding(mapper, decodeKeybinding(k, 3 /* OperatingSystem.Linux */), expected);
    }
    test('resolveKeybinding Ctrl+S', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 49 /* KeyCode.KeyS */, [{
                label: 'Ctrl+S',
                ariaLabel: 'Control+S',
                electronAccelerator: 'Ctrl+S',
                userSettingsLabel: 'ctrl+s',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+[KeyS]'],
                singleModifierDispatchParts: [null],
            }]);
    });
});
suite('keyboardMapper - LINUX en_uk', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(false, 'linux_en_uk', false, 3 /* OperatingSystem.Linux */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'linux_en_uk.txt');
    });
    test('issue #24522: resolveKeyboardEvent Ctrl+Alt+[Minus]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: true,
            metaKey: false,
            altGraphKey: false,
            keyCode: -1,
            code: 'Minus'
        }, {
            label: 'Ctrl+Alt+-',
            ariaLabel: 'Control+Alt+-',
            electronAccelerator: null,
            userSettingsLabel: 'ctrl+alt+[Minus]',
            isWYSIWYG: false,
            isMultiChord: false,
            dispatchParts: ['ctrl+alt+[Minus]'],
            singleModifierDispatchParts: [null],
        });
    });
});
suite('keyboardMapper - MAC zh_hant', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(false, 'mac_zh_hant', false, 2 /* OperatingSystem.Macintosh */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_zh_hant.txt');
    });
    function _assertResolveKeybinding(k, expected) {
        assertResolveKeybinding(mapper, decodeKeybinding(k, 2 /* OperatingSystem.Macintosh */), expected);
    }
    test('issue #28237 resolveKeybinding Cmd+C', () => {
        _assertResolveKeybinding(2048 /* KeyMod.CtrlCmd */ | 33 /* KeyCode.KeyC */, [{
                label: '⌘C',
                ariaLabel: 'Command+C',
                electronAccelerator: 'Cmd+C',
                userSettingsLabel: 'cmd+c',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['meta+[KeyC]'],
                singleModifierDispatchParts: [null],
            }]);
    });
});
suite('keyboardMapper - MAC zh_hant2', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        const _mapper = await createKeyboardMapper(false, 'mac_zh_hant2', false, 2 /* OperatingSystem.Macintosh */);
        mapper = _mapper;
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'mac_zh_hant2.txt');
    });
});
function _assertKeybindingTranslation(mapper, OS, kb, _expected) {
    let expected;
    if (typeof _expected === 'string') {
        expected = [_expected];
    }
    else if (Array.isArray(_expected)) {
        expected = _expected;
    }
    else {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFjTGludXhLZXlib2FyZE1hcHBlci50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvdGVzdC9ub2RlL21hY0xpbnV4S2V5Ym9hcmRNYXBwZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLFFBQVEsRUFBNkIsYUFBYSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDNUcsT0FBTyxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxzQkFBc0IsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDOUksT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFM0YsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDckgsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDaEYsT0FBTyxFQUF1QixhQUFhLEVBQUUsMEJBQTBCLEVBQUUsdUJBQXVCLEVBQUUsY0FBYyxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFFdkosT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFFbkcsTUFBTSx1QkFBdUIsR0FBRyxLQUFLLENBQUM7QUFFdEMsS0FBSyxVQUFVLG9CQUFvQixDQUFDLFlBQXFCLEVBQUUsSUFBWSxFQUFFLGlCQUEwQixFQUFFLEVBQW1CO0lBQ3ZILE1BQU0sV0FBVyxHQUFHLE1BQU0sY0FBYyxDQUEyQixJQUFJLENBQUMsQ0FBQztJQUN6RSxPQUFPLElBQUksc0JBQXNCLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxpQkFBaUIsRUFBRSxFQUFFLENBQUMsQ0FBQztBQUNyRixDQUFD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