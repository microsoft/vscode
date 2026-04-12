/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EVENT_KEY_CODE_MAP, IMMUTABLE_CODE_TO_KEY_CODE, IMMUTABLE_KEY_CODE_TO_CODE, KeyChord, KeyCodeUtils, NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE, ScanCodeUtils } from '../../common/keyCodes.js';
import { decodeKeybinding, KeyCodeChord, Keybinding } from '../../common/keybindings.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
suite('keyCodes', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function testBinaryEncoding(expected, k, OS) {
        assert.deepStrictEqual(decodeKeybinding(k, OS), expected);
    }
    test('mapping for Minus', () => {
        // [147, 83, 0, ScanCode.Minus, 'Minus', KeyCode.US_MINUS, '-', 189, 'VK_OEM_MINUS', '-', 'OEM_MINUS'],
        assert.strictEqual(EVENT_KEY_CODE_MAP[189], 88 /* KeyCode.Minus */);
        assert.strictEqual(NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE['VK_OEM_MINUS'], 88 /* KeyCode.Minus */);
        assert.strictEqual(ScanCodeUtils.lowerCaseToEnum('minus'), 51 /* ScanCode.Minus */);
        assert.strictEqual(ScanCodeUtils.toEnum('Minus'), 51 /* ScanCode.Minus */);
        assert.strictEqual(ScanCodeUtils.toString(51 /* ScanCode.Minus */), 'Minus');
        assert.strictEqual(IMMUTABLE_CODE_TO_KEY_CODE[51 /* ScanCode.Minus */], -1 /* KeyCode.DependsOnKbLayout */);
        assert.strictEqual(IMMUTABLE_KEY_CODE_TO_CODE[88 /* KeyCode.Minus */], -1 /* ScanCode.DependsOnKbLayout */);
        assert.strictEqual(KeyCodeUtils.toString(88 /* KeyCode.Minus */), '-');
        assert.strictEqual(KeyCodeUtils.fromString('-'), 88 /* KeyCode.Minus */);
        assert.strictEqual(KeyCodeUtils.toUserSettingsUS(88 /* KeyCode.Minus */), '-');
        assert.strictEqual(KeyCodeUtils.toUserSettingsGeneral(88 /* KeyCode.Minus */), 'OEM_MINUS');
        assert.strictEqual(KeyCodeUtils.fromUserSettings('-'), 88 /* KeyCode.Minus */);
        assert.strictEqual(KeyCodeUtils.fromUserSettings('OEM_MINUS'), 88 /* KeyCode.Minus */);
        assert.strictEqual(KeyCodeUtils.fromUserSettings('oem_minus'), 88 /* KeyCode.Minus */);
    });
    test('mapping for Space', () => {
        // [21, 10, 1, ScanCode.Space, 'Space', KeyCode.Space, 'Space', 32, 'VK_SPACE', empty, empty],
        assert.strictEqual(EVENT_KEY_CODE_MAP[32], 10 /* KeyCode.Space */);
        assert.strictEqual(NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE['VK_SPACE'], 10 /* KeyCode.Space */);
        assert.strictEqual(ScanCodeUtils.lowerCaseToEnum('space'), 50 /* ScanCode.Space */);
        assert.strictEqual(ScanCodeUtils.toEnum('Space'), 50 /* ScanCode.Space */);
        assert.strictEqual(ScanCodeUtils.toString(50 /* ScanCode.Space */), 'Space');
        assert.strictEqual(IMMUTABLE_CODE_TO_KEY_CODE[50 /* ScanCode.Space */], 10 /* KeyCode.Space */);
        assert.strictEqual(IMMUTABLE_KEY_CODE_TO_CODE[10 /* KeyCode.Space */], 50 /* ScanCode.Space */);
        assert.strictEqual(KeyCodeUtils.toString(10 /* KeyCode.Space */), 'Space');
        assert.strictEqual(KeyCodeUtils.fromString('Space'), 10 /* KeyCode.Space */);
        assert.strictEqual(KeyCodeUtils.toUserSettingsUS(10 /* KeyCode.Space */), 'Space');
        assert.strictEqual(KeyCodeUtils.toUserSettingsGeneral(10 /* KeyCode.Space */), 'Space');
        assert.strictEqual(KeyCodeUtils.fromUserSettings('Space'), 10 /* KeyCode.Space */);
        assert.strictEqual(KeyCodeUtils.fromUserSettings('space'), 10 /* KeyCode.Space */);
    });
    test('MAC binary encoding', () => {
        function test(expected, k) {
            testBinaryEncoding(expected, k, 2 /* OperatingSystem.Macintosh */);
        }
        test(null, 0);
        test(new KeyCodeChord(false, false, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, false, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, false, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, false, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, true, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, true, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, true, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, true, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, false, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, false, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, false, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, false, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, true, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, true, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(false, true, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
        test(new KeyCodeChord(true, true, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
        test(new Keybinding([
            new KeyCodeChord(false, false, false, false, 3 /* KeyCode.Enter */),
            new KeyCodeChord(false, false, false, false, 2 /* KeyCode.Tab */)
        ]), KeyChord(3 /* KeyCode.Enter */, 2 /* KeyCode.Tab */));
        test(new Keybinding([
            new KeyCodeChord(false, false, false, true, 55 /* KeyCode.KeyY */),
            new KeyCodeChord(false, false, false, false, 56 /* KeyCode.KeyZ */)
        ]), KeyChord(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 56 /* KeyCode.KeyZ */));
    });
    test('WINDOWS & LINUX binary encoding', () => {
        [3 /* OperatingSystem.Linux */, 1 /* OperatingSystem.Windows */].forEach((OS) => {
            function test(expected, k) {
                testBinaryEncoding(expected, k, OS);
            }
            test(null, 0);
            test(new KeyCodeChord(false, false, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, false, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, false, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, false, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, true, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, true, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, true, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(false, true, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, false, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, false, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, false, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, false, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, true, false, false, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, true, false, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, true, true, false, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 3 /* KeyCode.Enter */);
            test(new KeyCodeChord(true, true, true, true, 3 /* KeyCode.Enter */).toKeybinding(), 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 3 /* KeyCode.Enter */);
            test(new Keybinding([
                new KeyCodeChord(false, false, false, false, 3 /* KeyCode.Enter */),
                new KeyCodeChord(false, false, false, false, 2 /* KeyCode.Tab */)
            ]), KeyChord(3 /* KeyCode.Enter */, 2 /* KeyCode.Tab */));
            test(new Keybinding([
                new KeyCodeChord(true, false, false, false, 55 /* KeyCode.KeyY */),
                new KeyCodeChord(false, false, false, false, 56 /* KeyCode.KeyZ */)
            ]), KeyChord(2048 /* KeyMod.CtrlCmd */ | 55 /* KeyCode.KeyY */, 56 /* KeyCode.KeyZ */));
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Q29kZXMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvdGVzdC9jb21tb24va2V5Q29kZXMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGtCQUFrQixFQUFFLDBCQUEwQixFQUFFLDBCQUEwQixFQUFFLFFBQVEsRUFBVyxZQUFZLEVBQVUsbUNBQW1DLEVBQVksYUFBYSxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDN04sT0FBTyxFQUFFLGdCQUFnQixFQUFFLFlBQVksRUFBRSxVQUFVLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV6RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFFckUsS0FBSyxDQUFDLFVBQVUsRUFBRSxHQUFHLEVBQUU7SUFFdEIsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxTQUFTLGtCQUFrQixDQUFDLFFBQTJCLEVBQUUsQ0FBUyxFQUFFLEVBQW1CO1FBQ3RGLE1BQU0sQ0FBQyxlQUFlLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFRCxJQUFJLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQzlCLHVHQUF1RztRQUN2RyxNQUFNLENBQUMsV0FBVyxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyx5QkFBZ0IsQ0FBQztRQUMzRCxNQUFNLENBQUMsV0FBVyxDQUFDLG1DQUFtQyxDQUFDLGNBQWMsQ0FBQyx5QkFBZ0IsQ0FBQztRQUN2RixNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLDBCQUFpQixDQUFDO1FBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsYUFBYSxD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