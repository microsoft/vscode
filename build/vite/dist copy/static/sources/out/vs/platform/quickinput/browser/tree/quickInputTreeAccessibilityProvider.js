/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Event } from '../../../../base/common/event.js';
import { getCodiconAriaLabel } from '../../../../base/common/iconLabels.js';
import { localize } from '../../../../nls.js';
/**
 * Accessibility provider for QuickTree.
 */
export class QuickTreeAccessibilityProvider {
    constructor(onCheckedEvent) {
        this.onCheckedEvent = onCheckedEvent;
    }
    getWidgetAriaLabel() {
        return localize('quickTree', "Quick Tree");
    }
    getAriaLabel(element) {
        return element.ariaLabel || [element.label, element.description]
            .map(s => getCodiconAriaLabel(s))
            .filter(s => !!s)
            .join(', ');
    }
    getWidgetRole() {
        return 'tree';
    }
    getRole(_element) {
        return 'checkbox';
    }
    isChecked(element) {
        return {
            get value() { return element.checked === 'mixed' ? 'mixed' : !!element.checked; },
            onDidChange: e => Event.filter(this.onCheckedEvent, e => e.item === element)(_ => e()),
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dFRyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvdHJlZS9xdWlja0lucHV0VHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsS0FBSyxFQUF5QixNQUFNLGtDQUFrQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5Qzs7R0FFRztBQUNILE1BQU0sT0FBTyw4QkFBOEI7SUFDMUMsWUFBNkIsY0FBaUQ7UUFBakQsbUJBQWMsR0FBZCxjQUFjLENBQW1DO0lBQUksQ0FBQztJQUVuRixrQkFBa0I7UUFDakIsT0FBTyxRQUFRLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQzVDLENBQUM7SUFFRCxZQUFZLENBQUMsT0FBVTtRQUN0QixPQUFPLE9BQU8sQ0FBQyxTQUFTLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxXQUFXLENBQUM7YUFDOUQsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDaEMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNoQixJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDZCxDQUFDO0lBRUQsYUFBYTtRQUNaLE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVELE9BQU8sQ0FBQyxRQUFXO1FBQ2xCLE9BQU8sVUFBVSxDQUFDO0lBQ25CLENBQUM7SUFFRCxTQUFTLENBQUMsT0FBVTtRQUNuQixPQUFPO1lBQ04sSUFBSSxLQUFLLEtBQUssT0FBTyxPQUFPLENBQUMsT0FBTyxLQUFLLE9BQU8sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDakYsV0FBVyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1NBQ3RGLENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==