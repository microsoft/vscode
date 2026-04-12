/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createUSLayoutResolvedKeybinding } from './keybindingsTestUtils.js';
suite('KeybindingLabels', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    function assertUSLabel(OS, keybinding, expected) {
        const usResolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
        assert.strictEqual(usResolvedKeybinding.getLabel(), expected);
    }
    test('Windows US label', () => {
        // no modifier
        assertUSLabel(1 /* OperatingSystem.Windows */, 31 /* KeyCode.KeyA */, 'A');
        // one modifier
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 'Ctrl+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, 'Shift+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Alt+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Windows+A');
        // two modifiers
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Ctrl+Alt+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Windows+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Shift+Alt+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Shift+Windows+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Alt+Windows+A');
        // three modifiers
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Windows+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Alt+Windows+A');
        assertUSLabel(1 /* OperatingSystem.Windows */, 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Shift+Alt+Windows+A');
        // four modifiers
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+Windows+A');
        // chord
        assertUSLabel(1 /* OperatingSystem.Windows */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), 'Ctrl+A Ctrl+B');
    });
    test('Linux US label', () => {
        // no modifier
        assertUSLabel(3 /* OperatingSystem.Linux */, 31 /* KeyCode.KeyA */, 'A');
        // one modifier
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 'Ctrl+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, 'Shift+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Alt+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Super+A');
        // two modifiers
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Ctrl+Alt+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Super+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Shift+Alt+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Shift+Super+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Alt+Super+A');
        // three modifiers
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Super+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Alt+Super+A');
        assertUSLabel(3 /* OperatingSystem.Linux */, 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Shift+Alt+Super+A');
        // four modifiers
        assertUSLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+Super+A');
        // chord
        assertUSLabel(3 /* OperatingSystem.Linux */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), 'Ctrl+A Ctrl+B');
    });
    test('Mac US label', () => {
        // no modifier
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 31 /* KeyCode.KeyA */, 'A');
        // one modifier
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, '⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, '⇧A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, '⌥A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃A');
        // two modifiers
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 31 /* KeyCode.KeyA */, '⇧⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, '⌥⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, '⇧⌥A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⇧A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⌥A');
        // three modifiers
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 31 /* KeyCode.KeyA */, '⇧⌥⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⇧⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⌥⌘A');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⇧⌥A');
        // four modifiers
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, '⌃⇧⌥⌘A');
        // chord
        assertUSLabel(2 /* OperatingSystem.Macintosh */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), '⌘A ⌘B');
        // special keys
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 15 /* KeyCode.LeftArrow */, '←');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 16 /* KeyCode.UpArrow */, '↑');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 17 /* KeyCode.RightArrow */, '→');
        assertUSLabel(2 /* OperatingSystem.Macintosh */, 18 /* KeyCode.DownArrow */, '↓');
    });
    test('Aria label', () => {
        function assertAriaLabel(OS, keybinding, expected) {
            const usResolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
            assert.strictEqual(usResolvedKeybinding.getAriaLabel(), expected);
        }
        assertAriaLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Control+Shift+Alt+Windows+A');
        assertAriaLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Control+Shift+Alt+Super+A');
        assertAriaLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Control+Shift+Option+Command+A');
    });
    test('Electron Accelerator label', () => {
        function assertElectronAcceleratorLabel(OS, keybinding, expected) {
            const usResolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
            assert.strictEqual(usResolvedKeybinding.getElectronAccelerator(), expected);
        }
        assertElectronAcceleratorLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+Super+A');
        assertElectronAcceleratorLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+Super+A');
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'Ctrl+Shift+Alt+Cmd+A');
        // electron cannot handle chords
        assertElectronAcceleratorLabel(1 /* OperatingSystem.Windows */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), null);
        assertElectronAcceleratorLabel(3 /* OperatingSystem.Linux */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), null);
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), null);
        // electron cannot handle numpad keys
        assertElectronAcceleratorLabel(1 /* OperatingSystem.Windows */, 99 /* KeyCode.Numpad1 */, null);
        assertElectronAcceleratorLabel(3 /* OperatingSystem.Linux */, 99 /* KeyCode.Numpad1 */, null);
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 99 /* KeyCode.Numpad1 */, null);
        // special
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 15 /* KeyCode.LeftArrow */, 'Left');
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 16 /* KeyCode.UpArrow */, 'Up');
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 17 /* KeyCode.RightArrow */, 'Right');
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 18 /* KeyCode.DownArrow */, 'Down');
    });
    test('User Settings label', () => {
        function assertElectronAcceleratorLabel(OS, keybinding, expected) {
            const usResolvedKeybinding = createUSLayoutResolvedKeybinding(keybinding, OS);
            assert.strictEqual(usResolvedKeybinding.getUserSettingsLabel(), expected);
        }
        assertElectronAcceleratorLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+alt+win+a');
        assertElectronAcceleratorLabel(3 /* OperatingSystem.Linux */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+alt+meta+a');
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, 2048 /* KeyMod.CtrlCmd */ | 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 256 /* KeyMod.WinCtrl */ | 31 /* KeyCode.KeyA */, 'ctrl+shift+alt+cmd+a');
        // electron cannot handle chords
        assertElectronAcceleratorLabel(1 /* OperatingSystem.Windows */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), 'ctrl+a ctrl+b');
        assertElectronAcceleratorLabel(3 /* OperatingSystem.Linux */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), 'ctrl+a ctrl+b');
        assertElectronAcceleratorLabel(2 /* OperatingSystem.Macintosh */, KeyChord(2048 /* KeyMod.CtrlCmd */ | 31 /* KeyCode.KeyA */, 2048 /* KeyMod.CtrlCmd */ | 32 /* KeyCode.KeyB */), 'cmd+a cmd+b');
    });
    test('issue #91235: Do not end with a +', () => {
        assertUSLabel(1 /* OperatingSystem.Windows */, 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 6 /* KeyCode.Alt */, 'Ctrl+Alt');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5YmluZGluZ0xhYmVscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0va2V5YmluZGluZy90ZXN0L2NvbW1vbi9rZXliaW5kaW5nTGFiZWxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxRQUFRLEVBQW1CLE1BQU0scUNBQXFDLENBQUM7QUFFaEYsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFFN0UsS0FBSyxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtJQUU5Qix1Q0FBdUMsRUFBRSxDQUFDO0lBRTFDLFNBQVMsYUFBYSxDQUFDLEVBQW1CLEVBQUUsVUFBa0IsRUFBRSxRQUFnQjtRQUMvRSxNQUFNLG9CQUFvQixHQUFHLGdDQUFnQyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUUsQ0FBQztRQUMvRSxNQUFNLENBQUMsV0FBVyxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFRCxJQUFJLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQzdCLGNBQWM7UUFDZCxhQUFhLHlEQUF3QyxHQUFHLENBQUMsQ0FBQztRQUUxRCxlQUFlO1FBQ2YsYUFBYSxrQ0FBMEIsaURBQTZCLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDaEYsYUFBYSxrQ0FBMEIsK0NBQTJCLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDL0UsYUFBYSxrQ0FBMEIsNENBQXlCLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDM0UsYUFBYSxrQ0FBMEIsZ0RBQTZCLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFF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