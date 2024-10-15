/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { ResolvedKeybinding } from '../../../../base/common/keybindings.js';
import * as nls from '../../../../nls.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SearchView } from './searchView.js';
import { ISearchConfigurationProperties, VIEW_ID } from '../../../services/search/common/search.js';
import { isSearchTreeMatch, RenderableMatch, ISearchResult, isSearchTreeFileMatch, isSearchTreeFolderMatch } from './searchTreeModel/searchTreeCommon.js';
import { searchComparer } from './searchCompare.js';

export const category = nls.localize2('search', "Search");

export function isSearchViewFocused(viewsService: IViewsService): boolean {
	const searchView = getSearchView(viewsService);
	return !!(searchView && DOM.isAncestorOfActiveElement(searchView.getContainer()));
}

export function appendKeyBindingLabel(label: string, inputKeyBinding: ResolvedKeybinding | undefined): string {
	return doAppendKeyBindingLabel(label, inputKeyBinding);
}

export function getSearchView(viewsService: IViewsService): SearchView | undefined {
	return viewsService.getActiveViewWithId(VIEW_ID) as SearchView;
}

export function getElementsToOperateOn(viewer: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): RenderableMatch[] {
	let elements: RenderableMatch[] = viewer.getSelection().filter((x): x is RenderableMatch => x !== null).sort((a, b) => searchComparer(a, b, sortConfig.sortOrder));

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
export function shouldRefocus(elements: RenderableMatch[], focusElement: RenderableMatch | undefined) {
	if (!focusElement) {
		return false;
	}
	return !focusElement || elements.includes(focusElement) || hasDownstreamMatch(elements, focusElement);
}

function hasDownstreamMatch(elements: RenderableMatch[], focusElement: RenderableMatch) {
	for (const elem of elements) {
		if ((isSearchTreeFileMatch(elem) && isSearchTreeMatch(focusElement) && elem.matches().includes(focusElement)) ||
			(isSearchTreeFolderMatch(elem) && (
				(isSearchTreeFileMatch(focusElement) && elem.getDownstreamFileMatch(focusElement.resource)) ||
				(isSearchTreeMatch(focusElement) && elem.getDownstreamFileMatch(focusElement.parent().resource))
			))) {
			return true;
		}
	}
	return false;

}

export function openSearchView(viewsService: IViewsService, focus?: boolean): Promise<SearchView | undefined> {
	return viewsService.openView(VIEW_ID, focus).then(view => (view as SearchView ?? undefined));
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding | undefined): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

