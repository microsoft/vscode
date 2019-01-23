/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Action } from 'vs/base/common/actions';
import { INavigator } from 'vs/base/common/iterator';
import { createKeybinding, ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { normalizeDriveLetter } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { normalize } from 'vs/base/common/paths';
import { isWindows, OS } from 'vs/base/common/platform';
import { repeat } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchObjectTree } from 'vs/platform/list/browser/listService';
import { ISearchConfiguration, ISearchHistoryService, VIEW_ID } from 'vs/platform/search/common/search';
import { SearchView } from 'vs/workbench/parts/search/browser/searchView';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import { FileMatch, FileMatchOrMatch, FolderMatch, Match, RenderableMatch, searchMatchComparer, SearchResult } from 'vs/workbench/parts/search/common/searchModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';

export function isSearchViewFocused(viewletService: IViewletService, panelService: IPanelService): boolean {
	const searchView = getSearchView(viewletService, panelService);
	const activeElement = document.activeElement;
	return searchView && activeElement && DOM.isAncestor(activeElement, searchView.getContainer());
}

export function appendKeyBindingLabel(label: string, keyBinding: number | ResolvedKeybinding, keyBindingService2: IKeybindingService): string {
	if (typeof keyBinding === 'number') {
		const resolvedKeybindings = keyBindingService2.resolveKeybinding(createKeybinding(keyBinding, OS));
		return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : null);
	} else {
		return doAppendKeyBindingLabel(label, keyBinding);
	}
}

export function openSearchView(viewletService: IViewletService, panelService: IPanelService, focus?: boolean): Promise<SearchView> {
	if (viewletService.getViewlets().filter(v => v.id === VIEW_ID).length) {
		return viewletService.openViewlet(VIEW_ID, focus).then(viewlet => <SearchView>viewlet);
	}

	return Promise.resolve(panelService.openPanel(VIEW_ID, focus) as SearchView);
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

export class FocusNextInputAction extends Action {

	static readonly ID = 'search.focus.nextInputBox';

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.focusNextInputBox();
		return Promise.resolve(null);
	}
}

export class FocusPreviousInputAction extends Action {

	static readonly ID = 'search.focus.previousInputBox';

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.focusPreviousInputBox();
		return Promise.resolve(null);
	}
}

export abstract class FindOrReplaceInFilesAction extends Action {

	constructor(id: string, label: string, protected viewletService: IViewletService, protected panelService: IPanelService,
		private expandSearchReplaceWidget: boolean
	) {
		super(id, label);
	}

	run(): Promise<any> {
		return openSearchView(this.viewletService, this.panelService, false).then(openedView => {
			const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
			searchAndReplaceWidget.toggleReplace(this.expandSearchReplaceWidget);

			const updatedText = openedView.updateTextFromSelection(!this.expandSearchReplaceWidget);
			openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
		});
	}
}

export class FindInFilesAction extends FindOrReplaceInFilesAction {

	static readonly LABEL = nls.localize('findInFiles', "Find in Files");

	constructor(id: string, label: string,
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService
	) {
		super(id, label, viewletService, panelService, /*expandSearchReplaceWidget=*/false);
	}
}

export class OpenSearchViewletAction extends FindOrReplaceInFilesAction {

	static readonly LABEL = nls.localize('showSearch', "Show Search");

	constructor(id: string, label: string,
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService
	) {
		super(id, label, viewletService, panelService, /*expandSearchReplaceWidget=*/false);
	}

	run(): Promise<any> {

		// Pass focus to viewlet if not open or focused
		if (this.otherViewletShowing() || !isSearchViewFocused(this.viewletService, this.panelService)) {
			return super.run();
		}

		// Otherwise pass focus to editor group
		this.editorGroupService.activeGroup.focus();

		return Promise.resolve(true);
	}

	private otherViewletShowing(): boolean {
		return !getSearchView(this.viewletService, this.panelService);
	}
}

export class ReplaceInFilesAction extends FindOrReplaceInFilesAction {

	static readonly ID = 'workbench.action.replaceInFiles';
	static readonly LABEL = nls.localize('replaceInFiles', "Replace in Files");

	constructor(id: string, label: string,
		@IViewletService viewletService: IViewletService,
		@IPanelService panelService: IPanelService
	) {
		super(id, label, viewletService, panelService, /*expandSearchReplaceWidget=*/true);
	}
}

