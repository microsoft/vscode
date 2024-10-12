import { compareFileExtensions, compareFileNames, comparePaths } from '../../../../base/common/comparers';
import { SearchSortOrder } from '../../../services/search/common/search';
import { MatchInNotebook } from './notebookSearch/notebookSearchModel';
import { RenderableMatch, isFileInstanceMatch, isFolderMatch, createParentList, isSearchMatch } from './searchTreeModel/searchTreeCommon';
import { Range } from '../../../../editor/common/core/range.js';

let elemAIndex: number = -1;
let elemBIndex: number = -1;
/**
 * Compares instances of the same match type. Different match types should not be siblings
 * and their sort order is undefined.
 */
export function searchMatchComparer(elementA: RenderableMatch, elementB: RenderableMatch, sortOrder: SearchSortOrder = SearchSortOrder.Default): number {

	if (isFileInstanceMatch(elementA) && isFolderMatch(elementB)) {
		return 1;
	}

	if (isFileInstanceMatch(elementB) && isFolderMatch(elementA)) {
		return -1;
	}

	if (isFolderMatch(elementA) && isFolderMatch(elementB)) {
		elemAIndex = elementA.index();
		elemBIndex = elementB.index();
		if (elemAIndex !== -1 && elemBIndex !== -1) {
			return elemAIndex - elemBIndex;
		}

		switch (sortOrder) {
			case SearchSortOrder.CountDescending:
				return elementB.count() - elementA.count();
			case SearchSortOrder.CountAscending:
				return elementA.count() - elementB.count();
			case SearchSortOrder.Type:
				return compareFileExtensions(elementA.name(), elementB.name());
			case SearchSortOrder.FileNames:
				return compareFileNames(elementA.name(), elementB.name());
			// Fall through otherwise
			default:
				if (!elementA.resource || !elementB.resource) {
					return 0;
				}
				return comparePaths(elementA.resource.fsPath, elementB.resource.fsPath) || compareFileNames(elementA.name(), elementB.name());
		}
	}

	if (isFileInstanceMatch(elementA) && isFileInstanceMatch(elementB)) {
		switch (sortOrder) {
			case SearchSortOrder.CountDescending:
				return elementB.count() - elementA.count();
			case SearchSortOrder.CountAscending:
				return elementA.count() - elementB.count();
			case SearchSortOrder.Type:
				return compareFileExtensions(elementA.name(), elementB.name());
			case SearchSortOrder.FileNames:
				return compareFileNames(elementA.name(), elementB.name());
			case SearchSortOrder.Modified: {
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

	if (elementA instanceof MatchInNotebook && elementB instanceof MatchInNotebook) {
		return compareNotebookPos(elementA, elementB);
	}

	if (isSearchMatch(elementA) && isSearchMatch(elementB)) {
		return Range.compareRangesUsingStarts(elementA.range(), elementB.range());
	}

	return 0;
}

export function compareNotebookPos(match1: MatchInNotebook, match2: MatchInNotebook): number {
	if (match1.cellIndex === match2.cellIndex) {

		if (match1.webviewIndex !== undefined && match2.webviewIndex !== undefined) {
			return match1.webviewIndex - match2.webviewIndex;
		} else if (match1.webviewIndex === undefined && match2.webviewIndex === undefined) {
			return Range.compareRangesUsingStarts(match1.range(), match2.range());
		} else {
			// webview matches should always be after content matches
			if (match1.webviewIndex !== undefined) {
				return 1;
			} else {
				return -1;
			}
		}
	} else if (match1.cellIndex < match2.cellIndex) {
		return -1;
	} else {
		return 1;
	}
}

export function searchComparer(elementA: RenderableMatch, elementB: RenderableMatch, sortOrder: SearchSortOrder = SearchSortOrder.Default): number {
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
	} else if (!elemAAtEnd && elemBAtEnd) {
		return -1;
	}
	return 0;
}
