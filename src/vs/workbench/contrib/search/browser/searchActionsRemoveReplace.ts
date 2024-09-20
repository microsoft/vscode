/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITreeNavigator } from '../../../../base/browser/ui/tree/tree.js';
import * as nls from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { getSelectionKeyboardEvent, WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { searchRemoveIcon, searchReplaceIcon } from './searchIcons.js';
import { SearchView } from './searchView.js';
import * as Constants from '../common/constants.js';
import { IReplaceService } from './replace.js';
import { arrayContainsElementOrParent, FileMatch, FolderMatch, Match, MatchInNotebook, RenderableMatch, SearchResult, TextSearchResult } from './searchModel.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ISearchConfiguration, ISearchConfigurationProperties } from '../../../services/search/common/search.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { category, getElementsToOperateOn, getSearchView, shouldRefocus } from './searchActionsBase.js';
import { equals } from '../../../../base/common/arrays.js';


//#region Interfaces
export interface ISearchActionContext {
	readonly viewer: WorkbenchCompressibleAsyncDataTree<SearchResult, RenderableMatch>;
	readonly element: RenderableMatch;
}


export interface IFindInFilesArgs {
	query?: string;
	replace?: string;
	preserveCase?: boolean;
	triggerSearch?: boolean;
	filesToInclude?: string;
	filesToExclude?: string;
	isRegex?: boolean;
	isCaseSensitive?: boolean;
	matchWholeWord?: boolean;
	useExcludeSettingsAndIgnoreFiles?: boolean;
	onlyOpenEditors?: boolean;
}

//#endregion

//#region Actions
registerAction2(class RemoveAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.RemoveActionId,
			title: nls.localize2('RemoveAction.label', "Dismiss"),
			category,
			icon: searchRemoveIcon,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
				primary: KeyCode.Delete,
				mac: {
					primary: KeyMod.CtrlCmd | KeyCode.Backspace,
				},
			},
			menu: [
				{
					id: MenuId.SearchContext,
					group: 'search',
					order: 2,
				},
				{
					id: MenuId.SearchActionMenu,
					group: 'inline',
					order: 2,
				},
			]
		});
	}

	async run(accessor: ServicesAccessor, context: ISearchActionContext | undefined): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		const configurationService = accessor.get(IConfigurationService);
		const searchView = getSearchView(viewsService);

		if (!searchView) {
			return;
		}

		let element = context?.element;
		let viewer = context?.viewer;
		if (!viewer) {
			viewer = searchView.getControl();
		}
		if (!element) {
			element = viewer.getFocus()[0] ?? undefined;
		}

		const elementsToRemove = getElementsToOperateOn(viewer, element, configurationService.getValue<ISearchConfigurationProperties>('search'));
		let focusElement = viewer.getFocus()[0] ?? undefined;

		if (elementsToRemove.length === 0) {
			return;
		}

		if (!focusElement || (focusElement instanceof SearchResult)) {
			focusElement = element;
		}

		let nextFocusElement;
		const shouldRefocusMatch = shouldRefocus(elementsToRemove, focusElement);
		if (focusElement && shouldRefocusMatch) {
			nextFocusElement = getElementToFocusAfterRemoved(viewer, focusElement, elementsToRemove);
		}

		const searchResult = searchView.searchResult;

		if (searchResult) {
			searchResult.batchRemove(elementsToRemove);
		}

		await searchView.refreshTreePromiseSerializer; // wait for refreshTree to finish

		if (focusElement && shouldRefocusMatch) {
			if (!nextFocusElement) {
				nextFocusElement = getLastNodeFromSameType(viewer, focusElement);
			}

			if (nextFocusElement && !arrayContainsElementOrParent(nextFocusElement, elementsToRemove)) {
				viewer.reveal(nextFocusElement);
				viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
				viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
			}
		} else if (!equals(viewer.getFocus(), viewer.getSelection())) {
			viewer.setSelection(viewer.getFocus());
		}

		viewer.domFocus();
		return;
	}
});

registerAction2(class ReplaceAction extends Action2 {
	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.ReplaceActionId,
			title: nls.localize2('match.replace.label', "Replace"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
			},
			icon: searchReplaceIcon,
			menu: [
				{
					id: MenuId.SearchContext,
					when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
					group: 'search',
					order: 1
				},
				{
					id: MenuId.SearchActionMenu,
					when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
					group: 'inline',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, context: ISearchActionContext | undefined): Promise<any> {
		return performReplace(accessor, context);
	}
});

registerAction2(class ReplaceAllAction extends Action2 {

	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.ReplaceAllInFileActionId,
			title: nls.localize2('file.replaceAll.label', "Replace All"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter],
			},
			icon: searchReplaceIcon,
			menu: [
				{
					id: MenuId.SearchContext,
					when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
					group: 'search',
					order: 1
				},
				{
					id: MenuId.SearchActionMenu,
					when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
					group: 'inline',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, context: ISearchActionContext | undefined): Promise<any> {
		return performReplace(accessor, context);
	}
});

registerAction2(class ReplaceAllInFolderAction extends Action2 {
	constructor(
	) {
		super({
			id: Constants.SearchCommandIds.ReplaceAllInFolderActionId,
			title: nls.localize2('file.replaceAll.label', "Replace All"),
			category,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
				primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter],
			},
			icon: searchReplaceIcon,
			menu: [
				{
					id: MenuId.SearchContext,
					when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
					group: 'search',
					order: 1
				},
				{
					id: MenuId.SearchActionMenu,
					when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
					group: 'inline',
					order: 1
				}
			]
		});
	}

	override async run(accessor: ServicesAccessor, context: ISearchActionContext | undefined): Promise<any> {
		return performReplace(accessor, context);
	}
});