export class CloseReplaceAction extends Action {

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		searchView.searchAndReplaceWidget.toggleReplace(false);
		searchView.searchAndReplaceWidget.focus();
		return Promise.resolve(null);
	}
}

export class RefreshAction extends Action {

	static readonly ID: string = 'search.action.refreshSearchResults';
	static LABEL: string = nls.localize('RefreshAction.label', "Refresh");

	private searchView: SearchView;

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label, 'search-action refresh');
		this.searchView = getSearchView(this.viewletService, this.panelService);
	}

	get enabled(): boolean {
		return this.searchView.isSearchSubmitted();
	}

	update(): void {
		this._setEnabled(this.enabled);
	}

	run(): Promise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			searchView.onQueryChanged();
		}
		return Promise.resolve(null);
	}
}

export class CollapseDeepestExpandedLevelAction extends Action {

	static readonly ID: string = 'search.action.collapseSearchResults';
	static LABEL: string = nls.localize('CollapseDeepestExpandedLevelAction.label', "Collapse All");

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label, 'search-action collapse');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && searchView.hasSearchResults();
	}

	run(): Promise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			const viewer = searchView.getControl();

			/**
			 * one level to collapse so collapse everything. If FolderMatch, check if there are visible grandchildren,
			 * i.e. if Matches are returned by the navigator, and if so, collapse to them, otherwise collapse all levels.
			 */
			const navigator = viewer.navigate();
			let node = navigator.first();
			let collapseFileMatchLevel = false;
			if (node instanceof FolderMatch) {
				while (node = navigator.next()) {
					if (node instanceof Match) {
						collapseFileMatchLevel = true;
						break;
					}
				}
			}

			if (collapseFileMatchLevel) {
				node = navigator.first();
				do {
					if (node instanceof FileMatch) {
						viewer.collapse(node);
					}
				} while (node = navigator.next());
			} else {
				viewer.collapseAll();
			}

			viewer.domFocus();
			viewer.focusFirst();
		}
		return Promise.resolve(undefined);
	}
}

export class ClearSearchResultsAction extends Action {

	static readonly ID: string = 'search.action.clearSearchResults';
	static LABEL: string = nls.localize('ClearSearchResultsAction.label', "Clear Search Results");

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label, 'search-action clear-search-results');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && (!searchView.allSearchFieldsClear() || searchView.hasSearchResults());
	}

	run(): Promise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			searchView.clearSearchResults();
		}
		return Promise.resolve(null);
	}
}

export class CancelSearchAction extends Action {

	static readonly ID: string = 'search.action.cancelSearch';
	static LABEL: string = nls.localize('CancelSearchAction.label', "Cancel Search");

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label, 'search-action cancel-search');
		this.update();
	}

	update(): void {
		const searchView = getSearchView(this.viewletService, this.panelService);
		this.enabled = searchView && searchView.isSearching();
	}

	run(): Promise<void> {
		const searchView = getSearchView(this.viewletService, this.panelService);
		if (searchView) {
			searchView.cancelSearch();
		}

		return Promise.resolve(undefined);
	}
}

export class FocusNextSearchResultAction extends Action {
	static readonly ID = 'search.action.focusNextSearchResult';
	static readonly LABEL = nls.localize('FocusNextSearchResult.label', "Focus Next Search Result");

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		return openSearchView(this.viewletService, this.panelService).then(searchView => {
			searchView.selectNextMatch();
		});
	}
}

export class FocusPreviousSearchResultAction extends Action {
	static readonly ID = 'search.action.focusPreviousSearchResult';
	static readonly LABEL = nls.localize('FocusPreviousSearchResult.label', "Focus Previous Search Result");

	constructor(id: string, label: string,
		@IViewletService private readonly viewletService: IViewletService,
		@IPanelService private readonly panelService: IPanelService
	) {
		super(id, label);
	}

	run(): Promise<any> {
		return openSearchView(this.viewletService, this.panelService).then(searchView => {
			searchView.selectPreviousMatch();
		});
	}
}

export abstract class AbstractSearchAndReplaceAction extends Action {

	/**
	 * Returns element to focus after removing the given element
	 */
	getElementToFocusAfterRemoved(viewer: WorkbenchObjectTree<RenderableMatch>, elementToBeRemoved: RenderableMatch): RenderableMatch {
		const elementToFocus = this.getNextElementAfterRemoved(viewer, elementToBeRemoved);
		return elementToFocus || this.getPreviousElementAfterRemoved(viewer, elementToBeRemoved);
	}

