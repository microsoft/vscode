/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyChord } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, ScanCodeChord, Keybinding } from '../../../../../base/common/keybindings.js';
import { WindowsKeyboardMapper } from '../../common/windowsKeyboardMapper.js';
import { assertMapping, assertResolveKeyboardEvent, assertResolveKeybinding, readRawMapping } from './keyboardMapperTestUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
const WRITE_FILE_IF_DIFFERENT = false;
async function createKeyboardMapper(isUSStandard, file, mapAltGrToCtrlAlt) {
    const rawMappings = await readRawMapping(file);
    return new WindowsKeyboardMapper(isUSStandard, rawMappings, mapAltGrToCtrlAlt);
}
function _assertResolveKeybinding(mapper, k, expected) {
    const keyBinding = decodeKeybinding(k, 1 /* OperatingSystem.Windows */);
    assertResolveKeybinding(mapper, keyBinding, expected);
}
suite('keyboardMapper - WINDOWS de_ch', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        mapper = await createKeyboardMapper(false, 'win_de_ch', false);
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'win_de_ch.txt');
    });
    test('resolveKeybinding Ctrl+A', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, [{
                label: 'Ctrl+A',
                ariaLabel: 'Control+A',
                electronAccelerator: 'Ctrl+A',
                userSettingsLabel: 'ctrl+a',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+A'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Z', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 56 /* KeyCode.KeyZ */, [{
                label: 'Ctrl+Z',
                ariaLabel: 'Control+Z',
                electronAccelerator: 'Ctrl+Z',
                userSettingsLabel: 'ctrl+z',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+Z'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+Z', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 56 /* KeyCode.KeyZ */,
            code: null
        }, {
            label: 'Ctrl+Z',
            ariaLabel: 'Control+Z',
            electronAccelerator: 'Ctrl+Z',
            userSettingsLabel: 'ctrl+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+Z'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Ctrl+]', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 94 /* KeyCode.BracketRight */, [{
                label: 'Ctrl+^',
                ariaLabel: 'Control+^',
                electronAccelerator: 'Ctrl+]',
                userSettingsLabel: 'ctrl+oem_6',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['ctrl+]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 94 /* KeyCode.BracketRight */,
            code: null
        }, {
            label: 'Ctrl+^',
            ariaLabel: 'Control+^',
            electronAccelerator: 'Ctrl+]',
            userSettingsLabel: 'ctrl+oem_6',
            isWYSIWYG: false,
            isMultiChord: false,
            dispatchParts: ['ctrl+]'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeybinding Shift+]', () => {
        _assertResolveKeybinding(mapper, 1024 /* KeyMod.Shift */ | 94 /* KeyCode.BracketRight */, [{
                label: 'Shift+^',
                ariaLabel: 'Shift+^',
                electronAccelerator: 'Shift+]',
                userSettingsLabel: 'shift+oem_6',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['shift+]'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+/', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 90 /* KeyCode.Slash */, [{
                label: 'Ctrl+§',
                ariaLabel: 'Control+§',
                electronAccelerator: 'Ctrl+/',
                userSettingsLabel: 'ctrl+oem_2',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['ctrl+/'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Shift+/', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 90 /* KeyCode.Slash */, [{
                label: 'Ctrl+Shift+§',
                ariaLabel: 'Control+Shift+§',
                electronAccelerator: 'Ctrl+Shift+/',
                userSettingsLabel: 'ctrl+shift+oem_2',
                isWYSIWYG: false,
                isMultiChord: false,
                dispatchParts: ['ctrl+shift+/'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
        _assertResolveKeybinding(mapper, KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */), [{
                label: 'Ctrl+K Ctrl+ä',
                ariaLabel: 'Control+K Control+ä',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+k ctrl+oem_5',
                isWYSIWYG: false,
                isMultiChord: true,
                dispatchParts: ['ctrl+K', 'ctrl+\\'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeybinding Ctrl+K Ctrl+=', () => {
        _assertResolveKeybinding(mapper, KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 86 /* KeyCode.Equal */), []);
    });
    test('resolveKeybinding Ctrl+DownArrow', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */, [{
                label: 'Ctrl+DownArrow',
                ariaLabel: 'Control+DownArrow',
                electronAccelerator: 'Ctrl+Down',
                userSettingsLabel: 'ctrl+down',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+DownArrow'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+NUMPAD_0', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 98 /* KeyCode.Numpad0 */, [{
                label: 'Ctrl+NumPad0',
                ariaLabel: 'Control+NumPad0',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+numpad0',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+NumPad0'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeybinding Ctrl+Home', () => {
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 14 /* KeyCode.Home */, [{
                label: 'Ctrl+Home',
                ariaLabel: 'Control+Home',
                electronAccelerator: 'Ctrl+Home',
                userSettingsLabel: 'ctrl+home',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+Home'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Ctrl+Home', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 14 /* KeyCode.Home */,
            code: null
        }, {
            label: 'Ctrl+Home',
            ariaLabel: 'Control+Home',
            electronAccelerator: 'Ctrl+Home',
            userSettingsLabel: 'ctrl+home',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+Home'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveUserBinding Ctrl+[Comma] Ctrl+/', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(true, false, false, false, 60 /* ScanCode.Comma */),
            new KeyCodeChord(true, false, false, false, 90 /* KeyCode.Slash */),
        ]), [{
                label: 'Ctrl+, Ctrl+§',
                ariaLabel: 'Control+, Control+§',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+oem_comma ctrl+oem_2',
                isWYSIWYG: false,
                isMultiChord: true,
                dispatchParts: ['ctrl+,', 'ctrl+/'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveKeyboardEvent Single Modifier Ctrl+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 5 /* KeyCode.Ctrl */,
            code: null
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
suite('keyboardMapper - WINDOWS en_us', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        mapper = await createKeyboardMapper(true, 'win_en_us', false);
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'win_en_us.txt');
    });
    test('resolveKeybinding Ctrl+K Ctrl+\\', () => {
        _assertResolveKeybinding(mapper, KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 93 /* KeyCode.Backslash */), [{
                label: 'Ctrl+K Ctrl+\\',
                ariaLabel: 'Control+K Control+\\',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+k ctrl+\\',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['ctrl+K', 'ctrl+\\'],
                singleModifierDispatchParts: [null, null],
            }]);
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
                dispatchParts: ['ctrl+,', 'ctrl+/'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
    test('resolveUserBinding Ctrl+[Comma]', () => {
        assertResolveKeybinding(mapper, new Keybinding([
            new ScanCodeChord(true, false, false, false, 60 /* ScanCode.Comma */),
        ]), [{
                label: 'Ctrl+,',
                ariaLabel: 'Control+,',
                electronAccelerator: 'Ctrl+,',
                userSettingsLabel: 'ctrl+,',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+,'],
                singleModifierDispatchParts: [null],
            }]);
    });
    test('resolveKeyboardEvent Single Modifier Ctrl+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 5 /* KeyCode.Ctrl */,
            code: null
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
    test('resolveKeyboardEvent Single Modifier Shift+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: true,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 4 /* KeyCode.Shift */,
            code: null
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
    test('resolveKeyboardEvent Single Modifier Alt+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: true,
            metaKey: false,
            altGraphKey: false,
            keyCode: 6 /* KeyCode.Alt */,
            code: null
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
    test('resolveKeyboardEvent Single Modifier Meta+', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: true,
            altGraphKey: false,
            keyCode: 57 /* KeyCode.Meta */,
            code: null
        }, {
            label: 'Windows',
            ariaLabel: 'Windows',
            electronAccelerator: null,
            userSettingsLabel: 'win',
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
            keyCode: 4 /* KeyCode.Shift */,
            code: null
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
        const mapper = await createKeyboardMapper(true, 'win_en_us', true);
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: true,
            keyCode: 56 /* KeyCode.KeyZ */,
            code: null
        }, {
            label: 'Ctrl+Alt+Z',
            ariaLabel: 'Control+Alt+Z',
            electronAccelerator: 'Ctrl+Alt+Z',
            userSettingsLabel: 'ctrl+alt+z',
            isWYSIWYG: true,
            isMultiChord: false,
            dispatchParts: ['ctrl+alt+Z'],
            singleModifierDispatchParts: [null],
        });
    });
});
suite('keyboardMapper - WINDOWS por_ptb', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        mapper = await createKeyboardMapper(false, 'win_por_ptb', false);
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'win_por_ptb.txt');
    });
    test('resolveKeyboardEvent Ctrl+[IntlRo]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 115 /* KeyCode.ABNT_C1 */,
            code: null
        }, {
            label: 'Ctrl+/',
            ariaLabel: 'Control+/',
            electronAccelerator: 'Ctrl+ABNT_C1',
            userSettingsLabel: 'ctrl+abnt_c1',
            isWYSIWYG: false,
            isMultiChord: false,
            dispatchParts: ['ctrl+ABNT_C1'],
            singleModifierDispatchParts: [null],
        });
    });
    test('resolveKeyboardEvent Ctrl+[NumpadComma]', () => {
        assertResolveKeyboardEvent(mapper, {
            _standardKeyboardEventBrand: true,
            ctrlKey: true,
            shiftKey: false,
            altKey: false,
            metaKey: false,
            altGraphKey: false,
            keyCode: 116 /* KeyCode.ABNT_C2 */,
            code: null
        }, {
            label: 'Ctrl+.',
            ariaLabel: 'Control+.',
            electronAccelerator: 'Ctrl+ABNT_C2',
            userSettingsLabel: 'ctrl+abnt_c2',
            isWYSIWYG: false,
            isMultiChord: false,
            dispatchParts: ['ctrl+ABNT_C2'],
            singleModifierDispatchParts: [null],
        });
    });
});
suite('keyboardMapper - WINDOWS ru', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    let mapper;
    suiteSetup(async () => {
        mapper = await createKeyboardMapper(false, 'win_ru', false);
    });
    test('mapping', () => {
        return assertMapping(WRITE_FILE_IF_DIFFERENT, mapper, 'win_ru.txt');
    });
    test('issue ##24361: resolveKeybinding Ctrl+K Ctrl+K', () => {
        _assertResolveKeybinding(mapper, KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */), [{
                label: 'Ctrl+K Ctrl+K',
                ariaLabel: 'Control+K Control+K',
                electronAccelerator: null,
                userSettingsLabel: 'ctrl+k ctrl+k',
                isWYSIWYG: true,
                isMultiChord: true,
                dispatchParts: ['ctrl+K', 'ctrl+K'],
                singleModifierDispatchParts: [null, null],
            }]);
    });
});
suite('keyboardMapper - misc', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('issue #23513: Toggle Sidebar Visibility and Go to Line display same key mapping in Arabic keyboard', () => {
        const mapper = new WindowsKeyboardMapper(false, {
            'KeyB': {
                'vkey': 'VK_B',
                'value': 'لا',
                'withShift': 'لآ',
                'withAltGr': '',
                'withShiftAltGr': ''
            },
            'KeyG': {
                'vkey': 'VK_G',
                'value': 'ل',
                'withShift': 'لأ',
                'withAltGr': '',
                'withShiftAltGr': ''
            }
        }, false);
        _assertResolveKeybinding(mapper, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */, [{
                label: 'Ctrl+B',
                ariaLabel: 'Control+B',
                electronAccelerator: 'Ctrl+B',
                userSettingsLabel: 'ctrl+b',
                isWYSIWYG: true,
                isMultiChord: false,
                dispatchParts: ['ctrl+B'],
                singleModifierDispatchParts: [null],
            }]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c0tleWJvYXJkTWFwcGVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy90ZXN0L25vZGUvd2luZG93c0tleWJvYXJkTWFwcGVyLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBNkIsTUFBTSx3Q0FBd0MsQ0FBQztBQUM3RixPQUFPLEVBQUUsWUFBWSxFQUFFLGdCQUFnQixFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUV0SCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUM5RSxPQUFPLEVBQXVCLGFBQWEsRUFBRSwwQkFBMEIsRUFBRSx1QkFBdUIsRUFBRSxjQUFjLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUV2SixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxNQUFNLHVCQUF1QixHQUFHLEtBQUssQ0FBQztBQUV0QyxLQUFLLFVBQVUsb0JBQW9CLENBQUMsWUFBcUIsRUFBRSxJQUFZLEVBQUUsaUJBQTBCO0lBQ2xHLE1BQU0sV0FBVyxHQUFHLE1BQU0sY0FBYyxDQUEwQixJQUFJLENBQUMsQ0FBQztJQUN4RSxPQUFPLElBQUkscUJBQXFCLENBQUMsWUFBWSxFQUFFLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ2hGLENBQUM7QUFFRCxTQUFTLHdCQUF3QixDQUFDLE1BQTZCLEVBQUUsQ0FBUyxFQUFFLFFBQStCO0lBQzFHLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixDQUFDLENBQUMsa0NBQTBCLENBQUM7SUFDaEUsdUJBQXVCLENBQUMsTUFBTSxFQUFFLFVBQVcsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUN4RCxDQUFDO0FB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