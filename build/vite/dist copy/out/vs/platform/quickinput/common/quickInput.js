/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { Schemas } from '../../../base/common/network.js';
export function isKeyModified(keyMods) {
    return keyMods.ctrlCmd || keyMods.alt || keyMods.shift;
}
export const NO_KEY_MODS = { ctrlCmd: false, alt: false, shift: false };
export var QuickInputHideReason;
(function (QuickInputHideReason) {
    /**
     * Focus moved away from the quick input.
     */
    QuickInputHideReason[QuickInputHideReason["Blur"] = 1] = "Blur";
    /**
     * An explicit user gesture, e.g. pressing Escape key.
     */
    QuickInputHideReason[QuickInputHideReason["Gesture"] = 2] = "Gesture";
    /**
     * Anything else.
     */
    QuickInputHideReason[QuickInputHideReason["Other"] = 3] = "Other";
})(QuickInputHideReason || (QuickInputHideReason = {}));
/**
 * A collection of the different types of QuickInput
 */
export var QuickInputType;
(function (QuickInputType) {
    QuickInputType["QuickPick"] = "quickPick";
    QuickInputType["InputBox"] = "inputBox";
    QuickInputType["QuickWidget"] = "quickWidget";
    QuickInputType["QuickTree"] = "quickTree";
})(QuickInputType || (QuickInputType = {}));
/**
 * Represents the activation behavior for items in a quick input. This means which item will be
 * "active" (aka focused).
 */
export var ItemActivation;
(function (ItemActivation) {
    /**
     * No item will be active.
     */
    ItemActivation[ItemActivation["NONE"] = 0] = "NONE";
    /**
     * First item will be active.
     */
    ItemActivation[ItemActivation["FIRST"] = 1] = "FIRST";
    /**
     * Second item will be active.
     */
    ItemActivation[ItemActivation["SECOND"] = 2] = "SECOND";
    /**
     * Last item will be active.
     */
    ItemActivation[ItemActivation["LAST"] = 3] = "LAST";
})(ItemActivation || (ItemActivation = {}));
/**
 * Represents the focus options for a quick pick.
 */
