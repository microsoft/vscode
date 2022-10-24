/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { ITreeNavigator } from 'vs/base/browser/ui/tree/tree';
import { Action } from 'vs/base/common/actions';
import { createKeybinding, ResolvedKeybinding } from 'vs/base/common/keybindings';
import { isWindows, OS } from 'vs/base/common/platform';
import * as nls from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ICommandHandler, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ILabelService } from 'vs/platform/label/common/label';
import { getSelectionKeyboardEvent, WorkbenchCompressibleObjectTree } from 'vs/platform/list/browser/listService';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IViewsService } from 'vs/workbench/common/views';
import { searchRemoveIcon, searchReplaceAllIcon, searchReplaceIcon } from 'vs/workbench/contrib/search/browser/searchIcons';
import { SearchView } from 'vs/workbench/contrib/search/browser/searchView';
import * as Constants from 'vs/workbench/contrib/search/common/constants';
import { IReplaceService } from 'vs/workbench/contrib/search/common/replace';
import { ISearchHistoryService } from 'vs/workbench/contrib/search/common/searchHistoryService';
import { arrayContainsElementOrParent, FileMatch, FolderMatch, FolderMatchNoRoot, FolderMatchWithResource, FolderMatchWorkspaceRoot, Match, RenderableMatch, searchComparer, searchMatchComparer, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { OpenEditorCommandId } from 'vs/workbench/contrib/searchEditor/browser/constants';
import { SearchEditor } from 'vs/workbench/contrib/searchEditor/browser/searchEditor';
import { OpenSearchEditorArgs } from 'vs/workbench/contrib/searchEditor/browser/searchEditor.contribution';
import { SearchEditorInput } from 'vs/workbench/contrib/searchEditor/browser/searchEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ISearchConfiguration, ISearchConfigurationProperties, VIEW_ID } from 'vs/workbench/services/search/common/search';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { URI } from 'vs/base/common/uri';

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

export function openSearchView(viewsService: IViewsService, focus?: boolean): Promise<SearchView | undefined> {
	return viewsService.openView(VIEW_ID, focus).then(view => (view as SearchView ?? undefined));
}

export function getSearchView(viewsService: IViewsService): SearchView | undefined {
	return viewsService.getActiveViewWithId(VIEW_ID) as SearchView ?? undefined;
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding | undefined): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

export const toggleCaseSensitiveCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.toggleCaseSensitive();
};

export const toggleWholeWordCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.toggleWholeWords();
};

export const toggleRegexCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.toggleRegex();
};

export const togglePreserveCaseCommand = (accessor: ServicesAccessor) => {
	const searchView = getSearchView(accessor.get(IViewsService));
	searchView?.togglePreserveCase();
};

export class FocusNextInputAction extends Action {

	static readonly ID = 'search.focus.nextInputBox';

	constructor(id: string, label: string,
		@IViewsService private readonly viewsService: IViewsService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(id, label);
	}

	override async run(): Promise<any> {
		const input = this.editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
			(this.editorService.activeEditorPane as SearchEditor).focusNextInput();
		}

		const searchView = getSearchView(this.viewsService);
		searchView?.focusNextInputBox();
	}
}

export class FocusPreviousInputAction extends Action {

	static readonly ID = 'search.focus.previousInputBox';

	constructor(id: string, label: string,
		@IViewsService private readonly viewsService: IViewsService,
		@IEditorService private readonly editorService: IEditorService,
	) {
		super(id, label);
	}

