/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as DOM from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import { VIEW_ID } from '../../../services/search/common/search.js';
import { isSearchTreeMatch, isSearchTreeFileMatch, isSearchTreeFolderMatch } from './searchTreeModel/searchTreeCommon.js';
import { searchComparer } from './searchCompare.js';
export const category = nls.localize2('search', "Search");
export function isSearchViewFocused(viewsService) {
    const searchView = getSearchView(viewsService);
    return !!(searchView && DOM.isAncestorOfActiveElement(searchView.getContainer()));
}
export function getSearchView(viewsService) {
    return viewsService.getActiveViewWithId(VIEW_ID);
}
export function getElementsToOperateOn(viewer, currElement, sortConfig) {
    let elements = viewer.getSelection().filter((x) => x !== null).sort((a, b) => searchComparer(a, b, sortConfig.sortOrder));
    // if selection doesn't include multiple elements, just return current focus element.
    if (currElement && !(elements.length > 1 && elements.includes(currElement))) {
        elements = [currElement];
    }
    return elements;
}
/**
 * @param elements elements that are going to be removed
 * @param focusElement element that is focused
 * @returns whether we need to re-focus on a remove
 */
export function shouldRefocus(elements, focusElement) {
    if (!focusElement) {
        return false;
    }
    return !focusElement || elements.includes(focusElement) || hasDownstreamMatch(elements, focusElement);
}
function hasDownstreamMatch(elements, focusElement) {
    for (const elem of elements) {
        if ((isSearchTreeFileMatch(elem) && isSearchTreeMatch(focusElement) && elem.matches().includes(focusElement)) ||
            (isSearchTreeFolderMatch(elem) && ((isSearchTreeFileMatch(focusElement) && elem.getDownstreamFileMatch(focusElement.resource)) ||
                (isSearchTreeMatch(focusElement) && elem.getDownstreamFileMatch(focusElement.parent().resource))))) {
            return true;
        }
    }
    return false;
}
export function openSearchView(viewsService, focus) {
    return viewsService.openView(VIEW_ID, focus).then(view => (view ?? undefined));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQWN0aW9uc0Jhc2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hBY3Rpb25zQmFzZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLGlDQUFpQyxDQUFDO0FBQ3ZELE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFJMUMsT0FBTyxFQUFrQyxPQUFPLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNwRyxPQUFPLEVBQUUsaUJBQWlCLEVBQWtDLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDMUosT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRXBELE1BQU0sQ0FBQyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUUxRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsWUFBMkI7SUFDOUQsTUFBTSxVQUFVLEdBQUcsYUFBYSxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQy9DLE9BQU8sQ0FBQyxDQUFDLENBQUMsVUFBVSxJQUFJLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQyxVQUFVLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDO0FBQ25GLENBQUM7QUFFRCxNQUFNLFVBQVUsYUFBYSxDQUFDLFlBQTJCO0lBQ3hELE9BQU8sWUFBWSxDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBZSxDQUFDO0FBQ2hFLENBQUM7QUFFRCxNQUFNLFVBQVUsc0JBQXNCLENBQUMsTUFBZ0YsRUFBRSxXQUF3QyxFQUFFLFVBQTBDO0lBQzVNLElBQUksUUFBUSxHQUFzQixNQUFNLENBQUMsWUFBWSxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUF3QixFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLGNBQWMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLFVBQVUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBRW5LLHFGQUFxRjtJQUNyRixJQUFJLFdBQVcsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDN0UsUUFBUSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVELE9BQU8sUUFBUSxDQUFDO0FBQ2pCLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGFBQWEsQ0FBQyxRQUEyQixFQUFFLFlBQXlDO0lBQ25HLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUNuQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFDRCxPQUFPLENBQUMsWUFBWSxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLElBQUksa0JBQWtCLENBQUMsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFDO0FBQ3ZHLENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLFFBQTJCLEVBQUUsWUFBNkI7SUFDckYsS0FBSyxNQUFNLElBQUksSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUM3QixJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLElBQUksaUJBQWlCLENBQUMsWUFBWSxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUM1RyxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxJQUFJLENBQ2pDLENBQUMscUJBQXFCLENBQUMsWUFBWSxDQUFDLElBQUksSUFBSSxDQUFDLHNCQUFzQixDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDM0YsQ0FBQyxpQkFBaUIsQ0FBQyxZQUFZLENBQUMsSUFBSSxJQUFJLENBQUMsc0JBQXNCLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQ2hHLENBQUMsRUFBRSxDQUFDO1lBQ0wsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBRWQsQ0FBQztBQUVELE1BQU0sVUFBVSxjQUFjLENBQUMsWUFBMkIsRUFBRSxLQUFlO0lBQzFFLE9BQU8sWUFBWSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFrQixJQUFJLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDOUYsQ0FBQyJ9