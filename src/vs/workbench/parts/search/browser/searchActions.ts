/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { INavigator } from 'vs/base/common/iterator';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { Match, FileMatch, FileMatchOrMatch, FolderMatch } from 'vs/workbench/parts/search/common/searchModel';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { CollapseAllAction as TreeCollapseAction } from 'vs/base/parts/tree/browser/treeDefaults';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ResolvedKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { toResource } from 'vs/workbench/common/editor';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService } from 'vs/platform/list/browser/listService';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { OS } from 'vs/base/common/platform';
import { IContextKeyService, ContextKeyExpr } from "vs/platform/contextkey/common/contextkey";

export function isSearchViewletFocussed(viewletService: IViewletService): boolean {
	let activeViewlet = viewletService.getActiveViewlet();
	let activeElement = document.activeElement;
	return activeViewlet && activeViewlet.getId() === Constants.VIEWLET_ID && activeElement && DOM.isAncestor(activeElement, (<SearchViewlet>activeViewlet).getContainer().getHTMLElement());
}

export function appendKeyBindingLabel(label: string, keyBinding: number | ResolvedKeybinding, keyBindingService2: IKeybindingService): string {
	if (typeof keyBinding === 'number') {
		const resolvedKeybindings = keyBindingService2.resolveKeybinding(createKeybinding(keyBinding, OS));
		return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : null);
	} else {
		return doAppendKeyBindingLabel(label, keyBinding);
	}
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

export class ToggleCaseSensitiveAction extends Action {

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let searchViewlet = <SearchViewlet>this.viewletService.getActiveViewlet();
		searchViewlet.toggleCaseSensitive();
		return TPromise.as(null);
	}
}

export class ToggleWholeWordAction extends Action {

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let searchViewlet = <SearchViewlet>this.viewletService.getActiveViewlet();
		searchViewlet.toggleWholeWords();
		return TPromise.as(null);
	}
}

export class ToggleRegexAction extends Action {

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let searchViewlet = <SearchViewlet>this.viewletService.getActiveViewlet();
		searchViewlet.toggleRegex();
		return TPromise.as(null);
	}
}

export class ShowNextSearchIncludeAction extends Action {

	public static ID = 'search.history.showNextIncludePattern';
	public static LABEL = nls.localize('nextSearchIncludePattern', "Show Next Search Include Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternIncludesFocussedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowNextSearchIncludeAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchIncludePattern;
		searchAndReplaceWidget.showNextTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchIncludeAction extends Action {

	public static ID = 'search.history.showPreviousIncludePattern';
	public static LABEL = nls.localize('previousSearchIncludePattern', "Show Previous Search Include Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternIncludesFocussedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowPreviousSearchIncludeAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchIncludePattern;
		searchAndReplaceWidget.showPreviousTerm();
		return TPromise.as(null);
	}
}

export class ShowNextSearchExcludeAction extends Action {

	public static ID = 'search.history.showNextExcludePattern';
	public static LABEL = nls.localize('nextSearchExcludePattern', "Show Next Search Exclude Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternExcludesFocussedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowNextSearchExcludeAction.CONTEXT_KEY_EXPRESSION);
	}
	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchExcludePattern;
		searchAndReplaceWidget.showNextTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchExcludeAction extends Action {

	public static ID = 'search.history.showPreviousExcludePattern';
	public static LABEL = nls.localize('previousSearchExcludePattern', "Show Previous Search Exclude Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternExcludesFocussedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowPreviousSearchExcludeAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchExcludePattern;
		searchAndReplaceWidget.showPreviousTerm();
		return TPromise.as(null);
	}
}

export class ShowNextSearchTermAction extends Action {

	public static ID = 'search.history.showNext';
	public static LABEL = nls.localize('nextSearchTerm', "Show Next Search Term");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowNextSearchTermAction.CONTEXT_KEY_EXPRESSION);

	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchAndReplaceWidget;
		searchAndReplaceWidget.showNextSearchTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchTermAction extends Action {

	public static ID = 'search.history.showPrevious';
	public static LABEL = nls.localize('previousSearchTerm', "Show Previous Search Term");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocussedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowPreviousSearchTermAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchAndReplaceWidget;
		searchAndReplaceWidget.showPreviousSearchTerm();
		return TPromise.as(null);
	}
}

export class FocusNextInputAction extends Action {

	public static ID = 'search.focus.nextInputBox';
	public static LABEL = nls.localize('focusNextInputBox', "Focus Next Input Box");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		(<SearchViewlet>this.viewletService.getActiveViewlet()).focusNextInputBox();
		return TPromise.as(null);
	}
}

export class FocusPreviousInputAction extends Action {