//#endregion

//#region Helpers

async function performReplace(accessor: ServicesAccessor,
	context: ISearchActionContext | undefined) {
	const configurationService = accessor.get(IConfigurationService);
	const viewsService = accessor.get(IViewsService);

	const viewlet: SearchView | undefined = getSearchView(viewsService);
	const viewer: WorkbenchCompressibleAsyncDataTree<SearchResult, RenderableMatch> | undefined = context?.viewer ?? viewlet?.getControl();

	if (!viewer) {
		return;
	}
	const element: RenderableMatch | null = context?.element ?? viewer.getFocus()[0];

	// since multiple elements can be selected, we need to check the type of the FolderMatch/FileMatch/Match before we perform the replace.
	const elementsToReplace = getElementsToOperateOn(viewer, element ?? undefined, configurationService.getValue<ISearchConfigurationProperties>('search'));
	let focusElement = viewer.getFocus()[0];

	if (!focusElement || (focusElement && !arrayContainsElementOrParent(focusElement, elementsToReplace)) || (focusElement instanceof SearchResult)) {
		focusElement = element;
	}

	if (elementsToReplace.length === 0) {
		return;
	}
	let nextFocusElement;
	if (focusElement) {
		nextFocusElement = getElementToFocusAfterRemoved(viewer, focusElement, elementsToReplace);
	}

	const searchResult = viewlet?.searchResult;

	if (searchResult) {
		await searchResult.batchReplace(elementsToReplace);
	}

	await viewlet?.refreshTreePromiseSerializer; // wait for refreshTree to finish

	if (focusElement) {
		if (!nextFocusElement) {
			nextFocusElement = getLastNodeFromSameType(viewer, focusElement);
		}

		if (nextFocusElement) {
			viewer.reveal(nextFocusElement);
			viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
			viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());

			if (nextFocusElement instanceof Match) {
				const useReplacePreview = configurationService.getValue<ISearchConfiguration>().search.useReplacePreview;
				if (!useReplacePreview || hasToOpenFile(accessor, nextFocusElement) || nextFocusElement instanceof MatchInNotebook) {
					viewlet?.open(nextFocusElement, true);
				} else {
					accessor.get(IReplaceService).openReplacePreview(nextFocusElement, true);
				}
			} else if (nextFocusElement instanceof FileMatch) {
				viewlet?.open(nextFocusElement, true);
			}
		}

	}

	viewer.domFocus();
}

function hasToOpenFile(accessor: ServicesAccessor, currBottomElem: RenderableMatch): boolean {
	if (!(currBottomElem instanceof Match)) {
		return false;
	}
	const activeEditor = accessor.get(IEditorService).activeEditor;
	const file = activeEditor?.resource;
	if (file) {
		return accessor.get(IUriIdentityService).extUri.isEqual(file, currBottomElem.parent().resource);
	}
	return false;
}

function compareLevels(elem1: RenderableMatch, elem2: RenderableMatch) {
	if (elem1 instanceof Match) {
		if (elem2 instanceof Match) {
			return 0;
		} else {
			return -1;
		}

	} else if (elem1 instanceof FileMatch) {
		if (elem2 instanceof Match) {
			return 1;
		} else if (elem2 instanceof FileMatch) {
			return 0;
		} else {
			return -1;
		}

	} else if (elem2 instanceof FolderMatch) {
		// FolderMatch
		if (elem2 instanceof TextSearchResult) {
			return -1;
		} else if (elem2 instanceof FolderMatch) {
			return 0;
		} else {
			return 1;
		}
	} else {
		// textSearchResult
		if (elem2 instanceof TextSearchResult) {
			return 0;
		} else {
			return 1;
		}
	}
}

/**
 * Returns element to focus after removing the given element
 */
export function getElementToFocusAfterRemoved(viewer: WorkbenchCompressibleAsyncDataTree<SearchResult, RenderableMatch>, element: RenderableMatch, elementsToRemove: RenderableMatch[]): RenderableMatch | undefined {
	const navigator: ITreeNavigator<any> = viewer.navigate(element);
	if (element instanceof FolderMatch) {
		while (!!navigator.next() && (!(navigator.current() instanceof FolderMatch) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) { }
	} else if (element instanceof FileMatch) {
		while (!!navigator.next() && (!(navigator.current() instanceof FileMatch) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
			viewer.expand(navigator.current());
		}
	} else {
		while (navigator.next() && (!(navigator.current() instanceof Match) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
			viewer.expand(navigator.current());
		}
	}
	return navigator.current();
}

/***
 * Finds the last element in the tree with the same type as `element`
 */
export function getLastNodeFromSameType(viewer: WorkbenchCompressibleAsyncDataTree<SearchResult, RenderableMatch>, element: RenderableMatch): RenderableMatch | undefined {
	let lastElem: RenderableMatch | null = viewer.lastVisibleElement ?? null;

	while (lastElem) {
		const compareVal = compareLevels(element, lastElem);
		if (compareVal === -1) {
			viewer.expand(lastElem);
			lastElem = viewer.lastVisibleElement;
		} else if (compareVal === 1) {
			const potentialLastElem = viewer.getParentElement(lastElem);
			if (potentialLastElem instanceof SearchResult) {
				break;
			} else {
				lastElem = potentialLastElem;
			}
		} else {
			return lastElem;
		}
	}

	return undefined;
}

//#endregion

