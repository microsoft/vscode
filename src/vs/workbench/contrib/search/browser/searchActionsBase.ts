/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { createKeybinding, ResolvedKeybinding } from 'vs/base/common/keybindings';
import { OS } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { IViewsService } from 'vs/workbench/common/views';
import { SearchView } from 'vs/workbench/contrib/search/browser/searchView';
import { FileMatch, FolderMatch, Match, RenderableMatch, searchComparer } from 'vs/workbench/contrib/search/common/searchModel';
import { ISearchConfigurationProperties, VIEW_ID } from 'vs/workbench/services/search/common/search';

export const category = { value: nls.localize('search', "Search"), original: 'Search' };

export function isSearchViewFocused(viewsService: IViewsService): boolean {
	const searchView = getSearchView(viewsService);
	const activeElement = document.activeElement;
	return !!(searchView && activeElement && DOM.isAncestor(activeElement, searchView.getContainer()));
}

export function appendKeyBindingLabel(label: string, inputKeyBinding: number | ResolvedKeybinding | undefined, keyBindingService2: IKeybindingService): string {
	if (typeof inputKeyBinding === 'number') {
		const keybinding = createKeybinding(inputKeyBinding, OS);
		if (keybinding) {
			const resolvedKeybindings = keyBindingService2.resolveKeybinding(keybinding);
			return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : undefined);
		}
		return doAppendKeyBindingLabel(label, undefined);
	} else {
		return doAppendKeyBindingLabel(label, inputKeyBinding);
	}
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

export function shouldRefocus(elements: RenderableMatch[], focusElement: RenderableMatch | undefined) {
	if (!focusElement) {
		return false;
	}
	return !focusElement || elements.includes(focusElement) || hasDownstreamMatch(elements, focusElement); // this indicates whether we need to re-focus/re-select on a remove.
}

function hasDownstreamMatch(elementsToRemove: RenderableMatch[], focusedElement: RenderableMatch) {
	for (const elem of elementsToRemove) {
		if ((elem instanceof FileMatch && focusedElement instanceof Match && elem.matches().includes(focusedElement)) ||
			(elem instanceof FolderMatch && (
				(focusedElement instanceof FileMatch && elem.getDownstreamFileMatch(focusedElement.resource)) ||
				(focusedElement instanceof Match && elem.getDownstreamFileMatch(focusedElement.parent().resource))
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