	override async run(): Promise<any> {
		const input = this.editorService.activeEditor;
		if (input instanceof SearchEditorInput) {
			// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
			(this.editorService.activeEditorPane as SearchEditor).focusPrevInput();
		}

		const searchView = getSearchView(this.viewsService);
		searchView?.focusPreviousInputBox();
	}
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

export const FindInFilesCommand: ICommandHandler = (accessor, args: IFindInFilesArgs = {}) => {
	const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
	const mode = searchConfig.mode;
	if (mode === 'view') {
		const viewsService = accessor.get(IViewsService);
		openSearchView(viewsService, false).then(openedView => {
			if (openedView) {
				const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(typeof args.replace === 'string');
				let updatedText = false;
				if (typeof args.query === 'string') {
					openedView.setSearchParameters(args);
				} else {
					updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: typeof args.replace !== 'string' });
				}
				openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
			}
		});
	} else {
		const convertArgs = (args: IFindInFilesArgs): OpenSearchEditorArgs => ({
			location: mode === 'newEditor' ? 'new' : 'reuse',
			query: args.query,
			filesToInclude: args.filesToInclude,
			filesToExclude: args.filesToExclude,
			matchWholeWord: args.matchWholeWord,
			isCaseSensitive: args.isCaseSensitive,
			isRegexp: args.isRegex,
			useExcludeSettingsAndIgnoreFiles: args.useExcludeSettingsAndIgnoreFiles,
			onlyOpenEditors: args.onlyOpenEditors,
			showIncludesExcludes: !!(args.filesToExclude || args.filesToExclude || !args.useExcludeSettingsAndIgnoreFiles),
		});
		accessor.get(ICommandService).executeCommand(OpenEditorCommandId, convertArgs(args));
	}
};

export class CloseReplaceAction extends Action {

	constructor(id: string, label: string,
		@IViewsService private readonly viewsService: IViewsService
	) {
		super(id, label);
	}

	override run(): Promise<any> {
		const searchView = getSearchView(this.viewsService);
		if (searchView) {
			searchView.searchAndReplaceWidget.toggleReplace(false);
			searchView.searchAndReplaceWidget.focus();
		}
		return Promise.resolve(null);
	}
}

export function expandAll(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		const viewer = searchView.getControl();
		viewer.expandAll();
	}
}

export function clearSearchResults(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	searchView?.clearSearchResults();
}

export function cancelSearch(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	searchView?.cancelSearch();
}

export function refreshSearch(accessor: ServicesAccessor) {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	searchView?.triggerQueryChange({ preserveFocus: false });
}

export function collapseDeepestExpandedLevel(accessor: ServicesAccessor) {

	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	if (searchView) {
		const viewer = searchView.getControl();

		/**
		 * one level to collapse so collapse everything. If FolderMatch, check if there are visible grandchildren,
		 * i.e. if Matches are returned by the navigator, and if so, collapse to them, otherwise collapse all levels.
		 */
		const navigator = viewer.navigate();
		let node = navigator.first();
		let canCollapseFileMatchLevel = false;
		let canCollapseFirstLevel = false;

		if (node instanceof FolderMatchWorkspaceRoot) {
			while (node = navigator.next()) {
				if (node instanceof Match) {
					canCollapseFileMatchLevel = true;
					break;
				}
				if (searchView.isTreeLayoutViewVisible && !canCollapseFirstLevel) {
					let nodeToTest = node;

					if (node instanceof FolderMatch) {
						nodeToTest = node.compressionStartParent ?? node;
					}

					const immediateParent = nodeToTest.parent();

					if (!(immediateParent instanceof FolderMatchWorkspaceRoot || immediateParent instanceof FolderMatchNoRoot || immediateParent instanceof SearchResult)) {
						canCollapseFirstLevel = true;
					}
				}
			}
		}

		if (canCollapseFileMatchLevel) {
			node = navigator.first();
			do {
				if (node instanceof FileMatch) {
					viewer.collapse(node);
				}
			} while (node = navigator.next());
		} else if (canCollapseFirstLevel) {
			node = navigator.first();
			if (node) {
				do {

					let nodeToTest = node;

					if (node instanceof FolderMatch) {
						nodeToTest = node.compressionStartParent ?? node;
					}
					const immediateParent = nodeToTest.parent();

					if (immediateParent instanceof FolderMatchWorkspaceRoot || immediateParent instanceof FolderMatchNoRoot) {
						if (viewer.hasElement(node)) {
							viewer.collapse(node, true);
						} else {
							viewer.collapseAll();
						}
					}
				} while (node = navigator.next());
			}
		} else {
			viewer.collapseAll();
		}

		const firstFocusParent = viewer.getFocus()[0]?.parent();

		if (firstFocusParent && (firstFocusParent instanceof FolderMatch || firstFocusParent instanceof FileMatch) &&
			viewer.hasElement(firstFocusParent) && viewer.isCollapsed(firstFocusParent)) {
			viewer.domFocus();
			viewer.focusFirst();
			viewer.setSelection(viewer.getFocus());
		}
	}
}