	public static ID = 'search.focus.previousInputBox';
	public static LABEL = nls.localize('focusPreviousInputBox', "Focus Previous Input Box");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		(<SearchViewlet>this.viewletService.getActiveViewlet()).focusPreviousInputBox();
		return TPromise.as(null);
	}
}

export class OpenSearchViewletAction extends ToggleViewletAction {

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, Constants.VIEWLET_ID, viewletService, editorService);
	}

	public run(): TPromise<any> {
		const activeViewlet = this.viewletService.getActiveViewlet();
		const searchViewletWasOpen = activeViewlet && activeViewlet.getId() === Constants.VIEWLET_ID;

		return super.run().then(() => {
			if (!searchViewletWasOpen) {
				// Get the search viewlet and ensure that 'replace' is collapsed
				const searchViewlet = this.viewletService.getActiveViewlet();
				if (searchViewlet && searchViewlet.getId() === Constants.VIEWLET_ID) {
					const searchAndReplaceWidget = (<SearchViewlet>searchViewlet).searchAndReplaceWidget;
					searchAndReplaceWidget.toggleReplace(false);
				}
			}
		});
	}

}

export class FocusActiveEditorAction extends Action {

	constructor(id: string, label: string, @IWorkbenchEditorService private editorService: IWorkbenchEditorService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let editor = this.editorService.getActiveEditor();
		if (editor) {
			editor.focus();
		}
		return TPromise.as(true);
	}

}

export abstract class FindOrReplaceInFilesAction extends Action {

	constructor(id: string, label: string, private viewletService: IViewletService,
		private expandSearchReplaceWidget: boolean, private selectWidgetText, private focusReplace) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const viewlet = this.viewletService.getActiveViewlet();
		const searchViewletWasOpen = viewlet && viewlet.getId() === Constants.VIEWLET_ID;
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet) => {
			if (!searchViewletWasOpen || this.expandSearchReplaceWidget) {
				const searchAndReplaceWidget = (<SearchViewlet>viewlet).searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(this.expandSearchReplaceWidget);
				searchAndReplaceWidget.focus(this.selectWidgetText, this.focusReplace);
			}
		});
	}
}

export class FindInFilesAction extends FindOrReplaceInFilesAction {

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService) {
		super(id, label, viewletService, /*expandSearchReplaceWidget=*/false, /*selectWidgetText=*/true, /*focusReplace=*/false);
	}
}

export class ReplaceInFilesAction extends FindOrReplaceInFilesAction {

	public static ID = 'workbench.action.replaceInFiles';
	public static LABEL = nls.localize('replaceInFiles', "Replace in Files");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService) {
		super(id, label, viewletService, /*expandSearchReplaceWidget=*/true, /*selectWidgetText=*/false, /*focusReplace=*/true);
	}
}

export class CloseReplaceAction extends Action {

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchAndReplaceWidget;
		searchAndReplaceWidget.toggleReplace(false);
		searchAndReplaceWidget.focus();
		return TPromise.as(null);
	}
}

export class FindInWorkspaceAction extends Action {

