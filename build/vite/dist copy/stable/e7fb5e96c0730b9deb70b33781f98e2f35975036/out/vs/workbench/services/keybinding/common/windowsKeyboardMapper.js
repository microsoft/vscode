/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCodeUtils, NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE } from '../../../../base/common/keyCodes.js';
import { KeyCodeChord, ScanCodeChord } from '../../../../base/common/keybindings.js';
import { UILabelProvider } from '../../../../base/common/keybindingLabels.js';
import { BaseResolvedKeybinding } from '../../../../platform/keybinding/common/baseResolvedKeybinding.js';
import { toEmptyArrayIfContainsNull } from '../../../../platform/keybinding/common/resolvedKeybindingItem.js';
const LOG = false;
function log(str) {
    if (LOG) {
        console.info(str);
    }
}
export class WindowsNativeResolvedKeybinding extends BaseResolvedKeybinding {
    constructor(mapper, chords) {
        super(1 /* OperatingSystem.Windows */, chords);
        this._mapper = mapper;
    }
    _getLabel(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        return this._mapper.getUILabelForKeyCode(chord.keyCode);
    }
    _getUSLabelForKeybinding(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        return KeyCodeUtils.toString(chord.keyCode);
    }
    getUSLabel() {
        return UILabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getUSLabelForKeybinding(keybinding));
    }
    _getAriaLabel(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        return this._mapper.getAriaLabelForKeyCode(chord.keyCode);
    }
    _getElectronAccelerator(chord) {
        return this._mapper.getElectronAcceleratorForKeyBinding(chord);
    }
    _getUserSettingsLabel(chord) {
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        const result = this._mapper.getUserSettingsLabelForKeyCode(chord.keyCode);
        return (result ? result.toLowerCase() : result);
    }
    _isWYSIWYG(chord) {
        return this.__isWYSIWYG(chord.keyCode);
    }
    __isWYSIWYG(keyCode) {
        if (keyCode === 15 /* KeyCode.LeftArrow */
            || keyCode === 16 /* KeyCode.UpArrow */
            || keyCode === 17 /* KeyCode.RightArrow */
            || keyCode === 18 /* KeyCode.DownArrow */) {
            return true;
        }
        const ariaLabel = this._mapper.getAriaLabelForKeyCode(keyCode);
        const userSettingsLabel = this._mapper.getUserSettingsLabelForKeyCode(keyCode);
        return (ariaLabel === userSettingsLabel);
    }
    _getChordDispatch(chord) {
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
    _getSingleModifierChordDispatch(chord) {
        if (chord.keyCode === 5 /* KeyCode.Ctrl */ && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
            return 'ctrl';
        }
        if (chord.keyCode === 4 /* KeyCode.Shift */ && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
            return 'shift';
        }
        if (chord.keyCode === 6 /* KeyCode.Alt */ && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
            return 'alt';
        }
        if (chord.keyCode === 57 /* KeyCode.Meta */ && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
            return 'meta';
        }
        return null;
    }
    static getProducedCharCode(chord, mapping) {
        if (!mapping) {
            return null;
        }
        if (chord.ctrlKey && chord.shiftKey && chord.altKey) {
            return mapping.withShiftAltGr;
        }
        if (chord.ctrlKey && chord.altKey) {
            return mapping.withAltGr;
        }
        if (chord.shiftKey) {
            return mapping.withShift;
        }
        return mapping.value;
    }
    static getProducedChar(chord, mapping) {
        const char = this.getProducedCharCode(chord, mapping);
        if (char === null || char.length === 0) {
            return ' --- ';
        }
        return '  ' + char + '  ';
    }
}
export class WindowsKeyboardMapper {
    constructor(_isUSStandard, rawMappings, _mapAltGrToCtrlAlt) {
        this._isUSStandard = _isUSStandard;
        this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
        this._keyCodeToLabel = [];
        this._scanCodeToKeyCode = [];
        this._keyCodeToLabel = [];
        this._keyCodeExists = [];
        this._keyCodeToLabel[0 /* KeyCode.Unknown */] = KeyCodeUtils.toString(0 /* KeyCode.Unknown */);
        for (let scanCode = 0 /* ScanCode.None */; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
            const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
            if (immutableKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
                this._scanCodeToKeyCode[scanCode] = immutableKeyCode;
                this._keyCodeToLabel[immutableKeyCode] = KeyCodeUtils.toString(immutableKeyCode);
                this._keyCodeExists[immutableKeyCode] = true;
            }
        }
        const producesLetter = [];
        let producesLetters = false;
        this._codeInfo = [];
        for (const strCode in rawMappings) {
            if (rawMappings.hasOwnProperty(strCode)) {
                const scanCode = ScanCodeUtils.toEnum(strCode);
                if (scanCode === 0 /* ScanCode.None */) {
                    log(`Unknown scanCode ${strCode} in mapping.`);
                    continue;
                }
                const rawMapping = rawMappings[strCode];
                const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
                if (immutableKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
                    const keyCode = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || 0 /* KeyCode.Unknown */;
                    if (keyCode === 0 /* KeyCode.Unknown */ || immutableKeyCode === keyCode) {
                        continue;
                    }
                    if (scanCode !== 134 /* ScanCode.NumpadComma */) {
                        // Looks like ScanCode.NumpadComma doesn't always map to KeyCode.NUMPAD_SEPARATOR
                        // e.g. on POR - PTB
                        continue;
                    }
                }
                const value = rawMapping.value;
                const withShift = rawMapping.withShift;
                const withAltGr = rawMapping.withAltGr;
                const withShiftAltGr = rawMapping.withShiftAltGr;
                const keyCode = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || 0 /* KeyCode.Unknown */;
                const mapping = {
                    scanCode: scanCode,
                    keyCode: keyCode,
                    value: value,
                    withShift: withShift,
                    withAltGr: withAltGr,
                    withShiftAltGr: withShiftAltGr,
                };
                this._codeInfo[scanCode] = mapping;
                this._scanCodeToKeyCode[scanCode] = keyCode;
                if (keyCode === 0 /* KeyCode.Unknown */) {
                    continue;
                }
                this._keyCodeExists[keyCode] = true;
                if (value.length === 0) {
                    // This key does not produce strings
                    this._keyCodeToLabel[keyCode] = null;
                }
                else if (value.length > 1) {
                    // This key produces a letter representable with multiple UTF-16 code units.
                    this._keyCodeToLabel[keyCode] = value;
                }
                else {
                    const charCode = value.charCodeAt(0);
                    if (charCode >= 97 /* CharCode.a */ && charCode <= 122 /* CharCode.z */) {
                        const upperCaseValue = 65 /* CharCode.A */ + (charCode - 97 /* CharCode.a */);
                        producesLetter[upperCaseValue] = true;
                        producesLetters = true;
                        this._keyCodeToLabel[keyCode] = String.fromCharCode(65 /* CharCode.A */ + (charCode - 97 /* CharCode.a */));
                    }
                    else if (charCode >= 65 /* CharCode.A */ && charCode <= 90 /* CharCode.Z */) {
                        producesLetter[charCode] = true;
                        producesLetters = true;
                        this._keyCodeToLabel[keyCode] = value;
                    }
                    else {
                        this._keyCodeToLabel[keyCode] = value;
                    }
                }
            }
        }
        // Handle keyboard layouts where latin characters are not produced e.g. Cyrillic
        const _registerLetterIfMissing = (charCode, keyCode) => {
            if (!producesLetter[charCode]) {
                this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
            }
        };
        _registerLetterIfMissing(65 /* CharCode.A */, 31 /* KeyCode.KeyA */);
        _registerLetterIfMissing(66 /* CharCode.B */, 32 /* KeyCode.KeyB */);
        _registerLetterIfMissing(67 /* CharCode.C */, 33 /* KeyCode.KeyC */);
        _registerLetterIfMissing(68 /* CharCode.D */, 34 /* KeyCode.KeyD */);
        _registerLetterIfMissing(69 /* CharCode.E */, 35 /* KeyCode.KeyE */);
        _registerLetterIfMissing(70 /* CharCode.F */, 36 /* KeyCode.KeyF */);
        _registerLetterIfMissing(71 /* CharCode.G */, 37 /* KeyCode.KeyG */);
        _registerLetterIfMissing(72 /* CharCode.H */, 38 /* KeyCode.KeyH */);
        _registerLetterIfMissing(73 /* CharCode.I */, 39 /* KeyCode.KeyI */);
        _registerLetterIfMissing(74 /* CharCode.J */, 40 /* KeyCode.KeyJ */);
        _registerLetterIfMissing(75 /* CharCode.K */, 41 /* KeyCode.KeyK */);
        _registerLetterIfMissing(76 /* CharCode.L */, 42 /* KeyCode.KeyL */);
        _registerLetterIfMissing(77 /* CharCode.M */, 43 /* KeyCode.KeyM */);
        _registerLetterIfMissing(78 /* CharCode.N */, 44 /* KeyCode.KeyN */);
        _registerLetterIfMissing(79 /* CharCode.O */, 45 /* KeyCode.KeyO */);
        _registerLetterIfMissing(80 /* CharCode.P */, 46 /* KeyCode.KeyP */);
        _registerLetterIfMissing(81 /* CharCode.Q */, 47 /* KeyCode.KeyQ */);
        _registerLetterIfMissing(82 /* CharCode.R */, 48 /* KeyCode.KeyR */);
        _registerLetterIfMissing(83 /* CharCode.S */, 49 /* KeyCode.KeyS */);
        _registerLetterIfMissing(84 /* CharCode.T */, 50 /* KeyCode.KeyT */);
        _registerLetterIfMissing(85 /* CharCode.U */, 51 /* KeyCode.KeyU */);
        _registerLetterIfMissing(86 /* CharCode.V */, 52 /* KeyCode.KeyV */);
        _registerLetterIfMissing(87 /* CharCode.W */, 53 /* KeyCode.KeyW */);
        _registerLetterIfMissing(88 /* CharCode.X */, 54 /* KeyCode.KeyX */);
        _registerLetterIfMissing(89 /* CharCode.Y */, 55 /* KeyCode.KeyY */);
        _registerLetterIfMissing(90 /* CharCode.Z */, 56 /* KeyCode.KeyZ */);
        if (!producesLetters) {
            // Since this keyboard layout produces no latin letters at all, most of the UI will use the
            // US kb layout equivalent for UI labels, so also try to render other keys with the US labels
            // for consistency...
            const _registerLabel = (keyCode, charCode) => {
                // const existingLabel = this._keyCodeToLabel[keyCode];
                // const existingCharCode = (existingLabel ? existingLabel.charCodeAt(0) : CharCode.Null);
                // if (existingCharCode < 32 || existingCharCode > 126) {
                this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
                // }
            };
            _registerLabel(85 /* KeyCode.Semicolon */, 59 /* CharCode.Semicolon */);
            _registerLabel(86 /* KeyCode.Equal */, 61 /* CharCode.Equals */);
            _registerLabel(87 /* KeyCode.Comma */, 44 /* CharCode.Comma */);
            _registerLabel(88 /* KeyCode.Minus */, 45 /* CharCode.Dash */);
            _registerLabel(89 /* KeyCode.Period */, 46 /* CharCode.Period */);
            _registerLabel(90 /* KeyCode.Slash */, 47 /* CharCode.Slash */);
            _registerLabel(91 /* KeyCode.Backquote */, 96 /* CharCode.BackTick */);
            _registerLabel(92 /* KeyCode.BracketLeft */, 91 /* CharCode.OpenSquareBracket */);
            _registerLabel(93 /* KeyCode.Backslash */, 92 /* CharCode.Backslash */);
            _registerLabel(94 /* KeyCode.BracketRight */, 93 /* CharCode.CloseSquareBracket */);
            _registerLabel(95 /* KeyCode.Quote */, 39 /* CharCode.SingleQuote */);
        }
    }
    dumpDebugInfo() {
        const result = [];
        const immutableSamples = [
            88 /* ScanCode.ArrowUp */,
            104 /* ScanCode.Numpad0 */
        ];
        let cnt = 0;
        result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
        for (let scanCode = 0 /* ScanCode.None */; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
            if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1 /* KeyCode.DependsOnKbLayout */) {
                if (immutableSamples.indexOf(scanCode) === -1) {
                    continue;
                }
            }
            if (cnt % 6 === 0) {
                result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |        User settings       | WYSIWYG |`);
                result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
            }
            cnt++;
            const mapping = this._codeInfo[scanCode];
            const strCode = ScanCodeUtils.toString(scanCode);
            const mods = [0b000, 0b010, 0b101, 0b111];
            for (const mod of mods) {
                const ctrlKey = (mod & 0b001) ? true : false;
                const shiftKey = (mod & 0b010) ? true : false;
                const altKey = (mod & 0b100) ? true : false;
                const scanCodeChord = new ScanCodeChord(ctrlKey, shiftKey, altKey, false, scanCode);
                const keyCodeChord = this._resolveChord(scanCodeChord);
                const strKeyCode = (keyCodeChord ? KeyCodeUtils.toString(keyCodeChord.keyCode) : null);
                const resolvedKb = (keyCodeChord ? new WindowsNativeResolvedKeybinding(this, [keyCodeChord]) : null);
                const outScanCode = `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strCode}`;
                const ariaLabel = (resolvedKb ? resolvedKb.getAriaLabel() : null);
                const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
                const outUserSettings = (resolvedKb ? resolvedKb.getUserSettingsLabel() : null);
                const outKey = WindowsNativeResolvedKeybinding.getProducedChar(scanCodeChord, mapping);
                const outKb = (strKeyCode ? `${ctrlKey ? 'Ctrl+' : ''}${shiftKey ? 'Shift+' : ''}${altKey ? 'Alt+' : ''}${strKeyCode}` : null);
                const isWYSIWYG = (resolvedKb ? resolvedKb.isWYSIWYG() : false);
                const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');
                result.push(`| ${this._leftPad(outScanCode, 30)} | ${outKey} | ${this._leftPad(outKb, 25)} | ${this._leftPad(outUILabel, 25)} |  ${this._leftPad(outUserSettings, 25)} | ${outWYSIWYG} |`);
            }
            result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
        }
        return result.join('\n');
    }
    _leftPad(str, cnt) {
        if (str === null) {
            str = 'null';
        }
        while (str.length < cnt) {
            str = ' ' + str;
        }
        return str;
    }
    getUILabelForKeyCode(keyCode) {
        return this._getLabelForKeyCode(keyCode);
    }
    getAriaLabelForKeyCode(keyCode) {
        return this._getLabelForKeyCode(keyCode);
    }
    getUserSettingsLabelForKeyCode(keyCode) {
        if (this._isUSStandard) {
            return KeyCodeUtils.toUserSettingsUS(keyCode);
        }
        return KeyCodeUtils.toUserSettingsGeneral(keyCode);
    }
    getElectronAcceleratorForKeyBinding(chord) {
        return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
    }
    _getLabelForKeyCode(keyCode) {
        return this._keyCodeToLabel[keyCode] || KeyCodeUtils.toString(0 /* KeyCode.Unknown */);
    }
    resolveKeyboardEvent(keyboardEvent) {
        const ctrlKey = keyboardEvent.ctrlKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
        const altKey = keyboardEvent.altKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
        const chord = new KeyCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
        return new WindowsNativeResolvedKeybinding(this, [chord]);
    }
    _resolveChord(chord) {
        if (!chord) {
            return null;
        }
        if (chord instanceof KeyCodeChord) {
            if (!this._keyCodeExists[chord.keyCode]) {
                return null;
            }
            return chord;
        }
        const keyCode = this._scanCodeToKeyCode[chord.scanCode] || 0 /* KeyCode.Unknown */;
        if (keyCode === 0 /* KeyCode.Unknown */ || !this._keyCodeExists[keyCode]) {
            return null;
        }
        return new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, keyCode);
    }
    resolveKeybinding(keybinding) {
        const chords = toEmptyArrayIfContainsNull(keybinding.chords.map(chord => this._resolveChord(chord)));
        if (chords.length > 0) {
            return [new WindowsNativeResolvedKeybinding(this, chords)];
        }
        return [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2luZG93c0tleWJvYXJkTWFwcGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2tleWJpbmRpbmcvY29tbW9uL3dpbmRvd3NLZXlib2FyZE1hcHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQVcsWUFBWSxFQUFFLDBCQUEwQixFQUFZLGFBQWEsRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3RLLE9BQU8sRUFBc0IsWUFBWSxFQUF1QixhQUFhLEVBQXFCLE1BQU0sd0NBQXdDLENBQUM7QUFDakosT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBSTlFLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGtFQUFrRSxDQUFDO0FBRzlHLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQztBQUNsQixTQUFTLEdBQUcsQ0FBQyxHQUFXO0lBQ3ZCLElBQUksR0FBRyxFQUFFLENBQUM7UUFDVCxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ25CLENBQUM7QUFDRixDQUFDO0FBWUQsTUFBTSxPQUFPLCtCQUFnQyxTQUFRLHNCQUFvQztJQUl4RixZQUFZLE1BQTZCLEVBQUUsTUFBc0I7UUFDaEUsS0FBSyxrQ0FBMEIsTUFBTSxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLE9BQU8sR0FBRyxNQUFNLENBQUM7SUFDdkIsQ0FBQztJQUVTLFNBQVMsQ0FBQyxLQUFtQjtRQUN0QyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDckMsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN6RCxDQUFDO0lBRU8sd0JBQXdCLENBQUMsS0FBbUI7UUFDbkQsSUFBSSxLQUFLLENBQUMsdUJBQXVCLEVBQUUsRUFBRSxDQUFDO1lBQ3JDLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUNELE9BQU8sWUFBWSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVNLFVBQVU7UUFDaEIsT0FBTyxlQUFlLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDbkgsQ0FBQztJQUVTLGFBQWEsQ0FBQyxLQUFtQjtRQUMxQyxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDckMsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMzRCxDQUFDO0lBRVMsdUJBQXVCLENBQUMsS0FBbUI7UUFDcEQsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLG1DQUFtQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hFLENBQUM7SUFFUyxxQkFBcUIsQ0FBQyxLQUFtQjtRQUNsRCxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDckMsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRVMsVUFBVSxDQUFDLEtBQW1CO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEMsQ0FBQztJQUVPLFdBQVcsQ0FBQyxPQUFnQjtRQUNuQyxJQUNDLE9BQU8sK0JBQXNCO2VBQzFCLE9BQU8sNkJBQW9CO2VBQzNCLE9BQU8sZ0NBQXVCO2VBQzlCLE9BQU8sK0JBQXNCLEVBQy9CLENBQUM7WUFDRixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLHNCQUFzQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQy9ELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyw4QkFBOEIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMvRSxPQUFPLENBQUMsU0FBUyxLQUFLLGlCQUFpQixDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVTLGlCQUFpQixDQUFDLEtBQW1CO1FBQzlDLElBQUksS0FBSyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUM7WUFDM0IsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBRWhCLElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25CLE1BQU0sSUFBSSxPQUFPLENBQUM7UUFDbkIsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3BCLE1BQU0sSUFBSSxRQUFRLENBQUM7UUFDcEIsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2xCLE1BQU0sSUFBSSxNQUFNLENBQUM7UUFDbEIsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ25CLE1BQU0sSUFBSSxPQUFPLENBQUM7UUFDbkIsQ0FBQztRQUNELE1BQU0sSUFBSSxZQUFZLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUUvQyxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFUywrQkFBK0IsQ0FBQyxLQUFtQjtRQUM1RCxJQUFJLEtBQUssQ0FBQyxPQUFPLHlCQUFpQixJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUYsT0FBTyxNQUFNLENBQUM7UUFDZixDQUFDO1FBQ0QsSUFBSSxLQUFLLENBQUMsT0FBTywwQkFBa0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQzFGLE9BQU8sT0FBTyxDQUFDO1FBQ2hCLENBQUM7UUFDRCxJQUFJLEtBQUssQ0FBQyxPQUFPLHdCQUFnQixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxRQUFRLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDMUYsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBQ0QsSUFBSSxLQUFLLENBQUMsT0FBTywwQkFBaUIsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFGLE9BQU8sTUFBTSxDQUFDO1FBQ2YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVPLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxLQUFvQixFQUFFLE9BQXlCO1FBQ2pGLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNkLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLENBQUMsUUFBUSxJQUFJLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNyRCxPQUFPLE9BQU8sQ0FBQyxjQUFjLENBQUM7UUFDL0IsQ0FBQztRQUNELElBQUksS0FBSyxDQUFDLE9BQU8sSUFBSSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDbkMsT0FBTyxPQUFPLENBQUMsU0FBUyxDQUFDO1FBQzFCLENBQUM7UUFDRCxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNwQixPQUFPLE9BQU8sQ0FBQyxTQUFTLENBQUM7UUFDMUIsQ0FBQztRQUNELE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQztJQUN0QixDQUFDO0lBRU0sTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFvQixFQUFFLE9BQXlCO1FBQzVFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdEQsSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLENBQUM7WUFDeEMsT0FBTyxPQUFPLENBQUM7UUFDaEIsQ0FBQztRQUNELE9BQU8sSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7SUFDM0IsQ0FBQztDQUNEO0FBRUQsTUFBTSxPQUFPLHFCQUFxQjtJQU9qQyxZQUNrQixhQUFzQixFQUN2QyxXQUFvQyxFQUNuQixrQkFBMkI7UUFGM0Isa0JBQWEsR0FBYixhQUFhLENBQVM7UUFFdEIsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFTO1FBTjVCLG9CQUFlLEdBQXlCLEVBQUUsQ0FBQztRQVEzRCxJQUFJLENBQUMsa0JBQWtCLEdBQUcsRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO1FBQzFCLElBQUksQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxlQUFlLHlCQUFpQixHQUFHLFlBQVksQ0FBQyxRQUFRLHlCQUFpQixDQUFDO1FBRS9FLEtBQUssSUFBSSxRQUFRLHdCQUFnQixFQUFFLFFBQVEsK0JBQXFCLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUM5RSxNQUFNLGdCQUFnQixHQUFHLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzlELElBQUksZ0JBQWdCLHVDQUE4QixFQUFFLENBQUM7Z0JBQ3BELElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztnQkFDckQsSUFBSSxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLFlBQVksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztnQkFDakYsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksQ0FBQztZQUM5QyxDQUFDO1FBQ0YsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFjLEVBQUUsQ0FBQztRQUNyQyxJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUM7UUFFNUIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDcEIsS0FBSyxNQUFNLE9BQU8sSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUNuQyxJQUFJLFdBQVcsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztnQkFDekMsTUFBTSxRQUFRLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDL0MsSUFBSSxRQUFRLDBCQUFrQixFQUFFLENBQUM7b0JBQ2hDLEdBQUcsQ0FBQyxvQkFBb0IsT0FBTyxjQUFjLENBQUMsQ0FBQztvQkFDL0MsU0FBUztnQkFDVixDQUFDO2dCQUNELE1BQU0sVUFBVSxHQUFHLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFFeEMsTUFBTSxnQkFBZ0IsR0FBRywwQkFBMEIsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDOUQsSUFBSSxnQkFBZ0IsdUNBQThCLEVBQUUsQ0FBQztvQkFDcEQsTUFBTSxPQUFPLEdBQUcsbUNBQW1DLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQywyQkFBbUIsQ0FBQztvQkFDeEYsSUFBSSxPQUFPLDRCQUFvQixJQUFJLGdCQUFnQixLQUFLLE9BQU8sRUFBRSxDQUFDO3dCQUNqRSxTQUFTO29CQUNWLENBQUM7b0JBQ0QsSUFBSSxRQUFRLG1DQUF5QixFQUFFLENBQUM7d0JBQ3ZDLGlGQUFpRjt3QkFDakYsb0JBQW9CO3dCQUNwQixTQUFTO29CQUNWLENBQUM7Z0JBQ0YsQ0FBQztnQkFFRCxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO2dCQUMvQixNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUN2QyxNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsU0FBUyxDQUFDO2dCQUN2QyxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUMsY0FBYyxDQUFDO2dCQUNqRCxNQUFNLE9BQU8sR0FBRyxtQ0FBbUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLDJCQUFtQixDQUFDO2dCQUV4RixNQUFNLE9BQU8sR0FBcUI7b0JBQ2pDLFFBQVEsRUFBRSxRQUFRO29CQUNsQixPQUFPLEVBQUUsT0FBTztvQkFDaEIsS0FBSyxFQUFFLEtBQUs7b0JBQ1osU0FBUyxFQUFFLFNBQVM7b0JBQ3BCLFNBQVMsRUFBRSxTQUFTO29CQUNwQixjQUFjLEVBQUUsY0FBYztpQkFDOUIsQ0FBQztnQkFDRixJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLE9BQU8sQ0FBQztnQkFDbkMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxHQUFHLE9BQU8sQ0FBQztnQkFFNUMsSUFBSSxPQUFPLDRCQUFvQixFQUFFLENBQUM7b0JBQ2pDLFNBQVM7Z0JBQ1YsQ0FBQztnQkFDRCxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQztnQkFFcEMsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxDQUFDO29CQUN4QixvQ0FBb0M7b0JBQ3BDLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEdBQUcsSUFBSSxDQUFDO2dCQUN0QyxDQUFDO3FCQUVJLElBQUksS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDM0IsNEVBQTRFO29CQUM1RSxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztnQkFDdkMsQ0FBQztxQkFFSSxDQUFDO29CQUNMLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBRXJDLElBQUksUUFBUSx1QkFBYyxJQUFJLFFBQVEsd0JBQWMsRUFBRSxDQUFDO3dCQUN0RCxNQUFNLGNBQWMsR0FBRyxzQkFBYSxDQUFDLFFBQVEsc0JBQWEsQ0FBQyxDQUFDO3dCQUM1RCxjQUFjLENBQUMsY0FBYyxDQUFDLEdBQUcsSUFBSSxDQUFDO3dCQUN0QyxlQUFlLEdBQUcsSUFBSSxDQUFDO3dCQUN2QixJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsc0JBQWEsQ0FBQyxRQUFRLHNCQUFhLENBQUMsQ0FBQyxDQUFDO29CQUMzRixDQUFDO3lCQUVJLElBQUksUUFBUSx1QkFBYyxJQUFJLFFBQVEsdUJBQWMsRUFBRSxDQUFDO3dCQUMzRCxjQUFjLENBQUMsUUFBUSxDQUFDLEdBQUcsSUFBSSxDQUFDO3dCQUNoQyxlQUFlLEdBQUcsSUFBSSxDQUFDO3dCQUN2QixJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztvQkFDdkMsQ0FBQzt5QkFFSSxDQUFDO3dCQUNMLElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDO29CQUN2QyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELGdGQUFnRjtRQUNoRixNQUFNLHdCQUF3QixHQUFHLENBQUMsUUFBa0IsRUFBRSxPQUFnQixFQUFRLEVBQUU7WUFDL0UsSUFBSSxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO2dCQUMvQixJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDL0QsQ0FBQztRQUNGLENBQUMsQ0FBQztRQUNGLHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFDbkQsd0JBQXdCLDRDQUEwQixDQUFDO1FBQ25ELHdCQUF3Qiw0Q0FBMEIsQ0FBQztRQUNuRCx3QkFBd0IsNENBQTBCLENBQUM7UUFFbkQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO1lBQ3RCLDJGQUEyRjtZQUMzRiw2RkFBNkY7WUFDN0YscUJBQXFCO1lBQ3JCLE1BQU0sY0FBYyxHQUFHLENBQUMsT0FBZ0IsRUFBRSxRQUFrQixFQUFRLEVBQUU7Z0JBQ3JFLHVEQUF1RDtnQkFDdkQsMEZBQTBGO2dCQUMxRix5REFBeUQ7Z0JBQ3pELElBQUksQ0FBQyxlQUFlLENBQUMsT0FBTyxDQUFDLEdBQUcsTUFBTSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDOUQsSUFBSTtZQUNMLENBQUMsQ0FBQztZQUNGLGNBQWMseURBQXVDLENBQUM7WUFDdEQsY0FBYyxrREFBZ0MsQ0FBQztZQUMvQyxjQUFjLGlEQUErQixDQUFDO1lBQzlDLGNBQWMsZ0RBQThCLENBQUM7WUFDN0MsY0FBYyxtREFBaUMsQ0FBQztZQUNoRCxjQUFjLGlEQUErQixDQUFDO1lBQzlDLGNBQWMsd0RBQXNDLENBQUM7WUFDckQsY0FBYyxtRUFBaUQsQ0FBQztZQUNoRSxjQUFjLHlEQUF1QyxDQUFDO1lBQ3RELGNBQWMscUVBQW1ELENBQUM7WUFDbEUsY0FBYyx1REFBcUMsQ0FBQztRQUNyRCxDQUFDO0lBQ0YsQ0FBQztJQUVNLGFBQWE7UUFDbkIsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO1FBRTVCLE1BQU0sZ0JBQWdCLEdBQUc7OztTQUd4QixDQUFDO1FBRUYsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDO1FBQ1osTUFBTSxDQUFDLElBQUksQ0FBQywySUFBMkksQ0FBQyxDQUFDO1FBQ3pKLEtBQUssSUFBSSxRQUFRLHdCQUFnQixFQUFFLFFBQVEsK0JBQXFCLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQztZQUM5RSxJQUFJLDBCQUEwQixDQUFDLFFBQVEsQ0FBQyx1Q0FBOEIsRUFBRSxDQUFDO2dCQUN4RSxJQUFJLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDO29CQUMvQyxTQUFTO2dCQUNWLENBQUM7WUFDRixDQUFDO1lBRUQsSUFBSSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNuQixNQUFNLENBQUMsSUFBSSxDQUFDLDJJQUEySSxDQUFDLENBQUM7Z0JBQ3pKLE1BQU0sQ0FBQyxJQUFJLENBQUMsMklBQTJJLENBQUMsQ0FBQztZQUMxSixDQUFDO1lBQ0QsR0FBRyxFQUFFLENBQUM7WUFFTixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ3pDLE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFakQsTUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUMxQyxLQUFLLE1BQU0sR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO2dCQUN4QixNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQzdDLE1BQU0sUUFBUSxHQUFHLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztnQkFDOUMsTUFBTSxNQUFNLEdBQUcsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO2dCQUM1QyxNQUFNLGFBQWEsR0FBRyxJQUFJLGFBQWEsQ0FBQyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3BGLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sVUFBVSxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3ZGLE1BQU0sVUFBVSxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLCtCQUErQixDQUFDLElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUVyRyxNQUFNLFdBQVcsR0FBRyxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLE9BQU8sRUFBRSxDQUFDO2dCQUM1RyxNQUFNLFNBQVMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDbEUsTUFBTSxVQUFVLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDaEYsTUFBTSxlQUFlLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDaEYsTUFBTSxNQUFNLEdBQUcsK0JBQStCLENBQUMsZUFBZSxDQUFDLGFBQWEsRUFBRSxPQUFPLENBQUMsQ0FBQztnQkFDdkYsTUFBTSxLQUFLLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUMvSCxNQUFNLFNBQVMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDaEUsTUFBTSxVQUFVLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsTUFBTSxNQUFNLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsRUFBRSxDQUFDLE1BQU0sVUFBVSxJQUFJLENBQUMsQ0FBQztZQUM1TCxDQUFDO1lBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQywySUFBMkksQ0FBQyxDQUFDO1FBQzFKLENBQUM7UUFHRCxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVPLFFBQVEsQ0FBQyxHQUFrQixFQUFFLEdBQVc7UUFDL0MsSUFBSSxHQUFHLEtBQUssSUFBSSxFQUFFLENBQUM7WUFDbEIsR0FBRyxHQUFHLE1BQU0sQ0FBQztRQUNkLENBQUM7UUFDRCxPQUFPLEdBQUcsQ0FBQyxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUM7WUFDekIsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDakIsQ0FBQztRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ1osQ0FBQztJQUVNLG9CQUFvQixDQUFDLE9BQWdCO1FBQzNDLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFFTSxzQkFBc0IsQ0FBQyxPQUFnQjtRQUM3QyxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMxQyxDQUFDO0lBRU0sOEJBQThCLENBQUMsT0FBZ0I7UUFDckQsSUFBSSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDeEIsT0FBTyxZQUFZLENBQUMsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0MsQ0FBQztRQUNELE9BQU8sWUFBWSxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFFTSxtQ0FBbUMsQ0FBQyxLQUFtQjtRQUM3RCxPQUFPLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDMUQsQ0FBQztJQUVPLG1CQUFtQixDQUFDLE9BQWdCO1FBQzNDLE9BQU8sSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxZQUFZLENBQUMsUUFBUSx5QkFBaUIsQ0FBQztJQUNoRixDQUFDO0lBRU0sb0JBQW9CLENBQUMsYUFBNkI7UUFDeEQsTUFBTSxPQUFPLEdBQUcsYUFBYSxDQUFDLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDaEcsTUFBTSxNQUFNLEdBQUcsYUFBYSxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsSUFBSSxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDOUYsTUFBTSxLQUFLLEdBQUcsSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFLGFBQWEsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLGFBQWEsQ0FBQyxPQUFPLEVBQUUsYUFBYSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3RILE9BQU8sSUFBSSwrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBQzNELENBQUM7SUFFTyxhQUFhLENBQUMsS0FBbUI7UUFDeEMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ1osT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxLQUFLLFlBQVksWUFBWSxFQUFFLENBQUM7WUFDbkMsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7Z0JBQ3pDLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLDJCQUFtQixDQUFDO1FBQzNFLElBQUksT0FBTyw0QkFBb0IsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNsRSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDOUYsQ0FBQztJQUVNLGlCQUFpQixDQUFDLFVBQXNCO1FBQzlDLE1BQU0sTUFBTSxHQUFtQiwwQkFBMEIsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JILElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUN2QixPQUFPLENBQUMsSUFBSSwrQkFBK0IsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUM1RCxDQUFDO1FBQ0QsT0FBTyxFQUFFLENBQUM7SUFDWCxDQUFDO0NBQ0QifQ==