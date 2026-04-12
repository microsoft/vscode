/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { matchesFuzzyIconAware, parseLabelWithIcons } from '../../../../base/common/iconLabels.js';
export class QuickInputTreeFilter {
    constructor() {
        this.filterValue = '';
        this.matchOnLabel = true;
        this.matchOnDescription = false;
    }
    filter(element, parentVisibility) {
        if (!this.filterValue || !(this.matchOnLabel || this.matchOnDescription)) {
            return element.children
                ? { visibility: 2 /* TreeVisibility.Recurse */, data: {} }
                : { visibility: 1 /* TreeVisibility.Visible */, data: {} };
        }
        const labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(this.filterValue, parseLabelWithIcons(element.label)) ?? undefined : undefined;
        const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(this.filterValue, parseLabelWithIcons(element.description || '')) ?? undefined : undefined;
        const visibility = parentVisibility === 1 /* TreeVisibility.Visible */
            // Parent is visible because it had matches, so we show all children
            ? 1 /* TreeVisibility.Visible */
            // This would only happen on Parent is recurse so...
            : (labelHighlights || descriptionHighlights)
                // If we have any highlights, we are visible
                ? 1 /* TreeVisibility.Visible */
                // Otherwise, we defer to the children or if no children, we are hidden
                : element.children
                    ? 2 /* TreeVisibility.Recurse */
                    : 0 /* TreeVisibility.Hidden */;
        return {
            visibility,
            data: {
                labelHighlights,
                descriptionHighlights
            }
        };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVpY2tJbnB1dFRyZWVGaWx0ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvdHJlZS9xdWlja0lucHV0VHJlZUZpbHRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUluRyxNQUFNLE9BQU8sb0JBQW9CO0lBQWpDO1FBQ0MsZ0JBQVcsR0FBVyxFQUFFLENBQUM7UUFDekIsaUJBQVksR0FBWSxJQUFJLENBQUM7UUFDN0IsdUJBQWtCLEdBQVksS0FBSyxDQUFDO0lBZ0NyQyxDQUFDO0lBOUJBLE1BQU0sQ0FBQyxPQUF1QixFQUFFLGdCQUFnQztRQUMvRCxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO1lBQzFFLE9BQU8sT0FBTyxDQUFDLFFBQVE7Z0JBQ3RCLENBQUMsQ0FBQyxFQUFFLFVBQVUsZ0NBQXdCLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRTtnQkFDbEQsQ0FBQyxDQUFDLEVBQUUsVUFBVSxnQ0FBd0IsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLENBQUM7UUFDckQsQ0FBQztRQUVELE1BQU0sZUFBZSxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsbUJBQW1CLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksU0FBUyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDakosTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsbUJBQW1CLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBRXpLLE1BQU0sVUFBVSxHQUFHLGdCQUFnQixtQ0FBMkI7WUFDN0Qsb0VBQW9FO1lBQ3BFLENBQUM7WUFDRCxvREFBb0Q7WUFDcEQsQ0FBQyxDQUFDLENBQUMsZUFBZSxJQUFJLHFCQUFxQixDQUFDO2dCQUMzQyw0Q0FBNEM7Z0JBQzVDLENBQUM7Z0JBQ0QsdUVBQXVFO2dCQUN2RSxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVE7b0JBQ2pCLENBQUM7b0JBQ0QsQ0FBQyw4QkFBc0IsQ0FBQztRQUUzQixPQUFPO1lBQ04sVUFBVTtZQUNWLElBQUksRUFBRTtnQkFDTCxlQUFlO2dCQUNmLHFCQUFxQjthQUNyQjtTQUNELENBQUM7SUFDSCxDQUFDO0NBQ0QifQ==