export async function focusNextSearchResult(accessor: ServicesAccessor): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
		return (editorService.activeEditorPane as SearchEditor).focusNextResult();
	}

	return openSearchView(accessor.get(IViewsService)).then(searchView => {
		searchView?.selectNextMatch();
	});
}

export async function focusPreviousSearchResult(accessor: ServicesAccessor): Promise<any> {
	const editorService = accessor.get(IEditorService);
	const input = editorService.activeEditor;
	if (input instanceof SearchEditorInput) {
		// cast as we cannot import SearchEditor as a value b/c cyclic dependency.
		return (editorService.activeEditorPane as SearchEditor).focusPreviousResult();
	}

	return openSearchView(accessor.get(IViewsService)).then(searchView => {
		searchView?.selectPreviousMatch();
	});
}

export async function findOrReplaceInFiles(accessor: ServicesAccessor, expandSearchReplaceWidget: boolean): Promise<any> {
	return openSearchView(accessor.get(IViewsService), false).then(openedView => {
		if (openedView) {
			const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
			searchAndReplaceWidget.toggleReplace(expandSearchReplaceWidget);

			const updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: !expandSearchReplaceWidget });
			openedView.searchAndReplaceWidget.focus(undefined, updatedText, updatedText);
		}
	});
}


class ReplaceActionRunner {
	constructor(
		private viewer: WorkbenchCompressibleObjectTree<RenderableMatch>,
		private viewlet: SearchView | undefined,
		// Services
		@IReplaceService private readonly replaceService: IReplaceService,
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IViewsService private readonly viewsService: IViewsService
	) { }

	async performReplace(element: RenderableMatch): Promise<any> {
		// since multiple elements can be selected, we need to check the type of the FolderMatch/FileMatch/Match before we perform the replace.
		const opInfo = getElementsToOperateOnInfo(this.viewer, element, this.configurationService.getValue<ISearchConfigurationProperties>('search'));
		const elementsToReplace = opInfo.elements;
		let focusElement = this.viewer.getFocus()[0];

		if (!focusElement || (focusElement && !arrayContainsElementOrParent(focusElement, elementsToReplace)) || (focusElement instanceof SearchResult)) {
			focusElement = element;
		}

		if (elementsToReplace.length === 0) {
			return;
		}
		let nextFocusElement;
		if (focusElement) {
			nextFocusElement = getElementToFocusAfterRemoved(this.viewer, focusElement, elementsToReplace);
		}

		const searchResult = getSearchView(this.viewsService)?.searchResult;

		if (searchResult) {
			searchResult.batchReplace(elementsToReplace);
		}

		if (focusElement) {
			if (!nextFocusElement) {
				nextFocusElement = getLastNodeFromSameType(this.viewer, focusElement);
			}

			if (nextFocusElement) {
				this.viewer.reveal(nextFocusElement);
				this.viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
				this.viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());

				if (nextFocusElement instanceof Match) {
					const useReplacePreview = this.configurationService.getValue<ISearchConfiguration>().search.useReplacePreview;
					if (!useReplacePreview || this.hasToOpenFile(nextFocusElement)) {
						this.viewlet?.open(nextFocusElement, true);
					} else {
						this.replaceService.openReplacePreview(nextFocusElement, true);
					}
				} else if (nextFocusElement instanceof FileMatch) {
					this.viewlet?.open(nextFocusElement, true);
				}
			}

		}

