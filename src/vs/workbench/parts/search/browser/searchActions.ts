/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { INavigator } from 'vs/base/common/iterator';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { SearchResult, Match, FileMatch, FileMatchOrMatch } from 'vs/workbench/parts/search/common/searchModel';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { CollapseAllAction as TreeCollapseAction } from 'vs/base/parts/tree/browser/treeDefaults';
import { IPreferencesService } from 'vs/workbench/parts/preferences/common/preferences';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Keybinding, KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { toResource } from 'vs/workbench/common/editor';

export function isSearchViewletFocussed(viewletService: IViewletService): boolean {
	let activeViewlet = viewletService.getActiveViewlet();
	let activeElement = document.activeElement;
	return activeViewlet && activeViewlet.getId() === Constants.VIEWLET_ID && activeElement && DOM.isAncestor(activeElement, (<SearchViewlet>activeViewlet).getContainer().getHTMLElement());
}

export function appendKeyBindingLabel(label: string, keyBinding: Keybinding, keyBindingService2: IKeybindingService): string;
export function appendKeyBindingLabel(label: string, keyBinding: number, keyBindingService2: IKeybindingService): string;
export function appendKeyBindingLabel(label: string, keyBinding: any, keyBindingService2: IKeybindingService): string {
	keyBinding = typeof keyBinding === 'number' ? new Keybinding(keyBinding) : keyBinding;
	return keyBinding ? label + ' (' + keyBindingService2.getLabelFor(keyBinding) + ')' : label;
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

export class ShowNextSearchTermAction extends Action {

	public static ID = 'search.history.showNext';
	public static LABEL = nls.localize('nextSearchTerm', "Show Next Search Term");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
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

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
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

export class FindInFilesAction extends Action {

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true);
	}

}

export class ReplaceInFilesAction extends Action {

	public static ID = 'workbench.action.replaceInFiles';
	public static LABEL = nls.localize('replaceInFiles', "Replace in Files");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet) => {
			let searchAndReplaceWidget = (<SearchViewlet>viewlet).searchAndReplaceWidget;
			searchAndReplaceWidget.toggleReplace(true);
			searchAndReplaceWidget.focus(false, true);
		});
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

export class FindInFolderAction extends Action {

	private resource: URI;

	constructor(resource: URI, @IViewletService private viewletService: IViewletService) {
		super('workbench.search.action.findInFolder', nls.localize('findInFolder', "Find in Folder"));

		this.resource = resource;
	}

	public run(event?: any): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet: SearchViewlet) => {
			viewlet.searchInFolder(this.resource);
		});
	}
}

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
	public static LABEL = nls.localize('FocusNextSearchResult.label', "Focus next search result");

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
	public static LABEL = nls.localize('FocusPreviousSearchResult.label', "Focus previous search result");

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
			let parent: SearchResult = <SearchResult>this.element.parent();
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

	public static get KEY_BINDING(): number {
		return KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter;
	}

	constructor(private viewer: ITree, private fileMatch: FileMatch, private viewlet: SearchViewlet,
		@IReplaceService private replaceService: IReplaceService,
		@IKeybindingService keyBindingService2: IKeybindingService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super('file-action-replace-all', appendKeyBindingLabel(nls.localize('file.replaceAll.label', "Replace All"), ReplaceAllAction.KEY_BINDING, keyBindingService2), 'action-replace-all');
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

	public static get KEY_BINDING(): number {
		return KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.KEY_1;
	}

	constructor(private viewer: ITree, private element: Match, private viewlet: SearchViewlet,
		@IReplaceService private replaceService: IReplaceService,
		@IKeybindingService keyBindingService2: IKeybindingService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super('action-replace', appendKeyBindingLabel(nls.localize('match.replace.label', "Replace"), ReplaceAction.KEY_BINDING, keyBindingService2), 'action-replace');
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
			return file.fsPath === this.element.parent().resource().fsPath;
		}
		return false;
	}
}

export class ConfigureGlobalExclusionsAction extends Action {

	constructor( @IPreferencesService private preferencesService: IPreferencesService) {
		super('configureGlobalExclusionsAction');

		this.label = nls.localize('ConfigureGlobalExclusionsAction.label', "Open Settings");
		this.enabled = true;
		this.class = 'search-configure-exclusions';
	}

	public run(): TPromise<void> {
		return this.preferencesService.openGlobalSettings().then(null, errors.onUnexpectedError);
	}
}
