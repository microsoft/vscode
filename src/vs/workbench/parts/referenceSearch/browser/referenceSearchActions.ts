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
import { isWindows, OS } from 'vs/base/common/platform';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import * as nls from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { VIEW_ID } from 'vs/workbench/parts/referenceSearch/common/referenceSearch';
import { ReferenceSearchView } from 'vs/workbench/parts/referenceSearch/browser/referenceSearchView';
import { FileMatch, FolderMatch, Match, RenderableMatch, referenceSearchMatchComparer, ReferenceSearchResult } from 'vs/workbench/parts/referenceSearch/common/referenceSearchModel';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { normalize } from 'vs/base/common/paths';

export function isReferenceSearchViewFocused(viewletService: IViewletService, panelService: IPanelService): boolean {
	let referenceSearchView = getReferenceSearchView(viewletService, panelService);
	let activeElement = document.activeElement;
	return referenceSearchView && activeElement && DOM.isAncestor(activeElement, referenceSearchView.getContainer());
}

export function appendKeyBindingLabel(label: string, keyBinding: number | ResolvedKeybinding, keyBindingService2: IKeybindingService): string {
	if (typeof keyBinding === 'number') {
		const resolvedKeybindings = keyBindingService2.resolveKeybinding(createKeybinding(keyBinding, OS));
		return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : null);
	} else {
		return doAppendKeyBindingLabel(label, keyBinding);
	}
}

export function openReferenceSearchView(viewletService: IViewletService, panelService: IPanelService, focus?: boolean): TPromise<ReferenceSearchView> {
	if (viewletService.getViewlets().filter(v => v.id === VIEW_ID).length) {
		return viewletService.openViewlet(VIEW_ID, focus).then(viewlet => <ReferenceSearchView>viewlet);
	}

	return panelService.openPanel(VIEW_ID, focus).then(panel => <ReferenceSearchView>panel);
}

export function getReferenceSearchView(viewletService: IViewletService, panelService: IPanelService): ReferenceSearchView {
	const activeViewlet = viewletService.getActiveViewlet();
	if (activeViewlet && activeViewlet.getId() === VIEW_ID) {
		return <ReferenceSearchView>activeViewlet;
	}

	const activePanel = panelService.getActivePanel();
	if (activePanel && activePanel.getId() === VIEW_ID) {
		return <ReferenceSearchView>activePanel;
	}

	return undefined;
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

export class ShowReferenceSearchAction extends Action {

	public static readonly LABEL = nls.localize('findInFiles', "Find in Files");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return openReferenceSearchView(this.viewletService, this.panelService, true).then(view => view.startReferenceSearch());
	}
}

export class RefreshAction extends Action {

	static readonly ID: string = 'referenceSearch.action.refreshReferenceSearchResults';
	static LABEL: string = nls.localize('RefreshAction.label', "Refresh");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'referenceSearch-action refresh');
		this.update();
	}

	update(): void {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		this.enabled = !!referenceSearchView && referenceSearchView.isReferenceSearchSubmitted();
	}

	public run(): TPromise<void> {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		if (referenceSearchView) {
			referenceSearchView.onQueryChanged(true);
		}
		return TPromise.as(null);
	}
}

export class CollapseDeepestExpandedLevelAction extends Action {

	static readonly ID: string = 'referenceSearch.action.collapseReferenceSearchResults';
	static LABEL: string = nls.localize('CollapseDeepestExpandedLevelAction.label', "Collapse All");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'referenceSearch-action collapse');
		this.update();
	}

	update(): void {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		this.enabled = referenceSearchView && referenceSearchView.hasReferenceSearchResults();
	}

	public run(): TPromise<void> {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		if (referenceSearchView) {
			const viewer = referenceSearchView.getControl();
			if (viewer.getHighlight()) {
				return TPromise.as(null); // Global action disabled if user is in edit mode from another action
			}

			/**
			 * The hierarchy is FolderMatch, FileMatch, Match. If the top level is FileMatches, then there is only
			 * one level to collapse so collapse everything. If FolderMatch, check if there are visible grandchildren,
			 * i.e. if Matches are returned by the navigator, and if so, collapse to them, otherwise collapse all levels.
			 */
			const navigator = viewer.getNavigator();
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

			viewer.clearSelection();
			viewer.clearFocus();
			viewer.domFocus();
			viewer.focusFirst();
		}
		return TPromise.as(null);
	}
}

export class ClearReferenceSearchResultsAction extends Action {

	static readonly ID: string = 'referenceSearch.action.clearReferenceSearchResults';
	static LABEL: string = nls.localize('ClearReferenceSearchResultsAction.label', "Clear ReferenceSearch Results");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'referenceSearch-action clear-reference-search-results');
		this.update();
	}

	update(): void {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		this.enabled = referenceSearchView && referenceSearchView.isReferenceSearchSubmitted();
	}

	public run(): TPromise<void> {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		if (referenceSearchView) {
			referenceSearchView.clearReferenceSearchResults();
		}
		return TPromise.as(null);
	}
}

export class CancelReferenceSearchAction extends Action {