		this.viewer.domFocus();
	}

	private hasToOpenFile(currBottomElem: RenderableMatch): boolean {
		if (!(currBottomElem instanceof Match)) {
			return false;
		}
		const activeEditor = this.editorService.activeEditor;
		const file = activeEditor?.resource;
		if (file) {
			return this.uriIdentityService.extUri.isEqual(file, currBottomElem.parent().resource);
		}
		return false;
	}
}

export class RemoveAction extends Action {

	static readonly LABEL = nls.localize('RemoveAction.label', "Dismiss");

	constructor(
		private viewer: WorkbenchCompressibleObjectTree<RenderableMatch>,
		private element: RenderableMatch,
		@IKeybindingService keyBindingService: IKeybindingService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super(Constants.RemoveActionId, appendKeyBindingLabel(RemoveAction.LABEL, keyBindingService.lookupKeybinding(Constants.RemoveActionId), keyBindingService), ThemeIcon.asClassName(searchRemoveIcon));
	}

	override async run(): Promise<any> {
		const opInfo = getElementsToOperateOnInfo(this.viewer, this.element, this.configurationService.getValue<ISearchConfigurationProperties>('search'));
		const elementsToRemove = opInfo.elements;
		let focusElement = this.viewer.getFocus()[0];

		if (elementsToRemove.length === 0) {
			return;
		}

		if (!focusElement || (focusElement instanceof SearchResult)) {
			focusElement = this.element;
		}

		let nextFocusElement;
		if (opInfo.mustReselect && focusElement) {
			nextFocusElement = getElementToFocusAfterRemoved(this.viewer, focusElement, elementsToRemove);
		}

		const searchResult = getSearchView(this.viewsService)?.searchResult;

		if (searchResult) {
			searchResult.batchRemove(elementsToRemove);
		}

		if (opInfo.mustReselect && focusElement) {
			if (!nextFocusElement) {
				nextFocusElement = getLastNodeFromSameType(this.viewer, focusElement);
			}

			if (nextFocusElement && !arrayContainsElementOrParent(nextFocusElement, elementsToRemove)) {
				this.viewer.reveal(nextFocusElement);
				this.viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
				this.viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
			}
		}

		this.viewer.domFocus();
		return;
	}
}

export class ReplaceAction extends Action {

	static readonly LABEL = nls.localize('match.replace.label', "Replace");

	static runQ = Promise.resolve();
	private replaceRunner: ReplaceActionRunner;

	constructor(viewer: WorkbenchCompressibleObjectTree<RenderableMatch>, private element: Match, viewlet: SearchView,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keyBindingService: IKeybindingService,
	) {
		super(Constants.ReplaceActionId, appendKeyBindingLabel(ReplaceAction.LABEL, keyBindingService.lookupKeybinding(Constants.ReplaceActionId), keyBindingService), ThemeIcon.asClassName(searchReplaceIcon));
		this.replaceRunner = this.instantiationService.createInstance(ReplaceActionRunner, viewer, viewlet);
	}

	override async run(): Promise<any> {
		return this.replaceRunner.performReplace(this.element);
	}
}

export class ReplaceAllAction extends Action {

	static readonly LABEL = nls.localize('file.replaceAll.label', "Replace All");
	private replaceRunner: ReplaceActionRunner;
	constructor(
		viewlet: SearchView,
		private fileMatch: FileMatch,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keyBindingService: IKeybindingService,
	) {
		super(Constants.ReplaceAllInFileActionId, appendKeyBindingLabel(ReplaceAllAction.LABEL, keyBindingService.lookupKeybinding(Constants.ReplaceAllInFileActionId), keyBindingService), ThemeIcon.asClassName(searchReplaceAllIcon));
		this.replaceRunner = this.instantiationService.createInstance(ReplaceActionRunner, viewlet.getControl(), viewlet);
	}

