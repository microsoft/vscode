/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isIMatchInNotebook } from './notebookSearch/notebookSearchModelBase.js';
import { compareFileExtensions, compareFileNames, comparePaths } from '../../../../base/common/comparers.js';
import { Range } from '../../../../editor/common/core/range.js';
import { createParentList, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeMatch } from './searchTreeModel/searchTreeCommon.js';
import { isSearchTreeAIFileMatch } from './AISearch/aiSearchModelBase.js';
let elemAIndex = -1;
let elemBIndex = -1;
/**
 * Compares instances of the same match type. Different match types should not be siblings
 * and their sort order is undefined.
 */
export function searchMatchComparer(elementA, elementB, sortOrder = "default" /* SearchSortOrder.Default */) {
    if (isSearchTreeFileMatch(elementA) && isSearchTreeFolderMatch(elementB)) {
        return 1;
    }
    if (isSearchTreeFileMatch(elementB) && isSearchTreeFolderMatch(elementA)) {
        return -1;
    }
    if (isSearchTreeFolderMatch(elementA) && isSearchTreeFolderMatch(elementB)) {
        elemAIndex = elementA.index();
        elemBIndex = elementB.index();
        if (elemAIndex !== -1 && elemBIndex !== -1) {
            return elemAIndex - elemBIndex;
        }
        if (isSearchTreeAIFileMatch(elementA) && isSearchTreeAIFileMatch(elementB)) {
            return elementA.rank - elementB.rank;
        }
        switch (sortOrder) {
            case "countDescending" /* SearchSortOrder.CountDescending */:
                return elementB.count() - elementA.count();
            case "countAscending" /* SearchSortOrder.CountAscending */:
                return elementA.count() - elementB.count();
            case "type" /* SearchSortOrder.Type */:
                return compareFileExtensions(elementA.name(), elementB.name());
            case "fileNames" /* SearchSortOrder.FileNames */:
                return compareFileNames(elementA.name(), elementB.name());
            // Fall through otherwise
            default:
                if (!elementA.resource || !elementB.resource) {
                    return 0;
                }
                return comparePaths(elementA.resource.fsPath, elementB.resource.fsPath) || compareFileNames(elementA.name(), elementB.name());
        }
    }
    if (isSearchTreeFileMatch(elementA) && isSearchTreeFileMatch(elementB)) {
        switch (sortOrder) {
            case "countDescending" /* SearchSortOrder.CountDescending */:
                return elementB.count() - elementA.count();
            case "countAscending" /* SearchSortOrder.CountAscending */:
                return elementA.count() - elementB.count();
            case "type" /* SearchSortOrder.Type */:
                return compareFileExtensions(elementA.name(), elementB.name());
            case "fileNames" /* SearchSortOrder.FileNames */:
                return compareFileNames(elementA.name(), elementB.name());
            case "modified" /* SearchSortOrder.Modified */: {
                const fileStatA = elementA.fileStat;
                const fileStatB = elementB.fileStat;
                if (fileStatA && fileStatB) {
                    return fileStatB.mtime - fileStatA.mtime;
                }
            }
            // Fall through otherwise
            default:
                return comparePaths(elementA.resource.fsPath, elementB.resource.fsPath) || compareFileNames(elementA.name(), elementB.name());
        }
    }
    if (isIMatchInNotebook(elementA) && isIMatchInNotebook(elementB)) {
        return compareNotebookPos(elementA, elementB);
    }
    if (isSearchTreeMatch(elementA) && isSearchTreeMatch(elementB)) {
        return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
    }
    return 0;
}
function compareNotebookPos(match1, match2) {
    if (match1.cellIndex === match2.cellIndex) {
        if (match1.webviewIndex !== undefined && match2.webviewIndex !== undefined) {
            return match1.webviewIndex - match2.webviewIndex;
        }
        else if (match1.webviewIndex === undefined && match2.webviewIndex === undefined) {
            return Range.compareRangesUsingStarts(match1.range(), match2.range());
        }
        else {
            // webview matches should always be after content matches
            if (match1.webviewIndex !== undefined) {
                return 1;
            }
            else {
                return -1;
            }
        }
    }
    else if (match1.cellIndex < match2.cellIndex) {
        return -1;
    }
    else {
        return 1;
    }
}
export function searchComparer(elementA, elementB, sortOrder = "default" /* SearchSortOrder.Default */) {
    const elemAParents = createParentList(elementA);
    const elemBParents = createParentList(elementB);
    let i = elemAParents.length - 1;
    let j = elemBParents.length - 1;
    while (i >= 0 && j >= 0) {
        if (elemAParents[i].id() !== elemBParents[j].id()) {
            return searchMatchComparer(elemAParents[i], elemBParents[j], sortOrder);
        }
        i--;
        j--;
    }
    const elemAAtEnd = i === 0;
    const elemBAtEnd = j === 0;
    if (elemAAtEnd && !elemBAtEnd) {
        return 1;
    }
    else if (!elemAAtEnd && elemBAtEnd) {
        return -1;
    }
    return 0;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VhcmNoQ29tcGFyZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaENvbXBhcmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFvQixrQkFBa0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUU3RyxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDaEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLGlCQUFpQixFQUFtQixNQUFNLHVDQUF1QyxDQUFDO0FBQzdKLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRzFFLElBQUksVUFBVSxHQUFXLENBQUMsQ0FBQyxDQUFDO0FBQzVCLElBQUksVUFBVSxHQUFXLENBQUMsQ0FBQyxDQUFDO0FBRTVCOzs7R0FHRztBQUNILE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxRQUF5QixFQUFFLFFBQXlCLEVBQUUsbURBQW9EO0lBQzdJLElBQUkscUJBQXFCLENBQUMsUUFBUSxDQUFDLElBQUksdUJBQXVCLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUMxRSxPQUFPLENBQUMsQ0FBQztJQUNWLENBQUM7SUFFRCxJQUFJLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxJQUFJLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDMUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNYLENBQUM7SUFFRCxJQUFJLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxJQUFJLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFD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