	public static ID = 'filesExplorer.findInWorkspace';

	constructor( @IViewletService private viewletService: IViewletService) {
		super(FindInWorkspaceAction.ID, nls.localize('findInWorkspace', "Find in Workspace..."));
	}

	public run(event?: any): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet: SearchViewlet) => {
			viewlet.searchInFolder(null);
		});
	}
}

export class FindInFolderAction extends Action {

	public static ID = 'filesExplorer.findInFolder';

	private resource: URI;

	constructor(resource: URI, @IInstantiationService private instantiationService: IInstantiationService) {
		super(FindInFolderAction.ID, nls.localize('findInFolder', "Find in Folder..."));

		this.resource = resource;
	}

	public run(event?: any): TPromise<any> {
		return this.instantiationService.invokeFunction.apply(this.instantiationService, [findInFolderCommand, this.resource]);
	}
}

export const findInFolderCommand = (accessor: ServicesAccessor, resource?: URI) => {
	const listService = accessor.get(IListService);
	const viewletService = accessor.get(IViewletService);

	if (!URI.isUri(resource)) {
		const focused = listService.getFocused() ? listService.getFocused().getFocus() : void 0;
		if (focused) {
			const file = explorerItemToFileResource(focused);
			if (file) {
				resource = file.isDirectory ? file.resource : URI.file(paths.dirname(file.resource.fsPath));
			}
		}
	}

	viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet: SearchViewlet) => {
		if (resource) {
			viewlet.searchInFolder(resource);
		}
	}).done(null, errors.onUnexpectedError);
};

export class RefreshAction extends Action {

	constructor(private viewlet: SearchViewlet) {
		super('refresh');

		this.label = nls.localize('RefreshAction.label', "Refresh");
		this.enabled = false;
		this.class = 'search-action refresh';
	}

	public run(): TPromise<void> {
		this.viewlet.onQueryChanged(true);

		return TPromise.as(null);
	}
}

export class CollapseAllAction extends TreeCollapseAction {

	constructor(viewlet: SearchViewlet) {
		super(viewlet.getControl(), false);
		this.class = 'search-action collapse';
	}
}

export class ClearSearchResultsAction extends Action {

	constructor(private viewlet: SearchViewlet) {
		super('clearSearchResults');

		this.label = nls.localize('ClearSearchResultsAction.label', "Clear Search Results");
		this.enabled = false;
		this.class = 'search-action clear-search-results';
	}

	public run(): TPromise<void> {
		this.viewlet.clearSearchResults();

		return TPromise.as(null);
	}
}

export class FocusNextSearchResultAction extends Action {
	public static ID = 'search.action.focusNextSearchResult';
	public static LABEL = nls.localize('FocusNextSearchResult.label', "Focus Next Search Result");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID).then((searchViewlet: SearchViewlet) => {
			searchViewlet.selectNextMatch();
		});
	}
}

export class FocusPreviousSearchResultAction extends Action {
	public static ID = 'search.action.focusPreviousSearchResult';
	public static LABEL = nls.localize('FocusPreviousSearchResult.label', "Focus Previous Search Result");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID).then((searchViewlet: SearchViewlet) => {
			searchViewlet.selectPreviousMatch();
		});
	}
}

export abstract class AbstractSearchAndReplaceAction extends Action {

	/**
	 * Returns element to focus after removing the given element
	 */
	public getElementToFocusAfterRemoved(viewer: ITree, elementToBeRemoved: FileMatchOrMatch): FileMatchOrMatch {
		let elementToFocus = this.getNextElementAfterRemoved(viewer, elementToBeRemoved);
		if (!elementToFocus) {
			elementToFocus = this.getPreviousElementAfterRemoved(viewer, elementToBeRemoved);
		}
		return elementToFocus;
	}