	override async run(): Promise<any> {
		return this.replaceRunner.performReplace(this.fileMatch);
	}
}

export class ReplaceAllInFolderAction extends Action {

	static readonly LABEL = nls.localize('file.replaceAll.label', "Replace All");
	private replaceRunner: ReplaceActionRunner;

	constructor(viewer: WorkbenchCompressibleObjectTree<RenderableMatch>, private folderMatch: FolderMatch,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IKeybindingService keyBindingService: IKeybindingService
	) {
		super(Constants.ReplaceAllInFolderActionId, appendKeyBindingLabel(ReplaceAllInFolderAction.LABEL, keyBindingService.lookupKeybinding(Constants.ReplaceAllInFolderActionId), keyBindingService), ThemeIcon.asClassName(searchReplaceAllIcon));
		this.replaceRunner = this.instantiationService.createInstance(ReplaceActionRunner, viewer, undefined);
	}

	override run(): Promise<any> {
		return this.replaceRunner.performReplace(this.folderMatch);
	}
}

export const copyPathCommand: ICommandHandler = async (accessor, fileMatch: FileMatch | FolderMatchWithResource | undefined) => {
	if (!fileMatch) {
		const selection = getSelectedRow(accessor);
		if (!(selection instanceof FileMatch || selection instanceof FolderMatchWithResource)) {
			return;
		}

		fileMatch = selection;
	}

	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	const text = labelService.getUriLabel(fileMatch.resource, { noPrefix: true });
	await clipboardService.writeText(text);
};

function matchToString(match: Match, indent = 0): string {
	const getFirstLinePrefix = () => `${match.range().startLineNumber},${match.range().startColumn}`;
	const getOtherLinePrefix = (i: number) => match.range().startLineNumber + i + '';

	const fullMatchLines = match.fullPreviewLines();
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

			const paddingStr = ' '.repeat(largestPrefixSize - prefix.length);
			const indentStr = ' '.repeat(indent);
			return `${indentStr}${prefix}: ${paddingStr}${line}`;
		});

	return formattedLines.join('\n');
}
function fileFolderMatchToString(match: FileMatch | FolderMatch | FolderMatchWithResource, labelService: ILabelService): { text: string; count: number } {
	if (match instanceof FileMatch) {
		return fileMatchToString(match, labelService);
	} else {
		return folderMatchToString(match, labelService);
	}
}
const lineDelimiter = isWindows ? '\r\n' : '\n';
function fileMatchToString(fileMatch: FileMatch, labelService: ILabelService): { text: string; count: number } {
	const matchTextRows = fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToString(match, 2));
	const uriString = labelService.getUriLabel(fileMatch.resource, { noPrefix: true });
	return {
		text: `${uriString}${lineDelimiter}${matchTextRows.join(lineDelimiter)}`,
		count: matchTextRows.length
	};
}

function folderMatchToString(folderMatch: FolderMatchWithResource | FolderMatch, labelService: ILabelService): { text: string; count: number } {
	const results: string[] = [];
	let numMatches = 0;

	const matches = folderMatch.matches().sort(searchMatchComparer);

	matches.forEach(match => {
		const result = fileFolderMatchToString(match, labelService);
		numMatches += result.count;
		results.push(result.text);
	});

	return {
		text: results.join(lineDelimiter + lineDelimiter),
		count: numMatches
	};
}

export const copyMatchCommand: ICommandHandler = async (accessor, match: RenderableMatch | undefined) => {
	if (!match) {
		const selection = getSelectedRow(accessor);
		if (!selection) {
			return;
		}

		match = selection;
	}

	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	let text: string | undefined;
	if (match instanceof Match) {
		text = matchToString(match);
	} else if (match instanceof FileMatch) {
		text = fileMatchToString(match, labelService).text;
	} else if (match instanceof FolderMatch) {
		text = folderMatchToString(match, labelService).text;
	}

	if (text) {
		await clipboardService.writeText(text);
	}
};