export var QuickPickFocus;
(function (QuickPickFocus) {
    /**
     * Focus the first item in the list.
     */
    QuickPickFocus[QuickPickFocus["First"] = 1] = "First";
    /**
     * Focus the second item in the list.
     */
    QuickPickFocus[QuickPickFocus["Second"] = 2] = "Second";
    /**
     * Focus the last item in the list.
     */
    QuickPickFocus[QuickPickFocus["Last"] = 3] = "Last";
    /**
     * Focus the next item in the list.
     */
    QuickPickFocus[QuickPickFocus["Next"] = 4] = "Next";
    /**
     * Focus the previous item in the list.
     */
    QuickPickFocus[QuickPickFocus["Previous"] = 5] = "Previous";
    /**
     * Focus the next page in the list.
     */
    QuickPickFocus[QuickPickFocus["NextPage"] = 6] = "NextPage";
    /**
     * Focus the previous page in the list.
     */
    QuickPickFocus[QuickPickFocus["PreviousPage"] = 7] = "PreviousPage";
    /**
     * Focus the first item under the next separator.
     */
    QuickPickFocus[QuickPickFocus["NextSeparator"] = 8] = "NextSeparator";
    /**
     * Focus the first item under the current separator.
     */
    QuickPickFocus[QuickPickFocus["PreviousSeparator"] = 9] = "PreviousSeparator";
})(QuickPickFocus || (QuickPickFocus = {}));
export var QuickInputButtonLocation;
(function (QuickInputButtonLocation) {
    /**
     * In the title bar.
     */
    QuickInputButtonLocation[QuickInputButtonLocation["Title"] = 1] = "Title";
    /**
     * To the right of the input box.
     */
    QuickInputButtonLocation[QuickInputButtonLocation["Inline"] = 2] = "Inline";
    /**
     * At the far end inside the input box.
     * Used by the public API to create toggles.
     */
    QuickInputButtonLocation[QuickInputButtonLocation["Input"] = 3] = "Input";
})(QuickInputButtonLocation || (QuickInputButtonLocation = {}));
export class QuickPickItemScorerAccessor {
    constructor(options) {
        this.options = options;
    }
    getItemLabel(entry) {
        return entry.label;
    }
    getItemDescription(entry) {
        if (this.options?.skipDescription) {
            return undefined;
        }
        return entry.description;
    }
    getItemPath(entry) {
        if (this.options?.skipPath) {
            return undefined;
        }
        if (entry.resource?.scheme === Schemas.file) {
            return entry.resource.fsPath;
        }
        return entry.resource?.path;
    }
}
export const quickPickItemScorerAccessor = new QuickPickItemScorerAccessor();
//#endregion
export const IQuickInputService = createDecorator('quickInputService');
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBTTlFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQTRHMUQsTUFBTSxVQUFVLGFBQWEsQ0FBQyxPQUFpQjtJQUM5QyxPQUFPLE9BQU8sQ0FBQyxPQUFPLElBQUksT0FBTyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUMsS0FBSyxDQUFDO0FBQ3hELENBQUM7QUFFRCxNQUFNLENBQUMsTUFBTSxXQUFXLEdBQWEsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDO0FBc0lsRixNQUFNLENBQU4sSUFBWSxvQkFnQlg7QUFoQkQsV0FBWSxvQkFBb0I7SUFFL0I7O09BRUc7SUFDSCwrREFBUSxDQUFBO0lBRVI7O09BRUc7SUFDSCxxRUFBTyxDQUFBO0lBRVA7O09BRUc7SUFDSCxpRUFBSyxDQUFBO0FBQ04sQ0FBQyxFQWhCVyxvQkFBb0IsS0FBcEIsb0JBQW9CLFFBZ0IvQjtBQU1EOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQWtCLGNBS2pCO0FBTEQsV0FBa0IsY0FBYztJQUMvQix5Q0FBdUIsQ0FBQTtJQUN2Qix1Q0FBcUIsQ0FBQTtJQUNyQiw2Q0FBMkIsQ0FBQTtJQUMzQix5Q0FBdUIsQ0FBQTtBQUN4QixDQUFDLEVBTGlCLGNBQWMsS0FBZCxjQUFjLFFBSy9CO0FBeUlEOzs7R0FHRztBQUNILE1BQU0sQ0FBTixJQUFZLGNBaUJYO0FBakJELFdBQVksY0FBYztJQUN6Qjs7T0FFRztJQUNILG1EQUFJLENBQUE7SUFDSjs7T0FFRztJQUNILHFEQUFLLENBQUE7SUFDTDs7T0FFRztJQUNILHVEQUFNLENBQUE7SUFDTjs7T0FFRztJQUNILG1EQUFJLENBQUE7QUFDTCxDQUFDLEVBakJXLGNBQWMsS0FBZCxjQUFjLFFBaUJ6QjtBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFOLElBQVksY0FxQ1g7QUFyQ0QsV0FBWSxjQUFjO0lBQ3pCOztPQUVHO0lBQ0gscURBQVMsQ0FBQTtJQUNUOztPQUVHO0lBQ0gsdURBQU0sQ0FBQTtJQUNOOztPQUVHO0lBQ0gsbURBQUksQ0FBQTtJQUNKOztPQUVHO0lBQ0gsbURBQUksQ0FBQTtJQUNKOztPQUVHO0lBQ0gsMkRBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsMkRBQVEsQ0FBQTtJQUNSOztPQUVHO0lBQ0gsbUVBQVksQ0FBQTtJQUNaOztPQUVHO0lBQ0gscUVBQWEsQ0FBQTtJQUNiOztPQUVHO0lBQ0gsNkVBQWlCLENBQUE7QUFDbEIsQ0FBQyxFQXJDVyxjQUFjLEtBQWQsY0FBYyxRQXFDekI7QUF3U0QsTUFBTSxDQUFOLElBQVksd0JBZ0JYO0FBaEJELFdBQVksd0JBQXdCO0lBQ25DOztPQUVHO0lBQ0gseUVBQVMsQ0FBQTtJQUVUOztPQUVHO0lBQ0gsMkVBQVUsQ0FBQTtJQUVWOzs7T0FHRztJQUNILHlFQUFTLENBQUE7QUFDVixDQUFDLEVBaEJXLHdCQUF3QixLQUF4Qix3QkFBd0IsUUFnQm5DO0FBbUdELE1BQU0sT0FBTywyQkFBMkI7SUFFdkMsWUFBb0IsT0FBMkQ7UUFBM0QsWUFBTyxHQUFQLE9BQU8sQ0FBb0Q7SUFBSSxDQUFDO0lBRXBGLFlBQVksQ0FBQyxLQUFpQztRQUM3QyxPQUFPLEtBQUssQ0FBQyxLQUFLLENBQUM7SUFDcEIsQ0FBQztJQUVELGtCQUFrQixDQUFDLEtBQWlDO1FBQ25ELElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxlQUFlLEVBQUUsQ0FBQztZQUNuQyxPQUFPLFNBQVMsQ0FBQztRQUNsQixDQUFDO1FBRUQsT0FBTyxLQUFLLENBQUMsV0FBVyxDQUFDO0lBQzFCLENBQUM7SUFFRCxXQUFXLENBQUMsS0FBaUM7UUFDNUMsSUFBSSxJQUFJLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxDQUFDO1lBQzVCLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsTUFBTSxLQUFLLE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUM3QyxPQUFPLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQzlCLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDO0lBQzdCLENBQUM7Q0FDRDtBQUVELE1BQU0sQ0FBQyxNQUFNLDJCQUEyQixHQUFHLElBQUksMkJBQTJCLEVBQUUsQ0FBQztBQUU3RSxZQUFZO0FBRVosTUFBTSxDQUFDLE1BQU0sa0JBQWtCLEdBQUcsZUFBZSxDQUFxQixtQkFBbUIsQ0FBQyxDQUFDO0FBNlUzRixZQUFZIn0=