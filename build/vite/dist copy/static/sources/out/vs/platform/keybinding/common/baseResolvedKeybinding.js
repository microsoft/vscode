/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { illegalArgument } from '../../../base/common/errors.js';
import { AriaLabelProvider, ElectronAcceleratorLabelProvider, UILabelProvider, UserSettingsLabelProvider } from '../../../base/common/keybindingLabels.js';
import { ResolvedKeybinding, ResolvedChord } from '../../../base/common/keybindings.js';
export class BaseResolvedKeybinding extends ResolvedKeybinding {
    constructor(os, chords) {
        super();
        if (chords.length === 0) {
            throw illegalArgument(`chords`);
        }
        this._os = os;
        this._chords = chords;
    }
    getLabel() {
        return UILabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getLabel(keybinding));
    }
    getAriaLabel() {
        return AriaLabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getAriaLabel(keybinding));
    }
    getElectronAccelerator() {
        if (this._chords.length > 1) {
            // [Electron Accelerators] Electron cannot handle chords
            return null;
        }
        if (this._chords[0].isDuplicateModifierCase()) {
            // [Electron Accelerators] Electron cannot handle modifier only keybindings
            // e.g. "shift shift"
            return null;
        }
        return ElectronAcceleratorLabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getElectronAccelerator(keybinding));
    }
    getUserSettingsLabel() {
        return UserSettingsLabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getUserSettingsLabel(keybinding));
    }
    isWYSIWYG() {
        return this._chords.every((keybinding) => this._isWYSIWYG(keybinding));
    }
    hasMultipleChords() {
        return (this._chords.length > 1);
    }
    getChords() {
        return this._chords.map((keybinding) => this._getChord(keybinding));
    }
    _getChord(keybinding) {
        return new ResolvedChord(keybinding.ctrlKey, keybinding.shiftKey, keybinding.altKey, keybinding.metaKey, this._getLabel(keybinding), this._getAriaLabel(keybinding));
    }
    getDispatchChords() {
        return this._chords.map((keybinding) => this._getChordDispatch(keybinding));
    }
    getSingleModifierDispatchChords() {
        return this._chords.map((keybinding) => this._getSingleModifierChordDispatch(keybinding));
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZVJlc29sdmVkS2V5YmluZGluZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2Jhc2VSZXNvbHZlZEtleWJpbmRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxnQ0FBZ0MsRUFBRSxlQUFlLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzSixPQUFPLEVBQThCLGtCQUFrQixFQUFFLGFBQWEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBR3BILE1BQU0sT0FBZ0Isc0JBQXdDLFNBQVEsa0JBQWtCO0lBS3ZGLFlBQVksRUFBbUIsRUFBRSxNQUFvQjtRQUNwRCxLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUN6QixNQUFNLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztJQUN2QixDQUFDO0lBRU0sUUFBUTtRQUNkLE9BQU8sZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUNwRyxDQUFDO0lBRU0sWUFBWTtRQUNsQixPQUFPLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMxRyxDQUFDO0lBRU0sc0JBQXNCO1FBQzVCLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDN0Isd0RBQXdEO1lBQ3hELE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyx1QkFBdUIsRUFBRSxFQUFFLENBQUM7WUFDL0MsMkVBQTJFO1lBQzNFLHFCQUFxQjtZQUNyQixPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLGdDQUFnQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO0lBQ25JLENBQUM7SUFFTSxvQkFBb0I7UUFDMUIsT0FBTyx5QkFBeUIsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMscUJBQXFCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMxSCxDQUFDO0lBRU0sU0FBUztRQUNmLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUN4RSxDQUFDO0lBRU0saUJBQWlCO1FBQ3ZCLE9BQU8sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUNsQyxDQUFDO0lBRU0sU0FBUztRQUNmLE9BQU8sSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUNyRSxDQUFDO0lBRU8sU0FBUyxDQUFDLFVBQWE7UUFDOUIsT0FBTyxJQUFJLGFBQWEsQ0FDdkIsVUFBVSxDQUFDLE9BQU8sRUFDbEIsVUFBVSxDQUFDLFFBQVEsRUFDbkIsVUFBVSxDQUFDLE1BQU0sRUFDakIsVUFBVSxDQUFDLE9BQU8sRUFDbEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFDMUIsSUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLENBQUMsQ0FDOUIsQ0FBQztJQUNILENBQUM7SUFFTSxpQkFBaUI7UUFDdkIsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7SUFDN0UsQ0FBQztJQUVNLCtCQUErQjtRQUNyQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsK0JBQStCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztJQUMzRixDQUFDO0NBU0QifQ==