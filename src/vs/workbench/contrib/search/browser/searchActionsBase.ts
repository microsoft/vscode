/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import * as nls from '../../../../nls.js';
import * as SearchEditorConstants from '../../searchEditor/browser/constants.js';
import { WorkbenchCompressibleAsyncDataTree } from '../../../../platform/list/browser/listService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { SearchView } from './searchView.js';
import { ISearchConfiguration, ISearchConfigurationProperties, VIEW_ID } from '../../../services/search/common/search.js';
import { isSearchTreeMatch, RenderableMatch, ISearchResult, isSearchTreeFileMatch, isSearchTreeFolderMatch } from './searchTreeModel/searchTreeCommon.js';
import { searchComparer } from './searchCompare.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationResolverService } from '../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../services/history/common/history.js';
import { OpenSearchEditorArgs } from '../../searchEditor/browser/searchEditor.contribution.js';
import { Schemas } from '../../../../base/common/network.js';


export const category = nls.localize2('search', "Search");

export function isSearchViewFocused(viewsService: IViewsService): boolean {
	const searchView = getSearchView(viewsService);
	return !!(searchView && DOM.isAncestorOfActiveElement(searchView.getContainer()));
}

export function getSearchView(viewsService: IViewsService): SearchView | undefined {
	return viewsService.getActiveViewWithId(VIEW_ID) as SearchView;
}

export function getElementsToOperateOn(viewer: WorkbenchCompressibleAsyncDataTree<ISearchResult, RenderableMatch, void>, currElement: RenderableMatch | undefined, sortConfig: ISearchConfigurationProperties | undefined): RenderableMatch[] {
	let elements: RenderableMatch[] = viewer.getSelection().filter((x): x is RenderableMatch => x !== null).sort((a, b) => searchComparer(a, b, sortConfig?.sortOrder));

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
	showIncludesExcludes?: boolean;
}

export function openSearchView(viewsService: IViewsService, focus?: boolean): Promise<SearchView | undefined> {
	return viewsService.openView(VIEW_ID, focus).then(view => (view as SearchView ?? undefined));
}

export async function findInFilesCommand(accessor: ServicesAccessor, _args: IFindInFilesArgs = {}) {

	const searchConfig = accessor.get(IConfigurationService).getValue<ISearchConfiguration>().search;
	const viewsService = accessor.get(IViewsService);
	const commandService = accessor.get(ICommandService);
	const args: IFindInFilesArgs = {};
	if (Object.keys(_args).length !== 0) {
		// resolve variables in the same way as in
		// https://github.com/microsoft/vscode/blob/8b76efe9d317d50cb5b57a7658e09ce6ebffaf36/src/vs/workbench/contrib/searchEditor/browser/searchEditorActions.ts#L152-L158
		const configurationResolverService = accessor.get(IConfigurationResolverService);
		const historyService = accessor.get(IHistoryService);
		const workspaceContextService = accessor.get(IWorkspaceContextService);
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot();
		const filteredActiveWorkspaceRootUri = activeWorkspaceRootUri?.scheme === Schemas.file || activeWorkspaceRootUri?.scheme === Schemas.vscodeRemote ? activeWorkspaceRootUri : undefined;
		const lastActiveWorkspaceRoot = filteredActiveWorkspaceRootUri ? workspaceContextService.getWorkspaceFolder(filteredActiveWorkspaceRootUri) ?? undefined : undefined;

		for (const entry of Object.entries(_args)) {
			const name = entry[0];
			const value = entry[1];
			if (value !== undefined) {
				// eslint-disable-next-line local/code-no-any-casts
				(args as any)[name as any] = (typeof value === 'string') ? await configurationResolverService.resolveAsync(lastActiveWorkspaceRoot, value) : value;
			}
		}
	}

	const mode = searchConfig?.mode;
	if (mode === 'view') {
		openSearchView(viewsService, false).then(openedView => {
			if (openedView) {
				const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(typeof args.replace === 'string');
				let updatedText = false;
				if (typeof args.query !== 'string') {
					updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: typeof args.replace !== 'string' });
				}
				openedView.setSearchParameters(args);
				if (typeof args.showIncludesExcludes === 'boolean') {
					openedView.toggleQueryDetails(false, args.showIncludesExcludes);
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
		commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, convertArgs(args));
	}
}
