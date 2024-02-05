/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ResolvedKeybinding } from 'vs/base/common/keybindings';
import * as nls from 'vs/nls';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';
import { SearchView } from 'vs/workbench/contrib/search/browser/searchView';
import { FileMatch, FolderMatch, Match, RenderableMatch, searchComparer } from 'vs/workbench/contrib/search/browser/searchModel';
import { ISearchConfigurationProperties, VIEW_ID } from 'vs/workbench/services/search/common/search';

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

export function getElementsToOperateOn(viewer: WorkbenchCompressibleObjectTree<RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): RenderableMatch[] {
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
		if ((elem instanceof FileMatch && focusElement instanceof Match && elem.matches().includes(focusElement)) ||
			(elem instanceof FolderMatch && (
				(focusElement instanceof FileMatch && elem.getDownstreamFileMatch(focusElement.resource)) ||
				(focusElement instanceof Match && elem.getDownstreamFileMatch(focusElement.parent().resource))
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

