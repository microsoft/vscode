/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
export function arrayContainsElementOrParent(element, testArray) {
    do {
        if (testArray.includes(element)) {
            return true;
        }
    } while (!isSearchResult(element.parent()) && (element = element.parent()));
    return false;
}
export var SearchModelLocation;
(function (SearchModelLocation) {
    SearchModelLocation[SearchModelLocation["PANEL"] = 0] = "PANEL";
    SearchModelLocation[SearchModelLocation["QUICK_ACCESS"] = 1] = "QUICK_ACCESS";
})(SearchModelLocation || (SearchModelLocation = {}));
export const PLAIN_TEXT_SEARCH__RESULT_ID = 'plainTextSearch';
export const AI_TEXT_SEARCH_RESULT_ID = 'aiTextSearch';
export function createParentList(element) {
    const parentArray = [];
    let currElement = element;
    while (!isTextSearchHeading(currElement)) {
        parentArray.push(currElement);
        currElement = currElement.parent();
    }
    return parentArray;
}
export const SEARCH_MODEL_PREFIX = 'SEARCH_MODEL_';
export const SEARCH_RESULT_PREFIX = 'SEARCH_RESULT_';
export const TEXT_SEARCH_HEADING_PREFIX = 'TEXT_SEARCH_HEADING_';
export const FOLDER_MATCH_PREFIX = 'FOLDER_MATCH_';
export const FILE_MATCH_PREFIX = 'FILE_MATCH_';
export const MATCH_PREFIX = 'MATCH_';
export function mergeSearchResultEvents(events) {
    const retEvent = {
        elements: [],
        added: false,
        removed: false,
    };
    events.forEach((e) => {
        if (e.added) {
            retEvent.added = true;
        }
        if (e.removed) {
            retEvent.removed = true;
        }
        retEvent.elements = retEvent.elements.concat(e.elements);
    });
    return retEvent;
}
export function isSearchModel(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(SEARCH_MODEL_PREFIX);
}
export function isSearchResult(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(SEARCH_RESULT_PREFIX);
}
export function isTextSearchHeading(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(TEXT_SEARCH_HEADING_PREFIX);
}
export function isPlainTextSearchHeading(obj) {
    return isTextSearchHeading(obj) &&
        // eslint-disable-next-line local/code-no-any-casts
        typeof obj.replace === 'function' &&
        // eslint-disable-next-line local/code-no-any-casts
        typeof obj.replaceAll === 'function';
}
export function isSearchTreeFolderMatch(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(FOLDER_MATCH_PREFIX);
}
export function isSearchTreeFolderMatchWithResource(obj) {
    return isSearchTreeFolderMatch(obj) && obj.resource instanceof URI;
}
export function isSearchTreeFolderMatchWorkspaceRoot(obj) {
    return isSearchTreeFolderMatchWithResource(obj) &&
        // eslint-disable-next-line local/code-no-any-casts
        typeof obj.createAndConfigureFileMatch === 'function';
}
export function isSearchTreeFolderMatchNoRoot(obj) {
    return isSearchTreeFolderMatch(obj) &&
        // eslint-disable-next-line local/code-no-any-casts
        typeof obj.createAndConfigureFileMatch === 'function';
}
export function isSearchTreeFileMatch(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(FILE_MATCH_PREFIX);
}
export function isSearchTreeMatch(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(MATCH_PREFIX);
}
export function isSearchHeader(obj) {
    return typeof obj === 'object' &&
        obj !== null &&
        typeof obj.id === 'function' &&
        obj.id().startsWith(TEXT_SEARCH_HEADING_PREFIX);
}
export function getFileMatches(matches) {
    const folderMatches = [];
    const fileMatches = [];
    matches.forEach((e) => {
        if (isSearchTreeFileMatch(e)) {
            fileMatches.push(e);
        }
        else {
            folderMatches.push(e);
        }
    });
    return fileMatches.concat(folderMatches.map(e => e.allDownstreamFileMatches()).flat());
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoVHJlZUNvbW1vbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBS2hHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQVl4RCxNQUFNLFVBQVUsNEJBQTRCLENBQUMsT0FBd0IsRUFBRSxTQUE0QjtJQUNsRyxHQUFHLENBQUM7UUFDSCxJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7SUFDRixDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxPQUFPLEdBQW9CLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFO0lBRTdGLE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQVNELE1BQU0sQ0FBTixJQUFZLG1CQUdYO0FBSEQsV0FBWSxtQkFBbUI7SUFDOUIsK0RBQUssQ0FBQTtJQUNMLDZFQUFZLENBQUE7QUFDYixDQUFDLEVBSFcsbUJBQW1CLEtBQW5CLG1CQUFtQixRQUc5QjtBQUdELE1BQU0sQ0FBQyxNQUFNLDRCQUE0QixHQUFHLGlCQUFpQixDQUFDO0FBQzlELE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGNBQWMsQ0FBQztBQUV2RCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsT0FBd0I7SUFDeEQsTUFBTSxXQUFXLEdBQXNCLEVBQUUsQ0FBQztJQUMxQyxJQUFJLFdBQVcsR0FBeUMsT0FBTyxDQUFDO0lBRWhFLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDO1FBQzFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDOUIsV0FBVyxHQUFHLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNwQyxDQUFDO0lBRUQsT0FBTyxXQUFXLENBQUM7QUFDcEIsQ0FBQztBQUVELE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLGVBQWUsQ0FBQztBQUNuRCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBRyxnQkFBZ0IsQ0FBQztBQUNyRCxNQUFNLENBQUMsTUFBTSwwQkFBMEIsR0FBRyxzQkFBc0IsQ0FBQztBQUNqRSxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxlQUFlLENBQUM7QUFDbkQsTUFBTSxDQUFDLE1BQU0saUJBQWlCLEdBQUcsYUFBYSxDQUFDO0FBQy9DLE1BQU0sQ0FBQyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUM7QUFFckMsTUFBTSxVQUFVLHVCQUF1QixDQUFDLE1BQXNCO0lBQzdELE1BQU0sUUFBUSxHQUFpQjtRQUM5QixRQUFRLEVBQUUsRUFBRTtRQUNaLEtBQUssRUFBRSxLQUFLO1FBQ1osT0FBTyxFQUFFLEtBQUs7S0FDZCxDQUFDO0lBQ0YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO1FBQ3BCLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2IsUUFBUSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUM7UUFDdkIsQ0FBQztRQUVELElBQUksQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2YsUUFBUSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7UUFDekIsQ0FBQztRQUVELFFBQVEsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxRQUFRLENBQUM7QUFDakIsQ0FBQztBQStMRCxNQUFNLFVBQVUsYUFBYSxDQUFDLEdBQVE7SUFDckMsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRO1FBQzdCLEdBQUcsS0FBSyxJQUFJO1FBQ1osT0FBTyxHQUFHLENBQUMsRUFBRSxLQUFLLFVBQVU7UUFDNUIsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQzNDLENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLEdBQVE7SUFDdEMsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRO1FBQzdCLEdBQUcsS0FBSyxJQUFJO1FBQ1osT0FBTyxHQUFHLENBQUMsRUFBRSxLQUFLLFVBQVU7UUFDNUIsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQzVDLENBQUM7QUFFRCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsR0FBUTtJQUMzQyxPQUFPLE9BQU8sR0FBRyxLQUFLLFFBQVE7UUFDN0IsR0FBRyxLQUFLLElBQUk7UUFDWixPQUFPLEdBQUcsQ0FBQyxFQUFFLEtBQUssVUFBVTtRQUM1QixHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDbEQsQ0FBQztBQUVELE1BQU0sVUFBVSx3QkFBd0IsQ0FBQyxHQUFRO0lBQ2hELE9BQU8sbUJBQW1CLENBQUMsR0FBRyxDQUFDO1FBQzlCLG1EQUFtRDtRQUNuRCxPQUFhLEdBQUksQ0FBQyxPQUFPLEtBQUssVUFBVTtRQUN4QyxtREFBbUQ7UUFDbkQsT0FBYSxHQUFJLENBQUMsVUFBVSxLQUFLLFVBQVUsQ0FBQztBQUM5QyxDQUFDO0FBRUQsTUFBTSxVQUFVLHVCQUF1QixDQUFDLEdBQVE7SUFDL0MsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRO1FBQzdCLEdBQUcsS0FBSyxJQUFJO1FBQ1osT0FBTyxHQUFHLENBQUMsRUFBRSxLQUFLLFVBQVU7UUFDNUIsR0FBRyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDO0FBQzNDLENBQUM7QUFFRCxNQUFNLFVBQVUsbUNBQW1DLENBQUMsR0FBUTtJQUMzRCxPQUFPLHVCQUF1QixDQUFDLEdBQUcsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLFlBQVksR0FBRyxDQUFDO0FBQ3BFLENBQUM7QUFFRCxNQUFNLFVBQVUsb0NBQW9DLENBQUMsR0FBUTtJQUM1RCxPQUFPLG1DQUFtQyxDQUFDLEdBQUcsQ0FBQztRQUM5QyxtREFBbUQ7UUFDbkQsT0FBYSxHQUFJLENBQUMsMkJBQTJCLEtBQUssVUFBVSxDQUFDO0FBQy9ELENBQUM7QUFFRCxNQUFNLFVBQVUsNkJBQTZCLENBQUMsR0FBUTtJQUNyRCxPQUFPLHVCQUF1QixDQUFDLEdBQUcsQ0FBQztRQUNsQyxtREFBbUQ7UUFDbkQsT0FBYSxHQUFJLENBQUMsMkJBQTJCLEtBQUssVUFBVSxDQUFDO0FBQy9ELENBQUM7QUFFRCxNQUFNLFVBQVUscUJBQXFCLENBQUMsR0FBUTtJQUM3QyxPQUFPLE9BQU8sR0FBRyxLQUFLLFFBQVE7UUFDN0IsR0FBRyxLQUFLLElBQUk7UUFDWixPQUFPLEdBQUcsQ0FBQyxFQUFFLEtBQUssVUFBVTtRQUM1QixHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFDekMsQ0FBQztBQUVELE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxHQUFRO0lBQ3pDLE9BQU8sT0FBTyxHQUFHLEtBQUssUUFBUTtRQUM3QixHQUFHLEtBQUssSUFBSTtRQUNaLE9BQU8sR0FBRyxDQUFDLEVBQUUsS0FBSyxVQUFVO1FBQzVCLEdBQUcsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUVELE1BQU0sVUFBVSxjQUFjLENBQUMsR0FBUTtJQUN0QyxPQUFPLE9BQU8sR0FBRyxLQUFLLFFBQVE7UUFDN0IsR0FBRyxLQUFLLElBQUk7UUFDWixPQUFPLEdBQUcsQ0FBQyxFQUFFLEtBQUssVUFBVTtRQUM1QixHQUFHLENBQUMsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLDBCQUEwQixDQUFDLENBQUM7QUFDbEQsQ0FBQztBQUVELE1BQU0sVUFBVSxjQUFjLENBQUMsT0FBc0U7SUFFcEcsTUFBTSxhQUFhLEdBQXlDLEVBQUUsQ0FBQztJQUMvRCxNQUFNLFdBQVcsR0FBMkIsRUFBRSxDQUFDO0lBQy9DLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtRQUNyQixJQUFJLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDOUIsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNyQixDQUFDO2FBQU0sQ0FBQztZQUNQLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkIsQ0FBQztJQUNGLENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxXQUFXLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsd0JBQXdCLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7QUFDeEYsQ0FBQyJ9