	static readonly ID: string = 'referenceSearch.action.cancelReferenceSearch';
	static LABEL: string = nls.localize('CancelReferenceSearchAction.label', "Cancel ReferenceSearch");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label, 'referenceSearch-action cancel-referenceSearch');
		this.update();
	}

	update(): void {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		this.enabled = referenceSearchView && referenceSearchView.isReferenceSearching();
	}

	public run(): TPromise<void> {
		const referenceSearchView = getReferenceSearchView(this.viewletService, this.panelService);
		if (referenceSearchView) {
			referenceSearchView.cancelReferenceSearch();
		}

		return TPromise.as(null);
	}
}

export class FocusNextReferenceSearchResultAction extends Action {
	public static readonly ID = 'referenceSearch.action.focusNextReferenceSearchResult';
	public static readonly LABEL = nls.localize('FocusNextReferenceSearchResult.label', "Focus Next ReferenceSearch Result");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return openReferenceSearchView(this.viewletService, this.panelService).then(referenceSearchView => {
			referenceSearchView.selectNextMatch();
		});
	}
}

export class FocusPreviousReferenceSearchResultAction extends Action {
	public static readonly ID = 'referenceSearch.action.focusPreviousReferenceSearchResult';
	public static readonly LABEL = nls.localize('FocusPreviousReferenceSearchResult.label', "Focus Previous ReferenceSearch Result");

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IPanelService private panelService: IPanelService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return openReferenceSearchView(this.viewletService, this.panelService).then(referenceSearchView => {
			referenceSearchView.selectPreviousMatch();
		});
	}
}

export abstract class AbstractReferenceSearchAndReplaceAction extends Action {

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
			while (navigator.next() && !(navigator.current() instanceof Match)) {
				viewer.expand(navigator.current());
			}
		}
		return navigator.current();
	}

	public getPreviousElementAfterRemoved(viewer: ITree, element: RenderableMatch): RenderableMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		let previousElement = navigator.previous();

		// If this is the only match, then the file/folder match is also removed
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

	private getNavigatorAt(element: RenderableMatch, viewer: ITree): INavigator<any> {
		let navigator: INavigator<any> = viewer.getNavigator();
		while (navigator.current() !== element && !!navigator.next()) { }
		return navigator;
	}
}

export class RemoveAction extends AbstractReferenceSearchAndReplaceAction {

	public static LABEL = nls.localize('RemoveAction.label', "Dismiss");

	constructor(private viewer: ITree, private element: RenderableMatch) {
		super('remove', RemoveAction.LABEL, 'action-remove');
	}

	public run(): TPromise<any> {
		const currentFocusElement = this.viewer.getFocus();
		const nextFocusElement = !currentFocusElement || currentFocusElement instanceof ReferenceSearchResult || elementIsEqualOrParent(currentFocusElement, this.element) ?
			this.getElementToFocusAfterRemoved(this.viewer, this.element) :
			null;

		if (nextFocusElement) {
			this.viewer.reveal(nextFocusElement);
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

function elementIsEqualOrParent(element: RenderableMatch, testParent: RenderableMatch | ReferenceSearchResult): boolean {
	do {
		if (element === testParent) {
			return true;
		}
	} while (!(element.parent() instanceof ReferenceSearchResult) && (element = <RenderableMatch>element.parent()));

	return false;
}

function uriToClipboardString(resource: URI): string {
	return resource.scheme === Schemas.file ? normalize(normalizeDriveLetter(resource.fsPath), true) : resource.toString();
}

export const copyPathCommand: ICommandHandler = (accessor, fileMatch: FileMatch | FolderMatch) => {
	const clipboardService = accessor.get(IClipboardService);

	const text = uriToClipboardString(fileMatch.resource());
	clipboardService.writeText(text);
};

function matchToString(match: Match): string {
	return `${match.range().startLineNumber},${match.range().startColumn}: ${match.text()}`;
}

const lineDelimiter = isWindows ? '\r\n' : '\n';
function fileMatchToString(fileMatch: FileMatch, maxMatches: number): { text: string, count: number } {
	const matchTextRows = fileMatch.matches()
		.sort(referenceSearchMatchComparer)
		.slice(0, maxMatches)
		.map(matchToString)
		.map(matchText => '  ' + matchText);
	return {
		text: `${uriToClipboardString(fileMatch.resource())}${lineDelimiter}${matchTextRows.join(lineDelimiter)}`,
		count: matchTextRows.length
	};
}

function folderMatchToString(folderMatch: FolderMatch, maxMatches: number): { text: string, count: number } {
	const fileResults: string[] = [];
	let numMatches = 0;

	let matches = folderMatch.matches().sort(referenceSearchMatchComparer);

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
	folderMatches = folderMatches.sort(referenceSearchMatchComparer);
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

	const referenceSearchView = getReferenceSearchView(viewletService, panelService);
	const root: ReferenceSearchResult = referenceSearchView.getControl().getInput();

	const text = allFolderMatchesToString(root.folderMatches(), maxClipboardMatches);
	clipboardService.writeText(text);
};

export const focusReferenceSearchListCommand: ICommandHandler = accessor => {
	const viewletService = accessor.get(IViewletService);
	const panelService = accessor.get(IPanelService);
	openReferenceSearchView(viewletService, panelService).then(referenceSearchView => {
		referenceSearchView.moveFocusToResults();
	});
};
