
import { Match } from './match';
import { compareFileExtensions, compareFileNames, comparePaths } from '../../../../../base/common/comparers.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { FileMatch, ISearchRange, ITextSearchMatch, SearchSortOrder } from '../../../../services/search/common/search.js';
import { MatchInNotebook } from '../notebookSearch/notebookSearchModel.js';
import { IFileInstanceMatch, ITextSearchHeading, IFolderMatch, isSearchResult, isFolderMatch, isTextSearchHeading, isFileInstanceMatch } from './ISearchTreeBase';




export type FileMatchOrMatch = IFileInstanceMatch | Match;

export type RenderableMatch = ITextSearchHeading | IFolderMatch | IFileInstanceMatch | Match;
export function arrayContainsElementOrParent(element: RenderableMatch, testArray: RenderableMatch[]): boolean {
	do {
		if (testArray.includes(element)) {
			return true;
		}
	} while (!isSearchResult(element.parent()) && (element = <RenderableMatch>element.parent()));

	return false;
}


export interface IChangeEvent {
	elements: IFileInstanceMatch[];
	added?: boolean;
	removed?: boolean;
	clearingAll?: boolean;
}
export enum SearchModelLocation {
	PANEL,
	QUICK_ACCESS
}


export const PLAIN_TEXT_SEARCH__RESULT_ID = 'plainTextSearch';
export const AI_TEXT_SEARCH_RESULT_ID = 'aiTextSearch';


let elemAIndex: number = -1;
let elemBIndex: number = -1;
/**
 * Compares instances of the same match type. Different match types should not be siblings
 * and their sort order is undefined.
 */
export function searchMatchComparer(elementA: RenderableMatch, elementB: RenderableMatch, sortOrder: SearchSortOrder = SearchSortOrder.Default): number {

	if (elementA instanceof FileMatch && isFolderMatch(elementB)) {
		return 1;
	}

	if (elementB instanceof FileMatch && isFolderMatch(elementA)) {
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

	if (elementA instanceof Match && elementB instanceof Match) {
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

export function createParentList(element: RenderableMatch): RenderableMatch[] {
	const parentArray: RenderableMatch[] = [];
	let currElement: RenderableMatch | ITextSearchHeading = element;

	while (!isTextSearchHeading(currElement)) {
		parentArray.push(currElement);
		currElement = currElement.parent();
	}

	return parentArray;
}




export function mergeSearchResultEvents(events: IChangeEvent[]): IChangeEvent {
	const retEvent: IChangeEvent = {
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

export function textSearchResultToMatches(rawMatch: ITextSearchMatch, fileMatch: IFileInstanceMatch, isAiContributed: boolean): Match[] {
	const previewLines = rawMatch.previewText.split('\n');
	return rawMatch.rangeLocations.map((rangeLocation) => {
		const previewRange: ISearchRange = rangeLocation.preview;
		return new Match(fileMatch, previewLines, previewRange, rangeLocation.source, isAiContributed);
	});
}

