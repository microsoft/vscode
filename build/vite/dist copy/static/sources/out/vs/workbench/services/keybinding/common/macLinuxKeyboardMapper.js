/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, IMMUTABLE_KEY_CODE_TO_CODE, ScanCodeUtils, isModifierKey } from '../../../../base/common/keyCodes.js';
import { KeyCodeChord, ScanCodeChord } from '../../../../base/common/keybindings.js';
import { BaseResolvedKeybinding } from '../../../../platform/keybinding/common/baseResolvedKeybinding.js';
/**
 * A map from character to key codes.
 * e.g. Contains entries such as:
 *  - '/' => { keyCode: KeyCode.US_SLASH, shiftKey: false }
 *  - '?' => { keyCode: KeyCode.US_SLASH, shiftKey: true }
 */
const CHAR_CODE_TO_KEY_CODE = [];
export class NativeResolvedKeybinding extends BaseResolvedKeybinding {
    constructor(mapper, os, chords) {
        super(os, chords);
        this._mapper = mapper;
    }
    _getLabel(chord) {
        return this._mapper.getUILabelForScanCodeChord(chord);
    }
    _getAriaLabel(chord) {
        return this._mapper.getAriaLabelForScanCodeChord(chord);
    }
    _getElectronAccelerator(chord) {
        return this._mapper.getElectronAcceleratorLabelForScanCodeChord(chord);
    }
    _getUserSettingsLabel(chord) {
        return this._mapper.getUserSettingsLabelForScanCodeChord(chord);
    }
    _isWYSIWYG(binding) {
        if (!binding) {
            return true;
        }
        if (IMMUTABLE_CODE_TO_KEY_CODE[binding.scanCode] !== -1 /* KeyCode.DependsOnKbLayout */) {
            return true;
        }
        const a = this._mapper.getAriaLabelForScanCodeChord(binding);
        const b = this._mapper.getUserSettingsLabelForScanCodeChord(binding);
        if (!a && !b) {
            return true;
        }
        if (!a || !b) {
            return false;
        }
        return (a.toLowerCase() === b.toLowerCase());
    }
    _getChordDispatch(chord) {
        return this._mapper.getDispatchStrForScanCodeChord(chord);
    }
    _getSingleModifierChordDispatch(chord) {
        if ((chord.scanCode === 157 /* ScanCode.ControlLeft */ || chord.scanCode === 161 /* ScanCode.ControlRight */) && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
            return 'ctrl';
        }
        if ((chord.scanCode === 159 /* ScanCode.AltLeft */ || chord.scanCode === 163 /* ScanCode.AltRight */) && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
            return 'alt';
        }
        if ((chord.scanCode === 158 /* ScanCode.ShiftLeft */ || chord.scanCode === 162 /* ScanCode.ShiftRight */) && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
            return 'shift';
        }
        if ((chord.scanCode === 160 /* ScanCode.MetaLeft */ || chord.scanCode === 164 /* ScanCode.MetaRight */) && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
            return 'meta';
        }
        return null;
    }
}
class ScanCodeCombo {
    constructor(ctrlKey, shiftKey, altKey, scanCode) {
        this.ctrlKey = ctrlKey;
        this.shiftKey = shiftKey;
        this.altKey = altKey;
        this.scanCode = scanCode;
    }
    toString() {
        return `${this.ctrlKey ? 'Ctrl+' : ''}${this.shiftKey ? 'Shift+' : ''}${this.altKey ? 'Alt+' : ''}${ScanCodeUtils.toString(this.scanCode)}`;
    }
    equals(other) {
        return (this.ctrlKey === other.ctrlKey
            && this.shiftKey === other.shiftKey
            && this.altKey === other.altKey
            && this.scanCode === other.scanCode);
    }
    getProducedCharCode(mapping) {
        if (!mapping) {
            return '';
        }
        if (this.ctrlKey && this.shiftKey && this.altKey) {
            return mapping.withShiftAltGr;
        }
        if (this.ctrlKey && this.altKey) {
            return mapping.withAltGr;
        }
        if (this.shiftKey) {
            return mapping.withShift;
        }
        return mapping.value;
    }
    getProducedChar(mapping) {
        const charCode = MacLinuxKeyboardMapper.getCharCode(this.getProducedCharCode(mapping));
        if (charCode === 0) {
            return ' --- ';
        }
        if (charCode >= 768 /* CharCode.U_Combining_Grave_Accent */ && charCode <= 879 /* CharCode.U_Combining_Latin_Small_Letter_X */) {
            // combining
            return 'U+' + charCode.toString(16);
        }
        return '  ' + String.fromCharCode(charCode) + '  ';
    }
}
class KeyCodeCombo {
    constructor(ctrlKey, shiftKey, altKey, keyCode) {
        this.ctrlKey = ctrlKey;
        this.shiftKey = shiftKey;
        this.altKey = altKey;
        this.keyCode = keyCode;
    }
    toString() {
        return `${this.ctrlKey ? 'Ctrl+' : ''}${this.shiftKey ? 'Shift+' : ''}${this.altKey ? 'Alt+' : ''}${KeyCodeUtils.toString(this.keyCode)}`;
    }
}
class ScanCodeKeyCodeMapper {
    constructor() {
        /**
         * ScanCode combination => KeyCode combination.
         * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
         */
        this._scanCodeToKeyCode = [];
        /**
         * inverse of `_scanCodeToKeyCode`.
         * KeyCode combination => ScanCode combination.
         * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
         */
        this._keyCodeToScanCode = [];
        this._scanCodeToKeyCode = [];
        this._keyCodeToScanCode = [];
    }
    registrationComplete() {
        // IntlHash and IntlBackslash are rare keys, so ensure they don't end up being the preferred...
        this._moveToEnd(56 /* ScanCode.IntlHash */);
        this._moveToEnd(106 /* ScanCode.IntlBackslash */);
    }
    _moveToEnd(scanCode) {
        for (let mod = 0; mod < 8; mod++) {
            const encodedKeyCodeCombos = this._scanCodeToKeyCode[(scanCode << 3) + mod];
            if (!encodedKeyCodeCombos) {
                continue;
            }
            for (let i = 0, len = encodedKeyCodeCombos.length; i < len; i++) {
                const encodedScanCodeCombos = this._keyCodeToScanCode[encodedKeyCodeCombos[i]];
                if (encodedScanCodeCombos.length === 1) {
                    continue;
                }
                for (let j = 0, len = encodedScanCodeCombos.length; j < len; j++) {
                    const entry = encodedScanCodeCombos[j];
                    const entryScanCode = (entry >>> 3);
                    if (entryScanCode === scanCode) {
                        // Move this entry to the end
                        for (let k = j + 1; k < len; k++) {
                            encodedScanCodeCombos[k - 1] = encodedScanCodeCombos[k];
                        }
                        encodedScanCodeCombos[len - 1] = entry;
                    }
                }
            }
        }
    }
    registerIfUnknown(scanCodeCombo, keyCodeCombo) {
        if (keyCodeCombo.keyCode === 0 /* KeyCode.Unknown */) {
            return;
        }
        const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
        const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
        const keyCodeIsDigit = (keyCodeCombo.keyCode >= 21 /* KeyCode.Digit0 */ && keyCodeCombo.keyCode <= 30 /* KeyCode.Digit9 */);
        const keyCodeIsLetter = (keyCodeCombo.keyCode >= 31 /* KeyCode.KeyA */ && keyCodeCombo.keyCode <= 56 /* KeyCode.KeyZ */);
        const existingKeyCodeCombos = this._scanCodeToKeyCode[scanCodeComboEncoded];
        // Allow a scan code to map to multiple key codes if it is a digit or a letter key code
        if (keyCodeIsDigit || keyCodeIsLetter) {
            // Only check that we don't insert the same entry twice
            if (existingKeyCodeCombos) {
                for (let i = 0, len = existingKeyCodeCombos.length; i < len; i++) {
                    if (existingKeyCodeCombos[i] === keyCodeComboEncoded) {
                        // avoid duplicates
                        return;
                    }
                }
            }
        }
        else {
            // Don't allow multiples
            if (existingKeyCodeCombos && existingKeyCodeCombos.length !== 0) {
                return;
            }
        }
        this._scanCodeToKeyCode[scanCodeComboEncoded] = this._scanCodeToKeyCode[scanCodeComboEncoded] || [];
        this._scanCodeToKeyCode[scanCodeComboEncoded].unshift(keyCodeComboEncoded);
        this._keyCodeToScanCode[keyCodeComboEncoded] = this._keyCodeToScanCode[keyCodeComboEncoded] || [];
        this._keyCodeToScanCode[keyCodeComboEncoded].unshift(scanCodeComboEncoded);
    }
    lookupKeyCodeCombo(keyCodeCombo) {
        const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
        const scanCodeCombosEncoded = this._keyCodeToScanCode[keyCodeComboEncoded];
        if (!scanCodeCombosEncoded || scanCodeCombosEncoded.length === 0) {
            return [];
        }
        const result = [];
        for (let i = 0, len = scanCodeCombosEncoded.length; i < len; i++) {
            const scanCodeComboEncoded = scanCodeCombosEncoded[i];
            const ctrlKey = (scanCodeComboEncoded & 0b001) ? true : false;
            const shiftKey = (scanCodeComboEncoded & 0b010) ? true : false;
            const altKey = (scanCodeComboEncoded & 0b100) ? true : false;
            const scanCode = (scanCodeComboEncoded >>> 3);
            result[i] = new ScanCodeCombo(ctrlKey, shiftKey, altKey, scanCode);
        }
        return result;
    }
    lookupScanCodeCombo(scanCodeCombo) {
        const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
        const keyCodeCombosEncoded = this._scanCodeToKeyCode[scanCodeComboEncoded];
        if (!keyCodeCombosEncoded || keyCodeCombosEncoded.length === 0) {
            return [];
        }
        const result = [];
        for (let i = 0, len = keyCodeCombosEncoded.length; i < len; i++) {
            const keyCodeComboEncoded = keyCodeCombosEncoded[i];
            const ctrlKey = (keyCodeComboEncoded & 0b001) ? true : false;
            const shiftKey = (keyCodeComboEncoded & 0b010) ? true : false;
            const altKey = (keyCodeComboEncoded & 0b100) ? true : false;
            const keyCode = (keyCodeComboEncoded >>> 3);
            result[i] = new KeyCodeCombo(ctrlKey, shiftKey, altKey, keyCode);
        }
        return result;
    }
    guessStableKeyCode(scanCode) {
        if (scanCode >= 36 /* ScanCode.Digit1 */ && scanCode <= 45 /* ScanCode.Digit0 */) {
            // digits are ok
            switch (scanCode) {
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
            }
        }
        // Lookup the scanCode with and without shift and see if the keyCode is stable
        const keyCodeCombos1 = this.lookupScanCodeCombo(new ScanCodeCombo(false, false, false, scanCode));
        const keyCodeCombos2 = this.lookupScanCodeCombo(new ScanCodeCombo(false, true, false, scanCode));
        if (keyCodeCombos1.length === 1 && keyCodeCombos2.length === 1) {
            const shiftKey1 = keyCodeCombos1[0].shiftKey;
            const keyCode1 = keyCodeCombos1[0].keyCode;
            const shiftKey2 = keyCodeCombos2[0].shiftKey;
            const keyCode2 = keyCodeCombos2[0].keyCode;
            if (keyCode1 === keyCode2 && shiftKey1 !== shiftKey2) {
                // This looks like a stable mapping
                return keyCode1;
            }
        }
        return -1 /* KeyCode.DependsOnKbLayout */;
    }
    _encodeScanCodeCombo(scanCodeCombo) {
        return this._encode(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, scanCodeCombo.scanCode);
    }
    _encodeKeyCodeCombo(keyCodeCombo) {
        return this._encode(keyCodeCombo.ctrlKey, keyCodeCombo.shiftKey, keyCodeCombo.altKey, keyCodeCombo.keyCode);
    }
    _encode(ctrlKey, shiftKey, altKey, principal) {
        return (((ctrlKey ? 1 : 0) << 0)
            | ((shiftKey ? 1 : 0) << 1)
            | ((altKey ? 1 : 0) << 2)
            | principal << 3) >>> 0;
    }
}
export class MacLinuxKeyboardMapper {
    constructor(_isUSStandard, rawMappings, _mapAltGrToCtrlAlt, _OS) {
        this._isUSStandard = _isUSStandard;
        this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
        this._OS = _OS;
        /**
         * UI label for a ScanCode.
         */
        this._scanCodeToLabel = [];
        /**
         * Dispatching string for a ScanCode.
         */
        this._scanCodeToDispatch = [];
        this._codeInfo = [];
        this._scanCodeKeyCodeMapper = new ScanCodeKeyCodeMapper();
        this._scanCodeToLabel = [];
        this._scanCodeToDispatch = [];
        const _registerIfUnknown = (hwCtrlKey, hwShiftKey, hwAltKey, scanCode, kbCtrlKey, kbShiftKey, kbAltKey, keyCode) => {
            this._scanCodeKeyCodeMapper.registerIfUnknown(new ScanCodeCombo(hwCtrlKey ? true : false, hwShiftKey ? true : false, hwAltKey ? true : false, scanCode), new KeyCodeCombo(kbCtrlKey ? true : false, kbShiftKey ? true : false, kbAltKey ? true : false, keyCode));
        };
        const _registerAllCombos = (_ctrlKey, _shiftKey, _altKey, scanCode, keyCode) => {
            for (let ctrlKey = _ctrlKey; ctrlKey <= 1; ctrlKey++) {
                for (let shiftKey = _shiftKey; shiftKey <= 1; shiftKey++) {
                    for (let altKey = _altKey; altKey <= 1; altKey++) {
                        _registerIfUnknown(ctrlKey, shiftKey, altKey, scanCode, ctrlKey, shiftKey, altKey, keyCode);
                    }
                }
            }
        };
        // Initialize `_scanCodeToLabel`
        for (let scanCode = 0 /* ScanCode.None */; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
            this._scanCodeToLabel[scanCode] = null;
        }
        // Initialize `_scanCodeToDispatch`
        for (let scanCode = 0 /* ScanCode.None */; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
            this._scanCodeToDispatch[scanCode] = null;
        }
        // Handle immutable mappings
        for (let scanCode = 0 /* ScanCode.None */; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
            const keyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
            if (keyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
                _registerAllCombos(0, 0, 0, scanCode, keyCode);
                this._scanCodeToLabel[scanCode] = KeyCodeUtils.toString(keyCode);
                if (keyCode === 0 /* KeyCode.Unknown */ || isModifierKey(keyCode)) {
                    this._scanCodeToDispatch[scanCode] = null; // cannot dispatch on this ScanCode
                }
                else {
                    this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
                }
            }
        }
        // Try to identify keyboard layouts where characters A-Z are missing
        // and forcibly map them to their corresponding scan codes if that is the case
        const missingLatinLettersOverride = {};
        {
            const producesLatinLetter = [];
            for (const strScanCode in rawMappings) {
                if (rawMappings.hasOwnProperty(strScanCode)) {
                    const scanCode = ScanCodeUtils.toEnum(strScanCode);
                    if (scanCode === 0 /* ScanCode.None */) {
                        continue;
                    }
                    if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1 /* KeyCode.DependsOnKbLayout */) {
                        continue;
                    }
                    const rawMapping = rawMappings[strScanCode];
                    const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
                    if (value >= 97 /* CharCode.a */ && value <= 122 /* CharCode.z */) {
                        const upperCaseValue = 65 /* CharCode.A */ + (value - 97 /* CharCode.a */);
                        producesLatinLetter[upperCaseValue] = true;
                    }
                }
            }
            const _registerLetterIfMissing = (charCode, scanCode, value, withShift) => {
                if (!producesLatinLetter[charCode]) {
                    missingLatinLettersOverride[ScanCodeUtils.toString(scanCode)] = {
                        value: value,
                        withShift: withShift,
                        withAltGr: '',
                        withShiftAltGr: ''
                    };
                }
            };
            // Ensure letters are mapped
            _registerLetterIfMissing(65 /* CharCode.A */, 10 /* ScanCode.KeyA */, 'a', 'A');
            _registerLetterIfMissing(66 /* CharCode.B */, 11 /* ScanCode.KeyB */, 'b', 'B');
            _registerLetterIfMissing(67 /* CharCode.C */, 12 /* ScanCode.KeyC */, 'c', 'C');
            _registerLetterIfMissing(68 /* CharCode.D */, 13 /* ScanCode.KeyD */, 'd', 'D');
            _registerLetterIfMissing(69 /* CharCode.E */, 14 /* ScanCode.KeyE */, 'e', 'E');
            _registerLetterIfMissing(70 /* CharCode.F */, 15 /* ScanCode.KeyF */, 'f', 'F');
            _registerLetterIfMissing(71 /* CharCode.G */, 16 /* ScanCode.KeyG */, 'g', 'G');
            _registerLetterIfMissing(72 /* CharCode.H */, 17 /* ScanCode.KeyH */, 'h', 'H');
            _registerLetterIfMissing(73 /* CharCode.I */, 18 /* ScanCode.KeyI */, 'i', 'I');
            _registerLetterIfMissing(74 /* CharCode.J */, 19 /* ScanCode.KeyJ */, 'j', 'J');
            _registerLetterIfMissing(75 /* CharCode.K */, 20 /* ScanCode.KeyK */, 'k', 'K');
            _registerLetterIfMissing(76 /* CharCode.L */, 21 /* ScanCode.KeyL */, 'l', 'L');
            _registerLetterIfMissing(77 /* CharCode.M */, 22 /* ScanCode.KeyM */, 'm', 'M');
            _registerLetterIfMissing(78 /* CharCode.N */, 23 /* ScanCode.KeyN */, 'n', 'N');
            _registerLetterIfMissing(79 /* CharCode.O */, 24 /* ScanCode.KeyO */, 'o', 'O');
            _registerLetterIfMissing(80 /* CharCode.P */, 25 /* ScanCode.KeyP */, 'p', 'P');
            _registerLetterIfMissing(81 /* CharCode.Q */, 26 /* ScanCode.KeyQ */, 'q', 'Q');
            _registerLetterIfMissing(82 /* CharCode.R */, 27 /* ScanCode.KeyR */, 'r', 'R');
            _registerLetterIfMissing(83 /* CharCode.S */, 28 /* ScanCode.KeyS */, 's', 'S');
            _registerLetterIfMissing(84 /* CharCode.T */, 29 /* ScanCode.KeyT */, 't', 'T');
            _registerLetterIfMissing(85 /* CharCode.U */, 30 /* ScanCode.KeyU */, 'u', 'U');
            _registerLetterIfMissing(86 /* CharCode.V */, 31 /* ScanCode.KeyV */, 'v', 'V');
            _registerLetterIfMissing(87 /* CharCode.W */, 32 /* ScanCode.KeyW */, 'w', 'W');
            _registerLetterIfMissing(88 /* CharCode.X */, 33 /* ScanCode.KeyX */, 'x', 'X');
            _registerLetterIfMissing(89 /* CharCode.Y */, 34 /* ScanCode.KeyY */, 'y', 'Y');
            _registerLetterIfMissing(90 /* CharCode.Z */, 35 /* ScanCode.KeyZ */, 'z', 'Z');
        }
        const mappings = [];
        let mappingsLen = 0;
        for (const strScanCode in rawMappings) {
            if (rawMappings.hasOwnProperty(strScanCode)) {
                const scanCode = ScanCodeUtils.toEnum(strScanCode);
                if (scanCode === 0 /* ScanCode.None */) {
                    continue;
                }
                if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1 /* KeyCode.DependsOnKbLayout */) {
                    continue;
                }
                this._codeInfo[scanCode] = rawMappings[strScanCode];
                const rawMapping = missingLatinLettersOverride[strScanCode] || rawMappings[strScanCode];
                const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
                const withShift = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShift);
                const withAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withAltGr);
                const withShiftAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShiftAltGr);
                const mapping = {
                    scanCode: scanCode,
                    value: value,
                    withShift: withShift,
                    withAltGr: withAltGr,
                    withShiftAltGr: withShiftAltGr,
                };
                mappings[mappingsLen++] = mapping;
                this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
                if (value >= 97 /* CharCode.a */ && value <= 122 /* CharCode.z */) {
                    const upperCaseValue = 65 /* CharCode.A */ + (value - 97 /* CharCode.a */);
                    this._scanCodeToLabel[scanCode] = String.fromCharCode(upperCaseValue);
                }
                else if (value >= 65 /* CharCode.A */ && value <= 90 /* CharCode.Z */) {
                    this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
                }
                else if (value) {
                    this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
                }
                else {
                    this._scanCodeToLabel[scanCode] = null;
                }
            }
        }
        // Handle all `withShiftAltGr` entries
        for (let i = mappings.length - 1; i >= 0; i--) {
            const mapping = mappings[i];
            const scanCode = mapping.scanCode;
            const withShiftAltGr = mapping.withShiftAltGr;
            if (withShiftAltGr === mapping.withAltGr || withShiftAltGr === mapping.withShift || withShiftAltGr === mapping.value) {
                // handled below
                continue;
            }
            const kb = MacLinuxKeyboardMapper._charCodeToKb(withShiftAltGr);
            if (!kb) {
                continue;
            }
            const kbShiftKey = kb.shiftKey;
            const keyCode = kb.keyCode;
            if (kbShiftKey) {
                // Ctrl+Shift+Alt+ScanCode => Shift+KeyCode
                _registerIfUnknown(1, 1, 1, scanCode, 0, 1, 0, keyCode); //       Ctrl+Alt+ScanCode =>          Shift+KeyCode
            }
            else {
                // Ctrl+Shift+Alt+ScanCode => KeyCode
                _registerIfUnknown(1, 1, 1, scanCode, 0, 0, 0, keyCode); //       Ctrl+Alt+ScanCode =>                KeyCode
            }
        }
        // Handle all `withAltGr` entries
        for (let i = mappings.length - 1; i >= 0; i--) {
            const mapping = mappings[i];
            const scanCode = mapping.scanCode;
            const withAltGr = mapping.withAltGr;
            if (withAltGr === mapping.withShift || withAltGr === mapping.value) {
                // handled below
                continue;
            }
            const kb = MacLinuxKeyboardMapper._charCodeToKb(withAltGr);
            if (!kb) {
                continue;
            }
            const kbShiftKey = kb.shiftKey;
            const keyCode = kb.keyCode;
            if (kbShiftKey) {
                // Ctrl+Alt+ScanCode => Shift+KeyCode
                _registerIfUnknown(1, 0, 1, scanCode, 0, 1, 0, keyCode); //       Ctrl+Alt+ScanCode =>          Shift+KeyCode
            }
            else {
                // Ctrl+Alt+ScanCode => KeyCode
                _registerIfUnknown(1, 0, 1, scanCode, 0, 0, 0, keyCode); //       Ctrl+Alt+ScanCode =>                KeyCode
            }
        }
        // Handle all `withShift` entries
        for (let i = mappings.length - 1; i >= 0; i--) {
            const mapping = mappings[i];
            const scanCode = mapping.scanCode;
            const withShift = mapping.withShift;
            if (withShift === mapping.value) {
                // handled below
                continue;
            }
            const kb = MacLinuxKeyboardMapper._charCodeToKb(withShift);
            if (!kb) {
                continue;
            }
            const kbShiftKey = kb.shiftKey;
            const keyCode = kb.keyCode;
            if (kbShiftKey) {
                // Shift+ScanCode => Shift+KeyCode
                _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
                _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Alt+ScanCode =>      Shift+Alt+KeyCode
                _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctrl+Shift+ScanCode =>     Ctrl+Shift+KeyCode
                _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctrl+Shift+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
            }
            else {
                // Shift+ScanCode => KeyCode
                _registerIfUnknown(0, 1, 0, scanCode, 0, 0, 0, keyCode); //          Shift+ScanCode =>                KeyCode
                _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
                _registerIfUnknown(0, 1, 1, scanCode, 0, 0, 1, keyCode); //      Shift+Alt+ScanCode =>            Alt+KeyCode
                _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Alt+ScanCode =>      Shift+Alt+KeyCode
                _registerIfUnknown(1, 1, 0, scanCode, 1, 0, 0, keyCode); //     Ctrl+Shift+ScanCode =>           Ctrl+KeyCode
                _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctrl+Shift+ScanCode =>     Ctrl+Shift+KeyCode
                _registerIfUnknown(1, 1, 1, scanCode, 1, 0, 1, keyCode); // Ctrl+Shift+Alt+ScanCode =>       Ctrl+Alt+KeyCode
                _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctrl+Shift+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
            }
        }
        // Handle all `value` entries
        for (let i = mappings.length - 1; i >= 0; i--) {
            const mapping = mappings[i];
            const scanCode = mapping.scanCode;
            const kb = MacLinuxKeyboardMapper._charCodeToKb(mapping.value);
            if (!kb) {
                continue;
            }
            const kbShiftKey = kb.shiftKey;
            const keyCode = kb.keyCode;
            if (kbShiftKey) {
                // ScanCode => Shift+KeyCode
                _registerIfUnknown(0, 0, 0, scanCode, 0, 1, 0, keyCode); //                ScanCode =>          Shift+KeyCode
                _registerIfUnknown(0, 0, 1, scanCode, 0, 1, 1, keyCode); //            Alt+ScanCode =>      Shift+Alt+KeyCode
                _registerIfUnknown(1, 0, 0, scanCode, 1, 1, 0, keyCode); //           Ctrl+ScanCode =>     Ctrl+Shift+KeyCode
                _registerIfUnknown(1, 0, 1, scanCode, 1, 1, 1, keyCode); //       Ctrl+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
            }
            else {
                // ScanCode => KeyCode
                _registerIfUnknown(0, 0, 0, scanCode, 0, 0, 0, keyCode); //                ScanCode =>                KeyCode
                _registerIfUnknown(0, 0, 1, scanCode, 0, 0, 1, keyCode); //            Alt+ScanCode =>            Alt+KeyCode
                _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode); //          Shift+ScanCode =>          Shift+KeyCode
                _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode); //      Shift+Alt+ScanCode =>      Shift+Alt+KeyCode
                _registerIfUnknown(1, 0, 0, scanCode, 1, 0, 0, keyCode); //           Ctrl+ScanCode =>           Ctrl+KeyCode
                _registerIfUnknown(1, 0, 1, scanCode, 1, 0, 1, keyCode); //       Ctrl+Alt+ScanCode =>       Ctrl+Alt+KeyCode
                _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode); //     Ctrl+Shift+ScanCode =>     Ctrl+Shift+KeyCode
                _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode); // Ctrl+Shift+Alt+ScanCode => Ctrl+Shift+Alt+KeyCode
            }
        }
        // Handle all left-over available digits
        _registerAllCombos(0, 0, 0, 36 /* ScanCode.Digit1 */, 22 /* KeyCode.Digit1 */);
        _registerAllCombos(0, 0, 0, 37 /* ScanCode.Digit2 */, 23 /* KeyCode.Digit2 */);
        _registerAllCombos(0, 0, 0, 38 /* ScanCode.Digit3 */, 24 /* KeyCode.Digit3 */);
        _registerAllCombos(0, 0, 0, 39 /* ScanCode.Digit4 */, 25 /* KeyCode.Digit4 */);
        _registerAllCombos(0, 0, 0, 40 /* ScanCode.Digit5 */, 26 /* KeyCode.Digit5 */);
        _registerAllCombos(0, 0, 0, 41 /* ScanCode.Digit6 */, 27 /* KeyCode.Digit6 */);
        _registerAllCombos(0, 0, 0, 42 /* ScanCode.Digit7 */, 28 /* KeyCode.Digit7 */);
        _registerAllCombos(0, 0, 0, 43 /* ScanCode.Digit8 */, 29 /* KeyCode.Digit8 */);
        _registerAllCombos(0, 0, 0, 44 /* ScanCode.Digit9 */, 30 /* KeyCode.Digit9 */);
        _registerAllCombos(0, 0, 0, 45 /* ScanCode.Digit0 */, 21 /* KeyCode.Digit0 */);
        this._scanCodeKeyCodeMapper.registrationComplete();
    }
    dumpDebugInfo() {
        const result = [];
        const immutableSamples = [
            88 /* ScanCode.ArrowUp */,
            104 /* ScanCode.Numpad0 */
        ];
        let cnt = 0;
        result.push(`isUSStandard: ${this._isUSStandard}`);
        result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
        for (let scanCode = 0 /* ScanCode.None */; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
            if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== -1 /* KeyCode.DependsOnKbLayout */) {
                if (immutableSamples.indexOf(scanCode) === -1) {
                    continue;
                }
            }
            if (cnt % 4 === 0) {
                result.push(`|       HW Code combination      |  Key  |    KeyCode combination    | Pri |          UI label         |         User settings          |    Electron accelerator   |       Dispatching string       | WYSIWYG |`);
                result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
            }
            cnt++;
            const mapping = this._codeInfo[scanCode];
            for (let mod = 0; mod < 8; mod++) {
                const hwCtrlKey = (mod & 0b001) ? true : false;
                const hwShiftKey = (mod & 0b010) ? true : false;
                const hwAltKey = (mod & 0b100) ? true : false;
                const scanCodeCombo = new ScanCodeCombo(hwCtrlKey, hwShiftKey, hwAltKey, scanCode);
                const resolvedKb = this.resolveKeyboardEvent({
                    _standardKeyboardEventBrand: true,
                    ctrlKey: scanCodeCombo.ctrlKey,
                    shiftKey: scanCodeCombo.shiftKey,
                    altKey: scanCodeCombo.altKey,
                    metaKey: false,
                    altGraphKey: false,
                    keyCode: -1 /* KeyCode.DependsOnKbLayout */,
                    code: ScanCodeUtils.toString(scanCode)
                });
                const outScanCodeCombo = scanCodeCombo.toString();
                const outKey = scanCodeCombo.getProducedChar(mapping);
                const ariaLabel = resolvedKb.getAriaLabel();
                const outUILabel = (ariaLabel ? ariaLabel.replace(/Control\+/, 'Ctrl+') : null);
                const outUserSettings = resolvedKb.getUserSettingsLabel();
                const outElectronAccelerator = resolvedKb.getElectronAccelerator();
                const outDispatchStr = resolvedKb.getDispatchChords()[0];
                const isWYSIWYG = (resolvedKb ? resolvedKb.isWYSIWYG() : false);
                const outWYSIWYG = (isWYSIWYG ? '       ' : '   NO  ');
                const kbCombos = this._scanCodeKeyCodeMapper.lookupScanCodeCombo(scanCodeCombo);
                if (kbCombos.length === 0) {
                    result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad('', 25)} | ${this._leftPad('', 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
                }
                else {
                    for (let i = 0, len = kbCombos.length; i < len; i++) {
                        const kbCombo = kbCombos[i];
                        // find out the priority of this scan code for this key code
                        let colPriority;
                        const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(kbCombo);
                        if (scanCodeCombos.length === 1) {
                            // no need for priority, this key code combo maps to precisely this scan code combo
                            colPriority = '';
                        }
                        else {
                            let priority = -1;
                            for (let j = 0; j < scanCodeCombos.length; j++) {
                                if (scanCodeCombos[j].equals(scanCodeCombo)) {
                                    priority = j + 1;
                                    break;
                                }
                            }
                            colPriority = String(priority);
                        }
                        const outKeybinding = kbCombo.toString();
                        if (i === 0) {
                            result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
                        }
                        else {
                            // secondary keybindings
                            result.push(`| ${this._leftPad('', 30)} |       | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad('', 25)} | ${this._leftPad('', 30)} | ${this._leftPad('', 25)} | ${this._leftPad('', 30)} |         |`);
                        }
                    }
                }
            }
            result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
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
    keyCodeChordToScanCodeChord(chord) {
        // Avoid double Enter bindings (both ScanCode.NumpadEnter and ScanCode.Enter point to KeyCode.Enter)
        if (chord.keyCode === 3 /* KeyCode.Enter */) {
            return [new ScanCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, 46 /* ScanCode.Enter */)];
        }
        const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(new KeyCodeCombo(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.keyCode));
        const result = [];
        for (let i = 0, len = scanCodeCombos.length; i < len; i++) {
            const scanCodeCombo = scanCodeCombos[i];
            result[i] = new ScanCodeChord(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, chord.metaKey, scanCodeCombo.scanCode);
        }
        return result;
    }
    getUILabelForScanCodeChord(chord) {
        if (!chord) {
            return null;
        }
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        if (this._OS === 2 /* OperatingSystem.Macintosh */) {
            switch (chord.scanCode) {
                case 86 /* ScanCode.ArrowLeft */:
                    return '←';
                case 88 /* ScanCode.ArrowUp */:
                    return '↑';
                case 85 /* ScanCode.ArrowRight */:
                    return '→';
                case 87 /* ScanCode.ArrowDown */:
                    return '↓';
            }
        }
        return this._scanCodeToLabel[chord.scanCode];
    }
    getAriaLabelForScanCodeChord(chord) {
        if (!chord) {
            return null;
        }
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        return this._scanCodeToLabel[chord.scanCode];
    }
    getDispatchStrForScanCodeChord(chord) {
        const codeDispatch = this._scanCodeToDispatch[chord.scanCode];
        if (!codeDispatch) {
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
        result += codeDispatch;
        return result;
    }
    getUserSettingsLabelForScanCodeChord(chord) {
        if (!chord) {
            return null;
        }
        if (chord.isDuplicateModifierCase()) {
            return '';
        }
        const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
        if (immutableKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
            return KeyCodeUtils.toUserSettingsUS(immutableKeyCode).toLowerCase();
        }
        // Check if this scanCode always maps to the same keyCode and back
        const constantKeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
        if (constantKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
            // Verify that this is a good key code that can be mapped back to the same scan code
            const reverseChords = this.keyCodeChordToScanCodeChord(new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, constantKeyCode));
            for (let i = 0, len = reverseChords.length; i < len; i++) {
                const reverseChord = reverseChords[i];
                if (reverseChord.scanCode === chord.scanCode) {
                    return KeyCodeUtils.toUserSettingsUS(constantKeyCode).toLowerCase();
                }
            }
        }
        return this._scanCodeToDispatch[chord.scanCode];
    }
    getElectronAcceleratorLabelForScanCodeChord(chord) {
        if (!chord) {
            return null;
        }
        const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
        if (immutableKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
            return KeyCodeUtils.toElectronAccelerator(immutableKeyCode);
        }
        // Check if this scanCode always maps to the same keyCode and back
        const constantKeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
        if (this._OS === 3 /* OperatingSystem.Linux */ && !this._isUSStandard) {
            // [Electron Accelerators] On Linux, Electron does not handle correctly OEM keys.
            // when using a different keyboard layout than US Standard.
            // See https://github.com/microsoft/vscode/issues/23706
            // See https://github.com/microsoft/vscode/pull/134890#issuecomment-941671791
            const isOEMKey = (constantKeyCode === 85 /* KeyCode.Semicolon */
                || constantKeyCode === 86 /* KeyCode.Equal */
                || constantKeyCode === 87 /* KeyCode.Comma */
                || constantKeyCode === 88 /* KeyCode.Minus */
                || constantKeyCode === 89 /* KeyCode.Period */
                || constantKeyCode === 90 /* KeyCode.Slash */
                || constantKeyCode === 91 /* KeyCode.Backquote */
                || constantKeyCode === 92 /* KeyCode.BracketLeft */
                || constantKeyCode === 93 /* KeyCode.Backslash */
                || constantKeyCode === 94 /* KeyCode.BracketRight */);
            if (isOEMKey) {
                return null;
            }
        }
        if (constantKeyCode !== -1 /* KeyCode.DependsOnKbLayout */) {
            return KeyCodeUtils.toElectronAccelerator(constantKeyCode);
        }
        return null;
    }
    _toResolvedKeybinding(chordParts) {
        if (chordParts.length === 0) {
            return [];
        }
        const result = [];
        this._generateResolvedKeybindings(chordParts, 0, [], result);
        return result;
    }
    _generateResolvedKeybindings(chordParts, currentIndex, previousParts, result) {
        const chordPart = chordParts[currentIndex];
        const isFinalIndex = currentIndex === chordParts.length - 1;
        for (let i = 0, len = chordPart.length; i < len; i++) {
            const chords = [...previousParts, chordPart[i]];
            if (isFinalIndex) {
                result.push(new NativeResolvedKeybinding(this, this._OS, chords));
            }
            else {
                this._generateResolvedKeybindings(chordParts, currentIndex + 1, chords, result);
            }
        }
    }
    resolveKeyboardEvent(keyboardEvent) {
        let code = ScanCodeUtils.toEnum(keyboardEvent.code);
        // Treat NumpadEnter as Enter
        if (code === 94 /* ScanCode.NumpadEnter */) {
            code = 46 /* ScanCode.Enter */;
        }
        const keyCode = keyboardEvent.keyCode;
        if ((keyCode === 15 /* KeyCode.LeftArrow */)
            || (keyCode === 16 /* KeyCode.UpArrow */)
            || (keyCode === 17 /* KeyCode.RightArrow */)
            || (keyCode === 18 /* KeyCode.DownArrow */)
            || (keyCode === 20 /* KeyCode.Delete */)
            || (keyCode === 19 /* KeyCode.Insert */)
            || (keyCode === 14 /* KeyCode.Home */)
            || (keyCode === 13 /* KeyCode.End */)
            || (keyCode === 12 /* KeyCode.PageDown */)
            || (keyCode === 11 /* KeyCode.PageUp */)
            || (keyCode === 1 /* KeyCode.Backspace */)) {
            // "Dispatch" on keyCode for these key codes to workaround issues with remote desktoping software
            // where the scan codes appear to be incorrect (see https://github.com/microsoft/vscode/issues/24107)
            const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
            if (immutableScanCode !== -1 /* ScanCode.DependsOnKbLayout */) {
                code = immutableScanCode;
            }
        }
        else {
            if ((code === 95 /* ScanCode.Numpad1 */)
                || (code === 96 /* ScanCode.Numpad2 */)
                || (code === 97 /* ScanCode.Numpad3 */)
                || (code === 98 /* ScanCode.Numpad4 */)
                || (code === 99 /* ScanCode.Numpad5 */)
                || (code === 100 /* ScanCode.Numpad6 */)
                || (code === 101 /* ScanCode.Numpad7 */)
                || (code === 102 /* ScanCode.Numpad8 */)
                || (code === 103 /* ScanCode.Numpad9 */)
                || (code === 104 /* ScanCode.Numpad0 */)
                || (code === 105 /* ScanCode.NumpadDecimal */)) {
                // "Dispatch" on keyCode for all numpad keys in order for NumLock to work correctly
                if (keyCode >= 0) {
                    const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
                    if (immutableScanCode !== -1 /* ScanCode.DependsOnKbLayout */) {
                        code = immutableScanCode;
                    }
                }
            }
        }
        const ctrlKey = keyboardEvent.ctrlKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
        const altKey = keyboardEvent.altKey || (this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey);
        const chord = new ScanCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, code);
        return new NativeResolvedKeybinding(this, this._OS, [chord]);
    }
    _resolveChord(chord) {
        if (!chord) {
            return [];
        }
        if (chord instanceof ScanCodeChord) {
            return [chord];
        }
        return this.keyCodeChordToScanCodeChord(chord);
    }
    resolveKeybinding(keybinding) {
        const chords = keybinding.chords.map(chord => this._resolveChord(chord));
        return this._toResolvedKeybinding(chords);
    }
    static _redirectCharCode(charCode) {
        switch (charCode) {
            // allow-any-unicode-next-line
            // CJK: 。 「 」 【 】 ； ，
            // map: . [ ] [ ] ; ,
            case 12290 /* CharCode.U_IDEOGRAPHIC_FULL_STOP */: return 46 /* CharCode.Period */;
            case 12300 /* CharCode.U_LEFT_CORNER_BRACKET */: return 91 /* CharCode.OpenSquareBracket */;
            case 12301 /* CharCode.U_RIGHT_CORNER_BRACKET */: return 93 /* CharCode.CloseSquareBracket */;
            case 12304 /* CharCode.U_LEFT_BLACK_LENTICULAR_BRACKET */: return 91 /* CharCode.OpenSquareBracket */;
            case 12305 /* CharCode.U_RIGHT_BLACK_LENTICULAR_BRACKET */: return 93 /* CharCode.CloseSquareBracket */;
            case 65307 /* CharCode.U_FULLWIDTH_SEMICOLON */: return 59 /* CharCode.Semicolon */;
            case 65292 /* CharCode.U_FULLWIDTH_COMMA */: return 44 /* CharCode.Comma */;
        }
        return charCode;
    }
    static _charCodeToKb(charCode) {
        charCode = this._redirectCharCode(charCode);
        if (charCode < CHAR_CODE_TO_KEY_CODE.length) {
            return CHAR_CODE_TO_KEY_CODE[charCode];
        }
        return null;
    }
    /**
     * Attempt to map a combining character to a regular one that renders the same way.
     *
     * https://www.compart.com/en/unicode/bidiclass/NSM
     */
    static getCharCode(char) {
        if (char.length === 0) {
            return 0;
        }
        const charCode = char.charCodeAt(0);
        switch (charCode) {
            case 768 /* CharCode.U_Combining_Grave_Accent */: return 96 /* CharCode.U_GRAVE_ACCENT */;
            case 769 /* CharCode.U_Combining_Acute_Accent */: return 180 /* CharCode.U_ACUTE_ACCENT */;
            case 770 /* CharCode.U_Combining_Circumflex_Accent */: return 94 /* CharCode.U_CIRCUMFLEX */;
            case 771 /* CharCode.U_Combining_Tilde */: return 732 /* CharCode.U_SMALL_TILDE */;
            case 772 /* CharCode.U_Combining_Macron */: return 175 /* CharCode.U_MACRON */;
            case 773 /* CharCode.U_Combining_Overline */: return 8254 /* CharCode.U_OVERLINE */;
            case 774 /* CharCode.U_Combining_Breve */: return 728 /* CharCode.U_BREVE */;
            case 775 /* CharCode.U_Combining_Dot_Above */: return 729 /* CharCode.U_DOT_ABOVE */;
            case 776 /* CharCode.U_Combining_Diaeresis */: return 168 /* CharCode.U_DIAERESIS */;
            case 778 /* CharCode.U_Combining_Ring_Above */: return 730 /* CharCode.U_RING_ABOVE */;
            case 779 /* CharCode.U_Combining_Double_Acute_Accent */: return 733 /* CharCode.U_DOUBLE_ACUTE_ACCENT */;
        }
        return charCode;
    }
}
(function () {
    function define(charCode, keyCode, shiftKey) {
        for (let i = CHAR_CODE_TO_KEY_CODE.length; i < charCode; i++) {
            CHAR_CODE_TO_KEY_CODE[i] = null;
        }
        CHAR_CODE_TO_KEY_CODE[charCode] = { keyCode: keyCode, shiftKey: shiftKey };
    }
    for (let chCode = 65 /* CharCode.A */; chCode <= 90 /* CharCode.Z */; chCode++) {
        define(chCode, 31 /* KeyCode.KeyA */ + (chCode - 65 /* CharCode.A */), true);
    }
    for (let chCode = 97 /* CharCode.a */; chCode <= 122 /* CharCode.z */; chCode++) {
        define(chCode, 31 /* KeyCode.KeyA */ + (chCode - 97 /* CharCode.a */), false);
    }
    define(59 /* CharCode.Semicolon */, 85 /* KeyCode.Semicolon */, false);
    define(58 /* CharCode.Colon */, 85 /* KeyCode.Semicolon */, true);
    define(61 /* CharCode.Equals */, 86 /* KeyCode.Equal */, false);
    define(43 /* CharCode.Plus */, 86 /* KeyCode.Equal */, true);
    define(44 /* CharCode.Comma */, 87 /* KeyCode.Comma */, false);
    define(60 /* CharCode.LessThan */, 87 /* KeyCode.Comma */, true);
    define(45 /* CharCode.Dash */, 88 /* KeyCode.Minus */, false);
    define(95 /* CharCode.Underline */, 88 /* KeyCode.Minus */, true);
    define(46 /* CharCode.Period */, 89 /* KeyCode.Period */, false);
    define(62 /* CharCode.GreaterThan */, 89 /* KeyCode.Period */, true);
    define(47 /* CharCode.Slash */, 90 /* KeyCode.Slash */, false);
    define(63 /* CharCode.QuestionMark */, 90 /* KeyCode.Slash */, true);
    define(96 /* CharCode.BackTick */, 91 /* KeyCode.Backquote */, false);
    define(126 /* CharCode.Tilde */, 91 /* KeyCode.Backquote */, true);
    define(91 /* CharCode.OpenSquareBracket */, 92 /* KeyCode.BracketLeft */, false);
    define(123 /* CharCode.OpenCurlyBrace */, 92 /* KeyCode.BracketLeft */, true);
    define(92 /* CharCode.Backslash */, 93 /* KeyCode.Backslash */, false);
    define(124 /* CharCode.Pipe */, 93 /* KeyCode.Backslash */, true);
    define(93 /* CharCode.CloseSquareBracket */, 94 /* KeyCode.BracketRight */, false);
    define(125 /* CharCode.CloseCurlyBrace */, 94 /* KeyCode.BracketRight */, true);
    define(39 /* CharCode.SingleQuote */, 95 /* KeyCode.Quote */, false);
    define(34 /* CharCode.DoubleQuote */, 95 /* KeyCode.Quote */, true);
})();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFjTGludXhLZXlib2FyZE1hcHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi9tYWNMaW51eEtleWJvYXJkTWFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBR2hHLE9BQU8sRUFBVyxZQUFZLEVBQUUsMEJBQTBCLEVBQUUsMEJBQTBCLEVBQVksYUFBYSxFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzVLLE9BQU8sRUFBc0IsWUFBWSxFQUF1QixhQUFhLEVBQXFCLE1BQU0sd0NBQXdDLENBQUM7QUFJakosT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFHMUc7Ozs7O0dBS0c7QUFDSCxNQUFNLHFCQUFxQixHQUF1RCxFQUFFLENBQUM7QUFFckYsTUFBTSxPQUFPLHdCQUF5QixTQUFRLHNCQUFxQztJQUlsRixZQUFZLE1BQThCLEVBQUUsRUFBbUIsRUFBRSxNQUF1QjtRQUN2RixLQUFLLENBQUMsRUFBRSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQ2xCLElBQUksQ0FBQyxPQUFPLEdBQUcsTUFBTSxDQUFDO0lBQ3ZCLENBQUM7SUFFUyxTQUFTLENBQUMsS0FBb0I7UUFDdkMsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFFUyxhQUFhLENBQUMsS0FBb0I7UUFDM0MsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLDRCQUE0QixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3pELENBQUM7SUFFUyx1QkFBdUIsQ0FBQyxLQUFvQjtRQUNyRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsMkNBQTJDLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDeEUsQ0FBQztJQUVTLHFCQUFx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