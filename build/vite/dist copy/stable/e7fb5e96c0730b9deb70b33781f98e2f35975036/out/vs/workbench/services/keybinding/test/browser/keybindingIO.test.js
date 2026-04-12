/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { KeyChord } from '../../../../../base/common/keyCodes.js';
import { KeyCodeChord, decodeKeybinding, ScanCodeChord, Keybinding } from '../../../../../base/common/keybindings.js';
import { KeybindingParser } from '../../../../../base/common/keybindingParser.js';
import { KeybindingIO } from '../../common/keybindingIO.js';
import { createUSLayoutResolvedKeybinding } from '../../../../../platform/keybinding/test/common/keybindingsTestUtils.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
suite('keybindingIO', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('serialize/deserialize', () => {
        function testOneSerialization(keybinding, expected, msg, OS) {
            const usLayoutResolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
            const actualSerialized = usLayoutResolvedKeybinding.getUserSettingsLabel();
            assert.strictEqual(actualSerialized, expected, expected + ' - ' + msg);
        }
        function testSerialization(keybinding, expectedWin, expectedMac, expectedLinux) {
            testOneSerialization(keybinding, expectedWin, 'win', 1 /* OperatingSystem.Windows */);
            testOneSerialization(keybinding, expectedMac, 'mac', 2 /* OperatingSystem.Macintosh */);
            testOneSerialization(keybinding, expectedLinux, 'linux', 3 /* OperatingSystem.Linux */);
        }
        function testOneDeserialization(keybinding, _expected, msg, OS) {
            const actualDeserialized = KeybindingParser.parseKeybinding(keybinding);
            const expected = decodeKeybinding(_expected, OS);
            assert.deepStrictEqual(actualDeserialized, expected, keybinding + ' - ' + msg);
        }
        function testDeserialization(inWin, inMac, inLinux, expected) {
            testOneDeserialization(inWin, expected, 'win', 1 /* OperatingSystem.Windows */);
            testOneDeserialization(inMac, expected, 'mac', 2 /* OperatingSystem.Macintosh */);
            testOneDeserialization(inLinux, expected, 'linux', 3 /* OperatingSystem.Linux */);
        }
        function testRoundtrip(keybinding, expectedWin, expectedMac, expectedLinux) {
            testSerialization(keybinding, expectedWin, expectedMac, expectedLinux);
            testDeserialization(expectedWin, expectedMac, expectedLinux, keybinding);
        }
        testRoundtrip(21 /* KeyCode.Digit0 */, '0', '0', '0');
        testRoundtrip(31 /* KeyCode.KeyA */, 'a', 'a', 'a');
        testRoundtrip(16 /* KeyCode.UpArrow */, 'up', 'up', 'up');
        testRoundtrip(17 /* KeyCode.RightArrow */, 'right', 'right', 'right');
        testRoundtrip(18 /* KeyCode.DownArrow */, 'down', 'down', 'down');
        testRoundtrip(15 /* KeyCode.LeftArrow */, 'left', 'left', 'left');
        // one modifier
        testRoundtrip(512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'alt+a', 'alt+a', 'alt+a');
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 'ctrl+a', 'cmd+a', 'ctrl+a');
        testRoundtrip(1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, 'shift+a', 'shift+a', 'shift+a');
        testRoundtrip(256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'win+a', 'ctrl+a', 'meta+a');
        // two modifiers
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'ctrl+alt+a', 'alt+cmd+a', 'ctrl+alt+a');
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+a', 'shift+cmd+a', 'ctrl+shift+a');
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'ctrl+win+a', 'ctrl+cmd+a', 'ctrl+meta+a');
        testRoundtrip(1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'shift+alt+a', 'shift+alt+a', 'shift+alt+a');
        testRoundtrip(1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'shift+win+a', 'ctrl+shift+a', 'shift+meta+a');
        testRoundtrip(512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'alt+win+a', 'ctrl+alt+a', 'alt+meta+a');
        // three modifiers
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+alt+a', 'shift+alt+cmd+a', 'ctrl+shift+alt+a');
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+win+a', 'ctrl+shift+cmd+a', 'ctrl+shift+meta+a');
        testRoundtrip(1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'shift+alt+win+a', 'ctrl+shift+alt+a', 'shift+alt+meta+a');
        // all modifiers
        testRoundtrip(2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+alt+win+a', 'ctrl+shift+alt+cmd+a', 'ctrl+shift+alt+meta+a');
        // chords
        testRoundtrip(KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */), 'ctrl+a ctrl+a', 'cmd+a cmd+a', 'ctrl+a ctrl+a');
        testRoundtrip(KeyChord(2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */, 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */), 'ctrl+up ctrl+up', 'cmd+up cmd+up', 'ctrl+up ctrl+up');
        // OEM keys
        testRoundtrip(85 /* KeyCode.Semicolon */, ';', ';', ';');
        testRoundtrip(86 /* KeyCode.Equal */, '=', '=', '=');
        testRoundtrip(87 /* KeyCode.Comma */, ',', ',', ',');
        testRoundtrip(88 /* KeyCode.Minus */, '-', '-', '-');
        testRoundtrip(89 /* KeyCode.Period */, '.', '.', '.');
        testRoundtrip(90 /* KeyCode.Slash */, '/', '/', '/');
        testRoundtrip(91 /* KeyCode.Backquote */, '`', '`', '`');
        testRoundtrip(115 /* KeyCode.ABNT_C1 */, 'abnt_c1', 'abnt_c1', 'abnt_c1');
        testRoundtrip(116 /* KeyCode.ABNT_C2 */, 'abnt_c2', 'abnt_c2', 'abnt_c2');
        testRoundtrip(92 /* KeyCode.BracketLeft */, '[', '[', '[');
        testRoundtrip(93 /* KeyCode.Backslash */, '\\', '\\', '\\');
        testRoundtrip(94 /* KeyCode.BracketRight */, ']', ']', ']');
        testRoundtrip(95 /* KeyCode.Quote */, '\'', '\'', '\'');
        testRoundtrip(96 /* KeyCode.OEM_8 */, 'oem_8', 'oem_8', 'oem_8');
        testRoundtrip(97 /* KeyCode.IntlBackslash */, 'oem_102', 'oem_102', 'oem_102');
        // OEM aliases
        testDeserialization('OEM_1', 'OEM_1', 'OEM_1', 85 /* KeyCode.Semicolon */);
        testDeserialization('OEM_PLUS', 'OEM_PLUS', 'OEM_PLUS', 86 /* KeyCode.Equal */);
        testDeserialization('OEM_COMMA', 'OEM_COMMA', 'OEM_COMMA', 87 /* KeyCode.Comma */);
        testDeserialization('OEM_MINUS', 'OEM_MINUS', 'OEM_MINUS', 88 /* KeyCode.Minus */);
        testDeserialization('OEM_PERIOD', 'OEM_PERIOD', 'OEM_PERIOD', 89 /* KeyCode.Period */);
        testDeserialization('OEM_2', 'OEM_2', 'OEM_2', 90 /* KeyCode.Slash */);
        testDeserialization('OEM_3', 'OEM_3', 'OEM_3', 91 /* KeyCode.Backquote */);
        testDeserialization('ABNT_C1', 'ABNT_C1', 'ABNT_C1', 115 /* KeyCode.ABNT_C1 */);
        testDeserialization('ABNT_C2', 'ABNT_C2', 'ABNT_C2', 116 /* KeyCode.ABNT_C2 */);
        testDeserialization('OEM_4', 'OEM_4', 'OEM_4', 92 /* KeyCode.BracketLeft */);
        testDeserialization('OEM_5', 'OEM_5', 'OEM_5', 93 /* KeyCode.Backslash */);
        testDeserialization('OEM_6', 'OEM_6', 'OEM_6', 94 /* KeyCode.BracketRight */);
        testDeserialization('OEM_7', 'OEM_7', 'OEM_7', 95 /* KeyCode.Quote */);
        testDeserialization('OEM_8', 'OEM_8', 'OEM_8', 96 /* KeyCode.OEM_8 */);
        testDeserialization('OEM_102', 'OEM_102', 'OEM_102', 97 /* KeyCode.IntlBackslash */);
        // accepts '-' as separator
        testDeserialization('ctrl-shift-alt-win-a', 'ctrl-shift-alt-cmd-a', 'ctrl-shift-alt-meta-a', 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */);
        // various input mistakes
        testDeserialization(' ctrl-shift-alt-win-A ', ' shift-alt-cmd-Ctrl-A ', ' ctrl-shift-alt-META-A ', 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */);
    });
    test('deserialize scan codes', () => {
        assert.deepStrictEqual(KeybindingParser.parseKeybinding('ctrl+shift+[comma] ctrl+/'), new Keybinding([new ScanCodeChord(true, true, false, false, 60 /* ScanCode.Comma */), new KeyCodeChord(true, false, false, false, 90 /* KeyCode.Slash */)]));
    });
    test('issue #10452 - invalid command', () => {
        const strJSON = `[{ "key": "ctrl+k ctrl+f", "command": ["firstcommand", "seccondcommand"] }]`;
        const userKeybinding = JSON.parse(strJSON)[0];
        const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
        assert.strictEqual(keybindingItem.command, null);
    });
    test('issue #10452 - invalid when', () => {
        const strJSON = `[{ "key": "ctrl+k ctrl+f", "command": "firstcommand", "when": [] }]`;
        const userKeybinding = JSON.parse(strJSON)[0];
        const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
        assert.strictEqual(keybindingItem.when, undefined);
    });
    test('issue #10452 - invalid key', () => {
        const strJSON = `[{ "key": [], "command": "firstcommand" }]`;
        const userKeybinding = JSON.parse(strJSON)[0];
        const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
        assert.deepStrictEqual(keybindingItem.keybinding, null);
    });
    test('issue #10452 - invalid key 2', () => {
        const strJSON = `[{ "key": "", "command": "firstcommand" }]`;
        const userKeybinding = JSON.parse(strJSON)[0];
        const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
        assert.deepStrictEqual(keybindingItem.keybinding, null);
    });
    test('test commands args', () => {
        const strJSON = `[{ "key": "ctrl+k ctrl+f", "command": "firstcommand", "when": [], "args": { "text": "theText" } }]`;
        const userKeybinding = JSON.parse(strJSON)[0];
        const keybindingItem = KeybindingIO.readUserKeybindingItem(userKeybinding);
        assert.strictEqual(keybindingItem.commandArgs.text, 'theText');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ0lPLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMva2V5YmluZGluZy90ZXN0L2Jyb3dzZXIva2V5YmluZGluZ0lPLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFDaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQTZCLE1BQU0sd0NBQXdDLENBQUM7QUFDN0YsT0FBTyxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEgsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFFbEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBRSxnQ0FBZ0MsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBQzFILE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRW5HLEtBQUssQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzFCLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUVsQyxTQUFTLG9CQUFvQixDQUFDLFVBQWtCLEVBQUUsUUFBZ0IsRUFBRSxHQUFXLEVBQUUsRUFBbUI7WUFDbkcsTUFBTSwwQkFBMEIsR0FBRyxnQ0FBZ0MsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFFLENBQUM7WUFDckYsTUFBTSxnQkFBZ0IsR0FBRywwQkFBMEIsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQzNFLE1BQU0sQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLEVBQUUsUUFBUSxFQUFFLFFBQVEsR0FBRyxLQUFLLEdBQUcsR0FBRyxDQUFDLENBQUM7UUFD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