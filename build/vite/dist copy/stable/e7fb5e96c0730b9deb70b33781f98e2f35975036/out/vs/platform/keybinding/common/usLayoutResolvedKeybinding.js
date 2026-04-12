/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE } from '../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../base/common/keybindings.js';
import { BaseResolvedKeybinding } from './baseResolvedKeybinding.js';
import { toEmptyArrayIfContainsNull } from './resolvedKeybindingItem.js';
/**
 * Do not instantiate. Use KeybindingService to get a ResolvedKeybinding seeded with information about the current kb layout.
 */
export class USLayoutResolvedKeybinding extends BaseResolvedKeybinding {
    constructor(chords, os) {
        super(os, chords);
    }
    _keyCodeToUILabel(keyCode) {
        if (this._os === 2 /* OperatingSystem.Macintosh */) {
            switch (keyCode) {
                case 15 /* KeyCode.LeftArrow */:
                    return '←';
                case 16 /* KeyCode.UpArrow */:
                    return '↑';
                case 17 /* KeyCode.RightArrow */:
                    return '→';
                case 18 /* KeyCode.DownArrow */:
                    return '↓';
            }
        }
        return KeyCodeUtils.toString(keyCode);
    }
    _getLabel(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        return this._keyCodeToUILabel(chord.keyCode);
    }
    _getAriaLabel(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        return KeyCodeUtils.toString(chord.keyCode);
    }
    _getElectronAccelerator(chord) {
        return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
    }
    _getUserSettingsLabel(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        const result = KeyCodeUtils.toUserSettingsUS(chord.keyCode);
        return (result ? result.toLowerCase() : result);
    }
    _isWYSIWYG() {
        return true;
    }
    _getChordDispatch(chord) {
        return USLayoutResolvedKeybinding.getDispatchStr(chord);
    }
    static getDispatchStr(chord) {
        if (chord.isModifierKey()) {
            return null;
        }
        let result = '';
        if (chord.ctrlKey) {
            result += 'ctrl+';
        }
        if (chord.shiftKey) {
            result += 'shift+';
        }
        if (chord.altKey) {
            result += 'alt+';
        }
        if (chord.metaKey) {
            result += 'meta+';
        }
        result += KeyCodeUtils.toString(chord.keyCode);
        return result;
    }
    _getSingleModifierChordDispatch(keybinding) {
        if (keybinding.keyCode === 5 /* KeyCode.Ctrl */ && !keybinding.shiftKey && !keybinding.altKey && !keybinding.metaKey) {
            return 'ctrl';
        }
        if (keybinding.keyCode === 4 /* KeyCode.Shift */ && !keybinding.ctrlKey && !keybinding.altKey && !keybinding.metaKey) {
            return 'shift';
        }
        if (keybinding.keyCode === 6 /* KeyCode.Alt */ && !keybinding.ctrlKey && !keybinding.shiftKey && !keybinding.metaKey) {
            return 'alt';
        }
        if (keybinding.keyCode === 57 /* KeyCode.Meta */ && !keybinding.ctrlKey && !keybinding.shiftKey && !keybinding.altKey) {
            return 'meta';
        }
        return null;
    }
    /**
     * *NOTE*: Check return value for `KeyCode.Unknown`.
     */
    static _scanCodeToKeyCode(scanCode) {
        const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
        if (immutableKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
            return immutableKeyCode;
        }
        switch (scanCode) {
            case 10 /* ScanCode.KeyA */: return 31 /* KeyCode.KeyA */;
            case 11 /* ScanCode.KeyB */: return 32 /* KeyCode.KeyB */;
            case 12 /* ScanCode.KeyC */: return 33 /* KeyCode.KeyC */;
            case 13 /* ScanCode.KeyD */: return 34 /* KeyCode.KeyD */;
            case 14 /* ScanCode.KeyE */: return 35 /* KeyCode.KeyE */;
            case 15 /* ScanCode.KeyF */: return 36 /* KeyCode.KeyF */;
            case 16 /* ScanCode.KeyG */: return 37 /* KeyCode.KeyG */;
            case 17 /* ScanCode.KeyH */: return 38 /* KeyCode.KeyH */;
            case 18 /* ScanCode.KeyI */: return 39 /* KeyCode.KeyI */;
            case 19 /* ScanCode.KeyJ */: return 40 /* KeyCode.KeyJ */;
            case 20 /* ScanCode.KeyK */: return 41 /* KeyCode.KeyK */;
            case 21 /* ScanCode.KeyL */: return 42 /* KeyCode.KeyL */;
            case 22 /* ScanCode.KeyM */: return 43 /* KeyCode.KeyM */;
            case 23 /* ScanCode.KeyN */: return 44 /* KeyCode.KeyN */;
            case 24 /* ScanCode.KeyO */: return 45 /* KeyCode.KeyO */;
            case 25 /* ScanCode.KeyP */: return 46 /* KeyCode.KeyP */;
            case 26 /* ScanCode.KeyQ */: return 47 /* KeyCode.KeyQ */;
            case 27 /* ScanCode.KeyR */: return 48 /* KeyCode.KeyR */;
            case 28 /* ScanCode.KeyS */: return 49 /* KeyCode.KeyS */;
            case 29 /* ScanCode.KeyT */: return 50 /* KeyCode.KeyT */;
            case 30 /* ScanCode.KeyU */: return 51 /* KeyCode.KeyU */;
            case 31 /* ScanCode.KeyV */: return 52 /* KeyCode.KeyV */;
            case 32 /* ScanCode.KeyW */: return 53 /* KeyCode.KeyW */;
            case 33 /* ScanCode.KeyX */: return 54 /* KeyCode.KeyX */;
            case 34 /* ScanCode.KeyY */: return 55 /* KeyCode.KeyY */;
            case 35 /* ScanCode.KeyZ */: return 56 /* KeyCode.KeyZ */;
            case 36 /* ScanCode.Digit1 */: return 22 /* KeyCode.Digit1 */;
            case 37 /* ScanCode.Digit2 */: return 23 /* KeyCode.Digit2 */;
            case 38 /* ScanCode.Digit3 */: return 24 /* KeyCode.Digit3 */;
            case 39 /* ScanCode.Digit4 */: return 25 /* KeyCode.Digit4 */;
            case 40 /* ScanCode.Digit5 */: return 26 /* KeyCode.Digit5 */;
            case 41 /* ScanCode.Digit6 */: return 27 /* KeyCode.Digit6 */;
            case 42 /* ScanCode.Digit7 */: return 28 /* KeyCode.Digit7 */;
            case 43 /* ScanCode.Digit8 */: return 29 /* KeyCode.Digit8 */;
            case 44 /* ScanCode.Digit9 */: return 30 /* KeyCode.Digit9 */;
            case 45 /* ScanCode.Digit0 */: return 21 /* KeyCode.Digit0 */;
            case 51 /* ScanCode.Minus */: return 88 /* KeyCode.Minus */;
            case 52 /* ScanCode.Equal */: return 86 /* KeyCode.Equal */;
            case 53 /* ScanCode.BracketLeft */: return 92 /* KeyCode.BracketLeft */;
            case 54 /* ScanCode.BracketRight */: return 94 /* KeyCode.BracketRight */;
            case 55 /* ScanCode.Backslash */: return 93 /* KeyCode.Backslash */;
            case 56 /* ScanCode.IntlHash */: return 0 /* KeyCode.Unknown */; // missing
            case 57 /* ScanCode.Semicolon */: return 85 /* KeyCode.Semicolon */;
            case 58 /* ScanCode.Quote */: return 95 /* KeyCode.Quote */;
            case 59 /* ScanCode.Backquote */: return 91 /* KeyCode.Backquote */;
            case 60 /* ScanCode.Comma */: return 87 /* KeyCode.Comma */;
            case 61 /* ScanCode.Period */: return 89 /* KeyCode.Period */;
            case 62 /* ScanCode.Slash */: return 90 /* KeyCode.Slash */;
            case 106 /* ScanCode.IntlBackslash */: return 97 /* KeyCode.IntlBackslash */;
        }
        return 0 /* KeyCode.Unknown */;
    }
    static _toKeyCodeChord(chord) {
        if (!chord) {
            return null;
        }
        if (chord instanceof KeyCodeChord) {
            return chord;
        }
        const keyCode = this._scanCodeToKeyCode(chord.scanCode);
        if (keyCode === 0 /* KeyCode.Unknown */) {
            return null;
        }
        return new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, keyCode);
    }
    static resolveKeybinding(keybinding, os) {
        const chords = toEmptyArrayIfContainsNull(keybinding.chords.map(chord => this._toKeyCodeChord(chord)));
        if (chords.length > 0) {
            return [new USLayoutResolvedKeybinding(chords, os)];
        }
        return [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi91c0xheW91dFJlc29sdmVkS2V5YmluZGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQVcsWUFBWSxFQUFFLDBCQUEwQixFQUFZLE1BQU0sa0NBQWtDLENBQUM7QUFDL0csT0FBTyxFQUE4QixZQUFZLEVBQWMsTUFBTSxxQ0FBcUMsQ0FBQztBQUUzRyxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUNyRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUV6RTs7R0FFRztBQUNILE1BQU0sT0FBTywwQkFBMkIsU0FBUSxzQkFBb0M7SUFFbkYsWUFBWSxNQUFzQixFQUFFLEVBQW1CO1FBQ3RELEtBQUssQ0FBQyxFQUFFLEVBQUUsTUFBTSxDQUFDLENBQUM7SUFDbkIsQ0FBQztJQUVPLGlCQUFpQixDQUFDLE9BQWdCO1FBQ3pDLElBQUksSUFBSSxDQUFDLEdBQUcsc0NBQThCLEVBQUUsQ0FBQztZQUM1QyxRQUFRLE9BQU8sRUFBRSxDQUFDO2dCQUNqQjtvQkFDQyxPQUFPLEdBQUcsQ0FBQztnQkFDWjtvQkFDQyxPQUFPLEdBQUcsQ0FBQztnQkFDWjtvQkFDQyxPQUFPLEdBQUcsQ0FBQztnQkFDWjtvQkFDQyxPQUFPLEdBQUcsQ0FBQztZQUNiLENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxZQUFZLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3ZDLENBQUM7SUFFUyxTQUFTLENBQUMsS0FBbUI7UUFDdEMsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sRUFBRSxDQUFDO1FBQ1gs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