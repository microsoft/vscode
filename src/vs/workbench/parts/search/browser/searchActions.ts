/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { INavigator } from 'vs/base/common/iterator';
import { SearchView } from 'vs/workbench/parts/search/browser/searchView';
import { Match, FileMatch, FileMatchOrMatch, FolderMatch, RenderableMatch } from 'vs/workbench/parts/search/common/searchModel';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ResolvedKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { OS } from 'vs/base/common/platform';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { VIEW_ID } from 'vs/platform/search/common/search';

export function isSearchViewFocused(viewletService: IViewletService, panelService: IPanelService): boolean {
	let searchView = getSearchView(viewletService, panelService);
	let activeElement = document.activeElement;
	return searchView && activeElement && DOM.isAncestor(activeElement, searchView.getContainer().getHTMLElement());
}

export function appendKeyBindingLabel(label: string, keyBinding: number | ResolvedKeybinding, keyBindingService2: IKeybindingService): string {
	if (typeof keyBinding === 'number') {
		const resolvedKeybindings = keyBindingService2.resolveKeybinding(createKeybinding(keyBinding, OS));
		return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : null);
	} else {
		return doAppendKeyBindingLabel(label, keyBinding);
	}
}

export function openSearchView(viewletService: IViewletService, panelService: IPanelService, focus?: boolean): TPromise<SearchView> {
	if (viewletService.getViewlets().filter(v => v.id === VIEW_ID).length) {
		return viewletService.openViewlet(VIEW_ID, focus).then(viewlet => <SearchView>viewlet);
	}

	return panelService.openPanel(VIEW_ID, focus).then(panel => <SearchView>panel);
}

export function getSearchView(viewletService: IViewletService, panelService: IPanelService): SearchView {
	const activeViewlet = viewletService.getActiveViewlet();
	if (activeViewlet && activeViewlet.getId() === VIEW_ID) {
		return <SearchView>activeViewlet;
	}

	const activePanel = panelService.getActivePanel();
	if (activePanel && activePanel.getId() === VIEW_ID) {
		return <SearchView>activePanel;
	}

	return undefined;
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

export const toggleCaseSensitiveCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
	searchView.toggleCaseSensitive();
};

export const toggleWholeWordCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
	searchView.toggleWholeWords();
};

export const toggleRegexCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewletService), accessor.get(IPanelService));
	searchView.toggleRegex();
};

export class ShowNextSearchIncludeAction extends Action {

	public static readonly ID = 'search.history.showNextIncludePattern';
	public static readonly LABEL = nls.localize('nextSearchIncludePattern', "Show Next Search Include Pattern");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(Constants.SearchViewVisibleKey);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.searchIncludePattern.showNextTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchIncludeAction extends Action {

	public static readonly ID = 'search.history.showPreviousIncludePattern';
	public static readonly LABEL = nls.localize('previousSearchIncludePattern', "Show Previous Search Include Pattern");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(Constants.SearchViewVisibleKey);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.searchIncludePattern.showPreviousTerm();
		return TPromise.as(null);
	}
}

export class ShowNextSearchTermAction extends Action {

	public static readonly ID = 'search.history.showNext';
	public static readonly LABEL = nls.localize('nextSearchTerm', "Show Next Search Term");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(Constants.SearchViewVisibleKey);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.searchAndReplaceWidget.showNextSearchTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchTermAction extends Action {

	public static readonly ID = 'search.history.showPrevious';
	public static readonly LABEL = nls.localize('previousSearchTerm', "Show Previous Search Term");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(Constants.SearchViewVisibleKey);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.searchAndReplaceWidget.showPreviousSearchTerm();
		return TPromise.as(null);
	}
}

export class FocusNextInputAction extends Action {

	public static readonly ID = 'search.focus.nextInputBox';

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.focusNextInputBox();
		return TPromise.as(null);
	}
}

export class FocusPreviousInputAction extends Action {

	public static readonly ID = 'search.focus.previousInputBox';

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.focusPreviousInputBox();
		return TPromise.as(null);
	}
}

export const FocusActiveEditorCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IWorkbenchEditorService);
	const editor = editorService.getActiveEditor();
	if (editor) {
		editor.focus();
	}
	return TPromise.as(true);
};

export abstract class FindOrReplaceInFilesAction extends Action {

	constructor(id: string, label: string, private viewletService: IViewletService, private panelService: IPanelService,
		private expandSearchReplaceWidget: boolean, private selectWidgetText: boolean, private focusReplace: boolean) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		return openSearchView(this.viewletService, this.panelService, true).then(openedView => {
			if (!searchView || this.expandSearchReplaceWidget) {
				const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(this.expandSearchReplaceWidget);
				// Focus replace only when there is text in the searchInput box
				const focusReplace = this.focusReplace && searchAndReplaceWidget.searchInput.getValue();
				searchAndReplaceWidget.focus(this.selectWidgetText, !!focusReplace);
			}
		});
	}
}

export const SHOW_SEARCH_LABEL = nls.localize('showSearchViewlet', "Show Search");