	getNextElementAfterRemoved(viewer: WorkbenchObjectTree<RenderableMatch>, element: RenderableMatch): RenderableMatch {
		const navigator: INavigator<any> = viewer.navigate(element);
		if (element instanceof FolderMatch) {
			while (!!navigator.next() && !(navigator.current() instanceof FolderMatch)) { }
		} else if (element instanceof FileMatch) {
			while (!!navigator.next() && !(navigator.current() instanceof FileMatch)) { }
		} else {
			while (navigator.next() && !(navigator.current() instanceof Match)) {
				viewer.expand(navigator.current());
			}
		}
		return navigator.current();
	}

	getPreviousElementAfterRemoved(viewer: WorkbenchObjectTree<RenderableMatch>, element: RenderableMatch): RenderableMatch {
		const navigator: INavigator<any> = viewer.navigate(element);
		let previousElement = navigator.previous();

		// Hence take the previous element.
		const parent = element.parent();
		if (parent === previousElement) {
			previousElement = navigator.previous();
		}

		if (parent instanceof FileMatch && parent.parent() === previousElement) {
			previousElement = navigator.previous();
		}

		// If the previous element is a File or Folder, expand it and go to its last child.
		// Spell out the two cases, would be too easy to create an infinite loop, like by adding another level...
		if (element instanceof Match && previousElement && previousElement instanceof FolderMatch) {
			navigator.next();
			viewer.expand(previousElement);
			previousElement = navigator.previous();
		}

		if (element instanceof Match && previousElement && previousElement instanceof FileMatch) {
			navigator.next();
			viewer.expand(previousElement);
			previousElement = navigator.previous();
		}

		return previousElement;
	}
}

export class RemoveAction extends AbstractSearchAndReplaceAction {

	static LABEL = nls.localize('RemoveAction.label', "Dismiss");

	constructor(
		private viewlet: SearchView,
		private viewer: WorkbenchObjectTree<RenderableMatch>,
		private element: RenderableMatch
	) {
		super('remove', RemoveAction.LABEL, 'action-remove');
	}

	run(): Promise<any> {
		const currentFocusElement = this.viewer.getFocus()[0];
		const nextFocusElement = !currentFocusElement || currentFocusElement instanceof SearchResult || elementIsEqualOrParent(currentFocusElement, this.element) ?
			this.getElementToFocusAfterRemoved(this.viewer, this.element) :
			null;

		if (nextFocusElement) {
			this.viewer.reveal(nextFocusElement);
			this.viewer.setFocus([nextFocusElement], getKeyboardEventForEditorOpen());
		}

		let elementToRefresh: FolderMatch | FileMatch | SearchResult;
		const element = this.element;
		if (element instanceof FolderMatch) {
			const parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent;
		} else if (element instanceof FileMatch) {
			const parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent;
		} else if (element instanceof Match) {
			const parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent.count() === 0 ? parent.parent() : parent;
		}

		this.viewer.domFocus();
		this.viewlet.refreshTree({ elements: [elementToRefresh] });
		return Promise.resolve();
	}
}

function elementIsEqualOrParent(element: RenderableMatch, testParent: RenderableMatch | SearchResult): boolean {
	do {
		if (element === testParent) {
			return true;
		}
	} while (!(element.parent() instanceof SearchResult) && (element = <RenderableMatch>element.parent()));

	return false;
}

export class ReplaceAllAction extends AbstractSearchAndReplaceAction {

	static readonly LABEL = nls.localize('file.replaceAll.label', "Replace All");

	constructor(
		private viewlet: SearchView,
		private fileMatch: FileMatch,
		@IKeybindingService keyBindingService: IKeybindingService
	) {
		super(Constants.ReplaceAllInFileActionId, appendKeyBindingLabel(ReplaceAllAction.LABEL, keyBindingService.lookupKeybinding(Constants.ReplaceAllInFileActionId), keyBindingService), 'action-replace-all');
	}

