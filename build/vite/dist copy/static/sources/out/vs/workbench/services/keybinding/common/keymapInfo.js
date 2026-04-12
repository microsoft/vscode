/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isWindows, isLinux } from '../../../../base/common/platform.js';
import { getKeyboardLayoutId } from '../../../../platform/keyboardLayout/common/keyboardLayout.js';
function deserializeMapping(serializedMapping) {
    const mapping = serializedMapping;
    const ret = {};
    for (const key in mapping) {
        const result = mapping[key];
        if (result.length) {
            const value = result[0];
            const withShift = result[1];
            const withAltGr = result[2];
            const withShiftAltGr = result[3];
            const mask = Number(result[4]);
            const vkey = result.length === 6 ? result[5] : undefined;
            ret[key] = {
                'value': value,
                'vkey': vkey,
                'withShift': withShift,
                'withAltGr': withAltGr,
                'withShiftAltGr': withShiftAltGr,
                'valueIsDeadKey': (mask & 1) > 0,
                'withShiftIsDeadKey': (mask & 2) > 0,
                'withAltGrIsDeadKey': (mask & 4) > 0,
                'withShiftAltGrIsDeadKey': (mask & 8) > 0
            };
        }
        else {
            ret[key] = {
                'value': '',
                'valueIsDeadKey': false,
                'withShift': '',
                'withShiftIsDeadKey': false,
                'withAltGr': '',
                'withAltGrIsDeadKey': false,
                'withShiftAltGr': '',
                'withShiftAltGrIsDeadKey': false
            };
        }
    }
    return ret;
}
export class KeymapInfo {
    constructor(layout, secondaryLayouts, keyboardMapping, isUserKeyboardLayout) {
        this.layout = layout;
        this.secondaryLayouts = secondaryLayouts;
        this.mapping = deserializeMapping(keyboardMapping);
        this.isUserKeyboardLayout = !!isUserKeyboardLayout;
        this.layout.isUserKeyboardLayout = !!isUserKeyboardLayout;
    }
    static createKeyboardLayoutFromDebugInfo(layout, value, isUserKeyboardLayout) {
        const keyboardLayoutInfo = new KeymapInfo(layout, [], {}, true);
        keyboardLayoutInfo.mapping = value;
        return keyboardLayoutInfo;
    }
    update(other) {
        this.layout = other.layout;
        this.secondaryLayouts = other.secondaryLayouts;
        this.mapping = other.mapping;
        this.isUserKeyboardLayout = other.isUserKeyboardLayout;
        this.layout.isUserKeyboardLayout = other.isUserKeyboardLayout;
    }
    getScore(other) {
        let score = 0;
        for (const key in other) {
            if (isWindows && (key === 'Backslash' || key === 'KeyQ')) {
                // keymap from Chromium is probably wrong.
                continue;
            }
            if (isLinux && (key === 'Backspace' || key === 'Escape')) {
                // native keymap doesn't align with keyboard event
                continue;
            }
            const currentMapping = this.mapping[key];
            if (currentMapping === undefined) {
                score -= 1;
            }
            const otherMapping = other[key];
            if (currentMapping && otherMapping && currentMapping.value !== otherMapping.value) {
                score -= 1;
            }
        }
        return score;
    }
    equal(other) {
        if (this.isUserKeyboardLayout !== other.isUserKeyboardLayout) {
            return false;
        }
        if (getKeyboardLayoutId(this.layout) !== getKeyboardLayoutId(other.layout)) {
            return false;
        }
        return this.fuzzyEqual(other.mapping);
    }
    fuzzyEqual(other) {
        for (const key in other) {
            if (isWindows && (key === 'Backslash' || key === 'KeyQ')) {
                // keymap from Chromium is probably wrong.
                continue;
            }
            if (this.mapping[key] === undefined) {
                return false;
            }
            const currentMapping = this.mapping[key];
            const otherMapping = other[key];
            if (currentMapping.value !== otherMapping.value) {
                return false;
            }
        }
        return true;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5bWFwSW5mby5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi9rZXltYXBJbmZvLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDekUsT0FBTyxFQUFFLG1CQUFtQixFQUF1QixNQUFNLDhEQUE4RCxDQUFDO0FBRXhILFNBQVMsa0JBQWtCLENBQUMsaUJBQXFDO0lBQ2hFLE1BQU0sT0FBTyxHQUFHLGlCQUFpQixDQUFDO0lBRWxDLE1BQU0sR0FBRyxHQUEyQixFQUFFLENBQUM7SUFDdkMsS0FBSyxNQUFNLEdBQUcsSUFBSSxPQUFPLEVBQUUsQ0FBQztRQUMzQixNQUFNLE1BQU0sR0FBd0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2pELElBQUksTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ25CLE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixNQUFNLFNBQVMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUIsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzVCLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqQyxNQUFNLElBQUksR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0IsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1lBQ3pELEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRztnQkFD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