export class FindInFilesAction extends FindOrReplaceInFilesAction {

	public static readonly LABEL = nls.localize('findInFiles', "Find in Files");

	constructor(id: string, label: string,
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService
	) {
		super(id, label, viewletService, panelService, /*expandSearchReplaceWidget=*/false, /*selectWidgetText=*/true, /*focusReplace=*/false);
	}
}

export class ReplaceInFilesAction extends FindOrReplaceInFilesAction {

	public static readonly ID = 'workbench.action.replaceInFiles';
	public static readonly LABEL = nls.localize('replaceInFiles', "Replace in Files");

	constructor(id: string, label: string,
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService
	) {
		super(id, label, viewletService, panelService, /*expandSearchReplaceWidget=*/true, /*selectWidgetText=*/false, /*focusReplace=*/true);
	}
}

export class CloseReplaceAction extends Action {

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.searchAndReplaceWidget.toggleReplace(false);
		searchView.searchAndReplaceWidget.focus();
		return TPromise.as(null);
	}
}

export class RefreshAction extends Action {

	static readonly ID: string = 'search.action.refreshSearchResults';
	static LABEL: string = nls.localize('RefreshAction.label', "Refresh");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'search-action refresh');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && searchView.isSearchSubmitted();
	}

	public run(): TPromise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			searchView.onQueryChanged(true);
		}
		return TPromise.as(null);
	}
}

export class CollapseDeepestExpandedLevelAction extends Action {

	static readonly ID: string = 'search.action.collapseSearchResults';
	static LABEL: string = nls.localize('CollapseDeepestExpandedLevelAction.label', "Collapse All");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'search-action collapse');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && searchView.hasSearchResults();
	}

	public run(): TPromise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			const viewer = searchView.getControl();
			if (viewer.getHighlight()) {
				return TPromise.as(null); // Global action disabled if user is in edit mode from another action
			}

			viewer.collapseDeepestExpandedLevel();
			viewer.clearSelection();
			viewer.clearFocus();
			viewer.domFocus();
			viewer.focusFirst();
		}
		return TPromise.as(null);
	}
}

export class ClearSearchResultsAction extends Action {

	static readonly ID: string = 'search.action.clearSearchResults';
	static LABEL: string = nls.localize('ClearSearchResultsAction.label', "Clear");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'search-action clear-search-results');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && searchView.hasSearchResults();
	}

	public run(): TPromise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			searchView.clearSearchResults();
		}
		return TPromise.as(null);
	}
}

export class CancelSearchAction extends Action {

	static readonly ID: string = 'search.action.cancelSearch';
	static LABEL: string = nls.localize('CancelSearchAction.label', "Cancel Search");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'search-action cancel-search');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && searchView.isSearching();
	}

	public run(): TPromise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			searchView.cancelSearch();
		}

		return TPromise.as(null);
	}
}

export class FocusNextSearchResultAction extends Action {
	public static readonly ID = 'search.action.focusNextSearchResult';
	public static readonly LABEL = nls.localize('FocusNextSearchResult.label', "Focus Next Search Result");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return openSearchView(this.viewletService, this.panelService).then(searchView => {
			searchView.selectNextMatch();
		});
	}
}

export class FocusPreviousSearchResultAction extends Action {
	public static readonly ID = 'search.action.focusPreviousSearchResult';
	public static readonly LABEL = nls.localize('FocusPreviousSearchResult.label', "Focus Previous Search Result");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return openSearchView(this.viewletService, this.panelService).then(searchView => {
			searchView.selectPreviousMatch();
		});
	}
}

export abstract class AbstractSearchAndReplaceAction extends Action {

	/**
	 * Returns element to focus after removing the given element
	 */
	public getElementToFocusAfterRemoved(viewer: ITree, elementToBeRemoved: RenderableMatch): RenderableMatch {
		let elementToFocus = this.getNextElementAfterRemoved(viewer, elementToBeRemoved);
		if (!elementToFocus) {
			elementToFocus = this.getPreviousElementAfterRemoved(viewer, elementToBeRemoved);
		}
		return elementToFocus;
	}

	public getNextElementAfterRemoved(viewer: ITree, element: RenderableMatch): RenderableMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		if (element instanceof FolderMatch) {
			// If file match is removed then next element is the next file match
			while (!!navigator.next() && !(navigator.current() instanceof FolderMatch)) { }
		} else if (element instanceof FileMatch) {
			// If file match is removed then next element is the next file match
			while (!!navigator.next() && !(navigator.current() instanceof FileMatch)) { }
		} else {
			navigator.next();
		}
		return navigator.current();
	}

	public getPreviousElementAfterRemoved(viewer: ITree, element: RenderableMatch): RenderableMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		let previousElement = navigator.previous();
		if (element instanceof Match && element.parent().matches().length === 1) {
			// If this is the only match, then the file match is also removed
			// Hence take the previous element to file match
			previousElement = navigator.previous();
		}
		return previousElement;
	}

	private getNavigatorAt(element: RenderableMatch, viewer: ITree): INavigator<any> {
		let navigator: INavigator<any> = viewer.getNavigator();
		while (navigator.current() !== element && !!navigator.next()) { }
		return navigator;
	}
}