	run(): Promise<any> {
		const tree = this.viewlet.getControl();
		const nextFocusElement = this.getElementToFocusAfterRemoved(tree, this.fileMatch);
		return this.fileMatch.parent().replace(this.fileMatch).then(() => {
			if (nextFocusElement) {
				tree.setFocus([nextFocusElement], getKeyboardEventForEditorOpen());
			}

			tree.domFocus();
			this.viewlet.open(this.fileMatch, true);
		});
	}
}

export class ReplaceAllInFolderAction extends AbstractSearchAndReplaceAction {

	static readonly LABEL = nls.localize('file.replaceAll.label', "Replace All");

	constructor(private viewer: WorkbenchObjectTree<RenderableMatch>, private folderMatch: FolderMatch,
		@IKeybindingService keyBindingService: IKeybindingService
	) {
		super(Constants.ReplaceAllInFolderActionId, appendKeyBindingLabel(ReplaceAllInFolderAction.LABEL, keyBindingService.lookupKeybinding(Constants.ReplaceAllInFolderActionId), keyBindingService), 'action-replace-all');
	}

	run(): Promise<any> {
		const nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.folderMatch);
		return this.folderMatch.replaceAll().then(() => {
			if (nextFocusElement) {
				this.viewer.setFocus([nextFocusElement], getKeyboardEventForEditorOpen());
			}
			this.viewer.domFocus();
		});
	}
}

export class ReplaceAction extends AbstractSearchAndReplaceAction {

	static readonly LABEL = nls.localize('match.replace.label', "Replace");

	constructor(private viewer: WorkbenchObjectTree<RenderableMatch>, private element: Match, private viewlet: SearchView,
		@IReplaceService private readonly replaceService: IReplaceService,
		@IKeybindingService keyBindingService: IKeybindingService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService) {
		super(Constants.ReplaceActionId, appendKeyBindingLabel(ReplaceAction.LABEL, keyBindingService.lookupKeybinding(Constants.ReplaceActionId), keyBindingService), 'action-replace');
	}

	run(): Promise<any> {
		this.enabled = false;

		return this.element.parent().replace(this.element).then(() => {
			const elementToFocus = this.getElementToFocusAfterReplace();
			if (elementToFocus) {
				this.viewer.setFocus([elementToFocus], getKeyboardEventForEditorOpen());
			}

			return this.getElementToShowReplacePreview(elementToFocus);
		}).then(elementToShowReplacePreview => {
			this.viewer.domFocus();

			const useReplacePreview = this.configurationService.getValue<ISearchConfiguration>().search.useReplacePreview;
			if (!useReplacePreview || !elementToShowReplacePreview || this.hasToOpenFile()) {
				this.viewlet.open(this.element, true);
			} else {
				this.replaceService.openReplacePreview(elementToShowReplacePreview, true);
			}
		});
	}

	private getElementToFocusAfterReplace(): Match {
		const navigator: INavigator<any> = this.viewer.navigate();
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
				if (this.viewer.isCollapsed(elementToFocus)) {
					// Next file match (if collapsed)
					break;
				}
			}
		} while (!!navigator.next());
		return elementToFocus;
	}

	private async getElementToShowReplacePreview(elementToFocus: FileMatchOrMatch): Promise<Match> {
		if (this.hasSameParent(elementToFocus)) {
			return <Match>elementToFocus;
		}
		const previousElement = await this.getPreviousElementAfterRemoved(this.viewer, this.element);
		if (this.hasSameParent(previousElement)) {
			return <Match>previousElement;
		}
		return null;
	}

	private hasSameParent(element: RenderableMatch): boolean {
		return element && element instanceof Match && element.parent().resource() === this.element.parent().resource();
	}

	private hasToOpenFile(): boolean {
		const activeEditor = this.editorService.activeEditor;
		const file = activeEditor ? activeEditor.getResource() : undefined;
		if (file) {
			return file.toString() === this.element.parent().resource().toString();
		}
		return false;
	}
}

function uriToClipboardString(resource: URI): string {
	return resource.scheme === Schemas.file ? normalize(normalizeDriveLetter(resource.fsPath), true) : resource.toString();
}

export const copyPathCommand: ICommandHandler = (accessor, fileMatch: FileMatch | FolderMatch) => {
	const clipboardService = accessor.get(IClipboardService);

	const text = uriToClipboardString(fileMatch.resource());
	clipboardService.writeText(text);
};

