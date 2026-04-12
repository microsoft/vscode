/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ScanCodeUtils } from '../../../base/common/keyCodes.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
export const IKeyboardLayoutService = createDecorator('keyboardLayoutService');
export function areKeyboardLayoutsEqual(a, b) {
    if (!a || !b) {
        return false;
    }
    if (a.name && b.name && a.name === b.name) {
        return true;
    }
    if (a.id && b.id && a.id === b.id) {
        return true;
    }
    if (a.model &&
        b.model &&
        a.model === b.model &&
        a.layout === b.layout) {
        return true;
    }
    return false;
}
export function parseKeyboardLayoutDescription(layout) {
    if (!layout) {
        return { label: '', description: '' };
    }
    if (layout.name) {
        // windows
        const windowsLayout = layout;
        return {
            label: windowsLayout.text,
            description: ''
        };
    }
    if (layout.id) {
        const macLayout = layout;
        if (macLayout.localizedName) {
            return {
                label: macLayout.localizedName,
                description: ''
            };
        }
        if (/^com\.apple\.keylayout\./.test(macLayout.id)) {
            return {
                label: macLayout.id.replace(/^com\.apple\.keylayout\./, '').replace(/-/g, ' '),
                description: ''
            };
        }
        if (/^.*inputmethod\./.test(macLayout.id)) {
            return {
                label: macLayout.id.replace(/^.*inputmethod\./, '').replace(/[-\.]/g, ' '),
                description: `Input Method (${macLayout.lang})`
            };
        }
        return {
            label: macLayout.lang,
            description: ''
        };
    }
    const linuxLayout = layout;
    return {
        label: linuxLayout.layout,
        description: ''
    };
}
export function getKeyboardLayoutId(layout) {
    if (layout.name) {
        return layout.name;
    }
    if (layout.id) {
        return layout.id;
    }
    return layout.layout;
}
function windowsKeyMappingEquals(a, b) {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return (a.vkey === b.vkey
        && a.value === b.value
        && a.withShift === b.withShift
        && a.withAltGr === b.withAltGr
        && a.withShiftAltGr === b.withShiftAltGr);
}
export function windowsKeyboardMappingEquals(a, b) {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    for (let scanCode = 0; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
        const strScanCode = ScanCodeUtils.toString(scanCode);
        const aEntry = a[strScanCode];
        const bEntry = b[strScanCode];
        if (!windowsKeyMappingEquals(aEntry, bEntry)) {
            return false;
        }
    }
    return true;
}
function macLinuxKeyMappingEquals(a, b) {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    return (a.value === b.value
        && a.withShift === b.withShift
        && a.withAltGr === b.withAltGr
        && a.withShiftAltGr === b.withShiftAltGr);
}
export function macLinuxKeyboardMappingEquals(a, b) {
    if (!a && !b) {
        return true;
    }
    if (!a || !b) {
        return false;
    }
    for (let scanCode = 0; scanCode < 193 /* ScanCode.MAX_VALUE */; scanCode++) {
        const strScanCode = ScanCodeUtils.toString(scanCode);
        const aEntry = a[strScanCode];
        const bEntry = b[strScanCode];
        if (!macLinuxKeyMappingEquals(aEntry, bEntry)) {
            return false;
        }
    }
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoia2V5Ym9hcmRMYXlvdXQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRMYXlvdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFZLGFBQWEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUk5RSxNQUFNLENBQUMsTUFBTSxzQkFBc0IsR0FBRyxlQUFlLENBQXlCLHVCQUF1QixDQUFDLENBQUM7QUEwRXZHLE1BQU0sVUFBVSx1QkFBdUIsQ0FBQyxDQUE2QixFQUFFLENBQTZCO0lBQ25HLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUNkLE9BQU8sS0FBSyxDQUFDO0lBQ2QsQ0FBQztJQUVELElBQWlDLENBQUUsQ0FBQyxJQUFJLElBQWlDLENBQUUsQ0FBQyxJQUFJLElBQWlDLENBQUUsQ0FBQyxJQUFJLEtBQWtDLENBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNuSyxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxJQUE2QixDQUFFLENBQUMsRUFBRSxJQUE2QixDQUFFLENBQUMsRUFBRSxJQUE2QixDQUFFLENBQUMsRUFBRSxLQUE4QixDQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDM0ksT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRUQsSUFBK0IsQ0FBRSxDQUFDLEtBQUs7UUFDWCxDQUFFLENBQUMsS0FBSztRQUNSLENBQUUsQ0FBQyxLQUFLLEtBQWdDLENBQUUsQ0FBQyxLQUFLO1FBQ2hELENBQUUsQ0FBQyxNQUFNLEtBQWdDLENBQUUsQ0FBQyxNQUFNLEVBQzVFLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFF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