function allFolderMatchesToString(folderMatches: Array<FolderMatchWithResource | FolderMatch>, labelService: ILabelService): string {
	const folderResults: string[] = [];
	folderMatches = folderMatches.sort(searchMatchComparer);
	for (let i = 0; i < folderMatches.length; i++) {
		const folderResult = folderMatchToString(folderMatches[i], labelService);
		if (folderResult.count) {
			folderResults.push(folderResult.text);
		}
	}

	return folderResults.join(lineDelimiter + lineDelimiter);
}

function getSelectedRow(accessor: ServicesAccessor): RenderableMatch | undefined | null {
	const viewsService = accessor.get(IViewsService);
	const searchView = getSearchView(viewsService);
	return searchView?.getControl().getSelection()[0];
}

export const copyAllCommand: ICommandHandler = async (accessor) => {
	const viewsService = accessor.get(IViewsService);
	const clipboardService = accessor.get(IClipboardService);
	const labelService = accessor.get(ILabelService);

	const searchView = getSearchView(viewsService);
	if (searchView) {
		const root = searchView.searchResult;

		const text = allFolderMatchesToString(root.folderMatches(), labelService);
		await clipboardService.writeText(text);
	}
};

export const clearHistoryCommand: ICommandHandler = accessor => {
	const searchHistoryService = accessor.get(ISearchHistoryService);
	searchHistoryService.clearHistory();
};

export const focusSearchListCommand: ICommandHandler = accessor => {
	const viewsService = accessor.get(IViewsService);
	openSearchView(viewsService).then(searchView => {
		searchView?.moveFocusToResults();
	});
};

export function getMultiSelectedSearchResources(viewer: WorkbenchCompressibleObjectTree<RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): URI[] {
	return getElementsToOperateOnInfo(viewer, currElement, sortConfig).elements
		.map((renderableMatch) => ((renderableMatch instanceof Match) ? null : renderableMatch.resource))
		.filter((renderableMatch): renderableMatch is URI => (renderableMatch !== null));
}

function getElementsToOperateOnInfo(viewer: WorkbenchCompressibleObjectTree<RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties): { elements: RenderableMatch[]; mustReselect: boolean } {
	let elements: RenderableMatch[] = viewer.getSelection().filter((x): x is RenderableMatch => x !== null).sort((a, b) => searchComparer(a, b, sortConfig.sortOrder));

	const mustReselect = !currElement || elements.includes(currElement); // this indicates whether we need to re-focus/re-select on a remove.

	// if selection doesn't include multiple elements, just return current focus element.
	if (currElement && !(elements.length > 1 && elements.includes(currElement))) {
		elements = [currElement];
	}

	return { elements, mustReselect };
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

	} else {
		// FolderMatch
		if (elem2 instanceof FolderMatch) {
			return 0;
		} else {
			return 1;
		}
	}
}

/**
 * Returns element to focus after removing the given element
 */
export function getElementToFocusAfterRemoved(viewer: WorkbenchCompressibleObjectTree<RenderableMatch>, element: RenderableMatch, elementsToRemove: RenderableMatch[]): RenderableMatch | undefined {
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
export function getLastNodeFromSameType(viewer: WorkbenchCompressibleObjectTree<RenderableMatch>, element: RenderableMatch): RenderableMatch | undefined {
	let lastElem: RenderableMatch | null = viewer.lastVisibleElement ?? null;

	while (lastElem) {
		const compareVal = compareLevels(element, lastElem);
		if (compareVal === -1) {
			viewer.expand(lastElem);
			lastElem = viewer.lastVisibleElement;
		} else if (compareVal === 1) {
			lastElem = viewer.getParentElement(lastElem);
		} else {
			return lastElem;
		}
	}

	return undefined;
}