function matchToString(match: Match, indent = 0): string {
	const getFirstLinePrefix = () => `${match.range().startLineNumber},${match.range().startColumn}`;
	const getOtherLinePrefix = (i: number) => match.range().startLineNumber + i + '';

	const fullMatchLines = match.fullMatchText().split(/\r?\n/g);
	const largestPrefixSize = fullMatchLines.reduce((largest, _, i) => {
		const thisSize = i === 0 ?
			getFirstLinePrefix().length :
			getOtherLinePrefix(i).length;

		return Math.max(thisSize, largest);
	}, 0);

	const formattedLines = fullMatchLines
		.map((line, i) => {
			const prefix = i === 0 ?
				getFirstLinePrefix() :
				getOtherLinePrefix(i);

			const paddingStr = repeat(' ', largestPrefixSize - prefix.length);
			const indentStr = repeat(' ', indent);
			return `${indentStr}${prefix}: ${paddingStr}${line}`;
		});

	return formattedLines.join('\n');
}

const lineDelimiter = isWindows ? '\r\n' : '\n';
function fileMatchToString(fileMatch: FileMatch, maxMatches: number): { text: string, count: number } {
	const matchTextRows = fileMatch.matches()
		.sort(searchMatchComparer)
		.slice(0, maxMatches)
		.map(match => matchToString(match, 2));
	return {
		text: `${uriToClipboardString(fileMatch.resource())}${lineDelimiter}${matchTextRows.join(lineDelimiter)}`,
		count: matchTextRows.length
	};
}

function folderMatchToString(folderMatch: FolderMatch, maxMatches: number): { text: string, count: number } {
	const fileResults: string[] = [];
	let numMatches = 0;

	const matches = folderMatch.matches().sort(searchMatchComparer);

	for (let i = 0; i < folderMatch.fileCount() && numMatches < maxMatches; i++) {
		const fileResult = fileMatchToString(matches[i], maxMatches - numMatches);
		numMatches += fileResult.count;
		fileResults.push(fileResult.text);
	}

	return {
		text: fileResults.join(lineDelimiter + lineDelimiter),
		count: numMatches
	};
}

const maxClipboardMatches = 1e4;
export const copyMatchCommand: ICommandHandler = (accessor, match: RenderableMatch) => {
	const clipboardService = accessor.get(IClipboardService);

	let text: string;
	if (match instanceof Match) {
		text = matchToString(match);
	} else if (match instanceof FileMatch) {
		text = fileMatchToString(match, maxClipboardMatches).text;
	} else if (match instanceof FolderMatch) {
		text = folderMatchToString(match, maxClipboardMatches).text;
	}

	if (text) {
		clipboardService.writeText(text);
	}
};

function allFolderMatchesToString(folderMatches: FolderMatch[], maxMatches: number): string {
	const folderResults: string[] = [];
	let numMatches = 0;
	folderMatches = folderMatches.sort(searchMatchComparer);
	for (let i = 0; i < folderMatches.length && numMatches < maxMatches; i++) {
		const folderResult = folderMatchToString(folderMatches[i], maxMatches - numMatches);
		if (folderResult.count) {
			numMatches += folderResult.count;
			folderResults.push(folderResult.text);
		}
	}

	return folderResults.join(lineDelimiter + lineDelimiter);
}

export const copyAllCommand: ICommandHandler = accessor => {
	const viewletService = accessor.get(IViewletService);
	const panelService = accessor.get(IPanelService);
	const clipboardService = accessor.get(IClipboardService);

	const searchView = getSearchView(viewletService, panelService);
	const root = searchView.searchResult;

	const text = allFolderMatchesToString(root.folderMatches(), maxClipboardMatches);
	clipboardService.writeText(text);
};

export const clearHistoryCommand: ICommandHandler = accessor => {
	const searchHistoryService = accessor.get(ISearchHistoryService);
	searchHistoryService.clearHistory();
};

export const focusSearchListCommand: ICommandHandler = accessor => {
	const viewletService = accessor.get(IViewletService);
	const panelService = accessor.get(IPanelService);
	openSearchView(viewletService, panelService).then(searchView => {
		searchView.moveFocusToResults();
	});
};

export function getKeyboardEventForEditorOpen(options: IEditorOptions = {}): KeyboardEvent {
	const fakeKeyboardEvent = new KeyboardEvent('keydown');
	if (options.preserveFocus) {
		// fake double click
		(<any>fakeKeyboardEvent).detail = 2;
	}

	return fakeKeyboardEvent;
}