export class RemoveAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: RenderableMatch) {
		super('remove', nls.localize('RemoveAction.label', "Dismiss"), 'action-remove');
	}

	public run(): TPromise<any> {
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.element);
		if (nextFocusElement) {
			this.viewer.setFocus(nextFocusElement);
		}

		let elementToRefresh: any;
		const element = this.element;
		if (element instanceof FolderMatch) {
			let parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent;
		} else if (element instanceof FileMatch) {
			let parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent;
		} else if (element instanceof Match) {
			let parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent.count() === 0 ? parent.parent() : parent;
		}

		this.viewer.domFocus();
		return this.viewer.refresh(elementToRefresh);
	}

}

export class ReplaceAllAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private fileMatch: FileMatch, private viewlet: SearchView,
		@IKeybindingService keyBindingService: IKeybindingService) {
		super(Constants.ReplaceAllInFileActionId, appendKeyBindingLabel(nls.localize('file.replaceAll.label', "Replace All"), keyBindingService.lookupKeybinding(Constants.ReplaceAllInFileActionId), keyBindingService), 'action-replace-all');
	}

	public run(): TPromise<any> {
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.fileMatch);
		return this.fileMatch.parent().replace(this.fileMatch).then(() => {
			if (nextFocusElement) {
				this.viewer.setFocus(nextFocusElement);
			}
			this.viewer.domFocus();
			this.viewlet.open(this.fileMatch, true);
		});
	}
}

export class ReplaceAllInFolderAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private folderMatch: FolderMatch,
		@IKeybindingService keyBindingService: IKeybindingService
	) {
		super(Constants.ReplaceAllInFolderActionId, appendKeyBindingLabel(nls.localize('file.replaceAll.label', "Replace All"), keyBindingService.lookupKeybinding(Constants.ReplaceAllInFolderActionId), keyBindingService), 'action-replace-all');
	}

	public async run(): TPromise<any> {
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.folderMatch);
		await this.folderMatch.replaceAll();

		if (nextFocusElement) {
			this.viewer.setFocus(nextFocusElement);
		}
		this.viewer.domFocus();
	}
}

export class ReplaceAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: Match, private viewlet: SearchView,
		@IReplaceService private replaceService: IReplaceService,
		@IKeybindingService keyBindingService: IKeybindingService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(Constants.ReplaceActionId, appendKeyBindingLabel(nls.localize('match.replace.label', "Replace"), keyBindingService.lookupKeybinding(Constants.ReplaceActionId), keyBindingService), 'action-replace');
	}

	public run(): TPromise<any> {
		this.enabled = false;

		return this.element.parent().replace(this.element).then(() => {
			let elementToFocus = this.getElementToFocusAfterReplace();
			if (elementToFocus) {
				this.viewer.setFocus(elementToFocus);
			}
			let elementToShowReplacePreview = this.getElementToShowReplacePreview(elementToFocus);
			this.viewer.domFocus();
			if (!elementToShowReplacePreview || this.hasToOpenFile()) {
				this.viewlet.open(this.element, true);
			} else {
				this.replaceService.openReplacePreview(elementToShowReplacePreview, true);
			}
		});
	}

	private getElementToFocusAfterReplace(): Match {
		let navigator: INavigator<any> = this.viewer.getNavigator();
		let fileMatched = false;
		let elementToFocus = null;
		do {
			elementToFocus = navigator.current();
			if (elementToFocus instanceof Match) {
				if (elementToFocus.parent().id() === this.element.parent().id()) {
					fileMatched = true;
					if (this.element.range().getStartPosition().isBeforeOrEqual((<Match>elementToFocus).range().getStartPosition())) {
						// Closest next match in the same file
						break;
					}
				} else if (fileMatched) {
					// First match in the next file (if expanded)
					break;
				}
			} else if (fileMatched) {
				if (!this.viewer.isExpanded(elementToFocus)) {
					// Next file match (if collapsed)
					break;
				}
			}
		} while (!!navigator.next());
		return elementToFocus;
	}

	private getElementToShowReplacePreview(elementToFocus: FileMatchOrMatch): Match {
		if (this.hasSameParent(elementToFocus)) {
			return <Match>elementToFocus;
		}
		let previousElement = this.getPreviousElementAfterRemoved(this.viewer, this.element);
		if (this.hasSameParent(previousElement)) {
			return <Match>previousElement;
		}
		return null;
	}

	private hasSameParent(element: RenderableMatch): boolean {
		return element && element instanceof Match && element.parent().resource() === this.element.parent().resource();
	}

	private hasToOpenFile(): boolean {
		const activeInput = this.editorService.getActiveEditorInput();
		const file = activeInput ? activeInput.getResource() : void 0;
		if (file) {
			return file.toString() === this.element.parent().resource().toString();
		}
		return false;
	}
}