	public getNextElementAfterRemoved(viewer: ITree, element: FileMatchOrMatch): FileMatchOrMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		if (element instanceof FileMatch) {
			// If file match is removed then next element is the next file match
			while (!!navigator.next() && !(navigator.current() instanceof FileMatch)) { };
		} else {
			navigator.next();
		}
		return navigator.current();
	}

	public getPreviousElementAfterRemoved(viewer: ITree, element: FileMatchOrMatch): FileMatchOrMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		let previousElement = navigator.previous();
		if (element instanceof Match && element.parent().matches().length === 1) {
			// If this is the only match, then the file match is also removed
			// Hence take the previous element to file match
			previousElement = navigator.previous();
		}
		return previousElement;
	}

	private getNavigatorAt(element: FileMatchOrMatch, viewer: ITree): INavigator<any> {
		let navigator: INavigator<any> = viewer.getNavigator();
		while (navigator.current() !== element && !!navigator.next()) { }
		return navigator;
	}
}

export class RemoveAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: FileMatchOrMatch) {
		super('remove', nls.localize('RemoveAction.label', "Remove"), 'action-remove');
	}

	public run(): TPromise<any> {
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.element);
		if (nextFocusElement) {
			this.viewer.setFocus(nextFocusElement);
		}

		let elementToRefresh: any;
		if (this.element instanceof FileMatch) {
			let parent: FolderMatch = <FolderMatch>this.element.parent();
			parent.remove(<FileMatch>this.element);
			elementToRefresh = parent;
		} else {
			let parent: FileMatch = <FileMatch>this.element.parent();
			parent.remove(<Match>this.element);
			elementToRefresh = parent.count() === 0 ? parent.parent() : parent;
		}

		this.viewer.DOMFocus();
		return this.viewer.refresh(elementToRefresh);
	}

}

export class ReplaceAllAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private fileMatch: FileMatch, private viewlet: SearchViewlet,
		@IReplaceService private replaceService: IReplaceService,
		@IKeybindingService keyBindingService: IKeybindingService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super(Constants.ReplaceAllInFileActionId, appendKeyBindingLabel(nls.localize('file.replaceAll.label', "Replace All"), keyBindingService.lookupKeybinding(Constants.ReplaceAllInFileActionId), keyBindingService), 'action-replace-all');
	}

	public run(): TPromise<any> {
		this.telemetryService.publicLog('replaceAll.action.selected');
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.fileMatch);
		return this.fileMatch.parent().replace(this.fileMatch).then(() => {
			if (nextFocusElement) {
				this.viewer.setFocus(nextFocusElement);
			}
			this.viewer.DOMFocus();
			this.viewlet.open(this.fileMatch, true);
		});
	}
}

export class ReplaceAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: Match, private viewlet: SearchViewlet,
		@IReplaceService private replaceService: IReplaceService,
		@IKeybindingService keyBindingService: IKeybindingService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super(Constants.ReplaceActionId, appendKeyBindingLabel(nls.localize('match.replace.label', "Replace"), keyBindingService.lookupKeybinding(Constants.ReplaceActionId), keyBindingService), 'action-replace');
	}

	public run(): TPromise<any> {
		this.enabled = false;
		this.telemetryService.publicLog('replace.action.selected');

		return this.element.parent().replace(this.element).then(() => {
			let elementToFocus = this.getElementToFocusAfterReplace();
			if (elementToFocus) {
				this.viewer.setFocus(elementToFocus);
			}
			let elementToShowReplacePreview = this.getElementToShowReplacePreview(elementToFocus);
			this.viewer.DOMFocus();
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

	private hasSameParent(element: FileMatchOrMatch): boolean {
		return element && element instanceof Match && element.parent().resource() === this.element.parent().resource();
	}

	private hasToOpenFile(): boolean {
		const file = toResource(this.editorService.getActiveEditorInput(), { filter: 'file' });
		if (file) {
			return paths.isEqual(file.fsPath, this.element.parent().resource().fsPath);
		}
		return false;
	}
}
